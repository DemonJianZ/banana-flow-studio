import os
import sqlite3
import sys
import tempfile
import unittest

from starlette.requests import Request


ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
BANANAFLOW_DIR = os.path.join(ROOT_DIR, "bananaflow")
if BANANAFLOW_DIR not in sys.path:
    sys.path.insert(0, BANANAFLOW_DIR)


from bananaflow.api.routes import (  # noqa: E402
    SessionSummarizeRequest,
    get_session_summary_api,
    summarize_session_api,
)
from bananaflow.sessions.service import (  # noqa: E402
    SessionAccessDeniedError,
    append_event,
    create_or_get_session,
    get_session,
    summarize_session,
)
from bananaflow.sessions.summarizer import SUMMARY_VERSION  # noqa: E402
from bananaflow.storage.sessions_migrations import (  # noqa: E402
    SESSIONS_SCHEMA_VERSION_KEY,
    SESSIONS_SCHEMA_VERSION_VALUE,
    ensure_sessions_db,
)


def _make_request(path: str = "/", tenant_id: str = "tenant_a", method: str = "POST") -> Request:
    scope = {
        "type": "http",
        "method": method,
        "path": path,
        "headers": [(b"x-tenant-id", tenant_id.encode("utf-8"))],
    }
    return Request(scope)


