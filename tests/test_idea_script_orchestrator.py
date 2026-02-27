import os
import sys
import unittest


ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)


import bananaflow.agent.idea_script.orchestrator as orch_mod
from bananaflow.agent.idea_script.config import IdeaScriptAgentConfig
from bananaflow.agent.idea_script.orchestrator import IdeaScriptOrchestrator
from bananaflow.agent.idea_script.reviewer import IdeaScriptReviewerNode
from bananaflow.agent.idea_script.risk_scanner import ComplianceGuardNode
from bananaflow.agent.idea_script.safe_rewrite import SafeRewriteNode
from bananaflow.agent.idea_script.scoring import ScoringReviewerNode
from bananaflow.agent.idea_script.storyboard import StoryboardAgentNode
from bananaflow.agent.idea_script.storyboard_reviewer import StoryboardReviewerNode
from bananaflow.agent.idea_script.schemas import (
    AssetRequirement,
    AudienceInferenceResult,
    ComplianceScanResult,
    IdeaScriptRequest,
    IdeaScriptReviewResult,
    RiskySpan,
    RubricScoreResult,
    SafeRewriteResult,
    ShotItem,
    StoryboardReviewResult,
    TopicItem,
)


class _StubInferenceNode:
    def __init__(self, confidences):
        self.confidences = list(confidences)
        self.calls = []

    def run(self, product: str, retry: bool = False, previous=None):
        idx = len(self.calls)
        confidence = self.confidences[min(idx, len(self.confidences) - 1)]
        self.calls.append({"product": product, "retry": retry, "previous": previous})
        return AudienceInferenceResult(
            product=product,
            persona="最近30天正在比较该产品并准备首次下单的用户",
            pain_points=["不知道怎么选", "怕买错"],
            scenes=["早晚高峰地铁通勤"],
            why_this_persona="处于决策期",
            confidence=confidence,
            unsafe_claim_risk="low",
        )


class _StubGeneratorNode:
    def __init__(self, outputs=None):
        self.outputs = list(outputs or [])
        self.calls = []

    def run(self, audience_context, retry=False, reviewer_blocking_issues=None, previous_topics=None):
        self.calls.append(
            {
                "retry": retry,
                "reviewer_blocking_issues": list(reviewer_blocking_issues or []),
                "previous_topics_count": len(previous_topics or []),
            }
        )
        if self.outputs:
            return self.outputs[min(len(self.calls) - 1, len(self.outputs) - 1)]
        return [
            TopicItem(angle="persona", title="A", hook="先看适不适合", script_60s="你先别急，先看你自己适不适合，再决定。评论区打清单。"),
            TopicItem(angle="scene", title="B", hook="先看场景", script_60s="你如果经常在早晚高峰地铁通勤这个场景用，就先看这个指标，再做决定。先收藏。"),
            TopicItem(angle="misconception", title="C", hook="这个误区最坑", script_60s="很多人一开始就看错了，你先看需求，再看参数，更容易选对。关注我。"),
        ]


class _StubReviewerNode:
    def __init__(self, outputs):
        self.outputs = list(outputs)
        self.calls = []

    def run(self, audience_context, topics):
        self.calls.append({"topics_count": len(topics or [])})
        return self.outputs[min(len(self.calls) - 1, len(self.outputs) - 1)]


class _StubRiskScannerNode:
    def __init__(self, outputs):
        self.outputs = list(outputs)
        self.calls = []

    def run(self, product, persona, topics):
        self.calls.append(
            {
                "product": product,
                "persona": persona,
                "topic_count": len(topics or []),
            }
        )
        return self.outputs[min(len(self.calls) - 1, len(self.outputs) - 1)]


class _StubSafeRewriteNode:
    def __init__(self, outputs):
        self.outputs = list(outputs)
        self.calls = []

    def run(self, product, persona, topics, risky_spans):
        self.calls.append(
            {
                "product": product,
                "persona": persona,
                "topic_count": len(topics or []),
                "risky_span_count": len(risky_spans or []),
            }
        )
        return self.outputs[min(len(self.calls) - 1, len(self.outputs) - 1)]


class _StubScoringNode:
    def __init__(self, output):
        self.output = output
        self.calls = []

    def run(self, audience_context, topics, review_result, compliance_result):
        self.calls.append(
            {
                "topic_count": len(topics or []),
                "risk_level": compliance_result.risk_level,
                "failure_tag_count": len(review_result.failure_tags or []),
            }
        )
        return self.output


class _LLMEnabledInferenceNode(_StubInferenceNode):
    class _LLMClient:
        def infer_audience(self, *args, **kwargs):
            return None

    def __init__(self, confidences):
        super().__init__(confidences)
        self.llm_client = self._LLMClient()

    def run(self, product: str, retry: bool = False, previous=None, allow_llm: bool = True):
        return super().run(product=product, retry=retry, previous=previous)


class _LLMEnabledGeneratorNode(_StubGeneratorNode):
    class _LLMClient:
        def generate_idea_scripts(self, *args, **kwargs):
            return None

    def __init__(self, outputs=None):
        super().__init__(outputs=outputs)
        self.llm_client = self._LLMClient()

    def run(
        self,
        audience_context,
        retry=False,
        reviewer_blocking_issues=None,
        previous_topics=None,
        allow_llm: bool = True,
    ):
        return super().run(
            audience_context=audience_context,
            retry=retry,
            reviewer_blocking_issues=reviewer_blocking_issues,
            previous_topics=previous_topics,
        )


