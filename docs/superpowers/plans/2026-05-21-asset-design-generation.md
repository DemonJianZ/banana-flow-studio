# Asset Design Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** For character/prop/scene entities not found in the local asset library, build a complete `text_input → processor → output` generation workflow on the canvas (instead of the current bare text placeholder), using LLM-generated type-specific design prompts.

**Architecture:** `execute_build_asset_canvas.py` orchestrates three steps: (1) unify entities with `entity_id` → (2) match against local library via `match_asset_entities()` → (3) call `generate_design_prompts()` for unmatched → (4) pass enriched entities to `build_asset_canvas_patch()` which builds matched nodes and generation chains. All LLM work is isolated in `asset_design_prompter.py`; `asset_canvas_builder.py` stays a pure canvas builder.

**Tech Stack:** Python 3.11, pytest, unittest.mock, LangGraph (existing), existing `_call_llm` from `llm_decomposer.py`

---

## File Map

| File | Change | Responsibility |
|---|---|---|
| `bananaflow/agent_v2/shot_workflow/asset_canvas_builder.py` | Modify | Add `make_entity_id()`, `match_asset_entities()`, update `build_asset_canvas_patch()` + `_build_group()`, add `_build_placeholder_asset_patch()` |
| `bananaflow/agent_v2/shot_workflow/asset_design_prompter.py` | Create | `resolve_asset_design_mode()`, fallback templates, `generate_design_prompts()` |
| `bananaflow/agent_v2/graph/nodes/execute_build_asset_canvas.py` | Modify | Orchestrate: extract entities → match → generate prompts → enrich → build patch |
| `tests/test_asset_canvas_builder_v2.py` | Create | Tests for `make_entity_id`, `match_asset_entities`, `build_asset_canvas_patch` |
| `tests/test_asset_design_prompter.py` | Create | Tests for `resolve_asset_design_mode`, `generate_design_prompts` |
| `tests/test_execute_build_asset_canvas_v2.py` | Create | Integration tests for the orchestration node |

---

## Task 1: `make_entity_id()` utility

**Files:**
- Modify: `bananaflow/agent_v2/shot_workflow/asset_canvas_builder.py`
- Create: `tests/test_asset_canvas_builder_v2.py`

- [ ] **Step 1: Create the test file with failing tests**

```python
# tests/test_asset_canvas_builder_v2.py
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
.venv/bin/python -m pytest tests/test_asset_canvas_builder_v2.py::TestMakeEntityId -v
```

Expected: `ImportError: cannot import name 'make_entity_id'`

- [ ] **Step 3: Add `make_entity_id()` to `asset_canvas_builder.py`**

Add after the existing imports at the top of `bananaflow/agent_v2/shot_workflow/asset_canvas_builder.py`:

```python
import re


def make_entity_id(entity_type: str, name: str, occurrence: int = 1) -> str:
    safe = re.sub(r'[\s/:\\|]', '_', str(name or "").strip())
    suffix = "" if occurrence == 1 else f"_{occurrence}"
    return f"{entity_type}_{safe}{suffix}"
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
.venv/bin/python -m pytest tests/test_asset_canvas_builder_v2.py::TestMakeEntityId -v
```

Expected: all 9 tests PASS

- [ ] **Step 5: Commit**

```bash
git add bananaflow/agent_v2/shot_workflow/asset_canvas_builder.py tests/test_asset_canvas_builder_v2.py
git commit -m "feat: add make_entity_id utility to asset_canvas_builder"
```

---

## Task 2: `match_asset_entities()` — unified asset matching

**Files:**
- Modify: `bananaflow/agent_v2/shot_workflow/asset_canvas_builder.py`
- Modify: `tests/test_asset_canvas_builder_v2.py`

- [ ] **Step 1: Add failing tests**

Append to `tests/test_asset_canvas_builder_v2.py`:

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
.venv/bin/python -m pytest tests/test_asset_canvas_builder_v2.py::TestMatchAssetEntities -v
```

Expected: `ImportError: cannot import name 'match_asset_entities'`

- [ ] **Step 3: Add `match_asset_entities()` to `asset_canvas_builder.py`**

Add after `make_entity_id()`. The existing `_match_assets()` and related helpers stay; `match_asset_entities()` calls them internally:

```python
import hashlib


def _make_asset_id(relative_path: str) -> str:
    return hashlib.md5(str(relative_path or "").encode()).hexdigest()[:12]


def match_asset_entities(entities: list[dict]) -> dict:
    """
    Unified asset matching. Routes by entity_type:
      character → name match against manifest.characters
      scene     → folder match against manifest.scenes
      prop      → Phase 0: always unmatched (no prop library)

    Returns {"matched": [...], "unmatched": [...], "candidates": [...]}
    Threshold: score >= 1.0 → matched, 0.5 <= score < 1.0 → candidate, else unmatched
    """
    try:
        from agent_v2.storyboard.local_asset_library import scan_local_assets
        manifest = scan_local_assets()
    except Exception:
        return {"matched": [], "unmatched": list(entities), "candidates": []}

    matched: list[dict] = []
    unmatched: list[dict] = []
    candidates: list[dict] = []

    for entity in entities:
        etype = str(entity.get("entity_type") or "").strip()
        name = str(entity.get("name") or "").strip()
        eid = str(entity.get("entity_id") or "").strip()

        if etype == "prop":
            unmatched.append(dict(entity))
            continue

        if etype == "character":
            best_score, best_rec = 0.0, None
            for rec in manifest.characters:
                s = _name_score(name, rec.name)
                if s > best_score and rec.three_view_url:
                    best_score = s
                    best_rec = rec
            if best_score >= 1.0 and best_rec:
                matched.append({
                    "entity_id": eid,
                    "name": name,
                    "entity_type": etype,
                    "description": entity.get("description") or "",
                    "asset_id": _make_asset_id(best_rec.three_view_path or best_rec.three_view_url or ""),
                    "url": best_rec.three_view_url,
                    "score": best_score,
                })
            elif best_score >= 0.5 and best_rec:
                candidates.append({
                    "entity_id": eid,
                    "name": name,
                    "entity_type": etype,
                    "description": entity.get("description") or "",
                    "url": best_rec.three_view_url,
                    "score": best_score,
                    "reason": "partial_name_match",
                })
            else:
                unmatched.append(dict(entity))
            continue

        if etype == "scene":
            active_chars: set[str] = set()
            location_texts = [name]
            best_score, best_rec, best_loc = 0.0, None, ""
            for loc in location_texts:
                for rec in manifest.scenes:
                    s = _scene_score(loc, rec.folder_name, active_chars)
                    if s > best_score:
                        best_score = s
                        best_rec = rec
                        best_loc = loc
            if best_score >= 1.0 and best_rec and best_rec.preview_urls:
                matched.append({
                    "entity_id": eid,
                    "name": name,
                    "entity_type": etype,
                    "description": entity.get("description") or "",
                    "asset_id": _make_asset_id(best_rec.folder_path or ""),
                    "url": best_rec.preview_urls[0],
                    "score": best_score,
                })
            elif best_score >= 0.5 and best_rec and best_rec.preview_urls:
                candidates.append({
                    "entity_id": eid,
                    "name": name,
                    "entity_type": etype,
                    "description": entity.get("description") or "",
                    "url": best_rec.preview_urls[0],
                    "score": best_score,
                    "reason": "partial_scene_match",
                })
            else:
                unmatched.append(dict(entity))
            continue

        # Unknown entity_type → unmatched
        unmatched.append(dict(entity))

    return {"matched": matched, "unmatched": unmatched, "candidates": candidates}
