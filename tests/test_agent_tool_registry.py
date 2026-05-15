import importlib
import json
import os
import sys
import unittest


ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
BANANAFLOW_DIR = os.path.join(ROOT_DIR, "bananaflow")
if BANANAFLOW_DIR not in sys.path:
    sys.path.insert(0, BANANAFLOW_DIR)


from bananaflow.agent.tools import (  # noqa: E402
    AgentToolAlreadyRegisteredError,
    AgentToolRegistry,
    AgentToolSpec,
    build_builtin_registry,
)


class AgentToolRegistryTests(unittest.TestCase):
    def test_importing_agent_tool_spec_should_not_import_comfyui_services(self):
        sys.modules.pop("bananaflow.agent.tools", None)
        sys.modules.pop("bananaflow.agent.tools.builtin", None)
        sys.modules.pop("bananaflow.services.comfyui", None)

        module = importlib.import_module("bananaflow.agent.tools")

        self.assertTrue(hasattr(module, "AgentToolSpec"))
        self.assertNotIn("bananaflow.services.comfyui", sys.modules)

    def test_builtin_registry_should_expose_expected_tool_names(self):
        registry = build_builtin_registry()

        names = registry.list_tool_names()

        self.assertIn("agent_prompt_polish", names)
        self.assertIn("match_assets_for_shots", names)
        self.assertIn("comfyui_text2img", names)
        self.assertIn("comfyui_local_img2video", names)
        self.assertIn("comfyui_rmbg", names)
        self.assertIn("harvest_eval_case", names)
        self.assertIn("prompt.polish", names)
        self.assertIn("comfyui.text2img", names)
        self.assertIn("comfyui.rmbg", names)

    def test_tool_info_should_include_version_hash_schema_and_metadata(self):
        registry = build_builtin_registry()

        info = registry.get_tool_info("prompt.polish")

        self.assertIsNotNone(info)
        self.assertEqual(info["name"], "agent_prompt_polish")
        self.assertEqual(info["canonical_name"], "agent_prompt_polish")
        self.assertEqual(len(info["tool_hash"]), 64)
        self.assertEqual(info["inputSchema"]["type"], "object")
        self.assertIn("prompt", info["inputSchema"]["properties"])
        self.assertIn("text", info["outputSchema"]["properties"])
        self.assertEqual(info["category"], "prompt")
        self.assertEqual(info["retry"]["max_attempts"], 2)

    def test_register_should_reject_duplicate_names(self):
        registry = AgentToolRegistry()
        spec = AgentToolSpec(
            name="demo_tool",
            description="demo",
            input_schema={"type": "object", "properties": {}, "additionalProperties": False},
            output_schema={"type": "object", "properties": {}, "additionalProperties": True},
            annotations={"readOnlyHint": True, "idempotentHint": True, "destructiveHint": False},
        )

        registry.register(spec, lambda args, ctx: {})

        with self.assertRaises(AgentToolAlreadyRegisteredError):
            registry.register(spec, lambda args, ctx: {})

    def test_prompt_catalog_should_be_json_serializable(self):
        registry = build_builtin_registry()

        payload = registry.to_prompt_catalog()
        encoded = json.dumps(payload, ensure_ascii=False)

        self.assertTrue(encoded.startswith("["))
        self.assertIn("agent_prompt_polish", encoded)
        self.assertIn("comfyui.text2img", encoded)

    def test_list_tools_and_prompt_catalog_should_support_category_and_enabled_filtering(self):
        registry = AgentToolRegistry()
        registry.register(
            AgentToolSpec(
                name="prompt_enabled",
                description="prompt",
                input_schema={"type": "object", "properties": {}, "additionalProperties": False},
                output_schema={"type": "object", "properties": {}, "additionalProperties": True},
                annotations={"readOnlyHint": True, "idempotentHint": True, "destructiveHint": False},
                category="prompt",
                enabled=True,
            ),
            lambda args, ctx: {},
        )
        registry.register(
            AgentToolSpec(
                name="prompt_disabled",
                description="prompt disabled",
                input_schema={"type": "object", "properties": {}, "additionalProperties": False},
                output_schema={"type": "object", "properties": {}, "additionalProperties": True},
                annotations={"readOnlyHint": True, "idempotentHint": True, "destructiveHint": False},
                category="prompt",
                enabled=False,
            ),
            lambda args, ctx: {},
        )
        registry.register(
            AgentToolSpec(
                name="asset_enabled",
                description="asset",
                input_schema={"type": "object", "properties": {}, "additionalProperties": False},
                output_schema={"type": "object", "properties": {}, "additionalProperties": True},
                annotations={"readOnlyHint": True, "idempotentHint": True, "destructiveHint": False},
                category="assets",
                enabled=True,
            ),
            lambda args, ctx: {},
        )

        prompt_enabled = registry.list_tools(category="prompt", enabled=True)
        prompt_all = registry.to_prompt_catalog(category="prompt", enabled=None)

        self.assertEqual([item["name"] for item in prompt_enabled], ["prompt_enabled"])
        self.assertEqual([item["name"] for item in prompt_all], ["prompt_disabled", "prompt_enabled"])


if __name__ == "__main__":
    unittest.main()
