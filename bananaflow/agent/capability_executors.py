# bananaflow/agent/capability_executors.py
"""各 /api/agent/* 能力的纯执行逻辑，供 HTTP 路由与 LangGraph 节点共用。"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from google.genai import types

from core.config import (
    AGENT_CHAT_HTTP_PROXY,
    AGENT_CHAT_HTTPS_PROXY,
    MODEL_AGENT_CHAT,
    MODEL_PROMPT_POLISH,
)
from prompts.refine import ollama_prompt_polish
from schemas.api import (
    AgentChitchatResponse,
    AgentDramaRequest,
    AgentDramaResponse,
    PromptPolishRequest,
    PromptPolishResponse,
)
from services.genai_client import call_genai_retry_with_proxy

from agent.drama_creator import DramaCreatorClient
from agent.idea_script.instance import idea_script_orchestrator
from agent.idea_script.schemas import IdeaScriptRequest, IdeaScriptResponse

SKILL_CHITCHAT = "agent_chitchat"
SKILL_DRAMA = "agent_drama"
SKILL_PROMPT_POLISH = "agent_prompt_polish"
SKILL_IDEA_SCRIPT = "agent_idea_script"


def run_agent_chitchat(message: str, req_id: str) -> AgentChitchatResponse:
    prompt = (
        "你是 Banana Flow Studio 的中文创意助理。\n"
        "请直接回答用户问题，保持简洁、自然、口语化。\n"
        "如果用户在闲聊，也要正常回应，但不要编造能力。\n"
        "如果用户表达了脚本、短剧创作、画布工作流等明确意图，可以顺带提示你也能继续帮助完成这些任务。\n"
        f"用户消息：{message}"
    )
    response = call_genai_retry_with_proxy(
        contents=[types.Part(text=prompt)],
        config=types.GenerateContentConfig(temperature=0.7),
        req_id=f"agent_chitchat:{req_id}",
        model=MODEL_AGENT_CHAT,
        http_proxy=AGENT_CHAT_HTTP_PROXY,
        https_proxy=AGENT_CHAT_HTTPS_PROXY,
    )
    text = str(getattr(response, "text", "") or "").strip()
    if not text:
        text = "我在。你可以继续告诉我你想聊什么，或者直接让我做脚本、短剧、导出。"
    return AgentChitchatResponse(text=text, model=MODEL_AGENT_CHAT)


def run_agent_drama(req: AgentDramaRequest, req_id: str) -> AgentDramaResponse:
    client = DramaCreatorClient()
    payload = client.generate(
        prompt=str(req.prompt or "").strip(),
        task_mode=str(req.task_mode or "").strip(),
        episode_count=req.episode_count,
        existing_script=str(req.existing_script or "").strip(),
    )
    return AgentDramaResponse(
        text=str(payload.get("text") or "").strip(),
        summary=str(payload.get("summary") or "").strip(),
        model=str(payload.get("model") or client.model).strip(),
        mode=str(req.task_mode or "").strip(),
    )


def run_agent_prompt_polish(req: PromptPolishRequest, req_id: str) -> PromptPolishResponse:
    prompt = str(req.prompt or "").strip()
    mode = str(req.mode or "text2img").strip() or "text2img"
    payload = ollama_prompt_polish(prompt, mode=mode, req_id=f"prompt_polish:{req_id}")
    text = str(payload.get("text") or "").strip()
    variants = payload.get("variants") or []
    if not text:
        raise RuntimeError("prompt_polish returned empty response")
    return PromptPolishResponse(text=text, model=MODEL_PROMPT_POLISH, variants=variants)


def run_agent_idea_script_core(
    req: IdeaScriptRequest,
    *,
    session_id: Optional[str],
    session_summary_present: Optional[bool],
    tenant_id: Optional[str],
    user_id: Optional[str],
    trajectory_sink: List[Dict[str, Any]],
    trace_sink: List[Dict[str, Any]],
) -> IdeaScriptResponse:
    return idea_script_orchestrator.run(
        req,
        session_id=session_id,
        session_summary_present=session_summary_present,
        tenant_id=tenant_id,
        user_id=user_id,
        trajectory_sink=trajectory_sink,
        trace_sink=trace_sink,
    )
