import copy
import glob
import json
import os
import re
import subprocess
import tempfile
import time
import unicodedata
import uuid
from base64 import b64decode
from io import BytesIO
from typing import Any, Callable, Dict, List, Optional
from urllib.parse import urlparse

import requests
from PIL import Image, ImageOps

from core.config import (
    COMFYUI_URL,
    COMFYUI_OVERLAYTEXT_PATH,
    COMFYUI_RMBG_PATH,
    COMFYUI_REMOVE_WATERMARK_PATH,
    COMFYUI_MULTI_ANGLESHOTS_PATH,
    COMFYUI_IMAGE_Z_IMAGE_TURBO_PATH,
    COMFYUI_VIDEO_WAN_I2V_PATH,
    COMFYUI_VIDEO_QWEN_I2V_PATH,
    COMFYUI_UPSCALE_PATH,
    COMFYUI_LINEART_PATH,
    COMFYUI_VIDEO_RMBG_PATH,
    COMFYUI_CONTROLNET_PATH,
    COMFYUI_OUTPUT_NODE_ID,
    COMFYUI_TIMEOUT_SEC,
    COMFYUI_VIDEO_UPSCALE_TIMEOUT_SEC,
    COMFYUI_VIDEO_LINEART_TIMEOUT_SEC,
    COMFYUI_VIDEO_RMBG_TIMEOUT_SEC,
    COMFYUI_POLL_INTERVAL_SEC,
)
from core.logging import sys_logger
from utils.images import parse_data_url
from utils.size import calculate_target_resolution


class ComfyUiError(RuntimeError):
    pass


OVERLAYTEXT_TOP_SAFE_AREA_RATIO = 0.06
OVERLAYTEXT_TOP_SAFE_AREA_RATIO_3_4 = 0.01
OVERLAYTEXT_SIDE_SAFE_AREA_RATIO = 0.105
OVERLAYTEXT_WRAP_WIDTH_SAFETY_RATIO = 0.94


def _load_workflow(path: str) -> Dict[str, Any]:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        raise ComfyUiError(f"Failed to load workflow: {path}: {e}")


def _upload_file(file_bytes: bytes, filename: str, mime_type: str = "application/octet-stream") -> str:
    files = {"image": (filename, file_bytes, mime_type)}
    data = {"overwrite": "true", "type": "input"}
    max_attempts = 3
    for attempt in range(max_attempts):
        resp = requests.post(f"{COMFYUI_URL}/upload/image", files=files, data=data, timeout=30)
        if resp.status_code == 200:
            payload = resp.json()
            return payload.get("name") or filename
        if resp.status_code in {502, 503, 504} and attempt < max_attempts - 1:
            backoff_sec = 0.4 * (attempt + 1)
            sys_logger.warning(
                f"ComfyUI upload transient error {resp.status_code} on attempt {attempt + 1}/{max_attempts}, "
                f"retrying in {backoff_sec:.1f}s"
            )
            time.sleep(backoff_sec)
            continue
        raise ComfyUiError(f"ComfyUI upload failed: {resp.status_code} {resp.text}")
    raise ComfyUiError("ComfyUI upload failed after retries")


def _upload_image(img_bytes: bytes, filename: str, mime_type: str = "image/png") -> str:
    return _upload_file(img_bytes, filename, mime_type)


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


def _wait_for_history(prompt_id: str, timeout_sec: Optional[int] = None) -> Dict[str, Any]:
    timeout = timeout_sec if timeout_sec and timeout_sec > 0 else COMFYUI_TIMEOUT_SEC
    deadline = time.time() + timeout
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
    raise ComfyUiError(f"ComfyUI timeout waiting for history ({timeout}s). last_err={last_err}")


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


def _pick_output_images(history: Dict[str, Any], preferred_node_ids: List[str]) -> List[Dict[str, Any]]:
    outputs = history.get("outputs") or {}
    picked: List[Dict[str, Any]] = []

    for node_id in preferred_node_ids:
        node_out = outputs.get(str(node_id))
        images = node_out.get("images") if isinstance(node_out, dict) else None
        if images:
            picked.append(images[0])

    if picked:
        return picked

    for _, node_output in outputs.items():
        images = node_output.get("images") if isinstance(node_output, dict) else None
        if images:
            picked.append(images[0])

    if picked:
        return picked

    raise ComfyUiError(f"No image outputs found in ComfyUI history: {list(outputs.keys())}")


def _pick_output_file(history: Dict[str, Any], preferred_node_ids: Optional[List[str]] = None) -> Dict[str, Any]:
    outputs = history.get("outputs") or {}
    ordered_ids: List[str] = [str(x) for x in (preferred_node_ids or [])]
    ordered_ids.extend([str(k) for k in outputs.keys() if str(k) not in ordered_ids])

    for node_id in ordered_ids:
        node_output = outputs.get(str(node_id))
        if not isinstance(node_output, dict):
            continue
        for key in ("videos", "gifs", "files", "images"):
            items = node_output.get(key)
            if isinstance(items, list) and items:
                return items[0]

    raise ComfyUiError(f"No downloadable output found in ComfyUI history: {list(outputs.keys())}")


def _download_file(file_info: Dict[str, Any]) -> bytes:
    params = {
        "filename": file_info.get("filename"),
        "subfolder": file_info.get("subfolder", ""),
        "type": file_info.get("type", "output"),
    }
    resp = requests.get(f"{COMFYUI_URL}/view", params=params, timeout=30)
    if resp.status_code != 200 or not resp.content:
        raise ComfyUiError(f"ComfyUI download failed: {resp.status_code} {resp.text}")
    return resp.content


def _download_image(image_info: Dict[str, Any]) -> bytes:
    return _download_file(image_info)


def _image_mime_from_ext(ext: str) -> str:
    ext = (ext or "").lower().strip(".")
    if ext in {"jpg", "jpeg"}:
        return "image/jpeg"
    if ext == "webp":
        return "image/webp"
    return "image/png"


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


def _find_workflow_node_id(
    workflow: Dict[str, Any],
    class_types: List[str],
    required_inputs: Optional[List[str]] = None,
) -> Optional[str]:
    targets = {str(item).strip().lower() for item in class_types if str(item).strip()}
    required = [str(item) for item in (required_inputs or []) if str(item)]

    for node_id, node in workflow.items():
        if not isinstance(node, dict):
            continue
        class_type = str(node.get("class_type") or "").strip().lower()
        if targets and class_type not in targets:
            continue
        inputs = node.get("inputs") or {}
        if required and any(key not in inputs for key in required):
            continue
        return str(node_id)
    return None


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
        # Normalize camera EXIF orientation before any resize/canvas operations.
        # Without this, portrait photos from phones may appear rotated by 90 degrees.
        img = ImageOps.exif_transpose(img)
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


def _normalize_orientation_if_needed(img_bytes: bytes) -> tuple[bytes, bool]:
    with Image.open(BytesIO(img_bytes)) as img:
        exif = img.getexif()
        orientation = exif.get(274, 1) if exif else 1
        if orientation == 1:
            return img_bytes, False

        normalized = ImageOps.exif_transpose(img)
        out = BytesIO()
        normalized.save(out, format="PNG")
        return out.getvalue(), True


def _split_keywords(text: Optional[str]) -> list[str]:
    if not text:
        return []
    parts = re.split(r"[\\n,，;；|]+", text)
    return [p.strip() for p in parts if p and p.strip()]


