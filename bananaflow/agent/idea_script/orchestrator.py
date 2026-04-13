from __future__ import annotations

from collections import OrderedDict
from contextlib import contextmanager, nullcontext
import inspect
import json
import time
from typing import Any, Dict, Iterator, Optional

try:
    from ...assets.schemas import AssetCandidate
    from ...assets.index_tool import AssetIndexTool
    from ...assets.query_builder import ShotQueryBuilder
    from ...core.logging import sys_logger
    from ...mcp.client import MCPClientError, MCPStdioClient
    from ...mcp.registry import MCPRegistryError, MCPToolInvocationError, get_global_registry
    from ...mcp.tool_asset_match import (
        MATCH_ASSETS_TOOL_HASH,
        MATCH_ASSETS_TOOL_NAME,
        MATCH_ASSETS_TOOL_VERSION,
    )
    from ...context.context_builder import ContextPack, build_context_pack
    from ...quality.metrics_schema import build_quality_metrics, quality_span_attributes
    from ...quality.trajectory import Trajectory, trajectory_span_attributes
except Exception:  # pragma: no cover - 兼容 python bananaflow/main.py 直跑
    from assets.schemas import AssetCandidate
    from assets.index_tool import AssetIndexTool
    from assets.query_builder import ShotQueryBuilder
    from core.logging import sys_logger
    from mcp.client import MCPClientError, MCPStdioClient
    from mcp.registry import MCPRegistryError, MCPToolInvocationError, get_global_registry
    from mcp.tool_asset_match import MATCH_ASSETS_TOOL_HASH, MATCH_ASSETS_TOOL_NAME, MATCH_ASSETS_TOOL_VERSION
    from context.context_builder import ContextPack, build_context_pack
    from quality.metrics_schema import build_quality_metrics, quality_span_attributes
    from quality.trajectory import Trajectory, trajectory_span_attributes
