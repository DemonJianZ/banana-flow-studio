from __future__ import annotations

from typing import Any, Optional

from pydantic import ValidationError

from .prompts import build_storyboard_reviewer_prompt
from .schemas import AssetRequirement, AudienceInferenceResult, ShotItem, StoryboardReviewResult, TopicItem


_REQUIRED_SEGMENT_MIN = {
    "HOOK": 1,
    "VIEW": 1,
    "STEPS": 2,
    "PRODUCT": 1,
    "CTA": 1,
}

_CAMERA_FALLBACKS = ("close_up", "wide", "over_shoulder", "top_down", "macro", "medium")
_CAMERA_ALIASES = {
    "close-up": "close_up",
    "close up": "close_up",
    "closeup": "close_up",
    "close_up": "close_up",
    "wide shot": "wide",
    "wide": "wide",
    "over shoulder": "over_shoulder",
    "over-the-shoulder": "over_shoulder",
    "over_the_shoulder": "over_shoulder",
    "over shoulder shot": "over_shoulder",
    "top down": "top_down",
    "top-down": "top_down",
    "top_down": "top_down",
    "macro shot": "macro",
    "macro": "macro",
    "medium shot": "medium",
    "medium": "medium",
    "eye-level shot": "medium",
    "eye level shot": "medium",
}


