from __future__ import annotations

import hashlib
import math
import re
import uuid
from typing import Any

from agent_v2.storyboard.local_asset_library import scan_local_assets
from .asset_design_prompter import resolve_asset_design_mode


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


def _normalize_location(text: str) -> str:
    return re.sub(r"(?<=[一-鿿㐀-䶿])的(?=[一-鿿㐀-䶿])", "", str(text or ""))


def _cjk_tokens(text: str) -> set[str]:
    chars = re.findall(r"[一-鿿㐀-䶿]", text)
    tokens: set[str] = set()
    for n in (2, 3):
        for i in range(len(chars) - n + 1):
            tokens.add("".join(chars[i: i + n]))
    return tokens


def _scene_score(location_text: str, folder_name: str, active_char_names: set[str]) -> float:
    score = 0.0
    f, loc = folder_name.strip(), location_text.strip()
    if not f or not loc:
        return 0.0
    f_norm = _normalize_location(f)
    loc_norm = _normalize_location(loc)
    if f in loc or (f_norm and f_norm in loc_norm):
        score += 3.0
    elif loc in f or (loc_norm and loc_norm in f_norm):
        score += 2.0
    shared = _cjk_tokens(loc_norm) & _cjk_tokens(f_norm)
    score += len(shared) * 1.0
    for char_name in active_char_names:
        if char_name and char_name in f:
            score += 1.5
            break
    return score


def _make_asset_id(relative_path: str) -> str:
    return hashlib.md5(str(relative_path or "").encode()).hexdigest()[:12]


def match_asset_entities(entities: list[dict]) -> dict:
    """
    Unified asset matching. Routes by entity_type:
      character → name match against manifest.characters
      scene     → folder match against manifest.scenes
      prop      → Phase 0: always unmatched (no prop library)

    Returns {"matched": [...], "unmatched": [...], "candidates": [...]}
    Threshold: score >= 1.0 → matched, 0.5 <= score < 1.0 → candidate, else unmatched
    """
    try:
        manifest = scan_local_assets()
    except Exception:
        return {"matched": [], "unmatched": list(entities), "candidates": []}

    matched: list[dict] = []
    unmatched: list[dict] = []
    candidates: list[dict] = []

    for entity in entities:
        etype = str(entity.get("entity_type") or "").strip()
        name = str(entity.get("name") or "").strip()
        eid = str(entity.get("entity_id") or "").strip()

        if etype == "prop":
            unmatched.append(dict(entity))
            continue

        if etype == "character":
            best_score, best_rec = 0.0, None
            for rec in manifest.characters:
                s = _name_score(name, rec.name)
                if s > best_score and rec.three_view_url:
                    best_score = s
                    best_rec = rec
            if best_score >= 1.0 and best_rec:
                matched.append({
                    "entity_id": eid,
                    "name": name,
                    "entity_type": etype,
                    "description": entity.get("description") or "",
                    "asset_id": _make_asset_id(best_rec.three_view_path or best_rec.three_view_url or ""),
                    "url": best_rec.three_view_url,
                    "score": best_score,
                })
            elif best_score >= 0.5 and best_rec:
                candidates.append({
                    "entity_id": eid,
                    "name": name,
                    "entity_type": etype,
                    "description": entity.get("description") or "",
                    "url": best_rec.three_view_url,
                    "score": best_score,
                    "reason": "partial_name_match",
                })
            else:
                unmatched.append(dict(entity))
            continue

        if etype == "scene":
            active_chars: set[str] = {
                str(e.get("name") or "").strip()
                for e in entities
                if str(e.get("entity_type") or "").strip() == "character"
                and str(e.get("name") or "").strip()
            }
            best_score, best_rec = 0.0, None
            for rec in manifest.scenes:
                s = _scene_score(name, rec.folder_name, active_chars)
                if s > best_score:
                    best_score = s
                    best_rec = rec
            if best_score >= 1.0 and best_rec and best_rec.preview_urls:
                matched.append({
                    "entity_id": eid,
                    "name": name,
                    "entity_type": etype,
                    "description": entity.get("description") or "",
                    "asset_id": _make_asset_id(best_rec.folder_path or ""),
                    "url": best_rec.preview_urls[0],
                    "score": best_score,
                })
            elif best_score >= 0.5 and best_rec and best_rec.preview_urls:
                candidates.append({
                    "entity_id": eid,
                    "name": name,
                    "entity_type": etype,
                    "description": entity.get("description") or "",
                    "url": best_rec.preview_urls[0],
                    "score": best_score,
                    "reason": "partial_scene_match",
                })
            else:
                unmatched.append(dict(entity))
            continue

        # Unknown entity_type → unmatched
        unmatched.append(dict(entity))

    return {"matched": matched, "unmatched": unmatched, "candidates": candidates}


