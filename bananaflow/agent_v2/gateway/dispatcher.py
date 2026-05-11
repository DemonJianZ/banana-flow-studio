from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import Request

from agent.tools import AgentToolContext, build_builtin_executor

from agent_v2.canvas import run_canvas_planner
from agent_v2.storyboard import build_storyboard_canvas_patch

from .schemas import AgentMessageRequest, CoordinatorDecision, CoordinatorStep


_TOOL_EXECUTOR = build_builtin_executor()


def _resolve_tool_name(decision: CoordinatorDecision) -> str:
    tool_name = str(decision.tool_name or "").strip()
    if tool_name and _TOOL_EXECUTOR.registry.has(tool_name):
        return tool_name
    for name in list(decision.matched_capabilities or []):
        candidate = str(name or "").strip()
        if candidate and _TOOL_EXECUTOR.registry.has(candidate):
            return candidate
    return ""


def dispatch_agent_message(
    req: AgentMessageRequest,
    decision: CoordinatorDecision,
    *,
    request: Request,
    trace_sink: list[Dict[str, Any]],
    tenant_id: Optional[str] = None,
    user_id: Optional[str] = None,
    member_authorization: str = "",
) -> Dict[str, Any]:
    req_id = getattr(request.state, "req_id", "noid")
    if decision.action == "answer_only":
        answer = str(decision.answer or "").strip()
        if answer:
            return {"action": "answer_only", "response_text": answer}
        payload = _TOOL_EXECUTOR.execute(
            "agent_chitchat",
            {"message": str(req.message or "")},
            context=AgentToolContext(
                req_id=req_id,
                trace_sink=trace_sink,
                tenant_id=tenant_id,
                user_id=user_id,
                extra={"run_id": str(req.thread_id or req_id), "member_authorization": member_authorization},
            ),
        )
        return {"action": "answer_only", "response_text": str(payload.get("text") or "").strip(), "data": dict(payload)}

    if decision.action == "clarify":
        question = str(decision.clarification_question or "").strip() or "我还需要一点信息，才能继续处理。"
        return {"action": "clarify", "response_text": question}

    if decision.action == "canvas_plan":
        trace_sink.append({"type": "AGENT_PLANNER_RUN", "mode": "canvas_plan", "req_id": req_id, "ok": None})
        result = run_canvas_planner(req, request)
        trace_sink.append({"type": "AGENT_PLANNER_RUN", "mode": "canvas_plan", "req_id": req_id, "ok": True})
        return {
            "action": "canvas_plan",
            "response_text": str(decision.answer or "").strip(),
            "data": result,
            "planner_result": result,
        }

    if decision.action == "tool_call":
        tool_name = _resolve_tool_name(decision)
        tool_args = dict(decision.tool_args or {})
        if not tool_name:
            payload = _TOOL_EXECUTOR.execute(
                "agent_chitchat",
                {"message": str(req.message or "")},
                context=AgentToolContext(req_id=req_id, trace_sink=trace_sink, tenant_id=tenant_id, user_id=user_id),
            )
            return {"action": "answer_only", "response_text": str(payload.get("text") or "").strip(), "data": dict(payload)}
        if tool_name == "prompt.polish" and "prompt" not in tool_args:
            tool_args = {"prompt": str(req.message or "").strip(), "mode": str(req.mode or "text2img").strip() or "text2img"}
        payload = _TOOL_EXECUTOR.execute(
            tool_name,
            tool_args,
            context=AgentToolContext(
                req_id=req_id,
                trace_sink=trace_sink,
                tenant_id=tenant_id,
                user_id=user_id,
                extra={"run_id": str(req.thread_id or req_id), "member_authorization": member_authorization},
            ),
        )
        if tool_name in {"storyboard.design", "agent_storyboard_design"}:
            storyboard_patch = build_storyboard_canvas_patch(payload)
            payload = {
                **dict(payload),
                "canvas_patch": storyboard_patch,
            }
        response_text = str(decision.answer or "").strip()
        if not response_text and tool_name in {"prompt.polish", "agent_chitchat"}:
            response_text = str(payload.get("text") or "").strip()
        if not response_text and tool_name in {"storyboard.design", "agent_storyboard_design"}:
            response_text = "已生成可编辑分镜方案。"
        return {"action": "tool_call", "response_text": response_text, "data": dict(payload), "tool_result": dict(payload)}

    if decision.action == "workflow_plan":
        results = []
        for step in list(decision.steps or []):
            results.append(
                _execute_workflow_step(
                    req,
                    step,
                    request=request,
                    trace_sink=trace_sink,
                    tenant_id=tenant_id,
                    user_id=user_id,
                    member_authorization=member_authorization,
                )
            )
        return {
            "action": "workflow_plan",
            "response_text": str(decision.answer or "").strip(),
            "data": {"steps": results},
            "workflow_results": results,
        }

    payload = _TOOL_EXECUTOR.execute(
        "agent_chitchat",
        {"message": str(req.message or "")},
        context=AgentToolContext(
            req_id=req_id,
            trace_sink=trace_sink,
            tenant_id=tenant_id,
            user_id=user_id,
            extra={"run_id": str(req.thread_id or req_id), "member_authorization": member_authorization},
        ),
    )
    return {"action": "answer_only", "response_text": str(payload.get("text") or "").strip(), "data": dict(payload)}


def _execute_workflow_step(
    req: AgentMessageRequest,
    step: CoordinatorStep,
    *,
    request: Request,
    trace_sink: list[Dict[str, Any]],
    tenant_id: Optional[str],
    user_id: Optional[str],
    member_authorization: str,
) -> Dict[str, Any]:
    req_id = getattr(request.state, "req_id", "noid")
    if step.action == "canvas_plan":
        trace_sink.append({"type": "AGENT_PLANNER_RUN", "mode": "workflow.canvas_plan", "req_id": req_id, "ok": None})
        result = run_canvas_planner(req, request)
        trace_sink.append({"type": "AGENT_PLANNER_RUN", "mode": "workflow.canvas_plan", "req_id": req_id, "ok": True})
        return {"action": "canvas_plan", "reason": step.reason, "result": result}

    tool_name = str(step.tool_name or "").strip()
    if not tool_name or not _TOOL_EXECUTOR.registry.has(tool_name):
        return {"action": "tool_call", "tool_name": tool_name, "reason": step.reason, "error": "unsupported_tool"}
    payload = _TOOL_EXECUTOR.execute(
        tool_name,
        dict(step.tool_args or {}),
        context=AgentToolContext(
            req_id=req_id,
            trace_sink=trace_sink,
            tenant_id=tenant_id,
            user_id=user_id,
            extra={"run_id": str(req.thread_id or req_id), "member_authorization": member_authorization},
        ),
    )
    if tool_name in {"storyboard.design", "agent_storyboard_design"}:
        payload = {**dict(payload), "canvas_patch": build_storyboard_canvas_patch(payload)}
    return {"action": "tool_call", "tool_name": tool_name, "reason": step.reason, "result": dict(payload)}
