import json
import os
import sys
import tempfile
import unittest


ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)


from bananaflow.agent.idea_script.config import IdeaScriptAgentConfig
from bananaflow.agent.idea_script.orchestrator import IdeaScriptOrchestrator
from bananaflow.agent.idea_script.schemas import (
    AssetRequirement,
    AudienceInferenceResult,
    ComplianceScanResult,
    IdeaScriptRequest,
    IdeaScriptReviewResult,
    ShotItem,
    StoryboardReviewResult,
    TopicItem,
)
from bananaflow.assets.index_tool import AssetIndexTool
from bananaflow.assets.query_builder import ShotQueryBuilder
from bananaflow.assets.schemas import AssetQuery
from bananaflow.assets.tag_normalizer import normalize_tags
from bananaflow.storage.migrations import ensure_asset_db
from bananaflow.storage.sqlite import execute


class _StubInferenceNode:
    def run(self, product: str, retry: bool = False, previous=None, allow_llm: bool = True):
        return AudienceInferenceResult(
            product=product,
            persona="最近30天正在比较该产品并准备首次下单的用户",
            pain_points=["不知道怎么选", "怕买错"],
            scenes=["早晚高峰地铁通勤"],
            why_this_persona="处于决策期",
            confidence=0.9,
            unsafe_claim_risk="low",
        )


class _StubGeneratorNode:
    def run(
        self,
        audience_context,
        retry: bool = False,
        reviewer_blocking_issues=None,
        previous_topics=None,
        allow_llm: bool = True,
    ):
        return [
            TopicItem(angle="persona", title="A", hook="先看适不适合", script_60s="[HOOK] 开场。[VIEW] 观点。[STEPS] 步骤。[PRODUCT] 产品。[CTA] 互动。"),
            TopicItem(angle="scene", title="B", hook="先看场景", script_60s="[HOOK] 开场。[VIEW] 观点。[STEPS] 步骤。[PRODUCT] 产品。[CTA] 互动。"),
            TopicItem(angle="misconception", title="C", hook="误区最坑", script_60s="[HOOK] 开场。[VIEW] 观点。[STEPS] 步骤。[PRODUCT] 产品。[CTA] 互动。"),
        ]


class _StubReviewerNode:
    def run(self, audience_context, topics):
        normalized = [t if isinstance(t, TopicItem) else TopicItem(**t) for t in (topics or [])]
        return IdeaScriptReviewResult(
            passed=True,
            blocking_issues=[],
            non_blocking_issues=[],
            failure_tags=[],
            normalized_topics=normalized,
            issues=[],
            topics=normalized,
        )


class _StubRiskScannerNode:
    def run(self, product, persona, topics, allow_llm: bool = True):
        return ComplianceScanResult(risk_level="low", risky_spans=[])


def _valid_shots(prefix: str):
    return [
        ShotItem(shot_id=f"{prefix}_s01", segment="HOOK", duration_sec=6, camera="close_up", scene="开场", action="抛钩子", keyword_tags=["a", "b", "c", "d", "e"], asset_requirements=["占位素材:hook"]),
        ShotItem(shot_id=f"{prefix}_s02", segment="VIEW", duration_sec=8, camera="wide", scene="场景", action="讲观点", keyword_tags=["a", "b", "c", "d", "e"], asset_requirements=["占位素材:view"]),
        ShotItem(shot_id=f"{prefix}_s03", segment="STEPS", duration_sec=10, camera="over_shoulder", scene="步骤", action="步骤1", keyword_tags=["a", "b", "c", "d", "e"], asset_requirements=["占位素材:steps1"]),
        ShotItem(shot_id=f"{prefix}_s04", segment="STEPS", duration_sec=10, camera="top_down", scene="步骤", action="步骤2", keyword_tags=["a", "b", "c", "d", "e"], asset_requirements=["占位素材:steps2"]),
        ShotItem(shot_id=f"{prefix}_s05", segment="PRODUCT", duration_sec=11, camera="macro", scene="产品", action="产品承接", keyword_tags=["a", "b", "c", "d", "e"], asset_requirements=["占位素材:product"]),
        ShotItem(shot_id=f"{prefix}_s06", segment="CTA", duration_sec=8, camera="medium", scene="结尾", action="cta", keyword_tags=["a", "b", "c", "d", "e"], asset_requirements=["占位素材:cta"]),
        ShotItem(shot_id=f"{prefix}_s07", segment="VIEW", duration_sec=7, camera="wide", scene="场景补充", action="补充说明", keyword_tags=["a", "b", "c", "d", "e"], asset_requirements=["占位素材:view2"]),
    ]


