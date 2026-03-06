import os
import sys
import unittest


ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)


from bananaflow.mcp.tool_export_ffmpeg import (  # noqa: E402
    EXPORT_FFMPEG_TOOL_HASH,
    EXPORT_FFMPEG_TOOL_NAME,
    EXPORT_FFMPEG_TOOL_VERSION,
    get_export_ffmpeg_tool_definition,
)
from bananaflow.mcp.tool_asset_match import (  # noqa: E402
    MATCH_ASSETS_TOOL_HASH,
    MATCH_ASSETS_TOOL_NAME,
    MATCH_ASSETS_TOOL_VERSION,
    get_asset_match_tool_definition,
)


class MCPToolSpecTests(unittest.TestCase):
    def test_tool_spec_should_have_required_fields_and_pinned_hash(self):
        spec = get_export_ffmpeg_tool_definition()
        self.assertEqual(spec["name"], EXPORT_FFMPEG_TOOL_NAME)
        self.assertEqual(spec["tool_version"], EXPORT_FFMPEG_TOOL_VERSION)
        self.assertEqual(spec["tool_hash"], EXPORT_FFMPEG_TOOL_HASH)
        self.assertEqual(len(spec["tool_hash"]), 64)

        annotations = spec.get("annotations") or {}
        self.assertTrue(annotations.get("idempotentHint"))
        self.assertFalse(annotations.get("destructiveHint"))
        self.assertFalse(annotations.get("readOnlyHint"))

        input_schema = spec.get("inputSchema") or {}
        self.assertEqual(input_schema.get("type"), "object")
        self.assertIn("anyOf", input_schema)
        self.assertIn("properties", input_schema)
        self.assertIn("plan_id", input_schema["properties"])
        self.assertIn("plan", input_schema["properties"])

        output_schema = spec.get("outputSchema") or {}
        self.assertEqual(output_schema.get("type"), "object")
        required = set(output_schema.get("required") or [])
        for field in (
            "bundle_dir",
            "files",
            "render_script_path",
            "concat_list_path",
            "edit_plan_path",
            "missing_primary_asset_count",
            "warnings",
            "tool_version",
            "tool_hash",
        ):
            self.assertIn(field, required)

    def test_asset_match_tool_spec_should_have_required_fields_and_pinned_hash(self):
        spec = get_asset_match_tool_definition()
        self.assertEqual(spec["name"], MATCH_ASSETS_TOOL_NAME)
        self.assertEqual(spec["tool_version"], MATCH_ASSETS_TOOL_VERSION)
        self.assertEqual(spec["tool_hash"], MATCH_ASSETS_TOOL_HASH)
        self.assertEqual(len(spec["tool_hash"]), 64)

        annotations = spec.get("annotations") or {}
        self.assertTrue(annotations.get("idempotentHint"))
        self.assertFalse(annotations.get("destructiveHint"))
        self.assertTrue(annotations.get("readOnlyHint"))

        input_schema = spec.get("inputSchema") or {}
        self.assertEqual(input_schema.get("type"), "object")
        self.assertIn("anyOf", input_schema)
        self.assertIn("properties", input_schema)
        self.assertIn("queries", input_schema["properties"])
        self.assertIn("shots", input_schema["properties"])

        output_schema = spec.get("outputSchema") or {}
        self.assertEqual(output_schema.get("type"), "object")
        required = set(output_schema.get("required") or [])
        for field in ("results", "stats", "tool_version", "tool_hash"):
            self.assertIn(field, required)


if __name__ == "__main__":
    unittest.main()
