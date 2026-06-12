"""
api/agent_routes.py — /api/agent/invoke SSE endpoint.

Runs the LangGraph agent graph in a background task while streaming
SSE events to the client via an asyncio.Queue bridge.

SSE event types:
  {"type": "ping"}
  {"type": "token",       "content": "..."}
  {"type": "tool_start",  "tool": "...", "label": "..."}
  {"type": "tool_result", "tool": "...", "result": {...}}
  {"type": "clarify",     "question": "...", "options": [...]}
  {"type": "progress",    "message": "...", "percent": 0-100}
  {"type": "done",        "intent": "...", "thread_id": "...", "patches": [...]}
  {"type": "error",       "content": "..."}
"""
from __future__ import annotations

import asyncio
import json
import traceback
import uuid
from typing import Any, Dict

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

try:
    from ..agent.stream import reset_stream_queue, set_stream_queue
    from ..agent.graph import AgentInvokeRequest, build_agent_graph, initial_state
    from ..core.logging import sys_logger
except ImportError:
    from agent.stream import reset_stream_queue, set_stream_queue
    from agent.graph import AgentInvokeRequest, build_agent_graph, initial_state
    from core.logging import sys_logger

agent_router = APIRouter(tags=["agent"])

# ── Graph singleton (initialised by app_factory) ──────────────────────────────
# The compiled graph is stored on app.state.agent_graph after startup.
_FALLBACK_GRAPH = None  # lazy-init without checkpointing if app.state not available


def _get_graph(request: Request):
    graph = getattr(getattr(request, "app", None), "state", None)
    if graph is not None:
        g = getattr(graph, "agent_graph", None)
        if g is not None:
            return g

    global _FALLBACK_GRAPH
    if _FALLBACK_GRAPH is None:
        sys_logger.warning("[agent_routes] app.state.agent_graph not set, using stateless fallback graph")
        _FALLBACK_GRAPH = build_agent_graph(checkpointer=None)
    return _FALLBACK_GRAPH


# ── Route ──────────────────────────────────────────────────────────────────────

@agent_router.post("/api/agent/invoke")
async def agent_invoke(req: AgentInvokeRequest, request: Request):
    """
    Run the agent and stream SSE events.

    The graph runs as a background asyncio task. Events are passed through
    an asyncio.Queue to the SSE generator.
    """
    queue: asyncio.Queue = asyncio.Queue()
    thread_id = str(req.thread_id or "").strip() or str(uuid.uuid4())

    async def run_graph():
        token = set_stream_queue(queue)
        try:
            graph = _get_graph(request)
            state = initial_state(
                message=str(req.message or "").strip(),
                thread_id=thread_id,
                canvas_id=req.canvas_id,
                mode=req.mode,
                force_action=req.force_action,
                ui_action=req.ui_action,
                uploaded_documents=[d.model_dump() for d in (req.uploaded_documents or [])],
                selected_artifact=req.selected_artifact,
                canvas_node_hints=req.canvas_node_hints,
                member_authorization=req.member_authorization or "",
                available_image_models=list(req.available_image_models or []),
            )
            # 参数表单直接提交时，把已选参数注入 tool_args
            if req.initial_tool_args:
                state["tool_args"] = dict(req.initial_tool_args)
            config = {"configurable": {"thread_id": thread_id}}
            result = await graph.ainvoke(state, config=config)
            final = result.get("final_response") or {}
            await queue.put({
                "type": "done",
                "intent": final.get("intent", ""),
                "thread_id": thread_id,
                "patches": final.get("patches", []),
                "warnings": final.get("warnings", []),
            })
        except Exception as e:
            tb = traceback.format_exc()
            sys_logger.error(f"[agent_invoke] graph error: {e}\n{tb}")
            await queue.put({"type": "error", "content": str(e)})
        finally:
            reset_stream_queue(token)
            await queue.put(None)  # sentinel: end of stream

    async def stream_sse():
        yield f"data: {json.dumps({'type': 'ping'})}\n\n"
        asyncio.create_task(run_graph())

        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=180.0)
            except asyncio.TimeoutError:
                yield f"data: {json.dumps({'type': 'error', 'content': '请求超时'})}\n\n"
                break
            if event is None:
                break
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        stream_sse(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
