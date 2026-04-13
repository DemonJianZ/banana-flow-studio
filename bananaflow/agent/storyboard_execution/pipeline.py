from __future__ import annotations

from typing import Any, Dict

from .asset_bible_builder import build_asset_bible
from .prompt_pack_builder import build_prompt_pack
from .shot_spec_builder import build_shot_spec


def compile_storyboard_execution_package(storyboard_master: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    asset_bible = build_asset_bible(storyboard_master)
    shot_spec = build_shot_spec(storyboard_master, asset_bible)
    prompt_pack = build_prompt_pack(asset_bible, shot_spec)
    return {
        "asset_bible": asset_bible,
        "shot_spec": shot_spec,
        "prompt_pack": prompt_pack,
    }
