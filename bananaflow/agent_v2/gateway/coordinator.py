from __future__ import annotations

import json
import re
from typing import Any, Optional

from .catalog import build_capability_catalog
from .context import build_gateway_context
from .prompts import coordinator_system_prompt, format_coordinator_payload
from .schemas import AgentMessageRequest, CoordinatorDecision
from ..storyboard.script_table import looks_like_storyboard_script_table, parse_storyboard_script_table, format_script_rows_for_prompt


def _load_coordinator_runtime():
    try:
        from google.genai import types
    except Exception:  # pragma: no cover
        class _FallbackPart:
            def __init__(self, text: str = "") -> None:
                self.text = text

        class _FallbackGenerateContentConfig:
            def __init__(self, **kwargs: Any) -> None:
                for key, value in kwargs.items():
                    setattr(self, key, value)

        class _FallbackTypes:
            Part = _FallbackPart
            GenerateContentConfig = _FallbackGenerateContentConfig

        types = _FallbackTypes()

    try:
        from core.config import AGENT_MODEL_HTTP_PROXY, AGENT_MODEL_HTTPS_PROXY, MODEL_AGENT
        from services.genai_client import call_genai_retry_with_proxy
    except Exception:  # pragma: no cover
        from bananaflow.core.config import AGENT_MODEL_HTTP_PROXY, AGENT_MODEL_HTTPS_PROXY, MODEL_AGENT
        from bananaflow.services.genai_client import call_genai_retry_with_proxy
    return {
        "types": types,
        "call_genai_retry_with_proxy": call_genai_retry_with_proxy,
        "MODEL_AGENT": MODEL_AGENT,
        "AGENT_MODEL_HTTP_PROXY": AGENT_MODEL_HTTP_PROXY,
        "AGENT_MODEL_HTTPS_PROXY": AGENT_MODEL_HTTPS_PROXY,
    }


def _load_ai_chat_text_client():
    try:
        from ...services.ai_chat_client import call_ai_chat_text
    except Exception:  # pragma: no cover
        from services.ai_chat_client import call_ai_chat_text
    return call_ai_chat_text


_STORYBOARD_EDIT_MARKERS = (
    "改",
    "修改",
    "调整",
    "优化",
    "重写",
    "强化",
    "弱化",
    "增加",
    "补充",
    "删除",
    "细化",
    "丰富",
    "延长",
    "缩短",
    "换成",
    "替换",
    "重做",
)


def _is_selected_storyboard_edit(req: AgentMessageRequest) -> bool:
    selected = req.selected_artifact or {}
    if str(selected.get("kind") or "").strip() != "storyboard_selection":
        return False
    text = str(req.message or "").strip()
    if not text:
        return False
    return any(marker in text for marker in _STORYBOARD_EDIT_MARKERS)


def _shortcut_decision(req: AgentMessageRequest) -> Optional[CoordinatorDecision]:
    script_doc = _find_storyboard_script_document(req)
    if script_doc:
        return CoordinatorDecision(
            action="tool_call",
            reason="uploaded_storyboard_script_table",
            confidence=1.0,
            matched_rule="attachment.storyboard_script_table",
            forced=True,
            matched_capabilities=["storyboard.design"],
            tool_name="storyboard.design",
            tool_args=_extract_storyboard_args(req),
        )

    force_action = str(req.force_action or "").strip()
    if force_action:
        if force_action == "tool_call" and str(req.mode or "").strip().lower() == "text2img":
            return CoordinatorDecision(
                action="tool_call",
                reason="force_action",
                confidence=1.0,
                matched_rule="force_action",
                forced=True,
                matched_capabilities=["prompt.polish"],
                tool_name="prompt.polish",
                tool_args={"prompt": str(req.message or "").strip(), "mode": "text2img"},
            )
        return CoordinatorDecision(
            action=force_action,  # type: ignore[arg-type]
            reason="force_action",
            confidence=1.0,
            matched_rule="force_action",
            forced=True,
            matched_capabilities=(["canvas_planner"] if force_action == "canvas_plan" else ["general_answer"] if force_action == "answer_only" else []),
        )

    ui_action = str(req.ui_action or "").strip().lower()
    if ui_action == "canvas_plan":
        return CoordinatorDecision(
            action="canvas_plan",
            reason="ui_action",
            confidence=1.0,
            matched_rule="ui_action.canvas_plan",
            forced=True,
            matched_capabilities=["canvas_planner"],
        )
    if ui_action == "prompt_polish":
        return CoordinatorDecision(
            action="tool_call",
            reason="ui_action",
            confidence=1.0,
            matched_rule="ui_action.prompt_polish",
            forced=True,
            matched_capabilities=["prompt.polish"],
            tool_name="prompt.polish",
            tool_args={
                "prompt": str(req.message or "").strip(),
                "mode": str(req.mode or "text2img").strip() or "text2img",
            },
        )
    if _is_selected_storyboard_edit(req):
        return CoordinatorDecision(
            action="canvas_plan",
            reason="selected_storyboard_edit",
            confidence=1.0,
            matched_rule="selection.storyboard_edit",
            forced=True,
            matched_capabilities=["canvas_planner"],
        )
    return None


