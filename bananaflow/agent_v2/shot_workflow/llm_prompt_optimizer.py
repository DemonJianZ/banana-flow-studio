from __future__ import annotations

import json
from typing import Any

from .prompt_composer import compose_prompt
from .schemas import ShotSpec
from .llm_decomposer import _parse_llm_json, _call_llm


# ---------------------------------------------------------------------------
# Prompt builder
# ---------------------------------------------------------------------------

def _shot_context(shot: dict[str, Any]) -> dict[str, Any]:
    bindings = dict(shot.get("asset_bindings") or {})
    char_names = [b.get("name") or b.get("query_name") for b in list(bindings.get("character_bindings") or [])]
    scene_info = dict(bindings.get("scene_binding") or {})
    return {
        "shot_id": shot.get("shot_id"),
        "scene": shot.get("scene"),
        "time": shot.get("time"),
        "characters": shot.get("characters") or [],
        "matched_characters": [n for n in char_names if n],
        "locations": shot.get("locations") or [],
        "matched_scene_folder": scene_info.get("folder_name"),
        "props": shot.get("props") or [],
        "action": shot.get("action"),
        "dialogue": shot.get("dialogue"),
        "camera": shot.get("camera"),
        "mood": shot.get("mood"),
        "mode": shot.get("mode"),
    }


def _build_optimize_prompt(shots: list[dict[str, Any]]) -> str:
    system = (
        "你是专业图像提示词工程师，为每个分镜生成高质量的 Gemini/GPT image generation 风格英文提示词。\n"
        "输出严格 JSON，顶层字段：prompts（数组）。\n"
        "不要输出 markdown，不要解释。\n\n"
        "prompts 数组中每个对象包含：\n"
        "  shot_id（与输入对应）, prompt（英文自然语言描述，150-300词）\n\n"
        "提示词要求：\n"
        "1. 用完整的自然语言句子描述，不要用逗号分隔的标签列表。\n"
        "2. 按顺序描述：角色外貌与服装 → 场景环境与背景 → 动作与情绪 → 摄影机/构图 → 光线与氛围。\n"
        "3. 如果 matched_characters 有值，说明有对应角色资产，提示词中强调角色需保持一致的视觉风格。\n"
        "4. 如果 matched_scene_folder 有值，提示词中引用该场景的地点特征。\n"
        "5. 不要在图片中渲染文字或字幕。\n"
        "6. 结尾加：high quality, production-ready, no text, no watermark.\n\n"
        "输入分镜数据：\n"
        + json.dumps([_shot_context(s) for s in shots], ensure_ascii=False, indent=2)
    )
    return system


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def optimize_prompts(
    shots: list[ShotSpec],
    authorization: str = "",
) -> list[ShotSpec]:
    """
    Returns shots with `prompt` field filled by LLM.
    Falls back to template compose_prompt per shot on LLM failure.
    """
    if not shots:
        return shots

    shot_list = [dict(s) for s in shots]
    prompt = _build_optimize_prompt(shot_list)

    try:
        payload = _call_llm(prompt, authorization=authorization)
        raw_prompts = list(payload.get("prompts") or [])
    except Exception:
        raw_prompts = []

    prompt_map: dict[str, str] = {}
    for item in raw_prompts:
        sid = str((item or {}).get("shot_id") or "").strip()
        txt = str((item or {}).get("prompt") or "").strip()
        if sid and txt:
            prompt_map[sid] = txt

    result: list[ShotSpec] = []
    for shot in shot_list:
        shot = dict(shot)
        sid = str(shot.get("shot_id") or "")
        if sid in prompt_map:
            shot["prompt"] = prompt_map[sid]
        else:
            shot["prompt"] = compose_prompt(shot, aspect_ratio="16:9")
        result.append(shot)
    return result
