from __future__ import annotations

from typing import Any


def _run_chitchat_tool(message: str, trace_sink: list, member_authorization: str, thread_id: str) -> dict:
    from agent.tools import AgentToolContext, build_builtin_executor
    executor = build_builtin_executor()
    return dict(executor.execute(
        "agent_chitchat",
        {"message": message},
        context=AgentToolContext(
            req_id=thread_id,
            trace_sink=trace_sink,
            extra={"run_id": thread_id, "member_authorization": member_authorization},
        ),
    ))


def execute_chitchat(state: dict) -> dict:
    task_plan = dict(state.get("task_plan") or {})
    user_goal = str(task_plan.get("user_goal") or "").strip()
    raw_message = str(state.get("message") or "").strip()
    message = user_goal or raw_message
    thread_id = str(state.get("thread_id") or "").strip()
    member_authorization = str(state.get("member_authorization") or "").strip()
    trace = list(state.get("trace") or [])

    tool_trace: list[Any] = []
    payload = _run_chitchat_tool(message, tool_trace, member_authorization, thread_id)
    response_text = str(payload.get("text") or "").strip()

    return {
        "exec_response_text": response_text,
        "exec_patches": [],
        "exec_warnings": [],
        "exec_data": dict(payload),
        "trace": trace + [{"type": "EXECUTE_CHITCHAT", "response_preview": response_text[:120]}],
    }
