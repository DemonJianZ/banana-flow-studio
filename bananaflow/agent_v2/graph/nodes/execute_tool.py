from __future__ import annotations

from typing import Any


_STORYBOARD_TOOL_NAMES = {"storyboard.design", "agent_storyboard_design"}
_SHOT_WORKFLOW_TOOL_NAMES = {"shot_workflow.compose", "agent_shot_workflow_compose"}
_SCRIPT_EXTRACT_TOOL_NAMES = {"shot_workflow.extract"}
_ASSET_CANVAS_TOOL_NAMES = {"shot_workflow.build_asset_canvas"}
_VIDEO_CANVAS_TOOL_NAMES = {"shot_workflow.build_video_canvas"}


def _run_tool(
    tool_name: str,
    tool_args: dict,
    thread_id: str,
    trace_sink: list,
    member_authorization: str,
) -> dict:
    from agent.tools import AgentToolContext, build_builtin_executor

    executor = build_builtin_executor()
    return dict(
        executor.execute(
            tool_name,
            tool_args,
            context=AgentToolContext(
                req_id=thread_id,
                trace_sink=trace_sink,
                extra={"run_id": thread_id, "member_authorization": member_authorization},
            ),
        )
    )


def _run_chitchat_fallback(
    message: str,
    thread_id: str,
    trace_sink: list,
    member_authorization: str,
) -> dict:
    from agent.tools import AgentToolContext, build_builtin_executor

    executor = build_builtin_executor()
    return dict(
        executor.execute(
            "agent_chitchat",
            {"message": message},
            context=AgentToolContext(
                req_id=thread_id,
                trace_sink=trace_sink,
                extra={"run_id": thread_id, "member_authorization": member_authorization},
            ),
        )
    )


def execute_tool_call(state: dict) -> dict:
    tool_name = str(state.get("tool_name") or "").strip()
    tool_args = dict(state.get("tool_args") or {})
    message = str(state.get("message") or "").strip()
    thread_id = str(state.get("thread_id") or "").strip()
    member_authorization = str(state.get("member_authorization") or "").strip()
    trace = list(state.get("trace") or [])
    tool_trace: list[Any] = []
    task_plan = dict(state.get("task_plan") or {})

    if tool_name in _STORYBOARD_TOOL_NAMES:
        return {
            "exec_response_text": "",
            "exec_patches": [],
            "exec_warnings": [],
            "exec_data": {},
            "trace": trace + [{"type": "EXECUTE_TOOL_CALL", "tool": tool_name, "delegated_to": "execute_storyboard"}],
        }
    if tool_name in _SHOT_WORKFLOW_TOOL_NAMES:
        return {
            "exec_response_text": "",
            "exec_patches": [],
            "exec_warnings": [],
            "exec_data": {},
            "trace": trace + [{"type": "EXECUTE_TOOL_CALL", "tool": tool_name, "delegated_to": "execute_shot_workflow"}],
        }
    if tool_name in _SCRIPT_EXTRACT_TOOL_NAMES:
        return {
            "exec_response_text": "",
            "exec_patches": [],
            "exec_warnings": [],
            "exec_data": {},
            "trace": trace + [{"type": "EXECUTE_TOOL_CALL", "tool": tool_name, "delegated_to": "execute_script_extract"}],
        }
    if tool_name in _ASSET_CANVAS_TOOL_NAMES:
        return {
            "exec_response_text": "",
            "exec_patches": [],
            "exec_warnings": [],
            "exec_data": {},
            "trace": trace + [{"type": "EXECUTE_TOOL_CALL", "tool": tool_name, "delegated_to": "execute_build_asset_canvas"}],
        }
    if tool_name in _VIDEO_CANVAS_TOOL_NAMES:
        return {
            "exec_response_text": "",
            "exec_patches": [],
            "exec_warnings": [],
            "exec_data": {},
            "trace": trace + [{"type": "EXECUTE_TOOL_CALL", "tool": tool_name, "delegated_to": "execute_build_video_canvas"}],
        }

    # Verify tool exists before attempting execution
    from agent.tools import build_builtin_registry

    registry = build_builtin_registry()
    if not tool_name or not registry.has(tool_name):
        payload = _run_chitchat_fallback(message, thread_id, tool_trace, member_authorization)
        return {
            "exec_response_text": str(payload.get("text") or "").strip(),
            "exec_patches": [],
            "exec_warnings": [f"tool_not_found:{tool_name}"],
            "exec_data": dict(payload),
            "trace": trace + [{"type": "EXECUTE_TOOL_CALL", "tool": tool_name, "fallback": True}],
        }

    # Ensure prompt.polish args are populated
    if tool_name == "prompt.polish" and "prompt" not in tool_args:
        user_goal = str(task_plan.get("user_goal") or "").strip()
        tool_args = {
            "prompt": user_goal or message,
            "mode": str(state.get("mode") or "text2img").strip() or "text2img",
        }

    try:
        payload = _run_tool(tool_name, tool_args, thread_id, tool_trace, member_authorization)
    except Exception as exc:
        return {
            "exec_response_text": f"操作失败（{tool_name}）：{type(exc).__name__}: {exc}",
            "exec_patches": [],
            "exec_warnings": [f"tool_error:{tool_name}:{exc}"],
            "exec_data": {"tool_name": tool_name, "error": str(exc)},
            "trace": trace
            + [{"type": "EXECUTE_TOOL_CALL", "tool": tool_name, "ok": False, "error": str(exc)}],
        }

    return {
        "exec_response_text": "",  # build_response fills this from tool_result
        "exec_patches": [],
        "exec_warnings": [],
        "exec_data": dict(payload),
        "trace": trace + [{"type": "EXECUTE_TOOL_CALL", "tool": tool_name, "ok": True}],
    }
