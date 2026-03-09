from __future__ import annotations

from contextlib import contextmanager, nullcontext
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import json
import os
from typing import Any, Dict, Iterable, List, Optional, Tuple

try:
    from ..core.logging import sys_logger
    from ..sessions.service import (
        SessionAccessDeniedError,
        SessionNotFoundError,
        get_session,
        init_sessions_store,
    )
    from ..storage.sessions_migrations import ensure_sessions_db
    from ..storage.sessions_sqlite import get_conn
    from .eval_case import EvalCase
except Exception:  # pragma: no cover - 兼容 python bananaflow/main.py 直跑
    from core.logging import sys_logger
    from sessions.service import SessionAccessDeniedError, SessionNotFoundError, get_session, init_sessions_store
    from storage.sessions_migrations import ensure_sessions_db
    from storage.sessions_sqlite import get_conn
    from quality.eval_case import EvalCase

try:
    from opentelemetry import trace as _otel_trace  # type: ignore
except Exception:  # pragma: no cover
    _otel_trace = None


DEFAULT_EVAL_CASES_PATH = "./evals/idea_script/eval_cases/harvested.jsonl"
MAX_CASE_BYTES = 25 * 1024
DEFAULT_MIN_TRAJECTORY_SCORE = 0.75
_tracer = _otel_trace.get_tracer(__name__) if _otel_trace else None


@dataclass
class HarvestResult:
    case_id: str
    output_path: str
    written: bool
    bytes_written: int
    dedup_key: str


class _NoopSpan:
    def set_attribute(self, *args: Any, **kwargs: Any) -> None:
        return None


@contextmanager
def _span(name: str, attrs: Optional[Dict[str, Any]] = None):
    if _tracer is None:
        with nullcontext():
            yield _NoopSpan()
        return
    with _tracer.start_as_current_span(name) as span:
        for key, value in dict(attrs or {}).items():
            try:
                if value is not None:
                    span.set_attribute(key, value)
            except Exception:
                continue
        yield span


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


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
        return float(value)
    except Exception:
        return float(default)


def _as_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return int(default)


def _safe_json_loads(text: Any) -> Dict[str, Any]:
    raw = str(text or "").strip()
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except Exception:
        return {}
    if isinstance(parsed, dict):
        return parsed
    return {}


def _iter_jsonl(path: str) -> Iterable[Dict[str, Any]]:
    if not os.path.exists(path):
        return []
    rows: List[Dict[str, Any]] = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                data = json.loads(line)
            except Exception:
                continue
            if isinstance(data, dict):
                rows.append(data)
    return rows


def _dedup_key_for(session_id: str, latest_event_id_upto: int) -> str:
    return f"{str(session_id or '')}::{int(latest_event_id_upto or 0)}"


def _existing_index(path: str) -> Tuple[set[str], Dict[str, str]]:
    case_ids: set[str] = set()
    dedup_to_case_id: Dict[str, str] = {}
    for row in _iter_jsonl(path):
        case_id = str(row.get("case_id") or "").strip()
        if case_id:
            case_ids.add(case_id)
        session_id = str(row.get("session_id") or "").strip()
        latest = _as_int((row.get("provenance") or {}).get("latest_event_id_upto"), 0)
        if session_id and latest > 0:
            dedup_to_case_id[_dedup_key_for(session_id, latest)] = case_id
    return case_ids, dedup_to_case_id


def _last_event(events: List[Dict[str, Any]], event_type: str) -> Optional[Dict[str, Any]]:
    target = str(event_type or "").strip()
    if not target:
        return None
    for item in reversed(list(events or [])):
        if str(item.get("type") or "") == target:
            return item
    return None


def _latest_quality_payload(events: List[Dict[str, Any]]) -> Dict[str, Any]:
    event = _last_event(events, "QUALITY_METRICS")
    if event is None:
        return {}
    payload = event.get("payload")
    return dict(payload) if isinstance(payload, dict) else {}


