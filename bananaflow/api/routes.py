# routes.py
import time
import json
import uuid
import threading
from typing import Dict, Any, Optional, List

from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel, Field
from google.genai import types


from core.config import (
    MODEL_GEMINI,
    MODEL_DOUBAO,
    MODEL_COMFYUI_OVERLAYTEXT,
    MODEL_COMFYUI_RMBG,
    MODEL_COMFYUI_MULTI_ANGLESHOTS,
    MODEL_COMFYUI_VIDEO_UPSCALE,
    MODEL_COMFYUI_CONTROLNET,
)
from core.logging import sys_logger
from auth_routes import get_current_user
from storage.usage import record_usage

from schemas.api import (
    Text2ImgRequest, Text2ImgResponse,
    MultiImageRequest, MultiImageResponse,
    OverlayTextRequest, OverlayTextResponse,
    RmbgRequest, RmbgResponse,
    MultiAngleShotsRequest, MultiAngleShotsResponse,
    VideoUpscaleRequest, VideoUpscaleResponse,
    ControlnetPoseVideoRequest, ControlnetPoseVideoResponse,
    VideoUpscaleTaskStartResponse, VideoUpscaleTaskStatusResponse,
    EditRequest, EditResponse,
    Img2VideoRequest, Img2VideoResponse,
)

from storage.prompt_log import PromptLogger, LogAnalyzer
from services.genai_client import call_genai_retry
from services.ark import call_doubao_image_gen
from services.ark_video import generate_video_from_image, VideoGenError
from services.comfyui import (
    run_overlaytext_workflow,
    run_rmbg_workflow,
    run_multi_angleshots_workflow,
    run_controlnet_pose_video_workflow,
    run_video_upscale_workflow,
)

from utils.images import parse_data_url, bytes_to_data_url, get_image_from_response
from prompts.business import build_business_prompt

from agent.idea_script.orchestrator import IdeaScriptOrchestrator
from agent.idea_script.schemas import EditPlan, IdeaScriptRequest, IdeaScriptResponse
from agent.idea_script.exporters.ffmpeg_exporter import export_ffmpeg_bundle
ALLOWED_VIDEO_MODELS = {"Doubao-Seedance-1.0-pro", "Doubao-Seedance-1.5-pro"}


router = APIRouter()
prompt_logger = PromptLogger()
analyzer = LogAnalyzer("logs/prompts.jsonl")
video_upscale_tasks: Dict[str, Dict[str, Any]] = {}
video_upscale_tasks_lock = threading.Lock()
idea_script_orchestrator = IdeaScriptOrchestrator()
idea_script_plan_cache: Dict[str, Dict[str, Any]] = {}
idea_script_plan_cache_lock = threading.Lock()


def _set_video_upscale_task(task_id: str, **patch: Any) -> None:
    with video_upscale_tasks_lock:
        current = video_upscale_tasks.get(task_id, {})
        current.update(patch)
        video_upscale_tasks[task_id] = current


def _get_video_upscale_task(task_id: str) -> Optional[Dict[str, Any]]:
    with video_upscale_tasks_lock:
        current = video_upscale_tasks.get(task_id)
        return dict(current) if isinstance(current, dict) else None


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
def multi_image_generate(req: MultiImageRequest, request: Request, current_user=Depends(get_current_user)):
    req_id = request.state.req_id
    t0 = time.time()

    try:
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

        response = call_genai_retry(contents=contents, config=gen_config, req_id=req_id)
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
            user_id=current_user["id"],
            inputs_full=req.model_dump(),
            output_full={"images": [output_data_url]},
        )
        record_usage(current_user["id"], MODEL_GEMINI)
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
            user_id=current_user["id"],
            inputs_full=req.model_dump(),
            error=str(e),
        )
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/overlaytext", response_model=OverlayTextResponse)
def overlay_text(req: OverlayTextRequest, request: Request, current_user=Depends(get_current_user)):
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
            user_id=current_user["id"],
            inputs_full=req.model_dump(),
            output_full={"images": [output_data_url]},
        )
        record_usage(current_user["id"], MODEL_COMFYUI_OVERLAYTEXT)
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
            user_id=current_user["id"],
            inputs_full=req.model_dump(),
            error=str(e),
        )
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/rmbg", response_model=RmbgResponse)
def remove_background(req: RmbgRequest, request: Request, current_user=Depends(get_current_user)):
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
            user_id=current_user["id"],
            inputs_full=req.model_dump(),
            output_full={"images": [output_data_url]},
        )
        record_usage(current_user["id"], MODEL_COMFYUI_RMBG)
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
            user_id=current_user["id"],
            inputs_full=req.model_dump(),
            error=str(e),
        )
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/multi_angleshots", response_model=MultiAngleShotsResponse)
def multi_angleshots(req: MultiAngleShotsRequest, request: Request, current_user=Depends(get_current_user)):
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
            user_id=current_user["id"],
            inputs_full=req.model_dump(),
            output_full={"images": output_images},
        )
        record_usage(current_user["id"], MODEL_COMFYUI_MULTI_ANGLESHOTS)
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
            user_id=current_user["id"],
            inputs_full=req.model_dump(),
            error=str(e),
        )
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/controlnet_pose_video", response_model=ControlnetPoseVideoResponse)
def controlnet_pose_video(req: ControlnetPoseVideoRequest, request: Request, current_user=Depends(get_current_user)):
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
            user_id=current_user["id"],
            inputs_full=req.model_dump(),
            output_full={"videos": [output_data_url]},
        )
        record_usage(current_user["id"], MODEL_COMFYUI_CONTROLNET)
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
            user_id=current_user["id"],
            inputs_full=req.model_dump(),
            error=str(e),
        )
        raise HTTPException(status_code=500, detail=str(e))


