from __future__ import annotations

from langgraph.graph import END, START, StateGraph

from .asset_matcher import bind_assets_to_shots
from .canvas_builder import build_canvas_patch
from .extractor import combine_source_text
from .llm_decomposer import decompose_shots
from .llm_prompt_optimizer import optimize_prompts
from .schemas import ShotWorkflowState
from .validator import validate_patch


def _node_intake(state: ShotWorkflowState) -> dict:
    args = dict(state.get("args") or {})
    source_text, docs = combine_source_text(args)
    max_shots = max(1, min(24, int(args.get("max_shots") or 12)))
    return {
        "source_text": source_text,
        "source_documents": docs,
        "aspect_ratio": str(args.get("aspect_ratio") or "16:9").strip() or "16:9",
        "mode_policy": str(args.get("mode_policy") or "auto").strip() or "auto",
        "max_shots": max_shots,
        "selected_artifact": dict(args.get("selected_artifact") or {}) or None,
        "current_nodes": list(args.get("current_nodes") or []),
        "current_connections": list(args.get("current_connections") or []),
        "authorization": str(args.get("authorization") or "").strip(),
        "trace": list(state.get("trace") or []) + [{"type": "SHOT_WORKFLOW_INTAKE", "chars": len(source_text), "documents": len(docs)}],
    }


def _node_llm_decompose(state: ShotWorkflowState) -> dict:
    source_text = str(state.get("source_text") or "")
    max_shots = int(state.get("max_shots") or 12)
    authorization = str(state.get("authorization") or "")
    shots, annotated_script = decompose_shots(source_text, max_shots=max_shots, authorization=authorization)
    warnings = list(state.get("warnings") or [])
    if not shots:
        warnings.append("no_shots_extracted")
    return {
        "shots": shots,
        "annotated_script": annotated_script,
        "warnings": warnings,
        "trace": list(state.get("trace") or []) + [
            {"type": "SHOT_WORKFLOW_DECOMPOSE", "shot_count": len(shots), "annotated_script_len": len(annotated_script)}
        ],
    }


def _node_bind_assets(state: ShotWorkflowState) -> dict:
    shots = [dict(s or {}) for s in list(state.get("shots") or [])]
    mode_policy = str(state.get("mode_policy") or "auto")
    selected_artifact = state.get("selected_artifact")
    shots = bind_assets_to_shots(shots, mode_policy=mode_policy, selected_artifact=selected_artifact)
    has_bindings = sum(
        1 for s in shots
        if list((s.get("asset_bindings") or {}).get("character_bindings") or [])
        or (s.get("asset_bindings") or {}).get("scene_binding")
    )
    return {
        "shots": shots,
        "trace": list(state.get("trace") or []) + [
            {"type": "SHOT_WORKFLOW_BIND_ASSETS", "shots_with_bindings": has_bindings}
        ],
    }


def _node_optimize_prompts(state: ShotWorkflowState) -> dict:
    shots = [dict(s or {}) for s in list(state.get("shots") or [])]
    aspect_ratio = str(state.get("aspect_ratio") or "16:9")
    authorization = str(state.get("authorization") or "")
    shots = optimize_prompts(shots, authorization=authorization)
    # Propagate aspect_ratio into prompt context if needed (optimizer uses it via shot data)
    return {
        "shots": shots,
        "trace": list(state.get("trace") or []) + [
            {"type": "SHOT_WORKFLOW_OPTIMIZE_PROMPTS", "shot_count": len(shots)}
        ],
    }


def _node_build_patch(state: ShotWorkflowState) -> dict:
    patch = build_canvas_patch(
        [dict(s or {}) for s in list(state.get("shots") or [])],
        aspect_ratio=str(state.get("aspect_ratio") or "16:9"),
        mode_policy=str(state.get("mode_policy") or "auto"),
        selected_artifact=state.get("selected_artifact"),
        current_nodes=list(state.get("current_nodes") or []),
    )
    return {
        "patch": patch,
        "trace": list(state.get("trace") or []) + [{"type": "SHOT_WORKFLOW_BUILD_PATCH", "patch_count": len(patch)}],
    }


def _node_validate(state: ShotWorkflowState) -> dict:
    warnings = list(state.get("warnings") or []) + validate_patch(list(state.get("patch") or []))
    return {
        "warnings": warnings,
        "trace": list(state.get("trace") or []) + [{"type": "SHOT_WORKFLOW_VALIDATE", "warning_count": len(warnings)}],
    }


def _node_finalize(state: ShotWorkflowState) -> dict:
    shot_count = len(list(state.get("shots") or []))
    shots_with_assets = sum(
        1 for s in list(state.get("shots") or [])
        if list(((s or {}).get("asset_bindings") or {}).get("character_bindings") or [])
    )
    if shot_count:
        asset_note = f"，{shots_with_assets} 个镜头自动绑定了角色资产" if shots_with_assets else ""
        summary = f"已为 {shot_count} 个镜头搭建出图工作流{asset_note}。"
    else:
        summary = "未识别到可搭建的镜头，请补充剧本或分镜描述。"
    return {
        "summary": summary,
        "trace": list(state.get("trace") or []) + [{"type": "SHOT_WORKFLOW_FINALIZE", "summary": summary}],
    }


def build_shot_workflow_graph():
    builder = StateGraph(ShotWorkflowState)
    builder.add_node("intake", _node_intake)
    builder.add_node("llm_decompose", _node_llm_decompose)
    builder.add_node("bind_assets", _node_bind_assets)
    builder.add_node("optimize_prompts", _node_optimize_prompts)
    builder.add_node("build_patch", _node_build_patch)
    builder.add_node("validate", _node_validate)
    builder.add_node("finalize", _node_finalize)
    builder.add_edge(START, "intake")
    builder.add_edge("intake", "llm_decompose")
    builder.add_edge("llm_decompose", "bind_assets")
    builder.add_edge("bind_assets", "optimize_prompts")
    builder.add_edge("optimize_prompts", "build_patch")
    builder.add_edge("build_patch", "validate")
    builder.add_edge("validate", "finalize")
    builder.add_edge("finalize", END)
    return builder.compile()


_SHOT_WORKFLOW_GRAPH = build_shot_workflow_graph()


def invoke_shot_workflow_graph(args: dict) -> dict:
    return dict(_SHOT_WORKFLOW_GRAPH.invoke({"args": dict(args or {}), "warnings": [], "trace": []}))