def _latest_trajectory_payload(events: List[Dict[str, Any]]) -> Dict[str, Any]:
    event = _last_event(events, "TRAJECTORY_EVAL")
    if event is None:
        return {}
    payload = event.get("payload")
    return dict(payload) if isinstance(payload, dict) else {}


def _extract_shot_match_rate(trajectory_payload: Dict[str, Any]) -> float:
    stages = list(trajectory_payload.get("stages") or [])
    for stage in reversed(stages):
        if str(stage.get("stage_name") or "") != "asset_match":
            continue
        result = dict(stage.get("result") or {})
        return max(0.0, _as_float(result.get("shot_match_rate"), 0.0))
    return 0.0


def _compact_trajectory(trajectory_payload: Dict[str, Any], max_stages: int = 12) -> Dict[str, Any]:
    if not trajectory_payload:
        return {}
    stages: List[Dict[str, Any]] = []
    for stage in list(trajectory_payload.get("stages") or [])[: max(1, int(max_stages))]:
        stages.append(
            {
                "stage_name": str(stage.get("stage_name") or ""),
                "tool_name": str(stage.get("tool_name") or ""),
                "success": bool(stage.get("success")),
                "stage_score": _as_float(stage.get("stage_score"), 0.0),
                "duration": max(0.0, _as_float(stage.get("duration"), 0.0)),
                "reason": str(stage.get("reason") or ""),
                "error_message": (str(stage.get("error_message") or "") or None),
            }
        )
    metadata = dict(trajectory_payload.get("metadata") or {})
    return {
        "evaluation_score": _as_float(trajectory_payload.get("evaluation_score"), 0.0),
        "stage_count": len(list(trajectory_payload.get("stages") or [])),
        "metadata": {
            "task_type": str(metadata.get("task_type") or ""),
            "prompt_version": str(metadata.get("prompt_version") or ""),
            "policy_version": str(metadata.get("policy_version") or ""),
            "config_hash": str(metadata.get("config_hash") or ""),
            "quality_task_success": _as_bool(metadata.get("quality_task_success"), False),
        },
        "stages": stages,
    }


def _candidate_reasons(
    *,
    quality_metrics: Dict[str, Any],
    trajectory_payload: Dict[str, Any],
    min_trajectory_score: float,
) -> List[str]:
    effectiveness = dict(quality_metrics.get("effectiveness") or {})
    robustness = dict(quality_metrics.get("robustness") or {})
    safety = dict(quality_metrics.get("safety") or {})
    reasons: List[str] = []
    if quality_metrics:
        if not _as_bool(effectiveness.get("task_success"), False):
            reasons.append("task_success_false")
        if _as_bool(safety.get("compliance_warning"), False):
            reasons.append("compliance_warning_true")
        if _as_bool(robustness.get("budget_exhausted"), False):
            reasons.append("budget_exhausted_true")
        exportable_plan_rate = _as_float(effectiveness.get("exportable_plan_rate"), 0.0)
        if exportable_plan_rate <= 0.0:
            reasons.append("exportable_plan_false")
    if trajectory_payload:
        trajectory_score = _as_float(trajectory_payload.get("evaluation_score"), 0.0)
        if trajectory_score < float(min_trajectory_score):
            reasons.append("trajectory_score_low")
    return sorted(set(reasons))


def _resolve_output_path(out_dir: Optional[str]) -> str:
    target = str(out_dir or "").strip()
    if not target:
        target = str(os.getenv("BANANAFLOW_EVAL_CASES_PATH") or DEFAULT_EVAL_CASES_PATH).strip()
    if target.endswith(".jsonl"):
        path = target
    else:
        path = os.path.join(target, "harvested.jsonl")
    abs_path = os.path.abspath(path)
    os.makedirs(os.path.dirname(abs_path), exist_ok=True)
    return abs_path


