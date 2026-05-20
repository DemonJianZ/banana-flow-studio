from __future__ import annotations

from typing import Any


def _run_canvas_planner(state: dict) -> dict:
    from agent.planner import agent_plan_impl
    from schemas.api import AgentRequest

    plan_req = AgentRequest(
        prompt=str(state.get("message") or ""),
        supplemental_prompt=state.get("supplemental_prompt"),
        current_nodes=list(state.get("current_nodes") or []),
        current_connections=list(state.get("current_connections") or []),
        selected_artifact=state.get("selected_artifact"),
        canvas_id=state.get("canvas_id"),
        thread_id=state.get("thread_id"),
    )
    # agent_plan_impl needs a Request object for req_id — use a stub
    from starlette.requests import Request as StarletteRequest
    stub_request = StarletteRequest({"type": "http", "method": "POST", "path": "/", "headers": []})
    stub_request.state.req_id = str(state.get("thread_id") or "noid")
    return dict(agent_plan_impl(plan_req, stub_request))


def execute_canvas_plan(state: dict) -> dict:
    trace = list(state.get("trace") or [])
    try:
        result = _run_canvas_planner(state)
    except Exception as exc:
        return {
            "exec_response_text": f"画布规划失败：{exc}",
            "exec_patches": [],
            "exec_warnings": [f"canvas_plan_error: {exc}"],
            "exec_data": {},
            "trace": trace + [{"type": "EXECUTE_CANVAS_PLAN", "ok": False, "error": str(exc)}],
        }

    patches = list(result.get("patch") or [])
    thought = str(result.get("thought") or "").strip()
    summary = str(result.get("summary") or result.get("response_text") or "").strip()

    return {
        "exec_response_text": summary,
        "exec_patches": patches,
        "exec_warnings": [],
        "exec_data": dict(result),
        "trace": trace + [{"type": "EXECUTE_CANVAS_PLAN", "ok": True, "patch_count": len(patches)}],
    }