class _StubStoryboardNode:
    def __init__(self, outputs=None):
        self.outputs = list(outputs or [])
        self.calls = []

    def run(self, audience_context, topic, retry=False, reviewer_blocking_issues=None):
        self.calls.append(
            {
                "retry": retry,
                "angle": topic.angle,
                "blocking_count": len(reviewer_blocking_issues or []),
            }
        )
        if self.outputs:
            return self.outputs[min(len(self.calls) - 1, len(self.outputs) - 1)]
        return _valid_shots(topic.angle)


class _StubStoryboardReviewerNode:
    def __init__(self, outputs=None):
        self.outputs = list(outputs or [])
        self.calls = []

    def run(self, audience_context, topic, shots):
        self.calls.append(
            {
                "angle": topic.angle,
                "shot_count": len(shots or []),
            }
        )
        if self.outputs:
            return self.outputs[min(len(self.calls) - 1, len(self.outputs) - 1)]
        return _storyboard_review_result(normalized_shots=shots, duration_total=60.0, camera_variety_count=4, segment_coverage_ok=True)


def _review_result(blocking=None, non_blocking=None, normalized_topics=None, passed=None, failure_tags=None):
    blocking = list(blocking or [])
    non_blocking = list(non_blocking or [])
    normalized_topics = list(normalized_topics or [])
    return IdeaScriptReviewResult(
        passed=(len(blocking) == 0 if passed is None else passed),
        blocking_issues=blocking,
        non_blocking_issues=non_blocking,
        failure_tags=list(failure_tags or []),
        normalized_topics=normalized_topics,
        issues=blocking + non_blocking,
        topics=normalized_topics,
    )


def _compliance_result(level="low", spans=None):
    return ComplianceScanResult(
        risk_level=level,
        risky_spans=list(spans or []),
    )


def _valid_shots(prefix: str = "persona"):
    return [
        ShotItem(shot_id=f"{prefix}_s01", segment="HOOK", duration_sec=6, camera="close_up", scene="开场", action="抛钩子", keyword_tags=["a", "b", "c", "d", "e"], asset_requirements=["占位素材:hook"]),
        ShotItem(shot_id=f"{prefix}_s02", segment="VIEW", duration_sec=8, camera="wide", scene="场景", action="讲观点", keyword_tags=["a", "b", "c", "d", "e"], asset_requirements=["占位素材:view"]),
        ShotItem(shot_id=f"{prefix}_s03", segment="STEPS", duration_sec=10, camera="over_shoulder", scene="步骤", action="步骤1", keyword_tags=["a", "b", "c", "d", "e"], asset_requirements=["占位素材:steps1"]),
        ShotItem(shot_id=f"{prefix}_s04", segment="STEPS", duration_sec=10, camera="top_down", scene="步骤", action="步骤2", keyword_tags=["a", "b", "c", "d", "e"], asset_requirements=["占位素材:steps2"]),
        ShotItem(shot_id=f"{prefix}_s05", segment="PRODUCT", duration_sec=11, camera="macro", scene="产品", action="产品承接", keyword_tags=["a", "b", "c", "d", "e"], asset_requirements=["占位素材:product"]),
        ShotItem(shot_id=f"{prefix}_s06", segment="CTA", duration_sec=8, camera="medium", scene="结尾", action="cta", keyword_tags=["a", "b", "c", "d", "e"], asset_requirements=["占位素材:cta"]),
        ShotItem(shot_id=f"{prefix}_s07", segment="VIEW", duration_sec=7, camera="wide", scene="场景补充", action="补充说明", keyword_tags=["a", "b", "c", "d", "e"], asset_requirements=["占位素材:view2"]),
    ]


def _storyboard_review_result(
    blocking=None,
    non_blocking=None,
    normalized_shots=None,
    passed=None,
    failure_tags=None,
    duration_total=60.0,
    camera_variety_count=4,
    segment_coverage_ok=True,
):
    blocking = list(blocking or [])
    non_blocking = list(non_blocking or [])
    normalized_shots = list(normalized_shots or [])
    return StoryboardReviewResult(
        passed=(len(blocking) == 0 if passed is None else passed),
        blocking_issues=blocking,
        non_blocking_issues=non_blocking,
        failure_tags=list(failure_tags or []),
        normalized_shots=normalized_shots,
        duration_total=duration_total,
        camera_variety_count=camera_variety_count,
        segment_coverage_ok=segment_coverage_ok,
    )


