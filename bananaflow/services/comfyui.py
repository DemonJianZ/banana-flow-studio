import copy
import json
import re
import time
import uuid
from io import BytesIO
from typing import Any, Dict, Optional

import requests
from PIL import Image

from core.config import (
    COMFYUI_URL,
    COMFYUI_OVERLAYTEXT_PATH,
    COMFYUI_RMBG_PATH,
    COMFYUI_OUTPUT_NODE_ID,
    COMFYUI_TIMEOUT_SEC,
    COMFYUI_POLL_INTERVAL_SEC,
)
from core.logging import sys_logger
from utils.images import parse_data_url
from utils.size import calculate_target_resolution


class ComfyUiError(RuntimeError):
    pass


def _load_workflow(path: str) -> Dict[str, Any]:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        raise ComfyUiError(f"Failed to load workflow: {path}: {e}")


def _upload_image(img_bytes: bytes, filename: str) -> str:
    files = {"image": (filename, img_bytes, "image/png")}
    data = {"overwrite": "true", "type": "input"}
    resp = requests.post(f"{COMFYUI_URL}/upload/image", files=files, data=data, timeout=30)
    if resp.status_code != 200:
        raise ComfyUiError(f"ComfyUI upload failed: {resp.status_code} {resp.text}")
    payload = resp.json()
    return payload.get("name") or filename


def _queue_prompt(workflow: Dict[str, Any], client_id: str) -> str:
    resp = requests.post(
        f"{COMFYUI_URL}/prompt",
        json={"prompt": workflow, "client_id": client_id},
        timeout=30,
    )
    if resp.status_code != 200:
        raise ComfyUiError(f"ComfyUI prompt failed: {resp.status_code} {resp.text}")
    prompt_id = resp.json().get("prompt_id")
    if not prompt_id:
        raise ComfyUiError(f"ComfyUI prompt_id missing: {resp.text}")
    return prompt_id


def _wait_for_history(prompt_id: str) -> Dict[str, Any]:
    deadline = time.time() + COMFYUI_TIMEOUT_SEC
    last_err: Optional[str] = None
    while time.time() < deadline:
        try:
            resp = requests.get(f"{COMFYUI_URL}/history/{prompt_id}", timeout=10)
            if resp.status_code == 200:
                payload = resp.json()
                if prompt_id in payload:
                    return payload[prompt_id]
        except Exception as e:
            last_err = str(e)
        time.sleep(COMFYUI_POLL_INTERVAL_SEC)
    raise ComfyUiError(f"ComfyUI timeout waiting for history. last_err={last_err}")


def _pick_output_image(history: Dict[str, Any]) -> Dict[str, Any]:
    outputs = history.get("outputs") or {}
    output_node_id = str(COMFYUI_OUTPUT_NODE_ID)
    if output_node_id in outputs and outputs[output_node_id].get("images"):
        return outputs[output_node_id]["images"][0]

    for _, node_output in outputs.items():
        images = node_output.get("images") if isinstance(node_output, dict) else None
        if images:
            return images[0]

    raise ComfyUiError(f"No image output found in ComfyUI history: {list(outputs.keys())}")


def _download_image(image_info: Dict[str, Any]) -> bytes:
    params = {
        "filename": image_info.get("filename"),
        "subfolder": image_info.get("subfolder", ""),
        "type": image_info.get("type", "output"),
    }
    resp = requests.get(f"{COMFYUI_URL}/view", params=params, timeout=30)
    if resp.status_code != 200 or not resp.content:
        raise ComfyUiError(f"ComfyUI download failed: {resp.status_code} {resp.text}")
    return resp.content


def _set_node_input(workflow: Dict[str, Any], node_id: str, key: str, value: Any) -> None:
    node = workflow.get(str(node_id))
    if not isinstance(node, dict):
        raise ComfyUiError(f"Workflow node {node_id} missing")
    inputs = node.get("inputs")
    if not isinstance(inputs, dict):
        raise ComfyUiError(f"Workflow node {node_id} inputs missing")
    inputs[key] = value


