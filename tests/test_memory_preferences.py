import os
import sqlite3
import sys
import tempfile
import time
import unittest

from starlette.requests import Request


ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
BANANAFLOW_DIR = os.path.join(ROOT_DIR, "bananaflow")
if BANANAFLOW_DIR not in sys.path:
    sys.path.insert(0, BANANAFLOW_DIR)


from bananaflow.context.context_builder import build_context_pack, render_context_sections  # noqa: E402
from bananaflow.api.routes import (  # noqa: E402
    MemoryPreferenceDeactivateRequest,
    MemoryPreferenceSetRequest,
    deactivate_memory_preference_api,
    list_memory_preferences_api,
    set_memory_preference_api,
)
from bananaflow.memory.service import (  # noqa: E402
    deactivate_preference,
    list_preferences,
    retrieve_preferences,
    set_preference,
)
from bananaflow.sessions.service import (  # noqa: E402
    SessionAccessDeniedError,
    append_event,
    create_or_get_session,
)
from bananaflow.storage.memories_migrations import (  # noqa: E402
    MEMORIES_SCHEMA_VERSION_KEY,
    MEMORIES_SCHEMA_VERSION_VALUE,
    ensure_memories_db,
)


class MemoryPreferencesTests(unittest.TestCase):
    def _make_request(self, path: str = "/", tenant_id: str = "tenant_a", method: str = "GET") -> Request:
        scope = {
            "type": "http",
            "method": method,
            "path": path,
            "headers": [(b"x-tenant-id", tenant_id.encode("utf-8"))],
        }
        return Request(scope)

    def _with_dbs(self):
        tmpdir = tempfile.TemporaryDirectory()
        sessions_db_path = os.path.join(tmpdir.name, "sessions.db")
        memories_db_path = os.path.join(tmpdir.name, "memories.db")
        old_sessions = os.environ.get("BANANAFLOW_SESSIONS_DB_PATH")
        old_memories = os.environ.get("BANANAFLOW_MEMORIES_DB_PATH")
        old_pref_flag = os.environ.get("BANANAFLOW_USE_USER_PREFERENCES_IN_CONTEXT")
        old_pref_items = os.environ.get("BANANAFLOW_MAX_PREF_ITEMS")
        old_pref_chars = os.environ.get("BANANAFLOW_MAX_PREF_CHARS")
        os.environ["BANANAFLOW_SESSIONS_DB_PATH"] = sessions_db_path
        os.environ["BANANAFLOW_MEMORIES_DB_PATH"] = memories_db_path
        return (
            tmpdir,
            {
                "BANANAFLOW_SESSIONS_DB_PATH": old_sessions,
                "BANANAFLOW_MEMORIES_DB_PATH": old_memories,
                "BANANAFLOW_USE_USER_PREFERENCES_IN_CONTEXT": old_pref_flag,
                "BANANAFLOW_MAX_PREF_ITEMS": old_pref_items,
                "BANANAFLOW_MAX_PREF_CHARS": old_pref_chars,
            },
            memories_db_path,
        )

    def _restore_env(self, env_old: dict) -> None:
        for key, old_val in env_old.items():
            if old_val is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = old_val

    def test_migrations_should_create_schema_and_unique_constraint(self):
        tmpdir = tempfile.TemporaryDirectory()
        try:
            db_path = os.path.join(tmpdir.name, "memories.db")
            ensure_memories_db(db_path)
            conn = sqlite3.connect(db_path)
            try:
                tables = {
                    row[0]
                    for row in conn.execute(
                        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('schema_version','memories')"
                    ).fetchall()
                }
                self.assertEqual(tables, {"schema_version", "memories"})
                idx_rows = conn.execute(
                    "PRAGMA index_list(memories)"
                ).fetchall()
                idx_map = {row[1]: int(row[2]) for row in idx_rows}
                self.assertIn("idx_memories_user_pref_unique", idx_map)
                self.assertEqual(idx_map["idx_memories_user_pref_unique"], 1)
                ver_row = conn.execute(
                    "SELECT value FROM schema_version WHERE key = ?",
                    (MEMORIES_SCHEMA_VERSION_KEY,),
                ).fetchone()
                self.assertIsNotNone(ver_row)
                self.assertEqual(ver_row[0], MEMORIES_SCHEMA_VERSION_VALUE)
            finally:
                conn.close()
        finally:
            tmpdir.cleanup()

    def test_set_preference_should_upsert_and_update_timestamp(self):
        tmpdir, old_env, _ = self._with_dbs()
        try:
            first = set_preference(
                tenant_id="tenant_a",
                user_id="u1",
                key="platform",
                value="小红书",
                confidence=0.91,
                provenance={"source": "explicit_user"},
            )
            time.sleep(0.01)
            second = set_preference(
                tenant_id="tenant_a",
                user_id="u1",
                key="platform",
                value="抖音",
                confidence=0.95,
                provenance={"source": "explicit_user"},
            )
            self.assertEqual(first["memory_id"], second["memory_id"])
            self.assertEqual(second["value"], "抖音")
            self.assertGreater(second["updated_at"], first["updated_at"])
            prefs = list_preferences("tenant_a", "u1")
            self.assertEqual(len(prefs), 1)
        finally:
            self._restore_env(old_env)
            tmpdir.cleanup()

    def test_list_and_retrieve_should_enforce_isolation(self):
        tmpdir, old_env, _ = self._with_dbs()
        try:
            set_preference("tenant_a", "u1", "tone", "真实生活感", provenance={"source": "explicit_user"})
            set_preference("tenant_b", "u1", "tone", "夸张", provenance={"source": "explicit_user"})

            own = retrieve_preferences("tenant_a", "u1")
            other_tenant = retrieve_preferences("tenant_b", "u1")
            other_user = retrieve_preferences("tenant_a", "u2")
            self.assertEqual(len(own), 1)
            self.assertEqual(own[0]["value"], "真实生活感")
            self.assertEqual(len(other_tenant), 1)
            self.assertEqual(other_tenant[0]["value"], "夸张")
            self.assertEqual(other_user, [])
        finally:
            self._restore_env(old_env)
            tmpdir.cleanup()

    def test_deactivate_should_hide_from_retrieval(self):
        tmpdir, old_env, _ = self._with_dbs()
        try:
            set_preference("tenant_a", "u1", "camera_style", "特写多", provenance={"source": "explicit_user"})
            self.assertEqual(len(retrieve_preferences("tenant_a", "u1")), 1)
            deactivate_preference("tenant_a", "u1", "camera_style")
            self.assertEqual(retrieve_preferences("tenant_a", "u1"), [])
        finally:
            self._restore_env(old_env)
            tmpdir.cleanup()

    def test_context_builder_should_include_user_preferences_and_truncate(self):
        tmpdir, old_env, _ = self._with_dbs()
        try:
            os.environ["BANANAFLOW_USE_USER_PREFERENCES_IN_CONTEXT"] = "1"
            os.environ["BANANAFLOW_MAX_PREF_ITEMS"] = "2"
            os.environ["BANANAFLOW_MAX_PREF_CHARS"] = "180"
            create_or_get_session("tenant_a", "u1", "mem_ctx_1")
            append_event("tenant_a", "u1", "mem_ctx_1", "USER_MESSAGE", {"text": "帮我做洗面奶脚本", "product": "洗面奶"})
            set_preference("tenant_a", "u1", "platform", "小红书", provenance={"source": "explicit_user"})
            set_preference("tenant_a", "u1", "tone", "真实生活感" * 40, provenance={"source": "explicit_user"})
            set_preference("tenant_a", "u1", "camera_style", "特写多", provenance={"source": "explicit_user"})

            pack = build_context_pack(
                tenant_id="tenant_a",
                user_id="u1",
                session_id="mem_ctx_1",
                base_system="idea_script.generate",
                use_user_preferences=True,
                max_pref_items=2,
                max_pref_chars=180,
            )
            self.assertGreaterEqual(len(pack.user_preferences), 1)
            self.assertLessEqual(len(pack.user_preferences), 2)
            trunc = dict(pack.metadata.get("truncation_info") or {})
            self.assertTrue(bool(trunc.get("preferences_truncated")))
            rendered = render_context_sections(pack)
            self.assertIn("USER PREFERENCES:", rendered)
            self.assertIn("confidence=", rendered)
        finally:
            self._restore_env(old_env)
            tmpdir.cleanup()

    def test_context_builder_isolation_should_raise_for_wrong_tenant(self):
        tmpdir, old_env, _ = self._with_dbs()
        try:
            os.environ["BANANAFLOW_USE_USER_PREFERENCES_IN_CONTEXT"] = "1"
            create_or_get_session("tenant_a", "u1", "mem_ctx_2")
            append_event("tenant_a", "u1", "mem_ctx_2", "USER_MESSAGE", {"text": "hello"})
            set_preference("tenant_a", "u1", "risk_posture", "更保守", provenance={"source": "explicit_user"})
            with self.assertRaises(SessionAccessDeniedError):
                build_context_pack(
                    tenant_id="tenant_b",
                    user_id="u1",
                    session_id="mem_ctx_2",
                    base_system="idea_script.infer",
                    use_user_preferences=True,
                )
        finally:
            self._restore_env(old_env)
            tmpdir.cleanup()

    def test_memory_preference_endpoints_should_work(self):
        tmpdir, old_env, _ = self._with_dbs()
        try:
            current_user = {"id": "u1", "email_domain": "tenant_a"}
            post_req = self._make_request(path="/api/memory/preferences/set", tenant_id="tenant_a", method="POST")
            set_out = set_memory_preference_api(
                req=MemoryPreferenceSetRequest(key="platform", value="小红书", confidence=0.93),
                request=post_req,
                current_user=current_user,
            )
            self.assertIn("memory", set_out)
            self.assertEqual(set_out["memory"]["key"], "platform")

            list_req = self._make_request(path="/api/memory/preferences", tenant_id="tenant_a", method="GET")
            list_out = list_memory_preferences_api(request=list_req, current_user=current_user)
            self.assertEqual(len(list_out["preferences"]), 1)
            self.assertEqual(list_out["preferences"][0]["value"], "小红书")

            deactivate_req = self._make_request(path="/api/memory/preferences/deactivate", tenant_id="tenant_a", method="POST")
            deactivate_out = deactivate_memory_preference_api(
                req=MemoryPreferenceDeactivateRequest(key="platform"),
                request=deactivate_req,
                current_user=current_user,
            )
            self.assertTrue(deactivate_out["ok"])
            list_out_after = list_memory_preferences_api(request=list_req, current_user=current_user)
            self.assertEqual(list_out_after["preferences"], [])
        finally:
            self._restore_env(old_env)
            tmpdir.cleanup()


if __name__ == "__main__":
    unittest.main()
