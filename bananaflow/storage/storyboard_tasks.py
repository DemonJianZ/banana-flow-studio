"""
Persistent task store for async storyboard generation jobs.
Uses SQLite (same pattern as ai_chat_tasks.py).
"""
from __future__ import annotations

import json
import os
import threading
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from .sqlite import execute, query_one


_ensure_lock = threading.Lock()
_ensured_paths: set[str] = set()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _json_dumps(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"))


def _json_loads(text: Any, fallback: Any) -> Any:
    raw = str(text or "").strip()
    if not raw:
        return fallback
    try:
        return json.loads(raw)
    except Exception:
        return fallback


def _db_path() -> str:
    data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "..", "data")
    os.makedirs(data_dir, exist_ok=True)
    return os.path.normpath(os.path.join(data_dir, "storyboard_tasks.db"))


def _ensure_db(db_path: str) -> None:
    with _ensure_lock:
        if db_path in _ensured_paths:
            return
        execute(
            db_path,
            """
            CREATE TABLE IF NOT EXISTS storyboard_tasks (
                task_id    TEXT PRIMARY KEY,
                thread_id  TEXT NOT NULL DEFAULT '',
                status     TEXT NOT NULL DEFAULT 'pending',
                patch_json TEXT NOT NULL DEFAULT '[]',
                summary    TEXT NOT NULL DEFAULT '',
                error_msg  TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """,
        )
        execute(
            db_path,
            "CREATE INDEX IF NOT EXISTS idx_sb_tasks_thread ON storyboard_tasks(thread_id)",
        )
        execute(
            db_path,
            "CREATE INDEX IF NOT EXISTS idx_sb_tasks_status ON storyboard_tasks(status, updated_at)",
        )
        _ensured_paths.add(db_path)


def _ready_path() -> str:
    p = _db_path()
    _ensure_db(p)
    return p


def _row_to_task(row: Any) -> Dict[str, Any]:
    if row is None:
        return {}
    return {
        "task_id": row["task_id"],
        "thread_id": row["thread_id"],
        "status": row["status"],
        "patch": _json_loads(row["patch_json"], []),
        "summary": row["summary"],
        "error_msg": row["error_msg"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def create_storyboard_task(thread_id: str = "") -> str:
    """Create a new pending task and return its task_id."""
    import uuid
    task_id = str(uuid.uuid4())
    now = _now_iso()
    db_path = _ready_path()
    execute(
        db_path,
        """
        INSERT INTO storyboard_tasks
            (task_id, thread_id, status, patch_json, summary, error_msg, created_at, updated_at)
        VALUES (?, ?, 'pending', '[]', '', '', ?, ?)
        """,
        (task_id, thread_id or "", now, now),
    )
    return task_id


def get_storyboard_task(task_id: str) -> Optional[Dict[str, Any]]:
    db_path = _ready_path()
    row = query_one(db_path, "SELECT * FROM storyboard_tasks WHERE task_id = ?", (task_id,))
    if row is None:
        return None
    return _row_to_task(row)


def update_storyboard_task(task_id: str, **fields: Any) -> Optional[Dict[str, Any]]:
    """
    Update task fields. Recognised keyword args:
        status, patch (list), summary, error_msg
    """
    if not fields:
        return get_storyboard_task(task_id)

    db_path = _ready_path()
    assignments: List[str] = ["updated_at = ?"]
    params: List[Any] = [_now_iso()]

    if "status" in fields:
        assignments.append("status = ?")
        params.append(str(fields["status"]))
    if "patch" in fields:
        assignments.append("patch_json = ?")
        params.append(_json_dumps(fields["patch"]))
    if "summary" in fields:
        assignments.append("summary = ?")
        params.append(str(fields["summary"] or ""))
    if "error_msg" in fields:
        assignments.append("error_msg = ?")
        params.append(str(fields["error_msg"] or ""))

    params.append(task_id)
    execute(
        db_path,
        f"UPDATE storyboard_tasks SET {', '.join(assignments)} WHERE task_id = ?",
        tuple(params),
    )
    return get_storyboard_task(task_id)


def init_storyboard_tasks_store() -> str:
    """Initialise DB and return path. Call at app startup."""
    return _ready_path()
