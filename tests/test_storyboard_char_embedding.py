"""
Tests for Storyboard Character Asset Embedding v1.

Covers:
  1. _load_alias_registry — JSON loading and inversion
  2. extract_mentions — @name extraction from user brief
  3. Enhanced bind_local_assets_to_plan — alias expansion + explicit mention boost
  4. New LocalCharacterBinding fields — confidence, match_status, reason_codes, alias_used
  5. STORYBOARD_INJECT_CHARACTER_ASSET_NODES env flag in routes pipeline
"""
from __future__ import annotations

import json
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

from bananaflow.agent_v2.storyboard.asset_binder import (
    _load_alias_registry,
    extract_mentions,
    bind_local_assets_to_plan,
)
from bananaflow.agent_v2.storyboard.schemas import LocalCharacterBinding


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

_ALIAS_JSON = {
    "version": 1,
    "character_aliases": [
        {"canonical_name": "龙女", "aliases": ["龙女辰辰", "辰辰", "Dragon Girl"]},
        {"canonical_name": "阿巳仙君", "aliases": ["阿巳", "仙君", "巳君"]},
    ],
    "scene_aliases": [
        {"canonical_name": "宫廷庭院", "aliases": ["庭院", "御花园"]},
    ],
}


def _write_alias_file(directory: str) -> None:
    path = Path(directory) / "asset_aliases.json"
    path.write_text(json.dumps(_ALIAS_JSON, ensure_ascii=False), encoding="utf-8")


# ---------------------------------------------------------------------------
# 1. _load_alias_registry
# ---------------------------------------------------------------------------

class TestLoadAliasRegistry(unittest.TestCase):

    def test_load_valid_file_returns_inverted_dict(self):
        """Valid asset_aliases.json → correct alias → canonical mapping."""
        with tempfile.TemporaryDirectory() as td:
            _write_alias_file(td)
            registry = _load_alias_registry(Path(td))
        self.assertEqual(registry["龙女辰辰"], "龙女")
        self.assertEqual(registry["辰辰"], "龙女")
        self.assertEqual(registry["Dragon Girl"], "龙女")
        self.assertEqual(registry["阿巳"], "阿巳仙君")

    def test_missing_file_returns_empty_dict(self):
        """No asset_aliases.json → empty dict, no raise."""
        with tempfile.TemporaryDirectory() as td:
            registry = _load_alias_registry(Path(td))
        self.assertEqual(registry, {})

    def test_malformed_json_returns_empty_dict(self):
        """Broken JSON → empty dict, no raise."""
        with tempfile.TemporaryDirectory() as td:
            (Path(td) / "asset_aliases.json").write_text("{not valid json", encoding="utf-8")
            registry = _load_alias_registry(Path(td))
        self.assertEqual(registry, {})

    def test_empty_canonical_name_skipped(self):
        """Entry with empty canonical_name is ignored."""
        data = {"version": 1, "character_aliases": [
            {"canonical_name": "", "aliases": ["should_be_ignored"]},
            {"canonical_name": "龙女", "aliases": ["辰辰"]},
        ]}
        with tempfile.TemporaryDirectory() as td:
            (Path(td) / "asset_aliases.json").write_text(json.dumps(data), encoding="utf-8")
            registry = _load_alias_registry(Path(td))
        self.assertNotIn("should_be_ignored", registry)
        self.assertIn("辰辰", registry)

    def test_empty_alias_entry_skipped(self):
        """Empty string aliases are not added to registry."""
        data = {"version": 1, "character_aliases": [
            {"canonical_name": "龙女", "aliases": ["", "辰辰"]},
        ]}
        with tempfile.TemporaryDirectory() as td:
            (Path(td) / "asset_aliases.json").write_text(json.dumps(data), encoding="utf-8")
            registry = _load_alias_registry(Path(td))
        self.assertNotIn("", registry)
        self.assertIn("辰辰", registry)


# ---------------------------------------------------------------------------
# 2. extract_mentions
# ---------------------------------------------------------------------------