```

Note: `_name_score` and `_scene_score` already exist in `asset_canvas_builder.py` — reuse them.

- [ ] **Step 4: Run tests to verify they pass**

```bash
.venv/bin/python -m pytest tests/test_asset_canvas_builder_v2.py::TestMatchAssetEntities -v
```

Expected: all 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add bananaflow/agent_v2/shot_workflow/asset_canvas_builder.py tests/test_asset_canvas_builder_v2.py
git commit -m "feat: add match_asset_entities() unified asset matching"
```

---

## Task 3: `asset_design_prompter.py` — mode resolver, fallback templates, and `generate_design_prompts()`

**Files:**
- Create: `bananaflow/agent_v2/shot_workflow/asset_design_prompter.py`
- Create: `tests/test_asset_design_prompter.py`

- [ ] **Step 1: Create failing tests**

```python
# tests/test_asset_design_prompter.py
import os
import sys
import unittest
from unittest import mock

ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
PACKAGE_DIR = os.path.join(ROOT_DIR, "bananaflow")
if PACKAGE_DIR not in sys.path:
    sys.path.insert(0, PACKAGE_DIR)

from agent_v2.shot_workflow.asset_design_prompter import (
    resolve_asset_design_mode,
    generate_design_prompts,
)


class TestResolveAssetDesignMode(unittest.TestCase):

    def test_text2img_passthrough(self):
        self.assertEqual(resolve_asset_design_mode("text2img"), "text2img")

    def test_auto_becomes_text2img(self):
        self.assertEqual(resolve_asset_design_mode("auto"), "text2img")

    def test_local_text2img_passthrough(self):
        self.assertEqual(resolve_asset_design_mode("local_text2img"), "local_text2img")

    def test_comfyui_alias_becomes_local_text2img(self):
        self.assertEqual(resolve_asset_design_mode("comfyui"), "local_text2img")

    def test_local_alias_becomes_local_text2img(self):
        self.assertEqual(resolve_asset_design_mode("local"), "local_text2img")

    def test_multi_image_generate_downgraded(self):
        # missing assets have no reference image — must not use multi_image_generate
        self.assertEqual(resolve_asset_design_mode("multi_image_generate"), "text2img")

    def test_empty_string_becomes_text2img(self):
        self.assertEqual(resolve_asset_design_mode(""), "text2img")


class TestGenerateDesignPrompts(unittest.TestCase):

    def _entity(self, entity_id, name, entity_type, description=""):
        return {"entity_id": entity_id, "name": name, "entity_type": entity_type, "description": description}

    def test_llm_success_returns_prompts_with_source_llm(self):
        entities = [self._entity("character_辰辰", "辰辰", "character", "青色道袍")]
        llm_response = {"character_辰辰": "Three-view character design sheet of 辰辰"}
        with mock.patch("agent_v2.shot_workflow.asset_design_prompter._call_design_llm", return_value=llm_response):
            result = generate_design_prompts(entities)
        self.assertIn("character_辰辰", result)
        self.assertEqual(result["character_辰辰"]["source"], "llm")
        self.assertIn("Three-view", result["character_辰辰"]["prompt"])
        self.assertEqual(result["character_辰辰"]["entity_type"], "character")
        self.assertEqual(result["character_辰辰"]["warnings"], [])

    def test_llm_failure_all_entities_get_fallback(self):
        entities = [
            self._entity("character_辰辰", "辰辰", "character"),
            self._entity("scene_庭院", "庭院", "scene"),
        ]
        with mock.patch("agent_v2.shot_workflow.asset_design_prompter._call_design_llm", side_effect=Exception("timeout")):
            result = generate_design_prompts(entities)
        for eid in ("character_辰辰", "scene_庭院"):
            self.assertEqual(result[eid]["source"], "fallback")
            self.assertIn("llm_call_failed", result[eid]["warnings"])

    def test_llm_partial_response_missing_entity_gets_fallback(self):
        entities = [
            self._entity("character_辰辰", "辰辰", "character"),
            self._entity("prop_玉佩", "玉佩", "prop"),
        ]
        # LLM only returns one of the two
        llm_response = {"character_辰辰": "Three-view character design sheet"}
        with mock.patch("agent_v2.shot_workflow.asset_design_prompter._call_design_llm", return_value=llm_response):
            result = generate_design_prompts(entities)
        self.assertEqual(result["character_辰辰"]["source"], "llm")
        self.assertEqual(result["prop_玉佩"]["source"], "fallback")
        self.assertIn("llm_entity_missing_from_response", result["prop_玉佩"]["warnings"])

    def test_fallback_prompt_contains_name(self):
        entities = [self._entity("prop_玉佩", "玉佩", "prop", "白色圆形玉石")]
        with mock.patch("agent_v2.shot_workflow.asset_design_prompter._call_design_llm", side_effect=Exception("x")):
            result = generate_design_prompts(entities)
        self.assertIn("玉佩", result["prop_玉佩"]["prompt"])

    def test_character_fallback_mentions_three_view(self):
        entities = [self._entity("character_辰辰", "辰辰", "character")]
        with mock.patch("agent_v2.shot_workflow.asset_design_prompter._call_design_llm", side_effect=Exception("x")):
            result = generate_design_prompts(entities)
        self.assertIn("three-view", result["character_辰辰"]["prompt"].lower())

    def test_scene_fallback_mentions_environment(self):
        entities = [self._entity("scene_庭院", "庭院", "scene")]
        with mock.patch("agent_v2.shot_workflow.asset_design_prompter._call_design_llm", side_effect=Exception("x")):
            result = generate_design_prompts(entities)
        prompt = result["scene_庭院"]["prompt"].lower()
        self.assertTrue("environment" in prompt or "concept art" in prompt)

    def test_empty_entities_returns_empty_dict(self):
        result = generate_design_prompts([])
        self.assertEqual(result, {})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
.venv/bin/python -m pytest tests/test_asset_design_prompter.py -v
```

