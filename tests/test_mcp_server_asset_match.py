import json
import os
import select
import subprocess
import sys
import tempfile
import unittest


ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)


from bananaflow.mcp.tool_asset_match import (  # noqa: E402
    MATCH_ASSETS_TOOL_HASH,
    MATCH_ASSETS_TOOL_NAME,
    MATCH_ASSETS_TOOL_VERSION,
)
from bananaflow.storage.migrations import ensure_asset_db  # noqa: E402
from bananaflow.storage.sqlite import execute  # noqa: E402


def _rpc_call(proc: subprocess.Popen, req_id: int, method: str, params: dict) -> dict:
    payload = {
        "jsonrpc": "2.0",
        "id": req_id,
        "method": method,
        "params": params or {},
    }
    proc.stdin.write(json.dumps(payload, ensure_ascii=False) + "\n")
    proc.stdin.flush()

    ready, _, _ = select.select([proc.stdout], [], [], 5.0)
    if not ready:
        raise AssertionError("timeout waiting mcp response")
    line = proc.stdout.readline()
    if not line:
        raise AssertionError("mcp stdout closed")
    return json.loads(line)


class MCPServerAssetMatchTests(unittest.TestCase):
    def _insert_assets(self, db_path: str) -> None:
        rows = [
            (
                "scene_1",
                "/assets/scene_1.mp4",
                "scene",
                json.dumps(["开场", "口播", "close_up", "subway", "commute"], ensure_ascii=False),
                "口播场景",
                "[]",
                "live_action",
                "9:16",
                8.0,
            ),
            (
                "product_1",
                "/assets/product_1.mp4",
                "product",
                json.dumps(["产品", "包装", "特写", "成分"], ensure_ascii=False),
                "产品台",
                "[]",
                "live_action",
                "9:16",
                8.0,
            ),
            (
                "overlay_1",
                "/assets/overlay_1.mp4",
                "overlay",
                json.dumps(["字幕", "cta", "互动"], ensure_ascii=False),
                "贴片层",
                "[]",
                "flat",
                "9:16",
                6.0,
            ),
        ]
        for row in rows:
            execute(
                db_path,
                """
                INSERT INTO assets (
                    asset_id, uri, asset_type, tags, scene, objects, style, aspect, duration_sec
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                row,
            )

    def test_tools_list_and_tools_call_should_match_assets(self):
        proc = subprocess.Popen(
            [sys.executable, "-m", "bananaflow.mcp.server_asset_match"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            cwd=ROOT_DIR,
        )
        try:
            list_resp = _rpc_call(proc, 1, "tools/list", {})
            self.assertIn("result", list_resp)
            tools = list_resp["result"].get("tools") or []
            self.assertTrue(tools)
            tool = tools[0]
            self.assertEqual(tool.get("name"), MATCH_ASSETS_TOOL_NAME)
            self.assertEqual(tool.get("tool_version"), MATCH_ASSETS_TOOL_VERSION)
            self.assertEqual(tool.get("tool_hash"), MATCH_ASSETS_TOOL_HASH)

            with tempfile.TemporaryDirectory() as tmpdir:
                db_path = os.path.join(tmpdir, "assets.db")
                ensure_asset_db(db_path)
                self._insert_assets(db_path)

                shot_call_resp = _rpc_call(
                    proc,
                    2,
                    "tools/call",
                    {
                        "name": MATCH_ASSETS_TOOL_NAME,
                        "arguments": {
                            "db_path": db_path,
                            "top_k": 3,
                            "shots": [
                                {
                                    "shot_id": "shot_hook_1",
                                    "segment": "HOOK",
                                    "keyword_tags": ["开场", "口播", "地铁", "通勤", "特写"],
                                    "asset_requirements": [
                                        {"type": "scene", "must_have": "开场 口播", "avoid": "杂乱", "aspect": "9:16"}
                                    ],
                                },
                                {
                                    "shot_id": "shot_product_1",
                                    "segment": "PRODUCT",
                                    "keyword_tags": ["产品", "包装", "特写", "成分", "展示"],
                                    "asset_requirements": [
                                        {"type": "product", "must_have": "产品 包装", "aspect": "9:16"}
                                    ],
                                },
                            ],
                        },
                    },
                )
                self.assertIn("result", shot_call_resp)
                self.assertFalse(shot_call_resp["result"].get("isError"))
                output = shot_call_resp["result"].get("output") or {}
                self.assertEqual(output.get("tool_version"), MATCH_ASSETS_TOOL_VERSION)
                self.assertEqual(output.get("tool_hash"), MATCH_ASSETS_TOOL_HASH)
                results = output.get("results") or {}
                self.assertIn("shot_hook_1", results)
                self.assertIn("shot_product_1", results)
                self.assertTrue(results["shot_hook_1"])
                self.assertTrue(results["shot_product_1"])
                first_hook = results["shot_hook_1"][0]
                first_prod = results["shot_product_1"][0]
                self.assertEqual(first_hook.get("bucket"), "best_match")
                self.assertEqual(first_prod.get("bucket"), "best_match")
                self.assertIn("required_missing_count=", str(first_hook.get("reason") or ""))
                self.assertIn("required_missing_count=", str(first_prod.get("reason") or ""))

                stats = output.get("stats") or {}
                self.assertEqual(stats.get("shot_count"), 2)
                self.assertEqual(stats.get("matched_shot_count"), 2)
                self.assertGreaterEqual(float(stats.get("shot_match_rate") or 0.0), 1.0)
                self.assertIn("bucket_distribution", stats)

                query_call_resp = _rpc_call(
                    proc,
                    3,
                    "tools/call",
                    {
                        "name": MATCH_ASSETS_TOOL_NAME,
                        "arguments": {
                            "db_path": db_path,
                            "queries": [
                                {
                                    "shot_id": "query_1",
                                    "segment": "CTA",
                                    "asset_query": {
                                        "required_tags": ["字幕", "互动"],
                                        "preferred_tags": ["cta"],
                                        "forbidden_tags": ["杂乱"],
                                        "type": "overlay",
                                        "aspect": "9:16",
                                    },
                                    "top_k": 2,
                                }
                            ],
                        },
                    },
                )
                self.assertIn("result", query_call_resp)
                self.assertFalse(query_call_resp["result"].get("isError"))
                query_output = query_call_resp["result"].get("output") or {}
                query_results = query_output.get("results") or {}
                self.assertIn("query_1", query_results)
                self.assertTrue(query_results["query_1"])
                self.assertEqual(query_results["query_1"][0].get("asset_id"), "overlay_1")
        finally:
            try:
                proc.terminate()
                proc.wait(timeout=1.0)
            except Exception:
                try:
                    proc.kill()
                except Exception:
                    pass


if __name__ == "__main__":
    unittest.main()
