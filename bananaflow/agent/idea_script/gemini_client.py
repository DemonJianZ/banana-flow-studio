from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
import json
import os
import re
from typing import Any, Dict, List, Optional

try:
    from google.genai import types  # type: ignore
except Exception:  # pragma: no cover - allow ollama-only runtime
    class _FallbackPart:
        def __init__(self, text: str = "") -> None:
            self.text = text

    class _FallbackGenerateContentConfig:
        def __init__(self, **kwargs) -> None:
            for key, value in kwargs.items():
                setattr(self, key, value)

    class _FallbackTypes:
        Part = _FallbackPart
        GenerateContentConfig = _FallbackGenerateContentConfig

    types = _FallbackTypes()

try:
    from ...core.logging import sys_logger
    from ...services.genai_client import call_genai_retry_with_proxy, get_client
    from ...services.ollama_client import OllamaTextClient, is_ollama_model
    from ...services.runtime_skill import build_runtime_skill_block
except Exception:  # pragma: no cover - 兼容 python bananaflow/main.py 直跑
    from core.logging import sys_logger
    from services.genai_client import call_genai_retry_with_proxy, get_client
    from services.ollama_client import OllamaTextClient, is_ollama_model
    from services.runtime_skill import build_runtime_skill_block


DEFAULT_IDEA_SCRIPT_MODEL = str(
    os.getenv("IDEA_SCRIPT_DEFAULT_MODEL")
    or "ollama:gemma4:latest"
).strip() or "ollama:gemma4:latest"
DEFAULT_IDEA_SCRIPT_TIMEOUT_SEC = 25
DEFAULT_IDEA_SCRIPT_OLLAMA_TIMEOUT_SEC = 180


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


def _clean_text(value: Any) -> str:
    return str(value or "").strip()


def _coerce_string_list(value: Any) -> List[str]:
    if isinstance(value, list):
        raw_items = value
    elif isinstance(value, str):
        raw_items = re.split(r"[\n,，;；]", value)
    else:
        raw_items = [value] if value is not None else []

    items: List[str] = []
    seen = set()
    for item in raw_items:
        text = _clean_text(item)
        if not text or text in seen:
            continue
        seen.add(text)
        items.append(text)
    return items


def _coerce_scene_list(value: Any) -> List[str]:
    if isinstance(value, list):
        raw_items = value
    elif value is None:
        raw_items = []
    else:
        raw_items = [value]

    items: List[str] = []
    seen = set()
    for item in raw_items:
        if isinstance(item, dict):
            for key in ("description", "name", "purchase_moment", "scene", "title"):
                text = _clean_text(item.get(key))
                if not text or text in seen:
                    continue
                seen.add(text)
                items.append(text)
                if len(items) >= 6:
                    return items
            continue
        text = _clean_text(item)
        if not text or text in seen:
            continue
        seen.add(text)
        items.append(text)
        if len(items) >= 6:
            return items
    return items