Expected: `ModuleNotFoundError: No module named 'agent_v2.shot_workflow.asset_design_prompter'`

- [ ] **Step 3: Create `asset_design_prompter.py`**

```python
# bananaflow/agent_v2/shot_workflow/asset_design_prompter.py
from __future__ import annotations

import json
from typing import Any

from .llm_decomposer import _call_llm, _parse_llm_json


_FALLBACK_TEMPLATES: dict[str, str] = {
    "character": (
        "Three-view character design sheet of {name}, front view, side view, back view, "
        "white background, full body illustration, clean lines, {description}"
    ),
    "prop": (
        "Product concept illustration of {name}, clean white background, "
        "studio lighting, multiple angles, detailed rendering, {description}"
    ),
    "scene": (
        "Environment concept art of {name}, establishing shot, wide angle, "
        "cinematic lighting, detailed background, {description}"
    ),
}


def resolve_asset_design_mode(mode_policy: str) -> str:
    p = str(mode_policy or "").strip().lower()
    if p in {"local", "comfyui", "local_text2img"}:
        return "local_text2img"
    return "text2img"


def _fallback_prompt(entity: dict) -> str:
    etype = str(entity.get("entity_type") or "character").strip()
    name = str(entity.get("name") or "").strip()
    desc = str(entity.get("description") or "").strip()
    template = _FALLBACK_TEMPLATES.get(etype, _FALLBACK_TEMPLATES["character"])
    return template.format(name=name, description=desc).strip(", ")


def _build_design_llm_prompt(entities: list[dict]) -> str:
    items = json.dumps(
        [{"entity_id": e.get("entity_id"), "name": e.get("name"),
          "entity_type": e.get("entity_type"), "description": e.get("description") or ""}
         for e in entities],
        ensure_ascii=False,
        indent=2,
    )
    return (
        "你是专业概念设计师。为下列实体生成英文图像生成提示词（设定图用途）。\n"
        "输出严格 JSON，key 为 entity_id，value 为英文提示词字符串（100-200词）。\n"
        "不要输出 markdown，不要解释。\n\n"
        "按类型要求：\n"
        "- character：三视图设计单（正/侧/背），白色背景，全身，线条清晰\n"
        "- prop：产品渲染，白色/纯色背景，工作室灯光，多角度\n"
        "- scene：环境概念图，全景，电影感\n\n"
        f"实体列表：\n{items}"
    )


def _call_design_llm(entities: list[dict], authorization: str = "") -> dict[str, str]:
    prompt = _build_design_llm_prompt(entities)
    raw = _call_llm(prompt, authorization=authorization)
    if isinstance(raw, dict):
        return {k: str(v) for k, v in raw.items() if isinstance(v, str) and v.strip()}
    return {}


def generate_design_prompts(
    entities: list[dict],
    authorization: str = "",
) -> dict[str, dict]:
    if not entities:
        return {}

    llm_map: dict[str, str] = {}
    llm_failed = False

    try:
        llm_map = _call_design_llm(entities, authorization=authorization)
    except Exception:
        llm_failed = True

    result: dict[str, dict] = {}
    for entity in entities:
        eid = str(entity.get("entity_id") or "").strip()
        if not eid:
            continue
        etype = str(entity.get("entity_type") or "character").strip()
        name = str(entity.get("name") or "").strip()

        if llm_failed:
            result[eid] = {
                "entity_id": eid,
                "name": name,
                "prompt": _fallback_prompt(entity),
                "source": "fallback",
                "entity_type": etype,
                "warnings": ["llm_call_failed"],
            }
        elif eid in llm_map:
            result[eid] = {
                "entity_id": eid,
                "name": name,
                "prompt": llm_map[eid],
                "source": "llm",
                "entity_type": etype,
                "warnings": [],
            }
        else:
            result[eid] = {
                "entity_id": eid,
                "name": name,
                "prompt": _fallback_prompt(entity),
                "source": "fallback",
                "entity_type": etype,
                "warnings": ["llm_entity_missing_from_response"],
            }

    return result
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
.venv/bin/python -m pytest tests/test_asset_design_prompter.py -v
```

Expected: all 9 tests PASS

- [ ] **Step 5: Commit**

```bash
git add bananaflow/agent_v2/shot_workflow/asset_design_prompter.py tests/test_asset_design_prompter.py
git commit -m "feat: add asset_design_prompter with LLM-based design prompt generation"
```

---

## Task 4: Update `build_asset_canvas_patch()` for enriched entities + generation chains

**Files:**
- Modify: `bananaflow/agent_v2/shot_workflow/asset_canvas_builder.py`
- Modify: `tests/test_asset_canvas_builder_v2.py`

- [ ] **Step 1: Add failing tests**

Append to `tests/test_asset_canvas_builder_v2.py`:

