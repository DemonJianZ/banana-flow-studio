from __future__ import annotations

from functools import lru_cache
from typing import Any, Dict, List, Tuple

try:
    from google.genai import types
except Exception:  # pragma: no cover - test environments may not install google-genai
    class _FallbackPart:
        def __init__(self, text: str = "") -> None:
            self.text = text

    class _FallbackGenerateContentConfig:
        def __init__(self, **kwargs: Any) -> None:
            for key, value in kwargs.items():
                setattr(self, key, value)

    class _FallbackTypes:
        Part = _FallbackPart
        GenerateContentConfig = _FallbackGenerateContentConfig

    types = _FallbackTypes()

try:
    from ...core.config import (
        AGENT_CHAT_HTTP_PROXY,
        AGENT_CHAT_HTTPS_PROXY,
        MODEL_AGENT_CHAT,
        MODEL_COMFYUI_QWEN_I2V,
        MODEL_PROMPT_POLISH,
    )
    from ...prompts.refine import ollama_prompt_polish
    from ...schemas.api import AgentDramaRequest
    from ...services.genai_client import call_genai_retry_with_proxy
    from ...services.comfyui import (
        run_image_z_image_turbo_workflow,
        run_qwen_i2v_workflow,
        run_rmbg_workflow,
    )
    from ...utils.images import bytes_to_data_url, parse_data_url
    from ...utils.size import calculate_target_resolution
    from ..drama_creator import DramaCreatorClient
    from ..idea_script.instance import idea_script_orchestrator
    from ..idea_script.schemas import IdeaScriptRequest
    from ...mcp.tool_asset_match import execute_asset_match_tool
    from ...mcp.tool_export_ffmpeg import execute_export_ffmpeg_tool
    from ...quality.harvester import harvest_eval_case
except Exception:  # pragma: no cover - compatible with python bananaflow/main.py
    from core.config import (
        AGENT_CHAT_HTTP_PROXY,
        AGENT_CHAT_HTTPS_PROXY,
        MODEL_AGENT_CHAT,
        MODEL_COMFYUI_QWEN_I2V,
        MODEL_PROMPT_POLISH,
    )
    from prompts.refine import ollama_prompt_polish
    from schemas.api import AgentDramaRequest
    from services.genai_client import call_genai_retry_with_proxy
    from services.comfyui import (
        run_image_z_image_turbo_workflow,
        run_qwen_i2v_workflow,
        run_rmbg_workflow,
    )
    from utils.images import bytes_to_data_url, parse_data_url
    from utils.size import calculate_target_resolution
    from agent.drama_creator import DramaCreatorClient
    from agent.idea_script.instance import idea_script_orchestrator
    from agent.idea_script.schemas import IdeaScriptRequest
    from mcp.tool_asset_match import execute_asset_match_tool
    from mcp.tool_export_ffmpeg import execute_export_ffmpeg_tool
    from quality.harvester import harvest_eval_case

from .executor import AgentToolContext, AgentToolExecutor
from .registry import AgentToolRegistry
from .specs import AgentToolSpec


def _parse_dimensions(size: str | None, ratio: str | None) -> Tuple[int, int]:
    target = calculate_target_resolution(size or "1024x1024", ratio or "1:1")
    if "x" not in target:
        return 1024, 1024
    try:
        width_text, height_text = target.lower().split("x", 1)
        return max(64, int(width_text)), max(64, int(height_text))
    except Exception:
        return 1024, 1024


def _build_agent_chitchat_prompt(message: str) -> str:
    return (
        "你是 Banana Flow Studio 的中文创意助理。\n"
        "请直接回答用户问题，保持简洁、自然、口语化。\n"
        "如果用户在闲聊，也要正常回应，但不要编造能力。\n"
        "如果用户表达了脚本、短剧创作、画布工作流等明确意图，可以顺带提示你也能继续帮助完成这些任务。\n"
        f"用户消息：{message}"
    )


