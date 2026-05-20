from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


class AgentInvokeRequest(BaseModel):
    message: str = ""
    force_action: Optional[Literal["answer_only", "tool_call"]] = None
    ui_action: Optional[str] = None

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
    uploaded_documents: List[Dict[str, Any]] = Field(default_factory=list)
    canvas_node_hints: Optional[Dict[str, Any]] = None


class AgentInvokeResponse(BaseModel):
    ok: bool = True
    message: str = ""
    patches: List[Dict[str, Any]] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    intent: str = ""
    thread_id: str = ""
    async_task: Optional[Dict[str, Any]] = None
    tool_result: Optional[Dict[str, Any]] = None
    thought: Optional[str] = None
    trace: List[Dict[str, Any]] = Field(default_factory=list)
    error: Optional[str] = None
