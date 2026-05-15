from __future__ import annotations

from contextlib import nullcontext
from typing import Any, Callable, Dict, List, Optional, TypedDict

try:
    from langgraph.graph import END, START, StateGraph  # type: ignore
except Exception:  # pragma: no cover
    END = "__end__"
    START = "__start__"
    StateGraph = None  # type: ignore

from observability import get_tracer

from .designer import generate_stage_payload
from .repair import repair_storyboard_payload
from .validator import estimate_duration, validate_storyboard_payload


class StoryboardGraphState(TypedDict, total=False):
    brief: str
    script_table: str
    script_table_name: str
    script_rows: List[Dict[str, str]]
    style: str
    aspect_ratio: str
    target_duration_sec: float
    shot_duration_sec: float
    language: str
    constraints: List[str]
    entities: Dict[str, Any]
    scenes: List[Dict[str, Any]]
    storyboard: Dict[str, Any]
    errors: List[str]
    warnings: List[str]
    repair_count: int
    trace_sink: List[Dict[str, Any]]
    raw_outputs: Dict[str, Any]
    llm_generate: Callable[[str, str], Dict[str, Any]]
    req_id: str
    run_id: str


def _append_trace(state: StoryboardGraphState, event: Dict[str, Any]) -> None:
    trace_sink = state.setdefault("trace_sink", [])
    trace_sink.append(dict(event))


def _span(state: StoryboardGraphState, name: str):
    run_id = str(state.get("run_id") or "").strip()
    tracer = get_tracer()
    metadata = {"req_id": state.get("req_id"), "style": state.get("style"), "aspect_ratio": state.get("aspect_ratio")}
    if not run_id:
        return nullcontext()
    return tracer.span(name, run_id=run_id, input_data={"brief": state.get("brief")}, metadata=metadata)


def _node_intake(state: StoryboardGraphState) -> StoryboardGraphState:
    with _span(state, "storyboard.intake"):
        brief = str(state.get("brief") or "").strip()
        if not brief:
            raise ValueError("storyboard_brief_required")
        payload = generate_stage_payload(
            "intake",
            state,
            llm_generate=state.get("llm_generate"),
            req_id=str(state.get("req_id") or "storyboard"),
        )
        raw_outputs = dict(state.get("raw_outputs") or {})
        raw_outputs["intake"] = payload
        _append_trace(state, {"type": "storyboard.intake", "ok": True})
        return {
            "style": str(payload.get("style") or state.get("style") or "").strip(),
            "aspect_ratio": str(payload.get("aspect_ratio") or state.get("aspect_ratio") or "16:9").strip() or "16:9",
            "target_duration_sec": float(payload.get("target_duration_sec") or state.get("target_duration_sec") or 30.0),
            "shot_duration_sec": float(payload.get("shot_default_duration_sec") or state.get("shot_duration_sec") or 4.0),
            "language": str(payload.get("language") or state.get("language") or "zh-CN").strip() or "zh-CN",
            "constraints": list(payload.get("constraints") or state.get("constraints") or []),
            "storyboard": {"title": str(payload.get("title") or "").strip(), "creative_goal": str(payload.get("creative_goal") or "").strip()},
            "raw_outputs": raw_outputs,
        }


def _node_entity_design(state: StoryboardGraphState) -> StoryboardGraphState:
    with _span(state, "storyboard.entity_design"):
        payload = generate_stage_payload(
            "entity_design",
            state,
            llm_generate=state.get("llm_generate"),
            req_id=str(state.get("req_id") or "storyboard"),
        )
        raw_outputs = dict(state.get("raw_outputs") or {})
        raw_outputs["entity_design"] = payload
        _append_trace(state, {"type": "storyboard.entity_design", "ok": True})
        return {"entities": dict(payload or {}), "raw_outputs": raw_outputs}


