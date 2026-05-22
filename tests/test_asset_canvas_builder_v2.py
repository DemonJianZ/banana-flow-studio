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
