from __future__ import annotations

from typing import Any

from .llm_decomposer import _call_llm, _parse_llm_json


def _build_extraction_prompt(source_text: str) -> str:
    return (
        "你是专业分镜导演助手，负责从剧本或故事梗概中提取结构化创作素材。\n"
        "严格输出 JSON，顶层字段：characters、scenes、shots、summary。\n"
        "不要输出 markdown，不要解释，不要在 JSON 外添加任何文字。\n\n"
        "characters 数组：剧本中出现的角色和重要道具/物件，每项包含：\n"
        "  name（名称）、type（\"character\" 或 \"prop\"）、description（外貌/特征详细描述）\n\n"
        "scenes 数组：场景列表，每项包含：\n"
        "  name（场景名称）、atmosphere（氛围描述：光线、情绪、环境细节）\n\n"
        "shots 数组：按剧情顺序的分镜列表，每项包含：\n"
        "  shot_id（如 \"1.1\" \"1.2\" \"2.1\"，按场景编号）\n"
        "  scene_name（对应 scenes 中的场景名）\n"
        "  duration（估计时长，整数秒，默认 6）\n"
        "  visual_description（画面描述，直接描述画面内容，角色引用用 @名字 标记）\n"
        "  audio_description（音效/配乐描述）\n"
        "  characters（该镜头出现的角色/道具名称列表）\n\n"
        "summary：一句话概括整个剧本内容（中文，不超过 60 字）。\n\n"
        f"剧本原文：\n{source_text}"
    )


def _normalize_character(raw: Any) -> dict:
    d = dict(raw or {})
    return {
        "name": str(d.get("name") or "").strip(),
        "type": str(d.get("type") or "character").strip(),
        "description": str(d.get("description") or "").strip(),
    }


def _normalize_scene(raw: Any) -> dict:
    d = dict(raw or {})
    return {
        "name": str(d.get("name") or "").strip(),
        "atmosphere": str(d.get("atmosphere") or "").strip(),
    }


def _normalize_shot(raw: Any, idx: int) -> dict:
    d = dict(raw or {})
    chars = d.get("characters") or []
    if isinstance(chars, str):
        chars = [c.strip() for c in chars.split("、") if c.strip()]
    return {
        "shot_id": str(d.get("shot_id") or f"{idx}.1").strip(),
        "scene_name": str(d.get("scene_name") or "").strip(),
        "duration": int(d.get("duration") or 6),
        "visual_description": str(d.get("visual_description") or "").strip(),
        "audio_description": str(d.get("audio_description") or "").strip(),
        "characters": [str(c).strip() for c in list(chars) if str(c).strip()],
    }


def extract_script_elements(source_text: str, authorization: str = "") -> dict:
    """LLM-extract characters, scenes and shots from a screenplay."""
    src = str(source_text or "").strip()
    if not src:
        return {"characters": [], "scenes": [], "shots": [], "summary": ""}

    try:
        raw = _call_llm(_build_extraction_prompt(src), authorization)
    except Exception:
        raw = {}

    characters = [_normalize_character(c) for c in list(raw.get("characters") or []) if (dict(c or {})).get("name")]
    scenes = [_normalize_scene(s) for s in list(raw.get("scenes") or []) if (dict(s or {})).get("name")]
    shots = [_normalize_shot(sh, i + 1) for i, sh in enumerate(list(raw.get("shots") or []))]
    summary = str(raw.get("summary") or "").strip()

    return {
        "characters": characters,
        "scenes": scenes,
        "shots": shots,
        "summary": summary,
    }
