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
        self._aliases: Dict[str, str] = {}

    def register(self, spec: AgentToolSpec, handler: ToolHandler) -> RegisteredAgentTool:
        name = str(spec.name or "").strip()
        if not name:
            raise ValueError("tool name is required")
        if name in self._tools or name in self._aliases:
            raise AgentToolAlreadyRegisteredError(f"tool already registered: {name}")
        alias_names = [str(alias).strip() for alias in list(spec.aliases or []) if str(alias).strip()]
        collisions = [alias for alias in alias_names if alias in self._tools or alias in self._aliases]
        if collisions:
            raise AgentToolAlreadyRegisteredError(f"tool alias already registered: {collisions[0]}")
        entry = RegisteredAgentTool(spec=spec, handler=handler)
        self._tools[name] = entry
        for alias in alias_names:
            self._aliases[alias] = name
        return entry

    def register_many(self, entries: List[tuple[AgentToolSpec, ToolHandler]]) -> None:
        for spec, handler in list(entries or []):
            self.register(spec, handler)

    def get(self, tool_name: str) -> RegisteredAgentTool:
        name = str(tool_name or "").strip()
        canonical_name = self._aliases.get(name, name)
        entry = self._tools.get(canonical_name)
        if entry is None:
            raise AgentToolNotFoundError(f"tool not registered: {name}")
        return entry

    def has(self, tool_name: str) -> bool:
        name = str(tool_name or "").strip()
        return name in self._tools or name in self._aliases

    def list_tools(self) -> List[Dict[str, Any]]:
        return [entry.spec.to_dict() for _, entry in sorted(self._tools.items(), key=lambda item: item[0])]

    def list_tool_names(self) -> List[str]:
        return sorted(set(self._tools.keys()) | set(self._aliases.keys()))

    def get_tool_info(self, tool_name: str) -> Optional[Dict[str, Any]]:
        if not self.has(tool_name):
            return None
        name = str(tool_name or "").strip()
        entry = self.get(name)
        payload = entry.spec.to_dict()
        payload["lookup_name"] = name
        payload["canonical_name"] = entry.spec.name
        return payload

    def to_prompt_catalog(self) -> List[Dict[str, Any]]:
        return [entry.spec.to_prompt_catalog() for _, entry in sorted(self._tools.items(), key=lambda item: item[0])]
