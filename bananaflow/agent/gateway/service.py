from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import Request

from .dispatcher import dispatch_agent_message
from .router import coordinate_agent_message
from .schemas import AgentMessageRequest, AgentMessageResponse


def handle_agent_message(
    req: AgentMessageRequest,
    *,
    request: Request,
    tenant_id: Optional[str] = None,
    user_id: Optional[str] = None,
) -> AgentMessageResponse:
    trace_sink: list[Dict[str, Any]] = []
    decision = coordinate_agent_message(req)
    trace_sink.append(
        {
            "type": "COORDINATOR_DECISION",
            "action": decision.action,
            "reason": decision.reason,
            "confidence": decision.confidence,
            "matched_rule": decision.matched_rule,
            "forced": bool(decision.forced),
            "matched_capabilities": list(decision.matched_capabilities or []),
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
        )
        response_text = str(payload.get("response_text") or "").strip()
        trace_sink.append(
            {
                "type": "RESPONSE_SYNTHESIZED",
                "action": decision.action,
                "response_preview": (response_text[:200] if response_text else ""),
            }
        )
        return AgentMessageResponse(
            ok=True,
            action=decision.action,
            intent=(decision.tool_name or decision.action),
            decision=decision,
            data=dict(payload.get("data") or payload),
            response_text=response_text,
            trace=trace_sink,
            error=None,
        )
    except Exception as exc:
        trace_sink.append(
            {
                "type": "AGENT_ROUTE_ERROR",
                "action": decision.action,
                "error": str(exc),
                "error_type": type(exc).__name__,
            }
        )
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
