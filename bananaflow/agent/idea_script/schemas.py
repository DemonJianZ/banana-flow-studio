from __future__ import annotations

from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator

try:
    from ...assets.schemas import AssetCandidate, MatchBucket
except Exception:  # pragma: no cover - 兼容 python bananaflow/main.py 直跑
    from assets.schemas import AssetCandidate, MatchBucket


AngleType = Literal["persona", "scene", "misconception"]
UnsafeClaimRisk = Literal["low", "medium", "high"]
RiskLevel = Literal["low", "medium", "high"]
SegmentType = Literal["HOOK", "VIEW", "STEPS", "PRODUCT", "CTA"]


class IdeaScriptRequest(BaseModel):
    product: str = Field(..., description="产品名称或产品简述")

    @field_validator("product")
    @classmethod
    def validate_product(cls, value: str) -> str:
        text = (value or "").strip()
        if not text:
            raise ValueError("product is required")
        return text


class AudienceInferenceResult(BaseModel):
    product: str
    persona: str
    pain_points: List[str] = Field(default_factory=list)
    scenes: List[str] = Field(default_factory=list)
    why_this_persona: str
    confidence: float = Field(..., ge=0.0, le=1.0)
    unsafe_claim_risk: UnsafeClaimRisk = "low"


class ShotItem(BaseModel):
    shot_id: str
    segment: SegmentType
    duration_sec: float = Field(..., gt=0.0)
    camera: str
    scene: str
    action: str
    emotion: Optional[str] = None
    overlay_text: Optional[str] = None
    keyword_tags: List[str] = Field(default_factory=list)
    asset_requirements: List["AssetRequirement"] = Field(default_factory=list)

    @field_validator("shot_id", "camera", "scene", "action", mode="before")
    @classmethod
    def normalize_required_text(cls, value: object) -> str:
        return str(value or "").strip()

    @field_validator("keyword_tags", mode="before")
    @classmethod
    def normalize_keyword_tags(cls, value: object) -> List[str]:
        if value is None:
            return []
        if not isinstance(value, list):
            return []
        result: List[str] = []
        seen = set()
        for item in value:
            text = str(item or "").strip()
            if not text or text in seen:
                continue
            seen.add(text)
            result.append(text)
            if len(result) >= 8:
                break
        return result

    @field_validator("asset_requirements", mode="before")
    @classmethod
    def normalize_asset_requirements(cls, value: object) -> List["AssetRequirement"] | List[dict]:
        if value is None:
            return []
        if not isinstance(value, list):
            return []
        result: List[dict] = []
        seen = set()
        for item in value:
            if isinstance(item, AssetRequirement):
                data = item.model_dump()
            elif isinstance(item, dict):
                data = dict(item)
            else:
                text = str(item or "").strip()
                if not text:
                    continue
                data = {
                    "type": "",
                    "must_have": text,
                }
            key = str(data.get("must_have") or "").strip()
            if not key or key in seen:
                continue
            seen.add(key)
            result.append(data)
            if len(result) >= 3:
                break
        return result


class AssetRequirement(BaseModel):
    type: str = ""
    must_have: str
    avoid: str = ""
    style: str = ""
    aspect: str = "9:16"


class TopicItem(BaseModel):
    angle: AngleType
    title: str
    hook: str
    script_60s: str
    visual_keywords: List[str] = Field(default_factory=list)
    shots: List[ShotItem] = Field(default_factory=list)

    @field_validator("visual_keywords", mode="before")
    @classmethod
    def validate_visual_keywords(cls, value: object) -> List[str]:
        if value is None:
            return []
        if not isinstance(value, list):
            return []
        keywords: List[str] = []
        seen = set()
        for item in value:
            text = str(item or "").strip()
            if not text:
                continue
            if text in seen:
                continue
            seen.add(text)
            keywords.append(text)
            if len(keywords) >= 8:
                break
        return keywords


IdeaTopic = TopicItem  # backward-compatible alias


class IdeaScriptReviewResult(BaseModel):
    passed: bool = True
    blocking_issues: List[str] = Field(default_factory=list)
    non_blocking_issues: List[str] = Field(default_factory=list)
    failure_tags: List[str] = Field(default_factory=list)
    normalized_topics: List[TopicItem] = Field(default_factory=list)
    # Backward-compatible fields for existing callers
    issues: List[str] = Field(default_factory=list)
    topics: List[TopicItem] = Field(default_factory=list)


