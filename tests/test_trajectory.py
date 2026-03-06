import os
import sys
import unittest


ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)


from bananaflow.quality.trajectory import (  # noqa: E402
    Trajectory,
    evaluate_stage,
    evaluate_trajectory,
    trajectory_span_attributes,
)


class TrajectoryTests(unittest.TestCase):
    def test_evaluate_stage_success_should_score_high(self):
        stage = {
            "stage_name": "tool_execution",
            "tool_name": "asset_match",
            "args": {"shot_count": 8},
            "result": {"matched_shot_count": 7},
            "success": True,
            "reason": "ok",
            "duration": 1.2,
            "error_message": None,
        }
        score = evaluate_stage(stage)
        self.assertGreater(score, 0.8)

    def test_evaluate_stage_failure_should_score_low(self):
        stage = {
            "stage_name": "tool_execution",
            "tool_name": "",
            "args": {},
            "result": {},
            "success": False,
            "reason": "",
            "duration": 25.0,
            "error_message": "timeout",
        }
        score = evaluate_stage(stage)
        self.assertLess(score, 0.4)

    def test_trajectory_add_stage_should_include_required_fields(self):
        traj = Trajectory(
            session_id="s1",
            tenant_id="t1",
            user_id="u1",
            metadata={"task_type": "SCRIPT"},
        )
        first = traj.add_stage(
            stage_name="intent_routing",
            tool_name="router.idea_script",
            args={"intent": "SCRIPT"},
            result={"route": "idea_script.run"},
            success=True,
            reason="entry",
            duration=0.0,
        )
        second = traj.add_stage(
            stage_name="tool_execution",
            tool_name="asset_match",
            args={"shot_count": 3},
            result={"matched_shot_count": 1},
            success=True,
            reason="done",
            duration=0.9,
        )
        payload = traj.to_dict()
        self.assertIn("timestamp", first)
        self.assertIn("stage_score", first)
        self.assertIn("error_message", second)
        self.assertEqual(payload["session_id"], "s1")
        self.assertEqual(len(payload["stages"]), 2)
        self.assertGreaterEqual(float(payload["evaluation_score"]), 0.0)
        self.assertAlmostEqual(float(payload["evaluation_score"]), evaluate_trajectory(payload["stages"]), places=6)

    def test_trajectory_span_attributes_should_include_stage_fields(self):
        traj = Trajectory(session_id="s1", tenant_id="t1", user_id="u1")
        traj.add_stage(
            stage_name="tool_execution",
            tool_name="asset_match",
            args={"a": 1},
            result={"ok": True},
            success=True,
            reason="ok",
            duration=0.5,
        )
        attrs = trajectory_span_attributes(traj, max_stages=2)
        self.assertTrue(attrs.get("trajectory_enabled"))
        self.assertEqual(attrs.get("trajectory_stage_count"), 1)
        self.assertIn("trajectory.stage.0.name", attrs)
        self.assertIn("trajectory.stage.0.duration", attrs)
        self.assertIn("trajectory.stage.0.success", attrs)
        self.assertIn("trajectory.stage.0.args", attrs)


if __name__ == "__main__":
    unittest.main()
