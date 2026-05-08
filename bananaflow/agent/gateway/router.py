from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from agent.tools import build_builtin_registry

from .rules import build_shortcut_decision
from .schemas import AgentMessageRequest, CoordinatorDecision


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
        from ...core.config import AGENT_MODEL_HTTP_PROXY, AGENT_MODEL_HTTPS_PROXY, MODEL_AGENT
        from ...services.genai_client import call_genai_retry_with_proxy
    except Exception:  # pragma: no cover
        from core.config import AGENT_MODEL_HTTP_PROXY, AGENT_MODEL_HTTPS_PROXY, MODEL_AGENT
        from services.genai_client import call_genai_retry_with_proxy
    return {
        "types": types,
        "call_genai_retry_with_proxy": call_genai_retry_with_proxy,
        "MODEL_AGENT": MODEL_AGENT,
        "AGENT_MODEL_HTTP_PROXY": AGENT_MODEL_HTTP_PROXY,
        "AGENT_MODEL_HTTPS_PROXY": AGENT_MODEL_HTTPS_PROXY,
    }


def build_capability_catalog() -> List[Dict[str, Any]]:
    registry = build_builtin_registry()
    catalog: List[Dict[str, Any]] = []
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
    virtual_capabilities = [
        {
            "name": "general_answer",
            "description": "Use this virtual capability to answer naturally without tools when no system action is needed.",
            "category": "virtual",
            "enabled": True,
            "timeout_seconds": None,
            "retry": {"max_attempts": 1},
            "cost_level": "low",
            "tags": ["chat", "general_answer"],
            "annotations": {"readOnlyHint": True, "idempotentHint": False, "destructiveHint": False},
            "input_schema": {"type": "object", "properties": {"message": {"type": "string"}}, "additionalProperties": True},
        },
        {
            "name": "canvas_planner",
            "description": "Use this virtual capability when the user needs canvas patch generation, node planning, or workflow edits.",
            "category": "virtual",
            "enabled": True,
            "timeout_seconds": None,
            "retry": {"max_attempts": 1},
            "cost_level": "medium",
            "tags": ["canvas", "planner", "workflow"],
            "annotations": {"readOnlyHint": False, "idempotentHint": False, "destructiveHint": False},
            "input_schema": {"type": "object", "properties": {"message": {"type": "string"}}, "additionalProperties": True},
        },
    ]
    return virtual_capabilities + list(catalog)


def _summarize_canvas_state(req: AgentMessageRequest) -> Dict[str, Any]:
    nodes = list(req.current_nodes or [])
    conns = list(req.current_connections or [])
    node_types: List[str] = []
    seen = set()
    for node in nodes[:20]:
        node_type = str(node.get("type") or "").strip()
        if node_type and node_type not in seen:
            seen.add(node_type)
            node_types.append(node_type)
    return {
        "node_count": len(nodes),
        "connection_count": len(conns),
        "node_types": node_types,
        "canvas_id": str(req.canvas_id or "").strip() or None,
    }


def _summarize_selected_artifact(req: AgentMessageRequest) -> Dict[str, Any]:
    artifact = dict(req.selected_artifact or {})
    if not artifact:
        return {}
    return {
        "kind": str(artifact.get("kind") or "").strip() or "image",
        "fromNodeId": str(artifact.get("fromNodeId") or "").strip() or None,
        "url_present": bool(str(artifact.get("url") or "").strip()),
    }


