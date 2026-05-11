from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import Request

from observability import get_tracer

from .coordinator import coordinate_agent_message
from .dispatcher import dispatch_agent_message
from .schemas import AgentMessageRequest, AgentMessageResponse
from .synthesizer import synthesize_response


def _resolve_member_authorization(request: Request) -> str:
    for header_name in ("X-AI-Chat-Authorization", "X-Member-Authorization", "Authorization", "authorization"):
        raw = str(request.headers.get(header_name) or "").strip()
        if not raw:
            continue
        if raw.lower().startswith("bearer "):
            raw = raw[7:].strip()
        if raw:
            return raw
    return ""


def handle_agent_message(
    req: AgentMessageRequest,
    *,
    request: Request,
    tenant_id: Optional[str] = None,
    user_id: Optional[str] = None,
) -> AgentMessageResponse:
    trace_sink: list[Dict[str, Any]] = []
    tracer = get_tracer()
    req_id = getattr(request.state, "req_id", "noid")
    member_authorization = _resolve_member_authorization(request)
    run_id = tracer.start_run(
        "agent_v2.message",
        input_data={"message": req.message, "canvas_id": req.canvas_id, "thread_id": req.thread_id},
        metadata={"tenant_id": tenant_id, "user_id": user_id, "req_id": req_id},
        run_id=str(req.thread_id or req_id),
        tags=["agent_v2", "gateway"],
    )
    decision = coordinate_agent_message(req, authorization=member_authorization)
    trace_sink.append(
        {
            "type": "COORDINATOR_DECISION",
            "action": decision.action,
            "reason": decision.reason,
            "confidence": decision.confidence,
            "matched_rule": decision.matched_rule,
            "forced": bool(decision.forced),
            "matched_capabilities": list(decision.matched_capabilities or []),
            "run_id": run_id,
        }
    )
    try:
        payload = dispatch_agent_message(
            req,
            decision,
            request=request,
            trace_sink=trace_sink,
            tenant_id=tenant_id,
            user_id=user_id,
            member_authorization=member_authorization,
        )
        tracer.end_run(run_id, output_data=payload, metadata={"action": decision.action})
        return synthesize_response(decision=decision, payload=payload, trace_sink=trace_sink, ok=True, error=None)
    except Exception as exc:
        trace_sink.append(
            {
                "type": "AGENT_ROUTE_ERROR",
                "action": decision.action,
                "error": str(exc),
                "error_type": type(exc).__name__,
                "run_id": run_id,
            }
        )
        tracer.end_run(run_id, error=str(exc), metadata={"action": decision.action})
        return AgentMessageResponse(
            ok=False,
            action=decision.action,
            intent=(decision.tool_name or decision.action),
            decision=decision,
            data={},
            response_text="",
            trace=trace_sink,
            error=str(exc),
        )
