"""
nodes/normalize.py — normalize_request node.

Cleans and validates input fields. Applies rule-based shortcuts
(force_action, ui_action) that bypass the LLM router entirely.
"""
from __future__ import annotations

import time
from typing import Any, Dict

from ..state import AgentState


# Shortcut mapping: force_action value → intent + optional tool_name
_FORCE_ACTION_MAP: Dict[str, Dict[str, Any]] = {
    "answer_only":       {"intent": "answer_only"},
    "chitchat":          {"intent": "answer_only"},
    "tool_call":         {"intent": "tool_call"},
    "canvas_plan":       {"intent": "canvas_plan"},
    "clarify":           {"intent": "clarify"},
    "generate_image":    {"intent": "tool_call", "tool_name": "generate_image"},
    "remove_background": {"intent": "tool_call", "tool_name": "remove_background"},
    "generate_video":    {"intent": "tool_call", "tool_name": "generate_video"},
    "create_storyboard": {"intent": "tool_call", "tool_name": "create_storyboard"},
}


def normalize_request(state: AgentState) -> Dict[str, Any]:
    """
    Sanitize input and apply rule-based fast-path shortcuts.

    If force_action is set, the intent is determined here without
    calling the LLM classifier at all.
    """
    updates: Dict[str, Any] = {
        "trace": [{"node": "normalize_request", "ts": time.time()}],
    }

    # Normalise message
    message = str(state.get("message") or "").strip()
    updates["message"] = message

    # Normalise thread_id
    import uuid
    thread_id = str(state.get("thread_id") or "").strip() or str(uuid.uuid4())
    updates["thread_id"] = thread_id

    # Rule-based shortcut: force_action
    force_action = str(state.get("force_action") or "").strip().lower()
    if force_action in _FORCE_ACTION_MAP:
        shortcut = _FORCE_ACTION_MAP[force_action]
        updates["intent"] = shortcut["intent"]
        updates["intent_confidence"] = 1.0
        updates["intent_reason"] = f"force_action={force_action}"
        if "tool_name" in shortcut:
            updates["tool_name"] = shortcut["tool_name"]
        # 若前端通过参数表单传来了预填参数，直接使用
        initial_args = state.get("tool_args")  # already set from initial_tool_args in gateway
        if initial_args:
            updates["tool_args"] = initial_args

    # Rule-based shortcut: ui_action
    ui_action = str(state.get("ui_action") or "").strip()
    if ui_action and "intent" not in updates:
        updates["intent"] = "tool_call"
        updates["tool_name"] = ui_action
        updates["intent_confidence"] = 1.0
        updates["intent_reason"] = f"ui_action={ui_action}"

    return updates
