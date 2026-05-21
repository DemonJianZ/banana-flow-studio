from __future__ import annotations

import json
import re
from typing import Any


_STORYBOARD_KEYWORDS = ("分镜", "故事板", "storyboard", "shot list", "镜头脚本", "镜头设计")
_SHOT_WORKFLOW_KEYWORDS = ("文生图", "图生图", "出图", "生图", "图片生成", "工作流", "workflow", "画布", "节点")
_PROMISE_MARKERS = ("我将", "我会", "为您生成", "为你生成", "调用", "分镜草稿", "故事板设计工具")


def _build_capability_catalog() -> list[dict]:
    from agent.tools import build_builtin_registry
    virtual = [
        {
            "name": "general_answer",
            "description": "Answer naturally without calling tools when no system capability is needed.",
            "category": "virtual",
            "enabled": True,
            "timeout_seconds": None,
            "retry": {"max_attempts": 1},
            "cost_level": "low",
            "tags": ["chat", "general_answer"],
            "annotations": {"readOnlyHint": True, "idempotentHint": False, "destructiveHint": False},
            "input_schema": {"type": "object", "properties": {"message": {"type": "string"}}, "additionalProperties": True},
        },
    ]
    registry = build_builtin_registry()
    catalog = list(virtual)
    for item in registry.to_prompt_catalog(enabled=True):
        catalog.append(dict(item))
        for alias in list(item.get("aliases") or []):
            alias_name = str(alias or "").strip()
            if not alias_name:
                continue
            alias_item = dict(item)
            alias_item["name"] = alias_name
            alias_item["canonical_name"] = item.get("name")
            catalog.append(alias_item)
    return catalog


def _coordinator_system_prompt() -> str:
    return (
        "你是 Bananaflow Agent v2 的协调器，一个像私人助理一样自然对话的系统。\n"
        "默认优先自然回答，只有在系统能力明显有帮助时才调用工具或规划器。\n\n"
        "你只能输出以下 action 之一：\n"
        "- answer_only\n"
        "- tool_call\n\n"
        "规则：\n"
        "1. 普通问答、寒暄、解释、建议，优先 answer_only。\n"
        "2. 只有当 capability catalog 中某个能力明显更合适时，才输出 tool_call。\n"
        "2.1 如果你判断应该调用工具，就直接输出 tool_call，不要只在 answer 里承诺“我将调用工具/我会生成/接下来为你设计”。\n"
        "3. 没有明显工具匹配时，不要硬选工具，输出 answer_only。\n"
        "4. tool_name 必须来自 capability catalog。\n"
        "4.1 如果用户明确要搭建每个分镜/镜头的文生图、图生图、出图、图片生成画布工作流，优先使用 shot_workflow.compose。\n"
        "4.2 shot_workflow.compose 只搭建 text_input/input/processor/output 这类出图工作流节点，不生成 storyboard_plan。\n"
        "4.3 如果用户明确要分镜设计、故事板、shot list、镜头规划，但没有要求搭建出图工作流，才使用 storyboard.design。\n"
        "4.4 如果用户消息本身是一段剧本，并要求出图/生图/文生图/图生图/工作流/画布节点，使用 shot_workflow.compose。\n"
        "5. 只输出 JSON，不要输出解释。\n\n"
        "JSON 格式：{"
        "\"action\":\"answer_only|tool_call\","
        "\"reason\":\"...\",\"confidence\":0.0,"
        "\"matched_capabilities\":[\"...\"],\"answer\":\"...\","
        "\"tool_name\":\"...\",\"tool_args\":{}}"
    )


def _build_coordinator_prompt(state: dict, capability_catalog: list[dict]) -> str:
    import json as _json

    history = list(state.get("conversation_history") or [])[-8:]
    payload = {
        "message": str(state.get("message") or "").strip(),
        "recent_messages": history,
        "canvas_state_summary": dict(state.get("canvas_summary") or {}),
        "selected_artifact_summary": dict(state.get("artifact_summary") or {}),
        "uploaded_documents_summary": [
            {
                "name": str((d or {}).get("name") or "").strip() or None,
                "mime_type": str((d or {}).get("mime_type") or "").strip() or None,
                "kind": str((d or {}).get("kind") or "").strip() or None,
                "text_preview": str((d or {}).get("text_content") or "").strip()[:200] or None,
            }
            for d in list(state.get("uploaded_documents") or [])[:3]
        ],
        "request_metadata": {
            "mode": str(state.get("mode") or "").strip() or None,
            "product": str(state.get("product") or "").strip() or None,
            "task_mode": str(state.get("task_mode") or "").strip() or None,
            "thread_id": str(state.get("thread_id") or "").strip() or None,
        },
        "capability_catalog": list(capability_catalog or []),
    }
    return _coordinator_system_prompt() + "\n\n" + _json.dumps(payload, ensure_ascii=False)