class IdeaScriptOrchestratorTests(unittest.TestCase):
    def test_inference_retry_once_and_warn_when_confidence_still_low(self):
        orchestrator = IdeaScriptOrchestrator(
            inference_node=_StubInferenceNode([0.60, 0.70]),
            generator_node=_StubGeneratorNode(),
            reviewer_node=_StubReviewerNode([
                _review_result(normalized_topics=[
                    TopicItem(angle="persona", title="A", hook="先看适不适合", script_60s="你先别急，先看你自己适不适合，再决定。评论区打清单。"),
                    TopicItem(angle="scene", title="B", hook="先看场景", script_60s="你在早晚高峰地铁通勤场景里用时，先看这个指标。先收藏。"),
                    TopicItem(angle="misconception", title="C", hook="这个误区最坑", script_60s="你先别急，很多人看错了方向，先看需求再看参数。关注我。"),
                ])
            ]),
        )
        out = orchestrator.run(IdeaScriptRequest(product="耳机"))

        self.assertEqual(out.retry_count, 1)
        self.assertTrue(out.inference_warning)
        self.assertEqual(out.warning_reason, "low_confidence_inference")
        self.assertEqual(len(out.topics), 3)
        self.assertTrue(hasattr(out, "audience_context"))

    def test_generation_blocking_triggers_retry_and_clears_warning_after_fix(self):
        valid_topics = [
            TopicItem(angle="persona", title="A", hook="先看适不适合", script_60s="你先别急，先看你是否适合，再决定。评论区打清单。"),
            TopicItem(angle="scene", title="B", hook="先看地铁通勤", script_60s="你在早晚高峰地铁通勤这个场景里用，就先看这个指标。先收藏。"),
            TopicItem(angle="misconception", title="C", hook="这个误区最坑", script_60s="你先别急，很多人一开始就看错了，先看需求再看参数。关注我。"),
        ]
        generator = _StubGeneratorNode(outputs=[
            [{"angle": "persona", "title": "缺字段", "script_60s": "x"}],  # missing hook -> blocking
            valid_topics,
        ])
        reviewer = _StubReviewerNode(outputs=[
            _review_result(
                blocking=["topic_schema_invalid:0", "topic_missing_required_fields:0:hook", "topics_count_not_3"],
                failure_tags=["topic_schema_invalid", "missing_required_field", "topic_count_invalid"],
                normalized_topics=[TopicItem(angle="persona", title="缺字段", hook="", script_60s="x")],
            ),
            _review_result(normalized_topics=valid_topics),
        ])
        orchestrator = IdeaScriptOrchestrator(
            inference_node=_StubInferenceNode([0.85]),
            generator_node=generator,
            reviewer_node=reviewer,
        )

        out = orchestrator.run(IdeaScriptRequest(product="降噪蓝牙耳机"))

        self.assertEqual(out.generation_retry_count, 1)
        self.assertFalse(out.generation_warning)
        self.assertIsNone(out.generation_warning_reason)
        self.assertEqual(len(generator.calls), 2)
        self.assertFalse(generator.calls[0]["retry"])
        self.assertTrue(generator.calls[1]["retry"])
        self.assertGreaterEqual(len(generator.calls[1]["reviewer_blocking_issues"]), 1)

    def test_generation_warning_when_retry_still_blocking(self):
        reviewer = _StubReviewerNode(outputs=[
            _review_result(blocking=["topics_count_not_3"], failure_tags=["topic_count_invalid"], normalized_topics=[]),
            _review_result(blocking=["duplicate_angle"], failure_tags=["angle_duplicate"], normalized_topics=[]),
        ])
        orchestrator = IdeaScriptOrchestrator(
            inference_node=_StubInferenceNode([0.82]),
            generator_node=_StubGeneratorNode(outputs=[[{"angle": "persona"}], [{"angle": "persona"}, {"angle": "persona"}]]),
            reviewer_node=reviewer,
        )

        out = orchestrator.run(IdeaScriptRequest(product="护肤品"))

        self.assertTrue(out.generation_warning)
        self.assertEqual(out.generation_warning_reason, "blocking_review_issues_after_retry")
        self.assertEqual(out.generation_retry_count, 1)
        self.assertIn("duplicate_angle", out.blocking_issues)
        self.assertIn("angle_duplicate", out.failure_tags)

    def test_no_otel_environment_degrades_gracefully(self):
        original = orch_mod._otel_trace
        try:
            orch_mod._otel_trace = None
            orchestrator = orch_mod.IdeaScriptOrchestrator(
                inference_node=_StubInferenceNode([0.88]),
                generator_node=_StubGeneratorNode(),
                reviewer_node=_StubReviewerNode([
                    _review_result(normalized_topics=[
                        TopicItem(angle="persona", title="A", hook="先看适不适合", script_60s="你先别急，先看你自己适不适合，再决定。评论区打清单。"),
                        TopicItem(angle="scene", title="B", hook="先看地铁通勤", script_60s="你在早晚高峰地铁通勤这个场景里用，就先看这个指标。先收藏。"),
                        TopicItem(angle="misconception", title="C", hook="这个误区最坑", script_60s="你先别急，很多人一开始看错了，先看需求再看参数。关注我。"),
                    ])
                ]),
            )
            out = orchestrator.run(IdeaScriptRequest(product="空气炸锅"))
            self.assertEqual(len(out.topics), 3)
            self.assertFalse(out.generation_warning)
            self.assertTrue(all(len(t.shots or []) >= 6 for t in out.topics))
        finally:
            orch_mod._otel_trace = original

    def test_risk_medium_triggers_safe_rewrite_then_re_review_and_risk_scan(self):
        valid_topics = [
            TopicItem(angle="persona", title="A", hook="先看适不适合", script_60s="你先别急，先看你自己适不适合，再决定。评论区打清单。"),
            TopicItem(angle="scene", title="B", hook="先看场景", script_60s="你在早晚高峰地铁通勤场景里用时，先看这个指标。先收藏。"),
            TopicItem(angle="misconception", title="C", hook="这个误区最坑", script_60s="你先别急，很多人看错了方向，先看需求再看参数。关注我。"),
        ]
        rewritten_topics = [
            TopicItem(angle="persona", title="A", hook="先看适不适合", script_60s="你先别急，先按步骤判断是否适合，再决定。评论区打清单。"),
            TopicItem(angle="scene", title="B", hook="先看场景", script_60s="你在早晚高峰地铁通勤场景里用时，先看这个指标。先收藏。"),
            TopicItem(angle="misconception", title="C", hook="这个误区最坑", script_60s="你先别急，很多人看错了方向，先看需求再看参数。关注我。"),
        ]
        reviewer = _StubReviewerNode(outputs=[
            _review_result(normalized_topics=valid_topics),
            _review_result(normalized_topics=rewritten_topics),
        ])
        risk_scanner = _StubRiskScannerNode(outputs=[
            _compliance_result(
                level="medium",
                spans=[
                    RiskySpan(
                        topic_index=0,
                        angle="persona",
                        field="script_60s",
                        text="保证有效",
                        reason="保证式承诺",
                        risk_level="medium",
                    )
                ],
            ),
            _compliance_result(level="low", spans=[]),
        ])
        safe_rewrite = _StubSafeRewriteNode(outputs=[
            SafeRewriteResult(rewritten_topics=rewritten_topics, changed=True, rewritten_span_count=1)
        ])
        orchestrator = IdeaScriptOrchestrator(
            inference_node=_StubInferenceNode([0.90]),
            generator_node=_StubGeneratorNode(outputs=[valid_topics]),
            reviewer_node=reviewer,
            risk_scanner_node=risk_scanner,
            safe_rewrite_node=safe_rewrite,
        )

        out = orchestrator.run(IdeaScriptRequest(product="耳机"))

        self.assertTrue(out.safe_rewrite_applied)
        self.assertEqual(out.risk_level, "low")
        self.assertFalse(out.compliance_warning)
        self.assertEqual(len(safe_rewrite.calls), 1)
        self.assertEqual(len(risk_scanner.calls), 2)
        self.assertGreaterEqual(len(reviewer.calls), 2)

    def test_compliance_warning_when_high_risk_still_remains_after_rewrite(self):
        topics = [
            TopicItem(angle="persona", title="A", hook="先看适不适合", script_60s="这是100%保证有效。"),
            TopicItem(angle="scene", title="B", hook="先看场景", script_60s="先看场景再比较。"),
            TopicItem(angle="misconception", title="C", hook="这个误区最坑", script_60s="先看需求，再看参数。"),
        ]
        span = RiskySpan(
            topic_index=0,
            angle="persona",
            field="script_60s",
            text="100%保证有效",
            reason="绝对化保证",
            risk_level="high",
        )
        orchestrator = IdeaScriptOrchestrator(
            inference_node=_StubInferenceNode([0.92]),
            generator_node=_StubGeneratorNode(outputs=[topics]),
            reviewer_node=_StubReviewerNode(outputs=[_review_result(normalized_topics=topics), _review_result(normalized_topics=topics)]),
            risk_scanner_node=_StubRiskScannerNode(outputs=[_compliance_result("high", [span]), _compliance_result("high", [span])]),
            safe_rewrite_node=_StubSafeRewriteNode(outputs=[SafeRewriteResult(rewritten_topics=topics, changed=False, rewritten_span_count=0)]),
        )

        out = orchestrator.run(IdeaScriptRequest(product="护肤品"))

        self.assertTrue(out.safe_rewrite_applied)
        self.assertTrue(out.compliance_warning)
        self.assertEqual(out.compliance_warning_reason, "high_risk_after_safe_rewrite")
        self.assertEqual(out.risk_level, "high")
        self.assertGreaterEqual(len(out.risky_spans), 1)

    def test_scoring_can_be_disabled_or_enabled(self):
        topics = [
            TopicItem(angle="persona", title="A", hook="先看适不适合", script_60s="[HOOK] 你先别急。[VIEW] 先看场景。[STEPS] 三步判断。[PRODUCT] 再看产品。[CTA] 先收藏。"),
            TopicItem(angle="scene", title="B", hook="先看场景", script_60s="[HOOK] 同款场景差很多。[VIEW] 先看失败成本。[STEPS] 先演示再对比。[PRODUCT] 再看适配度。[CTA] 先收藏。"),
            TopicItem(angle="misconception", title="C", hook="这个误区最坑", script_60s="[HOOK] 很多人看错了。[VIEW] 顺序很关键。[STEPS] 先需求后参数。[PRODUCT] 再看这款。[CTA] 先关注。"),
        ]
        score_output = RubricScoreResult(
            persona_specificity_score=0.8,
            hook_strength_score=0.75,
            topic_diversity_score=0.9,
            script_speakability_score=0.78,
            compliance_score=0.88,
        )

        score_node_off = _StubScoringNode(score_output)
        orchestrator_off = IdeaScriptOrchestrator(
            inference_node=_StubInferenceNode([0.90]),
            generator_node=_StubGeneratorNode(outputs=[topics]),
            reviewer_node=_StubReviewerNode(outputs=[_review_result(normalized_topics=topics)]),
            risk_scanner_node=_StubRiskScannerNode(outputs=[_compliance_result("low", [])]),
            scoring_node=score_node_off,
            config=IdeaScriptAgentConfig(scoring_enabled=False),
        )
        out_off = orchestrator_off.run(IdeaScriptRequest(product="耳机"))
        self.assertIsNone(out_off.rubric_scores)
        self.assertEqual(len(score_node_off.calls), 0)

        score_node_on = _StubScoringNode(score_output)
        orchestrator_on = IdeaScriptOrchestrator(
            inference_node=_StubInferenceNode([0.90]),
            generator_node=_StubGeneratorNode(outputs=[topics]),
            reviewer_node=_StubReviewerNode(outputs=[_review_result(normalized_topics=topics)]),
            risk_scanner_node=_StubRiskScannerNode(outputs=[_compliance_result("low", [])]),
            scoring_node=score_node_on,
            config=IdeaScriptAgentConfig(scoring_enabled=True),
        )
        out_on = orchestrator_on.run(IdeaScriptRequest(product="耳机"))
        self.assertIsNotNone(out_on.rubric_scores)
        self.assertEqual(len(score_node_on.calls), 1)
        self.assertGreaterEqual(out_on.rubric_scores.compliance_score, 0.0)
        self.assertLessEqual(out_on.rubric_scores.compliance_score, 1.0)

    def test_storyboarding_basic_constraints_pass(self):
        topics = [
            TopicItem(angle="persona", title="A", hook="先看适不适合", script_60s="[HOOK] 你先别急。[VIEW] 先看场景。[STEPS] 三步判断。[PRODUCT] 再看产品。[CTA] 先收藏。"),
            TopicItem(angle="scene", title="B", hook="先看场景", script_60s="[HOOK] 同款场景差很多。[VIEW] 先看失败成本。[STEPS] 先演示再对比。[PRODUCT] 再看适配度。[CTA] 先收藏。"),
            TopicItem(angle="misconception", title="C", hook="这个误区最坑", script_60s="[HOOK] 很多人看错了。[VIEW] 顺序很关键。[STEPS] 先需求后参数。[PRODUCT] 再看这款。[CTA] 先关注。"),
        ]
        orchestrator = IdeaScriptOrchestrator(
            inference_node=_StubInferenceNode([0.90]),
            generator_node=_StubGeneratorNode(outputs=[topics]),
            reviewer_node=_StubReviewerNode(outputs=[_review_result(normalized_topics=topics)]),
            risk_scanner_node=_StubRiskScannerNode(outputs=[_compliance_result("low", [])]),
            storyboard_node=StoryboardAgentNode(),
            storyboard_reviewer_node=StoryboardReviewerNode(),
        )

        out = orchestrator.run(IdeaScriptRequest(product="耳机"))

        self.assertFalse(out.storyboard_warning)
        self.assertEqual(out.storyboard_retry_count, 0)
        self.assertEqual(len(out.topics), 3)
        for topic in out.topics:
            shots = topic.shots
            self.assertGreaterEqual(len(shots), 6)
            self.assertLessEqual(len(shots), 8)
            segment_counts = {}
            cameras = set()
            duration_total = 0.0
            for shot in shots:
                segment_counts[shot.segment] = segment_counts.get(shot.segment, 0) + 1
                cameras.add(shot.camera)
                duration_total += float(shot.duration_sec or 0.0)
                self.assertGreaterEqual(len(shot.keyword_tags), 5)
                self.assertLessEqual(len(shot.keyword_tags), 8)
                self.assertGreaterEqual(len(shot.asset_requirements), 1)
                self.assertLessEqual(len(shot.asset_requirements), 3)
            self.assertGreaterEqual(segment_counts.get("HOOK", 0), 1)
            self.assertGreaterEqual(segment_counts.get("VIEW", 0), 1)
            self.assertGreaterEqual(segment_counts.get("STEPS", 0), 2)
            self.assertGreaterEqual(segment_counts.get("PRODUCT", 0), 1)
            self.assertGreaterEqual(segment_counts.get("CTA", 0), 1)
            self.assertGreaterEqual(len(cameras), 3)
            self.assertGreaterEqual(duration_total, 52.0)
            self.assertLessEqual(duration_total, 68.0)

    def test_storyboard_blocking_triggers_retry_and_warning_if_still_fails(self):
        topics = [
            TopicItem(angle="persona", title="A", hook="先看适不适合", script_60s="[HOOK] 你先别急。[VIEW] 先看场景。[STEPS] 三步判断。[PRODUCT] 再看产品。[CTA] 先收藏。"),
            TopicItem(angle="scene", title="B", hook="先看场景", script_60s="[HOOK] 同款场景差很多。[VIEW] 先看失败成本。[STEPS] 先演示再对比。[PRODUCT] 再看适配度。[CTA] 先收藏。"),
            TopicItem(angle="misconception", title="C", hook="这个误区最坑", script_60s="[HOOK] 很多人看错了。[VIEW] 顺序很关键。[STEPS] 先需求后参数。[PRODUCT] 再看这款。[CTA] 先关注。"),
        ]
        storyboard_node = _StubStoryboardNode(outputs=[
            _valid_shots("p1"), _valid_shots("s1"), _valid_shots("m1"),
            _valid_shots("p2"), _valid_shots("s2"), _valid_shots("m2"),
        ])
        storyboard_reviewer = _StubStoryboardReviewerNode(outputs=[
            _storyboard_review_result(
                blocking=["storyboard_shot_count_invalid:5"],
                failure_tags=["storyboard_shot_count_invalid"],
                normalized_shots=_valid_shots("p1")[:5],
                duration_total=40.0,
                camera_variety_count=2,
                segment_coverage_ok=False,
            ),
            _storyboard_review_result(
                blocking=["storyboard_shot_count_invalid:5"],
                failure_tags=["storyboard_shot_count_invalid"],
                normalized_shots=_valid_shots("s1")[:5],
                duration_total=40.0,
                camera_variety_count=2,
                segment_coverage_ok=False,
            ),
            _storyboard_review_result(
                blocking=["storyboard_shot_count_invalid:5"],
                failure_tags=["storyboard_shot_count_invalid"],
                normalized_shots=_valid_shots("m1")[:5],
                duration_total=40.0,
                camera_variety_count=2,
                segment_coverage_ok=False,
            ),
            _storyboard_review_result(
                blocking=["storyboard_shot_count_invalid:5"],
                failure_tags=["storyboard_shot_count_invalid"],
                normalized_shots=_valid_shots("p2")[:5],
                duration_total=40.0,
                camera_variety_count=2,
                segment_coverage_ok=False,
            ),
            _storyboard_review_result(
                blocking=["storyboard_shot_count_invalid:5"],
                failure_tags=["storyboard_shot_count_invalid"],
                normalized_shots=_valid_shots("s2")[:5],
                duration_total=40.0,
                camera_variety_count=2,
                segment_coverage_ok=False,
            ),
            _storyboard_review_result(
                blocking=["storyboard_shot_count_invalid:5"],
                failure_tags=["storyboard_shot_count_invalid"],
                normalized_shots=_valid_shots("m2")[:5],
                duration_total=40.0,
                camera_variety_count=2,
                segment_coverage_ok=False,
            ),
        ])
        orchestrator = IdeaScriptOrchestrator(
            inference_node=_StubInferenceNode([0.90]),
            generator_node=_StubGeneratorNode(outputs=[topics]),
            reviewer_node=_StubReviewerNode(outputs=[_review_result(normalized_topics=topics)]),
            risk_scanner_node=_StubRiskScannerNode(outputs=[_compliance_result("low", [])]),
            storyboard_node=storyboard_node,
            storyboard_reviewer_node=storyboard_reviewer,
        )

        out = orchestrator.run(IdeaScriptRequest(product="耳机"))

        self.assertTrue(out.storyboard_warning)
        self.assertEqual(out.storyboard_warning_reason, "storyboard_blocking_issues_after_retry")
        self.assertEqual(out.storyboard_retry_count, 1)
        self.assertGreaterEqual(len(out.storyboard_issues), 1)
        self.assertIn("storyboard_shot_count_invalid", out.storyboard_failure_tags)
        self.assertEqual(len(storyboard_node.calls), 6)
        self.assertEqual(len(storyboard_reviewer.calls), 6)

    def test_budget_exhausted_should_skip_retries_rewrite_and_scoring(self):
        topics = [
            TopicItem(angle="persona", title="A", hook="先看适不适合", script_60s="[HOOK] 你先别急。[VIEW] 先看场景。[STEPS] 三步判断。[PRODUCT] 再看产品。[CTA] 先收藏。"),
            TopicItem(angle="scene", title="B", hook="先看场景", script_60s="[HOOK] 同款场景差很多。[VIEW] 先看失败成本。[STEPS] 先演示再对比。[PRODUCT] 再看适配度。[CTA] 先收藏。"),
            TopicItem(angle="misconception", title="C", hook="这个误区最坑", script_60s="[HOOK] 很多人看错了。[VIEW] 顺序很关键。[STEPS] 先需求后参数。[PRODUCT] 再看这款。[CTA] 先关注。"),
        ]
        reviewer = _StubReviewerNode(outputs=[
            _review_result(blocking=["topics_count_not_3"], failure_tags=["topic_count_invalid"], normalized_topics=topics),
        ])
        orchestrator = IdeaScriptOrchestrator(
            inference_node=_LLMEnabledInferenceNode([0.82]),
            generator_node=_LLMEnabledGeneratorNode(outputs=[topics]),
            reviewer_node=reviewer,
            risk_scanner_node=_StubRiskScannerNode(outputs=[_compliance_result("medium", [])]),
            scoring_node=_StubScoringNode(
                RubricScoreResult(
                    persona_specificity_score=0.8,
                    hook_strength_score=0.8,
                    topic_diversity_score=0.8,
                    script_speakability_score=0.8,
                    compliance_score=0.8,
                )
            ),
            config=IdeaScriptAgentConfig(scoring_enabled=True, max_total_llm_calls=1),
        )

        out = orchestrator.run(IdeaScriptRequest(product="耳机"))

        self.assertTrue(out.budget_exhausted)
        self.assertIsNotNone(out.budget_exhausted_reason)
        self.assertEqual(out.total_llm_calls, 1)
        self.assertEqual(out.generation_retry_count, 0)
        self.assertFalse(out.safe_rewrite_applied)
        self.assertIsNone(out.rubric_scores)

    def test_response_contains_context_pack_fields(self):
        topics = [
            TopicItem(angle="persona", title="A", hook="先看适不适合", script_60s="[HOOK] 你先别急。[VIEW] 先看场景。[STEPS] 三步判断。[PRODUCT] 再看产品。[CTA] 先收藏。"),
            TopicItem(angle="scene", title="B", hook="先看场景", script_60s="[HOOK] 同款场景差很多。[VIEW] 先看失败成本。[STEPS] 先演示再对比。[PRODUCT] 再看适配度。[CTA] 先收藏。"),
            TopicItem(angle="misconception", title="C", hook="这个误区最坑", script_60s="[HOOK] 很多人看错了。[VIEW] 顺序很关键。[STEPS] 先需求后参数。[PRODUCT] 再看这款。[CTA] 先关注。"),
        ]
        orchestrator = IdeaScriptOrchestrator(
            inference_node=_StubInferenceNode([0.90]),
            generator_node=_StubGeneratorNode(outputs=[topics]),
            reviewer_node=_StubReviewerNode(outputs=[_review_result(normalized_topics=topics)]),
            risk_scanner_node=_StubRiskScannerNode(outputs=[_compliance_result("low", [])]),
        )

        out = orchestrator.run(IdeaScriptRequest(product="耳机"))

        self.assertTrue(bool(out.prompt_version))
        self.assertTrue(bool(out.policy_version))
        self.assertEqual(len(out.config_hash), 64)


