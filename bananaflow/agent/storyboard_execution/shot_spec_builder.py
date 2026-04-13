from __future__ import annotations

import re
from typing import Any, Dict, List, Tuple
import json

from .common import as_dict, as_list, clean_text, extract_lines, first_match, stage_content


SCENE_HEADER_RE = re.compile(r"【\s*场景\s*([一二三四五六七八九十0-9]+)[^】]*】(?:\((\d+)\s*-\s*(\d+)s\))?")
SHOT_RE = re.compile(r"Shot\s*(\d+)\s*(?:\(([^)]*)\))?\s*[:：]\s*(.+)")
FRAMING_RE = re.compile(r"\b(ECU|CU|MCU|MS|OTS|WS|LS|FS|POV|Split Screen)\b", re.IGNORECASE)
THUMBNAIL_RE = re.compile(r"(?:^|\n)\s*(?:\*{0,2})?\[(?:方格|Frame|Panel)\s*(\d+)\](?:\*{0,2})?\s*[：:]\s*(.+)")


def _parse_sequence_map(text: str) -> List[Dict[str, str]]:
    sequences: List[Dict[str, str]] = []
    pattern = re.compile(r"(?:^|\n)\s*(?:\d+\.|\*+\s*)\s*\*{0,2}([^：:\n]+?)\*{0,2}\s*[:：]\s*(.+)")
    for idx, match in enumerate(pattern.finditer(text), start=1):
        sequences.append(
            {
                "sequence_id": f"seq_{idx:02d}",
                "title": clean_text(match.group(1)),
                "story_change": clean_text(match.group(2)),
            }
        )
    if sequences:
        return sequences
    lines = extract_lines(text)
    return [
        {
            "sequence_id": f"seq_{idx:02d}",
            "title": line[:24],
            "story_change": line,
        }
        for idx, line in enumerate(lines[:4], start=1)
    ] or [
        {
            "sequence_id": "seq_01",
            "title": "主序列",
            "story_change": "从建立人物与情境，推进到高潮与收束。",
        }
    ]


def _normalize_framing(raw: str) -> str:
    text = clean_text(raw).upper()
    return text if text else "MS"


def _camera_angle_from_text(text: str) -> str:
    source = clean_text(text)
    if re.search(r"仰角|low angle", source, re.IGNORECASE):
        return "low_angle"
    if re.search(r"俯角|high angle|top shot", source, re.IGNORECASE):
        return "high_angle"
    if re.search(r"过肩|OTS", source, re.IGNORECASE):
        return "over_shoulder"
    if re.search(r"POV|主观", source, re.IGNORECASE):
        return "pov"
    return "eye_level"


def _camera_movement_from_text(text: str) -> str:
    source = clean_text(text)
    if re.search(r"手持|晃动|jitter|shaky", source, re.IGNORECASE):
        return "handheld"
    if re.search(r"慢动作|slow motion", source, re.IGNORECASE):
        return "slow_motion"
    if re.search(r"推|dolly in|zoom in", source, re.IGNORECASE):
        return "push_in"
    if re.search(r"拉|dolly out|zoom out", source, re.IGNORECASE):
        return "pull_out"
    if re.search(r"跟拍|tracking", source, re.IGNORECASE):
        return "tracking"
    if re.search(r"摇镜|pan", source, re.IGNORECASE):
        return "pan"
    return "static"


def _story_function_from_text(text: str) -> str:
    source = clean_text(text)
    if re.search(r"高潮|climax|reveal|hero", source, re.IGNORECASE):
        return "climax"
    if re.search(r"CTA|收尾|结尾|购买|call to action", source, re.IGNORECASE):
        return "cta"
    if re.search(r"转折|solution|introduce", source, re.IGNORECASE):
        return "turn"
    if re.search(r"痛点|hook|problem", source, re.IGNORECASE):
        return "hook"
    return "progression"


def _emotion_from_text(text: str) -> str:
    source = clean_text(text)
    if re.search(r"焦虑|不适|疲惫|厌恶", source):
        return "tense"
    if re.search(r"惊喜|满足|自信|轻快|元气", source):
        return "uplifted"
    if re.search(r"治愈|舒缓|放松", source):
        return "soothing"
    return "observational"


