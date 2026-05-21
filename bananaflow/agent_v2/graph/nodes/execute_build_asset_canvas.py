from __future__ import annotations


def execute_build_asset_canvas(state: dict) -> dict:
    from agent_v2.shot_workflow.asset_canvas_builder import build_asset_canvas_patch

    tool_args = dict(state.get("tool_args") or {})
    confirmed = dict(tool_args.get("confirmed_extraction") or {})
    characters = list(confirmed.get("characters") or [])
    scenes = list(confirmed.get("scenes") or [])
    current_nodes = list(tool_args.get("current_nodes") or state.get("current_nodes") or [])

    patch = build_asset_canvas_patch(characters, scenes, current_nodes=current_nodes)

    char_count = len([c for c in characters if str(c.get("name") or "").strip()])
    scene_count = len([s for s in scenes if str(s.get("name") or "").strip()])
    summary = f"已在画布上创建 {char_count} 个角色/道具设定图组和 {scene_count} 个场景设定图组，点击运行按钮即可生成参考图。"

    return {
        "exec_response_text": summary,
        "exec_patches": patch,
        "exec_data": {
            "kind": "asset_canvas_built",
            "summary": summary,
            "char_count": char_count,
            "scene_count": scene_count,
            "patch_count": len(patch),
        },
        "trace": list(state.get("trace") or []) + [
            {"type": "EXECUTE_BUILD_ASSET_CANVAS", "char_count": char_count, "scene_count": scene_count, "patch_count": len(patch)},
        ],
    }
