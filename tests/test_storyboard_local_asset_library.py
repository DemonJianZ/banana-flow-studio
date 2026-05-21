"""Tests for LAB-1: local_asset_library.py — scanner and name extractors."""
from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path

ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
BANANAFLOW_DIR = os.path.join(ROOT_DIR, "bananaflow")
if BANANAFLOW_DIR not in sys.path:
    sys.path.insert(0, BANANAFLOW_DIR)

from bananaflow.agent_v2.storyboard.local_asset_library import (
    _extract_name_three_view,
    _extract_name_voice,
    _get_preview_images,
    scan_local_assets,
)


def _make_asset_tree(tmp: Path) -> None:
    """Create a minimal main_assets structure under tmp."""
    (tmp / "人物").mkdir()
    (tmp / "人物" / "龙女三视图.png").write_bytes(b"")
    (tmp / "人物" / "阿巳三视图.png").write_bytes(b"")
    (tmp / "人物" / "Thumbs.db").write_bytes(b"")

    (tmp / "音色").mkdir()
    (tmp / "音色" / "龙女音色短 3s.mp3").write_bytes(b"")
    (tmp / "音色" / "阿巳音频 短 6s.mp3").write_bytes(b"")
    (tmp / "音色" / "小鲤音色.mp3").write_bytes(b"")
    (tmp / "音色" / "小鲤音色短.mp3").write_bytes(b"")

    (tmp / "场景").mkdir()
    scene1 = tmp / "场景" / "阿巳庭院"
    scene1.mkdir()
    for i in range(5):
        (scene1 / f"{i+1}.png").write_bytes(b"")
    (scene1 / "Thumbs.db").write_bytes(b"")
    scene2 = tmp / "场景" / "龙女波澜场景汇总"
    scene2.mkdir()
    (scene2 / "1.png").write_bytes(b"")


class TestExtractNameThreeView(unittest.TestCase):
    def test_long_char_name(self):
        self.assertEqual(_extract_name_three_view("龙女三视图"), "龙女")

    def test_single_char_name(self):
        self.assertEqual(_extract_name_three_view("一禅三视图"), "一禅")

    def test_three_char_name(self):
        self.assertEqual(_extract_name_three_view("阿巳三视图"), "阿巳")

    def test_琥珀(self):
        self.assertEqual(_extract_name_three_view("琥珀三视图"), "琥珀")

    def test_秋水(self):
        self.assertEqual(_extract_name_three_view("秋水三视图"), "秋水")


class TestExtractNameVoice(unittest.TestCase):
    def test_龙女_short(self):
        self.assertEqual(_extract_name_voice("龙女音色短 3s"), "龙女")

    def test_阿巳_audio(self):
        # 阿巳音频 短 6s — uses 音频 marker
        self.assertEqual(_extract_name_voice("阿巳音频 短 6s"), "阿巳")

    def test_琥珀(self):
        self.assertEqual(_extract_name_voice("琥珀音色短 8s"), "琥珀")

    def test_一禅_no_space(self):
        self.assertEqual(_extract_name_voice("一禅音色4s"), "一禅")

    def test_小鲤_long(self):
        self.assertEqual(_extract_name_voice("小鲤音色"), "小鲤")

    def test_小鲤_short(self):
        self.assertEqual(_extract_name_voice("小鲤音色短"), "小鲤")

    def test_秋水(self):
        self.assertEqual(_extract_name_voice("秋水音色4s"), "秋水")


class TestGetPreviewImages(unittest.TestCase):
    def test_capped_at_3(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td)
            for i in range(5):
                (p / f"{i+1}.png").write_bytes(b"")
            imgs = _get_preview_images(p)
            self.assertEqual(len(imgs), 3)

    def test_thumbs_db_excluded(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td)
            (p / "1.png").write_bytes(b"")
            (p / "Thumbs.db").write_bytes(b"")
            imgs = _get_preview_images(p)
            names = [f.name for f in imgs]
            self.assertNotIn("Thumbs.db", names)
            self.assertIn("1.png", names)

    def test_non_image_excluded(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td)
            (p / "1.png").write_bytes(b"")
            (p / "notes.txt").write_bytes(b"")
            imgs = _get_preview_images(p)
            self.assertEqual(len(imgs), 1)


