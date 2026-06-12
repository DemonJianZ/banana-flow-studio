"""
agent/tools/executor.py — Tool dispatcher and implementations.

生图/生视频优先走 /api/ai_chat_image_via_curl（AiChat 会员平台），
需要 member_authorization；没有时降级到 Gemini 或 ComfyUI。
"""
from __future__ import annotations

import asyncio
import base64
import os
import time
import uuid
from typing import TYPE_CHECKING, Any, Dict, Optional

try:
    from ...core.logging import sys_logger
    from ...core.config import COMFYUI_URL
except ImportError:
    from core.logging import sys_logger
    from core.config import COMFYUI_URL

from ..stream import push_progress
from .image_params import get_model_by_id

if TYPE_CHECKING:
    from ..graph.state import AgentState

# ── AiChat 枚举常量（和画布工作台保持一致）──────────────────────────────────────
_MODULE_ENUM = "3"
_PART_ENUM_TEXT2IMG  = "203"
_PART_ENUM_IMG2VIDEO = "204"

# 轮询参数
_POLL_INTERVAL_INIT = 2.0    # 初始间隔(s)
_POLL_INTERVAL_MAX  = 5.0    # 最大间隔(s)
_POLL_BACKOFF       = 1.25   # 每次增长倍数
_POLL_TIMEOUT       = 180    # 总超时(s)


def _internal_base() -> str:
    """后端自身的 base URL，供内部 HTTP 调用。"""
    port = os.getenv("PORT", "8082")
    return f"http://127.0.0.1:{port}"


# ── Dispatcher ─────────────────────────────────────────────────────────────────

async def execute_tool(tool_name: str, args: Dict[str, Any], state: "AgentState") -> Dict[str, Any]:
    try:
        if tool_name == "generate_image":
            return await _generate_image(args, state)
        if tool_name == "remove_background":
            return await _remove_background(args, state)
        if tool_name == "generate_video":
            return await _generate_video(args, state)
        if tool_name == "create_storyboard":
            return await _create_storyboard(args, state)
        return {"ok": False, "error": f"未知工具: {tool_name}"}
    except Exception as e:
        sys_logger.exception(f"[tool_executor] tool={tool_name} unhandled error: {e}")
        return {"ok": False, "error": str(e)}


# ── generate_image ─────────────────────────────────────────────────────────────

async def _generate_image(args: Dict[str, Any], state: "AgentState") -> Dict[str, Any]:
    """
    按用户选择的 model_id 路由到对应的生图服务：
      aichat_pro  → AiChat 精品模型（需 member_authorization）
      aichat_std  → AiChat 标准模型（需 member_authorization）
      doubao      → 豆包·Seedream（Ark 直调）
      comfyui     → ComfyUI 本地极速
    """
    prompt = str(args.get("prompt") or "").strip()
    if not prompt:
        return {"ok": False, "error": "prompt 不能为空"}

    model_id = str(args.get("model_id") or "aichat_std").strip()
    style    = str(args.get("style") or "商业白底")
    ratio    = str(args.get("ratio") or "1:1")
    size     = str(args.get("size") or "1024x1024")
    full_prompt = _enrich_prompt(prompt, style)

    member_auth = str(state.get("member_authorization") or "").strip()
    model_def = get_model_by_id(model_id)

    # ── 本地固定路由（image_params.py 里的备用模型名）─────────────────────────
    if model_id == "doubao":
        await push_progress(f"使用「豆包·Seedream」生成中…")
        return await asyncio.to_thread(_call_doubao_image, full_prompt, ratio, size)

    if model_id == "comfyui":
        if not COMFYUI_URL:
            return {"ok": False, "error": "本地模型未启动，请先运行 ComfyUI。"}
        await push_progress(f"使用「本地极速」生成中…")
        return await asyncio.to_thread(_call_comfyui_text2img, full_prompt, ratio)

    # ── AiChat 平台（精品 / 标准 / 真实数字 ID）─────────────────────────────────
    # 凡是不匹配上面本地路由的 model_id，都视为 AiChat 平台模型，
    # 透传 ai_chat_model_id（前端传来的真实 ID 如 "4"、"13" 等均在此处理）
    if not member_auth:
        return {"ok": False, "error": "此模型需要会员授权，请先登录。"}

    # 精品模型：优先用环境变量 AI_CHAT_MODEL_ID_NANO_BANANA_PRO，其次用传入 ID
    if model_id == "aichat_pro":
        real_id = str(os.getenv("AI_CHAT_MODEL_ID_NANO_BANANA_PRO") or "").strip()
    else:
        # aichat_std 或任何真实数字 ID（如 "4"、"13"）
        real_id = "" if model_id == "aichat_std" else model_id

    label = model_def.get("label") or f"模型 {model_id}"
    await push_progress(f"使用「{label}」生成中…")
    return await _aichat_submit_and_poll(
        part_enum=_PART_ENUM_TEXT2IMG,
        message=full_prompt,
        authorization=member_auth,
        extra_form={"ai_chat_model_id": real_id} if real_id else {},
    )


