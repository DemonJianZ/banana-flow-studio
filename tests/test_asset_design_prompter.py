import os
import sys
import json
import unittest
from unittest import mock

ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
PACKAGE_DIR = os.path.join(ROOT_DIR, "bananaflow")
if PACKAGE_DIR not in sys.path:
    sys.path.insert(0, PACKAGE_DIR)

from agent_v2.shot_workflow.asset_design_prompter import (
    generate_design_prompts,
    resolve_asset_design_mode,
    _fallback_prompt,
)


# ---------------------------------------------------------------------------
# Tests for resolve_asset_design_mode
# ---------------------------------------------------------------------------

class TestResolveAssetDesignMode(unittest.TestCase):

    def test_local_policy_returns_local_text2img(self):
        self.assertEqual(resolve_asset_design_mode("local"), "local_text2img")

    def test_comfyui_policy_returns_local_text2img(self):
        self.assertEqual(resolve_asset_design_mode("comfyui"), "local_text2img")

    def test_local_text2img_policy_passthrough(self):
        self.assertEqual(resolve_asset_design_mode("local_text2img"), "local_text2img")

    def test_text2img_policy_passthrough(self):
        self.assertEqual(resolve_asset_design_mode("text2img"), "text2img")

    def test_multi_image_generate_downgrades(self):
        # Critical: no reference image for missing assets
        result = resolve_asset_design_mode("multi_image_generate")
        self.assertEqual(result, "text2img")
        self.assertNotEqual(result, "multi_image_generate")

    def test_auto_policy_returns_text2img(self):
        self.assertEqual(resolve_asset_design_mode("auto"), "text2img")

    def test_empty_policy_returns_text2img(self):
        self.assertEqual(resolve_asset_design_mode(""), "text2img")


# ---------------------------------------------------------------------------
# Tests for generate_design_prompts
# ---------------------------------------------------------------------------

CHAR_ENTITY = {
    "entity_id": "character_辰辰",
    "name": "辰辰",
    "entity_type": "character",
    "description": "身着红色汉服的少女",
}

PROP_ENTITY = {
    "entity_id": "prop_玉佩",
    "name": "玉佩",
    "entity_type": "prop",
    "description": "碧绿色玉石挂件",
}

SCENE_ENTITY = {
    "entity_id": "scene_竹林",
    "name": "竹林",
    "entity_type": "scene",
    "description": "清晨薄雾中的幽静竹林",
}


class TestGenerateDesignPrompts(unittest.TestCase):

    def test_empty_entities_returns_empty_dict(self):
        result = generate_design_prompts([])
        self.assertEqual(result, {})

    def test_llm_success_returns_llm_prompts(self):
        llm_response = {"character_辰辰": "Three-view design sheet of a girl in red hanfu"}
        with mock.patch(
            "agent_v2.shot_workflow.asset_design_prompter._call_llm",
            return_value=llm_response,
        ):
            result = generate_design_prompts([CHAR_ENTITY])

        self.assertIn("character_辰辰", result)
        item = result["character_辰辰"]
        self.assertEqual(item["source"], "llm")
        self.assertEqual(item["prompt"], "Three-view design sheet of a girl in red hanfu")
        self.assertEqual(item["warnings"], [])
        self.assertEqual(item["entity_id"], "character_辰辰")
        self.assertEqual(item["name"], "辰辰")
        self.assertEqual(item["entity_type"], "character")

    def test_llm_failure_uses_fallback(self):
        with mock.patch(
            "agent_v2.shot_workflow.asset_design_prompter._call_llm",
            side_effect=Exception("LLM unavailable"),
        ):
            result = generate_design_prompts([CHAR_ENTITY, PROP_ENTITY])

        self.assertEqual(set(result.keys()), {"character_辰辰", "prop_玉佩"})
        for item in result.values():
            self.assertEqual(item["source"], "fallback")
            self.assertIn(item["name"], item["prompt"])

    def test_llm_missing_entity_uses_per_entity_fallback(self):
        # LLM returns only the character, omits the prop
        llm_response = {"character_辰辰": "Three-view design sheet of a girl in red hanfu"}
        with mock.patch(
            "agent_v2.shot_workflow.asset_design_prompter._call_llm",
            return_value=llm_response,
        ):
            result = generate_design_prompts([CHAR_ENTITY, PROP_ENTITY])

        # Present entity uses LLM
        self.assertEqual(result["character_辰辰"]["source"], "llm")
        self.assertEqual(result["character_辰辰"]["warnings"], [])

        # Missing entity uses fallback with warning
        self.assertEqual(result["prop_玉佩"]["source"], "fallback")
        self.assertIn("llm_entity_missing_from_response", result["prop_玉佩"]["warnings"])

    def test_fallback_prompt_by_type(self):
        char_prompt = _fallback_prompt("辰辰", "character", "身着红色汉服的少女")
        self.assertIn("Three-view character design sheet", char_prompt)
        self.assertIn("辰辰", char_prompt)

        prop_prompt = _fallback_prompt("玉佩", "prop", "碧绿色玉石挂件")
        self.assertIn("Product concept illustration", prop_prompt)
        self.assertIn("玉佩", prop_prompt)

        scene_prompt = _fallback_prompt("竹林", "scene", "清晨薄雾中的幽静竹林")
        self.assertIn("Environment concept art", scene_prompt)
        self.assertIn("竹林", scene_prompt)

        unknown_prompt = _fallback_prompt("未知物体", "unknown_type", "某个描述")
        self.assertIn("Concept illustration", unknown_prompt)
        self.assertIn("未知物体", unknown_prompt)

    def test_result_keys_match_entity_ids(self):
        llm_response = {
            "character_辰辰": "prompt A",
            "prop_玉佩": "prompt B",
            "scene_竹林": "prompt C",
        }
        entities = [CHAR_ENTITY, PROP_ENTITY, SCENE_ENTITY]
        with mock.patch(
            "agent_v2.shot_workflow.asset_design_prompter._call_llm",
            return_value=llm_response,
        ):
            result = generate_design_prompts(entities)

        self.assertEqual(
            set(result.keys()),
            {"character_辰辰", "prop_玉佩", "scene_竹林"},
        )

    def test_fallback_empty_description_no_crash(self):
        entity_no_desc = {
            "entity_id": "prop_盾",
            "name": "盾",
            "entity_type": "prop",
            "description": "",
        }
        with mock.patch(
            "agent_v2.shot_workflow.asset_design_prompter._call_llm",
            side_effect=Exception("fail"),
        ):
            result = generate_design_prompts([entity_no_desc])

        self.assertIn("prop_盾", result)
        item = result["prop_盾"]
        self.assertEqual(item["source"], "fallback")
        # Prompt should not raise and should contain the name
        self.assertIn("盾", item["prompt"])


if __name__ == "__main__":
    unittest.main()
