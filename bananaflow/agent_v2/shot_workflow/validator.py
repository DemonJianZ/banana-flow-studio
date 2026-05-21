from __future__ import annotations

from typing import Any

_ALLOWED_NODE_TYPES = {"text_input", "input", "processor", "output"}
_ALLOWED_MODES = {"text2img", "local_text2img", "multi_image_generate"}


def validate_patch(patch: list[dict[str, Any]]) -> list[str]:
    warnings: list[str] = []
    node_ids: set[str] = set()
    for op in patch:
        if op.get("op") != "add_node":
            continue
        node = dict(op.get("node") or {})
        node_id = str(node.get("id") or "").strip()
        node_type = str(node.get("type") or "").strip()
        if not node_id:
            warnings.append("node_missing_id")
            continue
        node_ids.add(node_id)
        if node_type == "storyboard_plan":
            warnings.append("forbidden_storyboard_plan_removed")
        if node_type not in _ALLOWED_NODE_TYPES:
            warnings.append(f"unsupported_node_type:{node_type}")
        data = dict(node.get("data") or {})
        mode = str(data.get("mode") or "").strip()
        if node_type == "processor" and mode not in _ALLOWED_MODES:
            warnings.append(f"unsupported_processor_mode:{mode}")
        if node_type == "processor" and mode in {"text2img", "local_text2img", "multi_image_generate"} and not str(data.get("prompt") or "").strip():
            warnings.append(f"processor_missing_prompt:{node_id}")
    for op in patch:
        if op.get("op") != "add_connection":
            continue
        conn = dict(op.get("connection") or {})
        src = str(conn.get("from") or "").strip()
        dst = str(conn.get("to") or "").strip()
        if src not in node_ids or dst not in node_ids:
            warnings.append(f"connection_endpoint_missing:{src}->{dst}")
    return warnings
