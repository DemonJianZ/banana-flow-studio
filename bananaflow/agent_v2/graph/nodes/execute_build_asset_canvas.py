from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

try:
    from agent_v2.shot_workflow.asset_canvas_builder import (
        build_asset_canvas_patch,
        _build_placeholder_asset_patch,
        make_entity_id,
        match_asset_entities,
    )
    from agent_v2.shot_workflow.asset_design_prompter import generate_design_prompts
except ImportError:
    build_asset_canvas_patch = None  # type: ignore[assignment]
    _build_placeholder_asset_patch = None  # type: ignore[assignment]
    make_entity_id = None  # type: ignore[assignment]
    match_asset_entities = None  # type: ignore[assignment]
    generate_design_prompts = None  # type: ignore[assignment]


def _extract_entities(tool_args: dict) -> list[dict]:
    """Extract character, prop, and scene entities from tool_args.

    Generates stable entity_ids using make_entity_id().  Duplicate names
    within the same call receive an occurrence counter suffix (_2, _3, …).

    Data lives under tool_args["confirmed_extraction"] (primary) or
    directly under tool_args as a fallback.
    """
    confirmed = dict(tool_args.get("confirmed_extraction") or {})
    characters_raw = list(confirmed.get("characters") or tool_args.get("characters") or [])
    scenes_raw = list(confirmed.get("scenes") or tool_args.get("scenes") or [])

    result = []
    name_count: dict[str, int] = {}

    # characters (includes props with type="prop")
    for ch in characters_raw:
        name = str(ch.get("name") or "").strip()
        if not name:
            continue
        entity_type = str(ch.get("type") or "character").strip()
        if entity_type not in {"character", "prop"}:
            entity_type = "character"
        count = name_count.get(name, 0) + 1
        name_count[name] = count
        result.append({
            "entity_id": make_entity_id(entity_type, name, count),
            "name": name,
            "entity_type": entity_type,
            "description": str(ch.get("description") or "").strip(),
        })

    # scenes
    for sc in scenes_raw:
        name = str(sc.get("name") or "").strip()
        if not name:
            continue
        count = name_count.get(name, 0) + 1
        name_count[name] = count
        result.append({
            "entity_id": make_entity_id("scene", name, count),
            "name": name,
            "entity_type": "scene",
            "description": str(sc.get("atmosphere") or sc.get("description") or "").strip(),
        })

    return result


def _enrich_entities(
    entities: list[dict],
    match_result: dict,
    design_prompts: dict,
) -> list[dict]:
    """Merge match status + design prompts into each entity."""
    matched_by_id = {e["entity_id"]: e for e in match_result["matched"]}
    candidate_by_id = {e["entity_id"]: e for e in match_result["candidates"]}

    enriched = []
    for ent in entities:
        eid = ent["entity_id"]
        e = dict(ent)

        if eid in matched_by_id:
            m = matched_by_id[eid]
            e["asset_status"] = "matched"
            e["matched_url"] = m.get("url")
            e["asset_id"] = m.get("asset_id")
            e["match_score"] = m.get("score")
            e["match_reason"] = None
        elif eid in candidate_by_id:
            c = candidate_by_id[eid]
            e["asset_status"] = "candidate"
            e["matched_url"] = c.get("url")
            e["asset_id"] = None
            e["match_score"] = c.get("score")
            e["match_reason"] = c.get("reason")
        else:
            e["asset_status"] = "missing"
            e["matched_url"] = None
            e["asset_id"] = None
            e["match_score"] = None
            e["match_reason"] = None

        dp = design_prompts.get(eid) or {}
        e["design_prompt"] = dp.get("prompt") or ""
        e["design_prompt_source"] = dp.get("source") or ""
        e["design_prompt_warnings"] = dp.get("warnings") or []

        enriched.append(e)
    return enriched


def _build_script_context(tool_args: dict, matched_entities: list[dict]) -> dict:
    """Assemble world/style context for design prompt generation.

    Sources:
    - confirmed_extraction.summary  → overall story tone
    - confirmed_extraction.scenes[].atmosphere → visual mood
    - matched_entities (characters with descriptions) → established visual anchors
    """
    confirmed = dict(tool_args.get("confirmed_extraction") or {})

    summary = str(confirmed.get("summary") or "").strip()

    atmospheres = [
        str(sc.get("atmosphere") or "").strip()
        for sc in (confirmed.get("scenes") or [])
        if str(sc.get("atmosphere") or "").strip()
    ]

    matched_characters = [
        {"name": str(e.get("name") or "").strip(), "description": str(e.get("description") or "").strip()}
        for e in matched_entities
        if str(e.get("entity_type") or "") == "character" and str(e.get("name") or "").strip()
    ]

    return {
        "summary": summary,
        "atmospheres": atmospheres,
        "matched_characters": matched_characters,
    }


def execute_build_asset_canvas(state: dict) -> dict:
    # --- Extract from state ---
    tool_args = state.get("tool_args") or {}
    authorization = state.get("authorization") or ""
    mode_policy = tool_args.get("mode_policy") or state.get("mode_policy") or "text2img"
    current_nodes = tool_args.get("current_nodes") or state.get("current_nodes") or []

    # 1. Extract entities (characters + scenes + props) from tool_args
    entities = _extract_entities(tool_args)

    # 2. Batch match against asset library
    try:
        match_result = match_asset_entities(entities)
    except Exception as exc:
        logger.warning("match_asset_entities failed, treating all entities as unmatched: %s", exc)
        match_result = {"matched": [], "unmatched": list(entities), "candidates": []}

    # 3. Generate design prompts for unmatched + candidate entities
    entities_to_design = match_result["unmatched"] + match_result["candidates"]
    script_context = _build_script_context(tool_args, match_result["matched"])
    design_prompts = generate_design_prompts(
        entities_to_design,
        authorization=authorization,
        script_context=script_context,
    )

    # 4. Merge match_result + design_prompts → enriched_entities
    enriched = _enrich_entities(entities, match_result, design_prompts)

    # 5. Build canvas patch (with fallback)
    try:
        patch = build_asset_canvas_patch(enriched, current_nodes=current_nodes, mode_policy=mode_policy)
    except Exception as exc:
        logger.warning("build_asset_canvas_patch failed, using placeholder patch: %s", exc)
        patch = _build_placeholder_asset_patch(enriched, current_nodes)

    # 6. Compute summary counts
    matched_count = len(match_result["matched"])
    missing_count = len(match_result["unmatched"])
    candidate_count = len(match_result["candidates"])
    fallback_prompt_count = sum(1 for v in design_prompts.values() if v.get("source") == "fallback")

    exec_data = {
        "kind": "asset_canvas",
        "matched_count": matched_count,
        "missing_count": missing_count,
        "candidate_count": candidate_count,
        "fallback_prompt_count": fallback_prompt_count,
        "patch_count": len(patch),
        "entities": enriched,
        "next_choices": [
            {
                "id": "direct_video",
                "label": "直接生成视频",
                "description": "按剧本镜头直接参考主体和场景生成视频",
            },
            {
                "id": "storyboard_first",
                "label": "先生成分镜图",
                "description": "先生成视觉分镜帧，再基于分镜图生成视频",
            },
        ],
    }

    return {
        **state,
        "exec_patches": patch,
        "exec_data": exec_data,
        "trace": (state.get("trace") or []) + [{"type": "EXECUTE_BUILD_ASSET_CANVAS"}],
    }
