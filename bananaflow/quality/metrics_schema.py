from __future__ import annotations

from typing import Any, Dict, Optional

from pydantic import BaseModel, Field

try:
    from ..sessions.service import append_event as append_session_event
except Exception:  # pragma: no cover - 兼容 python bananaflow/main.py 直跑
    from sessions.service import append_event as append_session_event


class EffectivenessMetrics(BaseModel):
    task_success: bool = False
    exportable_plan_rate: float = Field(default=0.0, ge=0.0, le=1.0)
    missing_primary_asset_count: int = Field(default=0, ge=0)
    storyboard_pass: bool = False


class EfficiencyMetrics(BaseModel):
    total_llm_calls: int = Field(default=0, ge=0)
    total_tool_calls: int = Field(default=0, ge=0)
    mcp_calls_count: int = Field(default=0, ge=0)
    latency_ms: Optional[int] = Field(default=None, ge=0)


class RobustnessMetrics(BaseModel):
    inference_retry_count: int = Field(default=0, ge=0)
    generation_retry_count: int = Field(default=0, ge=0)
    storyboard_retry_count: int = Field(default=0, ge=0)
    budget_exhausted: bool = False
    mcp_tool_error_count: int = Field(default=0, ge=0)
    clarification_rate: Optional[float] = Field(default=None, ge=0.0, le=1.0)


class SafetyMetrics(BaseModel):
    compliance_risk: str = "low"
    rewrite_applied: bool = False
    compliance_warning: bool = False


class QualityMetrics(BaseModel):
    session_id: str = ""
    tenant_id: str = ""
    user_id: str = ""
    prompt_version: str = ""
    policy_version: str = ""
    config_hash: str = ""
    effectiveness: EffectivenessMetrics = Field(default_factory=EffectivenessMetrics)
    efficiency: EfficiencyMetrics = Field(default_factory=EfficiencyMetrics)
    robustness: RobustnessMetrics = Field(default_factory=RobustnessMetrics)
    safety: SafetyMetrics = Field(default_factory=SafetyMetrics)


def _as_int(value: Any, default: int = 0) -> int:
    try:
        parsed = int(value)
    except Exception:
        parsed = int(default)
    return max(0, parsed)


def _as_bool(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "on"}:
        return True
    if text in {"0", "false", "no", "off"}:
        return False
    return default


def _as_float(value: Any, default: float = 0.0) -> float:
    try:
        parsed = float(value)
    except Exception:
        parsed = float(default)
    return parsed


def _safe_len(value: Any) -> int:
    try:
        return len(value or [])
    except Exception:
        return 0


def _missing_primary_asset_count(response: Any) -> int:
    edit_plans = list(getattr(response, "edit_plans", []) or [])
    total_missing = 0
    for plan in edit_plans:
        total_missing += _as_int(getattr(plan, "missing_primary_asset_count", 0), 0)
    return max(0, total_missing)


def _exportable_plan_rate(response: Any) -> float:
    plans = list(getattr(response, "edit_plans", []) or [])
    if not plans:
        return 0.0
    exportable_count = 0
    for plan in plans:
        if _as_int(getattr(plan, "missing_primary_asset_count", 0), 0) <= 0:
            exportable_count += 1
    return round(float(exportable_count) / float(max(len(plans), 1)), 3)


def _task_success(response: Any) -> bool:
    topic_count = _safe_len(getattr(response, "topics", []))
    plan_count = _safe_len(getattr(response, "edit_plans", []))
    generation_warning = _as_bool(getattr(response, "generation_warning", False), False)
    storyboard_warning = _as_bool(getattr(response, "storyboard_warning", False), False)
    budget_exhausted = _as_bool(getattr(response, "budget_exhausted", False), False)
    return bool(topic_count > 0 and plan_count > 0 and (not generation_warning) and (not storyboard_warning) and (not budget_exhausted))


