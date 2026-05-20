# tests/test_agent_v2_gateway.py
import os
import sys
import types
import unittest
from unittest import mock

ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
BANANAFLOW_DIR = os.path.join(ROOT_DIR, "bananaflow")
if BANANAFLOW_DIR not in sys.path:
    sys.path.insert(0, BANANAFLOW_DIR)


def _install_google_stub():
    if "google.genai" in sys.modules:
        return
    google_module = types.ModuleType("google")
    genai_module = types.ModuleType("google.genai")
    genai_module.types = types.SimpleNamespace(
        Part=lambda text="": types.SimpleNamespace(text=text),
        GenerateContentConfig=lambda **kwargs: types.SimpleNamespace(**kwargs),
    )
    google_module.genai = genai_module
    sys.modules["google"] = google_module
    sys.modules["google.genai"] = genai_module


_install_google_stub()


class TestAgentInvokeRoute(unittest.IsolatedAsyncioTestCase):
    async def test_invoke_returns_agent_invoke_response_shape(self):
        """Graph is fully mocked; test that the route plumbing returns the right shape."""
        from agent_v2.graph.schemas import AgentInvokeRequest, AgentInvokeResponse

        mock_response = {
            "ok": True,
            "message": "你好！",
            "patches": [],
            "warnings": [],
            "intent": "answer_only",
            "thread_id": "tid-1",
            "async_task": None,
            "tool_result": None,
            "thought": None,
            "trace": [],
            "error": None,
        }
        mock_state = {"final_response": mock_response, "tool_args": {}}

        mock_graph = mock.AsyncMock()
        mock_graph.ainvoke.return_value = mock_state

        resp = AgentInvokeResponse(**mock_state["final_response"])
        self.assertTrue(resp.ok)
        self.assertEqual(resp.message, "你好！")
        self.assertEqual(resp.intent, "answer_only")
        self.assertIsNone(resp.async_task)

    def test_invoke_request_excludes_recent_messages(self):
        from agent_v2.graph.schemas import AgentInvokeRequest
        req = AgentInvokeRequest(message="你好", thread_id="t1")
        self.assertFalse(hasattr(req, "recent_messages"))

    def test_invoke_response_has_patches_and_warnings(self):
        from agent_v2.graph.schemas import AgentInvokeResponse
        resp = AgentInvokeResponse(
            message="OK",
            patches=[{"op": "add_node", "node": {"id": "n1"}}],
            warnings=["low_confidence"],
            intent="canvas_plan",
            thread_id="t1",
        )
        self.assertEqual(len(resp.patches), 1)
        self.assertEqual(resp.warnings, ["low_confidence"])


class TestAgentContextCompatibility(unittest.TestCase):
    """Verify that assemble_context still works with storyboard summarizer."""
    def test_selected_artifact_summary_storyboard_selection(self):
        from agent_v2.graph.nodes.context import assemble_context
        state = {
            "current_nodes": [],
            "current_connections": [],
            "canvas_id": None,
            "selected_artifact": {
                "kind": "storyboard_selection",
                "fromNodeId": "s1",
                "meta": {
                    "nodeKind": "storyboard_plan",
                    "selectionType": "scene",
                    "selectionId": "scene-2",
                    "selectionLabel": "场景 2",
                    "storyboardTitle": "猫薄荷接头",
                    "payload": {"scene_id": "scene-2"},
                },
            },
            "trace": [],
        }
        result = assemble_context(state)
        summary = result["artifact_summary"]
        self.assertEqual(summary["kind"], "storyboard_selection")
        self.assertEqual(summary["selection_id"], "scene-2")
        self.assertEqual(summary["storyboard_title"], "猫薄荷接头")
        self.assertEqual(summary["payload"], {"scene_id": "scene-2"})


if __name__ == "__main__":
    unittest.main()
