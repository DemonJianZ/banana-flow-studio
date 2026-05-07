from __future__ import annotations


class AgentToolError(RuntimeError):
    """Base error for Bananaflow agent tools."""


class AgentToolAlreadyRegisteredError(AgentToolError):
    """Raised when a tool name is registered twice."""


class AgentToolNotFoundError(AgentToolError):
    """Raised when a requested tool name does not exist."""


class AgentToolValidationError(AgentToolError):
    """Raised when tool arguments fail schema validation."""


class AgentToolExecutionError(AgentToolError):
    """Raised when a tool handler fails at runtime."""
