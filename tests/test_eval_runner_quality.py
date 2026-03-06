import os
import sys
import unittest


ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)


from evals.idea_script.eval_runner_quality import build_quality_dashboard  # noqa: E402


class EvalRunnerQualityTests(unittest.TestCase):
    def _row(self, score: float, with_trajectory: bool = True):
        trajectory = None
        if with_trajectory:
            trajectory = {
                "session_id": "s1",
                "tenant_id": "t1",
                "user_id": "u1",
                "metadata": {"task_type": "SCRIPT"},
                "evaluation_score": score,
                "stages": [
                    {
                        "stage_name": "tool_execution",
                        "duration": 0.8,
                        "success": True,
                        "stage_score": score,
                    }
                ],
            }
        return {
            "id": "case_1",
            "quality_metrics": {
                "effectiveness": {
                    "task_success": True,
                    "exportable_plan_rate": 1.0,
                    "missing_primary_asset_count": 0,
                    "storyboard_pass": True,
                },
                "efficiency": {
                    "total_llm_calls": 4,
                    "total_tool_calls": 2,
                    "mcp_calls_count": 1,
                    "latency_ms": 800,
                },
                "robustness": {
                    "inference_retry_count": 0,
                    "generation_retry_count": 1,
                    "storyboard_retry_count": 0,
                    "budget_exhausted": False,
                    "mcp_tool_error_count": 0,
                },
                "safety": {
                    "compliance_risk": "low",
                    "rewrite_applied": False,
                    "compliance_warning": False,
                },
            },
            "trajectory": trajectory,
        }

    def test_dashboard_should_include_trajectory_breakdown(self):
        rows = [self._row(0.9, with_trajectory=True), self._row(0.7, with_trajectory=True)]
        summary = build_quality_dashboard(rows)
        self.assertEqual(summary["total"], 2)
        self.assertEqual(summary["trajectory"]["runs_with_trajectory"], 2)
        self.assertIn("tool_execution", summary["trajectory"]["per_stage"])
        self.assertIn("SCRIPT", summary["trajectory"]["by_task_type"])
        self.assertGreater(float(summary["trajectory"]["score"]["avg"]), 0.0)

    def test_dashboard_should_fallback_when_no_trajectory(self):
        rows = [self._row(0.0, with_trajectory=False)]
        summary = build_quality_dashboard(rows)
        self.assertEqual(summary["total"], 1)
        self.assertEqual(summary["trajectory"]["runs_with_trajectory"], 0)
        self.assertEqual(float(summary["trajectory"]["score"]["avg"]), 0.0)


if __name__ == "__main__":
    unittest.main()
