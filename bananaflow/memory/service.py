from __future__ import annotations

import json
import os
import threading
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

try:
    from ..core.logging import sys_logger
except Exception:  # pragma: no cover - 兼容 python bananaflow/main.py 直跑
    from core.logging import sys_logger

try:
    from ..storage.memories_migrations import ensure_memories_db
    from ..storage.memories_sqlite import get_conn, query_all
    from .policy import ALLOWED_KEYS, consolidate_preference
except Exception:  # pragma: no cover - 兼容 python bananaflow/main.py 直跑
    from storage.memories_migrations import ensure_memories_db
    from storage.memories_sqlite import get_conn, query_all
    from memory.policy import ALLOWED_KEYS, consolidate_preference


MEMORY_SCOPE_USER = "user"
MEMORY_TOPIC_PREFERENCE = "preference"

_ensure_lock = threading.Lock()
_ensured_paths: set[str] = set()


class PreferenceList(list):
    def __init__(self, items: list[Dict[str, Any]], retrieval_meta: Optional[dict] = None) -> None:
        super().__init__(items)
        self.retrieval_meta = dict(retrieval_meta or {})


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_text(value: Any, default: str = "") -> str:
    text = str(value or "").strip()
    return text if text else default


def _as_float(value: Any, default: float = 0.8) -> float:
    try:
        parsed = float(value)
    except Exception:
        parsed = float(default)
    return max(0.0, min(1.0, parsed))


def _as_int(value: Any, default: int = 0) -> int:
    try:
        return int(str(value).strip())
    except Exception:
        return int(default)


def _json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def _json_loads(raw: Any, fallback: Any) -> Any:
    text = str(raw or "").strip()
    if not text:
        return fallback
    try:
        return json.loads(text)
    except Exception:
        return fallback


def _truncate_text(text: str, limit: int) -> str:
    raw = str(text or "").strip()
    if limit <= 0:
        return ""
    if len(raw) <= limit:
        return raw
    if limit <= 3:
        return raw[:limit]
    return f"{raw[: limit - 3]}..."


def _memory_payload_text(memory: Dict[str, Any]) -> str:
    key = _normalize_text(memory.get("key"), "-")
    confidence = float(memory.get("confidence") or 0.0)
    value = memory.get("value")
    if isinstance(value, str):
        value_text = _truncate_text(value, 220)
    else:
        try:
            value_text = _truncate_text(
                json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")),
                220,
            )
        except Exception:
            value_text = _truncate_text(str(value), 220)
    return f"{key}:{confidence:.2f}:{value_text}"


def _memories_db_path() -> str:
    return _normalize_text(os.getenv("BANANAFLOW_MEMORIES_DB_PATH"), "./data/memories.db")


def _ensure_ready(db_path: str) -> None:
    with _ensure_lock:
        if db_path in _ensured_paths:
            return
        ensure_memories_db(db_path)
        _ensured_paths.add(db_path)


def _row_to_memory(row: Any) -> Dict[str, Any]:
    value = _json_loads(row["value"], fallback=str(row["value"] or ""))
    provenance = _json_loads(row["provenance_json"], fallback={})
    if not isinstance(provenance, dict):
        provenance = {}
    history = _json_loads(row["value_history_json"], fallback=[])
    if not isinstance(history, list):
        history = []
    return {
        "memory_id": str(row["memory_id"]),
        "scope": str(row["scope"]),
        "tenant_id": str(row["tenant_id"]),
        "user_id": str(row["user_id"]),
        "topic": str(row["topic"]),
        "key": str(row["key"]),
        "value": value,
        "confidence": float(row["confidence"] or 0.0),
        "provenance": provenance,
        "created_at": str(row["created_at"]),
        "updated_at": str(row["updated_at"]),
        "ttl_at": row["ttl_at"],
        "is_active": bool(int(row["is_active"] or 0)),
        "last_confirmed_at": row["last_confirmed_at"] if "last_confirmed_at" in row.keys() else None,
        "update_count": _as_int(row["update_count"] if "update_count" in row.keys() else 0, 0),
        "deactivated_reason": row["deactivated_reason"] if "deactivated_reason" in row.keys() else None,
        "value_history": history,
        "value_history_json": history,
    }


