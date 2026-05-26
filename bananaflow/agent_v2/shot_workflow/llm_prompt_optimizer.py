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
        "visual_description": shot.get("visual_description") or shot.get("action"),
        "audio_description": shot.get("audio_description"),
        "action": shot.get("action"),
        "dialogue": shot.get("dialogue"),
        "camera": shot.get("camera"),
        "mood": shot.get("mood"),
        "mode": shot.get("mode"),
    }


def _build_optimize_prompt(shots: list[dict[str, Any]]) -> str:
    system = (
        "你是专业视频/图像提示词工程师，为每个分镜生成高质量的中文提示词，用于 AI 视频/图像生成模型。\n"
        "输出严格 JSON，顶层字段：prompts（数组）。\n"
        "不要输出 markdown，不要解释。\n\n"
        "prompts 数组中每个对象包含：\n"
        "  shot_id（与输入对应）, prompt（中文自然语言描述，80-150字）\n\n"
        "提示词要求：\n"
        "1. 用流畅的中文自然语言句子描述，不要用逗号分隔的标签列表。\n"
        "2. 按顺序描述：画面主体（角色动作与表情）→ 场景环境与背景 → 摄影机运动/构图 → 光线与氛围。\n"
        "3. visual_description 是画面核心，必须完整转写进提示词；audio_description 是环境/动作/氛围音效，不要写成字幕或台词；dialogue 是角色台词，不要把台词文字画到画面中。\n"
        "4. 如果 matched_characters 有值，说明当前镜头有匹配的角色参考图，提示词中明确写出角色名以保持一致性（例如\"辰辰身着白色仙袍\"）。\n"
        "5. 如果 matched_scene_folder 有值，在提示词中引用该场景的地点特征（例如\"辰辰庭院的桃花树下\"）。\n"
        "6. 不要在画面中渲染文字、字幕或水印。\n"
        "7. 结尾加：高质量，电影感，无字幕，无水印。\n\n"
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
