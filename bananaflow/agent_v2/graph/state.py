from __future__ import annotations

import operator
from typing import Annotated, Any
from typing_extensions import TypedDict


class AgentState(TypedDict):
    # ── Input (populated by route handler, read by normalize_request) ──
    message: str
    thread_id: str
    canvas_id: str | None
    mode: str | None
    force_action: str | None
    ui_action: str | None
    uploaded_documents: list[dict]
    selected_artifact: dict | None
    canvas_node_hints: dict | None
    member_authorization: str
    current_nodes: list[dict]
    current_connections: list[dict]
    supplemental_prompt: str | None
    product: str | None
    audience: str | None
    price_band: str | None
    conversion_goal: str | None
    primary_platform: str | None
    secondary_platform: str | None
    selected_angle: str | None
    task_mode: str | None
    episode_count: int | None
    existing_script: str | None

    # ── Context (computed by assemble_context) ──
    canvas_summary: dict
    artifact_summary: dict
    # Accumulated across turns via checkpointer; operator.add merges on each invoke
    conversation_history: Annotated[list[dict[str, Any]], operator.add]

    # ── Intent (set by normalize_request shortcut OR classify_intent LLM) ──
    intent: str          # answer_only | clarify | tool_call | canvas_plan
    intent_confidence: float
    intent_reason: str
    tool_name: str | None
    tool_args: dict

    # ── Execution results (set by execute_* nodes) ──
    exec_response_text: str
    exec_patches: list[dict]
    exec_warnings: list[str]
    exec_data: dict

    # ── Internal signals (set by classify_intent, read by execute_* nodes) ──
    _clarification_question: str | None
    _llm_answer: str | None

    # ── Final response (set by build_response) ──
    final_response: dict | None

    # ── Per-request trace (no reducer: reset to [] each invocation) ──
    trace: list[dict]
