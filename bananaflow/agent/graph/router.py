"""
agent/graph/router.py — Conditional edge functions for the LangGraph StateGraph.

Type hints use dict (not AgentState) so LangGraph's get_type_hints() can resolve
them without chasing forward references across modules.
"""
from __future__ import annotations

from typing import Any, Dict


def route_after_classify(state: Dict[str, Any]) -> str:
    """
    Branch after classify_intent node.

    Returns the name of the next node to execute.
    """
    intent = str(state.get("intent") or "answer_only").strip()

    if intent == "clarify":
        return "execute_clarify"
    if intent == "canvas_plan":
        return "execute_canvas_plan"
    if intent == "tool_call":
        return "execute_tool_call"
    # answer_only + any fallback
    return "execute_chitchat"


def route_after_tool(state: Dict[str, Any]) -> str:
    """
    Branch after execute_tool_call node.

    Storyboard tool goes to its own async execution node.
    All others go directly to build_response.
    """
    tool_name = str(state.get("tool_name") or "").strip()
    if tool_name in {"storyboard.design", "create_storyboard"}:
        return "execute_storyboard"
    return "build_response"