def _run_video_upscale_task(task_id: str, req_id: str, user_id: str, payload: Dict[str, Any]) -> None:
    t0 = time.time()
    segment_seconds = max(1, int(payload.get("segment_seconds") or 3))

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
            {"model": MODEL_COMFYUI_VIDEO_UPSCALE, "segment_seconds": segment_seconds},
            {"file": "mem"},
            time.time() - t0,
            user_id=user_id,
            inputs_full=payload,
            output_full={"videos": [output_data_url]},
        )
        record_usage(user_id, MODEL_COMFYUI_VIDEO_UPSCALE)
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
            {"model": MODEL_COMFYUI_VIDEO_UPSCALE, "segment_seconds": segment_seconds},
            {"file": "mem"},
            time.time() - t0,
            user_id=user_id,
            inputs_full=payload,
            error=str(e),
        )


@router.post("/api/video_upscale/start", response_model=VideoUpscaleTaskStartResponse)
def video_upscale_start(req: VideoUpscaleRequest, request: Request, current_user=Depends(get_current_user)):
    req_id = request.state.req_id
    payload = req.model_dump()
    task_id = uuid.uuid4().hex
    segment_seconds = max(1, int(req.segment_seconds or 3))

    _set_video_upscale_task(
        task_id,
        user_id=current_user["id"],
        status="queued",
        completed_chunks=0,
        total_chunks=0,
        progress=0.0,
        segment_seconds=segment_seconds,
        created_at=time.time(),
        updated_at=time.time(),
    )

    worker = threading.Thread(
        target=_run_video_upscale_task,
        args=(task_id, req_id, current_user["id"], payload),
        daemon=True,
    )
    worker.start()
    return VideoUpscaleTaskStartResponse(task_id=task_id, status="queued")


