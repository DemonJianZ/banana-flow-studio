from __future__ import annotations

import json
import os
import threading
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

try:
    from ..core.logging import sys_logger
except Exception:  # pragma: no cover - 兼容 python bananaflow/main.py 直跑
    from core.logging import sys_logger

from .client import MCPClientError, MCPStdioClient
from .pins import MCPToolPinStore
from .server_config import MCPServerConfig, load_server_configs_from_env


def _as_bool(value: object, default: bool) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "on"}:
        return True
    if text in {"0", "false", "no", "off"}:
        return False
    return default


def _parse_allowlist(raw: str) -> set[str]:
    text = str(raw or "").strip()
    if not text:
        return set()
    if text.startswith("["):
        try:
            decoded = json.loads(text)
        except Exception:
            decoded = []
        if isinstance(decoded, list):
            return {str(item).strip() for item in decoded if str(item).strip()}
        return set()
    return {part.strip() for part in text.split(",") if part.strip()}


def _parse_tool_priority(raw: str) -> Dict[str, List[str]]:
    text = str(raw or "").strip()
    if not text:
        return {}
    try:
        decoded = json.loads(text)
    except Exception:
        return {}
    if not isinstance(decoded, dict):
        return {}
    out: Dict[str, List[str]] = {}
    for tool_name, servers in decoded.items():
        if not isinstance(servers, list):
            continue
        out[str(tool_name).strip()] = [str(item).strip() for item in servers if str(item).strip()]
    return out


class MCPRegistryError(RuntimeError):
    pass


class MCPToolInvocationError(MCPRegistryError):
    pass


@dataclass(frozen=True)
class MCPDiscoveredTool:
    tool_name: str
    server_name: str
    tool_version: str
    tool_hash: str
    spec: Dict[str, Any]


