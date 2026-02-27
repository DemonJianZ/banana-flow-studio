import os
import sys
import unittest


ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)


from bananaflow.agent.idea_script.edit_plan_builder import EditPlanBuilder
from bananaflow.agent.idea_script.schemas import ShotItem, TopicItem
from bananaflow.assets.schemas import AssetCandidate


def _topic(angle: str, idx: int, shots: list[ShotItem]) -> TopicItem:
    return TopicItem(
        angle=angle,  # type: ignore[arg-type]
        title=f"title_{idx}",
        hook=f"hook_{idx}",
        script_60s="[HOOK]a[VIEW]b[STEPS]c[PRODUCT]d[CTA]e",
        shots=shots,
    )


def _shot(shot_id: str, segment: str, duration_sec: float) -> ShotItem:
    return ShotItem(
        shot_id=shot_id,
        segment=segment,  # type: ignore[arg-type]
        duration_sec=duration_sec,
        camera="close_up",
        scene="scene",
        action="action",
        keyword_tags=["a", "b", "c", "d", "e"],
        asset_requirements=[],
    )


def _cand(asset_id: str, score: float, bucket: str) -> AssetCandidate:
    return AssetCandidate(
        asset_id=asset_id,
        uri=f"/assets/{asset_id}.mp4",
        score=score,
        bucket=bucket,  # type: ignore[arg-type]
        reason=f"bucket={bucket}",
    )


class EditPlanBuilderTests(unittest.TestCase):
    def test_builder_should_generate_plans_and_select_primary_with_bucket_priority(self):
        builder = EditPlanBuilder()
        topics = [
            _topic("persona", 1, [_shot("p_s01", "HOOK", 6.0), _shot("p_s02", "VIEW", 8.0)]),
            _topic("scene", 2, [_shot("s_s01", "STEPS", 10.0)]),
            _topic("misconception", 3, [_shot("m_s01", "CTA", 7.0)]),
        ]
        matched_assets = {
            "p_s01": [
                _cand("f_high", 10.0, "fallback"),
                _cand("b_low", 1.0, "best_match"),
                _cand("p_mid", 8.0, "partial_match"),
            ],
            "p_s02": [_cand("p2", 5.0, "partial_match"), _cand("f2", 9.0, "fallback")],
            "s_s01": [],  # missing primary
            "m_s01": [_cand("b3", 3.0, "best_match"), _cand("f3", 9.0, "fallback")],
        }

        out = builder.run(
            product="耳机",
            topics=topics,
            matched_assets=matched_assets,
            prompt_version="pv",
            policy_version="rv",
            config_hash="x" * 64,
            alternates_top_k=3,
        )

        plans = out["edit_plans"]
        self.assertEqual(len(plans), 3)
        self.assertEqual(out["clip_count_total"], 4)
        self.assertEqual(out["missing_primary_asset_count"], 1)
        self.assertTrue(out["edit_plan_warning"])
        self.assertEqual(out["edit_plan_warning_reason"], "missing_primary_asset")

        plan0 = plans[0]
        self.assertEqual(plan0.prompt_version, "pv")
        self.assertEqual(plan0.policy_version, "rv")
        self.assertEqual(plan0.config_hash, "x" * 64)
        self.assertTrue(bool(plan0.generated_at))
        self.assertAlmostEqual(plan0.total_duration_sec, 14.0)

        clips0 = plan0.tracks[0].clips
        self.assertEqual(len(clips0), 2)
        # bucket 优先于 score: best_match 应优先于 fallback
        self.assertIsNotNone(clips0[0].primary_asset)
        self.assertEqual(clips0[0].primary_asset.asset_id, "b_low")
        self.assertEqual(clips0[0].primary_asset.bucket, "best_match")
        self.assertEqual(len(clips0[0].alternates), 2)
        self.assertEqual(clips0[0].alternates[0].bucket, "partial_match")
        self.assertEqual(clips0[0].alternates[1].bucket, "fallback")

        plan1 = plans[1]
        self.assertEqual(plan1.missing_primary_asset_count, 1)
        self.assertIsNone(plan1.tracks[0].clips[0].primary_asset)

    def test_builder_should_keep_one_clip_per_shot(self):
        builder = EditPlanBuilder()
        topics = [
            _topic("persona", 1, [_shot("a1", "HOOK", 6.0), _shot("a2", "VIEW", 8.0)]),
            _topic("scene", 2, [_shot("b1", "STEPS", 10.0), _shot("b2", "PRODUCT", 11.0)]),
            _topic("misconception", 3, [_shot("c1", "CTA", 7.0)]),
        ]
        matched_assets = {
            "a1": [_cand("a1c", 1.0, "best_match")],
            "a2": [_cand("a2c", 1.0, "best_match")],
            "b1": [_cand("b1c", 1.0, "best_match")],
            "b2": [_cand("b2c", 1.0, "best_match")],
            "c1": [_cand("c1c", 1.0, "best_match")],
        }

        out = builder.run(
            product="耳机",
            topics=topics,
            matched_assets=matched_assets,
            prompt_version="pv",
            policy_version="rv",
            config_hash="y" * 64,
        )
        plans = out["edit_plans"]
        self.assertEqual(len(plans), 3)
        total_shots = sum(len(topic.shots) for topic in topics)
        total_clips = sum(len(plan.tracks[0].clips) for plan in plans)
        self.assertEqual(total_clips, total_shots)
        self.assertEqual(out["missing_primary_asset_count"], 0)
        self.assertFalse(out["edit_plan_warning"])


if __name__ == "__main__":
    unittest.main()