def _coordinator_system_prompt() -> str:
    return (
        "你是 Bananaflow Agent Gateway 的协调器，一个像私人助理一样自然对话的系统。\n"
        "不要机械地把每条消息归类成固定 intent。默认优先自然回答，只有在系统能力明显有帮助时才调用工具或规划器。\n\n"
        "你只能输出以下 action 之一：\n"
        "- answer_only: 直接自然回答，不调用系统能力\n"
        "- clarify: 需要追问用户缺失信息\n"
        "- tool_call: 明确需要调用一个工具，且单步足够\n"
        "- canvas_plan: 明确需要对画布/节点/工作流生成 patch 规划\n"
        "- workflow_plan: 需要多步执行，返回 steps，并按可支持步骤顺序执行\n\n"
        "规则：\n"
        "1. 如果用户只是提问、寒暄、泛讨论，优先 answer_only。\n"
        "2. 只有当 capability catalog 中某个工具明显比自然回答更有帮助时，才输出 tool_call。\n"
        "3. 如果没有明显匹配工具，不要硬选工具，输出 answer_only。\n"
        "4. 如果用户要改画布/搭节点/编排工作流，输出 canvas_plan。\n"
        "5. 如果用户任务包含多个连续系统步骤，输出 workflow_plan，并给出 steps。\n"
        "6. clarification_question 只在 clarify 时填写。\n"
        "7. answer 字段在 answer_only 或 workflow_plan 时可填写给用户的自然语言回复。\n"
        "8. tool_name 必须来自 capability catalog；不要编造不存在的能力。\n\n"
        "必须只输出 JSON，格式如下："
        "{\"action\":\"answer_only|clarify|tool_call|canvas_plan|workflow_plan\",\"reason\":\"...\",\"confidence\":0.0,"
        "\"matched_capabilities\":[\"...\"],\"answer\":\"...\",\"clarification_question\":\"...\","
        "\"tool_name\":\"...\",\"tool_args\":{},\"steps\":[{\"action\":\"tool_call|canvas_plan\",\"tool_name\":\"...\",\"tool_args\":{},\"reason\":\"...\"}]}"
    )


def _coordinator_payload(req: AgentMessageRequest) -> Dict[str, Any]:
    return {
        "message": str(req.message or "").strip(),
        "recent_messages": list(req.recent_messages or [])[-8:],
        "canvas_state_summary": _summarize_canvas_state(req),
        "selected_artifact_summary": _summarize_selected_artifact(req),
        "mode": str(req.mode or "").strip() or None,
        "product": str(req.product or "").strip() or None,
        "task_mode": str(req.task_mode or "").strip() or None,
        "capability_catalog": build_capability_catalog(),
    }


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


def _coordinate_with_llm(req: AgentMessageRequest) -> Optional[CoordinatorDecision]:
    runtime = _load_coordinator_runtime()
    types = runtime["types"]
    call_genai_retry_with_proxy = runtime["call_genai_retry_with_proxy"]
    response = call_genai_retry_with_proxy(
        contents=[
            types.Part(text=_coordinator_system_prompt()),
            types.Part(text=json.dumps(_coordinator_payload(req), ensure_ascii=False)),
        ],
        config=types.GenerateContentConfig(
            temperature=0.0,
            max_output_tokens=800,
            response_mime_type="application/json",
        ),
        req_id="agent_gateway_coordinator",
        model=runtime["MODEL_AGENT"],
        http_proxy=runtime["AGENT_MODEL_HTTP_PROXY"],
        https_proxy=runtime["AGENT_MODEL_HTTPS_PROXY"],
    )
    text = str(getattr(response, "text", "") or "").strip()
    if not text:
        candidates = getattr(response, "candidates", None) or []
        if candidates:
            text = str(getattr(candidates[0].content.parts[0], "text", "") or "").strip()
    return _parse_coordinator_output(text)


def coordinate_agent_message(req: AgentMessageRequest) -> CoordinatorDecision:
    shortcut = build_shortcut_decision(req)
    if shortcut is not None:
        return shortcut

    try:
        decision = _coordinate_with_llm(req)
        if decision is not None:
            return decision
    except Exception:
        pass

    return CoordinatorDecision(
        action="answer_only",
        reason="coordinator_fallback",
        confidence=0.35,
        matched_rule="fallback.answer_only",
        forced=False,
        matched_capabilities=["general_answer"],
        answer=None,
    )


def route_agent_message_intent(req: AgentMessageRequest) -> CoordinatorDecision:
    return coordinate_agent_message(req)
