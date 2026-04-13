# bananaflow/agent/planner.py
import os
from fastapi import Request

from core.config import MODEL_AGENT
from core.logging import sys_logger
from schemas.api import AgentRequest
from agent.clarify import (
    detect_canvas_prompt_gap,
    extract_supplemental_prompt,
)
from agent.normalizer import normalize_patch
from agent.deterministic import deterministic_plan_or_patch

# legacy 原实现你可以保留为 _agent_plan_legacy(req, request)
from agent.planner_legacy import agent_plan_legacy_impl  # 你也可以不拆文件，自己改名即可


def _planner_provider(model: str) -> str:
    return "ollama" if str(model or "").strip().lower().startswith("ollama:") else "google"


def agent_plan_impl(req: AgentRequest, request: Request) -> dict:
    req_id = getattr(request.state, "req_id", "noid")
    user_text = (req.prompt or "").strip()
    supplemental_prompt = extract_supplemental_prompt(user_text, getattr(req, "supplemental_prompt", "") or "")

    selected = None
    if getattr(req, "selected_artifact", None):
        sa = req.selected_artifact
        selected = sa.model_dump() if hasattr(sa, "model_dump") else sa

    nodes = req.current_nodes or []
    conns = req.current_connections or []

    pure_structure_mode = detect_canvas_prompt_gap(user_text, supplemental_prompt="")
    if pure_structure_mode and not supplemental_prompt:
        sys_logger.info(
            f"[{req_id}] agent_plan structure_only path=preflight "
            f"provider={_planner_provider(MODEL_AGENT)} model={MODEL_AGENT} mode={pure_structure_mode}"
        )
        out = deterministic_plan_or_patch(
            user_text,
            selected,
            nodes,
            conns,
            fallback_refine=False,
        )
        return normalize_patch(out, structure_only=True)

    # ✅ 多画布：统一计算 thread_id（优先 canvas_id）
    canvas_id = (getattr(req, "canvas_id", "") or "").strip()
    thread_id = (getattr(req, "thread_id", "") or "").strip()
    if canvas_id:
        thread_id = canvas_id
    elif not thread_id:
        thread_id = f"t_{req_id}"

    use_langgraph = os.getenv("USE_LANGGRAPH", "0") == "1"
    if use_langgraph:
        try:
            from agent.graph import plan_with_langgraph

            out = plan_with_langgraph(
                req_id=req_id,
                user_prompt=user_text,
                supplemental_prompt=supplemental_prompt,
                selected_artifact=selected,
                current_nodes=nodes,
                current_connections=conns,
                thread_id=thread_id,
            )

            sys_logger.info(
                f"[{req_id}] agent_plan path=langgraph thread_id={thread_id} "
                f"provider={_planner_provider(MODEL_AGENT)} model={MODEL_AGENT}"
            )
            return normalize_patch(out)

        except Exception as e:
            sys_logger.error(f"[{req_id}] LangGraph plan failed, fallback to legacy: {e}")

    # legacy
    try:
        sys_logger.info(
            f"[{req_id}] agent_plan path=legacy thread_id={thread_id} "
            f"provider={_planner_provider(MODEL_AGENT)} model={MODEL_AGENT}"
        )
        return agent_plan_legacy_impl(req, request)
    except Exception as e:
        sys_logger.error(f"[{req_id}] Legacy agent plan failed: {e}")
        out = deterministic_plan_or_patch(user_text, selected, nodes, conns, fallback_refine=True)
        return normalize_patch(out)