def _prompt_intent(purpose: str, story_function: str) -> str:
    return f"{story_function}:{purpose[:48]}".strip(":")


def _scene_purpose(block: str) -> str:
    return first_match(r"(?:核心|目标|Purpose)\s*[：:]\s*(.+)", block) or clean_text(block.splitlines()[0] if block else "")


def _scene_location_ref(scene_context: str, asset_bible: Dict[str, Any]) -> str:
    title = clean_text(scene_context)
    for location in asset_bible.get("locations", []):
        name = clean_text(location.get("name"))
        signature_elements = " ".join(clean_text(item) for item in location.get("signature_elements", []))
        if name and (name in title or title in name):
            return clean_text(location.get("location_id"))
        if signature_elements and any(token and token in title for token in re.split(r"[、,，\s]+", signature_elements) if clean_text(token)):
            return clean_text(location.get("location_id"))
    return clean_text(asset_bible.get("locations", [{}])[0].get("location_id", "location_city_block"))


def _scene_look_ref(scene_context: str, asset_bible: Dict[str, Any]) -> str:
    title = clean_text(scene_context)
    for look in asset_bible.get("look_definitions", []):
        name = clean_text(look.get("name"))
        style = clean_text(look.get("style"))
        hero_items = " ".join(clean_text(item) for item in look.get("hero_items", []))
        if name and (name in title or title in name):
            return clean_text(look.get("look_id"))
        if style and any(token and token in title for token in re.split(r"[+、,，\s]+", style) if clean_text(token)):
            return clean_text(look.get("look_id"))
        if hero_items and any(token and token in title for token in re.split(r"[+、,，\s]+", hero_items) if clean_text(token)):
            return clean_text(look.get("look_id"))
    return clean_text(asset_bible.get("look_definitions", [{}])[0].get("look_id", "look_main"))


def _parse_scene_blocks(text: str) -> List[Tuple[str, str, Tuple[int, int] | None]]:
    matches = list(SCENE_HEADER_RE.finditer(text))
    if not matches:
        return [("场景 1", clean_text(text), None)] if clean_text(text) else []
    blocks: List[Tuple[str, str, Tuple[int, int] | None]] = []
    for idx, match in enumerate(matches):
        start = match.end()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
        title = f"场景 {clean_text(match.group(1))}"
        time_range = None
        if match.group(2) and match.group(3):
            time_range = (int(match.group(2)), int(match.group(3)))
        blocks.append((title, clean_text(text[start:end]), time_range))
    return blocks


def _shot_duration(time_range: Tuple[int, int] | None, shot_count: int, index: int) -> float:
    if not time_range or shot_count <= 0:
        return 2.0
    start, end = time_range
    total = max(1, end - start)
    base = total / shot_count
    return round(base if index < shot_count - 1 else total - base * (shot_count - 1), 2)


def _climax_weight_from_text(description: str, purpose: str, story_function: str, structural_text: str) -> float:
    source = clean_text(" ".join([description, purpose]))
    if story_function == "climax":
        base = 0.82
    elif story_function == "cta":
        base = 0.74
    elif story_function == "turn":
        base = 0.58
    else:
        base = 0.35

    if re.search(r"hero|reveal|定格|回头|最终|高潮|高点|收尾", source, re.IGNORECASE):
        base += 0.14
    if re.search(r"before/?after|对比|爆发|冲击|记忆点", source, re.IGNORECASE):
        base += 0.08
    if story_function == "climax" and re.search(r"视觉高潮|hero|记忆点|高潮", clean_text(structural_text), re.IGNORECASE):
        base += 0.04
    if story_function == "cta" and re.search(r"CTA|结论|收尾|行动", clean_text(structural_text), re.IGNORECASE):
        base += 0.04
    return round(min(base, 0.98), 2)


