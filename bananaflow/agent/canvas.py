"""
agent/canvas.py — Canvas workflow template library.

Provides 5 standard workflow templates and the logic to generate
canvas_action SSE events from a chosen template + user params.

Canvas action event format:
  {"type": "canvas_action", "action": "add_node",    "node": {...}}
  {"type": "canvas_action", "action": "connect",      "connection": {...}}
  {"type": "canvas_action", "action": "select_nodes", "ids": [...]}
"""
from __future__ import annotations

import random
import string
from typing import Any, Dict, List, Optional

from .stream import push_event

# ── Node type constants (mirror frontend NODE_TYPES) ─────────────────────────

_TEXT_INPUT  = "text_input"
_INPUT       = "input"
_PROCESSOR   = "processor"
_VIDEO_GEN   = "video_gen"
_OUTPUT      = "output"

# Standard horizontal node spacing (pixels)
_GAP = 400

# Node widths for layout centering
_WIDTHS = {
    _TEXT_INPUT: 320,
    _INPUT:      280,
    _PROCESSOR:  280,
    _VIDEO_GEN:  280,
    _OUTPUT:     240,
}


def _nid() -> str:
    """Generate a short random node ID for canvas planning."""
    return "ag_" + "".join(random.choices(string.ascii_lowercase + string.digits, k=7))


def _cid() -> str:
    return "ac_" + "".join(random.choices(string.ascii_lowercase + string.digits, k=7))


# ── Workflow Templates ────────────────────────────────────────────────────────

def _text2img_flow(prompt: str, model_id: str = "") -> Dict[str, Any]:
    """TEXT_INPUT → PROCESSOR(text2img) → OUTPUT"""
    n1 = _nid(); n2 = _nid(); n3 = _nid()
    nodes = [
        {"id": n1, "type": _TEXT_INPUT, "data": {"text": prompt}},
        {"id": n2, "type": _PROCESSOR,  "data": {
            "mode": "text2img", "prompt": "", "title": "图像创作",
            "templates": {"size": "1k", "aspect_ratio": "1:1"},
            "batchSize": 1, "uploadedImages": [], "status": "idle", "refImage": None,
            "model": model_id,
        }},
        {"id": n3, "type": _OUTPUT, "data": {"images": []}},
    ]
    connections = [
        {"id": _cid(), "from": n1, "to": n2},
        {"id": _cid(), "from": n2, "to": n3},
    ]
    return {"nodes": nodes, "connections": connections, "select": [n1, n2, n3]}


def _img2img_flow(prompt: str, model_id: str = "") -> Dict[str, Any]:
    """INPUT + TEXT_INPUT → PROCESSOR(multi_image_generate) → OUTPUT"""
    n1 = _nid(); n2 = _nid(); n3 = _nid(); n4 = _nid()
    nodes = [
        {"id": n1, "type": _INPUT, "data": {"images": [], "mediaKind": "image", "title": "参考图"}},
        {"id": n2, "type": _TEXT_INPUT, "data": {"text": prompt}},
        {"id": n3, "type": _PROCESSOR, "data": {
            "mode": "multi_image_generate", "prompt": "",
            "templates": {"size": "1k", "note": ""},
            "batchSize": 1, "uploadedImages": [], "status": "idle", "model": model_id,
        }},
        {"id": n4, "type": _OUTPUT, "data": {"images": []}},
    ]
    connections = [
        {"id": _cid(), "from": n1, "to": n3},
        {"id": _cid(), "from": n2, "to": n3},
        {"id": _cid(), "from": n3, "to": n4},
    ]
    return {"nodes": nodes, "connections": connections, "select": [n1, n2, n3, n4]}


def _rmbg_flow(prompt: str = "", **_) -> Dict[str, Any]:
    """INPUT → PROCESSOR(rmbg) → OUTPUT"""
    n1 = _nid(); n2 = _nid(); n3 = _nid()
    nodes = [
        {"id": n1, "type": _INPUT, "data": {"images": [], "mediaKind": "image", "title": "待去背图片"}},
        {"id": n2, "type": _PROCESSOR, "data": {
            "mode": "rmbg", "prompt": "", "title": "去背景",
            "templates": {"size": "1024x1024", "aspect_ratio": "1:1"},
            "batchSize": 1, "uploadedImages": [], "status": "idle", "refImage": None, "model": "",
        }},
        {"id": n3, "type": _OUTPUT, "data": {"images": []}},
    ]
    connections = [
        {"id": _cid(), "from": n1, "to": n2},
        {"id": _cid(), "from": n2, "to": n3},
    ]
    return {"nodes": nodes, "connections": connections, "select": [n1, n2, n3]}


