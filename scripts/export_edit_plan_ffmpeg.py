#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any


CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(CURRENT_DIR)
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)


from bananaflow.agent.idea_script.exporters.ffmpeg_exporter import export_ffmpeg_bundle
from bananaflow.agent.idea_script.schemas import EditPlan


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export an EditPlan to FFmpeg bundle files.")
    parser.add_argument("--plan-json", required=True, help="Path to EditPlan JSON file")
    parser.add_argument("--out-dir", required=True, help="Bundle output directory")
    parser.add_argument("--w", type=int, default=720, help="Output width")
    parser.add_argument("--h", type=int, default=1280, help="Output height")
    parser.add_argument("--fps", type=int, default=30, help="Output fps")
    return parser.parse_args()


def _load_plan(path: str) -> EditPlan:
    with open(path, "r", encoding="utf-8") as f:
        data: Any = json.load(f)
    if isinstance(data, dict) and "tracks" in data and "plan_id" in data:
        return EditPlan(**data)
    if isinstance(data, dict) and "edit_plans" in data:
        plans = list(data.get("edit_plans") or [])
        if not plans:
            raise ValueError("edit_plans is empty")
        return EditPlan(**plans[0])
    if isinstance(data, list) and data:
        return EditPlan(**data[0])
    raise ValueError("invalid plan json format")


def main() -> int:
    args = _parse_args()
    plan = _load_plan(args.plan_json)
    result = export_ffmpeg_bundle(
        plan=plan,
        out_dir=args.out_dir,
        resolution=(args.w, args.h),
        fps=args.fps,
    )
    print(result["render_script_path"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
