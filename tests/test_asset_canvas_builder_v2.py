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


from agent_v2.shot_workflow.asset_canvas_builder import (
    build_asset_canvas_patch,
    _build_placeholder_asset_patch,
)


def _matched_entity(name="龙女", entity_type="character"):
    return {
        "entity_id": f"{entity_type}_{name}",
        "name": name,
        "entity_type": entity_type,
        "description": "test description",
        "asset_status": "matched",
        "matched_url": f"/assets/{name}.png",
        "asset_id": "abc123",
        "design_prompt": None,
        "design_prompt_source": "",
        "design_prompt_warnings": [],
    }


def _missing_entity(name="辰辰", entity_type="character"):
    return {
        "entity_id": f"{entity_type}_{name}",
        "name": name,
        "entity_type": entity_type,
        "description": "青色道袍",
        "asset_status": "missing",
        "matched_url": None,
        "asset_id": None,
        "design_prompt": "Three-view character design sheet of 辰辰",
        "design_prompt_source": "llm",
        "design_prompt_warnings": [],
    }


class TestBuildAssetCanvasPatch(unittest.TestCase):

    def _get_add_node_ops(self, patch):
        return [op for op in patch if op.get("op") == "add_node"]

    def _get_connection_ops(self, patch):
        return [op for op in patch if op.get("op") == "add_connection"]

    def _get_nodes_by_type(self, patch, node_type):
        return [
            op["node"] for op in patch
            if op.get("op") == "add_node" and op["node"].get("type") == node_type
        ]

    def test_matched_entity_creates_input_node(self):
        entity = _matched_entity()
        patch = build_asset_canvas_patch([entity])
        input_nodes = self._get_nodes_by_type(patch, "input")
        self.assertEqual(len(input_nodes), 1)
        node = input_nodes[0]
        self.assertEqual(node["data"]["url"], "/assets/龙女.png")
        self.assertEqual(node["data"]["entity_id"], "character_龙女")

    def test_missing_entity_creates_three_node_chain(self):
        entity = _missing_entity()
        patch = build_asset_canvas_patch([entity])
        add_nodes = self._get_add_node_ops(patch)
        node_types = [op["node"]["type"] for op in add_nodes]
        self.assertIn("text_input", node_types)
        self.assertIn("processor", node_types)
        self.assertIn("output", node_types)
        connections = self._get_connection_ops(patch)
        self.assertEqual(len(connections), 2)

    def test_missing_entity_processor_has_prompt(self):
        entity = _missing_entity()
        patch = build_asset_canvas_patch([entity])
        processor_nodes = self._get_nodes_by_type(patch, "processor")
        self.assertEqual(len(processor_nodes), 1)
        self.assertTrue(processor_nodes[0]["data"]["prompt"])

    def test_missing_entity_text_input_has_workflow_role(self):
        entity = _missing_entity()
        patch = build_asset_canvas_patch([entity])
        text_input_nodes = self._get_nodes_by_type(patch, "text_input")
        entity_text_inputs = [
            n for n in text_input_nodes
            if n["data"].get("workflow_role") == "asset_design_generation"
        ]
        self.assertGreater(len(entity_text_inputs), 0)

    def test_mode_policy_multi_image_generate_downgrades(self):
        entity = _missing_entity()
        patch = build_asset_canvas_patch([entity], mode_policy="multi_image_generate")
        processor_nodes = self._get_nodes_by_type(patch, "processor")
        self.assertEqual(len(processor_nodes), 1)
        self.assertEqual(processor_nodes[0]["data"]["mode"], "text2img")

    def test_candidate_entity_treated_as_missing(self):
        entity = {
            "entity_id": "character_候选",
            "name": "候选",
            "entity_type": "character",
            "description": "候选实体",
            "asset_status": "candidate",
            "matched_url": None,
            "asset_id": None,
            "design_prompt": "Candidate entity design",
            "design_prompt_source": "fallback",
            "design_prompt_warnings": [],
        }
        patch = build_asset_canvas_patch([entity])
        node_types = [op["node"]["type"] for op in self._get_add_node_ops(patch)]
        self.assertIn("text_input", node_types)
        self.assertIn("processor", node_types)
        self.assertIn("output", node_types)
        connections = self._get_connection_ops(patch)
        self.assertEqual(len(connections), 2)

    def test_mixed_matched_and_missing(self):
        entities = [_matched_entity(), _missing_entity()]
        patch = build_asset_canvas_patch(entities)
        input_nodes = self._get_nodes_by_type(patch, "input")
        processor_nodes = self._get_nodes_by_type(patch, "processor")
        output_nodes = self._get_nodes_by_type(patch, "output")
        self.assertEqual(len(input_nodes), 1)
        self.assertEqual(len(processor_nodes), 1)
        self.assertEqual(len(output_nodes), 1)

    def test_placeholder_patch_creates_bare_text_inputs(self):
        entities = [_matched_entity(), _missing_entity()]
        patch = _build_placeholder_asset_patch(entities)
        add_node_ops = self._get_add_node_ops(patch)
        self.assertEqual(len(add_node_ops), len(entities))
        for op in add_node_ops:
            self.assertEqual(op["node"]["type"], "text_input")

    def test_group_container_created_per_entity_type(self):
        entities = [
            _matched_entity(name="龙女", entity_type="character"),
            _missing_entity(name="庭院", entity_type="scene"),
        ]
        patch = build_asset_canvas_patch(entities)
        group_nodes = self._get_nodes_by_type(patch, "group_container")
        self.assertEqual(len(group_nodes), 2)

    def test_empty_entities_returns_non_empty_patch_or_empty(self):
        # Should not raise; returning empty list is acceptable
        try:
            patch = build_asset_canvas_patch([])
            self.assertIsInstance(patch, list)
        except Exception as e:
            self.fail(f"build_asset_canvas_patch([]) raised an exception: {e}")
