from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

try:
    from ..sessions.service import get_session
    from ..memory.service import retrieve_preferences
except Exception:  # pragma: no cover - 兼容 python bananaflow/main.py 直跑
    from sessions.service import get_session
    from memory.service import retrieve_preferences


@dataclass
class ContextPack:
    system_instructions: str
    session_summary: str | None
    recent_turns: list[dict]
    runtime_state: dict
    user_preferences: list[dict]
    metadata: dict


def _text(value: Any) -> str:
    return str(value or "").strip()


def _truncate(text: str, limit: int) -> str:
    raw = _text(text)
    if limit <= 0:
        return ""
    if len(raw) <= limit:
        return raw
    if limit <= 3:
        return raw[:limit]
    return f"{raw[: limit - 3]}..."


def _as_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "on"}:
        return True
    if text in {"0", "false", "no", "off"}:
        return False
    return default


def _as_int(value: Any, default: int) -> int:
    try:
        return int(str(value).strip())
    except Exception:
        return int(default)


def _scan_payload_for_key(payload: Any, key: str) -> Optional[str]:
    if isinstance(payload, dict):
        value = _text(payload.get(key))
        if value:
            return value
        for item in payload.values():
            found = _scan_payload_for_key(item, key)
            if found:
                return found
    elif isinstance(payload, list):
        for item in payload:
            found = _scan_payload_for_key(item, key)
            if found:
                return found
    return None


