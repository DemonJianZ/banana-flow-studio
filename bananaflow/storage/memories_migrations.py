from __future__ import annotations

from .memories_sqlite import execute, query_all


MEMORIES_SCHEMA_VERSION_KEY = "memories_schema"
MEMORIES_SCHEMA_VERSION_VALUE = "v2"


def ensure_memories_db(db_path: str) -> None:
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
        CREATE TABLE IF NOT EXISTS memories (
            memory_id TEXT PRIMARY KEY,
            scope TEXT NOT NULL,
            tenant_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            topic TEXT NOT NULL,
            key TEXT NOT NULL,
            value TEXT NOT NULL,
            confidence REAL NOT NULL DEFAULT 0.8,
            provenance_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            ttl_at TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            last_confirmed_at TEXT,
            update_count INTEGER NOT NULL DEFAULT 0,
            deactivated_reason TEXT,
            value_history_json TEXT
        )
        """,
    )
    execute(
        db_path,
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_memories_user_pref_unique
        ON memories(scope, tenant_id, user_id, topic, key)
        """,
    )
    execute(
        db_path,
        """
        CREATE INDEX IF NOT EXISTS idx_memories_tenant_user_active_updated
        ON memories(tenant_id, user_id, is_active, updated_at)
        """,
    )
    info = query_all(db_path, "PRAGMA table_info(memories)")
    existing_cols = {str(row["name"]) for row in info}
    if "last_confirmed_at" not in existing_cols:
        execute(db_path, "ALTER TABLE memories ADD COLUMN last_confirmed_at TEXT")
    if "update_count" not in existing_cols:
        execute(db_path, "ALTER TABLE memories ADD COLUMN update_count INTEGER NOT NULL DEFAULT 0")
    if "deactivated_reason" not in existing_cols:
        execute(db_path, "ALTER TABLE memories ADD COLUMN deactivated_reason TEXT")
    if "value_history_json" not in existing_cols:
        execute(db_path, "ALTER TABLE memories ADD COLUMN value_history_json TEXT")
    execute(
        db_path,
        """
        INSERT INTO schema_version(key, value)
        VALUES(?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
        """,
        (MEMORIES_SCHEMA_VERSION_KEY, MEMORIES_SCHEMA_VERSION_VALUE),
    )
