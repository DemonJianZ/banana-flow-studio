from __future__ import annotations

from functools import lru_cache
from typing import Any, Dict, List, Tuple

from .executor import AgentToolContext, AgentToolExecutor
from .registry import AgentToolRegistry
from .specs import AgentToolSpec


def _parse_dimensions(size: str | None, ratio: str | None) -> Tuple[int, int]:
    calculate_target_resolution = _load_calculate_target_resolution()
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


def _load_config():
    try:
        from ...core.config import (
            AGENT_CHAT_HTTP_PROXY,
            AGENT_CHAT_HTTPS_PROXY,
            MODEL_AGENT_CHAT,
            MODEL_COMFYUI_QWEN_I2V,
            MODEL_PROMPT_POLISH,
        )
    except Exception:  # pragma: no cover
        from core.config import (
            AGENT_CHAT_HTTP_PROXY,
            AGENT_CHAT_HTTPS_PROXY,
            MODEL_AGENT_CHAT,
            MODEL_COMFYUI_QWEN_I2V,
            MODEL_PROMPT_POLISH,
        )
    return {
        "AGENT_CHAT_HTTP_PROXY": AGENT_CHAT_HTTP_PROXY,
        "AGENT_CHAT_HTTPS_PROXY": AGENT_CHAT_HTTPS_PROXY,
        "MODEL_AGENT_CHAT": MODEL_AGENT_CHAT,
        "MODEL_COMFYUI_QWEN_I2V": MODEL_COMFYUI_QWEN_I2V,
        "MODEL_PROMPT_POLISH": MODEL_PROMPT_POLISH,
    }


def _load_ollama_prompt_polish():
    try:
        from ...prompts.refine import ollama_prompt_polish
    except Exception:  # pragma: no cover
        from prompts.refine import ollama_prompt_polish
    return ollama_prompt_polish


def _load_call_genai_retry_with_proxy():
    try:
        from ...services.genai_client import call_genai_retry_with_proxy
    except Exception:  # pragma: no cover
        from services.genai_client import call_genai_retry_with_proxy
    return call_genai_retry_with_proxy


def _load_ai_chat_text_client():
    try:
        from ...services.ai_chat_client import call_ai_chat_text
    except Exception:  # pragma: no cover
        from services.ai_chat_client import call_ai_chat_text
    return call_ai_chat_text


def _load_comfyui_functions():
    try:
        from ...services.comfyui import (
            run_image_z_image_turbo_workflow,
            run_qwen_i2v_workflow,
            run_rmbg_workflow,
        )
    except Exception:  # pragma: no cover
        from services.comfyui import (
            run_image_z_image_turbo_workflow,
            run_qwen_i2v_workflow,
            run_rmbg_workflow,
        )
    return run_image_z_image_turbo_workflow, run_qwen_i2v_workflow, run_rmbg_workflow


def _load_media_utils():
    try:
        from ...utils.images import bytes_to_data_url, parse_data_url
    except Exception:  # pragma: no cover
        from utils.images import bytes_to_data_url, parse_data_url
    return bytes_to_data_url, parse_data_url


def _load_calculate_target_resolution():
    try:
        from ...utils.size import calculate_target_resolution
    except Exception:  # pragma: no cover
        from utils.size import calculate_target_resolution
    return calculate_target_resolution


def _load_asset_match_tool():
    try:
        from ...mcp.tool_asset_match import execute_asset_match_tool
    except Exception:  # pragma: no cover
        from mcp.tool_asset_match import execute_asset_match_tool
    return execute_asset_match_tool


def _load_harvest_eval_case():
    try:
        from ...quality.harvester import harvest_eval_case
    except Exception:  # pragma: no cover
        from quality.harvester import harvest_eval_case
    return harvest_eval_case


def _load_retrieval_service():
    try:
        from ...retrieval.service import build_default_retrieval_service
    except Exception:  # pragma: no cover
        from retrieval.service import build_default_retrieval_service
    return build_default_retrieval_service


