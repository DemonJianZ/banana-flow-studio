"""
nodes/context.py — assemble_context node.

Phase 1: minimal implementation that assembles basic context.
Phase 2 will add canvas state inspection and asset library RAG.
"""
from __future__ import annotations

import time
from typing import Any, Dict

from ..state import AgentState


def assemble_context(state: AgentState) -> Dict[str, Any]:
    """
    Assemble context for the current turn.

    Phase 1: passes through. The conversation_history is managed
    by the LangGraph checkpointer automatically via add_messages reducer.
    """
    return {
        "canvas_summary": state.get("canvas_summary") or {},
        "artifact_summary": state.get("artifact_summary") or {},
        "trace": [{"node": "assemble_context", "ts": time.time()}],
    }