class RiskySpan(BaseModel):
    topic_index: int = Field(..., ge=0)
    angle: Optional[AngleType] = None
    field: Literal["title", "hook", "script_60s"]
    text: str
    reason: str
    risk_level: RiskLevel


class ComplianceScanResult(BaseModel):
    risk_level: RiskLevel = "low"
    risky_spans: List[RiskySpan] = Field(default_factory=list)


class SafeRewriteResult(BaseModel):
    rewritten_topics: List[TopicItem] = Field(default_factory=list)
    changed: bool = False
    rewritten_span_count: int = 0


class RubricScoreResult(BaseModel):
    persona_specificity_score: float = Field(..., ge=0.0, le=1.0)
    hook_strength_score: float = Field(..., ge=0.0, le=1.0)
    topic_diversity_score: float = Field(..., ge=0.0, le=1.0)
    script_speakability_score: float = Field(..., ge=0.0, le=1.0)
    compliance_score: float = Field(..., ge=0.0, le=1.0)


class StoryboardReviewResult(BaseModel):
    passed: bool = True
    blocking_issues: List[str] = Field(default_factory=list)
    non_blocking_issues: List[str] = Field(default_factory=list)
    failure_tags: List[str] = Field(default_factory=list)
    normalized_shots: List[ShotItem] = Field(default_factory=list)
    duration_total: float = 0.0
    camera_variety_count: int = 0
    segment_coverage_ok: bool = False


class EditAssetPick(BaseModel):
    asset_id: str
    uri: str
    score: float
    bucket: MatchBucket
    reason: str = ""


class EditClip(BaseModel):
    clip_id: str
    shot_id: str
    segment: SegmentType
    duration_sec: float = Field(..., gt=0.0)
    camera: str = ""
    scene: str = ""
    action: str = ""
    primary_asset: Optional[EditAssetPick] = None
    alternates: List[EditAssetPick] = Field(default_factory=list)


class EditTrack(BaseModel):
    track_id: str
    track_type: Literal["video"] = "video"
    clips: List[EditClip] = Field(default_factory=list)


class EditPlan(BaseModel):
    plan_id: str
    product: str
    topic_index: int = Field(..., ge=0)
    angle: AngleType
    title: str
    tracks: List[EditTrack] = Field(default_factory=list)
    total_duration_sec: float = 0.0
    missing_primary_asset_count: int = 0
    prompt_version: str = ""
    policy_version: str = ""
    config_hash: str = ""
    generated_at: str = ""


class IdeaScriptResponse(BaseModel):
    audience_context: AudienceInferenceResult
    topics: List[TopicItem] = Field(default_factory=list)
    inference_warning: bool = False
    warning_reason: Optional[str] = None
    retry_count: int = 0
    generation_warning: bool = False
    generation_warning_reason: Optional[str] = None
    generation_retry_count: int = 0
    blocking_issues: List[str] = Field(default_factory=list)
    non_blocking_issues: List[str] = Field(default_factory=list)
    failure_tags: List[str] = Field(default_factory=list)
    review_issues: List[str] = Field(default_factory=list)
    risk_level: RiskLevel = "low"
    risky_spans: List[RiskySpan] = Field(default_factory=list)
    compliance_warning: bool = False
    compliance_warning_reason: Optional[str] = None
    safe_rewrite_applied: bool = False
    rubric_scores: Optional[RubricScoreResult] = None
    storyboard_warning: bool = False
    storyboard_warning_reason: Optional[str] = None
    storyboard_retry_count: int = 0
    storyboard_issues: List[str] = Field(default_factory=list)
    storyboard_failure_tags: List[str] = Field(default_factory=list)
    matched_assets: Dict[str, List[AssetCandidate]] = Field(default_factory=dict)
    asset_match_warning: bool = False
    asset_match_warning_reason: Optional[str] = None
    shot_match_rate: float = 0.0
    avg_candidates_per_shot: float = 0.0
    segment_match_rate: Dict[str, float] = Field(default_factory=dict)
    edit_plans: List[EditPlan] = Field(default_factory=list)
    edit_plan_warning: bool = False
    edit_plan_warning_reason: Optional[str] = None
    prompt_version: str = ""
    policy_version: str = ""
    config_hash: str = ""
    budget_exhausted: bool = False
    budget_exhausted_reason: Optional[str] = None
    total_llm_calls: int = 0
