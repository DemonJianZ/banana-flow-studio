"""
agent/graph/schemas.py — Request/Response Pydantic models for /api/agent/invoke.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class UploadedDocument(BaseModel):
    file_type: str          # "image" | "doc" | "video" | "unknown"
    name: str
    mime: Optional[str] = ""
    data_url: Optional[str] = None     # image: data:image/...;base64,...
    text_content: Optional[str] = None # doc text


class AgentInvokeRequest(BaseModel):
    message: str = ""
    thread_id: str = ""
    canvas_id: Optional[str] = None
    mode: Optional[str] = None
    force_action: Optional[str] = None
    ui_action: Optional[str] = None
    # 参数表单提交时直接传入已选参数（跳过 LLM 分类）
    initial_tool_args: Optional[Dict[str, Any]] = None
    # 前端传来的可用图片/视频模型列表（来自 viewAIChatModels 缓存）
    available_image_models: List[Dict[str, Any]] = Field(default_factory=list)
    uploaded_documents: List[UploadedDocument] = Field(default_factory=list)
    selected_artifact: Optional[Dict[str, Any]] = None
    canvas_node_hints: Optional[Dict[str, Any]] = None
    member_authorization: str = ""


class AgentInvokeResponse(BaseModel):
    ok: bool = True
    message: str = ""
    patches: List[Dict[str, Any]] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    intent: str = ""
    thread_id: str = ""
    async_task: Optional[Dict[str, Any]] = None
    trace: List[Dict[str, Any]] = Field(default_factory=list)
    error: Optional[str] = None