```python
from agent_v2.shot_workflow.asset_canvas_builder import build_asset_canvas_patch, _build_placeholder_asset_patch


class TestBuildAssetCanvasPatch(unittest.TestCase):

    def _matched_entity(self, name, etype="character"):
        return {
            "entity_id": f"{etype}_{name}",
            "name": name,
            "entity_type": etype,
            "description": "",
            "asset_status": "matched",
            "matched_url": f"/main_assets/人物/{name}三视图.png",
            "asset_id": "abc123",
            "match_score": 3.0,
            "design_prompt": None,
            "design_prompt_source": None,
            "design_prompt_warnings": [],
        }

    def _missing_entity(self, name, etype="character", prompt="A design prompt"):
        return {
            "entity_id": f"{etype}_{name}",
            "name": name,
            "entity_type": etype,
            "description": "some description",
            "asset_status": "missing",
            "matched_url": None,
            "asset_id": None,
            "match_score": None,
            "design_prompt": prompt,
            "design_prompt_source": "llm",
            "design_prompt_warnings": [],
        }

    def _get_nodes(self, patch):
        return [op["node"] for op in patch if op.get("op") == "add_node"]

    def _get_connections(self, patch):
        return [op["connection"] for op in patch if op.get("op") == "add_connection"]

    def test_matched_entity_creates_input_node(self):
        entities = [self._matched_entity("龙女")]
        patch = build_asset_canvas_patch(entities)
        nodes = self._get_nodes(patch)
        input_nodes = [n for n in nodes if n["type"] == "input"]
        self.assertEqual(len(input_nodes), 1)
        self.assertIn("/main_assets", input_nodes[0]["data"]["images"][0])

    def test_missing_entity_creates_three_node_chain(self):
        entities = [self._missing_entity("辰辰")]
        patch = build_asset_canvas_patch(entities)
        nodes = self._get_nodes(patch)
        node_types = [n["type"] for n in nodes if n.get("type") in {"text_input", "processor", "output"}]
        self.assertIn("text_input", node_types)
        self.assertIn("processor", node_types)
        self.assertIn("output", node_types)

    def test_missing_entity_processor_has_prompt(self):
        entities = [self._missing_entity("辰辰", prompt="Three-view design of 辰辰")]
        patch = build_asset_canvas_patch(entities)
        nodes = self._get_nodes(patch)
        processors = [n for n in nodes if n["type"] == "processor"]
        self.assertEqual(len(processors), 1)
        self.assertEqual(processors[0]["data"]["prompt"], "Three-view design of 辰辰")

    def test_missing_entity_processor_workflow_role(self):
        entities = [self._missing_entity("辰辰")]
        patch = build_asset_canvas_patch(entities)
        nodes = self._get_nodes(patch)
        proc = next(n for n in nodes if n["type"] == "processor")
        self.assertEqual(proc["data"]["workflow_role"], "asset_design_generation")

    def test_missing_entity_text_input_has_entity_metadata(self):
        entities = [self._missing_entity("辰辰", etype="character")]
        patch = build_asset_canvas_patch(entities)
        nodes = self._get_nodes(patch)
        text_node = next(n for n in nodes if n["type"] == "text_input")
        data = text_node["data"]
        self.assertEqual(data["entity_id"], "character_辰辰")
        self.assertEqual(data["entity_type"], "character")
        self.assertEqual(data["asset_status"], "missing")
        self.assertEqual(data["workflow_role"], "asset_design_generation")

    def test_missing_entity_has_connections(self):
        entities = [self._missing_entity("辰辰")]
        patch = build_asset_canvas_patch(entities)
        connections = self._get_connections(patch)
        self.assertGreaterEqual(len(connections), 2)  # text→proc, proc→out

    def test_candidate_entity_treated_as_missing(self):
        entity = self._missing_entity("辰辰")
        entity["asset_status"] = "candidate"
        patch = build_asset_canvas_patch([entity])
        nodes = self._get_nodes(patch)
        node_types = [n["type"] for n in nodes if n["type"] in {"text_input", "processor", "output"}]
        self.assertIn("processor", node_types)

    def test_mixed_matched_and_missing(self):
        entities = [self._matched_entity("龙女"), self._missing_entity("辰辰")]
        patch = build_asset_canvas_patch(entities)
        nodes = self._get_nodes(patch)
        input_nodes = [n for n in nodes if n["type"] == "input"]
        proc_nodes = [n for n in nodes if n["type"] == "processor"]
        self.assertEqual(len(input_nodes), 1)
        self.assertEqual(len(proc_nodes), 1)

    def test_mode_policy_local_sets_local_text2img(self):
        entities = [self._missing_entity("辰辰")]
        patch = build_asset_canvas_patch(entities, mode_policy="local_text2img")
        nodes = self._get_nodes(patch)
        proc = next(n for n in nodes if n["type"] == "processor")
        self.assertEqual(proc["data"]["mode"], "local_text2img")

    def test_mode_policy_multi_image_downgraded_to_text2img(self):
        entities = [self._missing_entity("辰辰")]
        patch = build_asset_canvas_patch(entities, mode_policy="multi_image_generate")
        nodes = self._get_nodes(patch)
        proc = next(n for n in nodes if n["type"] == "processor")
        self.assertEqual(proc["data"]["mode"], "text2img")


class TestBuildPlaceholderAssetPatch(unittest.TestCase):

    def test_creates_text_input_per_entity(self):
        entities = [
            {"entity_id": "character_辰辰", "name": "辰辰", "entity_type": "character",
             "description": "", "asset_status": "missing"},
            {"entity_id": "scene_庭院", "name": "庭院", "entity_type": "scene",
             "description": "", "asset_status": "missing"},
        ]
        patch = _build_placeholder_asset_patch(entities, current_nodes=[])
        nodes = [op["node"] for op in patch if op.get("op") == "add_node" and op["node"]["type"] == "text_input"]
        self.assertEqual(len(nodes), 2)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
.venv/bin/python -m pytest tests/test_asset_canvas_builder_v2.py::TestBuildAssetCanvasPatch tests/test_asset_canvas_builder_v2.py::TestBuildPlaceholderAssetPatch -v
```

Expected: `ImportError: cannot import name 'build_asset_canvas_patch'` (old signature) or assertion failures

- [ ] **Step 3: Rewrite `build_asset_canvas_patch()` and `_build_group()` in `asset_canvas_builder.py`**