def _estimate_overlay_char_width_px(ch: str, font_size: float) -> float:
    if not ch:
        return 0.0
    if ch == "\t":
        return font_size * 2.0
    if ch.isspace():
        return font_size * 0.35

    if ch in ",.;:!|`'":
        return font_size * 0.32
    if ch in "，。；：！？、":
        return font_size * 0.5
    if ch in "()[]{}<>":
        return font_size * 0.45
    if ch in "（）【】《》":
        return font_size * 0.65

    eaw = unicodedata.east_asian_width(ch)
    if eaw in ("W", "F"):
        return font_size * 1.0
    if eaw == "A":
        return font_size * 0.85
    if ch.isdigit():
        return font_size * 0.58
    if ch.isascii() and ch.isalpha():
        return font_size * (0.68 if ch.isupper() else 0.6)
    if ch.isascii():
        return font_size * 0.55
    return font_size * 0.85


def _wrap_overlay_text_to_safe_width(text: str, max_width_px: float, font_size: float) -> str:
    if not text:
        return text
    if max_width_px <= 1 or font_size <= 0:
        return text

    width_limit = max(1.0, float(max_width_px) * OVERLAYTEXT_WRAP_WIDTH_SAFETY_RATIO)
    line_source = text.split("\n")
    wrapped_lines: list[str] = []

    for raw_line in line_source:
        if raw_line == "":
            wrapped_lines.append("")
            continue

        current_chars: list[str] = []
        current_width = 0.0

        for ch in raw_line:
            ch_width = _estimate_overlay_char_width_px(ch, font_size)
            if current_chars and current_width + ch_width > width_limit:
                wrapped_lines.append("".join(current_chars).rstrip())
                current_chars = []
                current_width = 0.0
                if ch.isspace():
                    continue

            current_chars.append(ch)
            current_width += ch_width

        wrapped_lines.append("".join(current_chars))

    return "\n".join(wrapped_lines)


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


MULTI_ANGLE_VARIANTS = [
    {"name": "close_up", "branch": "65:33", "prompt_node": "66", "save_node": "31"},
    {"name": "wide_shot", "branch": "65:35", "prompt_node": "67", "save_node": "34"},
    {"name": "45_right", "branch": "65:37", "prompt_node": "69", "save_node": "36"},
    {"name": "90_right", "branch": "65:39", "prompt_node": "68", "save_node": "38"},
    {"name": "aerial_view", "branch": "65:42", "prompt_node": "70", "save_node": "41"},
    {"name": "low_angle", "branch": "65:44", "prompt_node": "71", "save_node": "43"},
    {"name": "45_left", "branch": "65:46", "prompt_node": "73", "save_node": "45"},
    {"name": "90_left", "branch": "65:40", "prompt_node": "72", "save_node": "47"},
]


def _cfg_get(cfg: Dict[str, Any], *keys: str, default: Any = None) -> Any:
    for key in keys:
        if key in cfg and cfg[key] is not None:
            return cfg[key]
    return default


def _to_int(value: Any, fallback: int) -> int:
    if value is None:
        return fallback
    try:
        return int(str(value).strip())
    except Exception:
        return fallback


def _to_float(value: Any, fallback: float) -> float:
    if value is None:
        return fallback
    try:
        return float(str(value).strip())
    except Exception:
        return fallback


def _guess_mime_from_ext(ext: str) -> str:
    ext = (ext or "").lower()
    if ext == ".mp4":
        return "video/mp4"
    if ext == ".webm":
        return "video/webm"
    if ext == ".mov":
        return "video/quicktime"
    if ext == ".avi":
        return "video/x-msvideo"
    return "application/octet-stream"


def _guess_ext_from_mime(mime_type: str) -> str:
    mime_type = (mime_type or "").lower()
    if mime_type == "video/mp4":
        return ".mp4"
    if mime_type == "video/webm":
        return ".webm"
    if mime_type == "video/quicktime":
        return ".mov"
    if mime_type == "video/x-msvideo":
        return ".avi"
    return ".mp4"


def _decode_data_url(raw: str) -> tuple[str, bytes]:
    if not raw.startswith("data:") or "base64," not in raw:
        raise ComfyUiError("Invalid data URL for video input")
    header, b64_payload = raw.split("base64,", 1)
    mime_type = "video/mp4"
    if ";" in header:
        mime_type = header[5:].split(";", 1)[0] or "video/mp4"
    try:
        return mime_type, b64decode(b64_payload)
    except Exception as e:
        raise ComfyUiError(f"Failed to decode video data URL: {e}")


def _run_ffmpeg(cmd: List[str], req_id: str, stage: str) -> None:
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    except FileNotFoundError:
        raise ComfyUiError("ffmpeg is not installed on server")
    except Exception as e:
        raise ComfyUiError(f"ffmpeg failed to start at {stage}: {e}")

    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "").strip()
        if len(err) > 500:
            err = err[:500] + "..."
        raise ComfyUiError(f"ffmpeg failed at {stage}: {err}")

    sys_logger.info(f"[{req_id}] ffmpeg {stage} success")


def _materialize_video_input(video_input: str, temp_dir: str) -> str:
    src_dir = os.path.join(temp_dir, "src")
    os.makedirs(src_dir, exist_ok=True)

    if not video_input:
        raise ComfyUiError("Video input is empty")

    if video_input.startswith("data:"):
        mime_type, payload = _decode_data_url(video_input)
        ext = _guess_ext_from_mime(mime_type)
        path = os.path.join(src_dir, f"input{ext}")
        with open(path, "wb") as f:
            f.write(payload)
        return path

    if video_input.startswith("http://") or video_input.startswith("https://"):
        resp = requests.get(video_input, timeout=60)
        if resp.status_code != 200 or not resp.content:
            raise ComfyUiError(f"Failed to download video source: {resp.status_code}")
        parsed = urlparse(video_input)
        ext = os.path.splitext(parsed.path)[1].lower()
        if not ext:
            ext = _guess_ext_from_mime(resp.headers.get("Content-Type", "video/mp4"))
        path = os.path.join(src_dir, f"input{ext}")
        with open(path, "wb") as f:
            f.write(resp.content)
        return path

    if os.path.exists(video_input):
        ext = os.path.splitext(video_input)[1].lower() or ".mp4"
        path = os.path.join(src_dir, f"input{ext}")
        with open(video_input, "rb") as src, open(path, "wb") as dst:
            dst.write(src.read())
        return path

    raise ComfyUiError("Video input must be a data URL, http(s) URL, or existing local file")


def _split_video_segments(input_path: str, temp_dir: str, segment_seconds: int, req_id: str) -> List[str]:
    chunk_dir = os.path.join(temp_dir, "chunks")
    os.makedirs(chunk_dir, exist_ok=True)
    chunk_pattern = os.path.join(chunk_dir, "chunk_%04d.mp4")
    segment_seconds = max(1, segment_seconds)

    # Use forced keyframes to ensure deterministic N-second splitting.
    split_reencode_cmd = [
        "ffmpeg",
        "-y",
        "-i",
        input_path,
        "-map",
        "0:v:0",
        "-map",
        "0:a?",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "18",
        "-sc_threshold",
        "0",
        "-force_key_frames",
        f"expr:gte(t,n_forced*{segment_seconds})",
        "-c:a",
        "aac",
        "-f",
        "segment",
        "-segment_time",
        str(segment_seconds),
        "-segment_time_delta",
        "0.05",
        "-reset_timestamps",
        "1",
        chunk_pattern,
    ]
    _run_ffmpeg(split_reencode_cmd, req_id, "split(accurate)")

    chunks = sorted(glob.glob(os.path.join(chunk_dir, "chunk_*.mp4")))
    if not chunks:
        raise ComfyUiError("No video chunks generated during split")
    return chunks