def _node_scene_outline(state: StoryboardGraphState) -> StoryboardGraphState:
    with _span(state, "storyboard.scene_outline"):
        payload = generate_stage_payload(
            "scene_outline",
            state,
            llm_generate=state.get("llm_generate"),
            req_id=str(state.get("req_id") or "storyboard"),
        )
        raw_outputs = dict(state.get("raw_outputs") or {})
        raw_outputs["scene_outline"] = payload
        storyboard = dict(state.get("storyboard") or {})
        storyboard["title"] = str(payload.get("title") or storyboard.get("title") or "").strip()
        storyboard["global_notes"] = list(payload.get("global_notes") or [])
        storyboard["design_rationale"] = str(payload.get("design_rationale") or "").strip()
        _append_trace(state, {"type": "storyboard.scene_outline", "ok": True})
        return {"scenes": list(payload.get("scenes") or []), "storyboard": storyboard, "raw_outputs": raw_outputs}


def _node_shot_design(state: StoryboardGraphState) -> StoryboardGraphState:
    with _span(state, "storyboard.shot_design"):
        payload = generate_stage_payload(
            "shot_design",
            state,
            llm_generate=state.get("llm_generate"),
            req_id=str(state.get("req_id") or "storyboard"),
        )
        raw_outputs = dict(state.get("raw_outputs") or {})
        raw_outputs["shot_design"] = payload
        storyboard = dict(state.get("storyboard") or {})
        storyboard.update(
            {
                "title": str(storyboard.get("title") or payload.get("title") or "Storyboard Plan").strip(),
                "aspect_ratio": str(state.get("aspect_ratio") or "16:9").strip() or "16:9",
                "style": str(state.get("style") or "").strip(),
                "target_duration_sec": float(state.get("target_duration_sec") or 30.0),
                "shot_default_duration_sec": float(state.get("shot_duration_sec") or 4.0),
                "entities": dict(state.get("entities") or {}),
                "scenes": list(payload.get("scenes") or state.get("scenes") or []),
                "global_notes": list(storyboard.get("global_notes") or []),
                "design_rationale": str(storyboard.get("design_rationale") or "").strip(),
            }
        )
        storyboard["estimated_duration_sec"] = float(payload.get("estimated_duration_sec") or estimate_duration_payload(storyboard))
        _append_trace(state, {"type": "storyboard.shot_design", "ok": True})
        return {"storyboard": storyboard, "raw_outputs": raw_outputs}


def estimate_duration_payload(payload: Dict[str, Any]) -> float:
    total = 0.0
    for scene in list(payload.get("scenes") or []):
        for shot in list((scene or {}).get("shots") or []):
            try:
                total += float((shot or {}).get("duration_sec") or 0.0)
            except Exception:
                pass
    return round(total, 3)


def _node_validate(state: StoryboardGraphState) -> StoryboardGraphState:
    with _span(state, "storyboard.validate"):
        warnings = list(state.get("warnings") or [])
        try:
            plan, errors = validate_storyboard_payload(
                dict(state.get("storyboard") or {}),
                style=str(state.get("style") or "").strip(),
                aspect_ratio=str(state.get("aspect_ratio") or "16:9").strip() or "16:9",
                target_duration_sec=float(state.get("target_duration_sec") or 30.0),
                shot_duration_sec=float(state.get("shot_duration_sec") or 4.0),
                warnings=warnings,
            )
        except Exception as exc:
            _append_trace(state, {"type": "storyboard.validate", "ok": False, "errors": [str(exc)]})
            return {
                "errors": [str(exc)],
                "warnings": warnings,
            }
        _append_trace(state, {"type": "storyboard.validate", "ok": not bool(errors), "errors": list(errors)})
        return {
            "storyboard": plan.model_dump(mode="json"),
            "errors": list(errors),
            "warnings": warnings,
        }


