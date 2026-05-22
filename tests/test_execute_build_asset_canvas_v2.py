"""Tests for the rewritten execute_build_asset_canvas node (v2 orchestration)."""
from __future__ import annotations

import os
import sys
from unittest.mock import patch, MagicMock

ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
PACKAGE_DIR = os.path.join(ROOT_DIR, "bananaflow")
if PACKAGE_DIR not in sys.path:
    sys.path.insert(0, PACKAGE_DIR)

import pytest

from agent_v2.graph.nodes.execute_build_asset_canvas import execute_build_asset_canvas

# ---------------------------------------------------------------------------
# Mock targets (must match import location in the node module)
# ---------------------------------------------------------------------------
MOCK_TARGET_MATCH = "agent_v2.graph.nodes.execute_build_asset_canvas.match_asset_entities"
MOCK_TARGET_PROMPTS = "agent_v2.graph.nodes.execute_build_asset_canvas.generate_design_prompts"
MOCK_TARGET_BUILD = "agent_v2.graph.nodes.execute_build_asset_canvas.build_asset_canvas_patch"
MOCK_TARGET_PLACEHOLDER = "agent_v2.graph.nodes.execute_build_asset_canvas._build_placeholder_asset_patch"

# ---------------------------------------------------------------------------
# Sample input
# ---------------------------------------------------------------------------
TOOL_ARGS_SAMPLE = {
    "characters": [
        {"name": "辰辰", "type": "character", "description": "青色道袍"},
        {"name": "玉佩", "type": "prop", "description": "玉制挂件"},
    ],
    "scenes": [
        {"name": "庭院", "atmosphere": "白天，桃花树下"},
    ],
}

# Default match result (all unmatched)
DEFAULT_MATCH_UNMATCHED_IDS = ["character_辰辰", "prop_玉佩", "scene_庭院"]
DEFAULT_MATCH = {
    "matched": [],
    "unmatched": [
        {"entity_id": "character_辰辰", "name": "辰辰", "entity_type": "character", "description": "青色道袍"},
        {"entity_id": "prop_玉佩", "name": "玉佩", "entity_type": "prop", "description": "玉制挂件"},
        {"entity_id": "scene_庭院", "name": "庭院", "entity_type": "scene", "description": "白天，桃花树下"},
    ],
    "candidates": [],
}

# Default prompts (empty → all entities get empty design_prompt)
DEFAULT_PROMPTS: dict = {}

# A plausible patch from build_asset_canvas_patch
FAKE_PATCH = [{"op": "add_node", "node": {"id": "n1", "type": "text_input"}}]


