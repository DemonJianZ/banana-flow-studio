from __future__ import annotations


def execute_clarify(state: dict) -> dict:
    question = str(state.get("_clarification_question") or "").strip()
    if not question:
        task_plan = dict(state.get("task_plan") or {})
        user_goal = str(task_plan.get("user_goal") or "").strip()
        question = (
            f"关于“{user_goal}”，我还需要更多信息才能继续处理。"
            if user_goal
            else "我还需要一点信息，才能继续处理。"
        )
    trace = list(state.get("trace") or [])
    return {
        "exec_response_text": question,
        "exec_patches": [],
        "exec_warnings": [],
        "exec_data": {},
        "trace": trace + [{"type": "EXECUTE_CLARIFY"}],
    }
