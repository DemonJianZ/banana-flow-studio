# routes.py
import asyncio
import time
import json
import os
import re
import uuid
import hashlib
import threading
import subprocess
import tempfile
import shutil
import urllib.request
import mimetypes
from datetime import datetime, timezone
from contextlib import contextmanager, nullcontext
from typing import Dict, Any, Optional, List
from urllib.parse import unquote

import httpx
from fastapi import APIRouter, HTTPException, Request, Depends, Query, Response, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from google.genai import types


from core.config import (
    MODEL_GEMINI,
    MODEL_DOUBAO,
    MODEL_AGENT_CHAT,
    AGENT_CHAT_HTTP_PROXY,
    AGENT_CHAT_HTTPS_PROXY,
    MODEL_COMFYUI_OVERLAYTEXT,
    MODEL_COMFYUI_RMBG,
    MODEL_COMFYUI_REMOVE_WATERMARK,
    MODEL_COMFYUI_MULTI_ANGLESHOTS,
    MODEL_COMFYUI_VIDEO_UPSCALE,
    MODEL_COMFYUI_CONTROLNET,
    MODEL_COMFYUI_IMAGE_Z_IMAGE_TURBO,
    MODEL_COMFYUI_QWEN_I2V,
    AI_CHAT_DOWNSTREAM_URL,
    AI_CHAT_TASK_DB_PATH,
    AI_CHAT_TASK_TEMP_DIR,
    AI_CHAT_TASK_TIMEOUT_SEC,
    AI_CHAT_TASK_MAX_RETRIES,
)
from core.logging import sys_logger
from auth_routes import get_current_user
from storage.usage import record_usage

from schemas.api import (
    Text2ImgRequest, Text2ImgResponse,
    MultiImageRequest, MultiImageResponse,
    OverlayTextRequest, OverlayTextResponse,
    RmbgRequest, RmbgResponse,
    RemoveWatermarkRequest, RemoveWatermarkResponse,
    MultiAngleShotsRequest, MultiAngleShotsResponse,
    VideoUpscaleRequest, VideoUpscaleResponse,
    ControlnetPoseVideoRequest, ControlnetPoseVideoResponse,
    VideoUpscaleTaskStartResponse, VideoUpscaleTaskStatusResponse,
    EditRequest, EditResponse,
    Img2VideoRequest, Img2VideoResponse,
    AgentRequest,
    AgentVideoGenerationRequest, AgentVideoGenerationResponse, AgentVideoShotArtifact,
    AgentChitchatRequest, AgentChitchatResponse,
    AIChatImageTaskSubmitResponse, AIChatImageTaskStatusResponse,
)
from storage.ai_chat_tasks import (
    create_ai_chat_task,
    get_ai_chat_task,
    init_ai_chat_tasks_store,
    mark_stale_ai_chat_tasks,
    update_ai_chat_task,
)

from storage.prompt_log import PromptLogger, LogAnalyzer
from services.genai_client import call_genai_retry, call_genai_retry_with_proxy
from services.ark import call_doubao_image_gen
from services.ark_video import generate_video_from_image, VideoGenError
from services.comfyui import (
    run_image_z_image_turbo_workflow,
    run_overlaytext_workflow,
    run_rmbg_workflow,
    run_remove_watermark_workflow,
    run_multi_angleshots_workflow,
    run_qwen_i2v_workflow,
    run_controlnet_pose_video_workflow,
    run_video_upscale_workflow,
)
from services.video_generation_pipeline import run_e2e_video_workflow

from utils.images import parse_data_url, bytes_to_data_url, get_image_from_response
from utils.size import calculate_target_resolution
from prompts.business import build_business_prompt

from agent.idea_script.orchestrator import IdeaScriptOrchestrator
from agent.idea_script.schemas import EditPlan, IdeaScriptRequest, IdeaScriptResponse
from agent.planner import agent_plan_impl
from mcp.client import MCPClientError, MCPStdioClient
from mcp.registry import MCPRegistryError, MCPToolInvocationError, get_global_registry
from mcp.tool_export_ffmpeg import (
    EXPORT_FFMPEG_TOOL_HASH,
    EXPORT_FFMPEG_TOOL_NAME,
    EXPORT_FFMPEG_TOOL_VERSION,
)
from quality.harvester import harvest_eval_case
from quality.metrics_schema import build_quality_metrics
from memory.service import (
    deactivate_preference as deactivate_user_preference,
    expire_preferences as expire_user_preferences,
    list_preferences as list_user_preferences,
    set_preference as set_user_preference,
)
from sessions.service import (
    SessionAccessDeniedError,
    SessionNotFoundError,
    append_event as append_session_event,
    create_or_get_session,
    get_session as get_session_detail,
    list_sessions as list_session_items,
    summarize_session as summarize_session_item,
    update_state as update_session_state,
)
ALLOWED_VIDEO_MODELS = {"Doubao-Seedance-1.0-pro", "Doubao-Seedance-1.5-pro"}

try:
    from opentelemetry import trace as _otel_trace  # type: ignore
except Exception:
    _otel_trace = None


router = APIRouter()
prompt_logger = PromptLogger()
analyzer = LogAnalyzer("logs/prompts.jsonl")
video_upscale_tasks: Dict[str, Dict[str, Any]] = {}
video_upscale_tasks_lock = threading.Lock()
idea_script_orchestrator = IdeaScriptOrchestrator()
idea_script_plan_cache: Dict[str, Dict[str, Any]] = {}
idea_script_plan_cache_lock = threading.Lock()
_tracer = _otel_trace.get_tracer(__name__) if _otel_trace else None
_AI_CHAT_TASK_RETRY_BACKOFFS = (2, 5, 10)
init_ai_chat_tasks_store(AI_CHAT_TASK_DB_PATH)
mark_stale_ai_chat_tasks(
    AI_CHAT_TASK_DB_PATH,
    from_statuses=["PENDING", "RUNNING", "RETRYING"],
    to_status="FAILED",
    error="服务重启导致任务中断，请重新提交。",
)


class _NoopSpan:
    def set_attribute(self, *args: Any, **kwargs: Any) -> None:
        return None


def _as_bool(value: Optional[str], default: bool = False) -> bool:
    if value is None:
        return default
    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "on"}:
        return True
    if text in {"0", "false", "no", "off"}:
        return False
    return default


def _decode_agent_header(value: Optional[str]) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    try:
        text = unquote(text)
    except Exception:
        pass
    try:
        repaired = text.encode("latin1").decode("utf-8")
        if repaired:
            text = repaired
    except Exception:
        pass
    return text


def _tenant_user_from_request(request: Request, current_user: Dict[str, Any]) -> tuple[str, str]:
    tenant_id = str(request.headers.get("X-Tenant-Id") or current_user.get("email_domain") or "unknown").strip() or "unknown"
    user_id = str(current_user.get("id") or "").strip()
    if not user_id:
        raise HTTPException(status_code=401, detail="Missing user id")
    return tenant_id, user_id


def _get_current_user_optional(request: Request) -> Optional[Dict[str, Any]]:
    try:
        return get_current_user(request)
    except HTTPException as e:
        if int(getattr(e, "status_code", 0)) == 401:
            return None
        raise


def _resolve_agent_actor(request: Request, current_user: Optional[Dict[str, Any]]) -> tuple[str, str]:
    tenant_id = str(request.headers.get("X-Tenant-Id") or (current_user or {}).get("email_domain") or "public").strip() or "public"
    user_id = str((current_user or {}).get("id") or "").strip()
    if user_id:
        return tenant_id, user_id

    guest_key = (
        str(request.headers.get("X-Guest-Id") or "").strip()
        or str(request.headers.get("X-Agent-Session-Id") or "").strip()
        or str(getattr(request.client, "host", "") or "").strip()
        or "anonymous"
    )
    guest_hash = hashlib.sha1(guest_key.encode("utf-8")).hexdigest()[:12]
    return tenant_id, f"guest:{guest_hash}"


def _user_id_for_log(current_user: Optional[Dict[str, Any]]) -> str:
    user_id = str((current_user or {}).get("id") or "").strip()
    return user_id or "anonymous"


def _record_usage_if_authed(current_user: Optional[Dict[str, Any]], model: str) -> None:
    user_id = str((current_user or {}).get("id") or "").strip()
    if user_id:
        record_usage(user_id, model)


def _safe_json_hash(data: Dict[str, Any]) -> str:
    encoded = json.dumps(dict(data or {}), ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


_PREFERENCE_COMMAND_PATTERNS = [
    (re.compile(r"^\s*偏好平台\s*[:=：]\s*(.+?)\s*$"), "platform"),
    (re.compile(r"^\s*偏好语气\s*[:=：]\s*(.+?)\s*$"), "tone"),
    (re.compile(r"^\s*镜头偏好\s*[:=：]\s*(.+?)\s*$"), "camera_style"),
    (re.compile(r"^\s*风控偏好\s*[:=：]\s*(.+?)\s*$"), "risk_posture"),
]

_MEMBER_API_BASE = os.getenv("MEMBER_API_BASE", "http://192.168.20.217:16313").rstrip("/")
_MEMBER_API_AUTHORIZATION = str(os.getenv("MEMBER_API_AUTHORIZATION") or "").strip()
_IDEA_SCRIPT_HTTP_PROXY = str(os.getenv("IDEA_SCRIPT_HTTP_PROXY") or "").strip()
_IDEA_SCRIPT_HTTPS_PROXY = str(os.getenv("IDEA_SCRIPT_HTTPS_PROXY") or "").strip()
_IDEA_SCRIPT_LLM_TIMEOUT_MESSAGE = "生成脚本超时，请稍后重试。"
_AI_CHAT_MODEL_ID_NANO_BANANA_PRO = str(os.getenv("AI_CHAT_MODEL_ID_NANO_BANANA_PRO") or "").strip()
_AI_CHAT_MODEL_ID_SEEDANCE_1_0 = str(os.getenv("AI_CHAT_MODEL_ID_SEEDANCE_1_0") or "").strip()
_AI_CHAT_IMAGE_SIZE_ID_MAP = {
    "1024x1024": str(os.getenv("AI_CHAT_IMAGE_SIZE_ID_1024", "3")).strip(),
}
_AI_CHAT_IMAGE_RATIO_ID_MAP = {
    "1:1": str(os.getenv("AI_CHAT_IMAGE_RATIO_ID_1_1", "4")).strip(),
}
_AI_CHAT_VIDEO_RESOLUTION_ID_MAP = {
    "480p": str(os.getenv("AI_CHAT_VIDEO_RESOLUTION_ID_480P", "16")).strip(),
    "720p": str(os.getenv("AI_CHAT_VIDEO_RESOLUTION_ID_720P", "17")).strip(),
    "1080p": str(os.getenv("AI_CHAT_VIDEO_RESOLUTION_ID_1080P", "18")).strip(),
}
_AI_CHAT_VIDEO_RATIO_ID_MAP = {
    "9:16": str(os.getenv("AI_CHAT_VIDEO_RATIO_ID_9_16", "23")).strip(),
    "16:9": str(os.getenv("AI_CHAT_VIDEO_RATIO_ID_16_9", "71")).strip(),
    "4:3": str(os.getenv("AI_CHAT_VIDEO_RATIO_ID_4_3", "20")).strip(),
    "1:1": str(os.getenv("AI_CHAT_VIDEO_RATIO_ID_1_1", "21")).strip(),
    "3:4": str(os.getenv("AI_CHAT_VIDEO_RATIO_ID_3_4", "22")).strip(),
    "21:9": str(os.getenv("AI_CHAT_VIDEO_RATIO_ID_21_9", "24")).strip(),
    "adaptive": str(os.getenv("AI_CHAT_VIDEO_RATIO_ID_ADAPTIVE", "25")).strip(),
}
_AI_CHAT_VIDEO_DURATION_ID_MAP = {
    "3": str(os.getenv("AI_CHAT_VIDEO_DURATION_ID_3S", "26")).strip(),
    "5": str(os.getenv("AI_CHAT_VIDEO_DURATION_ID_5S", "27")).strip(),
}


class AIChatCurlProxyRequest(BaseModel):
    endpoint: Optional[str] = None
    authorization: str = ""
    history_ai_chat_record_id: Optional[str] = ""
    module_enum: str = "1"
    part_enum: str = "2"
    message: str = ""
    ai_chat_session_id: str = ""
    ai_chat_model_id: str = ""
    ai_image_param_task_type_id: Optional[str] = ""
    ai_image_param_size_id: Optional[str] = ""
    ai_image_param_ratio_id: Optional[str] = ""
    ai_video_param_ratio_id: Optional[str] = ""
    ai_video_param_resolution_id: Optional[str] = ""
    ai_video_param_duration_id: Optional[str] = ""
    tusd_file_remote_ids: Optional[List[str]] = Field(default_factory=list)
    images: Optional[List[str]] = Field(default_factory=list)
    timeout_seconds: Optional[int] = 120


class _AIChatRetryableError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        raw_text: str = "",
        response_json: Any = None,
        error_type: str = "FAILED",
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.raw_text = raw_text
        self.response_json = response_json
        self.error_type = error_type


class _AIChatNonRetryableError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        raw_text: str = "",
        response_json: Any = None,
        error_type: str = "FAILED",
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.raw_text = raw_text
        self.response_json = response_json
        self.error_type = error_type


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_iso_datetime(value: Any) -> Optional[datetime]:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw)
    except Exception:
        return None


def _diff_ms(start: Optional[datetime], end: Optional[datetime]) -> Optional[int]:
    if start is None or end is None:
        return None
    return max(0, int((end - start).total_seconds() * 1000))


