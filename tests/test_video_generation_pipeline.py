import os
import sys
import tempfile
import unittest
from unittest import mock


ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
BANANAFLOW_DIR = os.path.join(ROOT_DIR, "bananaflow")
if BANANAFLOW_DIR not in sys.path:
    sys.path.insert(0, BANANAFLOW_DIR)


from bananaflow.agent.idea_script.schemas import (  # noqa: E402
    AudienceInferenceResult,
    IdeaScriptResponse,
    ShotItem,
    TopicItem,
)
from bananaflow.services.video_generation_pipeline import (  # noqa: E402
    run_e2e_video_workflow,
    stitch_video_clips_ffmpeg,
)


def _build_idea_script_response(product: str = "洗面奶") -> IdeaScriptResponse:
    audience = AudienceInferenceResult(
        product=product,
        persona="决策期用户",
        pain_points=["不知道怎么选"],
        scenes=["浴室"],
        why_this_persona="高购买意向",
        confidence=0.9,
        unsafe_claim_risk="low",
    )
    shot = ShotItem(
        shot_id="shot_001",
        segment="HOOK",
        duration_sec=6.0,
        camera="close_up",
        scene="浴室开场",
        action="手持产品展示",
        keyword_tags=["浴室", "开场", "口播"],
        asset_requirements=[],
    )
    topic = TopicItem(
        angle="persona",
        title="开场痛点",
        hook="先看怎么选",
        script_60s="[HOOK] 先看怎么选。[VIEW] 观点。[STEPS] 步骤。[PRODUCT] 产品。[CTA] 收藏。",
        visual_keywords=["浴室", "产品", "特写"],
        shots=[shot],
    )
    return IdeaScriptResponse(audience_context=audience, topics=[topic])


class VideoGenerationPipelineTests(unittest.TestCase):
    def test_feature_flag_disabled_should_fallback_to_idea_script_only(self):
        out = run_e2e_video_workflow(
            req_id="req_flag_off",
            product="洗面奶",
            out_dir="./exports/video_generation",
            enable_video_generation=False,
            run_idea_script_fn=lambda _product: _build_idea_script_response(_product),
            image_generator=lambda **kwargs: (_ for _ in ()).throw(RuntimeError("should not run")),
            clip_generator=lambda **kwargs: (_ for _ in ()).throw(RuntimeError("should not run")),
        )
        self.assertFalse(out["video_generation_enabled"])
        self.assertEqual(out["fallback_mode"], "idea_script_only")
        self.assertIsNone(out["output_video"])
        self.assertEqual(out["shots_total"], 1)
        self.assertEqual(out["shots_succeeded"], 0)
        self.assertEqual(out["shots_failed"], 0)

    def test_enabled_pipeline_should_retry_and_generate_output(self):
        image_calls = {"count": 0}
        clip_calls = {"count": 0}

        def _image_generator(**kwargs):
            image_calls["count"] += 1
            if image_calls["count"] == 1:
                raise RuntimeError("transient image error")
            return b"fake_image"

        def _clip_generator(**kwargs):
            clip_calls["count"] += 1
            return b"fake_video", "video/mp4"

        with tempfile.TemporaryDirectory() as tmpdir:
            def _stitcher(**kwargs):
                output_video_path = kwargs["output_video_path"]
                os.makedirs(os.path.dirname(output_video_path), exist_ok=True)
                with open(output_video_path, "wb") as f:
                    f.write(b"final_video")
                return output_video_path

            out = run_e2e_video_workflow(
                req_id="req_pipeline_on",
                product="洗面奶",
                out_dir=tmpdir,
                enable_video_generation=True,
                run_idea_script_fn=lambda _product: _build_idea_script_response(_product),
                retries_per_step=1,
                image_generator=_image_generator,
                clip_generator=_clip_generator,
                stitcher=_stitcher,
            )

            self.assertTrue(out["video_generation_enabled"])
            self.assertEqual(out["fallback_mode"], "video_generation")
            self.assertEqual(out["shots_total"], 1)
            self.assertEqual(out["shots_succeeded"], 1)
            self.assertEqual(out["shots_failed"], 0)
            self.assertTrue(os.path.exists(str(out["output_video"])))
            self.assertEqual(image_calls["count"], 2)
            self.assertEqual(clip_calls["count"], 1)
            self.assertEqual(out["artifacts"][0]["status"], "success")

    def test_stitch_video_clips_ffmpeg_should_include_audio_and_encoding_params(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            clip_a = os.path.join(tmpdir, "a.mp4")
            clip_b = os.path.join(tmpdir, "b.mp4")
            bgm = os.path.join(tmpdir, "bgm.mp3")
            with open(clip_a, "wb") as f:
                f.write(b"a")
            with open(clip_b, "wb") as f:
                f.write(b"b")
            with open(bgm, "wb") as f:
                f.write(b"bgm")

            calls = []

            def _fake_run_ffmpeg(cmd, stage):
                calls.append((list(cmd), stage))
                out_path = str(cmd[-1])
                os.makedirs(os.path.dirname(out_path), exist_ok=True)
                with open(out_path, "wb") as f:
                    f.write(b"x")

            output_path = os.path.join(tmpdir, "out.mp4")
            with mock.patch("bananaflow.services.video_generation_pipeline._run_ffmpeg", side_effect=_fake_run_ffmpeg):
                stitched = stitch_video_clips_ffmpeg(
                    clip_paths=[clip_a, clip_b],
                    output_video_path=output_path,
                    resolution=(720, 1280),
                    fps=30,
                    bgm_path=bgm,
                )

            self.assertTrue(os.path.exists(stitched))
            cmd_text = "\n".join(" ".join(cmd) for cmd, _ in calls)
            self.assertIn("scale=720:1280", cmd_text)
            self.assertIn("-r 30", cmd_text)
            self.assertIn("-c:v libx264", cmd_text)
            self.assertIn("-stream_loop -1", cmd_text)
            self.assertIn("-c:a aac", cmd_text)


if __name__ == "__main__":
    unittest.main()