class IdeaScriptComplianceAndScoringTests(unittest.TestCase):
    def test_risk_scan_output_is_valid(self):
        scanner = ComplianceGuardNode()
        topics = [
            TopicItem(angle="persona", title="100%有效", hook="立刻见效", script_60s="这款产品保证有效，治疗问题。"),
            TopicItem(angle="scene", title="场景对比", hook="先看场景", script_60s="正常描述。"),
            TopicItem(angle="misconception", title="误区", hook="先看误区", script_60s="很多人会说快速见效。"),
        ]

        result = scanner.run(product="护肤品", persona="决策期用户", topics=topics)

        self.assertIn(result.risk_level, {"low", "medium", "high"})
        self.assertGreaterEqual(len(result.risky_spans), 1)
        for span in result.risky_spans:
            self.assertIn(span.field, {"title", "hook", "script_60s"})
            self.assertIn(span.risk_level, {"low", "medium", "high"})
            self.assertTrue((span.text or "").strip())
            self.assertTrue((span.reason or "").strip())

    def test_rewrite_should_not_make_risk_worse(self):
        scanner = ComplianceGuardNode()
        rewriter = SafeRewriteNode()
        topics = [
            TopicItem(angle="persona", title="100%有效", hook="立刻见效", script_60s="这款产品保证有效，还能治疗问题。"),
            TopicItem(angle="scene", title="场景对比", hook="先看场景", script_60s="正常描述。"),
            TopicItem(angle="misconception", title="误区", hook="先看误区", script_60s="很多人误以为能永久有效。"),
        ]
        before = scanner.run(product="护肤品", persona="决策期用户", topics=topics)
        rewritten = rewriter.run(
            product="护肤品",
            persona="决策期用户",
            topics=topics,
            risky_spans=before.risky_spans,
        )
        after = scanner.run(product="护肤品", persona="决策期用户", topics=rewritten.rewritten_topics)

        risk_order = {"low": 0, "medium": 1, "high": 2}
        self.assertLessEqual(risk_order[after.risk_level], risk_order[before.risk_level])

    def test_scoring_outputs_valid_range(self):
        scorer = ScoringReviewerNode()
        audience = AudienceInferenceResult(
            product="耳机",
            persona="通勤地铁时间长、预算敏感并准备本月下单的职场新人",
            pain_points=["不知道怎么选"],
            scenes=["早晚高峰地铁通勤"],
            why_this_persona="测试",
            confidence=0.85,
            unsafe_claim_risk="low",
        )
        topics = [
            TopicItem(angle="persona", title="A", hook="先看适不适合", script_60s="[HOOK] 你先别急。[VIEW] 先看场景。[STEPS] 三步判断。[PRODUCT] 再看产品。[CTA] 先收藏。"),
            TopicItem(angle="scene", title="B", hook="先看场景", script_60s="[HOOK] 同款场景差很多。[VIEW] 先看失败成本。[STEPS] 先演示再对比。[PRODUCT] 再看适配度。[CTA] 先收藏。"),
            TopicItem(angle="misconception", title="C", hook="这个误区最坑", script_60s="[HOOK] 很多人看错了。[VIEW] 顺序很关键。[STEPS] 先需求后参数。[PRODUCT] 再看这款。[CTA] 先关注。"),
        ]
        review = _review_result(normalized_topics=topics)
        compliance = _compliance_result("low", [])

        score = scorer.run(audience_context=audience, topics=topics, review_result=review, compliance_result=compliance)

        for value in [
            score.persona_specificity_score,
            score.hook_strength_score,
            score.topic_diversity_score,
            score.script_speakability_score,
            score.compliance_score,
        ]:
            self.assertGreaterEqual(value, 0.0)
            self.assertLessEqual(value, 1.0)


