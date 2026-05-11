from __future__ import annotations

from typing import Any, Dict

from fastapi import Request

from agent.planner import agent_plan_impl
from schemas.api import AgentRequest

from agent_v2.gateway.schemas import AgentMessageRequest


def run_canvas_planner(req: AgentMessageRequest, request: Request) -> Dict[str, Any]:
    plan_req = AgentRequest(
        prompt=str(req.message or ""),
        supplemental_prompt=req.supplemental_prompt,
        current_nodes=list(req.current_nodes or []),
        current_connections=list(req.current_connections or []),
        selected_artifact=req.selected_artifact,
        canvas_id=req.canvas_id,
        thread_id=req.thread_id,
    )
    return dict(agent_plan_impl(plan_req, request))