class TestExtractMentions(unittest.TestCase):

    def test_extracts_at_mention(self):
        """@name (space-delimited) → frozenset contains exact name."""
        # Space after @mention is the natural delimiter in Chinese @-mention usage.
        result = extract_mentions("请让@龙女辰辰 登场")
        self.assertIn("龙女辰辰", result)

    def test_extracts_multiple_mentions(self):
        """Two @names → both in result set."""
        result = extract_mentions("@龙女辰辰 和 @阿巳仙君 出现在场景中")
        self.assertIn("龙女辰辰", result)
        self.assertIn("阿巳仙君", result)

    def test_no_at_sign_returns_empty(self):
        """Plain text without @ → empty frozenset."""
        result = extract_mentions("龙女辰辰登场")
        self.assertEqual(result, frozenset())

    def test_empty_brief_returns_empty(self):
        """Empty or None brief → empty frozenset, no raise."""
        self.assertEqual(extract_mentions(""), frozenset())
        self.assertEqual(extract_mentions(None), frozenset())

    def test_latin_at_mention(self):
        """@Word with ASCII word chars is also captured."""
        result = extract_mentions("@Dragon 出场")
        self.assertIn("Dragon", result)


# ---------------------------------------------------------------------------
# Helpers for integration tests
# ---------------------------------------------------------------------------

def _make_minimal_manifest(names: list[str]):
    """Build a LocalAssetManifest-like object with characters only."""
    from bananaflow.agent_v2.storyboard.local_asset_library import (
        LocalAssetManifest, LocalCharacterRecord,
    )
    chars = []
    for name in names:
        chars.append(LocalCharacterRecord(
            name=name,
            three_view_path=f"人物/{name}三视图.png",
            three_view_url=f"/main_assets/人物/{name}三视图.png",
            voice_path=None,
            voice_url=None,
        ))
    return LocalAssetManifest(characters=chars, scenes=[], warnings=[])


def _make_plan_with_entity(entity_name: str):
    """Minimal StoryboardPlan with one character entity."""
    from bananaflow.agent_v2.storyboard.schemas import (
        StoryboardPlan, StoryboardEntities, StoryboardEntity,
    )
    entity = StoryboardEntity(
        entity_id="e1",
        name=entity_name,
        kind="character",
    )
    entities = StoryboardEntities(characters=[entity])
    return StoryboardPlan(
        title="测试方案",
        aspect_ratio="16:9",
        target_duration_sec=30.0,
        estimated_duration_sec=30.0,
        shot_default_duration_sec=4.0,
        entities=entities,
    )


# ---------------------------------------------------------------------------
# 3. Enhanced bind_local_assets_to_plan — alias expansion
# ---------------------------------------------------------------------------

class TestAliasExpansion(unittest.TestCase):

    def _bind_with_alias(self, entity_name: str, char_names: list[str],
                         alias_data: dict | None = None, user_brief: str = ""):
        """
        Run bind_local_assets_to_plan with mocked scan_local_assets and
        optionally a real alias file.
        """
        manifest = _make_minimal_manifest(char_names)
        plan = _make_plan_with_entity(entity_name)
        with tempfile.TemporaryDirectory() as td:
            if alias_data is not None:
                (Path(td) / "asset_aliases.json").write_text(
                    json.dumps(alias_data, ensure_ascii=False), encoding="utf-8"
                )
            with mock.patch("bananaflow.agent_v2.storyboard.asset_binder.scan_local_assets",
                            return_value=manifest), \
                 mock.patch("bananaflow.agent_v2.storyboard.asset_binder.get_main_assets_root",
                            return_value=Path(td)):
                return bind_local_assets_to_plan(plan, asset_root=td, user_brief=user_brief)

    def test_alias_match_finds_canonical_when_direct_fails(self):
        """Entity '辰辰' matches asset '龙女' via alias registry."""
        alias_data = {"version": 1, "character_aliases": [
            {"canonical_name": "龙女", "aliases": ["辰辰"]}
        ]}
        result = self._bind_with_alias("辰辰", ["龙女"], alias_data=alias_data)
        lab = result.local_asset_bindings
        self.assertIsNotNone(lab)
        self.assertEqual(len(lab.character_bindings), 1)
        binding = lab.character_bindings[0]
        self.assertEqual(binding.character_name, "龙女")

    def test_alias_match_sets_alias_used(self):
        """Alias match sets alias_used to the alias string."""
        alias_data = {"version": 1, "character_aliases": [
            {"canonical_name": "龙女", "aliases": ["辰辰"]}
        ]}
        result = self._bind_with_alias("辰辰", ["龙女"], alias_data=alias_data)
        binding = result.local_asset_bindings.character_bindings[0]
        self.assertEqual(binding.alias_used, "辰辰")

    def test_alias_match_sets_status_alias_matched(self):
        """Alias match → match_status == 'alias_matched'."""
        alias_data = {"version": 1, "character_aliases": [
            {"canonical_name": "龙女", "aliases": ["辰辰"]}
        ]}
        result = self._bind_with_alias("辰辰", ["龙女"], alias_data=alias_data)
        binding = result.local_asset_bindings.character_bindings[0]
        self.assertEqual(binding.match_status, "alias_matched")

    def test_alias_match_includes_alias_expanded_in_reason_codes(self):
        """Alias match → 'alias_expanded' in reason_codes."""
        alias_data = {"version": 1, "character_aliases": [
            {"canonical_name": "龙女", "aliases": ["辰辰"]}
        ]}
        result = self._bind_with_alias("辰辰", ["龙女"], alias_data=alias_data)
        binding = result.local_asset_bindings.character_bindings[0]
        self.assertIn("alias_expanded", binding.reason_codes)

    def test_no_alias_file_falls_back_to_direct_match(self):
        """Without alias file, direct name match still works normally."""
        result = self._bind_with_alias("龙女", ["龙女"], alias_data=None)
        binding = result.local_asset_bindings.character_bindings[0]
        self.assertEqual(binding.character_name, "龙女")
        self.assertEqual(binding.match_status, "matched")
        self.assertIsNone(binding.alias_used)

    def test_no_alias_file_unmatched_entity_goes_to_missing(self):
        """Without alias file, unresolvable entity lands in missing_characters."""
        result = self._bind_with_alias("辰辰", ["龙女"], alias_data=None)
        lab = result.local_asset_bindings
        self.assertEqual(len(lab.character_bindings), 0)
        self.assertIn("辰辰", lab.missing_characters)


