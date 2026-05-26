from __future__ import annotations

_VALID_EXECUTE_NODES = {
    "execute_chitchat",
    "execute_tool_call",
}


def _route_after_plan(state: dict) -> str:
    """Conditional edge: plan_task → execute_* node.
    Reads target_agent from task_plan; falls back to execute_chitchat.
    """
    task_plan = dict(state.get("task_plan") or {})
    target = str(task_plan.get("target_agent") or "execute_chitchat")
    if target not in _VALID_EXECUTE_NODES:
        return "execute_chitchat"
    return target


_STORYBOARD_TOOL_NAMES = {"storyboard.design", "agent_storyboard_design"}
_SHOT_WORKFLOW_TOOL_NAMES = {"shot_workflow.compose", "agent_shot_workflow_compose"}
_SCRIPT_EXTRACT_TOOL_NAMES = {"shot_workflow.extract"}
_ASSET_CANVAS_TOOL_NAMES = {"shot_workflow.build_asset_canvas"}
_VIDEO_CANVAS_TOOL_NAMES = {"shot_workflow.build_video_canvas"}


def _route_after_classify(state: dict) -> str:
    """Routes on state.intent (not task_plan.target_agent). Used by existing tests."""
    intent = str(state.get("intent") or "answer_only")
    if intent == "tool_call":
        return "execute_tool_call"
    return "execute_chitchat"


def _route_after_tool(state: dict) -> str:
    """Conditional edge: execute_tool_call → specialist executor OR build_response."""
    tool_name = str(state.get("tool_name") or "").strip()
    if tool_name in _STORYBOARD_TOOL_NAMES:
        return "execute_storyboard"
    if tool_name in _SHOT_WORKFLOW_TOOL_NAMES:
        return "execute_shot_workflow"
    if tool_name in _SCRIPT_EXTRACT_TOOL_NAMES:
        return "execute_script_extract"
    if tool_name in _ASSET_CANVAS_TOOL_NAMES:
        return "execute_build_asset_canvas"
    if tool_name in _VIDEO_CANVAS_TOOL_NAMES:
        return "execute_build_video_canvas"
    return "build_response"