def init_memories_store() -> str:
    db_path = _memories_db_path()
    _ensure_ready(db_path)
    return db_path


def set_preference(
    tenant_id: str,
    user_id: str,
    key: str,
    value: Any,
    confidence: float = 0.9,
    provenance: Optional[dict] = None,
    ttl_days: int | None = None,
) -> Dict[str, Any]:
    db_path = init_memories_store()
    normalized_tenant = _normalize_text(tenant_id, "unknown")
    normalized_user = _normalize_text(user_id)
    normalized_key = _normalize_text(key)
    if not normalized_user:
        raise ValueError("user_id is required")
    if not normalized_key:
        raise ValueError("key is required")
    if normalized_key not in ALLOWED_KEYS:
        raise ValueError(f"unsupported preference key: {normalized_key}")

    now = _now_iso()
    ttl_at = None
    if ttl_days is not None:
        days = max(1, int(ttl_days))
        ttl_at = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()
    memory_id = f"mem_{uuid.uuid4().hex}"
    conf = _as_float(confidence, default=0.9)
    provenance_payload = dict(provenance or {})
    if "source" not in provenance_payload:
        provenance_payload["source"] = "explicit_user"

    with get_conn(db_path) as conn:
        existing_row = conn.execute(
            """
            SELECT
                memory_id,
                scope,
                tenant_id,
                user_id,
                topic,
                key,
                value,
                confidence,
                provenance_json,
                created_at,
                updated_at,
                ttl_at,
                is_active,
                last_confirmed_at,
                update_count,
                deactivated_reason,
                value_history_json
            FROM memories
            WHERE scope = ? AND tenant_id = ? AND user_id = ? AND topic = ? AND key = ?
            LIMIT 1
            """,
            (
                MEMORY_SCOPE_USER,
                normalized_tenant,
                normalized_user,
                MEMORY_TOPIC_PREFERENCE,
                normalized_key,
            ),
        ).fetchone()
        existing = _row_to_memory(existing_row) if existing_row is not None else None
        consolidated, change_log = consolidate_preference(
            existing=existing,
            incoming={
                "key": normalized_key,
                "value": value,
                "confidence": conf,
                "now_iso": now,
            },
        )
        update_count = (int(existing.get("update_count") or 0) + 1) if existing is not None else 1
        consolidated_history = consolidated.get("append_history")
        if consolidated_history is None and existing_row is not None:
            value_history_json = existing_row["value_history_json"]
        elif consolidated_history is None:
            value_history_json = None
        else:
            value_history_json = _json_dumps(consolidated_history) if consolidated_history else None

        if existing_row is None:
            conn.execute(
                """
                INSERT INTO memories (
                    memory_id,
                    scope,
                    tenant_id,
                    user_id,
                    topic,
                    key,
                    value,
                    confidence,
                    provenance_json,
                    created_at,
                    updated_at,
                    ttl_at,
                    is_active,
                    last_confirmed_at,
                    update_count,
                    deactivated_reason,
                    value_history_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL, ?)
                """,
                (
                    memory_id,
                    MEMORY_SCOPE_USER,
                    normalized_tenant,
                    normalized_user,
                    MEMORY_TOPIC_PREFERENCE,
                    normalized_key,
                    _json_dumps(consolidated.get("value")),
                    _as_float(consolidated.get("confidence"), default=conf),
                    _json_dumps(provenance_payload),
                    now,
                    now,
                    ttl_at,
                    consolidated.get("last_confirmed_at"),
                    update_count,
                    value_history_json,
                ),
            )
        else:
            next_ttl_at = (ttl_at if ttl_days is not None else existing_row["ttl_at"])
            conn.execute(
                """
                UPDATE memories
                SET
                    value = ?,
                    confidence = ?,
                    provenance_json = ?,
                    updated_at = ?,
                    ttl_at = ?,
                    is_active = 1,
                    last_confirmed_at = ?,
                    update_count = ?,
                    deactivated_reason = NULL,
                    value_history_json = ?
                WHERE
                    scope = ?
                    AND tenant_id = ?
                    AND user_id = ?
                    AND topic = ?
                    AND key = ?
                """,
                (
                    _json_dumps(consolidated.get("value")),
                    _as_float(consolidated.get("confidence"), default=conf),
                    _json_dumps(provenance_payload),
                    now,
                    next_ttl_at,
                    consolidated.get("last_confirmed_at"),
                    update_count,
                    value_history_json,
                    MEMORY_SCOPE_USER,
                    normalized_tenant,
                    normalized_user,
                    MEMORY_TOPIC_PREFERENCE,
                    normalized_key,
                ),
            )
        row = conn.execute(
            """
            SELECT
                memory_id,
                scope,
                tenant_id,
                user_id,
                topic,
                key,
                value,
                confidence,
                provenance_json,
                created_at,
                updated_at,
                ttl_at,
                is_active,
                last_confirmed_at,
                update_count,
                deactivated_reason,
                value_history_json
            FROM memories
            WHERE scope = ? AND tenant_id = ? AND user_id = ? AND topic = ? AND key = ?
            LIMIT 1
            """,
            (
                MEMORY_SCOPE_USER,
                normalized_tenant,
                normalized_user,
                MEMORY_TOPIC_PREFERENCE,
                normalized_key,
            ),
        ).fetchone()
        conn.commit()
    out = _row_to_memory(row)
    sys_logger.info(
        json.dumps(
            {
                "event": "memory_preference_consolidated",
                "tenant_id": normalized_tenant,
                "user_id": normalized_user,
                "key": normalized_key,
                "old_value": (change_log or {}).get("old_value"),
                "new_value": (change_log or {}).get("new_value"),
                "reason": (change_log or {}).get("reason"),
                "update_count": out.get("update_count"),
            },
            ensure_ascii=False,
        )
    )
    sys_logger.info(
        json.dumps(
            {
                "event": "memory_preference_set",
                "tenant_id": normalized_tenant,
                "user_id": normalized_user,
                "key": normalized_key,
            },
            ensure_ascii=False,
        )
    )
    return out