def _match_assets(
    char_entities: list[dict[str, Any]],
    scene_entities: list[dict[str, Any]],
) -> tuple[list[str | None], list[str | None]]:
    """
    For each entity try to match a URL from main_assets/.
    Returns (char_urls, scene_urls) — each element is a URL string or None if not found.
    """
    try:
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
    group_prefix: str,
    title: str,
    base_x: int,
    base_y: int,
    *,
    entity_kind: str,  # "character", "prop", or "scene"
    mode_policy: str = "text2img",
) -> tuple[list[dict[str, Any]], int, list[str]]:
    """Return (patches, total_height, selected_ids).

    Entities are split into matched and missing/candidate.
    Matched entities → single ``input`` node (grid layout).
    Missing/candidate entities → three-node chain (text_input → processor → output)
    plus two add_connection ops per entity.

    Layout: matched grid rows first, then one row per missing entity below.
    """
    if not entities:
        return [], 0, []

    row_h = _ROW_H_CHAR if entity_kind != "scene" else _ROW_H_SCENE

    # Separate matched vs missing/candidate
    matched_entities = [e for e in entities if e.get("asset_status") == "matched"]
    gen_entities = [e for e in entities if e.get("asset_status") in {"missing", "candidate"}]

    # --- Compute sizes for the group container ---
    # Matched: grid of up to _MAX_COLS
    n_matched = len(matched_entities)
    matched_cols = min(n_matched, _MAX_COLS) if n_matched else 0
    matched_rows = math.ceil(n_matched / _MAX_COLS) if n_matched else 0
    matched_grid_h = matched_rows * row_h if matched_rows else 0

    # Missing: each occupies one row; three nodes side by side (width ~1100px)
    _GEN_NODE_W = 360  # horizontal step between generation chain nodes
    n_gen = len(gen_entities)
    gen_rows = n_gen  # one row per entity
    gen_grid_h = gen_rows * row_h if gen_rows else 0

    # Overall group dimensions
    total_content_cols = max(matched_cols, 3) if (n_matched or n_gen) else 1
    group_w = _PAD * 2 + total_content_cols * _COL_W
    group_h = _PAD * 2 + matched_grid_h + (row_h if (n_matched and n_gen) else 0) + gen_grid_h

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

    # --- Matched entities: input nodes in grid ---
    for i, entity in enumerate(matched_entities):
        name = str(entity.get("name") or "").strip()
        entity_id = str(entity.get("entity_id") or "").strip()
        entity_type = str(entity.get("entity_type") or entity_kind).strip()
        matched_url = entity.get("matched_url") or ""
        asset_id = entity.get("asset_id") or ""

        pfx = f"{group_prefix}_r{i + 1}"
        col_idx = i % _MAX_COLS
        row_idx = i // _MAX_COLS
        node_x = base_x + col_idx * _COL_W
        node_y = base_y + row_idx * row_h

        node_id = _new_id(f"{pfx}_ref")
        patch.append({
            "op": "add_node",
            "node": {
                "id": node_id,
                "type": "input",
                "x": node_x,
                "y": node_y,
                "data": {
                    "url": matched_url,
                    "title": f"{name} 设定图",
                    "entity_id": entity_id,
                    "entity_name": name,
                    "entity_type": entity_type,
                    "asset_status": "matched",
                    "asset_id": asset_id,
                    "workflow_role": "asset_design_generation",
                },
            },
        })
        selected_ids.append(node_id)

    # --- Missing/candidate entities: three-node generation chain ---
    gen_start_y = base_y + matched_grid_h + (row_h if (n_matched and n_gen) else 0)
    design_mode = resolve_asset_design_mode(mode_policy)

    for j, entity in enumerate(gen_entities):
        name = str(entity.get("name") or "").strip()
        entity_id = str(entity.get("entity_id") or "").strip()
        entity_type = str(entity.get("entity_type") or entity_kind).strip()
        description = str(entity.get("description") or "").strip()
        asset_status = str(entity.get("asset_status") or "missing")
        design_prompt = entity.get("design_prompt") or ""
        design_prompt_source = str(entity.get("design_prompt_source") or "")

        pfx = f"{group_prefix}_gen{j + 1}"
        node_x = base_x
        node_y = gen_start_y + j * row_h

        # text_input node
        ti_id = _new_id(f"{pfx}_txt")
        patch.append({
            "op": "add_node",
            "node": {
                "id": ti_id,
                "type": "text_input",
                "x": node_x,
                "y": node_y,
                "data": {
                    "text": design_prompt,
                    "title": f"{name} 设定图",
                    "entity_id": entity_id,
                    "entity_name": name,
                    "entity_type": entity_type,
                    "description": description,
                    "asset_status": asset_status,
                    "design_prompt_source": design_prompt_source,
                    "workflow_role": "asset_design_generation",
                },
            },
        })

        # processor node
        proc_id = _new_id(f"{pfx}_proc")
        patch.append({
            "op": "add_node",
            "node": {
                "id": proc_id,
                "type": "processor",
                "x": node_x + _GEN_NODE_W,
                "y": node_y,
                "data": {
                    "mode": design_mode,
                    "prompt": design_prompt,
                    "model": "",
                    "workflow_role": "asset_design_generation",
                    "asset_status": asset_status,
                    "entity_id": entity_id,
                    "entity_name": name,
                    "entity_type": entity_type,
                    "templates": {"size": "1k"},
                    "batchSize": 1,
                    "status": "idle",
                },
            },
        })

        # output node
        out_id = _new_id(f"{pfx}_out")
        patch.append({
            "op": "add_node",
            "node": {
                "id": out_id,
                "type": "output",
                "x": node_x + _GEN_NODE_W * 2,
                "y": node_y,
                "data": {
                    "workflow_role": "asset_design_generation",
                    "entity_id": entity_id,
                    "entity_name": name,
                },
            },
        })

        # Connections: text_input → processor → output
        patch.append({"op": "add_connection", "from": ti_id, "to": proc_id})
        patch.append({"op": "add_connection", "from": proc_id, "to": out_id})

        selected_ids.append(ti_id)

    return patch, group_h, selected_ids


