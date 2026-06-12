"""
nodes/execute_tool.py — Tool execution node.

Dispatches to the tool executor and pushes tool_start / tool_result events
to the SSE stream so the frontend can show live progress.
"""
from __future__ import annotations

import time
from typing import Any, Dict

try:
    from ....core.logging import sys_logger
except ImportError:
    from core.logging import sys_logger

from ..state import AgentState
from ...stream import push_token, push_tool_start, push_tool_result, push_param_form
from ...tools.executor import execute_tool
from ...tools.image_params import IMAGE_MODELS as _FALLBACK_MODELS, RATIO_OPTIONS, SIZE_OPTIONS

# Human-readable labels for the "tool running…" indicator
_TOOL_LABELS: Dict[str, str] = {
    "generate_image":    "正在生成图片…",
    "remove_background": "正在去除背景…",
    "generate_video":    "正在生成视频…",
    "create_storyboard": "正在生成分镜…",
}

# Brief text the agent says before/after calling a tool
_TOOL_PREFACE: Dict[str, str] = {
    "generate_image":    "好的，我来帮你生成一张图片。",
    "remove_background": "好的，正在处理图片背景。",
    "generate_video":    "好的，开始制作视频。",
    "create_storyboard": "好的，开始规划分镜流程。",
}


async def execute_tool_call(state: AgentState) -> Dict[str, Any]:
    """
    Execute the requested tool, emitting real-time SSE events.

    Flow:
    1. Push a preface token so the user sees immediate feedback.
    2. Push tool_start event (frontend shows spinner + label).
    3. Execute the tool (may be slow).
    4. Push tool_result event (frontend renders image/video card).
    5. Return exec_data and a summary text.
    """
    t0 = time.time()
    tool_name = str(state.get("tool_name") or "").strip()
    tool_args = dict(state.get("tool_args") or {})

    if not tool_name:
        err = "未指定工具名称，无法执行。"
        await push_token(err)
        return {"exec_response_text": err,
                "exec_warnings": ["tool_name missing"],
                "trace": [{"node": "execute_tool_call", "error": "no_tool_name", "ts": t0}]}

    # ── 生图：缺少 model_id 时，先让用户选参数 ────────────────────────────────────
    if tool_name == "generate_image" and not tool_args.get("model_id"):
        prompt = str(tool_args.get("prompt") or state.get("message") or "").strip()
        tip = f"好的，准备生成图片{'：「' + prompt[:30] + '」' if prompt else ''}。\n请选择生成参数："
        await push_token(tip)

        # 优先用前端传来的真实模型列表，降级到 image_params.py 的本地定义
        raw_models: list = state.get("available_image_models") or []
        if raw_models:
            model_options = [
                {
                    "value": str(m.get("id") or m.get("value") or ""),
                    "label": str(m.get("name") or m.get("label") or m.get("id") or ""),
                    "desc":  str(m.get("vendor") or ""),
                }
                for m in raw_models
                if m.get("id") or m.get("value")
            ]
        else:
            model_options = _FALLBACK_MODELS  # 前端未传时使用本地定义

        await push_param_form(
            tool="generate_image",
            prompt=prompt,
            groups=[
                {
                    "key": "model_id",
                    "label": "生成模型",
                    "required": True,
                    "options": model_options,
                },
                {
                    "key": "ratio",
                    "label": "图片比例",
                    "required": False,
                    "default": "1:1",
                    "options": RATIO_OPTIONS,
                },
                {
                    "key": "size",
                    "label": "尺寸分辨率",
                    "required": False,
                    "default": "1024x1024",
                    "options": SIZE_OPTIONS,
                },
            ],
        )
        return {
            "exec_response_text": tip,
            "trace": [{"node": "execute_tool_call", "tool": tool_name,
                       "action": "param_form_shown",
                       "model_source": "live" if raw_models else "fallback",
                       "ts": t0}],
        }

    # 1. Pre-flight text
    preface = _TOOL_PREFACE.get(tool_name, f"正在执行 {tool_name}…")
    await push_token(preface)

    # 2. tool_start event
    label = _TOOL_LABELS.get(tool_name, f"正在执行 {tool_name}…")
    await push_tool_start(tool_name, label)

    # 3. Execute
    sys_logger.info(f"[execute_tool_call] tool={tool_name} args={list(tool_args.keys())}")
    try:
        result = await execute_tool(tool_name, tool_args, state)
    except Exception as e:
        sys_logger.exception(f"[execute_tool_call] tool={tool_name} error: {e}")
        result = {"ok": False, "error": str(e)}

    # 4. tool_result event
    await push_tool_result(tool_name, result)

    # 5. Summary text
    if result.get("ok"):
        summary = _build_success_summary(tool_name, result)
    else:
        summary = f"操作失败：{result.get('error', '未知错误')}"
    await push_token("\n" + summary)

    elapsed = int((time.time() - t0) * 1000)
    return {
        "exec_response_text": preface + "\n" + summary,
        "exec_data": result,
        "trace": [{"node": "execute_tool_call", "tool": tool_name,
                   "ok": result.get("ok", False), "ms": elapsed, "ts": t0}],
    }


def _build_success_summary(tool_name: str, result: Dict[str, Any]) -> str:
    if tool_name == "generate_image":
        return "图片已生成完成！"
    if tool_name == "remove_background":
        return "背景已去除，透明背景图片已就绪。"
    if tool_name == "generate_video":
        return "视频已生成完成！"
    if tool_name == "create_storyboard":
        return "分镜方案已生成，请查看结果。"
    return "操作已完成。"
