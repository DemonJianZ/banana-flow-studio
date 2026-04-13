from __future__ import annotations

from typing import Any, Iterable, Optional

from .inference import is_generic_persona
from .prompts import SCRIPT_STRUCTURE_TAGS, build_scoring_prompt
from .schemas import (
    AudienceInferenceResult,
    ComplianceScanResult,
    IdeaScriptReviewResult,
    RubricScoreResult,
    TopicItem,
)


class ScoringReviewerNode:
    """
    Rubric 评分节点，输出 0~1 分数。
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
        audience_context: AudienceInferenceResult,
        topics: Iterable[Any],
        review_result: IdeaScriptReviewResult,
        compliance_result: ComplianceScanResult,
        allow_llm: bool = True,
    ) -> RubricScoreResult:
        _ = build_scoring_prompt(
            product=audience_context.product,
            persona=audience_context.persona,
        )
        normalized = self._normalize_topics(topics)

        if allow_llm and self.llm_client and hasattr(self.llm_client, "score_idea_scripts"):
            try:
                out = self.llm_client.score_idea_scripts(
                    audience_context=audience_context.model_dump(),
                    topics=[t.model_dump() for t in normalized],
                    review_result=review_result.model_dump(),
                    compliance_result=compliance_result.model_dump(),
                )
                if isinstance(out, RubricScoreResult):
                    return out
                return RubricScoreResult(**out)
            except Exception:
                pass

        persona_score = self._persona_specificity_score(audience_context.persona)
        hook_score = self._hook_strength_score(normalized)
        diversity_score = self._topic_diversity_score(normalized, review_result)
        speakability_score = self._script_speakability_score(normalized)
        compliance_score = self._compliance_score(compliance_result, review_result)
        return RubricScoreResult(
            persona_specificity_score=persona_score,
            hook_strength_score=hook_score,
            topic_diversity_score=diversity_score,
            script_speakability_score=speakability_score,
            compliance_score=compliance_score,
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

    def _persona_specificity_score(self, persona: str) -> float:
        text = (persona or "").strip()
        if not text or is_generic_persona(text):
            return 0.25
        score = 0.60
        if len(text) >= 16:
            score += 0.10
        if any(marker in text for marker in ("岁", "预算", "通勤", "办公室", "晚上", "地铁")):
            score += 0.15
        if any(marker in text for marker in ("最近", "本月", "30天", "首次购买", "准备下单")):
            score += 0.10
        return min(1.0, round(score, 3))

    def _hook_strength_score(self, topics: list[TopicItem]) -> float:
        if not topics:
            return 0.0
        scores: list[float] = []
        trigger_words = ("先", "别", "很多人", "误区", "差很多", "看错", "翻车")
        for topic in topics:
            hook = (topic.hook or "").strip()
            if not hook:
                scores.append(0.0)
                continue
            score = 0.45
            if 8 <= len(hook) <= 24:
                score += 0.25
            elif len(hook) <= 30:
                score += 0.10
            if any(word in hook for word in trigger_words):
                score += 0.20
            if hook.endswith(("？", "!", "！")):
                score += 0.05
            scores.append(min(1.0, score))
        avg = sum(scores) / max(len(scores), 1)
        return round(avg, 3)

    def _topic_diversity_score(self, topics: list[TopicItem], review_result: IdeaScriptReviewResult) -> float:
        if not topics:
            return 0.0
        score = 0.40
        angles = [t.angle for t in topics]
        if len(set(angles)) == len(angles):
            score += 0.30
        if len({(angle or "").strip() for angle in angles if (angle or "").strip()}) >= 3:
            score += 0.20
        unique_titles = len({(t.title or "").strip() for t in topics if (t.title or "").strip()})
        score += min(0.10, unique_titles / max(len(topics), 1) * 0.10)
        if "angle_duplicate" in (review_result.failure_tags or []):
            score -= 0.25
        return max(0.0, min(1.0, round(score, 3)))

    def _script_speakability_score(self, topics: list[TopicItem]) -> float:
        if not topics:
            return 0.0
        colloquial_markers = ("你", "先", "别", "如果", "其实", "我们")
        per_topic: list[float] = []
        for topic in topics:
            text = (topic.script_60s or "").strip()
            if not text:
                per_topic.append(0.0)
                continue
            score = 0.35
            if len(text) >= 70:
                score += 0.20
            if any(marker in text for marker in colloquial_markers):
                score += 0.20
            if all(tag in text for tag in SCRIPT_STRUCTURE_TAGS):
                score += 0.25
            if "评论区" in text or "收藏" in text or "关注" in text:
                score += 0.10
            per_topic.append(min(1.0, score))
        return round(sum(per_topic) / max(len(per_topic), 1), 3)

    def _compliance_score(
        self,
        compliance_result: ComplianceScanResult,
        review_result: IdeaScriptReviewResult,
    ) -> float:
        level = compliance_result.risk_level
        if level == "high":
            score = 0.20
        elif level == "medium":
            score = 0.55
        else:
            score = 0.90
        risky_penalty = min(0.35, len(compliance_result.risky_spans or []) * 0.04)
        score -= risky_penalty
        if "compliance_issue" in (review_result.failure_tags or []):
            score -= 0.10
        return max(0.0, min(1.0, round(score, 3)))
