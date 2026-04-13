#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))


from bananaflow.agent.storyboard_execution import compile_storyboard_execution_package


def main() -> None:
    base_dir = Path(__file__).resolve().parents[1] / "examples" / "storyboard_execution" / "ootd_vlog"
    storyboard_master_path = base_dir / "storyboard_master.json"
    storyboard_master = json.loads(storyboard_master_path.read_text(encoding="utf-8"))
    compiled = compile_storyboard_execution_package(storyboard_master)

    for filename, payload in [
        ("asset_bible.json", compiled["asset_bible"]),
        ("shot_spec.json", compiled["shot_spec"]),
        ("prompt_pack.json", compiled["prompt_pack"]),
    ]:
        (base_dir / filename).write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )


if __name__ == "__main__":
    main()
