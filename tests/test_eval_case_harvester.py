import json
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


from bananaflow.api.routes import (  # noqa: E402
    QualityHarvestEvalCaseRequest,
    harvest_eval_case_api,
)
from bananaflow.quality.harvester import (  # noqa: E402
    MAX_CASE_BYTES,
    harvest_eval_case,
    query_candidates,
)
from bananaflow.sessions.service import append_event, create_or_get_session  # noqa: E402


class EvalCaseHarvesterTests(unittest.TestCase):
    def _make_request(self, path: str = "/", tenant_id: str = "tenant_a", method: str = "POST") -> Request:
        scope = {
            "type": "http",
            "method": method,
            "path": path,
            "headers": [(b"x-tenant-id", tenant_id.encode("utf-8"))],
        }
        return Request(scope)

    def _with_db(self):
        tmpdir = tempfile.TemporaryDirectory()
        sessions_db_path = os.path.join(tmpdir.name, "sessions.db")
        eval_cases_path = os.path.join(tmpdir.name, "eval_cases", "harvested.jsonl")
        old_sessions_db = os.environ.get("BANANAFLOW_SESSIONS_DB_PATH")
        old_eval_cases_path = os.environ.get("BANANAFLOW_EVAL_CASES_PATH")
        old_api_flag = os.environ.get("BANANAFLOW_ENABLE_EVAL_HARVEST_API")
        os.environ["BANANAFLOW_SESSIONS_DB_PATH"] = sessions_db_path
        os.environ["BANANAFLOW_EVAL_CASES_PATH"] = eval_cases_path
        return (
            tmpdir,
            {
                "BANANAFLOW_SESSIONS_DB_PATH": old_sessions_db,
                "BANANAFLOW_EVAL_CASES_PATH": old_eval_cases_path,
                "BANANAFLOW_ENABLE_EVAL_HARVEST_API": old_api_flag,
            },
            sessions_db_path,
            eval_cases_path,
        )

    def _restore_env(self, old_env: dict) -> None:
        for key, value in old_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value

    def _seed_session(self, *, session_id: str, tenant_id: str = "tenant_a", user_id: str = "user_1", with_trajectory: bool = True):
        create_or_get_session(tenant_id, user_id, session_id)
        append_event(
            tenant_id,
            user_id,
            session_id,
            "INTENT_ROUTING",
            {
                "intent": "SCRIPT",
                "product": "洗面奶",
                "reason": "router",
                "request_path": "/api/agent/idea_script",
            },
        )
        append_event(
            tenant_id,
            user_id,
            session_id,
            "USER_MESSAGE",
            {"text": "帮我生成脚本", "product": "洗面奶"},
        )
        append_event(
            tenant_id,
            user_id,
            session_id,
            "QUALITY_METRICS",
            {
                "session_id": session_id,
                "tenant_id": tenant_id,
                "user_id": user_id,
                "prompt_version": "prompt_v2",
                "policy_version": "policy_v3",
                "config_hash": "cfg_hash",
                "effectiveness": {
                    "task_success": False,
                    "exportable_plan_rate": 0.0,
                    "missing_primary_asset_count": 2,
                    "storyboard_pass": False,
                },
                "efficiency": {
                    "total_llm_calls": 6,
                    "total_tool_calls": 2,
                    "mcp_calls_count": 1,
                    "latency_ms": 1200,
                },
                "robustness": {
                    "inference_retry_count": 1,
                    "generation_retry_count": 1,
                    "storyboard_retry_count": 1,
                    "budget_exhausted": True,
                    "mcp_tool_error_count": 1,
                    "clarification_rate": None,
                },
                "safety": {
                    "compliance_risk": "high",
                    "rewrite_applied": True,
                    "compliance_warning": True,
                },
            },
        )
        if with_trajectory:
            append_event(
                tenant_id,
                user_id,
                session_id,
                "TRAJECTORY_EVAL",
                {
                    "session_id": session_id,
                    "tenant_id": tenant_id,
                    "user_id": user_id,
                    "metadata": {"task_type": "SCRIPT", "prompt_version": "prompt_v2"},
                    "evaluation_score": 0.42,
                    "stages": [
                        {
                            "stage_name": "asset_match",
                            "tool_name": "asset_match",
                            "success": False,
                            "duration": 2.5,
                            "reason": "low recall",
                            "error_message": "asset_match_mcp_failed",
                            "stage_score": 0.35,
                            "result": {"shot_match_rate": 0.15},
                        }
                    ],
                },
            )
        append_event(
            tenant_id,
            user_id,
            session_id,
            "ARTIFACT_CREATED",
            {"edit_plan_ids": ["plan_1"], "bundle_dir": "/tmp/bundle_1"},
        )

    def test_query_candidates_should_find_low_quality_session(self):
        tmpdir, old_env, db_path, _ = self._with_db()
        try:
            self._seed_session(session_id="s_quality_1")
            candidates = query_candidates(
                db_path,
                {
                    "since_hours": 24,
                    "min_trajectory_score": 0.8,
                    "only_failed": False,
                    "limit": 20,
                },
            )
            self.assertIn("s_quality_1", candidates)
        finally:
            self._restore_env(old_env)
            tmpdir.cleanup()

    def test_harvest_should_write_compact_jsonl_with_required_fields(self):
        tmpdir, old_env, _, output_path = self._with_db()
        try:
            self._seed_session(session_id="s_quality_2")
            result = harvest_eval_case(
                session_id="s_quality_2",
                tenant_id="tenant_a",
                user_id="user_1",
                out_dir=output_path,
                reason="low_quality_auto",
                include_trajectory=True,
                provenance={"min_trajectory_score": 0.8},
            )
            self.assertTrue(result.written)
            self.assertTrue(os.path.exists(result.output_path))
            with open(result.output_path, "r", encoding="utf-8") as f:
                lines = [line.strip() for line in f if line.strip()]
            self.assertEqual(len(lines), 1)
            raw = lines[0].encode("utf-8")
            self.assertLessEqual(len(raw), MAX_CASE_BYTES)
            case = json.loads(lines[0])
            self.assertTrue(str(case.get("case_id") or "").strip())
            self.assertEqual(case.get("session_id"), "s_quality_2")
            self.assertIn("request", case)
            self.assertIn("context", case)
            self.assertIn("outputs_summary", case)
            self.assertIn("quality_metrics", case)
            self.assertIn("labels", case)
            self.assertIn("provenance", case)
            self.assertIn("harvest_reason", case.get("labels", {}))
        finally:
            self._restore_env(old_env)
            tmpdir.cleanup()

    def test_harvest_should_dedup_by_session_and_latest_event(self):
        tmpdir, old_env, _, output_path = self._with_db()
        try:
            self._seed_session(session_id="s_quality_3")
            first = harvest_eval_case(
                session_id="s_quality_3",
                tenant_id="tenant_a",
                user_id="user_1",
                out_dir=output_path,
                reason="auto_1",
                include_trajectory=True,
                provenance={"min_trajectory_score": 0.8},
            )
            second = harvest_eval_case(
                session_id="s_quality_3",
                tenant_id="tenant_a",
                user_id="user_1",
                out_dir=output_path,
                reason="auto_2",
                include_trajectory=True,
                provenance={"min_trajectory_score": 0.8},
            )
            self.assertTrue(first.written)
            self.assertFalse(second.written)
            self.assertEqual(first.case_id, second.case_id)
            with open(output_path, "r", encoding="utf-8") as f:
                lines = [line.strip() for line in f if line.strip()]
            self.assertEqual(len(lines), 1)
        finally:
            self._restore_env(old_env)
            tmpdir.cleanup()

    def test_harvest_should_work_without_trajectory_for_older_runs(self):
        tmpdir, old_env, _, output_path = self._with_db()
        try:
            self._seed_session(session_id="s_quality_4", with_trajectory=False)
            result = harvest_eval_case(
                session_id="s_quality_4",
                tenant_id="tenant_a",
                user_id="user_1",
                out_dir=output_path,
                reason="legacy_quality_only",
                include_trajectory=True,
                provenance={"min_trajectory_score": 0.8},
            )
            self.assertTrue(result.written)
            with open(output_path, "r", encoding="utf-8") as f:
                case = json.loads(next(line for line in f if line.strip()))
            self.assertIsNone(case.get("trajectory"))
            self.assertIn("quality_metrics", case)
        finally:
            self._restore_env(old_env)
            tmpdir.cleanup()

    def test_harvest_api_should_enforce_self_scope_when_enabled(self):
        tmpdir, old_env, _, _ = self._with_db()
        try:
            os.environ["BANANAFLOW_ENABLE_EVAL_HARVEST_API"] = "1"
            self._seed_session(session_id="s_quality_5", tenant_id="tenant_a", user_id="user_1", with_trajectory=True)
            req = QualityHarvestEvalCaseRequest(session_id="s_quality_5", reason="api_test", include_trajectory=True)
            ok_out = harvest_eval_case_api(
                req=req,
                request=self._make_request(path="/api/quality/harvest_eval_case", tenant_id="tenant_a", method="POST"),
                current_user={"id": "user_1", "email_domain": "tenant_a"},
            )
            self.assertTrue(str(ok_out.get("case_id") or "").strip())
            self.assertTrue(str(ok_out.get("output_path") or "").strip())

            with self.assertRaises(HTTPException) as denied_ctx:
                harvest_eval_case_api(
                    req=req,
                    request=self._make_request(path="/api/quality/harvest_eval_case", tenant_id="tenant_a", method="POST"),
                    current_user={"id": "user_2", "email_domain": "tenant_a"},
                )
            self.assertEqual(int(denied_ctx.exception.status_code), 403)
        finally:
            self._restore_env(old_env)
            tmpdir.cleanup()


if __name__ == "__main__":
    unittest.main()
