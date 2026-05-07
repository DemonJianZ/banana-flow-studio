from __future__ import annotations

from .errors import (
    AgentToolAlreadyRegisteredError,
    AgentToolError,
    AgentToolExecutionError,
    AgentToolNotFoundError,
    AgentToolValidationError,
)
from .executor import AgentToolContext, AgentToolExecutor, AgentToolResult
from .registry import AgentToolRegistry
from .specs import AgentToolSpec


def register_builtin_tools(registry: AgentToolRegistry) -> AgentToolRegistry:
    from .builtin import register_builtin_tools as _register_builtin_tools

    return _register_builtin_tools(registry)


def build_builtin_registry() -> AgentToolRegistry:
    from .builtin import build_builtin_registry as _build_builtin_registry

    return _build_builtin_registry()


def build_builtin_executor() -> AgentToolExecutor:
    from .builtin import build_builtin_executor as _build_builtin_executor

    return _build_builtin_executor()

__all__ = [
    "AgentToolAlreadyRegisteredError",
    "AgentToolContext",
    "AgentToolError",
    "AgentToolExecutionError",
    "AgentToolExecutor",
    "AgentToolNotFoundError",
    "AgentToolRegistry",
    "AgentToolResult",
    "AgentToolSpec",
    "AgentToolValidationError",
    "build_builtin_executor",
    "build_builtin_registry",
    "register_builtin_tools",
]
