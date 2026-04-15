from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Optional

from .sqlite import execute, query_all


DEFAULT_ASSET_LIBRARY_DB_PATH = "./data/asset_library.db"


def get_asset_library_db_path() -> str:
    return str(os.getenv("BANANAFLOW_ASSET_LIBRARY_DB_PATH") or DEFAULT_ASSET_LIBRARY_DB_PATH).strip() or DEFAULT_ASSET_LIBRARY_DB_PATH


def init_asset_library_store(db_path: Optional[str] = None) -> str:
    path = str(db_path or get_asset_library_db_path()).strip() or DEFAULT_ASSET_LIBRARY_DB_PATH
    execute(
        path,
        """
        CREATE TABLE IF NOT EXISTS asset_library_items (
            item_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            kind TEXT NOT NULL,
            canvas_id TEXT NOT NULL DEFAULT '',
            title TEXT NOT NULL DEFAULT '',
            summary TEXT NOT NULL DEFAULT '',
            cover_url TEXT NOT NULL DEFAULT '',
            asset_count INTEGER NOT NULL DEFAULT 0,
            node_count INTEGER NOT NULL DEFAULT 0,
            connection_count INTEGER NOT NULL DEFAULT 0,
            snapshot_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """,
    )
    execute(path, "CREATE INDEX IF NOT EXISTS idx_asset_library_items_user_kind_updated ON asset_library_items(user_id, kind, updated_at DESC)")
    execute(path, "CREATE INDEX IF NOT EXISTS idx_asset_library_items_user_canvas ON asset_library_items(user_id, canvas_id)")
    return path


def list_asset_library_items(user_id: str, kind: Optional[str] = None, db_path: Optional[str] = None) -> List[Dict[str, Any]]:
    path = init_asset_library_store(db_path)
    params: List[Any] = [str(user_id or "").strip()]
    sql = """
        SELECT item_id, user_id, kind, canvas_id, title, summary, cover_url, asset_count, node_count, connection_count,
               snapshot_json, created_at, updated_at
        FROM asset_library_items
        WHERE user_id = ?
    """
    if kind:
        sql += " AND kind = ?"
        params.append(str(kind or "").strip())
    sql += " ORDER BY updated_at DESC, created_at DESC"
    rows = query_all(path, sql, params)
    items: List[Dict[str, Any]] = []
    for row in rows:
        snapshot_text = str(row["snapshot_json"] or "{}")
        try:
            snapshot = json.loads(snapshot_text)
        except Exception:
            snapshot = {}
        items.append(
            {
                "id": str(row["item_id"] or ""),
                "user_id": str(row["user_id"] or ""),
                "kind": str(row["kind"] or ""),
                "canvas_id": str(row["canvas_id"] or ""),
                "title": str(row["title"] or ""),
                "summary": str(row["summary"] or ""),
                "cover_url": str(row["cover_url"] or ""),
                "asset_count": int(row["asset_count"] or 0),
                "node_count": int(row["node_count"] or 0),
                "connection_count": int(row["connection_count"] or 0),
                "snapshot": snapshot if isinstance(snapshot, dict) else {},
                "created_at": str(row["created_at"] or ""),
                "updated_at": str(row["updated_at"] or ""),
            }
        )
    return items


def upsert_asset_library_item(user_id: str, item: Dict[str, Any], db_path: Optional[str] = None) -> Dict[str, Any]:
    path = init_asset_library_store(db_path)
    item_id = str(item.get("id") or "").strip()
    if not item_id:
        raise ValueError("item.id is required")
    payload = (
        item_id,
        str(user_id or "").strip(),
        str(item.get("kind") or "").strip(),
        str(item.get("canvas_id") or item.get("canvasId") or "").strip(),
        str(item.get("title") or "").strip(),
        str(item.get("summary") or "").strip(),
        str(item.get("cover_url") or item.get("coverUrl") or "").strip(),
        int(item.get("asset_count") or item.get("assetCount") or 0),
        int(item.get("node_count") or item.get("nodeCount") or 0),
        int(item.get("connection_count") or item.get("connectionCount") or 0),
        json.dumps(item.get("snapshot") or {}, ensure_ascii=False),
    )
    execute(
        path,
        """
        INSERT INTO asset_library_items (
            item_id, user_id, kind, canvas_id, title, summary, cover_url,
            asset_count, node_count, connection_count, snapshot_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(item_id) DO UPDATE SET
            user_id = excluded.user_id,
            kind = excluded.kind,
            canvas_id = excluded.canvas_id,
            title = excluded.title,
            summary = excluded.summary,
            cover_url = excluded.cover_url,
            asset_count = excluded.asset_count,
            node_count = excluded.node_count,
            connection_count = excluded.connection_count,
            snapshot_json = excluded.snapshot_json,
            updated_at = CURRENT_TIMESTAMP
        """,
        payload,
    )
    return item


def delete_asset_library_item(user_id: str, item_id: str, db_path: Optional[str] = None) -> int:
    path = init_asset_library_store(db_path)
    return execute(
        path,
        "DELETE FROM asset_library_items WHERE item_id = ? AND user_id = ?",
        [str(item_id or "").strip(), str(user_id or "").strip()],
    )
