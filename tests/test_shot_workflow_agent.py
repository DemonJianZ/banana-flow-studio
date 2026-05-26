import os
import sys
import unittest
from unittest import mock

ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
PACKAGE_DIR = os.path.join(ROOT_DIR, "bananaflow")
if PACKAGE_DIR not in sys.path:
    sys.path.insert(0, PACKAGE_DIR)

from bananaflow.agent_v2.shot_workflow import compose_shot_workflow  # noqa: E402
from bananaflow.agent_v2.shot_workflow.extractor import extract_shots_from_text  # noqa: E402
from bananaflow.agent_v2.shot_workflow.script_extractor import extract_script_elements  # noqa: E402
from agent_v2.graph.nodes.execute_shot_workflow import execute_shot_workflow  # noqa: E402


SCREENPLAY = """人物：辰辰、秋水
场景：辰辰庭院
时间：白天

△庭院桃花树下，辰辰指尖微动，用法力控制旁边的秋水。
辰辰：秋水，节奏跟上。
△两人同步跳着魔性的手势舞。
秋水：阿巳！快来管管师父！
"""


class ShotWorkflowAgentTests(unittest.TestCase):

    def test_regex_extractor_keeps_visual_audio_and_dialogue(self):
        shots = extract_shots_from_text(SCREENPLAY, max_shots=4)

        self.assertGreaterEqual(len(shots), 2)
        first = shots[0]
        self.assertTrue(first.get("visual_description"))
        self.assertTrue(first.get("audio_description"))
        self.assertIn("辰辰", first.get("dialogue") or "")
        self.assertEqual(first.get("action"), first.get("visual_description"))
        self.assertNotRegex(first.get("audio_description") or "", r"对白|台词|说话|喊")

    def test_audio_description_does_not_absorb_dialogue_only_lines(self):
        source = """人物：辰辰、秋水
场景：静室
时间：夜晚

△静室里，两人隔桌对视。
辰辰：你终于来了。
秋水：我一直都在。
"""
        shots = extract_shots_from_text(source, max_shots=1)

        self.assertEqual(len(shots), 1)
        self.assertIn("辰辰", shots[0].get("dialogue") or "")
        self.assertNotRegex(shots[0].get("audio_description") or "", r"对白|台词|说话|喊|角色说")

    def test_script_extraction_normalizes_required_shot_fields(self):
        llm_payload = {
            "characters": [{"name": "辰辰", "type": "character", "description": "少年主角"}],
            "scenes": [{"name": "庭院", "atmosphere": "白天，桃花树下"}],
            "shots": [
                {
                    "shot_id": "1.1",
                    "scene_name": "庭院",
                    "duration": 6,
                    "visual_description": "@辰辰站在桃花树下控制秋水同步起舞",
                    "audio_description": "辰辰：秋水，节奏跟上。\n音效：风声、衣料摩擦声和轻快节奏音乐",
                    "dialogue": [{"speaker": "辰辰", "text": "秋水，节奏跟上。"}],
                    "characters": ["辰辰", "秋水"],
                }
            ],
            "summary": "庭院中辰辰和秋水完成魔性手势舞。",
        }
        with mock.patch("bananaflow.agent_v2.shot_workflow.script_extractor._call_llm", return_value=llm_payload):
            result = extract_script_elements(SCREENPLAY)

        shot = result["shots"][0]
        self.assertEqual(shot["visual_description"], "@辰辰站在桃花树下控制秋水同步起舞")
        self.assertEqual(shot["audio_description"], "风声、衣料摩擦声和轻快节奏音乐")
        self.assertEqual(shot["dialogue"], "辰辰：秋水，节奏跟上。")

    def test_compose_shot_workflow_builds_image_generation_patch(self):
        result = compose_shot_workflow({"source_text": SCREENPLAY, "aspect_ratio": "16:9"})

        self.assertEqual(result["kind"], "shot_workflow")
        self.assertGreaterEqual(len(result["shots"]), 2)
        node_ops = [op for op in result["patch"] if op.get("op") == "add_node"]
        node_types = {(op.get("node") or {}).get("type") for op in node_ops}
        self.assertIn("text_input", node_types)
        self.assertIn("processor", node_types)
        self.assertIn("output", node_types)
        self.assertNotIn("storyboard_plan", node_types)
        processors = [(op.get("node") or {}).get("data") or {} for op in node_ops if (op.get("node") or {}).get("type") == "processor"]
        self.assertTrue(processors)
        valid_modes = {"text2img", "multi_image_generate", "local_text2img"}
        self.assertTrue(all(p.get("mode") in valid_modes for p in processors))
        self.assertTrue(all(p.get("prompt") for p in processors))

    def test_compose_shot_workflow_can_force_img2img(self):
        result = compose_shot_workflow({"source_text": SCREENPLAY, "mode_policy": "multi_image_generate"})
        node_ops = [op for op in result["patch"] if op.get("op") == "add_node"]
        processors = [(op.get("node") or {}).get("data") or {} for op in node_ops if (op.get("node") or {}).get("type") == "processor"]
        self.assertTrue(all(p.get("mode") == "multi_image_generate" for p in processors))
        self.assertIn("input", {(op.get("node") or {}).get("type") for op in node_ops})

    def test_execute_shot_workflow_returns_canvas_patches(self):
        out = execute_shot_workflow({
            "tool_args": {"source_text": SCREENPLAY},
            "trace": [],
        })

        self.assertIn("exec_patches", out)
        self.assertGreater(len(out["exec_patches"]), 0)
        self.assertEqual(out["exec_data"]["kind"], "shot_workflow")
        self.assertIn("EXECUTE_SHOT_WORKFLOW", [item.get("type") for item in out["trace"]])


if __name__ == "__main__":
    unittest.main()
