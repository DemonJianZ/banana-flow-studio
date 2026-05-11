from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional

from .prompts import build_repair_prompt


def apply_deterministic_storyboard_repair(
    payload: Dict[str, Any],
    *,
    style: str,
    aspect_ratio: str,
    target_duration_sec: float,
    shot_duration_sec: float,
) -> Dict[str, Any]:
    data = dict(payload or {})
    data["style"] = str(data.get("style") or style or "").strip()
    data["aspect_ratio"] = str(data.get("aspect_ratio") or aspect_ratio or "16:9").strip() or "16:9"
    data["target_duration_sec"] = float(data.get("target_duration_sec") or target_duration_sec or 30.0)
    data["shot_default_duration_sec"] = float(data.get("shot_default_duration_sec") or shot_duration_sec or 4.0)
    data["title"] = str(data.get("title") or "Storyboard Plan").strip() or "Storyboard Plan"
    data["entities"] = dict(data.get("entities") or {"characters": [], "subjects": [], "locations": []})
    data["entities"].setdefault("characters", [])
    data["entities"].setdefault("subjects", [])
    data["entities"].setdefault("locations", [])
    data["global_notes"] = list(data.get("global_notes") or [])
    data["design_rationale"] = str(data.get("design_rationale") or "").strip()

    scenes = list(data.get("scenes") or [])
    total = 0.0
    for scene_index, scene in enumerate(scenes, start=1):
        if not isinstance(scene, dict):
            continue
        scene.setdefault("scene_id", f"scene_{scene_index}")
        scene.setdefault("scene_no", scene_index)
        scene.setdefault("summary", "")
        scene.setdefault("location", "")
        scene.setdefault("objective", "")
        scene.setdefault("scene_notes", "")
        scene.setdefault("title", str(scene.get("location") or f"Scene {scene_index}").strip() or f"Scene {scene_index}")
        scene.setdefault("shots", [])
        for shot_index, shot in enumerate(list(scene.get("shots") or []), start=1):
            if not isinstance(shot, dict):
                continue
            shot.setdefault("shot_id", f"{scene.get('scene_id')}_shot_{shot_index}")
            shot.setdefault("shot_no", shot_index)
            if not shot.get("duration_sec"):
                shot["duration_sec"] = float(shot_duration_sec or 4.0)
            if not shot.get("visual_description"):
                shot["visual_description"] = "待补充分镜视觉描述"
            shot.setdefault("camera", "")
            shot.setdefault("sound_description", "")
            shot.setdefault("dialogues", [])
            shot.setdefault("voiceover", "")
            shot.setdefault("referenced_entities", [])
            shot.setdefault("generation_notes", "")
            try:
                total += float(shot.get("duration_sec") or 0.0)
            except Exception:
                pass
    data["estimated_duration_sec"] = round(total, 3) if total > 0 else float(target_duration_sec or 30.0)
    return data


def repair_storyboard_payload(
    payload: Dict[str, Any],
    *,
    errors: List[str],
    style: str,
    aspect_ratio: str,
    target_duration_sec: float,
    shot_duration_sec: float,
    llm_generate: Optional[Callable[[str, str], Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    if llm_generate is not None:
        repaired = llm_generate(
            "repair",
            build_repair_prompt(payload, errors),
        )
        if isinstance(repaired, dict) and repaired:
            return repaired
    return apply_deterministic_storyboard_repair(
        payload,
        style=style,
        aspect_ratio=aspect_ratio,
        target_duration_sec=target_duration_sec,
        shot_duration_sec=shot_duration_sec,
    )