def _concat_video_segments(segment_paths: List[str], temp_dir: str, req_id: str) -> str:
    if not segment_paths:
        raise ComfyUiError("No segments to merge")
    if len(segment_paths) == 1:
        return segment_paths[0]

    list_path = os.path.join(temp_dir, "concat_list.txt")
    with open(list_path, "w", encoding="utf-8") as f:
        for path in segment_paths:
            safe_path = path.replace("'", "'\\''")
            f.write(f"file '{safe_path}'\n")

    output_path = os.path.join(temp_dir, "merged.mp4")
    copy_cmd = [
        "ffmpeg",
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        list_path,
        "-c",
        "copy",
        output_path,
    ]
    try:
        _run_ffmpeg(copy_cmd, req_id, "concat(copy)")
        return output_path
    except ComfyUiError:
        reencode_cmd = [
            "ffmpeg",
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            list_path,
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "18",
            "-c:a",
            "aac",
            output_path,
        ]
        _run_ffmpeg(reencode_cmd, req_id, "concat(reencode)")
        return output_path


def _read_video_dimensions(input_path: str) -> tuple[int, int]:
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height",
        "-of",
        "json",
        input_path,
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise ComfyUiError(f"ffprobe failed: {proc.stderr.strip() or proc.stdout.strip() or 'unknown error'}")
    try:
        payload = json.loads(proc.stdout or "{}")
        stream = (payload.get("streams") or [])[0] or {}
        width = max(1, int(stream.get("width") or 0))
        height = max(1, int(stream.get("height") or 0))
    except Exception as exc:
        raise ComfyUiError(f"failed to parse ffprobe output: {exc}") from exc
    if width <= 0 or height <= 0:
        raise ComfyUiError("ffprobe did not return valid video dimensions")
    return width, height


def _trim_video_segment(
    input_path: str,
    output_path: str,
    start_sec: float,
    end_sec: float,
    req_id: str,
    segment_index: int,
    output_resolution: str = "720p",
    include_audio: bool = False,
) -> None:
    start_sec = max(0.0, float(start_sec or 0.0))
    end_sec = max(start_sec, float(end_sec or 0.0))
    duration_sec = max(0.05, end_sec - start_sec)
    trim_cmd = [
        "ffmpeg",
        "-y",
        "-ss",
        f"{start_sec:.3f}",
        "-i",
        input_path,
        "-t",
        f"{duration_sec:.3f}",
        "-map",
        "0:v:0",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "18",
    ]
    if include_audio:
        trim_cmd.extend([
            "-map",
            "0:a?",
        ])
    resolution_text = str(output_resolution or "").strip().lower()
    if resolution_text in {"480p", "720p", "1080p"}:
        target = int(resolution_text[:-1])
        width, height = _read_video_dimensions(input_path)
        if width >= height:
            trim_cmd.extend(["-vf", f"scale=-2:{target}"])
        else:
            trim_cmd.extend(["-vf", f"scale={target}:-2"])
    if include_audio:
        trim_cmd.extend([
            "-c:a",
            "aac",
        ])
    else:
        trim_cmd.extend([
            "-map",
            "-0:a",
            "-an",
            "-sn",
            "-dn",
        ])
    trim_cmd.extend([
        "-movflags",
        "+faststart",
        output_path,
    ])
    _run_ffmpeg(trim_cmd, req_id, f"trim(segment_{segment_index:02d})")


def run_video_split_workflow(
    *,
    req_id: str,
    video_input: str,
    segments: List[Dict[str, Any]],
    output_resolution: str = "720p",
    include_audio: bool = False,
) -> tuple[List[bytes], str]:
    if not segments:
        raise ComfyUiError("No video segments provided")

    with tempfile.TemporaryDirectory(prefix="comfyui-video-split-") as temp_dir:
        source_path = _materialize_video_input(video_input, temp_dir)
        output_dir = os.path.join(temp_dir, "split_outputs")
        os.makedirs(output_dir, exist_ok=True)

        output_bytes_list: List[bytes] = []
        for index, segment in enumerate(segments, start=1):
            start_sec = max(0.0, float(segment.get("start_sec") or 0.0))
            end_sec = float(segment.get("end_sec") or 0.0)
            if end_sec <= start_sec:
                raise ComfyUiError(f"Invalid segment range at index {index}: end_sec must be greater than start_sec")

            output_path = os.path.join(output_dir, f"segment_{index:03d}.mp4")
            _trim_video_segment(
                source_path,
                output_path,
                start_sec,
                end_sec,
                req_id,
                index,
                output_resolution=output_resolution,
                include_audio=include_audio,
            )
            with open(output_path, "rb") as f:
                payload = f.read()
            if not payload:
                raise ComfyUiError(f"Empty video segment generated at index {index}")
            output_bytes_list.append(payload)

        return output_bytes_list, "video/mp4"


