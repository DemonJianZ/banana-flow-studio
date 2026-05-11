from __future__ import annotations

import re
from typing import Any, Dict, List, Tuple

from .schemas import StoryboardPlan

_ACTION_SCENE_TITLE_HINTS = (
    "接头",
    "揭露",
    "追逐",
    "对峙",
    "开始",
    "结束",
    "爆发",
    "冲击",
    "失控",
    "转折",
    "亮相",
    "登场",
    "饮用",
    "狂欢",
    "真相",
    "秘密",
    "开启",
    "崩塌",
    "揭晓",
    "袭击",
    "交锋",
    "谈判",
    "碰面",
    "发现",
)


def estimate_duration(plan: StoryboardPlan) -> float:
    total = 0.0
    for scene in list(plan.scenes or []):
        for shot in list(scene.shots or []):
            total += float(shot.duration_sec or 0.0)
    return round(total, 3)


def _string_list(value: Any) -> List[str]:
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return []
        normalized = text.replace("\r", "\n")
        parts = [
            part.strip(" \t-")
            for part in re.split(r"(?:\n+|[；;])", normalized)
            if str(part or "").strip(" \t-")
        ]
        if len(parts) > 1:
            return parts
        return [text]
    out: List[str] = []
    for item in list(value or []):
        text = str(item or "").strip()
        if text:
            out.append(text)
    return out


def _merge_string_lists(*values: Any) -> List[str]:
    seen = set()
    out: List[str] = []
    for value in values:
        for item in _string_list(value):
            if item not in seen:
                seen.add(item)
                out.append(item)
    return out


def _first_non_empty_text(*values: Any) -> str:
    for value in values:
        text = str(value or "").strip()
        if text:
            return text
    return ""


def _clean_entity_name(name: Any) -> str:
    text = str(name or "").strip()
    if not text:
        return ""
    return re.sub(r"\s*\([^)]*\)\s*$", "", text).strip()


def _canonical_lookup_key(value: Any) -> str:
    text = _clean_entity_name(value)
    return re.sub(r"\s+", "", text).lower()


def _normalize_compare_text(value: Any) -> str:
    text = _clean_entity_name(value)
    return re.sub(r"[^\u4e00-\u9fffA-Za-z0-9]+", "", text).lower()


def _description_fingerprint(*values: Any) -> str:
    text = " ".join(str(value or "").strip() for value in values if str(value or "").strip())
    return _normalize_compare_text(text)


def _trim_scene_title_remainder(value: str) -> str:
    return str(value or "").strip(" ：:·-—_的")


def _scene_title_has_action_semantics(title: Any, location: Any) -> bool:
    title_text = _clean_entity_name(title)
    location_text = _clean_entity_name(location)
    if not title_text or not location_text:
        return False
    if _normalize_compare_text(title_text) == _normalize_compare_text(location_text):
        return False

    remainder = title_text
    if title_text.startswith(location_text):
        remainder = _trim_scene_title_remainder(title_text[len(location_text) :])
    elif location_text.startswith(title_text):
        return False
    else:
        remainder = _trim_scene_title_remainder(title_text)

    if not remainder:
        return False
    return any(hint in remainder for hint in _ACTION_SCENE_TITLE_HINTS)


def _scene_title_location_mismatch(title: Any, location: Any) -> bool:
    title_norm = _normalize_compare_text(title)
    location_norm = _normalize_compare_text(location)
    if not title_norm or not location_norm:
        return False
    if title_norm == location_norm:
        return False
    if title_norm in location_norm or location_norm in title_norm:
        return False
    return True


