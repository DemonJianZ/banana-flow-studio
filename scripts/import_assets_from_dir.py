#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from typing import Iterable


CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(CURRENT_DIR)
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)


from bananaflow.storage.migrations import ensure_asset_db
from bananaflow.storage.sqlite import executemany


_TOKEN_RE = re.compile(r"[a-z0-9]+|[\u4e00-\u9fff]+", re.IGNORECASE)
_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif"}
_VIDEO_EXTS = {".mp4", ".mov", ".m4v", ".mkv", ".avi", ".webm"}
_AUDIO_EXTS = {".mp3", ".wav", ".aac", ".m4a", ".flac"}


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import local assets metadata into BananaFlow asset sqlite db.")
    parser.add_argument("--dir", required=True, help="Asset directory to scan")
    parser.add_argument("--type", default="", help="Optional fixed asset_type for all files")
    parser.add_argument("--aspect", default="", help="Optional fixed aspect, e.g. 9:16")
    parser.add_argument("--tag", action="append", default=[], help="Optional extra tag. Can pass multiple times.")
    parser.add_argument(
        "--db-path",
        default=os.getenv("BANANAFLOW_ASSET_DB_PATH", "./data/assets.db"),
        help="Asset sqlite path (default from BANANAFLOW_ASSET_DB_PATH or ./data/assets.db)",
    )
    return parser.parse_args()


def _infer_asset_type(path: str, fixed_type: str) -> str:
    forced = (fixed_type or "").strip().lower()
    if forced:
        return forced
    ext = os.path.splitext(path)[1].lower()
    if ext in _IMAGE_EXTS:
        return "image"
    if ext in _VIDEO_EXTS:
        return "video"
    if ext in _AUDIO_EXTS:
        return "audio"
    return "file"


def _tokenize(text: str) -> list[str]:
    return [m.group(0).lower() for m in _TOKEN_RE.finditer(text or "")]


def _build_tags(rel_path: str, extra_tags: Iterable[str]) -> list[str]:
    parts = rel_path.replace("\\", "/").split("/")
    tokens: list[str] = []
    for part in parts[:-1]:
        tokens.extend(_tokenize(part))
    stem = os.path.splitext(parts[-1])[0] if parts else rel_path
    tokens.extend(_tokenize(stem))
    for item in extra_tags:
        tokens.extend(_tokenize(str(item or "")))
    dedup: list[str] = []
    seen = set()
    for token in tokens:
        if not token or token in seen:
            continue
        seen.add(token)
        dedup.append(token)
    return dedup


def _make_asset_id(uri: str) -> str:
    return hashlib.sha256(uri.encode("utf-8")).hexdigest()


def main() -> int:
    args = _parse_args()
    scan_dir = os.path.abspath((args.dir or "").strip())
    if not os.path.isdir(scan_dir):
        print(f"scan dir not found: {scan_dir}", file=sys.stderr)
        return 2

    db_path = os.path.abspath((args.db_path or "").strip())
    ensure_asset_db(db_path)

    rows: list[tuple[object, ...]] = []
    for root, _, files in os.walk(scan_dir):
        for filename in files:
            if filename.startswith("."):
                continue
            full_path = os.path.abspath(os.path.join(root, filename))
            rel_path = os.path.relpath(full_path, scan_dir)
            uri = full_path
            tags = _build_tags(rel_path=rel_path, extra_tags=list(args.tag or []))
            scene = ""
            rel_parts = rel_path.replace("\\", "/").split("/")
            if len(rel_parts) > 1:
                scene = rel_parts[0]
            rows.append(
                (
                    _make_asset_id(uri),
                    uri,
                    _infer_asset_type(full_path, args.type),
                    json.dumps(tags, ensure_ascii=False),
                    scene,
                    "[]",
                    "",
                    str(args.aspect or "").strip(),
                    None,
                )
            )

    if rows:
        executemany(
            db_path,
            """
            INSERT INTO assets (
                asset_id, uri, asset_type, tags, scene, objects, style, aspect, duration_sec
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(asset_id) DO UPDATE SET
                uri = excluded.uri,
                asset_type = excluded.asset_type,
                tags = excluded.tags,
                scene = excluded.scene,
                objects = excluded.objects,
                style = excluded.style,
                aspect = excluded.aspect,
                duration_sec = excluded.duration_sec
            """,
            rows,
        )

    print(json.dumps({"db_path": db_path, "scan_dir": scan_dir, "imported": len(rows)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
