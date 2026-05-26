from __future__ import annotations


def execute_script_extract(state: dict) -> dict:
    from agent_v2.shot_workflow.script_extractor import extract_script_elements

    tool_args = dict(state.get("tool_args") or {})
    source_text = str(tool_args.get("source_text") or state.get("message") or "").strip()
    authorization = str(state.get("member_authorization") or state.get("authorization") or "").strip()
    existing_extraction = tool_args.get("existing_extraction") or None
    edit_instruction = str(tool_args.get("edit_instruction") or "").strip()

    # In edit mode the incoming message is the edit instruction, not the screenplay.
    # Always restore source_text from the previous extraction when available.
    if existing_extraction:
        original_src = str(existing_extraction.get("source_text") or "").strip()
        if original_src:
            source_text = original_src

    result = extract_script_elements(
        source_text,
        authorization=authorization,
        existing_extraction=existing_extraction,
        edit_instruction=edit_instruction,
    )

    shot_count = len(result.get("shots") or [])
    summary = str(result.get("summary") or "").strip()
    response_text = "以上是基于您的需求规划的场景及分镜描述，如有调整需求可以随时告诉我，如满意，将继续为您生成主体图及场景图。"

    return {
        "exec_response_text": response_text,
        "exec_patches": [],
        "exec_data": {
            "kind": "script_extraction",
            "source_text": source_text,
            "characters": result.get("characters") or [],
            "scenes": result.get("scenes") or [],
            "shots": result.get("shots") or [],
            "summary": summary,
        },
        "trace": list(state.get("trace") or []) + [
            {"type": "EXECUTE_SCRIPT_EXTRACT", "shot_count": shot_count, "edit_mode": bool(edit_instruction)},
        ],
    }
