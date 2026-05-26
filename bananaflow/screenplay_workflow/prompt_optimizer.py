"""
Node 5 — 提示词优化

职责：将分镜描述转化为可直接送入图像生成模型的提示词（中英双语 + 负向提示词）。
思考链：提取视觉要素 → 结构化组织 → 去叙事化 → 加质量词 → 生成英文版。
"""

import json
import os
from typing import AsyncIterator

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI

from core.config import API_KEY
from .schemas import Character, Shot, ShotPrompt

# ── 系统提示 ──────────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """\
你是专业的 AI 图像生成提示词工程师，擅长将分镜描述转化为高质量的图像生成提示词。

你将收到：分镜列表、角色档案。

请逐镜头生成提示词，每个镜头按以下五步处理：

步骤1 — 提取核心视觉要素
  · 主体：人物外貌 + 当前状态（姿势/表情/服装）
  · 背景：环境类型 + 关键背景元素
  · 光线：时段 + 光线方向 + 色温
  · 情绪：通过视觉呈现情绪（不要直接说"孤独"，而是"冷色调、空旷背景、人物渺小"）

步骤2 — 按固定顺序组织中文提示词
  顺序：主体描述, 主体动作/状态, 背景环境, 光线氛围, 情绪色调/视觉风格, 镜头参数
  · 去除所有叙事性语言（不用"他走向"，改为"人物行走中"）
  · 短语之间用逗号分隔，不用句子形式

步骤3 — 生成英文提示词
  · 将中文提示词直译为英文，保持相同顺序
  · 结尾追加质量词：cinematic lighting, photorealistic, 8k resolution, film grain
  · 根据景别追加：
    特写/近景 → shallow depth of field, bokeh background
    中景      → medium shot composition
    全景/远景 → wide angle, establishing shot

步骤4 — 生成负向提示词（英文）
  固定基础：blurry, low quality, worst quality, text, watermark, logo, signature
  根据情绪加：
    阴暗/压抑场景 → oversaturated, neon colors, cartoonish
    明亮/温暖场景 → dark, gloomy, desaturated

步骤5 — 自检
  · 确认提示词中无明显错误或矛盾描述
  · 确认 shot_id / scene_id / shot_index 与输入分镜数据一致

输出格式（严格 JSON 数组）：
[
  {
    "shot_id": 1,
    "scene_id": 1,
    "shot_index": 1,
    "prompt_zh": "年轻女性，米色风衣，站立姿势，城市十字路口，傍晚自然光，冷暖交界，忧郁色调，全景构图",
    "prompt_en": "young woman, beige trench coat, standing pose, urban intersection, golden hour natural light, cool-warm color contrast, melancholy mood, wide establishing shot, cinematic lighting, photorealistic, 8k resolution, film grain",
    "negative_prompt": "blurry, low quality, worst quality, text, watermark, oversaturated, neon colors, cartoonish"
  }
]
"""

_USER_TMPL = """\
分镜列表：
{shots_json}

角色档案：
{characters_json}

请逐镜头生成图像生成提示词。\
"""


# ── LLM 工厂 ──────────────────────────────────────────────────────────────────

def _build_llm() -> ChatGoogleGenerativeAI:
    proxy = os.getenv("AGENT_CHAT_HTTPS_PROXY") or os.getenv("AGENT_CHAT_HTTP_PROXY") or ""
    kwargs: dict = {"model": "gemini-2.5-flash", "google_api_key": API_KEY}
    if proxy:
        kwargs["client_args"] = {"proxy": proxy}
    return ChatGoogleGenerativeAI(**kwargs)


# ── 主函数 ────────────────────────────────────────────────────────────────────

async def optimize_prompts_stream(
    shots: list[Shot],
    characters: list[Character],
) -> AsyncIterator[dict]:
    """
    流式执行 Node 5。

    yield 的 event 类型：
      {"type": "status",  "content": str}
      {"type": "token",   "content": str}
      {"type": "result",  "node": "prompt_optimize",
       "data": [ShotPrompt], "total": int}
      {"type": "error",   "content": str, "raw": str}
    """
    llm = _build_llm()

    yield {"type": "status", "content": "正在优化图像生成提示词…"}

    shots_json      = json.dumps([s.model_dump() for s in shots],      ensure_ascii=False, indent=2)
    characters_json = json.dumps([c.model_dump() for c in characters], ensure_ascii=False, indent=2)

    messages = [
        SystemMessage(content=_SYSTEM_PROMPT),
        HumanMessage(content=_USER_TMPL.format(
            shots_json=shots_json,
            characters_json=characters_json,
        )),
    ]

    raw_output = ""
    async for chunk in llm.astream(messages):
        if chunk.content:
            raw_output += chunk.content
            yield {"type": "token", "content": chunk.content}

    yield {"type": "status", "content": "正在解析提示词数据…"}

    try:
        prompts = _parse_prompts(raw_output)
        yield {
            "type": "result",
            "node": "prompt_optimize",
            "data": [p.model_dump() for p in prompts],
            "total": len(prompts),
        }
    except Exception as exc:
        yield {"type": "error", "content": f"提示词解析失败：{exc}", "raw": raw_output}


# ── JSON 解析 ─────────────────────────────────────────────────────────────────

def _parse_prompts(raw: str) -> list[ShotPrompt]:
    start = raw.find("[")
    end = raw.rfind("]") + 1
    if start == -1 or end == 0:
        raise ValueError("输出中未找到 JSON 数组")
    data = json.loads(raw[start:end])
    return [ShotPrompt(**item) for item in data]
