"""
Tests for T2.1: StoryboardTaskStore CRUD and status transitions.
"""
import os
import sys
import tempfile
import unittest
from unittest import mock

ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
BANANAFLOW_DIR = os.path.join(ROOT_DIR, "bananaflow")
if BANANAFLOW_DIR not in sys.path:
    sys.path.insert(0, BANANAFLOW_DIR)


class TestStoryboardTaskStore(unittest.TestCase):

    def setUp(self):
        self._tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self._tmp.close()
        self._db_path = self._tmp.name
        # Patch _db_path to use temp file
        import bananaflow.storage.storyboard_tasks as mod
        self._mod = mod
        self._orig_db_path = mod._db_path
        mod._db_path = lambda: self._db_path
        mod._ensured_paths.discard(self._db_path)

    def tearDown(self):
        self._mod._db_path = self._orig_db_path
        self._mod._ensured_paths.discard(self._db_path)
        os.unlink(self._db_path)

    def test_create_returns_task_id(self):
        task_id = self._mod.create_storyboard_task(thread_id="thread-1")
        self.assertIsInstance(task_id, str)
        self.assertTrue(len(task_id) > 0)

    def test_create_status_is_pending(self):
        task_id = self._mod.create_storyboard_task("t1")
        task = self._mod.get_storyboard_task(task_id)
        self.assertIsNotNone(task)
        self.assertEqual(task["status"], "pending")
        self.assertEqual(task["patch"], [])
        self.assertEqual(task["thread_id"], "t1")

    def test_update_status_to_running(self):
        task_id = self._mod.create_storyboard_task()
        self._mod.update_storyboard_task(task_id, status="running")
        task = self._mod.get_storyboard_task(task_id)
        self.assertEqual(task["status"], "running")

    def test_update_status_done_with_patch(self):
        task_id = self._mod.create_storyboard_task()
        patch = [{"op": "add_node", "node_type": "storyboard_plan"}]
        self._mod.update_storyboard_task(task_id, status="done", patch=patch, summary="2场景")
        task = self._mod.get_storyboard_task(task_id)
        self.assertEqual(task["status"], "done")
        self.assertEqual(len(task["patch"]), 1)
        self.assertEqual(task["summary"], "2场景")

    def test_update_status_error(self):
        task_id = self._mod.create_storyboard_task()
        self._mod.update_storyboard_task(task_id, status="error", error_msg="LLM timeout")
        task = self._mod.get_storyboard_task(task_id)
        self.assertEqual(task["status"], "error")
        self.assertEqual(task["error_msg"], "LLM timeout")

    def test_get_nonexistent_task_returns_none(self):
        result = self._mod.get_storyboard_task("nonexistent-id")
        self.assertIsNone(result)

    def test_multiple_tasks_independent(self):
        id1 = self._mod.create_storyboard_task("thread-a")
        id2 = self._mod.create_storyboard_task("thread-b")
        self._mod.update_storyboard_task(id1, status="done")
        t1 = self._mod.get_storyboard_task(id1)
        t2 = self._mod.get_storyboard_task(id2)
        self.assertEqual(t1["status"], "done")
        self.assertEqual(t2["status"], "pending")


if __name__ == "__main__":
    unittest.main()
