from __future__ import annotations

import uuid
from typing import Any

_PAD = 40          # padding inside group container
_ROW_H = 160       # vertical spacing between rows
_PROC_X = 360      # x offset: text_input → processor
_OUT_X = 720       # x offset: text_input → output
_GROUP_W = 1100    # group container width
_GROUP_GAP = 80    # vertical gap between the two groups


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


def _origin(current_nodes: list[dict[str, Any]]) -> tuple[int, int]:
    if not current_nodes:
        return 120, 120
    max_x = max(int(node.get("x") or 0) for node in current_nodes)
    min_y = min(int(node.get("y") or 120) for node in current_nodes)
    return max_x + 460, max(80, min_y)


def _build_group(
    entities: list[dict[str, Any]],
    group_prefix: str,
    title: str,
    base_x: int,
    base_y: int,
    *,
    entity_kind: str,  # "character" or "scene"
) -> tuple[list[dict[str, Any]], int, list[str]]:
    """Return (patches, total_height, selected_ids)."""
    if not entities:
        return [], 0, []

    n = len(entities)
    aspect_ratio = "1:1" if entity_kind == "character" else "16:9"
    group_h = _PAD * 2 + n * _ROW_H

    patch: list[dict[str, Any]] = []
    selected_ids: list[str] = []

    # Group container (background node — rendered first so it sits behind children)
    group_id = _new_id(group_prefix)
    patch.append({
        "op": "add_node",
        "node": {
            "id": group_id,
            "type": "group_container",
            "x": base_x - _PAD,
            "y": base_y - _PAD,
            "data": {"title": title, "width": _GROUP_W, "height": group_h},
        },
    })

    row_y = base_y
    for i, entity in enumerate(entities):
        name = str(entity.get("name") or "").strip()
        desc = str(entity.get("description") or entity.get("atmosphere") or "").strip()
        if entity_kind == "character":
            prompt = f"{name}，角色设定图，全身正面，{desc[:120]}" if desc else f"{name}，角色设定图，全身正面"
        else:
            prompt = f"{name}，场景概念图，{desc[:120]}" if desc else f"{name}，场景概念图"

        pfx = f"{group_prefix}_r{i + 1}"

        # text_input
        txt_id = _new_id(f"{pfx}_txt")
        patch.append({
            "op": "add_node",
            "node": {
                "id": txt_id,
                "type": "text_input",
                "x": base_x,
                "y": row_y,
                "data": {"text": prompt, "title": name or f"{entity_kind} {i + 1}"},
            },
        })
        selected_ids.append(txt_id)

        # processor
        proc_id = _new_id(f"{pfx}_gen")
        patch.append({
            "op": "add_node",
            "node": {
                "id": proc_id,
                "type": "processor",
                "x": base_x + _PROC_X,
                "y": row_y,
                "data": {
                    "mode": "text2img",
                    "prompt": prompt,
                    "templates": {"size": "1k", "aspect_ratio": aspect_ratio},
                    "batchSize": 1,
                    "status": "idle",
                    "workflow_role": "character_reference" if entity_kind == "character" else "scene_reference",
                    "title": name or f"{entity_kind} {i + 1}",
                },
            },
        })
        selected_ids.append(proc_id)

        # output
        out_id = _new_id(f"{pfx}_out")
        label = f"{name} 设定图" if entity_kind == "character" else f"{name} 场景图"
        patch.append({
            "op": "add_node",
            "node": {
                "id": out_id,
                "type": "output",
                "x": base_x + _OUT_X,
                "y": row_y,
                "data": {"images": [], "label": label},
            },
        })
        selected_ids.append(out_id)

        patch.append({"op": "add_connection", "connection": {"id": _new_id("c"), "from": txt_id, "to": proc_id}})
        patch.append({"op": "add_connection", "connection": {"id": _new_id("c"), "from": proc_id, "to": out_id}})

        row_y += _ROW_H

    return patch, group_h, selected_ids


def build_asset_canvas_patch(
    characters: list[dict[str, Any]],
    scenes: list[dict[str, Any]],
    *,
    current_nodes: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    base_x, base_y = _origin(current_nodes or [])
    patch: list[dict[str, Any]] = []
    all_selected: list[str] = []
    current_y = base_y

    char_entities = [c for c in characters if str(c.get("name") or "").strip()]
    if char_entities:
        p, h, sel = _build_group(
            char_entities, "chars", "角色与道具设定", base_x, current_y, entity_kind="character"
        )
        patch.extend(p)
        all_selected.extend(sel)
        current_y += h + _GROUP_GAP

    scene_entities = [s for s in scenes if str(s.get("name") or "").strip()]
    if scene_entities:
        p, _, sel = _build_group(
            scene_entities, "scenes", "场景设定", base_x, current_y, entity_kind="scene"
        )
        patch.extend(p)
        all_selected.extend(sel)

    if all_selected:
        patch.append({"op": "select_nodes", "ids": all_selected[:24]})
        patch.append({
            "op": "set_viewport",
            "viewport": {"x": max(0, base_x - 80), "y": max(0, base_y - 80), "zoom": 0.72},
        })

    return patch