Replace the existing `_build_group` and `build_asset_canvas_patch` functions with the new versions. Keep all existing helper functions (`_new_id`, `_origin`, `_name_score`, `_scene_score`, etc.) intact.

The new `_build_group`:

```python
def _build_group(
    entities: list[dict],
    group_prefix: str,
    title: str,
    base_x: int,
    base_y: int,
    *,
    entity_kind: str,
    mode_policy: str = "text2img",
) -> tuple[list[dict], int, list[str]]:
    """Return (patches, total_height, selected_ids)."""
    from .asset_design_prompter import resolve_asset_design_mode
    from core.config import MODEL_COMFYUI_IMAGE_Z_IMAGE_TURBO

    if not entities:
        return [], 0, []

    patch: list[dict] = []
    selected_ids: list[str] = []

    matched = [e for e in entities if e.get("asset_status") == "matched"]
    to_generate = [e for e in entities if e.get("asset_status") != "matched"]

    # Layout: matched in grid, to_generate in rows
    n_matched = len(matched)
    n_gen = len(to_generate)
    row_h = _ROW_H_CHAR if entity_kind == "character" else _ROW_H_SCENE
    n_cols = min(n_matched, _MAX_COLS) if n_matched else 0
    n_rows_matched = math.ceil(n_matched / _MAX_COLS) if n_matched else 0
    grid_h = n_rows_matched * row_h if n_matched else 0
    gen_h = n_gen * row_h if n_gen else 0
    total_inner_h = grid_h + (_GROUP_GAP if n_matched and n_gen else 0) + gen_h

    # Group container width: wide enough for generation chains (3 nodes × 360px) if needed
    grid_w = max(n_cols, 1) * _COL_W if n_matched else 0
    gen_chain_w = 720 + 280  # text_input(280) + proc(280) at x+360 + out(280) at x+720
    group_inner_w = max(grid_w, gen_chain_w if n_gen else 0)
    group_w = _PAD * 2 + group_inner_w
    group_h = _PAD * 2 + total_inner_h

    group_id = _new_id(group_prefix)
    patch.append({
        "op": "add_node",
        "node": {
            "id": group_id,
            "type": "group_container",
            "x": base_x - _PAD,
            "y": base_y - _PAD,
            "data": {"title": title, "width": group_w, "height": group_h},
        },
    })

    current_y = base_y

    # --- Matched entities: input nodes in grid ---
    for i, entity in enumerate(matched):
        col_idx = i % _MAX_COLS
        row_idx = i // _MAX_COLS
        node_x = base_x + col_idx * _COL_W
        node_y = current_y + row_idx * row_h
        name = str(entity.get("name") or "").strip()
        label = f"{name} 设定图" if entity_kind == "character" else f"{name} 场景图"
        node_id = _new_id(f"{group_prefix}_r{i + 1}_ref")
        patch.append({
            "op": "add_node",
            "node": {
                "id": node_id,
                "type": "input",
                "x": node_x,
                "y": node_y,
                "data": {
                    "images": [entity["matched_url"]],
                    "mediaKind": "image",
                    "title": label,
                },
            },
        })
        selected_ids.append(node_id)

    if n_matched:
        current_y += grid_h + (_GROUP_GAP if n_gen else 0)

    # --- To-generate entities: text_input → processor → output ---
    design_mode = resolve_asset_design_mode(mode_policy)
    try:
        from core.config import MODEL_COMFYUI_IMAGE_Z_IMAGE_TURBO as _COMFYUI_MODEL
    except ImportError:
        _COMFYUI_MODEL = ""

    for i, entity in enumerate(to_generate):
        name = str(entity.get("name") or "").strip()
        etype = str(entity.get("entity_type") or entity_kind).strip()
        eid = str(entity.get("entity_id") or "").strip()
        design_prompt = str(entity.get("design_prompt") or name).strip()
        prompt_source = str(entity.get("design_prompt_source") or "fallback")
        pfx = f"{group_prefix}_g{i + 1}"
        node_y = current_y + i * row_h

        # text_input node
        text_id = _new_id(f"{pfx}_txt")
        patch.append({
            "op": "add_node",
            "node": {
                "id": text_id,
                "type": "text_input",
                "x": base_x,
                "y": node_y,
                "data": {
                    "text": design_prompt,
                    "title": f"{name} 设定图",
                    "entity_id": eid,
                    "entity_name": name,
                    "entity_type": etype,
                    "description": str(entity.get("description") or ""),
                    "asset_status": str(entity.get("asset_status") or "missing"),
                    "design_prompt_source": prompt_source,
                    "workflow_role": "asset_design_generation",
                },
            },
        })
        selected_ids.append(text_id)

        # processor node
        proc_id = _new_id(f"{pfx}_gen")
        patch.append({
            "op": "add_node",
            "node": {
                "id": proc_id,
                "type": "processor",
                "x": base_x + 360,
                "y": node_y,
                "data": {
                    "mode": design_mode,
                    "prompt": design_prompt,
                    "model": _COMFYUI_MODEL if design_mode == "local_text2img" else "",
                    "workflow_role": "asset_design_generation",
                    "asset_status": str(entity.get("asset_status") or "missing"),
                    "entity_id": eid,
                    "entity_name": name,
                    "entity_type": etype,
                    "templates": {"size": "1k"},
                    "batchSize": 1,
                    "status": "idle",
                },
            },
        })
        selected_ids.append(proc_id)

        # output node
        out_id = _new_id(f"{pfx}_out")
        patch.append({
            "op": "add_node",
            "node": {
                "id": out_id,
                "type": "output",
                "x": base_x + 720,
                "y": node_y,
                "data": {"images": [], "label": f"{name} 设定图"},
            },
        })
        selected_ids.append(out_id)

        patch.append({"op": "add_connection", "connection": {"id": _new_id("c"), "from": text_id, "to": proc_id}})
        patch.append({"op": "add_connection", "connection": {"id": _new_id("c"), "from": proc_id, "to": out_id}})

    return patch, group_h, selected_ids
```

The new `build_asset_canvas_patch`:

