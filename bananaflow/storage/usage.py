import os
import sqlite3
import threading
from typing import Optional

BASE_DIR = os.getcwd()
AUTH_DB_PATH = os.getenv("AUTH_DB_PATH", os.path.join(BASE_DIR, "auth.db"))

db_lock = threading.Lock()
_db_conn = sqlite3.connect(AUTH_DB_PATH, check_same_thread=False)
_db_conn.row_factory = sqlite3.Row


def init_usage_db():
    with db_lock:
        cur = _db_conn.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS usage_stats (
                user_id INTEGER NOT NULL,
                model TEXT NOT NULL,
                count INTEGER NOT NULL DEFAULT 0,
                last_used_at TEXT DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, model)
            )
            """
        )
        _db_conn.commit()


def record_usage(user_id: int, model: Optional[str]):
    if not user_id or not model:
        return
    with db_lock:
        cur = _db_conn.cursor()
        cur.execute(
            """
            INSERT INTO usage_stats (user_id, model, count, last_used_at)
            VALUES (?, ?, 1, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id, model)
            DO UPDATE SET count = count + 1, last_used_at = CURRENT_TIMESTAMP
            """,
            (user_id, model),
        )
        _db_conn.commit()
