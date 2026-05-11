from __future__ import annotations

from typing import Any, Dict

from .schemas import AgentMessageResponse, CoordinatorDecision


def synthesize_response(
    *,
    decision: CoordinatorDecision,
    payload: Dict[str, Any],
    trace_sink: list[Dict[str, Any]],
    ok: bool = True,
    error: str | None = None,
) -> AgentMessageResponse:
    response_text = str(payload.get("response_text") or "").strip()
    trace_sink.append(
        {
            "type": "RESPONSE_SYNTHESIZED",
            "action": decision.action,
            "response_preview": response_text[:200] if response_text else "",
        }
    )
    return AgentMessageResponse(
        ok=ok,
        action=decision.action,
        intent=(decision.tool_name or decision.action),
        decision=decision,
        data=dict(payload.get("data") or payload),
        response_text=response_text,
        trace=trace_sink,
        error=error,
    )
