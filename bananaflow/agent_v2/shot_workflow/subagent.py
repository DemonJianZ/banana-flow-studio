from __future__ import annotations

from typing import Any

from .graph import invoke_shot_workflow_graph

TOOL_VERSION = "shot-workflow-compose-v2"
TOOL_HASH = "2026-05-21-shot-workflow-compose-v2"


def compose_shot_workflow(args: dict[str, Any]) -> dict[str, Any]:
    state = invoke_shot_workflow_graph(dict(args or {}))
    return {
        "kind": "shot_workflow",
        "summary": str(state.get("summary") or "").strip(),
        "shots": list(state.get("shots") or []),
        "annotated_script": str(state.get("annotated_script") or "").strip(),
        "patch": list(state.get("patch") or []),
        "warnings": list(state.get("warnings") or []),
        "trace": list(state.get("trace") or []),
        "tool_version": TOOL_VERSION,
        "tool_hash": TOOL_HASH,
    }
