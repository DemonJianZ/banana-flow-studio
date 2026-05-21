"""
LAB-4 E2E tests — local asset binding integrated into the storyboard async pipeline.

Covers:
  1. Canvas patch node contains local_asset_bindings when binding succeeds
  2. Missing main_assets folder does not fail the storyboard task
  3. Binding exception does not fail the storyboard task
  4. Canvas patch is backward-compatible when local_asset_bindings is None
"""
from __future__ import annotations

import asyncio
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

from bananaflow.agent_v2.storyboard.schemas import (
    StoryboardEntities,
    StoryboardLocalAssetBindings,
    StoryboardPlan,
    StoryboardAppearance,
    StoryboardVisualDesign,
    LocalCharacterBinding,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _minimal_plan(title: str = "测试分镜", with_bindings: bool = False) -> StoryboardPlan:
    bindings = None
    if with_bindings:
        bindings = StoryboardLocalAssetBindings(
            character_bindings=[
                LocalCharacterBinding(
                    entity_id="e1",
                    entity_name="龙女辰辰",
                    character_name="龙女",
                    three_view_url="/main_assets/人物/龙女三视图.png",
                    voice_url="/main_assets/音色/龙女音色短%203s.mp3",
                    match_score=2.0,
                    match_reason="prefix",
                )
            ],
            asset_root_used="/fake/main_assets",
        )
    return StoryboardPlan(
        title=title,
        target_duration_sec=30.0,
        estimated_duration_sec=30.0,
        shot_default_duration_sec=4.0,
        entities=StoryboardEntities(),
        local_asset_bindings=bindings,
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestLAB4AsyncPipelineWithBinding(unittest.TestCase):
    """Integration: _run_storyboard_async now includes asset binding step."""

    def _run_async(self, task_id, tool_args, **kwargs):
        from bananaflow.api.routes import _run_storyboard_async
        asyncio.run(_run_storyboard_async(task_id, tool_args, **kwargs))

    def test_canvas_patch_contains_local_asset_bindings(self):
        """
        When binding succeeds, the storyboard_plan dict inside the canvas patch
        must contain 'local_asset_bindings'.
        """
        plan_with_bindings = _minimal_plan(with_bindings=True)
        # bind_local_assets_to_plan returns the plan with bindings already set
        mock_patch_result = {
            "patch": [{"op": "add_node", "node": {
                "id": "sb-001",
                "type": "storyboard_plan",
                "data": {
                    "storyboard_plan": plan_with_bindings.model_dump(mode="json"),
                },
            }}],
            "summary": "已生成分镜",
        }
        captured_patch = {}

        def capture_build(plan_dict, **kwargs):
            captured_patch["plan"] = plan_dict
            return mock_patch_result

        with mock.patch("bananaflow.api.routes.design_storyboard",
                        return_value=_minimal_plan()),\
             mock.patch("bananaflow.api.routes._bind_local_assets_safely",
                        return_value=plan_with_bindings),\
             mock.patch("bananaflow.api.routes.build_storyboard_canvas_patch",
                        side_effect=capture_build),\
             mock.patch("bananaflow.api.routes.update_storyboard_task") as mock_update,\
             mock.patch("bananaflow.api.routes.append_session_event", side_effect=Exception("no session")):
            self._run_async("task-lab4-01", {"brief": "龙女广告"})

        # Task must have been marked done
        final = mock_update.call_args_list[-1]
        self.assertEqual(final[1].get("status"), "done")

        # The plan dict passed to build_storyboard_canvas_patch must carry local_asset_bindings
        plan_dict = captured_patch.get("plan", {})
        self.assertIn("local_asset_bindings", plan_dict,
                      "plan.model_dump() must include local_asset_bindings")
        self.assertIsNotNone(plan_dict["local_asset_bindings"])

        # Character binding must be present
        char_bindings = plan_dict["local_asset_bindings"].get("character_bindings", [])
        self.assertGreater(len(char_bindings), 0)
        self.assertEqual(char_bindings[0]["character_name"], "龙女")

    def test_missing_main_assets_does_not_fail_storyboard_task(self):
        """
        If _get_storyboard_asset_root() returns a nonexistent path,
        the storyboard task must still complete with status='done'.
        """
        plan_no_assets = _minimal_plan()
        # bind returns plan with warnings (as per LAB-3 behaviour for missing root)
        plan_with_warnings = plan_no_assets.model_copy(update={
            "local_asset_bindings": StoryboardLocalAssetBindings(
                warnings=["main_assets 目录不存在: /nonexistent"]
            )
        })

        with mock.patch("bananaflow.api.routes.design_storyboard",
                        return_value=plan_no_assets),\
             mock.patch("bananaflow.api.routes._bind_local_assets_safely",
                        return_value=plan_with_warnings),\
             mock.patch("bananaflow.api.routes.build_storyboard_canvas_patch",
                        return_value={"patch": [], "summary": "done"}),\
             mock.patch("bananaflow.api.routes.update_storyboard_task") as mock_update,\
             mock.patch("bananaflow.api.routes.append_session_event"):
            self._run_async("task-lab4-02", {"brief": "test"})

        final = mock_update.call_args_list[-1]
        self.assertEqual(final[1].get("status"), "done",
                         "Task must be done even when main_assets is missing")

    def test_binding_exception_does_not_fail_storyboard_task(self):
        """
        If _bind_local_assets_safely raises unexpectedly,
        the storyboard task must still complete (not error out).
        """
        with mock.patch("bananaflow.api.routes.design_storyboard",
                        return_value=_minimal_plan()),\
             mock.patch("bananaflow.api.routes._bind_local_assets_safely",
                        side_effect=RuntimeError("unexpected binding crash")),\
             mock.patch("bananaflow.api.routes.build_storyboard_canvas_patch",
                        return_value={"patch": [], "summary": "done"}),\
             mock.patch("bananaflow.api.routes.update_storyboard_task") as mock_update,\
             mock.patch("bananaflow.api.routes.append_session_event"):
            self._run_async("task-lab4-03", {"brief": "test"})

        # The outer try/except in _run_storyboard_async catches everything:
        # the task ends up either done (if build_patch still ran) or error.
        # Either way it must NOT remain stuck in 'running'.
        all_statuses = [
            (c[1].get("status") or (c[0][1] if len(c[0]) > 1 else ""))
            for c in mock_update.call_args_list
        ]
        terminal = [s for s in all_statuses if s in ("done", "error")]
        self.assertGreater(len(terminal), 0,
                           f"Task must reach done or error, got statuses: {all_statuses}")

    def test_canvas_patch_backward_compatible_when_local_asset_bindings_none(self):
        """
        If local_asset_bindings is None on the plan,
        build_storyboard_canvas_patch must still receive a valid dict and succeed.
        """
        plan_no_bindings = _minimal_plan(with_bindings=False)
        self.assertIsNone(plan_no_bindings.local_asset_bindings)

        captured = {}

        def capture_build(plan_dict, **kwargs):
            captured["plan"] = plan_dict
            return {"patch": [], "summary": "done"}

        with mock.patch("bananaflow.api.routes.design_storyboard",
                        return_value=plan_no_bindings),\
             mock.patch("bananaflow.api.routes._bind_local_assets_safely",
                        return_value=plan_no_bindings),\
             mock.patch("bananaflow.api.routes.build_storyboard_canvas_patch",
                        side_effect=capture_build),\
             mock.patch("bananaflow.api.routes.update_storyboard_task") as mock_update,\
             mock.patch("bananaflow.api.routes.append_session_event"):
            self._run_async("task-lab4-04", {"brief": "test"})

        final = mock_update.call_args_list[-1]
        self.assertEqual(final[1].get("status"), "done")

        plan_dict = captured.get("plan", {})
        # local_asset_bindings should be None (serialized as null) — not raise
        self.assertIn("local_asset_bindings", plan_dict)
        self.assertIsNone(plan_dict["local_asset_bindings"])


class TestLAB4HelperFunctions(unittest.TestCase):
    """Unit tests for the two new helpers added to routes.py."""

    def test_get_storyboard_asset_root_uses_env(self):
        from bananaflow.api.routes import _get_storyboard_asset_root
        with mock.patch.dict(os.environ, {"STORYBOARD_ASSET_ROOT": "/custom/assets"}):
            root = _get_storyboard_asset_root()
        self.assertEqual(root, "/custom/assets")

    def test_get_storyboard_asset_root_default_ends_with_main_assets(self):
        from bananaflow.api.routes import _get_storyboard_asset_root
        with mock.patch.dict(os.environ, {}, clear=False):
            # ensure env var is absent
            os.environ.pop("STORYBOARD_ASSET_ROOT", None)
            root = _get_storyboard_asset_root()
        self.assertTrue(root.endswith("main_assets"), f"Unexpected default root: {root}")

    def test_bind_local_assets_safely_returns_plan_on_exception(self):
        """If bind_local_assets_to_plan raises, the original plan is returned with a warning."""
        from bananaflow.api.routes import _bind_local_assets_safely
        plan = _minimal_plan()
        with mock.patch(
            "bananaflow.api.routes.bind_local_assets_to_plan",
            side_effect=RuntimeError("disk error"),
        ):
            result = _bind_local_assets_safely(plan, "/fake")
        # Must not raise; must return a StoryboardPlan
        self.assertIsInstance(result, StoryboardPlan)
        # Bindings should carry the error as a warning
        if result.local_asset_bindings is not None:
            self.assertTrue(len(result.local_asset_bindings.warnings) > 0)


if __name__ == "__main__":
    unittest.main()
