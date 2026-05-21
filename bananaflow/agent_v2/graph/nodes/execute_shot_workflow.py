from __future__ import annotations


def execute_shot_workflow(state: dict) -> dict:
    from agent_v2.shot_workflow import compose_shot_workflow

    tool_args = dict(state.get("tool_args") or {})
    # Forward authorization so LLM calls inside shot_workflow can use the downstream AI Chat service
    authorization = str(state.get("member_authorization") or state.get("authorization") or "").strip()
    if authorization:
        tool_args["authorization"] = authorization

    trace = list(state.get("trace") or [])
    result = compose_shot_workflow(tool_args)
    patch = list(result.get("patch") or [])
    warnings = list(result.get("warnings") or [])
    summary = str(result.get("summary") or "").strip()
    annotated_script = str(result.get("annotated_script") or "").strip()
    return {
        "exec_response_text": summary,
        "exec_patches": patch,
        "exec_warnings": warnings,
        "exec_data": {
            "kind": "shot_workflow",
            "summary": summary,
            "shots": list(result.get("shots") or []),
            "annotated_script": annotated_script,
            "patch_count": len(patch),
            "tool_version": result.get("tool_version"),
            "tool_hash": result.get("tool_hash"),
        },
        "trace": trace + [
            {"type": "EXECUTE_SHOT_WORKFLOW", "shot_count": len(result.get("shots") or []), "patch_count": len(patch)},
            *list(result.get("trace") or []),
        ],
    }
