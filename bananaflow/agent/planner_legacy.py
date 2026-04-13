import json
from fastapi import Request
from google.genai import types

from core.logging import sys_logger
from core.config import MODEL_AGENT, AGENT_MODEL_HTTP_PROXY, AGENT_MODEL_HTTPS_PROXY
from core.rate_limit import run_agent_call
from services.genai_client import get_client, generate_content_with_proxy
from schemas.agent import AgentOut
from agent.system_prompt import agent_system_prompt
from agent.normalizer import safe_json_load, normalize_patch
from agent.context import collect_subgraph_ids, compact_nodes, compact_conns
from agent.deterministic import deterministic_plan_or_patch
from agent.clarify import backfill_missing_prompt_from_user_input, build_missing_prompt_clarification, extract_supplemental_prompt
from agent.graph import _validate_business_rules, _validate_structural_sanity


def _planner_provider(model: str) -> str:
    return "ollama" if str(model or "").strip().lower().startswith("ollama:") else "google"

def agent_plan_legacy_impl(req, request: Request) -> dict:
    req_id = request.state.req_id
    user_text = (req.prompt or "").strip()
    supplemental_prompt = extract_supplemental_prompt(user_text, getattr(req, "supplemental_prompt", "") or "")
    selected = None
    if getattr(req, "selected_artifact", None):
        sa = req.selected_artifact
        selected = sa.model_dump() if hasattr(sa, "model_dump") else sa
    nodes = req.current_nodes or []
    conns = req.current_connections or []

    client = get_client()
    if client is None:
        out = deterministic_plan_or_patch(user_text, selected, nodes, conns, fallback_refine=True)
        return normalize_patch(out)

    keep_ids = None
    if selected and selected.get("fromNodeId"):
        keep_ids = collect_subgraph_ids(selected["fromNodeId"], nodes, conns, depth=2, max_nodes=40)

    payload = {
        "user_prompt": user_text,
        "supplemental_prompt": supplemental_prompt or None,
        "selected_artifact": selected,
        "current_nodes": compact_nodes(nodes, keep_ids=keep_ids, limit=60),
        "current_connections": compact_conns(conns, keep_ids=keep_ids, limit=80),
    }

    def _call():
        sys_logger.info(
            f"[{req_id}] agent_plan llm_call step=legacy_generate "
            f"provider={_planner_provider(MODEL_AGENT)} model={MODEL_AGENT}"
        )
        resp = generate_content_with_proxy(
            model=MODEL_AGENT,
            contents=[types.Part(text=agent_system_prompt()), types.Part(text=json.dumps(payload, ensure_ascii=False))],
            config=types.GenerateContentConfig(
                temperature=0.0,
                max_output_tokens=1200,
                response_mime_type="application/json",
            ),
            http_proxy=AGENT_MODEL_HTTP_PROXY,
            https_proxy=AGENT_MODEL_HTTPS_PROXY,
        )
        txt = resp.candidates[0].content.parts[0].text
        raw = safe_json_load(txt)
        parsed = AgentOut.model_validate(raw)
        out = normalize_patch(
            backfill_missing_prompt_from_user_input(
                parsed.model_dump(),
                user_text,
                supplemental_prompt=supplemental_prompt,
            )
        )
        _validate_business_rules(out)
        _validate_structural_sanity(
            {
                "user_prompt": user_text,
                "compact_nodes": payload["current_nodes"],
                "compact_conns": payload["current_connections"],
            },
            out,
        )
        return out

    try:
        return run_agent_call(_call)
    except Exception as e:
        msg = str(e)
        sys_logger.error(f"[{req_id}] Agent Plan Error: {msg}")
        clarification = build_missing_prompt_clarification(msg, user_text)
        if clarification is not None:
            sys_logger.info(f"[{req_id}] agent_plan clarify_missing_prompt path=legacy model={MODEL_AGENT}")
            return clarification
        out = deterministic_plan_or_patch(user_text, selected, nodes, conns, fallback_refine=True)
        return normalize_patch(out)
