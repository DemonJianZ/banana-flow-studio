from __future__ import annotations

from typing import Any, Dict, Optional

try:
    from ...context.context_builder import ContextPack, render_context_sections
except Exception:  # pragma: no cover - 兼容 python bananaflow/main.py 直跑
    from context.context_builder import ContextPack, render_context_sections

from .prompts import (
    GENERIC_PERSONA_BANNED_TERMS,
    INFERENCE_CONFIDENCE_THRESHOLD,
    build_inference_prompt,
)
from .schemas import AudienceInferenceResult


def is_generic_persona(persona: str) -> bool:
    text = (persona or "").strip()
    if not text:
        return True
    if len(text) < 8:
        return True
    for banned in GENERIC_PERSONA_BANNED_TERMS:
        if banned in text and len(text) <= len(banned) + 6:
            return True
    exact_generic = {
        "消费者",
        "普通用户",
        "女性",
        "男性",
        "学生",
        "上班族",
        "护肤人群",
    }
    return text in exact_generic


class AudienceInferenceNode:
    """
    Skill-first audience inference.
    不再回退到项目内硬编码人群模板；该节点必须依赖 skill + LLM 产出。
    """

    def __init__(
        self,
        llm_client: Optional[Any] = None,
        rag_provider: Optional[Any] = None,
        rules_provider: Optional[Any] = None,
        model_config: Optional[Any] = None,
    ) -> None:
        self.llm_client = llm_client
        self.rag_provider = rag_provider
        self.rules_provider = rules_provider
        self.model_config = model_config
        self.last_skill_payload: Dict[str, Any] = {}

    def run(
        self,
        product: str,
        retry: bool = False,
        previous: Optional[AudienceInferenceResult] = None,
        allow_llm: bool = True,
        context_pack: Optional[ContextPack] = None,
        brief_context: Optional[Dict[str, str]] = None,
    ) -> AudienceInferenceResult:
        product = (product or "").strip()
        prompt = build_inference_prompt(
            product,
            retry=retry,
            previous_persona=(previous.persona if previous else None),
            brief_context=brief_context,
        )
        if context_pack is not None:
            prompt = f"{prompt}\n\n{render_context_sections(context_pack)}"

        if not allow_llm:
            raise RuntimeError("idea_script_skill_required:audience_inference")
        if not self.llm_client or not hasattr(self.llm_client, "infer_audience"):
            raise RuntimeError("idea_script_skill_llm_unavailable:audience_inference")
        if not str(getattr(self.llm_client, "skill_block", "") or "").strip():
            raise RuntimeError("idea_script_skill_not_loaded:audience_inference")

        try:
            out = self.llm_client.infer_audience(
                product=product,
                retry=retry,
                previous=previous,
                prompt_override=prompt,
                brief_context=brief_context,
            )
        except Exception as e:
            raise RuntimeError(f"idea_script_skill_inference_failed:{e}") from e
        self.last_skill_payload = dict(getattr(self.llm_client, "last_inference_payload", {}) or {})

        result = out if isinstance(out, AudienceInferenceResult) else AudienceInferenceResult(**out)
        if is_generic_persona(result.persona):
            result.confidence = min(result.confidence, INFERENCE_CONFIDENCE_THRESHOLD - 0.06)
        return result