def run_overlaytext_workflow(
    *,
    req_id: str,
    image_data_url: str,
    text: str,
    font_name: Optional[str] = None,
    font_size: Optional[int] = None,
    bold_strength: Optional[int] = None,
    bold_text_1: Optional[str] = None,
    bold_text_2: Optional[str] = None,
    bold_text_3: Optional[str] = None,
    bold_text_4: Optional[str] = None,
    bold_text_5: Optional[str] = None,
    font_color: Optional[str] = None,
    text_bg_color: Optional[str] = None,
    text_bg_opacity: Optional[float] = None,
    text_bg_padding: Optional[int] = None,
    highlight_text_1: Optional[str] = None,
    highlight_text_2: Optional[str] = None,
    highlight_text_3: Optional[str] = None,
    highlight_text_4: Optional[str] = None,
    highlight_text_5: Optional[str] = None,
    highlight_color_1: Optional[str] = None,
    highlight_color_2: Optional[str] = None,
    highlight_color_3: Optional[str] = None,
    highlight_color_4: Optional[str] = None,
    highlight_color_5: Optional[str] = None,
    highlight_opacity: Optional[float] = None,
    highlight_padding: Optional[int] = None,
    align: Optional[str] = None,
    justify: Optional[str] = None,
    margins: Optional[int] = None,
    line_spacing: Optional[int] = None,
    position_x: Optional[float] = None,
    position_y: Optional[float] = None,
    ratio_adapt_3_4: Optional[bool] = False,
    rotation_angle: Optional[float] = None,
    rotation_options: Optional[str] = None,
    font_color_hex: Optional[str] = None,
    text_bg_color_hex: Optional[str] = None,
    highlight_color_hex_1: Optional[str] = None,
    highlight_color_hex_2: Optional[str] = None,
    highlight_color_hex_3: Optional[str] = None,
    highlight_color_hex_4: Optional[str] = None,
    highlight_color_hex_5: Optional[str] = None,
) -> bytes:
    workflow = _load_workflow(COMFYUI_OVERLAYTEXT_PATH)
    workflow = copy.deepcopy(workflow)

    mime_type, img_bytes = parse_data_url(image_data_url)
    top_safe_area_ratio = (
        OVERLAYTEXT_TOP_SAFE_AREA_RATIO_3_4 if bool(ratio_adapt_3_4) else OVERLAYTEXT_TOP_SAFE_AREA_RATIO
    )
    image_width_px = 0
    safe_top_offset_px = 0.0
    safe_side_margin_px = 0
    try:
        with Image.open(BytesIO(img_bytes)) as img:
            image_width_px = int(img.width)
            safe_top_offset_px = float(round(img.height * top_safe_area_ratio))
            safe_side_margin_px = int(round(img.width * OVERLAYTEXT_SIDE_SAFE_AREA_RATIO))
    except Exception:
        # Best effort only; if size parsing fails, fall back to caller-provided values.
        image_width_px = 0
        safe_top_offset_px = 0.0
        safe_side_margin_px = 0
    ext = "png"
    if "jpeg" in mime_type or "jpg" in mime_type:
        ext = "jpg"
    elif "webp" in mime_type:
        ext = "webp"

    upload_name = f"textoverlay-{uuid.uuid4().hex}.{ext}"
    sys_logger.info(f"[{req_id}] Uploading image to ComfyUI: {upload_name}")
    uploaded = _upload_image(img_bytes, upload_name, _image_mime_from_ext(ext))

    _set_node_input(workflow, "2", "image", uploaded)

    def _set_if_not_none(key: str, value: Any, cast: Optional[type] = None) -> None:
        if value is None:
            return
        _set_node_input(workflow, "6", key, cast(value) if cast else value)

    _set_if_not_none("font_name", font_name)
    _set_if_not_none("font_size", font_size, int)
    _set_if_not_none("bold_strength", bold_strength, int)
    _set_if_not_none("bold_text_1", bold_text_1)
    _set_if_not_none("bold_text_2", bold_text_2)
    _set_if_not_none("bold_text_3", bold_text_3)
    _set_if_not_none("bold_text_4", bold_text_4)
    _set_if_not_none("bold_text_5", bold_text_5)
    _set_if_not_none("font_color", font_color)
    _set_if_not_none("text_bg_color", text_bg_color)
    _set_if_not_none("text_bg_opacity", text_bg_opacity, float)
    _set_if_not_none("text_bg_padding", text_bg_padding, int)
    _set_if_not_none("highlight_text_1", highlight_text_1)
    _set_if_not_none("highlight_text_2", highlight_text_2)
    _set_if_not_none("highlight_text_3", highlight_text_3)
    _set_if_not_none("highlight_text_4", highlight_text_4)
    _set_if_not_none("highlight_text_5", highlight_text_5)
    _set_if_not_none("highlight_color_1", highlight_color_1)
    _set_if_not_none("highlight_color_2", highlight_color_2)
    _set_if_not_none("highlight_color_3", highlight_color_3)
    _set_if_not_none("highlight_color_4", highlight_color_4)
    _set_if_not_none("highlight_color_5", highlight_color_5)
    _set_if_not_none("highlight_opacity", highlight_opacity, float)
    _set_if_not_none("highlight_padding", highlight_padding, int)
    _set_if_not_none("align", align)
    _set_if_not_none("justify", justify)
    requested_margins = int(margins) if margins is not None else 0
    effective_margins = max(requested_margins, safe_side_margin_px)
    _set_node_input(workflow, "6", "margins", effective_margins)
    _set_if_not_none("line_spacing", line_spacing, int)
    _set_if_not_none("position_x", position_x, float)
    effective_position_y = safe_top_offset_px + (float(position_y) if position_y is not None else 0.0)
    _set_node_input(workflow, "6", "position_y", effective_position_y)
    _set_if_not_none("rotation_angle", rotation_angle, float)
    _set_if_not_none("rotation_options", rotation_options)
    _set_if_not_none("font_color_hex", font_color_hex)
    _set_if_not_none("text_bg_color_hex", text_bg_color_hex)
    _set_if_not_none("highlight_color_hex_1", highlight_color_hex_1)
    _set_if_not_none("highlight_color_hex_2", highlight_color_hex_2)
    _set_if_not_none("highlight_color_hex_3", highlight_color_hex_3)
    _set_if_not_none("highlight_color_hex_4", highlight_color_hex_4)
    _set_if_not_none("highlight_color_hex_5", highlight_color_hex_5)

    effective_font_size = int(_get_node_input(workflow, "6", "font_size", 50) or 50)
    effective_text_bg_padding = int(_get_node_input(workflow, "6", "text_bg_padding", 0) or 0)
    effective_bold_strength = int(_get_node_input(workflow, "6", "bold_strength", 0) or 0)
    wrap_padding_px = max(0, effective_text_bg_padding) * 2 + max(0, effective_bold_strength) * 2
    safe_text_width_px = max(1, image_width_px - effective_margins * 2 - wrap_padding_px)
    wrapped_text = (
        _wrap_overlay_text_to_safe_width(text, safe_text_width_px, float(effective_font_size))
        if image_width_px > 0
        else text
    )
    if wrapped_text != text:
        sys_logger.info(
            f"[{req_id}] Auto-wrapped overlay text to keep safe area "
            f"(img_w={image_width_px}, margins={effective_margins}, font_size={effective_font_size})"
        )
    _set_node_input(workflow, "6", "text", wrapped_text)

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
    img_bytes, orientation_fixed = _normalize_orientation_if_needed(img_bytes)
    img_bytes, resized = _resize_image_if_needed(img_bytes, size, aspect_ratio)
    ext = "png"
    if not resized and not orientation_fixed:
        if "jpeg" in mime_type or "jpg" in mime_type:
            ext = "jpg"
        elif "webp" in mime_type:
            ext = "webp"

    upload_name = f"rmbg-{uuid.uuid4().hex}.{ext}"
    sys_logger.info(f"[{req_id}] Uploading image to ComfyUI: {upload_name}")
    uploaded = _upload_image(img_bytes, upload_name, _image_mime_from_ext(ext))

    _set_node_input(workflow, "3", "image", uploaded)

    client_id = uuid.uuid4().hex
    sys_logger.info(f"[{req_id}] ComfyUI queue prompt client_id={client_id}")
    prompt_id = _queue_prompt(workflow, client_id)

    history = _wait_for_history(prompt_id)
    image_info = _pick_output_image(history)
    return _download_image(image_info)


def run_remove_watermark_workflow(
    *,
    req_id: str,
    image_data_url: str,
    size: Optional[str] = None,
    aspect_ratio: Optional[str] = None,
) -> bytes:
    workflow = _load_workflow(COMFYUI_REMOVE_WATERMARK_PATH)
    workflow = copy.deepcopy(workflow)

    mime_type, img_bytes = parse_data_url(image_data_url)
    img_bytes, orientation_fixed = _normalize_orientation_if_needed(img_bytes)
    img_bytes, resized = _resize_image_if_needed(img_bytes, size, aspect_ratio)
    ext = "png"
    if not resized and not orientation_fixed:
        if "jpeg" in mime_type or "jpg" in mime_type:
            ext = "jpg"
        elif "webp" in mime_type:
            ext = "webp"

    upload_name = f"remove-watermark-{uuid.uuid4().hex}.{ext}"
    sys_logger.info(f"[{req_id}] Uploading image to ComfyUI: {upload_name}")
    uploaded = _upload_image(img_bytes, upload_name, _image_mime_from_ext(ext))

    load_node_id = _find_workflow_node_id(workflow, ["LoadImage"], ["image"]) or "78"
    _set_node_input(workflow, load_node_id, "image", uploaded)

    client_id = uuid.uuid4().hex
    sys_logger.info(f"[{req_id}] ComfyUI queue prompt client_id={client_id}")
    prompt_id = _queue_prompt(workflow, client_id)

    history = _wait_for_history(prompt_id)
    image_info = _pick_output_image(history)
    return _download_image(image_info)