def clean_form_value(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    for _ in range(3):
        if not (text.startswith('"') and text.endswith('"')):
            break
        try:
            parsed = json.loads(text)
        except Exception:
            break
        if not isinstance(parsed, str):
            break
        next_text = str(parsed).strip()
        if not next_text or next_text == text:
            break
        text = next_text
    if len(text) >= 2 and text[0] == text[-1] and text[0] in {'"', "'"}:
        text = text[1:-1].strip()
    return text


def _sanitize_ai_chat_proxy_request(req: AIChatCurlProxyRequest) -> AIChatCurlProxyRequest:
    payload = req.model_dump()
    list_fields = {"tusd_file_remote_ids", "images"}
    for key, value in list(payload.items()):
        if key in list_fields:
            payload[key] = [clean_form_value(item) for item in list(value or []) if clean_form_value(item)]
            continue
        if value is None:
            continue
        if isinstance(value, str):
            payload[key] = clean_form_value(value)
    timeout_value = payload.get("timeout_seconds")
    try:
        payload["timeout_seconds"] = int(str(timeout_value or "").strip() or AI_CHAT_TASK_TIMEOUT_SEC)
    except Exception:
        payload["timeout_seconds"] = AI_CHAT_TASK_TIMEOUT_SEC
    return AIChatCurlProxyRequest(**payload)


def _build_ai_chat_request_form(req: AIChatCurlProxyRequest) -> Dict[str, Any]:
    clean_req = _sanitize_ai_chat_proxy_request(req)
    return {
        "endpoint": str(clean_req.endpoint or "").strip() or AI_CHAT_DOWNSTREAM_URL,
        "authorization": clean_form_value(clean_req.authorization),
        "history_ai_chat_record_id": clean_form_value(clean_req.history_ai_chat_record_id),
        "module_enum": clean_form_value(clean_req.module_enum),
        "part_enum": clean_form_value(clean_req.part_enum),
        "message": clean_form_value(clean_req.message),
        "ai_chat_session_id": clean_form_value(clean_req.ai_chat_session_id),
        "ai_chat_model_id": clean_form_value(clean_req.ai_chat_model_id),
        "ai_image_param_task_type_id": clean_form_value(clean_req.ai_image_param_task_type_id),
        "ai_image_param_size_id": clean_form_value(clean_req.ai_image_param_size_id),
        "ai_image_param_ratio_id": clean_form_value(clean_req.ai_image_param_ratio_id),
        "ai_video_param_ratio_id": clean_form_value(clean_req.ai_video_param_ratio_id),
        "ai_video_param_resolution_id": clean_form_value(clean_req.ai_video_param_resolution_id),
        "ai_video_param_duration_id": clean_form_value(clean_req.ai_video_param_duration_id),
        "tusd_file_remote_ids": [clean_form_value(item) for item in list(clean_req.tusd_file_remote_ids or []) if clean_form_value(item)],
        "timeout_seconds": max(10, min(int(clean_req.timeout_seconds or AI_CHAT_TASK_TIMEOUT_SEC), 300)),
    }


def _build_ai_chat_public_task(task: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not task:
        raise HTTPException(status_code=404, detail="task not found")
    status = str(task.get("status") or "FAILED")
    result = task.get("result_json")
    if isinstance(result, dict):
        result = dict(result)
        request_form = result.get("request_form")
        if isinstance(request_form, dict) and request_form.get("authorization"):
            request_form = dict(request_form)
            request_form["authorization"] = "***"
            result["request_form"] = request_form
    telemetry = _build_ai_chat_task_telemetry(task, result=result)
    return {
        "ok": status not in {"FAILED", "TIMEOUT"},
        "task_id": str(task.get("task_id") or ""),
        "status": status,
        "retry_count": int(task.get("retry_count") or 0),
        "progress_message": str(task.get("progress_message") or ""),
        "result": result,
        "telemetry": telemetry,
        "error": str(task.get("error") or "") or None,
        "created_at": str(task.get("created_at") or ""),
        "updated_at": str(task.get("updated_at") or ""),
    }


def _build_ai_chat_task_telemetry(
    task: Optional[Dict[str, Any]],
    *,
    result: Optional[Dict[str, Any]] = None,
    runtime_end: Optional[datetime] = None,
) -> Dict[str, Any]:
    if not task:
        return {}
    created_at = _parse_iso_datetime(task.get("created_at"))
    started_at = _parse_iso_datetime(task.get("started_at"))
    finished_at = _parse_iso_datetime(task.get("finished_at"))
    updated_at = _parse_iso_datetime(task.get("updated_at"))
    resolved_runtime_end = runtime_end or finished_at or updated_at or datetime.now(timezone.utc)
    if result is None:
        task_result = task.get("result_json")
        result = dict(task_result) if isinstance(task_result, dict) else None
    result_timings = result.get("timings") if isinstance(result, dict) else None
    if not isinstance(result_timings, dict):
        result_timings = {}
    return {
        "queue_wait_ms": _diff_ms(created_at, started_at),
        "run_ms": _diff_ms(started_at, resolved_runtime_end) if started_at else None,
        "wall_clock_ms": _diff_ms(created_at, resolved_runtime_end) if created_at else None,
        "last_attempt_ms": int(task.get("last_duration_ms") or 0) or None,
        "downstream_build_ms": result_timings.get("build_ms"),
        "downstream_first_chunk_ms": result_timings.get("first_chunk_ms"),
        "downstream_first_result_ms": result_timings.get("first_result_ms"),
        "downstream_read_loop_ms": result_timings.get("read_loop_ms"),
        "downstream_parse_ms": result_timings.get("parse_ms"),
        "downstream_total_ms": result_timings.get("total_ms"),
        "downstream_lines_read": result_timings.get("lines_read"),
    }


def _guess_suffix_from_filename(name: str, content_type: str = "") -> str:
    filename = str(name or "").strip()
    if filename:
        _, ext = os.path.splitext(filename)
        if ext:
            return ext
    return _guess_suffix_from_mime(content_type)


def _ensure_ai_chat_task_dir(task_id: str) -> str:
    task_dir = os.path.join(AI_CHAT_TASK_TEMP_DIR, str(task_id))
    os.makedirs(task_dir, exist_ok=True)
    return task_dir


def _cleanup_ai_chat_task_dir(task_id: str) -> None:
    task_dir = os.path.join(AI_CHAT_TASK_TEMP_DIR, str(task_id))
    if os.path.isdir(task_dir):
        shutil.rmtree(task_dir, ignore_errors=True)


def _cleanup_stale_ai_chat_task_dirs(max_age_seconds: int = 24 * 3600) -> None:
    base_dir = os.path.abspath(AI_CHAT_TASK_TEMP_DIR)
    if not os.path.isdir(base_dir):
        return
    now_ts = time.time()
    for entry in os.scandir(base_dir):
        if not entry.is_dir():
            continue
        try:
            age_seconds = now_ts - float(entry.stat().st_mtime)
        except Exception:
            continue
        if age_seconds <= max_age_seconds:
            continue
        shutil.rmtree(entry.path, ignore_errors=True)


def _write_image_bytes_to_task_file(image_bytes: bytes, *, suffix: str, task_id: str, index: int) -> str:
    task_dir = _ensure_ai_chat_task_dir(task_id)
    path = os.path.join(task_dir, f"image_{index}{suffix}")
    with open(path, "wb") as f:
        f.write(image_bytes)
    return path


def _materialize_image_to_task_file(image_value: str, *, task_id: str, index: int) -> Dict[str, Any]:
    text = str(image_value or "").strip()
    if not text:
        raise ValueError(f"image[{index}] 为空")
    if text.startswith("data:"):
        mime_type, image_bytes = parse_data_url(text)
        source = "data_url"
    else:
        with urllib.request.urlopen(text, timeout=20) as resp:
            image_bytes = resp.read()
            mime_type = resp.headers.get("Content-Type", "")
        source = "remote_url"
    if not image_bytes:
        raise ValueError(f"image[{index}] 内容为空")
    suffix = _guess_suffix_from_mime(mime_type)
    path = _write_image_bytes_to_task_file(image_bytes, suffix=suffix, task_id=task_id, index=index)
    return {
        "path": path,
        "filename": os.path.basename(path),
        "content_type": mime_type or "application/octet-stream",
        "size_bytes": int(len(image_bytes)),
        "source": source,
    }


async def _save_upload_file_to_task_dir(upload: UploadFile, *, task_id: str, index: int) -> Dict[str, Any]:
    content = await upload.read()
    if not content:
        raise ValueError(f"upload[{index}] 内容为空")
    suffix = _guess_suffix_from_filename(getattr(upload, "filename", ""), getattr(upload, "content_type", "") or "")
    path = _write_image_bytes_to_task_file(content, suffix=suffix, task_id=task_id, index=index)
    return {
        "path": path,
        "filename": str(getattr(upload, "filename", "") or os.path.basename(path)),
        "content_type": str(getattr(upload, "content_type", "") or "application/octet-stream"),
        "size_bytes": int(len(content)),
        "source": "upload_file",
    }


async def _parse_ai_chat_submission_request(request: Request, task_id: str) -> tuple[AIChatCurlProxyRequest, Dict[str, Any], List[Dict[str, Any]]]:
    content_type = str(request.headers.get("content-type") or "").lower()
    if "multipart/form-data" not in content_type:
        payload = await request.json()
        req = _sanitize_ai_chat_proxy_request(AIChatCurlProxyRequest(**(payload or {})))
        form_payload = _build_ai_chat_request_form(req)
        stored_files: List[Dict[str, Any]] = []
        for idx, image_value in enumerate(req.images or []):
            stored_files.append(_materialize_image_to_task_file(image_value, task_id=task_id, index=idx))
        return req, form_payload, stored_files

    form = await request.form()
    scalar_fields: Dict[str, str] = {}
    image_values: List[str] = []
    remote_ids: List[str] = []
    stored_files: List[Dict[str, Any]] = []
    upload_index = 0
    for key, value in form.multi_items():
        normalized_key = str(key or "").strip()
        if hasattr(value, "read") and hasattr(value, "filename"):
            if normalized_key in {"files", "files[]", "images", "images[]"}:
                stored_files.append(await _save_upload_file_to_task_dir(value, task_id=task_id, index=upload_index))
                upload_index += 1
            continue
        cleaned = clean_form_value(value)
        if not cleaned:
            continue
        if normalized_key in {"images", "images[]"}:
            image_values.append(cleaned)
            continue
        if normalized_key in {"tusd_file_remote_ids", "tusd_file_remote_ids[]"}:
            remote_ids.append(cleaned)
            continue
        scalar_fields[normalized_key] = cleaned

    req = _sanitize_ai_chat_proxy_request(
        AIChatCurlProxyRequest(
            endpoint=scalar_fields.get("endpoint", ""),
            authorization=scalar_fields.get("authorization", ""),
            history_ai_chat_record_id=scalar_fields.get("history_ai_chat_record_id", ""),
            module_enum=scalar_fields.get("module_enum", "1"),
            part_enum=scalar_fields.get("part_enum", "2"),
            message=scalar_fields.get("message", ""),
            ai_chat_session_id=scalar_fields.get("ai_chat_session_id", ""),
            ai_chat_model_id=scalar_fields.get("ai_chat_model_id", ""),
            ai_image_param_task_type_id=scalar_fields.get("ai_image_param_task_type_id", ""),
            ai_image_param_size_id=scalar_fields.get("ai_image_param_size_id", ""),
            ai_image_param_ratio_id=scalar_fields.get("ai_image_param_ratio_id", ""),
            ai_video_param_ratio_id=scalar_fields.get("ai_video_param_ratio_id", ""),
            ai_video_param_resolution_id=scalar_fields.get("ai_video_param_resolution_id", ""),
            ai_video_param_duration_id=scalar_fields.get("ai_video_param_duration_id", ""),
            tusd_file_remote_ids=remote_ids,
            images=image_values,
            timeout_seconds=scalar_fields.get("timeout_seconds", str(AI_CHAT_TASK_TIMEOUT_SEC)),
        )
    )
    form_payload = _build_ai_chat_request_form(req)
    for idx, image_value in enumerate(req.images or [], start=len(stored_files)):
        stored_files.append(_materialize_image_to_task_file(image_value, task_id=task_id, index=idx))
    return req, form_payload, stored_files

def _normalize_ai_chat_token(value: Optional[str]) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    if text.lower().startswith("bearer "):
        return text[7:].strip()
    return text


def _resolve_member_authorization(request: Request) -> str:
    for header_name in ["X-AI-Chat-Authorization", "X-Member-Authorization", "Authorization"]:
        token = _normalize_ai_chat_token(request.headers.get(header_name))
        if token:
            return token
    return _normalize_ai_chat_token(_MEMBER_API_AUTHORIZATION)


@contextmanager
def _temporary_proxy_env(http_proxy: Optional[str] = None, https_proxy: Optional[str] = None):
    keys = ("http_proxy", "https_proxy", "HTTP_PROXY", "HTTPS_PROXY")
    old_env = {key: os.environ.get(key) for key in keys}
    try:
        if http_proxy:
            os.environ["http_proxy"] = http_proxy
            os.environ["HTTP_PROXY"] = http_proxy
        if https_proxy:
            os.environ["https_proxy"] = https_proxy
            os.environ["HTTPS_PROXY"] = https_proxy
        yield
    finally:
        for key, value in old_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


def _map_param_id(id_map: Dict[str, str], raw_value: Any) -> str:
    value = str(raw_value or "").strip().lower()
    if not value:
        return ""
    for key, mapped in id_map.items():
        if value == str(key).strip().lower() and str(mapped or "").strip():
            return str(mapped).strip()
    return ""


def _build_ai_chat_curl_command(req_id: str, req: AIChatCurlProxyRequest) -> tuple[List[str], Dict[str, str], List[str], str, int, Dict[str, Any]]:
    req = _sanitize_ai_chat_proxy_request(req)
    build_started_at = time.perf_counter()
    endpoint = str(req.endpoint or "").strip() or AI_CHAT_DOWNSTREAM_URL or f"{_MEMBER_API_BASE}/ai/aiChat"
    authorization = clean_form_value(req.authorization)
    timeout_seconds = max(10, min(int(req.timeout_seconds or 120), 300))
    if not authorization:
        raise HTTPException(status_code=400, detail="authorization 不能为空")

    form_pairs = [
        ("history_ai_chat_record_id", req.history_ai_chat_record_id),
        ("module_enum", req.module_enum),
        ("part_enum", req.part_enum),
        ("message", req.message),
        ("ai_chat_session_id", req.ai_chat_session_id),
        ("ai_chat_model_id", req.ai_chat_model_id),
        ("ai_image_param_task_type_id", req.ai_image_param_task_type_id),
        ("ai_image_param_size_id", req.ai_image_param_size_id),
        ("ai_image_param_ratio_id", req.ai_image_param_ratio_id),
        ("ai_video_param_ratio_id", req.ai_video_param_ratio_id),
        ("ai_video_param_resolution_id", req.ai_video_param_resolution_id),
        ("ai_video_param_duration_id", req.ai_video_param_duration_id),
    ]

    cmd: List[str] = [
        "curl",
        "-sS",
        "-N",
        "--location",
        endpoint,
        "--max-time",
        str(timeout_seconds),
        "--header",
        f"authorization: {authorization}",
        "--header",
        f"x-request-id: {req_id}",
    ]
    request_form: Dict[str, str] = {}
    for key, value in form_pairs:
        quoted = _to_quoted_form_value(value)
        if not quoted:
            continue
        request_form[key] = quoted
        cmd.extend(["--form", f"{key}={quoted}"])
    for item in req.tusd_file_remote_ids or []:
        quoted = _to_quoted_form_value(item)
        if not quoted:
            continue
        cmd.extend(["--form", f"tusd_file_remote_ids[]={quoted}"])

    temp_files: List[str] = []
    materialize_items: List[Dict[str, Any]] = []
    for idx, image_value in enumerate(req.images or []):
        if not str(image_value or "").strip():
            continue
        item_started_at = time.perf_counter()
        temp_path = _materialize_image_to_temp_file(image_value, req_id, idx)
        temp_files.append(temp_path)
        source_type = "data_url" if str(image_value or "").strip().startswith("data:") else "remote_url"
        file_size = 0
        try:
            file_size = int(os.path.getsize(temp_path))
        except Exception:
            file_size = 0
        materialize_items.append(
            {
                "index": idx,
                "source": source_type,
                "size_bytes": file_size,
                "elapsed_ms": int((time.perf_counter() - item_started_at) * 1000),
            }
        )
        cmd.extend(["--form", f"files=@{temp_path}"])
    metrics = {
        "build_ms": int((time.perf_counter() - build_started_at) * 1000),
        "form_field_count": len(request_form),
        "image_count": len(temp_files),
        "remote_file_id_count": len(req.tusd_file_remote_ids or []),
        "image_materialization": materialize_items,
    }
    return cmd, request_form, temp_files, endpoint, timeout_seconds, metrics


def _to_quoted_form_value(value: Any) -> str:
    text = clean_form_value(value)
    if not text:
        return ""
    if (text.startswith('"') and text.endswith('"')) or (text.startswith("'") and text.endswith("'")):
        return text
    return f'"{text}"'


def _pick_first_image_url(payload: Any) -> str:
    if payload is None:
        return ""
    if isinstance(payload, str):
        text = payload.strip()
        if not text:
            return ""
        matched = re.search(r"https?://[^\s\"'<>]+", text, re.IGNORECASE)
        return matched.group(0) if matched else ""
    if isinstance(payload, list):
        for item in payload:
            found = _pick_first_image_url(item)
            if found:
                return found
        return ""
    if isinstance(payload, dict):
        for key in ["url", "image", "image_url", "imageUrl", "output_url", "outputUrl", "result_url", "resultUrl"]:
            found = _pick_first_image_url(payload.get(key))
            if found:
                return found
        for value in payload.values():
            found = _pick_first_image_url(value)
            if found:
                return found
    return ""


def _extract_done_error(events: List[Dict[str, Any]]) -> str:
    for item in reversed(events):
        data = item.get("data", item)
        if isinstance(data, dict):
            for key in ["errMsg", "error", "message", "detail"]:
                msg = str(data.get(key) or "").strip()
                if msg:
                    return msg
    return ""


def _extract_image_url_from_events(events: List[Dict[str, Any]]) -> str:
    for item in reversed(events):
        payload = item.get("data", item)
        if isinstance(payload, dict):
            content = payload.get("content")
            if isinstance(content, list):
                for content_item in content:
                    if not isinstance(content_item, dict):
                        continue
                    direct_url = str(content_item.get("url") or content_item.get("image_url") or content_item.get("imageUrl") or "").strip()
                    if direct_url:
                        return direct_url
    return ""


def _extract_session_meta_from_events(events: List[Dict[str, Any]]) -> Dict[str, str]:
    for item in events:
        payload = item.get("data", item)
        if not isinstance(payload, dict):
            continue
        session_id = str(
            payload.get("ai_chat_session_id")
            or payload.get("aiChatSessionId")
            or payload.get("session_id")
            or payload.get("sessionId")
            or ""
        ).strip()
        history_id = str(
            payload.get("history_ai_chat_record_id")
            or payload.get("historyAiChatRecordId")
            or payload.get("ai_chat_record_id")
            or payload.get("record_id")
            or payload.get("recordId")
            or ""
        ).strip()
        if session_id or history_id:
            return {
                "source_session_id": session_id,
                "source_history_record_id": history_id,
            }
    return {
        "source_session_id": "",
        "source_history_record_id": "",
    }


def _parse_sse_output(raw_text: str) -> Dict[str, Any]:
    events: List[Dict[str, Any]] = []
    pending_event = ""
    content_parts: List[str] = []
    saw_sse = False

    for line in str(raw_text or "").splitlines():
        trimmed = str(line or "").strip()
        if not trimmed:
            continue
        if trimmed.startswith("event:"):
            pending_event = trimmed[6:].strip()
            saw_sse = True
            continue
        if trimmed.startswith("id:"):
            saw_sse = True
            continue
        if trimmed.startswith("data:"):
            saw_sse = True
            payload_text = trimmed[5:].strip()
            if not payload_text or payload_text == "[DONE]":
                continue
            event_payload: Any = payload_text
            try:
                event_payload = json.loads(payload_text)
            except Exception:
                event_payload = payload_text
            events.append({"event": pending_event or "message", "data": event_payload})
            if isinstance(event_payload, str):
                content_parts.append(event_payload)
            elif isinstance(event_payload, dict):
                delta = event_payload.get("delta")
                if isinstance(delta, str) and delta:
                    content_parts.append(delta)
                elif isinstance(event_payload.get("content"), str):
                    content_parts.append(event_payload["content"])
                elif isinstance(event_payload.get("message"), str):
                    content_parts.append(event_payload["message"])
            continue
        if not saw_sse:
            content_parts.append(trimmed)

    text = "".join(content_parts)
    done_error = _extract_done_error(events)
    image_url = (
        _extract_image_url_from_events(events)
        or _pick_first_image_url(events)
        or _pick_first_image_url(text)
    )
    meta = _extract_session_meta_from_events(events)
    return {
        "mode": "stream" if saw_sse else "text",
        "text": text,
        "events": events,
        "done_error": done_error,
        "image_url": image_url,
        **meta,
    }


def _extract_fast_result_from_stream_line(line: str) -> tuple[str, str]:
    """
    尝试从单行 SSE data 中快速提取 image_url / done_error，减少整段重复解析导致的额外耗时。
    返回: (image_url, done_error)
    """
    trimmed = str(line or "").strip()
    if not trimmed.startswith("data:"):
        return "", ""
    payload_text = trimmed[5:].strip()
    if not payload_text or payload_text == "[DONE]":
        return "", ""

    payload: Any = payload_text
    try:
        payload = json.loads(payload_text)
    except Exception:
        matched = re.search(r"https?://[^\s\"'<>]+", payload_text, re.IGNORECASE)
        return (matched.group(0) if matched else ""), ""

    if isinstance(payload, dict):
        content = payload.get("content")
        if isinstance(content, list):
            for content_item in content:
                if not isinstance(content_item, dict):
                    continue
                direct_url = str(content_item.get("url") or content_item.get("image_url") or content_item.get("imageUrl") or "").strip()
                if direct_url:
                    return direct_url, ""
        url = _pick_first_image_url(payload)
        if url:
            return url, ""
        for key in ["errMsg", "error", "message", "detail"]:
            msg = str(payload.get(key) or "").strip()
            if msg:
                return "", msg
    elif isinstance(payload, str):
        url = _pick_first_image_url(payload)
        if url:
            return url, ""

    return "", ""


def _guess_suffix_from_mime(mime_type: str) -> str:
    text = str(mime_type or "").strip().lower()
    if not text:
        return ".bin"
    ext = mimetypes.guess_extension(text)
    if ext:
        return ext
    if "jpeg" in text or "jpg" in text:
        return ".jpg"
    if "png" in text:
        return ".png"
    if "webp" in text:
        return ".webp"
    return ".bin"


def _materialize_image_to_temp_file(image_value: str, req_id: str, index: int) -> str:
    text = clean_form_value(image_value)
    if not text:
        raise ValueError(f"image[{index}] 为空")
    if text.startswith("data:"):
        mime_type, image_bytes = parse_data_url(text)
    else:
        with urllib.request.urlopen(text, timeout=20) as resp:
            image_bytes = resp.read()
            mime_type = resp.headers.get("Content-Type", "")
    if not image_bytes:
        raise ValueError(f"image[{index}] 内容为空")
    suffix = _guess_suffix_from_mime(mime_type)
    fd, path = tempfile.mkstemp(prefix=f"ai_chat_{req_id}_{index}_", suffix=suffix)
    with os.fdopen(fd, "wb") as f:
        f.write(image_bytes)
    return path


def _schedule_graceful_curl_process_cleanup(
    process: subprocess.Popen,
    *,
    req_id: str,
    context: str,
    grace_seconds: int = 5,
) -> None:
    def _cleanup() -> None:
        try:
            stdout_tail, stderr_tail = process.communicate(timeout=max(1, int(grace_seconds)))
            sys_logger.info(
                json.dumps(
                    {
                        "event": "ai_chat_curl_graceful_cleanup",
                        "req_id": req_id,
                        "context": context,
                        "grace_seconds": grace_seconds,
                        "return_code": process.returncode,
                        "stdout_tail_chars": len(str(stdout_tail or "")),
                        "stderr_tail_chars": len(str(stderr_tail or "")),
                    },
                    ensure_ascii=False,
                )
            )
        except subprocess.TimeoutExpired:
            try:
                process.kill()
            except Exception:
                pass
            try:
                stdout_tail, stderr_tail = process.communicate(timeout=1)
            except Exception:
                stdout_tail, stderr_tail = "", ""
            sys_logger.warning(
                json.dumps(
                    {
                        "event": "ai_chat_curl_graceful_cleanup_timeout",
                        "req_id": req_id,
                        "context": context,
                        "grace_seconds": grace_seconds,
                        "return_code": process.returncode,
                        "stdout_tail_chars": len(str(stdout_tail or "")),
                        "stderr_tail_chars": len(str(stderr_tail or "")),
                    },
                    ensure_ascii=False,
                )
            )
        except Exception as exc:
            sys_logger.warning(
                json.dumps(
                    {
                        "event": "ai_chat_curl_graceful_cleanup_error",
                        "req_id": req_id,
                        "context": context,
                        "message": str(exc or "cleanup failed"),
                    },
                    ensure_ascii=False,
                )
            )

    threading.Thread(target=_cleanup, name=f"ai-chat-curl-cleanup-{req_id}", daemon=True).start()


def _parse_preference_command(text: str) -> Optional[Dict[str, str]]:
    raw = str(text or "").strip()
    if not raw:
        return None
    for pattern, key in _PREFERENCE_COMMAND_PATTERNS:
        matched = pattern.match(raw)
        if matched is None:
            continue
        value = str(matched.group(1) or "").strip()
        if not value:
            return None
        return {"key": key, "value": value}
    return None


def _resolve_agent_session(
    request: Request,
    response: Response,
    current_user: Optional[Dict[str, Any]],
    requested_session_id: Optional[str] = None,
) -> tuple[str, str, str, bool]:
    tenant_id, user_id = _resolve_agent_actor(request, current_user)
    session = create_or_get_session(tenant_id=tenant_id, user_id=user_id, session_id=requested_session_id)
    session_id = str(session.get("session_id") or "")
    summary_present = bool(str(session.get("summary_text") or "").strip())
    is_new = bool(session.get("is_new"))
    if session_id:
        response.headers["X-Agent-Session-Id"] = session_id
    sys_logger.info(
        json.dumps(
            {
                "event": ("agent_session_created" if is_new else "agent_session_loaded"),
                "session_id": session_id,
                "tenant_id": tenant_id,
                "user_id": user_id,
            },
            ensure_ascii=False,
        )
    )
    return session_id, tenant_id, user_id, summary_present


def _append_session_event_audit(
    tenant_id: str,
    user_id: str,
    session_id: str,
    event_type: str,
    payload: Dict[str, Any],
    idempotency_key: Optional[str] = None,
) -> Optional[int]:
    if not session_id:
        return None
    try:
        event_id = append_session_event(
            tenant_id=tenant_id,
            user_id=user_id,
            session_id=session_id,
            type=event_type,
            payload=payload,
            idempotency_key=idempotency_key,
        )
        sys_logger.info(
            json.dumps(
                {
                    "event": "agent_session_event_appended",
                    "event_type": event_type,
                    "event_id": event_id,
                    "session_id": session_id,
                    "tenant_id": tenant_id,
                    "user_id": user_id,
                },
                ensure_ascii=False,
            )
        )
        return event_id
    except (SessionNotFoundError, SessionAccessDeniedError):
        raise
    except Exception as e:
        sys_logger.warning(f"session event append skipped: type={event_type} session_id={session_id} err={e}")
        return None


def _emit_quality_metrics_event(
    *,
    out: IdeaScriptResponse,
    session_id: str,
    tenant_id: str,
    user_id: str,
    latency_ms: Optional[int],
    req_id: str,
) -> Dict[str, Any]:
    quality_metrics = build_quality_metrics(
        response=out,
        session_id=session_id,
        tenant_id=tenant_id,
        user_id=user_id,
        prompt_version=out.prompt_version,
        policy_version=out.policy_version,
        config_hash=out.config_hash,
        total_tool_calls=2,
        mcp_calls_count=(1 if bool(getattr(idea_script_orchestrator.config, "asset_match_use_mcp", False)) else 0),
        latency_ms=(int(latency_ms or 0) if latency_ms is not None else None),
        clarification_rate=None,
        asset_match_use_mcp=bool(getattr(idea_script_orchestrator.config, "asset_match_use_mcp", False)),
    )
    _append_session_event_audit(
        tenant_id=tenant_id,
        user_id=user_id,
        session_id=session_id,
        event_type="QUALITY_METRICS",
        payload=quality_metrics.model_dump(mode="json"),
        idempotency_key=f"quality_metrics:{req_id}:{session_id}",
    )
    return quality_metrics.model_dump(mode="json")


def _emit_trajectory_event(
    *,
    session_id: str,
    tenant_id: str,
    user_id: str,
    trajectory_payload: Optional[Dict[str, Any]],
    req_id: str,
) -> Optional[Dict[str, Any]]:
    if not bool(getattr(idea_script_orchestrator.config, "trajectory_eval_enabled", False)):
        return None
    payload = dict(trajectory_payload or {})
    if not payload:
        return None
    _append_session_event_audit(
        tenant_id=tenant_id,
        user_id=user_id,
        session_id=session_id,
        event_type="TRAJECTORY_EVAL",
        payload=payload,
        idempotency_key=f"trajectory_eval:{req_id}:{session_id}",
    )
    return payload


@contextmanager
def _span(name: str, attributes: Optional[Dict[str, Any]] = None):
    if _tracer is None:
        with nullcontext():
            yield _NoopSpan()
        return
    with _tracer.start_as_current_span(name) as span:
        for key, value in dict(attributes or {}).items():
            try:
                if value is not None:
                    span.set_attribute(key, value)
            except Exception:
                continue
        yield span


def _set_video_upscale_task(task_id: str, **patch: Any) -> None:
    with video_upscale_tasks_lock:
        current = video_upscale_tasks.get(task_id, {})
        current.update(patch)
        video_upscale_tasks[task_id] = current


def _get_video_upscale_task(task_id: str) -> Optional[Dict[str, Any]]:
    with video_upscale_tasks_lock:
        current = video_upscale_tasks.get(task_id)
        return dict(current) if isinstance(current, dict) else None


VIDEO_UPSCALE_ALLOWED_RESOLUTIONS = {1080, 1440, 2160}


def _normalize_video_upscale_resolution(value: Any) -> int:
    try:
        parsed = int(str(value).strip())
    except Exception:
        return 1440
    return parsed if parsed in VIDEO_UPSCALE_ALLOWED_RESOLUTIONS else 1440


def _normalize_video_upscale_batch_size(value: Any) -> int:
    try:
        parsed = int(str(value).strip())
    except Exception:
        return 1
    return max(1, parsed)


def _parse_size_to_dimensions(size: Optional[str], aspect_ratio: Optional[str], *, default: tuple[int, int] = (1024, 1024)) -> tuple[int, int]:
    target = str(calculate_target_resolution(size or "1024x1024", aspect_ratio or "1:1") or "").strip()
    matched = re.match(r"^\s*(\d+)\s*[xX]\s*(\d+)\s*$", target)
    if not matched:
        return default
    width = max(64, int(matched.group(1)))
    height = max(64, int(matched.group(2)))
    return width, height


def _parse_local_i2v_dimensions(resolution: Optional[str], ratio: Optional[str]) -> tuple[int, int]:
    text = str(resolution or "").strip().lower()
    direct = re.match(r"^\s*(\d+)\s*[xX]\s*(\d+)\s*$", text)
    if direct:
        return min(1280, max(64, int(direct.group(1)))), min(1280, max(64, int(direct.group(2))))

    p_match = re.match(r"^\s*(\d+)\s*p\s*$", text)
    base = int(p_match.group(1)) if p_match else 640
    base = min(720, max(64, base))

    ratio_text = str(ratio or "").strip().lower()
    ratio_match = re.match(r"^\s*(\d+)\s*:\s*(\d+)\s*$", ratio_text)
    if not ratio_match:
        return base, base

    ratio_w = max(1, int(ratio_match.group(1)))
    ratio_h = max(1, int(ratio_match.group(2)))
    if ratio_w >= ratio_h:
        height = base
        width = max(64, int(round(base * ratio_w / ratio_h)))
    else:
        width = base
        height = max(64, int(round(base * ratio_h / ratio_w)))
    return width, height


def _cache_edit_plans(plans: List[EditPlan]) -> None:
    with idea_script_plan_cache_lock:
        for plan in list(plans or []):
            key = str(getattr(plan, "plan_id", "") or "").strip()
            if not key:
                continue
            idea_script_plan_cache[key] = plan.model_dump(mode="json")


def _get_cached_edit_plan(plan_id: str) -> Optional[Dict[str, Any]]:
    key = str(plan_id or "").strip()
    if not key:
        return None
    with idea_script_plan_cache_lock:
        data = idea_script_plan_cache.get(key)
        return dict(data) if isinstance(data, dict) else None


# =========================================================
# Core image/video endpoints
# =========================================================

@router.post("/api/text2img", response_model=Text2ImgResponse)
def text_to_image(req: Text2ImgRequest, request: Request, current_user=Depends(get_current_user)):
    req_id = request.state.req_id
    selected_model = req.model or MODEL_GEMINI
    t0 = time.time()

    try:
        img_bytes = None

        # ---- Doubao (Ark) ----
        if selected_model == MODEL_DOUBAO:
            img_bytes = call_doubao_image_gen(
                req.prompt,
                req_id,
                size_param=req.size or "1024x1024",
                aspect_ratio=req.aspect_ratio or "1:1",
            )
        # ---- Gemini ----
        else:
            gemini_resolution = "1K"
            s = (req.size or "").lower()
            if "2k" in s:
                gemini_resolution = "2K"
            elif "4k" in s:
                gemini_resolution = "4K"

            gen_config = types.GenerateContentConfig(
                temperature=req.temperature,
                response_modalities=["IMAGE"],
                image_config=types.ImageConfig(
                    aspect_ratio=req.aspect_ratio or "1:1",
                    image_size=gemini_resolution,
                ),
            )

            response = call_genai_retry(
                contents=[types.Part(text=req.prompt)],
                config=gen_config,
                req_id=req_id,
                model=selected_model,
            )
            img_bytes = get_image_from_response(response)

        if not img_bytes:
            raise RuntimeError("No image returned")

        output_data_url = bytes_to_data_url(img_bytes)
        prompt_logger.log(
            req_id,
            "text2img",
            req.model_dump(),
            req.prompt,
            {"model": selected_model, "temp": req.temperature, "size": req.size, "ar": req.aspect_ratio},
            {"file": "mem"},
            time.time() - t0,
            user_id=current_user["id"],
            inputs_full=req.model_dump(),
            output_full={"images": [output_data_url]},
        )
        record_usage(current_user["id"], selected_model)

        return Text2ImgResponse(images=[output_data_url])

    except Exception as e:
        sys_logger.error(f"[{req_id}] Text2Img Error: {e}")
        prompt_logger.log(
            req_id,
            "text2img",
            req.model_dump(),
            req.prompt,
            {"model": selected_model, "temp": req.temperature, "size": req.size, "ar": req.aspect_ratio},
            {"file": "mem"},
            time.time() - t0,
            user_id=current_user["id"],
            inputs_full=req.model_dump(),
            error=str(e),
        )
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/multi_image_generate", response_model=MultiImageResponse)
def multi_image_generate(req: MultiImageRequest, request: Request, current_user=Depends(_get_current_user_optional)):
    req_id = request.state.req_id
    t0 = time.time()

    try:
        # Prefer aiChat(new) for swap-like image editing, fallback to existing Gemini flow.
        member_authorization = _resolve_member_authorization(request)
        if member_authorization and _AI_CHAT_MODEL_ID_NANO_BANANA_PRO:
            try:
                proxy_req = AIChatCurlProxyRequest(
                    authorization=member_authorization,
                    module_enum="1",
                    part_enum="2",
                    message=req.prompt or "",
                    ai_chat_session_id="0",
                    ai_chat_model_id=_AI_CHAT_MODEL_ID_NANO_BANANA_PRO,
                    ai_image_param_size_id=_map_param_id(_AI_CHAT_IMAGE_SIZE_ID_MAP, req.size),
                    ai_image_param_ratio_id=_map_param_id(_AI_CHAT_IMAGE_RATIO_ID_MAP, req.aspect_ratio),
                    images=list(req.images or []),
                    timeout_seconds=120,
                )
                proxy_data = _call_ai_chat_image_via_curl(req_id=req_id, req=proxy_req)
                done_error = str(proxy_data.get("done_error") or "").strip()
                image_url = str(proxy_data.get("image_url") or "").strip()
                if image_url and not done_error:
                    prompt_logger.log(
                        req_id,
                        "multi_image_generate",
                        req.model_dump(),
                        req.prompt,
                        {"model": "ai_chat_nano_banana_pro", "temperature": req.temperature, "ar": req.aspect_ratio},
                        {"file": "mem"},
                        time.time() - t0,
                        user_id=_user_id_for_log(current_user),
                        inputs_full=req.model_dump(),
                        output_full={"images": [image_url]},
                    )
                    return MultiImageResponse(image=image_url)
                raise RuntimeError(done_error or "aiChat 未返回图片URL")
            except Exception as ai_chat_err:
                sys_logger.warning(f"[{req_id}] multi_image_generate aiChat fallback: {ai_chat_err}")

        contents = [types.Part(text=req.prompt)]
        for img_str in req.images:
            m, b = parse_data_url(img_str)
            contents.append(types.Part.from_bytes(data=b, mime_type=m))

        gen_config_kwargs = {
            "temperature": req.temperature,
            "response_modalities": ["IMAGE"],
        }
        if req.aspect_ratio:
            gemini_resolution = "1K"
            s = (req.size or "").lower()
            if "2k" in s:
                gemini_resolution = "2K"
            elif "4k" in s:
                gemini_resolution = "4K"
            gen_config_kwargs["image_config"] = types.ImageConfig(
                aspect_ratio=req.aspect_ratio,
                image_size=gemini_resolution,
            )

        gen_config = types.GenerateContentConfig(**gen_config_kwargs)

        response = call_genai_retry(contents=contents, config=gen_config, req_id=req_id, model=MODEL_GEMINI)
        img_bytes = get_image_from_response(response)
        if not img_bytes:
            raise RuntimeError("No image returned")

        output_data_url = bytes_to_data_url(img_bytes)
        prompt_logger.log(
            req_id,
            "multi_image_generate",
            req.model_dump(),
            req.prompt,
            {"temperature": req.temperature, "ar": req.aspect_ratio},
            {"file": "mem"},
            time.time() - t0,
            user_id=_user_id_for_log(current_user),
            inputs_full=req.model_dump(),
            output_full={"images": [output_data_url]},
        )
        _record_usage_if_authed(current_user, MODEL_GEMINI)
        return MultiImageResponse(image=output_data_url)

    except Exception as e:
        sys_logger.error(f"[{req_id}] MultiImage Error: {e}")
        prompt_logger.log(
            req_id,
            "multi_image_generate",
            req.model_dump(),
            req.prompt,
            {"temperature": req.temperature, "ar": req.aspect_ratio},
            {"file": "mem"},
            time.time() - t0,
            user_id=_user_id_for_log(current_user),
            inputs_full=req.model_dump(),
            error=str(e),
        )
        raise HTTPException(status_code=500, detail=str(e))


def _call_ai_chat_image_via_curl(req_id: str, req: AIChatCurlProxyRequest) -> Dict[str, Any]:
    cmd, request_form, temp_files, endpoint, timeout_seconds, build_metrics = _build_ai_chat_curl_command(req_id, req)
    started_at = time.time()
    started_perf = time.perf_counter()
    process = None
    deferred_cleanup = False
    stdout_text = ""
    stderr_text = ""
    fast_image_url = ""
    fast_done_error = ""
    first_chunk_ms = None
    first_result_ms = None
    read_loop_started_perf = time.perf_counter()
    lines_read = 0
    sys_logger.info(
        json.dumps(
            {
                "event": "ai_chat_image_via_curl_start",
                "req_id": req_id,
                "endpoint": endpoint,
                "module_enum": str(req.module_enum or ""),
                "part_enum": str(req.part_enum or ""),
                "ai_chat_model_id": str(req.ai_chat_model_id or ""),
                "timeout_seconds": timeout_seconds,
                "build_metrics": build_metrics,
            },
            ensure_ascii=False,
        )
    )
    try:
        try:
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
            )
            assert process.stdout is not None
            deadline = time.time() + timeout_seconds + 5
            while True:
                if time.time() > deadline:
                    raise HTTPException(status_code=504, detail=f"curl 请求超时({timeout_seconds}s)")
                chunk = process.stdout.readline()
                if chunk:
                    lines_read += 1
                    now_ms = int((time.perf_counter() - started_perf) * 1000)
                    if first_chunk_ms is None:
                        first_chunk_ms = now_ms
                    stdout_text += chunk
                    line_image_url, line_done_error = _extract_fast_result_from_stream_line(chunk)
                    if line_image_url and not fast_image_url:
                        fast_image_url = line_image_url
                    if line_done_error and not fast_done_error:
                        fast_done_error = line_done_error
                    if fast_image_url or fast_done_error:
                        if first_result_ms is None:
                            first_result_ms = now_ms
                        break
                elif process.poll() is not None:
                    break
        except HTTPException:
            raise
        except FileNotFoundError:
            raise HTTPException(status_code=500, detail="服务器未安装 curl")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"curl 执行失败: {e}")
    finally:
        if process is not None:
            try:
                if process.poll() is None:
                    if fast_image_url or fast_done_error:
                        deferred_cleanup = True
                        _schedule_graceful_curl_process_cleanup(
                            process,
                            req_id=req_id,
                            context="ai_chat_image_via_curl",
                        )
                    else:
                        process.kill()
            except Exception:
                pass
            try:
                if process.stderr is not None and not deferred_cleanup:
                    stderr_text = str(process.stderr.read() or "")
            except Exception:
                pass
        for path in temp_files:
            try:
                os.remove(path)
            except Exception:
                pass

    elapsed_ms = int((time.time() - started_at) * 1000)
    read_loop_ms = int((time.perf_counter() - read_loop_started_perf) * 1000)
    return_code = process.returncode if process is not None else 0
    if return_code not in (0, None) and not stdout_text:
        sys_logger.error(f"[{req_id}] ai_chat_image_via_curl error: code={return_code}, stderr={stderr_text[:500]}")
        raise HTTPException(status_code=500, detail=f"curl 请求失败(code={return_code}): {stderr_text[:300]}")

    parse_started_perf = time.perf_counter()
    parsed = _parse_sse_output(stdout_text)
    parse_ms = int((time.perf_counter() - parse_started_perf) * 1000)
    done_error = fast_done_error or str(parsed.get("done_error") or "").strip()
    image_url = fast_image_url or str(parsed.get("image_url") or "").strip()
    ok = bool(image_url) and not done_error
    timings = {
        "build_ms": int(build_metrics.get("build_ms") or 0),
        "first_chunk_ms": first_chunk_ms,
        "first_result_ms": first_result_ms,
        "read_loop_ms": read_loop_ms,
        "parse_ms": parse_ms,
        "total_ms": elapsed_ms,
        "lines_read": lines_read,
    }
    sys_logger.info(
        json.dumps(
            {
                "event": "ai_chat_image_via_curl_done",
                "req_id": req_id,
                "ok": ok,
                "endpoint": endpoint,
                "module_enum": str(req.module_enum or ""),
                "part_enum": str(req.part_enum or ""),
                "ai_chat_model_id": str(req.ai_chat_model_id or ""),
                "timings": timings,
                "build_metrics": build_metrics,
                "stdout_chars": len(stdout_text),
                "stderr_chars": len(stderr_text),
                "return_code": return_code,
                "has_image_url": bool(image_url),
                "has_done_error": bool(done_error),
            },
            ensure_ascii=False,
        )
    )

    return {
        "ok": ok,
        "endpoint": endpoint,
        "duration_ms": elapsed_ms,
        "request_form": request_form,
        "request_files_count": len(temp_files),
        "mode": parsed.get("mode", "text"),
        "image_url": image_url,
        "done_error": done_error,
        "source_session_id": parsed.get("source_session_id", ""),
        "source_history_record_id": parsed.get("source_history_record_id", ""),
        "events": parsed.get("events", []),
        "text": parsed.get("text", ""),
        "stderr": stderr_text[-2000:],
        "timings": timings,
        "build_metrics": build_metrics,
    }


