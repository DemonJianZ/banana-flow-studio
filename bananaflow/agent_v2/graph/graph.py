from __future__ import annotations

from langgraph.graph import StateGraph, START, END

from agent_v2.graph.state import AgentState
from agent_v2.graph.router import _route_after_plan, _route_after_tool
from agent_v2.graph.nodes.normalize import normalize_request
from agent_v2.graph.nodes.context import assemble_context
from agent_v2.graph.nodes.classify import classify_intent
from agent_v2.graph.nodes.plan_task import plan_task
from agent_v2.graph.nodes.execute_chitchat import execute_chitchat
from agent_v2.graph.nodes.execute_tool import execute_tool_call
from agent_v2.graph.nodes.execute_storyboard import execute_storyboard
from agent_v2.graph.nodes.execute_shot_workflow import execute_shot_workflow
from agent_v2.graph.nodes.execute_script_extract import execute_script_extract
from agent_v2.graph.nodes.execute_build_asset_canvas import execute_build_asset_canvas
from agent_v2.graph.nodes.build_response import build_response


def build_agent_graph(checkpointer=None):
    builder = StateGraph(AgentState)

    builder.add_node("normalize_request", normalize_request)
    builder.add_node("assemble_context", assemble_context)
    builder.add_node("classify_intent", classify_intent)
    builder.add_node("plan_task", plan_task)
    builder.add_node("execute_chitchat", execute_chitchat)
    builder.add_node("execute_tool_call", execute_tool_call)
    builder.add_node("execute_storyboard", execute_storyboard)
    builder.add_node("execute_shot_workflow", execute_shot_workflow)
    builder.add_node("execute_script_extract", execute_script_extract)
    builder.add_node("execute_build_asset_canvas", execute_build_asset_canvas)
    builder.add_node("build_response", build_response)

    builder.add_edge(START, "normalize_request")
    builder.add_edge("normalize_request", "assemble_context")
    builder.add_edge("assemble_context", "classify_intent")
    builder.add_edge("classify_intent", "plan_task")

    builder.add_conditional_edges(
        "plan_task",
        _route_after_plan,
        {
            "execute_chitchat":  "execute_chitchat",
            "execute_tool_call": "execute_tool_call",
        },
    )

    builder.add_conditional_edges(
        "execute_tool_call",
        _route_after_tool,
        {
            "execute_storyboard":    "execute_storyboard",
            "execute_shot_workflow": "execute_shot_workflow",
            "execute_script_extract":    "execute_script_extract",
            "execute_build_asset_canvas": "execute_build_asset_canvas",
            "build_response":            "build_response",
        },
    )

    builder.add_edge("execute_chitchat",      "build_response")
    builder.add_edge("execute_storyboard",    "build_response")
    builder.add_edge("execute_shot_workflow", "build_response")
    builder.add_edge("execute_script_extract",     "build_response")
    builder.add_edge("execute_build_asset_canvas", "build_response")
    builder.add_edge("build_response", END)

    return builder.compile(checkpointer=checkpointer)
