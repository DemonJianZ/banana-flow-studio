from __future__ import annotations

import re
from typing import Any, Dict, List


def clean_text(value: Any) -> str:
    return str(value or "").strip()


def as_dict(value: Any) -> Dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def as_list(value: Any) -> List[Any]:
    return list(value) if isinstance(value, list) else []


def stage_content(storyboard_master: Dict[str, Any], stage_id: str) -> str:
    state = as_dict(storyboard_master.get("state"))
    stages = as_dict(state.get("stages"))
    stage = as_dict(stages.get(stage_id))
    if stage:
        content = clean_text(stage.get("content"))
        summary = clean_text(stage.get("summary"))
        if content and summary:
            return f"{summary}\n{content}".strip()
        return content or summary

    for section in as_list(storyboard_master.get("sections")):
        section_data = as_dict(section)
        if clean_text(section_data.get("id")) == stage_id:
            return clean_text(section_data.get("content"))
    return ""


def full_stage_bundle(storyboard_master: Dict[str, Any]) -> str:
    chunks: List[str] = []
    for stage_id in [
        "script_read",
        "sequence_map",
        "camera_strategy",
        "scene_shot_flow",
        "rough_thumbnail_sheet",
        "animatic_review",
        "structural_revision",
        "final_delivery",
    ]:
        text = stage_content(storyboard_master, stage_id)
        if text:
            chunks.append(f"## {stage_id}\n{text}")
    final_master = clean_text(storyboard_master.get("final_storyboard_master"))
    if final_master:
        chunks.append(f"## final_storyboard_master\n{final_master}")
    return "\n\n".join(chunks).strip()


def slugify(text: str, prefix: str) -> str:
    raw = re.sub(r"[^a-zA-Z0-9\u4e00-\u9fff]+", "_", clean_text(text)).strip("_")
    return f"{prefix}_{raw[:24] or 'default'}"


def extract_lines(text: str) -> List[str]:
    return [line.strip() for line in clean_text(text).splitlines() if line.strip()]


def find_all(pattern: str, text: str, flags: int = 0) -> List[re.Match[str]]:
    return list(re.finditer(pattern, text or "", flags))


def first_match(pattern: str, text: str, flags: int = 0) -> str:
    match = re.search(pattern, text or "", flags)
    if not match:
        return ""
    return clean_text(match.group(1))
