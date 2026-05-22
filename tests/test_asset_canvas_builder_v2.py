import os
import sys
import unittest

ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
PACKAGE_DIR = os.path.join(ROOT_DIR, "bananaflow")
if PACKAGE_DIR not in sys.path:
    sys.path.insert(0, PACKAGE_DIR)

from agent_v2.shot_workflow.asset_canvas_builder import make_entity_id


class TestMakeEntityId(unittest.TestCase):

    def test_basic(self):
        self.assertEqual(make_entity_id("character", "龙女"), "character_龙女")

    def test_scene_type(self):
        self.assertEqual(make_entity_id("scene", "庭院"), "scene_庭院")

    def test_prop_type(self):
        self.assertEqual(make_entity_id("prop", "玉佩"), "prop_玉佩")

    def test_first_occurrence_no_suffix(self):
        self.assertEqual(make_entity_id("character", "侍卫", occurrence=1), "character_侍卫")

    def test_second_occurrence_suffix(self):
        self.assertEqual(make_entity_id("character", "侍卫", occurrence=2), "character_侍卫_2")

    def test_third_occurrence_suffix(self):
        self.assertEqual(make_entity_id("character", "侍卫", occurrence=3), "character_侍卫_3")

    def test_name_with_spaces_normalized(self):
        eid = make_entity_id("character", "辰 辰")
        self.assertNotIn(" ", eid)

    def test_name_with_slash_normalized(self):
        eid = make_entity_id("prop", "刀/剑")
        self.assertNotIn("/", eid)

    def test_name_with_colon_normalized(self):
        eid = make_entity_id("scene", "室内:客厅")
        self.assertNotIn(":", eid)


from unittest import mock
from agent_v2.shot_workflow.asset_canvas_builder import match_asset_entities


class TestMatchAssetEntities(unittest.TestCase):

    def _make_manifest(self, char_names=(), scene_names=()):
        from agent_v2.storyboard.local_asset_library import (
            LocalAssetManifest, LocalCharacterRecord, LocalSceneRecord,
        )
        chars = [
            LocalCharacterRecord(
                name=n,
                three_view_url=f"/main_assets/人物/{n}三视图.png",
            )
            for n in char_names
        ]
        scenes = [
            LocalSceneRecord(
                folder_name=n,
                folder_path=f"场景/{n}",
                preview_urls=[f"/main_assets/场景/{n}/01.jpg"],
            )
            for n in scene_names
        ]
        return LocalAssetManifest(characters=chars, scenes=scenes)

    def test_character_exact_match_goes_to_matched(self):
        manifest = self._make_manifest(char_names=["龙女"])
        entities = [{"entity_id": "character_龙女", "name": "龙女", "entity_type": "character", "description": ""}]
        with mock.patch("agent_v2.shot_workflow.asset_canvas_builder.scan_local_assets", return_value=manifest):
            result = match_asset_entities(entities)
        self.assertEqual(len(result["matched"]), 1)
        self.assertEqual(result["matched"][0]["entity_id"], "character_龙女")
        self.assertIsNotNone(result["matched"][0]["url"])
        self.assertIsNotNone(result["matched"][0]["asset_id"])
        self.assertEqual(len(result["unmatched"]), 0)

    def test_unknown_character_goes_to_unmatched(self):
        manifest = self._make_manifest(char_names=["龙女"])
        entities = [{"entity_id": "character_辰辰", "name": "辰辰", "entity_type": "character", "description": ""}]
        with mock.patch("agent_v2.shot_workflow.asset_canvas_builder.scan_local_assets", return_value=manifest):
            result = match_asset_entities(entities)
        self.assertEqual(len(result["unmatched"]), 1)
        self.assertEqual(result["unmatched"][0]["entity_id"], "character_辰辰")

    def test_prop_always_unmatched_phase0(self):
        manifest = self._make_manifest()
        entities = [{"entity_id": "prop_玉佩", "name": "玉佩", "entity_type": "prop", "description": ""}]
        with mock.patch("agent_v2.shot_workflow.asset_canvas_builder.scan_local_assets", return_value=manifest):
            result = match_asset_entities(entities)
        self.assertEqual(len(result["unmatched"]), 1)
        self.assertEqual(result["matched"], [])

    def test_scene_exact_match_goes_to_matched(self):
        manifest = self._make_manifest(scene_names=["庭院"])
        entities = [{"entity_id": "scene_庭院", "name": "庭院", "entity_type": "scene", "description": ""}]
        with mock.patch("agent_v2.shot_workflow.asset_canvas_builder.scan_local_assets", return_value=manifest):
            result = match_asset_entities(entities)
        self.assertEqual(len(result["matched"]), 1)
        self.assertIsNotNone(result["matched"][0]["url"])

    def test_scan_failure_returns_all_unmatched(self):
        entities = [{"entity_id": "character_辰辰", "name": "辰辰", "entity_type": "character", "description": ""}]
        with mock.patch("agent_v2.shot_workflow.asset_canvas_builder.scan_local_assets", side_effect=Exception("disk error")):
            result = match_asset_entities(entities)
        self.assertEqual(len(result["unmatched"]), 1)
        self.assertEqual(result["matched"], [])

    def test_result_has_all_keys(self):
        manifest = self._make_manifest()
        entities = []
        with mock.patch("agent_v2.shot_workflow.asset_canvas_builder.scan_local_assets", return_value=manifest):
            result = match_asset_entities(entities)
        self.assertIn("matched", result)
        self.assertIn("unmatched", result)
        self.assertIn("candidates", result)
