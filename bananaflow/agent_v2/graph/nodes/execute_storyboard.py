from __future__ import annotations


def _create_storyboard_task(thread_id: str) -> str:
    from storage.storyboard_tasks import create_storyboard_task

    return create_storyboard_task(thread_id=thread_id)


def execute_storyboard(state: dict) -> dict:
    thread_id = str(state.get("thread_id") or "").strip()
    tool_args = dict(state.get("tool_args") or {})
    trace = list(state.get("trace") or [])
    task_plan = dict(state.get("task_plan") or {})

    task_id = _create_storyboard_task(thread_id)
    async_data = {
        "task_id": task_id,
        "status": "pending",
        "tool_args": tool_args,
        "authorization": str(state.get("member_authorization") or "").strip(),
        "thread_id": thread_id,
        "_async_storyboard": True,
        "user_goal": str(task_plan.get("user_goal") or "").strip(),
    }

    return {
        "exec_response_text": f"分镜方案生成中，请稍候... (task: {task_id})",
        "exec_patches": [],
        "exec_warnings": [],
        "exec_data": async_data,
        "trace": trace + [{"type": "EXECUTE_STORYBOARD", "task_id": task_id}],
    }