def _enrich_prompt(prompt: str, style: str) -> str:
    style_map = {
        "商业白底": "product photography, pure white background, professional studio lighting, sharp focus, e-commerce style",
        "生活场景": "lifestyle photography, natural lighting, warm atmosphere, scene composition",
        "艺术风格": "artistic illustration, creative composition, vibrant colors",
        "产品特写": "macro photography, product close-up, detail shot, high resolution",
    }
    suffix = style_map.get(style, "")
    if suffix and suffix.lower() not in prompt.lower():
        return f"{prompt}, {suffix}"
    return prompt


# ── generate_video ─────────────────────────────────────────────────────────────

async def _generate_video(args: Dict[str, Any], state: "AgentState") -> Dict[str, Any]:
    """
    通过 AiChat 平台图生视频 (part_enum=204)。
    需要 member_authorization 和一张输入图片。
    """
    member_auth = str(state.get("member_authorization") or "").strip()
    if not member_auth:
        return {
            "ok": False,
            "error": "视频生成需要会员授权（member_authorization），请先登录会员平台。",
        }

    # 取输入图片：优先 args.image_url，其次上传的附件
    image_url = str(args.get("image_url") or "").strip()
    if not image_url:
        for doc in (state.get("uploaded_documents") or []):
            if doc.get("file_type") == "image" and doc.get("data_url"):
                image_url = doc["data_url"]
                break

    if not image_url:
        return {"ok": False, "error": "生成视频需要提供一张图片，请先上传图片。"}

    prompt  = str(args.get("prompt") or "画面轻微晃动，商品保持静止。").strip()
    duration = int(args.get("duration") or 5)
    ratio    = str(args.get("ratio") or "9:16")

    await push_progress("提交视频生成任务…")
    result = await _aichat_submit_and_poll(
        part_enum=_PART_ENUM_IMG2VIDEO,
        message=prompt,
        authorization=member_auth,
        images=[image_url],
        extra_form={
            # 时长和比例参数 — 服务器会用默认值处理未传的 param_id
        },
    )
    return result


# ── AiChat 通用：提交 + 轮询 ────────────────────────────────────────────────────

