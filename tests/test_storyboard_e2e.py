"""
T5.1 — End-to-end integration tests for the storyboard v2 async pipeline.

Covers three user flows:
  1. brief-only  — user sends plain text description, storyboard is generated async
  2. script-table — user provides a script rows table, storyboard references them
  3. re-generate  — a second storyboard request when one node already exists on canvas
                    (existing_storyboard_count=1), node position must not overlap

All LLM / external calls are stubbed; only internal routing, task-store writes,
and canvas-patch structure are exercised against real code.
"""
from __future__ import annotations

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

from bananaflow.agent_v2.storyboard.schemas import (
    StoryboardPlan,
    StoryboardScene,
    StoryboardShot,
    StoryboardEntities,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_http_request(req_id: str = "e2e-req") -> Request:
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/api/agent/message",
        "headers": [],
        "query_string": b"",
    }
    req = Request(scope)
    req.state.req_id = req_id
    return req


def _minimal_plan(title: str = "咖啡广告", scene_count: int = 2) -> StoryboardPlan:
    scenes = [
        StoryboardScene(
            scene_id=f"scene_{i}",
            scene_no=i + 1,
            title=f"场景{i + 1}",
            shots=[
                StoryboardShot(
                    shot_id=f"shot_{i}_1",
                    shot_no=1,
                    duration_sec=4.0,
                    visual_description="镜头描述",
                )
            ],
        )
        for i in range(scene_count)
    ]
    return StoryboardPlan(
        title=title,
        aspect_ratio="16:9",
        style="cinematic",
        target_duration_sec=30.0,
        estimated_duration_sec=30.0,
        shot_default_duration_sec=4.0,
        entities=StoryboardEntities(),
        scenes=scenes,
    )


# ---------------------------------------------------------------------------
# Flow 1 — brief-only
# ---------------------------------------------------------------------------

class TestStoryboardE2EBriefOnly(unittest.TestCase):
    """User submits a brief; system creates task, runs design, writes patch."""

    def test_dispatcher_creates_task_and_returns_task_id(self):
        from bananaflow.agent_v2.gateway.dispatcher import dispatch_agent_message
        from bananaflow.agent_v2.gateway.schemas import AgentMessageRequest, CoordinatorDecision

        req = AgentMessageRequest(
            message="帮我做一个咖啡广告分镜，时长30秒",
            thread_id="e2e-brief-thread",
        )
        decision = CoordinatorDecision(
            action="tool_call",
            tool_name="agent_storyboard_design",
            tool_args={"brief": "帮我做一个咖啡广告分镜，时长30秒", "target_duration_sec": 30},
            confidence=0.95,
        )

        with mock.patch("bananaflow.agent_v2.gateway.dispatcher.create_storyboard_task") as mock_create:
            mock_create.return_value = "e2e-task-brief-001"
            result = dispatch_agent_message(
                req, decision, request=_make_http_request(), trace_sink=[]
            )

        self.assertEqual(result["action"], "tool_call")
        data = result["data"]
        self.assertTrue(data["_async_storyboard"])
        self.assertEqual(data["task_id"], "e2e-task-brief-001")
        self.assertEqual(data["thread_id"], "e2e-brief-thread")
        # tool_args must include the brief
        self.assertIn("brief", data["tool_args"])

    def test_background_runner_writes_done_with_patch(self):
        from bananaflow.api.routes import _run_storyboard_async

        plan = _minimal_plan("咖啡广告")
        patch_result = {
            "patch": [{"op": "add_node", "node": {"id": "sb-001", "type": "storyboard_plan"}}],
            "summary": "已生成1个分镜方案",
        }

        with mock.patch("bananaflow.api.routes.design_storyboard", return_value=plan), \
             mock.patch("bananaflow.api.routes.build_storyboard_canvas_patch", return_value=patch_result), \
             mock.patch("bananaflow.api.routes.update_storyboard_task") as mock_update:
            asyncio.run(_run_storyboard_async(
                "e2e-task-brief-001",
                {"brief": "咖啡广告分镜"},
                authorization="",
                req_id="e2e-req",
            ))

        statuses = [c[1].get("status") or c[0][1] for c in mock_update.call_args_list]
        # First call: running, second call: done
        self.assertIn("running", str(mock_update.call_args_list[0]))
        final = mock_update.call_args_list[-1]
        self.assertEqual(final[1].get("status"), "done")
        self.assertEqual(final[1].get("patch"), patch_result["patch"])
        self.assertEqual(final[1].get("summary"), "已生成1个分镜方案")

    def test_background_runner_persists_session_event_when_thread_id_given(self):
        from bananaflow.api.routes import _run_storyboard_async

        plan = _minimal_plan()
        patch_result = {
            "patch": [{"op": "add_node", "node": {"id": "sb-002", "type": "storyboard_plan"}}],
            "summary": "done",
        }

        with mock.patch("bananaflow.api.routes.design_storyboard", return_value=plan), \
             mock.patch("bananaflow.api.routes.build_storyboard_canvas_patch", return_value=patch_result), \
             mock.patch("bananaflow.api.routes.update_storyboard_task"), \
             mock.patch("bananaflow.api.routes.append_session_event") as mock_session:
            asyncio.run(_run_storyboard_async(
                "e2e-task-sess",
                {"brief": "test"},
                thread_id="thread-persist",
                tenant_id="tenant-x",
                user_id="user-y",
            ))

        mock_session.assert_called_once()
        call_kwargs = mock_session.call_args
        args = call_kwargs[0]
        kwargs = call_kwargs[1]
        # positional: tenant_id, user_id, thread_id
        self.assertEqual(args[0], "tenant-x")
        self.assertEqual(args[1], "user-y")
        self.assertEqual(args[2], "thread-persist")
        self.assertEqual(kwargs.get("type"), "agent_storyboard_completed")
        payload = kwargs.get("payload", {})
        self.assertEqual(payload["task_id"], "e2e-task-sess")
        self.assertIn("patch_count", payload)

    def test_background_runner_no_session_event_without_thread_id(self):
        from bananaflow.api.routes import _run_storyboard_async

        plan = _minimal_plan()
        with mock.patch("bananaflow.api.routes.design_storyboard", return_value=plan), \
             mock.patch("bananaflow.api.routes.build_storyboard_canvas_patch", return_value={"patch": [], "summary": ""}), \
             mock.patch("bananaflow.api.routes.update_storyboard_task"), \
             mock.patch("bananaflow.api.routes.append_session_event") as mock_session:
            asyncio.run(_run_storyboard_async("task-no-thread", {"brief": "test"}))

        mock_session.assert_not_called()