```python
def build_asset_canvas_patch(
    enriched_entities: list[dict],
    *,
    current_nodes: list[dict] | None = None,
    mode_policy: str = "text2img",
) -> list[dict]:
    base_x, base_y = _origin(current_nodes or [])
    patch: list[dict] = []
    all_selected: list[str] = []
    current_y = base_y

    char_prop = [e for e in enriched_entities if str(e.get("entity_type") or "") in {"character", "prop"}]
    scenes = [e for e in enriched_entities if str(e.get("entity_type") or "") == "scene"]

    if char_prop:
        p, h, sel = _build_group(
            char_prop, "chars", "角色与道具设定", base_x, current_y,
            entity_kind="character", mode_policy=mode_policy,
        )
        patch.extend(p)
        all_selected.extend(sel)
        current_y += h + _GROUP_GAP

    if scenes:
        p, _, sel = _build_group(
            scenes, "scenes", "场景设定", base_x, current_y,
            entity_kind="scene", mode_policy=mode_policy,
        )
        patch.extend(p)
        all_selected.extend(sel)

    if all_selected:
        patch.append({"op": "select_nodes", "ids": all_selected[:24]})
        patch.append({
            "op": "set_viewport",
            "viewport": {"x": max(0, base_x - 80), "y": max(0, base_y - 80), "zoom": 0.72},
        })

    return patch
```

Add the fallback function:

```python
def _build_placeholder_asset_patch(
    enriched_entities: list[dict],
    current_nodes: list[dict] | None = None,
) -> list[dict]:
    base_x, base_y = _origin(current_nodes or [])
    patch: list[dict] = []
    for i, entity in enumerate(enriched_entities):
        name = str(entity.get("name") or f"entity_{i}").strip()
        eid = str(entity.get("entity_id") or "").strip()
        node_id = _new_id("placeholder")
        patch.append({
            "op": "add_node",
            "node": {
                "id": node_id,
                "type": "text_input",
                "x": base_x,
                "y": base_y + i * 120,
                "data": {
                    "text": str(entity.get("description") or name),
                    "title": name,
                    "entity_id": eid,
                    "asset_status": str(entity.get("asset_status") or "missing"),
                },
            },
        })
    return patch
```

- [ ] **Step 4: Run tests**

```bash
.venv/bin/python -m pytest tests/test_asset_canvas_builder_v2.py -v
```

Expected: all tests PASS (Tasks 1, 2, and 4 combined)

- [ ] **Step 5: Commit**

```bash
git add bananaflow/agent_v2/shot_workflow/asset_canvas_builder.py tests/test_asset_canvas_builder_v2.py
git commit -m "feat: update build_asset_canvas_patch to support generation chains for missing entities"
```

---

## Task 5: Update `execute_build_asset_canvas.py` orchestration

**Files:**
- Modify: `bananaflow/agent_v2/graph/nodes/execute_build_asset_canvas.py`
- Create: `tests/test_execute_build_asset_canvas_v2.py`

- [ ] **Step 1: Create failing tests**