def _compact_case_for_size(case: EvalCase) -> EvalCase:
    payload = case.model_dump(mode="json")
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    if len(encoded) <= MAX_CASE_BYTES:
        return case

    if case.trajectory:
        stages = list((case.trajectory or {}).get("stages") or [])
        if len(stages) > 8:
            case.trajectory["stages"] = stages[:8]
    payload = case.model_dump(mode="json")
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    if len(encoded) <= MAX_CASE_BYTES:
        return case

    if case.request.user_text:
        case.request.user_text = str(case.request.user_text)[:300]
    if case.outputs_summary.topics_titles:
        case.outputs_summary.topics_titles = list(case.outputs_summary.topics_titles)[:3]
    if len(case.labels.tags) > 8:
        case.labels.tags = list(case.labels.tags)[:8]
    payload = case.model_dump(mode="json")
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    if len(encoded) <= MAX_CASE_BYTES:
        return case

    case.trajectory = None
    return case


def _build_case_from_session(
    *,
    tenant_id: str,
    user_id: str,
    session_id: str,
    session_data: Dict[str, Any],
    reason: str,
    include_trajectory: bool,
    provenance: Optional[Dict[str, Any]] = None,
) -> EvalCase:
    session = dict(session_data.get("session") or {})
    events = list(session_data.get("events") or [])
    latest_event_id_upto = max([_as_int(item.get("event_id"), 0) for item in events] or [0])
    quality_payload = _latest_quality_payload(events)
    raw_trajectory = _latest_trajectory_payload(events)
    compact_trajectory = _compact_trajectory(raw_trajectory) if include_trajectory else {}
    trajectory_score = _as_float(compact_trajectory.get("evaluation_score"), 0.0) if compact_trajectory else 0.0

    intent_event = _last_event(events, "INTENT_ROUTING")
    user_message_event = _last_event(events, "USER_MESSAGE")
    artifact_event = _last_event(events, "ARTIFACT_CREATED")
    tool_result_event = _last_event(events, "TOOL_RESULT")
    memory_updated = _last_event(events, "MEMORY_UPDATED")
    summary_present = bool(str(session.get("summary_text") or "").strip())

    intent_payload = dict((intent_event or {}).get("payload") or {})
    user_payload = dict((user_message_event or {}).get("payload") or {})
    artifact_payload = dict((artifact_event or {}).get("payload") or {})
    tool_result_payload = dict((tool_result_event or {}).get("payload") or {})
    tool_result_ref = dict(tool_result_payload.get("result_ref") or {})

    quality_effectiveness = dict(quality_payload.get("effectiveness") or {})
    quality_safety = dict(quality_payload.get("safety") or {})
    prompt_version = str(quality_payload.get("prompt_version") or session.get("state", {}).get("prompt_version") or "")
    policy_version = str(quality_payload.get("policy_version") or session.get("state", {}).get("policy_version") or "")
    config_hash = str(quality_payload.get("config_hash") or session.get("state", {}).get("config_hash") or "")
    memory_pref_used = bool(
        ((compact_trajectory or {}).get("metadata") or {}).get("memory_pref_used")
        or (memory_updated is not None)
    )
    bundle_dir = (
        str(artifact_payload.get("bundle_dir") or "").strip()
        or str(tool_result_ref.get("bundle_dir") or "").strip()
        or None
    )
    exportable_plan = _as_float(quality_effectiveness.get("exportable_plan_rate"), 0.0) > 0.0

    tags = _candidate_reasons(
        quality_metrics=quality_payload,
        trajectory_payload=compact_trajectory,
        min_trajectory_score=float((provenance or {}).get("min_trajectory_score", DEFAULT_MIN_TRAJECTORY_SCORE)),
    )
    if trajectory_score > 0 and trajectory_score < float((provenance or {}).get("min_trajectory_score", DEFAULT_MIN_TRAJECTORY_SCORE)):
        tags.append("trajectory_score_low")
    tags = sorted(set(tags))

    eval_case = EvalCase(
        tenant_id=str(tenant_id or ""),
        user_id=str(user_id or ""),
        session_id=str(session_id or ""),
        request={
            "intent": str(intent_payload.get("intent") or ""),
            "user_text": str(user_payload.get("text") or "") or None,
            "product": str(user_payload.get("product") or intent_payload.get("product") or ""),
            "route_path": str(intent_payload.get("request_path") or ""),
        },
        context={
            "prompt_version": prompt_version,
            "policy_version": policy_version,
            "config_hash": config_hash,
            "session_summary_present": summary_present,
            "memory_pref_used": memory_pref_used,
        },
        outputs_summary={
            "topics_titles": list((tool_result_ref.get("topics_titles") or [])[:8]),
            "compliance_risk": str(quality_safety.get("compliance_risk") or "low"),
            "rewrite_applied": _as_bool(quality_safety.get("rewrite_applied"), False),
            "shot_match_rate": _extract_shot_match_rate(compact_trajectory),
            "missing_primary_asset_count": _as_int(quality_effectiveness.get("missing_primary_asset_count"), 0),
            "exportable_plan": bool(exportable_plan),
            "bundle_dir": bundle_dir,
        },
        quality_metrics=quality_payload,
        trajectory=(compact_trajectory if include_trajectory and compact_trajectory else None),
        labels={"harvest_reason": str(reason or "manual"), "tags": tags},
        provenance={
            "latest_event_id_upto": int(latest_event_id_upto),
            "filters": dict(provenance or {}),
            "include_trajectory": bool(include_trajectory),
            "harvested_at": _now_iso(),
        },
    )
    return _compact_case_for_size(eval_case)