# ---------------------------------------------------------------------------
# Flow 2 — script-table input
# ---------------------------------------------------------------------------

class TestStoryboardE2EScriptTable(unittest.TestCase):
    """User provides a parsed script table; tool_args carry script_rows."""

    def test_script_rows_forwarded_to_design_storyboard(self):
        from bananaflow.api.routes import _run_storyboard_async

        script_rows = [
            {"scene": "1", "shot": "1", "description": "产品特写"},
            {"scene": "1", "shot": "2", "description": "使用者笑脸"},
        ]
        tool_args = {
            "brief": "护肤品广告",
            "script_rows": script_rows,
            "script_table_name": "脚本表",
        }

        plan = _minimal_plan("护肤品广告")
        captured_kwargs: dict = {}

        def capture_design(*args, **kwargs):
            captured_kwargs.update(kwargs)
            return plan

        with mock.patch("bananaflow.api.routes.design_storyboard", side_effect=capture_design), \
             mock.patch("bananaflow.api.routes.build_storyboard_canvas_patch", return_value={"patch": [], "summary": ""}), \
             mock.patch("bananaflow.api.routes.update_storyboard_task"):
            asyncio.run(_run_storyboard_async("task-script", tool_args))

        self.assertEqual(captured_kwargs.get("script_rows"), script_rows)
        self.assertEqual(captured_kwargs.get("script_table_name"), "脚本表")
        self.assertEqual(captured_kwargs.get("brief"), "护肤品广告")

    def test_empty_script_rows_does_not_crash(self):
        from bananaflow.api.routes import _run_storyboard_async

        plan = _minimal_plan()
        with mock.patch("bananaflow.api.routes.design_storyboard", return_value=plan), \
             mock.patch("bananaflow.api.routes.build_storyboard_canvas_patch", return_value={"patch": [], "summary": ""}), \
             mock.patch("bananaflow.api.routes.update_storyboard_task") as mock_update:
            asyncio.run(_run_storyboard_async("task-empty-rows", {"brief": "test", "script_rows": []}))

        # Should complete successfully
        final = mock_update.call_args_list[-1]
        self.assertEqual(final[1].get("status"), "done")


# ---------------------------------------------------------------------------
# Flow 3 — re-generate (existing storyboard count > 0)
# ---------------------------------------------------------------------------

