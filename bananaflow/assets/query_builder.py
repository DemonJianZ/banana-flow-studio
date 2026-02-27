from __future__ import annotations

import re
from typing import TYPE_CHECKING

from .schemas import AssetQuery

if TYPE_CHECKING:
    try:
        from agent.idea_script.schemas import ShotItem
    except Exception:  # pragma: no cover
        from bananaflow.agent.idea_script.schemas import ShotItem

_TOKEN_RE = re.compile(r"[a-z0-9_]+|[\u4e00-\u9fff]+", re.IGNORECASE)

_SEGMENT_PREFS = {
    "HOOK": ["hook", "attention", "close_up", "talking_head"],
    "VIEW": ["view", "context", "wide", "comparison", "scene"],
    "STEPS": ["steps", "tutorial", "over_shoulder", "top_down", "process"],
    "PRODUCT": ["product", "close_up", "package", "ingredient", "detail", "macro"],
    "CTA": ["cta", "overlay", "gesture", "ending", "interaction"],
}

_SEGMENT_TYPE_HINT = {
    "HOOK": "scene",
    "VIEW": "scene",
    "STEPS": "scene",
    "PRODUCT": "product",
    "CTA": "overlay",
}


class ShotQueryBuilder:
    def build(self, shot: "ShotItem") -> AssetQuery:
        required_tags: list[str] = []
        preferred_tags: list[str] = []
        forbidden_tags: list[str] = []
        query_type = ""
        aspect = ""

        for req in list(getattr(shot, "asset_requirements", []) or []):
            must_have = str(getattr(req, "must_have", "") or "").strip()
            avoid = str(getattr(req, "avoid", "") or "").strip()
            req_type = str(getattr(req, "type", "") or "").strip().lower()
            req_aspect = str(getattr(req, "aspect", "") or "").strip()

            if must_have:
                required_tags.extend(_tokenize(must_have))
            if avoid:
                forbidden_tags.extend(_tokenize(avoid))
            if req_type and not query_type:
                query_type = req_type
            if req_aspect and not aspect:
                aspect = req_aspect

        segment = str(getattr(shot, "segment", "") or "").upper()
        preferred_tags.extend(_tokenize_many(list(getattr(shot, "keyword_tags", []) or [])))
        preferred_tags.extend(_tokenize_many(_SEGMENT_PREFS.get(segment, [])))

        if not query_type:
            query_type = _SEGMENT_TYPE_HINT.get(segment, "")
        if not aspect:
            aspect = "9:16"

        required_tags = _dedup(required_tags)[:8]
        preferred_tags = _dedup(preferred_tags)[:12]
        forbidden_tags = _dedup(forbidden_tags)[:8]
        return AssetQuery(
            required_tags=required_tags,
            preferred_tags=preferred_tags,
            forbidden_tags=forbidden_tags,
            type=query_type,
            aspect=aspect,
        )


def _dedup(items: list[str]) -> list[str]:
    seen = set()
    out: list[str] = []
    for item in items:
        text = str(item or "").strip()
        if not text or text in seen:
            continue
        seen.add(text)
        out.append(text)
    return out


def _tokenize_many(values: list[str]) -> list[str]:
    out: list[str] = []
    for value in values:
        out.extend(_tokenize(value))
    return out


def _tokenize(value: str) -> list[str]:
    text = str(value or "").strip().lower().replace("-", "_")
    if not text:
        return []
    return [m.group(0) for m in _TOKEN_RE.finditer(text)]
