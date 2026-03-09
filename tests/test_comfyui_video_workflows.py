import copy
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


from bananaflow.services import comfyui  # noqa: E402


class ComfyUiVideoWorkflowTests(unittest.TestCase):
    def test_run_image_z_image_turbo_workflow_should_fill_prompt_and_size(self):
        workflow = {
            "58": {"inputs": {"value": ""}},
            "57:13": {"inputs": {"width": 512, "height": 512, "batch_size": 1}},
            "57:3": {"inputs": {"seed": 0}},
            "9": {"inputs": {"filename_prefix": "z-image"}},
        }
        with (
            mock.patch.object(comfyui, "_load_workflow", return_value=copy.deepcopy(workflow)),
            mock.patch.object(comfyui, "_queue_prompt", return_value="prompt_1") as mock_queue_prompt,
            mock.patch.object(comfyui, "_wait_for_history", return_value={"outputs": {}}),
            mock.patch.object(comfyui, "_pick_output_image", return_value={"filename": "result.png"}),
            mock.patch.object(comfyui, "_download_image", return_value=b"image_bytes"),
        ):
            out = comfyui.run_image_z_image_turbo_workflow(
                req_id="req_1",
                prompt="shot scene with product close-up",
                width=1024,
                height=1536,
                seed=42,
                filename_prefix="video_pipeline/req_1/img_s01",
            )

        self.assertEqual(out, b"image_bytes")
        sent_workflow = mock_queue_prompt.call_args[0][0]
        self.assertEqual(sent_workflow["58"]["inputs"]["value"], "shot scene with product close-up")
        self.assertEqual(sent_workflow["57:13"]["inputs"]["width"], 1024)
        self.assertEqual(sent_workflow["57:13"]["inputs"]["height"], 1536)
        self.assertEqual(sent_workflow["57:3"]["inputs"]["seed"], 42)
        self.assertEqual(sent_workflow["9"]["inputs"]["filename_prefix"], "video_pipeline/req_1/img_s01")

    def test_run_video_wan_i2v_workflow_should_fill_nodes_and_return_video(self):
        workflow = {
            "97": {"inputs": {"image": ""}},
            "93": {"inputs": {"text": ""}},
            "89": {"inputs": {"text": ""}},
            "98": {"inputs": {"width": 640, "height": 640, "length": 81}},
            "94": {"inputs": {"fps": 16}},
            "86": {"inputs": {"noise_seed": 0}},
            "85": {"inputs": {"noise_seed": 0}},
            "108": {"inputs": {"filename_prefix": "video/ComfyUI"}},
        }
        with (
            mock.patch.object(comfyui, "_load_workflow", return_value=copy.deepcopy(workflow)),
            mock.patch.object(comfyui, "_upload_image", return_value="uploaded_input.png"),
            mock.patch.object(comfyui, "_queue_prompt", return_value="prompt_2") as mock_queue_prompt,
            mock.patch.object(comfyui, "_wait_for_history", return_value={"outputs": {}}),
            mock.patch.object(comfyui, "_pick_output_file", return_value={"filename": "shot_1.mp4"}),
            mock.patch.object(comfyui, "_download_file", return_value=b"video_bytes"),
        ):
            video_bytes, mime_type = comfyui.run_video_wan_i2v_workflow(
                req_id="req_2",
                image_bytes=b"fake_png_bytes",
                positive_prompt="camera circles around product",
                negative_prompt="blur, noise",
                width=864,
                height=864,
                length=97,
                fps=24,
                seed=123,
                filename_prefix="video_pipeline/req_2/clip_s01",
            )

        self.assertEqual(video_bytes, b"video_bytes")
        self.assertEqual(mime_type, "video/mp4")
        sent_workflow = mock_queue_prompt.call_args[0][0]
        self.assertEqual(sent_workflow["97"]["inputs"]["image"], "uploaded_input.png")
        self.assertEqual(sent_workflow["93"]["inputs"]["text"], "camera circles around product")
        self.assertEqual(sent_workflow["89"]["inputs"]["text"], "blur, noise")
        self.assertEqual(sent_workflow["98"]["inputs"]["width"], 864)
        self.assertEqual(sent_workflow["98"]["inputs"]["height"], 864)
        self.assertEqual(sent_workflow["98"]["inputs"]["length"], 97)
        self.assertEqual(sent_workflow["94"]["inputs"]["fps"], 24)
        self.assertEqual(sent_workflow["86"]["inputs"]["noise_seed"], 123)
        self.assertEqual(sent_workflow["85"]["inputs"]["noise_seed"], 123)
        self.assertEqual(sent_workflow["108"]["inputs"]["filename_prefix"], "video_pipeline/req_2/clip_s01")

    def test_run_qwen_i2v_workflow_should_fill_nodes_and_return_video(self):
        workflow = {
            "97": {"inputs": {"image": ""}},
            "93": {"inputs": {"text": ""}},
            "98": {"inputs": {"width": 640, "height": 640, "length": 81}},
            "94": {"inputs": {"fps": 16}},
            "108": {"inputs": {"filename_prefix": "video/ComfyUI"}},
        }
        with (
            mock.patch.object(comfyui, "_load_workflow", return_value=copy.deepcopy(workflow)),
            mock.patch.object(comfyui, "_upload_image", return_value="uploaded_qwen_input.png"),
            mock.patch.object(comfyui, "_queue_prompt", return_value="prompt_qwen") as mock_queue_prompt,
            mock.patch.object(comfyui, "_wait_for_history", return_value={"outputs": {}}),
            mock.patch.object(comfyui, "_pick_output_file", return_value={"filename": "qwen_clip.mp4"}),
            mock.patch.object(comfyui, "_download_file", return_value=b"qwen_video_bytes"),
        ):
            video_bytes, mime_type = comfyui.run_qwen_i2v_workflow(
                req_id="req_qwen",
                image_bytes=b"fake_png_bytes",
                positive_prompt="product rotates slowly",
                width=720,
                height=1280,
                length=121,
                fps=24,
                filename_prefix="video_pipeline/req_qwen/clip_s01",
            )

        self.assertEqual(video_bytes, b"qwen_video_bytes")
        self.assertEqual(mime_type, "video/mp4")
        sent_workflow = mock_queue_prompt.call_args[0][0]
        self.assertEqual(sent_workflow["97"]["inputs"]["image"], "uploaded_qwen_input.png")
        self.assertEqual(sent_workflow["93"]["inputs"]["text"], "product rotates slowly")
        self.assertEqual(sent_workflow["98"]["inputs"]["width"], 720)
        self.assertEqual(sent_workflow["98"]["inputs"]["height"], 1280)
        self.assertEqual(sent_workflow["98"]["inputs"]["length"], 121)
        self.assertEqual(sent_workflow["94"]["inputs"]["fps"], 24)
        self.assertEqual(sent_workflow["108"]["inputs"]["filename_prefix"], "video_pipeline/req_qwen/clip_s01")

    def test_run_video_upscale_workflow_should_detect_load_and_save_nodes_by_class(self):
        workflow = {
            "10": {"inputs": {"resolution": 1440, "batch_size": 1}, "class_type": "SeedVR2VideoUpscaler"},
            "21": {"inputs": {"file": "", "video-preview": ""}, "class_type": "LoadVideo"},
            "23": {"inputs": {"filename_prefix": "video/ComfyUI", "video": ["24", 0]}, "class_type": "SaveVideo"},
            "24": {"inputs": {"images": ["10", 0]}, "class_type": "CreateVideo"},
        }
        with tempfile.TemporaryDirectory() as temp_dir:
            chunk_path = os.path.join(temp_dir, "chunk_0000.mp4")
            with open(chunk_path, "wb") as f:
                f.write(b"chunk_input")

            with (
                mock.patch.object(comfyui, "_load_workflow", return_value=copy.deepcopy(workflow)),
                mock.patch.object(comfyui, "_materialize_video_input", return_value=os.path.join(temp_dir, "source.mp4")),
                mock.patch.object(comfyui, "_split_video_segments", return_value=[chunk_path]),
                mock.patch.object(comfyui, "_upload_file", return_value="uploaded_chunk.mp4"),
                mock.patch.object(comfyui, "_queue_prompt", return_value="prompt_upscale") as mock_queue_prompt,
                mock.patch.object(comfyui, "_wait_for_history", return_value={"outputs": {}}),
                mock.patch.object(comfyui, "_pick_output_file", return_value={"filename": "upscaled.mp4"}),
                mock.patch.object(comfyui, "_download_file", return_value=b"upscaled_bytes"),
                mock.patch.object(comfyui, "_concat_video_segments", side_effect=lambda paths, *_: paths[0]),
            ):
                video_bytes, mime_type = comfyui.run_video_upscale_workflow(
                    req_id="req_upscale",
                    video_input="https://example.com/source.mp4",
                    segment_seconds=3,
                    output_resolution=2160,
                    workflow_batch_size=16,
                )

        self.assertEqual(video_bytes, b"upscaled_bytes")
        self.assertEqual(mime_type, "video/mp4")
        sent_workflow = mock_queue_prompt.call_args[0][0]
        self.assertEqual(sent_workflow["10"]["inputs"]["resolution"], 2160)
        self.assertEqual(sent_workflow["10"]["inputs"]["batch_size"], 16)
        self.assertEqual(sent_workflow["21"]["inputs"]["file"], "uploaded_chunk.mp4")
        self.assertEqual(sent_workflow["23"]["inputs"]["filename_prefix"], "video/upscale-req_upscale-0000")


if __name__ == "__main__":
    unittest.main()
