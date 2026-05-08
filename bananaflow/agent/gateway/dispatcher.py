from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import Request

from agent.capability_executors import run_agent_drama, run_agent_idea_script_core
from agent.gateway.schemas import AgentMessageRequest, CoordinatorDecision, CoordinatorStep
from agent.idea_script.schemas import IdeaScriptRequest
from agent.planner import agent_plan_impl
from agent.tools import AgentToolContext, build_builtin_executor
from schemas.api import AgentDramaRequest, AgentRequest


_TOOL_EXECUTOR = build_builtin_executor()


def dispatch_agent_message(
    req: AgentMessageRequest,
    decision: CoordinatorDecision,
    *,
    request: Request,
    trace_sink: list[Dict[str, Any]],
    tenant_id: Optional[str] = None,
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    req_id = getattr(request.state, "req_id", "noid")

    if decision.action == "answer_only":
        answer = str(decision.answer or "").strip()
        if answer:
            return {"response_text": answer, "action": "answer_only"}
        payload = _TOOL_EXECUTOR.execute(
            "agent_chitchat",
            {"message": str(req.message or "")},
            context=AgentToolContext(req_id=req_id, trace_sink=trace_sink),
        )
        return {"response_text": str(payload.get("text") or "").strip(), "tool_result": dict(payload), "action": "answer_only"}

    if decision.action == "clarify":
        question = str(decision.clarification_question or "").strip() or "我需要你补充一点信息，才能继续处理。"
        return {"response_text": question, "action": "clarify"}

    if decision.action == "canvas_plan":
        trace_sink.append({"type": "AGENT_PLANNER_RUN", "mode": "canvas_plan", "req_id": req_id, "ok": None})
        plan_req = AgentRequest(
            prompt=str(req.message or ""),
            supplemental_prompt=req.supplemental_prompt,
            current_nodes=list(req.current_nodes or []),
            current_connections=list(req.current_connections or []),
            selected_artifact=req.selected_artifact,
            canvas_id=req.canvas_id,
            thread_id=req.thread_id,
        )
        result = dict(agent_plan_impl(plan_req, request))
        trace_sink.append({"type": "AGENT_PLANNER_RUN", "mode": "canvas_plan", "req_id": req_id, "ok": True})
        return {"planner_result": result, "data": result, "response_text": str(decision.answer or "").strip(), "action": "canvas_plan"}

    if decision.action == "tool_call":
        tool_name = str(decision.tool_name or "").strip()
        tool_args = dict(decision.tool_args or {})
        if not tool_name or not _TOOL_EXECUTOR.registry.has(tool_name):
            payload = _TOOL_EXECUTOR.execute(
                "agent_chitchat",
                {"message": str(req.message or "")},
                context=AgentToolContext(req_id=req_id, trace_sink=trace_sink),
            )
            return {
                "response_text": str(payload.get("text") or "").strip(),
                "tool_result": dict(payload),
                "action": "answer_only",
            }
        if tool_name == "prompt.polish" and "prompt" not in tool_args:
            tool_args = {
                "prompt": str(req.message or "").strip(),
                "mode": str(req.mode or "text2img").strip() or "text2img",
            }
        payload = _TOOL_EXECUTOR.execute(
            tool_name,
            tool_args,
            context=AgentToolContext(req_id=req_id, trace_sink=trace_sink, tenant_id=tenant_id, user_id=user_id),
        )
        response_text = str(decision.answer or "").strip()
        if not response_text and tool_name in {"prompt.polish", "agent_chitchat"}:
            response_text = str(payload.get("text") or "").strip()
        return {"tool_result": dict(payload), "data": dict(payload), "response_text": response_text, "action": "tool_call"}

    if decision.action == "workflow_plan":
        workflow_results = []
        for step in list(decision.steps or []):
            workflow_results.append(_execute_workflow_step(req, step, request=request, trace_sink=trace_sink, tenant_id=tenant_id, user_id=user_id))
        return {
            "workflow_results": workflow_results,
            "data": {"steps": workflow_results},
            "response_text": str(decision.answer or "").strip(),
            "action": "workflow_plan",
        }

    idea_capability = "agent_idea_script_generate" if "agent_idea_script_generate" in decision.matched_capabilities else ""
    drama_capability = "agent_drama_generate" if "agent_drama_generate" in decision.matched_capabilities else ""
    if idea_capability:
        idea_req = IdeaScriptRequest(
            product=str(req.product or req.message or "").strip(),
            audience=req.audience,
            price_band=req.price_band,
            conversion_goal=req.conversion_goal,
            primary_platform=req.primary_platform,
            secondary_platform=req.secondary_platform,
            selected_angle=req.selected_angle,
        )
        out = run_agent_idea_script_core(
            idea_req,
            session_id=None,
            session_summary_present=False,
            tenant_id=tenant_id,
            user_id=user_id,
            trajectory_sink=[],
            trace_sink=trace_sink,
        )
        result = out.model_dump(mode="json")
        return {"data": result, "response_text": str(decision.answer or "").strip(), "action": "tool_call"}

    if drama_capability:
        drama_req = AgentDramaRequest(
            prompt=str(req.message or "").strip(),
            task_mode=str(req.task_mode or "").strip(),
            episode_count=req.episode_count,
            existing_script=req.existing_script,
        )
        out = run_agent_drama(drama_req, getattr(request.state, "req_id", "noid"))
        result = out.model_dump(mode="json")
        return {"data": result, "response_text": str(decision.answer or "").strip(), "action": "tool_call"}

    payload = _TOOL_EXECUTOR.execute(
        "agent_chitchat",
        {"message": str(req.message or "")},
        context=AgentToolContext(req_id=req_id, trace_sink=trace_sink),
    )
    return {"response_text": str(payload.get("text") or "").strip(), "tool_result": dict(payload), "action": "answer_only"}


def _execute_workflow_step(
    req: AgentMessageRequest,
    step: CoordinatorStep,
    *,
    request: Request,
    trace_sink: list[Dict[str, Any]],
    tenant_id: Optional[str],
    user_id: Optional[str],
) -> Dict[str, Any]:
    req_id = getattr(request.state, "req_id", "noid")
    if step.action == "canvas_plan":
        trace_sink.append({"type": "AGENT_PLANNER_RUN", "mode": "workflow.canvas_plan", "req_id": req_id, "ok": None})
        plan_req = AgentRequest(
            prompt=str(req.message or ""),
            supplemental_prompt=req.supplemental_prompt,
            current_nodes=list(req.current_nodes or []),
            current_connections=list(req.current_connections or []),
            selected_artifact=req.selected_artifact,
            canvas_id=req.canvas_id,
            thread_id=req.thread_id,
        )
        result = dict(agent_plan_impl(plan_req, request))
        trace_sink.append({"type": "AGENT_PLANNER_RUN", "mode": "workflow.canvas_plan", "req_id": req_id, "ok": True})
        return {"action": "canvas_plan", "result": result, "reason": step.reason}

    tool_name = str(step.tool_name or "").strip()
    if not tool_name or not _TOOL_EXECUTOR.registry.has(tool_name):
        return {"action": "tool_call", "tool_name": tool_name, "error": "unsupported_tool", "reason": step.reason}
    payload = _TOOL_EXECUTOR.execute(
        tool_name,
        dict(step.tool_args or {}),
        context=AgentToolContext(req_id=req_id, trace_sink=trace_sink, tenant_id=tenant_id, user_id=user_id),
    )
    return {"action": "tool_call", "tool_name": tool_name, "result": dict(payload), "reason": step.reason}
