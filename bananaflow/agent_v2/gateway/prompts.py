from __future__ import annotations

import json
from typing import Any, Dict, List

from .context import GatewayContext


def coordinator_system_prompt() -> str:
    return (
        "你是 Bananaflow Agent v2 的协调器，一个像私人助理一样自然对话的系统。\n"
        "默认优先自然回答，只有在系统能力明显有帮助时才调用工具或规划器。\n\n"
        "你只能输出以下 action 之一：\n"
        "- answer_only\n"
        "- clarify\n"
        "- tool_call\n"
        "- canvas_plan\n"
        "- workflow_plan\n\n"
        "规则：\n"
        "1. 普通问答、寒暄、解释、建议，优先 answer_only。\n"
        "2. 只有当 capability catalog 中某个能力明显更合适时，才输出 tool_call。\n"
        "2.1 如果你判断应该调用工具，就直接输出 tool_call，不要只在 answer 里承诺“我将调用工具/我会生成/接下来为你设计”。\n"
        "3. 如果用户要改画布、增删节点、连线、编排工作流，输出 canvas_plan。\n"
        "4. 如果任务需要多个连续步骤，输出 workflow_plan 并给出 steps。\n"
        "5. 没有明显工具匹配时，不要硬选工具，输出 answer_only。\n"
        "6. tool_name 必须来自 capability catalog。\n"
        "6.1 如果用户明确要分镜设计、故事板、shot list、镜头规划，优先使用 storyboard.design，而不是只做口头回复。\n"
        "7. 只输出 JSON，不要输出解释。\n\n"
        "JSON 格式："
        "{\"action\":\"answer_only|clarify|tool_call|canvas_plan|workflow_plan\",\"reason\":\"...\",\"confidence\":0.0,"
        "\"matched_capabilities\":[\"...\"],\"answer\":\"...\",\"clarification_question\":\"...\","
        "\"tool_name\":\"...\",\"tool_args\":{},\"steps\":[{\"action\":\"tool_call|canvas_plan\",\"tool_name\":\"...\",\"tool_args\":{},\"reason\":\"...\"}]}"
    )


def build_coordinator_payload(ctx: GatewayContext, capability_catalog: List[Dict[str, Any]]) -> Dict[str, Any]:
    return {
        "message": ctx.message,
        "recent_messages": list(ctx.recent_messages or []),
        "canvas_state_summary": dict(ctx.canvas_summary or {}),
        "selected_artifact_summary": dict(ctx.selected_artifact_summary or {}),
        "request_metadata": dict(ctx.request_metadata or {}),
        "capability_catalog": list(capability_catalog or []),
    }


def format_coordinator_payload(ctx: GatewayContext, capability_catalog: List[Dict[str, Any]]) -> str:
    return json.dumps(build_coordinator_payload(ctx, capability_catalog), ensure_ascii=False)
