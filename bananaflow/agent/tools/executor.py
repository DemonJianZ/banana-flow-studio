from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Optional

from .errors import AgentToolExecutionError
from .registry import AgentToolRegistry


@dataclass
class AgentToolContext:
    req_id: str = "tool"
    session_id: Optional[str] = None
    session_summary_present: Optional[bool] = None
    tenant_id: Optional[str] = None
    user_id: Optional[str] = None
    trajectory_sink: list[Dict[str, Any]] = field(default_factory=list)
    trace_sink: list[Dict[str, Any]] = field(default_factory=list)
    plan_lookup: Optional[Callable[[str], Optional[Dict[str, Any]]]] = None
    extra: Dict[str, Any] = field(default_factory=dict)


class AgentToolExecutor:
    def __init__(self, registry: AgentToolRegistry) -> None:
        self.registry = registry
        self._last_call_meta: Dict[str, Any] = {}

    def get_last_call_meta(self) -> Dict[str, Any]:
        return dict(self._last_call_meta)

    def execute(
        self,
        tool_name: str,
        args: Optional[Dict[str, Any]] = None,
        *,
        context: Optional[AgentToolContext] = None,
    ) -> Dict[str, Any]:
        entry = self.registry.get(tool_name)
        payload = entry.spec.validate_input(dict(args or {}))
        call_context = context or AgentToolContext()
        try:
            result = entry.handler(payload, call_context)
        except Exception as exc:
            if isinstance(exc, AgentToolExecutionError):
                raise
            raise AgentToolExecutionError(f"{tool_name} failed: {exc}") from exc
        if not isinstance(result, dict):
            raise AgentToolExecutionError(f"{tool_name} returned non-object result")

        output = dict(result)
        output.setdefault("tool_name", entry.spec.name)
        output.setdefault("tool_version", entry.spec.tool_version)
        output.setdefault("tool_hash", entry.spec.tool_hash)
        self._last_call_meta = {
            "tool_name": entry.spec.name,
            "tool_version": entry.spec.tool_version,
            "tool_hash": entry.spec.tool_hash,
            "req_id": call_context.req_id,
            "agent_tool_registry": True,
        }
        return output