class MCPRegistry:
    def __init__(
        self,
        server_configs: Optional[List[MCPServerConfig]] = None,
        pin_store: Optional[MCPToolPinStore] = None,
        allowlist: Optional[set[str]] = None,
        allow_unpinned: Optional[bool] = None,
        tool_priority: Optional[Dict[str, List[str]]] = None,
        timeout_sec: float = 30.0,
        cwd: Optional[str] = None,
    ) -> None:
        self.server_configs = list(server_configs or [])
        self.pin_store = pin_store or MCPToolPinStore.from_env()
        self.allowlist = set(allowlist or [])
        self.allow_unpinned = bool(allow_unpinned) if allow_unpinned is not None else False
        self.tool_priority = dict(tool_priority or {})
        self.timeout_sec = float(timeout_sec or 30.0)
        self.cwd = cwd

        self._clients: Dict[str, MCPStdioClient] = {}
        self._tools: Dict[str, MCPDiscoveredTool] = {}
        self._started = False
        self._last_call_meta: Dict[str, Any] = {}
        self._lock = threading.Lock()

    @classmethod
    def from_env(cls) -> "MCPRegistry":
        pin_store = MCPToolPinStore.from_env()
        allowlist = _parse_allowlist(os.getenv("BANANAFLOW_MCP_TOOL_ALLOWLIST", ""))
        if not allowlist:
            allowlist = set(pin_store.as_dict().keys())
        allow_unpinned = _as_bool(os.getenv("BANANAFLOW_MCP_ALLOW_UNPINNED"), default=False)
        tool_priority = _parse_tool_priority(os.getenv("BANANAFLOW_MCP_TOOL_PRIORITY_JSON", ""))
        timeout_text = (os.getenv("BANANAFLOW_MCP_TIMEOUT_SEC") or "").strip()
        try:
            timeout_sec = float(timeout_text) if timeout_text else 30.0
        except Exception:
            timeout_sec = 30.0
        cwd = (os.getenv("BANANAFLOW_MCP_CWD") or "").strip() or None
        return cls(
            server_configs=load_server_configs_from_env(),
            pin_store=pin_store,
            allowlist=allowlist,
            allow_unpinned=allow_unpinned,
            tool_priority=tool_priority,
            timeout_sec=timeout_sec,
            cwd=cwd,
        )

    def start(self) -> None:
        with self._lock:
            if self._started:
                return
            self._clients = {}
            self._tools = {}
            for config in self.server_configs:
                if not config.enabled:
                    continue
                client = MCPStdioClient(
                    server_cmd=list(config.command),
                    timeout_sec=self.timeout_sec,
                    cwd=self.cwd,
                    env=self._build_server_env(config.env),
                )
                try:
                    client.start()
                    listed = client.list_tools()
                    tools = list((listed or {}).get("tools") or [])
                    self._clients[config.name] = client
                    self._discover_server_tools(config.name, tools)
                except Exception as e:
                    self._audit_log(
                        level="error",
                        event="mcp_server_discovery_failed",
                        server_name=config.name,
                        error=str(e),
                    )
                    try:
                        client.stop()
                    except Exception:
                        pass
            self._started = True

    def stop(self) -> None:
        with self._lock:
            for client in list(self._clients.values()):
                try:
                    client.stop()
                except Exception:
                    continue
            self._clients = {}
            self._tools = {}
            self._last_call_meta = {}
            self._started = False

    def get_tool_info(self, tool_name: str) -> Optional[Dict[str, Any]]:
        tool = self._tools.get(str(tool_name or "").strip())
        if tool is None:
            return None
        return {
            "tool_name": tool.tool_name,
            "server_name": tool.server_name,
            "tool_version": tool.tool_version,
            "tool_hash": tool.tool_hash,
            "spec": dict(tool.spec),
        }

    def get_last_call_meta(self) -> Dict[str, Any]:
        return dict(self._last_call_meta)

    def list_discovered_tools(self) -> Dict[str, Dict[str, Any]]:
        return {
            name: {
                "server_name": item.server_name,
                "tool_version": item.tool_version,
                "tool_hash": item.tool_hash,
            }
            for name, item in self._tools.items()
        }

    def call_tool(self, tool_name: str, args: Dict[str, Any]) -> Dict[str, Any]:
        if not self._started:
            self.start()
        normalized_tool_name = str(tool_name or "").strip()
        discovered = self._tools.get(normalized_tool_name)
        if discovered is None:
            raise MCPRegistryError(f"tool not registered: {normalized_tool_name}")

        self._validate_input(args=args or {}, input_schema=(discovered.spec.get("inputSchema") or {}))
        client = self._clients.get(discovered.server_name)
        if client is None:
            raise MCPRegistryError(f"server unavailable: {discovered.server_name}")

        try:
            result = client.call_tool(discovered.tool_name, args or {})
        except MCPClientError as e:
            raise MCPToolInvocationError(str(e)) from e

        if bool(result.get("isError")):
            content = list(result.get("content") or [])
            message = content[0].get("text") if content and isinstance(content[0], dict) else "mcp tool error"
            raise MCPToolInvocationError(str(message))

        output = result.get("output") or {}
        if not isinstance(output, dict):
            output = {}
        out_tool_version = str(output.get("tool_version") or result.get("tool_version") or discovered.tool_version)
        out_tool_hash = str(output.get("tool_hash") or result.get("tool_hash") or discovered.tool_hash)
        pin = self.pin_store.get(discovered.tool_name)
        if pin and (pin.tool_version != out_tool_version or pin.tool_hash != out_tool_hash):
            raise MCPToolInvocationError(
                "tool output pin mismatch: "
                f"expected=({pin.tool_version},{pin.tool_hash}) got=({out_tool_version},{out_tool_hash})"
            )

        self._last_call_meta = {
            "tool_name": discovered.tool_name,
            "server_name": discovered.server_name,
            "tool_version": out_tool_version,
            "tool_hash": out_tool_hash,
            "mcp_registry": True,
        }
        return dict(output)

    def _build_server_env(self, extra_env: Dict[str, str]) -> Dict[str, str]:
        env = dict(os.environ)
        env.update({str(k): str(v) for k, v in dict(extra_env or {}).items()})
        return env

    def _discover_server_tools(self, server_name: str, tools: List[Dict[str, Any]]) -> None:
        for tool in list(tools or []):
            if not isinstance(tool, dict):
                continue
            tool_name = str(tool.get("name") or "").strip()
            if not tool_name:
                continue
            if self.allowlist and tool_name not in self.allowlist:
                self._audit_log(
                    level="warning",
                    event="mcp_tool_filtered_by_allowlist",
                    server_name=server_name,
                    tool_name=tool_name,
                )
                continue

            tool_version = str(tool.get("tool_version") or "").strip()
            tool_hash = str(tool.get("tool_hash") or "").strip()
            pin = self.pin_store.get(tool_name)
            if pin is not None:
                if pin.tool_version != tool_version or pin.tool_hash != tool_hash:
                    self._audit_log(
                        level="error",
                        event="mcp_tool_pin_mismatch",
                        server_name=server_name,
                        tool_name=tool_name,
                        expected_tool_version=pin.tool_version,
                        expected_tool_hash=pin.tool_hash,
                        actual_tool_version=tool_version,
                        actual_tool_hash=tool_hash,
                    )
                    continue
            elif not self.allow_unpinned:
                self._audit_log(
                    level="error",
                    event="mcp_tool_unpinned_rejected",
                    server_name=server_name,
                    tool_name=tool_name,
                )
                continue

            discovered = MCPDiscoveredTool(
                tool_name=tool_name,
                server_name=server_name,
                tool_version=tool_version,
                tool_hash=tool_hash,
                spec=dict(tool),
            )
            existing = self._tools.get(tool_name)
            if existing is not None:
                self._resolve_shadowing(existing=existing, incoming=discovered)
                continue
            self._tools[tool_name] = discovered
            self._audit_log(
                level="info",
                event="mcp_tool_discovered",
                server_name=server_name,
                tool_name=tool_name,
                tool_version=tool_version,
                tool_hash=tool_hash,
            )

    def _resolve_shadowing(self, existing: MCPDiscoveredTool, incoming: MCPDiscoveredTool) -> None:
        priority = list(self.tool_priority.get(existing.tool_name) or [])
        if not priority:
            self._audit_log(
                level="error",
                event="mcp_tool_shadowing_detected",
                tool_name=existing.tool_name,
                existing_server=existing.server_name,
                incoming_server=incoming.server_name,
            )
            raise MCPRegistryError(
                f"tool shadowing detected for {existing.tool_name}: "
                f"{existing.server_name} vs {incoming.server_name}"
            )

        def _index(name: str) -> int:
            try:
                return priority.index(name)
            except ValueError:
                return 10_000

        existing_rank = _index(existing.server_name)
        incoming_rank = _index(incoming.server_name)
        if existing_rank == incoming_rank == 10_000:
            self._audit_log(
                level="error",
                event="mcp_tool_shadowing_priority_missing",
                tool_name=existing.tool_name,
                existing_server=existing.server_name,
                incoming_server=incoming.server_name,
            )
            raise MCPRegistryError(
                f"shadowing priority missing for {existing.tool_name}: "
                f"{existing.server_name} vs {incoming.server_name}"
            )

        if incoming_rank < existing_rank:
            self._tools[incoming.tool_name] = incoming
            self._audit_log(
                level="warning",
                event="mcp_tool_shadowing_resolved",
                tool_name=incoming.tool_name,
                winner_server=incoming.server_name,
                loser_server=existing.server_name,
            )
            return

        self._audit_log(
            level="warning",
            event="mcp_tool_shadowing_resolved",
            tool_name=existing.tool_name,
            winner_server=existing.server_name,
            loser_server=incoming.server_name,
        )

    def _validate_input(self, args: Dict[str, Any], input_schema: Dict[str, Any]) -> None:
        if not input_schema:
            return
        self._validate_value(value=args, schema=input_schema, path="$")

    def _validate_value(self, value: Any, schema: Dict[str, Any], path: str) -> None:
        if not isinstance(schema, dict):
            return
        schema_type = schema.get("type")
        if schema_type == "object":
            if not isinstance(value, dict):
                raise MCPRegistryError(f"invalid args at {path}: object required")
            required = list(schema.get("required") or [])
            for key in required:
                if key not in value:
                    raise MCPRegistryError(f"invalid args at {path}: missing required field {key}")
            any_of = list(schema.get("anyOf") or [])
            if any_of:
                passed = False
                for candidate in any_of:
                    if not isinstance(candidate, dict):
                        continue
                    candidate_required = list(candidate.get("required") or [])
                    if candidate_required and all(key in value for key in candidate_required):
                        passed = True
                        break
                if not passed:
                    raise MCPRegistryError(f"invalid args at {path}: anyOf not satisfied")
            properties = schema.get("properties") or {}
            additional_allowed = schema.get("additionalProperties", True)
            if isinstance(properties, dict):
                for key, child in properties.items():
                    if key not in value:
                        continue
                    self._validate_value(value=value.get(key), schema=child, path=f"{path}.{key}")
                if additional_allowed is False:
                    for key in value.keys():
                        if key not in properties:
                            raise MCPRegistryError(f"invalid args at {path}: unexpected field {key}")
            return

        if schema_type == "array":
            if not isinstance(value, list):
                raise MCPRegistryError(f"invalid args at {path}: array required")
            item_schema = schema.get("items")
            if isinstance(item_schema, dict):
                for idx, item in enumerate(value):
                    self._validate_value(value=item, schema=item_schema, path=f"{path}[{idx}]")
            return

        if schema_type == "string":
            if not isinstance(value, str):
                raise MCPRegistryError(f"invalid args at {path}: string required")
            return
        if schema_type == "integer":
            if isinstance(value, bool) or not isinstance(value, int):
                raise MCPRegistryError(f"invalid args at {path}: integer required")
            return
        if schema_type == "number":
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise MCPRegistryError(f"invalid args at {path}: number required")
            return
        if schema_type == "boolean":
            if not isinstance(value, bool):
                raise MCPRegistryError(f"invalid args at {path}: boolean required")
            return

    def _audit_log(self, level: str, event: str, **kwargs: Any) -> None:
        payload = {"event": event}
        payload.update(kwargs)
        message = json.dumps(payload, ensure_ascii=False)
        if level == "error":
            sys_logger.error(message)
        elif level == "warning":
            sys_logger.warning(message)
        else:
            sys_logger.info(message)


_GLOBAL_REGISTRY: Optional[MCPRegistry] = None
_GLOBAL_LOCK = threading.Lock()


def get_global_registry() -> MCPRegistry:
    global _GLOBAL_REGISTRY
    with _GLOBAL_LOCK:
        if _GLOBAL_REGISTRY is None:
            _GLOBAL_REGISTRY = MCPRegistry.from_env()
            _GLOBAL_REGISTRY.start()
        return _GLOBAL_REGISTRY


def reset_global_registry() -> None:
    global _GLOBAL_REGISTRY
    with _GLOBAL_LOCK:
        if _GLOBAL_REGISTRY is not None:
            _GLOBAL_REGISTRY.stop()
        _GLOBAL_REGISTRY = None