def run_multi_angleshots_workflow(
    *,
    req_id: str,
    image_data_url: str,
    config: Optional[Dict[str, Any]] = None,
) -> List[bytes]:
    workflow = _load_workflow(COMFYUI_MULTI_ANGLESHOTS_PATH)
    workflow = copy.deepcopy(workflow)
    cfg = config or {}

    mime_type, img_bytes = parse_data_url(image_data_url)
    img_bytes, orientation_fixed = _normalize_orientation_if_needed(img_bytes)

    ext = "png"
    if not orientation_fixed:
        if "jpeg" in mime_type or "jpg" in mime_type:
            ext = "jpg"
        elif "webp" in mime_type:
            ext = "webp"

    upload_name = f"multi-angleshots-{uuid.uuid4().hex}.{ext}"
    sys_logger.info(f"[{req_id}] Uploading image to ComfyUI: {upload_name}")
    uploaded = _upload_image(img_bytes, upload_name, _image_mime_from_ext(ext))
    _set_node_input(workflow, "25", "image", uploaded)

    _set_node_input(
        workflow,
        "48:10",
        "clip_name",
        _cfg_get(cfg, "clip_name", default=_get_node_input(workflow, "48:10", "clip_name")),
    )
    _set_node_input(
        workflow,
        "48:10",
        "type",
        _cfg_get(cfg, "clip_type", default=_get_node_input(workflow, "48:10", "type")),
    )
    _set_node_input(
        workflow,
        "48:10",
        "device",
        _cfg_get(cfg, "clip_device", default=_get_node_input(workflow, "48:10", "device")),
    )
    _set_node_input(
        workflow,
        "48:12",
        "unet_name",
        _cfg_get(cfg, "unet_name", default=_get_node_input(workflow, "48:12", "unet_name")),
    )
    _set_node_input(
        workflow,
        "48:12",
        "weight_dtype",
        _cfg_get(cfg, "unet_weight_dtype", default=_get_node_input(workflow, "48:12", "weight_dtype")),
    )
    _set_node_input(
        workflow,
        "48:9",
        "vae_name",
        _cfg_get(cfg, "vae_name", default=_get_node_input(workflow, "48:9", "vae_name")),
    )
    _set_node_input(
        workflow,
        "48:20",
        "lora_name",
        _cfg_get(cfg, "lora_1_name", default=_get_node_input(workflow, "48:20", "lora_name")),
    )
    _set_node_input(
        workflow,
        "48:20",
        "strength_model",
        _to_float(
            _cfg_get(cfg, "lora_1_strength", default=_get_node_input(workflow, "48:20", "strength_model")),
            _to_float(_get_node_input(workflow, "48:20", "strength_model", 1), 1),
        ),
    )
    _set_node_input(
        workflow,
        "48:26",
        "lora_name",
        _cfg_get(cfg, "lora_2_name", default=_get_node_input(workflow, "48:26", "lora_name")),
    )
    _set_node_input(
        workflow,
        "48:26",
        "strength_model",
        _to_float(
            _cfg_get(cfg, "lora_2_strength", default=_get_node_input(workflow, "48:26", "strength_model")),
            _to_float(_get_node_input(workflow, "48:26", "strength_model", 1), 1),
        ),
    )

    angles = cfg.get("angles") if isinstance(cfg.get("angles"), list) else []
    angle_prompts = cfg.get("angle_prompts") if isinstance(cfg.get("angle_prompts"), list) else []
    angle_seeds = cfg.get("angle_seeds") if isinstance(cfg.get("angle_seeds"), list) else []
    angle_prefixes = cfg.get("angle_filename_prefixes") if isinstance(cfg.get("angle_filename_prefixes"), list) else []

    global_negative = _cfg_get(cfg, "negative_prompt")
    global_steps = _cfg_get(cfg, "steps")
    global_cfg_scale = _cfg_get(cfg, "cfg")
    global_denoise = _cfg_get(cfg, "denoise")
    global_shift = _cfg_get(cfg, "shift")
    global_cfgnorm_strength = _cfg_get(cfg, "cfgnorm_strength")
    global_upscale_method = _cfg_get(cfg, "upscale_method")
    global_megapixels = _cfg_get(cfg, "megapixels")
    global_resolution_steps = _cfg_get(cfg, "resolution_steps")

    for idx, variant in enumerate(MULTI_ANGLE_VARIANTS):
        branch = variant["branch"]
        prompt_node_id = variant["prompt_node"]
        save_node_id = variant["save_node"]
        angle_cfg = angles[idx] if idx < len(angles) and isinstance(angles[idx], dict) else {}

        default_prompt = _get_node_input(workflow, prompt_node_id, "value", "")
        prompt_value = _cfg_get(angle_cfg, "prompt")
        if prompt_value is None and idx < len(angle_prompts):
            prompt_value = angle_prompts[idx]
        if prompt_value is None:
            prompt_value = default_prompt
        _set_node_input(workflow, prompt_node_id, "value", str(prompt_value))

        default_prefix = _get_node_input(workflow, save_node_id, "filename_prefix", f"ComfyUI-{variant['name']}")
        prefix_value = _cfg_get(angle_cfg, "filename_prefix")
        if prefix_value is None and idx < len(angle_prefixes):
            prefix_value = angle_prefixes[idx]
        if prefix_value is None:
            prefix_value = default_prefix
        _set_node_input(workflow, save_node_id, "filename_prefix", str(prefix_value))

        cfgnorm_node_id = f"{branch}:8"
        sampling_node_id = f"{branch}:11"
        negative_node_id = f"{branch}:14"
        sampler_node_id = f"{branch}:21"
        scale_node_id = f"{branch}:28"

        default_negative = _get_node_input(workflow, negative_node_id, "prompt", "")
        negative_prompt = _cfg_get(angle_cfg, "negative_prompt", default=global_negative)
        if negative_prompt is None:
            negative_prompt = default_negative
        _set_node_input(workflow, negative_node_id, "prompt", str(negative_prompt))

        default_seed = _to_int(_get_node_input(workflow, sampler_node_id, "seed", 0), 0)
        seed_value = _cfg_get(angle_cfg, "seed")
        if seed_value is None and idx < len(angle_seeds):
            seed_value = angle_seeds[idx]
        if seed_value is None:
            seed_value = default_seed
        _set_node_input(workflow, sampler_node_id, "seed", _to_int(seed_value, default_seed))

        default_steps = _to_int(_get_node_input(workflow, sampler_node_id, "steps", 4), 4)
        steps_value = _to_int(_cfg_get(angle_cfg, "steps", default=global_steps), default_steps)
        _set_node_input(workflow, sampler_node_id, "steps", steps_value)

        default_cfg_scale = _to_float(_get_node_input(workflow, sampler_node_id, "cfg", 1), 1.0)
        cfg_scale_value = _to_float(_cfg_get(angle_cfg, "cfg", default=global_cfg_scale), default_cfg_scale)
        _set_node_input(workflow, sampler_node_id, "cfg", cfg_scale_value)

        sampler_name = _cfg_get(
            angle_cfg,
            "sampler_name",
            default=_cfg_get(cfg, "sampler_name", default=_get_node_input(workflow, sampler_node_id, "sampler_name", "euler")),
        )
        _set_node_input(workflow, sampler_node_id, "sampler_name", sampler_name)

        scheduler_name = _cfg_get(
            angle_cfg,
            "scheduler",
            default=_cfg_get(cfg, "scheduler", default=_get_node_input(workflow, sampler_node_id, "scheduler", "simple")),
        )
        _set_node_input(workflow, sampler_node_id, "scheduler", scheduler_name)

        default_denoise = _to_float(_get_node_input(workflow, sampler_node_id, "denoise", 1), 1.0)
        denoise_value = _to_float(_cfg_get(angle_cfg, "denoise", default=global_denoise), default_denoise)
        _set_node_input(workflow, sampler_node_id, "denoise", denoise_value)

        default_shift = _to_float(_get_node_input(workflow, sampling_node_id, "shift", 3), 3.0)
        shift_value = _to_float(_cfg_get(angle_cfg, "shift", default=global_shift), default_shift)
        _set_node_input(workflow, sampling_node_id, "shift", shift_value)

        default_cfgnorm = _to_float(_get_node_input(workflow, cfgnorm_node_id, "strength", 1), 1.0)
        cfgnorm_value = _to_float(_cfg_get(angle_cfg, "cfgnorm_strength", default=global_cfgnorm_strength), default_cfgnorm)
        _set_node_input(workflow, cfgnorm_node_id, "strength", cfgnorm_value)

        default_upscale_method = _get_node_input(workflow, scale_node_id, "upscale_method", "nearest-exact")
        upscale_method = _cfg_get(angle_cfg, "upscale_method", default=global_upscale_method)
        if upscale_method is None:
            upscale_method = default_upscale_method
        _set_node_input(workflow, scale_node_id, "upscale_method", upscale_method)

        default_megapixels = _to_float(_get_node_input(workflow, scale_node_id, "megapixels", 1), 1.0)
        megapixels_value = _to_float(_cfg_get(angle_cfg, "megapixels", default=global_megapixels), default_megapixels)
        _set_node_input(workflow, scale_node_id, "megapixels", megapixels_value)

        default_resolution_steps = _to_int(_get_node_input(workflow, scale_node_id, "resolution_steps", 1), 1)
        resolution_steps_value = _to_int(
            _cfg_get(angle_cfg, "resolution_steps", default=global_resolution_steps),
            default_resolution_steps,
        )
        _set_node_input(workflow, scale_node_id, "resolution_steps", resolution_steps_value)

    client_id = uuid.uuid4().hex
    sys_logger.info(f"[{req_id}] ComfyUI multi-angleshots queue prompt client_id={client_id}")
    prompt_id = _queue_prompt(workflow, client_id)
    history = _wait_for_history(prompt_id)

    save_node_ids = [item["save_node"] for item in MULTI_ANGLE_VARIANTS]
    image_infos = _pick_output_images(history, save_node_ids)
    if len(image_infos) < len(save_node_ids):
        raise ComfyUiError(
            f"Expected {len(save_node_ids)} outputs, got {len(image_infos)}. history_outputs={list((history.get('outputs') or {}).keys())}"
        )

    return [_download_image(info) for info in image_infos[: len(save_node_ids)]]