def _call_ai_chat_image_via_curl_from_task(
    *,
    req_id: str,
    task_id: str,
    request_form: Dict[str, Any],
    request_files: List[Dict[str, Any]],
) -> Dict[str, Any]:
    build_started_at = time.perf_counter()
    endpoint = str(request_form.get("endpoint") or AI_CHAT_DOWNSTREAM_URL).strip() or AI_CHAT_DOWNSTREAM_URL
    authorization = clean_form_value(request_form.get("authorization"))
    timeout_seconds = max(10, min(int(request_form.get("timeout_seconds") or AI_CHAT_TASK_TIMEOUT_SEC), 300))
    if not authorization:
        raise HTTPException(status_code=400, detail="authorization 不能为空")

    cmd: List[str] = [
        "curl",
        "-sS",
        "-N",
        "--location",
        endpoint,
        "--max-time",
        str(timeout_seconds),
        "--header",
        f"authorization: {authorization}",
        "--header",
        f"x-request-id: {req_id}",
    ]
    request_form_dump: Dict[str, str] = {}
    for key in [
        "history_ai_chat_record_id",
        "module_enum",
        "part_enum",
        "message",
        "ai_chat_session_id",
        "ai_chat_model_id",
        "ai_image_param_task_type_id",
        "ai_image_param_size_id",
        "ai_image_param_ratio_id",
        "ai_video_param_ratio_id",
        "ai_video_param_resolution_id",
        "ai_video_param_duration_id",
    ]:
        quoted = _to_quoted_form_value(request_form.get(key))
        if not quoted:
            continue
        request_form_dump[key] = quoted
        cmd.extend(["--form", f"{key}={quoted}"])
    for item in list(request_form.get("tusd_file_remote_ids") or []):
        quoted = _to_quoted_form_value(item)
        if not quoted:
            continue
        cmd.extend(["--form", f"tusd_file_remote_ids[]={quoted}"])

    materialize_items: List[Dict[str, Any]] = []
    for idx, item in enumerate(request_files):
        path = str(item.get("path") or "").strip()
        if not path or not os.path.exists(path):
            raise HTTPException(status_code=400, detail=f"图片文件不存在: {path}")
        file_size = 0
        try:
            file_size = int(os.path.getsize(path))
        except Exception:
            file_size = 0
        materialize_items.append(
            {
                "index": idx,
                "source": str(item.get("source") or "task_file"),
                "size_bytes": file_size,
                "elapsed_ms": 0,
            }
        )
        cmd.extend(["--form", f"files=@{path}"])

    build_metrics = {
        "build_ms": int((time.perf_counter() - build_started_at) * 1000),
        "form_field_count": len(request_form_dump),
        "image_count": len(request_files),
        "remote_file_id_count": len(list(request_form.get("tusd_file_remote_ids") or [])),
        "image_materialization": materialize_items,
        "task_id": task_id,
    }

    started_at = time.time()
    started_perf = time.perf_counter()
    process = None
    deferred_cleanup = False
    stdout_text = ""
    stderr_text = ""
    fast_image_url = ""
    fast_done_error = ""
    first_chunk_ms = None
    first_result_ms = None
    read_loop_started_perf = time.perf_counter()
    lines_read = 0

    sys_logger.info(
        json.dumps(
            {
                "event": "ai_chat_image_via_curl_task_start",
                "req_id": req_id,
                "task_id": task_id,
                "endpoint": endpoint,
                "module_enum": str(request_form.get("module_enum") or ""),
                "part_enum": str(request_form.get("part_enum") or ""),
                "ai_chat_model_id": str(request_form.get("ai_chat_model_id") or ""),
                "timeout_seconds": timeout_seconds,
                "build_metrics": build_metrics,
            },
            ensure_ascii=False,
        )
    )

    try:
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        assert process.stdout is not None
        deadline = time.time() + timeout_seconds + 5
        while True:
            if time.time() > deadline:
                raise HTTPException(status_code=504, detail=f"curl 请求超时({timeout_seconds}s)")
            chunk = process.stdout.readline()
            if chunk:
                lines_read += 1
                now_ms = int((time.perf_counter() - started_perf) * 1000)
                if first_chunk_ms is None:
                    first_chunk_ms = now_ms
                stdout_text += chunk
                line_image_url, line_done_error = _extract_fast_result_from_stream_line(chunk)
                if line_image_url and not fast_image_url:
                    fast_image_url = line_image_url
                if line_done_error and not fast_done_error:
                    fast_done_error = line_done_error
                if fast_image_url or fast_done_error:
                    if first_result_ms is None:
                        first_result_ms = now_ms
                    break
            elif process.poll() is not None:
                break
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail="服务器未安装 curl") from exc
    finally:
        if process is not None:
            try:
                if process.poll() is None:
                    if fast_image_url or fast_done_error:
                        deferred_cleanup = True
                        _schedule_graceful_curl_process_cleanup(
                            process,
                            req_id=req_id,
                            context=f"ai_chat_image_via_curl_task:{task_id}",
                        )
                    else:
                        process.kill()
            except Exception:
                pass
            try:
                if process.stderr is not None and not deferred_cleanup:
                    stderr_text = str(process.stderr.read() or "")
            except Exception:
                pass

    elapsed_ms = int((time.time() - started_at) * 1000)
    read_loop_ms = int((time.perf_counter() - read_loop_started_perf) * 1000)
    return_code = process.returncode if process is not None else 0
    if return_code not in (0, None) and not stdout_text:
        raise HTTPException(status_code=500, detail=f"curl 请求失败(code={return_code}): {stderr_text[:300]}")

    parse_started_perf = time.perf_counter()
    parsed = _parse_sse_output(stdout_text)
    parse_ms = int((time.perf_counter() - parse_started_perf) * 1000)
    done_error = fast_done_error or str(parsed.get("done_error") or "").strip()
    image_url = fast_image_url or str(parsed.get("image_url") or "").strip()
    ok = bool(image_url) and not done_error
    timings = {
        "build_ms": int(build_metrics.get("build_ms") or 0),
        "first_chunk_ms": first_chunk_ms,
        "first_result_ms": first_result_ms,
        "read_loop_ms": read_loop_ms,
        "parse_ms": parse_ms,
        "total_ms": elapsed_ms,
        "lines_read": lines_read,
    }
    return {
        "ok": ok,
        "endpoint": endpoint,
        "duration_ms": elapsed_ms,
        "request_form": request_form_dump,
        "request_files_count": len(request_files),
        "mode": parsed.get("mode", "text"),
        "image_url": image_url,
        "done_error": done_error,
        "source_session_id": parsed.get("source_session_id", ""),
        "source_history_record_id": parsed.get("source_history_record_id", ""),
        "events": parsed.get("events", []),
        "text": parsed.get("text", ""),
        "stderr": stderr_text[-2000:],
        "raw_text": stdout_text[-20000:],
        "timings": timings,
        "build_metrics": build_metrics,
    }


