"""
nodes/build_response.py — Assemble the final AgentInvokeResponse and
append this turn's messages to conversation_history.
"""
from __future__ import annotations

import time
from typing import Any, Dict

from langchain_core.messages import AIMessage, HumanMessage

from ..state import AgentState


def build_response(state: AgentState) -> Dict[str, Any]:
    """
    Collect exec_* fields into final_response and append to conversation_history.

    The conversation_history uses add_messages reducer, so we just append
    the HumanMessage + AIMessage pair for this turn.
    """
    t0 = time.time()

    response_text = str(state.get("exec_response_text") or "")
    patches = list(state.get("exec_patches") or [])
    warnings = list(state.get("exec_warnings") or [])
    intent = str(state.get("intent") or "answer_only")
    thread_id = str(state.get("thread_id") or "")
    exec_data = dict(state.get("exec_data") or {})

    final = {
        "ok": True,
        "message": response_text,
        "patches": patches,
        "warnings": warnings,
        "intent": intent,
        "thread_id": thread_id,
        "exec_data": exec_data,
        "async_task": exec_data.get("async_task"),
        "error": None,
    }

    # Append this turn to conversation_history (checkpointer persists it)
    user_msg = state.get("message", "")
    new_history = []
    if user_msg:
        new_history.append(HumanMessage(content=user_msg))
    if response_text:
        new_history.append(AIMessage(content=response_text))

    return {
        "final_response": final,
        "conversation_history": new_history,   # add_messages reducer merges this
        "trace": [{"node": "build_response", "ts": t0,
                   "intent": intent, "response_len": len(response_text)}],
    }