def _node_repair(state: StoryboardGraphState) -> StoryboardGraphState:
    with _span(state, "storyboard.repair"):
        errors = list(state.get("errors") or [])
        repaired = repair_storyboard_payload(
            dict(state.get("storyboard") or {}),
            errors=errors,
            style=str(state.get("style") or "").strip(),
            aspect_ratio=str(state.get("aspect_ratio") or "16:9").strip() or "16:9",
            target_duration_sec=float(state.get("target_duration_sec") or 30.0),
            shot_duration_sec=float(state.get("shot_duration_sec") or 4.0),
            llm_generate=state.get("llm_generate"),
        )
        raw_outputs = dict(state.get("raw_outputs") or {})
        raw_outputs["repair"] = repaired
        _append_trace(state, {"type": "storyboard.repair", "ok": True, "errors": errors})
        return {
            "storyboard": repaired,
            "repair_count": int(state.get("repair_count") or 0) + 1,
            "raw_outputs": raw_outputs,
        }


def _node_finalize(state: StoryboardGraphState) -> StoryboardGraphState:
    with _span(state, "storyboard.finalize"):
        warnings = list(state.get("warnings") or [])
        errors = list(state.get("errors") or [])
        if errors:
            warnings.extend([f"validation_warning:{item}" for item in errors])
        repaired = repair_storyboard_payload(
            dict(state.get("storyboard") or {}),
            errors=errors,
            style=str(state.get("style") or "").strip(),
            aspect_ratio=str(state.get("aspect_ratio") or "16:9").strip() or "16:9",
            target_duration_sec=float(state.get("target_duration_sec") or 30.0),
            shot_duration_sec=float(state.get("shot_duration_sec") or 4.0),
            llm_generate=None,
        )
        plan, _ = validate_storyboard_payload(
            repaired,
            style=str(state.get("style") or "").strip(),
            aspect_ratio=str(state.get("aspect_ratio") or "16:9").strip() or "16:9",
            target_duration_sec=float(state.get("target_duration_sec") or 30.0),
            shot_duration_sec=float(state.get("shot_duration_sec") or 4.0),
            warnings=warnings,
        )
        _append_trace(state, {"type": "storyboard.finalize", "ok": True, "warnings": list(plan.warnings or [])})
        return {"storyboard": plan.model_dump(mode="json"), "warnings": list(plan.warnings or [])}


def _route_after_validate(state: StoryboardGraphState) -> str:
    errors = list(state.get("errors") or [])
    if not errors:
        return "finalize"
    if int(state.get("repair_count") or 0) < 1:
        return "repair"
    return "finalize"


def _build_storyboard_graph():
    if StateGraph is None:
        return None
    graph = StateGraph(StoryboardGraphState)
    graph.add_node("intake", _node_intake)
    graph.add_node("entity_design", _node_entity_design)
    graph.add_node("scene_outline", _node_scene_outline)
    graph.add_node("shot_design", _node_shot_design)
    graph.add_node("validate", _node_validate)
    graph.add_node("repair", _node_repair)
    graph.add_node("finalize", _node_finalize)
    graph.add_edge(START, "intake")
    graph.add_edge("intake", "entity_design")
    graph.add_edge("entity_design", "scene_outline")
    graph.add_edge("scene_outline", "shot_design")
    graph.add_edge("shot_design", "validate")
    graph.add_conditional_edges("validate", _route_after_validate, {"repair": "repair", "finalize": "finalize"})
    graph.add_edge("repair", "validate")
    graph.add_edge("finalize", END)
    return graph.compile()


_STORYBOARD_GRAPH = _build_storyboard_graph()


def run_storyboard_graph(initial_state: StoryboardGraphState) -> StoryboardGraphState:
    if _STORYBOARD_GRAPH is not None:
        return _STORYBOARD_GRAPH.invoke(dict(initial_state))

    state = dict(initial_state)
    state.update(_node_intake(state))
    state.update(_node_entity_design(state))
    state.update(_node_scene_outline(state))
    state.update(_node_shot_design(state))
    state.update(_node_validate(state))
    if _route_after_validate(state) == "repair":
        state.update(_node_repair(state))
        state.update(_node_validate(state))
    state.update(_node_finalize(state))
    return state  # pragma: no cover
