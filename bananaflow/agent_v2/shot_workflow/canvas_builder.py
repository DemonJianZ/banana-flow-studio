from __future__ import annotations

import uuid
from typing import Any

from core.config import MODEL_COMFYUI_IMAGE_Z_IMAGE_TURBO
from .schemas import ShotSpec

_ALLOWED_IMAGE_MODES = {"text2img", "local_text2img", "multi_image_generate"}

_INPUT_NODE_SPACING = 120   # vertical gap between consecutive input nodes
_MIN_ROW_HEIGHT = 280       # minimum vertical space per shot row


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


def _origin(current_nodes: list[dict[str, Any]]) -> tuple[int, int]:
    if not current_nodes:
        return 120, 120
    max_x = max(int(node.get("x") or 0) for node in current_nodes)
    min_y = min(int(node.get("y") or 120) for node in current_nodes)
    return max_x + 420, max(80, min_y)


def _collect_reference_items(
    shot: ShotSpec,
    selected_artifact: dict[str, Any] | None,
) -> list[tuple[str, str]]:
    """Return (url, label) pairs — one per reference image, each becomes its own input node."""
    items: list[tuple[str, str]] = []
    bindings = dict(shot.get("asset_bindings") or {})

    for binding in list(bindings.get("character_bindings") or []):
        url = str((binding or {}).get("three_view_url") or "").strip()
        name = str((binding or {}).get("name") or (binding or {}).get("query_name") or "").strip()
        if url:
            items.append((url, name or "角色参考"))

    scene_binding = dict(bindings.get("scene_binding") or {})
    scene_urls = list(scene_binding.get("preview_urls") or [])
    if scene_urls:
        url = str(scene_urls[0]).strip()
        scene_name = str(scene_binding.get("folder_name") or "场景参考").strip()
        if url:
            items.append((url, scene_name))

    if not items and selected_artifact and selected_artifact.get("url"):
        items.append((str(selected_artifact["url"]), "参考图"))

    return items


def build_canvas_patch(
    shots: list[ShotSpec],
    *,
    aspect_ratio: str = "16:9",
    mode_policy: str = "auto",
    selected_artifact: dict[str, Any] | None = None,
    current_nodes: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    base_x, base_y = _origin(current_nodes or [])
    patch: list[dict[str, Any]] = []
    selected_ids: list[str] = []
    current_y = base_y

    # url → node_id: shared input nodes across shots with the same reference image
    ref_url_to_node_id: dict[str, str] = {}

    for row, shot in enumerate(shots):
        mode = str(shot.get("mode") or "text2img").strip()
        if mode not in _ALLOWED_IMAGE_MODES:
            mode = "text2img"

        ref_items: list[tuple[str, str]] = []
        if mode == "multi_image_generate":
            ref_items = _collect_reference_items(shot, selected_artifact)

        # Split into new refs (need a node) vs reused refs (node already exists)
        new_ref_items: list[tuple[str, str]] = []
        reused_ids: list[str] = []
        for url, label in ref_items:
            if url in ref_url_to_node_id:
                reused_ids.append(ref_url_to_node_id[url])
            else:
                new_ref_items.append((url, label))

        # Row height is driven only by *new* input nodes in this row
        new_count = len(new_ref_items)
        row_height = max(_MIN_ROW_HEIGHT, 120 + new_count * _INPUT_NODE_SPACING)

        # Processor centered on the new input block (or at row top when all reused)
        input_block_height = new_count * _INPUT_NODE_SPACING
        proc_y = current_y + max(0, (input_block_height - 80) // 2)

        # --- text_input node ---
        text_id = _new_id(f"shot{row + 1}_text")
        patch.append({
            "op": "add_node",
            "node": {
                "id": text_id,
                "type": "text_input",
                "x": base_x,
                "y": current_y,
                "data": {
                    "text": shot.get("prompt") or "",
                    "shot_id": shot.get("shot_id"),
                    "title": shot.get("title") or f"镜头 {row + 1}",
                },
            },
        })
        selected_ids.append(text_id)

        # --- create NEW input nodes; reused ones already exist ---
        input_ids: list[str] = list(reused_ids)
        for j, (url, label) in enumerate(new_ref_items):
            inp_id = _new_id(f"shot{row + 1}_ref{j + 1}")
            ref_url_to_node_id[url] = inp_id
            patch.append({
                "op": "add_node",
                "node": {
                    "id": inp_id,
                    "type": "input",
                    "x": base_x,
                    "y": current_y + 120 + j * _INPUT_NODE_SPACING,
                    "data": {"images": [url], "mediaKind": "image", "title": label},
                },
            })
            input_ids.append(inp_id)
            selected_ids.append(inp_id)

        # --- processor node ---
        proc_id = _new_id(f"shot{row + 1}_gen")
        if mode == "multi_image_generate":
            templates: dict[str, Any] = {"size": "1k", "note": ""}
        else:
            templates = {"size": "1k", "aspect_ratio": aspect_ratio}
        data: dict[str, Any] = {
            "mode": mode,
            "prompt": shot.get("prompt") or "",
            "templates": templates,
            "batchSize": 1,
            "status": "idle",
            "shot_id": shot.get("shot_id"),
            "shot_title": shot.get("title"),
            "workflow_role": "shot_image_generation",
            "model": MODEL_COMFYUI_IMAGE_Z_IMAGE_TURBO if mode == "local_text2img" else "",
        }
        patch.append({
            "op": "add_node",
            "node": {"id": proc_id, "type": "processor", "x": base_x + 360, "y": proc_y, "data": data},
        })
        selected_ids.append(proc_id)

        # --- output node ---
        out_id = _new_id(f"shot{row + 1}_out")
        patch.append({
            "op": "add_node",
            "node": {
                "id": out_id,
                "type": "output",
                "x": base_x + 720,
                "y": proc_y,
                "data": {"images": [], "shot_id": shot.get("shot_id"), "label": f"{shot.get('shot_id')} 出图"},
            },
        })
        selected_ids.append(out_id)

        # --- connections ---
        patch.append({"op": "add_connection", "connection": {"id": _new_id("c"), "from": text_id, "to": proc_id}})
        for inp_id in input_ids:
            patch.append({"op": "add_connection", "connection": {"id": _new_id("c"), "from": inp_id, "to": proc_id}})
        patch.append({"op": "add_connection", "connection": {"id": _new_id("c"), "from": proc_id, "to": out_id}})

        current_y += row_height

    if selected_ids:
        patch.append({"op": "select_nodes", "ids": selected_ids[:24]})
        patch.append({"op": "set_viewport", "viewport": {"x": max(0, base_x - 80), "y": max(0, base_y - 80), "zoom": 0.78}})
    return patch
