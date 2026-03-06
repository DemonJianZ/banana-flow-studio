from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import json
from typing import Any, Dict, List, Optional


KNOWN_STAGE_NAMES = {
    "intent_routing",
    "audience_inference",
    "audience_inference_retry",
    "idea_generation",
    "idea_generation_retry",
    "quality_review",
    "risk_scan",
    "safe_rewrite",
    "score",
    "storyboard_generate",
    "storyboard_review",
    "storyboard_generate_retry",
    "storyboard_review_retry",
    "tool_selection",
    "tool_execution",
    "asset_match",
    "edit_plan_build",
    "finalize",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _to_json(value: Any, max_chars: int = 600) -> str:
    try:
        text = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    except Exception:
        text = str(value)
    if len(text) <= max_chars:
        return text
    return text[: max(0, max_chars - 3)] + "..."


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return float(default)


def evaluate_stage(stage: Dict[str, Any]) -> float:
    stage_name = str(stage.get("stage_name") or "").strip()
    tool_name = str(stage.get("tool_name") or "").strip()
    args = stage.get("args")
    result = stage.get("result")
    success = bool(stage.get("success"))
    duration = max(0.0, _safe_float(stage.get("duration"), 0.0))
    reason = str(stage.get("reason") or "").strip()
    error_message = str(stage.get("error_message") or "").strip()

    tool_selection_score = 1.0 if tool_name and stage_name in KNOWN_STAGE_NAMES else (0.7 if tool_name else 0.35)
    args_score = 1.0 if isinstance(args, dict) and len(args) > 0 else 0.7
    execution_score = 1.0 if success else 0.0
    if duration <= 3.0:
        efficiency_score = 1.0
    elif duration <= 10.0:
        efficiency_score = 0.8
    elif duration <= 20.0:
        efficiency_score = 0.6
    else:
        efficiency_score = 0.3
    has_useful_result = bool(result) and (not error_message)
    clarity_score = 1.0 if has_useful_result and reason else (0.75 if has_useful_result else 0.45)

    score = (
        (0.24 * tool_selection_score)
        + (0.20 * args_score)
        + (0.33 * execution_score)
        + (0.13 * efficiency_score)
        + (0.10 * clarity_score)
    )
    return round(max(0.0, min(1.0, score)), 4)


def evaluate_trajectory(stages: List[Dict[str, Any]]) -> float:
    if not stages:
        return 0.0
    stage_scores = [float(s.get("stage_score") or evaluate_stage(s)) for s in stages]
    if not stage_scores:
        return 0.0
    return round(sum(stage_scores) / float(max(len(stage_scores), 1)), 4)


@dataclass
class Trajectory:
    session_id: str
    tenant_id: str
    user_id: str
    metadata: Dict[str, Any] = field(default_factory=dict)
    stages: List[Dict[str, Any]] = field(default_factory=list)
    evaluation_score: float = 0.0

    def add_stage(
        self,
        *,
        stage_name: str,
        tool_name: str,
        args: Optional[Dict[str, Any]] = None,
        result: Optional[Dict[str, Any]] = None,
        success: bool = True,
        reason: str = "",
        duration: float = 0.0,
        error_message: Optional[str] = None,
        timestamp: Optional[str] = None,
    ) -> Dict[str, Any]:
        stage = {
            "stage_name": str(stage_name or "").strip(),
            "timestamp": str(timestamp or _now_iso()),
            "tool_name": str(tool_name or "").strip(),
            "args": dict(args or {}),
            "result": dict(result or {}),
            "success": bool(success),
            "reason": str(reason or "").strip(),
            "duration": round(max(0.0, _safe_float(duration, 0.0)), 6),
            "error_message": (None if not str(error_message or "").strip() else str(error_message).strip()),
        }
        stage_score = evaluate_stage(stage)
        stage["stage_score"] = stage_score
        self.stages.append(stage)
        self.evaluation_score = evaluate_trajectory(self.stages)
        return stage

    def to_dict(self) -> Dict[str, Any]:
        return {
            "session_id": str(self.session_id or ""),
            "tenant_id": str(self.tenant_id or ""),
            "user_id": str(self.user_id or ""),
            "metadata": dict(self.metadata or {}),
            "stages": list(self.stages or []),
            "evaluation_score": float(self.evaluation_score or 0.0),
        }


def trajectory_span_attributes(
    trajectory: Optional[Trajectory],
    *,
    max_stages: int = 8,
    max_args_chars: int = 240,
) -> Dict[str, Any]:
    if trajectory is None:
        return {"trajectory_enabled": False}
    attrs: Dict[str, Any] = {
        "trajectory_enabled": True,
        "trajectory_stage_count": len(trajectory.stages or []),
        "trajectory_score": float(trajectory.evaluation_score or 0.0),
    }
    for idx, stage in enumerate(list(trajectory.stages or [])[: max(1, int(max_stages))]):
        prefix = f"trajectory.stage.{idx}"
        attrs[f"{prefix}.name"] = str(stage.get("stage_name") or "")
        attrs[f"{prefix}.duration"] = float(stage.get("duration") or 0.0)
        attrs[f"{prefix}.success"] = bool(stage.get("success"))
        attrs[f"{prefix}.args"] = _to_json(stage.get("args") or {}, max_chars=max_args_chars)
        if stage.get("error_message"):
            attrs[f"{prefix}.error_message"] = str(stage.get("error_message") or "")
    return attrs
