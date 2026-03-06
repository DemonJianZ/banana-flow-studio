import os
import sys
import tempfile
import unittest

from fastapi import HTTPException
from starlette.requests import Request


ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
BANANAFLOW_DIR = os.path.join(ROOT_DIR, "bananaflow")
if BANANAFLOW_DIR not in sys.path:
    sys.path.insert(0, BANANAFLOW_DIR)


import bananaflow.api.routes as routes_mod  # noqa: E402
from bananaflow.api.routes import QualityHarvestEvalCaseRequest, harvest_eval_case_api  # noqa: E402
from bananaflow.sessions.service import append_event, create_or_get_session, get_session  # noqa: E402


def _make_request(
    path: str = "/api/quality/harvest_eval_case",
    tenant_id: str = "tenant_a",
    method: str = "POST",
    req_id: str = "req_hitl_1",
    x_agent_session_id: str = "session_hitl_1",
    x_agent_intent: str = "SCRIPT",
    x_agent_product: str = "洗面奶",
) -> Request:
    scope = {
        "type": "http",
        "method": method,
        "path": path,
        "headers": [
            (b"x-tenant-id", tenant_id.encode("utf-8")),
            (b"x-agent-session-id", x_agent_session_id.encode("utf-8")),
            (b"x-agent-intent", x_agent_intent.encode("utf-8")),
            (b"x-agent-product", x_agent_product.encode("utf-8")),
        ],
        "state": {"req_id": req_id},
    }
    return Request(scope)


class _FakeSpan:
    def __init__(self, name: str):
        self.name = name
        self.attrs = {}

    def set_attribute(self, key, value):
        self.attrs[key] = value


class _FakeSpanCtx:
    def __init__(self, tracer, name: str):
        self.tracer = tracer
        self.span = _FakeSpan(name)

    def __enter__(self):
        self.tracer.spans.append(self.span)
        return self.span

    def __exit__(self, exc_type, exc, tb):
        return False


class _FakeTracer:
    def __init__(self):
        self.spans = []

    def start_as_current_span(self, name: str):
        return _FakeSpanCtx(self, name)


