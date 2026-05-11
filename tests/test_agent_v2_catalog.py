import os
import sys
import unittest


ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
BANANAFLOW_DIR = os.path.join(ROOT_DIR, "bananaflow")
if BANANAFLOW_DIR not in sys.path:
    sys.path.insert(0, BANANAFLOW_DIR)


from bananaflow.agent_v2.gateway.catalog import build_capability_catalog  # noqa: E402


class AgentV2CatalogTests(unittest.TestCase):
    def test_catalog_should_include_virtual_capabilities(self):
        catalog = build_capability_catalog()
        names = {item["name"] for item in catalog}

        self.assertIn("general_answer", names)
        self.assertIn("canvas_planner", names)

    def test_catalog_should_include_tool_aliases_and_retrieval_tools(self):
        catalog = build_capability_catalog()
        names = {item["name"] for item in catalog}

        self.assertIn("prompt.polish", names)
        self.assertIn("retrieval.search_assets", names)
        self.assertIn("retrieval.search_knowledge", names)
        self.assertIn("retrieval.search_eval_cases", names)


if __name__ == "__main__":
    unittest.main()