def _call_llm_coordinator(state: dict) -> str:
    """Call the LLM and return raw JSON string. Raises on failure."""
    from core.config import AGENT_MODEL_HTTP_PROXY, AGENT_MODEL_HTTPS_PROXY, MODEL_AGENT

    authorization = str(state.get("member_authorization") or "").strip()
    catalog = _build_capability_catalog()
    full_prompt = _build_coordinator_prompt(state, catalog)

    if authorization:
        from core.config import AI_CHAT_DOWNSTREAM_URL
        if AI_CHAT_DOWNSTREAM_URL:
            from services.ai_chat_client import call_ai_chat_text
            response = call_ai_chat_text(message=full_prompt, authorization=authorization)
            return str(response.text or "").strip()

    from google.genai import types
    from services.genai_client import call_genai_retry_with_proxy

    response = call_genai_retry_with_proxy(
        contents=[types.Part(text=full_prompt)],
        config=types.GenerateContentConfig(
            temperature=0.0,
            max_output_tokens=800,
            response_mime_type="application/json",
        ),
        req_id="agent_v2_graph_classify",
        model=MODEL_AGENT,
        http_proxy=AGENT_MODEL_HTTP_PROXY,
        https_proxy=AGENT_MODEL_HTTPS_PROXY,
    )
    text = str(getattr(response, "text", "") or "").strip()
    if not text:
        candidates = getattr(response, "candidates", None) or []
        if candidates:
            try:
                text = str(getattr(candidates[0].content.parts[0], "text", "") or "").strip()
            except Exception:
                text = ""
    return text


def _parse_llm_output(text: str) -> dict | None:
    raw = str(text or "").strip().replace("```json", "").replace("```", "").strip()
    if not raw:
        return None
    try:
        payload = json.loads(raw)
    except Exception:
        return None
    return payload if isinstance(payload, dict) else None


def _collect_context_text(state: dict) -> str:
    parts = [str(state.get("message") or "").strip()]
    for item in list(state.get("conversation_history") or [])[-8:]:
        text = str((item or {}).get("text") or "").strip()
        if text:
            parts.append(text)
    return "\n".join(p for p in parts if p)


def _looks_like_storyboard_request(state: dict) -> bool:
    text = _collect_context_text(state).lower()
    return any(kw in text for kw in _STORYBOARD_KEYWORDS)


def _looks_like_shot_workflow_request(state: dict) -> bool:
    text = _collect_context_text(state).lower()
    has_shot_context = any(kw in text for kw in _STORYBOARD_KEYWORDS) or any(kw in text for kw in ("剧本", "镜头"))
    has_workflow_context = any(kw.lower() in text for kw in _SHOT_WORKFLOW_KEYWORDS)
    return has_shot_context and has_workflow_context


def _decision_is_promise_only(payload: dict) -> bool:
    if str(payload.get("action") or "") != "answer_only":
        return False
    answer = str(payload.get("answer") or "").strip()
    return bool(answer) and any(m in answer for m in _PROMISE_MARKERS)


def _extract_storyboard_args(state: dict) -> dict:
    from agent_v2.graph.nodes.normalize import _extract_storyboard_args as _extract
    return _extract(state)


def classify_intent(state: dict) -> dict:
    """LLM intent routing. Skipped if normalize_request already set intent."""
    existing_intent = str(state.get("intent") or "").strip()
    if existing_intent:
        # Shortcut was already applied by normalize_request
        return {
            "intent": existing_intent,
            "trace": list(state.get("trace") or []) + [
                {"type": "CLASSIFY_INTENT", "skipped": True, "intent": existing_intent}
            ],
        }

    try:
        raw_text = _call_llm_coordinator(state)
        payload = _parse_llm_output(raw_text)
    except Exception:
        payload = None

    if payload is None:
        return {
            "intent": "answer_only",
            "intent_confidence": 0.35,
            "intent_reason": "coordinator_fallback",
            "tool_name": "",
            "tool_args": {},
            "trace": list(state.get("trace") or []) + [
                {"type": "CLASSIFY_INTENT", "intent": "answer_only", "rule": "fallback"}
            ],
        }

    action = str(payload.get("action") or "answer_only")
    # Only answer_only and tool_call are valid; anything else falls back
    if action not in {"answer_only", "tool_call"}:
        action = "answer_only"

    tool_name = str(payload.get("tool_name") or "").strip()
    tool_args = dict(payload.get("tool_args") or {})

    # Guard: workflow/storyboard promise → force tool_call
    if _looks_like_shot_workflow_request(state) and _decision_is_promise_only(payload):
        from agent_v2.graph.nodes.normalize import _extract_shot_workflow_args
        action = "tool_call"
        tool_name = "shot_workflow.compose"
        tool_args = _extract_shot_workflow_args(state)
        rule = "guard.shot_workflow_tool_call"
    elif _looks_like_storyboard_request(state) and _decision_is_promise_only(payload):
        action = "tool_call"
        tool_name = "storyboard.design"
        tool_args = _extract_storyboard_args(state)
        rule = "guard.storyboard_tool_call"
    elif action == "tool_call" and tool_name in {"shot_workflow.compose", "agent_shot_workflow_compose"}:
        from agent_v2.graph.nodes.normalize import _extract_shot_workflow_args
        args = _extract_shot_workflow_args(state)
        args.update({k: v for k, v in tool_args.items() if v not in (None, "", [], {})})
        tool_args = args
        rule = "llm_coordinator"
    elif action == "tool_call" and tool_name in {"storyboard.design", "agent_storyboard_design"}:
        args = _extract_storyboard_args(state)
        args.update({k: v for k, v in tool_args.items() if v not in (None, "", [], {})})
        tool_args = args
        rule = "llm_coordinator"
    else:
        rule = "llm_coordinator"

    return {
        "intent": action,
        "intent_confidence": float(payload.get("confidence") or 1.0),
        "intent_reason": str(payload.get("reason") or "").strip(),
        "tool_name": tool_name,
        "tool_args": tool_args,
        "trace": list(state.get("trace") or []) + [
            {"type": "CLASSIFY_INTENT", "intent": action, "rule": rule,
             "confidence": float(payload.get("confidence") or 1.0)}
        ],
    }
