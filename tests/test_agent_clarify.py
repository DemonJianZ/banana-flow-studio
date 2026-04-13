import os
import sys
import unittest


ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)


from bananaflow.agent.clarify import (
    backfill_missing_prompt_from_user_input,
    build_missing_prompt_clarification_for_mode,
    build_missing_prompt_clarification,
    detect_canvas_prompt_gap,
    extract_supplemental_prompt,
)


class AgentClarifyTests(unittest.TestCase):
    def test_returns_clarification_for_text2img_missing_prompt(self):
        out = build_missing_prompt_clarification("text2img requires data.prompt")
        self.assertIsNotNone(out)
        self.assertEqual(out["patch"], [])
        self.assertEqual(out["thought"], "clarify_missing_prompt:text2img")
        self.assertIn("文生图流程", out["summary"])

    def test_returns_clarification_for_multi_image_generate_missing_prompt(self):
        out = build_missing_prompt_clarification("multi_image_generate requires data.prompt")
        self.assertIsNotNone(out)
        self.assertEqual(out["thought"], "clarify_missing_prompt:multi_image_generate")
        self.assertIn("图生图流程", out["summary"])

    def test_builds_clarification_directly_from_mode(self):
        out = build_missing_prompt_clarification_for_mode("text2img")
        self.assertIsNotNone(out)
        self.assertEqual(out["thought"], "clarify_missing_prompt:text2img")

    def test_ignores_other_validation_errors(self):
        out = build_missing_prompt_clarification("patch must be a list")
        self.assertIsNone(out)

    def test_extracts_supplemental_prompt_from_user_input(self):
        prompt = "帮我搭一个文生图流程\n\n补充画面提示词：一瓶极简风洗面奶产品图，白底，棚拍光，高清细节。"
        self.assertEqual(
            extract_supplemental_prompt(prompt),
            "一瓶极简风洗面奶产品图，白底，棚拍光，高清细节。",
        )

    def test_prefers_explicit_supplemental_prompt_field(self):
        prompt = "帮我搭一个文生图流程"
        self.assertEqual(
            extract_supplemental_prompt(prompt, "一瓶极简风洗面奶产品图，白底，棚拍光，高清细节。"),
            "一瓶极简风洗面奶产品图，白底，棚拍光，高清细节。",
        )

    def test_detects_canvas_prompt_gap_for_workflow_only_request(self):
        self.assertEqual(
            detect_canvas_prompt_gap("帮我搭一个文生图接图生视频流程"),
            "text2img",
        )

    def test_does_not_detect_gap_when_scene_description_is_present(self):
        self.assertEqual(
            detect_canvas_prompt_gap("帮我搭一个文生图流程：一瓶极简风洗面奶产品图，白底，棚拍光，高清细节。"),
            "",
        )

    def test_backfills_missing_prompt_when_user_has_clarified(self):
        out = {
            "patch": [
                {
                    "op": "add_node",
                    "node": {
                        "id": "text1",
                        "type": "text_input",
                        "x": 0,
                        "y": 0,
                        "data": {
                            "text": "Edit the input image: 帮我搭一个文生图流程. Keep composition, lighting, camera angle, and background unless explicitly specified.",
                        },
                    },
                },
                {
                    "op": "add_node",
                    "node": {
                        "id": "n1",
                        "type": "processor",
                        "x": 120,
                        "y": 120,
                        "data": {
                            "mode": "text2img",
                            "templates": {"size": "1024x1024", "aspect_ratio": "1:1"},
                        },
                    },
                }
            ],
            "summary": "",
            "thought": "",
        }
        prompt = "帮我搭一个文生图流程\n\n补充画面提示词：一瓶极简风洗面奶产品图，白底，棚拍光，高清细节。"

        patched = backfill_missing_prompt_from_user_input(out, prompt)

        self.assertEqual(
            patched["patch"][0]["node"]["data"]["text"],
            "一瓶极简风洗面奶产品图，白底，棚拍光，高清细节。",
        )
        self.assertEqual(
            patched["patch"][1]["node"]["data"]["prompt"],
            "一瓶极简风洗面奶产品图，白底，棚拍光，高清细节。",
        )

    def test_replaces_edit_style_prompt_for_text_to_image_modes(self):
        out = {
            "patch": [
                {
                    "op": "add_node",
                    "node": {
                        "id": "n1",
                        "type": "processor",
                        "x": 120,
                        "y": 120,
                        "data": {
                            "mode": "local_text2img",
                            "prompt": (
                                "Edit the input image: 帮我搭一个本地文生图流程\n\n"
                                "补充画面提示词：一瓶极简风洗面奶产品图，白底，棚拍光，高清细节。. "
                                "Keep composition, lighting, camera angle, and background unless explicitly specified. "
                                "Do not introduce unrelated objects. Apply only the requested change."
                            ),
                            "templates": {"size": "1024x1024", "aspect_ratio": "1:1"},
                        },
                    },
                }
            ],
            "summary": "",
            "thought": "",
        }
        prompt = "帮我搭一个本地文生图流程\n\n补充画面提示词：一瓶极简风洗面奶产品图，白底，棚拍光，高清细节。"

        patched = backfill_missing_prompt_from_user_input(out, prompt)

        self.assertEqual(
            patched["patch"][0]["node"]["data"]["prompt"],
            "一瓶极简风洗面奶产品图，白底，棚拍光，高清细节。",
        )

    def test_backfills_update_node_text_for_existing_prompt_node(self):
        out = {
            "patch": [
                {
                    "op": "update_node",
                    "id": "text_existing",
                    "data": {
                        "text": "Edit the input image: 帮我搭一个文生图接图生视频流程. Keep composition, lighting, camera angle, and background unless explicitly specified.",
                    },
                },
                {
                    "op": "update_node",
                    "id": "proc_existing",
                    "data": {
                        "mode": "text2img",
                        "prompt": "Edit the input image: 帮我搭一个文生图接图生视频流程. Keep composition, lighting, camera angle, and background unless explicitly specified.",
                    },
                },
            ],
            "summary": "",
            "thought": "",
        }
        prompt = "帮我搭一个文生图接图生视频流程"

        patched = backfill_missing_prompt_from_user_input(
            out,
            prompt,
            supplemental_prompt="一瓶极简风洗面奶产品图，白底，棚拍光，高清细节。",
        )

        self.assertEqual(
            patched["patch"][0]["data"]["text"],
            "一瓶极简风洗面奶产品图，白底，棚拍光，高清细节。",
        )
        self.assertEqual(
            patched["patch"][1]["data"]["prompt"],
            "一瓶极简风洗面奶产品图，白底，棚拍光，高清细节。",
        )

    def test_backfills_update_node_prompt_even_when_mode_is_missing(self):
        out = {
            "patch": [
                {
                    "op": "update_node",
                    "id": "proc_existing",
                    "data": {
                        "prompt": "Edit the input image: 帮我搭一个文生图流程. Keep composition, lighting, camera angle, and background unless explicitly specified.",
                    },
                }
            ],
            "summary": "",
            "thought": "",
        }

        patched = backfill_missing_prompt_from_user_input(
            out,
            "帮我搭一个文生图流程\n\n补充画面提示词：一瓶极简风洗面奶产品图，白底，棚拍光，高清细节。",
        )

        self.assertEqual(
            patched["patch"][0]["data"]["prompt"],
            "一瓶极简风洗面奶产品图，白底，棚拍光，高清细节。",
        )


if __name__ == "__main__":
    unittest.main()
