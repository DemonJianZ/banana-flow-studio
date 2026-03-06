import os
import sys
import tempfile
import time
import unittest


ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
BANANAFLOW_DIR = os.path.join(ROOT_DIR, "bananaflow")
if BANANAFLOW_DIR not in sys.path:
    sys.path.insert(0, BANANAFLOW_DIR)


from bananaflow.context.context_builder import build_context_pack, render_context_sections  # noqa: E402
from bananaflow.memory.service import retrieve_preferences, set_preference  # noqa: E402
from bananaflow.sessions.service import append_event, create_or_get_session  # noqa: E402


class MemoryRetrievalTests(unittest.TestCase):
    def _with_dbs(self):
        tmpdir = tempfile.TemporaryDirectory()
        sessions_db_path = os.path.join(tmpdir.name, "sessions.db")
        memories_db_path = os.path.join(tmpdir.name, "memories.db")
        old_env = {
            "BANANAFLOW_SESSIONS_DB_PATH": os.environ.get("BANANAFLOW_SESSIONS_DB_PATH"),
            "BANANAFLOW_MEMORIES_DB_PATH": os.environ.get("BANANAFLOW_MEMORIES_DB_PATH"),
            "BANANAFLOW_USE_USER_PREFERENCES_IN_CONTEXT": os.environ.get("BANANAFLOW_USE_USER_PREFERENCES_IN_CONTEXT"),
            "BANANAFLOW_MAX_PREF_ITEMS": os.environ.get("BANANAFLOW_MAX_PREF_ITEMS"),
            "BANANAFLOW_MAX_PREF_CHARS": os.environ.get("BANANAFLOW_MAX_PREF_CHARS"),
        }
        os.environ["BANANAFLOW_SESSIONS_DB_PATH"] = sessions_db_path
        os.environ["BANANAFLOW_MEMORIES_DB_PATH"] = memories_db_path
        return tmpdir, old_env

    def _restore_env(self, old_env: dict) -> None:
        for key, value in old_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value

    def test_retrieve_preferences_should_support_keys_and_confidence_order(self):
        tmpdir, old_env = self._with_dbs()
        try:
            set_preference("tenant_a", "u1", "platform", "小红书", confidence=0.90, provenance={"source": "explicit_user"})
            time.sleep(0.01)
            set_preference("tenant_a", "u1", "tone", "真实生活感", confidence=0.95, provenance={"source": "explicit_user"})
            time.sleep(0.01)
            set_preference("tenant_a", "u1", "camera_style", "特写多", confidence=0.90, provenance={"source": "explicit_user"})

            all_items = retrieve_preferences("tenant_a", "u1", limit=10)
            self.assertEqual([item["key"] for item in all_items], ["tone", "platform", "camera_style"])

            filtered = retrieve_preferences("tenant_a", "u1", keys=["camera_style", "platform"], limit=10)
            self.assertEqual([item["key"] for item in filtered], ["platform", "camera_style"])
        finally:
            self._restore_env(old_env)
            tmpdir.cleanup()

    def test_retrieve_preferences_should_enforce_tenant_user_isolation(self):
        tmpdir, old_env = self._with_dbs()
        try:
            set_preference("tenant_a", "u1", "risk_posture", "更保守", provenance={"source": "explicit_user"})
            set_preference("tenant_b", "u1", "risk_posture", "更激进", provenance={"source": "explicit_user"})
            set_preference("tenant_a", "u2", "risk_posture", "均衡", provenance={"source": "explicit_user"})

            self.assertEqual(len(retrieve_preferences("tenant_a", "u1")), 1)
            self.assertEqual(retrieve_preferences("tenant_a", "u1")[0]["value"], "更保守")
            self.assertEqual(len(retrieve_preferences("tenant_b", "u1")), 1)
            self.assertEqual(retrieve_preferences("tenant_b", "u1")[0]["value"], "更激进")
            self.assertEqual(len(retrieve_preferences("tenant_a", "u2")), 1)
            self.assertEqual(retrieve_preferences("tenant_a", "u2")[0]["value"], "均衡")
        finally:
            self._restore_env(old_env)
            tmpdir.cleanup()

    def test_retrieve_preferences_should_apply_item_and_char_truncation(self):
        tmpdir, old_env = self._with_dbs()
        try:
            set_preference("tenant_a", "u1", "platform", "小红书" * 20, confidence=0.99, provenance={"source": "explicit_user"})
            set_preference("tenant_a", "u1", "tone", "真实生活感" * 20, confidence=0.98, provenance={"source": "explicit_user"})
            set_preference("tenant_a", "u1", "camera_style", "特写多" * 20, confidence=0.97, provenance={"source": "explicit_user"})

            top2 = retrieve_preferences("tenant_a", "u1", limit=2, max_chars=1000)
            self.assertEqual(len(top2), 2)
            self.assertEqual([item["key"] for item in top2], ["platform", "tone"])

            tiny = retrieve_preferences("tenant_a", "u1", limit=10, max_chars=20)
            self.assertEqual(tiny, [])
        finally:
            self._restore_env(old_env)
            tmpdir.cleanup()

    def test_context_assembly_should_inject_preferences_when_enabled(self):
        tmpdir, old_env = self._with_dbs()
        try:
            os.environ["BANANAFLOW_USE_USER_PREFERENCES_IN_CONTEXT"] = "1"
            os.environ["BANANAFLOW_MAX_PREF_ITEMS"] = "10"
            os.environ["BANANAFLOW_MAX_PREF_CHARS"] = "1200"
            create_or_get_session("tenant_a", "u1", "ctx_mem_retrieval_1")
            append_event("tenant_a", "u1", "ctx_mem_retrieval_1", "USER_MESSAGE", {"text": "帮我写护肤品脚本", "product": "护肤品"})
            set_preference("tenant_a", "u1", "platform", "小红书", confidence=0.94, provenance={"source": "explicit_user"})
            set_preference("tenant_a", "u1", "tone", "真实生活感", confidence=0.91, provenance={"source": "explicit_user"})

            pack = build_context_pack(
                tenant_id="tenant_a",
                user_id="u1",
                session_id="ctx_mem_retrieval_1",
                base_system="idea_script.generate",
                use_user_preferences=True,
            )
            self.assertEqual(len(pack.user_preferences), 2)
            rendered = render_context_sections(pack)
            self.assertIn("USER PREFERENCES:", rendered)
            self.assertIn("platform", rendered)
            self.assertIn("tone", rendered)
        finally:
            self._restore_env(old_env)
            tmpdir.cleanup()

    def test_context_assembly_should_fallback_when_preferences_disabled(self):
        tmpdir, old_env = self._with_dbs()
        try:
            create_or_get_session("tenant_a", "u1", "ctx_mem_retrieval_2")
            append_event("tenant_a", "u1", "ctx_mem_retrieval_2", "USER_MESSAGE", {"text": "hello", "product": "A"})
            set_preference("tenant_a", "u1", "platform", "抖音", confidence=0.9, provenance={"source": "explicit_user"})
            pack = build_context_pack(
                tenant_id="tenant_a",
                user_id="u1",
                session_id="ctx_mem_retrieval_2",
                base_system="idea_script.infer",
                use_user_preferences=False,
            )
            self.assertEqual(pack.user_preferences, [])
            rendered = render_context_sections(pack)
            self.assertNotIn("USER PREFERENCES:", rendered)
        finally:
            self._restore_env(old_env)
            tmpdir.cleanup()


if __name__ == "__main__":
    unittest.main()
