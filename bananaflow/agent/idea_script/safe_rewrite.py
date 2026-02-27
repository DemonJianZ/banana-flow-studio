from __future__ import annotations

import re
from typing import Any, Iterable, Optional

from .prompts import build_safe_rewrite_prompt
from .schemas import RiskySpan, SafeRewriteResult, TopicItem


_REWRITE_REPLACEMENTS: tuple[tuple[str, str], ...] = (
    ("包治百病", "帮助你更稳地判断是否适合"),
    ("根治", "改善体验"),
    ("治愈", "缓解感受"),
    ("治疗", "改善状态"),
    ("药到病除", "逐步改善"),
    ("100%", "更有机会"),
    ("百分百", "更有机会"),
    ("保证有效", "更可能有效"),
    ("无副作用", "需结合个人情况评估"),
    ("立刻见效", "短期内可能有体感"),
    ("永久有效", "效果因人而异"),
    ("美白", "提亮肤色体验"),
    ("祛痘", "改善肌肤状态"),
    ("抗衰", "改善状态"),
    ("减肥", "体重管理"),
    ("增高", "身材管理"),
    ("不反弹", "相对更稳定"),
    ("快速见效", "较快看到变化"),
)


class SafeRewriteNode:
    """
    仅对风险句做一次安全改写，尽量保留原表达风格。
    """

    def __init__(
        self,
        llm_client: Optional[Any] = None,
        rules_provider: Optional[Any] = None,
        model_config: Optional[Any] = None,
    ) -> None:
        self.llm_client = llm_client
        self.rules_provider = rules_provider
        self.model_config = model_config

    def run(
        self,
        product: str,
        persona: str,
        topics: Iterable[Any],
        risky_spans: Iterable[RiskySpan],
        allow_llm: bool = True,
    ) -> SafeRewriteResult:
        _ = build_safe_rewrite_prompt(product=product, persona=persona)
        normalized = self._normalize_topics(topics)
        span_list = list(risky_spans or [])

        if allow_llm and self.llm_client and hasattr(self.llm_client, "safe_rewrite_topics"):
            try:
                out = self.llm_client.safe_rewrite_topics(
                    product=product,
                    persona=persona,
                    topics=[t.model_dump() for t in normalized],
                    risky_spans=[s.model_dump() if hasattr(s, "model_dump") else s for s in span_list],
                )
                if isinstance(out, SafeRewriteResult):
                    return out
                return SafeRewriteResult(**out)
            except Exception:
                pass

        risky_index = self._build_span_index(span_list)
        rewritten_topics: list[TopicItem] = []
        changed = False
        rewritten_span_count = 0

        for idx, topic in enumerate(normalized):
            item = topic.model_copy(deep=True)
            for field_name in ("title", "hook", "script_60s"):
                span_key = (idx, field_name)
                if span_key not in risky_index:
                    continue
                old_text = getattr(item, field_name, "") or ""
                new_text, changed_count = self._rewrite_risky_sentences(old_text)
                if changed_count > 0 and new_text != old_text:
                    setattr(item, field_name, new_text)
                    changed = True
                    rewritten_span_count += changed_count
            rewritten_topics.append(item)

        return SafeRewriteResult(
            rewritten_topics=rewritten_topics,
            changed=changed,
            rewritten_span_count=rewritten_span_count,
        )

    def _normalize_topics(self, topics: Iterable[Any]) -> list[TopicItem]:
        normalized: list[TopicItem] = []
        for raw in topics or []:
            try:
                if isinstance(raw, TopicItem):
                    normalized.append(raw)
                elif hasattr(raw, "model_dump"):
                    normalized.append(TopicItem(**raw.model_dump()))
                elif isinstance(raw, dict):
                    normalized.append(TopicItem(**raw))
            except Exception:
                continue
        return normalized

    def _build_span_index(self, risky_spans: list[RiskySpan]) -> set[tuple[int, str]]:
        keys: set[tuple[int, str]] = set()
        for span in risky_spans:
            keys.add((int(span.topic_index), span.field))
        return keys

    def _rewrite_risky_sentences(self, text: str) -> tuple[str, int]:
        content = text or ""
        if not content:
            return content, 0
        sentences = self._split_sentences(content)
        changed_count = 0
        rewritten_sentences: list[str] = []
        for sentence in sentences:
            updated = sentence
            sentence_changed = False
            for source, target in _REWRITE_REPLACEMENTS:
                if source in updated:
                    updated = updated.replace(source, target)
                    sentence_changed = True
            rewritten_sentences.append(updated)
            if sentence_changed:
                changed_count += 1
        return "".join(rewritten_sentences), changed_count

    def _split_sentences(self, text: str) -> list[str]:
        parts = re.split(r"([。！？!?]\s*|\n)", text)
        if len(parts) == 1:
            return [text]
        sentences: list[str] = []
        for idx in range(0, len(parts), 2):
            body = parts[idx]
            sep = parts[idx + 1] if idx + 1 < len(parts) else ""
            if not body and not sep:
                continue
            sentences.append(f"{body}{sep}")
        return sentences