def _tool_specs() -> List[Tuple[AgentToolSpec, Any]]:
    return [
        (
            AgentToolSpec(
                name="agent_prompt_polish",
                description="Polish a creative prompt for image or video generation.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "prompt": {"type": "string"},
                        "mode": {"type": "string"},
                    },
                    "required": ["prompt"],
                    "additionalProperties": False,
                },
                output_schema={
                    "type": "object",
                    "properties": {
                        "text": {"type": "string"},
                        "model": {"type": "string"},
                        "variants": {"type": "array", "items": {"type": "object"}},
                        "tool_version": {"type": "string"},
                        "tool_hash": {"type": "string"},
                    },
                    "required": ["text", "model", "variants", "tool_version", "tool_hash"],
                    "additionalProperties": True,
                },
                annotations={"readOnlyHint": True, "idempotentHint": True, "destructiveHint": False},
            ),
            _handle_prompt_polish,
        ),
        (
            AgentToolSpec(
                name="agent_drama_generate",
                description="Generate a drama script payload for Bananaflow agent.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "prompt": {"type": "string"},
                        "task_mode": {"type": "string"},
                        "episode_count": {"type": "integer", "minimum": 1, "maximum": 50},
                        "existing_script": {"type": "string"},
                    },
                    "required": ["prompt"],
                    "additionalProperties": False,
                },
                output_schema={
                    "type": "object",
                    "properties": {
                        "text": {"type": "string"},
                        "summary": {"type": "string"},
                        "model": {"type": "string"},
                        "mode": {"type": "string"},
                        "tool_version": {"type": "string"},
                        "tool_hash": {"type": "string"},
                    },
                    "required": ["text", "summary", "model", "mode", "tool_version", "tool_hash"],
                    "additionalProperties": True,
                },
                annotations={"readOnlyHint": True, "idempotentHint": False, "destructiveHint": False},
            ),
            _handle_drama_generate,
        ),
        (
            AgentToolSpec(
                name="agent_idea_script_generate",
                description="Generate idea-script outputs through the existing orchestrator.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "product": {"type": "string"},
                        "audience": {"type": "string"},
                        "price_band": {"type": "string"},
                        "conversion_goal": {"type": "string"},
                        "primary_platform": {"type": "string"},
                        "secondary_platform": {"type": "string"},
                        "selected_angle": {"type": "string"},
                    },
                    "required": ["product"],
                    "additionalProperties": False,
                },
                output_schema={
                    "type": "object",
                    "properties": {
                        "topics": {"type": "array", "items": {"type": "object"}},
                        "edit_plans": {"type": "array", "items": {"type": "object"}},
                        "tool_version": {"type": "string"},
                        "tool_hash": {"type": "string"},
                    },
                    "required": ["topics", "edit_plans", "tool_version", "tool_hash"],
                    "additionalProperties": True,
                },
                annotations={"readOnlyHint": True, "idempotentHint": False, "destructiveHint": False},
            ),
            _handle_idea_script_generate,
        ),
        (
            AgentToolSpec(
                name="match_assets_for_shots",
                description="Deterministically retrieve asset candidates for shot requirements.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "queries": {"type": "array", "items": {"type": "object"}},
                        "shots": {"type": "array", "items": {"type": "object"}},
                        "top_k": {"type": "integer", "minimum": 1, "maximum": 20},
                        "db_path": {"type": "string"},
                        "tag_normalize_enabled": {"type": "boolean"},
                    },
                    "anyOf": [{"required": ["queries"]}, {"required": ["shots"]}],
                    "additionalProperties": False,
                },
                output_schema={
                    "type": "object",
                    "properties": {
                        "results": {"type": "object"},
                        "stats": {"type": "object"},
                        "tool_version": {"type": "string"},
                        "tool_hash": {"type": "string"},
                    },
                    "required": ["results", "stats", "tool_version", "tool_hash"],
                    "additionalProperties": True,
                },
                annotations={"readOnlyHint": True, "idempotentHint": True, "destructiveHint": False},
            ),
            _handle_asset_match,
        ),
        (
            AgentToolSpec(
                name="comfyui_text2img",
                description="Generate an image via the local ComfyUI text-to-image workflow.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "prompt": {"type": "string"},
                        "size": {"type": "string"},
                        "aspect_ratio": {"type": "string"},
                        "seed": {"type": "integer"},
                        "filename_prefix": {"type": "string"},
                    },
                    "required": ["prompt"],
                    "additionalProperties": False,
                },
                output_schema={
                    "type": "object",
                    "properties": {
                        "image": {"type": "string"},
                        "model": {"type": "string"},
                        "width": {"type": "integer"},
                        "height": {"type": "integer"},
                        "tool_version": {"type": "string"},
                        "tool_hash": {"type": "string"},
                    },
                    "required": ["image", "model", "width", "height", "tool_version", "tool_hash"],
                    "additionalProperties": True,
                },
                annotations={"readOnlyHint": False, "idempotentHint": False, "destructiveHint": False},
            ),
            _handle_comfyui_text2img,
        ),
        (
            AgentToolSpec(
                name="comfyui_local_img2video",
                description="Generate a video from a source image via the local Qwen I2V ComfyUI workflow.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "image": {"type": "string"},
                        "prompt": {"type": "string"},
                        "negative_prompt": {"type": "string"},
                        "width": {"type": "integer", "minimum": 64},
                        "height": {"type": "integer", "minimum": 64},
                        "fps": {"type": "integer", "minimum": 1, "maximum": 60},
                        "duration": {"type": "integer", "minimum": 1, "maximum": 20},
                        "seed": {"type": "integer"},
                        "filename_prefix": {"type": "string"},
                    },
                    "required": ["image"],
                    "additionalProperties": False,
                },
                output_schema={
                    "type": "object",
                    "properties": {
                        "video": {"type": "string"},
                        "mime_type": {"type": "string"},
                        "model": {"type": "string"},
                        "width": {"type": "integer"},
                        "height": {"type": "integer"},
                        "fps": {"type": "integer"},
                        "duration": {"type": "integer"},
                        "tool_version": {"type": "string"},
                        "tool_hash": {"type": "string"},
                    },
                    "required": ["video", "mime_type", "model", "width", "height", "fps", "duration", "tool_version", "tool_hash"],
                    "additionalProperties": True,
                },
                annotations={"readOnlyHint": False, "idempotentHint": False, "destructiveHint": False},
            ),
            _handle_comfyui_local_img2video,
        ),
        (
            AgentToolSpec(
                name="comfyui_rmbg",
                description="Remove image background via the local ComfyUI RMBG workflow.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "image": {"type": "string"},
                        "size": {"type": "string"},
                        "aspect_ratio": {"type": "string"},
                    },
                    "required": ["image"],
                    "additionalProperties": False,
                },
                output_schema={
                    "type": "object",
                    "properties": {
                        "image": {"type": "string"},
                        "tool_version": {"type": "string"},
                        "tool_hash": {"type": "string"},
                    },
                    "required": ["image", "tool_version", "tool_hash"],
                    "additionalProperties": True,
                },
                annotations={"readOnlyHint": False, "idempotentHint": False, "destructiveHint": False},
            ),
            _handle_comfyui_rmbg,
        ),
        (
            AgentToolSpec(
                name="export_ffmpeg_render_bundle",
                description="Save an edit plan as an FFmpeg render bundle.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "plan_id": {"type": "string"},
                        "plan": {"type": "object"},
                        "out_dir": {"type": "string"},
                        "resolution": {
                            "type": "object",
                            "properties": {
                                "w": {"type": "integer", "minimum": 64},
                                "h": {"type": "integer", "minimum": 64},
                            },
                            "required": ["w", "h"],
                            "additionalProperties": False,
                        },
                        "fps": {"type": "integer", "minimum": 1, "maximum": 120},
                    },
                    "anyOf": [{"required": ["plan_id"]}, {"required": ["plan"]}],
                    "additionalProperties": False,
                },
                output_schema={
                    "type": "object",
                    "properties": {
                        "bundle_dir": {"type": "string"},
                        "files": {"type": "array", "items": {"type": "string"}},
                        "render_script_path": {"type": "string"},
                        "concat_list_path": {"type": "string"},
                        "edit_plan_path": {"type": "string"},
                        "missing_primary_asset_count": {"type": "integer"},
                        "warnings": {"type": "array", "items": {"type": "string"}},
                        "tool_version": {"type": "string"},
                        "tool_hash": {"type": "string"},
                    },
                    "required": [
                        "bundle_dir",
                        "files",
                        "render_script_path",
                        "concat_list_path",
                        "edit_plan_path",
                        "missing_primary_asset_count",
                        "warnings",
                        "tool_version",
                        "tool_hash",
                    ],
                    "additionalProperties": True,
                },
                annotations={"readOnlyHint": False, "idempotentHint": True, "destructiveHint": False},
            ),
            _handle_export_ffmpeg_bundle,
        ),
        (
            AgentToolSpec(
                name="harvest_eval_case",
                description="Harvest an eval case from an existing session.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "session_id": {"type": "string"},
                        "tenant_id": {"type": "string"},
                        "user_id": {"type": "string"},
                        "out_dir": {"type": "string"},
                        "reason": {"type": "string"},
                        "include_trajectory": {"type": "boolean"},
                        "provenance": {"type": "object"},
                    },
                    "required": ["session_id", "tenant_id", "user_id", "reason"],
                    "additionalProperties": False,
                },
                output_schema={
                    "type": "object",
                    "properties": {
                        "case_id": {"type": "string"},
                        "output_path": {"type": "string"},
                        "written": {"type": "boolean"},
                        "bytes_written": {"type": "integer"},
                        "dedup_key": {"type": "string"},
                        "tool_version": {"type": "string"},
                        "tool_hash": {"type": "string"},
                    },
                    "required": ["case_id", "output_path", "written", "bytes_written", "dedup_key", "tool_version", "tool_hash"],
                    "additionalProperties": True,
                },
                annotations={"readOnlyHint": False, "idempotentHint": True, "destructiveHint": False},
            ),
            _handle_harvest_eval_case,
        ),
        (
            AgentToolSpec(
                name="agent_chitchat",
                description="Answer general Bananaflow assistant chit-chat messages.",
                input_schema={
                    "type": "object",
                    "properties": {"message": {"type": "string"}},
                    "required": ["message"],
                    "additionalProperties": False,
                },
                output_schema={
                    "type": "object",
                    "properties": {
                        "text": {"type": "string"},
                        "model": {"type": "string"},
                        "tool_version": {"type": "string"},
                        "tool_hash": {"type": "string"},
                    },
                    "required": ["text", "model", "tool_version", "tool_hash"],
                    "additionalProperties": True,
                },
                annotations={"readOnlyHint": True, "idempotentHint": False, "destructiveHint": False},
            ),
            _handle_agent_chitchat,
        ),
    ]