def build_quality_metrics(
    response: Any,
    *,
    session_id: str,
    tenant_id: str,
    user_id: str,
    prompt_version: Optional[str] = None,
    policy_version: Optional[str] = None,
    config_hash: Optional[str] = None,
    total_tool_calls: Optional[int] = None,
    mcp_calls_count: Optional[int] = None,
    latency_ms: Optional[int] = None,
    mcp_tool_error_count: Optional[int] = None,
    clarification_rate: Optional[float] = None,
    asset_match_use_mcp: bool = False,
) -> QualityMetrics:
    missing_primary_asset_count = _missing_primary_asset_count(response)
    exportable_plan_rate = _exportable_plan_rate(response)

    resolved_total_tool_calls = _as_int(total_tool_calls, default=2)
    resolved_mcp_calls_count = _as_int(
        mcp_calls_count,
        default=(1 if _as_bool(asset_match_use_mcp, False) else 0),
    )
    if mcp_tool_error_count is None:
        warning_reason = str(getattr(response, "asset_match_warning_reason", "") or "").strip()
        resolved_mcp_tool_error_count = 1 if warning_reason == "asset_match_mcp_failed" else 0
    else:
        resolved_mcp_tool_error_count = _as_int(mcp_tool_error_count, default=0)

    if latency_ms is None:
        resolved_latency_ms = None
    else:
        resolved_latency_ms = _as_int(latency_ms, default=0)

    resolved_prompt_version = str(prompt_version if prompt_version is not None else getattr(response, "prompt_version", "") or "")
    resolved_policy_version = str(policy_version if policy_version is not None else getattr(response, "policy_version", "") or "")
    resolved_config_hash = str(config_hash if config_hash is not None else getattr(response, "config_hash", "") or "")

    if clarification_rate is None:
        resolved_clarification_rate = None
    else:
        resolved_clarification_rate = max(0.0, min(1.0, _as_float(clarification_rate, 0.0)))

    metrics = QualityMetrics(
        session_id=str(session_id or ""),
        tenant_id=str(tenant_id or ""),
        user_id=str(user_id or ""),
        prompt_version=resolved_prompt_version,
        policy_version=resolved_policy_version,
        config_hash=resolved_config_hash,
        effectiveness=EffectivenessMetrics(
            task_success=_task_success(response),
            exportable_plan_rate=exportable_plan_rate,
            missing_primary_asset_count=missing_primary_asset_count,
            storyboard_pass=(not _as_bool(getattr(response, "storyboard_warning", False), False)),
        ),
        efficiency=EfficiencyMetrics(
            total_llm_calls=_as_int(getattr(response, "total_llm_calls", 0), 0),
            total_tool_calls=resolved_total_tool_calls,
            mcp_calls_count=resolved_mcp_calls_count,
            latency_ms=resolved_latency_ms,
        ),
        robustness=RobustnessMetrics(
            inference_retry_count=_as_int(getattr(response, "retry_count", 0), 0),
            generation_retry_count=_as_int(getattr(response, "generation_retry_count", 0), 0),
            storyboard_retry_count=_as_int(getattr(response, "storyboard_retry_count", 0), 0),
            budget_exhausted=_as_bool(getattr(response, "budget_exhausted", False), False),
            mcp_tool_error_count=resolved_mcp_tool_error_count,
            clarification_rate=resolved_clarification_rate,
        ),
        safety=SafetyMetrics(
            compliance_risk=str(getattr(response, "risk_level", "low") or "low"),
            rewrite_applied=_as_bool(getattr(response, "safe_rewrite_applied", False), False),
            compliance_warning=_as_bool(getattr(response, "compliance_warning", False), False),
        ),
    )
    return metrics


def quality_span_attributes(metrics: QualityMetrics) -> Dict[str, Any]:
    return {
        "quality.session_id": metrics.session_id,
        "quality.task_success": bool(metrics.effectiveness.task_success),
        "quality.exportable_plan_rate": float(metrics.effectiveness.exportable_plan_rate),
        "quality.missing_primary_asset_count": int(metrics.effectiveness.missing_primary_asset_count),
        "quality.storyboard_pass": bool(metrics.effectiveness.storyboard_pass),
        "quality.total_llm_calls": int(metrics.efficiency.total_llm_calls),
        "quality.total_tool_calls": int(metrics.efficiency.total_tool_calls),
        "quality.mcp_calls_count": int(metrics.efficiency.mcp_calls_count),
        "quality.latency_ms": metrics.efficiency.latency_ms,
        "quality.inference_retry_count": int(metrics.robustness.inference_retry_count),
        "quality.generation_retry_count": int(metrics.robustness.generation_retry_count),
        "quality.storyboard_retry_count": int(metrics.robustness.storyboard_retry_count),
        "quality.budget_exhausted": bool(metrics.robustness.budget_exhausted),
        "quality.mcp_tool_error_count": int(metrics.robustness.mcp_tool_error_count),
        "quality.compliance_risk": metrics.safety.compliance_risk,
        "quality.rewrite_applied": bool(metrics.safety.rewrite_applied),
        "quality.compliance_warning": bool(metrics.safety.compliance_warning),
        "quality.prompt_version": metrics.prompt_version,
        "quality.policy_version": metrics.policy_version,
        "quality.config_hash": metrics.config_hash,
    }


def append_quality_metrics_event(
    *,
    tenant_id: str,
    user_id: str,
    session_id: str,
    metrics: QualityMetrics,
    idempotency_key: Optional[str] = None,
) -> int:
    return int(
        append_session_event(
            tenant_id=str(tenant_id or ""),
            user_id=str(user_id or ""),
            session_id=str(session_id or ""),
            type="QUALITY_METRICS",
            payload=metrics.model_dump(mode="json"),
            idempotency_key=idempotency_key,
        )
    )
