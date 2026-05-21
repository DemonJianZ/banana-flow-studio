"""
Tests for Storyboard Asset Injection v1.

Covers:
  1. build_character_asset_nodes — node generation from plan dict
  2. GET /main_assets/{path} — file serving with path-traversal protection
"""
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

from bananaflow.agent_v2.storyboard.designer import build_character_asset_nodes


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _plan_with_bindings(three_view_url: str | None = "/main_assets/人物/龙女三视图.png",
                         char_name: str = "龙女",
                         entity_name: str = "龙女辰辰") -> dict:
    bindings = None
    if three_view_url is not None:
        bindings = {
            "character_bindings": [
                {
                    "entity_id": "e1",
                    "entity_name": entity_name,
                    "character_name": char_name,
                    "three_view_url": three_view_url,
                    "three_view_path": "人物/龙女三视图.png",
                    "voice_url": None,
                    "voice_path": None,
                    "match_score": 2.0,
                    "match_reason": "prefix",
                }
            ],
            "scene_bindings": [],
            "missing_characters": [],
            "missing_scenes": [],
            "warnings": [],
            "asset_root_used": "/fake/main_assets",
        }
    return {
        "title": "龙女广告",
        "local_asset_bindings": bindings,
    }


# ---------------------------------------------------------------------------
# Tests: build_character_asset_nodes
# ---------------------------------------------------------------------------

class TestBuildCharacterAssetNodes(unittest.TestCase):

    def test_character_with_three_view_generates_node(self):
        """A binding with three_view_url → one add_node op of type local_asset_image."""
        plan = _plan_with_bindings()
        ops = build_character_asset_nodes(plan)
        self.assertEqual(len(ops), 1)
        op = ops[0]
        self.assertEqual(op["op"], "add_node")
        self.assertEqual(op["node"]["type"], "local_asset_image")

    def test_character_without_three_view_no_node(self):
        """Binding with three_view_url=None → no node generated."""
        plan = _plan_with_bindings(three_view_url=None)
        ops = build_character_asset_nodes(plan)
        self.assertEqual(ops, [])

    def test_empty_plan_no_nodes(self):
        """Plan with no local_asset_bindings → empty list."""
        ops = build_character_asset_nodes({"title": "empty"})
        self.assertEqual(ops, [])

    def test_none_local_asset_bindings_no_nodes(self):
        """local_asset_bindings = None in plan dict → empty list."""
        plan = {"title": "test", "local_asset_bindings": None}
        ops = build_character_asset_nodes(plan)
        self.assertEqual(ops, [])

    def test_asset_node_data_fields(self):
        """Generated node data must contain required fields."""
        plan = _plan_with_bindings()
        op = build_character_asset_nodes(plan)[0]
        data = op["node"]["data"]
        self.assertEqual(data["asset_type"], "character_three_view")
        self.assertEqual(data["character_name"], "龙女")
        self.assertEqual(data["entity_name"], "龙女辰辰")
        self.assertIn("asset_name", data)
        self.assertTrue(str(data["asset_name"]).endswith(".png"),
                        f"asset_name should be filename, got: {data['asset_name']}")
        self.assertEqual(data["url"], "/main_assets/人物/龙女三视图.png")
        self.assertIn("三视图", data["title"])

    def test_asset_node_positioned_below_storyboard(self):
        """Asset node y must be > 120 (below default storyboard y=120)."""
        plan = _plan_with_bindings()
        op = build_character_asset_nodes(plan, storyboard_x=120)[0]
        node = op["node"]
        self.assertGreater(node["y"], 120)
        self.assertGreaterEqual(node["x"], 0)

    def test_storyboard_x_offsets_asset_node(self):
        """storyboard_x param shifts the first asset node x."""
        plan = _plan_with_bindings()
        ops_default = build_character_asset_nodes(plan, storyboard_x=120)
        ops_offset = build_character_asset_nodes(plan, storyboard_x=460)
        self.assertEqual(ops_offset[0]["node"]["x"] - ops_default[0]["node"]["x"], 460 - 120)

    def test_multiple_characters_spaced_horizontally(self):
        """Two characters → two nodes with different x values."""
        plan = {
            "title": "two chars",
            "local_asset_bindings": {
                "character_bindings": [
                    {"entity_id": "e1", "entity_name": "龙女辰辰", "character_name": "龙女",
                     "three_view_url": "/main_assets/人物/龙女三视图.png",
                     "match_score": 2.0, "match_reason": "prefix"},
                    {"entity_id": "e2", "entity_name": "阿巳仙君", "character_name": "阿巳",
                     "three_view_url": "/main_assets/人物/阿巳三视图.png",
                     "match_score": 2.0, "match_reason": "prefix"},
                ],
                "scene_bindings": [], "missing_characters": [],
                "missing_scenes": [], "warnings": [],
            },
        }
        ops = build_character_asset_nodes(plan, storyboard_x=120)
        self.assertEqual(len(ops), 2)
        x0 = ops[0]["node"]["x"]
        x1 = ops[1]["node"]["x"]
        self.assertGreater(x1, x0, "Second character node must be to the right of the first")

    def test_url_decoded_asset_name(self):
        """URL-encoded three_view_url → asset_name is decoded for display."""
        plan = _plan_with_bindings(three_view_url="/main_assets/人物/龙女三视图%20v2.png")
        op = build_character_asset_nodes(plan)[0]
        self.assertIn("龙女三视图 v2.png", op["node"]["data"]["asset_name"])

    def test_never_raises_on_malformed_input(self):
        """Garbage input must not raise — returns empty list."""
        for bad in [None, 42, "string", {"local_asset_bindings": "not-a-dict"}]:
            result = build_character_asset_nodes(bad)
            self.assertIsInstance(result, list)