def _describe_entity_from_fields(
    *,
    name: str,
    kind: str,
    role: str,
    appearance: Dict[str, Any],
    story_function: str,
    visual_design: Dict[str, Any],
) -> str:
    normalized_name = _clean_entity_name(name) or name
    details = _merge_string_lists(
        appearance.get("outfit") or [],
        appearance.get("accessories") or [],
        appearance.get("expression") or [],
        appearance.get("details") or [],
    )
    lead = ""
    species = str(appearance.get("species") or "").strip()
    fur_color = str(appearance.get("fur_color") or "").strip()
    build = str(appearance.get("build") or "").strip()
    material = str(appearance.get("material") or "").strip()
    normalized_kind = str(kind or "").strip()

    if normalized_kind == "character":
        species_part = f"{fur_color}色{species}" if fur_color and species else species or ""
        build_part = f"{build}的" if build else ""
        if species_part:
            lead = f"{build_part}{species_part}".strip()
        elif normalized_name:
            lead = normalized_name
    elif normalized_kind == "subject":
        if material:
            lead = f"{material}质感的{normalized_name or '主体'}"
        else:
            lead = normalized_name or "主体"
    elif normalized_kind == "location":
        lead = normalized_name or "场景"
    else:
        lead = normalized_name or normalized_kind or "主体"

    sentences: List[str] = []
    if normalized_kind == "character":
        if details:
            sentences.append(f"{lead}，{'，'.join(details)}。")
        elif lead:
            sentences.append(f"{lead}。")
    elif normalized_kind == "subject":
        if details:
            sentences.append(f"{lead}，{'，'.join(details)}。")
        elif lead:
            sentences.append(f"{lead}。")
    elif normalized_kind == "location":
        mood = _merge_string_lists(visual_design.get("mood") or [])
        lighting = _merge_string_lists(visual_design.get("lighting") or [])
        surface = _merge_string_lists(visual_design.get("surface") or [])
        focus = _merge_string_lists(visual_design.get("focus") or [])
        palette = _merge_string_lists(visual_design.get("palette") or [])
        contrast = str(visual_design.get("contrast") or "").strip()

        clauses = []
        if lighting:
            clauses.append("光线来自" + "、".join(lighting))
        if palette:
            clauses.append("画面主色调为" + "、".join(palette))
        if surface:
            clauses.append("环境表面呈现" + "、".join(surface))
        if focus:
            clauses.append("视觉重点落在" + "、".join(focus))
        if contrast:
            clauses.append("整体形成" + contrast)
        if mood:
            clauses.append("氛围呈现" + "、".join(mood))

        if clauses:
            sentences.append(f"{lead}，{'，'.join(clauses)}。")
        elif lead:
            sentences.append(f"{lead}。")
    else:
        if details:
            sentences.append(f"{lead}，{'，'.join(details)}。")
        elif lead:
            sentences.append(f"{lead}。")

    role_text = str(role or "").strip()
    story_function_text = str(story_function or "").strip()
    if role_text:
        sentences.append(f"其角色定位为{role_text}。")
    if story_function_text and story_function_text != role_text:
        sentences.append(f"在故事中承担{story_function_text}的作用。")
    return "".join(sentences).strip()