def _load_storyboard_components():
    try:
        from ...agent_v2.storyboard import design_storyboard
    except Exception:  # pragma: no cover
        from agent_v2.storyboard import design_storyboard
    return design_storyboard


def _load_google_types():
    try:
        from google.genai import types
        return types
    except Exception:  # pragma: no cover
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

        return _FallbackTypes()


def _tool_specs() -> List[Tuple[AgentToolSpec, Any]]:
    return [
        (
            AgentToolSpec(
                name="agent_prompt_polish",
                description="Polish a creative prompt for image or video generation.",
                aliases=["prompt.polish"],
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
                category="prompt",
                timeout_seconds=30.0,
                retry={"max_attempts": 2},
                cost_level="low",
                tags=["prompt", "polish", "agent"],
            ),
            _handle_prompt_polish,
        ),
        (
            AgentToolSpec(
                name="agent_storyboard_design",
                description="Design a structured storyboard plan from a creative brief.",
                aliases=["storyboard.design"],
                input_schema={
                    "type": "object",
                    "properties": {
                        "brief": {"type": "string"},
                        "style": {"type": "string"},
                        "aspect_ratio": {"type": "string"},
                        "target_duration_sec": {"type": "number", "minimum": 1},
                        "shot_duration_sec": {"type": "number", "minimum": 0.5},
                        "language": {"type": "string"},
                        "constraints": {"type": "array", "items": {"type": "string"}},
                        "script_table": {"type": "string"},
                        "script_table_name": {"type": "string"},
                        "script_rows": {"type": "array", "items": {"type": "object"}},
                    },
                    "required": ["brief"],
                    "additionalProperties": False,
                },
                output_schema={
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "aspect_ratio": {"type": "string"},
                        "style": {"type": "string"},
                        "target_duration_sec": {"type": "number"},
                        "estimated_duration_sec": {"type": "number"},
                        "shot_default_duration_sec": {"type": "number"},
                        "entities": {"type": "object"},
                        "scenes": {"type": "array", "items": {"type": "object"}},
                        "global_notes": {"type": "array", "items": {"type": "string"}},
                        "design_rationale": {"type": "string"},
                        "warnings": {"type": "array", "items": {"type": "string"}},
                        "tool_version": {"type": "string"},
                        "tool_hash": {"type": "string"},
                    },
                    "required": [
                        "title",
                        "aspect_ratio",
                        "style",
                        "target_duration_sec",
                        "estimated_duration_sec",
                        "shot_default_duration_sec",
                        "entities",
                        "scenes",
                        "global_notes",
                        "design_rationale",
                        "tool_version",
                        "tool_hash",
                    ],
                    "additionalProperties": True,
                },
                annotations={"readOnlyHint": True, "idempotentHint": False, "destructiveHint": False},
                category="storyboard",
                timeout_seconds=90.0,
                retry={"max_attempts": 1},
                cost_level="medium",
                tags=["storyboard", "creative", "agent"],
            ),
            _handle_storyboard_design,
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
                category="assets",
                timeout_seconds=10.0,
                retry={"max_attempts": 1},
                cost_level="low",
                tags=["assets", "search", "deterministic"],
            ),
            _handle_asset_match,
        ),
        (
            AgentToolSpec(
                name="retrieval_search_assets",
                description="Search indexed assets through the retrieval layer.",
                aliases=["retrieval.search_assets"],
                input_schema={
                    "type": "object",
                    "properties": {
                        "query": {"type": "string"},
                        "top_k": {"type": "integer", "minimum": 1, "maximum": 20},
                        "db_path": {"type": "string"},
                        "tag_normalize_enabled": {"type": "boolean"},
                        "filters": {"type": "object"},
                    },
                    "required": ["query"],
                    "additionalProperties": False,
                },
                output_schema={
                    "type": "object",
                    "properties": {
                        "collection": {"type": "string"},
                        "query": {"type": "string"},
                        "items": {"type": "array", "items": {"type": "object"}},
                        "tool_version": {"type": "string"},
                        "tool_hash": {"type": "string"},
                    },
                    "required": ["collection", "query", "items", "tool_version", "tool_hash"],
                    "additionalProperties": True,
                },
                annotations={"readOnlyHint": True, "idempotentHint": True, "destructiveHint": False},
                category="retrieval",
                timeout_seconds=10.0,
                retry={"max_attempts": 1},
                cost_level="low",
                tags=["retrieval", "assets", "search"],
            ),
            _handle_retrieval_search_assets,
        ),
        (
            AgentToolSpec(
                name="retrieval_search_knowledge",
                description="Search indexed knowledge through the retrieval layer.",
                aliases=["retrieval.search_knowledge"],
                input_schema={
                    "type": "object",
                    "properties": {
                        "query": {"type": "string"},
                        "top_k": {"type": "integer", "minimum": 1, "maximum": 20},
                        "filters": {"type": "object"},
                    },
                    "required": ["query"],
                    "additionalProperties": False,
                },
                output_schema={
                    "type": "object",
                    "properties": {
                        "collection": {"type": "string"},
                        "query": {"type": "string"},
                        "items": {"type": "array", "items": {"type": "object"}},
                        "tool_version": {"type": "string"},
                        "tool_hash": {"type": "string"},
                    },
                    "required": ["collection", "query", "items", "tool_version", "tool_hash"],
                    "additionalProperties": True,
                },
                annotations={"readOnlyHint": True, "idempotentHint": True, "destructiveHint": False},
                category="retrieval",
                timeout_seconds=10.0,
                retry={"max_attempts": 1},
                cost_level="low",
                tags=["retrieval", "knowledge", "search"],
            ),
            _handle_retrieval_search_knowledge,
        ),
        (
            AgentToolSpec(
                name="retrieval_search_eval_cases",
                description="Search harvested eval cases through the retrieval layer.",
                aliases=["retrieval.search_eval_cases"],
                input_schema={
                    "type": "object",
                    "properties": {
                        "query": {"type": "string"},
                        "top_k": {"type": "integer", "minimum": 1, "maximum": 20},
                        "filters": {"type": "object"},
                        "eval_cases_path": {"type": "string"},
                    },
                    "required": ["query"],
                    "additionalProperties": False,
                },
                output_schema={
                    "type": "object",
                    "properties": {
                        "collection": {"type": "string"},
                        "query": {"type": "string"},
                        "items": {"type": "array", "items": {"type": "object"}},
                        "tool_version": {"type": "string"},
                        "tool_hash": {"type": "string"},
                    },
                    "required": ["collection", "query", "items", "tool_version", "tool_hash"],
                    "additionalProperties": True,
                },
                annotations={"readOnlyHint": True, "idempotentHint": True, "destructiveHint": False},
                category="retrieval",
                timeout_seconds=10.0,
                retry={"max_attempts": 1},
                cost_level="low",
                tags=["retrieval", "eval", "search"],
            ),
            _handle_retrieval_search_eval_cases,
        ),
        (
            AgentToolSpec(
                name="comfyui_text2img",
                description="Generate an image via the local ComfyUI text-to-image workflow.",
                aliases=["comfyui.text2img"],
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
                category="comfyui",
                timeout_seconds=180.0,
                retry={"max_attempts": 1},
                cost_level="medium",
                tags=["comfyui", "image", "generation"],
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
                category="comfyui",
                timeout_seconds=300.0,
                retry={"max_attempts": 1},
                cost_level="high",
                tags=["comfyui", "video", "i2v"],
            ),
            _handle_comfyui_local_img2video,
        ),
        (
            AgentToolSpec(
                name="comfyui_rmbg",
                description="Remove image background via the local ComfyUI RMBG workflow.",
                aliases=["comfyui.rmbg"],
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
                category="comfyui",
                timeout_seconds=180.0,
                retry={"max_attempts": 1},
                cost_level="medium",
                tags=["comfyui", "image", "rmbg"],
            ),
            _handle_comfyui_rmbg,
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
                category="eval",
                timeout_seconds=15.0,
                retry={"max_attempts": 1},
                cost_level="low",
                tags=["eval", "harvest", "quality"],
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
                category="chat",
                timeout_seconds=30.0,
                retry={"max_attempts": 1},
                cost_level="low",
                tags=["chat", "assistant"],
            ),
            _handle_agent_chitchat,
        ),
    ]


