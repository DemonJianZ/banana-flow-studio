from __future__ import annotations

from .schemas import AgentMessageRequest, CoordinatorDecision


UI_ACTION_TO_DECISION = {
    "canvas_plan": CoordinatorDecision(
        action="canvas_plan",
        reason="forced ui canvas action",
        confidence=1.0,
        matched_rule="ui_action.canvas_plan",
        forced=True,
        matched_capabilities=["canvas_planner"],
    ),
    "prompt_polish": CoordinatorDecision(
        action="tool_call",
        reason="forced ui prompt polish action",
        confidence=1.0,
        matched_rule="ui_action.prompt_polish",
        forced=True,
        matched_capabilities=["prompt.polish"],
        tool_name="prompt.polish",
        tool_args={},
    ),
}


FORCE_ACTION_DEFAULTS = {
    "answer_only": CoordinatorDecision(
        action="answer_only",
        reason="force_action",
        confidence=1.0,
        matched_rule="force_action",
        forced=True,
        matched_capabilities=["general_answer"],
    ),
    "clarify": CoordinatorDecision(
        action="clarify",
        reason="force_action",
        confidence=1.0,
        matched_rule="force_action",
        forced=True,
        matched_capabilities=["clarify_user"],
    ),
    "tool_call": CoordinatorDecision(
        action="tool_call",
        reason="force_action",
        confidence=1.0,
        matched_rule="force_action",
        forced=True,
    ),
    "canvas_plan": CoordinatorDecision(
        action="canvas_plan",
        reason="force_action",
        confidence=1.0,
        matched_rule="force_action",
        forced=True,
        matched_capabilities=["canvas_planner"],
    ),
    "workflow_plan": CoordinatorDecision(
        action="workflow_plan",
        reason="force_action",
        confidence=1.0,
        matched_rule="force_action",
        forced=True,
    ),
}


def build_shortcut_decision(req: AgentMessageRequest) -> CoordinatorDecision | None:
    force_action = str(req.force_action or "").strip()
    if force_action:
        base = FORCE_ACTION_DEFAULTS.get(force_action)
        if base is None:
            return None
        if force_action == "tool_call" and str(req.mode or "").strip().lower() == "text2img":
            return CoordinatorDecision(
                action="tool_call",
                reason="force_action",
                confidence=1.0,
                matched_rule="force_action",
                forced=True,
                matched_capabilities=["prompt.polish"],
                tool_name="prompt.polish",
                tool_args={"prompt": str(req.message or "").strip(), "mode": "text2img"},
            )
        return base.model_copy()

    ui_action = str(req.ui_action or "").strip().lower()
    if not ui_action:
        return None
    base = UI_ACTION_TO_DECISION.get(ui_action)
    if base is None:
        return None
    if ui_action == "prompt_polish":
        return base.model_copy(update={"tool_args": {"prompt": str(req.message or "").strip(), "mode": str(req.mode or "text2img").strip() or "text2img"}})
    return base.model_copy()
