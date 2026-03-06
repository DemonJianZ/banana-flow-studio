import os
import sys
import tempfile
import unittest


ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)


from bananaflow.context.context_builder import build_context_pack  # noqa: E402
from bananaflow.sessions.service import (  # noqa: E402
    SessionAccessDeniedError,
    append_event,
    create_or_get_session,
    summarize_session,
    update_state,
)


class ContextBuilderTests(unittest.TestCase):
    def _with_db(self):
        tmpdir = tempfile.TemporaryDirectory()
        db_path = os.path.join(tmpdir.name, "sessions.db")
        old = os.environ.get("BANANAFLOW_SESSIONS_DB_PATH")
        os.environ["BANANAFLOW_SESSIONS_DB_PATH"] = db_path
        return tmpdir, old

    def _restore_env(self, old_value: str | None) -> None:
        if old_value is None:
            os.environ.pop("BANANAFLOW_SESSIONS_DB_PATH", None)
        else:
            os.environ["BANANAFLOW_SESSIONS_DB_PATH"] = old_value

    def test_build_pack_should_include_summary_and_recent_turns_in_order(self):
        tmpdir, old_env = self._with_db()
        try:
            create_or_get_session("tenant_a", "user_1", "ctx_1")
            append_event("tenant_a", "user_1", "ctx_1", "USER_MESSAGE", {"text": "first user", "product": "A"})
            append_event("tenant_a", "user_1", "ctx_1", "ASSISTANT_MESSAGE", {"text": "first assistant"})
            append_event("tenant_a", "user_1", "ctx_1", "USER_MESSAGE", {"text": "second user", "product": "B"})
            append_event("tenant_a", "user_1", "ctx_1", "ASSISTANT_MESSAGE", {"text": "second assistant"})
            summarize_session("tenant_a", "user_1", "ctx_1")

            pack = build_context_pack(
                tenant_id="tenant_a",
                user_id="user_1",
                session_id="ctx_1",
                base_system="idea_script.generate",
                max_recent_turns=3,
                max_summary_chars=1200,
                max_turn_chars=1200,
            )
            self.assertTrue(str(pack.session_summary or "").strip())
            self.assertEqual([t["role"] for t in pack.recent_turns], ["assistant", "user", "assistant"])
            self.assertEqual(pack.recent_turns[-1]["content"], "second assistant")
            self.assertEqual(pack.metadata.get("session_id"), "ctx_1")
        finally:
            self._restore_env(old_env)
            tmpdir.cleanup()

    def test_truncation_should_drop_oldest_turns_first(self):
        tmpdir, old_env = self._with_db()
        try:
            create_or_get_session("tenant_a", "user_1", "ctx_2")
            append_event("tenant_a", "user_1", "ctx_2", "USER_MESSAGE", {"text": "A" * 200})
            append_event("tenant_a", "user_1", "ctx_2", "ASSISTANT_MESSAGE", {"text": "B" * 200})
            append_event("tenant_a", "user_1", "ctx_2", "USER_MESSAGE", {"text": "C" * 200})
            append_event("tenant_a", "user_1", "ctx_2", "ASSISTANT_MESSAGE", {"text": "D" * 200})

            pack = build_context_pack(
                tenant_id="tenant_a",
                user_id="user_1",
                session_id="ctx_2",
                base_system="idea_script.infer",
                max_recent_turns=4,
                max_summary_chars=800,
                max_turn_chars=450,
            )
            self.assertLessEqual(sum(len(t["content"]) for t in pack.recent_turns), 450)
            self.assertTrue(pack.metadata["truncation_info"]["truncated"])
            self.assertGreaterEqual(pack.metadata["truncation_info"]["dropped_oldest_turns"], 1)
            contents = [t["content"] for t in pack.recent_turns]
            self.assertNotIn("A" * 200, contents)
        finally:
            self._restore_env(old_env)
            tmpdir.cleanup()

    def test_no_summary_should_be_graceful(self):
        tmpdir, old_env = self._with_db()
        try:
            create_or_get_session("tenant_a", "user_1", "ctx_3")
            append_event("tenant_a", "user_1", "ctx_3", "USER_MESSAGE", {"text": "hello no summary"})
            pack = build_context_pack(
                tenant_id="tenant_a",
                user_id="user_1",
                session_id="ctx_3",
                base_system="idea_script.infer",
            )
            self.assertIsNone(pack.session_summary)
            self.assertEqual(len(pack.recent_turns), 1)
            self.assertEqual(pack.recent_turns[0]["role"], "user")
        finally:
            self._restore_env(old_env)
            tmpdir.cleanup()

    def test_isolation_should_be_enforced(self):
        tmpdir, old_env = self._with_db()
        try:
            create_or_get_session("tenant_a", "user_1", "ctx_4")
            append_event("tenant_a", "user_1", "ctx_4", "USER_MESSAGE", {"text": "secure"})
            with self.assertRaises(SessionAccessDeniedError):
                build_context_pack(
                    tenant_id="tenant_b",
                    user_id="user_1",
                    session_id="ctx_4",
                    base_system="idea_script.generate",
                )
        finally:
            self._restore_env(old_env)
            tmpdir.cleanup()

    def test_integration_should_include_summary_and_runtime_state(self):
        tmpdir, old_env = self._with_db()
        try:
            create_or_get_session("tenant_a", "user_1", "ctx_5")
            append_event(
                "tenant_a",
                "user_1",
                "ctx_5",
                "USER_MESSAGE",
                {"text": "帮我做防晒霜脚本", "product": "防晒霜"},
            )
            append_event(
                "tenant_a",
                "user_1",
                "ctx_5",
                "TOOL_RESULT",
                {
                    "tool_name": "idea_script_orchestrator.run",
                    "result_ref": {"topic_count": 3, "edit_plan_count": 2},
                    "prompt_version": "pv_1",
                    "policy_version": "rv_1",
                    "config_hash": "c" * 64,
                },
            )
            update_state(
                "tenant_a",
                "user_1",
                "ctx_5",
                {
                    "last_product": "防晒霜",
                    "selected_assets_overrides": {"shot_1": "asset_9"},
                    "last_bundle_dirs": ["/tmp/b1", "/tmp/b2"],
                },
            )
            summarize_session("tenant_a", "user_1", "ctx_5")

            pack = build_context_pack(
                tenant_id="tenant_a",
                user_id="user_1",
                session_id="ctx_5",
                base_system="idea_script.generate",
            )
            self.assertIn("Mission:", str(pack.session_summary or ""))
            self.assertEqual(pack.runtime_state.get("last_product"), "防晒霜")
            self.assertEqual(pack.runtime_state.get("selected_assets_overrides_count"), 1)
            self.assertEqual(pack.metadata.get("prompt_version"), "pv_1")
            self.assertEqual(pack.metadata.get("policy_version"), "rv_1")
            self.assertTrue(str(pack.metadata.get("config_hash") or "").startswith("c"))
        finally:
            self._restore_env(old_env)
            tmpdir.cleanup()


if __name__ == "__main__":
    unittest.main()