def _normalize_storyboard_entity(item: Any, *, fallback_kind: str, index: int) -> Dict[str, Any]:
    entity = dict(item or {}) if isinstance(item, dict) else {}
    nested_objects = [part for part in list(entity.get("visual_traits") or []) if isinstance(part, dict)]
    traits = [part for part in list(entity.get("visual_traits") or []) if not isinstance(part, dict)]

    merged_nested: Dict[str, Any] = {}
    for nested in nested_objects:
        for key, value in nested.items():
            if key == "appearance" and isinstance(value, dict):
                base = dict(merged_nested.get("appearance") or {})
                for sub_key, sub_value in value.items():
                    if isinstance(sub_value, list):
                        base[sub_key] = _merge_string_lists(base.get(sub_key) or [], sub_value)
                    elif sub_value not in (None, "") and not base.get(sub_key):
                        base[sub_key] = sub_value
                merged_nested["appearance"] = base
            elif key == "visual_design" and isinstance(value, dict):
                base = dict(merged_nested.get("visual_design") or {})
                for sub_key, sub_value in value.items():
                    if isinstance(sub_value, list):
                        base[sub_key] = _merge_string_lists(base.get(sub_key) or [], sub_value)
                    elif sub_value not in (None, "") and not base.get(sub_key):
                        base[sub_key] = sub_value
                merged_nested["visual_design"] = base
            elif isinstance(value, list):
                merged_nested[key] = _merge_string_lists(merged_nested.get(key) or [], value)
            elif value not in (None, "") and not merged_nested.get(key):
                merged_nested[key] = value

    appearance = dict(merged_nested.get("appearance") or entity.get("appearance") or {})
    visual_design = dict(merged_nested.get("visual_design") or entity.get("visual_design") or {})
    appearance = {
        "species": str(appearance.get("species") or "").strip(),
        "fur_color": str(appearance.get("fur_color") or "").strip(),
        "build": str(appearance.get("build") or "").strip(),
        "material": str(appearance.get("material") or "").strip(),
        "outfit": _string_list(appearance.get("outfit") or []),
        "accessories": _string_list(appearance.get("accessories") or []),
        "expression": _string_list(appearance.get("expression") or []),
        "details": _string_list(appearance.get("details") or []),
    }
    visual_design = {
        "lighting": _string_list(visual_design.get("lighting") or []),
        "mood": _string_list(visual_design.get("mood") or []),
        "contrast": str(visual_design.get("contrast") or "").strip(),
        "surface": _string_list(visual_design.get("surface") or []),
        "focus": _string_list(visual_design.get("focus") or []),
        "camera_bias": _string_list(visual_design.get("camera_bias") or []),
        "palette": _string_list(visual_design.get("palette") or []),
    }

    normalized_name = _clean_entity_name(entity.get("name") or merged_nested.get("name") or f"{fallback_kind}_{index}")
    normalized = {
        "entity_id": str(entity.get("entity_id") or f"{fallback_kind}_{index}").strip() or f"{fallback_kind}_{index}",
        "name": normalized_name or f"{fallback_kind}_{index}",
        "kind": str(entity.get("kind") or merged_nested.get("kind") or fallback_kind).strip() or fallback_kind,
        "description": str(entity.get("description") or merged_nested.get("description") or "").strip(),
        "role": str(entity.get("role") or merged_nested.get("role") or "").strip(),
        "core_description": str(entity.get("core_description") or merged_nested.get("core_description") or entity.get("description") or merged_nested.get("description") or "").strip(),
        "visual_traits": _merge_string_lists(
            traits,
            merged_nested.get("visual_traits") or [],
            appearance.get("outfit") or [],
            appearance.get("accessories") or [],
            appearance.get("expression") or [],
            appearance.get("details") or [],
            visual_design.get("lighting") or [],
            visual_design.get("mood") or [],
            visual_design.get("surface") or [],
            visual_design.get("focus") or [],
            visual_design.get("palette") or [],
        ),
        "appearance": appearance,
        "style_notes": _merge_string_lists(entity.get("style_notes") or [], merged_nested.get("style_notes") or []),
        "story_function": str(entity.get("story_function") or merged_nested.get("story_function") or "").strip(),
        "visual_design": visual_design,
    }
    normalized["core_description"] = _first_non_empty_text(
        normalized["core_description"],
        _describe_entity_from_fields(
            name=normalized["name"],
            kind=normalized["kind"],
            role=normalized["role"],
            appearance=appearance,
            story_function=normalized["story_function"],
            visual_design=visual_design,
        ),
    )
    normalized["description"] = _first_non_empty_text(
        normalized["description"],
        normalized["core_description"],
    )
    return normalized


def _normalize_entities(payload: Dict[str, Any]) -> Dict[str, Any]:
    raw_entities = dict(payload.get("entities") or {})
    return {
        "characters": [
            _normalize_storyboard_entity(item, fallback_kind="character", index=index)
            for index, item in enumerate(list(raw_entities.get("characters") or []), start=1)
        ],
        "subjects": [
            _normalize_storyboard_entity(item, fallback_kind="subject", index=index)
            for index, item in enumerate(list(raw_entities.get("subjects") or []), start=1)
        ],
        "locations": [
            _normalize_storyboard_entity(item, fallback_kind="location", index=index)
            for index, item in enumerate(list(raw_entities.get("locations") or []), start=1)
        ],
    }


