from __future__ import annotations

from datetime import datetime, timezone
import uuid
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class EvalCaseRequest(BaseModel):
    intent: str = ""
    user_text: Optional[str] = None
    product: Optional[str] = None
    route_path: str = ""


class EvalCaseContext(BaseModel):
    prompt_version: str = ""
    policy_version: str = ""
    config_hash: str = ""
    session_summary_present: bool = False
    memory_pref_used: bool = False


class EvalCaseOutputsSummary(BaseModel):
    topics_titles: List[str] = Field(default_factory=list)
    compliance_risk: str = "low"
    rewrite_applied: bool = False
    shot_match_rate: float = 0.0
    missing_primary_asset_count: int = 0
    exportable_plan: bool = False
    bundle_dir: Optional[str] = None


class EvalCaseLabels(BaseModel):
    harvest_reason: str = ""
    tags: List[str] = Field(default_factory=list)


class EvalCase(BaseModel):
    case_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=now_iso)
    tenant_id: str = ""
    user_id: str = ""
    session_id: str = ""
    request: EvalCaseRequest = Field(default_factory=EvalCaseRequest)
    context: EvalCaseContext = Field(default_factory=EvalCaseContext)
    outputs_summary: EvalCaseOutputsSummary = Field(default_factory=EvalCaseOutputsSummary)
    quality_metrics: Dict[str, Any] = Field(default_factory=dict)
    trajectory: Optional[Dict[str, Any]] = None
    labels: EvalCaseLabels = Field(default_factory=EvalCaseLabels)
    provenance: Dict[str, Any] = Field(default_factory=dict)

    def latest_event_id_upto(self) -> int:
        try:
            return int((self.provenance or {}).get("latest_event_id_upto") or 0)
        except Exception:
            return 0