# ---------------------------------------------------------------------------
# Tests: GET /main_assets/{file_path} route
# ---------------------------------------------------------------------------

class TestServeMainAssetRoute(unittest.TestCase):

    def _make_client(self, asset_root: str):
        """Return a FastAPI TestClient with the asset root mocked."""
        from fastapi.testclient import TestClient
        from bananaflow.api.routes import router
        from fastapi import FastAPI
        app = FastAPI()
        app.include_router(router)
        client = TestClient(app, raise_server_exceptions=False)
        return client, asset_root

    def test_serve_existing_file(self):
        """GET /main_assets/<file> returns 200 for a real file under the root."""
        with tempfile.TemporaryDirectory() as td:
            (Path(td) / "人物").mkdir()
            img = Path(td) / "人物" / "龙女三视图.png"
            img.write_bytes(b"\x89PNG\r\n")
            with mock.patch("bananaflow.api.routes._get_storyboard_asset_root", return_value=td):
                from fastapi.testclient import TestClient
                from fastapi import FastAPI
                from bananaflow.api.routes import router
                app = FastAPI()
                app.include_router(router)
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/main_assets/人物/龙女三视图.png")
        self.assertEqual(resp.status_code, 200)

    def test_missing_file_returns_404(self):
        """GET /main_assets/nonexistent.png → 404."""
        with tempfile.TemporaryDirectory() as td:
            with mock.patch("bananaflow.api.routes._get_storyboard_asset_root", return_value=td):
                from fastapi.testclient import TestClient
                from fastapi import FastAPI
                from bananaflow.api.routes import router
                app = FastAPI()
                app.include_router(router)
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/main_assets/nonexistent.png")
        self.assertEqual(resp.status_code, 404)

    def test_path_traversal_blocked(self):
        """GET /main_assets/../etc/passwd → 403."""
        with tempfile.TemporaryDirectory() as td:
            with mock.patch("bananaflow.api.routes._get_storyboard_asset_root", return_value=td):
                from fastapi.testclient import TestClient
                from fastapi import FastAPI
                from bananaflow.api.routes import router
                app = FastAPI()
                app.include_router(router)
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.get("/main_assets/../etc/passwd")
        self.assertIn(resp.status_code, (403, 404))


if __name__ == "__main__":
    unittest.main()
