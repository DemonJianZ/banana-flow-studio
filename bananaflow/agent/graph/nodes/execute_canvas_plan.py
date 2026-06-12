"""
nodes/execute_canvas_plan.py — Canvas workflow planning node.

Uses DeepSeek to produce a flexible `steps` plan, then emits
canvas_action events for each step (supporting quantity + chaining).

Plan JSON structure:
  {
    "steps": [
      {
        "template": "text2img",   // 模板名
        "count": 3,               // 重复搭建几个（默认 1）
        "prompt": "...",          // 填入文本节点的内容
        "chain_to_prev": false    // true = 把本步的输入连到上一步的输出节点
      }
    ],
    "summary": "搭建 3 个文生图工作流"
  }

Supported templates: text2img / img2img / rmbg / img2video / multi_angle
"""
from __future__ import annotations

import json
import os
import re
import time
from typing import Any, Dict, List

try:
    from ....core.logging import sys_logger
    from ....core.deepseek_config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL
    from ....core.config import MODEL_AGENT_CHAT
except ImportError:
    from core.logging import sys_logger
    from core.deepseek_config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL
    from core.config import MODEL_AGENT_CHAT

from ..state import AgentState
from ...stream import push_token, push_event
from ...canvas import TEMPLATES, emit_canvas_workflow

# ── System prompt ──────────────────────────────────────────────────────────────

_SYSTEM = """你是 BananaFlow Studio 的画布规划助手。
根据用户请求，生成工作流搭建计划（支持多个、链式）。

可用模板（template 字段值）：
  text2img    文字描述→图片（文生图）
  img2img     参考图+描述→新图（图生图）
  rmbg        去背景/抠图
  img2video   图片→短视频（图生视频）
  multi_angle 产品三视图/多角度

返回严格 JSON，字段说明：
  steps       : 步骤数组，顺序执行
    template  : 模板名
    count     : 重复搭建几个（默认1，最多6）
    prompt    : 填入文本/描述节点的内容（没有就填空字符串）
    chain_to_prev: 是否把本步输入连到上一步的输出（默认false）
  summary     : 一句话说明

示例1：用户说"搭三个文生图工作流"
{
  "steps": [{"template":"text2img","count":3,"prompt":"","chain_to_prev":false}],
  "summary": "搭建 3 个文生图工作流"
}

示例2：用户说"搭一个文生图流程，再接一个去背景"
{
  "steps": [
    {"template":"text2img","count":1,"prompt":"","chain_to_prev":false},
    {"template":"rmbg","count":1,"prompt":"","chain_to_prev":true}
  ],
  "summary": "文生图 → 去背景 链式工作流"
}

示例3：用户说"搭两套图转视频流程，每套用不同的描述"
{
  "steps": [
    {"template":"img2video","count":2,"prompt":"轻微晃动","chain_to_prev":false}
  ],
  "summary": "搭建 2 个图生视频工作流"
}"""

# ── 中文数字转整数 ─────────────────────────────────────────────────────────────

_CN_NUM = {"一":1,"二":2,"三":3,"四":4,"五":5,"六":6,
           "两":2,"双":2,"俩":2}

def _extract_count(msg: str) -> int:
    """从消息里提取数量，如"三个"→3，"2个"→2，默认1。"""
    m = re.search(r'([一二三四五六两双俩]|\d+)\s*[个套份]', msg)
    if m:
        raw = m.group(1)
        return _CN_NUM.get(raw, int(raw) if raw.isdigit() else 1)
    return 1


def _keyword_fallback(message: str) -> Dict[str, Any]:
    """When no API key, use keyword rules."""
    msg = message.lower()
    count = _extract_count(message)

    # 检测链式关键词，分割成"主流程 + 附加流程"
    chain_split_re = re.compile(r'(再接|然后|加上|再做|再加|接着|之后|，再|，然后)')
    parts = chain_split_re.split(message)
    segments = [parts[0]] + [parts[i+1] for i in range(1, len(parts)-1, 2) if i+1 < len(parts)]

    def _detect_template(seg: str) -> str:
        s = seg.lower()
        if any(k in s for k in ["视频","video","img2video","图生视频"]): return "img2video"
        if any(k in s for k in ["去背","抠图","rmbg","背景"]):           return "rmbg"
        if any(k in s for k in ["三视图","多角度"]):                      return "multi_angle"
        if any(k in s for k in ["参考图","图生图","融合"]):               return "img2img"
        return "text2img"

    steps = []
    for i, seg in enumerate(segments):
        tpl = _detect_template(seg)
        seg_count = _extract_count(seg) if i == 0 else 1
        steps.append({
            "template": tpl,
            "count": seg_count,
            "prompt": seg.strip() if tpl in ("text2img","img2img","img2video") else "",
            "chain_to_prev": i > 0,
        })

    total = sum(s["count"] for s in steps)
    labels = [TEMPLATES.get(s["template"],{}).get("label", s["template"]) for s in steps]
    return {"steps": steps, "summary": f"搭建 {'→'.join(labels)}（共 {total} 个工作流）"}


def _get_api_key() -> str:
    return str(os.getenv("DEEPSEEK_API_KEY","") or DEEPSEEK_API_KEY or "").strip()

def _get_base_url() -> str:
    return str(os.getenv("DEEPSEEK_BASE_URL","") or DEEPSEEK_BASE_URL or "https://api.deepseek.com").strip().rstrip("/")