def list_preferences(tenant_id: str, user_id: str) -> list[Dict[str, Any]]:
    return retrieve_preferences(
        tenant_id=tenant_id,
        user_id=user_id,
        keys=None,
        limit=200,
        max_chars=200000,
    )


def retrieve_preferences(
    tenant_id: str,
    user_id: str,
    keys: list[str] | None = None,
    limit: int = 10,
    max_chars: int = 1200,
) -> list[Dict[str, Any]]:
    db_path = init_memories_store()
    normalized_tenant = _normalize_text(tenant_id, "unknown")
    normalized_user = _normalize_text(user_id)
    if not normalized_user:
        raise ValueError("user_id is required")
    requested_limit = int(limit or 10)
    item_limit = max(1, min(requested_limit, 200))
    chars_limit = max(1, min(int(max_chars or 1200), 200000))
    now = _now_iso()

    normalized_keys = [str(item or "").strip() for item in list(keys or []) if str(item or "").strip()]
    if normalized_keys:
        expired_placeholders = ",".join(["?"] * len(normalized_keys))
        expired_sql = f"""
        SELECT COUNT(*) AS cnt
        FROM memories
        WHERE
            scope = ?
            AND tenant_id = ?
            AND user_id = ?
            AND topic = ?
            AND is_active = 1
            AND ttl_at IS NOT NULL
            AND ttl_at <= ?
            AND key IN ({expired_placeholders})
        """
        expired_params: tuple[Any, ...] = (
            MEMORY_SCOPE_USER,
            normalized_tenant,
            normalized_user,
            MEMORY_TOPIC_PREFERENCE,
            now,
            *normalized_keys,
        )
        expired_rows = query_all(db_path, expired_sql, expired_params)
    else:
        expired_rows = query_all(
            db_path,
            """
            SELECT COUNT(*) AS cnt
            FROM memories
            WHERE
                scope = ?
                AND tenant_id = ?
                AND user_id = ?
                AND topic = ?
                AND is_active = 1
                AND ttl_at IS NOT NULL
                AND ttl_at <= ?
            """,
            (
                MEMORY_SCOPE_USER,
                normalized_tenant,
                normalized_user,
                MEMORY_TOPIC_PREFERENCE,
                now,
            ),
        )
    expired_filtered_count = int((expired_rows[0]["cnt"] if expired_rows else 0) or 0)

    if normalized_keys:
        placeholders = ",".join(["?"] * len(normalized_keys))
        sql = f"""
        SELECT
            memory_id,
            scope,
            tenant_id,
            user_id,
            topic,
            key,
            value,
            confidence,
            provenance_json,
            created_at,
            updated_at,
            ttl_at,
            is_active,
            last_confirmed_at,
            update_count,
            deactivated_reason,
            value_history_json
        FROM memories
        WHERE
            scope = ?
            AND tenant_id = ?
            AND user_id = ?
            AND topic = ?
            AND is_active = 1
            AND (ttl_at IS NULL OR ttl_at > ?)
            AND key IN ({placeholders})
        ORDER BY confidence DESC, created_at ASC, key ASC
        LIMIT ?
        """
        params: list[Any] = [
            MEMORY_SCOPE_USER,
            normalized_tenant,
            normalized_user,
            MEMORY_TOPIC_PREFERENCE,
            now,
            *normalized_keys,
            item_limit,
        ]
        rows = query_all(db_path, sql, tuple(params))
    else:
        rows = query_all(
            db_path,
            """
            SELECT
                memory_id,
                scope,
                tenant_id,
                user_id,
                topic,
                key,
                value,
                confidence,
                provenance_json,
                created_at,
                updated_at,
                ttl_at,
                is_active,
                last_confirmed_at,
                update_count,
                deactivated_reason,
                value_history_json
            FROM memories
            WHERE
                scope = ?
                AND tenant_id = ?
                AND user_id = ?
                AND topic = ?
                AND is_active = 1
                AND (ttl_at IS NULL OR ttl_at > ?)
            ORDER BY confidence DESC, created_at ASC, key ASC
            LIMIT ?
            """,
            (
                MEMORY_SCOPE_USER,
                normalized_tenant,
                normalized_user,
                MEMORY_TOPIC_PREFERENCE,
                now,
                item_limit,
            ),
        )
    raw_items = [_row_to_memory(row) for row in rows]
    before_count = len(raw_items)
    before_chars = sum(len(_memory_payload_text(item)) for item in raw_items)
    selected = list(raw_items[:item_limit])
    current_chars = before_chars if len(selected) == before_count else sum(len(_memory_payload_text(item)) for item in selected)
    dropped = max(0, before_count - len(selected))
    while selected and current_chars > chars_limit:
        removed = selected.pop()
        current_chars -= len(_memory_payload_text(removed))
        dropped += 1
    truncated = bool(dropped > 0 or before_chars > current_chars or before_count > len(selected))
    update_count_sum = sum(int(item.get("update_count") or 0) for item in list(selected or []))
    sys_logger.info(
        json.dumps(
            {
                "event": "memory_preferences_retrieved",
                "tenant_id": normalized_tenant,
                "user_id": normalized_user,
                "keys": normalized_keys,
                "limit": item_limit,
                "max_chars": chars_limit,
                "items_returned": len(selected),
                "items_before_truncation": before_count,
                "chars_before": before_chars,
                "chars_after": max(0, current_chars),
                "truncated": truncated,
                "expired_filtered_count": expired_filtered_count,
                "update_count_sum": update_count_sum,
            },
            ensure_ascii=False,
        )
    )
    return PreferenceList(
        selected,
        retrieval_meta={
            "limit": item_limit,
            "max_chars": chars_limit,
            "items_before_truncation": before_count,
            "items_after_truncation": len(selected),
            "chars_before": before_chars,
            "chars_after": max(0, current_chars),
            "truncated": truncated,
            "expired_filtered_count": expired_filtered_count,
            "update_count_sum": update_count_sum,
        },
    )


