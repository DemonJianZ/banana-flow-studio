from __future__ import annotations

import re
from typing import Any, Optional, Sequence

from .prompts import STORYBOARD_SEGMENTS, build_storyboard_prompt
from .schemas import AssetRequirement, AudienceInferenceResult, ShotItem, TopicItem


class StoryboardAgentNode:
    """
    无素材库版本的分镜生成节点，输出镜头结构与占位素材需求单。
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
        topic: TopicItem,
        retry: bool = False,
        reviewer_blocking_issues: Sequence[str] | None = None,
        allow_llm: bool = True,
    ) -> list[ShotItem]:
        _ = build_storyboard_prompt(
            product=audience_context.product,
            persona=audience_context.persona,
            angle=topic.angle,
        )

        if allow_llm and self.llm_client and hasattr(self.llm_client, "generate_storyboard"):
            try:
                out = self.llm_client.generate_storyboard(
                    audience_context=audience_context.model_dump(),
                    topic=topic.model_dump(),
                    retry=retry,
                    reviewer_blocking_issues=list(reviewer_blocking_issues or []),
                )
                shots = [s if isinstance(s, ShotItem) else ShotItem(**s) for s in (out or [])]
                return self._normalize_shots(shots, topic=topic)
            except Exception:
                pass

        segment_texts = self._parse_segment_texts(topic.script_60s)
        if retry and reviewer_blocking_issues:
            segment_texts["CTA"] = (
                f"{segment_texts.get('CTA', '').strip()} 重点修复：{','.join(list(reviewer_blocking_issues)[:2])}"
            ).strip()

        shot_specs = [
            ("HOOK", 6.0, "close_up"),
            ("VIEW", 8.0, "wide"),
            ("STEPS", 10.0, "over_shoulder"),
            ("STEPS", 10.0, "top_down"),
            ("PRODUCT", 11.0, "macro"),
            ("VIEW", 7.0, "medium"),
            ("CTA", 8.0, "close_up"),
        ]
        shots: list[ShotItem] = []
        for idx, (segment, duration, camera) in enumerate(shot_specs, start=1):
            overlay = self._short_overlay(segment_texts.get(segment, ""), topic.hook)
            scene = self._scene_for_segment(segment, topic)
            action = self._action_for_segment(segment, topic)
            keyword_tags = self._keyword_tags(
                topic=topic,
                segment=segment,
                camera=camera,
                scene=scene,
                action=action,
            )
            asset_requirements = self._asset_requirements(segment, topic, camera)
            shot = ShotItem(
                shot_id=f"{topic.angle}_s{idx:02d}",
                segment=segment,  # type: ignore[arg-type]
                duration_sec=duration,
                camera=camera,
                scene=scene,
                action=action,
                emotion=self._emotion_for_segment(segment),
                overlay_text=overlay,
                keyword_tags=keyword_tags,
                asset_requirements=asset_requirements,
            )
            shots.append(shot)

        return self._normalize_shots(shots, topic=topic)

    def _parse_segment_texts(self, script: str) -> dict[str, str]:
        text = script or ""
        pattern = re.compile(r"\[(HOOK|VIEW|STEPS|PRODUCT|CTA)\]")
        matches = list(pattern.finditer(text))
        if not matches:
            return {name: text.strip() for name in STORYBOARD_SEGMENTS}

        segments: dict[str, str] = {}
        for idx, match in enumerate(matches):
            name = match.group(1)
            start = match.end()
            end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
            segments[name] = text[start:end].strip()

        for name in STORYBOARD_SEGMENTS:
            segments.setdefault(name, "")
        return segments

    def _scene_for_segment(self, segment: str, topic: TopicItem) -> str:
        mapping = {
            "HOOK": "开场口播区",
            "VIEW": "使用场景区",
            "STEPS": "步骤演示台",
            "PRODUCT": "产品特写台",
            "CTA": "结尾互动区",
        }
        base = mapping.get(segment, "口播区")
        return f"{topic.angle}_{base}"

    def _action_for_segment(self, segment: str, topic: TopicItem) -> str:
        mapping = {
            "HOOK": f"主持人抛出痛点钩子：{topic.hook}",
            "VIEW": "展示场景前后对比并解释判断逻辑",
            "STEPS": "逐步演示判断流程并给出可执行动作",
            "PRODUCT": "对产品关键点做近景说明与承接",
            "CTA": "给出收藏/评论/关注引导",
        }
        return mapping.get(segment, "口播说明")

    def _emotion_for_segment(self, segment: str) -> str | None:
        mapping = {
            "HOOK": "紧迫",
            "VIEW": "理性",
            "STEPS": "清晰",
            "PRODUCT": "可信",
            "CTA": "鼓励",
        }
        return mapping.get(segment)

    def _short_overlay(self, segment_text: str, fallback: str) -> str:
        text = (segment_text or fallback or "").strip()
        if not text:
            return ""
        if len(text) <= 22:
            return text
        return text[:22].rstrip("，,。.!！？") + "..."

    def _keyword_tags(
        self,
        topic: TopicItem,
        segment: str,
        camera: str,
        scene: str,
        action: str,
    ) -> list[str]:
        raw = list(topic.visual_keywords or []) + [
            topic.angle,
            segment,
            camera,
            scene,
            action,
            "分镜",
        ]
        tags: list[str] = []
        seen = set()
        for item in raw:
            text = str(item or "").strip()
            if not text or text in seen:
                continue
            seen.add(text)
            tags.append(text)
            if len(tags) >= 8:
                break
        while len(tags) < 5:
            tags.append(f"{segment.lower()}_tag_{len(tags) + 1}")
        return tags

    def _asset_requirements(self, segment: str, topic: TopicItem, camera: str) -> list[AssetRequirement]:
        raw = [
            AssetRequirement(
                type="scene",
                must_have=f"{segment.lower()}场景画面",
                avoid="无关背景干扰",
                style="真实实拍",
                aspect="9:16",
            ),
            AssetRequirement(
                type="camera",
                must_have=f"{camera}机位主镜头",
                avoid="机位抖动",
                style="稳定构图",
                aspect="9:16",
            ),
            AssetRequirement(
                type="overlay",
                must_have=f"{topic.angle}字幕条",
                avoid="遮挡主体",
                style="简洁高对比",
                aspect="9:16",
            ),
        ]
        return raw[:3]

    def _normalize_shots(self, shots: list[ShotItem], topic: TopicItem) -> list[ShotItem]:
        normalized = list(shots or [])
        if len(normalized) < 6:
            while len(normalized) < 6:
                idx = len(normalized) + 1
                normalized.append(
                    ShotItem(
                        shot_id=f"{topic.angle}_s{idx:02d}",
                        segment="STEPS",
                        duration_sec=8.0,
                        camera="medium",
                        scene=f"{topic.angle}_步骤演示台",
                        action="补充步骤演示",
                        keyword_tags=self._keyword_tags(topic, "STEPS", "medium", "步骤演示台", "补充步骤演示"),
                        asset_requirements=self._asset_requirements("STEPS", topic, "medium"),
                    )
                )
        if len(normalized) > 8:
            normalized = normalized[:8]

        camera_pool = ["close_up", "wide", "over_shoulder", "top_down", "macro", "medium"]
        for idx, shot in enumerate(normalized):
            item = shot.model_copy(deep=True)
            if not item.shot_id:
                item.shot_id = f"{topic.angle}_s{idx + 1:02d}"
            if not item.camera:
                item.camera = camera_pool[idx % len(camera_pool)]
            if not item.scene:
                item.scene = self._scene_for_segment(item.segment, topic)
            if not item.action:
                item.action = self._action_for_segment(item.segment, topic)
            if not item.keyword_tags:
                item.keyword_tags = self._keyword_tags(
                    topic=topic,
                    segment=item.segment,
                    camera=item.camera,
                    scene=item.scene,
                    action=item.action,
                )
            if len(item.keyword_tags) > 8:
                item.keyword_tags = item.keyword_tags[:8]
            if len(item.keyword_tags) < 5:
                item.keyword_tags = self._keyword_tags(
                    topic=topic,
                    segment=item.segment,
                    camera=item.camera,
                    scene=item.scene,
                    action=item.action,
                )
            if not item.asset_requirements:
                item.asset_requirements = self._asset_requirements(item.segment, topic, item.camera)
            if len(item.asset_requirements) > 3:
                item.asset_requirements = item.asset_requirements[:3]
            if len(item.asset_requirements) < 1:
                item.asset_requirements = [
                    AssetRequirement(
                        type="scene",
                        must_have=f"{item.segment.lower()}主画面",
                        avoid="元素杂乱",
                        style="真实实拍",
                        aspect="9:16",
                    )
                ]
            normalized[idx] = item

        return normalized
