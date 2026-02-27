from __future__ import annotations

import re
from typing import Iterable


_TOKEN_RE = re.compile(r"[a-z0-9]+|[\u4e00-\u9fff]+", re.IGNORECASE)

_STOPWORDS = {
    "",
    "a",
    "an",
    "the",
    "of",
    "and",
    "for",
    "to",
    "in",
    "on",
    "at",
    "with",
    "video",
    "素材",
    "画面",
    "镜头",
    "场景",
}

_SYNONYM_MAP = {
    "产品": "product",
    "商品": "product",
    "货品": "product",
    "包装": "package",
    "包材": "package",
    "特写": "close_up",
    "近景": "close_up",
    "近拍": "close_up",
    "地铁": "subway",
    "通勤": "commute",
    "字幕": "overlay",
    "文案": "overlay",
    "贴片": "overlay",
    "步骤": "steps",
    "教程": "steps",
    "开场": "hook",
    "口播": "talking_head",
    "真实实拍": "live_action",
    "实拍": "live_action",
}


def normalize_tags(tags: list[str] | tuple[str, ...] | Iterable[str]) -> list[str]:
    normalized: list[str] = []
    seen = set()
    for raw in tags or []:
        text = str(raw or "").strip().lower()
        if not text:
            continue
        tokens = [m.group(0).lower() for m in _TOKEN_RE.finditer(text)]
        for token in tokens:
            mapped = _SYNONYM_MAP.get(token, token)
            if mapped in _STOPWORDS:
                continue
            if not mapped or mapped in seen:
                continue
            seen.add(mapped)
            normalized.append(mapped)
    return normalized