def _handle_prompt_polish(args: Dict[str, Any], context: AgentToolContext) -> Dict[str, Any]:
    prompt = str(args.get("prompt") or "").strip()
    mode = str(args.get("mode") or "text2img").strip() or "text2img"
    payload = ollama_prompt_polish(prompt, mode=mode, req_id=f"prompt_polish:{context.req_id}")
    text = str(payload.get("text") or "").strip()
    if not text:
        raise RuntimeError("prompt_polish returned empty response")
    return {
        "text": text,
        "model": MODEL_PROMPT_POLISH,
        "variants": list(payload.get("variants") or []),
    }


def _handle_drama_generate(args: Dict[str, Any], context: AgentToolContext) -> Dict[str, Any]:
    req = AgentDramaRequest.model_validate(args)
    client = DramaCreatorClient()
    payload = client.generate(
        prompt=str(req.prompt or "").strip(),
        task_mode=str(req.task_mode or "").strip(),
        episode_count=req.episode_count,
        existing_script=str(req.existing_script or "").strip(),
    )
    return {
        "text": str(payload.get("text") or "").strip(),
        "summary": str(payload.get("summary") or "").strip(),
        "model": str(payload.get("model") or client.model).strip(),
        "mode": str(req.task_mode or "").strip(),
    }


