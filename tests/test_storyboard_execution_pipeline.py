import json
import sys
import unittest
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))


from bananaflow.agent.storyboard_execution import (  # noqa: E402
    ASSET_BIBLE_SCHEMA,
    PROMPT_PACK_SCHEMA,
    SHOT_SPEC_SCHEMA,
    compile_storyboard_execution_package,
)


class StoryboardExecutionPipelineTests(unittest.TestCase):
    def test_compile_storyboard_execution_package_from_ootd_example(self):
        base_dir = ROOT_DIR / "examples" / "storyboard_execution" / "ootd_vlog"
        storyboard_master = json.loads((base_dir / "storyboard_master.json").read_text(encoding="utf-8"))

        compiled = compile_storyboard_execution_package(storyboard_master)

        asset_bible = compiled["asset_bible"]
        shot_spec = compiled["shot_spec"]
        prompt_pack = compiled["prompt_pack"]

        self.assertEqual(asset_bible["project_title"], "逛街vlog：一站式街拍OOTD搭配手册")
        self.assertGreaterEqual(len(asset_bible["look_definitions"]), 2)
        self.assertGreaterEqual(len(asset_bible["locations"]), 2)
        self.assertGreaterEqual(len(shot_spec["sequences"]), 4)
        self.assertEqual(len(shot_spec["shots"]), 12)
        self.assertEqual(len(prompt_pack["prompts"]), len(shot_spec["shots"]))
        self.assertIn("shot_011", asset_bible["climax_protection"]["protected_shots"])
        self.assertTrue(prompt_pack["prompts"][0]["negative_prompt"])
        self.assertEqual(shot_spec["shots"][0]["prev_shot_id"], "")
        self.assertEqual(shot_spec["shots"][0]["next_shot_id"], "shot_002")
        self.assertEqual(shot_spec["shots"][1]["prev_shot_id"], "shot_001")
        self.assertTrue(shot_spec["sequences"][0]["duration_sec"] > 0)
        self.assertEqual(shot_spec["shots"][7]["look_ref"], "look_b")
        self.assertEqual(shot_spec["shots"][7]["location_ref"], "location_b")
        self.assertIn("inherit pose/eyeline from shot_001", prompt_pack["prompts"][1]["continuity_note"])
        climax_prompt = next(item for item in prompt_pack["prompts"] if item["shot_id"] == "shot_011")
        self.assertIn("protect climax framing and hero beat", climax_prompt["edit_note"])

    def test_schema_constants_expose_required_top_level_fields(self):
        self.assertIn("host_identity", ASSET_BIBLE_SCHEMA["required"])
        self.assertIn("shots", SHOT_SPEC_SCHEMA["required"])
        self.assertIn("prompts", PROMPT_PACK_SCHEMA["required"])
        shot_required = SHOT_SPEC_SCHEMA["properties"]["shots"]["items"]["required"]
        self.assertIn("prev_shot_id", shot_required)
        self.assertIn("next_shot_id", shot_required)

    def test_compile_prefers_final_delivery_shot_manifest_when_available(self):
        storyboard_master = {
            "project_title": "测试分镜",
            "state": {
                "stages": {
                    "final_delivery": {
                        "summary": "最终总稿已完成",
                        "content": "这是人类可读总稿。",
                        "sections": [
                            {
                                "id": "shot_manifest",
                                "title": "Shot Manifest",
                                "content": json.dumps(
                                    [
                                        {
                                            "shot_id": "shot_001",
                                            "sequence_id": "seq_01",
                                            "sequence_title": "开场",
                                            "scene_id": "scene_01",
                                            "scene_title": "场景一",
                                            "purpose": "建立人物",
                                            "story_function": "hook",
                                            "subject": "主角",
                                            "action": "主角推门进入镜头。",
                                            "framing": "MS",
                                            "camera_angle": "eye_level",
                                            "camera_movement": "push_in",
                                            "duration_sec": 2.5,
                                            "emotion": "tense",
                                            "continuity_anchor": "门口动作",
                                            "look_name": "Look Main",
                                            "location_name": "城市街区",
                                            "audio_cue": "门响",
                                            "transition_in": "cold_open",
                                            "transition_out": "match_cut",
                                            "climax_weight": 0.35,
                                            "prompt_intent": "hook:建立人物",
                                        },
                                        {
                                            "shot_id": "shot_002",
                                            "sequence_id": "seq_01",
                                            "sequence_title": "开场",
                                            "scene_id": "scene_01",
                                            "scene_title": "场景一",
                                            "purpose": "延续动作",
                                            "story_function": "progression",
                                            "subject": "主角半身",
                                            "action": "主角转身看向镜头。",
                                            "framing": "CU",
                                            "camera_angle": "eye_level",
                                            "camera_movement": "static",
                                            "duration_sec": 2.0,
                                            "emotion": "observational",
                                            "continuity_anchor": "转身",
                                            "look_name": "Look Main",
                                            "location_name": "城市街区",
                                            "audio_cue": "环境音",
                                            "transition_in": "match_cut",
                                            "transition_out": "hold_on_end",
                                            "climax_weight": 0.4,
                                            "prompt_intent": "progression:延续动作",
                                        },
                                    ],
                                    ensure_ascii=False,
                                ),
                            }
                        ],
                    }
                }
            },
        }
        compiled = compile_storyboard_execution_package(storyboard_master)
        shot_spec = compiled["shot_spec"]
        self.assertEqual(len(shot_spec["shots"]), 2)
        self.assertEqual(shot_spec["shots"][0]["next_shot_id"], "shot_002")
        self.assertEqual(shot_spec["shots"][1]["prev_shot_id"], "shot_001")


if __name__ == "__main__":
    unittest.main()
