"""Compatibility runner for legacy capability-specific agent endpoints.

This module exists so older `/api/agent/*` routes can optionally execute through
their small LangGraph wrapper. The coordinator gateway is the preferred runtime
path for new conversational agent behavior.
"""
from __future__ import annotations

import os
from typing import Any, Callable, Dict, Optional, Tuple, TypeVar

from core.logging import sys_logger

T = TypeVar("T")


def use_capabilities_langgraph() -> bool:
    return os.getenv("USE_LANGGRAPH", "0") == "1"


def run_agent_capability_with_optional_langgraph(
    *,
    skill: str,
    req_id: str,
    thread_id: str,
    payload: Dict[str, Any],
    direct: Callable[[], T],
    after_graph: Callable[[Dict[str, Any]], T],
) -> Tuple[T, Dict[str, Any], Optional[Dict[str, Any]]]:
    """
    USE_LANGGRAPH=1 且能力图可用时走 LangGraph.invoke；否则或未编译图时走 direct()。
    LangGraph 分支抛错时回落到 direct()。
    """
    dbg: Dict[str, Any] = {
        "skill": skill,
        "capabilities_langgraph_enabled": use_capabilities_langgraph(),
    }
    if not use_capabilities_langgraph():
        dbg["capabilities_execution"] = "direct_env_off"
        return direct(), dbg, None

    try:
        from agent.capabilities_graph import (
            CAPABILITIES_SKILL_GRAPH,
            capabilities_graph_diagnostics,
            invoke_capabilities_skill_graph,
        )

        dbg.update(capabilities_graph_diagnostics())
        if CAPABILITIES_SKILL_GRAPH is None:
            dbg["capabilities_execution"] = "direct_graph_uncompiled"
            return direct(), dbg, None

        final = invoke_capabilities_skill_graph(
            skill=skill, req_id=req_id, thread_id=thread_id, payload=payload
        )
        if final.get("exit_error"):
            raise RuntimeError(str(final.get("exit_error")))
        if not isinstance(final.get("result"), dict):
            raise RuntimeError("capability graph returned no result dict")

        dbg["capabilities_execution"] = "langgraph"
        return after_graph(final), dbg, dict(final)
    except Exception as e:
        sys_logger.warning(
            "[%s] capabilities_langgraph skill=%s failed, direct fallback: %s",
            req_id,
            skill,
            e,
        )
        dbg["capabilities_execution"] = "direct_after_langgraph_error"
        dbg["capabilities_langgraph_runtime_error"] = str(e)
        out = direct()
        return out, dbg, None