def _decode_httpx_body(body: bytes, headers: Optional[Dict[str, Any]] = None) -> str:
    if not body:
        return ""
    encoding = ""
    if headers:
        content_type = str(headers.get("content-type") or "")
        matched = re.search(r"charset=([^\s;]+)", content_type, re.IGNORECASE)
        if matched:
            encoding = matched.group(1).strip().strip('"').strip("'")
    for codec in [encoding, "utf-8", "utf-8-sig", "latin-1"]:
        if not codec:
            continue
        try:
            return body.decode(codec)
        except Exception:
            continue
    return body.decode("utf-8", errors="replace")


def _extract_error_message_from_payload(payload: Any) -> str:
    if isinstance(payload, dict):
        for key in ["detail", "message", "error", "errMsg"]:
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return json.dumps(payload, ensure_ascii=False)[:2000]
    if isinstance(payload, list):
        return json.dumps(payload, ensure_ascii=False)[:2000]
    return str(payload or "").strip()


async def _call_ai_chat_image_via_httpx_once(
    *,
    req_id: str,
    task_id: str,
    request_form: Dict[str, Any],
    request_files: List[Dict[str, Any]],
) -> Dict[str, Any]:
    endpoint = str(request_form.get("endpoint") or AI_CHAT_DOWNSTREAM_URL).strip() or AI_CHAT_DOWNSTREAM_URL
    authorization = clean_form_value(request_form.get("authorization"))
    if not authorization:
        raise _AIChatNonRetryableError("authorization 不能为空", status_code=400)

    timeout_seconds = max(10, min(int(request_form.get("timeout_seconds") or AI_CHAT_TASK_TIMEOUT_SEC), 300))
    timeout = httpx.Timeout(timeout_seconds, connect=30.0, read=float(timeout_seconds), write=60.0, pool=30.0)
    headers = {
        "authorization": authorization,
        "x-request-id": req_id,
    }
    form_pairs: list[tuple[str, str]] = []
    for key in [
        "history_ai_chat_record_id",
        "module_enum",
        "part_enum",
        "message",
        "ai_chat_session_id",
        "ai_chat_model_id",
        "ai_image_param_task_type_id",
        "ai_image_param_size_id",
        "ai_image_param_ratio_id",
        "ai_video_param_ratio_id",
        "ai_video_param_resolution_id",
        "ai_video_param_duration_id",
    ]:
        value = clean_form_value(request_form.get(key))
        if value:
            form_pairs.append((key, value))
    for remote_id in list(request_form.get("tusd_file_remote_ids") or []):
        cleaned = clean_form_value(remote_id)
        if cleaned:
            form_pairs.append(("tusd_file_remote_ids[]", cleaned))

    started_perf = time.perf_counter()
    first_chunk_ms = None
    first_result_ms = None
    lines_read = 0
    raw_text = ""
    parsed_json = None
    fast_image_url = ""
    fast_done_error = ""

    files_payload = []
    for item in request_files:
        path = str(item.get("path") or "").strip()
        if not path or not os.path.exists(path):
            raise _AIChatNonRetryableError(f"图片文件不存在: {path}", status_code=400)
        try:
            with open(path, "rb") as f:
                file_bytes = f.read()
        except Exception as exc:
            raise _AIChatNonRetryableError(f"读取图片文件失败: {path}", status_code=400) from exc
        files_payload.append(
            (
                "files",
                (
                    str(item.get("filename") or os.path.basename(path)),
                    file_bytes,
                    str(item.get("content_type") or "application/octet-stream"),
                ),
            )
        )

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            try:
                async with client.stream(
                    "POST",
                    endpoint,
                    headers=headers,
                    data=form_pairs,
                    files=files_payload,
                ) as resp:
                    content_type = str(resp.headers.get("content-type") or "").lower()
                    if resp.status_code >= 400:
                        body = await resp.aread()
                        raw_text = _decode_httpx_body(body, dict(resp.headers))
                        try:
                            parsed_json = json.loads(raw_text)
                        except Exception:
                            parsed_json = None
                        message = _extract_error_message_from_payload(parsed_json if parsed_json is not None else raw_text) or f"HTTP {resp.status_code}"
                        if resp.status_code in {502, 503, 504}:
                            error_type = "TIMEOUT" if resp.status_code == 504 else "FAILED"
                            raise _AIChatRetryableError(message, status_code=resp.status_code, raw_text=raw_text, response_json=parsed_json, error_type=error_type)
                        raise _AIChatNonRetryableError(message, status_code=resp.status_code, raw_text=raw_text, response_json=parsed_json)

                    if "application/json" in content_type:
                        body = await resp.aread()
                        raw_text = _decode_httpx_body(body, dict(resp.headers))
                        try:
                            parsed_json = json.loads(raw_text)
                        except Exception:
                            parsed_json = None
                    else:
                        chunks: List[str] = []
                        async for line in resp.aiter_lines():
                            if line is None:
                                continue
                            lines_read += 1
                            now_ms = int((time.perf_counter() - started_perf) * 1000)
                            if first_chunk_ms is None:
                                first_chunk_ms = now_ms
                            chunks.append(f"{line}\n")
                            line_image_url, line_done_error = _extract_fast_result_from_stream_line(line)
                            if line_image_url and not fast_image_url:
                                fast_image_url = line_image_url
                            if line_done_error and not fast_done_error:
                                fast_done_error = line_done_error
                            if fast_image_url or fast_done_error:
                                if first_result_ms is None:
                                    first_result_ms = now_ms
                                break
                        raw_text = "".join(chunks)
            except httpx.ConnectTimeout as exc:
                raise _AIChatRetryableError(f"connect timeout: {exc}", error_type="TIMEOUT") from exc
            except httpx.ReadTimeout as exc:
                raise _AIChatRetryableError(f"read timeout: {exc}", error_type="TIMEOUT") from exc
            except httpx.ConnectError as exc:
                raise _AIChatRetryableError(f"connect error: {exc}", error_type="FAILED") from exc
            except httpx.TransportError as exc:
                raise _AIChatRetryableError(f"network error: {exc}", error_type="FAILED") from exc

        parse_started_perf = time.perf_counter()
        if parsed_json is not None:
            parsed = {
                "events": [],
                "text": raw_text,
                "mode": "json",
                "image_url": _pick_first_image_url(parsed_json),
                "done_error": _extract_error_message_from_payload(parsed_json.get("done_error") if isinstance(parsed_json, dict) else ""),
                "source_session_id": str(parsed_json.get("source_session_id") or parsed_json.get("ai_chat_session_id") or "") if isinstance(parsed_json, dict) else "",
                "source_history_record_id": str(parsed_json.get("source_history_record_id") or parsed_json.get("history_ai_chat_record_id") or "") if isinstance(parsed_json, dict) else "",
            }
            if isinstance(parsed_json, dict) and not parsed["done_error"]:
                parsed["done_error"] = _extract_error_message_from_payload(parsed_json.get("error") or parsed_json.get("message") or parsed_json.get("detail"))
        else:
            parsed = _parse_sse_output(raw_text)
        parse_ms = int((time.perf_counter() - parse_started_perf) * 1000)
        done_error = fast_done_error or str(parsed.get("done_error") or "").strip()
        image_url = fast_image_url or str(parsed.get("image_url") or "").strip()
        ok = bool(image_url) and not done_error
        total_ms = int((time.perf_counter() - started_perf) * 1000)

        return {
            "ok": ok,
            "endpoint": endpoint,
            "duration_ms": total_ms,
            "request_form": request_form,
            "request_files_count": len(request_files),
            "mode": parsed.get("mode", "text"),
            "image_url": image_url,
            "done_error": done_error,
            "source_session_id": parsed.get("source_session_id", ""),
            "source_history_record_id": parsed.get("source_history_record_id", ""),
            "events": parsed.get("events", []),
            "text": parsed.get("text", raw_text),
            "stderr": "",
            "raw_text": raw_text[-20000:],
            "timings": {
                "build_ms": 0,
                "first_chunk_ms": first_chunk_ms,
                "first_result_ms": first_result_ms,
                "read_loop_ms": total_ms,
                "parse_ms": parse_ms,
                "total_ms": total_ms,
                "lines_read": lines_read,
            },
            "build_metrics": {
                "form_field_count": len(form_pairs),
                "image_count": len(request_files),
                "remote_file_id_count": len(list(request_form.get("tusd_file_remote_ids") or [])),
            },
            "response_json": parsed_json,
        }
    finally:
        pass


async def _run_ai_chat_image_task(task_id: str) -> None:
    task = get_ai_chat_task(AI_CHAT_TASK_DB_PATH, task_id)
    if not task:
        return

    request_form = dict(task.get("request_form_json") or {})
    request_files = list(task.get("request_files_json") or [])
    request_images = list(request_form.get("images") or [])
    req_id = str(task.get("req_id") or uuid.uuid4().hex[:8])
    ai_chat_model_id = clean_form_value(request_form.get("ai_chat_model_id"))
    image_count = int(task.get("image_count") or len(request_files))
    max_retries = max(0, min(int(AI_CHAT_TASK_MAX_RETRIES or 3), len(_AI_CHAT_TASK_RETRY_BACKOFFS)))
    started_at_iso = _now_iso()
    queue_wait_ms = _diff_ms(_parse_iso_datetime(task.get("created_at")), _parse_iso_datetime(started_at_iso))

    sys_logger.info(
        json.dumps(
            {
                "event": "ai_chat_image_task_start",
                "req_id": req_id,
                "task_id": task_id,
                "status": "RUNNING",
                "retry_count": 0,
                "image_count": image_count,
                "ai_chat_model_id": ai_chat_model_id,
                "queue_wait_ms": queue_wait_ms,
            },
            ensure_ascii=False,
        )
    )
    update_ai_chat_task(
        AI_CHAT_TASK_DB_PATH,
        task_id,
        status="RUNNING",
        progress_message="任务执行中",
        started_at=started_at_iso,
        error="",
    )

    last_error = ""
    last_raw_text = ""
    for attempt in range(max_retries + 1):
        attempt_started = time.perf_counter()
        try:
            has_uploaded_files = any(str(item.get("source") or "") == "upload_file" for item in request_files)
            if request_images and not has_uploaded_files:
                proxy_req = AIChatCurlProxyRequest(
                    endpoint=str(request_form.get("endpoint") or ""),
                    authorization=str(request_form.get("authorization") or ""),
                    history_ai_chat_record_id=str(request_form.get("history_ai_chat_record_id") or ""),
                    module_enum=str(request_form.get("module_enum") or "1"),
                    part_enum=str(request_form.get("part_enum") or "2"),
                    message=str(request_form.get("message") or ""),
                    ai_chat_session_id=str(request_form.get("ai_chat_session_id") or ""),
                    ai_chat_model_id=str(request_form.get("ai_chat_model_id") or ""),
                    ai_image_param_task_type_id=str(request_form.get("ai_image_param_task_type_id") or ""),
                    ai_image_param_size_id=str(request_form.get("ai_image_param_size_id") or ""),
                    ai_image_param_ratio_id=str(request_form.get("ai_image_param_ratio_id") or ""),
                    ai_video_param_ratio_id=str(request_form.get("ai_video_param_ratio_id") or ""),
                    ai_video_param_resolution_id=str(request_form.get("ai_video_param_resolution_id") or ""),
                    ai_video_param_duration_id=str(request_form.get("ai_video_param_duration_id") or ""),
                    tusd_file_remote_ids=list(request_form.get("tusd_file_remote_ids") or []),
                    images=request_images,
                    timeout_seconds=int(request_form.get("timeout_seconds") or AI_CHAT_TASK_TIMEOUT_SEC),
                )
                result = await asyncio.to_thread(_call_ai_chat_image_via_curl, req_id, proxy_req)
            else:
                result = await asyncio.to_thread(
                    _call_ai_chat_image_via_curl_from_task,
                    req_id=req_id,
                    task_id=task_id,
                    request_form=request_form,
                    request_files=request_files,
                )
            done_error = str(result.get("done_error") or "").strip()
            image_url = str(result.get("image_url") or "").strip()
            if done_error:
                raise _AIChatNonRetryableError(done_error, raw_text=str(result.get("raw_text") or ""))
            if not image_url:
                raise _AIChatNonRetryableError("下游未返回图片结果", raw_text=str(result.get("raw_text") or ""))

            duration_ms = int((time.perf_counter() - attempt_started) * 1000)
            finished_at_iso = _now_iso()
            updated_task = update_ai_chat_task(
                AI_CHAT_TASK_DB_PATH,
                task_id,
                status="SUCCESS",
                retry_count=attempt,
                progress_message="任务执行成功",
                result=result,
                error="",
                raw_response_text=str(result.get("raw_text") or ""),
                finished_at=finished_at_iso,
                last_duration_ms=duration_ms,
            )
            telemetry = _build_ai_chat_task_telemetry(
                updated_task,
                result=result,
                runtime_end=_parse_iso_datetime(finished_at_iso),
            )
            sys_logger.info(
                json.dumps(
                    {
                        "event": "ai_chat_image_task_success",
                        "req_id": req_id,
                        "task_id": task_id,
                        "status": "SUCCESS",
                        "retry_count": attempt,
                        "duration_ms": duration_ms,
                        "image_count": image_count,
                        "ai_chat_model_id": ai_chat_model_id,
                        "telemetry": telemetry,
                    },
                    ensure_ascii=False,
                )
            )
            _cleanup_ai_chat_task_dir(task_id)
            return
        except HTTPException as exc:
            duration_ms = int((time.perf_counter() - attempt_started) * 1000)
            detail = str(getattr(exc, "detail", "") or str(exc) or "请求失败")
            status_code = int(getattr(exc, "status_code", 500) or 500)
            is_retryable = status_code in {502, 503, 504} or re.search(r"(timeout|timed out|network|连接|socket|dns)", detail, re.IGNORECASE)
            if is_retryable and attempt < max_retries:
                backoff = int(_AI_CHAT_TASK_RETRY_BACKOFFS[attempt])
                updated_task = update_ai_chat_task(
                    AI_CHAT_TASK_DB_PATH,
                    task_id,
                    status="RETRYING",
                    retry_count=attempt + 1,
                    progress_message=f"任务重试中，{backoff}s 后发起第 {attempt + 1} 次重试",
                    error=detail,
                    last_duration_ms=duration_ms,
                )
                telemetry = _build_ai_chat_task_telemetry(updated_task, runtime_end=datetime.now(timezone.utc))
                sys_logger.warning(
                    json.dumps(
                        {
                            "event": "ai_chat_image_task_retry",
                            "req_id": req_id,
                            "task_id": task_id,
                            "status": "RETRYING",
                            "retry_count": attempt + 1,
                            "duration_ms": duration_ms,
                            "image_count": image_count,
                            "ai_chat_model_id": ai_chat_model_id,
                            "error": detail,
                            "backoff_seconds": backoff,
                            "telemetry": telemetry,
                        },
                        ensure_ascii=False,
                    )
                )
                await asyncio.sleep(backoff)
                update_ai_chat_task(
                    AI_CHAT_TASK_DB_PATH,
                    task_id,
                    status="RUNNING",
                    progress_message=f"正在执行第 {attempt + 2} 次尝试",
                    retry_count=attempt + 1,
                    error=detail,
                )
                continue

            final_status = "TIMEOUT" if status_code == 504 or re.search(r"(timeout|timed out)", detail, re.IGNORECASE) else "FAILED"
            finished_at_iso = _now_iso()
            updated_task = update_ai_chat_task(
                AI_CHAT_TASK_DB_PATH,
                task_id,
                status=final_status,
                retry_count=attempt,
                progress_message="任务执行失败",
                error=detail,
                finished_at=finished_at_iso,
                last_duration_ms=duration_ms,
            )
            telemetry = _build_ai_chat_task_telemetry(updated_task, runtime_end=_parse_iso_datetime(finished_at_iso))
            sys_logger.error(
                json.dumps(
                    {
                        "event": "ai_chat_image_task_timeout" if final_status == "TIMEOUT" else "ai_chat_image_task_failed",
                        "req_id": req_id,
                        "task_id": task_id,
                        "status": final_status,
                        "retry_count": attempt,
                        "duration_ms": duration_ms,
                        "image_count": image_count,
                        "ai_chat_model_id": ai_chat_model_id,
                        "error": detail,
                        "telemetry": telemetry,
                    },
                    ensure_ascii=False,
                )
            )
            _cleanup_ai_chat_task_dir(task_id)
            return
        except _AIChatRetryableError as exc:
            last_error = str(exc)
            last_raw_text = str(exc.raw_text or "")
            duration_ms = int((time.perf_counter() - attempt_started) * 1000)
            if attempt < max_retries:
                backoff = int(_AI_CHAT_TASK_RETRY_BACKOFFS[attempt])
                updated_task = update_ai_chat_task(
                    AI_CHAT_TASK_DB_PATH,
                    task_id,
                    status="RETRYING",
                    retry_count=attempt + 1,
                    progress_message=f"任务重试中，{backoff}s 后发起第 {attempt + 1} 次重试",
                    error=last_error,
                    raw_response_text=last_raw_text[-20000:],
                    last_duration_ms=duration_ms,
                )
                telemetry = _build_ai_chat_task_telemetry(updated_task, runtime_end=datetime.now(timezone.utc))
                sys_logger.warning(
                    json.dumps(
                        {
                            "event": "ai_chat_image_task_retry",
                            "req_id": req_id,
                            "task_id": task_id,
                            "status": "RETRYING",
                            "retry_count": attempt + 1,
                            "duration_ms": duration_ms,
                            "image_count": image_count,
                            "ai_chat_model_id": ai_chat_model_id,
                            "error": last_error,
                            "backoff_seconds": backoff,
                            "telemetry": telemetry,
                        },
                        ensure_ascii=False,
                    )
                )
                await asyncio.sleep(backoff)
                update_ai_chat_task(
                    AI_CHAT_TASK_DB_PATH,
                    task_id,
                    status="RUNNING",
                    progress_message=f"正在执行第 {attempt + 2} 次尝试",
                    retry_count=attempt + 1,
                    error=last_error,
                )
                continue

            final_status = "TIMEOUT" if exc.error_type == "TIMEOUT" else "FAILED"
            finished_at_iso = _now_iso()
            updated_task = update_ai_chat_task(
                AI_CHAT_TASK_DB_PATH,
                task_id,
                status=final_status,
                retry_count=attempt,
                progress_message="任务执行失败",
                error=last_error,
                raw_response_text=last_raw_text[-20000:],
                finished_at=finished_at_iso,
                last_duration_ms=duration_ms,
            )
            telemetry = _build_ai_chat_task_telemetry(updated_task, runtime_end=_parse_iso_datetime(finished_at_iso))
            sys_logger.error(
                json.dumps(
                    {
                        "event": "ai_chat_image_task_timeout" if final_status == "TIMEOUT" else "ai_chat_image_task_failed",
                        "req_id": req_id,
                        "task_id": task_id,
                        "status": final_status,
                        "retry_count": attempt,
                        "duration_ms": duration_ms,
                        "image_count": image_count,
                        "ai_chat_model_id": ai_chat_model_id,
                        "error": last_error,
                        "telemetry": telemetry,
                    },
                    ensure_ascii=False,
                )
            )
            _cleanup_ai_chat_task_dir(task_id)
            return
        except _AIChatNonRetryableError as exc:
            duration_ms = int((time.perf_counter() - attempt_started) * 1000)
            finished_at_iso = _now_iso()
            updated_task = update_ai_chat_task(
                AI_CHAT_TASK_DB_PATH,
                task_id,
                status="FAILED",
                retry_count=attempt,
                progress_message="任务执行失败",
                error=str(exc),
                raw_response_text=str(exc.raw_text or "")[-20000:],
                finished_at=finished_at_iso,
                last_duration_ms=duration_ms,
            )
            telemetry = _build_ai_chat_task_telemetry(updated_task, runtime_end=_parse_iso_datetime(finished_at_iso))
            sys_logger.error(
                json.dumps(
                    {
                        "event": "ai_chat_image_task_failed",
                        "req_id": req_id,
                        "task_id": task_id,
                        "status": "FAILED",
                        "retry_count": attempt,
                        "duration_ms": duration_ms,
                        "image_count": image_count,
                        "ai_chat_model_id": ai_chat_model_id,
                        "error": str(exc),
                        "telemetry": telemetry,
                    },
                    ensure_ascii=False,
                )
            )
            _cleanup_ai_chat_task_dir(task_id)
            return
        except Exception as exc:
            duration_ms = int((time.perf_counter() - attempt_started) * 1000)
            message = str(exc or "未知错误")
            finished_at_iso = _now_iso()
            updated_task = update_ai_chat_task(
                AI_CHAT_TASK_DB_PATH,
                task_id,
                status="FAILED",
                retry_count=attempt,
                progress_message="任务执行失败",
                error=message,
                finished_at=finished_at_iso,
                last_duration_ms=duration_ms,
            )
            telemetry = _build_ai_chat_task_telemetry(updated_task, runtime_end=_parse_iso_datetime(finished_at_iso))
            sys_logger.error(
                json.dumps(
                    {
                        "event": "ai_chat_image_task_failed",
                        "req_id": req_id,
                        "task_id": task_id,
                        "status": "FAILED",
                        "retry_count": attempt,
                        "duration_ms": duration_ms,
                        "image_count": image_count,
                        "ai_chat_model_id": ai_chat_model_id,
                        "error": message,
                        "telemetry": telemetry,
                    },
                    ensure_ascii=False,
                )
            )
            _cleanup_ai_chat_task_dir(task_id)
            return


