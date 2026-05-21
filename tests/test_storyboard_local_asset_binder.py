"""Tests for LAB-2 + LAB-3: schemas and bind_local_assets_to_plan()."""
from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
BANANAFLOW_DIR = os.path.join(ROOT_DIR, "bananaflow")
if BANANAFLOW_DIR not in sys.path:
    sys.path.insert(0, BANANAFLOW_DIR)

from bananaflow.agent_v2.storyboard.schemas import (
    StoryboardEntities,
    StoryboardEntity,
    StoryboardLocalAssetBindings,
    StoryboardPlan,
    StoryboardScene,
    StoryboardAppearance,
    StoryboardVisualDesign,
)
from bananaflow.agent_v2.storyboard.asset_binder import (
    _name_score,
    _scene_score,
    bind_local_assets_to_plan,
)
from bananaflow.agent_v2.storyboard.local_asset_library import (
    LocalAssetManifest,
    LocalCharacterRecord,
    LocalSceneRecord,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _entity(entity_id: str, name: str, kind: str = "character") -> StoryboardEntity:
    return StoryboardEntity(
        entity_id=entity_id,
        name=name,
        kind=kind,
        appearance=StoryboardAppearance(),
        visual_design=StoryboardVisualDesign(),
    )


def _minimal_plan(
    characters=None,
    subjects=None,
    locations=None,
    scenes=None,
) -> StoryboardPlan:
    return StoryboardPlan(
        title="测试分镜",
        target_duration_sec=30.0,
        estimated_duration_sec=30.0,
        shot_default_duration_sec=4.0,
        entities=StoryboardEntities(
            characters=characters or [],
            subjects=subjects or [],
            locations=locations or [],
        ),
        scenes=scenes or [],
    )


def _manifest_with(characters=None, scenes=None) -> LocalAssetManifest:
    return LocalAssetManifest(
        characters=characters or [],
        scenes=scenes or [],
        root="/fake/root",
    )


def _char_record(name: str, has_voice: bool = True) -> LocalCharacterRecord:
    rec = LocalCharacterRecord(
        name=name,
        three_view_path=f"人物/{name}三视图.png",
        three_view_url=f"/main_assets/人物/{name}三视图.png",
    )
    if has_voice:
        rec.voice_path = f"音色/{name}音色短.mp3"
        rec.voice_url = f"/main_assets/音色/{name}音色短.mp3"
    return rec


def _scene_record(folder_name: str) -> LocalSceneRecord:
    return LocalSceneRecord(
        folder_name=folder_name,
        folder_path=f"场景/{folder_name}",
        preview_paths=[f"场景/{folder_name}/1.png"],
        preview_urls=[f"/main_assets/场景/{folder_name}/1.png"],
    )


# ---------------------------------------------------------------------------
# LAB-2: Schema backward compatibility
# ---------------------------------------------------------------------------

class TestSchemasBackwardCompat(unittest.TestCase):

    def test_storyboard_plan_default_no_bindings(self):
        """StoryboardPlan constructed without local_asset_bindings → None."""
        plan = _minimal_plan()
        self.assertIsNone(plan.local_asset_bindings)

    def test_storyboard_plan_deserialize_without_field(self):
        """Old JSON without local_asset_bindings key deserializes without error."""
        data = {
            "title": "旧分镜",
            "target_duration_sec": 20.0,
            "estimated_duration_sec": 20.0,
            "shot_default_duration_sec": 4.0,
        }
        plan = StoryboardPlan.model_validate(data)
        self.assertIsNone(plan.local_asset_bindings)

    def test_storyboard_local_asset_bindings_defaults(self):
        bindings = StoryboardLocalAssetBindings()
        self.assertEqual(bindings.character_bindings, [])
        self.assertEqual(bindings.scene_bindings, [])
        self.assertEqual(bindings.missing_characters, [])
        self.assertEqual(bindings.missing_scenes, [])
        self.assertEqual(bindings.warnings, [])


# ---------------------------------------------------------------------------
# LAB-3: Scoring functions
# ---------------------------------------------------------------------------

class TestNameScore(unittest.TestCase):

    def test_exact(self):
        self.assertEqual(_name_score("龙女", "龙女"), 3.0)

    def test_query_starts_with_target(self):
        # "龙女辰辰" starts with "龙女"
        self.assertEqual(_name_score("龙女辰辰", "龙女"), 2.0)

    def test_target_starts_with_query(self):
        self.assertEqual(_name_score("龙", "龙女"), 1.5)

    def test_target_substring_of_query(self):
        self.assertEqual(_name_score("古风龙女仙子", "龙女"), 1.0)

    def test_no_match(self):
        self.assertEqual(_name_score("未知角色", "龙女"), 0.0)

    def test_empty_strings(self):
        self.assertEqual(_name_score("", "龙女"), 0.0)
        self.assertEqual(_name_score("龙女", ""), 0.0)


class TestSceneScore(unittest.TestCase):

    def test_folder_name_in_location(self):
        # exact folder name appears in location text → +3
        score = _scene_score("阿巳庭院夜晚", "阿巳庭院", set())
        self.assertGreaterEqual(score, 3.0)

    def test_character_affinity_boost(self):
        # location "夜晚庭院" + active character "龙女" → 龙女波澜场景汇总 gets affinity boost
        score_no_char = _scene_score("夜晚庭院", "龙女波澜场景汇总", set())
        score_with_char = _scene_score("夜晚庭院", "龙女波澜场景汇总", {"龙女"})
        self.assertGreater(score_with_char, score_no_char)

    def test_token_overlap(self):
        # "庭院" is a shared CJK token
        score = _scene_score("夜晚庭院", "阿巳庭院", set())
        self.assertGreaterEqual(score, 1.0)

    def test_no_match(self):
        score = _scene_score("现代都市", "修炼地", set())
        self.assertEqual(score, 0.0)


# ---------------------------------------------------------------------------
# LAB-3: bind_local_assets_to_plan()
# ---------------------------------------------------------------------------

class TestBindCharacters(unittest.TestCase):

    def _bind_with_manifest(self, plan, manifest):
        with mock.patch(
            "bananaflow.agent_v2.storyboard.asset_binder.scan_local_assets",
            return_value=manifest,
        ):
            return bind_local_assets_to_plan(plan, asset_root="/fake")

    def test_exact_character_name_bound(self):
        plan = _minimal_plan(characters=[_entity("e1", "龙女")])
        manifest = _manifest_with(characters=[_char_record("龙女")])
        result = self._bind_with_manifest(plan, manifest)
        self.assertIsNotNone(result.local_asset_bindings)
        bindings = result.local_asset_bindings.character_bindings
        self.assertEqual(len(bindings), 1)
        self.assertEqual(bindings[0].character_name, "龙女")
        self.assertIsNotNone(bindings[0].three_view_url)
        self.assertIsNotNone(bindings[0].voice_url)

    def test_prefix_character_name_bound(self):
        """Entity '龙女辰辰' should match character '龙女'."""
        plan = _minimal_plan(characters=[_entity("e1", "龙女辰辰")])
        manifest = _manifest_with(characters=[_char_record("龙女")])
        result = self._bind_with_manifest(plan, manifest)
        bindings = result.local_asset_bindings.character_bindings
        self.assertEqual(len(bindings), 1)
        self.assertEqual(bindings[0].character_name, "龙女")
        self.assertEqual(bindings[0].entity_name, "龙女辰辰")
        self.assertGreaterEqual(bindings[0].match_score, 2.0)

    def test_prefix_entity_阿巳(self):
        """Entity '阿巳仙君' should match '阿巳'."""
        plan = _minimal_plan(characters=[_entity("e1", "阿巳仙君")])
        manifest = _manifest_with(characters=[_char_record("阿巳")])
        result = self._bind_with_manifest(plan, manifest)
        self.assertEqual(result.local_asset_bindings.character_bindings[0].character_name, "阿巳")

    def test_no_match_goes_to_missing(self):
        plan = _minimal_plan(characters=[_entity("e1", "未知仙人")])
        manifest = _manifest_with(characters=[_char_record("龙女")])
        result = self._bind_with_manifest(plan, manifest)
        bindings = result.local_asset_bindings
        self.assertEqual(len(bindings.character_bindings), 0)
        self.assertIn("未知仙人", bindings.missing_characters)

    def test_subject_entity_also_matched(self):
        """subjects[] are also searched for character bindings."""
        plan = _minimal_plan(subjects=[_entity("e1", "阿巳", kind="subject")])
        manifest = _manifest_with(characters=[_char_record("阿巳")])
        result = self._bind_with_manifest(plan, manifest)
        self.assertEqual(len(result.local_asset_bindings.character_bindings), 1)

    def test_empty_entities_returns_empty_bindings(self):
        plan = _minimal_plan()
        manifest = _manifest_with(characters=[_char_record("龙女")])
        result = self._bind_with_manifest(plan, manifest)
        bindings = result.local_asset_bindings
        self.assertEqual(bindings.character_bindings, [])
        self.assertEqual(bindings.missing_characters, [])

    def test_character_without_voice_still_bound(self):
        plan = _minimal_plan(characters=[_entity("e1", "秋水")])
        manifest = _manifest_with(characters=[_char_record("秋水", has_voice=False)])
        result = self._bind_with_manifest(plan, manifest)
        b = result.local_asset_bindings.character_bindings[0]
        self.assertIsNotNone(b.three_view_url)
        self.assertIsNone(b.voice_url)


class TestBindScenes(unittest.TestCase):

    def _bind_with_manifest(self, plan, manifest):
        with mock.patch(
            "bananaflow.agent_v2.storyboard.asset_binder.scan_local_assets",
            return_value=manifest,
        ):
            return bind_local_assets_to_plan(plan, asset_root="/fake")

    def test_location_entity_matched_to_scene(self):
        plan = _minimal_plan(locations=[_entity("loc1", "夜晚庭院", kind="location")])
        manifest = _manifest_with(
            characters=[_char_record("龙女")],
            scenes=[_scene_record("阿巳庭院"), _scene_record("龙女波澜场景汇总")],
        )
        result = self._bind_with_manifest(plan, manifest)
        folder_names = {b.folder_name for b in result.local_asset_bindings.scene_bindings}
        # At least one courtyard-related scene should match
        self.assertTrue(
            "阿巳庭院" in folder_names or "龙女波澜场景汇总" in folder_names,
            f"Expected a courtyard scene match, got: {folder_names}",
        )

    def test_location_with_active_character_gets_affinity_boost(self):
        """When character '龙女' is active, '龙女波澜场景汇总' beats '阿巳庭院' for '庭院'."""
        plan = _minimal_plan(
            characters=[_entity("e1", "龙女辰辰")],
            locations=[_entity("loc1", "夜晚庭院", kind="location")],
        )
        manifest = _manifest_with(
            characters=[_char_record("龙女")],
            scenes=[_scene_record("阿巳庭院"), _scene_record("龙女波澜场景汇总")],
        )
        result = self._bind_with_manifest(plan, manifest)
        folder_names = [b.folder_name for b in result.local_asset_bindings.scene_bindings]
        # 龙女波澜 should rank first due to character affinity
        if len(folder_names) > 1:
            self.assertEqual(folder_names[0], "龙女波澜场景汇总")
        elif len(folder_names) == 1:
            self.assertEqual(folder_names[0], "龙女波澜场景汇总")

    def test_scene_location_field_matched(self):
        """StoryboardScene.location field is also used for scene matching."""
        scene = StoryboardScene(
            scene_id="s1", scene_no=1, title="书房密谈", location="书房"
        )
        plan = _minimal_plan(scenes=[scene])
        manifest = _manifest_with(
            scenes=[_scene_record("府邸书房"), _scene_record("生辰礼书房")],
        )
        result = self._bind_with_manifest(plan, manifest)
        folder_names = {b.folder_name for b in result.local_asset_bindings.scene_bindings}
        self.assertTrue(
            "府邸书房" in folder_names or "生辰礼书房" in folder_names,
        )

    def test_unmatched_location_in_missing_scenes(self):
        plan = _minimal_plan(locations=[_entity("loc1", "现代都市办公楼", kind="location")])
        manifest = _manifest_with(scenes=[_scene_record("阿巳庭院")])
        result = self._bind_with_manifest(plan, manifest)
        self.assertGreater(len(result.local_asset_bindings.missing_scenes), 0)

    def test_no_duplicate_scene_folders(self):
        """Same folder matched by two location texts → only one binding entry."""
        plan = _minimal_plan(
            locations=[
                _entity("loc1", "庭院花园", kind="location"),
                _entity("loc2", "阿巳庭院夜晚", kind="location"),
            ]
        )
        manifest = _manifest_with(scenes=[_scene_record("阿巳庭院")])
        result = self._bind_with_manifest(plan, manifest)
        folder_names = [b.folder_name for b in result.local_asset_bindings.scene_bindings]
        # 阿巳庭院 should appear at most once
        self.assertEqual(folder_names.count("阿巳庭院"), 1)


class TestBindErrorHandling(unittest.TestCase):

    def test_scan_exception_returns_warning_not_raise(self):
        plan = _minimal_plan(characters=[_entity("e1", "龙女")])
        with mock.patch(
            "bananaflow.agent_v2.storyboard.asset_binder.scan_local_assets",
            side_effect=RuntimeError("disk error"),
        ):
            result = bind_local_assets_to_plan(plan, asset_root="/fake")
        self.assertIsNotNone(result.local_asset_bindings)
        warning_text = " ".join(result.local_asset_bindings.warnings)
        self.assertIn("disk error", warning_text)

    def test_missing_asset_root_returns_warning_not_raise(self):
        plan = _minimal_plan()
        result = bind_local_assets_to_plan(plan, asset_root="/totally/nonexistent/path")
        self.assertIsNotNone(result.local_asset_bindings)
        self.assertGreater(len(result.local_asset_bindings.warnings), 0)

    def test_plan_title_and_scenes_unchanged_after_binding(self):
        plan = _minimal_plan(characters=[_entity("e1", "龙女")])
        with mock.patch(
            "bananaflow.agent_v2.storyboard.asset_binder.scan_local_assets",
            return_value=LocalAssetManifest(warnings=["no assets"]),
        ):
            result = bind_local_assets_to_plan(plan, asset_root="/fake")
        self.assertEqual(result.title, plan.title)
        self.assertEqual(result.target_duration_sec, plan.target_duration_sec)


if __name__ == "__main__":
    unittest.main()
