from __future__ import annotations

from typing import Any, Dict

from .common import clean_text


def _lookup_look(asset_bible: Dict[str, Any], look_id: str) -> Dict[str, Any]:
    for look in asset_bible.get("look_definitions", []):
        if clean_text(look.get("look_id")) == look_id:
            return look
    return asset_bible.get("look_definitions", [{}])[0] if asset_bible.get("look_definitions") else {}


def _lookup_location(asset_bible: Dict[str, Any], location_id: str) -> Dict[str, Any]:
    for location in asset_bible.get("locations", []):
        if clean_text(location.get("location_id")) == location_id:
            return location
    return asset_bible.get("locations", [{}])[0] if asset_bible.get("locations") else {}


def _lookup_shot(shot_spec: Dict[str, Any], shot_id: str) -> Dict[str, Any]:
    for shot in shot_spec.get("shots", []):
        if clean_text(shot.get("shot_id")) == clean_text(shot_id):
            return shot
    return {}


def _rule_to_negative(rule: str) -> str:
    text = clean_text(rule)
    if not text:
        return ""
    return f"avoid drift: {text}"


def build_prompt_pack(asset_bible: Dict[str, Any], shot_spec: Dict[str, Any]) -> Dict[str, Any]:
    global_style = asset_bible.get("global_visual_style", {})
    host = asset_bible.get("host_identity", {})
    prompts = []
    negative_prompt = "; ".join(asset_bible.get("negative_drift_rules", []))

    for shot in shot_spec.get("shots", []):
        look = _lookup_look(asset_bible, clean_text(shot.get("look_ref")))
        location = _lookup_location(asset_bible, clean_text(shot.get("location_ref")))
        prev_shot = _lookup_shot(shot_spec, clean_text(shot.get("prev_shot_id")))
        next_shot = _lookup_shot(shot_spec, clean_text(shot.get("next_shot_id")))
        look_rules = "; ".join(look.get("continuity_rules", []))
        location_rules = "; ".join(location.get("continuity_rules", []))
        keyframe_prompt = (
            f"{clean_text(host.get('name')) or '主角'} in {clean_text(location.get('name'))}, "
            f"{clean_text(look.get('style'))}, "
            f"{clean_text(shot.get('subject'))}, {clean_text(shot.get('action'))}, "
            f"{clean_text(shot.get('framing'))} framing, {clean_text(shot.get('camera_angle'))}, "
            f"{clean_text(global_style.get('lighting'))}, {clean_text(global_style.get('color_strategy'))}, "
            f"emotion={clean_text(shot.get('emotion'))}, continuity anchor={clean_text(shot.get('continuity_anchor'))}"
        )
        motion_prompt = (
            f"{clean_text(shot.get('camera_movement'))}, duration={shot.get('duration_sec')}s, "
            f"preserve subject continuity, emphasize {clean_text(shot.get('story_function'))}, "
            f"transition toward {clean_text(next_shot.get('shot_id')) or 'end_frame'}"
        )
        continuity_parts = [
            f"Keep {clean_text(host.get('role'))} consistent",
            f"look={clean_text(look.get('look_id'))}",
            f"location={clean_text(location.get('location_id'))}",
            f"anchor={clean_text(shot.get('continuity_anchor'))}",
        ]
        if clean_text(prev_shot.get("shot_id")):
            continuity_parts.append(
                f"inherit pose/eyeline from {clean_text(prev_shot.get('shot_id'))} ({clean_text(prev_shot.get('continuity_anchor'))})"
            )
        if clean_text(next_shot.get("shot_id")):
            continuity_parts.append(f"leave clean match point into {clean_text(next_shot.get('shot_id'))}")
        continuity_note = (
            "; ".join(part for part in continuity_parts if part)
        )
        climax_note = "protect climax framing and hero beat" if shot.get("climax_protected") else "normal beat"
        edit_note = (
            f"{clean_text(shot.get('transition_in'))} -> {clean_text(shot.get('transition_out'))}; "
            f"audio cue: {clean_text(shot.get('audio_cue'))}; "
            f"climax_weight={shot.get('climax_weight')}; {climax_note}; "
            f"look rules: {look_rules}; location rules: {location_rules}"
        )
        shot_negative_prompt = "; ".join(
            filter(
                None,
                [negative_prompt] + [_rule_to_negative(item) for item in look.get("continuity_rules", []) + location.get("continuity_rules", [])],
            )
        )
        prompts.append(
            {
                "shot_id": clean_text(shot.get("shot_id")),
                "keyframe_prompt": keyframe_prompt,
                "motion_prompt": motion_prompt,
                "negative_prompt": shot_negative_prompt,
                "continuity_note": continuity_note,
                "edit_note": edit_note,
            }
        )

    return {
        "schema_version": "1.0",
        "project_title": clean_text(shot_spec.get("project_title")) or clean_text(asset_bible.get("project_title")),
        "prompts": prompts,
    }