def deactivate_preference(
    tenant_id: str,
    user_id: str,
    key: str,
    reason: str = "manual_deactivate",
) -> None:
    db_path = init_memories_store()
    normalized_tenant = _normalize_text(tenant_id, "unknown")
    normalized_user = _normalize_text(user_id)
    normalized_key = _normalize_text(key)
    if not normalized_user:
        raise ValueError("user_id is required")
    if not normalized_key:
        raise ValueError("key is required")

    now = _now_iso()
    with get_conn(db_path) as conn:
        conn.execute(
            """
            UPDATE memories
            SET is_active = 0, updated_at = ?, deactivated_reason = ?
            WHERE
                scope = ?
                AND tenant_id = ?
                AND user_id = ?
                AND topic = ?
                AND key = ?
            """,
            (
                now,
                _normalize_text(reason, "manual_deactivate"),
                MEMORY_SCOPE_USER,
                normalized_tenant,
                normalized_user,
                MEMORY_TOPIC_PREFERENCE,
                normalized_key,
            ),
        )
        conn.commit()
    sys_logger.info(
        json.dumps(
            {
                "event": "memory_preference_deactivated",
                "tenant_id": normalized_tenant,
                "user_id": normalized_user,
                "key": normalized_key,
                "reason": _normalize_text(reason, "manual_deactivate"),
            },
            ensure_ascii=False,
        )
    )


