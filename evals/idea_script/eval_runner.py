#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import sys
from typing import Any, Dict, List


CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(os.path.dirname(CURRENT_DIR))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)


from bananaflow.agent.idea_script.config import IdeaScriptAgentConfig
from bananaflow.agent.idea_script.orchestrator import IdeaScriptOrchestrator
from bananaflow.agent.idea_script.schemas import IdeaScriptRequest


def _load_golden_set(path: str) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rows.append(json.loads(line))
    return rows


def _check_result(out: Any) -> Dict[str, Any]:
    topics = list(getattr(out, "topics", []) or [])
    angles = [getattr(t, "angle", None) for t in topics]
    checks = {
        "audience_context_exists": getattr(out, "audience_context", None) is not None,
        "topic_count_is_3": len(topics) == 3,
        "angles_unique": len(set(angles)) == len(angles),
        "angles_cover_required": set(angles) == {"persona", "scene", "misconception"},
        "has_blocking_issues": len(getattr(out, "blocking_issues", []) or []) > 0,
        "has_generation_warning": bool(getattr(out, "generation_warning", False)),
        "risk_level_valid": str(getattr(out, "risk_level", "low")) in {"low", "medium", "high"},
        "scoring_present": getattr(out, "rubric_scores", None) is not None,
        "context_pack_present": bool(getattr(out, "prompt_version", "")) and bool(getattr(out, "policy_version", "")) and bool(getattr(out, "config_hash", "")),
    }
    checks["pass_structure"] = all([
        checks["audience_context_exists"],
        checks["topic_count_is_3"],
        checks["angles_unique"],
        checks["angles_cover_required"],
    ])
    return checks


def _to_bucket(score: float) -> str:
    value = max(0.0, min(1.0, float(score)))
    if value < 0.2:
        return "0.0-0.2"
    if value < 0.4:
        return "0.2-0.4"
    if value < 0.6:
        return "0.4-0.6"
    if value < 0.8:
        return "0.6-0.8"
    return "0.8-1.0"


def main() -> int:
    golden_path = os.path.join(CURRENT_DIR, "golden_set.jsonl")
    cases = _load_golden_set(golden_path)
    config = IdeaScriptAgentConfig.from_env()
    config.scoring_enabled = (os.getenv("IDEA_SCRIPT_EVAL_SCORING_ENABLED", "1").strip() != "0")
    orchestrator = IdeaScriptOrchestrator(config=config)
    score_fields = [
        "persona_specificity_score",
        "hook_strength_score",
        "topic_diversity_score",
        "script_speakability_score",
        "compliance_score",
    ]

    results: List[Dict[str, Any]] = []
    for idx, case in enumerate(cases, start=1):
        product = str(case.get("product") or "").strip()
        case_id = case.get("id") or f"case_{idx}"
        out = orchestrator.run(IdeaScriptRequest(product=product))
        checks = _check_result(out)
        item = {
            "id": case_id,
            "product": product,
            "checks": checks,
            "confidence": out.audience_context.confidence,
            "inference_warning": out.inference_warning,
            "generation_warning": out.generation_warning,
            "retry_count": out.retry_count,
            "generation_retry_count": out.generation_retry_count,
            "blocking_issues": out.blocking_issues,
            "non_blocking_issues": out.non_blocking_issues,
            "failure_tags": out.failure_tags,
            "topic_count": len(out.topics),
            "risk_level": out.risk_level,
            "compliance_warning": out.compliance_warning,
            "risky_span_count": len(out.risky_spans or []),
            "safe_rewrite_applied": out.safe_rewrite_applied,
            "rubric_scores": (out.rubric_scores.model_dump() if out.rubric_scores else None),
            "prompt_version": out.prompt_version,
            "policy_version": out.policy_version,
            "config_hash": out.config_hash,
            "budget_exhausted": out.budget_exhausted,
            "budget_exhausted_reason": out.budget_exhausted_reason,
            "total_llm_calls": out.total_llm_calls,
        }
        results.append(item)
        print(json.dumps(item, ensure_ascii=False))

    score_values: Dict[str, List[float]] = {field: [] for field in score_fields}
    score_distribution: Dict[str, Dict[str, int]] = {field: {} for field in score_fields}
    failure_tag_score_assoc: Dict[str, Dict[str, Any]] = {}
    for row in results:
        scores = row.get("rubric_scores") or {}
        for field in score_fields:
            value = scores.get(field)
            if value is None:
                continue
            value = float(value)
            score_values[field].append(value)
            bucket = _to_bucket(value)
            score_distribution[field][bucket] = score_distribution[field].get(bucket, 0) + 1

        failure_tags = list(row.get("failure_tags") or [])
        for tag in failure_tags:
            stat = failure_tag_score_assoc.setdefault(
                tag,
                {"count": 0, "score_sum": {field: 0.0 for field in score_fields}, "scored_count": 0},
            )
            stat["count"] += 1
            if scores:
                stat["scored_count"] += 1
                for field in score_fields:
                    stat["score_sum"][field] += float(scores.get(field) or 0.0)

    failure_tag_score_summary: Dict[str, Dict[str, Any]] = {}
    for tag, stat in failure_tag_score_assoc.items():
        scored_count = int(stat["scored_count"])
        avg_scores = {}
        for field in score_fields:
            if scored_count > 0:
                avg_scores[field] = round(float(stat["score_sum"][field]) / scored_count, 3)
            else:
                avg_scores[field] = None
        failure_tag_score_summary[tag] = {
            "count": int(stat["count"]),
            "scored_count": scored_count,
            "avg_scores": avg_scores,
        }

    summary = {
        "total": len(results),
        "pass_structure_count": sum(1 for r in results if r["checks"]["pass_structure"]),
        "inference_warning_count": sum(1 for r in results if r["inference_warning"]),
        "generation_warning_count": sum(1 for r in results if r["generation_warning"]),
        "compliance_warning_count": sum(1 for r in results if r["compliance_warning"]),
        "generation_retry_count_cases": sum(1 for r in results if r["generation_retry_count"] > 0),
        "budget_exhausted_count": sum(1 for r in results if r["budget_exhausted"]),
        "avg_total_llm_calls": round(
            sum(float(r.get("total_llm_calls") or 0.0) for r in results) / max(len(results), 1), 3
        ),
        "avg_confidence": round(
            sum(float(r.get("confidence") or 0.0) for r in results) / max(len(results), 1), 3
        ),
        "prompt_versions": sorted({str(r.get("prompt_version") or "") for r in results}),
        "policy_versions": sorted({str(r.get("policy_version") or "") for r in results}),
        "config_hashes": sorted({str(r.get("config_hash") or "") for r in results}),
        "scoring_enabled": config.scoring_enabled,
        "avg_scores": {
            field: round(sum(vals) / max(len(vals), 1), 3) if vals else None
            for field, vals in score_values.items()
        },
        "score_distribution": score_distribution,
        "failure_tag_score_assoc": failure_tag_score_summary,
    }
    print("\n# summary")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
