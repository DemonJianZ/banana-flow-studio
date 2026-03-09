from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Dict, Tuple


ALLOWED_KEYS = ["platform", "tone", "camera_style", "risk_posture"]

_SINGLE_VALUE_KEYS = {"platform", "risk_posture"}
_MERGE_LIST_KEYS = {"tone", "camera_style"}
_HISTORY_MAX_ITEMS = 10
_HISTORY_MAX_CHARS = 2000


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _text(value: Any) -> str:
    return str(value or "").strip()


def _as_float(value: Any, default: float = 0.9) -> float:
    try:
        parsed = float(value)
    except Exception:
        parsed = float(default)
    return max(0.0, min(1.0, parsed))


def _normalize_single_value(value: Any) -> str:
    return _text(value)


def _normalize_list_value(value: Any) -> list[str]:
    values: list[str] = []
    raw_items = value if isinstance(value, list) else [value]
    seen = set()
    for item in list(raw_items or []):
        text = _text(item)
        if not text or text in seen:
            continue
        seen.add(text)
        values.append(text)
        if len(values) >= 20:
            break
    return values


def _normalize_value_for_key(key: str, value: Any) -> Any:
    if key in _SINGLE_VALUE_KEYS:
        return _normalize_single_value(value)
    if key in _MERGE_LIST_KEYS:
        return _normalize_list_value(value)
    return value


def _finalize_merge_value(values: list[str]) -> Any:
    cleaned = list(values or [])
    if len(cleaned) <= 1:
        return (cleaned[0] if cleaned else "")
    return cleaned


def _history_list(raw: Any) -> list[dict]:
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except Exception:
            parsed = []
    else:
        parsed = raw
    if not isinstance(parsed, list):
        return []
    out: list[dict] = []
    for item in parsed:
        if not isinstance(item, dict):
            continue
        out.append(dict(item))
        if len(out) >= 50:
            break
    return out


def _cap_history(entries: list[dict]) -> list[dict]:
    clipped = list(entries or [])[-_HISTORY_MAX_ITEMS:]
    while clipped:
        try:
            encoded = json.dumps(clipped, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        except Exception:
            return []
        if len(encoded) <= _HISTORY_MAX_CHARS:
            return clipped
        clipped = clipped[1:]
    return []


def _merge_unique(base: list[str], incoming: list[str]) -> tuple[list[str], int]:
    merged = list(base or [])
    seen = set(merged)
    overlap = 0
    for item in list(incoming or []):
        if item in seen:
            overlap += 1
            continue
        seen.add(item)
        merged.append(item)
        if len(merged) >= 20:
            break
    return merged, overlap


def consolidate_preference(existing: dict | None, incoming: dict) -> Tuple[dict, dict]:
    key = _text((incoming or {}).get("key"))
    if key not in ALLOWED_KEYS:
        raise ValueError(f"unsupported preference key: {key}")

    now = _text((incoming or {}).get("now_iso")) or _now_iso()
    normalized_incoming = _normalize_value_for_key(key, (incoming or {}).get("value"))
    incoming_conf = _as_float((incoming or {}).get("confidence"), default=0.9)
    result = {
        "value": normalized_incoming,
        "confidence": incoming_conf,
        "last_confirmed_at": None,
        "append_history": None,
        "change_reason": "created",
    }
    change_log = {
        "key": key,
        "old_value": None,
        "new_value": normalized_incoming,
        "reason": "created",
        "confirmation": False,
    }
    if key in _MERGE_LIST_KEYS:
        result["value"] = _finalize_merge_value(
            normalized_incoming if isinstance(normalized_incoming, list) else _normalize_list_value(normalized_incoming)
        )
        change_log["new_value"] = result["value"]
    if not existing:
        return result, change_log

    existing_value = _normalize_value_for_key(key, existing.get("value"))
    existing_conf = _as_float(existing.get("confidence"), default=0.8)
    history = _history_list(existing.get("value_history_json"))

    if key in _SINGLE_VALUE_KEYS:
        if existing_value == normalized_incoming:
            next_conf = min(existing_conf + 0.05, 0.95)
            result.update(
                {
                    "value": existing_value,
                    "confidence": next_conf,
                    "last_confirmed_at": now,
                    "change_reason": "confirmed_same_value",
                }
            )
            change_log.update(
                {
                    "old_value": existing_value,
                    "new_value": existing_value,
                    "reason": "confirmed_same_value",
                    "confirmation": True,
                }
            )
            return result, change_log

        entry = {
            "ts": now,
            "key": key,
            "old_value": existing_value,
            "new_value": normalized_incoming,
            "reason": "replaced_conflict",
        }
        next_history = _cap_history(history + [entry])
        result.update(
            {
                "value": normalized_incoming,
                "confidence": 0.85,
                "append_history": next_history,
                "change_reason": "replaced_conflict",
            }
        )
        change_log.update(
            {
                "old_value": existing_value,
                "new_value": normalized_incoming,
                "reason": "replaced_conflict",
                "confirmation": False,
            }
        )
        return result, change_log

    if key in _MERGE_LIST_KEYS:
        base = existing_value if isinstance(existing_value, list) else _normalize_list_value(existing_value)
        incoming_list = (
            normalized_incoming
            if isinstance(normalized_incoming, list)
            else _normalize_list_value(normalized_incoming)
        )
        merged, overlap = _merge_unique(base=base, incoming=incoming_list)
        confirmations = overlap if overlap > 0 else (1 if merged == base else 0)
        next_conf = existing_conf
        if confirmations > 0:
            next_conf = min(existing_conf + (0.03 * confirmations), 0.95)
        elif merged != base:
            next_conf = max(existing_conf, incoming_conf, 0.85)
        reason = "merged"
        if merged == base and confirmations > 0:
            reason = "confirmed_same_value"
        elif merged == base:
            reason = "no_change"
        result.update(
            {
                "value": _finalize_merge_value(merged),
                "confidence": next_conf,
                "last_confirmed_at": (now if confirmations > 0 else None),
                "change_reason": reason,
            }
        )
        change_log.update(
            {
                "old_value": base,
                "new_value": _finalize_merge_value(merged),
                "reason": reason,
                "confirmation": confirmations > 0,
            }
        )
        return result, change_log

    return result, change_log