@router.post("/api/ai_chat_stream_via_curl")
def ai_chat_stream_via_curl(req: AIChatCurlProxyRequest, request: Request):
    req_id = getattr(request.state, "req_id", uuid.uuid4().hex[:8])
    cmd, _, temp_files, endpoint, timeout_seconds, build_metrics = _build_ai_chat_curl_command(req_id, req)
    sys_logger.info(
        json.dumps(
            {
                "event": "ai_chat_stream_via_curl_start",
                "req_id": req_id,
                "endpoint": endpoint,
                "module_enum": str(req.module_enum or ""),
                "part_enum": str(req.part_enum or ""),
                "ai_chat_model_id": str(req.ai_chat_model_id or ""),
                "timeout_seconds": timeout_seconds,
                "build_metrics": build_metrics,
            },
            ensure_ascii=False,
        )
    )

    def _cleanup() -> None:
        for path in temp_files:
            try:
                os.remove(path)
            except Exception:
                pass

    def _stream():
        process = None
        current_event = ""
        try:
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
            )
            assert process.stdout is not None
            deadline = time.time() + timeout_seconds + 5
            while True:
                if time.time() > deadline:
                    raise TimeoutError(f"curl 请求超时({timeout_seconds}s)")
                chunk = process.stdout.readline()
                if not chunk:
                    if process.poll() is not None:
                        break
                    time.sleep(0.05)
                    continue
                stripped = chunk.strip()
                if stripped.startswith("event:"):
                    current_event = stripped[6:].strip().lower()
                yield chunk.encode("utf-8")
                if stripped.startswith("data:"):
                    payload_text = stripped[5:].strip()
                    if payload_text and payload_text != "[DONE]":
                        try:
                            payload_obj = json.loads(payload_text)
                        except Exception:
                            payload_obj = None
                        if current_event == "done" and isinstance(payload_obj, dict) and bool(payload_obj.get("finish")):
                            break
            return_code = process.wait(timeout=timeout_seconds + 5)
            stderr_text = ""
            if process.stderr is not None:
                stderr_text = str(process.stderr.read() or "")[:500]
            if return_code != 0:
                sys_logger.error(f"[{req_id}] ai_chat_stream_via_curl error: code={return_code}, stderr={stderr_text}")
                yield f'event: error\ndata: {json.dumps({"message": f"curl 请求失败(code={return_code}): {stderr_text}"}, ensure_ascii=False)}\n\n'.encode("utf-8")
        except Exception as e:
            sys_logger.error(f"[{req_id}] ai_chat_stream_via_curl exception: {e}")
            yield f'event: error\ndata: {json.dumps({"message": str(e)}, ensure_ascii=False)}\n\n'.encode("utf-8")
        finally:
            if process is not None and process.poll() is None:
                try:
                    process.kill()
                except Exception:
                    pass
            _cleanup()

    return StreamingResponse(
        _stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/api/ai_chat_image_via_curl", response_model=AIChatImageTaskSubmitResponse)
async def ai_chat_image_via_curl(request: Request):
    submit_started = time.perf_counter()
    req_id = getattr(request.state, "req_id", uuid.uuid4().hex[:8])
    task_id = f"ai_chat_task_{uuid.uuid4().hex}"
    _cleanup_stale_ai_chat_task_dirs()
    try:
        parsed_req, request_form, request_files = await _parse_ai_chat_submission_request(request, task_id)
    except HTTPException:
        raise
    except Exception as exc:
        _cleanup_ai_chat_task_dir(task_id)
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not clean_form_value(request_form.get("authorization")):
        request_form["authorization"] = _resolve_member_authorization(request)
    authorization = clean_form_value(request_form.get("authorization"))
    if not authorization:
        _cleanup_ai_chat_task_dir(task_id)
        raise HTTPException(status_code=400, detail="authorization 不能为空")

    request_form = {
        **request_form,
        "images": list(parsed_req.images or []),
        "tusd_file_remote_ids": list(parsed_req.tusd_file_remote_ids or []),
    }

    task = create_ai_chat_task(
        AI_CHAT_TASK_DB_PATH,
        task_id=task_id,
        req_id=req_id,
        status="PENDING",
        progress_message="任务已提交",
        endpoint=str(request_form.get("endpoint") or AI_CHAT_DOWNSTREAM_URL),
        ai_chat_model_id=clean_form_value(request_form.get("ai_chat_model_id")),
        image_count=len(request_files),
        request_form=request_form,
        request_files=request_files,
    )
    sys_logger.info(
        json.dumps(
            {
                "event": "ai_chat_image_task_submitted",
                "req_id": req_id,
                "task_id": task_id,
                "status": "PENDING",
                "retry_count": 0,
                "duration_ms": int((time.perf_counter() - submit_started) * 1000),
                "image_count": len(request_files),
                "ai_chat_model_id": clean_form_value(request_form.get("ai_chat_model_id")),
                "telemetry": {
                    "submit_handling_ms": int((time.perf_counter() - submit_started) * 1000),
                    "queue_wait_ms": 0,
                    "run_ms": None,
                    "wall_clock_ms": 0,
                },
            },
            ensure_ascii=False,
        )
    )
    asyncio.create_task(_run_ai_chat_image_task(task_id))
    return AIChatImageTaskSubmitResponse(
        ok=True,
        task_id=task_id,
        status=str(task.get("status") or "PENDING"),
        message="任务已提交",
    )


@router.get("/api/ai_chat_image_via_curl/{task_id}", response_model=AIChatImageTaskStatusResponse)
def get_ai_chat_image_task_status(task_id: str):
    task = get_ai_chat_task(AI_CHAT_TASK_DB_PATH, task_id)
    public_task = _build_ai_chat_public_task(task)
    return AIChatImageTaskStatusResponse(**public_task)


@router.post("/api/agent/plan", response_model=Dict[str, Any])
def agent_plan(req: AgentRequest, request: Request):
    return agent_plan_impl(req, request)


@router.post("/api/local/text2img", response_model=Text2ImgResponse)
def local_text_to_image(req: Text2ImgRequest, request: Request, current_user=Depends(_get_current_user_optional)):
    req_id = request.state.req_id
    t0 = time.time()
    try:
        width, height = _parse_size_to_dimensions(req.size, req.aspect_ratio, default=(1024, 1024))
        if width > 2048 or height > 2048:
            raise HTTPException(status_code=400, detail="本地文生图暂不支持 4K，仅支持 1K / 2K")
        img_bytes = run_image_z_image_turbo_workflow(
            req_id=req_id,
            prompt=req.prompt,
            width=width,
            height=height,
            filename_prefix=f"local/text2img-{req_id}",
        )
        if not img_bytes:
            raise RuntimeError("No image returned")

        output_data_url = bytes_to_data_url(img_bytes)
        prompt_logger.log(
            req_id,
            "local_text2img",
            req.model_dump(),
            req.prompt,
            {"model": MODEL_COMFYUI_IMAGE_Z_IMAGE_TURBO, "width": width, "height": height},
            {"file": "mem"},
            time.time() - t0,
            user_id=_user_id_for_log(current_user),
            inputs_full=req.model_dump(),
            output_full={"images": [output_data_url]},
        )
        _record_usage_if_authed(current_user, MODEL_COMFYUI_IMAGE_Z_IMAGE_TURBO)
        return Text2ImgResponse(images=[output_data_url])
    except Exception as e:
        sys_logger.error(f"[{req_id}] Local Text2Img Error: {e}")
        prompt_logger.log(
            req_id,
            "local_text2img",
            req.model_dump(),
            req.prompt,
            {"model": MODEL_COMFYUI_IMAGE_Z_IMAGE_TURBO},
            {"file": "mem"},
            time.time() - t0,
            user_id=_user_id_for_log(current_user),
            inputs_full=req.model_dump(),
            error=str(e),
        )
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/local/img2video", response_model=Img2VideoResponse)
def local_img_to_video(req: Img2VideoRequest, request: Request, current_user=Depends(_get_current_user_optional)):
    req_id = request.state.req_id
    t0 = time.time()
    try:
        if str(req.resolution or "").strip().lower() == "1080p":
            raise HTTPException(status_code=400, detail="本地图生视频暂不支持 1080P，仅支持 480P / 720P")
        _, image_bytes = parse_data_url(req.image)
        fps = max(1, int(req.fps or 16))
        duration = max(1, int(req.duration or 5))
        length = max(1, min(321, duration * fps + 1))
        width, height = _parse_local_i2v_dimensions(req.resolution, req.ratio)
        video_bytes, mime_type = run_qwen_i2v_workflow(
            req_id=req_id,
            image_bytes=image_bytes,
            positive_prompt=req.prompt or "natural motion",
            width=width,
            height=height,
            length=length,
            fps=fps,
            seed=req.seed,
            filename_prefix=f"local/qwen-i2v-{req_id}",
        )
        output_data_url = bytes_to_data_url(video_bytes, mime_type)
        prompt_logger.log(
            req_id,
            "local_img2video",
            req.model_dump(),
            req.prompt or "",
            {
                "model": MODEL_COMFYUI_QWEN_I2V,
                "width": width,
                "height": height,
                "fps": fps,
                "length": length,
                "resolution": req.resolution,
                "ratio": req.ratio,
            },
            {"file": "mem"},
            time.time() - t0,
            user_id=_user_id_for_log(current_user),
            inputs_full=req.model_dump(),
            output_full={"videos": [output_data_url]},
        )
        _record_usage_if_authed(current_user, MODEL_COMFYUI_QWEN_I2V)
        return Img2VideoResponse(image=output_data_url)
    except Exception as e:
        sys_logger.error(f"[{req_id}] Local Img2Video Error: {e}")
        prompt_logger.log(
            req_id,
            "local_img2video",
            req.model_dump(),
            req.prompt or "",
            {"model": MODEL_COMFYUI_QWEN_I2V},
            {"file": "mem"},
            time.time() - t0,
            user_id=_user_id_for_log(current_user),
            inputs_full=req.model_dump(),
            error=str(e),
        )
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/overlaytext", response_model=OverlayTextResponse)
def overlay_text(req: OverlayTextRequest, request: Request, current_user=Depends(_get_current_user_optional)):
    req_id = request.state.req_id
    t0 = time.time()

    try:
        img_bytes = run_overlaytext_workflow(
            req_id=req_id,
            image_data_url=req.image,
            text=req.text,
            font_name=req.font_name,
            font_size=req.font_size,
            bold_strength=req.bold_strength,
            bold_text_1=req.bold_text_1,
            bold_text_2=req.bold_text_2,
            bold_text_3=req.bold_text_3,
            bold_text_4=req.bold_text_4,
            bold_text_5=req.bold_text_5,
            font_color=req.font_color,
            text_bg_color=req.text_bg_color,
            text_bg_opacity=req.text_bg_opacity,
            text_bg_padding=req.text_bg_padding,
            highlight_text_1=req.highlight_text_1,
            highlight_text_2=req.highlight_text_2,
            highlight_text_3=req.highlight_text_3,
            highlight_text_4=req.highlight_text_4,
            highlight_text_5=req.highlight_text_5,
            highlight_color_1=req.highlight_color_1,
            highlight_color_2=req.highlight_color_2,
            highlight_color_3=req.highlight_color_3,
            highlight_color_4=req.highlight_color_4,
            highlight_color_5=req.highlight_color_5,
            highlight_opacity=req.highlight_opacity,
            highlight_padding=req.highlight_padding,
            align=req.align,
            justify=req.justify,
            margins=req.margins,
            line_spacing=req.line_spacing,
            position_x=req.position_x,
            position_y=req.position_y,
            ratio_adapt_3_4=req.ratio_adapt_3_4,
            rotation_angle=req.rotation_angle,
            rotation_options=req.rotation_options,
            font_color_hex=req.font_color_hex,
            text_bg_color_hex=req.text_bg_color_hex,
            highlight_color_hex_1=req.highlight_color_hex_1,
            highlight_color_hex_2=req.highlight_color_hex_2,
            highlight_color_hex_3=req.highlight_color_hex_3,
            highlight_color_hex_4=req.highlight_color_hex_4,
            highlight_color_hex_5=req.highlight_color_hex_5,
        )

        if not img_bytes:
            raise RuntimeError("No image returned")

        output_data_url = bytes_to_data_url(img_bytes)
        prompt_logger.log(
            req_id,
            "overlaytext",
            req.model_dump(),
            req.text,
            {
                "model": MODEL_COMFYUI_OVERLAYTEXT,
                "font_name": req.font_name,
                "font_size": req.font_size,
                "bold_strength": req.bold_strength,
                "font_color": req.font_color,
                "text_bg_color": req.text_bg_color,
                "highlight_opacity": req.highlight_opacity,
            },
            {"file": "mem"},
            time.time() - t0,
            user_id=_user_id_for_log(current_user),
            inputs_full=req.model_dump(),
            output_full={"images": [output_data_url]},
        )
        _record_usage_if_authed(current_user, MODEL_COMFYUI_OVERLAYTEXT)
        return OverlayTextResponse(image=output_data_url)

    except Exception as e:
        sys_logger.error(f"[{req_id}] OverlayText Error: {e}")
        prompt_logger.log(
            req_id,
            "overlaytext",
            req.model_dump(),
            req.text,
            {"model": MODEL_COMFYUI_OVERLAYTEXT},
            {"file": "mem"},
            time.time() - t0,
            user_id=_user_id_for_log(current_user),
            inputs_full=req.model_dump(),
            error=str(e),
        )
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/rmbg", response_model=RmbgResponse)
def remove_background(req: RmbgRequest, request: Request, current_user=Depends(_get_current_user_optional)):
    req_id = request.state.req_id
    t0 = time.time()

    try:
        img_bytes = run_rmbg_workflow(
            req_id=req_id,
            image_data_url=req.image,
            size=req.size,
            aspect_ratio=req.aspect_ratio,
        )

        if not img_bytes:
            raise RuntimeError("No image returned")

        output_data_url = bytes_to_data_url(img_bytes)
        prompt_logger.log(
            req_id,
            "rmbg",
            req.model_dump(),
            "",
            {"model": MODEL_COMFYUI_RMBG, "size": req.size, "ar": req.aspect_ratio},
            {"file": "mem"},
            time.time() - t0,
            user_id=_user_id_for_log(current_user),
            inputs_full=req.model_dump(),
            output_full={"images": [output_data_url]},
        )
        _record_usage_if_authed(current_user, MODEL_COMFYUI_RMBG)
        return RmbgResponse(image=output_data_url)

    except Exception as e:
        sys_logger.error(f"[{req_id}] RMBG Error: {e}")
        prompt_logger.log(
            req_id,
            "rmbg",
            req.model_dump(),
            "",
            {"model": MODEL_COMFYUI_RMBG},
            {"file": "mem"},
            time.time() - t0,
            user_id=_user_id_for_log(current_user),
            inputs_full=req.model_dump(),
            error=str(e),
        )
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/remove_watermark", response_model=RemoveWatermarkResponse)
def remove_watermark(req: RemoveWatermarkRequest, request: Request, current_user=Depends(_get_current_user_optional)):
    req_id = request.state.req_id
    t0 = time.time()

    try:
        img_bytes = run_remove_watermark_workflow(
            req_id=req_id,
            image_data_url=req.image,
            size=req.size,
            aspect_ratio=req.aspect_ratio,
        )

        if not img_bytes:
            raise RuntimeError("No image returned")

        output_data_url = bytes_to_data_url(img_bytes)
        prompt_logger.log(
            req_id,
            "remove_watermark",
            req.model_dump(),
            "",
            {"model": MODEL_COMFYUI_REMOVE_WATERMARK, "size": req.size, "ar": req.aspect_ratio},
            {"file": "mem"},
            time.time() - t0,
            user_id=_user_id_for_log(current_user),
            inputs_full=req.model_dump(),
            output_full={"images": [output_data_url]},
        )
        _record_usage_if_authed(current_user, MODEL_COMFYUI_REMOVE_WATERMARK)
        return RemoveWatermarkResponse(image=output_data_url)

    except Exception as e:
        sys_logger.error(f"[{req_id}] RemoveWatermark Error: {e}")
        prompt_logger.log(
            req_id,
            "remove_watermark",
            req.model_dump(),
            "",
            {"model": MODEL_COMFYUI_REMOVE_WATERMARK},
            {"file": "mem"},
            time.time() - t0,
            user_id=_user_id_for_log(current_user),
            inputs_full=req.model_dump(),
            error=str(e),
        )
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/multi_angleshots", response_model=MultiAngleShotsResponse)
def multi_angleshots(req: MultiAngleShotsRequest, request: Request, current_user=Depends(_get_current_user_optional)):
    req_id = request.state.req_id
    t0 = time.time()

    try:
        image_bytes_list = run_multi_angleshots_workflow(
            req_id=req_id,
            image_data_url=req.image,
            config=req.config or {},
        )
        if not image_bytes_list:
            raise RuntimeError("No image returned")

        output_images = [bytes_to_data_url(img_bytes) for img_bytes in image_bytes_list if img_bytes]
        if not output_images:
            raise RuntimeError("No image returned")

        prompt_logger.log(
            req_id,
            "multi_angleshots",
            req.model_dump(),
            "",
            {"model": MODEL_COMFYUI_MULTI_ANGLESHOTS},
            {"file": "mem"},
            time.time() - t0,
            user_id=_user_id_for_log(current_user),
            inputs_full=req.model_dump(),
            output_full={"images": output_images},
        )
        _record_usage_if_authed(current_user, MODEL_COMFYUI_MULTI_ANGLESHOTS)
        return MultiAngleShotsResponse(images=output_images)

    except Exception as e:
        sys_logger.error(f"[{req_id}] MultiAngleShots Error: {e}")
        prompt_logger.log(
            req_id,
            "multi_angleshots",
            req.model_dump(),
            "",
            {"model": MODEL_COMFYUI_MULTI_ANGLESHOTS},
            {"file": "mem"},
            time.time() - t0,
            user_id=_user_id_for_log(current_user),
            inputs_full=req.model_dump(),
            error=str(e),
        )
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/controlnet_pose_video", response_model=ControlnetPoseVideoResponse)
def controlnet_pose_video(req: ControlnetPoseVideoRequest, request: Request, current_user=Depends(_get_current_user_optional)):
    req_id = request.state.req_id
    t0 = time.time()

    try:
        video_bytes, mime_type = run_controlnet_pose_video_workflow(
            req_id=req_id,
            image_data_url=req.image,
            control_video_input=req.control_video,
            positive_prompt=req.positive_prompt,
            negative_prompt=req.negative_prompt,
            width=req.width,
            height=req.height,
            length=req.length,
            fps=req.fps,
            seed=req.seed,
            filename_prefix=req.filename_prefix,
        )
        if not video_bytes:
            raise RuntimeError("No video returned")

        output_data_url = bytes_to_data_url(video_bytes, mime_type=mime_type or "video/mp4")
        prompt_logger.log(
            req_id,
            "controlnet_pose_video",
            req.model_dump(),
            req.positive_prompt or "",
            {"model": MODEL_COMFYUI_CONTROLNET, "width": req.width, "height": req.height, "length": req.length, "fps": req.fps},
            {"file": "mem"},
            time.time() - t0,
            user_id=_user_id_for_log(current_user),
            inputs_full=req.model_dump(),
            output_full={"videos": [output_data_url]},
        )
        _record_usage_if_authed(current_user, MODEL_COMFYUI_CONTROLNET)
        return ControlnetPoseVideoResponse(video=output_data_url)
    except Exception as e:
        sys_logger.error(f"[{req_id}] ControlnetPoseVideo Error: {e}")
        prompt_logger.log(
            req_id,
            "controlnet_pose_video",
            req.model_dump(),
            req.positive_prompt or "",
            {"model": MODEL_COMFYUI_CONTROLNET},
            {"file": "mem"},
            time.time() - t0,
            user_id=_user_id_for_log(current_user),
            inputs_full=req.model_dump(),
            error=str(e),
        )
        raise HTTPException(status_code=500, detail=str(e))


def _run_video_upscale_task(task_id: str, req_id: str, user_id: Optional[str], payload: Dict[str, Any]) -> None:
    t0 = time.time()
    segment_seconds = max(1, int(payload.get("segment_seconds") or 3))
    output_resolution = _normalize_video_upscale_resolution(payload.get("output_resolution"))
    workflow_batch_size = _normalize_video_upscale_batch_size(payload.get("workflow_batch_size"))

    def _on_progress(done: int, total: int) -> None:
        progress = float(done) / float(total) if total > 0 else 0.0
        _set_video_upscale_task(
            task_id,
            status="running",
            completed_chunks=max(0, int(done)),
            total_chunks=max(0, int(total)),
            progress=max(0.0, min(1.0, progress)),
            updated_at=time.time(),
        )

    try:
        _set_video_upscale_task(task_id, status="running", updated_at=time.time())
        video_bytes, mime_type = run_video_upscale_workflow(
            req_id=req_id,
            video_input=str(payload.get("video") or ""),
            segment_seconds=segment_seconds,
            output_resolution=output_resolution,
            workflow_batch_size=workflow_batch_size,
            progress_cb=_on_progress,
        )
        if not video_bytes:
            raise RuntimeError("No video returned")

        output_data_url = bytes_to_data_url(video_bytes, mime_type=mime_type or "video/mp4")
        current_task = _get_video_upscale_task(task_id) or {}
        total_chunks = max(0, int(current_task.get("total_chunks") or 0))
        _set_video_upscale_task(
            task_id,
            status="success",
            completed_chunks=total_chunks,
            total_chunks=total_chunks,
            progress=1.0,
            video=output_data_url,
            updated_at=time.time(),
        )
        prompt_logger.log(
            req_id,
            "video_upscale",
            payload,
            "",
            {
                "model": MODEL_COMFYUI_VIDEO_UPSCALE,
                "segment_seconds": segment_seconds,
                "output_resolution": output_resolution,
                "workflow_batch_size": workflow_batch_size,
            },
            {"file": "mem"},
            time.time() - t0,
            user_id=(str(user_id).strip() or "anonymous"),
            inputs_full=payload,
            output_full={"videos": [output_data_url]},
        )
        if str(user_id or "").strip():
            record_usage(str(user_id), MODEL_COMFYUI_VIDEO_UPSCALE)
    except Exception as e:
        _set_video_upscale_task(
            task_id,
            status="error",
            error=str(e),
            updated_at=time.time(),
        )
        sys_logger.error(f"[{req_id}] VideoUpscale Task Error: {e}")
        prompt_logger.log(
            req_id,
            "video_upscale",
            payload,
            "",
            {
                "model": MODEL_COMFYUI_VIDEO_UPSCALE,
                "segment_seconds": segment_seconds,
                "output_resolution": output_resolution,
                "workflow_batch_size": workflow_batch_size,
            },
            {"file": "mem"},
            time.time() - t0,
            user_id=(str(user_id).strip() or "anonymous"),
            inputs_full=payload,
            error=str(e),
        )


@router.post("/api/video_upscale/start", response_model=VideoUpscaleTaskStartResponse)
def video_upscale_start(req: VideoUpscaleRequest, request: Request, current_user=Depends(_get_current_user_optional)):
    req_id = request.state.req_id
    payload = req.model_dump()
    task_id = uuid.uuid4().hex
    segment_seconds = max(1, int(req.segment_seconds or 3))
    output_resolution = _normalize_video_upscale_resolution(req.output_resolution)
    workflow_batch_size = _normalize_video_upscale_batch_size(req.workflow_batch_size)
    payload["output_resolution"] = output_resolution
    payload["workflow_batch_size"] = workflow_batch_size

    user_id = str((current_user or {}).get("id") or "").strip()
    _set_video_upscale_task(
        task_id,
        user_id=user_id,
        status="queued",
        completed_chunks=0,
        total_chunks=0,
        progress=0.0,
        segment_seconds=segment_seconds,
        output_resolution=output_resolution,
        workflow_batch_size=workflow_batch_size,
        created_at=time.time(),
        updated_at=time.time(),
    )

    worker = threading.Thread(
        target=_run_video_upscale_task,
        args=(task_id, req_id, user_id, payload),
        daemon=True,
    )
    worker.start()
    return VideoUpscaleTaskStartResponse(task_id=task_id, status="queued")


@router.get("/api/video_upscale/status/{task_id}", response_model=VideoUpscaleTaskStatusResponse)
def video_upscale_status(task_id: str):
    task = _get_video_upscale_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    return VideoUpscaleTaskStatusResponse(
        task_id=task_id,
        status=str(task.get("status") or "queued"),
        completed_chunks=max(0, int(task.get("completed_chunks") or 0)),
        total_chunks=max(0, int(task.get("total_chunks") or 0)),
        progress=float(task.get("progress") or 0.0),
        video=task.get("video"),
        error=task.get("error"),
    )


@router.post("/api/video_upscale", response_model=VideoUpscaleResponse)
def video_upscale(req: VideoUpscaleRequest, request: Request, current_user=Depends(_get_current_user_optional)):
    req_id = request.state.req_id
    t0 = time.time()
    segment_seconds = max(1, int(req.segment_seconds or 3))
    output_resolution = _normalize_video_upscale_resolution(req.output_resolution)
    workflow_batch_size = _normalize_video_upscale_batch_size(req.workflow_batch_size)

    try:
        video_bytes, mime_type = run_video_upscale_workflow(
            req_id=req_id,
            video_input=req.video,
            segment_seconds=segment_seconds,
            output_resolution=output_resolution,
            workflow_batch_size=workflow_batch_size,
        )
        if not video_bytes:
            raise RuntimeError("No video returned")

        output_data_url = bytes_to_data_url(video_bytes, mime_type=mime_type or "video/mp4")
        prompt_logger.log(
            req_id,
            "video_upscale",
            req.model_dump(),
            "",
            {
                "model": MODEL_COMFYUI_VIDEO_UPSCALE,
                "segment_seconds": segment_seconds,
                "output_resolution": output_resolution,
                "workflow_batch_size": workflow_batch_size,
            },
            {"file": "mem"},
            time.time() - t0,
            user_id=_user_id_for_log(current_user),
            inputs_full=req.model_dump(),
            output_full={"videos": [output_data_url]},
        )
        _record_usage_if_authed(current_user, MODEL_COMFYUI_VIDEO_UPSCALE)
        return VideoUpscaleResponse(video=output_data_url)

    except Exception as e:
        sys_logger.error(f"[{req_id}] VideoUpscale Error: {e}")
        prompt_logger.log(
            req_id,
            "video_upscale",
            req.model_dump(),
            "",
            {
                "model": MODEL_COMFYUI_VIDEO_UPSCALE,
                "segment_seconds": segment_seconds,
                "output_resolution": output_resolution,
                "workflow_batch_size": workflow_batch_size,
            },
            {"file": "mem"},
            time.time() - t0,
            user_id=_user_id_for_log(current_user),
            inputs_full=req.model_dump(),
            error=str(e),
        )
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/edit", response_model=EditResponse)
def edit_image(req: EditRequest, request: Request, current_user=Depends(get_current_user)):
    req_id = request.state.req_id
    t0 = time.time()

    final_ref_image = req.ref_image or req.background_image
    has_ref = bool(final_ref_image)
    selected_model = req.model or "ai_chat_nano_banana_pro"
    fallback_model = req.model if req.model in {MODEL_DOUBAO, MODEL_GEMINI} else MODEL_GEMINI
    final_prompt = build_business_prompt(req.mode, req.prompt, has_ref)
    

    try:
        member_authorization = _resolve_member_authorization(request)
        if member_authorization and _AI_CHAT_MODEL_ID_NANO_BANANA_PRO:
            try:
                images = [req.image]
                if has_ref and final_ref_image:
                    images.append(final_ref_image)
                proxy_req = AIChatCurlProxyRequest(
                    authorization=member_authorization,
                    module_enum="1",
                    part_enum="2",
                    message=final_prompt,
                    ai_chat_session_id="0",
                    ai_chat_model_id=_AI_CHAT_MODEL_ID_NANO_BANANA_PRO,
                    ai_image_param_size_id=_map_param_id(_AI_CHAT_IMAGE_SIZE_ID_MAP, req.size),
                    ai_image_param_ratio_id=_map_param_id(_AI_CHAT_IMAGE_RATIO_ID_MAP, req.aspect_ratio),
                    images=images,
                    timeout_seconds=120,
                )
                proxy_data = _call_ai_chat_image_via_curl(req_id=req_id, req=proxy_req)
                done_error = str(proxy_data.get("done_error") or "").strip()
                image_url = str(proxy_data.get("image_url") or "").strip()
                if image_url and not done_error:
                    prompt_logger.log(
                        req_id,
                        req.mode,
                        req.model_dump(),
                        final_prompt,
                        {"model": "ai_chat_nano_banana_pro", "has_ref": has_ref},
                        {"file": "mem"},
                        time.time() - t0,
                        user_id=current_user["id"],
                        inputs_full=req.model_dump(),
                        output_full={"images": [image_url]},
                    )
                    record_usage(current_user["id"], "ai_chat_nano_banana_pro")
                    return EditResponse(image=image_url)
                raise RuntimeError(done_error or "aiChat 未返回图片URL")
            except Exception as ai_chat_err:
                sys_logger.warning(f"[{req_id}] edit aiChat fallback: {ai_chat_err}")

        selected_model = fallback_model
        img_bytes = None

        if selected_model == MODEL_DOUBAO:
            img_bytes = call_doubao_image_gen(
                final_prompt,
                req_id,
                size_param=req.size or "1024x1024",
                aspect_ratio=req.aspect_ratio or "1:1",
            )
        else:
            fg_mime, fg_bytes = parse_data_url(req.image)
            contents = [types.Part(text=final_prompt), types.Part.from_bytes(data=fg_bytes, mime_type=fg_mime)]

            if has_ref:
                bg_mime, bg_bytes = parse_data_url(final_ref_image)
                contents.append(types.Part.from_bytes(data=bg_bytes, mime_type=bg_mime))

            temp = 0.3 if req.mode in ["relight", "upscale"] else (req.temperature or 0.4)

            response = call_genai_retry(
                contents=contents,
                config=types.GenerateContentConfig(temperature=temp),
                req_id=req_id,
                model=selected_model,
            )
            img_bytes = get_image_from_response(response)

        if not img_bytes:
            raise RuntimeError("No image returned")

        output_data_url = bytes_to_data_url(img_bytes)
        prompt_logger.log(
            req_id,
            req.mode,
            req.model_dump(),
            final_prompt,
            {"model": selected_model, "has_ref": has_ref},
            {"file": "mem"},
            time.time() - t0,
            user_id=current_user["id"],
            inputs_full=req.model_dump(),
            output_full={"images": [output_data_url]},
        )
        record_usage(current_user["id"], selected_model)
        return EditResponse(image=output_data_url)

    except Exception as e:
        sys_logger.error(f"[{req_id}] Edit Error ({req.mode}): {e}")
        prompt_logger.log(
            req_id,
            req.mode,
            req.model_dump(),
            "ERROR",
            {"model": selected_model, "has_ref": has_ref},
            {"file": "mem"},
            time.time() - t0,
            user_id=current_user["id"],
            inputs_full=req.model_dump(),
            error=str(e),
        )
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/img2video", response_model=Img2VideoResponse)
def img_to_video(req: Img2VideoRequest, request: Request, current_user=Depends(get_current_user)):
    req_id = request.state.req_id
    t0 = time.time()
    try:
        selected_model = req.model or "Doubao-Seedance-1.0-pro"
        if selected_model not in ALLOWED_VIDEO_MODELS:
            selected_model = "Doubao-Seedance-1.0-pro"

        member_authorization = _resolve_member_authorization(request)
        if member_authorization and _AI_CHAT_MODEL_ID_SEEDANCE_1_0:
            try:
                image_inputs = [req.image]
                if str(req.last_frame_image or "").strip():
                    image_inputs.append(str(req.last_frame_image))
                proxy_req = AIChatCurlProxyRequest(
                    authorization=member_authorization,
                    module_enum="1",
                    part_enum="2",
                    message=req.prompt or "",
                    ai_chat_session_id="0",
                    ai_chat_model_id=_AI_CHAT_MODEL_ID_SEEDANCE_1_0,
                    ai_video_param_resolution_id=_map_param_id(_AI_CHAT_VIDEO_RESOLUTION_ID_MAP, req.resolution),
                    ai_video_param_ratio_id=_map_param_id(_AI_CHAT_VIDEO_RATIO_ID_MAP, req.ratio),
                    ai_video_param_duration_id=_map_param_id(_AI_CHAT_VIDEO_DURATION_ID_MAP, req.duration),
                    images=image_inputs,
                    timeout_seconds=180,
                )
                proxy_data = _call_ai_chat_image_via_curl(req_id=req_id, req=proxy_req)
                done_error = str(proxy_data.get("done_error") or "").strip()
                result_url = str(proxy_data.get("image_url") or "").strip()
                if result_url and not done_error:
                    prompt_logger.log(
                        req_id,
                        "img2video",
                        req.model_dump(),
                        req.prompt or "",
                        {"model": "ai_chat_seedance_1_0", "duration": req.duration, "ratio": req.ratio},
                        {"file": "mem"},
                        time.time() - t0,
                        user_id=current_user["id"],
                        inputs_full=req.model_dump(),
                        output_full={"videos": [result_url]},
                    )
                    record_usage(current_user["id"], "ai_chat_seedance_1_0")
                    return Img2VideoResponse(image=result_url)
                raise RuntimeError(done_error or "aiChat 未返回视频URL")
            except Exception as ai_chat_err:
                sys_logger.warning(f"[{req_id}] img2video aiChat fallback: {ai_chat_err}")

        result = generate_video_from_image(
            req_id=req_id,
            model=selected_model,
            image_data_url=req.image,
            last_frame_data_url=req.last_frame_image,
            prompt=req.prompt or "",
            duration=req.duration,
            camera_fixed=req.camera_fixed,
            resolution=req.resolution,
            ratio=req.ratio,
            seed = req.seed,
        )
        prompt_logger.log(
            req_id,
            "img2video",
            req.model_dump(),
            req.prompt or "",
            {"model": selected_model, "duration": req.duration, "ratio": req.ratio},
            {"file": "mem"},
            time.time() - t0,
            user_id=current_user["id"],
            inputs_full=req.model_dump(),
            output_full={"videos": [result]},
        )
        record_usage(current_user["id"], selected_model)
        return Img2VideoResponse(image=result)
    
    except TimeoutError as e:
        prompt_logger.log(
            req_id,
            "img2video",
            req.model_dump(),
            req.prompt or "",
            {"model": req.model, "duration": req.duration, "ratio": req.ratio},
            {"file": "mem"},
            time.time() - t0,
            user_id=current_user["id"],
            inputs_full=req.model_dump(),
            error=str(e),
        )
        raise HTTPException(status_code=504, detail=str(e))
    except VideoGenError as e:
        prompt_logger.log(
            req_id,
            "img2video",
            req.model_dump(),
            req.prompt or "",
            {"model": req.model, "duration": req.duration, "ratio": req.ratio},
            {"file": "mem"},
            time.time() - t0,
            user_id=current_user["id"],
            inputs_full=req.model_dump(),
            error=str(e),
        )
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        sys_logger.error(f"[{req_id}] VideoGen Error: {e}")
        prompt_logger.log(
            req_id,
            "img2video",
            req.model_dump(),
            req.prompt or "",
            {"model": req.model, "duration": req.duration, "ratio": req.ratio},
            {"file": "mem"},
            time.time() - t0,
            user_id=current_user["id"],
            inputs_full=req.model_dump(),
            error=str(e),
        )
        raise HTTPException(status_code=500, detail=str(e))


# =========================================================
# Agent endpoints
# =========================================================

@router.post("/api/agent/idea_script/generate_video", response_model=AgentVideoGenerationResponse)
def agent_idea_script_generate_video(
    req: AgentVideoGenerationRequest,
    request: Request,
    response: Response,
    current_user=Depends(_get_current_user_optional),
) -> AgentVideoGenerationResponse:
    req_id = getattr(request.state, "req_id", "noid")
    t0 = time.time()
    tenant_id, user_id = _resolve_agent_actor(request, current_user)
    active_session_id = ""
    session_summary_present = False
    enable_video_generation = _as_bool(os.getenv("BANANAFLOW_ENABLE_VIDEO_GENERATION"), default=False)
    requested_session_id = (request.headers.get("X-Agent-Session-Id") or "").strip() or None
    agent_intent = (request.headers.get("X-Agent-Intent") or "").strip() or "idea_script.generate_video"
    agent_product = (request.headers.get("X-Agent-Product") or "").strip() or req.product

    try:
        active_session_id, tenant_id, user_id, session_summary_present = _resolve_agent_session(
            request=request,
            response=response,
            current_user=current_user,
            requested_session_id=requested_session_id,
        )

        _append_session_event_audit(
            tenant_id=tenant_id,
            user_id=user_id,
            session_id=active_session_id,
            event_type="INTENT_ROUTING",
            payload={
                "intent": agent_intent,
                "product": agent_product,
                "reason": "agent_idea_script_generate_video",
                "backend_call": "agent_video_generation_pipeline",
                "request_path": str(request.url.path),
            },
        )
        _append_session_event_audit(
            tenant_id=tenant_id,
            user_id=user_id,
            session_id=active_session_id,
            event_type="USER_MESSAGE",
            payload={
                "text": req.product,
                "product": agent_product,
            },
        )
        _append_session_event_audit(
            tenant_id=tenant_id,
            user_id=user_id,
            session_id=active_session_id,
            event_type="TOOL_CALL",
            payload={
                "tool_name": "agent_video_generation_pipeline",
                "args_hash": _safe_json_hash(
                    {
                        "product": req.product,
                        "out_dir": req.out_dir,
                        "image_size": [req.image_width, req.image_height],
                        "output_size": [req.output_width, req.output_height],
                        "fps": req.fps,
                        "clip_length": req.clip_length,
                        "max_shots": req.max_shots,
                    }
                ),
                "feature_flag": enable_video_generation,
            },
        )

        def _run_idea_script(product: str) -> IdeaScriptResponse:
            return idea_script_orchestrator.run(
                IdeaScriptRequest(product=product),
                session_id=active_session_id,
                session_summary_present=session_summary_present,
                tenant_id=tenant_id,
                user_id=user_id,
            )

        workflow_out = run_e2e_video_workflow(
            req_id=req_id,
            product=req.product,
            out_dir=str(req.out_dir or "./exports/video_generation"),
            enable_video_generation=enable_video_generation,
            run_idea_script_fn=_run_idea_script,
            resolution=(int(req.output_width or 720), int(req.output_height or 1280)),
            fps=int(req.fps or 24),
            image_size=(int(req.image_width or 1024), int(req.image_height or 1024)),
            clip_length=int(req.clip_length or 81),
            retries_per_step=int(req.retries_per_step or 1),
            max_shots=int(req.max_shots or 0),
            motion_hint=str(req.motion_hint or ""),
            bgm_path=req.bgm_path,
        )

        idea_script_obj = workflow_out.get("idea_script")
        if isinstance(idea_script_obj, IdeaScriptResponse):
            idea_script_payload = idea_script_obj.model_dump(mode="json")
        elif isinstance(idea_script_obj, dict):
            idea_script_payload = dict(idea_script_obj)
        else:
            idea_script_payload = {}

        artifacts = [AgentVideoShotArtifact(**item) for item in list(workflow_out.get("artifacts") or [])]
        payload = AgentVideoGenerationResponse(
            video_generation_enabled=bool(workflow_out.get("video_generation_enabled")),
            fallback_mode=str(workflow_out.get("fallback_mode") or "idea_script_only"),
            idea_script=idea_script_payload,
            output_dir=str(workflow_out.get("output_dir") or ""),
            output_video=workflow_out.get("output_video"),
            error=workflow_out.get("error"),
            shots_total=int(workflow_out.get("shots_total") or 0),
            shots_succeeded=int(workflow_out.get("shots_succeeded") or 0),
            shots_failed=int(workflow_out.get("shots_failed") or 0),
            artifacts=artifacts,
        )

        _append_session_event_audit(
            tenant_id=tenant_id,
            user_id=user_id,
            session_id=active_session_id,
            event_type="TOOL_RESULT",
            payload={
                "tool_name": "agent_video_generation_pipeline",
                "result_ref": {
                    "output_video": payload.output_video,
                    "shots_total": payload.shots_total,
                    "shots_succeeded": payload.shots_succeeded,
                    "shots_failed": payload.shots_failed,
                },
                "isError": bool(payload.error),
                "warnings": ([str(payload.error)] if payload.error else []),
                "feature_flag": enable_video_generation,
            },
        )
        _append_session_event_audit(
            tenant_id=tenant_id,
            user_id=user_id,
            session_id=active_session_id,
            event_type="ARTIFACT_CREATED",
            payload={
                "edit_plan_ids": [],
                "bundle_dir": payload.output_dir or None,
                "video_path": payload.output_video,
            },
        )
        _append_session_event_audit(
            tenant_id=tenant_id,
            user_id=user_id,
            session_id=active_session_id,
            event_type="ASSISTANT_MESSAGE",
            payload={
                "text": (
                    f"Video generation completed with {payload.shots_succeeded}/{payload.shots_total} shot clips."
                    if payload.video_generation_enabled
                    else "Video generation feature is disabled. Returned idea_script output only."
                ),
                "product": req.product,
            },
        )
        prompt_logger.log(
            req_id,
            "agent_idea_script_generate_video",
            req.model_dump(mode="json"),
            req.product,
            {
                "pipeline": "agent_video_generation_pipeline",
                "feature_flag": enable_video_generation,
            },
            payload.model_dump(mode="json"),
            time.time() - t0,
            user_id=user_id,
            inputs_full=req.model_dump(mode="json"),
            output_full=payload.model_dump(mode="json"),
        )
        if str(user_id or "").strip() and not str(user_id).startswith("guest:"):
            record_usage(user_id, idea_script_orchestrator.default_llm_model)
        return payload
    except SessionAccessDeniedError:
        raise HTTPException(status_code=403, detail="Session access denied")
    except SessionNotFoundError:
        raise HTTPException(status_code=404, detail="Session not found")
    except HTTPException:
        raise
    except Exception as e:
        if active_session_id and tenant_id and user_id:
            _append_session_event_audit(
                tenant_id=tenant_id,
                user_id=user_id,
                session_id=active_session_id,
                event_type="TOOL_RESULT",
                payload={
                    "tool_name": "agent_video_generation_pipeline",
                    "result_ref": {"output_video": None, "shots_total": 0, "shots_succeeded": 0, "shots_failed": 0},
                    "isError": True,
                    "warnings": [str(e)],
                    "feature_flag": enable_video_generation,
                },
            )
        sys_logger.error(f"[{req_id}] /api/agent/idea_script/generate_video error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/agent/chitchat", response_model=AgentChitchatResponse)
def agent_chitchat(
    req: AgentChitchatRequest,
    request: Request,
) -> AgentChitchatResponse:
    req_id = getattr(request.state, "req_id", "noid")
    message = str(req.message or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="message 不能为空")

    prompt = (
        "你是 Banana Flow Studio 的中文创意助理。\n"
        "请直接回答用户问题，保持简洁、自然、口语化。\n"
        "如果用户在闲聊，也要正常回应，但不要编造能力。\n"
        "如果用户表达了脚本、分镜、视频、导出等明确意图，可以顺带提示你也能继续帮助完成这些任务。\n"
        f"用户消息：{message}"
    )

    try:
        response = call_genai_retry_with_proxy(
            contents=[types.Part(text=prompt)],
            config=types.GenerateContentConfig(temperature=0.7),
            req_id=f"agent_chitchat:{req_id}",
            model=MODEL_AGENT_CHAT,
            http_proxy=AGENT_CHAT_HTTP_PROXY,
            https_proxy=AGENT_CHAT_HTTPS_PROXY,
        )
        text = str(getattr(response, "text", "") or "").strip()
        if not text:
            text = "我在。你可以继续告诉我你想聊什么，或者直接让我做脚本、分镜、导出。"
        return AgentChitchatResponse(text=text, model=MODEL_AGENT_CHAT)
    except Exception as e:
        sys_logger.error(f"[{req_id}] /api/agent/chitchat error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/agent/idea_script", response_model=IdeaScriptResponse)
def agent_idea_script(
    req: IdeaScriptRequest,
    request: Request,
    response: Response,
    current_user=Depends(_get_current_user_optional),
) -> IdeaScriptResponse:
    req_id = getattr(request.state, "req_id", "noid")
    t0 = time.time()
    tenant_id, user_id = _resolve_agent_actor(request, current_user)
    agent_intent = (request.headers.get("X-Agent-Intent") or "").strip()
    agent_product = (request.headers.get("X-Agent-Product") or "").strip() or req.product
    requested_session_id = (request.headers.get("X-Agent-Session-Id") or "").strip() or None
    active_session_id = ""
    session_summary_present = False

    try:
        active_session_id, tenant_id, user_id, session_summary_present = _resolve_agent_session(
            request=request,
            response=response,
            current_user=current_user,
            requested_session_id=requested_session_id,
        )
        _append_session_event_audit(
            tenant_id=tenant_id,
            user_id=user_id,
            session_id=active_session_id,
            event_type="INTENT_ROUTING",
            payload={
                "intent": agent_intent or "idea_script.generate",
                "product": agent_product,
                "reason": ("x_agent_intent_header" if agent_intent else "agent_idea_script_default"),
                "backend_call": "idea_script_orchestrator.run",
                "request_path": str(request.url.path),
            },
        )
        user_message_event_id = _append_session_event_audit(
            tenant_id=tenant_id,
            user_id=user_id,
            session_id=active_session_id,
            event_type="USER_MESSAGE",
            payload={
                "text": req.product,
                "product": agent_product,
            },
        )
        if _as_bool(os.getenv("BANANAFLOW_ENABLE_PREFERENCE_COMMANDS"), default=False):
            parsed_pref = _parse_preference_command(req.product)
            if parsed_pref is not None:
                stored_pref = set_user_preference(
                    tenant_id=tenant_id,
                    user_id=user_id,
                    key=parsed_pref["key"],
                    value=parsed_pref["value"],
                    confidence=0.95,
                    provenance={
                        "source": "explicit_user",
                        "session_id": active_session_id,
                        "event_id": user_message_event_id,
                        "note": "preference_command",
                    },
                )
                _append_session_event_audit(
                    tenant_id=tenant_id,
                    user_id=user_id,
                    session_id=active_session_id,
                    event_type="MEMORY_UPDATED",
                    payload={
                        "topic": "preference",
                        "key": stored_pref.get("key"),
                        "confidence": stored_pref.get("confidence"),
                        "source": "explicit_user",
                    },
                )
        tool_args_hash = _safe_json_hash({"product": req.product})
        _append_session_event_audit(
            tenant_id=tenant_id,
            user_id=user_id,
            session_id=active_session_id,
            event_type="TOOL_CALL",
            payload={
                "tool_name": "idea_script_orchestrator.run",
                "args_hash": tool_args_hash,
                "mcp_registry": False,
                "mcp_server": None,
                "tool_version": "idea_script_v1",
                "tool_hash": idea_script_orchestrator.config.stable_config_hash(),
            },
        )

        trajectory_sink: list[Dict[str, Any]] = []
        with _temporary_proxy_env(
            http_proxy=_IDEA_SCRIPT_HTTP_PROXY,
            https_proxy=_IDEA_SCRIPT_HTTPS_PROXY,
        ):
            out = idea_script_orchestrator.run(
                req,
                session_id=active_session_id,
                session_summary_present=session_summary_present,
                tenant_id=tenant_id,
                user_id=user_id,
                trajectory_sink=trajectory_sink,
            )
        trajectory_payload = _emit_trajectory_event(
            session_id=active_session_id,
            tenant_id=tenant_id,
            user_id=user_id,
            trajectory_payload=(trajectory_sink[0] if trajectory_sink else None),
            req_id=req_id,
        )
        quality_metrics_payload = _emit_quality_metrics_event(
            out=out,
            session_id=active_session_id,
            tenant_id=tenant_id,
            user_id=user_id,
            latency_ms=int((time.time() - t0) * 1000),
            req_id=req_id,
        )
        _cache_edit_plans(list(out.edit_plans or []))
        edit_plan_ids = [str(getattr(plan, "plan_id", "") or "") for plan in list(out.edit_plans or []) if str(getattr(plan, "plan_id", "") or "").strip()]
        warnings: list[str] = []
        if out.inference_warning and out.warning_reason:
            warnings.append(str(out.warning_reason))
        if out.generation_warning and out.generation_warning_reason:
            warnings.append(str(out.generation_warning_reason))
        if out.compliance_warning and out.compliance_warning_reason:
            warnings.append(str(out.compliance_warning_reason))
        _append_session_event_audit(
            tenant_id=tenant_id,
            user_id=user_id,
            session_id=active_session_id,
            event_type="TOOL_RESULT",
            payload={
                "tool_name": "idea_script_orchestrator.run",
                "result_ref": {
                    "topic_count": len(out.topics or []),
                    "edit_plan_count": len(out.edit_plans or []),
                },
                "isError": False,
                "warnings": warnings,
                "tool_version": "idea_script_v1",
                "tool_hash": out.config_hash,
                "prompt_version": out.prompt_version,
                "policy_version": out.policy_version,
                "config_hash": out.config_hash,
            },
        )
        _append_session_event_audit(
            tenant_id=tenant_id,
            user_id=user_id,
            session_id=active_session_id,
            event_type="ARTIFACT_CREATED",
            payload={
                "edit_plan_ids": edit_plan_ids,
                "bundle_dir": None,
            },
        )
        _append_session_event_audit(
            tenant_id=tenant_id,
            user_id=user_id,
            session_id=active_session_id,
            event_type="ASSISTANT_MESSAGE",
            payload={
                "text": f"Generated {len(out.topics or [])} topics and {len(out.edit_plans or [])} edit plans for {req.product}.",
                "product": req.product,
            },
        )
        try:
            update_session_state(
                tenant_id=tenant_id,
                user_id=user_id,
                session_id=active_session_id,
                patch={
                    "last_product": req.product,
                    "last_edit_plan_ids": edit_plan_ids[:10],
                    "prompt_version": out.prompt_version,
                    "policy_version": out.policy_version,
                    "config_hash": out.config_hash,
                },
            )
        except Exception as e:
            sys_logger.warning(f"session state update skipped: session_id={active_session_id} err={e}")

        sys_logger.info(
            json.dumps(
                {
                    "event": "idea_script",
                    "req_id": req_id,
                    "tenant_id": str(tenant_id),
                    "user_id": user_id,
                    "session_id": active_session_id,
                    "product": req.product,
                    "persona": out.audience_context.persona,
                    "confidence": out.audience_context.confidence,
                    "unsafe_claim_risk": out.audience_context.unsafe_claim_risk,
                    "retry_count": out.retry_count,
                    "inference_warning": out.inference_warning,
                    "generation_retry_count": out.generation_retry_count,
                    "generation_warning": out.generation_warning,
                    "generation_warning_reason": out.generation_warning_reason,
                    "blocking_issues": out.blocking_issues,
                    "non_blocking_issues": out.non_blocking_issues,
                    "failure_tags": out.failure_tags,
                    "topic_count": len(out.topics),
                    "prompt_version": out.prompt_version,
                    "policy_version": out.policy_version,
                    "config_hash": out.config_hash,
                    "budget_exhausted": out.budget_exhausted,
                    "budget_exhausted_reason": out.budget_exhausted_reason,
                    "total_llm_calls": out.total_llm_calls,
                    "quality_metrics": quality_metrics_payload,
                    "trajectory_score": (
                        float((trajectory_payload or {}).get("evaluation_score") or 0.0)
                        if trajectory_payload
                        else None
                    ),
                },
                ensure_ascii=False,
            )
        )

        prompt_logger.log(
            req_id,
            "agent_idea_script",
            req.model_dump(),
            "",
            {"pipeline": "idea_script_v1"},
            {
                "topics_count": len(out.topics),
                "retry_count": out.retry_count,
                "warning": out.inference_warning,
                "confidence": out.audience_context.confidence,
                "generation_retry_count": out.generation_retry_count,
                "generation_warning": out.generation_warning,
                "generation_warning_reason": out.generation_warning_reason,
                "blocking_issues": out.blocking_issues,
                "non_blocking_issues": out.non_blocking_issues,
                "failure_tags": out.failure_tags,
                "topic_count": len(out.topics),
                "prompt_version": out.prompt_version,
                "policy_version": out.policy_version,
                "config_hash": out.config_hash,
                "budget_exhausted": out.budget_exhausted,
                "budget_exhausted_reason": out.budget_exhausted_reason,
                "total_llm_calls": out.total_llm_calls,
                "quality_metrics": quality_metrics_payload,
                "trajectory_score": (
                    float((trajectory_payload or {}).get("evaluation_score") or 0.0)
                    if trajectory_payload
                    else None
                ),
            },
            time.time() - t0,
            user_id=user_id,
            inputs_full=req.model_dump(),
            output_full=out.model_dump(),
        )
        if str(user_id or "").strip() and not str(user_id).startswith("guest:"):
            record_usage(user_id, idea_script_orchestrator.default_llm_model)
        return out

    except SessionAccessDeniedError:
        raise HTTPException(status_code=403, detail="Session access denied")
    except SessionNotFoundError:
        raise HTTPException(status_code=404, detail="Session not found")
    except HTTPException:
        raise
    except Exception as e:
        if active_session_id and tenant_id and user_id:
            _append_session_event_audit(
                tenant_id=tenant_id,
                user_id=user_id,
                session_id=active_session_id,
                event_type="TOOL_RESULT",
                payload={
                    "tool_name": "idea_script_orchestrator.run",
                    "result_ref": {"topic_count": 0, "edit_plan_count": 0},
                    "isError": True,
                    "warnings": [str(e)],
                    "tool_version": "idea_script_v1",
                    "tool_hash": idea_script_orchestrator.config.stable_config_hash(),
                },
            )
        sys_logger.error(f"[{req_id}] /api/agent/idea_script error: {e}")
        prompt_logger.log(
            req_id,
            "agent_idea_script",
            req.model_dump(),
            "",
            {"pipeline": "idea_script_v1"},
            {"topics_count": 0},
            time.time() - t0,
            user_id=user_id,
            inputs_full=req.model_dump(),
            error=str(e),
        )
        if "idea_script_llm_timeout" in str(e):
            raise HTTPException(status_code=504, detail=_IDEA_SCRIPT_LLM_TIMEOUT_MESSAGE)
        raise HTTPException(status_code=500, detail=str(e))


class IdeaScriptExportFfmpegRequest(BaseModel):
    plan_id: Optional[str] = Field(default=None, description="优先使用已缓存的 plan_id")
    plan: Optional[EditPlan] = Field(default=None, description="未命中 plan_id 时可直接传 EditPlan")
    out_dir: str = Field(default="./exports/ffmpeg")
    w: int = Field(default=720, ge=64)
    h: int = Field(default=1280, ge=64)
    fps: int = Field(default=30, ge=1, le=120)


class SessionCreateRequest(BaseModel):
    session_id: Optional[str] = Field(default=None)


class SessionAppendEventRequest(BaseModel):
    type: str
    payload: Dict[str, Any] = Field(default_factory=dict)
    idempotency_key: Optional[str] = Field(default=None)


class SessionSummarizeRequest(BaseModel):
    upto_event_id: Optional[int] = Field(default=None, ge=1)
    max_events: Optional[int] = Field(default=None, ge=1, le=2000)
    max_chars: Optional[int] = Field(default=None, ge=200, le=8000)


class MemoryPreferenceSetRequest(BaseModel):
    key: str
    value: Any
    confidence: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    ttl_days: Optional[int] = Field(default=None, ge=1, le=3650)


class MemoryPreferenceDeactivateRequest(BaseModel):
    key: str


class QualityHarvestEvalCaseRequest(BaseModel):
    session_id: str
    reason: Optional[str] = Field(default=None)
    include_trajectory: Optional[bool] = Field(default=True)


@router.post("/api/agent/idea_script/export_ffmpeg", response_model=Dict[str, Any])
def agent_idea_script_export_ffmpeg(
    req: IdeaScriptExportFfmpegRequest,
    request: Request,
    response: Response,
    current_user=Depends(_get_current_user_optional),
) -> Dict[str, Any]:
    req_id = getattr(request.state, "req_id", "noid")
    t0 = time.time()
    tenant_id, user_id = _resolve_agent_actor(request, current_user)
    active_session_id = ""
    resolved_tool_version = EXPORT_FFMPEG_TOOL_VERSION
    resolved_tool_hash = EXPORT_FFMPEG_TOOL_HASH
    resolved_mcp_server: Optional[str] = None
    try:
        mcp_use_registry = _as_bool(os.getenv("BANANAFLOW_MCP_USE_REGISTRY"), default=False)
        agent_intent = (request.headers.get("X-Agent-Intent") or "").strip()
        agent_product = (request.headers.get("X-Agent-Product") or "").strip() or str(getattr(req.plan, "product", "") or "").strip()
        requested_session_id = (request.headers.get("X-Agent-Session-Id") or "").strip() or None
        active_session_id, tenant_id, user_id, _ = _resolve_agent_session(
            request=request,
            response=response,
            current_user=current_user,
            requested_session_id=requested_session_id,
        )
        if agent_intent or agent_product or active_session_id:
            sys_logger.info(
                json.dumps(
                    {
                        "event": "idea_script_export_ffmpeg_headers",
                        "req_id": req_id,
                        "x_agent_intent": agent_intent,
                        "x_agent_product": agent_product,
                        "x_agent_session_id": active_session_id,
                    },
                    ensure_ascii=False,
                )
            )
        _append_session_event_audit(
            tenant_id=tenant_id,
            user_id=user_id,
            session_id=active_session_id,
            event_type="INTENT_ROUTING",
            payload={
                "intent": agent_intent or "idea_script.export_ffmpeg",
                "product": agent_product,
                "reason": ("x_agent_intent_header" if agent_intent else "agent_idea_script_export_default"),
                "backend_call": EXPORT_FFMPEG_TOOL_NAME,
                "request_path": str(request.url.path),
            },
        )

        plan_data: Optional[Dict[str, Any]] = None
        if (req.plan_id or "").strip():
            plan_data = _get_cached_edit_plan(req.plan_id or "")
            if plan_data is None:
                raise HTTPException(status_code=404, detail=f"plan_id not found: {req.plan_id}")
        elif req.plan is not None:
            plan_data = req.plan.model_dump(mode="json")
        else:
            raise HTTPException(status_code=400, detail="plan_id or plan is required")
        plan_id = str(req.plan_id or (plan_data or {}).get("plan_id") or "").strip()
        _append_session_event_audit(
            tenant_id=tenant_id,
            user_id=user_id,
            session_id=active_session_id,
            event_type="USER_MESSAGE",
            payload={
                "text": (f"export plan {plan_id}" if plan_id else "export ffmpeg bundle"),
                "product": agent_product,
            },
        )

        if mcp_use_registry:
            info = get_global_registry().get_tool_info(EXPORT_FFMPEG_TOOL_NAME) or {}
            resolved_tool_version = str(info.get("tool_version") or resolved_tool_version)
            resolved_tool_hash = str(info.get("tool_hash") or resolved_tool_hash)
            resolved_mcp_server = str(info.get("server_name") or "").strip() or None

        with _span(
            "idea_script.export_ffmpeg",
            {
                "mcp": True,
                "mcp_registry": mcp_use_registry,
                "mcp_server": resolved_mcp_server,
                "tool_version": resolved_tool_version,
                "tool_hash": resolved_tool_hash,
                "plan_id": plan_id,
                "out_dir": req.out_dir,
                "resolution": f"{req.w}x{req.h}",
                "fps": req.fps,
                "session_id": active_session_id,
            },
        ) as span:
            tool_args = {
                "plan_id": plan_id,
                "plan": plan_data,
                "out_dir": req.out_dir,
                "resolution": {"w": req.w, "h": req.h},
                "fps": req.fps,
            }
            _append_session_event_audit(
                tenant_id=tenant_id,
                user_id=user_id,
                session_id=active_session_id,
                event_type="TOOL_CALL",
                payload={
                    "tool_name": EXPORT_FFMPEG_TOOL_NAME,
                    "args_hash": _safe_json_hash(
                        {
                            "plan_id": tool_args.get("plan_id"),
                            "out_dir": tool_args.get("out_dir"),
                            "resolution": tool_args.get("resolution"),
                            "fps": tool_args.get("fps"),
                            "plan_track_count": len(list((plan_data or {}).get("tracks") or [])),
                        }
                    ),
                    "mcp_registry": mcp_use_registry,
                    "mcp_server": resolved_mcp_server,
                    "tool_version": resolved_tool_version,
                    "tool_hash": resolved_tool_hash,
                },
            )
            if mcp_use_registry:
                registry = get_global_registry()
                result = registry.call_tool(EXPORT_FFMPEG_TOOL_NAME, tool_args)
                meta = registry.get_last_call_meta()
                resolved_tool_version = str(meta.get("tool_version") or resolved_tool_version)
                resolved_tool_hash = str(meta.get("tool_hash") or resolved_tool_hash)
                resolved_mcp_server = str(meta.get("server_name") or resolved_mcp_server or "").strip() or None
            else:
                with MCPStdioClient() as mcp_client:
                    result = mcp_client.call_export_ffmpeg_render_bundle(tool_args)
            try:
                span.set_attribute("missing_primary_asset_count", int(result.get("missing_primary_asset_count") or 0))
                span.set_attribute("tool_version", resolved_tool_version)
                span.set_attribute("tool_hash", resolved_tool_hash)
                span.set_attribute("mcp_server", resolved_mcp_server)
            except Exception:
                pass
        _append_session_event_audit(
            tenant_id=tenant_id,
            user_id=user_id,
            session_id=active_session_id,
            event_type="TOOL_RESULT",
            payload={
                "tool_name": EXPORT_FFMPEG_TOOL_NAME,
                "result_ref": {
                    "bundle_dir": result.get("bundle_dir"),
                    "clip_count": result.get("clip_count"),
                    "files_count": len(list(result.get("files") or [])),
                },
                "isError": False,
                "warnings": [str(result.get("warning"))] if result.get("warning") else [],
                "mcp_server": resolved_mcp_server,
                "tool_version": resolved_tool_version,
                "tool_hash": resolved_tool_hash,
            },
        )

        files = list(result.get("files") or [])
        payload = {
            "plan_id": result.get("plan_id"),
            "bundle_dir": result.get("bundle_dir"),
            "render_script_path": result.get("render_script_path"),
            "files": files,
            "clip_count": result.get("clip_count"),
            "missing_primary_asset_count": result.get("missing_primary_asset_count"),
            "warning": result.get("warning"),
            "warning_reason": result.get("warning_reason"),
            "resolution": result.get("resolution"),
            "fps": result.get("fps"),
        }
        _append_session_event_audit(
            tenant_id=tenant_id,
            user_id=user_id,
            session_id=active_session_id,
            event_type="ARTIFACT_CREATED",
            payload={
                "edit_plan_ids": [str(payload.get("plan_id") or "")] if str(payload.get("plan_id") or "").strip() else [],
                "bundle_dir": payload.get("bundle_dir"),
            },
        )
        _append_session_event_audit(
            tenant_id=tenant_id,
            user_id=user_id,
            session_id=active_session_id,
            event_type="ASSISTANT_MESSAGE",
            payload={
                "text": (
                    f"Export ready for plan {payload.get('plan_id') or '-'} "
                    f"with {int(payload.get('clip_count') or 0)} clips at {payload.get('bundle_dir') or '-'}."
                ),
                "product": agent_product,
            },
        )
        try:
            update_session_state(
                tenant_id=tenant_id,
                user_id=user_id,
                session_id=active_session_id,
                patch={
                    "last_product": agent_product,
                    "last_bundle_dir": payload.get("bundle_dir"),
                    "last_bundle_dirs": [payload.get("bundle_dir")] if payload.get("bundle_dir") else [],
                    "last_export_plan_id": payload.get("plan_id"),
                },
            )
        except Exception as e:
            sys_logger.warning(f"session state update skipped: session_id={active_session_id} err={e}")
        prompt_logger.log(
            req_id,
            "agent_idea_script_export_ffmpeg",
            req.model_dump(mode="json"),
            "",
            {"pipeline": "idea_script_export_ffmpeg"},
            payload,
            time.time() - t0,
            user_id=user_id,
            inputs_full=req.model_dump(mode="json"),
            output_full=payload,
        )
        return payload
    except SessionAccessDeniedError:
        raise HTTPException(status_code=403, detail="Session access denied")
    except SessionNotFoundError:
        raise HTTPException(status_code=404, detail="Session not found")
    except HTTPException:
        raise
    except (MCPClientError, MCPRegistryError, MCPToolInvocationError) as e:
        if active_session_id and tenant_id and user_id:
            _append_session_event_audit(
                tenant_id=tenant_id,
                user_id=user_id,
                session_id=active_session_id,
                event_type="TOOL_RESULT",
                payload={
                    "tool_name": EXPORT_FFMPEG_TOOL_NAME,
                    "result_ref": {"bundle_dir": None, "clip_count": 0, "files_count": 0},
                    "isError": True,
                    "warnings": [str(e)],
                    "mcp_server": resolved_mcp_server,
                    "tool_version": resolved_tool_version,
                    "tool_hash": resolved_tool_hash,
                },
            )
        sys_logger.error(f"[{req_id}] /api/agent/idea_script/export_ffmpeg MCP error: {e}")
        prompt_logger.log(
            req_id,
            "agent_idea_script_export_ffmpeg",
            req.model_dump(mode="json"),
            "",
            {"pipeline": "idea_script_export_ffmpeg", "mcp": True},
            {"ok": False},
            time.time() - t0,
            user_id=user_id,
            inputs_full=req.model_dump(mode="json"),
            error=str(e),
        )
        raise HTTPException(
            status_code=500,
            detail=f"MCP export tool failed. Recovery: verify plan payload and retry. ({e})",
        )
    except Exception as e:
        if active_session_id and tenant_id and user_id:
            _append_session_event_audit(
                tenant_id=tenant_id,
                user_id=user_id,
                session_id=active_session_id,
                event_type="TOOL_RESULT",
                payload={
                    "tool_name": EXPORT_FFMPEG_TOOL_NAME,
                    "result_ref": {"bundle_dir": None, "clip_count": 0, "files_count": 0},
                    "isError": True,
                    "warnings": [str(e)],
                    "mcp_server": resolved_mcp_server,
                    "tool_version": resolved_tool_version,
                    "tool_hash": resolved_tool_hash,
                },
            )
        sys_logger.error(f"[{req_id}] /api/agent/idea_script/export_ffmpeg error: {e}")
        prompt_logger.log(
            req_id,
            "agent_idea_script_export_ffmpeg",
            req.model_dump(mode="json"),
            "",
            {"pipeline": "idea_script_export_ffmpeg"},
            {"ok": False},
            time.time() - t0,
            user_id=user_id,
            inputs_full=req.model_dump(mode="json"),
            error=str(e),
        )
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/sessions/create", response_model=Dict[str, Any])
def create_session_api(
    req: SessionCreateRequest,
    request: Request,
    current_user=Depends(get_current_user),
) -> Dict[str, Any]:
    tenant_id, user_id = _tenant_user_from_request(request, current_user)
    try:
        session = create_or_get_session(tenant_id=tenant_id, user_id=user_id, session_id=req.session_id)
        return {"session_id": session.get("session_id")}
    except SessionAccessDeniedError:
        raise HTTPException(status_code=403, detail="Session access denied")


@router.get("/api/sessions/{session_id}", response_model=Dict[str, Any])
def get_session_api(
    session_id: str,
    request: Request,
    current_user=Depends(get_current_user),
    include_events: bool = Query(default=True),
    limit_events: int = Query(default=200, ge=1, le=2000),
) -> Dict[str, Any]:
    tenant_id, user_id = _tenant_user_from_request(request, current_user)
    try:
        return get_session_detail(
            tenant_id=tenant_id,
            user_id=user_id,
            session_id=session_id,
            include_events=bool(include_events),
            limit_events=int(limit_events),
        )
    except SessionNotFoundError:
        raise HTTPException(status_code=404, detail="Session not found")
    except SessionAccessDeniedError:
        raise HTTPException(status_code=403, detail="Session access denied")


@router.get("/api/sessions", response_model=Dict[str, Any])
def list_sessions_api(
    request: Request,
    current_user=Depends(get_current_user),
    limit: int = Query(default=50, ge=1, le=200),
) -> Dict[str, Any]:
    tenant_id, user_id = _tenant_user_from_request(request, current_user)
    return {"sessions": list_session_items(tenant_id=tenant_id, user_id=user_id, limit=int(limit))}


@router.post("/api/sessions/{session_id}/events", response_model=Dict[str, Any])
def append_session_event_api(
    session_id: str,
    req: SessionAppendEventRequest,
    request: Request,
    current_user=Depends(get_current_user),
) -> Dict[str, Any]:
    tenant_id, user_id = _tenant_user_from_request(request, current_user)
    try:
        event_id = append_session_event(
            tenant_id=tenant_id,
            user_id=user_id,
            session_id=session_id,
            type=req.type,
            payload=req.payload,
            idempotency_key=req.idempotency_key,
        )
        return {"event_id": int(event_id)}
    except SessionNotFoundError:
        raise HTTPException(status_code=404, detail="Session not found")
    except SessionAccessDeniedError:
        raise HTTPException(status_code=403, detail="Session access denied")


@router.post("/api/sessions/{session_id}/summarize", response_model=Dict[str, Any])
def summarize_session_api(
    session_id: str,
    request: Request,
    current_user=Depends(get_current_user),
    req: Optional[SessionSummarizeRequest] = None,
) -> Dict[str, Any]:
    tenant_id, user_id = _tenant_user_from_request(request, current_user)
    body = req or SessionSummarizeRequest()
    try:
        return summarize_session_item(
            tenant_id=tenant_id,
            user_id=user_id,
            session_id=session_id,
            upto_event_id=body.upto_event_id,
            max_events=(body.max_events or 400),
            max_chars=(body.max_chars or 2000),
        )
    except SessionNotFoundError:
        raise HTTPException(status_code=404, detail="Session not found")
    except SessionAccessDeniedError:
        raise HTTPException(status_code=403, detail="Session access denied")


@router.get("/api/sessions/{session_id}/summary", response_model=Dict[str, Any])
def get_session_summary_api(
    session_id: str,
    request: Request,
    current_user=Depends(get_current_user),
) -> Dict[str, Any]:
    tenant_id, user_id = _tenant_user_from_request(request, current_user)
    try:
        data = get_session_detail(
            tenant_id=tenant_id,
            user_id=user_id,
            session_id=session_id,
            include_events=False,
        )
        session = data.get("session") or {}
        return {
            "session_id": session.get("session_id"),
            "summary_text": session.get("summary_text") or "",
            "summary_updated_at": session.get("summary_updated_at"),
            "summary_version": session.get("summary_version"),
            "summary_event_id_upto": session.get("summary_event_id_upto"),
        }
    except SessionNotFoundError:
        raise HTTPException(status_code=404, detail="Session not found")
    except SessionAccessDeniedError:
        raise HTTPException(status_code=403, detail="Session access denied")


@router.post("/api/memory/preferences/set", response_model=Dict[str, Any])
def set_memory_preference_api(
    req: MemoryPreferenceSetRequest,
    request: Request,
    current_user=Depends(get_current_user),
) -> Dict[str, Any]:
    tenant_id, user_id = _tenant_user_from_request(request, current_user)
    try:
        memory = set_user_preference(
            tenant_id=tenant_id,
            user_id=user_id,
            key=req.key,
            value=req.value,
            confidence=(0.9 if req.confidence is None else float(req.confidence)),
            ttl_days=req.ttl_days,
            provenance={"source": "explicit_user", "note": "api.memory.preferences.set"},
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {
        "memory": {
            "memory_id": memory.get("memory_id"),
            "key": memory.get("key"),
            "value": memory.get("value"),
            "confidence": memory.get("confidence"),
            "updated_at": memory.get("updated_at"),
            "ttl_at": memory.get("ttl_at"),
            "is_active": memory.get("is_active"),
            "last_confirmed_at": memory.get("last_confirmed_at"),
            "update_count": memory.get("update_count"),
        }
    }


@router.get("/api/memory/preferences", response_model=Dict[str, Any])
def list_memory_preferences_api(
    request: Request,
    current_user=Depends(get_current_user),
) -> Dict[str, Any]:
    tenant_id, user_id = _tenant_user_from_request(request, current_user)
    preferences = list_user_preferences(tenant_id=tenant_id, user_id=user_id)
    return {
        "preferences": [
            {
                "memory_id": item.get("memory_id"),
                "key": item.get("key"),
                "value": item.get("value"),
                "confidence": item.get("confidence"),
                "is_active": item.get("is_active"),
                "last_confirmed_at": item.get("last_confirmed_at"),
                "update_count": item.get("update_count"),
                "deactivated_reason": item.get("deactivated_reason"),
                "value_history_json": item.get("value_history_json"),
                "updated_at": item.get("updated_at"),
                "ttl_at": item.get("ttl_at"),
            }
            for item in preferences
        ]
    }


@router.post("/api/memory/preferences/deactivate", response_model=Dict[str, Any])
def deactivate_memory_preference_api(
    req: MemoryPreferenceDeactivateRequest,
    request: Request,
    current_user=Depends(get_current_user),
) -> Dict[str, Any]:
    tenant_id, user_id = _tenant_user_from_request(request, current_user)
    try:
        deactivate_user_preference(tenant_id=tenant_id, user_id=user_id, key=req.key)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True}


@router.post("/api/memory/preferences/expire", response_model=Dict[str, Any])
def expire_memory_preferences_api(
    request: Request,
    current_user=Depends(get_current_user),
) -> Dict[str, Any]:
    tenant_id, user_id = _tenant_user_from_request(request, current_user)
    expired_count = expire_user_preferences(tenant_id=tenant_id, user_id=user_id)
    return {"expired_count": int(expired_count)}


@router.post("/api/quality/harvest_eval_case", response_model=Dict[str, Any])
def harvest_eval_case_api(
    req: QualityHarvestEvalCaseRequest,
    request: Request,
    current_user=Depends(get_current_user),
) -> Dict[str, Any]:
    if not _as_bool(os.getenv("BANANAFLOW_ENABLE_EVAL_HARVEST_API"), default=False):
        raise HTTPException(status_code=404, detail="Not found")
    tenant_id, user_id = _tenant_user_from_request(request, current_user)
    include_trajectory = bool(req.include_trajectory if req.include_trajectory is not None else True)
    reason = str(req.reason or "api_manual_harvest")
    req_id = getattr(request.state, "req_id", "noid")
    x_agent_intent = _decode_agent_header(request.headers.get("X-Agent-Intent"))
    x_agent_product = _decode_agent_header(request.headers.get("X-Agent-Product"))
    x_agent_session_id = _decode_agent_header(request.headers.get("X-Agent-Session-Id"))
    with _span(
        "quality.feedback",
        {
            "quality_feedback": True,
            "feedback_reason": reason,
            "session_id": req.session_id,
            "x_agent_session_id": x_agent_session_id,
            "x_agent_intent": x_agent_intent,
            "x_agent_product": x_agent_product,
            "include_trajectory": include_trajectory,
        },
    ) as span:
        feedback_status = "flagged"
        feedback_event_id: Optional[int] = None
        result_case_id: Optional[str] = None
        result_output_path: Optional[str] = None
        try:
            result = harvest_eval_case(
                session_id=req.session_id,
                tenant_id=tenant_id,
                user_id=user_id,
                out_dir=(os.getenv("BANANAFLOW_EVAL_CASES_PATH") or ""),
                reason=reason,
                include_trajectory=include_trajectory,
                provenance={
                    "source": "api",
                    "tenant_scope": tenant_id,
                    "user_scope": user_id,
                },
            )
            feedback_status = "harvested" if bool(result.written) else "flagged"
            result_case_id = str(result.case_id or "")
            result_output_path = str(result.output_path or "")
            feedback_event_id = _append_session_event_audit(
                tenant_id=tenant_id,
                user_id=user_id,
                session_id=req.session_id,
                event_type="HITL_FEEDBACK",
                payload={
                    "feedback_status": feedback_status,
                    "feedback_reason": reason,
                    "case_id": result_case_id,
                    "output_path": result_output_path,
                    "session_id": req.session_id,
                    "x_agent_session_id": x_agent_session_id or req.session_id,
                    "x_agent_intent": x_agent_intent,
                    "x_agent_product": x_agent_product,
                    "req_id": req_id,
                    "timestamp": time.time(),
                },
                idempotency_key=f"hitl_feedback:{req_id}:{req.session_id}",
            )
            try:
                span.set_attribute("feedback_status", feedback_status)
                span.set_attribute("case_id", result_case_id)
                span.set_attribute("bytes_written", int(result.bytes_written or 0))
                span.set_attribute("hitl_feedback_event_id", int(feedback_event_id or 0))
            except Exception:
                pass
            sys_logger.info(
                json.dumps(
                    {
                        "event": "quality_hitl_feedback",
                        "tenant_id": tenant_id,
                        "user_id": user_id,
                        "session_id": req.session_id,
                        "reason": reason,
                        "feedback_status": feedback_status,
                        "case_id": result_case_id,
                        "output_path": result_output_path,
                        "x_agent_session_id": x_agent_session_id or req.session_id,
                        "x_agent_intent": x_agent_intent,
                        "x_agent_product": x_agent_product,
                        "req_id": req_id,
                        "event_id": feedback_event_id,
                    },
                    ensure_ascii=False,
                )
            )
            return {"case_id": result.case_id, "output_path": result.output_path}
        except SessionNotFoundError:
            raise HTTPException(status_code=404, detail="Session not found")
        except SessionAccessDeniedError:
            raise HTTPException(status_code=403, detail="Session access denied")
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))


# =========================================================
# Stats / history endpoints
# =========================================================

@router.get("/api/stats")
def get_stats():
    return analyzer.get_stats()


@router.get("/api/history")
def get_history(current_user=Depends(get_current_user)):
    return analyzer.get_history(user_id=current_user["id"], limit=20)