def _handle_idea_script_generate(args: Dict[str, Any], context: AgentToolContext) -> Dict[str, Any]:
    req = IdeaScriptRequest.model_validate(args)
    response = idea_script_orchestrator.run(
        req,
        session_id=context.session_id,
        session_summary_present=context.session_summary_present,
        tenant_id=context.tenant_id,
        user_id=context.user_id,
        trajectory_sink=context.trajectory_sink,
        trace_sink=context.trace_sink,
    )
    return response.model_dump(mode="json")


def _handle_asset_match(args: Dict[str, Any], context: AgentToolContext) -> Dict[str, Any]:
    return execute_asset_match_tool(arguments=args)


def _handle_comfyui_text2img(args: Dict[str, Any], context: AgentToolContext) -> Dict[str, Any]:
    width, height = _parse_dimensions(str(args.get("size") or ""), str(args.get("aspect_ratio") or ""))
    image_bytes = run_image_z_image_turbo_workflow(
        req_id=context.req_id,
        prompt=str(args.get("prompt") or "").strip(),
        width=width,
        height=height,
        seed=args.get("seed"),
        filename_prefix=(str(args.get("filename_prefix") or "").strip() or None),
    )
    return {
        "image": bytes_to_data_url(image_bytes),
        "model": "comfyui-z-image-turbo",
        "width": width,
        "height": height,
    }