def _get_model() -> str:
    raw = str(MODEL_AGENT_CHAT or "deepseek-v4-flash").strip()
    return raw.split(":",1)[-1].strip() if ":" in raw else raw


def _call_plan_llm(message: str) -> Dict[str, Any]:
    """Ask DeepSeek to produce a multi-step plan."""
    import httpx
    api_key = _get_api_key()
    if not api_key:
        return _keyword_fallback(message)

    payload = {
        "model": _get_model(),
        "messages": [
            {"role": "system", "content": _SYSTEM},
            {"role": "user",   "content": message},
        ],
        "stream": False,
        "response_format": {"type": "json_object"},
        "max_tokens": 512,
        "temperature": 0.1,
    }
    url = f"{_get_base_url()}/chat/completions"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    try:
        with httpx.Client(timeout=12.0, trust_env=False) as client:
            resp = client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            text = (resp.json().get("choices",[{}])[0]
                        .get("message",{}).get("content","")).strip()
            data = json.loads(text)
            # 兼容旧格式（只有 template 字段）
            if "template" in data and "steps" not in data:
                data = {"steps":[{"template":data["template"],
                                  "count":1,
                                  "prompt":data.get("prompt",""),
                                  "chain_to_prev":False}],
                        "summary":data.get("summary","")}
            return data
    except Exception as e:
        sys_logger.warning(f"[execute_canvas_plan] LLM failed: {e}, keyword fallback")
        return _keyword_fallback(message)


# ── Layout helpers ─────────────────────────────────────────────────────────────

# Vertical gap between repeated instances of the same template
_ROW_GAP = 600

# ── Node ───────────────────────────────────────────────────────────────────────

async def execute_canvas_plan(state: AgentState) -> Dict[str, Any]:
    t0 = time.time()
    import asyncio

    message    = str(state.get("message") or "").strip()
    tool_args  = state.get("tool_args") or {}

    # force_action 可直接指定模板
    template_override = str(tool_args.get("template") or "").strip()
    prompt_override   = str(tool_args.get("prompt")   or message).strip()

    if template_override:
        plan = {"steps":[{"template":template_override,"count":1,
                          "prompt":prompt_override,"chain_to_prev":False}],
                "summary": TEMPLATES.get(template_override,{}).get("label","工作流")}
    else:
        plan = await asyncio.to_thread(_call_plan_llm, message)

    steps: List[Dict[str,Any]] = plan.get("steps") or []
    summary = str(plan.get("summary") or "工作流")

    if not steps:
        steps = [{"template":"text2img","count":1,"prompt":message,"chain_to_prev":False}]

    # 视口中心
    hints = state.get("canvas_node_hints") or {}
    cx = float(hints.get("viewport_cx") or hints.get("cx") or 500)
    cy = float(hints.get("viewport_cy") or hints.get("cy") or 400)
    model_id = str(tool_args.get("model_id") or "")

    tip = f"好的，我来帮你搭建：{summary}。"
    await push_token(tip)

    total_nodes = 0
    prev_output_node_ids: List[str] = []   # 上一步最后一个 output 节点 id

    # 当前布局起始 y（每次 repeat 垂直向下偏移）
    current_cy = cy

    for step in steps:
        tpl_key     = str(step.get("template") or "text2img")
        count       = max(1, min(6, int(step.get("count") or 1)))
        prompt      = str(step.get("prompt") or "")
        chain_prev  = bool(step.get("chain_to_prev") or False)

        tpl = TEMPLATES.get(tpl_key)
        if not tpl:
            tpl_key = "text2img"

        step_label = TEMPLATES.get(tpl_key, {}).get("label", tpl_key)

        # 多个重复实例：垂直排列
        step_new_output_ids: List[str] = []
        for i in range(count):
            instance_cy = current_cy + i * _ROW_GAP
            node_ids = await emit_canvas_workflow(
                template_key=tpl_key,
                prompt=prompt,
                cx=cx,
                cy=instance_cy,
                model_id=model_id,
            )
            total_nodes += len(node_ids)

            # 记录本实例的 output 节点（最后一个节点 = output）
            if node_ids:
                step_new_output_ids.append(node_ids[-1])

            # 链式：把上一步的 output 连到本实例的第一个 input 节点
            if chain_prev and prev_output_node_ids and node_ids:
                target_input = node_ids[0]  # 第一个节点 = INPUT / TEXT_INPUT
                for out_id in prev_output_node_ids[:count]:
                    await push_event({
                        "type": "canvas_action",
                        "action": "connect",
                        "connection": {
                            "id": f"chain_{out_id[:6]}_{target_input[:6]}",
                            "from": out_id,
                            "to": target_input,
                        }
                    })

        prev_output_node_ids = step_new_output_ids
        current_cy += count * _ROW_GAP

    tail = f"\n\n✅ {summary}，共 {total_nodes} 个节点，请查看画布。"
    await push_token(tail)

    elapsed = int((time.time() - t0) * 1000)
    sys_logger.info(f"[execute_canvas_plan] steps={len(steps)} total_nodes={total_nodes} ms={elapsed}")

    return {
        "exec_response_text": tip + tail,
        "exec_patches": [{"plan": plan, "total_nodes": total_nodes}],
        "trace": [{"node":"execute_canvas_plan","steps":len(steps),
                   "total_nodes":total_nodes,"ms":elapsed,"ts":t0}],
    }
