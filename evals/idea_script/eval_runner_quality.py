#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import sys
import time
from typing import Any, Dict, List


CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(os.path.dirname(CURRENT_DIR))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)


from bananaflow.agent.idea_script.config import IdeaScriptAgentConfig
from bananaflow.agent.idea_script.orchestrator import IdeaScriptOrchestrator
from bananaflow.agent.idea_script.schemas import IdeaScriptRequest
from bananaflow.quality.metrics_schema import build_quality_metrics


def _load_golden_set(path: str) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rows.append(json.loads(line))
    return rows


def _percentile(values: List[float], p: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(float(v) for v in values)
    if len(ordered) == 1:
        return round(ordered[0], 3)
    idx = int(round((len(ordered) - 1) * p))
    idx = max(0, min(len(ordered) - 1, idx))
    return round(float(ordered[idx]), 3)


def _stats(values: List[float]) -> Dict[str, float]:
    if not values:
        return {"avg": 0.0, "p50": 0.0, "p90": 0.0}
    avg = round(sum(float(v) for v in values) / float(max(len(values), 1)), 3)
    return {"avg": avg, "p50": _percentile(values, 0.5), "p90": _percentile(values, 0.9)}


def _count_distribution(values: List[Any]) -> Dict[str, int]:
    out: Dict[str, int] = {}
    for value in values:
        key = str(value)
        out[key] = out.get(key, 0) + 1
    return out


def build_quality_dashboard(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    eff_exportable: List[float] = []
    eff_missing_primary: List[float] = []
    eff_task_success: List[float] = []
    eff_storyboard_pass: List[float] = []

    effi_total_llm: List[float] = []
    effi_total_tools: List[float] = []
    effi_mcp_calls: List[float] = []
    effi_latency_ms: List[float] = []

    rob_infer_retry: List[float] = []
    rob_gen_retry: List[float] = []
    rob_story_retry: List[float] = []
    rob_mcp_errors: List[float] = []
    rob_budget_exhausted: List[float] = []

    safety_compliance_warning: List[float] = []
    safety_rewrite: List[float] = []
    safety_risk_levels: List[str] = []

    trajectory_scores: List[float] = []
    stage_aggregates: Dict[str, Dict[str, Any]] = {}
    task_type_aggregates: Dict[str, List[float]] = {}

    for row in list(rows or []):
        qm = dict(row.get("quality_metrics") or {})
        eff = dict(qm.get("effectiveness") or {})
        efficiency = dict(qm.get("efficiency") or {})
        robust = dict(qm.get("robustness") or {})
        safety = dict(qm.get("safety") or {})

        eff_exportable.append(float(eff.get("exportable_plan_rate") or 0.0))
        eff_missing_primary.append(float(eff.get("missing_primary_asset_count") or 0.0))
        eff_task_success.append(1.0 if bool(eff.get("task_success")) else 0.0)
        eff_storyboard_pass.append(1.0 if bool(eff.get("storyboard_pass")) else 0.0)

        effi_total_llm.append(float(efficiency.get("total_llm_calls") or 0.0))
        effi_total_tools.append(float(efficiency.get("total_tool_calls") or 0.0))
        effi_mcp_calls.append(float(efficiency.get("mcp_calls_count") or 0.0))
        effi_latency_ms.append(float(efficiency.get("latency_ms") or 0.0))

        rob_infer_retry.append(float(robust.get("inference_retry_count") or 0.0))
        rob_gen_retry.append(float(robust.get("generation_retry_count") or 0.0))
        rob_story_retry.append(float(robust.get("storyboard_retry_count") or 0.0))
        rob_mcp_errors.append(float(robust.get("mcp_tool_error_count") or 0.0))
        rob_budget_exhausted.append(1.0 if bool(robust.get("budget_exhausted")) else 0.0)

        safety_compliance_warning.append(1.0 if bool(safety.get("compliance_warning")) else 0.0)
        safety_rewrite.append(1.0 if bool(safety.get("rewrite_applied")) else 0.0)
        safety_risk_levels.append(str(safety.get("compliance_risk") or "low"))

        trajectory = dict(row.get("trajectory") or {})
        if trajectory:
            score = float(trajectory.get("evaluation_score") or 0.0)
            trajectory_scores.append(score)
            metadata = dict(trajectory.get("metadata") or {})
            task_type = str(metadata.get("task_type") or "SCRIPT")
            task_type_aggregates.setdefault(task_type, []).append(score)
            for stage in list(trajectory.get("stages") or []):
                stage_name = str(stage.get("stage_name") or "").strip() or "unknown"
                bucket = stage_aggregates.setdefault(stage_name, {"scores": [], "durations": [], "successes": []})
                bucket["scores"].append(float(stage.get("stage_score") or 0.0))
                bucket["durations"].append(float(stage.get("duration") or 0.0))
                bucket["successes"].append(1.0 if bool(stage.get("success")) else 0.0)

    per_stage: Dict[str, Any] = {}
    for stage_name, bucket in stage_aggregates.items():
        scores = list(bucket.get("scores") or [])
        durations = list(bucket.get("durations") or [])
        successes = list(bucket.get("successes") or [])
        per_stage[stage_name] = {
            "score": _stats(scores),
            "duration_sec": _stats(durations),
            "success_rate": round(sum(successes) / float(max(len(successes), 1)), 3),
            "count": len(successes),
        }

    by_task_type: Dict[str, Any] = {}
    for task_type, values in task_type_aggregates.items():
        by_task_type[task_type] = _stats([float(v) for v in values])

    return {
        "total": len(rows or []),
        "pillars": {
            "effectiveness": {
                "exportable_plan_rate": _stats(eff_exportable),
                "missing_primary_asset_count": _stats(eff_missing_primary),
                "task_success_rate": _stats(eff_task_success),
                "storyboard_pass_rate": _stats(eff_storyboard_pass),
            },
            "efficiency": {
                "total_llm_calls": _stats(effi_total_llm),
                "total_tool_calls": _stats(effi_total_tools),
                "mcp_calls_count": _stats(effi_mcp_calls),
                "latency_ms": _stats(effi_latency_ms),
            },
            "robustness": {
                "inference_retry_count": _stats(rob_infer_retry),
                "generation_retry_count": _stats(rob_gen_retry),
                "storyboard_retry_count": _stats(rob_story_retry),
                "mcp_tool_error_count": _stats(rob_mcp_errors),
                "budget_exhausted_rate": _stats(rob_budget_exhausted),
            },
            "safety": {
                "compliance_warning_rate": _stats(safety_compliance_warning),
                "rewrite_applied_rate": _stats(safety_rewrite),
            },
        },
        "trajectory": {
            "score": _stats(trajectory_scores),
            "per_stage": per_stage,
            "by_task_type": by_task_type,
            "runs_with_trajectory": len(trajectory_scores),
        },
        "distributions": {
            "safety.compliance_risk": _count_distribution(safety_risk_levels),
            "effectiveness.task_success": _count_distribution([bool(v >= 1.0) for v in eff_task_success]),
            "robustness.budget_exhausted": _count_distribution([bool(v >= 1.0) for v in rob_budget_exhausted]),
        },
    }


def main() -> int:
    golden_path = os.path.join(CURRENT_DIR, "golden_set.jsonl")
    cases = _load_golden_set(golden_path)

    config = IdeaScriptAgentConfig.from_env()
    config.scoring_enabled = (os.getenv("IDEA_SCRIPT_EVAL_SCORING_ENABLED", "1").strip() != "0")
    config.trajectory_eval_enabled = (os.getenv("BANANAFLOW_ENABLE_TRAJECTORY_EVAL", "0").strip() in {"1", "true", "yes", "on"})
    orchestrator = IdeaScriptOrchestrator(config=config)

    rows: List[Dict[str, Any]] = []
    for idx, case in enumerate(cases, start=1):
        case_id = str(case.get("id") or f"case_{idx}")
        product = str(case.get("product") or "").strip()
        started = time.perf_counter()
        trajectory_sink: List[Dict[str, Any]] = []
        out = orchestrator.run(
            IdeaScriptRequest(product=product),
            session_id=f"eval_{case_id}",
            tenant_id="eval",
            user_id="eval",
            trajectory_sink=trajectory_sink,
        )
        latency_ms = max(0, int((time.perf_counter() - started) * 1000))

        metrics = build_quality_metrics(
            response=out,
            session_id=f"eval_{case_id}",
            tenant_id="eval",
            user_id="eval",
            prompt_version=out.prompt_version,
            policy_version=out.policy_version,
            config_hash=out.config_hash,
            total_tool_calls=2,
            mcp_calls_count=(1 if config.asset_match_use_mcp else 0),
            latency_ms=latency_ms,
            clarification_rate=None,
            asset_match_use_mcp=config.asset_match_use_mcp,
        )
        payload = metrics.model_dump(mode="json")

        row = {
            "id": case_id,
            "task_type": "SCRIPT",
            "product": product,
            "quality_metrics": payload,
            "trajectory": (trajectory_sink[0] if trajectory_sink else None),
        }
        rows.append(row)
        print(json.dumps(row, ensure_ascii=False))

    summary = build_quality_dashboard(rows)
    print("\n# quality_summary")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