def _handle_comfyui_local_img2video(args: Dict[str, Any], context: AgentToolContext) -> Dict[str, Any]:
    _, image_bytes = parse_data_url(str(args.get("image") or ""))
    fps = max(1, int(args.get("fps") or 16))
    duration = max(1, int(args.get("duration") or 5))
    width = max(64, int(args.get("width") or 640))
    height = max(64, int(args.get("height") or 640))
    length = max(1, min(321, duration * fps + 1))
    video_bytes, mime_type = run_qwen_i2v_workflow(
        req_id=context.req_id,
        image_bytes=image_bytes,
        positive_prompt=str(args.get("prompt") or "natural motion").strip() or "natural motion",
        negative_prompt=(str(args.get("negative_prompt") or "").strip() or None),
        width=width,
        height=height,
        length=length,
        fps=fps,
        seed=args.get("seed"),
        filename_prefix=(str(args.get("filename_prefix") or "").strip() or f"local/qwen-i2v-{context.req_id}"),
    )
    return {
        "video": bytes_to_data_url(video_bytes, mime_type=mime_type),
        "mime_type": mime_type,
        "model": MODEL_COMFYUI_QWEN_I2V,
        "width": width,
        "height": height,
        "fps": fps,
        "duration": duration,
    }


def _handle_comfyui_rmbg(args: Dict[str, Any], context: AgentToolContext) -> Dict[str, Any]:
    image_bytes = run_rmbg_workflow(
        req_id=context.req_id,
        image_data_url=str(args.get("image") or ""),
        size=(str(args.get("size") or "").strip() or None),
        aspect_ratio=(str(args.get("aspect_ratio") or "").strip() or None),
    )
    return {"image": bytes_to_data_url(image_bytes)}


def _handle_export_ffmpeg_bundle(args: Dict[str, Any], context: AgentToolContext) -> Dict[str, Any]:
    return execute_export_ffmpeg_tool(arguments=args, plan_lookup=context.plan_lookup)


def _handle_harvest_eval_case(args: Dict[str, Any], context: AgentToolContext) -> Dict[str, Any]:
    result = harvest_eval_case(
        session_id=str(args.get("session_id") or "").strip(),
        tenant_id=str(args.get("tenant_id") or "").strip(),
        user_id=str(args.get("user_id") or "").strip(),
        out_dir=(str(args.get("out_dir") or "").strip() or None),
        reason=str(args.get("reason") or "").strip(),
        include_trajectory=bool(args.get("include_trajectory", True)),
        provenance=dict(args.get("provenance") or {}),
    )
    return {
        "case_id": result.case_id,
        "output_path": result.output_path,
        "written": bool(result.written),
        "bytes_written": int(result.bytes_written),
        "dedup_key": result.dedup_key,
    }


def _handle_agent_chitchat(args: Dict[str, Any], context: AgentToolContext) -> Dict[str, Any]:
    prompt = _build_agent_chitchat_prompt(str(args.get("message") or ""))
    response = call_genai_retry_with_proxy(
        contents=[types.Part(text=prompt)],
        config=types.GenerateContentConfig(temperature=0.7),
        req_id=f"agent_chitchat:{context.req_id}",
        model=MODEL_AGENT_CHAT,
        http_proxy=AGENT_CHAT_HTTP_PROXY,
        https_proxy=AGENT_CHAT_HTTPS_PROXY,
    )
    text = str(getattr(response, "text", "") or "").strip()
    if not text:
        text = "我在。你可以继续告诉我你想聊什么，或者直接让我做脚本、短剧、导出。"
    return {"text": text, "model": MODEL_AGENT_CHAT}


def register_builtin_tools(registry: AgentToolRegistry) -> AgentToolRegistry:
    registry.register_many(_tool_specs())
    return registry


@lru_cache(maxsize=1)
def build_builtin_registry() -> AgentToolRegistry:
    return register_builtin_tools(AgentToolRegistry())


@lru_cache(maxsize=1)
def build_builtin_executor() -> AgentToolExecutor:
    return AgentToolExecutor(build_builtin_registry())