class _StubStoryboardNode:
    def run(self, audience_context, topic, retry: bool = False, reviewer_blocking_issues=None, allow_llm: bool = True):
        return _valid_shots(topic.angle)


class _StubStoryboardReviewerNode:
    def run(self, audience_context, topic, shots):
        return StoryboardReviewResult(
            passed=True,
            blocking_issues=[],
            non_blocking_issues=[],
            failure_tags=[],
            normalized_shots=list(shots or []),
            duration_total=60.0,
            camera_variety_count=4,
            segment_coverage_ok=True,
        )


class IdeaScriptAssetIndexTests(unittest.TestCase):
    def _insert_asset(
        self,
        db_path: str,
        asset_id: str,
        uri: str,
        asset_type: str,
        tags: list[str],
        scene: str = "",
        style: str = "",
        aspect: str = "9:16",
    ) -> None:
        execute(
            db_path,
            """
            INSERT INTO assets (
                asset_id, uri, asset_type, tags, scene, objects, style, aspect, duration_sec
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                asset_id,
                uri,
                asset_type,
                json.dumps(tags, ensure_ascii=False),
                scene,
                "[]",
                style,
                aspect,
                8.0,
            ),
        )

    def test_tag_normalizer_should_apply_synonym_mapping(self):
        out = normalize_tags(["产品", "包装", "特写", "字幕", "素材", "PRODUCT"])

        self.assertIn("product", out)
        self.assertIn("package", out)
        self.assertIn("close_up", out)
        self.assertIn("overlay", out)
        self.assertNotIn("素材", out)
        self.assertEqual(out.count("product"), 1)

    def test_asset_index_should_match_must_avoid_type_aspect(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = os.path.join(tmpdir, "assets.db")
            ensure_asset_db(db_path)

            rows = [
                ("a1", "/assets/a1.mp4", "scene", json.dumps(["地铁", "通勤", "耳机"], ensure_ascii=False), "地铁站台", "[]", "真实实拍", "9:16", 12.0),
                ("a2", "/assets/a2.mp4", "scene", json.dumps(["地铁", "通勤", "杂乱"], ensure_ascii=False), "地铁站台", "[]", "插画风", "9:16", 12.0),
                ("a3", "/assets/a3.png", "overlay", json.dumps(["字幕", "通勤"], ensure_ascii=False), "字幕区", "[]", "扁平", "9:16", None),
                ("a4", "/assets/a4.mp4", "scene", json.dumps(["地铁", "通勤"], ensure_ascii=False), "地铁站台", "[]", "真实实拍", "16:9", 12.0),
            ]
            for row in rows:
                execute(
                    db_path,
                    """
                    INSERT INTO assets (
                        asset_id, uri, asset_type, tags, scene, objects, style, aspect, duration_sec
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    row,
                )

            tool = AssetIndexTool(db_path=db_path)
            req = AssetRequirement(
                type="scene",
                must_have="地铁 通勤",
                avoid="杂乱",
                style="真实实拍",
                aspect="9:16",
            )
            out = tool.search([req], top_k=10)

            self.assertGreaterEqual(len(out), 1)
            ids = [item.asset_id for item in out]
            self.assertIn("a1", ids)
            self.assertNotIn("a3", ids)
            self.assertNotIn("a4", ids)
            if "a2" in ids:
                score_map = {item.asset_id: item.score for item in out}
                self.assertGreater(score_map["a1"], score_map["a2"])

    def test_required_missing_should_bucket_partial_match(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = os.path.join(tmpdir, "assets.db")
            ensure_asset_db(db_path)
            self._insert_asset(
                db_path=db_path,
                asset_id="p1",
                uri="/assets/p1.mp4",
                asset_type="scene",
                tags=["subway", "commute"],
                scene="subway commute",
            )
            tool = AssetIndexTool(db_path=db_path, tag_normalize_enabled=True)
            query = AssetQuery(
                required_tags=["地铁", "通勤", "耳机"],
                preferred_tags=["close_up"],
                forbidden_tags=[],
                type="scene",
                aspect="9:16",
            )
            out = tool.search(query, top_k=3)

            self.assertGreaterEqual(len(out), 1)
            self.assertEqual(out[0].asset_id, "p1")
            self.assertEqual(out[0].bucket, "partial_match")

    def test_forbidden_hit_should_be_filtered_or_strongly_penalized(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = os.path.join(tmpdir, "assets.db")
            ensure_asset_db(db_path)
            self._insert_asset(
                db_path=db_path,
                asset_id="f1",
                uri="/assets/f1.mp4",
                asset_type="scene",
                tags=["subway", "commute", "杂乱"],
                scene="subway",
            )
            self._insert_asset(
                db_path=db_path,
                asset_id="f2",
                uri="/assets/f2.mp4",
                asset_type="scene",
                tags=["subway", "commute", "clean"],
                scene="subway",
            )
            tool = AssetIndexTool(db_path=db_path, tag_normalize_enabled=True)
            query = AssetQuery(
                required_tags=["地铁", "通勤"],
                preferred_tags=["clean"],
                forbidden_tags=["杂乱"],
                type="scene",
                aspect="9:16",
            )
            out = tool.search(query, top_k=10)
            ids = [c.asset_id for c in out]

            self.assertIn("f2", ids)
            if "f1" in ids:
                score_map = {item.asset_id: item.score for item in out}
                self.assertGreater(score_map["f2"], score_map["f1"])
            else:
                self.assertNotIn("f1", ids)

    def test_segment_preference_should_change_top_candidate(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = os.path.join(tmpdir, "assets.db")
            ensure_asset_db(db_path)
            self._insert_asset(
                db_path=db_path,
                asset_id="prod_1",
                uri="/assets/prod_1.mp4",
                asset_type="product",
                tags=["product", "close_up", "package", "macro"],
                scene="product desk",
            )
            self._insert_asset(
                db_path=db_path,
                asset_id="hook_1",
                uri="/assets/hook_1.mp4",
                asset_type="scene",
                tags=["hook", "attention", "talking_head"],
                scene="opening face cam",
            )
            tool = AssetIndexTool(db_path=db_path, tag_normalize_enabled=True)
            builder = ShotQueryBuilder()

            product_shot = ShotItem(
                shot_id="s1",
                segment="PRODUCT",
                duration_sec=8,
                camera="close_up",
                scene="产品台",
                action="产品特写",
                keyword_tags=["产品", "包装", "特写", "成分", "展示"],
                asset_requirements=[AssetRequirement(type="product", must_have="产品 包装", aspect="9:16")],
            )
            hook_shot = ShotItem(
                shot_id="s2",
                segment="HOOK",
                duration_sec=8,
                camera="medium",
                scene="开场",
                action="抛钩子",
                keyword_tags=["开场", "口播", "注意力", "字幕", "观点"],
                asset_requirements=[AssetRequirement(type="scene", must_have="开场 口播", aspect="9:16")],
            )

            product_query = builder.build(product_shot)
            hook_query = builder.build(hook_shot)
            product_out = tool.search(product_query, top_k=1)
            hook_out = tool.search(hook_query, top_k=1)

            self.assertGreaterEqual(len(product_out), 1)
            self.assertGreaterEqual(len(hook_out), 1)
            self.assertEqual(product_out[0].asset_id, "prod_1")
            self.assertEqual(hook_out[0].asset_id, "hook_1")

    def test_orchestrator_should_output_matched_assets_and_stats(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = os.path.join(tmpdir, "assets.db")
            ensure_asset_db(db_path)
            execute(
                db_path,
                """
                INSERT INTO assets (
                    asset_id, uri, asset_type, tags, scene, objects, style, aspect, duration_sec
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    "scene_pack_1",
                    "/assets/scene_pack_1.mp4",
                    "scene",
                    json.dumps(["占位素材", "hook", "view", "steps1", "steps2", "product", "cta", "view2"], ensure_ascii=False),
                    "口播场景",
                    "[]",
                    "真实实拍",
                    "9:16",
                    10.0,
                ),
            )

            cfg = IdeaScriptAgentConfig(
                scoring_enabled=False,
                cache_enabled=False,
                asset_db_path=db_path,
                asset_match_top_k=2,
            )
            orchestrator = IdeaScriptOrchestrator(
                inference_node=_StubInferenceNode(),
                generator_node=_StubGeneratorNode(),
                reviewer_node=_StubReviewerNode(),
                risk_scanner_node=_StubRiskScannerNode(),
                storyboard_node=_StubStoryboardNode(),
                storyboard_reviewer_node=_StubStoryboardReviewerNode(),
                config=cfg,
            )
            out = orchestrator.run(IdeaScriptRequest(product="耳机"))

            shot_count = sum(len(topic.shots or []) for topic in (out.topics or []))
            self.assertGreater(shot_count, 0)
            self.assertEqual(len(out.matched_assets), shot_count)
            self.assertGreater(out.shot_match_rate, 0.0)
            self.assertGreater(out.avg_candidates_per_shot, 0.0)
            self.assertFalse(out.asset_match_warning)
            self.assertIn("HOOK", out.segment_match_rate)
            self.assertIn("PRODUCT", out.segment_match_rate)
            matched_with_candidates = 0
            for shot_id, candidates in out.matched_assets.items():
                self.assertTrue(str(shot_id).strip())
                if candidates:
                    matched_with_candidates += 1
                    self.assertIn(candidates[0].bucket, {"best_match", "partial_match", "fallback"})
            self.assertGreater(matched_with_candidates, 0)

    def test_orchestrator_should_support_mcp_asset_match_when_enabled(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = os.path.join(tmpdir, "assets.db")
            ensure_asset_db(db_path)
            execute(
                db_path,
                """
                INSERT INTO assets (
                    asset_id, uri, asset_type, tags, scene, objects, style, aspect, duration_sec
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    "scene_pack_2",
                    "/assets/scene_pack_2.mp4",
                    "scene",
                    json.dumps(["占位素材", "hook", "view", "steps1", "steps2", "product", "cta", "view2"], ensure_ascii=False),
                    "口播场景",
                    "[]",
                    "真实实拍",
                    "9:16",
                    10.0,
                ),
            )

            cfg = IdeaScriptAgentConfig(
                scoring_enabled=False,
                cache_enabled=False,
                asset_db_path=db_path,
                asset_match_top_k=2,
                asset_match_use_mcp=True,
            )
            orchestrator = IdeaScriptOrchestrator(
                inference_node=_StubInferenceNode(),
                generator_node=_StubGeneratorNode(),
                reviewer_node=_StubReviewerNode(),
                risk_scanner_node=_StubRiskScannerNode(),
                storyboard_node=_StubStoryboardNode(),
                storyboard_reviewer_node=_StubStoryboardReviewerNode(),
                config=cfg,
            )
            out = orchestrator.run(IdeaScriptRequest(product="耳机"))

            shot_count = sum(len(topic.shots or []) for topic in (out.topics or []))
            self.assertGreater(shot_count, 0)
            self.assertEqual(len(out.matched_assets), shot_count)
            self.assertGreater(out.shot_match_rate, 0.0)
            self.assertFalse(out.asset_match_warning)


if __name__ == "__main__":
    unittest.main()