class IdeaScriptGeminiClient:
    """
    Idea Script 的 LLM 客户端。
    默认走 Ollama Gemma4；如果显式配置了非 Ollama 模型，则沿用 Google GenAI 调用路径。
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
        self.http_proxy = str(http_proxy or os.getenv("IDEA_SCRIPT_HTTP_PROXY") or "").strip() or None
        self.https_proxy = str(https_proxy or os.getenv("IDEA_SCRIPT_HTTPS_PROXY") or "").strip() or None
        self.is_ollama = is_ollama_model(self.model)
        self.ollama_client = OllamaTextClient() if self.is_ollama else None
        self.last_inference_payload: Dict[str, Any] = {}
        self.last_generation_payload: Dict[str, Any] = {}
        default_timeout_sec = (
            DEFAULT_IDEA_SCRIPT_OLLAMA_TIMEOUT_SEC
            if self.is_ollama
            else DEFAULT_IDEA_SCRIPT_TIMEOUT_SEC
        )
        self.timeout_sec = max(1, int(timeout_sec or default_timeout_sec))
        self.skill_block = build_runtime_skill_block("idea_script", language="en")

    @classmethod
    def is_runtime_available(cls) -> bool:
        try:
            if OllamaTextClient().is_available():
                return True
        except Exception:
            pass
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
            if self.is_ollama:
                if self.ollama_client is None:
                    raise RuntimeError("ollama client not initialized")
                return self.ollama_client.generate_content(
                    model=self.model,
                    contents=[types.Part(text=prompt)],
                    config=types.GenerateContentConfig(**cfg_kwargs),
                )
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

    def _with_skill(self, prompt: str) -> str:
        if not self.skill_block:
            return prompt
        return f"{str(prompt or '').rstrip()}\n\n{self.skill_block}".strip()

    def _dig(self, data: Any, *path: str) -> Any:
        current = data
        for key in path:
            if not isinstance(current, dict):
                return None
            current = current.get(key)
        return current

    def _find_first_text(self, data: Any, key_candidates: set[str]) -> str:
        if isinstance(data, dict):
            for key, value in data.items():
                if str(key) in key_candidates:
                    text = _clean_text(value)
                    if text:
                        return text
                text = self._find_first_text(value, key_candidates)
                if text:
                    return text
        elif isinstance(data, list):
            for item in data:
                text = self._find_first_text(item, key_candidates)
                if text:
                    return text
        return ""

    def _find_first_list(self, data: Any, key_candidates: set[str]) -> List[str]:
        if isinstance(data, dict):
            for key, value in data.items():
                if str(key) in key_candidates:
                    items = _coerce_string_list(value)
                    if items:
                        return items
                items = self._find_first_list(value, key_candidates)
                if items:
                    return items
        elif isinstance(data, list):
            for item in data:
                items = self._find_first_list(item, key_candidates)
                if items:
                    return items
        return []

    def _infer_risk_level(self, payload: Any) -> str:
        explicit = _clean_text(self._find_first_text(payload, {"unsafe_claim_risk", "risk_level"})).lower()
        if explicit in {"low", "medium", "high"}:
            return explicit
        corpus = json.dumps(payload, ensure_ascii=False) if isinstance(payload, (dict, list)) else _clean_text(payload)
        if any(token in corpus for token in ("治疗", "治愈", "药效", "根治", "永久", "100%")):
            return "high"
        if any(token in corpus for token in ("夸大", "绝对化", "敏感承诺", "before/after", "guaranteed")):
            return "medium"
        return "low"

    def _coerce_inference_payload(
        self,
        data: Dict[str, Any],
        *,
        product: str,
        brief_context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        brief = dict(brief_context or {})
        raw_target_buyer_persona = data.get("target_buyer_persona")
        product_text = (
            _clean_text(data.get("product"))
            or _clean_text(data.get("product_name"))
            or _clean_text(data.get("product_sku"))
            or _clean_text(data.get("sku"))
            or _clean_text(self._dig(data, "commercial_unit", "sku"))
            or _clean_text(self._dig(data, "copy_pack", "source_offer", "product"))
            or _clean_text(self._dig(data, "offer_decision", "product"))
            or _clean_text(product)
        )
        persona = (
            _clean_text(data.get("persona"))
            or _clean_text(data.get("audience"))
            or _clean_text(self._dig(data, "target_buyer_persona", "description_zh"))
            or _clean_text(self._dig(data, "target_buyer_persona", "persona_name"))
            or (_clean_text(raw_target_buyer_persona) if not isinstance(raw_target_buyer_persona, dict) else "")
            or _clean_text(self._dig(data, "narrow_buyer_persona", "persona_chinese"))
            or _clean_text(data.get("persona_name_zh"))
            or _clean_text(data.get("description_zh"))
            or _clean_text(self._dig(data, "commercial_unit", "target_buyer"))
            or _clean_text(self._dig(data, "offer_decision", "target_buyer"))
            or _clean_text(self._dig(data, "offer_decision", "audience"))
            or _clean_text(self._dig(data, "copy_pack", "source_offer", "audience"))
            or self._find_first_text(data, {"persona", "audience", "target_buyer", "target_audience", "buyer"})
            or _clean_text(brief.get("audience"))
        )
        pain_points = (
            _coerce_string_list(data.get("pain_points"))
            or _coerce_string_list(self._dig(data, "target_buyer_persona", "pain_points_zh"))
            or _coerce_string_list(self._dig(data, "narrow_buyer_persona", "pain_points_chinese"))
            or _coerce_string_list(self._dig(data, "commercial_unit", "pain_points"))
            or _coerce_string_list(self._dig(data, "offer_decision", "pain_points"))
            or _coerce_string_list(self._dig(data, "copy_pack", "source_offer", "pain_points"))
            or _coerce_string_list(self._dig(data, "copy_pack", "source_offer", "pain_point"))
            or self._find_first_list(data, {"pain_points", "pain_point", "main_pain_point", "main_pain"})
        )
        scenes = (
            _coerce_scene_list(data.get("scenes"))
            or _coerce_scene_list(self._dig(data, "target_buyer_persona", "shoots_scene_zh"))
            or _coerce_scene_list(self._dig(data, "narrow_buyer_persona", "scene_chinese"))
            or _coerce_scene_list(self._dig(data, "commercial_unit", "scenes"))
            or _coerce_string_list(self._dig(data, "offer_decision", "scenes"))
            or self._find_first_list(data, {"scenes", "scene", "usage_scenarios", "scenarios"})
        )
        primary_platform = (
            _clean_text(brief.get("primary_platform"))
            or _clean_text(self._dig(data, "commercial_unit", "primary_platform"))
            or _clean_text(self._dig(data, "commercial_unit", "primary_platform_assumption"))
            or _clean_text(self._dig(data, "primary_platform_assumption", "platform_name_zh"))
            or _clean_text(data.get("primary_platform_assumption"))
            or _clean_text(self._dig(data, "platform_plan", "primary", "platform"))
            or _clean_text(self._dig(data, "platform_plan", "platform"))
        )
        conversion_goal = _clean_text(brief.get("conversion_goal"))
        if not pain_points:
            derived_pain = (
                _clean_text(self._dig(data, "copy_pack", "source_offer", "pain_point"))
                or _clean_text(self._dig(data, "offer_decision", "pain_point"))
                or _clean_text(self._dig(data, "offer_decision", "selected_angle"))
            )
            if derived_pain:
                pain_points = [derived_pain]
        if not scenes:
            derived_scenes = [
                item
                for item in (
                    f"{primary_platform}平台首轮测试" if primary_platform else "",
                    conversion_goal,
                    _clean_text(self._dig(data, "platform_plan", "primary", "content_type")),
                )
                if _clean_text(item)
            ]
            scenes = derived_scenes[:3]
        why_this_persona = (
            _clean_text(data.get("why_this_persona"))
            or _clean_text(self._dig(data, "commercial_unit", "justification"))
            or _clean_text(self._dig(data, "primary_platform_assumption", "focus_reason_zh"))
            or _clean_text(data.get("model_notes_zh"))
            or _clean_text(self._dig(data, "offer_decision", "why_this_angle_wins"))
            or _clean_text(self._dig(data, "offer_decision", "reason"))
            or self._find_first_text(data, {"why_this_persona", "why_this_angle_wins", "rationale", "reason"})
            or "该人群与当前产品卖点、平台测试方向和转化目标更匹配。"
        )
        confidence = _to_float(data.get("confidence"))
        if confidence is None:
            confidence = _to_float(self._dig(data, "commercial_unit", "confidence_score"))
        if confidence is None:
            confidence = 0.72 if persona else 0.55

        return {
            "product": product_text,
            "persona": persona,
            "pain_points": pain_points,
            "scenes": scenes,
            "why_this_persona": why_this_persona,
            "confidence": max(0.0, min(1.0, float(confidence))),
            "unsafe_claim_risk": self._infer_risk_level(data),
        }

    def _coerce_topic_item(self, item: Dict[str, Any]) -> Dict[str, Any]:
        title = _clean_text(item.get("title")) or _clean_text(item.get("angle_title"))
        hook = _clean_text(item.get("hook"))
        script = _clean_text(item.get("script_60s")) or _clean_text(item.get("script"))
        visual_keywords = (
            _coerce_string_list(item.get("visual_keywords"))
            or _coerce_string_list(item.get("keyword_tags"))
        )
        return {
            "angle": _clean_text(item.get("angle")),
            "title": title,
            "hook": hook,
            "script_60s": script,
            "visual_keywords": visual_keywords,
        }

    def _coerce_generation_payload(self, data: Any) -> List[Dict[str, Any]]:
        def _find_topic_list(payload: Any) -> Any:
            if isinstance(payload, dict):
                for key in ("topics", "candidate_angles", "angles", "items", "candidates"):
                    value = payload.get(key)
                    if isinstance(value, list):
                        return value
                for value in payload.values():
                    found = _find_topic_list(value)
                    if isinstance(found, list):
                        return found
            return None

        if isinstance(data, dict):
            found_list = _find_topic_list(data)
            if isinstance(found_list, list):
                data = found_list
            else:
                keyed_items = []
                for key, value in sorted(data.items()):
                    if not isinstance(value, dict):
                        continue
                    if not re.match(r"^(angle|topic|item)_?\d+$", str(key), flags=re.IGNORECASE):
                        continue
                    keyed_items.append(value)
                if keyed_items:
                    data = keyed_items
        if not isinstance(data, list):
            raise ValueError("generate_idea_scripts_invalid_payload")

        normalized: List[Dict[str, Any]] = []
        for item in data:
            if not isinstance(item, dict):
                continue
            normalized.append(self._coerce_topic_item(item))
        return normalized

    def infer_audience(
        self,
        product: str,
        retry: bool = False,
        previous: Optional[Any] = None,
        prompt_override: Optional[str] = None,
        brief_context: Optional[Dict[str, Any]] = None,
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
        data = self._call_json(self._with_skill(prompt))
        if not isinstance(data, dict):
            raise ValueError("infer_audience_invalid_payload")
        self.last_inference_payload = dict(data)
        return self._coerce_inference_payload(data, product=product, brief_context=brief_context)

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
                "Return JSON only.\n"
                "Prefer a full china-growth-ops package with candidate_angles, selected_angle, platform_plan, copy_pack, browser_ready_fields, risks_and_blockers, and kpi_checklist.\n"
                "If you cannot provide the full package, at minimum return 3 candidate angle items.\n"
                f"Audience context: {json.dumps(ctx, ensure_ascii=False)}\n"
                f"Retry: {bool(retry)}\n"
                f"Blocking issues: {json.dumps(list(reviewer_blocking_issues or []), ensure_ascii=False)}\n"
                f"Previous topics: {json.dumps(list(previous_topics or []), ensure_ascii=False)}"
            )
        )
        data = self._call_json(self._with_skill(prompt))
        self.last_generation_payload = dict(data) if isinstance(data, dict) else {"topics": data}
        return self._coerce_generation_payload(data)

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
        data = self._call_json(self._with_skill(prompt))
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
        data = self._call_json(self._with_skill(prompt))
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
        data = self._call_json(self._with_skill(prompt))
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
        data = self._call_json(self._with_skill(prompt))
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
