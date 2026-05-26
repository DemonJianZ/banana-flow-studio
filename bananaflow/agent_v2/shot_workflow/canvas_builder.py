from __future__ import annotations

import uuid
from typing import Any

try:
    from core.config import MODEL_COMFYUI_IMAGE_Z_IMAGE_TURBO, VIDEO_MODEL_2_0
except ImportError:
    from bananaflow.core.config import MODEL_COMFYUI_IMAGE_Z_IMAGE_TURBO, VIDEO_MODEL_2_0
from .schemas import ShotSpec

_ALLOWED_IMAGE_MODES = {"text2img", "local_text2img", "multi_image_generate", "img2video"}

_INPUT_NODE_SPACING = 120   # vertical gap between consecutive input nodes
_MIN_ROW_HEIGHT = 280       # minimum vertical space per shot row


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


def _origin(current_nodes: list[dict[str, Any]]) -> tuple[int, int]:
    if not current_nodes:
        return 120, 120
    max_x = max(int(node.get("x") or 0) for node in current_nodes)
    min_y = min(int(node.get("y") or 120) for node in current_nodes)
    return max_x + 420, max(80, min_y)


def _collect_reference_items(
    shot: ShotSpec,
    selected_artifact: dict[str, Any] | None,
) -> list[tuple[str, str]]:
    """Return (url, label) pairs — one per reference image, each becomes its own input node."""
    items: list[tuple[str, str]] = []
    bindings = dict(shot.get("asset_bindings") or {})

    for binding in list(bindings.get("character_bindings") or []):
        url = str((binding or {}).get("three_view_url") or "").strip()
        name = str((binding or {}).get("name") or (binding or {}).get("query_name") or "").strip()
        if url:
            items.append((url, name or "角色参考"))

    scene_binding = dict(bindings.get("scene_binding") or {})
    scene_urls = list(scene_binding.get("preview_urls") or [])
    if scene_urls:
        url = str(scene_urls[0]).strip()
        scene_name = str(scene_binding.get("folder_name") or "场景参考").strip()
        if url:
            items.append((url, scene_name))

    if not items and selected_artifact and selected_artifact.get("url"):
        items.append((str(selected_artifact["url"]), "参考图"))

    return items