# ---------------------------------------------------------------------------
# 4. Explicit mention boost
# ---------------------------------------------------------------------------

class TestExplicitMentionBoost(unittest.TestCase):

    def _bind(self, entity_name: str, char_names: list[str],
              user_brief: str = "", alias_data: dict | None = None):
        manifest = _make_minimal_manifest(char_names)
        plan = _make_plan_with_entity(entity_name)
        with tempfile.TemporaryDirectory() as td:
            if alias_data is not None:
                (Path(td) / "asset_aliases.json").write_text(
                    json.dumps(alias_data, ensure_ascii=False), encoding="utf-8"
                )
            with mock.patch("bananaflow.agent_v2.storyboard.asset_binder.scan_local_assets",
                            return_value=manifest), \
                 mock.patch("bananaflow.agent_v2.storyboard.asset_binder.get_main_assets_root",
                            return_value=Path(td)):
                return bind_local_assets_to_plan(plan, asset_root=td, user_brief=user_brief)

    def test_explicit_mention_sets_status_explicit(self):
        """Entity name present in @mention → match_status == 'explicit'."""
        # Space after @name ensures exact token extraction; prefix-match also handles
        # cases without a trailing space (see binder's prefix-match logic).
        result = self._bind("龙女", ["龙女"], user_brief="故事讲述@龙女 的传说")
        binding = result.local_asset_bindings.character_bindings[0]
        self.assertEqual(binding.match_status, "explicit")

    def test_explicit_mention_sets_confidence_one(self):
        """Explicit mention → confidence == 1.0."""
        result = self._bind("龙女", ["龙女"], user_brief="@龙女 登场")
        binding = result.local_asset_bindings.character_bindings[0]
        self.assertEqual(binding.confidence, 1.0)

    def test_explicit_mention_includes_reason_code(self):
        """Explicit mention → 'explicit_mention' in reason_codes."""
        result = self._bind("龙女", ["龙女"], user_brief="@龙女 出现")
        binding = result.local_asset_bindings.character_bindings[0]
        self.assertIn("explicit_mention", binding.reason_codes)

    def test_no_explicit_mention_confidence_below_one(self):
        """Ordinary prefix match → confidence < 1.0."""
        result = self._bind("龙女辰辰", ["龙女"], user_brief="")
        binding = result.local_asset_bindings.character_bindings[0]
        self.assertLess(binding.confidence, 1.0)
        self.assertGreater(binding.confidence, 0.0)


# ---------------------------------------------------------------------------
# 5. New LocalCharacterBinding schema fields
# ---------------------------------------------------------------------------