class TestStoryboardE2ERegenerate(unittest.TestCase):
    """Second storyboard request when canvas already has one storyboard node."""

    def test_existing_count_passed_to_canvas_patch(self):
        """_existing_storyboard_count=1 must reach build_storyboard_canvas_patch."""
        from bananaflow.api.routes import _run_storyboard_async

        plan = _minimal_plan()
        captured: dict = {}

        def capture_patch(plan_dict, existing_storyboard_count=0):
            captured["existing_storyboard_count"] = existing_storyboard_count
            return {"patch": [{"op": "add_node", "node": {"id": "sb-regen"}}], "summary": "第二个"}

        with mock.patch("bananaflow.api.routes.design_storyboard", return_value=plan), \
             mock.patch("bananaflow.api.routes.build_storyboard_canvas_patch", side_effect=capture_patch), \
             mock.patch("bananaflow.api.routes.update_storyboard_task"):
            asyncio.run(_run_storyboard_async(
                "task-regen",
                {"brief": "第二个广告", "_existing_storyboard_count": 1},
            ))

        self.assertEqual(captured.get("existing_storyboard_count"), 1)

    def test_dispatcher_propagates_storyboard_count_from_hints(self):
        """canvas_node_hints.storyboard_count=1 flows through dispatcher to tool_args."""
        from bananaflow.agent_v2.gateway.dispatcher import dispatch_agent_message
        from bananaflow.agent_v2.gateway.schemas import AgentMessageRequest, CoordinatorDecision

        req = AgentMessageRequest(
            message="再做一个分镜",
            thread_id="e2e-regen-thread",
            canvas_node_hints={"storyboard_count": 1},
        )
        decision = CoordinatorDecision(
            action="tool_call",
            tool_name="agent_storyboard_design",
            tool_args={"brief": "再做一个分镜"},
            confidence=0.9,
        )

        with mock.patch("bananaflow.agent_v2.gateway.dispatcher.create_storyboard_task") as mock_create:
            mock_create.return_value = "e2e-regen-task"
            result = dispatch_agent_message(
                req, decision, request=_make_http_request(), trace_sink=[]
            )

        self.assertEqual(result["data"]["tool_args"]["_existing_storyboard_count"], 1)

    def test_zero_count_when_no_hints(self):
        """When canvas_node_hints absent, _existing_storyboard_count defaults to 0."""
        from bananaflow.agent_v2.gateway.dispatcher import dispatch_agent_message
        from bananaflow.agent_v2.gateway.schemas import AgentMessageRequest, CoordinatorDecision

        req = AgentMessageRequest(message="做分镜", thread_id="e2e-no-hints")
        decision = CoordinatorDecision(
            action="tool_call",
            tool_name="agent_storyboard_design",
            tool_args={"brief": "做分镜"},
            confidence=0.9,
        )

        with mock.patch("bananaflow.agent_v2.gateway.dispatcher.create_storyboard_task") as mock_create:
            mock_create.return_value = "task-no-hints"
            result = dispatch_agent_message(req, decision, request=_make_http_request(), trace_sink=[])

        self.assertEqual(result["data"]["tool_args"]["_existing_storyboard_count"], 0)


# ---------------------------------------------------------------------------
# Regression: error path
# ---------------------------------------------------------------------------

class TestStoryboardE2EErrorPath(unittest.TestCase):
    def test_llm_exception_sets_status_error_and_does_not_raise(self):
        from bananaflow.api.routes import _run_storyboard_async

        with mock.patch("bananaflow.api.routes.design_storyboard", side_effect=ValueError("model overloaded")), \
             mock.patch("bananaflow.api.routes.update_storyboard_task") as mock_update:
            # Must not raise
            asyncio.run(_run_storyboard_async("task-err", {"brief": "test"}))

        final = mock_update.call_args_list[-1]
        self.assertEqual(final[1].get("status"), "error")
        self.assertIn("model overloaded", final[1].get("error_msg", ""))

    def test_session_event_failure_does_not_propagate(self):
        """append_session_event errors must be swallowed silently."""
        from bananaflow.api.routes import _run_storyboard_async

        plan = _minimal_plan()
        with mock.patch("bananaflow.api.routes.design_storyboard", return_value=plan), \
             mock.patch("bananaflow.api.routes.build_storyboard_canvas_patch", return_value={"patch": [], "summary": ""}), \
             mock.patch("bananaflow.api.routes.update_storyboard_task"), \
             mock.patch("bananaflow.api.routes.append_session_event", side_effect=RuntimeError("DB locked")):
            # Must not raise despite session event failure
            asyncio.run(_run_storyboard_async(
                "task-sess-err",
                {"brief": "test"},
                thread_id="thread-x",
            ))


if __name__ == "__main__":
    unittest.main()