# --- Entity type display names and group prefixes ---
_TYPE_META: dict[str, dict[str, str]] = {
    "character": {"prefix": "chars", "title": "角色与道具设定"},
    "prop": {"prefix": "props", "title": "道具设定"},
    "scene": {"prefix": "scenes", "title": "场景设定"},
}
_DEFAULT_TYPE_META = {"prefix": "entities", "title": "实体设定"}


def build_asset_canvas_patch(
    enriched_entities: list[dict[str, Any]],
    *,
    current_nodes: list[dict[str, Any]] | None = None,
    mode_policy: str = "text2img",
) -> list[dict[str, Any]]:
    """Build canvas patch ops from a list of enriched entities.

    Each entity must have ``entity_id``, ``name``, ``entity_type``,
    ``description``, ``asset_status`` (``matched`` / ``missing`` / ``candidate``),
    ``matched_url``, ``asset_id``, ``design_prompt``,
    ``design_prompt_source``, ``design_prompt_warnings``.

    Groups entities by ``entity_type``; within each group matched entities
    create ``input`` nodes and missing/candidate entities create a
    ``text_input → processor → output`` generation chain.
    """
    base_x, base_y = _origin(current_nodes or [])
    patch: list[dict[str, Any]] = []
    all_selected: list[str] = []
    current_y = base_y

    # Group entities by entity_type
    groups: dict[str, list[dict[str, Any]]] = {}
    for entity in enriched_entities:
        etype = str(entity.get("entity_type") or "").strip()
        groups.setdefault(etype, []).append(entity)

    # Emit groups in a consistent order: character, prop, scene, then others
    ordered_types = ["character", "prop", "scene"] + [
        t for t in groups if t not in {"character", "prop", "scene"}
    ]

    for etype in ordered_types:
        if etype not in groups:
            continue
        type_entities = [e for e in groups[etype] if str(e.get("name") or "").strip()]
        if not type_entities:
            continue

        meta = _TYPE_META.get(etype, _DEFAULT_TYPE_META)
        entity_kind = etype if etype in {"character", "prop", "scene"} else "character"

        p, h, sel = _build_group(
            type_entities,
            meta["prefix"],
            meta["title"],
            base_x,
            current_y,
            entity_kind=entity_kind,
            mode_policy=mode_policy,
        )
        patch.extend(p)
        all_selected.extend(sel)
        current_y += h + _GROUP_GAP

    if all_selected:
        patch.append({"op": "select_nodes", "ids": all_selected[:24]})
        patch.append({
            "op": "set_viewport",
            "viewport": {"x": max(0, base_x - 80), "y": max(0, base_y - 80), "zoom": 0.72},
        })

    return patch


def _build_placeholder_asset_patch(
    enriched_entities: list[dict[str, Any]],
    current_nodes: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Fallback: create a bare text_input node per entity, no groups, no connections.

    Used when ``build_asset_canvas_patch`` raises an unexpected error.
    """
    base_x, base_y = _origin(current_nodes or [])
    patch: list[dict[str, Any]] = []

    for i, entity in enumerate(enriched_entities):
        name = str(entity.get("name") or "").strip()
        entity_id = str(entity.get("entity_id") or "").strip()
        design_prompt = entity.get("design_prompt") or ""
        text = design_prompt or name or ""

        node_id = _new_id(f"placeholder_{i}")
        patch.append({
            "op": "add_node",
            "node": {
                "id": node_id,
                "type": "text_input",
                "x": base_x,
                "y": base_y + i * 160,
                "data": {
                    "text": text,
                    "title": f"{name} 设定图",
                    "entity_id": entity_id,
                    "workflow_role": "asset_design_generation",
                },
            },
        })

    return patch
