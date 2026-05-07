from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional

from .errors import AgentToolAlreadyRegisteredError, AgentToolNotFoundError
from .specs import AgentToolSpec


ToolHandler = Callable[[Dict[str, Any], Any], Dict[str, Any]]


@dataclass(frozen=True)
class RegisteredAgentTool:
    spec: AgentToolSpec
    handler: ToolHandler


class AgentToolRegistry:
    def __init__(self) -> None:
        self._tools: Dict[str, RegisteredAgentTool] = {}

    def register(self, spec: AgentToolSpec, handler: ToolHandler) -> RegisteredAgentTool:
        name = str(spec.name or "").strip()
        if not name:
            raise ValueError("tool name is required")
        if name in self._tools:
            raise AgentToolAlreadyRegisteredError(f"tool already registered: {name}")
        entry = RegisteredAgentTool(spec=spec, handler=handler)
        self._tools[name] = entry
        return entry

    def register_many(self, entries: List[tuple[AgentToolSpec, ToolHandler]]) -> None:
        for spec, handler in list(entries or []):
            self.register(spec, handler)

    def get(self, tool_name: str) -> RegisteredAgentTool:
        name = str(tool_name or "").strip()
        entry = self._tools.get(name)
        if entry is None:
            raise AgentToolNotFoundError(f"tool not registered: {name}")
        return entry

    def has(self, tool_name: str) -> bool:
        return str(tool_name or "").strip() in self._tools

    def list_tools(self) -> List[Dict[str, Any]]:
        return [entry.spec.to_dict() for _, entry in sorted(self._tools.items(), key=lambda item: item[0])]

    def list_tool_names(self) -> List[str]:
        return sorted(self._tools.keys())

    def get_tool_info(self, tool_name: str) -> Optional[Dict[str, Any]]:
        name = str(tool_name or "").strip()
        entry = self._tools.get(name)
        return None if entry is None else entry.spec.to_dict()
