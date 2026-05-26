from __future__ import annotations

import re
from typing import Any

from .schemas import ShotSpec

_SCENE_HEADER_RE = re.compile(r"场景[:：]\s*([^\n]+)")
_TIME_HEADER_RE = re.compile(r"时间[:：]\s*([^\n]+)")
_CHARACTER_HEADER_RE = re.compile(r"(?:人物|角色)[:：]\s*([^\n]+)")
_SHOT_MARKER_RE = re.compile(r"(?m)^\s*[△▲]\s*(.+?)(?=\n\s*[△▲]|\Z)", re.S)
_DIALOGUE_RE = re.compile(r"(?m)^\s*([\u4e00-\u9fa5A-Za-z·]{1,12})\s*[:：]\s*(.+)$")


def combine_source_text(args: dict[str, Any]) -> tuple[str, list[dict[str, Any]]]:
    docs = [dict(item or {}) for item in list(args.get("source_documents") or args.get("uploaded_documents") or []) if isinstance(item, dict)]
    parts: list[str] = []
    message = str(args.get("source_text") or args.get("brief") or args.get("message") or "").strip()
    if message:
        parts.append(message)
    for doc in docs:
        text = str(doc.get("text_content") or "").strip()
        name = str(doc.get("name") or "").strip()
        if text:
            parts.append(f"[{name or 'document'}]\n{text}")
    return "\n\n".join(parts).strip(), docs


def _split_names(value: str) -> list[str]:
    names = re.split(r"[、,，/\s]+", str(value or "").strip())
    return [name for name in (item.strip() for item in names) if name]


def _extract_dialogue(block: str) -> str:
    lines = []
    for speaker, text in _DIALOGUE_RE.findall(block or ""):
        lines.append(f"{speaker}: {text.strip()}")
    return "\n".join(lines).strip()


def _clean_action(block: str) -> str:
    text = _DIALOGUE_RE.sub("", block or "")
    text = re.sub(r"\s+", " ", text).strip(" ：:，,。 ")
    return text[:500]


def _fallback_blocks(source: str) -> list[str]:
    lines = [line.strip() for line in str(source or "").splitlines() if line.strip()]
    skipped_prefixes = ("人物", "角色", "场景", "时间")
    useful = [line for line in lines if not line.startswith(skipped_prefixes)]
    if not useful:
        return []
    blocks: list[str] = []
    current: list[str] = []
    for line in useful:
        current.append(line)
        if len(" ".join(current)) >= 80:
            blocks.append("\n".join(current))
            current = []
    if current:
        blocks.append("\n".join(current))
    return blocks


def extract_shots_from_text(source: str, max_shots: int = 12) -> list[ShotSpec]:
    text = str(source or "").strip()
    if not text:
        return []

    scene_default = (_SCENE_HEADER_RE.search(text).group(1).strip() if _SCENE_HEADER_RE.search(text) else "")
    time_default = (_TIME_HEADER_RE.search(text).group(1).strip() if _TIME_HEADER_RE.search(text) else "")
    character_default = _split_names(_CHARACTER_HEADER_RE.search(text).group(1)) if _CHARACTER_HEADER_RE.search(text) else []

    marker_blocks = [match.group(1).strip() for match in _SHOT_MARKER_RE.finditer(text)]
    blocks = marker_blocks or _fallback_blocks(text)
    shots: list[ShotSpec] = []
    for idx, block in enumerate(blocks[: max(1, int(max_shots or 12))], start=1):
        dialogue = _extract_dialogue(block)
        action = _clean_action(block)
        local_chars = character_default[:]
        for speaker, _ in _DIALOGUE_RE.findall(block):
            if speaker not in local_chars:
                local_chars.append(speaker)
        title = action[:28] or dialogue[:28] or f"镜头 {idx}"
        audio_description = _infer_audio_description(block)
        shots.append({
            "shot_id": f"shot_{idx:02d}",
            "index": idx,
            "title": title,
            "scene": scene_default,
            "time": time_default,
            "characters": local_chars,
            "visual_description": action,
            "audio_description": audio_description,
            "action": action,
            "dialogue": dialogue,
            "camera": _infer_camera(block),
            "mood": _infer_mood(block),
            "reference_hint": _infer_reference_hint(block),
        })
    return shots


def _infer_audio_description(text: str) -> str:
    source = str(text or "")
    cues: list[str] = []
    if any(word in source for word in ("风", "风声", "树叶", "桃花", "庭院", "鸟鸣")):
        cues.append("轻微风声、树叶摩擦和庭院环境声")
    if any(word in source for word in ("脚步", "跑", "跳", "手势舞", "打斗", "碰撞", "摔")):
        cues.append("动作声与衣料摩擦声")
    if any(word in source for word in ("哭", "笑")):
        cues.append("人物非语言情绪声效")
    if any(word in source for word in ("法力", "魔法", "光", "能量", "控制")):
        cues.append("轻微能量流动音效")
    if not cues:
        cues.append("轻微环境声与低频氛围音乐")
    return "；".join(cues)


def _infer_camera(text: str) -> str:
    source = str(text or "")
    if any(word in source for word in ("特写", "近景", "表情")):
        return "close-up"
    if any(word in source for word in ("全景", "远景", "庭院", "外景")):
        return "wide shot"
    if any(word in source for word in ("转场", "手机画面", "屏幕")):
        return "screen transition shot"
    return "cinematic medium shot"


def _infer_mood(text: str) -> str:
    source = str(text or "")
    if any(word in source for word in ("绝望", "大喊", "破碎", "深夜", "忧郁")):
        return "dramatic, expressive"
    if any(word in source for word in ("魔性", "不协调", "无奈", "纯真")):
        return "comedic, lively"
    return "cinematic, clean, coherent"


def _infer_reference_hint(text: str) -> str:
    source = str(text or "")
    if any(word in source for word in ("参考图", "原图", "上传", "图生图", "保持人物", "保持角色")):
        return "requires_reference_image"
    return ""
