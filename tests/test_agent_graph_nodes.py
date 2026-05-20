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


if __name__ == "__main__":
    unittest.main()
