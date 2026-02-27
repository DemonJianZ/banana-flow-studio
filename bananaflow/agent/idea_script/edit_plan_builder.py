from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from .schemas import EditAssetPick, EditClip, EditPlan, EditTrack, TopicItem


_BUCKET_ORDER = {"best_match": 0, "partial_match": 1, "fallback": 2}


class EditPlanBuilder:
    def run(
        self,
        product: str,
        topics: list[TopicItem],
        matched_assets: dict[str, list[Any]],
        prompt_version: str,
        policy_version: str,
        config_hash: str,
        alternates_top_k: int = 3,
    ) -> dict[str, Any]:
        generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
        plans: list[EditPlan] = []
        missing_primary_asset_count = 0
        clip_count_total = 0

        for topic_idx, topic in enumerate(list(topics or [])):
            clips: list[EditClip] = []
            for shot_idx, shot in enumerate(list(getattr(topic, "shots", []) or []), start=1):
                clip_count_total += 1
                shot_id = str(getattr(shot, "shot_id", "") or f"{topic.angle}_s{shot_idx:02d}")
                cands = list(matched_assets.get(shot_id, []) or [])
                sorted_cands = self._sort_candidates(cands)
                primary = self._to_pick(sorted_cands[0]) if sorted_cands else None
                if primary is None:
                    missing_primary_asset_count += 1
                alternates = [
                    self._to_pick(item)
                    for item in sorted_cands[1 : max(1, int(alternates_top_k or 1))]
                ]
                alternates = [x for x in alternates if x is not None]
                clips.append(
                    EditClip(
                        clip_id=f"{topic.angle}_clip_{shot_idx:02d}",
                        shot_id=shot_id,
                        segment=shot.segment,
                        duration_sec=float(getattr(shot, "duration_sec", 0.0) or 0.0),
                        camera=str(getattr(shot, "camera", "") or ""),
                        scene=str(getattr(shot, "scene", "") or ""),
                        action=str(getattr(shot, "action", "") or ""),
                        primary_asset=primary,
                        alternates=alternates,
                    )
                )

            total_duration = round(sum(float(clip.duration_sec or 0.0) for clip in clips), 2)
            track = EditTrack(
                track_id=f"{topic.angle}_video_track_1",
                track_type="video",
                clips=clips,
            )
            topic_missing_count = sum(1 for clip in clips if clip.primary_asset is None)
            plans.append(
                EditPlan(
                    plan_id=f"edit_plan_{topic.angle}_{topic_idx + 1}",
                    product=product,
                    topic_index=topic_idx,
                    angle=topic.angle,
                    title=str(topic.title or ""),
                    tracks=[track],
                    total_duration_sec=total_duration,
                    missing_primary_asset_count=topic_missing_count,
                    prompt_version=prompt_version,
                    policy_version=policy_version,
                    config_hash=config_hash,
                    generated_at=generated_at,
                )
            )

        warning = missing_primary_asset_count > 0
        warning_reason = "missing_primary_asset" if warning else None
        return {
            "edit_plans": plans,
            "edit_plan_warning": warning,
            "edit_plan_warning_reason": warning_reason,
            "clip_count_total": clip_count_total,
            "missing_primary_asset_count": missing_primary_asset_count,
        }

    def _sort_candidates(self, candidates: list[Any]) -> list[Any]:
        return sorted(
            list(candidates or []),
            key=lambda x: (
                _BUCKET_ORDER.get(str(getattr(x, "bucket", "fallback") or "fallback"), 99),
                -float(getattr(x, "score", 0.0) or 0.0),
                str(getattr(x, "asset_id", "") or ""),
            ),
        )

    def _to_pick(self, candidate: Any) -> EditAssetPick | None:
        if candidate is None:
            return None
        asset_id = str(getattr(candidate, "asset_id", "") or "").strip()
        uri = str(getattr(candidate, "uri", "") or "").strip()
        if not asset_id or not uri:
            return None
        return EditAssetPick(
            asset_id=asset_id,
            uri=uri,
            score=float(getattr(candidate, "score", 0.0) or 0.0),
            bucket=str(getattr(candidate, "bucket", "fallback") or "fallback"),  # type: ignore[arg-type]
            reason=str(getattr(candidate, "reason", "") or ""),
        )
