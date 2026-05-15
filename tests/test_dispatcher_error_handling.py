"""
Tests for T1.2: tool execution errors → structured response, not HTTP 500.
"""
import os
import sys
import unittest
from unittest import mock

ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
BANANAFLOW_DIR = os.path.join(ROOT_DIR, "bananaflow")
if BANANAFLOW_DIR not in sys.path:
    sys.path.insert(0, BANANAFLOW_DIR)

from starlette.testclient import TestClient
from starlette.requests import Request


def _make_request():
    scope = {"type": "http", "method": "POST", "path": "/api/agent/message",
             "headers": [], "query_string": b""}
    req = Request(scope)
    req.state.req_id = "test-req-t12"
    return req


class TestDispatcherErrorHandling(unittest.TestCase):

    def test_tool_exception_returns_structured_error(self):
        """Any exception from _TOOL_EXECUTOR.execute → ok=False response, no re-raise."""
        from bananaflow.agent_v2.gateway.dispatcher import dispatch_agent_message
        from bananaflow.agent_v2.gateway.schemas import AgentMessageRequest, CoordinatorDecision

        req = AgentMessageRequest(message="测试请求")
        decision = CoordinatorDecision(
            action="tool_call",
            tool_name="agent_prompt_polish",
            tool_args={"prompt": "测试"},
            confidence=0.9,
        )
        request = _make_request()
        trace_sink: list = []

        with mock.patch(
            "bananaflow.agent_v2.gateway.dispatcher._TOOL_EXECUTOR"
        ) as mock_executor:
            mock_executor.registry.has.return_value = True
            mock_executor.execute.side_effect = RuntimeError("LLM timeout")

            result = dispatch_agent_message(
                req, decision, request=request, trace_sink=trace_sink
            )

        self.assertFalse(result.get("ok", True))
        self.assertIn("tool_call", result.get("action", ""))
        self.assertIn("操作失败", result.get("response_text", ""))
        self.assertIn("LLM timeout", result.get("response_text", ""))
        # Trace should record the error
        error_events = [e for e in trace_sink if e.get("type") == "TOOL_ERROR"]
        self.assertTrue(len(error_events) >= 1)

    def test_canvas_plan_exception_returns_structured_error(self):
        """canvas_plan action: run_canvas_planner exception → structured response."""
        from bananaflow.agent_v2.gateway.dispatcher import dispatch_agent_message
        from bananaflow.agent_v2.gateway.schemas import AgentMessageRequest, CoordinatorDecision

        req = AgentMessageRequest(message="帮我规划画布")
        decision = CoordinatorDecision(action="canvas_plan", confidence=0.8)
        request = _make_request()
        trace_sink: list = []

        with mock.patch(
            "bananaflow.agent_v2.gateway.dispatcher.run_canvas_planner"
        ) as mock_planner:
            mock_planner.side_effect = ValueError("planner internal error")

            result = dispatch_agent_message(
                req, decision, request=request, trace_sink=trace_sink
            )

        self.assertFalse(result.get("ok", True))
        self.assertIn("canvas_plan", result.get("action", ""))
        self.assertIn("planner internal error", result.get("response_text", ""))

    def test_successful_tool_call_not_affected(self):
        """Normal successful tool call returns ok result."""
        from bananaflow.agent_v2.gateway.dispatcher import dispatch_agent_message
        from bananaflow.agent_v2.gateway.schemas import AgentMessageRequest, CoordinatorDecision

        req = AgentMessageRequest(message="polish this prompt")
        decision = CoordinatorDecision(
            action="tool_call",
            tool_name="agent_prompt_polish",
            tool_args={"prompt": "raw prompt"},
            confidence=0.9,
        )
        request = _make_request()
        trace_sink: list = []

        with mock.patch(
            "bananaflow.agent_v2.gateway.dispatcher._TOOL_EXECUTOR"
        ) as mock_executor:
            mock_executor.registry.has.return_value = True
            mock_executor.execute.return_value = {"text": "polished prompt", "original": "raw prompt"}

            result = dispatch_agent_message(
                req, decision, request=request, trace_sink=trace_sink
            )

        self.assertEqual(result.get("action"), "tool_call")
        self.assertNotIn("ok", result)  # success path does not add ok=False


if __name__ == "__main__":
    unittest.main()