def build_canvas_patch(
    shots: list[ShotSpec],
    *,
    aspect_ratio: str = "16:9",
    mode_policy: str = "auto",
    selected_artifact: dict[str, Any] | None = None,
    current_nodes: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    base_x, base_y = _origin(current_nodes or [])
    patch: list[dict[str, Any]] = []
    selected_ids: list[str] = []
    current_y = base_y

    # url → node_id / label: shared input nodes across shots with the same reference image
    ref_url_to_node_id: dict[str, str] = {}
    ref_url_to_label: dict[str, str] = {}

    for row, shot in enumerate(shots):
        mode = str(shot.get("mode") or "text2img").strip()
        if mode not in _ALLOWED_IMAGE_MODES:
            mode = "text2img"
        is_video = mode == "img2video"

        ref_items: list[tuple[str, str]] = []
        if mode in {"multi_image_generate", "img2video"}:
            ref_items = _collect_reference_items(shot, selected_artifact)

        # Split into new refs (need a node) vs reused refs (node already exists)
        new_ref_items: list[tuple[str, str]] = []
        reused_ids: list[str] = []
        for url, label in ref_items:
            if url in ref_url_to_node_id:
                reused_ids.append(ref_url_to_node_id[url])
            else:
                new_ref_items.append((url, label))

        # Pre-count audio nodes and collect audio labels
        audio_count = 0
        audio_mention_labels: list[str] = []
        if is_video:
            _bindings_pre = dict((shot.get("asset_bindings") or {}))
            _char_bindings_pre = list(_bindings_pre.get("character_bindings") or [])
            _seen_voices: set[str] = set()
            for _cb in _char_bindings_pre:
                _v = str((_cb or {}).get("voice_url") or "").strip()
                _cn = str((_cb or {}).get("name") or (_cb or {}).get("query_name") or "").strip()
                if _v and _v not in _seen_voices:
                    _seen_voices.add(_v)
                    audio_count += 1
                    audio_mention_labels.append(f"{_cn} 音色" if _cn else "角色音色")

        # Build @mention prefix for text_input from all connected input nodes this shot
        mention_labels: list[str] = []
        for url, label in ref_items:
            lbl = str(label or "").strip()
            if lbl and lbl not in ("参考图",):
                mention_labels.append(lbl)
        mention_labels.extend(audio_mention_labels)
        # Deduplicate while preserving order
        seen_labels: set[str] = set()
        unique_mention_labels: list[str] = []
        for lbl in mention_labels:
            if lbl not in seen_labels:
                seen_labels.add(lbl)
                unique_mention_labels.append(lbl)
        mentions_prefix = " ".join(f"@{lbl}" for lbl in unique_mention_labels)

        # Base prompt text (no @mentions — used for video_gen note)
        base_prompt_text = str(shot.get("prompt") or shot.get("visual_description") or shot.get("action") or "").strip()

        # text_input shows @mentions + prompt; video_gen note uses clean prompt
        text_input_text = f"{mentions_prefix}\n{base_prompt_text}".strip() if mentions_prefix else base_prompt_text

        # Row height accounts for new ref input nodes + audio nodes
        new_count = len(new_ref_items)
        total_left_nodes = new_count + audio_count
        row_height = max(_MIN_ROW_HEIGHT, 120 + total_left_nodes * _INPUT_NODE_SPACING)

        # Processor centered on the new input block (or at row top when all reused)
        input_block_height = new_count * _INPUT_NODE_SPACING
        proc_y = current_y + max(0, (input_block_height - 80) // 2)

        # --- text_input node (all modes, including video) ---
        text_id: str | None = _new_id(f"shot{row + 1}_text")
        patch.append({
            "op": "add_node",
            "node": {
                "id": text_id,
                "type": "text_input",
                "x": base_x,
                "y": current_y,
                "data": {
                    "text": text_input_text,
                    "shot_id": shot.get("shot_id"),
                    "title": shot.get("title") or f"镜头 {row + 1}",
                    "visual_description": shot.get("visual_description") or shot.get("action") or "",
                    "audio_description": shot.get("audio_description") or "",
                    "dialogue": shot.get("dialogue") or "",
                },
            },
        })
        selected_ids.append(text_id)

        # --- create NEW input nodes; reused ones already exist ---
        input_ids: list[str] = list(reused_ids)
        for j, (url, label) in enumerate(new_ref_items):
            inp_id = _new_id(f"shot{row + 1}_ref{j + 1}")
            ref_url_to_node_id[url] = inp_id
            ref_url_to_label[url] = label
            patch.append({
                "op": "add_node",
                "node": {
                    "id": inp_id,
                    "type": "input",
                    "x": base_x,
                    "y": current_y + 120 + j * _INPUT_NODE_SPACING,
                    "data": {"images": [url], "mediaKind": "image", "title": label},
                },
            })
            input_ids.append(inp_id)
            selected_ids.append(inp_id)

        # --- processor node (image) / video_gen node (video) ---
        proc_id = _new_id(f"shot{row + 1}_gen")
        if is_video:
            shot_camera = str(shot.get("camera") or "").strip()
            shot_duration = int(shot.get("duration") or 5)
            data: dict[str, Any] = {
                "mode": "img2video",
                "prompt": "",
                "templates": {
                    "motion": "",
                    "camera": shot_camera,
                    "duration": shot_duration,
                    "resolution": "720p",
                    "ratio": aspect_ratio,
                    "note": base_prompt_text,
                    "generate_audio_new": True,
                    "imageType": "4",
                },
                "omniReferenceOnly": True,
                "batchSize": 1,
                "status": "idle",
                "refImage": None,
                "model": VIDEO_MODEL_2_0,
                "shot_id": shot.get("shot_id"),
                "shot_title": shot.get("title"),
                "visual_description": shot.get("visual_description") or shot.get("action") or "",
                "audio_description": shot.get("audio_description") or "",
                "dialogue": shot.get("dialogue") or "",
                "workflow_role": "shot_video_generation",
            }
            node_type = "video_gen"
        else:
            if mode == "multi_image_generate":
                templates: dict[str, Any] = {"size": "1k", "note": ""}
            else:
                templates = {"size": "1k", "aspect_ratio": aspect_ratio}
            data = {
                "mode": mode,
                "prompt": shot.get("prompt") or "",
                "templates": templates,
                "batchSize": 1,
                "status": "idle",
                "shot_id": shot.get("shot_id"),
                "shot_title": shot.get("title"),
                "visual_description": shot.get("visual_description") or shot.get("action") or "",
                "audio_description": shot.get("audio_description") or "",
                "dialogue": shot.get("dialogue") or "",
                "workflow_role": "shot_image_generation",
                "model": MODEL_COMFYUI_IMAGE_Z_IMAGE_TURBO if mode == "local_text2img" else "",
            }
            node_type = "processor"
        patch.append({
            "op": "add_node",
            "node": {"id": proc_id, "type": node_type, "x": base_x + 360, "y": proc_y, "data": data},
        })
        selected_ids.append(proc_id)

        # --- output node ---
        out_id = _new_id(f"shot{row + 1}_out")
        patch.append({
            "op": "add_node",
            "node": {
                "id": out_id,
                "type": "output",
                "x": base_x + 720,
                "y": proc_y,
                "data": {"images": [], "shot_id": shot.get("shot_id"), "label": f"{shot.get('shot_id')} 出图"},
            },
        })
        selected_ids.append(out_id)

        # --- audio input nodes (video mode only, one per character voice_url) ---
        audio_ids: list[str] = []
        if is_video:
            bindings = dict((shot.get("asset_bindings") or {}))
            char_bindings = list(bindings.get("character_bindings") or [])
            audio_y_offset = 120 + max(len(new_ref_items), 0) * _INPUT_NODE_SPACING
            seen_voice_urls: set[str] = set()
            for k, binding in enumerate(char_bindings):
                voice_url = str((binding or {}).get("voice_url") or "").strip()
                char_name = str((binding or {}).get("name") or (binding or {}).get("query_name") or "").strip()
                if not voice_url or voice_url in seen_voice_urls:
                    continue
                seen_voice_urls.add(voice_url)
                audio_id = _new_id(f"shot{row + 1}_audio{k + 1}")
                patch.append({
                    "op": "add_node",
                    "node": {
                        "id": audio_id,
                        "type": "input",
                        "x": base_x,
                        "y": current_y + audio_y_offset + k * _INPUT_NODE_SPACING,
                        "data": {
                            "images": [voice_url],
                            "mediaKind": "audio",
                            "title": f"{char_name} 音色" if char_name else "角色音色",
                        },
                    },
                })
                audio_ids.append(audio_id)
                selected_ids.append(audio_id)

        # --- connections ---
        if text_id:
            patch.append({"op": "add_connection", "connection": {"id": _new_id("c"), "from": text_id, "to": proc_id}})
        for inp_id in input_ids:
            patch.append({"op": "add_connection", "connection": {"id": _new_id("c"), "from": inp_id, "to": proc_id}})
        for audio_id in audio_ids:
            patch.append({"op": "add_connection", "connection": {"id": _new_id("c"), "from": audio_id, "to": proc_id}})
        patch.append({"op": "add_connection", "connection": {"id": _new_id("c"), "from": proc_id, "to": out_id}})

        current_y += row_height

    if selected_ids:
        patch.append({"op": "select_nodes", "ids": selected_ids[:24]})
        patch.append({"op": "set_viewport", "viewport": {"x": max(0, base_x - 80), "y": max(0, base_y - 80), "zoom": 0.78}})
    return patch