class StoryboardReviewerNode:
    """
    检查分镜结构并修复常见可修复问题。
    """

    def __init__(
        self,
        rules_provider: Optional[Any] = None,
        model_config: Optional[Any] = None,
    ) -> None:
        self.rules_provider = rules_provider
        self.model_config = model_config

    def run(
        self,
        audience_context: AudienceInferenceResult,
        topic: TopicItem,
        shots: list[Any],
    ) -> StoryboardReviewResult:
        _ = build_storyboard_reviewer_prompt(
            product=audience_context.product,
            persona=audience_context.persona,
            angle=topic.angle,
        )
        blocking_issues: list[str] = []
        non_blocking_issues: list[str] = []
        failure_tags: list[str] = []

        normalized_shots = self._normalize_shots(
            topic=topic,
            raw_shots=shots or [],
            non_blocking_issues=non_blocking_issues,
            failure_tags=failure_tags,
        )

        if not (6 <= len(normalized_shots) <= 8):
            self._add_issue(
                blocking_issues,
                failure_tags,
                f"storyboard_shot_count_invalid:{len(normalized_shots)}",
                "storyboard_shot_count_invalid",
            )

        segment_counts = {key: 0 for key in _REQUIRED_SEGMENT_MIN.keys()}
        duration_total = 0.0
        camera_set = set()

        for idx, shot in enumerate(normalized_shots):
            duration_total += float(shot.duration_sec or 0.0)
            camera_set.add((shot.camera or "").strip())
            if shot.segment in segment_counts:
                segment_counts[shot.segment] += 1

            if not (shot.scene or "").strip():
                self._add_issue(
                    blocking_issues,
                    failure_tags,
                    f"storyboard_scene_missing:{idx}",
                    "storyboard_scene_missing",
                )
            if not (shot.action or "").strip():
                self._add_issue(
                    blocking_issues,
                    failure_tags,
                    f"storyboard_action_missing:{idx}",
                    "storyboard_action_missing",
                )
            if len(shot.keyword_tags or []) < 1:
                self._add_issue(
                    blocking_issues,
                    failure_tags,
                    f"storyboard_keyword_tags_missing:{idx}",
                    "storyboard_keyword_tags_missing",
                )

        segment_coverage_ok = True
        for segment, min_count in _REQUIRED_SEGMENT_MIN.items():
            if segment_counts.get(segment, 0) < min_count:
                segment_coverage_ok = False
                self._add_issue(
                    blocking_issues,
                    failure_tags,
                    f"storyboard_segment_coverage_missing:{segment}:{segment_counts.get(segment, 0)}",
                    "storyboard_segment_coverage_invalid",
                )

        duration_total = round(duration_total, 2)
        if duration_total < 52.0 or duration_total > 68.0:
            self._add_issue(
                blocking_issues,
                failure_tags,
                f"storyboard_duration_total_out_of_range:{duration_total}",
                "storyboard_duration_total_invalid",
            )
        elif duration_total < 55.0 or duration_total > 65.0:
            self._add_issue(
                non_blocking_issues,
                failure_tags,
                f"storyboard_duration_total_slight_deviation:{duration_total}",
                "storyboard_duration_total_deviation",
            )

        camera_variety_count = len([x for x in camera_set if x])
        if camera_variety_count < 3:
            self._add_issue(
                blocking_issues,
                failure_tags,
                f"storyboard_camera_variety_too_low:{camera_variety_count}",
                "storyboard_camera_variety_low",
            )

        return StoryboardReviewResult(
            passed=(len(blocking_issues) == 0),
            blocking_issues=blocking_issues,
            non_blocking_issues=non_blocking_issues,
            failure_tags=failure_tags,
            normalized_shots=normalized_shots,
            duration_total=duration_total,
            camera_variety_count=camera_variety_count,
            segment_coverage_ok=segment_coverage_ok,
        )

    def _normalize_shots(
        self,
        topic: TopicItem,
        raw_shots: list[Any],
        non_blocking_issues: list[str],
        failure_tags: list[str],
    ) -> list[ShotItem]:
        normalized: list[ShotItem] = []
        for idx, raw in enumerate(raw_shots):
            shot: ShotItem
            if isinstance(raw, ShotItem):
                shot = raw.model_copy(deep=True)
            else:
                try:
                    if hasattr(raw, "model_dump"):
                        shot = ShotItem(**raw.model_dump())
                    elif isinstance(raw, dict):
                        shot = ShotItem(**raw)
                    else:
                        continue
                except ValidationError:
                    data = raw.model_dump() if hasattr(raw, "model_dump") else (dict(raw) if isinstance(raw, dict) else {})
                    shot = ShotItem(
                        shot_id=str(data.get("shot_id") or f"{topic.angle}_s{idx + 1:02d}"),
                        segment=self._normalize_segment(data.get("segment")),  # type: ignore[arg-type]
                        duration_sec=self._as_float(data.get("duration_sec"), 8.0),
                        camera=str(data.get("camera") or _CAMERA_FALLBACKS[idx % len(_CAMERA_FALLBACKS)]),
                        scene=str(data.get("scene") or f"{topic.angle}_场景"),
                        action=str(data.get("action") or "补充镜头动作"),
                        keyword_tags=list(data.get("keyword_tags") or []),
                        asset_requirements=list(data.get("asset_requirements") or []),
                    )
                    self._add_issue(
                        non_blocking_issues,
                        failure_tags,
                        f"storyboard_schema_auto_fixed:{idx}",
                        "storyboard_schema_auto_fixed",
                    )

            if not shot.shot_id:
                shot.shot_id = f"{topic.angle}_s{idx + 1:02d}"
                self._add_issue(
                    non_blocking_issues,
                    failure_tags,
                    f"storyboard_shot_id_filled:{idx}",
                    "storyboard_shot_id_filled",
                )
            if not shot.camera:
                shot.camera = _CAMERA_FALLBACKS[idx % len(_CAMERA_FALLBACKS)]
            else:
                shot.camera = self._normalize_camera(shot.camera, idx)
            if not shot.scene:
                shot.scene = f"{topic.angle}_场景"
            if not shot.action:
                shot.action = "补充镜头动作"
            if len(shot.keyword_tags or []) < 1:
                shot.keyword_tags = [topic.angle, shot.segment, "分镜关键词"]
                self._add_issue(
                    non_blocking_issues,
                    failure_tags,
                    f"storyboard_keyword_tags_auto_filled:{idx}",
                    "storyboard_keyword_tags_auto_filled",
                )
            if len(shot.keyword_tags) > 8:
                shot.keyword_tags = shot.keyword_tags[:8]
            shot.asset_requirements = self._normalize_asset_requirements(shot.asset_requirements, shot)
            normalized.append(shot)
        return normalized

    def _normalize_camera(self, value: Any, idx: int) -> str:
        text = str(value or "").strip().lower().replace("/", " ").replace("_", " ").replace("-", " ")
        text = " ".join(text.split())
        if not text:
            return _CAMERA_FALLBACKS[idx % len(_CAMERA_FALLBACKS)]
        alias_key = text.replace(" ", "_")
        if alias_key in _CAMERA_ALIASES:
            return _CAMERA_ALIASES[alias_key]
        if text in _CAMERA_ALIASES:
            return _CAMERA_ALIASES[text]
        if "close" in text:
            return "close_up"
        if "wide" in text:
            return "wide"
        if "shoulder" in text:
            return "over_shoulder"
        if "top" in text:
            return "top_down"
        if "macro" in text:
            return "macro"
        if "medium" in text or "eye level" in text:
            return "medium"
        return _CAMERA_FALLBACKS[idx % len(_CAMERA_FALLBACKS)]

    def _normalize_segment(self, value: Any) -> str:
        text = str(value or "").strip().upper()
        if text in _REQUIRED_SEGMENT_MIN:
            return text
        return "STEPS"

    def _normalize_asset_requirements(self, items: list[Any], shot: ShotItem) -> list[AssetRequirement]:
        source = list(items or [])
        normalized: list[AssetRequirement] = []
        for raw in source:
            req = self._coerce_asset_requirement(raw, shot)
            if req is None:
                continue
            normalized.append(req)
            if len(normalized) >= 3:
                break

        if not normalized:
            normalized.append(
                AssetRequirement(
                    type=self._infer_asset_type(f"{shot.segment}主画面"),
                    must_have=f"{shot.segment.lower()}主画面",
                    avoid="元素杂乱",
                    style="真实实拍",
                    aspect="9:16",
                )
            )

        return normalized[:3]

    def _coerce_asset_requirement(self, raw: Any, shot: ShotItem) -> AssetRequirement | None:
        if isinstance(raw, AssetRequirement):
            data = raw.model_dump()
        elif isinstance(raw, dict):
            data = dict(raw)
        else:
            text = str(raw or "").strip()
            if not text:
                return None
            data = {"must_have": text}

        must_have = str(data.get("must_have") or "").strip()
        if not must_have:
            must_have = f"{shot.segment.lower()}主画面"
        req_type = str(data.get("type") or "").strip()
        if not req_type:
            req_type = self._infer_asset_type(must_have)
        avoid = str(data.get("avoid") or "").strip() or "元素杂乱"
        style = str(data.get("style") or "").strip() or "真实实拍"
        aspect = str(data.get("aspect") or "").strip() or "9:16"
        return AssetRequirement(
            type=req_type,
            must_have=must_have,
            avoid=avoid,
            style=style,
            aspect=aspect,
        )

    def _infer_asset_type(self, text: str) -> str:
        t = (text or "").lower()
        if any(k in t for k in ("字幕", "文案", "title", "overlay")):
            return "overlay"
        if any(k in t for k in ("机位", "镜头", "camera")):
            return "camera"
        if any(k in t for k in ("产品", "包装", "product")):
            return "product"
        return "scene"

    def _as_float(self, value: Any, default: float) -> float:
        try:
            return float(value)
        except Exception:
            return float(default)

    def _add_issue(self, bucket: list[str], tags: list[str], issue: str, tag: str) -> None:
        if issue not in bucket:
            bucket.append(issue)
        if tag not in tags:
            tags.append(tag)
