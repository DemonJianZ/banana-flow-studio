# tests/test_agent_graph_nodes.py
import os
import sys
import unittest

ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
BANANAFLOW_DIR = os.path.join(ROOT_DIR, "bananaflow")
if BANANAFLOW_DIR not in sys.path:
    sys.path.insert(0, BANANAFLOW_DIR)


class TestAgentState(unittest.TestCase):
    def test_state_has_required_fields(self):
        from agent_v2.graph.state import AgentState
        import typing
        hints = typing.get_type_hints(AgentState, include_extras=True)
        for field in [
            "message", "thread_id", "intent", "exec_response_text",
            "exec_patches", "conversation_history", "trace", "final_response",
        ]:
            self.assertIn(field, hints, f"AgentState missing field: {field}")

    def test_invoke_response_fields(self):
        from agent_v2.graph.schemas import AgentInvokeResponse
        resp = AgentInvokeResponse(message="hi", intent="answer_only", thread_id="t1")
        self.assertEqual(resp.message, "hi")
        self.assertEqual(resp.patches, [])
        self.assertEqual(resp.warnings, [])
        self.assertIsNone(resp.async_task)
        self.assertIsNone(resp.tool_result)
        self.assertIsNone(resp.thought)

    def test_invoke_request_has_no_recent_messages(self):
        from agent_v2.graph.schemas import AgentInvokeRequest
        import inspect
        sig = inspect.signature(AgentInvokeRequest)
        self.assertNotIn("recent_messages", sig.parameters)


class TestNormalizeRequestNode(unittest.TestCase):
    def _make_state(self, **overrides):
        base = {
            "message": "你好",
            "force_action": None,
            "ui_action": None,
            "uploaded_documents": [],
            "selected_artifact": None,
            "mode": None,
            "thread_id": "t1",
            "canvas_id": None,
            "canvas_node_hints": None,
            "member_authorization": "",
            "current_nodes": [],
            "current_connections": [],
            "supplemental_prompt": None,
            "product": None, "audience": None, "price_band": None,
            "conversion_goal": None, "primary_platform": None,
            "secondary_platform": None, "selected_angle": None,
            "task_mode": None, "episode_count": None, "existing_script": None,
        }
        base.update(overrides)
        return base

    def test_ui_action_prompt_polish_sets_intent(self):
        from agent_v2.graph.nodes.normalize import normalize_request
        state = self._make_state(message="润色提示词", ui_action="prompt_polish", mode="text2img")
        result = normalize_request(state)
        self.assertEqual(result["intent"], "tool_call")
        self.assertEqual(result["tool_name"], "prompt.polish")
        self.assertEqual(result["tool_args"]["mode"], "text2img")

    def test_force_action_canvas_plan_sets_intent(self):
        from agent_v2.graph.nodes.normalize import normalize_request
        state = self._make_state(message="帮我搭画布", force_action="canvas_plan")
        result = normalize_request(state)
        self.assertEqual(result["intent"], "canvas_plan")

    def test_ui_action_canvas_plan_sets_intent(self):
        from agent_v2.graph.nodes.normalize import normalize_request
        state = self._make_state(message="搭建画布", ui_action="canvas_plan")
        result = normalize_request(state)
        self.assertEqual(result["intent"], "canvas_plan")

    def test_selected_storyboard_edit_sets_canvas_plan(self):
        from agent_v2.graph.nodes.normalize import normalize_request
        state = self._make_state(
            message="把这个镜头改得更克制",
            selected_artifact={"kind": "storyboard_selection", "fromNodeId": "s1",
                               "meta": {"selectionType": "shot", "selectionId": "shot-1"}},
        )
        result = normalize_request(state)
        self.assertEqual(result["intent"], "canvas_plan")

    def test_uploaded_storyboard_csv_sets_storyboard_tool(self):
        from agent_v2.graph.nodes.normalize import normalize_request
        state = self._make_state(
            message="请整理",
            uploaded_documents=[{
                "name": "shots.csv",
                "kind": "storyboard_script_table",
                "text_content": "镜号,景别\n1,特写",
            }],
        )
        result = normalize_request(state)
        self.assertEqual(result["intent"], "tool_call")
        self.assertEqual(result["tool_name"], "storyboard.design")

    def test_no_shortcut_clears_intent_for_llm(self):
        from agent_v2.graph.nodes.normalize import normalize_request
        state = self._make_state(message="你好")
        result = normalize_request(state)
        self.assertEqual(result["intent"], "")
        self.assertEqual(result["tool_name"], "")


if __name__ == "__main__":
    unittest.main()