class TestScanLocalAssets(unittest.TestCase):

    def test_scan_returns_all_characters(self):
        with tempfile.TemporaryDirectory() as td:
            _make_asset_tree(Path(td))
            manifest = scan_local_assets(td)
        names = {r.name for r in manifest.characters}
        self.assertIn("龙女", names)
        self.assertIn("阿巳", names)
        self.assertIn("小鲤", names)

    def test_scan_three_view_path_set(self):
        with tempfile.TemporaryDirectory() as td:
            _make_asset_tree(Path(td))
            manifest = scan_local_assets(td)
        龙女 = next(r for r in manifest.characters if r.name == "龙女")
        self.assertIsNotNone(龙女.three_view_path)
        self.assertIn("龙女三视图.png", 龙女.three_view_path)
        self.assertIsNotNone(龙女.three_view_url)
        self.assertIn("/main_assets/", 龙女.three_view_url)

    def test_scan_voice_merged_into_character(self):
        with tempfile.TemporaryDirectory() as td:
            _make_asset_tree(Path(td))
            manifest = scan_local_assets(td)
        龙女 = next(r for r in manifest.characters if r.name == "龙女")
        self.assertIsNotNone(龙女.voice_path)
        self.assertIn("龙女音色短", 龙女.voice_path)

    def test_scan_multiple_voices_prefers_short(self):
        with tempfile.TemporaryDirectory() as td:
            _make_asset_tree(Path(td))
            manifest = scan_local_assets(td)
        小鲤 = next(r for r in manifest.characters if r.name == "小鲤")
        self.assertIsNotNone(小鲤.voice_path)
        # Should select the "短" version
        self.assertIn("短", Path(小鲤.voice_path).stem)

    def test_scan_returns_scene_folders(self):
        with tempfile.TemporaryDirectory() as td:
            _make_asset_tree(Path(td))
            manifest = scan_local_assets(td)
        folder_names = {s.folder_name for s in manifest.scenes}
        self.assertIn("阿巳庭院", folder_names)
        self.assertIn("龙女波澜场景汇总", folder_names)

    def test_scene_previews_capped_at_3_no_thumbsdb(self):
        with tempfile.TemporaryDirectory() as td:
            _make_asset_tree(Path(td))
            manifest = scan_local_assets(td)
        庭院 = next(s for s in manifest.scenes if s.folder_name == "阿巳庭院")
        self.assertLessEqual(len(庭院.preview_paths), 3)
        self.assertFalse(any("Thumbs.db" in p for p in 庭院.preview_paths))

    def test_scan_missing_root_returns_warnings_no_exception(self):
        manifest = scan_local_assets("/nonexistent/path/abc123")
        self.assertGreater(len(manifest.warnings), 0)
        self.assertEqual(manifest.characters, [])
        self.assertEqual(manifest.scenes, [])

    def test_scan_missing_subdir_returns_partial_manifest(self):
        with tempfile.TemporaryDirectory() as td:
            # Only create 人物/, skip 音色/ and 场景/
            (Path(td) / "人物").mkdir()
            (Path(td) / "人物" / "龙女三视图.png").write_bytes(b"")
            manifest = scan_local_assets(td)
        # Characters still found even though voice/scene dirs are missing
        self.assertTrue(any(r.name == "龙女" for r in manifest.characters))
        # Warnings should mention missing dirs
        warning_text = " ".join(manifest.warnings)
        self.assertIn("音色", warning_text)
        self.assertIn("场景", warning_text)

    def test_thumbs_db_not_included_as_character(self):
        """Thumbs.db in 人物/ must not be treated as a character asset."""
        with tempfile.TemporaryDirectory() as td:
            _make_asset_tree(Path(td))
            manifest = scan_local_assets(td)
        names = {r.name for r in manifest.characters}
        self.assertNotIn("Thumbs", names)
        self.assertNotIn("", names)

    def test_scene_folder_path_is_relative(self):
        with tempfile.TemporaryDirectory() as td:
            _make_asset_tree(Path(td))
            manifest = scan_local_assets(td)
        庭院 = next(s for s in manifest.scenes if s.folder_name == "阿巳庭院")
        self.assertTrue(庭院.folder_path.startswith("场景/"))


if __name__ == "__main__":
    unittest.main()
