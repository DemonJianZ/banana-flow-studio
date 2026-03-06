from __future__ import annotations

import hashlib
import json
import os
import threading
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

try:
    from ..core.logging import sys_logger
except Exception:  # pragma: no cover - 兼容 python bananaflow/main.py 直跑
    from core.logging import sys_logger

try:
    from ..storage.sessions_migrations import ensure_sessions_db
    from ..storage.sessions_sqlite import get_conn, query_all
    from .summarizer import SUMMARY_VERSION, build_session_summary
except Exception:  # pragma: no cover - 兼容 python bananaflow/main.py 直跑
    from storage.sessions_migrations import ensure_sessions_db
    from storage.sessions_sqlite import get_conn, query_all
    from sessions.summarizer import SUMMARY_VERSION, build_session_summary


class SessionNotFoundError(RuntimeError):
    pass


class SessionAccessDeniedError(RuntimeError):
    pass


_ensure_lock = threading.Lock()
_ensured_paths: set[str] = set()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _json_dumps(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def _normalize_text(value: Any, default: str = "") -> str:
    text = str(value or "").strip()
    return text if text else default


def _normalize_session_id(session_id: Optional[str]) -> str:
    text = _normalize_text(session_id)
    if not text:
        return f"session_{uuid.uuid4().hex}"
    return text[:128]


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


def _sessions_db_path() -> str:
    return _normalize_text(os.getenv("BANANAFLOW_SESSIONS_DB_PATH"), "./data/sessions.db")


def _ensure_ready(db_path: str) -> None:
    with _ensure_lock:
        if db_path in _ensured_paths:
            return
        ensure_sessions_db(db_path)
        _ensured_paths.add(db_path)


def _row_to_session(row: Any) -> Dict[str, Any]:
    if row is None:
        return {}
    state_json = str(row["state_json"] or "{}")
    try:
        state = json.loads(state_json)
        if not isinstance(state, dict):
            state = {}
    except Exception:
        state = {}
    return {
        "session_id": str(row["session_id"]),
        "tenant_id": str(row["tenant_id"]),
        "user_id": str(row["user_id"]),
        "created_at": str(row["created_at"]),
        "updated_at": str(row["updated_at"]),
        "ttl_at": row["ttl_at"],
        "state": state,
        "summary_text": row["summary_text"],
        "summary_updated_at": row["summary_updated_at"] if "summary_updated_at" in row.keys() else None,
        "summary_version": row["summary_version"] if "summary_version" in row.keys() else None,
        "summary_event_id_upto": row["summary_event_id_upto"] if "summary_event_id_upto" in row.keys() else None,
    }


def _row_to_event(row: Any) -> Dict[str, Any]:
    payload_json = str(row["payload_json"] or "{}")
    try:
        payload = json.loads(payload_json)
    except Exception:
        payload = {}
    if not isinstance(payload, dict):
        payload = {"value": payload}
    return {
        "event_id": int(row["event_id"]),
        "session_id": str(row["session_id"]),
        "ts": str(row["ts"]),
        "type": str(row["type"]),
        "payload": payload,
        "token_estimate": row["token_estimate"],
        "idempotency_key": row["idempotency_key"],
        "hash": str(row["hash"]),
    }


def _load_session_row(conn: Any, session_id: str) -> Any:
    return conn.execute(
        """
        SELECT
            session_id,
            tenant_id,
            user_id,
            created_at,
            updated_at,
            ttl_at,
            state_json,
            summary_text,
            summary_updated_at,
            summary_version,
            summary_event_id_upto
        FROM sessions
        WHERE session_id = ?
        """,
        (session_id,),
    ).fetchone()


def _assert_session_owner(conn: Any, tenant_id: str, user_id: str, session_id: str) -> Any:
    row = _load_session_row(conn, session_id)
    if row is None:
        raise SessionNotFoundError(f"session not found: {session_id}")
    if str(row["tenant_id"]) != tenant_id or str(row["user_id"]) != user_id:
        raise SessionAccessDeniedError(f"session access denied: {session_id}")
    return row


def init_sessions_store() -> str:
    db_path = _sessions_db_path()
    _ensure_ready(db_path)
    return db_path


def create_or_get_session(tenant_id: str, user_id: str, session_id: Optional[str] = None) -> Dict[str, Any]:
    db_path = init_sessions_store()
    normalized_tenant = _normalize_text(tenant_id, "unknown")
    normalized_user = _normalize_text(user_id)
    if not normalized_user:
        raise ValueError("user_id is required")
    normalized_session_id = _normalize_session_id(session_id)
    now = _now_iso()

    with get_conn(db_path) as conn:
        row = _load_session_row(conn, normalized_session_id)
        if row is not None:
            if str(row["tenant_id"]) != normalized_tenant or str(row["user_id"]) != normalized_user:
                raise SessionAccessDeniedError(f"session access denied: {normalized_session_id}")
            existing = _row_to_session(row)
            existing["is_new"] = False
            return existing

        conn.execute(
            """
            INSERT INTO sessions (
                session_id, tenant_id, user_id, created_at, updated_at, ttl_at, state_json, summary_text
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (normalized_session_id, normalized_tenant, normalized_user, now, now, None, "{}", None),
        )
        conn.commit()
        created = _load_session_row(conn, normalized_session_id)
        out = _row_to_session(created)
        out["is_new"] = True
        return out


def append_event(
    tenant_id: str,
    user_id: str,
    session_id: str,
    type: str,
    payload: Dict[str, Any],
    idempotency_key: Optional[str] = None,
) -> int:
    db_path = init_sessions_store()
    normalized_tenant = _normalize_text(tenant_id, "unknown")
    normalized_user = _normalize_text(user_id)
    normalized_session_id = _normalize_session_id(session_id)
    normalized_type = _normalize_text(type)
    if not normalized_type:
        raise ValueError("event type is required")
    payload_json = _json_dumps(payload or {})
    now = _now_iso()
    idem_key = _normalize_text(idempotency_key) or None
    hash_basis = idem_key or now
    hash_value = hashlib.sha256(
        f"{normalized_session_id}|{normalized_type}|{payload_json}|{hash_basis}".encode("utf-8")
    ).hexdigest()
    token_estimate = None
    try:
        raw_token_estimate = (payload or {}).get("token_estimate")
        if raw_token_estimate is not None:
            token_estimate = int(raw_token_estimate)
    except Exception:
        token_estimate = None

    should_auto_summarize = False
    event_id = 0
    with get_conn(db_path) as conn:
        _assert_session_owner(conn, normalized_tenant, normalized_user, normalized_session_id)

        if idem_key:
            existing = conn.execute(
                """
                SELECT event_id
                FROM session_events
                WHERE session_id = ? AND idempotency_key = ?
                ORDER BY event_id ASC
                LIMIT 1
                """,
                (normalized_session_id, idem_key),
            ).fetchone()
            if existing is not None:
                return int(existing["event_id"])

        cur = conn.execute(
            """
            INSERT INTO session_events (
                session_id, ts, type, payload_json, token_estimate, idempotency_key, hash
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                normalized_session_id,
                now,
                normalized_type,
                payload_json,
                token_estimate,
                idem_key,
                hash_value,
            ),
        )
        conn.execute(
            "UPDATE sessions SET updated_at = ? WHERE session_id = ?",
            (now, normalized_session_id),
        )
        event_id = int(cur.lastrowid or 0)
        auto_summary_enabled = _as_bool(os.getenv("BANANAFLOW_SESSION_AUTO_SUMMARY"), default=False)
        if auto_summary_enabled:
            row = conn.execute(
                """
                SELECT summary_event_id_upto
                FROM sessions
                WHERE session_id = ?
                """,
                (normalized_session_id,),
            ).fetchone()
            last_summary_upto = int(row["summary_event_id_upto"] or 0) if row is not None and row["summary_event_id_upto"] is not None else 0
            count_row = conn.execute(
                "SELECT COUNT(*) AS cnt FROM session_events WHERE session_id = ?",
                (normalized_session_id,),
            ).fetchone()
            total_events = int(count_row["cnt"] or 0) if count_row is not None else 0
            unsum_row = conn.execute(
                """
                SELECT COUNT(*) AS cnt
                FROM session_events
                WHERE session_id = ? AND event_id > ?
                """,
                (normalized_session_id, last_summary_upto),
            ).fetchone()
            unsummarized = int(unsum_row["cnt"] or 0) if unsum_row is not None else 0
            threshold_total = max(1, _as_int(os.getenv("BANANAFLOW_SESSION_AUTO_SUMMARY_EVENT_THRESHOLD"), 50))
            threshold_delta = max(1, _as_int(os.getenv("BANANAFLOW_SESSION_AUTO_SUMMARY_DELTA_THRESHOLD"), 30))
            if total_events >= threshold_total or unsummarized >= threshold_delta:
                should_auto_summarize = True
        conn.commit()
    if should_auto_summarize:
        try:
            summarize_session(
                tenant_id=normalized_tenant,
                user_id=normalized_user,
                session_id=normalized_session_id,
            )
        except Exception as e:
            sys_logger.warning(
                f"session auto summary skipped: session_id={normalized_session_id} err={e}"
            )
    return int(event_id)


def get_session(
    tenant_id: str,
    user_id: str,
    session_id: str,
    include_events: bool = True,
    limit_events: int = 200,
) -> Dict[str, Any]:
    db_path = init_sessions_store()
    normalized_tenant = _normalize_text(tenant_id, "unknown")
    normalized_user = _normalize_text(user_id)
    normalized_session_id = _normalize_session_id(session_id)
    event_limit = max(1, min(int(limit_events or 200), 2000))

    with get_conn(db_path) as conn:
        row = _assert_session_owner(conn, normalized_tenant, normalized_user, normalized_session_id)
        session_data = _row_to_session(row)
        events: list[Dict[str, Any]] = []
        if include_events:
            rows = conn.execute(
                """
                SELECT event_id, session_id, ts, type, payload_json, token_estimate, idempotency_key, hash
                FROM (
                    SELECT event_id, session_id, ts, type, payload_json, token_estimate, idempotency_key, hash
                    FROM session_events
                    WHERE session_id = ?
                    ORDER BY event_id DESC
                    LIMIT ?
                ) t
                ORDER BY event_id ASC
                """,
                (normalized_session_id, event_limit),
            ).fetchall()
            events = [_row_to_event(item) for item in list(rows or [])]
        return {"session": session_data, "events": events}


def list_sessions(tenant_id: str, user_id: str, limit: int = 50) -> list[Dict[str, Any]]:
    db_path = init_sessions_store()
    normalized_tenant = _normalize_text(tenant_id, "unknown")
    normalized_user = _normalize_text(user_id)
    item_limit = max(1, min(int(limit or 50), 200))
    rows = query_all(
        db_path,
        """
        SELECT
            session_id,
            tenant_id,
            user_id,
            created_at,
            updated_at,
            ttl_at,
            state_json,
            summary_text,
            summary_updated_at,
            summary_version,
            summary_event_id_upto
        FROM sessions
        WHERE tenant_id = ? AND user_id = ?
        ORDER BY updated_at DESC, session_id DESC
        LIMIT ?
        """,
        (normalized_tenant, normalized_user, item_limit),
    )
    return [_row_to_session(row) for row in rows]


def summarize_session(
    tenant_id: str,
    user_id: str,
    session_id: str,
    upto_event_id: int | None = None,
    max_events: int = 400,
    max_chars: int = 2000,
) -> Dict[str, Any]:
    db_path = init_sessions_store()
    normalized_tenant = _normalize_text(tenant_id, "unknown")
    normalized_user = _normalize_text(user_id)
    normalized_session_id = _normalize_session_id(session_id)
    events_limit = max(1, min(int(max_events or 400), 2000))
    chars_limit = max(200, min(int(max_chars or 2000), 8000))

    with get_conn(db_path) as conn:
        row = _assert_session_owner(conn, normalized_tenant, normalized_user, normalized_session_id)
        previous_summary = _normalize_text(row["summary_text"]) or None
        prev_upto = int(row["summary_event_id_upto"] or 0) if row["summary_event_id_upto"] is not None else 0

        max_row = conn.execute(
            """
            SELECT MAX(event_id) AS max_event_id
            FROM session_events
            WHERE session_id = ?
            """,
            (normalized_session_id,),
        ).fetchone()
        latest_event_id = int(max_row["max_event_id"] or 0) if max_row is not None else 0
        if latest_event_id <= 0:
            return {
                "session_id": normalized_session_id,
                "summary_text": previous_summary or "",
                "summary_updated_at": row["summary_updated_at"],
                "summary_event_id_upto": row["summary_event_id_upto"],
                "summary_version": row["summary_version"],
            }

        if upto_event_id is None:
            target_upto = latest_event_id
        else:
            target_upto = min(latest_event_id, max(prev_upto, int(upto_event_id)))

        if prev_upto > 0:
            if target_upto <= prev_upto and previous_summary is not None:
                return {
                    "session_id": normalized_session_id,
                    "summary_text": previous_summary,
                    "summary_updated_at": row["summary_updated_at"],
                    "summary_event_id_upto": prev_upto,
                    "summary_version": row["summary_version"],
                }
            event_rows = conn.execute(
                """
                SELECT event_id, session_id, ts, type, payload_json, token_estimate, idempotency_key, hash
                FROM (
                    SELECT event_id, session_id, ts, type, payload_json, token_estimate, idempotency_key, hash
                    FROM session_events
                    WHERE session_id = ? AND event_id > ? AND event_id <= ?
                    ORDER BY event_id DESC
                    LIMIT ?
                ) t
                ORDER BY event_id ASC
                """,
                (normalized_session_id, prev_upto, target_upto, events_limit),
            ).fetchall()
        else:
            event_rows = conn.execute(
                """
                SELECT event_id, session_id, ts, type, payload_json, token_estimate, idempotency_key, hash
                FROM (
                    SELECT event_id, session_id, ts, type, payload_json, token_estimate, idempotency_key, hash
                    FROM session_events
                    WHERE session_id = ? AND event_id <= ?
                    ORDER BY event_id DESC
                    LIMIT ?
                ) t
                ORDER BY event_id ASC
                """,
                (normalized_session_id, target_upto, events_limit),
            ).fetchall()

        events = [_row_to_event(item) for item in list(event_rows or [])]

        state_json = str(row["state_json"] or "{}")
        try:
            state = json.loads(state_json)
            if isinstance(state, dict) and state:
                events.append({"type": "SESSION_STATE", "payload": state})
        except Exception:
            pass

        next_summary = build_session_summary(
            events=events,
            prev_summary=previous_summary if prev_upto > 0 else None,
            max_chars=chars_limit,
        )
        summary_updated_at = _now_iso()
        conn.execute(
            """
            UPDATE sessions
            SET
                summary_text = ?,
                summary_updated_at = ?,
                summary_version = ?,
                summary_event_id_upto = ?,
                updated_at = ?
            WHERE session_id = ?
            """,
            (
                next_summary,
                summary_updated_at,
                SUMMARY_VERSION,
                int(target_upto),
                summary_updated_at,
                normalized_session_id,
            ),
        )
        conn.commit()

    sys_logger.info(
        f"session summary updated: session_id={normalized_session_id} event_upto={int(target_upto)} chars={len(next_summary)}"
    )
    return {
        "session_id": normalized_session_id,
        "summary_text": next_summary,
        "summary_updated_at": summary_updated_at,
        "summary_event_id_upto": int(target_upto),
        "summary_version": SUMMARY_VERSION,
    }


def update_state(tenant_id: str, user_id: str, session_id: str, patch: dict) -> Dict[str, Any]:
    db_path = init_sessions_store()
    normalized_tenant = _normalize_text(tenant_id, "unknown")
    normalized_user = _normalize_text(user_id)
    normalized_session_id = _normalize_session_id(session_id)
    merged_patch = dict(patch or {})
    now = _now_iso()

    with get_conn(db_path) as conn:
        row = _assert_session_owner(conn, normalized_tenant, normalized_user, normalized_session_id)
        base_state_json = str(row["state_json"] or "{}")
        try:
            state = json.loads(base_state_json)
            if not isinstance(state, dict):
                state = {}
        except Exception:
            state = {}
        state.update(merged_patch)

        conn.execute(
            """
            UPDATE sessions
            SET state_json = ?, updated_at = ?
            WHERE session_id = ?
            """,
            (_json_dumps(state), now, normalized_session_id),
        )
        conn.commit()
        return dict(state)
