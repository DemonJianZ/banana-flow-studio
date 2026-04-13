from __future__ import annotations

from typing import Any, Iterable, Optional

from pydantic import ValidationError

from .inference import is_generic_persona
from .prompts import GENERATION_TOPIC_COUNT, SCRIPT_STRUCTURE_TAGS, build_reviewer_prompt
from .schemas import AudienceInferenceResult, IdeaScriptReviewResult, TopicItem


class IdeaScriptReviewerNode:
    """
    Reviewer 负责约束检查与轻量修正。
    扩展点：
    - compliance_checker: 后续接合规检测器
    - rules_provider: 后续接规则库
    """

    def __init__(
        self,
        compliance_checker: Optional[Any] = None,
        rules_provider: Optional[Any] = None,
        model_config: Optional[Any] = None,
    ) -> None:
        self.compliance_checker = compliance_checker
        self.rules_provider = rules_provider
        self.model_config = model_config

    def run(
        self,
        audience_context: AudienceInferenceResult,
        topics: list[Any],
    ) -> IdeaScriptReviewResult:
        _ = build_reviewer_prompt(audience_context.product, audience_context.persona)

        blocking_issues: list[str] = []
        non_blocking_issues: list[str] = []
        failure_tags: list[str] = []

        raw_topics = topics or []
        normalized_topics = self._normalize_topics(
            raw_topics=raw_topics,
            blocking_issues=blocking_issues,
            failure_tags=failure_tags,
        )

        if len(raw_topics) != GENERATION_TOPIC_COUNT:
            self._add_issue(blocking_issues, failure_tags, "topics_count_not_3", "topic_count_invalid")

        angles = [(t.angle or "").strip() for t in normalized_topics if (t.angle or "").strip()]
        if len(set(angles)) != len(angles):
            self._add_issue(blocking_issues, failure_tags, "duplicate_angle", "angle_duplicate")
        if len(angles) != len(normalized_topics):
            self._add_issue(
                blocking_issues,
                failure_tags,
                "angle_missing_or_blank",
                "angle_invalid",
            )

        for idx, topic in enumerate(normalized_topics):
            self._check_required_text_fields(
                topic=topic,
                idx=idx,
                blocking_issues=blocking_issues,
                failure_tags=failure_tags,
            )
            self._check_and_fix_non_blocking(
                audience_context=audience_context,
                topic=topic,
                idx=idx,
                non_blocking_issues=non_blocking_issues,
                blocking_issues=blocking_issues,
                failure_tags=failure_tags,
            )
            self._check_and_fix_visual_keywords(
                topic=topic,
                idx=idx,
                non_blocking_issues=non_blocking_issues,
                failure_tags=failure_tags,
            )

        if is_generic_persona(audience_context.persona):
            self._add_issue(blocking_issues, failure_tags, "persona_too_generic", "persona_generic")

        if self.compliance_checker and hasattr(self.compliance_checker, "check"):
            try:
                compliance_issues = self.compliance_checker.check(
                    product=audience_context.product,
                    persona=audience_context.persona,
                    topics=[t.model_dump() for t in normalized_topics],
                )
                if isinstance(compliance_issues, list):
                    for item in compliance_issues:
                        self._add_issue(
                            non_blocking_issues,
                            failure_tags,
                            f"compliance:{item}",
                            "compliance_issue",
                        )
            except Exception:
                self._add_issue(non_blocking_issues, failure_tags, "compliance_checker_failed", "compliance_checker_failed")

        issues = blocking_issues + non_blocking_issues
        passed = len(blocking_issues) == 0
        return IdeaScriptReviewResult(
            passed=passed,
            blocking_issues=blocking_issues,
            non_blocking_issues=non_blocking_issues,
            failure_tags=failure_tags,
            normalized_topics=normalized_topics,
            issues=issues,  # backward compatibility
            topics=normalized_topics,  # backward compatibility
        )

    def _normalize_topics(
        self,
        raw_topics: list[Any],
        blocking_issues: list[str],
        failure_tags: list[str],
    ) -> list[TopicItem]:
        normalized: list[TopicItem] = []
        for idx, raw in enumerate(raw_topics):
            if isinstance(raw, TopicItem):
                topic = raw
            else:
                data: dict[str, Any]
                if hasattr(raw, "model_dump"):
                    data = raw.model_dump()
                elif isinstance(raw, dict):
                    data = dict(raw)
                else:
                    self._add_issue(
                        blocking_issues,
                        failure_tags,
                        f"topic_schema_invalid:{idx}",
                        "topic_schema_invalid",
                    )
                    continue

                missing_keys = [k for k in ("angle", "title", "hook", "script_60s") if k not in data]
                if missing_keys:
                    self._add_issue(
                        blocking_issues,
                        failure_tags,
                        f"topic_missing_required_fields:{idx}:{','.join(missing_keys)}",
                        "missing_required_field",
                    )
                    self._add_issue(
                        blocking_issues,
                        failure_tags,
                        f"topic_schema_invalid:{idx}",
                        "topic_schema_invalid",
                    )
                    # 尽量补齐占位，保留后续 reviewer 能继续检查/修正
                    if "angle" not in data:
                        data["angle"] = ""
                    data.setdefault("title", "")
                    data.setdefault("hook", "")
                    data.setdefault("script_60s", "")

                try:
                    topic = TopicItem(**data)
                except ValidationError:
                    self._add_issue(
                        blocking_issues,
                        failure_tags,
                        f"topic_schema_invalid:{idx}",
                        "topic_schema_invalid",
                    )
                    continue

            normalized.append(topic)
        return normalized

    def _check_required_text_fields(
        self,
        topic: TopicItem,
        idx: int,
        blocking_issues: list[str],
        failure_tags: list[str],
    ) -> None:
        for field_name in ("title", "hook", "script_60s"):
            value = getattr(topic, field_name, "")
            if not isinstance(value, str) or not value.strip():
                self._add_issue(
                    blocking_issues,
                    failure_tags,
                    f"topic_field_missing:{idx}:{field_name}",
                    "missing_required_field",
                )

    def _check_and_fix_non_blocking(
        self,
        audience_context: AudienceInferenceResult,
        topic: TopicItem,
        idx: int,
        non_blocking_issues: list[str],
        blocking_issues: list[str],
        failure_tags: list[str],
    ) -> None:
        hook = (topic.hook or "").strip()
        if len(hook) > 24:
            topic.hook = hook[:24].rstrip("，,。.!！？")
            self._add_issue(
                non_blocking_issues,
                failure_tags,
                f"hook_too_long:{idx}:{topic.angle}",
                "hook_too_long",
            )

        if self._looks_scene_oriented(topic) and not self._scene_specific_enough(topic, audience_context.scenes):
            self._add_issue(
                non_blocking_issues,
                failure_tags,
                f"scene_not_specific_enough:{idx}",
                "scene_not_specific",
            )

        if not self._looks_colloquial(topic.script_60s):
            self._add_issue(
                non_blocking_issues,
                failure_tags,
                f"script_not_colloquial:{idx}:{topic.angle}",
                "low_colloquiality",
            )

        if self._cta_weak(topic.script_60s):
            self._add_issue(
                non_blocking_issues,
                failure_tags,
                f"cta_weak:{idx}:{topic.angle}",
                "cta_weak",
            )

        missing_tags = self._missing_script_tags(topic.script_60s)
        if missing_tags:
            self._add_issue(
                blocking_issues,
                failure_tags,
                f"script_tags_missing:{idx}:{','.join(missing_tags)}",
                "script_tag_missing",
            )
        elif not self._script_tags_in_order(topic.script_60s):
            self._add_issue(
                blocking_issues,
                failure_tags,
                f"script_tags_order_invalid:{idx}",
                "script_tag_order_invalid",
            )

    def _check_and_fix_visual_keywords(
        self,
        topic: TopicItem,
        idx: int,
        non_blocking_issues: list[str],
        failure_tags: list[str],
    ) -> None:
        keywords = list(topic.visual_keywords or [])
        if 5 <= len(keywords) <= 8:
            return

        self._add_issue(
            non_blocking_issues,
            failure_tags,
            f"visual_keywords_invalid_count:{idx}:{len(keywords)}",
            "visual_keywords_invalid",
        )
        topic.visual_keywords = self._derive_visual_keywords(topic)

    def _looks_colloquial(self, text: str) -> bool:
        t = (text or "").strip()
        if not t:
            return False
        colloquial_markers = ("你", "其实", "先", "别", "如果", "真的", "我们")
        return any(m in t for m in colloquial_markers) and len(t) >= 40

    def _make_more_colloquial(self, text: str) -> str:
        base = (text or "").strip()
        if not base:
            return ""
        return base

    def _looks_scene_oriented(self, topic: TopicItem) -> bool:
        angle = (topic.angle or "").lower()
        if any(marker in angle for marker in ("scene", "场景", "情境", "通勤", "夜间", "仪式感")):
            return True
        title = f"{topic.title} {topic.hook}".lower()
        return any(marker in title for marker in ("场景", "scene", "通勤", "夜间", "对比"))

    def _cta_weak(self, text: str) -> bool:
        t = (text or "").strip()
        cta_markers = ("评论区", "关注", "收藏", "私信", "点个赞", "点个收藏")
        return not any(m in t for m in cta_markers)

    def _strengthen_cta(self, text: str) -> str:
        base = (text or "").strip()
        if not base:
            return ""
        return base

    def _scene_specific_enough(self, topic: TopicItem, scenes: Iterable[str]) -> bool:
        corpus = f"{topic.title} {topic.script_60s}".lower()
        for scene in scenes or []:
            s = (scene or "").strip().lower()
            if len(s) >= 4 and s in corpus:
                return True
        scene_markers = (
            "地铁", "通勤", "办公室", "会议", "午休", "下班", "晚上", "早上",
            "出门前", "回家", "门店", "直播间", "宿舍", "健身房", "车里",
        )
        return any(m in corpus for m in scene_markers)

    def _missing_script_tags(self, script: str) -> list[str]:
        text = script or ""
        missing = [tag for tag in SCRIPT_STRUCTURE_TAGS if tag not in text]
        return missing

    def _script_tags_in_order(self, script: str) -> bool:
        text = script or ""
        positions = []
        for tag in SCRIPT_STRUCTURE_TAGS:
            pos = text.find(tag)
            if pos < 0:
                return False
            positions.append(pos)
        return positions == sorted(positions)

    def _derive_visual_keywords(self, topic: TopicItem) -> list[str]:
        raw = [
            topic.angle,
            topic.title,
            topic.hook,
            topic.script_60s,
        ]
        keywords: list[str] = []
        seen = set()
        for item in raw:
            for text in str(item or "").replace("\n", " ").split(" "):
                text = text.strip("，,。；;：:[]")
                if len(text) < 2 or text in seen:
                    continue
                seen.add(text)
                keywords.append(text)
                if len(keywords) >= 8:
                    break
            if len(keywords) >= 8:
                break
        return keywords

    def _add_issue(self, bucket: list[str], tags: list[str], issue: str, tag: str) -> None:
        if issue not in bucket:
            bucket.append(issue)
        if tag not in tags:
            tags.append(tag)
