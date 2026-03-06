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


from bananaflow.mcp.tool_export_ffmpeg import (  # noqa: E402
    EXPORT_FFMPEG_TOOL_HASH,
    EXPORT_FFMPEG_TOOL_NAME,
    EXPORT_FFMPEG_TOOL_VERSION,
)


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


class MCPServerExportFfmpegTests(unittest.TestCase):
    def test_tools_list_and_tools_call_should_export_bundle_files(self):
        proc = subprocess.Popen(
            [sys.executable, "-m", "bananaflow.mcp.server_export_ffmpeg"],
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
            self.assertEqual(tool.get("name"), EXPORT_FFMPEG_TOOL_NAME)
            self.assertEqual(tool.get("tool_version"), EXPORT_FFMPEG_TOOL_VERSION)
            self.assertEqual(tool.get("tool_hash"), EXPORT_FFMPEG_TOOL_HASH)

            with tempfile.TemporaryDirectory() as tmpdir:
                plan = {
                    "plan_id": "mcp_plan_1",
                    "product": "洗面奶",
                    "topic_index": 0,
                    "angle": "persona",
                    "title": "测试导出",
                    "tracks": [
                        {
                            "track_id": "video_track_1",
                            "track_type": "video",
                            "clips": [
                                {
                                    "clip_id": "clip_01",
                                    "shot_id": "shot_01",
                                    "segment": "HOOK",
                                    "duration_sec": 6.0,
                                    "camera": "close_up",
                                    "scene": "场景",
                                    "action": "动作",
                                    "primary_asset": {
                                        "asset_id": "asset_1",
                                        "uri": "/tmp/assets/a1.mp4",
                                        "score": 0.9,
                                        "bucket": "best_match",
                                        "reason": "ok",
                                    },
                                    "alternates": [],
                                }
                            ],
                        }
                    ],
                    "total_duration_sec": 6.0,
                    "missing_primary_asset_count": 0,
                    "prompt_version": "pv",
                    "policy_version": "rv",
                    "config_hash": "a" * 64,
                    "generated_at": "2026-02-27T00:00:00+00:00",
                }
                call_resp = _rpc_call(
                    proc,
                    2,
                    "tools/call",
                    {
                        "name": EXPORT_FFMPEG_TOOL_NAME,
                        "arguments": {
                            "plan": plan,
                            "out_dir": tmpdir,
                            "resolution": {"w": 720, "h": 1280},
                            "fps": 30,
                        },
                    },
                )
                self.assertIn("result", call_resp)
                self.assertFalse(call_resp["result"].get("isError"))
                output = call_resp["result"].get("output") or {}
                self.assertEqual(output.get("tool_version"), EXPORT_FFMPEG_TOOL_VERSION)
                self.assertEqual(output.get("tool_hash"), EXPORT_FFMPEG_TOOL_HASH)

                bundle_dir = output.get("bundle_dir")
                self.assertTrue(bundle_dir and os.path.isdir(bundle_dir))
                render_script_path = output.get("render_script_path")
                concat_list_path = output.get("concat_list_path")
                edit_plan_path = output.get("edit_plan_path")
                self.assertTrue(os.path.isfile(render_script_path))
                self.assertTrue(os.path.isfile(concat_list_path))
                self.assertTrue(os.path.isfile(edit_plan_path))
                files = set(output.get("files") or [])
                self.assertIn(render_script_path, files)
                self.assertIn(concat_list_path, files)
                self.assertIn(edit_plan_path, files)
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
