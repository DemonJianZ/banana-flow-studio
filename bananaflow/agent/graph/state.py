"""
agent/graph/state.py — LangGraph AgentState.

Each field has a clear owner (which node writes it) and a reducer for
accumulation fields. This matches the approved design doc from 2026-05-20.
"""
from __future__ import annotations

import operator
from typing import Annotated, Any, Dict, List, Optional

from langgraph.graph.message import add_messages
from typing_extensions import TypedDict


class AgentState(TypedDict):
    # ── 输入（normalize_request 写入）───────────────────────────────────────────
    message: str
    thread_id: str
    canvas_id: Optional[str]
    mode: Optional[str]
    force_action: Optional[str]     # 强制跳过 LLM 路由
    ui_action: Optional[str]        # 来自前端 UI 操作的快捷动作
    uploaded_documents: List[Dict[str, Any]]   # 附件（文档/图片）
    selected_artifact: Optional[Dict[str, Any]]
    canvas_node_hints: Optional[Dict[str, Any]]
    member_authorization: str

    # ── 上下文（assemble_context 写入）──────────────────────────────────────────
    canvas_summary: Dict[str, Any]
    artifact_summary: Dict[str, Any]
    # conversation_history 使用 add_messages reducer，checkpointer 按 thread_id 跨轮累积
    conversation_history: Annotated[List[Dict[str, Any]], add_messages]
    # 前端传来的可用图片模型列表（来自 viewAIChatModels 缓存，每次请求更新）
    available_image_models: List[Dict[str, Any]]

    # ── 意图（classify_intent 写入）─────────────────────────────────────────────
    intent: str            # answer_only | clarify | tool_call | canvas_plan
    intent_confidence: float
    intent_reason: str
    tool_name: Optional[str]
    tool_args: Dict[str, Any]

    # ── 执行结果（execute_* 节点写入）───────────────────────────────────────────
    exec_response_text: str
    exec_patches: List[Dict[str, Any]]
    exec_warnings: List[str]
    exec_data: Dict[str, Any]

    # ── 最终响应（build_response 写入）──────────────────────────────────────────
    final_response: Optional[Dict[str, Any]]

    # ── 追踪（各节点 append，operator.add reducer）──────────────────────────────
    trace: Annotated[List[Dict[str, Any]], operator.add]


def initial_state(
    *,
    message: str,
    thread_id: str,
    canvas_id: Optional[str] = None,
    mode: Optional[str] = None,
    force_action: Optional[str] = None,
    ui_action: Optional[str] = None,
    uploaded_documents: Optional[List[Dict[str, Any]]] = None,
    selected_artifact: Optional[Dict[str, Any]] = None,
    canvas_node_hints: Optional[Dict[str, Any]] = None,
    member_authorization: str = "",
    available_image_models: Optional[List[Dict[str, Any]]] = None,
) -> AgentState:
    """Build an initial state dict for a new invocation."""
    return AgentState(
        message=message,
        thread_id=thread_id,
        canvas_id=canvas_id,
        mode=mode,
        force_action=force_action,
        ui_action=ui_action,
        uploaded_documents=uploaded_documents or [],
        selected_artifact=selected_artifact,
        canvas_node_hints=canvas_node_hints,
        member_authorization=member_authorization,
        canvas_summary={},
        artifact_summary={},
        conversation_history=[],
        available_image_models=available_image_models or [],
        intent="answer_only",
        intent_confidence=1.0,
        intent_reason="default",
        tool_name=None,
        tool_args={},
        exec_response_text="",
        exec_patches=[],
        exec_warnings=[],
        exec_data={},
        final_response=None,
        trace=[],
    )