def _compact_runtime_state(state: Dict[str, Any]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for key, value in dict(state or {}).items():
        normalized_key = _text(key)
        if not normalized_key:
            continue
        if isinstance(value, (str, int, float, bool)) or value is None:
            if isinstance(value, str):
                out[normalized_key] = _truncate(value, 300)
            else:
                out[normalized_key] = value
            continue
        if isinstance(value, list):
            if normalized_key == "selected_assets_overrides":
                out["selected_assets_overrides_count"] = len(value)
                continue
            if normalized_key == "last_bundle_dirs":
                out["last_bundle_dirs"] = [_truncate(item, 120) for item in list(value)[-5:]]
                continue
            if all(isinstance(item, (str, int, float, bool)) for item in value):
                out[normalized_key] = list(value)[:10]
            else:
                out[f"{normalized_key}_count"] = len(value)
            continue
        if isinstance(value, dict):
            if normalized_key == "selected_assets_overrides":
                out["selected_assets_overrides_count"] = len(value.keys())
            else:
                out[f"{normalized_key}_keys"] = [str(item) for item in list(value.keys())[:10]]
            continue
        out[normalized_key] = _truncate(value, 200)
    return out


def _preference_value_text(value: Any) -> str:
    if isinstance(value, str):
        return _truncate(value, 220)
    try:
        encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    except Exception:
        encoded = _text(value)
    return _truncate(encoded, 220)


def _preference_line(pref: Dict[str, Any]) -> str:
    key = _text(pref.get("key")) or "-"
    confidence = float(pref.get("confidence") or 0.0)
    value_text = _preference_value_text(pref.get("value"))
    return f"- {key} (confidence={confidence:.2f}): {value_text}"


def _compact_preferences(
    preferences: List[Dict[str, Any]],
    max_items: int,
    max_chars: int,
) -> tuple[list[dict], dict]:
    sorted_items = list(preferences or [])
    before_count = len(sorted_items)
    before_chars = sum(len(_preference_line(item)) for item in sorted_items)

    selected = sorted_items[:max_items]
    dropped_items = max(0, len(sorted_items) - len(selected))
    current_chars = sum(len(_preference_line(item)) for item in selected)
    dropped_by_chars = 0
    while selected and current_chars > max_chars:
        removed = selected.pop()
        current_chars -= len(_preference_line(removed))
        dropped_by_chars += 1

    compacted = [
        {
            "key": _text(item.get("key")),
            "value": item.get("value"),
            "confidence": float(item.get("confidence") or 0.0),
            "update_count": int(item.get("update_count") or 0),
        }
        for item in selected
        if _text(item.get("key"))
    ]
    after_chars = sum(len(_preference_line(item)) for item in compacted)
    meta = {
        "preference_count_before": before_count,
        "preference_count_after": len(compacted),
        "preference_chars_before": before_chars,
        "preference_chars_after": after_chars,
        "max_pref_items": max_items,
        "max_pref_chars": max_chars,
        "dropped_preference_items": dropped_items + dropped_by_chars,
        "preferences_truncated": bool(
            before_count > len(compacted)
            or before_chars > after_chars
            or dropped_items > 0
            or dropped_by_chars > 0
        ),
    }
    return compacted, meta


def _extract_recent_turns(
    events: List[Dict[str, Any]],
    max_recent_turns: int,
    max_turn_chars: int,
) -> tuple[list[dict], dict]:
    selected: list[dict] = []
    for event in reversed(list(events or [])):
        evt_type = _text(event.get("type")).upper()
        if evt_type not in {"USER_MESSAGE", "ASSISTANT_MESSAGE"}:
            continue
        role = "user" if evt_type == "USER_MESSAGE" else "assistant"
        payload = event.get("payload") or {}
        if not isinstance(payload, dict):
            payload = {}
        content = _text(payload.get("text") or payload.get("content") or payload.get("message"))
        if not content:
            continue
        selected.append(
            {
                "role": role,
                "content": _truncate(content, 1200),
                "ts": _text(event.get("ts")),
                "event_id": event.get("event_id"),
            }
        )
        if len(selected) >= max_recent_turns:
            break
    selected.reverse()
    initial_turn_count = len(selected)
    initial_turn_chars = sum(len(_text(item.get("content"))) for item in selected)
    current_chars = initial_turn_chars
    dropped_turns = 0
    while selected and current_chars > max_turn_chars:
        dropped = selected.pop(0)
        current_chars -= len(_text(dropped.get("content")))
        dropped_turns += 1
    event_ids = [int(item.get("event_id")) for item in selected if item.get("event_id") is not None]
    for item in selected:
        item.pop("event_id", None)
    recent_event_range: Optional[dict] = None
    if event_ids:
        recent_event_range = {
            "from_event_id": min(event_ids),
            "to_event_id": max(event_ids),
        }
    truncation = {
        "turn_count_before": initial_turn_count,
        "turn_count_after": len(selected),
        "turn_chars_before": initial_turn_chars,
        "turn_chars_after": sum(len(_text(item.get("content"))) for item in selected),
        "dropped_oldest_turns": dropped_turns,
        "max_turn_chars": max_turn_chars,
        "truncated": dropped_turns > 0,
    }
    return selected, {"truncation": truncation, "recent_event_range": recent_event_range}


def build_context_pack(
    tenant_id: str,
    user_id: str,
    session_id: str,
    base_system: str,
    max_recent_turns: int = 6,
    max_summary_chars: int = 1500,
    max_turn_chars: int = 6000,
    use_user_preferences: bool | None = None,
    max_pref_items: int | None = None,
    max_pref_chars: int | None = None,
) -> ContextPack:
    turns_cap = max(1, min(int(max_recent_turns or 6), 20))
    summary_cap = max(200, min(int(max_summary_chars or 1500), 4000))
    turn_chars_cap = max(400, min(int(max_turn_chars or 6000), 20000))
    pref_enabled = (
        _as_bool(os.getenv("BANANAFLOW_USE_USER_PREFERENCES_IN_CONTEXT"), default=False)
        if use_user_preferences is None
        else bool(use_user_preferences)
    )
    pref_items_cap = max(
        1,
        min(
            int(max_pref_items or _as_int(os.getenv("BANANAFLOW_MAX_PREF_ITEMS"), 10)),
            50,
        ),
    )
    pref_chars_cap = max(
        200,
        min(
            int(max_pref_chars or _as_int(os.getenv("BANANAFLOW_MAX_PREF_CHARS"), 1200)),
            8000,
        ),
    )

    data = get_session(
        tenant_id=tenant_id,
        user_id=user_id,
        session_id=session_id,
        include_events=True,
        limit_events=max(120, turns_cap * 30),
    )
    session = dict(data.get("session") or {})
    events = list(data.get("events") or [])

    raw_summary = _text(session.get("summary_text"))
    summary_text = _truncate(raw_summary, summary_cap) if raw_summary else None
    summary_truncated = bool(raw_summary and len(raw_summary) > len(summary_text or ""))

    runtime_state = _compact_runtime_state(dict(session.get("state") or {}))
    prompt_version = _text(runtime_state.get("prompt_version"))
    policy_version = _text(runtime_state.get("policy_version"))
    config_hash = _text(runtime_state.get("config_hash"))

    if not prompt_version or not policy_version or not config_hash:
        for event in reversed(events):
            payload = (event or {}).get("payload") or {}
            if not isinstance(payload, dict):
                continue
            if not prompt_version:
                prompt_version = _scan_payload_for_key(payload, "prompt_version") or prompt_version
            if not policy_version:
                policy_version = _scan_payload_for_key(payload, "policy_version") or policy_version
            if not config_hash:
                config_hash = _scan_payload_for_key(payload, "config_hash") or config_hash
            if prompt_version and policy_version and config_hash:
                break

    recent_turns, turn_meta = _extract_recent_turns(
        events=events,
        max_recent_turns=turns_cap,
        max_turn_chars=turn_chars_cap,
    )
    raw_preferences: list[dict] = []
    retrieval_meta: dict = {}
    if pref_enabled:
        raw_preferences = retrieve_preferences(
            tenant_id=tenant_id,
            user_id=user_id,
            keys=None,
            limit=max(pref_items_cap * 3, pref_items_cap),
            max_chars=pref_chars_cap,
        )
        retrieval_meta = dict(getattr(raw_preferences, "retrieval_meta", {}) or {})
    user_preferences, pref_meta = _compact_preferences(
        preferences=raw_preferences,
        max_items=pref_items_cap,
        max_chars=pref_chars_cap,
    )
    truncation_info = dict(turn_meta.get("truncation") or {})
    truncation_info.update(
        {
            "summary_chars_before": len(raw_summary),
            "summary_chars_after": len(summary_text or ""),
            "max_summary_chars": summary_cap,
            "summary_truncated": summary_truncated,
            "truncated": bool(truncation_info.get("truncated") or summary_truncated),
        }
    )
    truncation_info.update(pref_meta)
    truncation_info["expired_filtered_count"] = int(retrieval_meta.get("expired_filtered_count") or 0)
    truncation_info["preference_update_count_sum"] = int(
        retrieval_meta.get("update_count_sum")
        or sum(int(item.get("update_count") or 0) for item in list(user_preferences or []))
    )
    service_pref_truncated = bool(retrieval_meta.get("truncated"))
    if service_pref_truncated:
        truncation_info["preference_count_before"] = int(
            retrieval_meta.get("items_before_truncation") or truncation_info.get("preference_count_before") or 0
        )
        truncation_info["preference_count_after"] = int(
            retrieval_meta.get("items_after_truncation") or truncation_info.get("preference_count_after") or 0
        )
        truncation_info["preference_chars_before"] = int(
            retrieval_meta.get("chars_before") or truncation_info.get("preference_chars_before") or 0
        )
        truncation_info["preference_chars_after"] = int(
            retrieval_meta.get("chars_after") or truncation_info.get("preference_chars_after") or 0
        )
        truncation_info["preferences_truncated"] = True
    truncation_info["truncated"] = bool(
        truncation_info.get("truncated")
        or bool(pref_meta.get("preferences_truncated"))
        or service_pref_truncated
    )
    metadata = {
        "session_id": _text(session.get("session_id") or session_id),
        "prompt_version": (prompt_version or None),
        "policy_version": (policy_version or None),
        "config_hash": (config_hash or None),
        "summary_event_upto": session.get("summary_event_id_upto"),
        "recent_event_range": turn_meta.get("recent_event_range"),
        "preferences_enabled": pref_enabled,
        "preferences_count": len(user_preferences),
        "preferences_update_count_sum": int(truncation_info.get("preference_update_count_sum") or 0),
        "truncation_info": truncation_info,
    }
    return ContextPack(
        system_instructions=_text(base_system),
        session_summary=summary_text,
        recent_turns=recent_turns,
        runtime_state=runtime_state,
        user_preferences=user_preferences,
        metadata=metadata,
    )


def render_context_sections(context_pack: ContextPack) -> str:
    summary = _text(context_pack.session_summary) or "N/A"
    turns = []
    for turn in list(context_pack.recent_turns or []):
        role = _text(turn.get("role")).lower() or "user"
        ts = _text(turn.get("ts")) or "-"
        content = _text(turn.get("content")) or "-"
        turns.append(f"- [{role}][{ts}] {content}")
    if not turns:
        turns = ["- N/A"]

    pref_enabled = bool((context_pack.metadata or {}).get("preferences_enabled"))
    pref_lines = []
    if pref_enabled:
        for pref in list(context_pack.user_preferences or []):
            pref_lines.append(_preference_line(pref))
        if not pref_lines:
            pref_lines = ["- N/A"]

    state = dict(context_pack.runtime_state or {})
    selected_keys = [
        "last_product",
        "selected_assets_overrides_count",
        "last_bundle_dirs",
        "last_bundle_dir",
        "last_edit_plan_ids",
        "prompt_version",
        "policy_version",
        "config_hash",
    ]
    state_lines = []
    for key in selected_keys:
        if key not in state:
            continue
        value = state.get(key)
        if isinstance(value, list):
            display = ", ".join(_truncate(item, 80) for item in value[:5])
        else:
            display = _truncate(value, 180)
        state_lines.append(f"- {key}: {display}")
    if not state_lines:
        state_lines = ["- N/A"]

    lines = [
        "SESSION SUMMARY:",
        summary,
        "",
        "RECENT TURNS:",
        *turns,
        "",
    ]
    if pref_enabled:
        lines.extend(
            [
                "USER PREFERENCES:",
                *pref_lines,
                "",
            ]
        )
    lines.extend(
        [
            "RUNTIME STATE:",
            *state_lines,
        ]
    )
    return "\n".join(lines)
