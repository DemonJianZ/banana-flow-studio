from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


def execute_build_video_canvas(state: dict) -> dict:
    tool_args = state.get("tool_args") or {}
    confirmed = dict(tool_args.get("confirmed_extraction") or {})
    authorization = str(state.get("member_authorization") or state.get("authorization") or "").strip()
    current_nodes = list(tool_args.get("current_nodes") or state.get("current_nodes") or [])

    source_text = str(confirmed.get("source_text") or confirmed.get("summary") or "").strip()

    try:
        from agent_v2.shot_workflow.graph import invoke_shot_workflow_graph
        result = invoke_shot_workflow_graph({
            "source_text": source_text,
            "mode_policy": "img2video",
            "authorization": authorization,
            "current_nodes": current_nodes,
        })
    except Exception as exc:
        logger.warning("invoke_shot_workflow_graph failed in video canvas: %s", exc)
        result = {}

    shots = list(result.get("shots") or [])
    patch = list(result.get("patch") or [])
    warnings = list(result.get("warnings") or [])
    shot_count = len(shots)

    if shot_count:
        summary = f"已为 {shot_count} 个镜头搭建图生视频工作流。"
    else:
        summary = "未识别到可搭建的镜头，请补充剧本描述。"

    exec_data = {
        "kind": "video_canvas",
        "summary": summary,
        "shots": shots,
        "patch_count": len(patch),
    }

    return {
        **state,
        "exec_response_text": summary,
        "exec_patches": patch,
        "exec_warnings": warnings,
        "exec_data": exec_data,
        "trace": (state.get("trace") or []) + [
            {"type": "EXECUTE_BUILD_VIDEO_CANVAS", "shot_count": shot_count, "patch_count": len(patch)},
        ],
    }
