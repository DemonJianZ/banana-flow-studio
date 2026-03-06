from __future__ import annotations

from .sessions_sqlite import execute, query_all


SESSIONS_SCHEMA_VERSION_KEY = "sessions_schema"
SESSIONS_SCHEMA_VERSION_VALUE = "v2"


def ensure_sessions_db(db_path: str) -> None:
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
        CREATE TABLE IF NOT EXISTS sessions (
            session_id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            ttl_at TEXT,
            state_json TEXT NOT NULL DEFAULT '{}',
            summary_text TEXT,
            summary_updated_at TEXT,
            summary_version TEXT,
            summary_event_id_upto INTEGER
        )
        """,
    )
    execute(
        db_path,
        """
        CREATE TABLE IF NOT EXISTS session_events (
            event_id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            ts TEXT NOT NULL,
            type TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            token_estimate INTEGER,
            idempotency_key TEXT,
            hash TEXT NOT NULL,
            FOREIGN KEY(session_id) REFERENCES sessions(session_id)
        )
        """,
    )
    execute(
        db_path,
        """
        CREATE INDEX IF NOT EXISTS idx_events_session_id_event_id
        ON session_events(session_id, event_id)
        """,
    )
    execute(
        db_path,
        """
        CREATE INDEX IF NOT EXISTS idx_sessions_tenant_user
        ON sessions(tenant_id, user_id, updated_at)
        """,
    )
    # v2 migration: add summary metadata columns for existing databases
    info = query_all(db_path, "PRAGMA table_info(sessions)")
    existing_cols = {str(row["name"]) for row in info}
    if "summary_updated_at" not in existing_cols:
        execute(db_path, "ALTER TABLE sessions ADD COLUMN summary_updated_at TEXT")
    if "summary_version" not in existing_cols:
        execute(db_path, "ALTER TABLE sessions ADD COLUMN summary_version TEXT")
    if "summary_event_id_upto" not in existing_cols:
        execute(db_path, "ALTER TABLE sessions ADD COLUMN summary_event_id_upto INTEGER")
    execute(
        db_path,
        """
        INSERT INTO schema_version(key, value)
        VALUES(?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
        """,
        (SESSIONS_SCHEMA_VERSION_KEY, SESSIONS_SCHEMA_VERSION_VALUE),
    )