def _normalize_dialogue(item: Any) -> Dict[str, str]:
    data = dict(item or {}) if isinstance(item, dict) else {}
    return {
        "speaker": str(data.get("speaker") or "").strip(),
        "text": str(data.get("text") or "").strip(),
    }


def _normalize_shot(
    item: Any,
    *,
    scene_id: str,
    shot_index: int,
    shot_duration_sec: float,
    entity_alias_map: Dict[str, str],
) -> Dict[str, Any]:
    data = dict(item or {}) if isinstance(item, dict) else {}
    duration_value = data.get("duration_sec")
    try:
        duration_sec = float(duration_value if duration_value not in (None, "") else shot_duration_sec or 4.0)
    except Exception:
        duration_sec = float(shot_duration_sec or 4.0)
    referenced_entities = []
    for ref in _string_list(data.get("referenced_entities") or []):
        canonical_ref = entity_alias_map.get(_canonical_lookup_key(ref), ref)
        if canonical_ref:
            referenced_entities.append(canonical_ref)
    return {
        "shot_id": str(data.get("shot_id") or f"{scene_id}_shot_{shot_index}").strip() or f"{scene_id}_shot_{shot_index}",
        "shot_no": int(data.get("shot_no") or shot_index),
        "duration_sec": duration_sec,
        "camera": str(data.get("camera") or "").strip(),
        "visual_description": str(data.get("visual_description") or "").strip(),
        "sound_description": str(data.get("sound_description") or "").strip(),
        "dialogues": [_normalize_dialogue(part) for part in list(data.get("dialogues") or [])],
        "voiceover": str(data.get("voiceover") or "").strip(),
        "referenced_entities": referenced_entities,
        "generation_notes": str(data.get("generation_notes") or "").strip(),
    }


def _normalize_scene(item: Any, *, scene_index: int, shot_duration_sec: float) -> Dict[str, Any]:
    return _normalize_scene_with_locations(item, scene_index=scene_index, shot_duration_sec=shot_duration_sec, location_alias_map={})


def _normalize_scene_with_locations(
    item: Any,
    *,
    scene_index: int,
    shot_duration_sec: float,
    location_alias_map: Dict[str, str],
    entity_alias_map: Dict[str, str],
) -> Dict[str, Any]:
    data = dict(item or {}) if isinstance(item, dict) else {}
    scene_id = str(data.get("scene_id") or f"scene_{scene_index}").strip() or f"scene_{scene_index}"
    raw_location = str(data.get("location") or "").strip()
    canonical_location = location_alias_map.get(_canonical_lookup_key(raw_location), raw_location)
    return {
        "scene_id": scene_id,
        "scene_no": int(data.get("scene_no") or scene_index),
        "title": str(data.get("title") or f"Scene {scene_index}").strip() or f"Scene {scene_index}",
        "summary": str(data.get("summary") or "").strip(),
        "location": canonical_location.strip(),
        "objective": str(data.get("objective") or "").strip(),
        "shots": [
            _normalize_shot(
                shot,
                scene_id=scene_id,
                shot_index=shot_index,
                shot_duration_sec=shot_duration_sec,
                entity_alias_map=entity_alias_map,
            )
            for shot_index, shot in enumerate(list(data.get("shots") or []), start=1)
        ],
        "scene_notes": str(data.get("scene_notes") or "").strip(),
    }


