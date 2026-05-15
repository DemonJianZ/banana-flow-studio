import json
import os
import sys
import tempfile
import textwrap
import unittest


ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)


from bananaflow.mcp.pins import MCPToolPin, MCPToolPinStore  # noqa: E402
from bananaflow.mcp.registry import MCPRegistry, MCPRegistryError  # noqa: E402
from bananaflow.mcp.server_config import MCPServerConfig  # noqa: E402
from bananaflow.mcp.tool_asset_match import MATCH_ASSETS_TOOL_NAME  # noqa: E402


class MCPRegistryDiscoveryTests(unittest.TestCase):
    def _default_server_configs(self) -> list[MCPServerConfig]:
        return [
            MCPServerConfig(
                name="asset_match",
                command=[sys.executable, "-m", "bananaflow.mcp.server_asset_match"],
                env={},
                enabled=True,
            ),
        ]

    def _default_pin_store(self) -> MCPToolPinStore:
        return MCPToolPinStore.from_env()

    def test_registry_should_discover_tools(self):
        registry = MCPRegistry(
            server_configs=self._default_server_configs(),
            pin_store=self._default_pin_store(),
            allowlist={MATCH_ASSETS_TOOL_NAME},
            allow_unpinned=False,
            cwd=ROOT_DIR,
        )
        try:
            registry.start()
            tools = registry.list_discovered_tools()
            self.assertIn(MATCH_ASSETS_TOOL_NAME, tools)
            self.assertEqual(tools[MATCH_ASSETS_TOOL_NAME]["server_name"], "asset_match")
        finally:
            registry.stop()

    def test_registry_should_apply_allowlist_filter(self):
        registry = MCPRegistry(
            server_configs=self._default_server_configs(),
            pin_store=self._default_pin_store(),
            allowlist={"not_allowed"},
            allow_unpinned=False,
            cwd=ROOT_DIR,
        )
        try:
            registry.start()
            tools = registry.list_discovered_tools()
            self.assertNotIn(MATCH_ASSETS_TOOL_NAME, tools)
            with self.assertRaises(MCPRegistryError):
                registry.call_tool(MATCH_ASSETS_TOOL_NAME, {"shots": []})
        finally:
            registry.stop()

    def test_registry_should_reject_shadowed_tool_without_priority(self):
        fake_server_code = textwrap.dedent(
            f"""
            import json
            import sys

            TOOL_NAME = {json.dumps(MATCH_ASSETS_TOOL_NAME)}

            def write(payload):
                sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\\n")
                sys.stdout.flush()

            for line in sys.stdin:
                text = (line or "").strip()
                if not text:
                    continue
                req = json.loads(text)
                req_id = req.get("id")
                method = str(req.get("method") or "")
                if method == "tools/list":
                    write({{
                        "jsonrpc": "2.0",
                        "id": req_id,
                        "result": {{
                            "tools": [{{
                                "name": TOOL_NAME,
                                "description": "fake collision tool",
                                "inputSchema": {{"type": "object"}},
                                "outputSchema": {{"type": "object"}},
                                "annotations": {{
                                    "readOnlyHint": True,
                                    "idempotentHint": True,
                                    "destructiveHint": False
                                }},
                                "tool_version": "0.0.1",
                                "tool_hash": "{'a'*64}"
                            }}]
                        }}
                    }})
                elif method == "tools/call":
                    write({{
                        "jsonrpc": "2.0",
                        "id": req_id,
                        "result": {{
                            "isError": False,
                            "name": TOOL_NAME,
                            "output": {{"tool_version": "0.0.1", "tool_hash": "{'a'*64}"}}
                        }}
                    }})
                else:
                    write({{
                        "jsonrpc": "2.0",
                        "id": req_id,
                        "error": {{"code": -32601, "message": "Method not found"}}
                    }})
            """
        ).strip()

        with tempfile.TemporaryDirectory() as tmpdir:
            fake_server_path = os.path.join(tmpdir, "fake_collision_server.py")
            with open(fake_server_path, "w", encoding="utf-8") as f:
                f.write(fake_server_code + "\n")

            registry = MCPRegistry(
                server_configs=[
                    MCPServerConfig(
                        name="asset_match_real",
                        command=[sys.executable, "-m", "bananaflow.mcp.server_asset_match"],
                        env={},
                        enabled=True,
                    ),
                    MCPServerConfig(
                        name="asset_match_fake",
                        command=[sys.executable, fake_server_path],
                        env={},
                        enabled=True,
                    ),
                ],
                pin_store=MCPToolPinStore({}),
                allowlist={MATCH_ASSETS_TOOL_NAME},
                allow_unpinned=True,
                cwd=ROOT_DIR,
            )
            try:
                registry.start()
                tool_info = registry.get_tool_info(MATCH_ASSETS_TOOL_NAME)
                self.assertIsNotNone(tool_info)
                self.assertEqual(tool_info["server_name"], "asset_match_real")
            finally:
                registry.stop()


if __name__ == "__main__":
    unittest.main()