def _parse_coordinator_output(text: str) -> Optional[CoordinatorDecision]:
    raw = str(text or "").strip()
    if not raw:
        return None
    cleaned = raw.replace("```json", "").replace("```", "").strip()
    try:
        payload = json.loads(cleaned)
    except Exception:
        return None
    if not isinstance(payload, dict):
        return None
    try:
        decision = CoordinatorDecision.model_validate(payload)
    except Exception:
        return None
    return decision.model_copy(update={"matched_rule": "llm_coordinator", "forced": False})


_STORYBOARD_KEYWORDS = (
    "分镜",
    "故事板",
    "storyboard",
    "shot list",
    "镜头脚本",
    "镜头设计",
)
_PROMISE_MARKERS = (
    "我将",
    "我会",
    "为您生成",
    "为你生成",
    "调用",
    "分镜草稿",
    "故事板设计工具",
)


def _collect_conversation_text(req: AgentMessageRequest) -> str:
    parts = [str(req.message or "").strip()]
    for item in list(req.recent_messages or [])[-8:]:
        text = str((item or {}).get("text") or "").strip()
        if text:
            parts.append(text)
    return "\n".join(part for part in parts if part)


def _looks_like_storyboard_request(req: AgentMessageRequest) -> bool:
    text = _collect_conversation_text(req).lower()
    return any(keyword in text for keyword in _STORYBOARD_KEYWORDS)


def _extract_storyboard_args(req: AgentMessageRequest) -> dict[str, Any]:
    text = _collect_conversation_text(req)
    current_message = str(req.message or "").strip()
    aspect_ratio_match = re.search(r"\b(21:9|16:9|9:16|4:3|3:4|1:1)\b", text)
    style_match = re.search(r"([^\n，。,；;]{2,24}?风格)", text)
    duration_match = re.search(r"(\d+(?:\.\d+)?)\s*(秒|s|sec|分钟|分)", text, re.IGNORECASE)
    target_duration_sec = None
    if duration_match:
        value = float(duration_match.group(1))
        unit = duration_match.group(2).lower()
        target_duration_sec = value * 60.0 if unit in {"分钟", "分"} else value
    script_document = _find_storyboard_script_document(req)
    script_table = ""
    script_rows: list[dict[str, str]] = []
    script_table_name = ""
    if script_document:
        script_table = str(script_document.get("text_content") or "").strip()
        script_table_name = str(script_document.get("name") or "").strip()
        script_rows = format_script_rows_for_prompt(parse_storyboard_script_table(script_table))
    else:
        direct_message_table = str(req.message or "").strip()
        parsed_message_rows = parse_storyboard_script_table(direct_message_table)
        if parsed_message_rows:
            script_table = direct_message_table
            script_table_name = "pasted_storyboard_script.txt"
            script_rows = format_script_rows_for_prompt(parsed_message_rows)
    brief_text = text
    if script_table:
        brief_text = current_message or "请根据这份分镜头脚本整理成故事板"
    return {
        "brief": str(brief_text or "").strip(),
        "style": str(style_match.group(1) if style_match else "").strip(),
        "aspect_ratio": str(aspect_ratio_match.group(1) if aspect_ratio_match else "16:9").strip() or "16:9",
        "target_duration_sec": float(target_duration_sec or 30.0),
        "language": "zh-CN",
        "script_table": script_table,
        "script_table_name": script_table_name,
        "script_rows": script_rows,
    }


def _find_storyboard_script_document(req: AgentMessageRequest) -> dict[str, Any] | None:
    for item in list(req.uploaded_documents or []):
        doc = dict(item or {})
        text_content = str(doc.get("text_content") or "").strip()
        name = str(doc.get("name") or "").strip()
        lower_name = name.lower()
        kind = str(doc.get("kind") or "").strip().lower()
        if kind == "storyboard_script_table":
            return doc
        if lower_name.endswith((".csv", ".tsv")) and (
            "storyboard" in lower_name or "shot" in lower_name or "scene" in lower_name or "分镜" in name or "镜头" in name
        ):
            doc["kind"] = "storyboard_script_table"
            return doc
        if not text_content:
            continue
        if looks_like_storyboard_script_table(text_content, name):
            return doc
        parsed_rows = parse_storyboard_script_table(text_content)
        if parsed_rows:
            doc["kind"] = "storyboard_script_table"
            return doc
    return None


