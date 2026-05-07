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
    def test_builtin_registry_should_expose_expected_tool_names(self):
        registry = build_builtin_registry()

        names = registry.list_tool_names()

        self.assertIn("agent_prompt_polish", names)
        self.assertIn("agent_idea_script_generate", names)
        self.assertIn("match_assets_for_shots", names)
        self.assertIn("comfyui_text2img", names)
        self.assertIn("comfyui_local_img2video", names)
        self.assertIn("comfyui_rmbg", names)
        self.assertIn("export_ffmpeg_render_bundle", names)
        self.assertIn("harvest_eval_case", names)

    def test_tool_info_should_include_version_hash_and_schema(self):
        registry = build_builtin_registry()

        info = registry.get_tool_info("agent_prompt_polish")

        self.assertIsNotNone(info)
        self.assertEqual(info["name"], "agent_prompt_polish")
        self.assertEqual(len(info["tool_hash"]), 64)
        self.assertEqual(info["inputSchema"]["type"], "object")
        self.assertIn("prompt", info["inputSchema"]["properties"])
        self.assertIn("text", info["outputSchema"]["properties"])

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


if __name__ == "__main__":
    unittest.main()
