import os
import sys
import unittest
from unittest import mock


ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
BANANAFLOW_DIR = os.path.join(ROOT_DIR, "bananaflow")
if BANANAFLOW_DIR not in sys.path:
    sys.path.insert(0, BANANAFLOW_DIR)


from bananaflow.agent.storyboard_local_edit import build_storyboard_local_edit_patch  # noqa: E402


class StoryboardLocalEditTests(unittest.TestCase):
    def test_should_update_selected_entity_and_related_shots_via_llm_editor(self):
        current_nodes = [
            {
                "id": "story-1",
                "type": "storyboard_plan",
                "data": {
                    "title": "雨夜暗巷",
                    "storyboard_plan": {
                        "title": "雨夜暗巷",
                        "entities": {
                            "characters": [
                                {
                                    "entity_id": "char-orange-boss",
                                    "name": "橘猫老大",
                                    "core_description": "一只强壮的成年橘猫，带有黑帮老大的气场。",
                                }
                            ],
                            "subjects": [],
                            "locations": [],
                        },
                        "scenes": [
                            {
                                "scene_id": "scene-1",
                                "title": "对峙",
                                "shots": [
                                    {
                                        "shot_id": "shot-1",
                                        "visual_description": "橘猫老大站在雨夜暗巷里，盯着黑猫。",
                                        "voiceover": "",
                                    }
                                ],
                            }
                        ],
                    },
                },
            }
        ]
        selected_artifact = {
            "kind": "storyboard_selection",
            "fromNodeId": "story-1",
            "meta": {
                "selectionType": "entity",
                "selectionId": "char-orange-boss",
                "selectionLabel": "角色/主体 · 橘猫老大",
            },
        }

        llm_payload = {
            "storyboard_plan": {
                "title": "雨夜暗巷",
                "aspect_ratio": "16:9",
                "style": "",
                "target_duration_sec": 30,
                "estimated_duration_sec": 4,
                "shot_default_duration_sec": 4,
                "entities": {
                    "characters": [
                        {
                            "entity_id": "char-orange-boss",
                            "name": "蓝猫老大",
                            "kind": "character",
                            "core_description": "一只强壮的成年蓝猫，带有黑帮老大的气场。",
                        }
                    ],
                    "subjects": [],
                    "locations": [
                        {
                            "entity_id": "loc-1",
                            "name": "雨夜暗巷",
                            "kind": "location",
                            "core_description": "潮湿压抑的雨夜暗巷。",
                        }
                    ],
                },
                "scenes": [
                    {
                        "scene_id": "scene-1",
                        "scene_no": 1,
                        "title": "对峙",
                        "summary": "",
                        "location": "雨夜暗巷",
                        "objective": "",
                        "scene_notes": "",
                        "shots": [
                            {
                                "shot_id": "shot-1",
                                "shot_no": 1,
                                "duration_sec": 4,
                                "camera": "",
                                "visual_description": "蓝猫老大站在雨夜暗巷里，盯着黑猫。",
                                "sound_description": "",
                                "dialogues": [],
                                "voiceover": "",
                                "referenced_entities": ["蓝猫老大"],
                                "generation_notes": "",
                            }
                        ],
                    }
                ],
                "global_notes": [],
                "design_rationale": "",
                "warnings": [],
            },
            "summary": "已将橘猫角色重设为蓝猫。",
        }
        with mock.patch("bananaflow.agent.storyboard_local_edit.default_storyboard_llm_generate", return_value=llm_payload):
            out = build_storyboard_local_edit_patch("将橘猫换成蓝猫", selected_artifact, current_nodes)
        self.assertIsNotNone(out)
        self.assertEqual(out["patch"][0]["op"], "update_node")
        plan = out["patch"][0]["data"]["storyboard_plan"]
        self.assertEqual(plan["entities"]["characters"][0]["name"], "蓝猫老大")
        self.assertIn("蓝猫老大", plan["scenes"][0]["shots"][0]["visual_description"])
        self.assertEqual(out["patch"][1]["op"], "select_nodes")

    def test_should_return_none_when_no_replace_directive(self):
        current_nodes = [
            {
                "id": "story-1",
                "type": "storyboard_plan",
                "data": {"storyboard_plan": {"entities": {"characters": []}, "scenes": []}},
            }
        ]
        selected_artifact = {
            "kind": "storyboard_selection",
            "fromNodeId": "story-1",
            "meta": {"selectionType": "entity", "selectionId": "char-1"},
        }
        with mock.patch("bananaflow.agent.storyboard_local_edit.default_storyboard_llm_generate", side_effect=RuntimeError("boom")):
            out = build_storyboard_local_edit_patch("把这个角色改得更有压迫感", selected_artifact, current_nodes)
        self.assertIsNone(out)

    def test_should_fallback_to_simple_replace_when_llm_fails(self):
        current_nodes = [
            {
                "id": "story-1",
                "type": "storyboard_plan",
                "data": {
                    "storyboard_plan": {
                        "title": "雨夜暗巷",
                        "entities": {
                            "characters": [
                                {
                                    "entity_id": "char-orange-boss",
                                    "name": "橘猫老大",
                                    "core_description": "一只强壮的成年橘猫。",
                                }
                            ],
                            "subjects": [],
                            "locations": [],
                        },
                        "scenes": [],
                    }
                },
            }
        ]
        selected_artifact = {
            "kind": "storyboard_selection",
            "fromNodeId": "story-1",
            "meta": {"selectionType": "entity", "selectionId": "char-orange-boss"},
        }
        with mock.patch("bananaflow.agent.storyboard_local_edit.default_storyboard_llm_generate", side_effect=RuntimeError("boom")):
            out = build_storyboard_local_edit_patch("将橘猫换成蓝猫", selected_artifact, current_nodes)
        self.assertIsNotNone(out)
        self.assertEqual(out["patch"][0]["data"]["storyboard_plan"]["entities"]["characters"][0]["name"], "蓝猫老大")


if __name__ == "__main__":
    unittest.main()
