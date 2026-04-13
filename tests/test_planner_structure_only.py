import os
import sys
import unittest


ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
PACKAGE_DIR = os.path.join(ROOT_DIR, "bananaflow")
if PACKAGE_DIR not in sys.path:
    sys.path.insert(0, PACKAGE_DIR)

try:
    from bananaflow.agent.planner import agent_plan_impl
except ModuleNotFoundError:
    agent_plan_impl = None


class _DummyReq:
    def __init__(self, prompt: str):
        self.prompt = prompt
        self.supplemental_prompt = ""
        self.current_nodes = []
        self.current_connections = []
        self.selected_artifact = None
        self.canvas_id = None
        self.thread_id = None


class _DummyRequest:
    def __init__(self):
        self.state = type("State", (), {"req_id": "test_req"})()


@unittest.skipUnless(agent_plan_impl is not None, "fastapi is not installed in this test environment")
class PlannerStructureOnlyTests(unittest.TestCase):
    def test_canvas_only_request_returns_structure_without_config_fill(self):
        out = agent_plan_impl(_DummyReq("帮我搭一个文生图接图生视频流程"), _DummyRequest())

        patch = out["patch"]
        self.assertGreaterEqual(len(patch), 3)

        processor_nodes = [
            op["node"]["data"]
            for op in patch
            if isinstance(op, dict) and op.get("op") == "add_node" and (op.get("node") or {}).get("type") == "processor"
        ]
        self.assertTrue(processor_nodes)
        for data in processor_nodes:
            self.assertEqual(data.get("mode"), "text2img")
            self.assertNotIn("prompt", data)
            self.assertNotIn("templates", data)
            self.assertNotIn("model", data)


if __name__ == "__main__":
    unittest.main()
