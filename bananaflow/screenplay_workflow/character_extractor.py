"""
Node 2 — 角色提取

职责：基于原始剧本 + Node 1 的场景列表，提取所有角色的档案信息。
思考链：列出角色 → 推断外貌 → 分析性格 → 追踪情绪弧 → 场景映射 → 自检。
"""

import json
import os
from typing import AsyncIterator

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI

from core.config import API_KEY
from .schemas import Character, Scene

# ── 系统提示 ──────────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """\
你是专业剧本角色分析师。收到剧本和场景列表后，请严格按以下六个步骤逐步思考，\
最后输出 JSON，不要在 JSON 前后添加任何额外文字或代码块标记。

步骤1 — 列出所有角色
  · 包含有台词的角色、有明确动作描述的角色、对情节有影响的群演（如"路人甲"）
  · 每个角色在剧本中出现的原始名字

步骤2 — 推断外貌
  · 仅使用剧本中明确出现的描述（服装、发型、体型、年龄段等）
  · 没有任何描述的字段填写"未定义"，不要臆测或补充

步骤3 — 分析性格
  · 从台词风格、行为选择、与他人互动中提炼性格特征
  · 用 2-3 个精准词语概括（如"冷静、理性、有掌控欲"）

步骤4 — 追踪情绪弧线
  · 描述该角色在整个剧本中的情绪变化轨迹
  · 格式参考："场景1平静 → 场景3激动 → 场景5释然"
  · 只出现在一个场景的角色，直接描述该场景的情绪状态即可

步骤5 — 映射出场场景
  · 列出该角色明确出现（有台词或动作）的场景编号列表

步骤6 — 自检
  · 确认没有遗漏有台词的角色
  · 确认 scenes 列表中的编号都在场景列表范围内
  · 如有不合理之处，静默修正后再输出

输出格式（严格 JSON 数组）：
[
  {
    "name": "林晓",
    "role_type": "主角",
    "appearance": "25岁左右，长发，穿米色风衣",
    "personality": "敏感、内敛、执着",
    "emotion_arc": "场景1平静 → 场景3焦虑 → 场景6释然",
    "scenes": [1, 2, 3, 6]
  }
]

role_type 只能取以下值之一：主角、配角、群演
"""

_USER_TMPL = """\
场景列表：
{scenes_json}

原始剧本：
{script}

请对上述剧本进行角色提取分析。\
"""


# ── LLM 工厂 ──────────────────────────────────────────────────────────────────

def _build_llm() -> ChatGoogleGenerativeAI:
    proxy = os.getenv("AGENT_CHAT_HTTPS_PROXY") or os.getenv("AGENT_CHAT_HTTP_PROXY") or ""
    kwargs: dict = {"model": "gemini-2.5-flash", "google_api_key": API_KEY}
    if proxy:
        kwargs["client_args"] = {"proxy": proxy}
    return ChatGoogleGenerativeAI(**kwargs)


# ── 主函数：流式角色提取 ────────────────────────────────────────────────────────

async def extract_characters_stream(
    script: str,
    scenes: list[Scene],
) -> AsyncIterator[dict]:
    """
    流式执行 Node 2。

    yield 的 event 类型：
      {"type": "status",  "content": str}
      {"type": "token",   "content": str}
      {"type": "result",  "node": "character_extract",
       "data": [Character], "total": int}
      {"type": "error",   "content": str, "raw": str}
    """
    llm = _build_llm()

    yield {"type": "status", "content": "正在提取角色信息…"}

    scenes_json = json.dumps(
        [s.model_dump(exclude={"raw_text"}) for s in scenes],
        ensure_ascii=False,
        indent=2,
    )

    messages = [
        SystemMessage(content=_SYSTEM_PROMPT),
        HumanMessage(content=_USER_TMPL.format(
            scenes_json=scenes_json,
            script=script,
        )),
    ]

    raw_output = ""
    async for chunk in llm.astream(messages):
        if chunk.content:
            raw_output += chunk.content
            yield {"type": "token", "content": chunk.content}

    yield {"type": "status", "content": "正在解析角色档案…"}

    try:
        characters = _parse_characters(raw_output)
        yield {
            "type": "result",
            "node": "character_extract",
            "data": [c.model_dump() for c in characters],
            "total": len(characters),
        }
    except Exception as exc:
        yield {"type": "error", "content": f"角色解析失败：{exc}", "raw": raw_output}


# ── JSON 解析 ─────────────────────────────────────────────────────────────────

def _parse_characters(raw: str) -> list[Character]:
    start = raw.find("[")
    end = raw.rfind("]") + 1
    if start == -1 or end == 0:
        raise ValueError("输出中未找到 JSON 数组")
    data = json.loads(raw[start:end])
    return [Character(**item) for item in data]
