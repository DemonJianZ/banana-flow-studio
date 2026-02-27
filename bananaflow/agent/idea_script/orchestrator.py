from __future__ import annotations

from collections import OrderedDict
from contextlib import contextmanager, nullcontext
import inspect
from typing import Any, Dict, Iterator, Optional

try:
    from ...assets.index_tool import AssetIndexTool
    from ...assets.query_builder import ShotQueryBuilder
    from ...core.logging import sys_logger
except Exception:  # pragma: no cover - 兼容 python bananaflow/main.py 直跑
    from assets.index_tool import AssetIndexTool
    from assets.query_builder import ShotQueryBuilder
    from core.logging import sys_logger
from .config import IdeaScriptAgentConfig
from .edit_plan_builder import EditPlanBuilder
from .generator import IdeaScriptGeneratorNode
from .inference import AudienceInferenceNode
from .prompts import INFERENCE_CONFIDENCE_THRESHOLD, PROMPT_VERSION
from .reviewer import IdeaScriptReviewerNode
from .risk_scanner import ComplianceGuardNode, RISK_POLICY_VERSION
from .safe_rewrite import SafeRewriteNode
from .scoring import ScoringReviewerNode
from .storyboard import StoryboardAgentNode
from .storyboard_reviewer import StoryboardReviewerNode
from .schemas import IdeaScriptRequest, IdeaScriptResponse

try:
    from opentelemetry import trace as _otel_trace  # type: ignore
except Exception:  # pragma: no cover - 环境未安装时走降级
    _otel_trace = None


_RISK_ORDER = {"low": 0, "medium": 1, "high": 2}


class _NoopSpan:
    def set_attribute(self, *args: Any, **kwargs: Any) -> None:
        return None


