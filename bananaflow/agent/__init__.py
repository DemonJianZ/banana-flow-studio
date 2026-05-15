"""Bananaflow Agent package.

This package stays import-light on purpose.

Primary runtime architecture:

    /api/agent/message
      -> agent_v2.gateway.service.handle_agent_message
      -> planner / tools / retrieval / chitchat
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

__all__ = [
    "AgentMessageRequest",
    "AgentMessageResponse",
    "CoordinatorDecision",
    "agent_plan_impl",
    "handle_agent_message",
]

if TYPE_CHECKING:  # pragma: no cover
    try:
        from ..agent_v2.gateway.schemas import AgentMessageRequest, AgentMessageResponse, CoordinatorDecision
        from ..agent_v2.gateway.service import handle_agent_message
    except Exception:
        from agent_v2.gateway.schemas import AgentMessageRequest, AgentMessageResponse, CoordinatorDecision
        from agent_v2.gateway.service import handle_agent_message

    from .planner import agent_plan_impl


def __getattr__(name: str) -> Any:  # pragma: no cover
    if name == "agent_plan_impl":
        from .planner import agent_plan_impl

        return agent_plan_impl

    if name in {"AgentMessageRequest", "AgentMessageResponse", "CoordinatorDecision"}:
        try:
            from ..agent_v2.gateway.schemas import (
                AgentMessageRequest,
                AgentMessageResponse,
                CoordinatorDecision,
            )
        except Exception:
            from agent_v2.gateway.schemas import (  # type: ignore
                AgentMessageRequest,
                AgentMessageResponse,
                CoordinatorDecision,
            )

        mapping = {
            "AgentMessageRequest": AgentMessageRequest,
            "AgentMessageResponse": AgentMessageResponse,
            "CoordinatorDecision": CoordinatorDecision,
        }
        return mapping[name]

    if name == "handle_agent_message":
        try:
            from ..agent_v2.gateway.service import handle_agent_message
        except Exception:
            from agent_v2.gateway.service import handle_agent_message  # type: ignore

        return handle_agent_message

    raise AttributeError(name)
