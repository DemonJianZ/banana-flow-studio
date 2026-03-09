from __future__ import annotations

import json
import sys
import traceback
from typing import Any, Dict

try:
    from .tool_asset_match import (
        MATCH_ASSETS_TOOL_NAME,
        execute_asset_match_tool,
        get_asset_match_tool_definition,
    )
except Exception:  # pragma: no cover - 兼容直接脚本运行
    from tool_asset_match import (  # type: ignore
        MATCH_ASSETS_TOOL_NAME,
        execute_asset_match_tool,
        get_asset_match_tool_definition,
    )


def _write_json(payload: Dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def _jsonrpc_ok(req_id: Any, result: Dict[str, Any]) -> Dict[str, Any]:
    return {"jsonrpc": "2.0", "id": req_id, "result": result}


def _jsonrpc_error(req_id: Any, code: int, message: str, data: Any = None) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "jsonrpc": "2.0",
        "id": req_id,
        "error": {"code": code, "message": message},
    }
    if data is not None:
        payload["error"]["data"] = data
    return payload


def _handle_tools_list(req_id: Any) -> Dict[str, Any]:
    return _jsonrpc_ok(req_id, {"tools": [get_asset_match_tool_definition()]})


def _handle_tools_call(req_id: Any, params: Dict[str, Any]) -> Dict[str, Any]:
    name = str((params or {}).get("name") or "").strip()
    arguments = (params or {}).get("arguments") or {}
    if name != MATCH_ASSETS_TOOL_NAME:
        return _jsonrpc_ok(
            req_id,
            {
                "isError": True,
                "content": [
                    {
                        "type": "text",
                        "text": (
                            f"Unsupported tool: {name}. Recovery: call {MATCH_ASSETS_TOOL_NAME}."
                        ),
                    }
                ],
            },
        )
    try:
        output = execute_asset_match_tool(arguments=arguments)
        return _jsonrpc_ok(
            req_id,
            {
                "isError": False,
                "name": name,
                "output": output,
                "tool_version": output.get("tool_version"),
                "tool_hash": output.get("tool_hash"),
            },
        )
    except Exception as e:
        return _jsonrpc_ok(
            req_id,
            {
                "isError": True,
                "name": name,
                "content": [
                    {
                        "type": "text",
                        "text": (
                            f"Tool call failed: {e}. Recovery: check queries/shots payload and db_path."
                        ),
                    }
                ],
            },
        )


def handle_request(payload: Dict[str, Any]) -> Dict[str, Any]:
    req_id = payload.get("id")
    method = str(payload.get("method") or "").strip()
    params = payload.get("params") or {}

    if method == "tools/list":
        return _handle_tools_list(req_id)
    if method == "tools/call":
        return _handle_tools_call(req_id, params if isinstance(params, dict) else {})
    return _jsonrpc_error(req_id, -32601, f"Method not found: {method}")


def main() -> int:
    for line in sys.stdin:
        text = (line or "").strip()
        if not text:
            continue
        try:
            payload = json.loads(text)
            if not isinstance(payload, dict):
                _write_json(_jsonrpc_error(None, -32600, "Invalid Request: object expected"))
                continue
            response = handle_request(payload)
            _write_json(response)
        except json.JSONDecodeError:
            _write_json(_jsonrpc_error(None, -32700, "Parse error: invalid JSON"))
        except Exception as e:
            _write_json(
                _jsonrpc_error(
                    None,
                    -32000,
                    f"Internal server error: {e}",
                    {"traceback": traceback.format_exc(limit=3)},
                )
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
