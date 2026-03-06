from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from typing import Any, Iterator, Sequence


@contextmanager
def get_conn(db_path: str) -> Iterator[sqlite3.Connection]:
    path = os.path.abspath((db_path or "").strip())
    if not path:
        raise ValueError("db_path is required")
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def execute(db_path: str, sql: str, params: Sequence[Any] | None = None) -> int:
    with get_conn(db_path) as conn:
        cur = conn.execute(sql, tuple(params or ()))
        conn.commit()
        return int(cur.rowcount or 0)


def query_all(db_path: str, sql: str, params: Sequence[Any] | None = None) -> list[sqlite3.Row]:
    with get_conn(db_path) as conn:
        cur = conn.execute(sql, tuple(params or ()))
        rows = cur.fetchall()
    return list(rows or [])


def query_one(db_path: str, sql: str, params: Sequence[Any] | None = None) -> sqlite3.Row | None:
    with get_conn(db_path) as conn:
        cur = conn.execute(sql, tuple(params or ()))
        row = cur.fetchone()
    return row