def _handle_prompt_polish(args: Dict[str, Any], context: AgentToolContext) -> Dict[str, Any]:
    ollama_prompt_polish = _load_ollama_prompt_polish()
    config = _load_config()
    prompt = str(args.get("prompt") or "").strip()
    mode = str(args.get("mode") or "text2img").strip() or "text2img"
    payload = ollama_prompt_polish(prompt, mode=mode, req_id=f"prompt_polish:{context.req_id}")
    text = str(payload.get("text") or "").strip()
    if not text:
        raise RuntimeError("prompt_polish returned empty response")
    return {
        "text": text,
        "model": config["MODEL_PROMPT_POLISH"],
        "variants": list(payload.get("variants") or []),
    }


def _handle_asset_match(args: Dict[str, Any], context: AgentToolContext) -> Dict[str, Any]:
    execute_asset_match_tool = _load_asset_match_tool()
    return execute_asset_match_tool(arguments=args)


def _handle_retrieval_search_assets(args: Dict[str, Any], context: AgentToolContext) -> Dict[str, Any]:
    build_default_retrieval_service = _load_retrieval_service()
    service = (context.extra or {}).get("retrieval_service") or build_default_retrieval_service()
    return service.search_assets(
        str(args.get("query") or "").strip(),
        top_k=int(args.get("top_k") or 5),
        db_path=(str(args.get("db_path") or "").strip() or None),
        tag_normalize_enabled=args.get("tag_normalize_enabled"),
        filters=dict(args.get("filters") or {}),
    )