async def _aichat_submit_and_poll(
    *,
    part_enum: str,
    message: str,
    authorization: str,
    images: Optional[list] = None,
    extra_form: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    向 /api/ai_chat_image_via_curl 提交任务，然后轮询直到完成。
    通过 push_progress 向 SSE 流发送进度事件。
    """
    import httpx

    base = _internal_base()
    submit_url = f"{base}/api/ai_chat_image_via_curl"

    payload: Dict[str, Any] = {
        "module_enum": _MODULE_ENUM,
        "part_enum":   part_enum,
        "message":     message,
        "authorization": authorization,
    }
    if images:
        payload["images"] = images
    if extra_form:
        payload.update(extra_form)

    # ── 提交 ──────────────────────────────────────────────────────────────────
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(submit_url, json=payload)
            resp.raise_for_status()
            submit_data = resp.json()
    except Exception as e:
        return {"ok": False, "error": f"任务提交失败: {e}"}

    task_id = submit_data.get("task_id")
    if not task_id:
        return {"ok": False, "error": f"任务提交失败（未返回 task_id）: {submit_data}"}

    sys_logger.info(f"[aichat_poll] task_id={task_id} part_enum={part_enum}")

    # ── 轮询 ──────────────────────────────────────────────────────────────────
    poll_url      = f"{base}/api/ai_chat_image_via_curl/{task_id}"
    deadline      = time.time() + _POLL_TIMEOUT
    interval      = _POLL_INTERVAL_INIT
    elapsed_label = 0

    async with httpx.AsyncClient(timeout=15.0) as client:
        while time.time() < deadline:
            await asyncio.sleep(interval)
            elapsed_label += int(interval)
            interval = min(interval * _POLL_BACKOFF, _POLL_INTERVAL_MAX)

            try:
                poll_resp = await client.get(poll_url)
                poll_resp.raise_for_status()
                poll_data = poll_resp.json()
            except Exception as e:
                sys_logger.warning(f"[aichat_poll] task={task_id} poll error: {e}")
                continue

            status = str(poll_data.get("status") or "").upper()

            if status == "SUCCESS":
                result = poll_data.get("result") or {}
                url = (
                    result.get("image_url")
                    or result.get("video_url")
                    or result.get("url")
                    or ""
                )
                if not url:
                    return {"ok": False, "error": "任务成功但未返回媒体 URL"}
                media_type = "video" if result.get("video_url") else "image"
                return {"ok": True, "url": url, "media_type": media_type, "source": "aichat", "task_id": task_id}

            if status in ("FAILED", "TIMEOUT", "CANCELLED"):
                err = poll_data.get("error") or f"任务状态: {status}"
                return {"ok": False, "error": err}

            # 还在运行，推送进度
            progress_msg = str(poll_data.get("progress_message") or "处理中…")
            await push_progress(f"{progress_msg}（已等待 {elapsed_label}s）")

    return {"ok": False, "error": f"轮询超时（{_POLL_TIMEOUT}s），task_id={task_id}"}


# ── remove_background ──────────────────────────────────────────────────────────

async def _remove_background(args: Dict[str, Any], state: "AgentState") -> Dict[str, Any]:
    image_url = str(args.get("image_url") or "").strip()
    if not image_url:
        for doc in (state.get("uploaded_documents") or []):
            if doc.get("file_type") == "image" and doc.get("data_url"):
                image_url = doc["data_url"]
                break

    if not image_url:
        return {"ok": False, "error": "未找到要处理的图片，请先上传一张图片。"}

    return await asyncio.to_thread(_call_comfyui_rmbg, image_url)


def _call_comfyui_rmbg(image_url: str) -> Dict[str, Any]:
    try:
        from services.comfyui import run_rmbg_workflow

        if image_url.startswith("data:"):
            data_url = image_url
        else:
            import httpx
            resp = httpx.get(image_url, timeout=30)
            resp.raise_for_status()
            mime = resp.headers.get("content-type", "image/png").split(";")[0]
            b64 = base64.b64encode(resp.content).decode()
            data_url = f"data:{mime};base64,{b64}"

        req_id = uuid.uuid4().hex[:8]
        output_bytes: bytes = run_rmbg_workflow(req_id=req_id, image_data_url=data_url)

        if not output_bytes:
            return {"ok": False, "error": "ComfyUI RMBG 未返回结果"}

        b64 = base64.b64encode(output_bytes).decode()
        result_data_url = f"data:image/png;base64,{b64}"
        return {"ok": True, "url": result_data_url, "data_url": result_data_url, "source": "comfyui_rmbg"}
    except Exception as e:
        return {"ok": False, "error": f"RMBG: {e}"}


# ── 豆包·Seedream ──────────────────────────────────────────────────────────────

def _call_doubao_image(prompt: str, ratio: str, size: str) -> Dict[str, Any]:
    """Synchronous Doubao Seedream image generation via Ark SDK."""
    try:
        from services.ark import call_doubao_image_gen

        img_bytes = call_doubao_image_gen(
            prompt=prompt,
            size=size,
        )
        if not img_bytes:
            return {"ok": False, "error": "豆包未返回图片"}

        b64 = base64.b64encode(img_bytes).decode()
        data_url = f"data:image/jpeg;base64,{b64}"
        return {"ok": True, "url": data_url, "data_url": data_url, "source": "doubao", "prompt": prompt}
    except Exception as e:
        return {"ok": False, "error": f"豆包: {e}"}


# ── ComfyUI text2img (fallback) ────────────────────────────────────────────────

def _call_comfyui_text2img(prompt: str, ratio: str) -> Dict[str, Any]:
    try:
        from services.comfyui import run_image_z_image_turbo_workflow

        wh_map = {
            "1:1": (1024, 1024), "16:9": (1344, 768), "9:16": (768, 1344),
            "4:3": (1152, 896),  "3:4": (896, 1152),
        }
        width, height = wh_map.get(ratio, (1024, 1024))
        result = run_image_z_image_turbo_workflow(prompt=prompt, width=width, height=height)
        if not result or not result.get("image_url"):
            return {"ok": False, "error": "ComfyUI 未返回图片"}

        return {"ok": True, "url": result["image_url"], "data_url": result.get("data_url"),
                "width": width, "height": height, "source": "comfyui"}
    except Exception as e:
        return {"ok": False, "error": f"ComfyUI: {e}"}


# ── create_storyboard (Phase 3) ────────────────────────────────────────────────

async def _create_storyboard(args: Dict[str, Any], state: "AgentState") -> Dict[str, Any]:
    return {"ok": False, "error": "分镜生成功能将在 Phase 3 接入 Agent，目前请在 GeminiChat 页面使用。"}
