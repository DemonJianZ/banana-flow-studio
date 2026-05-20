from __future__ import annotations


def execute_clarify(state: dict) -> dict:
    question = str(state.get("_clarification_question") or "").strip()
    if not question:
        question = "我还需要一点信息，才能继续处理。"
    trace = list(state.get("trace") or [])
    return {
        "exec_response_text": question,
        "exec_patches": [],
        "exec_warnings": [],
        "exec_data": {},
        "trace": trace + [{"type": "EXECUTE_CLARIFY"}],
    }
