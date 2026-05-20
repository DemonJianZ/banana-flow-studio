from __future__ import annotations

from typing import Any


def build_response(state: dict) -> dict:
    intent = str(state.get("intent") or "answer_only")
    thread_id = str(state.get("thread_id") or "").strip()
    exec_response_text = str(state.get("exec_response_text") or "").strip()
    exec_patches = list(state.get("exec_patches") or [])
    exec_warnings = list(state.get("exec_warnings") or [])
    exec_data = dict(state.get("exec_data") or {})
    tool_name = str(state.get("tool_name") or "").strip()
    trace = list(state.get("trace") or [])

    # Determine async_task (storyboard async)
    async_task: dict | None = None
    tool_result: dict | None = None
    thought: str | None = None

    if exec_data.get("_async_storyboard"):
        async_task = {
            "task_id": str(exec_data.get("task_id") or ""),
            "status": str(exec_data.get("status") or "pending"),
            "tool_args": dict(exec_data.get("tool_args") or {}),
            "authorization": str(exec_data.get("authorization") or ""),
            "thread_id": str(exec_data.get("thread_id") or thread_id),
        }
    elif intent == "tool_call" and exec_data and not async_task:
        tool_result = dict(exec_data)

    # Message text
    message = exec_response_text
    if not message and tool_name in {"prompt.polish"}:
        message = str(exec_data.get("text") or "").strip()

    task_plan = dict(state.get("task_plan") or {})
    trace_entry: dict[str, Any] = {
        "type": "BUILD_RESPONSE",
        "intent": intent,
        "message_preview": message[:120] if message else "",
        "patch_count": len(exec_patches),
        "task_type": str(task_plan.get("task_type") or ""),
        "user_goal": str(task_plan.get("user_goal") or "")[:60],
    }

    final_response: dict[str, Any] = {
        "ok": True,
        "message": message,
        "patches": exec_patches,
        "warnings": exec_warnings,
        "intent": intent,
        "thread_id": thread_id,
        "async_task": async_task,
        "tool_result": tool_result,
        "thought": thought,
        "trace": trace + [trace_entry],
        "error": None,
    }

    # Append this turn to conversation_history (operator.add reducer will merge)
    user_msg = str(state.get("message") or "").strip()
    new_history: list[dict[str, Any]] = []
    if user_msg:
        new_history.append({"role": "user", "text": user_msg})
    if message:
        new_history.append({"role": "assistant", "text": message})

    return {
        "final_response": final_response,
        "trace": trace + [trace_entry],
        "conversation_history": new_history,  # operator.add merges into checkpoint
    }
