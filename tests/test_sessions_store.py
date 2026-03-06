import os
import sqlite3
import sys
import tempfile
import unittest


ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)


from bananaflow.sessions.service import (  # noqa: E402
    SessionAccessDeniedError,
    append_event,
    create_or_get_session,
    get_session,
    list_sessions,
    update_state,
)
from bananaflow.storage.sessions_migrations import (  # noqa: E402
    SESSIONS_SCHEMA_VERSION_KEY,
    SESSIONS_SCHEMA_VERSION_VALUE,
    ensure_sessions_db,
)


class SessionsStoreTests(unittest.TestCase):
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

    def test_ensure_sessions_db_should_create_schema(self):
        tmpdir = tempfile.TemporaryDirectory()
        try:
            db_path = os.path.join(tmpdir.name, "sessions.db")
            ensure_sessions_db(db_path)
            conn = sqlite3.connect(db_path)
            try:
                cur = conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('schema_version','sessions','session_events')"
                )
                tables = {row[0] for row in cur.fetchall()}
                self.assertEqual(tables, {"schema_version", "sessions", "session_events"})
                idx_cur = conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='index' AND name IN ('idx_events_session_id_event_id','idx_sessions_tenant_user')"
                )
                indexes = {row[0] for row in idx_cur.fetchall()}
                self.assertIn("idx_events_session_id_event_id", indexes)
                self.assertIn("idx_sessions_tenant_user", indexes)
                version_cur = conn.execute("SELECT value FROM schema_version WHERE key = ?", (SESSIONS_SCHEMA_VERSION_KEY,))
                version_row = version_cur.fetchone()
                self.assertIsNotNone(version_row)
                self.assertEqual(version_row[0], SESSIONS_SCHEMA_VERSION_VALUE)
            finally:
                conn.close()
        finally:
            tmpdir.cleanup()

    def test_create_or_get_session_and_list_sessions(self):
        tmpdir, old_env, _ = self._with_db()
        try:
            s1 = create_or_get_session("tenant_a", "user_1", "session_a")
            s2 = create_or_get_session("tenant_a", "user_1", "session_b")
            self.assertEqual(s1["session_id"], "session_a")
            self.assertEqual(s2["session_id"], "session_b")

            append_event("tenant_a", "user_1", "session_a", "USER_MESSAGE", {"text": "hi"})
            sessions = list_sessions("tenant_a", "user_1", limit=10)
            self.assertEqual(len(sessions), 2)
            self.assertEqual(sessions[0]["session_id"], "session_a")
            self.assertEqual(sessions[1]["session_id"], "session_b")
        finally:
            self._restore_env(old_env)
            tmpdir.cleanup()

    def test_append_event_should_keep_event_id_ordering(self):
        tmpdir, old_env, _ = self._with_db()
        try:
            create_or_get_session("tenant_a", "user_1", "session_order")
            append_event("tenant_a", "user_1", "session_order", "INTENT_ROUTING", {"intent": "idea"})
            append_event("tenant_a", "user_1", "session_order", "TOOL_CALL", {"tool_name": "x"})
            append_event("tenant_a", "user_1", "session_order", "TOOL_RESULT", {"isError": False})

            out = get_session("tenant_a", "user_1", "session_order", include_events=True, limit_events=200)
            events = out["events"]
            event_ids = [item["event_id"] for item in events]
            self.assertEqual(event_ids, sorted(event_ids))
            self.assertEqual([item["type"] for item in events], ["INTENT_ROUTING", "TOOL_CALL", "TOOL_RESULT"])
        finally:
            self._restore_env(old_env)
            tmpdir.cleanup()

    def test_idempotency_key_should_prevent_duplicates(self):
        tmpdir, old_env, _ = self._with_db()
        try:
            create_or_get_session("tenant_a", "user_1", "session_idem")
            e1 = append_event(
                "tenant_a",
                "user_1",
                "session_idem",
                "USER_MESSAGE",
                {"text": "same"},
                idempotency_key="msg_001",
            )
            e2 = append_event(
                "tenant_a",
                "user_1",
                "session_idem",
                "USER_MESSAGE",
                {"text": "same"},
                idempotency_key="msg_001",
            )
            self.assertEqual(e1, e2)

            out = get_session("tenant_a", "user_1", "session_idem", include_events=True, limit_events=200)
            self.assertEqual(len(out["events"]), 1)
            self.assertEqual(out["events"][0]["idempotency_key"], "msg_001")
        finally:
            self._restore_env(old_env)
            tmpdir.cleanup()

    def test_tenant_user_isolation_should_deny_cross_access(self):
        tmpdir, old_env, _ = self._with_db()
        try:
            create_or_get_session("tenant_a", "user_1", "session_iso")
            with self.assertRaises(SessionAccessDeniedError):
                get_session("tenant_b", "user_1", "session_iso")
            with self.assertRaises(SessionAccessDeniedError):
                append_event("tenant_a", "user_2", "session_iso", "TOOL_CALL", {"tool_name": "x"})
            with self.assertRaises(SessionAccessDeniedError):
                update_state("tenant_b", "user_1", "session_iso", {"k": "v"})
        finally:
            self._restore_env(old_env)
            tmpdir.cleanup()

    def test_integration_like_agent_flow_event_sequence(self):
        tmpdir, old_env, _ = self._with_db()
        try:
            session = create_or_get_session("tenant_demo", "u100", "session_flow")
            sid = session["session_id"]
            append_event(
                "tenant_demo",
                "u100",
                sid,
                "INTENT_ROUTING",
                {
                    "intent": "idea_script.export_ffmpeg",
                    "product": "洗面奶",
                    "reason": "x_agent_intent_header",
                    "backend_call": "export_ffmpeg_render_bundle",
                    "request_path": "/api/agent/idea_script/export_ffmpeg",
                },
            )
            append_event(
                "tenant_demo",
                "u100",
                sid,
                "TOOL_CALL",
                {
                    "tool_name": "export_ffmpeg_render_bundle",
                    "args_hash": "abc123",
                    "mcp_registry": True,
                    "mcp_server": "export_ffmpeg",
                    "tool_version": "1.0.0",
                    "tool_hash": "b" * 64,
                },
            )
            append_event(
                "tenant_demo",
                "u100",
                sid,
                "TOOL_RESULT",
                {
                    "tool_name": "export_ffmpeg_render_bundle",
                    "result_ref": {"bundle_dir": "/tmp/bundle", "clip_count": 3, "files_count": 4},
                    "isError": False,
                    "warnings": [],
                },
            )
            append_event(
                "tenant_demo",
                "u100",
                sid,
                "ARTIFACT_CREATED",
                {"edit_plan_ids": ["p1"], "bundle_dir": "/tmp/bundle"},
            )

            out = get_session("tenant_demo", "u100", sid, include_events=True, limit_events=50)
            events = out["events"]
            self.assertEqual(
                [evt["type"] for evt in events],
                ["INTENT_ROUTING", "TOOL_CALL", "TOOL_RESULT", "ARTIFACT_CREATED"],
            )
            tool_result = events[2]["payload"]
            self.assertIn("result_ref", tool_result)
            self.assertNotIn("plan", tool_result)
            self.assertEqual(tool_result["result_ref"]["clip_count"], 3)
        finally:
            self._restore_env(old_env)
            tmpdir.cleanup()


if __name__ == "__main__":
    unittest.main()