def run_image_z_image_turbo_workflow(
    *,
    req_id: str,
    prompt: str,
    width: int = 1024,
    height: int = 1024,
    seed: Optional[int] = None,
    filename_prefix: Optional[str] = None,
) -> bytes:
    workflow = _load_workflow(COMFYUI_IMAGE_Z_IMAGE_TURBO_PATH)
    workflow = copy.deepcopy(workflow)

    _set_node_input(workflow, "58", "value", str(prompt or "").strip())
    _set_node_input(workflow, "57:13", "width", max(64, int(width or 1024)))
    _set_node_input(workflow, "57:13", "height", max(64, int(height or 1024)))
    if seed is not None:
        _set_node_input(workflow, "57:3", "seed", int(seed))
    if filename_prefix:
        _set_node_input(workflow, "9", "filename_prefix", str(filename_prefix))

    client_id = uuid.uuid4().hex
    sys_logger.info(f"[{req_id}] ComfyUI z-image queue prompt client_id={client_id}")
    prompt_id = _queue_prompt(workflow, client_id)
    history = _wait_for_history(prompt_id)
    image_info = _pick_output_image(history)
    return _download_image(image_info)


def _run_wan_style_i2v_workflow(
    *,
    workflow_path: str,
    workflow_label: str,
    req_id: str,
    image_bytes: bytes,
    positive_prompt: str,
    negative_prompt: Optional[str] = None,
    width: int = 640,
    height: int = 640,
    length: int = 81,
    fps: int = 16,
    seed: Optional[int] = None,
    filename_prefix: Optional[str] = None,
) -> tuple[bytes, str]:
    workflow = _load_workflow(workflow_path)
    workflow = copy.deepcopy(workflow)

    image_upload_name = f"{workflow_label}-{uuid.uuid4().hex}.png"
    sys_logger.info(f"[{req_id}] Uploading image to ComfyUI for {workflow_label}: {image_upload_name}")
    uploaded_image = _upload_image(image_bytes, image_upload_name)

    _set_node_input(workflow, "97", "image", uploaded_image)
    _set_node_input(workflow, "93", "text", str(positive_prompt or "").strip())
    if negative_prompt is not None:
        _set_node_input(workflow, "89", "text", str(negative_prompt))

    _set_node_input(workflow, "98", "width", max(64, int(width or 640)))
    _set_node_input(workflow, "98", "height", max(64, int(height or 640)))
    _set_node_input(workflow, "98", "length", max(1, int(length or 81)))
    _set_node_input(workflow, "94", "fps", max(1, int(fps or 16)))

    if seed is not None:
        seed_int = int(seed)
        _set_node_input(workflow, "86", "noise_seed", seed_int)
        _set_node_input(workflow, "85", "noise_seed", seed_int)

    if filename_prefix:
        _set_node_input(workflow, "108", "filename_prefix", str(filename_prefix))

    client_id = uuid.uuid4().hex
    sys_logger.info(f"[{req_id}] ComfyUI {workflow_label} queue prompt client_id={client_id}")
    prompt_id = _queue_prompt(workflow, client_id)
    history = _wait_for_history(prompt_id, timeout_sec=COMFYUI_VIDEO_UPSCALE_TIMEOUT_SEC)
    output_info = _pick_output_file(history, preferred_node_ids=["108"])
    output_bytes = _download_file(output_info)
    output_name = str(output_info.get("filename") or "")
    output_ext = os.path.splitext(output_name)[1].lower() or ".mp4"
    output_mime = _guess_mime_from_ext(output_ext)
    if output_mime == "application/octet-stream":
        output_mime = "video/mp4"
    return output_bytes, output_mime


def run_video_wan_i2v_workflow(
    *,
    req_id: str,
    image_bytes: bytes,
    positive_prompt: str,
    negative_prompt: Optional[str] = None,
    width: int = 640,
    height: int = 640,
    length: int = 81,
    fps: int = 16,
    seed: Optional[int] = None,
    filename_prefix: Optional[str] = None,
) -> tuple[bytes, str]:
    return _run_wan_style_i2v_workflow(
        workflow_path=COMFYUI_VIDEO_WAN_I2V_PATH,
        workflow_label="wan-i2v",
        req_id=req_id,
        image_bytes=image_bytes,
        positive_prompt=positive_prompt,
        negative_prompt=negative_prompt,
        width=width,
        height=height,
        length=length,
        fps=fps,
        seed=seed,
        filename_prefix=filename_prefix,
    )


def run_qwen_i2v_workflow(
    *,
    req_id: str,
    image_bytes: bytes,
    positive_prompt: str,
    negative_prompt: Optional[str] = None,
    width: int = 640,
    height: int = 640,
    length: int = 81,
    fps: int = 16,
    seed: Optional[int] = None,
    filename_prefix: Optional[str] = None,
) -> tuple[bytes, str]:
    return _run_wan_style_i2v_workflow(
        workflow_path=COMFYUI_VIDEO_QWEN_I2V_PATH,
        workflow_label="qwen-i2v",
        req_id=req_id,
        image_bytes=image_bytes,
        positive_prompt=positive_prompt,
        negative_prompt=negative_prompt,
        width=width,
        height=height,
        length=length,
        fps=fps,
        seed=seed,
        filename_prefix=filename_prefix,
    )


