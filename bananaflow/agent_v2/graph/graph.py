from __future__ import annotations

from langgraph.graph import StateGraph, START, END

from agent_v2.graph.state import AgentState
from agent_v2.graph.router import _route_after_plan, _route_after_tool
from agent_v2.graph.nodes.normalize import normalize_request
from agent_v2.graph.nodes.context import assemble_context
from agent_v2.graph.nodes.classify import classify_intent
from agent_v2.graph.nodes.plan_task import plan_task
from agent_v2.graph.nodes.execute_chitchat import execute_chitchat
from agent_v2.graph.nodes.execute_clarify import execute_clarify
from agent_v2.graph.nodes.execute_canvas import execute_canvas_plan
from agent_v2.graph.nodes.execute_tool import execute_tool_call
from agent_v2.graph.nodes.execute_storyboard import execute_storyboard
from agent_v2.graph.nodes.build_response import build_response


def build_agent_graph(checkpointer=None):
    builder = StateGraph(AgentState)

    builder.add_node("normalize_request", normalize_request)
    builder.add_node("assemble_context", assemble_context)
    builder.add_node("classify_intent", classify_intent)
    builder.add_node("plan_task", plan_task)
    builder.add_node("execute_chitchat", execute_chitchat)
    builder.add_node("execute_clarify", execute_clarify)
    builder.add_node("execute_canvas_plan", execute_canvas_plan)
    builder.add_node("execute_tool_call", execute_tool_call)
    builder.add_node("execute_storyboard", execute_storyboard)
    builder.add_node("build_response", build_response)

    builder.add_edge(START, "normalize_request")
    builder.add_edge("normalize_request", "assemble_context")
    builder.add_edge("assemble_context", "classify_intent")
    builder.add_edge("classify_intent", "plan_task")

    builder.add_conditional_edges(
        "plan_task",
        _route_after_plan,
        {
            "execute_chitchat":    "execute_chitchat",
            "execute_clarify":     "execute_clarify",
            "execute_canvas_plan": "execute_canvas_plan",
            "execute_tool_call":   "execute_tool_call",
        },
    )

    builder.add_conditional_edges(
        "execute_tool_call",
        _route_after_tool,
        {
            "execute_storyboard": "execute_storyboard",
            "build_response":     "build_response",
        },
    )

    builder.add_edge("execute_chitchat",    "build_response")
    builder.add_edge("execute_clarify",     "build_response")
    builder.add_edge("execute_canvas_plan", "build_response")
    builder.add_edge("execute_storyboard",  "build_response")
    builder.add_edge("build_response", END)

    return builder.compile(checkpointer=checkpointer)
