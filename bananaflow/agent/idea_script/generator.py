from __future__ import annotations

import re
from typing import Any, Optional, Sequence

try:
    from ...context.context_builder import ContextPack, render_context_sections
except Exception:  # pragma: no cover - 兼容 python bananaflow/main.py 直跑
    from context.context_builder import ContextPack, render_context_sections

from .prompts import build_generator_prompt
from .schemas import AudienceInferenceResult, IdeaTopic


class IdeaScriptGeneratorNode:
    """
    Skill-first script generator.
    不再回退到项目内固定脚本模板；该节点必须依赖 skill + LLM 产出。
    """

    def __init__(
        self,
        llm_client: Optional[Any] = None,
        rules_provider: Optional[Any] = None,
        rag_provider: Optional[Any] = None,
        model_config: Optional[Any] = None,
    ) -> None:
        self.llm_client = llm_client
        self.rules_provider = rules_provider
        self.rag_provider = rag_provider
        self.model_config = model_config
        self.last_skill_payload: dict[str, Any] = {}

    def run(
        self,
        audience_context: AudienceInferenceResult,
        retry: bool = False,
        reviewer_blocking_issues: Sequence[str] | None = None,
        previous_topics: Sequence[IdeaTopic] | None = None,
        allow_llm: bool = True,
        context_pack: Optional[ContextPack] = None,
        brief_context: Optional[dict[str, str]] = None,
    ) -> list[IdeaTopic]:
        prompt = build_generator_prompt(
            product=audience_context.product,
            persona=audience_context.persona,
            pain_points=audience_context.pain_points,
            scenes=audience_context.scenes,
            retry=retry,
            blocking_issues=reviewer_blocking_issues,
            brief_context=brief_context,
        )
        if context_pack is not None:
            prompt = f"{prompt}\n\n{render_context_sections(context_pack)}"

        if not allow_llm:
            raise RuntimeError("idea_script_skill_required:generation")
        if not self.llm_client or not hasattr(self.llm_client, "generate_idea_scripts"):
            raise RuntimeError("idea_script_skill_llm_unavailable:generation")
        if not str(getattr(self.llm_client, "skill_block", "") or "").strip():
            raise RuntimeError("idea_script_skill_not_loaded:generation")

        try:
            out = self.llm_client.generate_idea_scripts(
                audience_context=audience_context,
                retry=retry,
                reviewer_blocking_issues=list(reviewer_blocking_issues or []),
                previous_topics=[t.model_dump() if hasattr(t, "model_dump") else t for t in (previous_topics or [])],
                prompt_override=prompt,
            )
        except Exception as e:
            raise RuntimeError(f"idea_script_skill_generation_failed:{e}") from e
        self.last_skill_payload = dict(getattr(self.llm_client, "last_generation_payload", {}) or {})

        topics = [t if isinstance(t, IdeaTopic) else IdeaTopic(**t) for t in out]
        return self._normalize_visual_keywords(topics)

    def _normalize_visual_keywords(self, topics: list[IdeaTopic]) -> list[IdeaTopic]:
        normalized: list[IdeaTopic] = []
        for topic in topics:
            item = topic.model_copy(deep=True)
            keywords = list(item.visual_keywords or [])
            if not (5 <= len(keywords) <= 8):
                item.visual_keywords = self._derive_visual_keywords(item)
            normalized.append(item)
        return normalized

    def _derive_visual_keywords(self, topic: IdeaTopic) -> list[str]:
        parts = [
            topic.angle,
            topic.title,
            topic.hook,
            topic.script_60s,
        ]
        keywords: list[str] = []
        seen = set()
        for part in parts:
            tokens = re.split(r"[\n，,。；;：:\[\]\(\)\"'、/ ]+", str(part or "").strip())
            for token in tokens:
                text = str(token or "").strip()
                if len(text) < 2 or text in seen:
                    continue
                seen.add(text)
                keywords.append(text)
                if len(keywords) >= 8:
                    return keywords
        return keywords[:8]