def _handle_retrieval_search_knowledge(args: Dict[str, Any], context: AgentToolContext) -> Dict[str, Any]:
    build_default_retrieval_service = _load_retrieval_service()
    service = (context.extra or {}).get("retrieval_service") or build_default_retrieval_service()
    return service.search_knowledge(
        str(args.get("query") or "").strip(),
        top_k=int(args.get("top_k") or 5),
        filters=dict(args.get("filters") or {}),
    )


def _handle_retrieval_search_eval_cases(args: Dict[str, Any], context: AgentToolContext) -> Dict[str, Any]:
    build_default_retrieval_service = _load_retrieval_service()
    service = (context.extra or {}).get("retrieval_service") or build_default_retrieval_service()
    return service.search_eval_cases(
        str(args.get("query") or "").strip(),
        top_k=int(args.get("top_k") or 5),
        filters=dict(args.get("filters") or {}),
        eval_cases_path=(str(args.get("eval_cases_path") or "").strip() or None),
    )


def _handle_storyboard_design(args: Dict[str, Any], context: AgentToolContext) -> Dict[str, Any]:
    design_storyboard = _load_storyboard_components()
    script_table = str(args.get("script_table") or "").strip()
    script_table_name = str(args.get("script_table_name") or "").strip()
    script_rows = [dict(item or {}) for item in list(args.get("script_rows") or []) if isinstance(item, dict)]
    if script_table and not script_rows:
        # Parse failed: fall back to brief-only rather than raising 500.
        # Coordinator may have passed a malformed/unrecognised table format.
        import logging as _logging
        _logging.getLogger(__name__).warning(
            "storyboard_script_table_parse_failed: %s — falling back to brief-only",
            script_table_name or "uploaded_script",
        )
        script_table = ""
        script_table_name = ""
    plan = design_storyboard(
        brief=str(args.get("brief") or "").strip(),
        style=str(args.get("style") or "").strip(),
        aspect_ratio=str(args.get("aspect_ratio") or "16:9").strip() or "16:9",
        target_duration_sec=float(args.get("target_duration_sec") or 30.0),
        shot_duration_sec=float(args.get("shot_duration_sec") or 4.0),
        language=str(args.get("language") or "zh-CN").strip() or "zh-CN",
        constraints=[str(item).strip() for item in list(args.get("constraints") or []) if str(item).strip()],
        script_table=script_table,
        script_table_name=script_table_name,
        script_rows=script_rows,
        trace_sink=context.trace_sink,
        req_id=context.req_id,
        run_id=str((context.extra or {}).get("run_id") or ""),
        authorization=str((context.extra or {}).get("member_authorization") or ""),
    )
    payload = plan.model_dump(mode="json")
    payload["script_source"] = "script_table" if script_rows else "brief"
    payload["script_row_count"] = len(script_rows)
    payload["script_table_name"] = script_table_name
    return payload


