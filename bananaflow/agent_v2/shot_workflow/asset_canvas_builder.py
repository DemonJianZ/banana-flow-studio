from __future__ import annotations

import math
import re
import uuid
from typing import Any


def make_entity_id(entity_type: str, name: str, occurrence: int = 1) -> str:
    safe = re.sub(r'[\s/:\\|]', '_', str(name or "").strip())
    suffix = "" if occurrence == 1 else f"_{occurrence}"
    return f"{entity_type}_{safe}{suffix}"


_PAD = 40           # padding inside group container
_MAX_COLS = 4       # max nodes per row before wrapping
_COL_W = 308        # horizontal step per node (node width 280px + 28px gap)
_ROW_H_CHAR = 340   # vertical step for character rows (1:1 image, taller)
_ROW_H_SCENE = 280  # vertical step for scene rows (16:9 image, shorter)
_GROUP_GAP = 60     # vertical gap between the two groups


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


def _origin(current_nodes: list[dict[str, Any]]) -> tuple[int, int]:
    if not current_nodes:
        return 120, 120
    max_x = max(int(node.get("x") or 0) for node in current_nodes)
    min_y = min(int(node.get("y") or 120) for node in current_nodes)
    return max_x + 460, max(80, min_y)


def _name_score(query: str, target: str) -> float:
    q, t = query.strip(), target.strip()
    if not q or not t:
        return 0.0
    if q == t:
        return 3.0
    if q.startswith(t) or t.startswith(q):
        return 2.0
    if t in q or q in t:
        return 1.0
    return 0.0


def _match_assets(
    char_entities: list[dict[str, Any]],
    scene_entities: list[dict[str, Any]],
) -> tuple[list[str | None], list[str | None]]:
    """
    For each entity try to match a URL from main_assets/.
    Returns (char_urls, scene_urls) — each element is a URL string or None if not found.
    """
    try:
        from agent_v2.storyboard.local_asset_library import scan_local_assets
        manifest = scan_local_assets()
    except Exception:
        return [None] * len(char_entities), [None] * len(scene_entities)

    char_urls: list[str | None] = []
    for entity in char_entities:
        name = str(entity.get("name") or "").strip()
        best_score, best_url = 0.0, None
        for rec in manifest.characters:
            s = _name_score(name, rec.name)
            if s > best_score and rec.three_view_url:
                best_score = s
                best_url = rec.three_view_url
        char_urls.append(best_url if best_score >= 1.0 else None)

    scene_urls: list[str | None] = []
    for entity in scene_entities:
        name = str(entity.get("name") or "").strip()
        best_score, best_url = 0.0, None
        for rec in manifest.scenes:
            s = _name_score(name, rec.folder_name)
            if s > best_score and rec.preview_urls:
                best_score = s
                best_url = rec.preview_urls[0]
        scene_urls.append(best_url if best_score >= 1.0 else None)

    return char_urls, scene_urls


def _build_group(
    entities: list[dict[str, Any]],
    matched_urls: list[str | None],
    group_prefix: str,
    title: str,
    base_x: int,
    base_y: int,
    *,
    entity_kind: str,  # "character" or "scene"
) -> tuple[list[dict[str, Any]], int, list[str]]:
    """Return (patches, total_height, selected_ids).

    Each entity becomes exactly one node:
    - matched image → input node (displays the reference image)
    - no match      → text_input node (name + description as placeholder)
    No workflow nodes (processor / output) are created here.
    """
    if not entities:
        return [], 0, []

    n = len(entities)
    row_h = _ROW_H_CHAR if entity_kind == "character" else _ROW_H_SCENE
    n_cols = min(n, _MAX_COLS)
    n_rows = math.ceil(n / _MAX_COLS)
    group_w = _PAD * 2 + n_cols * _COL_W
    group_h = _PAD * 2 + n_rows * row_h

    patch: list[dict[str, Any]] = []
    selected_ids: list[str] = []

    # Group container (background; rendered first so it sits behind children)
    group_id = _new_id(group_prefix)
    patch.append({
        "op": "add_node",
        "node": {
            "id": group_id,
            "type": "group_container",
            "x": base_x - _PAD,
            "y": base_y - _PAD,
            "data": {"title": title, "width": group_w, "height": group_h},
        },
    })

    for i, (entity, matched_url) in enumerate(zip(entities, matched_urls)):
        name = str(entity.get("name") or "").strip()
        desc = str(entity.get("description") or entity.get("atmosphere") or "").strip()
        pfx = f"{group_prefix}_r{i + 1}"
        col_idx = i % _MAX_COLS
        row_idx = i // _MAX_COLS
        node_x = base_x + col_idx * _COL_W
        node_y = base_y + row_idx * row_h

        if matched_url:
            node_id = _new_id(f"{pfx}_ref")
            label = f"{name} 设定图" if entity_kind == "character" else f"{name} 场景图"
            patch.append({
                "op": "add_node",
                "node": {
                    "id": node_id,
                    "type": "input",
                    "x": node_x,
                    "y": node_y,
                    "data": {
                        "images": [matched_url],
                        "mediaKind": "image",
                        "title": label,
                    },
                },
            })
        else:
            node_id = _new_id(f"{pfx}_txt")
            placeholder = desc[:120] if desc else name
            patch.append({
                "op": "add_node",
                "node": {
                    "id": node_id,
                    "type": "text_input",
                    "x": node_x,
                    "y": node_y,
                    "data": {"text": placeholder, "title": name or f"{entity_kind} {i + 1}"},
                },
            })

        selected_ids.append(node_id)

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
    scene_entities = [s for s in scenes if str(s.get("name") or "").strip()]

    char_urls, scene_urls = _match_assets(char_entities, scene_entities)

    if char_entities:
        p, h, sel = _build_group(
            char_entities, char_urls, "chars", "角色与道具设定", base_x, current_y, entity_kind="character"
        )
        patch.extend(p)
        all_selected.extend(sel)
        current_y += h + _GROUP_GAP

    if scene_entities:
        p, _, sel = _build_group(
            scene_entities, scene_urls, "scenes", "场景设定", base_x, current_y, entity_kind="scene"
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
