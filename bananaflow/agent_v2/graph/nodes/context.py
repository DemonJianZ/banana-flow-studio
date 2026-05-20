from __future__ import annotations

from typing import Any


def _summarize_canvas_state(state: dict) -> dict:
    nodes = list(state.get("current_nodes") or [])
    conns = list(state.get("current_connections") or [])
    node_types: list[str] = []
    seen: set[str] = set()
    for node in nodes[:20]:
        node_type = str(node.get("type") or "").strip()
        if node_type and node_type not in seen:
            seen.add(node_type)
            node_types.append(node_type)
    result: dict[str, Any] = {
        "node_count": len(nodes),
        "connection_count": len(conns),
        "node_types": node_types,
        "canvas_id": str(state.get("canvas_id") or "").strip() or None,
    }
    return result


def _summarize_selected_artifact(state: dict) -> dict:
    artifact = dict(state.get("selected_artifact") or {})
    if not artifact:
        return {}
    meta = dict(artifact.get("meta") or {})
    return {
        "kind": str(artifact.get("kind") or "").strip() or "image",
        "fromNodeId": str(artifact.get("fromNodeId") or "").strip() or None,
        "url_present": bool(str(artifact.get("url") or "").strip()),
        "node_kind": str(meta.get("nodeKind") or "").strip() or None,
        "selection_type": str(meta.get("selectionType") or "").strip() or None,
        "selection_id": str(meta.get("selectionId") or "").strip() or None,
        "selection_label": str(meta.get("selectionLabel") or "").strip() or None,
        "selection_summary": str(meta.get("selectionSummary") or "").strip() or None,
        "storyboard_title": str(meta.get("storyboardTitle") or "").strip() or None,
        "scene_title": str(meta.get("sceneTitle") or "").strip() or None,
        "scene_location": str(meta.get("sceneLocation") or "").strip() or None,
        "payload": meta.get("payload") if isinstance(meta.get("payload"), dict) else None,
    }


def assemble_context(state: dict) -> dict:
    """Build canvas_summary and artifact_summary from current request state."""
    canvas_summary = _summarize_canvas_state(state)
    artifact_summary = _summarize_selected_artifact(state)

    trace_entry: dict[str, Any] = {
        "type": "ASSEMBLE_CONTEXT",
        "node_count": canvas_summary.get("node_count", 0),
        "history_turns": len(list(state.get("conversation_history") or [])) // 2,
    }
    return {
        "canvas_summary": canvas_summary,
        "artifact_summary": artifact_summary,
        "trace": list(state.get("trace") or []) + [trace_entry],
    }