def run_controlnet_pose_video_workflow(
    *,
    req_id: str,
    image_data_url: str,
    control_video_input: str,
    positive_prompt: Optional[str] = None,
    negative_prompt: Optional[str] = None,
    width: Optional[int] = None,
    height: Optional[int] = None,
    length: Optional[int] = None,
    fps: Optional[int] = None,
    seed: Optional[int] = None,
    filename_prefix: Optional[str] = None,
) -> tuple[bytes, str]:
    workflow = _load_workflow(COMFYUI_CONTROLNET_PATH)
    workflow = copy.deepcopy(workflow)

    mime_type, img_bytes = parse_data_url(image_data_url)
    img_bytes, orientation_fixed = _normalize_orientation_if_needed(img_bytes)
    img_ext = "png"
    if not orientation_fixed:
        if "jpeg" in mime_type or "jpg" in mime_type:
            img_ext = "jpg"
        elif "webp" in mime_type:
            img_ext = "webp"
    image_upload_name = f"controlnet-ref-{uuid.uuid4().hex}.{img_ext}"
    sys_logger.info(f"[{req_id}] Uploading ControlNet ref image to ComfyUI: {image_upload_name}")
    uploaded_image = _upload_file(img_bytes, image_upload_name, f"image/{'jpeg' if img_ext == 'jpg' else img_ext}")
    _set_node_input(workflow, "178", "image", uploaded_image)

    with tempfile.TemporaryDirectory(prefix="comfyui-controlnet-pose-") as temp_dir:
        control_path = _materialize_video_input(control_video_input, temp_dir)
        video_ext = os.path.splitext(control_path)[1].lower() or ".mp4"
        video_mime = _guess_mime_from_ext(video_ext)
        with open(control_path, "rb") as f:
            control_bytes = f.read()
        video_upload_name = f"controlnet-pose-{uuid.uuid4().hex}{video_ext}"
        sys_logger.info(f"[{req_id}] Uploading ControlNet pose video to ComfyUI: {video_upload_name}")
        uploaded_video = _upload_file(control_bytes, video_upload_name, video_mime)
        _set_node_input(workflow, "174", "file", uploaded_video)

    if positive_prompt is not None:
        _set_node_input(workflow, "179", "text", str(positive_prompt))
    if negative_prompt is not None:
        _set_node_input(workflow, "162", "text", str(negative_prompt))
    if width is not None:
        _set_node_input(
            workflow,
            "180",
            "width",
            max(1, _to_int(width, _to_int(_get_node_input(workflow, "180", "width", 480), 480))),
        )
    if height is not None:
        _set_node_input(
            workflow,
            "180",
            "height",
            max(1, _to_int(height, _to_int(_get_node_input(workflow, "180", "height", 720), 720))),
        )
    if length is not None:
        _set_node_input(workflow, "180", "length", max(1, _to_int(length, _to_int(_get_node_input(workflow, "180", "length", 49), 49))))
    if fps is not None:
        _set_node_input(workflow, "163", "fps", max(1, _to_int(fps, _to_int(_get_node_input(workflow, "163", "fps", 16), 16))))
    if seed is not None:
        _set_node_input(workflow, "169", "noise_seed", _to_int(seed, _to_int(_get_node_input(workflow, "169", "noise_seed", 0), 0)))

    save_prefix = (filename_prefix or "").strip() or f"video/controlnet-pose-{req_id}"
    _set_node_input(workflow, "170", "filename_prefix", save_prefix)

    client_id = uuid.uuid4().hex
    sys_logger.info(f"[{req_id}] ComfyUI controlnet-pose queue prompt client_id={client_id}")
    prompt_id = _queue_prompt(workflow, client_id)
    history = _wait_for_history(prompt_id, timeout_sec=COMFYUI_VIDEO_UPSCALE_TIMEOUT_SEC)

    output_info = _pick_output_file(history, preferred_node_ids=["170"])
    output_bytes = _download_file(output_info)
    output_name = str(output_info.get("filename") or "")
    output_ext = os.path.splitext(output_name)[1].lower() or ".mp4"
    output_mime = _guess_mime_from_ext(output_ext)
    if output_mime == "application/octet-stream":
        output_mime = "video/mp4"
    return output_bytes, output_mime


def run_video_upscale_workflow(
    *,
    req_id: str,
    video_input: str,
    segment_seconds: int = 3,
    output_resolution: int = 1440,
    workflow_batch_size: int = 1,
    progress_cb: Optional[Callable[[int, int], None]] = None,
) -> tuple[bytes, str]:
    workflow_template = _load_workflow(COMFYUI_UPSCALE_PATH)
    load_node_id = _find_workflow_node_id(
        workflow_template,
        ["LoadVideo", "VHS_LoadVideo", "VHS_LoadVideoPath"],
        required_inputs=["file"],
    ) or ("9" if str("9") in workflow_template else None)
    save_node_id = _find_workflow_node_id(
        workflow_template,
        ["SaveVideo", "VHS_VideoCombine"],
        required_inputs=["filename_prefix"],
    ) or ("12" if str("12") in workflow_template else None)
    upscale_node_id = _find_workflow_node_id(
        workflow_template,
        ["SeedVR2VideoUpscaler"],
        required_inputs=["resolution", "batch_size"],
    ) or ("10" if str("10") in workflow_template else None)
    if not load_node_id:
        raise ComfyUiError(
            f"Upscale workflow missing video load node (class_type in LoadVideo/VHS_LoadVideo/VHS_LoadVideoPath). "
            f"workflow={COMFYUI_UPSCALE_PATH}"
        )
    if not save_node_id:
        raise ComfyUiError(
            f"Upscale workflow missing video save node (class_type in SaveVideo/VHS_VideoCombine). "
            f"workflow={COMFYUI_UPSCALE_PATH}"
        )
    target_resolution = _to_int(output_resolution, 1440)
    if target_resolution <= 0:
        target_resolution = 1440
    target_batch_size = _to_int(workflow_batch_size, 1)
    target_batch_size = max(1, target_batch_size)
    segment_seconds = max(1, _to_int(segment_seconds, 3))

    with tempfile.TemporaryDirectory(prefix="comfyui-video-upscale-") as temp_dir:
        source_path = _materialize_video_input(video_input, temp_dir)
        source_chunks = _split_video_segments(source_path, temp_dir, segment_seconds, req_id)
        processed_dir = os.path.join(temp_dir, "processed")
        os.makedirs(processed_dir, exist_ok=True)

        processed_chunk_paths: List[str] = []
        total = len(source_chunks)
        if progress_cb:
            progress_cb(0, total)
        for idx, chunk_path in enumerate(source_chunks):
            workflow = copy.deepcopy(workflow_template)
            chunk_ext = os.path.splitext(chunk_path)[1].lower() or ".mp4"
            upload_name = f"upscale-{uuid.uuid4().hex}{chunk_ext}"
            sys_logger.info(f"[{req_id}] Upscale chunk {idx + 1}/{total}: upload {upload_name}")

            with open(chunk_path, "rb") as f:
                uploaded = _upload_file(f.read(), upload_name, _guess_mime_from_ext(chunk_ext))

            _set_node_input(workflow, load_node_id, "file", uploaded)
            if upscale_node_id:
                _set_node_input(workflow, upscale_node_id, "resolution", target_resolution)
                _set_node_input(workflow, upscale_node_id, "batch_size", target_batch_size)
            _set_node_input(workflow, save_node_id, "filename_prefix", f"video/upscale-{req_id}-{idx:04d}")

            client_id = uuid.uuid4().hex
            prompt_id = _queue_prompt(workflow, client_id)
            history = _wait_for_history(prompt_id, timeout_sec=COMFYUI_VIDEO_UPSCALE_TIMEOUT_SEC)
            output_info = _pick_output_file(history, preferred_node_ids=[save_node_id])
            output_bytes = _download_file(output_info)

            output_filename = str(output_info.get("filename") or f"chunk_{idx:04d}.mp4")
            output_ext = os.path.splitext(output_filename)[1].lower() or ".mp4"
            output_path = os.path.join(processed_dir, f"chunk_{idx:04d}{output_ext}")
            with open(output_path, "wb") as f:
                f.write(output_bytes)
            processed_chunk_paths.append(output_path)
            if progress_cb:
                progress_cb(idx + 1, total)

        final_path = _concat_video_segments(processed_chunk_paths, temp_dir, req_id)
        with open(final_path, "rb") as f:
            final_bytes = f.read()
        final_ext = os.path.splitext(final_path)[1].lower() or ".mp4"
        final_mime = _guess_mime_from_ext(final_ext)
        if final_mime == "application/octet-stream":
            final_mime = "video/mp4"
        return final_bytes, final_mime


