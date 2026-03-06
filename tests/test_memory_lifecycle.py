import json
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


from bananaflow.api.routes import expire_memory_preferences_api  # noqa: E402
from bananaflow.memory.service import (  # noqa: E402
    expire_preferences,
    get_preference_stats,
    retrieve_preferences,
    set_preference,
)
from bananaflow.storage.memories_migrations import (  # noqa: E402
    MEMORIES_SCHEMA_VERSION_KEY,
    MEMORIES_SCHEMA_VERSION_VALUE,
    ensure_memories_db,
)


class MemoryLifecycleTests(unittest.TestCase):
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
        db_path = os.path.join(tmpdir.name, "memories.db")
        old_path = os.environ.get("BANANAFLOW_MEMORIES_DB_PATH")
        os.environ["BANANAFLOW_MEMORIES_DB_PATH"] = db_path
        return tmpdir, old_path, db_path

    def _restore_env(self, old_path: str | None) -> None:
        if old_path is None:
            os.environ.pop("BANANAFLOW_MEMORIES_DB_PATH", None)
        else:
            os.environ["BANANAFLOW_MEMORIES_DB_PATH"] = old_path

    def test_migration_v2_should_add_lifecycle_columns(self):
        tmpdir = tempfile.TemporaryDirectory()
        try:
            db_path = os.path.join(tmpdir.name, "memories.db")
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
                    CREATE TABLE memories (
                        memory_id TEXT PRIMARY KEY,
                        scope TEXT NOT NULL,
                        tenant_id TEXT NOT NULL,
                        user_id TEXT NOT NULL,
                        topic TEXT NOT NULL,
                        key TEXT NOT NULL,
                        value TEXT NOT NULL,
                        confidence REAL NOT NULL DEFAULT 0.8,
                        provenance_json TEXT NOT NULL,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL,
                        ttl_at TEXT,
                        is_active INTEGER NOT NULL DEFAULT 1
                    )
                    """
                )
                conn.execute(
                    "INSERT INTO schema_version(key, value) VALUES(?, ?)",
                    (MEMORIES_SCHEMA_VERSION_KEY, "v1"),
                )
                conn.commit()
            finally:
                conn.close()

            ensure_memories_db(db_path)
            conn2 = sqlite3.connect(db_path)
            try:
                cols = {row[1] for row in conn2.execute("PRAGMA table_info(memories)").fetchall()}
                self.assertIn("last_confirmed_at", cols)
                self.assertIn("update_count", cols)
                self.assertIn("deactivated_reason", cols)
                self.assertIn("value_history_json", cols)
                ver_row = conn2.execute(
                    "SELECT value FROM schema_version WHERE key = ?",
                    (MEMORIES_SCHEMA_VERSION_KEY,),
                ).fetchone()
                self.assertIsNotNone(ver_row)
                self.assertEqual(ver_row[0], MEMORIES_SCHEMA_VERSION_VALUE)
            finally:
                conn2.close()
        finally:
            tmpdir.cleanup()

    def test_platform_conflict_policy_should_replace_and_confirm_with_history(self):
        tmpdir, old_env, _ = self._with_db()
        try:
            first = set_preference(
                "tenant_a",
                "u1",
                "platform",
                "小红书",
                confidence=0.90,
                provenance={"source": "explicit_user"},
            )
            self.assertEqual(first["update_count"], 1)

            second = set_preference(
                "tenant_a",
                "u1",
                "platform",
                "小红书",
                confidence=0.90,
                provenance={"source": "explicit_user"},
            )
            self.assertEqual(second["value"], "小红书")
            self.assertAlmostEqual(float(second["confidence"]), 0.95, places=3)
            self.assertEqual(second["update_count"], 2)
            self.assertTrue(str(second.get("last_confirmed_at") or "").strip())

            third = set_preference(
                "tenant_a",
                "u1",
                "platform",
                "抖音",
                confidence=0.92,
                provenance={"source": "explicit_user"},
            )
            self.assertEqual(third["value"], "抖音")
            self.assertAlmostEqual(float(third["confidence"]), 0.85, places=3)
            self.assertEqual(third["update_count"], 3)
            history = list(third.get("value_history") or [])
            self.assertGreaterEqual(len(history), 1)
            self.assertEqual(history[-1]["old_value"], "小红书")
            self.assertEqual(history[-1]["new_value"], "抖音")
        finally:
            self._restore_env(old_env)
            tmpdir.cleanup()

    def test_tone_and_camera_style_should_merge_values(self):
        tmpdir, old_env, _ = self._with_db()
        try:
            tone_1 = set_preference(
                "tenant_a",
                "u1",
                "tone",
                "真实生活感",
                confidence=0.80,
                provenance={"source": "explicit_user"},
            )
            tone_2 = set_preference(
                "tenant_a",
                "u1",
                "tone",
                ["真实生活感", "快节奏"],
                confidence=0.82,
                provenance={"source": "explicit_user"},
            )
            tone_values = tone_2["value"] if isinstance(tone_2["value"], list) else [tone_2["value"]]
            self.assertIn("真实生活感", tone_values)
            self.assertIn("快节奏", tone_values)
            self.assertGreater(float(tone_2["confidence"]), float(tone_1["confidence"]))

            cam_1 = set_preference(
                "tenant_a",
                "u1",
                "camera_style",
                "特写多",
                confidence=0.81,
                provenance={"source": "explicit_user"},
            )
            cam_2 = set_preference(
                "tenant_a",
                "u1",
                "camera_style",
                ["特写多", "运镜"],
                confidence=0.81,
                provenance={"source": "explicit_user"},
            )
            cam_values = cam_2["value"] if isinstance(cam_2["value"], list) else [cam_2["value"]]
            self.assertIn("特写多", cam_values)
            self.assertIn("运镜", cam_values)
            self.assertEqual(cam_2["update_count"], cam_1["update_count"] + 1)
        finally:
            self._restore_env(old_env)
            tmpdir.cleanup()

    def test_ttl_expiration_should_deactivate_and_filter_retrieval(self):
        tmpdir, old_env, db_path = self._with_db()
        try:
            set_preference(
                "tenant_a",
                "u1",
                "risk_posture",
                "更保守",
                confidence=0.90,
                provenance={"source": "explicit_user"},
                ttl_days=1,
            )
            conn = sqlite3.connect(db_path)
            try:
                conn.execute(
                    """
                    UPDATE memories
                    SET ttl_at = '2000-01-01T00:00:00+00:00'
                    WHERE tenant_id = 'tenant_a' AND user_id = 'u1' AND key = 'risk_posture'
                    """
                )
                conn.commit()
            finally:
                conn.close()

            retrieved = retrieve_preferences("tenant_a", "u1")
            self.assertEqual(retrieved, [])
            retrieval_meta = dict(getattr(retrieved, "retrieval_meta", {}) or {})
            self.assertEqual(int(retrieval_meta.get("expired_filtered_count") or 0), 1)

            expired = expire_preferences(tenant_id="tenant_a", user_id="u1")
            self.assertEqual(expired, 1)
            stats = get_preference_stats("tenant_a", "u1")
            self.assertEqual(stats["active_count"], 0)
            self.assertGreaterEqual(stats["expired_count"], 1)
            self.assertGreaterEqual(stats["update_count_sum"], 1)

            conn2 = sqlite3.connect(db_path)
            try:
                row = conn2.execute(
                    """
                    SELECT is_active, deactivated_reason
                    FROM memories
                    WHERE tenant_id = 'tenant_a' AND user_id = 'u1' AND key = 'risk_posture'
                    LIMIT 1
                    """
                ).fetchone()
                self.assertIsNotNone(row)
                self.assertEqual(int(row[0]), 0)
                self.assertEqual(str(row[1]), "ttl_expired")
            finally:
                conn2.close()
        finally:
            self._restore_env(old_env)
            tmpdir.cleanup()

    def test_value_history_should_be_capped(self):
        tmpdir, old_env, _ = self._with_db()
        try:
            set_preference(
                "tenant_a",
                "u1",
                "platform",
                "v0",
                confidence=0.90,
                provenance={"source": "explicit_user"},
            )
            for idx in range(1, 20):
                set_preference(
                    "tenant_a",
                    "u1",
                    "platform",
                    f"v{idx}",
                    confidence=0.90,
                    provenance={"source": "explicit_user"},
                )
            final = retrieve_preferences("tenant_a", "u1", keys=["platform"], limit=10, max_chars=5000)[0]
            history = list(final.get("value_history") or [])
            encoded = json.dumps(history, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
            self.assertLessEqual(len(history), 10)
            self.assertLessEqual(len(encoded), 2000)
        finally:
            self._restore_env(old_env)
            tmpdir.cleanup()

    def test_expire_endpoint_should_only_apply_to_current_user(self):
        tmpdir, old_env, db_path = self._with_db()
        try:
            set_preference(
                "tenant_a",
                "u1",
                "platform",
                "小红书",
                confidence=0.90,
                provenance={"source": "explicit_user"},
                ttl_days=1,
            )
            set_preference(
                "tenant_a",
                "u2",
                "platform",
                "抖音",
                confidence=0.90,
                provenance={"source": "explicit_user"},
            )
            conn = sqlite3.connect(db_path)
            try:
                conn.execute(
                    """
                    UPDATE memories
                    SET ttl_at = '2000-01-01T00:00:00+00:00'
                    WHERE tenant_id = 'tenant_a' AND user_id = 'u1' AND key = 'platform'
                    """
                )
                conn.commit()
            finally:
                conn.close()

            out = expire_memory_preferences_api(
                request=self._make_request(path="/api/memory/preferences/expire", tenant_id="tenant_a", method="POST"),
                current_user={"id": "u1", "email_domain": "tenant_a"},
            )
            self.assertEqual(int(out.get("expired_count") or 0), 1)
            self.assertEqual(retrieve_preferences("tenant_a", "u1"), [])
            self.assertEqual(len(retrieve_preferences("tenant_a", "u2")), 1)
        finally:
            self._restore_env(old_env)
            tmpdir.cleanup()


if __name__ == "__main__":
    unittest.main()