from .config import IdeaScriptAgentConfig
from .edit_plan_builder import EditPlanBuilder
from .gemini_client import DEFAULT_IDEA_SCRIPT_MODEL, build_idea_script_gemini_client
from .generator import IdeaScriptGeneratorNode
from .inference import AudienceInferenceNode
from .output_pack import build_structured_result
from .prompts import INFERENCE_CONFIDENCE_THRESHOLD, PROMPT_VERSION
from .reviewer import IdeaScriptReviewerNode
from .risk_scanner import ComplianceGuardNode, RISK_POLICY_VERSION
from .safe_rewrite import SafeRewriteNode
from .scoring import ScoringReviewerNode
from .storyboard import StoryboardAgentNode
from .storyboard_reviewer import StoryboardReviewerNode
from .schemas import ComplianceScanResult, IdeaScriptRequest, IdeaScriptResponse, IdeaScriptReviewResult

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
        self.default_llm_model = (
            (self.config.generation.model or "").strip() or DEFAULT_IDEA_SCRIPT_MODEL
        )
        self.inference_node = inference_node or AudienceInferenceNode(
            llm_client=build_idea_script_gemini_client(self.config.inference),
            model_config=self.config.inference,
        )
        self.generator_node = generator_node or IdeaScriptGeneratorNode(
            llm_client=build_idea_script_gemini_client(self.config.generation),
            model_config=self.config.generation,
        )
        self.reviewer_node = reviewer_node or IdeaScriptReviewerNode(model_config=self.config.review)
        self.risk_scanner_node = risk_scanner_node or ComplianceGuardNode(
            llm_client=build_idea_script_gemini_client(self.config.risk_scan),
            model_config=self.config.risk_scan,
        )
        self.safe_rewrite_node = safe_rewrite_node or SafeRewriteNode(
            llm_client=build_idea_script_gemini_client(self.config.safe_rewrite),
            model_config=self.config.safe_rewrite,
        )
        self.scoring_node = scoring_node or ScoringReviewerNode(
            llm_client=build_idea_script_gemini_client(self.config.score),
            model_config=self.config.score,
        )
        self.storyboard_node = storyboard_node or StoryboardAgentNode(
            llm_client=build_idea_script_gemini_client(self.config.storyboard_generate),
            model_config=self.config.storyboard_generate,
        )
        self.storyboard_reviewer_node = storyboard_reviewer_node or StoryboardReviewerNode(model_config=self.config.storyboard_review)
        self.asset_index_tool = asset_index_tool or AssetIndexTool(
            db_path=self.config.asset_db_path,
            tag_normalize_enabled=self.config.tag_normalize_enabled,
        )
        self.shot_query_builder = shot_query_builder or ShotQueryBuilder()
        self.edit_plan_builder = edit_plan_builder or EditPlanBuilder()
        self._tracer = _otel_trace.get_tracer(__name__) if _otel_trace else None
        self._cache: OrderedDict[str, IdeaScriptResponse] = OrderedDict()
        self._last_trajectory: Optional[Trajectory] = None

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

    def get_last_trajectory(self) -> Optional[Dict[str, Any]]:
        if self._last_trajectory is None:
            return None
        return self._last_trajectory.to_dict()

    def _risk_at_least(self, level: str, target: str) -> bool:
        return _RISK_ORDER.get(level or "low", 0) >= _RISK_ORDER.get(target or "low", 0)

    def _cache_key(self, req: IdeaScriptRequest) -> str:
        cfg_hash = self.config.stable_config_hash()
        brief_parts = [
            str(getattr(req, "audience", "") or "").strip().lower(),
            str(getattr(req, "price_band", "") or "").strip().lower(),
            str(getattr(req, "conversion_goal", "") or "").strip().lower(),
            str(getattr(req, "primary_platform", "") or "").strip().lower(),
            str(getattr(req, "secondary_platform", "") or "").strip().lower(),
            str(getattr(req, "selected_angle", "") or "").strip().lower(),
        ]
        brief_key = "|".join(brief_parts)
        return (
            f"{(req.product or '').strip().lower()}::brief={brief_key}"
            f"::scoring={int(self.config.scoring_enabled)}::cfg={cfg_hash}"
        )

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

    def _build_brief_context(self, req: IdeaScriptRequest) -> dict[str, str]:
        brief = {
            "audience": str(getattr(req, "audience", "") or "").strip(),
            "price_band": str(getattr(req, "price_band", "") or "").strip(),
            "conversion_goal": str(getattr(req, "conversion_goal", "") or "").strip(),
            "primary_platform": str(getattr(req, "primary_platform", "") or "").strip(),
            "secondary_platform": str(getattr(req, "secondary_platform", "") or "").strip(),
            "selected_angle": str(getattr(req, "selected_angle", "") or "").strip(),
        }
        return {key: value for key, value in brief.items() if value}

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
        if ("allow_llm" in kwargs and "allow_llm" not in sig.parameters) or (
            "context_pack" in kwargs and "context_pack" not in sig.parameters
        ):
            kwargs = dict(kwargs)
        if "allow_llm" not in sig.parameters and "allow_llm" in kwargs:
            kwargs.pop("allow_llm", None)
        if "context_pack" not in sig.parameters and "context_pack" in kwargs:
            kwargs.pop("context_pack", None)
        return run_func(**kwargs)

    def _build_context_pack_for_llm(
        self,
        tenant_id: Optional[str],
        user_id: Optional[str],
        session_id: Optional[str],
        base_system: str,
    ) -> Optional[ContextPack]:
        use_summary = bool(getattr(self.config, "use_session_summary_in_context", False))
        use_preferences = bool(getattr(self.config, "use_user_preferences_in_context", False))
        if not use_summary and not use_preferences:
            return None
        normalized_tenant = str(tenant_id or "").strip()
        normalized_user = str(user_id or "").strip()
        normalized_session = str(session_id or "").strip()
        if not normalized_tenant or not normalized_user or not normalized_session:
            return None
        try:
            pack = build_context_pack(
                tenant_id=normalized_tenant,
                user_id=normalized_user,
                session_id=normalized_session,
                base_system=base_system,
                max_recent_turns=int(getattr(self.config, "context_max_recent_turns", 6) or 6),
                max_summary_chars=int(getattr(self.config, "context_max_summary_chars", 1500) or 1500),
                max_turn_chars=int(getattr(self.config, "context_max_turn_chars", 6000) or 6000),
                use_user_preferences=use_preferences,
                max_pref_items=int(getattr(self.config, "context_max_pref_items", 10) or 10),
                max_pref_chars=int(getattr(self.config, "context_max_pref_chars", 1200) or 1200),
            )
            truncation = dict((pack.metadata or {}).get("truncation_info") or {})
            sys_logger.info(
                json.dumps(
                    {
                        "event": "idea_script.context_built",
                        "session_id": normalized_session,
                        "summary_present": bool((pack.session_summary or "").strip()),
                        "turns_count": len(pack.recent_turns or []),
                        "truncated": bool(truncation.get("truncated")),
                        "summary_chars": len(pack.session_summary or ""),
                        "turn_chars": sum(len(str(t.get("content") or "")) for t in list(pack.recent_turns or [])),
                        "pref_items": len(pack.user_preferences or []),
                        "pref_chars": int(truncation.get("preference_chars_after") or 0),
                        "pref_truncated": bool(truncation.get("preferences_truncated")),
                        "pref_expired_filtered_count": int(truncation.get("expired_filtered_count") or 0),
                        "pref_update_count_sum": int((pack.metadata or {}).get("preferences_update_count_sum") or 0),
                    },
                    ensure_ascii=False,
                )
            )
            return pack
        except Exception as e:
            sys_logger.warning(
                f"idea_script.context_build_failed: session_id={normalized_session} err={e}"
            )
            return None

    def _collect_context_span_metrics(
        self,
        metrics: Dict[str, Any],
        context_pack: Optional[ContextPack],
    ) -> None:
        if context_pack is None:
            return
        summary_chars = len(context_pack.session_summary or "")
        turn_chars = sum(len(str(turn.get("content") or "")) for turn in list(context_pack.recent_turns or []))
        trunc_info = dict((context_pack.metadata or {}).get("truncation_info") or {})
        pref_chars = int(trunc_info.get("preference_chars_after") or 0)
        metrics["context_summary_used"] = bool((context_pack.session_summary or "").strip())
        metrics["context_recent_turns_count"] = max(
            int(metrics.get("context_recent_turns_count") or 0),
            len(context_pack.recent_turns or []),
        )
        metrics["context_summary_chars"] = max(
            int(metrics.get("context_summary_chars") or 0),
            summary_chars,
        )
        metrics["context_turn_chars"] = max(
            int(metrics.get("context_turn_chars") or 0),
            turn_chars,
        )
        metrics["memory_pref_used"] = bool(context_pack.user_preferences)
        metrics["memory_pref_items_count"] = max(
            int(metrics.get("memory_pref_items_count") or 0),
            len(context_pack.user_preferences or []),
        )
        metrics["memory_pref_chars"] = max(
            int(metrics.get("memory_pref_chars") or 0),
            pref_chars,
        )
        metrics["memory_pref_truncated"] = bool(
            metrics.get("memory_pref_truncated") or trunc_info.get("preferences_truncated")
        )
        metrics["memory_pref_expired_filtered_count"] = max(
            int(metrics.get("memory_pref_expired_filtered_count") or 0),
            int(trunc_info.get("expired_filtered_count") or 0),
        )
        metrics["memory_pref_update_count_sum"] = max(
            int(metrics.get("memory_pref_update_count_sum") or 0),
            int((context_pack.metadata or {}).get("preferences_update_count_sum") or 0),
        )
        metrics["context_truncated"] = bool(metrics.get("context_truncated") or trunc_info.get("truncated"))

    def _to_asset_candidate(self, raw: Any) -> Optional[AssetCandidate]:
        try:
            if isinstance(raw, AssetCandidate):
                return raw
            if isinstance(raw, dict):
                return AssetCandidate(**raw)
            if hasattr(raw, "model_dump"):
                return AssetCandidate(**raw.model_dump(mode="json"))
            return AssetCandidate(
                asset_id=str(getattr(raw, "asset_id", "") or "").strip(),
                uri=str(getattr(raw, "uri", "") or "").strip(),
                score=float(getattr(raw, "score", 0.0) or 0.0),
                bucket=str(getattr(raw, "bucket", "fallback") or "fallback"),  # type: ignore[arg-type]
                reason=str(getattr(raw, "reason", "") or ""),
            )
        except Exception:
            return None

    def _asset_match_via_mcp(
        self,
        topics: list[Any],
        asset_db_path: str,
    ) -> tuple[dict[str, list[AssetCandidate]], dict[str, Any], str, str, Optional[str], bool]:
        shots_payload: list[dict[str, Any]] = []
        shot_index = 0
        for topic in list(topics or []):
            for shot in list(getattr(topic, "shots", []) or []):
                shot_index += 1
                reqs = []
                for req in list(getattr(shot, "asset_requirements", []) or []):
                    if hasattr(req, "model_dump"):
                        reqs.append(req.model_dump(mode="json"))
                    elif isinstance(req, dict):
                        reqs.append(dict(req))
                    else:
                        reqs.append(str(req))
                shot_id = str(getattr(shot, "shot_id", "") or "").strip() or f"shot_{shot_index}"
                shots_payload.append(
                    {
                        "shot_id": shot_id,
                        "segment": str(getattr(shot, "segment", "") or "").upper(),
                        "keyword_tags": list(getattr(shot, "keyword_tags", []) or []),
                        "asset_requirements": reqs,
                        "top_k": int(self.config.asset_match_top_k),
                    }
                )
        request_payload = {
            "shots": shots_payload,
            "top_k": int(self.config.asset_match_top_k),
            "db_path": asset_db_path,
            "tag_normalize_enabled": bool(self.config.tag_normalize_enabled),
        }
        mcp_server_name: Optional[str] = None
        mcp_registry_used = bool(getattr(self.config, "mcp_use_registry", False))
        if mcp_registry_used:
            registry = get_global_registry()
            out = registry.call_tool(MATCH_ASSETS_TOOL_NAME, request_payload)
            tool_info = registry.get_tool_info(MATCH_ASSETS_TOOL_NAME) or {}
            mcp_server_name = str(tool_info.get("server_name") or "").strip() or None
        else:
            with MCPStdioClient(server_module="bananaflow.mcp.server_asset_match") as mcp_client:
                out = mcp_client.call_match_assets_for_shots(request_payload)
        matched_assets: dict[str, list[AssetCandidate]] = {}
        for shot_id, cands in dict(out.get("results") or {}).items():
            parsed: list[AssetCandidate] = []
            for item in list(cands or []):
                cand = self._to_asset_candidate(item)
                if cand is None:
                    continue
                parsed.append(cand)
            matched_assets[str(shot_id)] = parsed
        stats = dict(out.get("stats") or {})
        tool_version = str(out.get("tool_version") or MATCH_ASSETS_TOOL_VERSION)
        tool_hash = str(out.get("tool_hash") or MATCH_ASSETS_TOOL_HASH)
        return matched_assets, stats, tool_version, tool_hash, mcp_server_name, mcp_registry_used

    def run(
        self,
        req: IdeaScriptRequest,
        session_id: Optional[str] = None,
        session_summary_present: Optional[bool] = None,
        tenant_id: Optional[str] = None,
        user_id: Optional[str] = None,
        trajectory_sink: Optional[list[Dict[str, Any]]] = None,
    ) -> IdeaScriptResponse:
        run_started_at = time.perf_counter()
        trajectory_enabled = bool(getattr(self.config, "trajectory_eval_enabled", False))
        trajectory: Optional[Trajectory] = (
            Trajectory(
                session_id=str(session_id or ""),
                tenant_id=str(tenant_id or ""),
                user_id=str(user_id or ""),
                metadata={
                    "task_type": "SCRIPT",
                    "prompt_version": PROMPT_VERSION,
                    "policy_version": RISK_POLICY_VERSION,
                    "config_hash": self.config.stable_config_hash(),
                },
            )
            if trajectory_enabled
            else None
        )
        if trajectory is None:
            self._last_trajectory = None
        if trajectory is not None:
            trajectory.add_stage(
                stage_name="intent_routing",
                tool_name="router.idea_script",
                args={"product": req.product, "intent": "SCRIPT"},
                result={"route": "idea_script.run"},
                success=True,
                reason="orchestrator_entry",
                duration=0.0,
            )
        cache_key = self._cache_key(req)
        cached = self._cache_get(cache_key)
        if cached is not None:
            if trajectory is not None:
                trajectory.add_stage(
                    stage_name="finalize",
                    tool_name="orchestrator.cache",
                    args={"cache_key": cache_key},
                    result={"cache_hit": True},
                    success=True,
                    reason="cache_hit",
                    duration=max(0.0, float(time.perf_counter() - run_started_at)),
                )
                self._last_trajectory = trajectory
                if isinstance(trajectory_sink, list):
                    trajectory_sink.append(trajectory.to_dict())
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
        context_metrics: Dict[str, Any] = {
            "context_summary_used": False,
            "context_recent_turns_count": 0,
            "context_summary_chars": 0,
            "context_turn_chars": 0,
            "context_truncated": False,
            "memory_pref_used": False,
            "memory_pref_items_count": 0,
            "memory_pref_chars": 0,
            "memory_pref_truncated": False,
            "memory_pref_expired_filtered_count": 0,
            "memory_pref_update_count_sum": 0,
        }
        brief_context = self._build_brief_context(req)

        with self._span(
            "idea_script.run",
            {
                "product": req.product,
                "session_id": session_id,
                "session_summary_present": session_summary_present,
                "brief_context_present": bool(brief_context),
            },
        ) as run_span:
            infer_stage_started = time.perf_counter()
            with self._span("idea_script.infer", {"product": req.product, "retry_count": 0}) as infer_span:
                allow_llm, total_llm_calls, budget_exhausted, budget_exhausted_reason = self._reserve_llm_call(
                    node=self.inference_node,
                    llm_method_name="infer_audience",
                    step_name="infer",
                    total_llm_calls=total_llm_calls,
                    budget_exhausted=budget_exhausted,
                    budget_exhausted_reason=budget_exhausted_reason,
                )
                infer_context_pack = (
                    self._build_context_pack_for_llm(
                        tenant_id=tenant_id,
                        user_id=user_id,
                        session_id=session_id,
                        base_system="idea_script.infer",
                    )
                    if allow_llm
                    else None
                )
                self._collect_context_span_metrics(context_metrics, infer_context_pack)
                inference_result = self._call_run(
                    self.inference_node,
                    product=req.product,
                    retry=False,
                    allow_llm=allow_llm,
                    context_pack=infer_context_pack,
                    brief_context=brief_context,
                )
                self._set_infer_span_attrs(infer_span, inference_result)
            if trajectory is not None:
                trajectory.add_stage(
                    stage_name="audience_inference",
                    tool_name="AudienceInferenceNode.run",
                    args={"product": req.product, "retry": False, "allow_llm": bool(allow_llm)},
                    result={
                        "confidence": float(getattr(inference_result, "confidence", 0.0) or 0.0),
                        "persona_present": bool((getattr(inference_result, "persona", "") or "").strip()),
                    },
                    success=True,
                    reason="inference_completed",
                    duration=float(time.perf_counter() - infer_stage_started),
                )

            inference_warning = False
            warning_reason = None

            generate_stage_started = time.perf_counter()
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
                generate_context_pack = (
                    self._build_context_pack_for_llm(
                        tenant_id=tenant_id,
                        user_id=user_id,
                        session_id=session_id,
                        base_system="idea_script.generate",
                    )
                    if allow_llm
                    else None
                )
                self._collect_context_span_metrics(context_metrics, generate_context_pack)
                topics = self._call_run(
                    self.generator_node,
                    audience_context=inference_result,
                    retry=False,
                    allow_llm=allow_llm,
                    context_pack=generate_context_pack,
                    brief_context=brief_context,
                )
                self._set_span_attrs(
                    generate_span,
                    {
                        "topic_count": len(topics or []),
                        "angle_count": len({getattr(t, "angle", None) for t in (topics or []) if getattr(t, "angle", None)}),
                    },
                )
            if trajectory is not None:
                trajectory.add_stage(
                    stage_name="idea_generation",
                    tool_name="IdeaScriptGeneratorNode.run",
                    args={"product": req.product, "retry": False, "allow_llm": bool(allow_llm)},
                    result={"topic_count": len(topics or [])},
                    success=True,
                    reason="generation_completed",
                    duration=float(time.perf_counter() - generate_stage_started),
                )

            raw_skill_payload = dict(getattr(self.generator_node, "last_skill_payload", {}) or {})
            final_topics = list(topics or [])
            generation_warning = False
            generation_warning_reason = None
            compliance_result = ComplianceScanResult(
                risk_level=str(raw_skill_payload.get("risk_level") or inference_result.unsafe_claim_risk or "low"),
                risky_spans=[],
            )
            compliance_warning = False
            compliance_warning_reason = None
            safe_rewrite_applied = False
            rubric_scores = None
            review_result = IdeaScriptReviewResult(
                passed=True,
                blocking_issues=[],
                non_blocking_issues=[],
                failure_tags=[],
                normalized_topics=final_topics,
                issues=[],
                topics=final_topics,
            )

            storyboard_issues: list[str] = []
            storyboard_failure_tags: list[str] = []
            storyboard_warning = False
            storyboard_warning_reason = None
            storyboard_retry_count = 0
            matched_assets: dict[str, list[Any]] = {}
            asset_match_warning = False
            asset_match_warning_reason: Optional[str] = None
            shot_match_rate = 0.0
            avg_candidates_per_shot = 0.0
            segment_match_rate: dict[str, float] = {}
            edit_plans: list[Any] = []
            edit_plan_warning = False
            edit_plan_warning_reason: Optional[str] = None
            asset_match_mcp = False

            response = IdeaScriptResponse(
                audience_context=inference_result,
                topics=final_topics,
                **build_structured_result(
                    req_payload={
                        "product": req.product,
                        "audience": getattr(req, "audience", None),
                        "price_band": getattr(req, "price_band", None),
                        "conversion_goal": getattr(req, "conversion_goal", None),
                        "primary_platform": getattr(req, "primary_platform", None),
                        "secondary_platform": getattr(req, "secondary_platform", None),
                        "selected_angle": getattr(req, "selected_angle", None),
                    },
                    topics=[
                        topic.model_dump(mode="json") if hasattr(topic, "model_dump") else dict(topic)
                        for topic in list(final_topics or [])
                    ],
                    raw_skill_payload=raw_skill_payload,
                    inference_payload=getattr(self.inference_node, "last_skill_payload", {}) or {},
                    risk_level=compliance_result.risk_level,
                    blocking_issues=list(review_result.blocking_issues or []),
                    risky_spans=[
                        item.model_dump(mode="json") if hasattr(item, "model_dump") else dict(item)
                        for item in list(compliance_result.risky_spans or [])
                    ],
                ),
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
            latency_ms = max(0, int((time.perf_counter() - run_started_at) * 1000))
            quality_metrics = build_quality_metrics(
                response=response,
                session_id=str(session_id or ""),
                tenant_id=str(tenant_id or ""),
                user_id=str(user_id or ""),
                prompt_version=prompt_version,
                policy_version=policy_version,
                config_hash=config_hash,
                total_tool_calls=2,
                mcp_calls_count=0,
                mcp_tool_error_count=0,
                latency_ms=latency_ms,
                asset_match_use_mcp=False,
            )
            if trajectory is not None:
                trajectory.metadata = {
                    **dict(trajectory.metadata or {}),
                    "prompt_version": prompt_version,
                    "policy_version": policy_version,
                    "config_hash": config_hash,
                    "quality_task_success": bool(quality_metrics.effectiveness.task_success),
                }
                trajectory.add_stage(
                    stage_name="finalize",
                    tool_name="IdeaScriptOrchestrator.run",
                    args={"topic_count": len(response.topics or []), "edit_plan_count": 0},
                    result={
                        "task_success": bool(quality_metrics.effectiveness.task_success),
                        "compliance_risk": str(response.risk_level or "low"),
                    },
                    success=bool(quality_metrics.effectiveness.task_success),
                    reason="response_built",
                    duration=float(max(0.0, time.perf_counter() - run_started_at)),
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
                    "storyboard_warning": False,
                    "storyboard_retry_count": 0,
                    "shot_match_rate": 0.0,
                    "avg_candidates_per_shot": 0.0,
                    "segment_match_rate_hook": 0.0,
                    "segment_match_rate_view": 0.0,
                    "segment_match_rate_steps": 0.0,
                    "segment_match_rate_product": 0.0,
                    "segment_match_rate_cta": 0.0,
                    "asset_match_warning": False,
                    "asset_match_warning_reason": "",
                    "edit_plan_count": 0,
                    "edit_plan_warning": False,
                    "edit_plan_warning_reason": "",
                    "prompt_version": prompt_version,
                    "policy_version": policy_version,
                    "config_hash": config_hash,
                    "budget_exhausted": budget_exhausted,
                    "budget_exhausted_reason": budget_exhausted_reason,
                    "total_llm_calls": total_llm_calls,
                    "context_summary_used": bool(context_metrics.get("context_summary_used")),
                    "context_recent_turns_count": int(context_metrics.get("context_recent_turns_count") or 0),
                    "context_summary_chars": int(context_metrics.get("context_summary_chars") or 0),
                    "context_turn_chars": int(context_metrics.get("context_turn_chars") or 0),
                    "context_truncated": bool(context_metrics.get("context_truncated")),
                    "memory_pref_used": bool(context_metrics.get("memory_pref_used")),
                    "memory_pref_items_count": int(context_metrics.get("memory_pref_items_count") or 0),
                    "memory_pref_chars": int(context_metrics.get("memory_pref_chars") or 0),
                    "memory_pref_truncated": bool(context_metrics.get("memory_pref_truncated")),
                    "memory_pref_expired_filtered_count": int(
                        context_metrics.get("memory_pref_expired_filtered_count") or 0
                    ),
                    "memory_pref_update_count_sum": int(context_metrics.get("memory_pref_update_count_sum") or 0),
                    **quality_span_attributes(quality_metrics),
                    **trajectory_span_attributes(trajectory),
                },
            )
            sys_logger.info(
                json.dumps(
                    {
                        "event": "idea_script.quality_metrics",
                        "quality_metrics": quality_metrics.model_dump(mode="json"),
                    },
                    ensure_ascii=False,
                )
            )
            if trajectory is not None:
                trajectory_payload = trajectory.to_dict()
                self._last_trajectory = trajectory
                if isinstance(trajectory_sink, list):
                    trajectory_sink.append(trajectory_payload)
                sys_logger.info(
                    json.dumps(
                        {
                            "event": "idea_script.trajectory",
                            "trajectory": trajectory_payload,
                        },
                        ensure_ascii=False,
                    )
                )
            self._cache_set(cache_key, response)
            return response
