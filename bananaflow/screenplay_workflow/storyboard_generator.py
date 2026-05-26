"""
Node 4 — 分镜生成

职责：综合前三个节点的结果，为每个场景生成一组分镜描述。
思考链：判断镜头数 → 确定景别/运动 → 描述画面内容 → 标注情绪 → 估算时长 → 自检连贯性。
"""

import json
import os
from typing import AsyncIterator

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI

from core.config import API_KEY
from .schemas import Character, Scene, Shot

# ── 系统提示 ──────────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """\
你是专业分镜导演，擅长将剧本场景转化为可视化的镜头序列。

你将收到：原始剧本、场景列表、角色档案。

请逐场景生成分镜序列，每个场景按以下五步思考：

步骤1 — 判断镜头数量
  · 根据场景时长、情节密度、情绪节奏决定需要几个镜头（通常 1-4 个）
  · 动作戏、情绪转折处可多切；静态对话可减少镜头

步骤2 — 确定景别与运动
  · shot_type 只能取：特写、近景、中景、全景、远景
  · camera_movement 只能取：固定、推、拉、摇、跟、升、降
  · 开场常用全景/远景建立环境；情绪高潮常用特写

步骤3 — 描述画面内容
  · 结合主体状态 + 背景要素，用一句话描述该镜头的视觉画面
  · 格式：主体在做什么 + 背景是什么状态
  · 示例："林晓驻足路口，凝视前方，身后行人如潮水般涌过"

步骤4 — 标注情绪基调
  · 用 2-3 个形容词描述该镜头的情绪感受（如"孤独、迷茫、压抑"）

步骤5 — 估算时长与自检
  · duration 为建议时长（秒），特写 1-3s，中景 2-4s，全景 3-6s
  · 检查同一场景内镜头序列是否具有叙事连贯性
  · shot_id 全局唯一，从 1 开始递增；shot_index 在场景内从 1 开始

输出格式（严格 JSON 数组，按 shot_id 升序）：
[
  {
    "shot_id": 1,
    "scene_id": 1,
    "shot_index": 1,
    "shot_type": "全景",
    "camera_movement": "固定",
    "content": "林晓独自站在繁华路口，人群从四周涌过，她一动不动",
    "mood": "孤独、迷茫",
    "duration": 4
  },
  {
    "shot_id": 2,
    "scene_id": 1,
    "shot_index": 2,
    "shot_type": "特写",
    "camera_movement": "推",
    "content": "林晓的眼神，略显迷茫，嘴角微微下压",
    "mood": "压抑、若有所思",
    "duration": 2
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

请为每个场景生成分镜序列。\
"""


# ── LLM 工厂 ──────────────────────────────────────────────────────────────────

def _build_llm() -> ChatGoogleGenerativeAI:
    proxy = os.getenv("AGENT_CHAT_HTTPS_PROXY") or os.getenv("AGENT_CHAT_HTTP_PROXY") or ""
    kwargs: dict = {"model": "gemini-2.5-flash", "google_api_key": API_KEY}
    if proxy:
        kwargs["client_args"] = {"proxy": proxy}
    return ChatGoogleGenerativeAI(**kwargs)


# ── 主函数 ────────────────────────────────────────────────────────────────────

async def generate_storyboard_stream(
    script: str,
    scenes: list[Scene],
    characters: list[Character],
) -> AsyncIterator[dict]:
    """
    流式执行 Node 4。

    yield 的 event 类型：
      {"type": "status",  "content": str}
      {"type": "token",   "content": str}
      {"type": "result",  "node": "storyboard",
       "data": [Shot], "total": int}
      {"type": "error",   "content": str, "raw": str}
    """
    llm = _build_llm()

    yield {"type": "status", "content": "正在生成分镜序列…"}

    scenes_json     = json.dumps([s.model_dump(exclude={"raw_text"}) for s in scenes], ensure_ascii=False, indent=2)
    characters_json = json.dumps([c.model_dump() for c in characters],                 ensure_ascii=False, indent=2)

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

    yield {"type": "status", "content": "正在解析分镜数据…"}

    try:
        shots = _parse_shots(raw_output)
        yield {
            "type": "result",
            "node": "storyboard",
            "data": [s.model_dump() for s in shots],
            "total": len(shots),
        }
    except Exception as exc:
        yield {"type": "error", "content": f"分镜解析失败：{exc}", "raw": raw_output}


# ── JSON 解析 ─────────────────────────────────────────────────────────────────

def _parse_shots(raw: str) -> list[Shot]:
    start = raw.find("[")
    end = raw.rfind("]") + 1
    if start == -1 or end == 0:
        raise ValueError("输出中未找到 JSON 数组")
    data = json.loads(raw[start:end])
    return [Shot(**item) for item in data]
