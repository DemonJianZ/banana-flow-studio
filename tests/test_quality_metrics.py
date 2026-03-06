import os
import sys
import tempfile
import unittest


ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)


from bananaflow.agent.idea_script.schemas import (  # noqa: E402
    AudienceInferenceResult,
    EditPlan,
    IdeaScriptResponse,
    TopicItem,
)
from bananaflow.quality.metrics_schema import (  # noqa: E402
    append_quality_metrics_event,
    build_quality_metrics,
)
from bananaflow.sessions.service import create_or_get_session, get_session  # noqa: E402


class QualityMetricsTests(unittest.TestCase):
    def _build_response(self) -> IdeaScriptResponse:
        audience = AudienceInferenceResult(
            product="洗面奶",
            persona="通勤白领",
            pain_points=["不知道怎么选"],
            scenes=["地铁通勤"],
            why_this_persona="测试",
            confidence=0.83,
            unsafe_claim_risk="low",
        )
        topic = TopicItem(
            angle="persona",
            title="A",
            hook="先看适不适合",
            script_60s="先看场景，再做判断。",
            visual_keywords=["通勤"],
            shots=[],
        )
        plan_ok = EditPlan(
            plan_id="plan_ok",
            product="洗面奶",
            topic_index=0,
            angle="persona",
            title="A",
            tracks=[],
            total_duration_sec=60.0,
            missing_primary_asset_count=0,
            prompt_version="v1",
            policy_version="p1",
            config_hash="cfg",
            generated_at="2026-02-28T00:00:00Z",
        )
        plan_warn = EditPlan(
            plan_id="plan_warn",
            product="洗面奶",
            topic_index=0,
            angle="persona",
            title="A2",
            tracks=[],
            total_duration_sec=60.0,
            missing_primary_asset_count=2,
            prompt_version="v1",
            policy_version="p1",
            config_hash="cfg",
            generated_at="2026-02-28T00:00:00Z",
        )
        return IdeaScriptResponse(
            audience_context=audience,
            topics=[topic],
            generation_warning=False,
            storyboard_warning=False,
            retry_count=1,
            generation_retry_count=2,
            storyboard_retry_count=1,
            risk_level="high",
            compliance_warning=True,
            safe_rewrite_applied=True,
            asset_match_warning=True,
            asset_match_warning_reason="asset_match_mcp_failed",
            edit_plans=[plan_ok, plan_warn],
            prompt_version="prompt_v2",
            policy_version="policy_v3",
            config_hash="abcdef123456",
            budget_exhausted=False,
            total_llm_calls=7,
        )

    def test_build_quality_metrics_should_populate_all_pillars(self):
        out = self._build_response()
        metrics = build_quality_metrics(
            response=out,
            session_id="session_qm_1",
            tenant_id="tenant_a",
            user_id="user_1",
            total_tool_calls=3,
            mcp_calls_count=1,
            latency_ms=321,
            clarification_rate=0.25,
            asset_match_use_mcp=True,
        )

        self.assertEqual(metrics.session_id, "session_qm_1")
        self.assertEqual(metrics.tenant_id, "tenant_a")
        self.assertEqual(metrics.user_id, "user_1")
        self.assertEqual(metrics.prompt_version, "prompt_v2")
        self.assertEqual(metrics.policy_version, "policy_v3")
        self.assertEqual(metrics.config_hash, "abcdef123456")

        self.assertTrue(metrics.effectiveness.task_success)
        self.assertEqual(metrics.effectiveness.missing_primary_asset_count, 2)
        self.assertAlmostEqual(metrics.effectiveness.exportable_plan_rate, 0.5, places=3)
        self.assertTrue(metrics.effectiveness.storyboard_pass)

        self.assertEqual(metrics.efficiency.total_llm_calls, 7)
        self.assertEqual(metrics.efficiency.total_tool_calls, 3)
        self.assertEqual(metrics.efficiency.mcp_calls_count, 1)
        self.assertEqual(metrics.efficiency.latency_ms, 321)

        self.assertEqual(metrics.robustness.inference_retry_count, 1)
        self.assertEqual(metrics.robustness.generation_retry_count, 2)
        self.assertEqual(metrics.robustness.storyboard_retry_count, 1)
        self.assertFalse(metrics.robustness.budget_exhausted)
        self.assertEqual(metrics.robustness.mcp_tool_error_count, 1)
        self.assertAlmostEqual(float(metrics.robustness.clarification_rate or 0), 0.25, places=6)

        self.assertEqual(metrics.safety.compliance_risk, "high")
        self.assertTrue(metrics.safety.rewrite_applied)
        self.assertTrue(metrics.safety.compliance_warning)

    def test_append_quality_metrics_event_should_store_session_event(self):
        out = self._build_response()
        metrics = build_quality_metrics(
            response=out,
            session_id="session_qm_2",
            tenant_id="tenant_a",
            user_id="user_1",
            total_tool_calls=2,
            mcp_calls_count=1,
            latency_ms=99,
            asset_match_use_mcp=True,
        )

        with tempfile.TemporaryDirectory() as tmp_dir:
            db_path = os.path.join(tmp_dir, "sessions_quality.db")
            prev = os.environ.get("BANANAFLOW_SESSIONS_DB_PATH")
            os.environ["BANANAFLOW_SESSIONS_DB_PATH"] = db_path
            try:
                create_or_get_session("tenant_a", "user_1", "session_qm_2")
                event_id = append_quality_metrics_event(
                    tenant_id="tenant_a",
                    user_id="user_1",
                    session_id="session_qm_2",
                    metrics=metrics,
                    idempotency_key="quality:test",
                )
                self.assertGreater(event_id, 0)

                session_data = get_session(
                    tenant_id="tenant_a",
                    user_id="user_1",
                    session_id="session_qm_2",
                    include_events=True,
                    limit_events=50,
                )
                quality_events = [
                    e for e in list(session_data.get("events") or []) if e.get("type") == "QUALITY_METRICS"
                ]
                self.assertEqual(len(quality_events), 1)
                payload = quality_events[0].get("payload") or {}
                self.assertEqual(payload.get("session_id"), "session_qm_2")
                self.assertEqual((payload.get("efficiency") or {}).get("total_llm_calls"), 7)
                self.assertEqual((payload.get("safety") or {}).get("compliance_risk"), "high")
            finally:
                if prev is None:
                    os.environ.pop("BANANAFLOW_SESSIONS_DB_PATH", None)
                else:
                    os.environ["BANANAFLOW_SESSIONS_DB_PATH"] = prev


if __name__ == "__main__":
    unittest.main()