class IdeaScriptOrchestrator:
    def __init__(
        self,
        inference_node: Optional[AudienceInferenceNode] = None,
        generator_node: Optional[IdeaScriptGeneratorNode] = None,
        reviewer_node: Optional[IdeaScriptReviewerNode] = None,
        risk_scanner_node: Optional[ComplianceGuardNode] = None,
        safe_rewrite_node: Optional[SafeRewriteNode] = None,
        scoring_node: Optional[ScoringReviewerNode] = None,
        storyboard_node: Optional[StoryboardAgentNode] = None,
        storyboard_reviewer_node: Optional[StoryboardReviewerNode] = None,
        asset_index_tool: Optional[AssetIndexTool] = None,
        shot_query_builder: Optional[ShotQueryBuilder] = None,
        edit_plan_builder: Optional[EditPlanBuilder] = None,
        config: Optional[IdeaScriptAgentConfig] = None,
    ) -> None:
        self.config = config or IdeaScriptAgentConfig.from_env()
        self.inference_node = inference_node or AudienceInferenceNode(model_config=self.config.inference)
        self.generator_node = generator_node or IdeaScriptGeneratorNode(model_config=self.config.generation)
        self.reviewer_node = reviewer_node or IdeaScriptReviewerNode(model_config=self.config.review)
        self.risk_scanner_node = risk_scanner_node or ComplianceGuardNode(model_config=self.config.risk_scan)
        self.safe_rewrite_node = safe_rewrite_node or SafeRewriteNode(model_config=self.config.safe_rewrite)
        self.scoring_node = scoring_node or ScoringReviewerNode(model_config=self.config.score)
        self.storyboard_node = storyboard_node or StoryboardAgentNode(model_config=self.config.storyboard_generate)
        self.storyboard_reviewer_node = storyboard_reviewer_node or StoryboardReviewerNode(model_config=self.config.storyboard_review)
        self.asset_index_tool = asset_index_tool or AssetIndexTool(
            db_path=self.config.asset_db_path,
            tag_normalize_enabled=self.config.tag_normalize_enabled,
        )
        self.shot_query_builder = shot_query_builder or ShotQueryBuilder()
        self.edit_plan_builder = edit_plan_builder or EditPlanBuilder()
        self._tracer = _otel_trace.get_tracer(__name__) if _otel_trace else None
        self._cache: OrderedDict[str, IdeaScriptResponse] = OrderedDict()

    @contextmanager
    def _span(self, name: str, attributes: Optional[Dict[str, Any]] = None) -> Iterator[Any]:
        if self._tracer is None:
            with nullcontext():
                yield _NoopSpan()
            return

        with self._tracer.start_as_current_span(name) as span:
            self._set_span_attrs(span, attributes or {})
            yield span

    def _set_span_attrs(self, span: Any, attributes: Dict[str, Any]) -> None:
        for key, value in attributes.items():
            try:
                if value is None:
                    continue
                span.set_attribute(key, value)
            except Exception:
                continue

    def _set_infer_span_attrs(self, span: Any, inference_result: Any) -> None:
        self._set_span_attrs(
            span,
            {
                "product": inference_result.product,
                "confidence": inference_result.confidence,
                "unsafe_claim_risk": inference_result.unsafe_claim_risk,
                "persona_length": len((inference_result.persona or "").strip()),
                "pain_point_count": len(inference_result.pain_points or []),
                "scene_count": len(inference_result.scenes or []),
            },
        )

    def _risk_at_least(self, level: str, target: str) -> bool:
        return _RISK_ORDER.get(level or "low", 0) >= _RISK_ORDER.get(target or "low", 0)

    def _cache_key(self, req: IdeaScriptRequest) -> str:
        cfg_hash = self.config.stable_config_hash()
        return f"{(req.product or '').strip().lower()}::scoring={int(self.config.scoring_enabled)}::cfg={cfg_hash}"

    def _cache_get(self, key: str) -> Optional[IdeaScriptResponse]:
        if not self.config.cache_enabled:
            return None
        hit = self._cache.get(key)
        if hit is None:
            return None
        self._cache.move_to_end(key)
        return hit.model_copy(deep=True)

    def _cache_set(self, key: str, response: IdeaScriptResponse) -> None:
        if not self.config.cache_enabled:
            return
        self._cache[key] = response.model_copy(deep=True)
        self._cache.move_to_end(key)
        while len(self._cache) > self.config.cache_max_size:
            self._cache.popitem(last=False)

    def _segment_coverage_ok(self, shots: list[Any]) -> bool:
        counts = {"HOOK": 0, "VIEW": 0, "STEPS": 0, "PRODUCT": 0, "CTA": 0}
        for shot in shots or []:
            segment = str(getattr(shot, "segment", "") or "")
            if segment in counts:
                counts[segment] += 1
        return (
            counts["HOOK"] >= 1
            and counts["VIEW"] >= 1
            and counts["STEPS"] >= 2
            and counts["PRODUCT"] >= 1
            and counts["CTA"] >= 1
        )

    def _supports_llm(self, node: Any, llm_method_name: str) -> bool:
        llm_client = getattr(node, "llm_client", None)
        return bool(llm_client is not None and hasattr(llm_client, llm_method_name))

    def _reserve_llm_call(
        self,
        node: Any,
        llm_method_name: str,
        step_name: str,
        total_llm_calls: int,
        budget_exhausted: bool,
        budget_exhausted_reason: Optional[str],
    ) -> tuple[bool, int, bool, Optional[str]]:
        if not self._supports_llm(node, llm_method_name):
            return True, total_llm_calls, budget_exhausted, budget_exhausted_reason
        if budget_exhausted:
            return False, total_llm_calls, budget_exhausted, budget_exhausted_reason
        if total_llm_calls >= int(self.config.max_total_llm_calls):
            reason = budget_exhausted_reason or f"max_total_llm_calls_exceeded:{step_name}"
            return False, total_llm_calls, True, reason
        return True, total_llm_calls + 1, budget_exhausted, budget_exhausted_reason

    def _call_run(self, node: Any, **kwargs: Any) -> Any:
        run_func = getattr(node, "run")
        try:
            sig = inspect.signature(run_func)
        except Exception:
            return run_func(**kwargs)
        if "allow_llm" not in sig.parameters and "allow_llm" in kwargs:
            kwargs = dict(kwargs)
            kwargs.pop("allow_llm", None)
        return run_func(**kwargs)

    def run(self, req: IdeaScriptRequest) -> IdeaScriptResponse:
        cache_key = self._cache_key(req)
        cached = self._cache_get(cache_key)
        if cached is not None:
            return cached

        retry_count = 0
        generation_retry_count = 0
        safe_rewrite_applied = False
        storyboard_retry_count = 0
        prompt_version = PROMPT_VERSION
        policy_version = RISK_POLICY_VERSION
        config_hash = self.config.stable_config_hash()
        total_llm_calls = 0
        budget_exhausted = False
        budget_exhausted_reason: Optional[str] = None

        with self._span("idea_script.run", {"product": req.product}) as run_span:
            with self._span("idea_script.infer", {"product": req.product, "retry_count": 0}) as infer_span:
                allow_llm, total_llm_calls, budget_exhausted, budget_exhausted_reason = self._reserve_llm_call(
                    node=self.inference_node,
                    llm_method_name="infer_audience",
                    step_name="infer",
                    total_llm_calls=total_llm_calls,
                    budget_exhausted=budget_exhausted,
                    budget_exhausted_reason=budget_exhausted_reason,
                )
                inference_result = self._call_run(
                    self.inference_node,
                    product=req.product,
                    retry=False,
                    allow_llm=allow_llm,
                )
                self._set_infer_span_attrs(infer_span, inference_result)

            if inference_result.confidence < INFERENCE_CONFIDENCE_THRESHOLD and not budget_exhausted:
                retry_count = 1
                with self._span(
                    "idea_script.infer.retry",
                    {"product": req.product, "retry_count": retry_count},
                ) as infer_retry_span:
                    allow_llm, total_llm_calls, budget_exhausted, budget_exhausted_reason = self._reserve_llm_call(
                        node=self.inference_node,
                        llm_method_name="infer_audience",
                        step_name="infer_retry",
                        total_llm_calls=total_llm_calls,
                        budget_exhausted=budget_exhausted,
                        budget_exhausted_reason=budget_exhausted_reason,
                    )
                    inference_result = self._call_run(
                        self.inference_node,
                        product=req.product,
                        retry=True,
                        previous=inference_result,
                        allow_llm=allow_llm,
                    )
                    self._set_infer_span_attrs(infer_retry_span, inference_result)

            inference_warning = inference_result.confidence < INFERENCE_CONFIDENCE_THRESHOLD
            warning_reason = "low_confidence_inference" if inference_warning else None

            with self._span(
                "idea_script.generate",
                {
                    "product": req.product,
                    "persona_present": bool((inference_result.persona or "").strip()),
                    "pain_point_count": len(inference_result.pain_points or []),
                    "scene_count": len(inference_result.scenes or []),
                },
            ) as generate_span:
                allow_llm, total_llm_calls, budget_exhausted, budget_exhausted_reason = self._reserve_llm_call(
                    node=self.generator_node,
                    llm_method_name="generate_idea_scripts",
                    step_name="generate",
                    total_llm_calls=total_llm_calls,
                    budget_exhausted=budget_exhausted,
                    budget_exhausted_reason=budget_exhausted_reason,
                )
                topics = self._call_run(
                    self.generator_node,
                    audience_context=inference_result,
                    retry=False,
                    allow_llm=allow_llm,
                )
                self._set_span_attrs(
                    generate_span,
                    {
                        "topic_count": len(topics or []),
                        "angle_count": len({getattr(t, "angle", None) for t in (topics or []) if getattr(t, "angle", None)}),
                    },
                )

            with self._span("idea_script.review", {"topic_count": len(topics or [])}) as review_span:
                review_result = self.reviewer_node.run(inference_result, topics)
                self._set_span_attrs(
                    review_span,
                    {
                        "passed": review_result.passed,
                        "blocking_issue_count": len(review_result.blocking_issues or []),
                        "non_blocking_issue_count": len(review_result.non_blocking_issues or []),
                        "failure_tag_count": len(review_result.failure_tags or []),
                    },
                )

            if review_result.blocking_issues and not budget_exhausted:
                generation_retry_count = 1
                with self._span(
                    "idea_script.generate",
                    {
                        "product": req.product,
                        "retry_count": generation_retry_count,
                        "persona_present": bool((inference_result.persona or "").strip()),
                        "pain_point_count": len(inference_result.pain_points or []),
                        "scene_count": len(inference_result.scenes or []),
                    },
                ) as generate_retry_span:
                    allow_llm, total_llm_calls, budget_exhausted, budget_exhausted_reason = self._reserve_llm_call(
                        node=self.generator_node,
                        llm_method_name="generate_idea_scripts",
                        step_name="generate_retry",
                        total_llm_calls=total_llm_calls,
                        budget_exhausted=budget_exhausted,
                        budget_exhausted_reason=budget_exhausted_reason,
                    )
                    topics = self._call_run(
                        self.generator_node,
                        audience_context=inference_result,
                        retry=True,
                        reviewer_blocking_issues=review_result.blocking_issues,
                        previous_topics=review_result.normalized_topics,
                        allow_llm=allow_llm,
                    )
                    self._set_span_attrs(
                        generate_retry_span,
                        {
                            "topic_count": len(topics or []),
                            "angle_count": len({getattr(t, "angle", None) for t in (topics or []) if getattr(t, "angle", None)}),
                        },
                    )

                with self._span("idea_script.review", {"topic_count": len(topics or [])}) as review_retry_span:
                    review_result = self.reviewer_node.run(inference_result, topics)
                    self._set_span_attrs(
                        review_retry_span,
                        {
                            "passed": review_result.passed,
                            "blocking_issue_count": len(review_result.blocking_issues or []),
                            "non_blocking_issue_count": len(review_result.non_blocking_issues or []),
                            "failure_tag_count": len(review_result.failure_tags or []),
                        },
                    )

            final_topics = review_result.normalized_topics or []

            with self._span("idea_script.risk_scan", {"topic_count": len(final_topics)}) as risk_scan_span:
                allow_llm, total_llm_calls, budget_exhausted, budget_exhausted_reason = self._reserve_llm_call(
                    node=self.risk_scanner_node,
                    llm_method_name="scan_compliance_risk",
                    step_name="risk_scan",
                    total_llm_calls=total_llm_calls,
                    budget_exhausted=budget_exhausted,
                    budget_exhausted_reason=budget_exhausted_reason,
                )
                compliance_result = self._call_run(
                    self.risk_scanner_node,
                    product=inference_result.product,
                    persona=inference_result.persona,
                    topics=final_topics,
                    allow_llm=allow_llm,
                )
                self._set_span_attrs(
                    risk_scan_span,
                    {
                        "risk_level": compliance_result.risk_level,
                        "risky_span_count": len(compliance_result.risky_spans or []),
                    },
                )

            if self._risk_at_least(compliance_result.risk_level, "medium") and not budget_exhausted:
                safe_rewrite_applied = True
                with self._span(
                    "idea_script.safe_rewrite",
                    {
                        "topic_count": len(final_topics),
                        "risk_level": compliance_result.risk_level,
                        "risky_span_count": len(compliance_result.risky_spans or []),
                    },
                ) as rewrite_span:
                    allow_llm, total_llm_calls, budget_exhausted, budget_exhausted_reason = self._reserve_llm_call(
                        node=self.safe_rewrite_node,
                        llm_method_name="safe_rewrite_topics",
                        step_name="safe_rewrite",
                        total_llm_calls=total_llm_calls,
                        budget_exhausted=budget_exhausted,
                        budget_exhausted_reason=budget_exhausted_reason,
                    )
                    rewrite_result = self._call_run(
                        self.safe_rewrite_node,
                        product=inference_result.product,
                        persona=inference_result.persona,
                        topics=final_topics,
                        risky_spans=compliance_result.risky_spans,
                        allow_llm=allow_llm,
                    )
                    self._set_span_attrs(
                        rewrite_span,
                        {
                            "changed": rewrite_result.changed,
                            "rewritten_span_count": rewrite_result.rewritten_span_count,
                        },
                    )

                rewritten_topics = rewrite_result.rewritten_topics or final_topics
                with self._span("idea_script.review", {"topic_count": len(rewritten_topics)}) as review_after_rewrite_span:
                    review_result = self.reviewer_node.run(inference_result, rewritten_topics)
                    self._set_span_attrs(
                        review_after_rewrite_span,
                        {
                            "passed": review_result.passed,
                            "blocking_issue_count": len(review_result.blocking_issues or []),
                            "non_blocking_issue_count": len(review_result.non_blocking_issues or []),
                            "failure_tag_count": len(review_result.failure_tags or []),
                            "from_safe_rewrite": True,
                        },
                    )
                final_topics = review_result.normalized_topics or rewritten_topics

                with self._span("idea_script.risk_scan", {"topic_count": len(final_topics), "after_rewrite": True}) as risk_scan_retry_span:
                    allow_llm, total_llm_calls, budget_exhausted, budget_exhausted_reason = self._reserve_llm_call(
                        node=self.risk_scanner_node,
                        llm_method_name="scan_compliance_risk",
                        step_name="risk_scan_after_rewrite",
                        total_llm_calls=total_llm_calls,
                        budget_exhausted=budget_exhausted,
                        budget_exhausted_reason=budget_exhausted_reason,
                    )
                    compliance_result = self._call_run(
                        self.risk_scanner_node,
                        product=inference_result.product,
                        persona=inference_result.persona,
                        topics=final_topics,
                        allow_llm=allow_llm,
                    )
                    self._set_span_attrs(
                        risk_scan_retry_span,
                        {
                            "risk_level": compliance_result.risk_level,
                            "risky_span_count": len(compliance_result.risky_spans or []),
                        },
                    )

            generation_warning = len(review_result.blocking_issues or []) > 0
            generation_warning_reason = None
            if generation_warning:
                generation_warning_reason = (
                    "blocking_review_issues_after_retry"
                    if generation_retry_count > 0
                    else "blocking_review_issues"
                )

            compliance_warning = bool(
                safe_rewrite_applied and self._risk_at_least(compliance_result.risk_level, "high")
            )
            compliance_warning_reason = (
                "high_risk_after_safe_rewrite" if compliance_warning else None
            )

            rubric_scores = None
            if self.config.scoring_enabled and not budget_exhausted:
                with self._span(
                    "idea_script.score",
                    {
                        "topic_count": len(final_topics),
                        "risk_level": compliance_result.risk_level,
                    },
                ) as score_span:
                    allow_llm, total_llm_calls, budget_exhausted, budget_exhausted_reason = self._reserve_llm_call(
                        node=self.scoring_node,
                        llm_method_name="score_idea_scripts",
                        step_name="score",
                        total_llm_calls=total_llm_calls,
                        budget_exhausted=budget_exhausted,
                        budget_exhausted_reason=budget_exhausted_reason,
                    )
                    rubric_scores = self._call_run(
                        self.scoring_node,
                        audience_context=inference_result,
                        topics=final_topics,
                        review_result=review_result,
                        compliance_result=compliance_result,
                        allow_llm=allow_llm,
                    )
                    self._set_span_attrs(
                        score_span,
                        {
                            "persona_specificity_score": rubric_scores.persona_specificity_score,
                            "hook_strength_score": rubric_scores.hook_strength_score,
                            "topic_diversity_score": rubric_scores.topic_diversity_score,
                            "script_speakability_score": rubric_scores.script_speakability_score,
                            "compliance_score": rubric_scores.compliance_score,
                        },
                    )

            storyboard_issues: list[str] = []
            storyboard_failure_tags: list[str] = []
            storyboard_warning = False
            storyboard_warning_reason = None

            topics_with_shots = [t.model_copy(deep=True) for t in final_topics]

            with self._span(
                "idea_script.storyboard.generate",
                {"topic_count": len(topics_with_shots), "storyboard_retry_count": storyboard_retry_count},
            ) as storyboard_generate_span:
                shot_count = 0
                duration_total = 0.0
                camera_types = set()
                segment_coverage_ok = True
                for idx, topic in enumerate(topics_with_shots):
                    allow_llm, total_llm_calls, budget_exhausted, budget_exhausted_reason = self._reserve_llm_call(
                        node=self.storyboard_node,
                        llm_method_name="generate_storyboard",
                        step_name=f"storyboard_generate:{idx}",
                        total_llm_calls=total_llm_calls,
                        budget_exhausted=budget_exhausted,
                        budget_exhausted_reason=budget_exhausted_reason,
                    )
                    shots = self._call_run(
                        self.storyboard_node,
                        audience_context=inference_result,
                        topic=topic,
                        retry=False,
                        allow_llm=allow_llm,
                    )
                    topic.shots = shots
                    shot_count += len(shots)
                    duration_total += sum(float(s.duration_sec or 0.0) for s in shots)
                    camera_types.update((s.camera or "").strip() for s in shots if (s.camera or "").strip())
                    segment_coverage_ok = segment_coverage_ok and self._segment_coverage_ok(shots)
                    topics_with_shots[idx] = topic
                self._set_span_attrs(
                    storyboard_generate_span,
                    {
                        "shot_count": shot_count,
                        "duration_total": round(duration_total, 2),
                        "segment_coverage_ok": segment_coverage_ok,
                        "camera_variety_count": len(camera_types),
                        "storyboard_retry_count": storyboard_retry_count,
                    },
                )

            storyboard_blocking_issues: list[str] = []
            with self._span(
                "idea_script.storyboard.review",
                {"topic_count": len(topics_with_shots), "storyboard_retry_count": storyboard_retry_count},
            ) as storyboard_review_span:
                storyboard_non_blocking_issues: list[str] = []
                segment_coverage_ok = True
                duration_total = 0.0
                shot_count = 0
                camera_types = set()
                for idx, topic in enumerate(topics_with_shots):
                    review = self.storyboard_reviewer_node.run(
                        audience_context=inference_result,
                        topic=topic,
                        shots=topic.shots,
                    )
                    topic.shots = review.normalized_shots
                    topics_with_shots[idx] = topic
                    duration_total += review.duration_total
                    shot_count += len(review.normalized_shots or [])
                    camera_types.update((s.camera or "").strip() for s in (review.normalized_shots or []) if (s.camera or "").strip())
                    segment_coverage_ok = segment_coverage_ok and review.segment_coverage_ok
                    storyboard_blocking_issues.extend(review.blocking_issues)
                    storyboard_non_blocking_issues.extend(review.non_blocking_issues)
                    storyboard_failure_tags.extend(review.failure_tags)
                storyboard_issues = storyboard_blocking_issues + storyboard_non_blocking_issues
                self._set_span_attrs(
                    storyboard_review_span,
                    {
                        "shot_count": shot_count,
                        "duration_total": round(duration_total, 2),
                        "segment_coverage_ok": segment_coverage_ok,
                        "camera_variety_count": len(camera_types),
                        "storyboard_retry_count": storyboard_retry_count,
                    },
                )

            if storyboard_blocking_issues and not budget_exhausted:
                storyboard_retry_count = 1
                retry_blocking = list(storyboard_blocking_issues)
                with self._span(
                    "idea_script.storyboard.generate",
                    {"topic_count": len(topics_with_shots), "storyboard_retry_count": storyboard_retry_count},
                ) as storyboard_generate_retry_span:
                    shot_count = 0
                    duration_total = 0.0
                    camera_types = set()
                    segment_coverage_ok = True
                    for idx, topic in enumerate(topics_with_shots):
                        allow_llm, total_llm_calls, budget_exhausted, budget_exhausted_reason = self._reserve_llm_call(
                            node=self.storyboard_node,
                            llm_method_name="generate_storyboard",
                            step_name=f"storyboard_generate_retry:{idx}",
                            total_llm_calls=total_llm_calls,
                            budget_exhausted=budget_exhausted,
                            budget_exhausted_reason=budget_exhausted_reason,
                        )
                        shots = self._call_run(
                            self.storyboard_node,
                            audience_context=inference_result,
                            topic=topic,
                            retry=True,
                            reviewer_blocking_issues=retry_blocking,
                            allow_llm=allow_llm,
                        )
                        topic.shots = shots
                        topics_with_shots[idx] = topic
                        shot_count += len(shots)
                        duration_total += sum(float(s.duration_sec or 0.0) for s in shots)
                        camera_types.update((s.camera or "").strip() for s in shots if (s.camera or "").strip())
                        segment_coverage_ok = segment_coverage_ok and self._segment_coverage_ok(shots)
                    self._set_span_attrs(
                        storyboard_generate_retry_span,
                        {
                            "shot_count": shot_count,
                            "duration_total": round(duration_total, 2),
                            "segment_coverage_ok": segment_coverage_ok,
                            "camera_variety_count": len(camera_types),
                            "storyboard_retry_count": storyboard_retry_count,
                        },
                    )

                with self._span(
                    "idea_script.storyboard.review",
                    {"topic_count": len(topics_with_shots), "storyboard_retry_count": storyboard_retry_count},
                ) as storyboard_review_retry_span:
                    storyboard_blocking_issues = []
                    storyboard_non_blocking_issues = []
                    storyboard_failure_tags = []
                    segment_coverage_ok = True
                    duration_total = 0.0
                    shot_count = 0
                    camera_types = set()
                    for idx, topic in enumerate(topics_with_shots):
                        review = self.storyboard_reviewer_node.run(
                            audience_context=inference_result,
                            topic=topic,
                            shots=topic.shots,
                        )
                        topic.shots = review.normalized_shots
                        topics_with_shots[idx] = topic
                        duration_total += review.duration_total
                        shot_count += len(review.normalized_shots or [])
                        camera_types.update((s.camera or "").strip() for s in (review.normalized_shots or []) if (s.camera or "").strip())
                        segment_coverage_ok = segment_coverage_ok and review.segment_coverage_ok
                        storyboard_blocking_issues.extend(review.blocking_issues)
                        storyboard_non_blocking_issues.extend(review.non_blocking_issues)
                        storyboard_failure_tags.extend(review.failure_tags)
                    storyboard_issues = storyboard_blocking_issues + storyboard_non_blocking_issues
                    self._set_span_attrs(
                        storyboard_review_retry_span,
                        {
                            "shot_count": shot_count,
                            "duration_total": round(duration_total, 2),
                            "segment_coverage_ok": segment_coverage_ok,
                            "camera_variety_count": len(camera_types),
                            "storyboard_retry_count": storyboard_retry_count,
                        },
                    )

                if storyboard_blocking_issues:
                    storyboard_warning = True
                    storyboard_warning_reason = "storyboard_blocking_issues_after_retry"
            elif storyboard_blocking_issues and budget_exhausted:
                storyboard_warning = True
                storyboard_warning_reason = "storyboard_blocking_issues_budget_exhausted"

            final_topics = topics_with_shots

            matched_assets: dict[str, list[Any]] = {}
            asset_match_warning = False
            asset_match_warning_reason: Optional[str] = None
            shot_count = 0
            matched_shot_count = 0
            shot_match_rate = 0.0
            avg_candidates_per_shot = 0.0
            total_candidates = 0
            segment_total: dict[str, int] = {"HOOK": 0, "VIEW": 0, "STEPS": 0, "PRODUCT": 0, "CTA": 0}
            segment_matched: dict[str, int] = {"HOOK": 0, "VIEW": 0, "STEPS": 0, "PRODUCT": 0, "CTA": 0}
            segment_match_rate: dict[str, float] = {}
            asset_db_path = str(getattr(self.asset_index_tool, "db_path", self.config.asset_db_path) or "")
            with self._span(
                "idea_script.asset_match",
                {
                    "topic_count": len(final_topics),
                    "asset_db_path": asset_db_path,
                },
            ) as asset_match_span:
                try:
                    for topic in final_topics:
                        for shot in list(getattr(topic, "shots", []) or []):
                            shot_count += 1
                            segment = str(getattr(shot, "segment", "") or "").upper()
                            if segment in segment_total:
                                segment_total[segment] += 1
                            query = self.shot_query_builder.build(shot)
                            candidates = self.asset_index_tool.search(
                                query=query,
                                top_k=self.config.asset_match_top_k,
                            )
                            matched_assets[str(getattr(shot, "shot_id", "") or f"shot_{shot_count}")] = candidates
                            if candidates:
                                matched_shot_count += 1
                                if segment in segment_matched:
                                    segment_matched[segment] += 1
                            total_candidates += len(candidates or [])
                    if shot_count > 0:
                        shot_match_rate = round(float(matched_shot_count) / float(shot_count), 3)
                        avg_candidates_per_shot = round(float(total_candidates) / float(shot_count), 3)
                    for key in segment_total.keys():
                        total = int(segment_total.get(key, 0) or 0)
                        matched = int(segment_matched.get(key, 0) or 0)
                        segment_match_rate[key] = round((float(matched) / float(total)), 3) if total > 0 else 0.0
                    if shot_count == 0:
                        asset_match_warning = True
                        asset_match_warning_reason = "asset_match_no_shots"
                    elif matched_shot_count == 0:
                        asset_match_warning = True
                        asset_match_warning_reason = "asset_match_no_candidates"
                except Exception as e:
                    matched_assets = {}
                    shot_match_rate = 0.0
                    avg_candidates_per_shot = 0.0
                    segment_match_rate = {}
                    asset_match_warning = True
                    asset_match_warning_reason = "asset_match_failed"
                    sys_logger.warning(f"idea_script.asset_match failed: {e}")

                self._set_span_attrs(
                    asset_match_span,
                    {
                        "shot_count": shot_count,
                        "matched_shot_count": matched_shot_count,
                        "shot_match_rate": shot_match_rate,
                        "avg_candidates_per_shot": avg_candidates_per_shot,
                        "asset_db_path": asset_db_path,
                    },
                )

            edit_plans: list[Any] = []
            edit_plan_warning = False
            edit_plan_warning_reason: Optional[str] = None
            clip_count_total = 0
            missing_primary_asset_count = 0
            with self._span(
                "idea_script.edit_plan.build",
                {"topic_count": len(final_topics)},
            ) as edit_plan_span:
                try:
                    build_result = self.edit_plan_builder.run(
                        product=inference_result.product,
                        topics=final_topics,
                        matched_assets=matched_assets,
                        prompt_version=prompt_version,
                        policy_version=policy_version,
                        config_hash=config_hash,
                        alternates_top_k=self.config.asset_match_top_k,
                    )
                    edit_plans = list(build_result.get("edit_plans") or [])
                    edit_plan_warning = bool(build_result.get("edit_plan_warning", False))
                    edit_plan_warning_reason = build_result.get("edit_plan_warning_reason")
                    clip_count_total = int(build_result.get("clip_count_total") or 0)
                    missing_primary_asset_count = int(build_result.get("missing_primary_asset_count") or 0)
                except Exception as e:
                    edit_plans = []
                    edit_plan_warning = True
                    edit_plan_warning_reason = "edit_plan_build_failed"
                    clip_count_total = 0
                    missing_primary_asset_count = 0
                    sys_logger.warning(f"idea_script.edit_plan.build failed: {e}")

                self._set_span_attrs(
                    edit_plan_span,
                    {
                        "plan_count": len(edit_plans or []),
                        "clip_count_total": clip_count_total,
                        "missing_primary_asset_count": missing_primary_asset_count,
                        "edit_plan_warning": edit_plan_warning,
                    },
                )

            response = IdeaScriptResponse(
                audience_context=inference_result,
                topics=final_topics,
                inference_warning=inference_warning,
                warning_reason=warning_reason,
                retry_count=retry_count,
                generation_warning=generation_warning,
                generation_warning_reason=generation_warning_reason,
                generation_retry_count=generation_retry_count,
                blocking_issues=review_result.blocking_issues,
                non_blocking_issues=review_result.non_blocking_issues,
                failure_tags=review_result.failure_tags,
                review_issues=(review_result.blocking_issues + review_result.non_blocking_issues),
                risk_level=compliance_result.risk_level,
                risky_spans=compliance_result.risky_spans,
                compliance_warning=compliance_warning,
                compliance_warning_reason=compliance_warning_reason,
                safe_rewrite_applied=safe_rewrite_applied,
                rubric_scores=rubric_scores,
                storyboard_warning=storyboard_warning,
                storyboard_warning_reason=storyboard_warning_reason,
                storyboard_retry_count=storyboard_retry_count,
                storyboard_issues=storyboard_issues,
                storyboard_failure_tags=sorted(set(storyboard_failure_tags)),
                matched_assets=matched_assets,
                asset_match_warning=asset_match_warning,
                asset_match_warning_reason=asset_match_warning_reason,
                shot_match_rate=shot_match_rate,
                avg_candidates_per_shot=avg_candidates_per_shot,
                segment_match_rate=segment_match_rate,
                edit_plans=edit_plans,
                edit_plan_warning=edit_plan_warning,
                edit_plan_warning_reason=edit_plan_warning_reason,
                prompt_version=prompt_version,
                policy_version=policy_version,
                config_hash=config_hash,
                budget_exhausted=budget_exhausted,
                budget_exhausted_reason=budget_exhausted_reason,
                total_llm_calls=total_llm_calls,
            )

            self._set_span_attrs(
                run_span,
                {
                    "product": req.product,
                    "retry_count": retry_count,
                    "generation_retry_count": generation_retry_count,
                    "inference_warning": inference_warning,
                    "generation_warning": generation_warning,
                    "risk_level": response.risk_level,
                    "compliance_warning": response.compliance_warning,
                    "topic_count": len(response.topics or []),
                    "scoring_enabled": self.config.scoring_enabled,
                    "storyboard_warning": response.storyboard_warning,
                    "storyboard_retry_count": response.storyboard_retry_count,
                    "shot_match_rate": response.shot_match_rate,
                    "avg_candidates_per_shot": response.avg_candidates_per_shot,
                    "segment_match_rate_hook": float((response.segment_match_rate or {}).get("HOOK", 0.0)),
                    "segment_match_rate_view": float((response.segment_match_rate or {}).get("VIEW", 0.0)),
                    "segment_match_rate_steps": float((response.segment_match_rate or {}).get("STEPS", 0.0)),
                    "segment_match_rate_product": float((response.segment_match_rate or {}).get("PRODUCT", 0.0)),
                    "segment_match_rate_cta": float((response.segment_match_rate or {}).get("CTA", 0.0)),
                    "asset_match_warning": response.asset_match_warning,
                    "asset_match_warning_reason": response.asset_match_warning_reason,
                    "edit_plan_count": len(response.edit_plans or []),
                    "edit_plan_warning": response.edit_plan_warning,
                    "edit_plan_warning_reason": response.edit_plan_warning_reason,
                    "prompt_version": prompt_version,
                    "policy_version": policy_version,
                    "config_hash": config_hash,
                    "budget_exhausted": budget_exhausted,
                    "budget_exhausted_reason": budget_exhausted_reason,
                    "total_llm_calls": total_llm_calls,
                },
            )
            self._cache_set(cache_key, response)
            return response