def run_video_lineart_workflow(
    *,
    req_id: str,
    video_input: str,
    line_strength: int = 2,
    line_color: str = "black",
) -> tuple[bytes, str]:
    workflow = _load_workflow(COMFYUI_LINEART_PATH)
    workflow = copy.deepcopy(workflow)
    load_node_id = _find_workflow_node_id(
        workflow,
        ["LoadVideo", "VHS_LoadVideo", "VHS_LoadVideoPath"],
        required_inputs=["file"],
    ) or ("1" if str("1") in workflow else None)
    sketch_node_id = _find_workflow_node_id(
        workflow,
        ["Sketch_Assistant"],
        required_inputs=["line_strength", "line_color"],
    ) or ("3" if str("3") in workflow else None)
    save_node_id = _find_workflow_node_id(
        workflow,
        ["SaveVideo", "VHS_VideoCombine"],
        required_inputs=["filename_prefix"],
    ) or ("10" if str("10") in workflow else None)

    if not load_node_id:
        raise ComfyUiError(
            f"Lineart workflow missing video load node (class_type in LoadVideo/VHS_LoadVideo/VHS_LoadVideoPath). "
            f"workflow={COMFYUI_LINEART_PATH}"
        )
    if not sketch_node_id:
        raise ComfyUiError(
            f"Lineart workflow missing sketch node (class_type=Sketch_Assistant). workflow={COMFYUI_LINEART_PATH}"
        )
    if not save_node_id:
        raise ComfyUiError(
            f"Lineart workflow missing video save node (class_type in SaveVideo/VHS_VideoCombine). "
            f"workflow={COMFYUI_LINEART_PATH}"
        )

    target_strength = max(1, min(10, _to_int(line_strength, 2)))
    target_color = str(line_color or "black").strip() or "black"

    with tempfile.TemporaryDirectory(prefix="comfyui-video-lineart-") as temp_dir:
        source_path = _materialize_video_input(video_input, temp_dir)
        source_ext = os.path.splitext(source_path)[1].lower() or ".mp4"
        upload_name = f"lineart-{uuid.uuid4().hex}{source_ext}"
        sys_logger.info(f"[{req_id}] Video lineart upload {upload_name}")

        with open(source_path, "rb") as f:
            uploaded = _upload_file(f.read(), upload_name, _guess_mime_from_ext(source_ext))

        _set_node_input(workflow, load_node_id, "file", uploaded)
        _set_node_input(workflow, sketch_node_id, "line_strength", target_strength)
        _set_node_input(workflow, sketch_node_id, "line_color", target_color)
        _set_node_input(workflow, save_node_id, "filename_prefix", f"video/lineart-{req_id}")

        client_id = uuid.uuid4().hex
        prompt_id = _queue_prompt(workflow, client_id)
        history = _wait_for_history(prompt_id, timeout_sec=COMFYUI_VIDEO_LINEART_TIMEOUT_SEC)
        output_info = _pick_output_file(history, preferred_node_ids=[save_node_id])
        output_bytes = _download_file(output_info)

        output_name = str(output_info.get("filename") or "lineart.mp4")
        output_ext = os.path.splitext(output_name)[1].lower() or ".mp4"
        output_mime = _guess_mime_from_ext(output_ext)
        if output_mime == "application/octet-stream":
            output_mime = "video/mp4"
        return output_bytes, output_mime


def run_video_rmbg_workflow(
    *,
    req_id: str,
    video_input: str,
) -> tuple[bytes, str]:
    workflow = _load_workflow(COMFYUI_VIDEO_RMBG_PATH)
    workflow = copy.deepcopy(workflow)
    load_node_id = _find_workflow_node_id(
        workflow,
        ["LoadVideo", "VHS_LoadVideo", "VHS_LoadVideoPath"],
        required_inputs=["file"],
    ) or ("7" if str("7") in workflow else None)
    rmbg_node_id = _find_workflow_node_id(
        workflow,
        ["RMBG"],
        required_inputs=["image"],
    ) or ("10" if str("10") in workflow else None)
    save_node_id = _find_workflow_node_id(
        workflow,
        ["SaveVideo", "VHS_VideoCombine"],
        required_inputs=["filename_prefix"],
    ) or ("13" if str("13") in workflow else None)

    if not load_node_id:
        raise ComfyUiError(
            f"Video RMBG workflow missing video load node (class_type in LoadVideo/VHS_LoadVideo/VHS_LoadVideoPath). "
            f"workflow={COMFYUI_VIDEO_RMBG_PATH}"
        )
    if not rmbg_node_id:
        raise ComfyUiError(
            f"Video RMBG workflow missing RMBG node (class_type=RMBG). workflow={COMFYUI_VIDEO_RMBG_PATH}"
        )
    if not save_node_id:
        raise ComfyUiError(
            f"Video RMBG workflow missing save node (class_type in SaveVideo/VHS_VideoCombine). "
            f"workflow={COMFYUI_VIDEO_RMBG_PATH}"
        )

    with tempfile.TemporaryDirectory(prefix="comfyui-video-rmbg-") as temp_dir:
        source_path = _materialize_video_input(video_input, temp_dir)
        source_ext = os.path.splitext(source_path)[1].lower() or ".mp4"
        upload_name = f"video-rmbg-{uuid.uuid4().hex}{source_ext}"
        sys_logger.info(f"[{req_id}] Video RMBG upload {upload_name}")

        with open(source_path, "rb") as f:
            uploaded = _upload_file(f.read(), upload_name, _guess_mime_from_ext(source_ext))

        _set_node_input(workflow, load_node_id, "file", uploaded)
        _set_node_input(workflow, save_node_id, "filename_prefix", f"video/rmbg-{req_id}")

        client_id = uuid.uuid4().hex
        prompt_id = _queue_prompt(workflow, client_id)
        history = _wait_for_history(prompt_id, timeout_sec=COMFYUI_VIDEO_RMBG_TIMEOUT_SEC)
        output_info = _pick_output_file(history, preferred_node_ids=[save_node_id])
        output_bytes = _download_file(output_info)

        output_name = str(output_info.get("filename") or "video-rmbg.mp4")
        output_ext = os.path.splitext(output_name)[1].lower() or ".mp4"
        output_mime = _guess_mime_from_ext(output_ext)
        if output_mime == "application/octet-stream":
            output_mime = "video/mp4"
        return output_bytes, output_mime
