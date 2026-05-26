import os
import sys
import unittest


ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
PACKAGE_DIR = os.path.join(ROOT_DIR, "bananaflow")
if PACKAGE_DIR not in sys.path:
    sys.path.insert(0, PACKAGE_DIR)


from bananaflow.agent_v2.graph.nodes.normalize import normalize_request


class AgentV2StoryboardNormalizeTests(unittest.TestCase):
    def test_pasted_screenplay_routes_to_script_extract(self):
        screenplay = """人物：辰辰、秋水
场景：辰辰庭院
时间：白天

△庭院桃花树下，辰辰指尖微动，用法力控制旁边的秋水。
辰辰：秋水，节奏跟上。
△两人同步跳着魔性的手势舞。
秋水：阿巳！快来管管师父！
"""

        out = normalize_request({"message": screenplay, "uploaded_documents": []})

        self.assertEqual(out["intent"], "tool_call")
        self.assertEqual(out["tool_name"], "shot_workflow.extract")
        self.assertEqual(out["intent_reason"], "pasted_screenplay_shot_workflow")
        self.assertIn("辰辰", out["tool_args"]["source_text"])


    def test_force_shot_workflow_design_routes_to_script_extract(self):
        out = normalize_request({
            "message": "把这个剧本拆成每个镜头的文生图工作流",
            "force_action": "shot_workflow_design",
            "current_nodes": [],
        })

        self.assertEqual(out["intent"], "tool_call")
        self.assertEqual(out["tool_name"], "shot_workflow.extract")
        self.assertIn("剧本", out["tool_args"]["source_text"])


    def test_force_shot_workflow_compose_routes_to_shot_workflow(self):
        out = normalize_request({
            "message": "把这个剧本拆成每个镜头的文生图工作流",
            "force_action": "shot_workflow.compose",
            "current_nodes": [],
        })

        self.assertEqual(out["intent"], "tool_call")
        self.assertEqual(out["tool_name"], "shot_workflow.compose")
        self.assertEqual(out["tool_args"]["mode_policy"], "text2img")

    def test_force_storyboard_design_routes_to_storyboard_design(self):
        out = normalize_request({
            "message": "把这个创意拆成 16:9 分镜",
            "force_action": "storyboard_design",
            "canvas_node_hints": {"storyboard_count": 2},
        })

        self.assertEqual(out["intent"], "tool_call")
        self.assertEqual(out["tool_name"], "storyboard.design")
        self.assertEqual(out["tool_args"]["_existing_storyboard_count"], 2)


    def test_agent_invoke_request_accepts_shot_workflow_force_action(self):
        from bananaflow.agent_v2.graph.schemas import AgentInvokeRequest

        req = AgentInvokeRequest(message="剧本", force_action="shot_workflow_design")

        self.assertEqual(req.force_action, "shot_workflow_design")

    def test_agent_invoke_request_accepts_storyboard_design_force_action(self):
        from bananaflow.agent_v2.graph.schemas import AgentInvokeRequest

        req = AgentInvokeRequest(message="剧本", force_action="storyboard_design")

        self.assertEqual(req.force_action, "storyboard_design")


if __name__ == "__main__":
    unittest.main()
