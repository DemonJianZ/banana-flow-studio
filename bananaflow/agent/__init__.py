"""Bananaflow Agent package.

Primary runtime architecture:

    /api/agent/message
      -> gateway.service.handle_agent_message
      -> gateway.router.coordinate_agent_message
      -> gateway.dispatcher.dispatch_agent_message
      -> planner / tools / retrieval / chitchat

Legacy `/api/agent/*` capability endpoints remain supported through
`capability_executors.py`, but the coordinator gateway is the preferred entrypoint.
"""

from .gateway import AgentMessageRequest, AgentMessageResponse, CoordinatorDecision, handle_agent_message
from .planner import agent_plan_impl

__all__ = [
    "AgentMessageRequest",
    "AgentMessageResponse",
    "CoordinatorDecision",
    "agent_plan_impl",
    "handle_agent_message",
]
