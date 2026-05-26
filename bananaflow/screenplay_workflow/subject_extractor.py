"""
Node 3 — 主体/背景提取

职责：针对每个场景，提取视觉主体状态、背景环境要素和构图关系。
输入：原始剧本 + Node 1 场景列表 + Node 2 角色档案（用于补充外貌/服装信息）。
"""

import json
import os
from typing import AsyncIterator

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI

from core.config import API_KEY
from .schemas import Character, Scene, SceneSubject

# ── 系统提示 ──────────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """\
你是专业的视觉化剧本分析师，擅长将文字场景转化为可视化的画面要素描述。

你将收到：原始剧本、场景列表、角色档案。

请逐场景分析，每个场景严格按以下四个步骤思考：

步骤1 — 主体识别
  · 该场景的核心视觉主体是什么（出现的人物名 / 关键物体）
  · subjects 填写简短名称列表，如 ["林晓", "路边摊"]
  · subject_state 描述主体的即时状态：姿势 + 表情 + 服装（参考角色档案中的外貌信息）
    若无足够信息，填写"根据剧本暂无具体描述"

步骤2 — 背景识别
  · env_type 只能取：室内、室外·自然、室外·城市、室外·混合、未知
  · lighting 描述光线与氛围，参考时段（日/夜/黄昏/清晨）和情绪色调
    格式示例："午后自然光，暖色调，略带慵懒"
  · bg_elements 列出 2-4 个关键背景视觉元素（建筑、道具、植物、天气等）

步骤3 — 构图关系
  · composition 一句话描述主体与背景的空间关系和视觉构成
    格式示例："主角居中偏左，背景为虚化的人群，形成孤独的视觉反差"

步骤4 — 自检
  · 确认每个场景都有对应的分析
  · 确认 scene_id 与输入场景列表一一对应，没有遗漏或重复

输出格式（严格 JSON 数组，与场景列表等长）：
[
  {
    "scene_id": 1,
    "subjects": ["林晓"],
    "subject_state": "站在十字路口，神情若有所思，身穿米色风衣",
    "env_type": "室外·城市",
    "lighting": "傍晚自然光，冷暖交界，略带忧郁",
    "bg_elements": ["路灯", "行人", "远处高楼", "斑马线"],
    "composition": "主体居中，背景人群虚化，突出孤独感"
  }
]
"""

_USER_TMPL = """\
场景列表：
{scenes_json}

角色档案：
{characters_json}

原始剧本：
{script}

请逐场景提取主体与背景要素。\
"""


# ── LLM 工厂 ──────────────────────────────────────────────────────────────────

def _build_llm() -> ChatGoogleGenerativeAI:
    proxy = os.getenv("AGENT_CHAT_HTTPS_PROXY") or os.getenv("AGENT_CHAT_HTTP_PROXY") or ""
    kwargs: dict = {"model": "gemini-2.5-flash", "google_api_key": API_KEY}
    if proxy:
        kwargs["client_args"] = {"proxy": proxy}
    return ChatGoogleGenerativeAI(**kwargs)


# ── 主函数 ────────────────────────────────────────────────────────────────────

async def extract_subjects_stream(
    script: str,
    scenes: list[Scene],
    characters: list[Character],
) -> AsyncIterator[dict]:
    """
    流式执行 Node 3。

    yield 的 event 类型：
      {"type": "status",  "content": str}
      {"type": "token",   "content": str}
      {"type": "result",  "node": "subject_extract",
       "data": [SceneSubject], "total": int}
      {"type": "error",   "content": str, "raw": str}
    """
    llm = _build_llm()

    yield {"type": "status", "content": "正在分析每个场景的主体与背景要素…"}

    scenes_json = json.dumps(
        [s.model_dump(exclude={"raw_text"}) for s in scenes],
        ensure_ascii=False, indent=2,
    )
    characters_json = json.dumps(
        [c.model_dump() for c in characters],
        ensure_ascii=False, indent=2,
    )

    messages = [
        SystemMessage(content=_SYSTEM_PROMPT),
        HumanMessage(content=_USER_TMPL.format(
            scenes_json=scenes_json,
            characters_json=characters_json,
            script=script,
        )),
    ]

    raw_output = ""
    async for chunk in llm.astream(messages):
        if chunk.content:
            raw_output += chunk.content
            yield {"type": "token", "content": chunk.content}

    yield {"type": "status", "content": "正在解析主体/背景数据…"}

    try:
        subjects = _parse_subjects(raw_output)
        yield {
            "type": "result",
            "node": "subject_extract",
            "data": [s.model_dump() for s in subjects],
            "total": len(subjects),
        }
    except Exception as exc:
        yield {"type": "error", "content": f"主体/背景解析失败：{exc}", "raw": raw_output}


# ── JSON 解析 ─────────────────────────────────────────────────────────────────

def _parse_subjects(raw: str) -> list[SceneSubject]:
    start = raw.find("[")
    end = raw.rfind("]") + 1
    if start == -1 or end == 0:
        raise ValueError("输出中未找到 JSON 数组")
    data = json.loads(raw[start:end])
    return [SceneSubject(**item) for item in data]