def expire_preferences(
    now_iso: Optional[str] = None,
    tenant_id: Optional[str] = None,
    user_id: Optional[str] = None,
) -> int:
    db_path = init_memories_store()
    now = _normalize_text(now_iso) or _now_iso()
    normalized_tenant = _normalize_text(tenant_id)
    normalized_user = _normalize_text(user_id)
    where_parts = [
        "scope = ?",
        "topic = ?",
        "is_active = 1",
        "ttl_at IS NOT NULL",
        "ttl_at < ?",
    ]
    params: list[Any] = [MEMORY_SCOPE_USER, MEMORY_TOPIC_PREFERENCE, now]
    if normalized_tenant:
        where_parts.append("tenant_id = ?")
        params.append(normalized_tenant)
    if normalized_user:
        where_parts.append("user_id = ?")
        params.append(normalized_user)
    sql = f"""
    UPDATE memories
    SET
        is_active = 0,
        updated_at = ?,
        deactivated_reason = 'ttl_expired'
    WHERE {' AND '.join(where_parts)}
    """
    full_params = [now, *params]
    with get_conn(db_path) as conn:
        cur = conn.execute(sql, tuple(full_params))
        conn.commit()
        expired_count = int(cur.rowcount or 0)
    sys_logger.info(
        json.dumps(
            {
                "event": "memory_preferences_expired",
                "tenant_id": (normalized_tenant or None),
                "user_id": (normalized_user or None),
                "expired_count": expired_count,
            },
            ensure_ascii=False,
        )
    )
    return expired_count


def get_preference_stats(tenant_id: str, user_id: str) -> Dict[str, int]:
    db_path = init_memories_store()
    normalized_tenant = _normalize_text(tenant_id, "unknown")
    normalized_user = _normalize_text(user_id)
    if not normalized_user:
        raise ValueError("user_id is required")
    now = _now_iso()
    rows = query_all(
        db_path,
        """
        SELECT
            SUM(CASE WHEN is_active = 1 AND (ttl_at IS NULL OR ttl_at > ?) THEN 1 ELSE 0 END) AS active_count,
            SUM(CASE WHEN ttl_at IS NOT NULL AND ttl_at <= ? THEN 1 ELSE 0 END) AS expired_count,
            SUM(CASE WHEN update_count IS NOT NULL THEN update_count ELSE 0 END) AS update_count_sum
        FROM memories
        WHERE
            scope = ?
            AND tenant_id = ?
            AND user_id = ?
            AND topic = ?
        """,
        (
            now,
            now,
            MEMORY_SCOPE_USER,
            normalized_tenant,
            normalized_user,
            MEMORY_TOPIC_PREFERENCE,
        ),
    )
    row = rows[0] if rows else None
    return {
        "active_count": int((row["active_count"] if row is not None else 0) or 0),
        "expired_count": int((row["expired_count"] if row is not None else 0) or 0),
        "update_count_sum": int((row["update_count_sum"] if row is not None else 0) or 0),
    }
