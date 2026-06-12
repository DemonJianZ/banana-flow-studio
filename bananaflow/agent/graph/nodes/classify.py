"""
nodes/classify.py — classify_intent node (two-stage router).

Stage 1: if intent was already set by normalize_request (force_action / ui_action),
         skip LLM classification entirely.

Stage 2: call DeepSeek with JSON mode to classify intent and extract tool args.
         Falls back to answer_only on any error.
"""
from __future__ import annotations

import json
import os
import time
from typing import Any, Dict, List, Optional

try:
    from ....core.logging import sys_logger
    from ....core.deepseek_config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL
    from ....core.config import MODEL_AGENT_CHAT
except ImportError:
    from core.logging import sys_logger
    from core.deepseek_config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL
    from core.config import MODEL_AGENT_CHAT

from ..state import AgentState
from ...tools.specs import TOOL_SPECS

# ── System prompt for intent classification ────────────────────────────────────

_CLASSIFY_SYSTEM = """你是 BananaFlow Studio 的智能请求路由器。
分析用户消息，以 JSON 格式返回路由决策。

可用路由（intent）：
- answer_only：闲聊、知识问答、解释说明，不需要调用任何工具
- clarify：用户意图不明确，需要追问才能继续
- tool_call：需要调用工具执行实际操作（生图、去背景、生视频等）
- canvas_plan：用户要在画布上搭建工作流节点（如"搭文生图流程""建视频工作流""在画布上创建节点"）

【重要】canvas_plan 触发条件（以下任意一种均路由到 canvas_plan）：
  - 明确提到"画布""工作流""流程""节点""搭建""创建工作流"
  - 说"帮我搭""帮我建""在画布上"
  - 例如："搭一个文生图流程""帮我建个图转视频工作流""在画布上创建去背景节点"

可用工具（仅 intent=tool_call 时填写 tool_name）：
- generate_image：根据描述生成电商图片
- remove_background：去除图片背景（抠图）
- generate_video：把图片生成成视频
- create_storyboard：根据脚本生成分镜板

返回严格 JSON，不要有任何额外文字：
{
  "intent": "answer_only" | "clarify" | "tool_call" | "canvas_plan",
  "confidence": 0.0-1.0,
  "reason": "一句话说明理由",
  "tool_name": "工具名（仅 tool_call 时填写）",
  "tool_args": {
    "prompt": "...",
    "style": "...",
    "ratio": "..."
    // 根据工具不同填写对应参数
  },
  "clarify_question": "追问问题（仅 clarify 时填写）"
}"""


# ── LLM call ───────────────────────────────────────────────────────────────────

def _get_api_key() -> str:
    return str(os.getenv("DEEPSEEK_API_KEY", "") or DEEPSEEK_API_KEY or "").strip()


def _get_base_url() -> str:
    return str(os.getenv("DEEPSEEK_BASE_URL", "") or DEEPSEEK_BASE_URL or "https://api.deepseek.com").strip().rstrip("/")


def _get_model() -> str:
    raw = str(MODEL_AGENT_CHAT or "deepseek-v4-flash").strip()
    return raw.split(":", 1)[-1].strip() if ":" in raw else raw


def _build_messages(message: str, history: List[Dict[str, Any]], documents: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Build the messages list for the classification call."""
    # Inject document context into user message if present
    doc_context = ""
    for doc in documents:
        if doc.get("file_type") == "doc" and doc.get("text_content"):
            doc_context += f"\n\n[附件: {doc['name']}]\n{doc['text_content'][:2000]}"
        elif doc.get("file_type") == "image":
            doc_context += f"\n[用户上传了图片: {doc['name']}]"

    user_text = message
    if doc_context:
        user_text = f"{message}{doc_context}"

    msgs = [{"role": "system", "content": _CLASSIFY_SYSTEM}]

    # Include last 6 turns of history for context
    recent = (history or [])[-6:]
    for h in recent:
        role = str(h.get("role") or "user")
        content = str(h.get("content") or "")
        if role in ("user", "assistant") and content:
            msgs.append({"role": role, "content": content})

    msgs.append({"role": "user", "content": user_text})
    return msgs


def _call_classify_llm(message: str, history: List[Dict[str, Any]], documents: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Synchronous DeepSeek JSON-mode call for intent classification."""
    import httpx

    api_key = _get_api_key()
    if not api_key:
        return {"intent": "answer_only", "confidence": 0.5, "reason": "no_api_key"}

    messages = _build_messages(message, history, documents)

    payload = {
        "model": _get_model(),
        "messages": messages,
        "stream": False,
        "response_format": {"type": "json_object"},
        "max_tokens": 512,
        "temperature": 0.1,
    }

    url = f"{_get_base_url()}/chat/completions"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    try:
        with httpx.Client(timeout=15.0, trust_env=False) as client:
            resp = client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
            text = (data.get("choices", [{}])[0].get("message", {}).get("content") or "").strip()
            return json.loads(text)
    except Exception as e:
        sys_logger.warning(f"[classify] LLM call failed: {e}")
        return {"intent": "answer_only", "confidence": 0.3, "reason": f"llm_error: {e}"}


# ── Node ───────────────────────────────────────────────────────────────────────

async def classify_intent(state: AgentState) -> Dict[str, Any]:
    """
    Two-stage intent router.

    Stage 1 (free): if intent was set by normalize_request, skip LLM.
    Stage 2 (LLM): call DeepSeek JSON-mode classification.
    """
    t0 = time.time()

    # Stage 1: already routed by normalize_request
    if state.get("intent_reason", "").startswith("force_action") or \
       state.get("intent_reason", "").startswith("ui_action"):
        return {
            "trace": [{"node": "classify_intent", "shortcut": True, "ts": t0,
                       "intent": state.get("intent"), "ms": 0}],
        }

    # Stage 2: LLM classification
    import asyncio
    message = state.get("message", "")
    history = state.get("conversation_history") or []
    documents = state.get("uploaded_documents") or []

    result = await asyncio.to_thread(_call_classify_llm, message, history, documents)

    intent = str(result.get("intent") or "answer_only")
    confidence = float(result.get("confidence") or 0.5)
    reason = str(result.get("reason") or "")
    tool_name = str(result.get("tool_name") or "").strip() or None
    tool_args = dict(result.get("tool_args") or {})
    clarify_q = str(result.get("clarify_question") or "").strip()

    # If confidence is too low, fall back to clarify
    if intent == "tool_call" and confidence < 0.4:
        intent = "clarify"
        clarify_q = clarify_q or "请描述一下你想要创建的内容，越详细越好。"

    elapsed = int((time.time() - t0) * 1000)
    sys_logger.info(f"[classify_intent] intent={intent} tool={tool_name} confidence={confidence:.2f} ms={elapsed}")

    updates: Dict[str, Any] = {
        "intent": intent,
        "intent_confidence": confidence,
        "intent_reason": reason,
        "tool_name": tool_name,
        "tool_args": tool_args,
        "trace": [{"node": "classify_intent", "intent": intent, "tool": tool_name,
                   "confidence": confidence, "ms": elapsed, "ts": t0}],
    }

    # For clarify intent, pre-fill exec_response_text so build_response can use it
    if intent == "clarify" and clarify_q:
        updates["exec_response_text"] = clarify_q

    return updates
