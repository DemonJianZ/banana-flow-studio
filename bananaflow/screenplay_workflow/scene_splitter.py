"""
Node 1 — 场景切分

职责：接收原始剧本文本，输出结构化场景列表。
思考链强制 LLM 分四步推理：识别边界 → 标注时空 → 概括事件 → 自检。
"""

import json
import os
from typing import AsyncIterator

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI

from core.config import API_KEY
from .schemas import Scene

# ── 系统提示 ──────────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """\
你是专业剧本结构分析师。收到剧本后，请严格按以下步骤逐步思考，\
最后输出 JSON，不要在 JSON 前后添加任何额外文字或代码块标记。

【最高原则】你的职责是"识别并提取"剧本作者已经声明的场景，而不是"重新划分"。
禁止根据内容变化、情绪转变、时间变化或个人判断增加或合并场景。

步骤0 — 检测剧本开头的元数据声明区
  中文剧本常在正文前以"字段名：内容"格式声明基本信息，例如：
    人物：张三、李四
    场景：客厅，卧室，街道
    时间：白天
  如果剧本开头存在"场景：..."这样的声明行，则：
  · 以该声明中列出的场景名称（按逗号/顿号分隔）作为唯一的场景列表
  · 输出的场景数量必须与声明中的条目数完全一致，不得增减
  · 声明中的场景名称即为 location 字段的值
  · time 字段：若声明区有"时间：..."行，以该声明为准；若无则填"未指定"
  找到声明区后直接跳到步骤2，跳过步骤1和步骤1B。

步骤1（仅当步骤0未找到元数据声明区时执行）— 扫描正文中的显式场景标记
  常见形式包括但不限于：
  · 数字编号：第一场、第1场、场景一、场景1、Scene 1、（一）等
  · 格式标题：INT./EXT. 开头的英文格式场景头
  · 中括号/书名号标注：【场景X】《第X场》
  · 明确换场词：（转场）、（切至：...）、---场景分隔线---
  把所有找到的标记按出现顺序列出，输出数量与标记数一致。
  如果正文中也没有任何显式标记，才进入步骤1B。

步骤1B（仅当步骤0和步骤1均未找到任何标记时执行）— 依据内容推断
  · 地点发生明确变化
  · 时间发生明确跳跃（次日、三天后等）
  · 叙事空间完全切换且有明确过渡描述
  注意：纯粹的情绪变化、话题转换不构成新场景。

步骤2 — 为每个场景标注时空
  time 只能取：日、夜、黄昏、清晨、室内不分昼夜、未指定
  · 若步骤0已从声明区获得时间，直接使用；若声明为"白天"则映射为"日"
  location 填写该场景的地点名称（来自声明区或正文标记中的原文描述）

步骤3 — 用一句话概括每个场景的核心叙事事件（≤30字，不含主观评价）
  根据该场景对应的正文内容归纳，若正文无对应内容则填"待补充"

步骤4 — 自检
  · 确认输出的场景数量与步骤0声明的条目数（或步骤1标记数）完全一致
  · 禁止新增声明/标记之外的场景，禁止合并已分开声明/标记的场景

输出格式（严格 JSON 数组，key 使用英文）：
[
  {"scene_id": 1, "time": "日", "location": "城市街道", "summary": "主角在街头遇见陌生人"},
  {"scene_id": 2, "time": "夜", "location": "咖啡馆内", "summary": "两人初次交谈，互道姓名"}
]
"""

_USER_TMPL = "请分析以下剧本，完成场景切分：\n\n{script}"


# ── LLM 工厂 ──────────────────────────────────────────────────────────────────

def _build_llm() -> ChatGoogleGenerativeAI:
    proxy = os.getenv("AGENT_CHAT_HTTPS_PROXY") or os.getenv("AGENT_CHAT_HTTP_PROXY") or ""
    kwargs: dict = {"model": "gemini-2.5-flash", "google_api_key": API_KEY}
    if proxy:
        kwargs["client_args"] = {"proxy": proxy}
    return ChatGoogleGenerativeAI(**kwargs)


# ── 主函数：流式场景切分 ────────────────────────────────────────────────────────

async def split_scenes_stream(script: str) -> AsyncIterator[dict]:
    """
    流式执行 Node 1。

    yield 的 event 类型：
      {"type": "status",  "content": str}          — 阶段提示
      {"type": "token",   "content": str}           — LLM 逐字输出（思考过程可见）
      {"type": "result",  "node": "scene_split",
       "data": [Scene], "total": int}               — 最终结构化结果
      {"type": "error",   "content": str,
       "raw": str}                                  — 解析失败时携带原始输出
    """
    llm = _build_llm()

    yield {"type": "status", "content": "正在分析剧本结构，识别场景边界…"}

    messages = [
        SystemMessage(content=_SYSTEM_PROMPT),
        HumanMessage(content=_USER_TMPL.format(script=script)),
    ]

    raw_output = ""
    async for chunk in llm.astream(messages):
        if chunk.content:
            raw_output += chunk.content
            yield {"type": "token", "content": chunk.content}

    yield {"type": "status", "content": "正在解析场景列表…"}

    try:
        scenes = _parse_scenes(raw_output)
        yield {
            "type": "result",
            "node": "scene_split",
            "data": [s.model_dump() for s in scenes],
            "total": len(scenes),
        }
    except Exception as exc:
        yield {"type": "error", "content": f"场景解析失败：{exc}", "raw": raw_output}


# ── JSON 解析 ─────────────────────────────────────────────────────────────────

def _parse_scenes(raw: str) -> list[Scene]:
    """从 LLM 输出中定位并解析 JSON 数组。"""
    start = raw.find("[")
    end = raw.rfind("]") + 1
    if start == -1 or end == 0:
        raise ValueError("输出中未找到 JSON 数组")
    scenes_data = json.loads(raw[start:end])
    return [Scene(**item) for item in scenes_data]
