from __future__ import annotations

import json
import re
from typing import Any

from .llm_decomposer import _call_llm


# ---------------------------------------------------------------------------
# Mode resolver
# ---------------------------------------------------------------------------

def resolve_asset_design_mode(mode_policy: str) -> str:
    """Resolve generation mode for missing assets.

    ``multi_image_generate`` is blocked because unmatched entities have no
    reference image to compose with.  ``local``/``comfyui`` are normalised to
    ``local_text2img``.  Everything else falls back to ``text2img``.
    """
    if mode_policy in {"local", "comfyui", "local_text2img"}:
        return "local_text2img"
    return "text2img"


# ---------------------------------------------------------------------------
# Fallback prompt templates
# ---------------------------------------------------------------------------

_TEMPLATES: dict[str, str] = {
    "character": (
        "Three-view character design sheet of {name}, front/side/back view, "
        "full body illustration, white background, {description}"
    ),
    "prop": (
        "Product concept illustration of {name}, clean white background, "
        "studio lighting, multiple angles, {description}"
    ),
    "scene": (
        "Environment concept art of {name}, establishing shot, wide angle, "
        "cinematic, {description}"
    ),
}

_TEMPLATE_DEFAULT = "Concept illustration of {name}, {description}"


def _fallback_prompt(name: str, entity_type: str, description: str) -> str:
    """Return a template-based fallback prompt for an entity."""
    template = _TEMPLATES.get(str(entity_type or "").strip(), _TEMPLATE_DEFAULT)
    desc = str(description or "").strip()
    raw = template.format(name=name, description=desc)
    # Clean up trailing ", " when description is empty
    return re.sub(r",\s*$", "", raw).strip()


# ---------------------------------------------------------------------------
# LLM prompt builder
# ---------------------------------------------------------------------------

def _build_world_context_section(script_context: dict) -> str:
    """Build a 世界观参考 paragraph from script_context, or return empty string."""
    if not script_context:
        return ""

    lines: list[str] = []

    summary = str(script_context.get("summary") or "").strip()
    if summary:
        lines.append(f"故事概要：{summary}")

    atmospheres = [str(a).strip() for a in (script_context.get("atmospheres") or []) if str(a).strip()]
    if atmospheres:
        lines.append(f"场景氛围：{' / '.join(atmospheres)}")

    matched_chars = script_context.get("matched_characters") or []
    char_refs = []
    for ch in matched_chars:
        name = str(ch.get("name") or "").strip()
        desc = str(ch.get("description") or "").strip()
        if name:
            char_refs.append(f"{name}（{desc}）" if desc else name)
    if char_refs:
        lines.append(f"已确立视觉参考角色：{' / '.join(char_refs[:4])}")

    if not lines:
        return ""
    return "【世界观参考（生成提示词时须与此保持视觉风格一致）】\n" + "\n".join(lines)


def _build_design_prompt(entities: list[dict], script_context: dict | None = None) -> str:
    entity_list = json.dumps(
        [
            {
                "entity_id": e.get("entity_id", ""),
                "name": e.get("name", ""),
                "type": e.get("entity_type", ""),
                "description": e.get("description", ""),
            }
            for e in entities
        ],
        ensure_ascii=False,
    )
    context_section = _build_world_context_section(script_context or {})
    context_block = f"\n{context_section}\n" if context_section else ""
    return (
        "你是视觉创作提示词专家。为以下角色/道具/场景批量生成英文设定图提示词。\n"
        "严格输出 JSON，格式 {entity_id: \"english prompt\"}。\n"
        "不要输出 markdown，不要解释，不要在 JSON 外添加任何文字。\n"
        f"{context_block}\n"
        f"实体列表：\n{entity_list}"
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def generate_design_prompts(
    entities: list[dict],
    authorization: str = "",
    script_context: dict | None = None,
) -> dict[str, dict]:
    """Generate design prompts for a list of unmatched entities.

    Args:
        entities: list of dicts with ``entity_id``, ``name``, ``entity_type``,
                  ``description``.
        authorization: optional bearer token forwarded to the LLM gateway.
        script_context: optional world/style context injected into the LLM
            prompt for visual coherence.  Expected keys (all optional):
            ``summary`` (str), ``atmospheres`` (list[str]),
            ``matched_characters`` (list[{name, description}]).

    Returns:
        Mapping of ``entity_id`` → result dict with keys
        ``entity_id``, ``name``, ``entity_type``, ``prompt``, ``source``,
        ``warnings``.
    """
    if not entities:
        return {}

    # Attempt a single batch LLM call
    llm_data: dict[str, Any] = {}
    llm_ok = False
    try:
        prompt = _build_design_prompt(entities, script_context)
        llm_data = _call_llm(prompt, authorization)
        llm_ok = True
    except Exception:
        llm_ok = False

    results: dict[str, dict] = {}
    for entity in entities:
        eid = str(entity.get("entity_id") or "")
        name = str(entity.get("name") or "")
        etype = str(entity.get("entity_type") or "")
        desc = str(entity.get("description") or "")

        warnings: list[str] = []

        if llm_ok and eid in llm_data:
            prompt_text = str(llm_data[eid] or "").strip()
            source = "llm"
        else:
            prompt_text = _fallback_prompt(name, etype, desc)
            source = "fallback"
            if llm_ok:
                # LLM succeeded overall but skipped this entity
                warnings.append("llm_entity_missing_from_response")

        results[eid] = {
            "entity_id": eid,
            "name": name,
            "entity_type": etype,
            "prompt": prompt_text,
            "source": source,
            "warnings": warnings,
        }

    return results
