from __future__ import annotations

import json
from typing import Any

# Maps classify_intent output to the target execute node.
# Routing is deterministic and is NOT subject to LLM override.
_INTENT_TO_TARGET_AGENT: dict[str, str] = {
    "answer_only": "execute_chitchat",
    "tool_call":   "execute_tool_call",
}

_INTENT_TO_EXPECTED_OUTPUT: dict[str, str] = {
    "answer_only": "message",
    "tool_call":   "tool_result",
}


def _deterministic_task_plan(state: dict) -> dict[str, Any]:
    intent = str(state.get("intent") or "answer_only")
    tool_name = str(state.get("tool_name") or "").strip()
    message = str(state.get("message") or "").strip()

    target_agent = _INTENT_TO_TARGET_AGENT.get(intent, "execute_chitchat")
    expected_output = _INTENT_TO_EXPECTED_OUTPUT.get(intent, "message")

    if tool_name in {"storyboard.design", "agent_storyboard_design"}:
        task_type = "generate_storyboard"
        action = "生成"
        expected_output = "async_task"
    elif tool_name in {"shot_workflow.compose", "agent_shot_workflow_compose"}:
        task_type = "compose_shot_image_workflow"
        action = "搭建"
        expected_output = "canvas_patch"
    elif tool_name == "prompt.polish":
        task_type = "polish_prompt"
        action = "润色"
    elif tool_name:
        task_type = f"tool.{tool_name}"
        action = "调用"
    else:
        task_type = "answer_question"
        action = "回答"

    return {
        "intent": intent,
        "target_agent": target_agent,
        "task_type": task_type,
        "user_goal": message,
        "target_object": None,
        "action": action,
        "required_context": [],
        "expected_output": expected_output,
        "risk_level": "low",
        "need_confirmation": False,
        "_source": "deterministic",
    }


_PLANNER_SYSTEM_PROMPT = (
    "你是 Bananaflow 任务规划器。根据用户消息和已知分类意图，提取标准任务对象（JSON）。\n\n"
    "输出字段说明：\n"
    "- intent: tool.storyboard|tool.polish|tool.other|answer.question\n"
    "- task_type: 具体操作类型（如 attach_character_asset / edit_canvas_node / generate_storyboard）\n"
    "- user_goal: 用自然语言简短描述用户真实目标（15字以内）\n"
    "- target_object: 目标对象（人物名、节点名、镜头编号等），无则 null\n"
    "- action: 操作动词（生成/修改/挂载/回答/润色）\n"
    "- required_context: 依赖上下文列表，取值范围 canvas_state|selected_artifact|conversation_history\n"
    "- expected_output: canvas_patch|message|async_task|tool_result\n"
    "- risk_level: low|medium|high（high 时 need_confirmation=true）\n"
    "- need_confirmation: true|false\n\n"
    "只输出 JSON，不要解释。target_agent 字段不需要输出（由系统决定）。"
)


def _call_planner_llm(state: dict) -> dict[str, Any] | None:
    try:
        from core.config import MODEL_AGENT, AGENT_MODEL_HTTP_PROXY, AGENT_MODEL_HTTPS_PROXY
        from google.genai import types
        from services.genai_client import call_genai_retry_with_proxy

        intent = str(state.get("intent") or "answer_only")
        tool_name = str(state.get("tool_name") or "").strip()
        message = str(state.get("message") or "").strip()
        canvas_node_count = (state.get("canvas_summary") or {}).get("node_count", 0)

        payload = {
            "classify_result": {
                "intent": intent,
                "tool_name": tool_name or None,
            },
            "message": message,
            "canvas_node_count": canvas_node_count,
        }

        full_prompt = _PLANNER_SYSTEM_PROMPT + "\n\n" + json.dumps(payload, ensure_ascii=False)

        response = call_genai_retry_with_proxy(
            contents=[types.Part(text=full_prompt)],
            config=types.GenerateContentConfig(
                temperature=0.0,
                max_output_tokens=400,
                response_mime_type="application/json",
            ),
            req_id="agent_v2_plan_task",
            model=MODEL_AGENT,
            http_proxy=AGENT_MODEL_HTTP_PROXY,
            https_proxy=AGENT_MODEL_HTTPS_PROXY,
        )
        text = str(getattr(response, "text", "") or "").strip()
        if not text:
            return None

        parsed = json.loads(text)
        if not isinstance(parsed, dict):
            return None
        return parsed
    except Exception:
        return None


def _merge_llm_into_plan(base: dict[str, Any], llm: dict[str, Any]) -> dict[str, Any]:
    # target_agent is excluded: routing must stay deterministic, not LLM-driven.
    safe_fields = {
        "intent", "task_type", "user_goal", "target_object",
        "action", "required_context", "expected_output",
        "risk_level", "need_confirmation",
    }
    merged = dict(base)
    for field in safe_fields:
        value = llm.get(field)
        if value is None:
            continue
        # Protect deterministic specialist outputs from LLM downgrade or stale labels.
        if field == "expected_output" and base.get("expected_output") in {"async_task", "canvas_patch"}:
            continue
        if base.get("task_type") == "compose_shot_image_workflow" and field in {"intent", "task_type", "action", "user_goal"}:
            continue
        # Discard unrecognised intent values — they would corrupt trace routing.
        if field == "intent" and value not in _INTENT_TO_TARGET_AGENT:
            continue
        merged[field] = value
    merged["_source"] = "llm"
    return merged


def plan_task(state: dict) -> dict:
    trace = list(state.get("trace") or [])

    base_plan = _deterministic_task_plan(state)
    if base_plan.get("task_type") == "compose_shot_image_workflow":
        task_plan = base_plan
    else:
        llm_result = _call_planner_llm(state)
        if llm_result is not None:
            task_plan = _merge_llm_into_plan(base_plan, llm_result)
        else:
            task_plan = base_plan

    trace_entry: dict[str, Any] = {
        "type": "PLAN_TASK",
        "target_agent": task_plan["target_agent"],
        "task_type": task_plan.get("task_type", ""),
        "user_goal": task_plan.get("user_goal", "")[:80],
        "source": task_plan.get("_source", "deterministic"),
    }

    return {
        "task_plan": task_plan,
        "trace": trace + [trace_entry],
    }