def _decision_is_promise_only(decision: CoordinatorDecision) -> bool:
    if decision.action != "answer_only":
        return False
    answer = str(decision.answer or "").strip()
    if not answer:
        return False
    return any(marker in answer for marker in _PROMISE_MARKERS)


def _looks_like_storyboard_script_message(req: AgentMessageRequest) -> bool:
    message = str(req.message or "").strip()
    if not message:
        return False
    return looks_like_storyboard_script_table(message, "pasted_storyboard_script.txt") or bool(
        parse_storyboard_script_table(message)
    )


def _apply_storyboard_guard(req: AgentMessageRequest, decision: CoordinatorDecision) -> CoordinatorDecision:
    if decision.action == "tool_call":
        tool_name = str(decision.tool_name or "").strip()
        matched = [str(item or "").strip() for item in list(decision.matched_capabilities or [])]
        if tool_name in {"storyboard.design", "agent_storyboard_design"} or "storyboard.design" in matched:
            args = dict(_extract_storyboard_args(req))
            args.update({key: value for key, value in dict(decision.tool_args or {}).items() if value not in (None, "", [], {})})
            return decision.model_copy(update={"tool_args": args})
        return decision

    if _looks_like_storyboard_script_message(req) and decision.action in {"answer_only", "clarify"}:
        return CoordinatorDecision(
            action="tool_call",
            reason="storyboard_script_message_guard",
            confidence=max(0.8, float(decision.confidence or 0.0)),
            matched_rule="guard.storyboard_script_message",
            forced=False,
            matched_capabilities=["storyboard.design"],
            answer=str(decision.answer or "").strip(),
            tool_name="storyboard.design",
            tool_args=_extract_storyboard_args(req),
        )

    if _looks_like_storyboard_request(req) and _decision_is_promise_only(decision):
        return CoordinatorDecision(
            action="tool_call",
            reason="storyboard_promise_guard",
            confidence=max(0.8, float(decision.confidence or 0.0)),
            matched_rule="guard.storyboard_tool_call",
            forced=False,
            matched_capabilities=["storyboard.design"],
            answer=str(decision.answer or "").strip(),
            tool_name="storyboard.design",
            tool_args=_extract_storyboard_args(req),
        )
    return decision


def _coordinate_with_llm(req: AgentMessageRequest, *, authorization: str = "") -> Optional[CoordinatorDecision]:
    runtime = _load_coordinator_runtime()
    context = build_gateway_context(req)
    capability_catalog = build_capability_catalog()
    full_prompt = f"{coordinator_system_prompt()}\n\n{format_coordinator_payload(context, capability_catalog)}"
    auth = str(authorization or "").strip()
    if auth:
        response = _load_ai_chat_text_client()(
            message=full_prompt,
            authorization=auth,
        )
        return _parse_coordinator_output(response.text)

    types = runtime["types"]
    call_genai_retry_with_proxy = runtime["call_genai_retry_with_proxy"]
    response = call_genai_retry_with_proxy(
        contents=[
            types.Part(text=coordinator_system_prompt()),
            types.Part(text=format_coordinator_payload(context, capability_catalog)),
        ],
        config=types.GenerateContentConfig(
            temperature=0.0,
            max_output_tokens=800,
            response_mime_type="application/json",
        ),
        req_id="agent_v2_gateway_coordinator",
        model=runtime["MODEL_AGENT"],
        http_proxy=runtime["AGENT_MODEL_HTTP_PROXY"],
        https_proxy=runtime["AGENT_MODEL_HTTPS_PROXY"],
    )
    text = str(getattr(response, "text", "") or "").strip()
    if not text:
        candidates = getattr(response, "candidates", None) or []
        if candidates:
            try:
                text = str(getattr(candidates[0].content.parts[0], "text", "") or "").strip()
            except Exception:
                text = ""
    return _parse_coordinator_output(text)


def coordinate_agent_message(req: AgentMessageRequest, *, authorization: str = "") -> CoordinatorDecision:
    shortcut = _shortcut_decision(req)
    if shortcut is not None:
        return shortcut
    try:
        decision = _coordinate_with_llm(req, authorization=authorization)
        if decision is not None:
            return _apply_storyboard_guard(req, decision)
    except Exception:
        pass
    return CoordinatorDecision(
        action="answer_only",
        reason="coordinator_fallback",
        confidence=0.35,
        matched_rule="fallback.answer_only",
        forced=False,
        matched_capabilities=["general_answer"],
    )
