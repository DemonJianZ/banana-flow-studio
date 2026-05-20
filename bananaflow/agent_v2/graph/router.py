from __future__ import annotations


def _route_after_classify(state: dict) -> str:
    """Conditional edge: classify_intent → execute_* node."""
    intent = str(state.get("intent") or "answer_only")
    if intent == "clarify":
        return "execute_clarify"
    if intent == "canvas_plan":
        return "execute_canvas_plan"
    if intent == "tool_call":
        return "execute_tool_call"
    return "execute_chitchat"  # answer_only + any unknown


def _route_after_tool(state: dict) -> str:
    """Conditional edge: execute_tool_call → execute_storyboard OR build_response."""
    tool_name = str(state.get("tool_name") or "").strip()
    if tool_name in {"storyboard.design", "agent_storyboard_design"}:
        return "execute_storyboard"
    return "build_response"
