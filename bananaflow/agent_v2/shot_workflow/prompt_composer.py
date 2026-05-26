from __future__ import annotations

from .schemas import ShotSpec


def compose_prompt(shot: ShotSpec, aspect_ratio: str = "16:9") -> str:
    """中文兜底提示词，供 LLM 优化失败时使用。"""
    parts: list[str] = []

    chars = "、".join(shot.get("characters") or [])
    if chars:
        parts.append(f"角色：{chars}。")

    if shot.get("scene"):
        parts.append(f"场景：{shot['scene']}。")

    if shot.get("time"):
        parts.append(f"时间：{shot['time']}。")

    visual = shot.get("visual_description") or shot.get("action") or ""
    if visual:
        parts.append(visual)

    if shot.get("camera"):
        parts.append(f"镜头：{shot['camera']}。")

    if shot.get("mood"):
        parts.append(f"氛围：{shot['mood']}。")

    parts.append("高质量，电影感，无字幕，无水印。")

    return " ".join(p for p in parts if p).strip()