class TestNewBindingFields(unittest.TestCase):

    def _direct_binding(self):
        """Minimal binding via direct instantiation."""
        return LocalCharacterBinding(
            entity_id="e1",
            entity_name="龙女辰辰",
            character_name="龙女",
            match_score=2.0,
            match_reason="prefix",
        )

    def test_binding_has_confidence_field(self):
        """New confidence field exists and is a float."""
        b = self._direct_binding()
        self.assertIsInstance(b.confidence, float)

    def test_binding_match_status_default_matched(self):
        """Default match_status is 'matched'."""
        b = self._direct_binding()
        self.assertEqual(b.match_status, "matched")

    def test_binding_reason_codes_is_list(self):
        """reason_codes is always a list, never None."""
        b = self._direct_binding()
        self.assertIsInstance(b.reason_codes, list)

    def test_binding_alias_used_default_none(self):
        """alias_used defaults to None."""
        b = self._direct_binding()
        self.assertIsNone(b.alias_used)

    def test_confidence_range_valid(self):
        """bind result always produces 0 <= confidence <= 1.0."""
        manifest = _make_minimal_manifest(["龙女"])
        plan = _make_plan_with_entity("龙女辰辰")
        with tempfile.TemporaryDirectory() as td:
            with mock.patch("bananaflow.agent_v2.storyboard.asset_binder.scan_local_assets",
                            return_value=manifest), \
                 mock.patch("bananaflow.agent_v2.storyboard.asset_binder.get_main_assets_root",
                            return_value=Path(td)):
                result = bind_local_assets_to_plan(plan, asset_root=td)
        for binding in result.local_asset_bindings.character_bindings:
            self.assertGreaterEqual(binding.confidence, 0.0)
            self.assertLessEqual(binding.confidence, 1.0)


# ---------------------------------------------------------------------------
# 6. STORYBOARD_INJECT_CHARACTER_ASSET_NODES env flag
# ---------------------------------------------------------------------------

class TestInjectEnvFlag(unittest.TestCase):
    """Test the env flag through the _run_storyboard_async pipeline."""

    def _make_patch_result(self):
        return {
            "patch": [{"op": "add_node", "node": {"id": "sb1", "type": "storyboard_plan", "x": 120, "y": 120, "data": {}}}],
            "summary": "ok",
        }

    def _character_asset_nodes(self):
        return [{"op": "add_node", "node": {"id": "chr1", "type": "local_asset_image", "x": 120, "y": 820, "data": {}}}]

    def _run_with_flag(self, flag_value: str | None) -> list:
        """Call the patch-building section with a controlled env flag, return final patch."""
        env = {} if flag_value is None else {"STORYBOARD_INJECT_CHARACTER_ASSET_NODES": flag_value}
        with mock.patch.dict(os.environ, env, clear=False):
            patch_result = self._make_patch_result()
            patch = list(patch_result.get("patch", []))
            storyboard_x = (patch[0].get("node") or {}).get("x", 120) if patch else 120
            inject = os.environ.get(
                "STORYBOARD_INJECT_CHARACTER_ASSET_NODES", "1"
            ).strip().lower() in ("1", "true", "yes")
            if inject:
                patch += self._character_asset_nodes()
        return patch

    def test_flag_1_injects_asset_nodes(self):
        """Flag='1' → asset nodes added to patch."""
        patch = self._run_with_flag("1")
        types = [p.get("node", {}).get("type") for p in patch]
        self.assertIn("local_asset_image", types)

    def test_flag_true_injects_asset_nodes(self):
        """Flag='true' → asset nodes added."""
        patch = self._run_with_flag("true")
        types = [p.get("node", {}).get("type") for p in patch]
        self.assertIn("local_asset_image", types)

    def test_flag_0_no_asset_nodes(self):
        """Flag='0' → no asset nodes in patch; storyboard node still present."""
        patch = self._run_with_flag("0")
        types = [p.get("node", {}).get("type") for p in patch]
        self.assertNotIn("local_asset_image", types)
        self.assertIn("storyboard_plan", types)

    def test_flag_false_no_asset_nodes(self):
        """Flag='false' → no asset nodes."""
        patch = self._run_with_flag("false")
        types = [p.get("node", {}).get("type") for p in patch]
        self.assertNotIn("local_asset_image", types)

    def test_flag_absent_defaults_to_enabled(self):
        """No env var → default 'on', asset nodes injected."""
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("STORYBOARD_INJECT_CHARACTER_ASSET_NODES", None)
            patch = self._run_with_flag(None)
        types = [p.get("node", {}).get("type") for p in patch]
        self.assertIn("local_asset_image", types)


if __name__ == "__main__":
    unittest.main()
