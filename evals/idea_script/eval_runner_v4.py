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

_SEGMENTS = ("HOOK", "VIEW", "STEPS", "PRODUCT", "CTA")


def _load_golden_set(path: str) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rows.append(json.loads(line))
    return rows


def _bucket_score(score: float) -> str:
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


def _bucket_duration(value: float) -> str:
    x = float(value or 0.0)
    if x < 50:
        return "<50"
    if x < 55:
        return "50-55"
    if x <= 65:
        return "55-65"
    if x <= 70:
        return "65-70"
    return ">70"


def _bucket_ratio(value: float) -> str:
    x = max(0.0, min(1.0, float(value or 0.0)))
    if x == 0.0:
        return "0"
    if x < 0.25:
        return "0-0.25"
    if x < 0.5:
        return "0.25-0.5"
    if x < 0.75:
        return "0.5-0.75"
    if x < 1.0:
        return "0.75-1.0"
    return "1.0"


def _bucket_candidates(value: float) -> str:
    x = float(value or 0.0)
    if x < 0.5:
        return "<0.5"
    if x < 1.0:
        return "0.5-1.0"
    if x < 2.0:
        return "1.0-2.0"
    if x < 3.0:
        return "2.0-3.0"
    return ">=3.0"


def _storyboard_topic_metrics(topic: Any) -> Dict[str, Any]:
    shots = list(getattr(topic, "shots", []) or [])
    segment_counts: Dict[str, int] = {}
    cameras = set()
    duration_total = 0.0
    for shot in shots:
        segment = str(getattr(shot, "segment", "") or "")
        segment_counts[segment] = segment_counts.get(segment, 0) + 1
        camera = str(getattr(shot, "camera", "") or "").strip()
        if camera:
            cameras.add(camera)
        duration_total += float(getattr(shot, "duration_sec", 0.0) or 0.0)

    return {
        "shot_count": len(shots),
        "duration_total": round(duration_total, 2),
        "camera_variety": len(cameras),
        "shot_count_pass": 6 <= len(shots) <= 8,
        "segment_coverage_pass": (
            segment_counts.get("HOOK", 0) >= 1
            and segment_counts.get("VIEW", 0) >= 1
            and segment_counts.get("STEPS", 0) >= 2
            and segment_counts.get("PRODUCT", 0) >= 1
            and segment_counts.get("CTA", 0) >= 1
        ),
        "duration_total_pass": 55.0 <= duration_total <= 65.0,
        "camera_variety_pass": len(cameras) >= 3,
    }


