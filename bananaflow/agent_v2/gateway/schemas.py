from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


CoordinatorAction = Literal["answer_only", "clarify", "tool_call", "canvas_plan", "workflow_plan"]
WorkflowStepAction = Literal["tool_call", "canvas_plan"]


class CoordinatorStep(BaseModel):
    action: WorkflowStepAction
    tool_name: Optional[str] = None
    tool_args: Dict[str, Any] = Field(default_factory=dict)
    reason: str = ""


class CoordinatorDecision(BaseModel):
    action: CoordinatorAction
    reason: str = ""
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    matched_rule: str = ""
    forced: bool = False
    matched_capabilities: List[str] = Field(default_factory=list)
    answer: Optional[str] = None
    clarification_question: Optional[str] = None
    tool_name: Optional[str] = None
    tool_args: Dict[str, Any] = Field(default_factory=dict)
    steps: List[CoordinatorStep] = Field(default_factory=list)


class AgentMessageRequest(BaseModel):
    message: str = ""
    force_action: Optional[CoordinatorAction] = None
    ui_action: Optional[str] = None
    recent_messages: List[Dict[str, Any]] = Field(default_factory=list)

    supplemental_prompt: Optional[str] = None
    current_nodes: List[Dict[str, Any]] = Field(default_factory=list)
    current_connections: List[Dict[str, Any]] = Field(default_factory=list)
    selected_artifact: Optional[Dict[str, Any]] = None
    canvas_id: Optional[str] = None
    thread_id: Optional[str] = None

    mode: Optional[str] = None
    product: Optional[str] = None
    audience: Optional[str] = None
    price_band: Optional[str] = None
    conversion_goal: Optional[str] = None
    primary_platform: Optional[str] = None
    secondary_platform: Optional[str] = None
    selected_angle: Optional[str] = None

    task_mode: Optional[str] = None
    episode_count: Optional[int] = None
    existing_script: Optional[str] = None


class AgentMessageResponse(BaseModel):
    ok: bool = True
    action: CoordinatorAction
    intent: Optional[str] = None
    decision: CoordinatorDecision
    data: Dict[str, Any] = Field(default_factory=dict)
    response_text: str = ""
    trace: List[Dict[str, Any]] = Field(default_factory=list)
    error: Optional[str] = None
