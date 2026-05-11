# bananaflow/agent/capability_executors.py
"""Compatibility execution layer for legacy `/api/agent/*` capability endpoints.

The preferred conversational entrypoint is `agent.gateway.service.handle_agent_message`.
These helpers remain so older capability-specific routes can keep working while
sharing the newer ToolExecutor-backed implementations where possible.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from core.config import MODEL_AGENT_CHAT, MODEL_PROMPT_POLISH
from schemas.api import (
    AgentChitchatResponse,
    AgentDramaRequest,
    AgentDramaResponse,
    PromptPolishRequest,
    PromptPolishResponse,
)
from agent.idea_script.schemas import IdeaScriptRequest, IdeaScriptResponse
from agent.legacy_capabilities import (
    SKILL_CHITCHAT,
    SKILL_DRAMA,
    SKILL_IDEA_SCRIPT,
    SKILL_PROMPT_POLISH,
)
from agent.tools import AgentToolContext, build_builtin_executor

_TOOL_EXECUTOR = build_builtin_executor()


def run_agent_chitchat(message: str, req_id: str) -> AgentChitchatResponse:
    payload = _TOOL_EXECUTOR.execute(
        "agent_chitchat",
        {"message": str(message or "")},
        context=AgentToolContext(req_id=req_id),
    )
    text = str(payload.get("text") or "").strip()
    if not text:
        text = "我在。你可以继续告诉我你想聊什么，或者直接让我做脚本、短剧、导出。"
    return AgentChitchatResponse(text=text, model=MODEL_AGENT_CHAT)


def run_agent_drama(req: AgentDramaRequest, req_id: str) -> AgentDramaResponse:
    payload = _TOOL_EXECUTOR.execute(
        "agent_drama_generate",
        {
            "prompt": str(req.prompt or "").strip(),
            "task_mode": str(req.task_mode or "").strip(),
            "episode_count": req.episode_count,
            "existing_script": str(req.existing_script or "").strip(),
        },
        context=AgentToolContext(req_id=req_id),
    )
    return AgentDramaResponse(
        text=str(payload.get("text") or "").strip(),
        summary=str(payload.get("summary") or "").strip(),
        model=str(payload.get("model") or "").strip(),
        mode=str(req.task_mode or "").strip(),
    )


def run_agent_prompt_polish(req: PromptPolishRequest, req_id: str) -> PromptPolishResponse:
    payload = _TOOL_EXECUTOR.execute(
        "agent_prompt_polish",
        {
            "prompt": str(req.prompt or "").strip(),
            "mode": str(req.mode or "text2img").strip() or "text2img",
        },
        context=AgentToolContext(req_id=req_id),
    )
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
    payload = _TOOL_EXECUTOR.execute(
        "agent_idea_script_generate",
        req.model_dump(mode="json"),
        context=AgentToolContext(
            req_id="idea_script",
            session_id=session_id,
            session_summary_present=session_summary_present,
            tenant_id=tenant_id,
            user_id=user_id,
            trajectory_sink=trajectory_sink,
            trace_sink=trace_sink,
        ),
    )
    return IdeaScriptResponse.model_validate(payload)
