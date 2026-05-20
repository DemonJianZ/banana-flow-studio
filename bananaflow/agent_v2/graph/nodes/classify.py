from __future__ import annotations

import json
import re
from typing import Any


_STORYBOARD_KEYWORDS = ("分镜", "故事板", "storyboard", "shot list", "镜头脚本", "镜头设计")
_PROMISE_MARKERS = ("我将", "我会", "为您生成", "为你生成", "调用", "分镜草稿", "故事板设计工具")


def _build_coordinator_prompt(state: dict, capability_catalog: list[dict]) -> str:
    from agent_v2.gateway.prompts import coordinator_system_prompt
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
    return coordinator_system_prompt() + "\n\n" + _json.dumps(payload, ensure_ascii=False)


def _call_llm_coordinator(state: dict) -> str:
    """Call the LLM and return raw JSON string. Raises on failure."""
    from agent_v2.gateway.catalog import build_capability_catalog
    from core.config import AGENT_MODEL_HTTP_PROXY, AGENT_MODEL_HTTPS_PROXY, MODEL_AGENT

    authorization = str(state.get("member_authorization") or "").strip()
    catalog = build_capability_catalog()
    full_prompt = _build_coordinator_prompt(state, catalog)

    if authorization:
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
            "_clarification_question": None,
            "trace": list(state.get("trace") or []) + [
                {"type": "CLASSIFY_INTENT", "intent": "answer_only", "rule": "fallback"}
            ],
        }

    action = str(payload.get("action") or "answer_only")
    tool_name = str(payload.get("tool_name") or "").strip()
    tool_args = dict(payload.get("tool_args") or {})

    # Guard: storyboard promise → force tool_call
    if _looks_like_storyboard_request(state) and _decision_is_promise_only(payload):
        action = "tool_call"
        tool_name = "storyboard.design"
        tool_args = _extract_storyboard_args(state)
        rule = "guard.storyboard_tool_call"
    elif action == "tool_call" and tool_name in {"storyboard.design", "agent_storyboard_design"}:
        args = _extract_storyboard_args(state)
        args.update({k: v for k, v in tool_args.items() if v not in (None, "", [], {})})
        tool_args = args
        rule = "llm_coordinator"
    else:
        rule = "llm_coordinator"

    clarification_question = (
        str(payload.get("clarification_question") or "").strip()
        if action == "clarify" else None
    )

    return {
        "intent": action,
        "intent_confidence": float(payload.get("confidence") or 1.0),
        "intent_reason": str(payload.get("reason") or "").strip(),
        "tool_name": tool_name,
        "tool_args": tool_args,
        "_clarification_question": clarification_question,
        "trace": list(state.get("trace") or []) + [
            {"type": "CLASSIFY_INTENT", "intent": action, "rule": rule,
             "confidence": float(payload.get("confidence") or 1.0)}
        ],
    }
