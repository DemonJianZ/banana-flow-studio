"""
agent/graph/graph.py — LangGraph StateGraph assembly.

Builds and compiles the agent graph with SQLite checkpointing.
"""
from __future__ import annotations

from typing import Optional

from langgraph.graph import END, START, StateGraph

from .state import AgentState
from .router import route_after_classify, route_after_tool
from .nodes import (
    normalize_request,
    assemble_context,
    classify_intent,
    execute_chitchat,
    execute_clarify,
    execute_tool_call,
    execute_canvas_plan,
    build_response,
)


def build_agent_graph(checkpointer=None):
    """
    Compile the agent StateGraph.

    Args:
        checkpointer: LangGraph checkpointer (e.g. AsyncSqliteSaver).
                      Pass None for stateless / testing.

    Returns:
        A compiled LangGraph graph ready for ainvoke().
    """
    g = StateGraph(AgentState)

    # ── Nodes ──────────────────────────────────────────────────────────────────
    g.add_node("normalize_request",    normalize_request)
    g.add_node("assemble_context",     assemble_context)
    g.add_node("classify_intent",      classify_intent)
    g.add_node("execute_chitchat",     execute_chitchat)
    g.add_node("execute_clarify",      execute_clarify)
    g.add_node("execute_tool_call",    execute_tool_call)
    g.add_node("execute_canvas_plan",  execute_canvas_plan)
    g.add_node("build_response",       build_response)

    # ── Edges: linear prefix ───────────────────────────────────────────────────
    g.add_edge(START,               "normalize_request")
    g.add_edge("normalize_request", "assemble_context")
    g.add_edge("assemble_context",  "classify_intent")

    # ── Conditional branch after classify ─────────────────────────────────────
    g.add_conditional_edges(
        "classify_intent",
        route_after_classify,
        {
            "execute_chitchat":    "execute_chitchat",
            "execute_clarify":     "execute_clarify",
            "execute_tool_call":   "execute_tool_call",
            "execute_canvas_plan": "execute_canvas_plan",
        },
    )

    # ── Conditional branch after tool execution ────────────────────────────────
    g.add_conditional_edges(
        "execute_tool_call",
        route_after_tool,
        {
            "build_response":    "build_response",
            "execute_storyboard": "build_response",   # Phase 2: add execute_storyboard node
        },
    )

    # ── All execution paths converge to build_response ────────────────────────
    g.add_edge("execute_chitchat",    "build_response")
    g.add_edge("execute_clarify",     "build_response")
    g.add_edge("execute_canvas_plan", "build_response")
    g.add_edge("build_response",      END)

    return g.compile(checkpointer=checkpointer)