def _get_node_input(workflow: Dict[str, Any], node_id: str, key: str, default: Any = None) -> Any:
    node = workflow.get(str(node_id)) or {}
    inputs = node.get("inputs") or {}
    return inputs.get(key, default)


def _resize_image_if_needed(
    img_bytes: bytes,
    size_label: Optional[str],
    aspect_ratio: Optional[str],
) -> tuple[bytes, bool]:
    if not size_label and not aspect_ratio:
        return img_bytes, False

    target = calculate_target_resolution(size_label or "1024x1024", aspect_ratio or "1:1")
    if "x" not in target:
        return img_bytes, False

    try:
        target_w, target_h = map(int, target.lower().split("x"))
    except Exception:
        return img_bytes, False

    with Image.open(BytesIO(img_bytes)) as img:
        img = img.convert("RGBA")
        if img.width == target_w and img.height == target_h:
            return img_bytes, False

        img_ratio = img.width / img.height
        target_ratio = target_w / target_h

        if img_ratio >= target_ratio:
            new_w = target_w
            new_h = max(1, int(round(target_w / img_ratio)))
        else:
            new_h = target_h
            new_w = max(1, int(round(target_h * img_ratio)))

        resized = img.resize((new_w, new_h), Image.LANCZOS)
        canvas = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
        offset = ((target_w - new_w) // 2, (target_h - new_h) // 2)
        canvas.paste(resized, offset)

        out = BytesIO()
        canvas.save(out, format="PNG")
        return out.getvalue(), True


def _split_keywords(text: Optional[str]) -> list[str]:
    if not text:
        return []
    parts = re.split(r"[\\n,，;；|]+", text)
    return [p.strip() for p in parts if p and p.strip()]


def _placeholder_for_char(ch: str) -> str:
    if ch == " ":
        return " "
    if ch.isspace():
        return ch
    if ord(ch) > 127:
        return "　"
    return " "


def _build_masked_text(full_text: str, keywords: list[str]) -> str:
    if not full_text or not keywords:
        return ""

    marks = [False] * len(full_text)
    for kw in keywords:
        if not kw:
            continue
        start = 0
        while True:
            idx = full_text.find(kw, start)
            if idx == -1:
                break
            for i in range(idx, idx + len(kw)):
                if 0 <= i < len(marks):
                    marks[i] = True
            start = idx + len(kw)

    if not any(marks):
        return ""

    out_chars: list[str] = []
    for i, ch in enumerate(full_text):
        if ch == "\n":
            out_chars.append("\n")
        elif marks[i]:
            out_chars.append(ch)
        else:
            out_chars.append(_placeholder_for_char(ch))
    return "".join(out_chars)


def _build_inverse_masked_text(full_text: str, keywords: list[str]) -> str:
    if not full_text:
        return ""
    if not keywords:
        return full_text

    marks = [False] * len(full_text)
    for kw in keywords:
        if not kw:
            continue
        start = 0
        while True:
            idx = full_text.find(kw, start)
            if idx == -1:
                break
            for i in range(idx, idx + len(kw)):
                if 0 <= i < len(marks):
                    marks[i] = True
            start = idx + len(kw)

    out_chars: list[str] = []
    for i, ch in enumerate(full_text):
        if ch == "\n":
            out_chars.append("\n")
        elif marks[i]:
            out_chars.append(_placeholder_for_char(ch))
        else:
            out_chars.append(ch)
    return "".join(out_chars)


def run_overlaytext_workflow(
    *,
    req_id: str,
    image_data_url: str,
    text: str,
    text_color: Optional[str] = None,
    highlight_color: Optional[str] = None,
    highlight_colors: Optional[list[str]] = None,
    highlight_text: Optional[str] = None,
    highlight_texts: Optional[list[str]] = None,
    bold_text: Optional[str] = None,
    bold_texts: Optional[list[str]] = None,
    bold_color: Optional[str] = None,
    bold_colors: Optional[list[str]] = None,
    bold_size_delta: Optional[int] = None,
    bold_strength: Optional[int] = None,
    use_bg_color: bool = False,
    bg_color: Optional[str] = None,
    size: Optional[str] = None,
    aspect_ratio: Optional[str] = None,
    font_name: Optional[str] = None,
    font_size: Optional[int] = None,
    highlight_opacity: Optional[float] = None,
    highlight_padding: Optional[int] = None,
    line_spacing: Optional[int] = None,
    margins: Optional[int] = None,
) -> bytes:
    workflow = _load_workflow(COMFYUI_OVERLAYTEXT_PATH)
    workflow = copy.deepcopy(workflow)

    mime_type, img_bytes = parse_data_url(image_data_url)
    img_bytes, resized = _resize_image_if_needed(img_bytes, size, aspect_ratio)
    ext = "png"
    if not resized:
        if "jpeg" in mime_type or "jpg" in mime_type:
            ext = "jpg"
        elif "webp" in mime_type:
            ext = "webp"

    upload_name = f"overlaytext-{uuid.uuid4().hex}.{ext}"
    sys_logger.info(f"[{req_id}] Uploading image to ComfyUI: {upload_name}")
    uploaded = _upload_image(img_bytes, upload_name)

    _set_node_input(workflow, "3", "image", uploaded)
    _set_node_input(workflow, "36", "text", text)

    def _normalize_list(val):
        if not val:
            return []
        if isinstance(val, list):
            return val
        return [val]

    def _clean_color(val):
        if val is None:
            return None
        if isinstance(val, str):
            v = val.strip()
            return v or None
        return str(val)

    highlight_text_nodes = ["136", "138", "139"]
    highlight_nodes = ["116", "117", "118"]
    bold_text_nodes = ["137", "237", "238"]
    bold_nodes = ["216", "217", "218"]

    highlight_text_list = _normalize_list(highlight_texts) or _normalize_list(highlight_text)
    bold_text_list = _normalize_list(bold_texts) or _normalize_list(bold_text)
    highlight_color_list = _normalize_list(highlight_colors)
    bold_color_list = _normalize_list(bold_colors)

    highlight_keywords = []
    for t in highlight_text_list:
        highlight_keywords.extend(_split_keywords(t))
    bold_keywords = []
    for t in bold_text_list:
        bold_keywords.extend(_split_keywords(t))
    base_text = text if use_bg_color else _build_inverse_masked_text(text, highlight_keywords + bold_keywords)
    _set_node_input(workflow, "16", "text", base_text)

    for i, node_id in enumerate(highlight_text_nodes):
        t = highlight_text_list[i] if i < len(highlight_text_list) else ""
        masked = _build_masked_text(text, _split_keywords(t))
        _set_node_input(workflow, node_id, "text", masked)

    for i, node_id in enumerate(bold_text_nodes):
        t = bold_text_list[i] if i < len(bold_text_list) else ""
        masked = _build_masked_text(text, _split_keywords(t))
        _set_node_input(workflow, node_id, "text", masked)

    if text_color:
        _set_node_input(workflow, "16", "font_color_hex", text_color)

    resolved_highlight = None
    if use_bg_color and bg_color:
        resolved_highlight = _clean_color(bg_color)
    elif highlight_color:
        resolved_highlight = _clean_color(highlight_color)
    elif highlight_color_list:
        resolved_highlight = _clean_color(highlight_color_list[0])

    if resolved_highlight:
        _set_node_input(workflow, "16", "highlight_color_hex", resolved_highlight)

    for i, node_id in enumerate(highlight_nodes):
        color = None
        if highlight_color_list:
            if i < len(highlight_color_list):
                color = _clean_color(highlight_color_list[i])
        else:
            color = _clean_color(highlight_color)
        if color:
            _set_node_input(workflow, node_id, "font_color_hex", color)

    base_bold_color = bold_color or text_color
    for i, node_id in enumerate(bold_nodes):
        color = None
        if bold_color_list:
            if i < len(bold_color_list):
                color = _clean_color(bold_color_list[i])
        else:
            color = _clean_color(base_bold_color)
        if color:
            _set_node_input(workflow, node_id, "font_color_hex", color)

    if bold_strength is not None:
        _set_node_input(workflow, "16", "bold_strength", 0)
        for node_id in highlight_nodes:
            _set_node_input(workflow, node_id, "bold_strength", 0)
        for node_id in bold_nodes:
            _set_node_input(workflow, node_id, "bold_strength", int(bold_strength))

    if highlight_opacity is not None:
        _set_node_input(workflow, "16", "highlight_opacity", float(highlight_opacity))
    else:
        _set_node_input(workflow, "16", "highlight_opacity", 1.0 if use_bg_color else 0.0)

    for node_id in highlight_nodes + bold_nodes:
        _set_node_input(workflow, node_id, "highlight_opacity", 0.0)

    if highlight_padding is not None:
        _set_node_input(workflow, "16", "highlight_padding", int(highlight_padding))
        _set_node_input(workflow, "37", "highlight_padding", int(highlight_padding))
        for node_id in highlight_nodes + bold_nodes:
            _set_node_input(workflow, node_id, "highlight_padding", int(highlight_padding))

    if font_name:
        _set_node_input(workflow, "16", "font_name", font_name)
        _set_node_input(workflow, "37", "font_name", font_name)
        for node_id in highlight_nodes + bold_nodes:
            _set_node_input(workflow, node_id, "font_name", font_name)

    base_font_size = font_size if font_size is not None else _get_node_input(workflow, "16", "font_size", 50)
    if base_font_size is not None:
        _set_node_input(workflow, "16", "font_size", int(base_font_size))
        _set_node_input(workflow, "37", "font_size", int(base_font_size))
        for node_id in highlight_nodes:
            _set_node_input(workflow, node_id, "font_size", int(base_font_size))

    if bold_size_delta is None:
        bold_size_delta = 2
    if base_font_size is not None:
        for node_id in bold_nodes:
            _set_node_input(workflow, node_id, "font_size", int(base_font_size) + int(bold_size_delta))

    if line_spacing is not None:
        _set_node_input(workflow, "16", "line_spacing", int(line_spacing))
        _set_node_input(workflow, "37", "line_spacing", int(line_spacing))
        for node_id in highlight_nodes + bold_nodes:
            _set_node_input(workflow, node_id, "line_spacing", int(line_spacing))

    if margins is not None:
        _set_node_input(workflow, "16", "margins", int(margins))

    client_id = uuid.uuid4().hex
    sys_logger.info(f"[{req_id}] ComfyUI queue prompt client_id={client_id}")
    prompt_id = _queue_prompt(workflow, client_id)

    history = _wait_for_history(prompt_id)
    image_info = _pick_output_image(history)
    return _download_image(image_info)


def run_rmbg_workflow(
    *,
    req_id: str,
    image_data_url: str,
    size: Optional[str] = None,
    aspect_ratio: Optional[str] = None,
) -> bytes:
    workflow = _load_workflow(COMFYUI_RMBG_PATH)
    workflow = copy.deepcopy(workflow)

    mime_type, img_bytes = parse_data_url(image_data_url)
    img_bytes, resized = _resize_image_if_needed(img_bytes, size, aspect_ratio)
    ext = "png"
    if not resized:
        if "jpeg" in mime_type or "jpg" in mime_type:
            ext = "jpg"
        elif "webp" in mime_type:
            ext = "webp"

    upload_name = f"rmbg-{uuid.uuid4().hex}.{ext}"
    sys_logger.info(f"[{req_id}] Uploading image to ComfyUI: {upload_name}")
    uploaded = _upload_image(img_bytes, upload_name)

    _set_node_input(workflow, "3", "image", uploaded)

    client_id = uuid.uuid4().hex
    sys_logger.info(f"[{req_id}] ComfyUI queue prompt client_id={client_id}")
    prompt_id = _queue_prompt(workflow, client_id)

    history = _wait_for_history(prompt_id)
    image_info = _pick_output_image(history)
    return _download_image(image_info)