class TestExecuteBuildAssetCanvas:

    def _run(self, state: dict, match_result=None, prompts=None, patch_result=None):
        """Helper: run with default mocks, allowing overrides."""
        if match_result is None:
            match_result = DEFAULT_MATCH
        if prompts is None:
            prompts = DEFAULT_PROMPTS
        if patch_result is None:
            patch_result = FAKE_PATCH

        with patch(MOCK_TARGET_MATCH, return_value=match_result) as mock_match, \
             patch(MOCK_TARGET_PROMPTS, return_value=prompts) as mock_prompts, \
             patch(MOCK_TARGET_BUILD, return_value=patch_result) as mock_build:
            result = execute_build_asset_canvas(state)
        return result, mock_match, mock_prompts, mock_build

    # -----------------------------------------------------------------------
    # 1. exec_patches key present
    # -----------------------------------------------------------------------
    def test_returns_exec_patches(self):
        state = {"tool_args": TOOL_ARGS_SAMPLE, "authorization": "Bearer tok"}
        result, *_ = self._run(state)
        assert "exec_patches" in result
        assert isinstance(result["exec_patches"], list)

    # -----------------------------------------------------------------------
    # 2. exec_data has required keys
    # -----------------------------------------------------------------------
    def test_returns_exec_data_with_counts(self):
        state = {"tool_args": TOOL_ARGS_SAMPLE}
        result, *_ = self._run(state)
        ed = result["exec_data"]
        assert ed["kind"] == "asset_canvas"
        assert "matched_count" in ed
        assert "missing_count" in ed
        assert "patch_count" in ed
        assert isinstance(ed["matched_count"], int)
        assert isinstance(ed["missing_count"], int)
        assert isinstance(ed["patch_count"], int)

    # -----------------------------------------------------------------------
    # 3. Trace appended
    # -----------------------------------------------------------------------
    def test_trace_appended(self):
        state = {"tool_args": TOOL_ARGS_SAMPLE, "trace": [{"type": "PREV"}]}
        result, *_ = self._run(state)
        trace = result["trace"]
        assert any(t.get("type") == "EXECUTE_BUILD_ASSET_CANVAS" for t in trace)
        # Original trace entry preserved
        assert any(t.get("type") == "PREV" for t in trace)

    # -----------------------------------------------------------------------
    # 4. match failure → fallback (no crash), missing_count == total entities
    # -----------------------------------------------------------------------
    def test_match_failure_fallback(self):
        state = {"tool_args": TOOL_ARGS_SAMPLE}
        with patch(MOCK_TARGET_MATCH, side_effect=RuntimeError("db down")), \
             patch(MOCK_TARGET_PROMPTS, return_value=DEFAULT_PROMPTS), \
             patch(MOCK_TARGET_BUILD, return_value=FAKE_PATCH):
            result = execute_build_asset_canvas(state)

        assert "exec_patches" in result
        ed = result["exec_data"]
        # 2 characters + 1 scene = 3 entities; match failure → all unmatched
        assert ed["missing_count"] == 3

    # -----------------------------------------------------------------------
    # 5. generate_design_prompts called only for unmatched + candidates
    # -----------------------------------------------------------------------
    def test_design_prompts_called_for_unmatched_only(self):
        state = {"tool_args": TOOL_ARGS_SAMPLE}

        # One entity matched, two unmatched
        match_result = {
            "matched": [
                {"entity_id": "character_辰辰", "name": "辰辰", "entity_type": "character",
                 "url": "http://x/a.png", "asset_id": "abc", "score": 3.0}
            ],
            "unmatched": [
                {"entity_id": "prop_玉佩", "name": "玉佩", "entity_type": "prop", "description": "玉制挂件"},
                {"entity_id": "scene_庭院", "name": "庭院", "entity_type": "scene", "description": "白天，桃花树下"},
            ],
            "candidates": [],
        }

        with patch(MOCK_TARGET_MATCH, return_value=match_result) as mock_match, \
             patch(MOCK_TARGET_PROMPTS, return_value=DEFAULT_PROMPTS) as mock_prompts, \
             patch(MOCK_TARGET_BUILD, return_value=FAKE_PATCH):
            execute_build_asset_canvas(state)

        # generate_design_prompts should have been called with only the 2 unmatched entities
        mock_prompts.assert_called_once()
        called_entities = mock_prompts.call_args[0][0]
        called_ids = {e["entity_id"] for e in called_entities}
        assert "prop_玉佩" in called_ids
        assert "scene_庭院" in called_ids
        # The matched entity should NOT be included
        assert "character_辰辰" not in called_ids

    # -----------------------------------------------------------------------
    # 6. build_asset_canvas_patch failure → placeholder fallback, no crash
    # -----------------------------------------------------------------------
    def test_build_patch_failure_uses_placeholder(self):
        state = {"tool_args": TOOL_ARGS_SAMPLE}
        placeholder = [{"op": "add_node", "node": {"id": "p1", "type": "text_input"}}]

        with patch(MOCK_TARGET_MATCH, return_value=DEFAULT_MATCH), \
             patch(MOCK_TARGET_PROMPTS, return_value=DEFAULT_PROMPTS), \
             patch(MOCK_TARGET_BUILD, side_effect=RuntimeError("canvas error")), \
             patch(MOCK_TARGET_PLACEHOLDER, return_value=placeholder) as mock_placeholder:
            result = execute_build_asset_canvas(state)

        assert "exec_patches" in result
        assert result["exec_patches"] == placeholder
        mock_placeholder.assert_called_once()

    # -----------------------------------------------------------------------
    # 7. Same-name deduplication: second occurrence gets _2 suffix
    # -----------------------------------------------------------------------
    def test_extract_entities_deduplicates_same_name(self):
        tool_args = {
            "characters": [
                {"name": "hero", "type": "character", "description": "first"},
                {"name": "hero", "type": "character", "description": "second"},
            ],
            "scenes": [],
        }
        state = {"tool_args": tool_args}

        with patch(MOCK_TARGET_MATCH, return_value={"matched": [], "unmatched": [], "candidates": []}) as mm, \
             patch(MOCK_TARGET_PROMPTS, return_value={}) as mp, \
             patch(MOCK_TARGET_BUILD, return_value=[]) as mb:
            execute_build_asset_canvas(state)

        # Verify via exec_data entities field
        result, *_ = self._run(state, match_result={"matched": [], "unmatched": [], "candidates": []}, prompts={}, patch_result=[])
        enriched = result["exec_data"]["entities"]
        entity_ids = [e["entity_id"] for e in enriched]
        # First occurrence: character_hero, second: character_hero_2
        assert "character_hero" in entity_ids
        assert "character_hero_2" in entity_ids

    # -----------------------------------------------------------------------
    # 8. Empty tool_args → no crash, exec_patches is a list
    # -----------------------------------------------------------------------
    def test_empty_tool_args(self):
        state = {"tool_args": {}}
        with patch(MOCK_TARGET_MATCH, return_value={"matched": [], "unmatched": [], "candidates": []}), \
             patch(MOCK_TARGET_PROMPTS, return_value={}), \
             patch(MOCK_TARGET_BUILD, return_value=[]):
            result = execute_build_asset_canvas(state)

        assert "exec_patches" in result
        assert isinstance(result["exec_patches"], list)

    # -----------------------------------------------------------------------
    # Bonus: state is threaded through (other keys preserved)
    # -----------------------------------------------------------------------
    def test_state_passthrough(self):
        state = {"tool_args": TOOL_ARGS_SAMPLE, "session_id": "s123", "user_id": "u1"}
        result, *_ = self._run(state)
        assert result.get("session_id") == "s123"
        assert result.get("user_id") == "u1"

    # -----------------------------------------------------------------------
    # Bonus: exec_data counts correct when match returns some matched
    # -----------------------------------------------------------------------
    def test_exec_data_counts_with_partial_match(self):
        state = {"tool_args": TOOL_ARGS_SAMPLE}
        match_result = {
            "matched": [
                {"entity_id": "character_辰辰", "name": "辰辰", "entity_type": "character",
                 "url": "http://x/a.png", "asset_id": "abc", "score": 3.0}
            ],
            "unmatched": [
                {"entity_id": "prop_玉佩", "name": "玉佩", "entity_type": "prop", "description": ""},
            ],
            "candidates": [
                {"entity_id": "scene_庭院", "name": "庭院", "entity_type": "scene",
                 "url": "http://x/b.png", "score": 0.7, "reason": "partial"}
            ],
        }
        result, *_ = self._run(state, match_result=match_result)
        ed = result["exec_data"]
        assert ed["matched_count"] == 1
        assert ed["missing_count"] == 1
        assert ed["candidate_count"] == 1
        assert ed["patch_count"] == len(FAKE_PATCH)
