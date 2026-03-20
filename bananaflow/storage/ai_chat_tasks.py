from __future__ import annotations

import json
import os
import threading
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from .sqlite import execute, get_conn, query_all, query_one


AI_CHAT_TASKS_SCHEMA_VERSION_KEY = "ai_chat_tasks_schema"
AI_CHAT_TASKS_SCHEMA_VERSION_VALUE = "v1"

_ensure_lock = threading.Lock()
_ensured_paths: set[str] = set()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _json_dumps(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def _json_loads(text: Any, fallback: Any) -> Any:
    raw = str(text or "").strip()
    if not raw:
        return fallback
    try:
        value = json.loads(raw)
    except Exception:
        return fallback
    return value


def ensure_ai_chat_tasks_db(db_path: str) -> None:
    execute(
        db_path,
        """
        CREATE TABLE IF NOT EXISTS schema_version (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
        """,
    )
    execute(
        db_path,
        """
        CREATE TABLE IF NOT EXISTS ai_chat_tasks (
            task_id TEXT PRIMARY KEY,
            req_id TEXT NOT NULL,
            status TEXT NOT NULL,
            retry_count INTEGER NOT NULL DEFAULT 0,
            progress_message TEXT NOT NULL DEFAULT '',
            endpoint TEXT NOT NULL DEFAULT '',
            ai_chat_model_id TEXT NOT NULL DEFAULT '',
            image_count INTEGER NOT NULL DEFAULT 0,
            request_form_json TEXT NOT NULL DEFAULT '{}',
            request_files_json TEXT NOT NULL DEFAULT '[]',
            result_json TEXT,
            error TEXT,
            raw_response_text TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            started_at TEXT,
            finished_at TEXT,
            last_duration_ms INTEGER
        )
        """,
    )
    execute(
        db_path,
        "CREATE INDEX IF NOT EXISTS idx_ai_chat_tasks_status_updated_at ON ai_chat_tasks(status, updated_at)",
    )
    execute(
        db_path,
        """
        INSERT INTO schema_version(key, value)
        VALUES(?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
        """,
        (AI_CHAT_TASKS_SCHEMA_VERSION_KEY, AI_CHAT_TASKS_SCHEMA_VERSION_VALUE),
    )


def _ensure_ready(db_path: str) -> str:
    normalized = os.path.abspath((db_path or "").strip())
    if not normalized:
        raise ValueError("db_path is required")
    with _ensure_lock:
        if normalized not in _ensured_paths:
            ensure_ai_chat_tasks_db(normalized)
            _ensured_paths.add(normalized)
    return normalized


def _row_to_task(row: Any) -> Dict[str, Any]:
    if row is None:
        return {}
    return {
        "task_id": str(row["task_id"]),
        "req_id": str(row["req_id"]),
        "status": str(row["status"]),
        "retry_count": int(row["retry_count"] or 0),
        "progress_message": str(row["progress_message"] or ""),
        "endpoint": str(row["endpoint"] or ""),
        "ai_chat_model_id": str(row["ai_chat_model_id"] or ""),
        "image_count": int(row["image_count"] or 0),
        "request_form_json": _json_loads(row["request_form_json"], {}),
        "request_files_json": _json_loads(row["request_files_json"], []),
        "result_json": _json_loads(row["result_json"], None),
        "error": str(row["error"] or ""),
        "raw_response_text": str(row["raw_response_text"] or ""),
        "created_at": str(row["created_at"] or ""),
        "updated_at": str(row["updated_at"] or ""),
        "started_at": str(row["started_at"] or ""),
        "finished_at": str(row["finished_at"] or ""),
        "last_duration_ms": int(row["last_duration_ms"] or 0),
    }


def init_ai_chat_tasks_store(db_path: str) -> str:
    return _ensure_ready(db_path)


def create_ai_chat_task(
    db_path: str,
    *,
    task_id: str,
    req_id: str,
    status: str,
    progress_message: str,
    endpoint: str,
    ai_chat_model_id: str,
    image_count: int,
    request_form: Dict[str, Any],
    request_files: list[Dict[str, Any]],
) -> Dict[str, Any]:
    ready_path = _ensure_ready(db_path)
    now = _now_iso()
    with get_conn(ready_path) as conn:
        conn.execute(
            """
            INSERT INTO ai_chat_tasks (
                task_id, req_id, status, retry_count, progress_message, endpoint, ai_chat_model_id,
                image_count, request_form_json, request_files_json, result_json, error, raw_response_text,
                created_at, updated_at, started_at, finished_at, last_duration_ms
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                task_id,
                req_id,
                status,
                0,
                progress_message,
                endpoint,
                ai_chat_model_id,
                int(image_count or 0),
                _json_dumps(request_form),
                _json_dumps(request_files),
                None,
                "",
                "",
                now,
                now,
                None,
                None,
                None,
            ),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM ai_chat_tasks WHERE task_id = ?", (task_id,)).fetchone()
    return _row_to_task(row)


def get_ai_chat_task(db_path: str, task_id: str) -> Optional[Dict[str, Any]]:
    ready_path = _ensure_ready(db_path)
    row = query_one(ready_path, "SELECT * FROM ai_chat_tasks WHERE task_id = ?", (task_id,))
    return _row_to_task(row) if row is not None else None


def update_ai_chat_task(db_path: str, task_id: str, **fields: Any) -> Optional[Dict[str, Any]]:
    ready_path = _ensure_ready(db_path)
    if not fields:
        return get_ai_chat_task(ready_path, task_id)

    mapping = {
        "status": "status",
        "retry_count": "retry_count",
        "progress_message": "progress_message",
        "endpoint": "endpoint",
        "ai_chat_model_id": "ai_chat_model_id",
        "image_count": "image_count",
        "request_form": "request_form_json",
        "request_files": "request_files_json",
        "result": "result_json",
        "error": "error",
        "raw_response_text": "raw_response_text",
        "started_at": "started_at",
        "finished_at": "finished_at",
        "last_duration_ms": "last_duration_ms",
    }

    assignments = []
    params = []
    for key, value in fields.items():
        column = mapping.get(key)
        if not column:
            continue
        if key in {"request_form", "request_files", "result"}:
            value = _json_dumps(value) if value is not None else None
        assignments.append(f"{column} = ?")
        params.append(value)

    if not assignments:
        return get_ai_chat_task(ready_path, task_id)

    assignments.append("updated_at = ?")
    params.append(_now_iso())
    params.append(task_id)
    execute(
        ready_path,
        f"UPDATE ai_chat_tasks SET {', '.join(assignments)} WHERE task_id = ?",
        tuple(params),
    )
    return get_ai_chat_task(ready_path, task_id)


def mark_stale_ai_chat_tasks(
    db_path: str,
    *,
    from_statuses: list[str],
    to_status: str,
    error: str,
) -> int:
    ready_path = _ensure_ready(db_path)
    if not from_statuses:
        return 0
    placeholders = ", ".join("?" for _ in from_statuses)
    params = [to_status, error, _now_iso(), *from_statuses]
    return execute(
        ready_path,
        f"""
        UPDATE ai_chat_tasks
        SET status = ?, error = ?, updated_at = ?
        WHERE status IN ({placeholders})
        """,
        params,
    )


def list_ai_chat_tasks_by_status(db_path: str, statuses: list[str]) -> list[Dict[str, Any]]:
    ready_path = _ensure_ready(db_path)
    if not statuses:
        return []
    placeholders = ", ".join("?" for _ in statuses)
    rows = query_all(
        ready_path,
        f"SELECT * FROM ai_chat_tasks WHERE status IN ({placeholders}) ORDER BY updated_at DESC",
        tuple(statuses),
    )
    return [_row_to_task(row) for row in rows]