class IdeaScriptReviewerTests(unittest.TestCase):
    def test_reviewer_classifies_blocking_and_non_blocking_and_failure_tags(self):
        reviewer = IdeaScriptReviewerNode()
        audience = AudienceInferenceResult(
            product="护肤品",
            persona="消费者",
            pain_points=["痛点1"],
            scenes=["换季皮肤状态不稳定的一周"],
            why_this_persona="测试",
            confidence=0.5,
            unsafe_claim_risk="medium",
        )
        topics = [
            {"angle": "persona", "title": "", "hook": "这个hook有点长这个hook有点长这个hook有点长", "script_60s": "本视频将介绍该产品的优点。"},
            {"angle": "scene", "title": "这个场景怎么选", "hook": "先看场景", "script_60s": "介绍步骤和观点。"},
            {"angle": "scene", "title": "重复角度", "hook": "", "script_60s": ""},
        ]

        review = reviewer.run(audience, topics)

        self.assertFalse(review.passed)
        self.assertIn("persona_too_generic", review.blocking_issues)
        self.assertIn("duplicate_angle", review.blocking_issues)
        self.assertIn("topic_field_missing:0:title", review.blocking_issues)
        self.assertIn("topic_field_missing:2:hook", review.blocking_issues)
        self.assertIn("topic_field_missing:2:script_60s", review.blocking_issues)

        self.assertTrue(any(i.startswith("hook_too_long") for i in review.non_blocking_issues))
        self.assertTrue(any(i.startswith("scene_not_specific_enough") for i in review.non_blocking_issues))
        self.assertTrue(any(i.startswith("cta_weak") for i in review.non_blocking_issues))
        self.assertTrue(any(i.startswith("script_not_colloquial") for i in review.non_blocking_issues))

        self.assertIn("persona_generic", review.failure_tags)
        self.assertIn("angle_duplicate", review.failure_tags)
        self.assertIn("missing_required_field", review.failure_tags)
        self.assertIn("hook_too_long", review.failure_tags)
        self.assertIn("cta_weak", review.failure_tags)
        self.assertEqual(len(review.normalized_topics), 3)

    def test_reviewer_fixes_visual_keywords_count(self):
        reviewer = IdeaScriptReviewerNode()
        audience = AudienceInferenceResult(
            product="耳机",
            persona="通勤地铁时间长并准备本月下单的职场新人",
            pain_points=["不知道怎么选"],
            scenes=["早晚高峰地铁通勤"],
            why_this_persona="测试",
            confidence=0.8,
            unsafe_claim_risk="low",
        )
        topics = [
            {"angle": "persona", "title": "A", "hook": "先看适不适合", "script_60s": "[HOOK] 你先别急。[VIEW] 先看场景。[STEPS] 三步判断。[PRODUCT] 再看产品。[CTA] 先收藏。", "visual_keywords": ["耳机"]},
            {"angle": "scene", "title": "B", "hook": "先看场景", "script_60s": "[HOOK] 同款场景差很多。[VIEW] 先看失败成本。[STEPS] 先演示再对比。[PRODUCT] 再看适配度。[CTA] 先收藏。", "visual_keywords": []},
            {"angle": "misconception", "title": "C", "hook": "这个误区最坑", "script_60s": "[HOOK] 很多人看错了。[VIEW] 顺序很关键。[STEPS] 先需求后参数。[PRODUCT] 再看这款。[CTA] 先关注。"},
        ]

        review = reviewer.run(audience, topics)

        self.assertTrue(any(i.startswith("visual_keywords_invalid_count") for i in review.non_blocking_issues))
        for topic in review.normalized_topics:
            self.assertGreaterEqual(len(topic.visual_keywords), 5)
            self.assertLessEqual(len(topic.visual_keywords), 8)


