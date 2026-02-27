import os
import sys
import tempfile
import unittest


ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)


from bananaflow.agent.idea_script.exporters.ffmpeg_exporter import export_ffmpeg_bundle
from bananaflow.agent.idea_script.schemas import EditAssetPick, EditClip, EditPlan, EditTrack


class FfmpegExporterTests(unittest.TestCase):
    def test_export_bundle_should_write_required_files_and_script_commands(self):
        plan = EditPlan(
            plan_id="plan_demo_1",
            product="耳机",
            topic_index=0,
            angle="persona",
            title="测试计划",
            tracks=[
                EditTrack(
                    track_id="video_track_1",
                    track_type="video",
                    clips=[
                        EditClip(
                            clip_id="clip_01",
                            shot_id="s01",
                            segment="HOOK",
                            duration_sec=6.0,
                            camera="close_up",
                            scene="开场",
                            action="抛钩子",
                            primary_asset=EditAssetPick(
                                asset_id="a1",
                                uri="/tmp/assets/a1.mp4",
                                score=0.9,
                                bucket="best_match",
                                reason="ok",
                            ),
                            alternates=[],
                        ),
                        EditClip(
                            clip_id="clip_02",
                            shot_id="s02",
                            segment="VIEW",
                            duration_sec=8.5,
                            camera="wide",
                            scene="场景",
                            action="讲观点",
                            primary_asset=EditAssetPick(
                                asset_id="a2",
                                uri="/tmp/assets/a2.mp4",
                                score=0.8,
                                bucket="partial_match",
                                reason="ok",
                            ),
                            alternates=[],
                        ),
                    ],
                )
            ],
            total_duration_sec=14.5,
            prompt_version="pv",
            policy_version="rv",
            config_hash="x" * 64,
            generated_at="2026-02-27T00:00:00+00:00",
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            out = export_ffmpeg_bundle(plan, out_dir=tmpdir, resolution=(720, 1280), fps=30)
            bundle_dir = out["bundle_dir"]
            self.assertTrue(os.path.isdir(bundle_dir))
            self.assertTrue(os.path.isfile(os.path.join(bundle_dir, "edit_plan.json")))
            self.assertTrue(os.path.isfile(os.path.join(bundle_dir, "concat_list.txt")))
            self.assertTrue(os.path.isfile(os.path.join(bundle_dir, "render.sh")))

            with open(os.path.join(bundle_dir, "render.sh"), "r", encoding="utf-8") as f:
                script = f.read()
            self.assertIn("ffmpeg -y -ss 0 -t 6.000", script)
            self.assertIn("-c:v libx264 -preset veryfast -crf 23", script)
            self.assertIn("concat_list.txt", script)
            self.assertIn("if ffmpeg -y -f concat -safe 0 -i concat_list.txt -c copy output.mp4; then", script)
            self.assertIn("output.mp4", script)

    def test_export_bundle_should_warn_when_missing_primary_asset(self):
        plan = EditPlan(
            plan_id="plan_demo_missing",
            product="耳机",
            topic_index=1,
            angle="scene",
            title="缺素材测试",
            tracks=[
                EditTrack(
                    track_id="video_track_1",
                    track_type="video",
                    clips=[
                        EditClip(
                            clip_id="clip_01",
                            shot_id="s01",
                            segment="HOOK",
                            duration_sec=6.0,
                            camera="close_up",
                            scene="开场",
                            action="抛钩子",
                            primary_asset=None,
                            alternates=[],
                        ),
                        EditClip(
                            clip_id="clip_02",
                            shot_id="s02",
                            segment="VIEW",
                            duration_sec=8.0,
                            camera="wide",
                            scene="场景",
                            action="讲观点",
                            primary_asset=EditAssetPick(
                                asset_id="a2",
                                uri="/tmp/assets/a2.mp4",
                                score=0.8,
                                bucket="fallback",
                                reason="ok",
                            ),
                            alternates=[],
                        ),
                    ],
                )
            ],
            total_duration_sec=14.0,
            prompt_version="pv",
            policy_version="rv",
            config_hash="y" * 64,
            generated_at="2026-02-27T00:00:00+00:00",
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            out = export_ffmpeg_bundle(plan, out_dir=tmpdir)
            self.assertTrue(out["warning"])
            self.assertEqual(out["warning_reason"], "missing_primary_asset")
            self.assertEqual(out["missing_primary_asset_count"], 1)
            with open(os.path.join(out["bundle_dir"], "render.sh"), "r", encoding="utf-8") as f:
                script = f.read()
            self.assertIn("missing primary_asset, skipped", script)


if __name__ == "__main__":
    unittest.main()