```python
# tests/test_execute_build_asset_canvas_v2.py
import os
import sys
import unittest
from unittest import mock

ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
PACKAGE_DIR = os.path.join(ROOT_DIR, "bananaflow")
if PACKAGE_DIR not in sys.path:
    sys.path.insert(0, PACKAGE_DIR)

from agent_v2.graph.nodes.execute_build_asset_canvas import execute_build_asset_canvas


def _make_state(characters, scenes, mode_policy="text2img", authorization=""):
    return {
        "tool_args": {
            "confirmed_extraction": {
                "characters": characters,
                "scenes": scenes,
            },
            "current_nodes": [],
            "mode_policy": mode_policy,
        },
        "authorization": authorization,
        "current_nodes": [],
        "trace": [],
    }


class TestExecuteBuildAssetCanvas(unittest.TestCase):

    def _patch_all(self, match_result=None, design_prompts=None):
        if match_result is None:
            match_result = {"matched": [], "unmatched": [], "candidates": []}
        if design_prompts is None:
            design_prompts = {}
        patches = [
            mock.patch(
                "agent_v2.graph.nodes.execute_build_asset_canvas.match_asset_entities",
                return_value=match_result,
            ),
            mock.patch(
                "agent_v2.graph.nodes.execute_build_asset_canvas.generate_design_prompts",
                return_value=design_prompts,
            ),
        ]
        return patches

    def test_returns_exec_patches(self):
        state = _make_state(
            characters=[{"name": "辰辰", "type": "character", "description": ""}],
            scenes=[],
        )
        match_result = {
            "matched": [],
            "unmatched": [{"entity_id": "character_辰辰", "name": "辰辰", "entity_type": "character", "description": ""}],
            "candidates": [],
        }
        design_prompts = {
            "character_辰辰": {"entity_id": "character_辰辰", "name": "辰辰", "prompt": "Design prompt", "source": "llm", "entity_type": "character", "warnings": []},
        }
        with mock.patch("agent_v2.graph.nodes.execute_build_asset_canvas.match_asset_entities", return_value=match_result):
            with mock.patch("agent_v2.graph.nodes.execute_build_asset_canvas.generate_design_prompts", return_value=design_prompts):
                result = execute_build_asset_canvas(state)
        self.assertIn("exec_patches", result)
        self.assertIsInstance(result["exec_patches"], list)

    def test_exec_data_contains_counts(self):
        state = _make_state(
            characters=[{"name": "龙女", "type": "character", "description": ""}],
            scenes=[{"name": "庭院", "atmosphere": ""}],
        )
        match_result = {
            "matched": [{"entity_id": "character_龙女", "name": "龙女", "entity_type": "character",
                         "url": "/img.png", "asset_id": "abc", "score": 3.0, "description": ""}],
            "unmatched": [{"entity_id": "scene_庭院", "name": "庭院", "entity_type": "scene", "description": ""}],
            "candidates": [],
        }
        design_prompts = {
            "scene_庭院": {"entity_id": "scene_庭院", "name": "庭院", "prompt": "Env art", "source": "llm", "entity_type": "scene", "warnings": []},
        }
        with mock.patch("agent_v2.graph.nodes.execute_build_asset_canvas.match_asset_entities", return_value=match_result):
            with mock.patch("agent_v2.graph.nodes.execute_build_asset_canvas.generate_design_prompts", return_value=design_prompts):
                result = execute_build_asset_canvas(state)
        data = result["exec_data"]
        self.assertEqual(data["matched_count"], 1)
        self.assertEqual(data["missing_count"], 1)

    def test_candidates_passed_to_generate_design_prompts(self):
        state = _make_state(
            characters=[{"name": "辰辰", "type": "character", "description": ""}],
            scenes=[],
        )
        match_result = {
            "matched": [],
            "unmatched": [],
            "candidates": [{"entity_id": "character_辰辰", "name": "辰辰", "entity_type": "character",
                            "url": "/img.png", "score": 0.7, "reason": "partial", "description": ""}],
        }
        captured_entities = []
        def capture_generate(entities, authorization=""):
            captured_entities.extend(entities)
            return {}
        with mock.patch("agent_v2.graph.nodes.execute_build_asset_canvas.match_asset_entities", return_value=match_result):
            with mock.patch("agent_v2.graph.nodes.execute_build_asset_canvas.generate_design_prompts", side_effect=capture_generate):
                execute_build_asset_canvas(state)
        entity_ids = [e["entity_id"] for e in captured_entities]
        self.assertIn("character_辰辰", entity_ids)

    def test_builder_failure_falls_back_to_placeholder(self):
        state = _make_state(
            characters=[{"name": "辰辰", "type": "character", "description": ""}],
            scenes=[],
        )
        match_result = {
            "matched": [],
            "unmatched": [{"entity_id": "character_辰辰", "name": "辰辰", "entity_type": "character", "description": ""}],
            "candidates": [],
        }
        design_prompts = {
            "character_辰辰": {"entity_id": "character_辰辰", "name": "辰辰", "prompt": "X", "source": "llm", "entity_type": "character", "warnings": []},
        }
        with mock.patch("agent_v2.graph.nodes.execute_build_asset_canvas.match_asset_entities", return_value=match_result):
            with mock.patch("agent_v2.graph.nodes.execute_build_asset_canvas.generate_design_prompts", return_value=design_prompts):
                with mock.patch("agent_v2.graph.nodes.execute_build_asset_canvas.build_asset_canvas_patch", side_effect=Exception("builder error")):
                    result = execute_build_asset_canvas(state)
        # Should not raise; should return a patch (from placeholder fallback)
        self.assertIn("exec_patches", result)
        self.assertIsInstance(result["exec_patches"], list)

    def test_prop_entities_included(self):
        state = _make_state(
            characters=[{"name": "玉佩", "type": "prop", "description": "白玉材质"}],
            scenes=[],
        )
        captured_entities = []
        def capture_match(entities):
            captured_entities.extend(entities)
            return {"matched": [], "unmatched": list(entities), "candidates": []}
        with mock.patch("agent_v2.graph.nodes.execute_build_asset_canvas.match_asset_entities", side_effect=capture_match):
            with mock.patch("agent_v2.graph.nodes.execute_build_asset_canvas.generate_design_prompts", return_value={}):
                execute_build_asset_canvas(state)
        entity_types = [e["entity_type"] for e in captured_entities]
        self.assertIn("prop", entity_types)

    def test_fallback_warnings_in_summary(self):
        state = _make_state(
            characters=[{"name": "辰辰", "type": "character", "description": ""}],
            scenes=[],
        )
        match_result = {
            "matched": [],
            "unmatched": [{"entity_id": "character_辰辰", "name": "辰辰", "entity_type": "character", "description": ""}],
            "candidates": [],
        }
        design_prompts = {
            "character_辰辰": {"entity_id": "character_辰辰", "name": "辰辰", "prompt": "X", "source": "fallback", "entity_type": "character", "warnings": ["llm_call_failed"]},
        }
        with mock.patch("agent_v2.graph.nodes.execute_build_asset_canvas.match_asset_entities", return_value=match_result):
            with mock.patch("agent_v2.graph.nodes.execute_build_asset_canvas.generate_design_prompts", return_value=design_prompts):
                result = execute_build_asset_canvas(state)
        # exec_data should record fallback count
        self.assertGreaterEqual(result["exec_data"].get("fallback_prompt_count", 0), 1)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
.venv/bin/python -m pytest tests/test_execute_build_asset_canvas_v2.py -v
```

Expected: failures (old `execute_build_asset_canvas` missing new imports/logic)

- [ ] **Step 3: Rewrite `execute_build_asset_canvas.py`**