def _img2video_flow(prompt: str, model_id: str = "") -> Dict[str, Any]:
    """INPUT + TEXT_INPUT → VIDEO_GEN(img2video) → OUTPUT"""
    n1 = _nid(); n2 = _nid(); n3 = _nid(); n4 = _nid()
    nodes = [
        {"id": n1, "type": _INPUT, "data": {"images": [], "mediaKind": "image", "title": "首帧图片"}},
        {"id": n2, "type": _TEXT_INPUT, "data": {"text": prompt or "轻微晃动，商品保持静止。"}},
        {"id": n3, "type": _VIDEO_GEN, "data": {
            "mode": "img2video", "model": model_id, "prompt": "",
            "templates": {"motion": "标准(Standard)", "camera": "推近(Zoom In)",
                          "duration": 5, "resolution": "1080p", "ratio": "",
                          "note": "", "generate_audio_new": True},
            "batchSize": 1, "status": "idle", "refImage": None,
        }},
        {"id": n4, "type": _OUTPUT, "data": {"images": []}},
    ]
    connections = [
        {"id": _cid(), "from": n1, "to": n3, "toHandle": "main"},
        {"id": _cid(), "from": n2, "to": n3},
        {"id": _cid(), "from": n3, "to": n4},
    ]
    return {"nodes": nodes, "connections": connections, "select": [n1, n2, n3, n4]}


def _multi_angle_flow(prompt: str = "", **_) -> Dict[str, Any]:
    """INPUT → PROCESSOR(multi_angleshots) → OUTPUT"""
    n1 = _nid(); n2 = _nid(); n3 = _nid()
    nodes = [
        {"id": n1, "type": _INPUT, "data": {"images": [], "mediaKind": "image", "title": "产品图"}},
        {"id": n2, "type": _PROCESSOR, "data": {
            "mode": "multi_angleshots", "prompt": prompt, "title": "三视图",
            "templates": {},
            "batchSize": 1, "uploadedImages": [], "status": "idle", "refImage": None, "model": "",
        }},
        {"id": n3, "type": _OUTPUT, "data": {"images": []}},
    ]
    connections = [
        {"id": _cid(), "from": n1, "to": n2},
        {"id": _cid(), "from": n2, "to": n3},
    ]
    return {"nodes": nodes, "connections": connections, "select": [n1, n2, n3]}


# Template registry
TEMPLATES: Dict[str, Any] = {
    "text2img":    {"fn": _text2img_flow,   "label": "文生图",    "desc": "文字描述→生成图片"},
    "img2img":     {"fn": _img2img_flow,    "label": "图生图",    "desc": "参考图+描述→新图"},
    "rmbg":        {"fn": _rmbg_flow,       "label": "去背景",    "desc": "图片→透明背景"},
    "img2video":   {"fn": _img2video_flow,  "label": "图生视频",  "desc": "图片+描述→短视频"},
    "multi_angle": {"fn": _multi_angle_flow,"label": "产品三视图", "desc": "产品图→多角度展示"},
}


# ── Layout: place nodes in a horizontal row around the viewport center ────────

def _layout_nodes(nodes: List[Dict[str, Any]], cx: float, cy: float) -> None:
    """
    Assign (x, y) to each node in a left-to-right flow centered on (cx, cy).
    Nodes that already have x/y set are left untouched.
    """
    # Compute total width to center the entire row
    total_w = sum(_WIDTHS.get(n["type"], 280) for n in nodes)
    total_gap = _GAP * (len(nodes) - 1)
    total = total_w + total_gap

    x = cx - total / 2
    y = cy - 140

    # Two-column layout for flows with parallel inputs (img2img, img2video)
    # → place INPUT node above TEXT_INPUT at same x
    input_nodes  = [n for n in nodes if n["type"] == _INPUT]
    text_nodes   = [n for n in nodes if n["type"] == _TEXT_INPUT]
    proc_nodes   = [n for n in nodes if n["type"] in (_PROCESSOR, _VIDEO_GEN)]
    output_nodes = [n for n in nodes if n["type"] == _OUTPUT]

    if input_nodes and text_nodes and proc_nodes:
        # Parallel left column: INPUT top, TEXT_INPUT below
        col_x = x
        input_nodes[0]["x"] = col_x
        input_nodes[0]["y"] = y
        text_nodes[0]["x"] = col_x
        text_nodes[0]["y"] = y + 300
        col_x += _WIDTHS.get(_INPUT, 280) + _GAP
        for n in proc_nodes:
            n["x"] = col_x
            n["y"] = y + 100
            col_x += _WIDTHS.get(n["type"], 280) + _GAP
        for n in output_nodes:
            n["x"] = col_x
            n["y"] = y + 100
    else:
        # Single row
        col_x = x
        for n in nodes:
            n["x"] = col_x
            n["y"] = y
            col_x += _WIDTHS.get(n["type"], 280) + _GAP


# ── Main API ──────────────────────────────────────────────────────────────────

async def emit_canvas_workflow(
    template_key: str,
    prompt: str,
    cx: float,
    cy: float,
    model_id: str = "",
) -> List[str]:
    """
    Build the workflow, lay it out around (cx, cy), and push canvas_action events.
    Returns the list of created node IDs.
    """
    tpl = TEMPLATES.get(template_key)
    if not tpl:
        return []

    result = tpl["fn"](prompt=prompt, model_id=model_id)
    nodes: List[Dict[str, Any]] = result["nodes"]
    connections: List[Dict[str, Any]] = result["connections"]
    select_ids: List[str] = result.get("select", [n["id"] for n in nodes])

    _layout_nodes(nodes, cx, cy)

    for node in nodes:
        await push_event({"type": "canvas_action", "action": "add_node", "node": node})

    for conn in connections:
        await push_event({"type": "canvas_action", "action": "connect", "connection": conn})

    await push_event({"type": "canvas_action", "action": "select_nodes", "ids": select_ids})

    return [n["id"] for n in nodes]
