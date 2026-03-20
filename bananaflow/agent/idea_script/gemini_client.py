from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
import json
import os
import re
from typing import Any, Dict, List, Optional

from google.genai import types

try:
    from ...core.logging import sys_logger
    from ...services.genai_client import call_genai_retry_with_proxy, get_client
except Exception:  # pragma: no cover - 兼容 python bananaflow/main.py 直跑
    from core.logging import sys_logger
    from services.genai_client import call_genai_retry_with_proxy, get_client


DEFAULT_IDEA_SCRIPT_MODEL = "gemini-2.5-flash-lite"
DEFAULT_IDEA_SCRIPT_TIMEOUT_SEC = 25


def _to_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except Exception:
        return None


def _to_int(value: Any) -> Optional[int]:
    if value is None:
        return None
    try:
        return int(value)
    except Exception:
        return None


class IdeaScriptGeminiClient:
    """
    Idea Script 的 Gemini 客户端。
    调用方式与文生图一致：统一走 services.genai_client.call_genai_retry，
    仅模型名改为 gemini-2.5-flash-lite（可被节点配置覆盖）。
    """

    def __init__(
        self,
        model: Optional[str] = None,
        temperature: Optional[float] = None,
        top_p: Optional[float] = None,
        max_tokens: Optional[int] = None,
        timeout_sec: Optional[int] = None,
        http_proxy: Optional[str] = None,
        https_proxy: Optional[str] = None,
    ) -> None:
        self.model = (model or DEFAULT_IDEA_SCRIPT_MODEL).strip() or DEFAULT_IDEA_SCRIPT_MODEL
        self.temperature = _to_float(temperature)
        self.top_p = _to_float(top_p)
        self.max_tokens = _to_int(max_tokens)
        self.timeout_sec = max(1, int(timeout_sec or DEFAULT_IDEA_SCRIPT_TIMEOUT_SEC))
        self.http_proxy = str(http_proxy or os.getenv("IDEA_SCRIPT_HTTP_PROXY") or "").strip() or None
        self.https_proxy = str(https_proxy or os.getenv("IDEA_SCRIPT_HTTPS_PROXY") or "").strip() or None

    @classmethod
    def is_runtime_available(cls) -> bool:
        try:
            return get_client() is not None
        except Exception:
            return False

    def _extract_text(self, response: Any) -> str:
        text = getattr(response, "text", None)
        if isinstance(text, str) and text.strip():
            return text.strip()

        candidates = getattr(response, "candidates", None) or []
        for cand in candidates:
            content = getattr(cand, "content", None)
            if content is None:
                continue
            parts = getattr(content, "parts", None) or []
            for part in parts:
                part_text = getattr(part, "text", None)
                if isinstance(part_text, str) and part_text.strip():
                    return part_text.strip()
        return ""

    def _extract_json(self, text: str) -> Any:
        content = (text or "").strip()
        if not content:
            raise ValueError("empty_response")
        try:
            return json.loads(content)
        except Exception:
            pass

        fenced = re.findall(r"```(?:json)?\s*([\s\S]*?)```", content, flags=re.IGNORECASE)
        for block in fenced:
            block_text = block.strip()
            if not block_text:
                continue
            try:
                return json.loads(block_text)
            except Exception:
                continue

        first_obj = content.find("{")
        last_obj = content.rfind("}")
        if first_obj >= 0 and last_obj > first_obj:
            chunk = content[first_obj : last_obj + 1]
            try:
                return json.loads(chunk)
            except Exception:
                pass

        first_arr = content.find("[")
        last_arr = content.rfind("]")
        if first_arr >= 0 and last_arr > first_arr:
            chunk = content[first_arr : last_arr + 1]
            try:
                return json.loads(chunk)
            except Exception:
                pass

        raise ValueError("json_parse_failed")

    def _call_json(self, prompt: str) -> Any:
        cfg_kwargs: Dict[str, Any] = {"response_mime_type": "application/json"}
        if self.temperature is not None:
            cfg_kwargs["temperature"] = self.temperature
        if self.top_p is not None:
            cfg_kwargs["top_p"] = self.top_p
        if self.max_tokens is not None and self.max_tokens > 0:
            cfg_kwargs["max_output_tokens"] = self.max_tokens

        def _invoke():
            return call_genai_retry_with_proxy(
                contents=[types.Part(text=prompt)],
                config=types.GenerateContentConfig(**cfg_kwargs),
                req_id=f"idea_script:{self.model}",
                model=self.model,
                http_proxy=self.http_proxy,
                https_proxy=self.https_proxy,
            )

        executor = ThreadPoolExecutor(max_workers=1)
        future = executor.submit(_invoke)
        try:
            response = future.result(timeout=self.timeout_sec)
        except FutureTimeoutError as e:
            future.cancel()
            raise RuntimeError(f"idea_script_llm_timeout:{self.timeout_sec}s") from e
        finally:
            executor.shutdown(wait=False, cancel_futures=True)
        text = self._extract_text(response)
        return self._extract_json(text)

    def infer_audience(
        self,
        product: str,
        retry: bool = False,
        previous: Optional[Any] = None,
        prompt_override: Optional[str] = None,
    ) -> Dict[str, Any]:
        prev_payload = {}
        if previous is not None:
            try:
                if hasattr(previous, "model_dump"):
                    prev_payload = previous.model_dump(mode="json")
                elif isinstance(previous, dict):
                    prev_payload = dict(previous)
            except Exception:
                prev_payload = {}

        prompt = (
            prompt_override
            if isinstance(prompt_override, str) and prompt_override.strip()
            else (
                "You are an audience inference node for short-video script planning.\n"
                "Return JSON object only.\n"
                "Schema:\n"
                "{"
                "\"product\": string,"
                "\"persona\": string,"
                "\"pain_points\": string[],"
                "\"scenes\": string[],"
                "\"why_this_persona\": string,"
                "\"confidence\": number(0~1),"
                "\"unsafe_claim_risk\": \"low\"|\"medium\"|\"high\""
                "}\n"
                "Rules: persona must be concrete and shootable; avoid generic personas; avoid medical or absolute claims.\n"
                f"Input product: {product}\n"
                f"Retry: {bool(retry)}\n"
                f"Previous result: {json.dumps(prev_payload, ensure_ascii=False)}"
            )
        )
        data = self._call_json(prompt)
        if not isinstance(data, dict):
            raise ValueError("infer_audience_invalid_payload")
        return data

    def generate_idea_scripts(
        self,
        audience_context: Any,
        retry: bool = False,
        reviewer_blocking_issues: Optional[List[str]] = None,
        previous_topics: Optional[List[Any]] = None,
        prompt_override: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        ctx = audience_context.model_dump(mode="json") if hasattr(audience_context, "model_dump") else dict(audience_context or {})
        prompt = (
            prompt_override
            if isinstance(prompt_override, str) and prompt_override.strip()
            else (
                "You are an idea_script generator.\n"
                "Return JSON array only with exactly 3 items and unique angles: persona, scene, misconception.\n"
                "Each item schema:\n"
                "{"
                "\"angle\":\"persona|scene|misconception\","
                "\"title\":string,"
                "\"hook\":string,"
                "\"script_60s\":string(with mandatory tags in order [HOOK][VIEW][STEPS][PRODUCT][CTA]),"
                "\"visual_keywords\":string[5..8]"
                "}\n"
                "Avoid medical/absolute claims.\n"
                f"Audience context: {json.dumps(ctx, ensure_ascii=False)}\n"
                f"Retry: {bool(retry)}\n"
                f"Blocking issues: {json.dumps(list(reviewer_blocking_issues or []), ensure_ascii=False)}\n"
                f"Previous topics: {json.dumps(list(previous_topics or []), ensure_ascii=False)}"
            )
        )
        data = self._call_json(prompt)
        if isinstance(data, dict) and isinstance(data.get("topics"), list):
            data = data.get("topics")
        if not isinstance(data, list):
            raise ValueError("generate_idea_scripts_invalid_payload")
        return [dict(item) for item in data if isinstance(item, dict)]

    def scan_compliance_risk(self, product: str, persona: str, topics: List[Any]) -> Dict[str, Any]:
        prompt = (
            "You are a compliance risk scanner for ad scripts.\n"
            "Return JSON object only.\n"
            "Schema:\n"
            "{"
            "\"risk_level\":\"low|medium|high\","
            "\"risky_spans\":[{"
            "\"topic_index\":number,"
            "\"angle\":\"persona|scene|misconception\"|null,"
            "\"field\":\"title|hook|script_60s\","
            "\"text\":string,"
            "\"reason\":string,"
            "\"risk_level\":\"low|medium|high\""
            "}]"
            "}\n"
            f"Product: {product}\n"
            f"Persona: {persona}\n"
            f"Topics: {json.dumps(topics, ensure_ascii=False)}"
        )
        data = self._call_json(prompt)
        if not isinstance(data, dict):
            raise ValueError("scan_compliance_risk_invalid_payload")
        return data

    def safe_rewrite_topics(
        self,
        product: str,
        persona: str,
        topics: List[Any],
        risky_spans: List[Any],
    ) -> Dict[str, Any]:
        prompt = (
            "You are a safe rewrite node.\n"
            "Only rewrite risky sentences; keep original style and structure.\n"
            "Return JSON object only.\n"
            "Schema:\n"
            "{"
            "\"rewritten_topics\": TopicItem[],"
            "\"changed\": boolean,"
            "\"rewritten_span_count\": number"
            "}\n"
            "TopicItem schema fields: angle,title,hook,script_60s,visual_keywords(optional),shots(optional)\n"
            f"Product: {product}\n"
            f"Persona: {persona}\n"
            f"Topics: {json.dumps(topics, ensure_ascii=False)}\n"
            f"Risky spans: {json.dumps(risky_spans, ensure_ascii=False)}"
        )
        data = self._call_json(prompt)
        if not isinstance(data, dict):
            raise ValueError("safe_rewrite_topics_invalid_payload")
        return data

    def score_idea_scripts(
        self,
        audience_context: Dict[str, Any],
        topics: List[Dict[str, Any]],
        review_result: Dict[str, Any],
        compliance_result: Dict[str, Any],
    ) -> Dict[str, Any]:
        prompt = (
            "You are a rubric scorer for idea scripts.\n"
            "Return JSON object only with all scores in range [0,1].\n"
            "Schema:\n"
            "{"
            "\"persona_specificity_score\":number,"
            "\"hook_strength_score\":number,"
            "\"topic_diversity_score\":number,"
            "\"script_speakability_score\":number,"
            "\"compliance_score\":number"
            "}\n"
            f"Audience context: {json.dumps(audience_context, ensure_ascii=False)}\n"
            f"Topics: {json.dumps(topics, ensure_ascii=False)}\n"
            f"Review result: {json.dumps(review_result, ensure_ascii=False)}\n"
            f"Compliance result: {json.dumps(compliance_result, ensure_ascii=False)}"
        )
        data = self._call_json(prompt)
        if not isinstance(data, dict):
            raise ValueError("score_idea_scripts_invalid_payload")
        return data

    def generate_storyboard(
        self,
        audience_context: Dict[str, Any],
        topic: Dict[str, Any],
        retry: bool = False,
        reviewer_blocking_issues: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        prompt = (
            "You are a storyboard generator.\n"
            "Return JSON array only with 6~8 shots.\n"
            "Each shot schema:\n"
            "{"
            "\"shot_id\":string,"
            "\"segment\":\"HOOK|VIEW|STEPS|PRODUCT|CTA\","
            "\"duration_sec\":number,"
            "\"camera\":string,"
            "\"scene\":string,"
            "\"action\":string,"
            "\"emotion\":string(optional),"
            "\"overlay_text\":string(optional),"
            "\"keyword_tags\":string[5..8],"
            "\"asset_requirements\": [{\"type\":string,\"must_have\":string,\"avoid\":string,\"style\":string,\"aspect\":string}]"
            "}\n"
            "Constraints: cover HOOK>=1, VIEW>=1, STEPS>=2, PRODUCT>=1, CTA>=1; camera types >=3; duration total around 55~65.\n"
            "Language rules:\n"
            "- Keep enum fields in English only:\n"
            "  segment must be one of HOOK|VIEW|STEPS|PRODUCT|CTA.\n"
            "  camera must be one of close_up|wide|over_shoulder|top_down|macro|medium.\n"
            "  asset_requirements.type must stay English, such as scene|product|overlay|camera|talent|prop|environment|graphic|animation|video|model.\n"
            "- All human-readable fields must be Simplified Chinese:\n"
            "  scene, action, emotion, overlay_text, keyword_tags, asset_requirements.must_have, asset_requirements.avoid, asset_requirements.style.\n"
            "- Do not output English sentences for scene/action/overlay_text/keyword_tags unless the value is an enum field above.\n"
            f"Audience context: {json.dumps(audience_context, ensure_ascii=False)}\n"
            f"Topic: {json.dumps(topic, ensure_ascii=False)}\n"
            f"Retry: {bool(retry)}\n"
            f"Reviewer blocking issues: {json.dumps(list(reviewer_blocking_issues or []), ensure_ascii=False)}"
        )
        data = self._call_json(prompt)
        if isinstance(data, dict) and isinstance(data.get("shots"), list):
            data = data.get("shots")
        if not isinstance(data, list):
            raise ValueError("generate_storyboard_invalid_payload")
        return [dict(item) for item in data if isinstance(item, dict)]


def build_idea_script_gemini_client(node_config: Optional[Any]) -> Optional[IdeaScriptGeminiClient]:
    if not IdeaScriptGeminiClient.is_runtime_available():
        return None
    try:
        return IdeaScriptGeminiClient(
            model=getattr(node_config, "model", None),
            temperature=getattr(node_config, "temperature", None),
            top_p=getattr(node_config, "top_p", None),
            max_tokens=getattr(node_config, "max_tokens", None),
            timeout_sec=getattr(node_config, "timeout_sec", None),
        )
    except Exception as e:
        sys_logger.warning(f"[idea_script] build gemini client failed: {e}")
        return None