def _handle_comfyui_text2img(args: Dict[str, Any], context: AgentToolContext) -> Dict[str, Any]:
    run_image_z_image_turbo_workflow, _, _ = _load_comfyui_functions()
    bytes_to_data_url, _ = _load_media_utils()
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
    _, run_qwen_i2v_workflow, _ = _load_comfyui_functions()
    bytes_to_data_url, parse_data_url = _load_media_utils()
    config = _load_config()
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
        "model": config["MODEL_COMFYUI_QWEN_I2V"],
        "width": width,
        "height": height,
        "fps": fps,
        "duration": duration,
    }


def _handle_comfyui_rmbg(args: Dict[str, Any], context: AgentToolContext) -> Dict[str, Any]:
    _, run_rmbg_workflow, = _load_comfyui_functions()[1:]
    bytes_to_data_url, _ = _load_media_utils()
    image_bytes = run_rmbg_workflow(
        req_id=context.req_id,
        image_data_url=str(args.get("image") or ""),
        size=(str(args.get("size") or "").strip() or None),
        aspect_ratio=(str(args.get("aspect_ratio") or "").strip() or None),
    )
    return {"image": bytes_to_data_url(image_bytes)}


def _handle_harvest_eval_case(args: Dict[str, Any], context: AgentToolContext) -> Dict[str, Any]:
    harvest_eval_case = _load_harvest_eval_case()
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
    config = _load_config()
    prompt = _build_agent_chitchat_prompt(str(args.get("message") or ""))
    authorization = str((context.extra or {}).get("member_authorization") or "").strip()
    text = ""
    model_name = "gemini-3-flash"
    if authorization:
        try:
            text = _load_ai_chat_text_client()(message=prompt, authorization=authorization).text
        except Exception:
            text = ""
    if not text:
        types = _load_google_types()
        call_genai_retry_with_proxy = _load_call_genai_retry_with_proxy()
        response = call_genai_retry_with_proxy(
            contents=[types.Part(text=prompt)],
            config=types.GenerateContentConfig(temperature=0.7),
            req_id=f"agent_chitchat:{context.req_id}",
            model=config["MODEL_AGENT_CHAT"],
            http_proxy=config["AGENT_CHAT_HTTP_PROXY"],
            https_proxy=config["AGENT_CHAT_HTTPS_PROXY"],
        )
        text = str(getattr(response, "text", "") or "").strip()
        model_name = config["MODEL_AGENT_CHAT"]
    if not text:
        text = "我在。你可以继续告诉我你想聊什么，或者直接让我做脚本、短剧、导出。"
    return {"text": text, "model": model_name}


def register_builtin_tools(registry: AgentToolRegistry) -> AgentToolRegistry:
    registry.register_many(_tool_specs())
    return registry


@lru_cache(maxsize=1)
def build_builtin_registry() -> AgentToolRegistry:
    return register_builtin_tools(AgentToolRegistry())


@lru_cache(maxsize=1)
def build_builtin_executor() -> AgentToolExecutor:
    return AgentToolExecutor(build_builtin_registry())
