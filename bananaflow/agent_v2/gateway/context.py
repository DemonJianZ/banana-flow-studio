from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from .schemas import AgentMessageRequest


@dataclass(frozen=True)
class GatewayContext:
    message: str
    recent_messages: List[Dict[str, Any]] = field(default_factory=list)
    canvas_summary: Dict[str, Any] = field(default_factory=dict)
    selected_artifact_summary: Dict[str, Any] = field(default_factory=dict)
    request_metadata: Dict[str, Any] = field(default_factory=dict)


def summarize_canvas_state(req: AgentMessageRequest) -> Dict[str, Any]:
    nodes = list(req.current_nodes or [])
    conns = list(req.current_connections or [])
    node_types: List[str] = []
    seen = set()
    for node in nodes[:20]:
        node_type = str(node.get("type") or "").strip()
        if node_type and node_type not in seen:
            seen.add(node_type)
            node_types.append(node_type)
    return {
        "node_count": len(nodes),
        "connection_count": len(conns),
        "node_types": node_types,
        "canvas_id": str(req.canvas_id or "").strip() or None,
    }


def summarize_selected_artifact(req: AgentMessageRequest) -> Dict[str, Any]:
    artifact = dict(req.selected_artifact or {})
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


def build_gateway_context(req: AgentMessageRequest) -> GatewayContext:
    return GatewayContext(
        message=str(req.message or "").strip(),
        recent_messages=list(req.recent_messages or [])[-8:],
        canvas_summary=summarize_canvas_state(req),
        selected_artifact_summary=summarize_selected_artifact(req),
        request_metadata={
            "mode": str(req.mode or "").strip() or None,
            "product": str(req.product or "").strip() or None,
            "task_mode": str(req.task_mode or "").strip() or None,
            "thread_id": str(req.thread_id or "").strip() or None,
        },
    )