class HitlFeedbackTests(unittest.TestCase):
    def _with_env(self):
        tmpdir = tempfile.TemporaryDirectory()
        sessions_db_path = os.path.join(tmpdir.name, "sessions.db")
        eval_cases_path = os.path.join(tmpdir.name, "eval_cases", "harvested.jsonl")
        old_values = {
            "BANANAFLOW_SESSIONS_DB_PATH": os.environ.get("BANANAFLOW_SESSIONS_DB_PATH"),
            "BANANAFLOW_EVAL_CASES_PATH": os.environ.get("BANANAFLOW_EVAL_CASES_PATH"),
            "BANANAFLOW_ENABLE_EVAL_HARVEST_API": os.environ.get("BANANAFLOW_ENABLE_EVAL_HARVEST_API"),
        }
        os.environ["BANANAFLOW_SESSIONS_DB_PATH"] = sessions_db_path
        os.environ["BANANAFLOW_EVAL_CASES_PATH"] = eval_cases_path
        return tmpdir, old_values

    def _restore_env(self, old_values: dict):
        for key, value in old_values.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value

    def _seed_session(self, session_id: str, tenant_id: str = "tenant_a", user_id: str = "user_1"):
        create_or_get_session(tenant_id, user_id, session_id)
        append_event(
            tenant_id,
            user_id,
            session_id,
            "QUALITY_METRICS",
            {
                "session_id": session_id,
                "tenant_id": tenant_id,
                "user_id": user_id,
                "effectiveness": {
                    "task_success": False,
                    "exportable_plan_rate": 0.0,
                    "missing_primary_asset_count": 2,
                    "storyboard_pass": False,
                },
                "efficiency": {
                    "total_llm_calls": 5,
                    "total_tool_calls": 2,
                    "mcp_calls_count": 1,
                    "latency_ms": 900,
                },
                "robustness": {
                    "inference_retry_count": 1,
                    "generation_retry_count": 1,
                    "storyboard_retry_count": 0,
                    "budget_exhausted": False,
                    "mcp_tool_error_count": 0,
                },
                "safety": {"compliance_risk": "medium", "rewrite_applied": False, "compliance_warning": False},
            },
        )

    def test_frontend_like_flag_request_should_append_hitl_feedback_event(self):
        tmpdir, old_values = self._with_env()
        try:
            os.environ["BANANAFLOW_ENABLE_EVAL_HARVEST_API"] = "1"
            session_id = "session_hitl_1"
            self._seed_session(session_id=session_id)
            req = QualityHarvestEvalCaseRequest(
                session_id=session_id,
                reason="资产匹配回归",
                include_trajectory=True,
            )
            out = harvest_eval_case_api(
                req=req,
                request=_make_request(
                    req_id="req_hitl_flag_1",
                    x_agent_session_id=session_id,
                    x_agent_intent="SCRIPT",
                    x_agent_product="洗面奶",
                ),
                current_user={"id": "user_1", "email_domain": "tenant_a"},
            )
            self.assertTrue(str(out.get("case_id") or "").strip())
            self.assertTrue(str(out.get("output_path") or "").strip())

            session_data = get_session("tenant_a", "user_1", session_id, include_events=True, limit_events=2000)
            hitl_events = [e for e in list(session_data.get("events") or []) if e.get("type") == "HITL_FEEDBACK"]
            self.assertEqual(len(hitl_events), 1)
            payload = dict(hitl_events[0].get("payload") or {})
            self.assertEqual(payload.get("feedback_reason"), "资产匹配回归")
            self.assertEqual(payload.get("x_agent_intent"), "SCRIPT")
            self.assertEqual(payload.get("x_agent_product"), "洗面奶")
            self.assertIn(payload.get("feedback_status"), {"flagged", "harvested"})
        finally:
            self._restore_env(old_values)
            tmpdir.cleanup()

    def test_feedback_api_should_enforce_self_scope(self):
        tmpdir, old_values = self._with_env()
        try:
            os.environ["BANANAFLOW_ENABLE_EVAL_HARVEST_API"] = "1"
            session_id = "session_hitl_scope"
            self._seed_session(session_id=session_id, tenant_id="tenant_a", user_id="user_1")
            req = QualityHarvestEvalCaseRequest(session_id=session_id, reason="生成脚本失败", include_trajectory=True)
            with self.assertRaises(HTTPException) as ctx:
                harvest_eval_case_api(
                    req=req,
                    request=_make_request(req_id="req_hitl_scope"),
                    current_user={"id": "user_2", "email_domain": "tenant_a"},
                )
            self.assertEqual(int(ctx.exception.status_code), 403)
        finally:
            self._restore_env(old_values)
            tmpdir.cleanup()

    def test_feedback_span_should_include_quality_feedback_attrs(self):
        tmpdir, old_values = self._with_env()
        old_tracer = routes_mod._tracer
        fake_tracer = _FakeTracer()
        routes_mod._tracer = fake_tracer
        try:
            os.environ["BANANAFLOW_ENABLE_EVAL_HARVEST_API"] = "1"
            session_id = "session_hitl_span"
            self._seed_session(session_id=session_id)
            req = QualityHarvestEvalCaseRequest(session_id=session_id, reason="flagged", include_trajectory=False)
            harvest_eval_case_api(
                req=req,
                request=_make_request(
                    req_id="req_hitl_span_1",
                    x_agent_session_id=session_id,
                    x_agent_intent="SCRIPT",
                    x_agent_product="洗面奶",
                ),
                current_user={"id": "user_1", "email_domain": "tenant_a"},
            )
            spans = [span for span in fake_tracer.spans if span.name == "quality.feedback"]
            self.assertEqual(len(spans), 1)
            attrs = spans[0].attrs
            self.assertTrue(bool(attrs.get("quality_feedback")))
            self.assertEqual(attrs.get("feedback_reason"), "flagged")
            self.assertEqual(attrs.get("x_agent_session_id"), session_id)
            self.assertEqual(attrs.get("x_agent_intent"), "SCRIPT")
            self.assertEqual(attrs.get("x_agent_product"), "洗面奶")
            self.assertIn(attrs.get("feedback_status"), {"flagged", "harvested"})
        finally:
            routes_mod._tracer = old_tracer
            self._restore_env(old_values)
            tmpdir.cleanup()

    def test_feedback_api_should_be_invisible_when_flag_off(self):
        tmpdir, old_values = self._with_env()
        try:
            os.environ.pop("BANANAFLOW_ENABLE_EVAL_HARVEST_API", None)
            session_id = "session_hitl_flag_off"
            self._seed_session(session_id=session_id)
            req = QualityHarvestEvalCaseRequest(session_id=session_id, reason="flagged", include_trajectory=True)
            with self.assertRaises(HTTPException) as ctx:
                harvest_eval_case_api(
                    req=req,
                    request=_make_request(req_id="req_hitl_flag_off"),
                    current_user={"id": "user_1", "email_domain": "tenant_a"},
                )
            self.assertEqual(int(ctx.exception.status_code), 404)
        finally:
            self._restore_env(old_values)
            tmpdir.cleanup()


if __name__ == "__main__":
    unittest.main()
