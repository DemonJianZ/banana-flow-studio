from __future__ import annotations

from .sqlite import execute


ASSET_SCHEMA_VERSION_KEY = "assets_schema"
ASSET_SCHEMA_VERSION_VALUE = "v1"


def ensure_asset_db(db_path: str) -> None:
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
        CREATE TABLE IF NOT EXISTS assets (
            asset_id TEXT PRIMARY KEY,
            uri TEXT NOT NULL,
            asset_type TEXT NOT NULL,
            tags TEXT NOT NULL DEFAULT '[]',
            scene TEXT NOT NULL DEFAULT '',
            objects TEXT NOT NULL DEFAULT '[]',
            style TEXT NOT NULL DEFAULT '',
            aspect TEXT NOT NULL DEFAULT '',
            duration_sec REAL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """,
    )
    execute(
        db_path,
        "CREATE INDEX IF NOT EXISTS idx_assets_asset_type ON assets(asset_type)",
    )
    execute(
        db_path,
        "CREATE INDEX IF NOT EXISTS idx_assets_aspect ON assets(aspect)",
    )
    execute(
        db_path,
        """
        INSERT INTO schema_version(key, value)
        VALUES(?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
        """,
        (ASSET_SCHEMA_VERSION_KEY, ASSET_SCHEMA_VERSION_VALUE),
    )