@router.get("/api/video_upscale/status/{task_id}", response_model=VideoUpscaleTaskStatusResponse)
def video_upscale_status(task_id: str, current_user=Depends(get_current_user)):
    task = _get_video_upscale_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if str(task.get("user_id")) != str(current_user["id"]):
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
def video_upscale(req: VideoUpscaleRequest, request: Request, current_user=Depends(get_current_user)):
    req_id = request.state.req_id
    t0 = time.time()
    segment_seconds = max(1, int(req.segment_seconds or 3))

    try:
        video_bytes, mime_type = run_video_upscale_workflow(
            req_id=req_id,
            video_input=req.video,
            segment_seconds=segment_seconds,
        )
        if not video_bytes:
            raise RuntimeError("No video returned")

        output_data_url = bytes_to_data_url(video_bytes, mime_type=mime_type or "video/mp4")
        prompt_logger.log(
            req_id,
            "video_upscale",
            req.model_dump(),
            "",
            {"model": MODEL_COMFYUI_VIDEO_UPSCALE, "segment_seconds": segment_seconds},
            {"file": "mem"},
            time.time() - t0,
            user_id=current_user["id"],
            inputs_full=req.model_dump(),
            output_full={"videos": [output_data_url]},
        )
        record_usage(current_user["id"], MODEL_COMFYUI_VIDEO_UPSCALE)
        return VideoUpscaleResponse(video=output_data_url)

    except Exception as e:
        sys_logger.error(f"[{req_id}] VideoUpscale Error: {e}")
        prompt_logger.log(
            req_id,
            "video_upscale",
            req.model_dump(),
            "",
            {"model": MODEL_COMFYUI_VIDEO_UPSCALE, "segment_seconds": segment_seconds},
            {"file": "mem"},
            time.time() - t0,
            user_id=current_user["id"],
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
    selected_model = req.model or MODEL_GEMINI
    final_prompt = build_business_prompt(req.mode, req.prompt, has_ref)
    

    try:
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
        print("--------选择的模型-------：", selected_model)
        if selected_model not in ALLOWED_VIDEO_MODELS:
            raise HTTPException(status_code=400, detail=f"Unsupported video model: {selected_model}")
        
        print("--------提示词-------：", req.prompt)
        result = generate_video_from_image(
            req_id=req_id,
            model=req.model,   # ✅ 新增
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

@router.post("/api/agent/idea_script", response_model=IdeaScriptResponse)
def agent_idea_script(req: IdeaScriptRequest, request: Request, current_user=Depends(get_current_user)) -> IdeaScriptResponse:
    req_id = getattr(request.state, "req_id", "noid")
    t0 = time.time()
    tenant_id = request.headers.get("X-Tenant-Id") or current_user.get("email_domain") or "unknown"
    user_id = current_user.get("id")

    try:
        out = idea_script_orchestrator.run(req)
        _cache_edit_plans(list(out.edit_plans or []))

        sys_logger.info(
            json.dumps(
                {
                    "event": "idea_script",
                    "req_id": req_id,
                    "tenant_id": str(tenant_id),
                    "user_id": user_id,
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
            },
            time.time() - t0,
            user_id=user_id,
            inputs_full=req.model_dump(),
            output_full=out.model_dump(),
        )
        record_usage(user_id, idea_script_orchestrator.default_llm_model)
        return out

    except HTTPException:
        raise
    except Exception as e:
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
        raise HTTPException(status_code=500, detail=str(e))


class IdeaScriptExportFfmpegRequest(BaseModel):
    plan_id: Optional[str] = Field(default=None, description="优先使用已缓存的 plan_id")
    plan: Optional[EditPlan] = Field(default=None, description="未命中 plan_id 时可直接传 EditPlan")
    out_dir: str = Field(default="./exports/ffmpeg")
    w: int = Field(default=720, ge=64)
    h: int = Field(default=1280, ge=64)
    fps: int = Field(default=30, ge=1, le=120)


@router.post("/api/agent/idea_script/export_ffmpeg", response_model=Dict[str, Any])
def agent_idea_script_export_ffmpeg(
    req: IdeaScriptExportFfmpegRequest,
    request: Request,
    current_user=Depends(get_current_user),
) -> Dict[str, Any]:
    req_id = getattr(request.state, "req_id", "noid")
    t0 = time.time()
    try:
        plan_data: Optional[Dict[str, Any]] = None
        if (req.plan_id or "").strip():
            plan_data = _get_cached_edit_plan(req.plan_id or "")
            if plan_data is None:
                raise HTTPException(status_code=404, detail=f"plan_id not found: {req.plan_id}")
        elif req.plan is not None:
            plan_data = req.plan.model_dump(mode="json")
        else:
            raise HTTPException(status_code=400, detail="plan_id or plan is required")

        result = export_ffmpeg_bundle(
            plan=plan_data,
            out_dir=req.out_dir,
            resolution=(req.w, req.h),
            fps=req.fps,
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
        prompt_logger.log(
            req_id,
            "agent_idea_script_export_ffmpeg",
            req.model_dump(mode="json"),
            "",
            {"pipeline": "idea_script_export_ffmpeg"},
            payload,
            time.time() - t0,
            user_id=current_user["id"],
            inputs_full=req.model_dump(mode="json"),
            output_full=payload,
        )
        return payload
    except HTTPException:
        raise
    except Exception as e:
        sys_logger.error(f"[{req_id}] /api/agent/idea_script/export_ffmpeg error: {e}")
        prompt_logger.log(
            req_id,
            "agent_idea_script_export_ffmpeg",
            req.model_dump(mode="json"),
            "",
            {"pipeline": "idea_script_export_ffmpeg"},
            {"ok": False},
            time.time() - t0,
            user_id=current_user["id"],
            inputs_full=req.model_dump(mode="json"),
            error=str(e),
        )
        raise HTTPException(status_code=500, detail=str(e))

# =========================================================
# Stats / history endpoints
# =========================================================

@router.get("/api/stats")
def get_stats():
    return analyzer.get_stats()


@router.get("/api/history")
def get_history(current_user=Depends(get_current_user)):
    return analyzer.get_history(user_id=current_user["id"], limit=20)