class IdeaScriptV31EnhancementTests(unittest.TestCase):
    def test_config_hash_is_stable(self):
        cfg1 = IdeaScriptAgentConfig(
            scoring_enabled=True,
            cache_enabled=True,
            cache_max_size=32,
            max_total_llm_calls=9,
        )
        cfg2 = IdeaScriptAgentConfig(
            scoring_enabled=True,
            cache_enabled=True,
            cache_max_size=32,
            max_total_llm_calls=9,
        )
        cfg3 = IdeaScriptAgentConfig(
            scoring_enabled=True,
            cache_enabled=True,
            cache_max_size=33,
            max_total_llm_calls=9,
        )

        self.assertEqual(cfg1.stable_config_hash(), cfg2.stable_config_hash())
        self.assertNotEqual(cfg1.stable_config_hash(), cfg3.stable_config_hash())

    def test_asset_requirements_should_be_structured(self):
        reviewer = StoryboardReviewerNode()
        audience = AudienceInferenceResult(
            product="耳机",
            persona="通勤地铁时间长并准备本月下单的职场新人",
            pain_points=["不知道怎么选"],
            scenes=["早晚高峰地铁通勤"],
            why_this_persona="测试",
            confidence=0.8,
            unsafe_claim_risk="low",
        )
        topic = TopicItem(
            angle="persona",
            title="A",
            hook="先看适不适合",
            script_60s="[HOOK] 你先别急。[VIEW] 先看场景。[STEPS] 三步判断。[PRODUCT] 再看产品。[CTA] 先收藏。",
        )
        raw_shots = []
        for shot in _valid_shots("x"):
            data = shot.model_dump()
            data["asset_requirements"] = ["产品特写镜头", {"must_have": "字幕条叠加", "type": ""}]
            raw_shots.append(data)

        result = reviewer.run(audience_context=audience, topic=topic, shots=raw_shots)

        self.assertTrue(result.passed)
        for shot in result.normalized_shots:
            self.assertGreaterEqual(len(shot.asset_requirements), 1)
            self.assertLessEqual(len(shot.asset_requirements), 3)
            for req in shot.asset_requirements:
                self.assertIsInstance(req, AssetRequirement)
                self.assertTrue((req.must_have or "").strip())
                self.assertTrue((req.type or "").strip())
                self.assertEqual(req.aspect, "9:16")


if __name__ == "__main__":
    unittest.main()