def validate_storyboard_plan(
    plan: StoryboardPlan,
    *,
    expected_style: str = "",
    expected_aspect_ratio: str = "16:9",
) -> List[str]:
    errors: List[str] = []
    if not plan.scenes:
        errors.append("at_least_one_scene_required")

    entity_names = {
        str(item.name or "").strip()
        for group in (
            list(plan.entities.characters or []),
            list(plan.entities.subjects or []),
            list(plan.entities.locations or []),
        )
        for item in group
        if str(item.name or "").strip()
    }
    entity_ids = {
        str(item.entity_id or "").strip()
        for group in (
            list(plan.entities.characters or []),
            list(plan.entities.subjects or []),
            list(plan.entities.locations or []),
        )
        for item in group
        if str(item.entity_id or "").strip()
    }
    location_names = {
        str(item.name or "").strip()
        for item in list(plan.entities.locations or [])
        if str(item.name or "").strip()
    }
    location_ids = {
        str(item.entity_id or "").strip()
        for item in list(plan.entities.locations or [])
        if str(item.entity_id or "").strip()
    }

    scene_description_fingerprints: Dict[str, str] = {}
    location_description_fingerprints: Dict[str, str] = {}
    scene_locations_seen: Dict[str, str] = {}
    character_subject_names = {
        str(item.name or "").strip()
        for group in (
            list(plan.entities.characters or []),
            list(plan.entities.subjects or []),
        )
        for item in group
        if str(item.name or "").strip()
    }

    for scene in list(plan.scenes or []):
        scene_location = str(scene.location or "").strip()
        if not scene_location:
            errors.append(f"{scene.scene_id}:scene_requires_location")
        elif scene_location not in location_names and scene_location not in location_ids:
            errors.append(f"{scene.scene_id}:unknown_scene_location:{scene_location}")
        else:
            canonical_scene_location = _canonical_lookup_key(scene_location)
            duplicate_scene_id = scene_locations_seen.get(canonical_scene_location)
            if duplicate_scene_id and duplicate_scene_id != scene.scene_id:
                errors.append(f"{scene.scene_id}:duplicate_scene_location:{scene_location}:{duplicate_scene_id}")
            else:
                scene_locations_seen[canonical_scene_location] = scene.scene_id
        if _scene_title_has_action_semantics(scene.title, scene.location):
            errors.append(f"{scene.scene_id}:scene_title_not_spatial:{scene.title}")
        elif _scene_title_location_mismatch(scene.title, scene.location):
            errors.append(f"{scene.scene_id}:scene_title_location_mismatch:{scene.title}->{scene.location}")

        scene_fingerprint = _description_fingerprint(scene.summary, scene.scene_notes)
        if scene_fingerprint:
            duplicate_scene_id = scene_description_fingerprints.get(scene_fingerprint)
            if duplicate_scene_id and duplicate_scene_id != scene.scene_id:
                errors.append(f"{scene.scene_id}:duplicate_scene_description:{duplicate_scene_id}")
            else:
                scene_description_fingerprints[scene_fingerprint] = scene.scene_id
        if not scene.shots:
            errors.append(f"{scene.scene_id}:scene_requires_shot")
            continue
        for shot in list(scene.shots or []):
            if not str(shot.visual_description or "").strip():
                errors.append(f"{shot.shot_id}:visual_description_required")
            if float(shot.duration_sec or 0.0) <= 0:
                errors.append(f"{shot.shot_id}:duration_must_be_positive")
            for ref in list(shot.referenced_entities or []):
                marker = str(ref or "").strip()
                if marker and marker not in entity_names and marker not in entity_ids:
                    errors.append(f"{shot.shot_id}:unknown_referenced_entity:{marker}")

    for location in list(plan.entities.locations or []):
        fingerprint = _description_fingerprint(
            location.core_description,
            location.description,
            " ".join(list(location.visual_traits or [])),
        )
        if not fingerprint:
            continue
        duplicate_location_id = location_description_fingerprints.get(fingerprint)
        if duplicate_location_id and duplicate_location_id != location.entity_id:
            errors.append(f"{location.entity_id}:duplicate_location_description:{duplicate_location_id}")
        else:
            location_description_fingerprints[fingerprint] = location.entity_id

        location_description = " ".join(
            [
                str(location.core_description or "").strip(),
                str(location.description or "").strip(),
            ]
        ).strip()
        if location_description:
            for name in character_subject_names:
                if name and name in location_description:
                    errors.append(f"{location.entity_id}:location_description_should_not_reference_entity:{name}")

    if str(plan.aspect_ratio or "").strip() != str(expected_aspect_ratio or "16:9").strip():
        errors.append("aspect_ratio_not_preserved")
    if str(expected_style or "").strip() and str(plan.style or "").strip() != str(expected_style).strip():
        errors.append("style_not_preserved")

    estimated = estimate_duration(plan)
    if abs(float(plan.estimated_duration_sec or 0.0) - estimated) > max(1.0, estimated * 0.1):
        errors.append("estimated_duration_mismatch")

    return errors