def _top1_score_avg(out: Any) -> float:
    scores: list[float] = []
    for candidates in dict(getattr(out, "matched_assets", {}) or {}).values():
        if not candidates:
            continue
        top1 = candidates[0]
        score = float(getattr(top1, "score", 0.0) or 0.0)
        scores.append(score)
    if not scores:
        return 0.0
    return round(sum(scores) / len(scores), 3)


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
    score_values: Dict[str, List[float]] = {field: [] for field in score_fields}
    score_distribution: Dict[str, Dict[str, int]] = {field: {} for field in score_fields}
    failure_tag_counts: Dict[str, int] = {}
    storyboard_failure_tag_counts: Dict[str, int] = {}
    shot_count_distribution: Dict[str, int] = {}
    duration_total_distribution: Dict[str, int] = {}
    camera_variety_distribution: Dict[str, int] = {}
    shot_match_rate_distribution: Dict[str, int] = {}
    avg_candidates_distribution: Dict[str, int] = {}
    top1_scores: list[float] = []
    segment_rate_values: Dict[str, List[float]] = {k: [] for k in _SEGMENTS}
    bucket_distribution: Dict[str, int] = {"best_match": 0, "partial_match": 0, "fallback": 0}

    results: List[Dict[str, Any]] = []
    for idx, case in enumerate(cases, start=1):
        product = str(case.get("product") or "").strip()
        case_id = case.get("id") or f"case_{idx}"
        out = orchestrator.run(IdeaScriptRequest(product=product))
        topic_metrics = [_storyboard_topic_metrics(topic) for topic in (out.topics or [])]
        shot_count_pass = all(item["shot_count_pass"] for item in topic_metrics) if topic_metrics else False
        segment_coverage_pass = all(item["segment_coverage_pass"] for item in topic_metrics) if topic_metrics else False
        duration_total_pass = all(item["duration_total_pass"] for item in topic_metrics) if topic_metrics else False
        camera_variety_pass = all(item["camera_variety_pass"] for item in topic_metrics) if topic_metrics else False

        for item in topic_metrics:
            shot_count_distribution[str(item["shot_count"])] = shot_count_distribution.get(str(item["shot_count"]), 0) + 1
            d_bucket = _bucket_duration(float(item["duration_total"]))
            duration_total_distribution[d_bucket] = duration_total_distribution.get(d_bucket, 0) + 1
            cv_key = str(item["camera_variety"])
            camera_variety_distribution[cv_key] = camera_variety_distribution.get(cv_key, 0) + 1

        scores = out.rubric_scores.model_dump() if out.rubric_scores else {}
        for field in score_fields:
            value = scores.get(field)
            if value is None:
                continue
            value = float(value)
            score_values[field].append(value)
            bucket = _bucket_score(value)
            score_distribution[field][bucket] = score_distribution[field].get(bucket, 0) + 1

        for tag in list(out.failure_tags or []):
            failure_tag_counts[tag] = failure_tag_counts.get(tag, 0) + 1
        for tag in list(out.storyboard_failure_tags or []):
            storyboard_failure_tag_counts[tag] = storyboard_failure_tag_counts.get(tag, 0) + 1

        shot_match_rate = float(getattr(out, "shot_match_rate", 0.0) or 0.0)
        avg_candidates_per_shot = float(getattr(out, "avg_candidates_per_shot", 0.0) or 0.0)
        top1_avg = _top1_score_avg(out)
        top1_scores.append(top1_avg)

        rb = _bucket_ratio(shot_match_rate)
        shot_match_rate_distribution[rb] = shot_match_rate_distribution.get(rb, 0) + 1
        cb = _bucket_candidates(avg_candidates_per_shot)
        avg_candidates_distribution[cb] = avg_candidates_distribution.get(cb, 0) + 1
        segment_match_rate = dict(getattr(out, "segment_match_rate", {}) or {})
        for seg in _SEGMENTS:
            segment_rate_values[seg].append(float(segment_match_rate.get(seg, 0.0) or 0.0))
        case_bucket_dist = {"best_match": 0, "partial_match": 0, "fallback": 0}
        for cands in dict(getattr(out, "matched_assets", {}) or {}).values():
            for cand in list(cands or []):
                bucket = str(getattr(cand, "bucket", "fallback") or "fallback")
                if bucket not in case_bucket_dist:
                    case_bucket_dist[bucket] = 0
                case_bucket_dist[bucket] += 1
                if bucket not in bucket_distribution:
                    bucket_distribution[bucket] = 0
                bucket_distribution[bucket] += 1

        item = {
            "id": case_id,
            "product": product,
            "confidence": out.audience_context.confidence,
            "retry_count": out.retry_count,
            "generation_retry_count": out.generation_retry_count,
            "storyboard_retry_count": out.storyboard_retry_count,
            "storyboard_warning": out.storyboard_warning,
            "asset_match_warning": out.asset_match_warning,
            "asset_match_warning_reason": out.asset_match_warning_reason,
            "shot_match_rate": shot_match_rate,
            "segment_match_rate": segment_match_rate,
            "avg_candidates_per_shot": avg_candidates_per_shot,
            "top1_score_avg": top1_avg,
            "bucket_distribution": case_bucket_dist,
            "prompt_version": out.prompt_version,
            "policy_version": out.policy_version,
            "config_hash": out.config_hash,
            "tag_normalize_enabled": config.tag_normalize_enabled,
            "budget_exhausted": out.budget_exhausted,
            "budget_exhausted_reason": out.budget_exhausted_reason,
            "total_llm_calls": out.total_llm_calls,
            "shot_count_pass": shot_count_pass,
            "segment_coverage_pass": segment_coverage_pass,
            "duration_total_pass": duration_total_pass,
            "camera_variety_pass": camera_variety_pass,
            "failure_tags": out.failure_tags,
            "storyboard_failure_tags": out.storyboard_failure_tags,
            "rubric_scores": scores or None,
        }
        results.append(item)
        print(json.dumps(item, ensure_ascii=False))

    total = len(results)
    summary = {
        "total": total,
        "storyboard_shot_count_pass_count": sum(1 for r in results if r["shot_count_pass"]),
        "storyboard_segment_coverage_pass_count": sum(1 for r in results if r["segment_coverage_pass"]),
        "storyboard_duration_total_pass_count": sum(1 for r in results if r["duration_total_pass"]),
        "storyboard_camera_variety_pass_count": sum(1 for r in results if r["camera_variety_pass"]),
        "storyboard_retry_rate": round(
            sum(1 for r in results if int(r.get("storyboard_retry_count") or 0) > 0) / max(total, 1), 3
        ),
        "avg_shot_match_rate": round(
            sum(float(r.get("shot_match_rate") or 0.0) for r in results) / max(total, 1), 3
        ),
        "avg_candidates_per_shot": round(
            sum(float(r.get("avg_candidates_per_shot") or 0.0) for r in results) / max(total, 1), 3
        ),
        "top1_score_avg": round(sum(top1_scores) / max(len(top1_scores), 1), 3),
        "match_warning_rate": round(
            sum(1 for r in results if bool(r.get("asset_match_warning"))) / max(total, 1), 3
        ),
        "budget_exhausted_count": sum(1 for r in results if r["budget_exhausted"]),
        "avg_total_llm_calls": round(
            sum(float(r.get("total_llm_calls") or 0.0) for r in results) / max(total, 1), 3
        ),
        "prompt_versions": sorted({str(r.get("prompt_version") or "") for r in results}),
        "policy_versions": sorted({str(r.get("policy_version") or "") for r in results}),
        "config_hashes": sorted({str(r.get("config_hash") or "") for r in results}),
        "tag_normalize_enabled": bool(config.tag_normalize_enabled),
        "segment_match_rate": {
            seg: round(sum(values) / max(len(values), 1), 3)
            for seg, values in segment_rate_values.items()
        },
        "bucket_distribution": bucket_distribution,
        "avg_scores": {
            field: (round(sum(vals) / max(len(vals), 1), 3) if vals else None)
            for field, vals in score_values.items()
        },
        "score_distribution": score_distribution,
        "shot_count_distribution": shot_count_distribution,
        "duration_total_distribution": duration_total_distribution,
        "camera_variety_distribution": camera_variety_distribution,
        "shot_match_rate_distribution": shot_match_rate_distribution,
        "avg_candidates_distribution": avg_candidates_distribution,
        "failure_tags_distribution": failure_tag_counts,
        "storyboard_failure_tags_distribution": storyboard_failure_tag_counts,
    }
    print("\n# summary")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