def _parse_shots_from_scene(scene_body: str) -> List[Tuple[str, str, str]]:
    shots: List[Tuple[str, str, str]] = []
    for match in SHOT_RE.finditer(scene_body):
        shot_label = clean_text(match.group(1))
        framing = _normalize_framing(match.group(2))
        description = clean_text(match.group(3))
        shots.append((shot_label, framing, description))
    if shots:
        return shots
    thumbnail_shots: List[Tuple[str, str, str]] = []
    for match in THUMBNAIL_RE.finditer(scene_body):
        shot_label = clean_text(match.group(1))
        description = clean_text(match.group(2))
        framing_match = FRAMING_RE.search(description)
        framing = _normalize_framing(framing_match.group(1) if framing_match else "MS")
        thumbnail_shots.append((shot_label, framing, description))
    if thumbnail_shots:
        return thumbnail_shots
    bullet_pattern = re.compile(r"(?:^|\n)\s*[*-]\s*(.+)")
    bullets = [clean_text(item.group(1)) for item in bullet_pattern.finditer(scene_body) if clean_text(item.group(1))]
    return [(str(idx), "MS", bullet) for idx, bullet in enumerate(bullets, start=1)]


def _fallback_thumbnail_spec(
    storyboard_master: Dict[str, Any],
    asset_bible: Dict[str, Any],
    sequence_rows: List[Dict[str, Any]],
    shot_rows: List[Dict[str, Any]],
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    thumbnail_text = stage_content(storyboard_master, "rough_thumbnail_sheet") or stage_content(storyboard_master, "final_delivery")
    fallback_shots = _parse_shots_from_scene(thumbnail_text)
    if not fallback_shots:
        return sequence_rows, shot_rows

    sequence = {
        "sequence_id": "seq_01",
        "title": "粗分镜回填",
        "story_change": "由 thumbnail / panel 级内容回填逐镜头执行结构。",
    }
    scene_id = "scene_01"
    scene_title = "场景 1"
    purpose = "从 rough thumbnail 回填镜头执行信息。"
    scene_context = thumbnail_text
    look_ref = _scene_look_ref(scene_context, asset_bible)
    location_ref = _scene_location_ref(scene_context, asset_bible)
    scene_shot_ids: List[str] = []
    for local_index, (shot_label, framing, description) in enumerate(fallback_shots, start=1):
        shot_id = f"shot_{int(shot_label):03d}" if shot_label.isdigit() else f"{scene_id}_shot_{local_index:02d}"
        story_function = _story_function_from_text(description or purpose)
        climax_weight = _climax_weight_from_text(description, purpose, story_function, "")
        shot_rows.append(
            {
                "shot_id": shot_id,
                "sequence_id": sequence["sequence_id"],
                "scene_id": scene_id,
                "sequence_order": 1,
                "scene_order": 1,
                "shot_order": len(shot_rows) + 1,
                "purpose": purpose,
                "story_function": story_function,
                "subject": description.split("，")[0].split(",")[0],
                "action": description,
                "framing": framing,
                "camera_angle": _camera_angle_from_text(description),
                "camera_movement": _camera_movement_from_text(description),
                "duration_sec": 2.0,
                "emotion": _emotion_from_text(description or purpose),
                "continuity_anchor": purpose[:32],
                "prev_shot_id": "",
                "next_shot_id": "",
                "continuity_refs": [],
                "transition_in": "hard_cut",
                "transition_out": "hard_cut",
                "look_ref": look_ref,
                "location_ref": location_ref,
                "audio_cue": "由 rough thumbnail 回填，后续需在 animatic 阶段校正节奏。",
                "climax_weight": round(climax_weight, 2),
                "climax_protected": climax_weight >= 0.8,
                "prompt_intent": _prompt_intent(purpose, story_function),
            }
        )
        scene_shot_ids.append(shot_id)
    sequence_rows.append(
        {
            "sequence_id": sequence["sequence_id"],
            "title": sequence["title"],
            "story_change": sequence["story_change"],
            "duration_sec": round(2.0 * len(scene_shot_ids), 2),
            "scenes": [
                {
                    "scene_id": scene_id,
                    "title": scene_title,
                    "purpose": purpose,
                    "location_ref": location_ref,
                    "look_ref": look_ref,
                    "duration_sec": round(2.0 * len(scene_shot_ids), 2),
                    "shot_count": len(scene_shot_ids),
                    "shots": scene_shot_ids,
                }
            ],
        }
    )
    return sequence_rows, shot_rows


def _transition_between(current: Dict[str, Any], nxt: Dict[str, Any]) -> str:
    if not nxt:
        return "hold_on_end"
    if clean_text(current.get("scene_id")) != clean_text(nxt.get("scene_id")):
        return "scene_cut"
    if clean_text(current.get("look_ref")) != clean_text(nxt.get("look_ref")):
        return "look_reveal_cut"
    if clean_text(current.get("location_ref")) != clean_text(nxt.get("location_ref")):
        return "location_cut"
    if current.get("climax_protected") or nxt.get("climax_protected"):
        return "linger_cut"
    if clean_text(current.get("continuity_anchor")) == clean_text(nxt.get("continuity_anchor")):
        return "match_cut"
    return "hard_cut"


def _stage_sections(storyboard_master: Dict[str, Any], stage_id: str) -> List[Dict[str, Any]]:
    state = as_dict(storyboard_master.get("state"))
    stages = as_dict(state.get("stages"))
    stage = as_dict(stages.get(stage_id))
    if stage:
        return [as_dict(item) for item in as_list(stage.get("sections")) if as_dict(item)]
    return []


def _manifest_section_text(storyboard_master: Dict[str, Any]) -> str:
    for section in _stage_sections(storyboard_master, "final_delivery"):
        section_id = clean_text(section.get("id"))
        title = clean_text(section.get("title"))
        if section_id == "shot_manifest" or "shot manifest" in title.lower():
            return clean_text(section.get("content"))
    return ""


def _parse_manifest_rows(text: str) -> List[Dict[str, Any]]:
    source = clean_text(text)
    if not source:
        return []
    try:
        payload = json.loads(source)
        if isinstance(payload, list):
            return [as_dict(item) for item in payload if as_dict(item)]
        if isinstance(payload, dict):
            return [as_dict(item) for item in as_list(payload.get("shots")) if as_dict(item)]
    except Exception:
        return []
    return []


def _lookup_ref_by_name(name: str, items: List[Dict[str, Any]], ref_key: str) -> str:
    target = clean_text(name).lower()
    if not target:
        return clean_text(items[0].get(ref_key)) if items else ""
    for item in items:
        if clean_text(item.get("name")).lower() == target:
            return clean_text(item.get(ref_key))
    for item in items:
        if target in clean_text(item.get("name")).lower() or clean_text(item.get("name")).lower() in target:
            return clean_text(item.get(ref_key))
    return clean_text(items[0].get(ref_key)) if items else ""


def _build_from_manifest(storyboard_master: Dict[str, Any], asset_bible: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    rows = _parse_manifest_rows(_manifest_section_text(storyboard_master))
    if not rows:
        return [], []

    sequence_map: Dict[str, Dict[str, Any]] = {}
    shot_rows: List[Dict[str, Any]] = []
    for index, row in enumerate(rows, start=1):
        sequence_title = clean_text(row.get("sequence_title")) or "主序列"
        scene_title = clean_text(row.get("scene_title")) or "场景 1"
        sequence_id = clean_text(row.get("sequence_id")) or f"seq_{len(sequence_map) + 1:02d}"
        scene_id = clean_text(row.get("scene_id")) or f"scene_{index:02d}"
        look_ref = clean_text(row.get("look_ref")) or _lookup_ref_by_name(row.get("look_name"), as_list(asset_bible.get("look_definitions")), "look_id")
        location_ref = clean_text(row.get("location_ref")) or _lookup_ref_by_name(row.get("location_name"), as_list(asset_bible.get("locations")), "location_id")
        shot_id = clean_text(row.get("shot_id")) or f"shot_{index:03d}"
        shot = {
            "shot_id": shot_id,
            "sequence_id": sequence_id,
            "scene_id": scene_id,
            "sequence_order": len(sequence_map) + (0 if sequence_id in sequence_map else 1),
            "scene_order": index,
            "shot_order": index,
            "purpose": clean_text(row.get("purpose")) or scene_title,
            "story_function": clean_text(row.get("story_function")) or _story_function_from_text(clean_text(row.get("action"))),
            "subject": clean_text(row.get("subject")) or clean_text(row.get("action")).split("，")[0].split(",")[0],
            "action": clean_text(row.get("action")),
            "framing": _normalize_framing(row.get("framing")),
            "camera_angle": clean_text(row.get("camera_angle")) or _camera_angle_from_text(clean_text(row.get("action"))),
            "camera_movement": clean_text(row.get("camera_movement")) or _camera_movement_from_text(clean_text(row.get("action"))),
            "duration_sec": float(row.get("duration_sec") or 2.0),
            "emotion": clean_text(row.get("emotion")) or _emotion_from_text(clean_text(row.get("action"))),
            "continuity_anchor": clean_text(row.get("continuity_anchor")) or scene_title,
            "prev_shot_id": "",
            "next_shot_id": "",
            "continuity_refs": [],
            "transition_in": clean_text(row.get("transition_in")) or "hard_cut",
            "transition_out": clean_text(row.get("transition_out")) or "hard_cut",
            "look_ref": look_ref,
            "location_ref": location_ref,
            "audio_cue": clean_text(row.get("audio_cue")) or "按 storyboard manifest 执行。",
            "climax_weight": round(float(row.get("climax_weight") or 0.35), 2),
            "climax_protected": float(row.get("climax_weight") or 0.35) >= 0.8,
            "prompt_intent": clean_text(row.get("prompt_intent")) or _prompt_intent(clean_text(row.get("purpose")) or scene_title, clean_text(row.get("story_function")) or "progression"),
        }
        shot_rows.append(shot)
        sequence_bucket = sequence_map.setdefault(
            sequence_id,
            {
                "sequence_id": sequence_id,
                "title": sequence_title,
                "story_change": clean_text(row.get("story_change")) or f"{sequence_title} 推进主叙事。",
                "duration_sec": 0.0,
                "scenes": [],
            },
        )
        scene_bucket = next((scene for scene in sequence_bucket["scenes"] if clean_text(scene.get("scene_id")) == scene_id), None)
        if not scene_bucket:
            scene_bucket = {
                "scene_id": scene_id,
                "title": scene_title,
                "purpose": clean_text(row.get("purpose")) or scene_title,
                "location_ref": location_ref,
                "look_ref": look_ref,
                "duration_sec": 0.0,
                "shot_count": 0,
                "shots": [],
            }
            sequence_bucket["scenes"].append(scene_bucket)
        scene_bucket["shots"].append(shot_id)
        scene_bucket["shot_count"] += 1
        scene_bucket["duration_sec"] = round(float(scene_bucket["duration_sec"]) + float(shot["duration_sec"]), 2)
        sequence_bucket["duration_sec"] = round(float(sequence_bucket["duration_sec"]) + float(shot["duration_sec"]), 2)

    return list(sequence_map.values()), shot_rows


def build_shot_spec(storyboard_master: Dict[str, Any], asset_bible: Dict[str, Any]) -> Dict[str, Any]:
    sequence_map_text = stage_content(storyboard_master, "sequence_map")
    scene_flow_text = stage_content(storyboard_master, "scene_shot_flow")
    animatic_text = stage_content(storyboard_master, "animatic_review")
    structural_text = stage_content(storyboard_master, "structural_revision")
    manifest_sequences, manifest_shots = _build_from_manifest(storyboard_master, asset_bible)
    if manifest_shots:
        sequence_rows = manifest_sequences
        shot_rows = manifest_shots
    else:
        sequence_rows = []
        shot_rows = []
    sequences = _parse_sequence_map(sequence_map_text)
    scene_blocks = _parse_scene_blocks(scene_flow_text)

    for scene_index, (scene_title, scene_body, time_range) in enumerate(scene_blocks, start=1):
        if manifest_shots:
            break
        sequence = sequences[min(scene_index - 1, len(sequences) - 1)] if sequences else {
            "sequence_id": "seq_01",
            "title": "主序列",
            "story_change": "推进主叙事",
        }
        scene_id = f"scene_{scene_index:02d}"
        purpose = _scene_purpose(scene_body)
        scene_context = f"{scene_title}\n{scene_body}"
        look_ref = _scene_look_ref(scene_context, asset_bible)
        location_ref = _scene_location_ref(scene_context, asset_bible)
        parsed_shots = _parse_shots_from_scene(scene_body)
        scene_shot_ids: List[str] = []
        for local_index, (shot_label, framing, description) in enumerate(parsed_shots, start=1):
            shot_id = f"shot_{int(shot_label):03d}" if shot_label.isdigit() else f"{scene_id}_shot_{local_index:02d}"
            story_function = _story_function_from_text(description or purpose)
            anchor = first_match(r"锚点[：:]\s*([^）)\n]+)", description) or first_match(r"anchor[：:]\s*(.+)", description, re.IGNORECASE)
            climax_weight = _climax_weight_from_text(description, purpose, story_function, structural_text)
            shot_rows.append(
                {
                    "shot_id": shot_id,
                    "sequence_id": sequence["sequence_id"],
                    "scene_id": scene_id,
                    "sequence_order": scene_index,
                    "scene_order": scene_index,
                    "shot_order": len(shot_rows) + 1,
                    "purpose": purpose,
                    "story_function": story_function,
                    "subject": description.split("，")[0].split(",")[0],
                    "action": description,
                    "framing": framing,
                    "camera_angle": _camera_angle_from_text(description),
                    "camera_movement": _camera_movement_from_text(description),
                    "duration_sec": _shot_duration(time_range, len(parsed_shots), local_index - 1),
                    "emotion": _emotion_from_text(description or purpose),
                    "continuity_anchor": anchor or purpose[:32],
                    "prev_shot_id": "",
                    "next_shot_id": "",
                    "continuity_refs": [],
                    "transition_in": "hard_cut",
                    "transition_out": "hard_cut",
                    "look_ref": look_ref,
                    "location_ref": location_ref,
                    "audio_cue": "按 animatic 节奏点执行；参考 " + (animatic_text.splitlines()[0] if animatic_text else "段落节奏"),
                    "climax_weight": round(climax_weight, 2),
                    "climax_protected": climax_weight >= 0.8,
                    "prompt_intent": _prompt_intent(purpose, story_function),
                }
            )
            scene_shot_ids.append(shot_id)
        scene_duration = round(sum(float(shot["duration_sec"]) for shot in shot_rows if clean_text(shot.get("scene_id")) == scene_id), 2)
        sequence_rows.append(
            {
                "sequence_id": sequence["sequence_id"],
                "title": sequence["title"],
                "story_change": sequence["story_change"],
                "duration_sec": scene_duration,
                "scenes": [
                    {
                        "scene_id": scene_id,
                        "title": scene_title,
                        "purpose": purpose,
                        "location_ref": location_ref,
                        "look_ref": look_ref,
                        "duration_sec": scene_duration,
                        "shot_count": len(scene_shot_ids),
                        "shots": scene_shot_ids,
                    }
                ],
            }
        )

    if not shot_rows:
        sequence_rows, shot_rows = _fallback_thumbnail_spec(storyboard_master, asset_bible, sequence_rows, shot_rows)

    for index, row in enumerate(shot_rows):
        prev_row = shot_rows[index - 1] if index > 0 else {}
        next_row = shot_rows[index + 1] if index + 1 < len(shot_rows) else {}
        row["prev_shot_id"] = clean_text(prev_row.get("shot_id"))
        row["next_shot_id"] = clean_text(next_row.get("shot_id"))
        continuity_refs = []
        if prev_row and (
            clean_text(prev_row.get("look_ref")) == clean_text(row.get("look_ref"))
            or clean_text(prev_row.get("location_ref")) == clean_text(row.get("location_ref"))
        ):
            continuity_refs.append(clean_text(prev_row.get("shot_id")))
        if next_row and (
            clean_text(next_row.get("look_ref")) == clean_text(row.get("look_ref"))
            or clean_text(next_row.get("location_ref")) == clean_text(row.get("location_ref"))
        ):
            continuity_refs.append(clean_text(next_row.get("shot_id")))
        row["continuity_refs"] = continuity_refs
        row["transition_in"] = _transition_between(prev_row, row) if prev_row else "cold_open"
        row["transition_out"] = _transition_between(row, next_row)

    protected = [row["shot_id"] for row in shot_rows if row["climax_protected"]]
    asset_bible["climax_protection"]["protected_shots"] = protected
    deduped_sequences: Dict[str, Dict[str, Any]] = {}
    for row in sequence_rows:
        existing = deduped_sequences.get(row["sequence_id"])
        if not existing:
            deduped_sequences[row["sequence_id"]] = row
            continue
        existing["scenes"].extend(row["scenes"])
        existing["duration_sec"] = round(float(existing.get("duration_sec", 0)) + float(row.get("duration_sec", 0)), 2)

    return {
        "schema_version": "1.0",
        "project_title": clean_text(storyboard_master.get("project_title")) or "storyboard_project",
        "sequences": list(deduped_sequences.values()),
        "shots": shot_rows,
    }
