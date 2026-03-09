from __future__ import annotations

import json
import os
import select
import subprocess
import sys
import threading
from dataclasses import dataclass
from typing import Any, Dict, Optional

from .tool_export_ffmpeg import (
    EXPORT_FFMPEG_TOOL_HASH,
    EXPORT_FFMPEG_TOOL_NAME,
    EXPORT_FFMPEG_TOOL_VERSION,
)
from .tool_asset_match import (
    MATCH_ASSETS_TOOL_HASH,
    MATCH_ASSETS_TOOL_NAME,
    MATCH_ASSETS_TOOL_VERSION,
)


class MCPClientError(RuntimeError):
    pass


@dataclass
class MCPToolPin:
    name: str
    tool_version: str
    tool_hash: str


class MCPStdioClient:
    def __init__(
        self,
        server_cmd: Optional[list[str]] = None,
        server_module: str = "bananaflow.mcp.server_export_ffmpeg",
        timeout_sec: float = 30.0,
        cwd: Optional[str] = None,
        env: Optional[Dict[str, str]] = None,
    ) -> None:
        self.server_cmd = server_cmd or [sys.executable, "-m", str(server_module).strip()]
        self.timeout_sec = timeout_sec
        self.cwd = cwd
        self.env = dict(env or {}) or None
        self._proc: Optional[subprocess.Popen[str]] = None
        self._stderr_buffer: list[str] = []
        self._stderr_thread: Optional[threading.Thread] = None
        self._id = 1
        self._allowlist = {
            EXPORT_FFMPEG_TOOL_NAME: MCPToolPin(
                name=EXPORT_FFMPEG_TOOL_NAME,
                tool_version=self._pin_from_env(
                    "BANANAFLOW_MCP_EXPORT_FFMPEG_TOOL_VERSION",
                    EXPORT_FFMPEG_TOOL_VERSION,
                ),
                tool_hash=self._pin_from_env(
                    "BANANAFLOW_MCP_EXPORT_FFMPEG_TOOL_HASH",
                    EXPORT_FFMPEG_TOOL_HASH,
                ),
            ),
            MATCH_ASSETS_TOOL_NAME: MCPToolPin(
                name=MATCH_ASSETS_TOOL_NAME,
                tool_version=self._pin_from_env(
                    "BANANAFLOW_MCP_MATCH_ASSETS_TOOL_VERSION",
                    MATCH_ASSETS_TOOL_VERSION,
                ),
                tool_hash=self._pin_from_env(
                    "BANANAFLOW_MCP_MATCH_ASSETS_TOOL_HASH",
                    MATCH_ASSETS_TOOL_HASH,
                ),
            )
        }

    def _pin_from_env(self, env_key: str, default: str) -> str:
        return (os.getenv(env_key) or "").strip() or default

    def __enter__(self) -> "MCPStdioClient":
        self.start()
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.stop()

    @property
    def stderr_text(self) -> str:
        return "".join(self._stderr_buffer[-20:])

    def start(self) -> None:
        if self._proc is not None:
            return
        self._proc = subprocess.Popen(
            self.server_cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            cwd=self.cwd,
            env=self.env,
        )
        self._stderr_thread = threading.Thread(target=self._drain_stderr, daemon=True)
        self._stderr_thread.start()

    def stop(self) -> None:
        proc = self._proc
        self._proc = None
        if proc is None:
            return
        try:
            if proc.stdin:
                proc.stdin.close()
        except Exception:
            pass
        try:
            proc.terminate()
            proc.wait(timeout=1.5)
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass

    def _drain_stderr(self) -> None:
        proc = self._proc
        if proc is None or proc.stderr is None:
            return
        while True:
            line = proc.stderr.readline()
            if not line:
                break
            self._stderr_buffer.append(line)
            if len(self._stderr_buffer) > 200:
                self._stderr_buffer = self._stderr_buffer[-200:]

    def _read_stdout_line(self, timeout_sec: float) -> str:
        proc = self._proc
        if proc is None or proc.stdout is None:
            raise MCPClientError("MCP process is not started")
        ready, _, _ = select.select([proc.stdout], [], [], timeout_sec)
        if not ready:
            raise MCPClientError(f"MCP timeout waiting response. stderr={self.stderr_text.strip()}")
        line = proc.stdout.readline()
        if not line:
            raise MCPClientError(f"MCP stdout closed unexpectedly. stderr={self.stderr_text.strip()}")
        return line

    def request(self, method: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        if self._proc is None:
            self.start()
        proc = self._proc
        if proc is None or proc.stdin is None:
            raise MCPClientError("MCP process not available")
        req_id = self._id
        self._id += 1
        payload = {
            "jsonrpc": "2.0",
            "id": req_id,
            "method": method,
            "params": params or {},
        }
        proc.stdin.write(json.dumps(payload, ensure_ascii=False) + "\n")
        proc.stdin.flush()

        while True:
            raw = self._read_stdout_line(self.timeout_sec)
            try:
                resp = json.loads(raw)
            except Exception as e:
                raise MCPClientError(f"MCP returned invalid JSON: {e}; raw={raw!r}") from e
            if not isinstance(resp, dict):
                continue
            if resp.get("id") != req_id:
                continue
            if resp.get("error"):
                err = resp.get("error") or {}
                raise MCPClientError(
                    f"MCP error {err.get('code')}: {err.get('message')} data={err.get('data')}"
                )
            return resp.get("result") or {}

    def list_tools(self) -> Dict[str, Any]:
        return self.request("tools/list", {})

    def call_tool(self, name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        return self.request("tools/call", {"name": name, "arguments": arguments or {}})

    def call_export_ffmpeg_render_bundle(self, arguments: Dict[str, Any]) -> Dict[str, Any]:
        return self._call_tool_with_pin(EXPORT_FFMPEG_TOOL_NAME, arguments)

    def call_match_assets_for_shots(self, arguments: Dict[str, Any]) -> Dict[str, Any]:
        return self._call_tool_with_pin(MATCH_ASSETS_TOOL_NAME, arguments)

    def _call_tool_with_pin(self, tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        tools_result = self.list_tools()
        tools = list((tools_result or {}).get("tools") or [])
        pin = self._allowlist[tool_name]
        matched = None
        for tool in tools:
            if str((tool or {}).get("name") or "") == pin.name:
                matched = tool
                break
        if matched is None:
            raise MCPClientError(f"Tool not found in allowlist: {pin.name}")

        returned_hash = str((matched or {}).get("tool_hash") or "")
        returned_version = str((matched or {}).get("tool_version") or "")
        if returned_hash != pin.tool_hash or returned_version != pin.tool_version:
            raise MCPClientError(
                "Tool pin mismatch from tools/list. "
                f"expected=({pin.tool_version},{pin.tool_hash}) "
                f"got=({returned_version},{returned_hash})"
            )

        result = self.call_tool(pin.name, arguments)
        if bool(result.get("isError")):
            content = list(result.get("content") or [])
            message = content[0].get("text") if content and isinstance(content[0], dict) else "MCP tool error"
            raise MCPClientError(str(message))

        output = result.get("output") or {}
        out_hash = str(output.get("tool_hash") or result.get("tool_hash") or "")
        out_version = str(output.get("tool_version") or result.get("tool_version") or "")
        if out_hash != pin.tool_hash or out_version != pin.tool_version:
            raise MCPClientError(
                "Tool pin mismatch from tools/call. "
                f"expected=({pin.tool_version},{pin.tool_hash}) "
                f"got=({out_version},{out_hash})"
            )
        return dict(output)
