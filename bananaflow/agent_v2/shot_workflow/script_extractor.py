from __future__ import annotations

import re
from typing import Any

from .llm_decomposer import _call_llm


_SCHEMA_HINT = (
    "characters 数组：剧本中出现的角色和重要道具/物件，每项包含：\n"
    "  name（名称）、type（\"character\" 或 \"prop\"）、description（外貌/特征详细描述）\n\n"
    "scenes 数组：场景列表，每项包含：\n"
    "  name（场景名称）、atmosphere（氛围描述：光线、情绪、环境细节）\n\n"
    "shots 数组：按剧情顺序的分镜列表，每项包含：\n"
    "  shot_id（如 \"1.1\" \"1.2\" \"2.1\"，按场景编号）\n"
    "  scene_name（对应 scenes 中的场景名）\n"
    "  duration（估计时长，整数秒，默认 6）\n"
    "  visual_description（画面描述，直接描述画面内容，角色引用用 @名字 标记）\n"
    "  audio_description（画面可添加的环境音、动作音、氛围音乐或特殊音效；不要写角色台词、对白内容、说话声）\n"
    "  dialogue（主角之间的台词对话，只放角色说出的文字，保留说话人，如 \"辰辰：秋水，节奏跟上。\\n秋水：阿巳！快来管管师父！\"；无台词则为空字符串）\n"
    "  characters（该镜头出现的角色/道具名称列表）\n\n"
    "summary：一句话概括整个剧本内容（中文，不超过 60 字）。"
)


def _build_extraction_prompt(source_text: str) -> str:
    return (
        "你是专业分镜导演助手，负责从剧本或故事梗概中提取结构化创作素材。\n"
        "严格输出 JSON，顶层字段：characters、scenes、shots、summary。\n"
        "不要输出 markdown，不要解释，不要在 JSON 外添加任何文字。\n\n"
        f"{_SCHEMA_HINT}\n\n"
        f"剧本原文：\n{source_text}"
    )


def _build_edit_prompt(source_text: str, existing: dict, edit_instruction: str) -> str:
    import json
    existing_json = json.dumps(
        {
            "characters": existing.get("characters") or [],
            "scenes": existing.get("scenes") or [],
            "shots": existing.get("shots") or [],
            "summary": existing.get("summary") or "",
        },
        ensure_ascii=False,
        indent=2,
    )
    return (
        "你是专业分镜导演助手。以下是已从剧本提取的结构化数据，用户希望做如下调整：\n"
        f"【修改要求】{edit_instruction}\n\n"
        "请在现有结果基础上进行修改，返回完整更新后的 JSON（字段格式与原版相同）。\n"
        "严格输出 JSON，顶层字段：characters、scenes、shots、summary。\n"
        "不要输出 markdown，不要解释，不要在 JSON 外添加任何文字。\n\n"
        f"{_SCHEMA_HINT}\n\n"
        f"【当前提取结果】\n{existing_json}\n\n"
        f"【剧本原文】\n{source_text}"
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


def _dialogue_to_text(value: Any) -> str:
    if isinstance(value, list):
        lines: list[str] = []
        for item in value:
            if isinstance(item, dict):
                speaker = str(item.get("speaker") or item.get("role") or item.get("name") or "").strip()
                text = str(item.get("text") or item.get("line") or item.get("content") or "").strip()
                if speaker and text:
                    lines.append(f"{speaker}：{text}")
                elif text:
                    lines.append(text)
            else:
                text = str(item or "").strip()
                if text:
                    lines.append(text)
        return "\n".join(lines).strip()
    return str(value or "").strip()



def _clean_audio_description(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""

    kept: list[str] = []
    for chunk in re.split(r"[\n；;]+", text):
        item = chunk.strip(" 。，,;；")
        if not item:
            continue

        audio_label = re.match(r"^(环境音|环境声|音效|配乐|动作音|动作声|氛围音乐|特殊音效|声音)\s*[:：]\s*(.+)$", item, re.I)
        if audio_label:
            item = audio_label.group(2).strip(" 。，,;；")

        if re.match(r"^(台词|对白|dialogue|lines?)\s*[:：]", item, re.I):
            continue
        if re.match(r"^[\u4e00-\u9fa5A-Za-z·]{1,12}\s*[:：]", item):
            continue
        if item in {"对白", "台词", "说话声", "角色台词", "角色对白"}:
            continue
        kept.append(item)

    return "；".join(kept).strip()


def _normalize_shot(raw: Any, idx: int) -> dict:
    d = dict(raw or {})
    chars = d.get("characters") or []
    if isinstance(chars, str):
        chars = [c.strip() for c in chars.split("、") if c.strip()]
    visual = str(
        d.get("visual_description")
        or d.get("picture_description")
        or d.get("screen_description")
        or d.get("action")
        or ""
    ).strip()
    audio = _clean_audio_description(
        d.get("audio_description")
        or d.get("sound_effect_description")
        or d.get("sound_effect")
        or d.get("sfx")
        or ""
    )
    dialogue = _dialogue_to_text(d.get("dialogue") or d.get("dialogues") or d.get("lines") or "")
    return {
        "shot_id": str(d.get("shot_id") or f"{idx}.1").strip(),
        "scene_name": str(d.get("scene_name") or "").strip(),
        "duration": int(d.get("duration") or 6),
        "visual_description": visual,
        "audio_description": audio,
        "dialogue": dialogue,
        "characters": [str(c).strip() for c in list(chars) if str(c).strip()],
    }


def extract_script_elements(
    source_text: str,
    authorization: str = "",
    existing_extraction: dict | None = None,
    edit_instruction: str = "",
) -> dict:
    """LLM-extract characters, scenes and shots from a screenplay.

    When *edit_instruction* and *existing_extraction* are both provided the
    LLM is asked to revise the previous result instead of starting fresh.
    """
    src = str(source_text or "").strip()
    if not src and existing_extraction:
        src = str(existing_extraction.get("source_text") or "").strip()
    if not src:
        return {"characters": [], "scenes": [], "shots": [], "summary": ""}

    in_edit_mode = bool(edit_instruction and existing_extraction)
    try:
        if in_edit_mode:
            prompt = _build_edit_prompt(src, existing_extraction, edit_instruction)
        else:
            prompt = _build_extraction_prompt(src)
        raw = _call_llm(prompt, authorization)
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