class SessionSummaryTests(unittest.TestCase):
    def _with_db(self):
        tmpdir = tempfile.TemporaryDirectory()
        db_path = os.path.join(tmpdir.name, "sessions.db")
        old = os.environ.get("BANANAFLOW_SESSIONS_DB_PATH")
        os.environ["BANANAFLOW_SESSIONS_DB_PATH"] = db_path
        return tmpdir, old, db_path

    def _restore_env(self, old_value: str | None) -> None:
        if old_value is None:
            os.environ.pop("BANANAFLOW_SESSIONS_DB_PATH", None)
        else:
            os.environ["BANANAFLOW_SESSIONS_DB_PATH"] = old_value

    def test_migration_should_add_v2_summary_columns(self):
        tmpdir = tempfile.TemporaryDirectory()
        try:
            db_path = os.path.join(tmpdir.name, "sessions.db")
            conn = sqlite3.connect(db_path)
            try:
                conn.execute(
                    """
                    CREATE TABLE schema_version (
                        key TEXT PRIMARY KEY,
                        value TEXT NOT NULL
                    )
                    """
                )
                conn.execute(
                    """
                    CREATE TABLE sessions (
                        session_id TEXT PRIMARY KEY,
                        tenant_id TEXT NOT NULL,
                        user_id TEXT NOT NULL,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL,
                        ttl_at TEXT,
                        state_json TEXT NOT NULL DEFAULT '{}',
                        summary_text TEXT
                    )
                    """
                )
                conn.execute(
                    """
                    CREATE TABLE session_events (
                        event_id INTEGER PRIMARY KEY AUTOINCREMENT,
                        session_id TEXT NOT NULL,
                        ts TEXT NOT NULL,
                        type TEXT NOT NULL,
                        payload_json TEXT NOT NULL,
                        token_estimate INTEGER,
                        idempotency_key TEXT,
                        hash TEXT NOT NULL
                    )
                    """
                )
                conn.execute(
                    """
                    INSERT INTO schema_version(key, value)
                    VALUES(?, ?)
                    """,
                    (SESSIONS_SCHEMA_VERSION_KEY, "v1"),
                )
                conn.commit()
            finally:
                conn.close()

            ensure_sessions_db(db_path)
            conn2 = sqlite3.connect(db_path)
            try:
                cols = {
                    row[1]
                    for row in conn2.execute("PRAGMA table_info(sessions)").fetchall()
                }
                self.assertIn("summary_updated_at", cols)
                self.assertIn("summary_version", cols)
                self.assertIn("summary_event_id_upto", cols)
                schema_row = conn2.execute(
                    "SELECT value FROM schema_version WHERE key = ?",
                    (SESSIONS_SCHEMA_VERSION_KEY,),
                ).fetchone()
                self.assertIsNotNone(schema_row)
                self.assertEqual(schema_row[0], SESSIONS_SCHEMA_VERSION_VALUE)
            finally:
                conn2.close()
        finally:
            tmpdir.cleanup()

    def test_summarize_session_should_create_summary_from_events(self):
        tmpdir, old_env, _ = self._with_db()
        try:
            create_or_get_session("tenant_a", "user_1", "summary_1")
            append_event(
                "tenant_a",
                "user_1",
                "summary_1",
                "INTENT_ROUTING",
                {
                    "intent": "idea_script.export_ffmpeg",
                    "product": "洁面乳",
                    "reason": "x_agent_intent_header",
                },
            )
            append_event(
                "tenant_a",
                "user_1",
                "summary_1",
                "USER_MESSAGE",
                {"text": "帮我导出洁面乳脚本", "product": "洁面乳"},
            )
            append_event(
                "tenant_a",
                "user_1",
                "summary_1",
                "TOOL_CALL",
                {
                    "tool_name": "export_ffmpeg_render_bundle",
                    "mcp_server": "export_ffmpeg",
                    "tool_version": "1.0.0",
                    "tool_hash": "a" * 64,
                },
            )
            append_event(
                "tenant_a",
                "user_1",
                "summary_1",
                "TOOL_RESULT",
                {
                    "tool_name": "export_ffmpeg_render_bundle",
                    "result_ref": {"bundle_dir": "/tmp/export_a", "clip_count": 3},
                    "isError": False,
                    "warnings": [],
                },
            )
            append_event(
                "tenant_a",
                "user_1",
                "summary_1",
                "ARTIFACT_CREATED",
                {"edit_plan_ids": ["plan_1"], "bundle_dir": "/tmp/export_a"},
            )

            out = summarize_session("tenant_a", "user_1", "summary_1")
            self.assertEqual(out["session_id"], "summary_1")
            self.assertEqual(out["summary_version"], SUMMARY_VERSION)
            self.assertGreater(int(out["summary_event_id_upto"]), 0)
            summary = out["summary_text"]
            self.assertIn("Mission:", summary)
            self.assertIn("洁面乳", summary)
            self.assertIn("bundle_dir=/tmp/export_a", summary)
            self.assertIn("edit_plan=yes", summary)
        finally:
            self._restore_env(old_env)
            tmpdir.cleanup()

    def test_incremental_summary_should_advance_upto_and_keep_previous(self):
        tmpdir, old_env, _ = self._with_db()
        try:
            create_or_get_session("tenant_a", "user_1", "summary_2")
            append_event("tenant_a", "user_1", "summary_2", "USER_MESSAGE", {"text": "第一轮需求", "product": "A"})
            first = summarize_session("tenant_a", "user_1", "summary_2")
            first_upto = int(first["summary_event_id_upto"])

            append_event("tenant_a", "user_1", "summary_2", "USER_MESSAGE", {"text": "第二轮需求", "product": "B"})
            second = summarize_session("tenant_a", "user_1", "summary_2")
            second_upto = int(second["summary_event_id_upto"])
            self.assertGreater(second_upto, first_upto)
            self.assertIn("Latest Update", second["summary_text"])
            self.assertIn("第二轮需求", second["summary_text"])

            third = summarize_session("tenant_a", "user_1", "summary_2")
            self.assertEqual(int(third["summary_event_id_upto"]), second_upto)
            self.assertEqual(third["summary_text"], second["summary_text"])
        finally:
            self._restore_env(old_env)
            tmpdir.cleanup()

    def test_max_chars_cap_should_apply(self):
        tmpdir, old_env, _ = self._with_db()
        try:
            create_or_get_session("tenant_a", "user_1", "summary_3")
            long_text = "超长需求" * 2000
            append_event("tenant_a", "user_1", "summary_3", "USER_MESSAGE", {"text": long_text, "product": "X"})
            out = summarize_session("tenant_a", "user_1", "summary_3", max_chars=320)
            self.assertLessEqual(len(out["summary_text"]), 320)
        finally:
            self._restore_env(old_env)
            tmpdir.cleanup()

    def test_tenant_user_isolation_should_apply_to_summarize(self):
        tmpdir, old_env, _ = self._with_db()
        try:
            create_or_get_session("tenant_a", "user_1", "summary_4")
            append_event("tenant_a", "user_1", "summary_4", "USER_MESSAGE", {"text": "hello"})
            with self.assertRaises(SessionAccessDeniedError):
                summarize_session("tenant_b", "user_1", "summary_4")
        finally:
            self._restore_env(old_env)
            tmpdir.cleanup()

    def test_summary_endpoints_should_work_via_route_functions(self):
        tmpdir, old_env, _ = self._with_db()
        try:
            create_or_get_session("tenant_a", "user_1", "summary_5")
            append_event(
                "tenant_a",
                "user_1",
                "summary_5",
                "USER_MESSAGE",
                {"text": "我要导出一个脚本", "product": "防晒霜"},
            )
            current_user = {"id": "user_1", "email_domain": "tenant_a"}
            post_req = _make_request(path="/api/sessions/summary_5/summarize", tenant_id="tenant_a", method="POST")
            summarize_out = summarize_session_api(
                session_id="summary_5",
                req=SessionSummarizeRequest(max_events=50, max_chars=1200),
                request=post_req,
                current_user=current_user,
            )
            self.assertEqual(summarize_out["session_id"], "summary_5")
            self.assertTrue(str(summarize_out["summary_text"]).strip())

            get_req = _make_request(path="/api/sessions/summary_5/summary", tenant_id="tenant_a", method="GET")
            summary_out = get_session_summary_api(
                session_id="summary_5",
                request=get_req,
                current_user=current_user,
            )
            self.assertEqual(summary_out["session_id"], "summary_5")
            self.assertIn("Mission:", summary_out["summary_text"])
            self.assertEqual(summary_out["summary_version"], SUMMARY_VERSION)
        finally:
            self._restore_env(old_env)
            tmpdir.cleanup()


if __name__ == "__main__":
    unittest.main()