def harvest_eval_case(
    session_id: str,
    tenant_id: str,
    user_id: str,
    out_dir: Optional[str],
    reason: str,
    include_trajectory: bool = True,
    provenance: Optional[Dict[str, Any]] = None,
) -> HarvestResult:
    session_data = get_session(
        tenant_id=tenant_id,
        user_id=user_id,
        session_id=session_id,
        include_events=True,
        limit_events=2000,
    )
    output_path = _resolve_output_path(out_dir)
    eval_case = _build_case_from_session(
        tenant_id=tenant_id,
        user_id=user_id,
        session_id=session_id,
        session_data=session_data,
        reason=reason,
        include_trajectory=include_trajectory,
        provenance=provenance,
    )
    latest_event_id_upto = _as_int((eval_case.provenance or {}).get("latest_event_id_upto"), 0)
    dedup_key = _dedup_key_for(eval_case.session_id, latest_event_id_upto)

    with _span(
        "quality.harvest",
        {
            "session_id": eval_case.session_id,
            "include_trajectory": bool(include_trajectory),
            "latest_event_id_upto": latest_event_id_upto,
        },
    ) as span:
        _, dedup_map = _existing_index(output_path)
        existing_case_id = dedup_map.get(dedup_key)
        if existing_case_id:
            span.set_attribute("case_id", existing_case_id)
            span.set_attribute("bytes_written", 0)
            sys_logger.info(
                json.dumps(
                    {
                        "event": "quality.harvest.skip_duplicate",
                        "case_id": existing_case_id,
                        "session_id": eval_case.session_id,
                        "reason": reason,
                        "output_path": output_path,
                        "dedup_key": dedup_key,
                    },
                    ensure_ascii=False,
                )
            )
            return HarvestResult(
                case_id=existing_case_id,
                output_path=output_path,
                written=False,
                bytes_written=0,
                dedup_key=dedup_key,
            )

        payload = eval_case.model_dump(mode="json")
        serialized = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        data_bytes = serialized.encode("utf-8")
        if len(data_bytes) > MAX_CASE_BYTES:
            raise ValueError(f"harvested eval case too large: {len(data_bytes)} bytes")
        with open(output_path, "a", encoding="utf-8") as f:
            f.write(serialized + "\n")
        span.set_attribute("case_id", eval_case.case_id)
        span.set_attribute("bytes_written", len(data_bytes))
        sys_logger.info(
            json.dumps(
                {
                    "event": "quality.harvest.written",
                    "case_id": eval_case.case_id,
                    "session_id": eval_case.session_id,
                    "reason": reason,
                    "filters": dict((eval_case.provenance or {}).get("filters") or {}),
                    "output_path": output_path,
                    "bytes": len(data_bytes),
                },
                ensure_ascii=False,
            )
        )
        return HarvestResult(
            case_id=eval_case.case_id,
            output_path=output_path,
            written=True,
            bytes_written=len(data_bytes),
            dedup_key=dedup_key,
        )