def coerce_storyboard_plan_payload(
    payload: Dict[str, Any],
    *,
    style: str = "",
    aspect_ratio: str = "16:9",
    target_duration_sec: float = 30.0,
    shot_duration_sec: float = 4.0,
    warnings: List[str] | None = None,
) -> Dict[str, Any]:
    data = dict(payload or {})
    data["entities"] = _normalize_entities(data)
    location_alias_map: Dict[str, str] = {}
    entity_alias_map: Dict[str, str] = {}
    for group in ("characters", "subjects", "locations"):
        for entity in list((data.get("entities") or {}).get(group) or []):
            entity_name = str(entity.get("name") or "").strip()
            entity_id = str(entity.get("entity_id") or "").strip()
            if entity_name:
                entity_alias_map[_canonical_lookup_key(entity_name)] = entity_name
            if entity_id and entity_name:
                entity_alias_map[_canonical_lookup_key(entity_id)] = entity_name
    for location in list((data.get("entities") or {}).get("locations") or []):
        location_name = str(location.get("name") or "").strip()
        location_id = str(location.get("entity_id") or "").strip()
        if location_name:
            location_alias_map[_canonical_lookup_key(location_name)] = location_name
        if location_id and location_name:
            location_alias_map[_canonical_lookup_key(location_id)] = location_name
    data["aspect_ratio"] = str(data.get("aspect_ratio") or aspect_ratio or "16:9").strip() or "16:9"
    data["style"] = str(data.get("style") or style or "").strip()
    data["target_duration_sec"] = float(data.get("target_duration_sec") or target_duration_sec or 30.0)
    data["shot_default_duration_sec"] = float(data.get("shot_default_duration_sec") or shot_duration_sec or 4.0)
    data["estimated_duration_sec"] = float(data.get("estimated_duration_sec") or 0.0)
    data["global_notes"] = list(data.get("global_notes") or [])
    data["scenes"] = [
        _normalize_scene_with_locations(
            scene,
            scene_index=index,
            shot_duration_sec=float(data["shot_default_duration_sec"] or 4.0),
            location_alias_map=location_alias_map,
            entity_alias_map=entity_alias_map,
        )
        for index, scene in enumerate(list(data.get("scenes") or []), start=1)
    ]
    data["warnings"] = list(data.get("warnings") or []) + list(warnings or [])
    return data


def validate_storyboard_payload(
    payload: Dict[str, Any],
    *,
    style: str = "",
    aspect_ratio: str = "16:9",
    target_duration_sec: float = 30.0,
    shot_duration_sec: float = 4.0,
    warnings: List[str] | None = None,
) -> Tuple[StoryboardPlan, List[str]]:
    data = coerce_storyboard_plan_payload(
        payload,
        style=style,
        aspect_ratio=aspect_ratio,
        target_duration_sec=target_duration_sec,
        shot_duration_sec=shot_duration_sec,
        warnings=warnings,
    )
    plan = StoryboardPlan.model_validate(data)
    errors = validate_storyboard_plan(
        plan,
        expected_style=style,
        expected_aspect_ratio=aspect_ratio or "16:9",
    )
    return plan, errors
