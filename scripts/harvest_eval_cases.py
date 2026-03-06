#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import sys
from typing import Any, Dict, List, Optional, Tuple


CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(CURRENT_DIR)
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)


from bananaflow.quality.harvester import (  # noqa: E402
    default_sessions_db_path,
    harvest_eval_case,
    query_candidates,
)
from bananaflow.storage.sessions_migrations import ensure_sessions_db  # noqa: E402
from bananaflow.storage.sessions_sqlite import get_conn  # noqa: E402


def _owner_for_session(db_path: str, session_id: str) -> Optional[Tuple[str, str]]:
    with get_conn(db_path) as conn:
        row = conn.execute(
            """
            SELECT tenant_id, user_id
            FROM sessions
            WHERE session_id = ?
            LIMIT 1
            """,
            (session_id,),
        ).fetchone()
    if row is None:
        return None
    return str(row["tenant_id"] or ""), str(row["user_id"] or "")


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Harvest low-quality idea_script runs into eval cases JSONL.")
    parser.add_argument("--since-hours", type=int, default=24)
    parser.add_argument("--session-id", action="append", default=[])
    parser.add_argument("--min-trajectory-score", type=float, default=0.75)
    parser.add_argument("--only-failed", action="store_true", default=False)
    parser.add_argument("--include-trajectory", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--limit", type=int, default=100)
    parser.add_argument("--reason", type=str, default="auto_harvest")
    parser.add_argument("--db-path", type=str, default="")
    parser.add_argument("--out", type=str, default=(os.getenv("BANANAFLOW_EVAL_CASES_PATH") or ""))
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    db_path = os.path.abspath(str(args.db_path or "").strip() or default_sessions_db_path())
    ensure_sessions_db(db_path)

    explicit_session_ids = [str(item).strip() for item in list(args.session_id or []) if str(item).strip()]
    if explicit_session_ids:
        candidates = list(dict.fromkeys(explicit_session_ids))
    else:
        candidates = query_candidates(
            db_path,
            {
                "since_hours": int(args.since_hours),
                "min_trajectory_score": float(args.min_trajectory_score),
                "only_failed": bool(args.only_failed),
                "limit": int(args.limit),
            },
        )

    harvested_count = 0
    skipped_count = 0
    output_path = ""
    for session_id in list(candidates or [])[: max(1, int(args.limit))]:
        owner = _owner_for_session(db_path, session_id)
        if owner is None:
            skipped_count += 1
            continue
        tenant_id, user_id = owner
        if not tenant_id or not user_id:
            skipped_count += 1
            continue
        result = harvest_eval_case(
            session_id=session_id,
            tenant_id=tenant_id,
            user_id=user_id,
            out_dir=(args.out or None),
            reason=str(args.reason or ("manual_session_id" if explicit_session_ids else "auto_harvest")),
            include_trajectory=bool(args.include_trajectory),
            provenance={
                "since_hours": int(args.since_hours),
                "min_trajectory_score": float(args.min_trajectory_score),
                "only_failed": bool(args.only_failed),
                "limit": int(args.limit),
                "explicit_session_ids": bool(explicit_session_ids),
            },
        )
        output_path = result.output_path
        if result.written:
            harvested_count += 1
        else:
            skipped_count += 1

    print(
        {
            "harvested_count": int(harvested_count),
            "skipped_count": int(skipped_count),
            "output_path": output_path or os.path.abspath(str(args.out or os.getenv("BANANAFLOW_EVAL_CASES_PATH") or "")),
        }
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