```python
# bananaflow/agent_v2/graph/nodes/execute_build_asset_canvas.py
from __future__ import annotations

import re
from typing import Any

from agent_v2.shot_workflow.asset_canvas_builder import (
    build_asset_canvas_patch,
    match_asset_entities,
    make_entity_id,
    _build_placeholder_asset_patch,
)
from agent_v2.shot_workflow.asset_design_prompter import generate_design_prompts


def _safe_name(name: str) -> str:
    return re.sub(r'[\s/:\\|]', '_', str(name or "").strip())


def _extract_entities(confirmed: dict) -> list[dict]:
    entities: list[dict] = []
    name_counts: dict[str, int] = {}

    for raw in list(confirmed.get("characters") or []):
        name = str(raw.get("name") or "").strip()
        if not name:
            continue
        etype = str(raw.get("type") or "character").strip()
        if etype not in {"character", "prop"}:
            etype = "character"
        key = f"{etype}_{_safe_name(name)}"
        name_counts[key] = name_counts.get(key, 0) + 1
        eid = make_entity_id(etype, name, occurrence=name_counts[key])
        entities.append({
            "entity_id": eid,
            "name": name,
            "entity_type": etype,
            "description": str(raw.get("description") or "").strip(),
        })

    for raw in list(confirmed.get("scenes") or []):
        name = str(raw.get("name") or "").strip()
        if not name:
            continue
        key = f"scene_{_safe_name(name)}"
        name_counts[key] = name_counts.get(key, 0) + 1
        eid = make_entity_id("scene", name, occurrence=name_counts[key])
        entities.append({
            "entity_id": eid,
            "name": name,
            "entity_type": "scene",
            "description": str(raw.get("atmosphere") or "").strip(),
        })

    return entities


def _enrich_entities(
    entities: list[dict],
    match_result: dict,
    design_prompts: dict,
) -> list[dict]:
    matched_by_id = {m["entity_id"]: m for m in match_result.get("matched", [])}
    to_design_eids = {
        e["entity_id"]
        for e in match_result.get("unmatched", []) + match_result.get("candidates", [])
    }

    enriched: list[dict] = []
    for entity in entities:
        eid = entity["entity_id"]
        e = dict(entity)

        if eid in matched_by_id:
            m = matched_by_id[eid]
            e["asset_status"] = "matched"
            e["matched_url"] = m.get("url")
            e["asset_id"] = m.get("asset_id")
            e["match_score"] = m.get("score")
            e["design_prompt"] = None
            e["design_prompt_source"] = None
            e["design_prompt_warnings"] = []
        elif eid in to_design_eids:
            dp = design_prompts.get(eid) or {}
            # candidate → treated as missing in Phase 0
            status = "candidate" if eid in {c["entity_id"] for c in match_result.get("candidates", [])} else "missing"
            e["asset_status"] = status
            e["matched_url"] = None
            e["asset_id"] = None
            e["match_score"] = None
            e["design_prompt"] = dp.get("prompt") or entity.get("name") or ""
            e["design_prompt_source"] = dp.get("source") or "fallback"
            e["design_prompt_warnings"] = dp.get("warnings") or []
        else:
            e["asset_status"] = "missing"
            e["matched_url"] = None
            e["asset_id"] = None
            e["match_score"] = None
            e["design_prompt"] = entity.get("name") or ""
            e["design_prompt_source"] = "fallback"
            e["design_prompt_warnings"] = []

        enriched.append(e)
    return enriched


def execute_build_asset_canvas(state: dict) -> dict:
    tool_args = dict(state.get("tool_args") or {})
    confirmed = dict(tool_args.get("confirmed_extraction") or {})
    current_nodes = list(tool_args.get("current_nodes") or state.get("current_nodes") or [])
    mode_policy = str(tool_args.get("mode_policy") or "text2img").strip() or "text2img"
    authorization = str(state.get("authorization") or "").strip()

    # 1. Extract entities with entity_id
    entities = _extract_entities(confirmed)

    # 2. Match against local asset library
    try:
        match_result = match_asset_entities(entities)
    except Exception:
        match_result = {"matched": [], "unmatched": list(entities), "candidates": []}

    # 3. Generate design prompts for unmatched + candidates (Phase 0: candidates same as missing)
    entities_to_design = match_result["unmatched"] + match_result["candidates"]
    design_prompts = generate_design_prompts(entities_to_design, authorization=authorization)

    # 4. Enrich entities with match + prompt data
    enriched = _enrich_entities(entities, match_result, design_prompts)

    # 5. Build canvas patch (with fallback)
    try:
        patch = build_asset_canvas_patch(enriched, current_nodes=current_nodes, mode_policy=mode_policy)
    except Exception:
        patch = _build_placeholder_asset_patch(enriched, current_nodes=current_nodes)

    # 6. Compute summary stats
    matched_count = len(match_result["matched"])
    missing_count = len(match_result["unmatched"]) + len(match_result["candidates"])
    fallback_count = sum(1 for dp in design_prompts.values() if dp.get("source") == "fallback")

    parts = []
    if matched_count:
        parts.append(f"{matched_count} 个实体已匹配到参考图")
    if missing_count:
        parts.append(f"{missing_count} 个实体已生成设定图工作流，点击运行即可生成")
    if fallback_count:
        parts.append(f"（{fallback_count} 个提示词为模板兜底，建议确认后调整）")
    summary = "；".join(parts) or "画布已就绪。"

    return {
        "exec_response_text": summary,
        "exec_patches": patch,
        "exec_data": {
            "kind": "asset_canvas_built",
            "summary": summary,
            "matched_count": matched_count,
            "missing_count": missing_count,
            "fallback_prompt_count": fallback_count,
            "patch_count": len(patch),
        },
        "trace": list(state.get("trace") or []) + [
            {
                "type": "EXECUTE_BUILD_ASSET_CANVAS",
                "matched_count": matched_count,
                "missing_count": missing_count,
                "fallback_prompt_count": fallback_count,
                "patch_count": len(patch),
            }
        ],
    }
```

- [ ] **Step 4: Run tests**

```bash
.venv/bin/python -m pytest tests/test_execute_build_asset_canvas_v2.py -v
```

Expected: all 6 tests PASS

- [ ] **Step 5: Run full test suite**

```bash
.venv/bin/python -m pytest tests/ -v
```

Expected: all existing tests still PASS (no regressions)

- [ ] **Step 6: Commit**

```bash
git add bananaflow/agent_v2/graph/nodes/execute_build_asset_canvas.py tests/test_execute_build_asset_canvas_v2.py
git commit -m "feat: orchestrate asset design generation in execute_build_asset_canvas"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered by |
|---|---|
| `entity_id` stable generation with safe_name | Task 1 |
| `match_asset_entities()` unified, single entities param | Task 2 |
| prop → always unmatched (Phase 0) | Task 2 |
| candidates threshold 0.5-1.0 | Task 2 |
| `asset_id` from path hash | Task 2 |
| `resolve_asset_design_mode()` blocks `multi_image_generate` | Task 3 |
| LLM batch call + per-entity fallback | Task 3 |
| fallback templates by type | Task 3 |
| matched entity → input node | Task 4 |
| missing/candidate entity → 3-node chain | Task 4 |
| processor.data has `prompt` field | Task 4 |
| processor.data has `workflow_role: "asset_design_generation"` | Task 4 |
| text_input.data has entity metadata | Task 4 |
| `_build_placeholder_asset_patch()` fallback | Task 4 |
| candidates + unmatched both passed to `generate_design_prompts` | Task 5 |
| `_enrich_entities()` merges match + prompts → enriched | Task 5 |
| builder exception → placeholder fallback | Task 5 |
| fallback_prompt_count in exec_data | Task 5 |
| `mode_policy` extracted from tool_args | Task 5 |
| `authorization` from state | Task 5 |

All spec requirements covered. ✓
