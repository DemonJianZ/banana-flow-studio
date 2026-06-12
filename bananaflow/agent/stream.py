"""
agent/stream.py — ContextVar-based event queue for SSE streaming.

Each request creates an asyncio.Queue and stores it in a ContextVar so that
any node running in that request's async context can push SSE events without
needing an explicit handle on the queue.
"""
from __future__ import annotations

import asyncio
import contextvars
from typing import Any, Dict, Optional

_stream_queue: contextvars.ContextVar[Optional[asyncio.Queue]] = contextvars.ContextVar(
    "agent_stream_queue", default=None
)


def set_stream_queue(queue: asyncio.Queue) -> contextvars.Token:
    return _stream_queue.set(queue)


def reset_stream_queue(token: contextvars.Token) -> None:
    _stream_queue.reset(token)


async def push_event(event: Dict[str, Any]) -> None:
    """Push an SSE event dict to the current request's stream queue."""
    q = _stream_queue.get()
    if q is not None:
        await q.put(event)


async def push_token(content: str) -> None:
    await push_event({"type": "token", "content": content})


async def push_tool_start(tool: str, label: str) -> None:
    await push_event({"type": "tool_start", "tool": tool, "label": label})


async def push_tool_result(tool: str, result: Dict[str, Any]) -> None:
    await push_event({"type": "tool_result", "tool": tool, "result": result})


async def push_progress(message: str, percent: Optional[int] = None) -> None:
    event: Dict[str, Any] = {"type": "progress", "message": message}
    if percent is not None:
        event["percent"] = percent
    await push_event(event)


async def push_clarify(question: str, options: Optional[list] = None) -> None:
    event: Dict[str, Any] = {"type": "clarify", "question": question}
    if options:
        event["options"] = options
    await push_event(event)


async def push_canvas_action(action: str, **payload) -> None:
    """Emit a canvas_action event to be executed by the frontend canvas."""
    await push_event({"type": "canvas_action", "action": action, **payload})


async def push_param_form(
    tool: str,
    prompt: str,
    groups: list,
) -> None:
    """
    让前端渲染参数选择表单。
    groups 格式：
    [
      {"key": "model_id", "label": "生成模型", "required": True,
       "options": [{"value": "...", "label": "...", "desc": "..."}]},
      {"key": "ratio",    "label": "图片比例", ...},
      ...
    ]
    """
    await push_event({
        "type": "param_form",
        "tool": tool,
        "prompt": prompt,
        "groups": groups,
    })
