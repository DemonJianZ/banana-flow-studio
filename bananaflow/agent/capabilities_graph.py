# bananaflow/agent/capabilities_graph.py
"""统一管理 /api/agent/*（除画布 plan 已在 agent.graph）的 LangGraph 执行流水线。"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, TypedDict

from core.logging import sys_logger

_CAPABILITIES_LANGGRAPH_IMPORT_ERROR: Optional[str] = None
try:
    from langgraph.graph import END, START, StateGraph  # type: ignore

    _CAPABILITIES_LANGGRAPH_IMPORT_OK = True
except Exception as e:  # pragma: no cover - 环境缺包
    StateGraph = None  # type: ignore[misc, assignment]
    START = END = None  # type: ignore[misc, assignment]
    _CAPABILITIES_LANGGRAPH_IMPORT_OK = False
    _CAPABILITIES_LANGGRAPH_IMPORT_ERROR = f"{type(e).__name__}: {e}"


from agent.capability_executors import (
    run_agent_chitchat,
    run_agent_drama,
    run_agent_idea_script_core,
    run_agent_prompt_polish,
)
from agent.legacy_capabilities import (
    SKILL_CHITCHAT,
    SKILL_DRAMA,
    SKILL_IDEA_SCRIPT,
    SKILL_PROMPT_POLISH,
)
from schemas.api import AgentDramaRequest, PromptPolishRequest
from agent.idea_script.schemas import IdeaScriptRequest


class AgentCapabilityGraphState(TypedDict, total=False):
    skill: str
    req_id: str
    thread_id: str
    payload: Dict[str, Any]
    errors: List[str]

    result: Dict[str, Any]
    trajectory_sink: List[Dict[str, Any]]
    trace_sink: List[Dict[str, Any]]
    exit_error: Optional[str]


def _node_capability_run(state: AgentCapabilityGraphState) -> AgentCapabilityGraphState:
    skill = (state.get("skill") or "").strip()
    req_id = (state.get("req_id") or "noid").strip()
    payload = state.get("payload") or {}
    errors = list(state.get("errors") or [])

    try:
        if skill == SKILL_CHITCHAT:
            msg = str(payload.get("message") or "").strip()
            out = run_agent_chitchat(msg, req_id)
            return {**state, "result": out.model_dump(), "errors": errors, "exit_error": None}

        if skill == SKILL_DRAMA:
            req = AgentDramaRequest.model_validate(payload.get("drama_request") or {})
            out = run_agent_drama(req, req_id)
            return {**state, "result": out.model_dump(), "errors": errors, "exit_error": None}

        if skill == SKILL_PROMPT_POLISH:
            req = PromptPolishRequest.model_validate(payload.get("polish_request") or {})
            out = run_agent_prompt_polish(req, req_id)
            return {**state, "result": out.model_dump(), "errors": errors, "exit_error": None}

        if skill == SKILL_IDEA_SCRIPT:
            req = IdeaScriptRequest.model_validate(payload.get("idea_script_request") or {})
            traj: List[Dict[str, Any]] = []
            trace: List[Dict[str, Any]] = []
            out = run_agent_idea_script_core(
                req,
                session_id=payload.get("session_id"),
                session_summary_present=payload.get("session_summary_present"),
                tenant_id=payload.get("tenant_id"),
                user_id=payload.get("user_id"),
                trajectory_sink=traj,
                trace_sink=trace,
            )
            return {
                **state,
                "result": out.model_dump(),
                "trajectory_sink": traj,
                "trace_sink": trace,
                "errors": errors,
                "exit_error": None,
            }

        raise ValueError(f"unknown capability skill: {skill!r}")
    except Exception as e:
        err = f"{type(e).__name__}: {e}"
        sys_logger.error(f"[{req_id}] capabilities_graph node error skill={skill}: {e}")
        return {**state, "errors": errors + [err], "exit_error": err}


def _build_capabilities_skill_graph():
    if not _CAPABILITIES_LANGGRAPH_IMPORT_OK or StateGraph is None:
        return None
    g = StateGraph(AgentCapabilityGraphState)
    g.add_node("capability", _node_capability_run)
    g.add_edge(START, "capability")
    g.add_edge("capability", END)
    # 不挂 checkpointer：idea_script 结果体量大，避免 checkpoint 序列化成本；仅复用 Graph 编排语义。
    return g.compile()


CAPABILITIES_SKILL_GRAPH = _build_capabilities_skill_graph()


def capabilities_graph_diagnostics() -> Dict[str, Any]:
    return {
        "capabilities_langgraph_import_ok": _CAPABILITIES_LANGGRAPH_IMPORT_OK,
        "capabilities_langgraph_import_error": (
            None if _CAPABILITIES_LANGGRAPH_IMPORT_OK else _CAPABILITIES_LANGGRAPH_IMPORT_ERROR
        ),
        "capabilities_skill_graph_compiled": CAPABILITIES_SKILL_GRAPH is not None,
    }


def invoke_capabilities_skill_graph(
    *,
    skill: str,
    req_id: str,
    thread_id: str,
    payload: Dict[str, Any],
) -> AgentCapabilityGraphState:
    if CAPABILITIES_SKILL_GRAPH is None:
        raise RuntimeError(
            "LangGraph capability graph unavailable. "
            + (
                _CAPABILITIES_LANGGRAPH_IMPORT_ERROR
                or "install langgraph in the API interpreter"
            )
        )
    init: AgentCapabilityGraphState = {
        "skill": skill,
        "req_id": req_id,
        "thread_id": thread_id,
        "payload": payload,
        "errors": [],
    }
    # 无持久化 checkpointer 时 thread_id 仅作预留；仍传入 config 以便将来扩展。
    config = {"configurable": {"thread_id": (thread_id or "").strip() or f"t_{req_id}"}}
    final = CAPABILITIES_SKILL_GRAPH.invoke(init, config=config)
    return final  # type: ignore[return-value]
