import os
import sys
import unittest

ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
PACKAGE_DIR = os.path.join(ROOT_DIR, "bananaflow")
if PACKAGE_DIR not in sys.path:
    sys.path.insert(0, PACKAGE_DIR)

from bananaflow.agent_v2.shot_workflow import compose_shot_workflow
from agent_v2.graph.nodes.execute_shot_workflow import execute_shot_workflow


SCREENPLAY = """人物：辰辰、秋水
场景：辰辰庭院
时间：白天

△庭院桃花树下，辰辰指尖微动，用法力控制旁边的秋水。
辰辰：秋水，节奏跟上。
△两人同步跳着魔性的手势舞。
秋水：阿巳！快来管管师父！
"""


class ShotWorkflowAgentTests(unittest.TestCase):
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
