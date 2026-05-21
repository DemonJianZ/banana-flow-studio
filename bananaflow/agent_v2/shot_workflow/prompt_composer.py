from __future__ import annotations

from .schemas import ShotSpec


def compose_prompt(shot: ShotSpec, aspect_ratio: str = "16:9") -> str:
    chars = ", ".join(shot.get("characters") or [])
    parts = [
        "Cinematic production still for one storyboard shot.",
        f"Shot ID: {shot.get('shot_id', '')}.",
    ]
    if shot.get("scene"):
        parts.append(f"Scene: {shot['scene']}.")
    if shot.get("time"):
        parts.append(f"Time: {shot['time']}.")
    if chars:
        parts.append(f"Characters: {chars}.")
    if shot.get("action"):
        parts.append(f"Action and composition: {shot['action']}.")
    if shot.get("dialogue"):
        parts.append(f"Dialogue context, do not render text in image: {shot['dialogue']}.")
    parts.extend([
        f"Camera: {shot.get('camera') or 'cinematic medium shot'}.",
        f"Mood: {shot.get('mood') or 'cinematic, clean, coherent'}.",
        f"Aspect ratio {aspect_ratio}, high quality, coherent character design, production-ready frame, no subtitles, no watermark.",
    ])
    return " ".join(part for part in parts if part).strip()
