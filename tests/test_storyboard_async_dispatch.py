"""
Tests for T2.2: storyboard tool call returns task_started immediately;
background runner updates task store when complete.
"""
import asyncio
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

from starlette.requests import Request


def _make_request(req_id="test-async"):
    scope = {"type": "http", "method": "POST", "path": "/api/agent/message",
             "headers": [], "query_string": b""}
    req = Request(scope)
    req.state.req_id = req_id
    return req


class TestStoryboardAsyncDispatch(unittest.TestCase):

    def test_dispatch_returns_task_started_immediately(self):
        """Dispatcher returns task_id without blocking on design_storyboard."""
        from bananaflow.agent_v2.gateway.dispatcher import dispatch_agent_message
        from bananaflow.agent_v2.gateway.schemas import AgentMessageRequest, CoordinatorDecision

        req = AgentMessageRequest(message="做一个咖啡广告分镜", thread_id="thread-t22")
        decision = CoordinatorDecision(
            action="tool_call",
            tool_name="agent_storyboard_design",
            tool_args={"brief": "做一个咖啡广告分镜"},
            confidence=0.95,
        )
        request = _make_request()
        trace_sink: list = []

        with mock.patch("bananaflow.agent_v2.gateway.dispatcher.create_storyboard_task") as mock_create:
            mock_create.return_value = "mock-task-id-001"

            result = dispatch_agent_message(
                req, decision, request=request, trace_sink=trace_sink
            )

        # Must return immediately with task info, NOT call _TOOL_EXECUTOR.execute
        self.assertEqual(result.get("action"), "tool_call")
        data = result.get("data", {})
        self.assertTrue(data.get("_async_storyboard"))
        self.assertEqual(data.get("task_id"), "mock-task-id-001")
        self.assertIn("tool_args", data)

        # Trace should record the async start event
        async_events = [e for e in trace_sink if e.get("type") == "STORYBOARD_ASYNC_STARTED"]
        self.assertEqual(len(async_events), 1)

    def test_canvas_node_hints_passed_to_tool_args(self):
        """canvas_node_hints.storyboard_count propagates to _existing_storyboard_count in tool_args."""
        from bananaflow.agent_v2.gateway.dispatcher import dispatch_agent_message
        from bananaflow.agent_v2.gateway.schemas import AgentMessageRequest, CoordinatorDecision

        req = AgentMessageRequest(
            message="再做一个",
            thread_id="thread-t22",
            canvas_node_hints={"storyboard_count": 2},
        )
        decision = CoordinatorDecision(
            action="tool_call",
            tool_name="agent_storyboard_design",
            tool_args={"brief": "再做一个"},
            confidence=0.9,
        )

        with mock.patch("bananaflow.agent_v2.gateway.dispatcher.create_storyboard_task") as mock_create:
            mock_create.return_value = "mock-task-id-002"
            result = dispatch_agent_message(req, decision, request=_make_request(), trace_sink=[])

        tool_args = result["data"]["tool_args"]
        self.assertEqual(tool_args.get("_existing_storyboard_count"), 2)

    def test_run_storyboard_async_updates_task_on_success(self):
        """Background runner sets status=done with patch on success."""
        from bananaflow.api.routes import _run_storyboard_async

        mock_plan = mock.MagicMock()
        mock_plan.model_dump.return_value = {"title": "测试", "scenes": [], "aspect_ratio": "16:9"}
        mock_patch_result = {"patch": [{"op": "add_node"}], "summary": "已生成"}

        with mock.patch("bananaflow.api.routes.design_storyboard", return_value=mock_plan), \
             mock.patch("bananaflow.api.routes.build_storyboard_canvas_patch", return_value=mock_patch_result), \
             mock.patch("bananaflow.api.routes.update_storyboard_task") as mock_update:
            asyncio.run(_run_storyboard_async(
                "task-success",
                {"brief": "test brief"},
                authorization="",
                req_id="r1",
            ))

        calls = [str(c) for c in mock_update.call_args_list]
        # Should have called update with status=running then status=done
        self.assertTrue(any("running" in c for c in calls))
        self.assertTrue(any("done" in c for c in calls))

    def test_run_storyboard_async_updates_task_on_failure(self):
        """Background runner sets status=error on exception."""
        from bananaflow.api.routes import _run_storyboard_async

        with mock.patch("bananaflow.api.routes.design_storyboard", side_effect=RuntimeError("LLM down")), \
             mock.patch("bananaflow.api.routes.update_storyboard_task") as mock_update:
            asyncio.run(_run_storyboard_async(
                "task-fail",
                {"brief": "test"},
                authorization="",
                req_id="r2",
            ))

        final_call_kwargs = mock_update.call_args_list[-1][1]
        self.assertEqual(final_call_kwargs.get("status"), "error")
        self.assertIn("LLM down", str(final_call_kwargs.get("error_msg", "")))


if __name__ == "__main__":
    unittest.main()
