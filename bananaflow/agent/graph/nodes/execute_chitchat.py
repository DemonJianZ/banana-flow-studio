"""
nodes/execute_chitchat.py — Streaming conversational response via DeepSeek.

Pushes token events to the stream queue as they arrive so the
SSE endpoint can forward them to the client in real time.
"""
from __future__ import annotations

import json
import os
import time
from typing import Any, Dict, List

try:
    from ....core.logging import sys_logger
    from ....core.deepseek_config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL
    from ....core.config import MODEL_AGENT_CHAT
except ImportError:
    from core.logging import sys_logger
    from core.deepseek_config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL
    from core.config import MODEL_AGENT_CHAT

from ..state import AgentState
from ...stream import push_token

_CHITCHAT_SYSTEM = (
    "你是 AI 小禹智能体，BananaFlow Studio 的电商 AI 创作伙伴。\n"
    "专注于电商图片生成、视频创作和故事分镜设计，用中文回答，保持专业、简洁、有创意。\n"
    "当用户询问你能做什么时，告诉他你可以：生成电商主图、去除背景、生成短视频、制作分镜脚本。"
)

_MAX_HISTORY_TURNS = 10


def _get_api_key() -> str:
    return str(os.getenv("DEEPSEEK_API_KEY", "") or DEEPSEEK_API_KEY or "").strip()


def _get_base_url() -> str:
    return str(os.getenv("DEEPSEEK_BASE_URL", "") or DEEPSEEK_BASE_URL or "https://api.deepseek.com").strip().rstrip("/")


def _get_model() -> str:
    raw = str(MODEL_AGENT_CHAT or "deepseek-v4-flash").strip()
    return raw.split(":", 1)[-1].strip() if ":" in raw else raw


def _build_chat_messages(
    message: str,
    history: List[Dict[str, Any]],
    documents: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    msgs: List[Dict[str, Any]] = [{"role": "system", "content": _CHITCHAT_SYSTEM}]

    # Add doc context to message
    doc_parts = []
    for doc in documents:
        if doc.get("file_type") == "doc" and doc.get("text_content"):
            doc_parts.append(f"[附件: {doc['name']}]\n{doc['text_content'][:3000]}")
        elif doc.get("file_type") == "image" and doc.get("data_url"):
            # Vision-capable message part
            doc_parts.append(f"[图片: {doc['name']}]")

    recent = (history or [])[-(_MAX_HISTORY_TURNS * 2):]
    for h in recent:
        role = str(h.get("role") or "user")
        content = str(h.get("content") or "")
        if role in ("user", "assistant") and content:
            msgs.append({"role": role, "content": content})

    user_content = message
    if doc_parts:
        user_content = "\n\n---\n".join(doc_parts) + "\n\n" + message

    msgs.append({"role": "user", "content": user_content})
    return msgs


async def execute_chitchat(state: AgentState) -> Dict[str, Any]:
    """Stream a conversational LLM response and collect the full text."""
    import asyncio
    import httpx

    t0 = time.time()
    api_key = _get_api_key()
    message = state.get("message", "")
    history = state.get("conversation_history") or []
    documents = state.get("uploaded_documents") or []

    if not api_key:
        text = "抱歉，AI 服务暂时不可用（DEEPSEEK_API_KEY 未配置）。"
        await push_token(text)
        return {"exec_response_text": text,
                "trace": [{"node": "execute_chitchat", "error": "no_api_key", "ts": t0}]}

    messages = _build_chat_messages(message, history, documents)
    url = f"{_get_base_url()}/chat/completions"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {
        "model": _get_model(),
        "messages": messages,
        "stream": True,
    }

    collected: List[str] = []
    error_text: str = ""

    try:
        async with httpx.AsyncClient(timeout=120.0, trust_env=False) as client:
            async with client.stream("POST", url, headers=headers, json=payload) as resp:
                if resp.status_code != 200:
                    body = await resp.aread()
                    error_text = f"AI 服务错误 {resp.status_code}: {body.decode(errors='replace')[:200]}"
                    await push_token(error_text)
                else:
                    async for line in resp.aiter_lines():
                        line = line.strip()
                        if not line or line == "data: [DONE]":
                            continue
                        if line.startswith("data:"):
                            try:
                                chunk = json.loads(line[5:].strip())
                                delta = (chunk.get("choices", [{}])[0].get("delta", {}).get("content") or "")
                                if delta:
                                    collected.append(delta)
                                    await push_token(delta)
                            except Exception:
                                continue
    except Exception as e:
        error_text = f"网络错误: {e}"
        await push_token(error_text)
        sys_logger.exception(f"[execute_chitchat] error: {e}")

    elapsed = int((time.time() - t0) * 1000)
    text = "".join(collected) or error_text
    return {
        "exec_response_text": text,
        "trace": [{"node": "execute_chitchat", "ms": elapsed, "chars": len(text), "ts": t0}],
    }
