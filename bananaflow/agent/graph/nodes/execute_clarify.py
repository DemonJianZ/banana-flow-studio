"""
nodes/execute_clarify.py — Return a clarification question to the user.

No LLM call required; the question was already determined by classify_intent.
"""
from __future__ import annotations

import time
from typing import Any, Dict

from ..state import AgentState
from ...stream import push_token, push_clarify


async def execute_clarify(state: AgentState) -> Dict[str, Any]:
    """Push a clarification question and optional quick-reply options."""
    t0 = time.time()
    question = str(state.get("exec_response_text") or "").strip()

    if not question:
        question = "请描述一下你想要创建的内容，越详细效果越好。"

    # Emit as clarify event (frontend renders option buttons)
    await push_clarify(question)
    # Also emit as tokens so the text appears in the bubble
    await push_token(question)

    return {
        "exec_response_text": question,
        "trace": [{"node": "execute_clarify", "ts": t0}],
    }