def harvest_from_session(
    session_id: str,
    tenant_id: str,
    user_id: str,
    out_dir: Optional[str],
    reason: str,
    include_trajectory: bool = True,
) -> str:
    result = harvest_eval_case(
        session_id=session_id,
        tenant_id=tenant_id,
        user_id=user_id,
        out_dir=out_dir,
        reason=reason,
        include_trajectory=include_trajectory,
        provenance={},
    )
    return result.output_path


def query_candidates(db_path: str, filters: Optional[Dict[str, Any]] = None) -> List[str]:
    resolved_filters = dict(filters or {})
    path = os.path.abspath(str(db_path or "").strip())
    if not path:
        raise ValueError("db_path is required")
    ensure_sessions_db(path)

    tenant_id = str(resolved_filters.get("tenant_id") or "").strip()
    user_id = str(resolved_filters.get("user_id") or "").strip()
    since_hours = _as_int(resolved_filters.get("since_hours"), 24)
    since_hours = max(0, since_hours)
    min_trajectory_score = _as_float(
        resolved_filters.get("min_trajectory_score"),
        DEFAULT_MIN_TRAJECTORY_SCORE,
    )
    only_failed = _as_bool(resolved_filters.get("only_failed"), False)
    session_ids_filter = [str(item).strip() for item in list(resolved_filters.get("session_ids") or []) if str(item).strip()]
    limit = max(1, min(_as_int(resolved_filters.get("limit"), 200), 2000))

    where: List[str] = []
    params: List[Any] = []
    if tenant_id:
        where.append("tenant_id = ?")
        params.append(tenant_id)
    if user_id:
        where.append("user_id = ?")
        params.append(user_id)
    if since_hours > 0:
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=since_hours)).isoformat()
        where.append("updated_at >= ?")
        params.append(cutoff)

    query = "SELECT session_id FROM sessions"
    if where:
        query += " WHERE " + " AND ".join(where)
    query += " ORDER BY updated_at DESC, session_id DESC LIMIT ?"
    params.append(limit * 4)

    with get_conn(path) as conn:
        if session_ids_filter:
            placeholders = ",".join(["?"] * len(session_ids_filter))
            sql = f"SELECT session_id FROM sessions WHERE session_id IN ({placeholders}) ORDER BY session_id ASC"
            rows = conn.execute(sql, tuple(session_ids_filter)).fetchall()
        else:
            rows = conn.execute(query, tuple(params)).fetchall()
        out: List[str] = []
        for row in list(rows or []):
            session_id = str(row["session_id"] or "")
            if not session_id:
                continue
            quality_row = conn.execute(
                """
                SELECT payload_json
                FROM session_events
                WHERE session_id = ? AND type = 'QUALITY_METRICS'
                ORDER BY event_id DESC
                LIMIT 1
                """,
                (session_id,),
            ).fetchone()
            trajectory_row = conn.execute(
                """
                SELECT payload_json
                FROM session_events
                WHERE session_id = ? AND type = 'TRAJECTORY_EVAL'
                ORDER BY event_id DESC
                LIMIT 1
                """,
                (session_id,),
            ).fetchone()
            quality_payload = _safe_json_loads(quality_row["payload_json"]) if quality_row is not None else {}
            trajectory_payload = _safe_json_loads(trajectory_row["payload_json"]) if trajectory_row is not None else {}
            reasons = _candidate_reasons(
                quality_metrics=quality_payload,
                trajectory_payload=trajectory_payload,
                min_trajectory_score=min_trajectory_score,
            )
            if session_ids_filter:
                out.append(session_id)
            elif reasons:
                if only_failed and not any(
                    tag in {"task_success_false", "compliance_warning_true", "budget_exhausted_true", "exportable_plan_false"}
                    for tag in reasons
                ):
                    continue
                out.append(session_id)
            if len(out) >= limit:
                break
    return out


def default_sessions_db_path() -> str:
    return init_sessions_store()
