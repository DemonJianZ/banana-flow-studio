"""
LAB-1 — Local asset manifest scanner.

Scans bananaflow/main_assets/ (or BANANAFLOW_MAIN_ASSETS_DIR) for three asset categories:
  人物/   — character three-view images  (*三视图.{jpg,png,...})
  场景/   — scene folders (each subdirectory is a scene set)
  音色/   — character voice samples (*音色*.mp3 / *音频*.mp3)

Usage:
    manifest = scan_local_assets()           # uses default root
    manifest = scan_local_assets(custom_path)

All errors are captured as warnings; the function never raises.
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional
from urllib.parse import quote

_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
_AUDIO_EXTS = {".mp3", ".wav", ".aac", ".ogg", ".m4a"}
_SKIP_NAMES = {"Thumbs.db", "thumbs.db", ".DS_Store"}

# Maximum preview images surfaced per scene folder
_MAX_PREVIEWS = 3


def get_main_assets_root() -> Path:
    """Return the main_assets directory path, respecting BANANAFLOW_MAIN_ASSETS_DIR env var."""
    env = os.getenv("BANANAFLOW_MAIN_ASSETS_DIR", "").strip()
    if env:
        return Path(env)
    # Default: {bananaflow_package}/main_assets
    return Path(__file__).parent.parent.parent / "main_assets"


# ---------------------------------------------------------------------------
# Data classes — internal manifest (not Pydantic, just dataclasses for speed)
# ---------------------------------------------------------------------------

@dataclass
class LocalCharacterRecord:
    """One character entry aggregated from 人物/ and 音色/ scans."""
    name: str                              # e.g. "龙女"
    three_view_path: Optional[str] = None  # relative: "人物/龙女三视图.png"
    three_view_url: Optional[str] = None   # "/main_assets/人物/龙女三视图.png"
    voice_path: Optional[str] = None       # relative: "音色/龙女音色短 3s.mp3"
    voice_url: Optional[str] = None        # "/main_assets/音色/龙女音色短%203s.mp3"


@dataclass
class LocalSceneRecord:
    """One scene folder entry from 场景/ scan."""
    folder_name: str                             # e.g. "阿巳庭院"
    folder_path: str                             # relative: "场景/阿巳庭院"
    preview_paths: List[str] = field(default_factory=list)  # up to 3 relative image paths
    preview_urls: List[str] = field(default_factory=list)   # served URLs


@dataclass
class LocalAssetManifest:
    """Top-level manifest returned by scan_local_assets()."""
    characters: List[LocalCharacterRecord] = field(default_factory=list)
    scenes: List[LocalSceneRecord] = field(default_factory=list)
    root: str = ""       # the asset_root that was scanned
    warnings: List[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Name extraction helpers
# ---------------------------------------------------------------------------

def _extract_name_three_view(stem: str) -> str:
    """'龙女三视图' → '龙女';  '一禅三视图' → '一禅'"""
    return stem.replace("三视图", "").strip()


def _extract_name_voice(stem: str) -> str:
    """
    Extract character name from voice filename stem.
    '龙女音色短 3s'  → '龙女'
    '阿巳音频 短 6s' → '阿巳'
    '琥珀音色短 8s'  → '琥珀'
    '一禅音色4s'     → '一禅'
    Strategy: split on first occurrence of '音色' or '音频', take everything before.
    """
    for marker in ("音色", "音频"):
        idx = stem.find(marker)
        if idx >= 0:
            return stem[:idx].strip()
    # Fallback: take the leading CJK run
    m = re.match(r"^([一-龥]+)", stem)
    return m.group(1) if m else stem.strip()


def _asset_url(relative_path: str) -> str:
    """Convert a relative asset path to a served URL.  Spaces → %20 etc."""
    parts = relative_path.split("/")
    encoded = "/".join(quote(p, safe="") for p in parts)
    return f"/main_assets/{encoded}"


def _select_voice_file(files: List[Path]) -> Path:
    """
    When multiple voice files exist for the same character, prefer:
    1. Files containing '短' (short sample)
    2. Then sort by stem length ascending (shorter name = cleaner label)
    """
    short = [f for f in files if "短" in f.stem]
    candidates = short if short else files
    return sorted(candidates, key=lambda f: (len(f.stem), f.stem))[0]


def _get_preview_images(folder: Path, max_count: int = _MAX_PREVIEWS) -> List[Path]:
    """Return up to max_count image files from a folder, sorted, skipping Thumbs.db etc."""
    images = sorted(
        f for f in folder.iterdir()
        if f.is_file()
        and f.suffix.lower() in _IMAGE_EXTS
        and f.name not in _SKIP_NAMES
        and not f.name.startswith(".")
    )
    return images[:max_count]


# ---------------------------------------------------------------------------
# Sub-scanners
# ---------------------------------------------------------------------------

def _scan_characters(root: Path, records: dict, warnings: List[str]) -> None:
    """Scan 人物/ and populate records[name] with three_view data."""
    char_dir = root / "人物"
    if not char_dir.is_dir():
        warnings.append(f"人物目录不存在: {char_dir}")
        return
    for f in char_dir.iterdir():
        if not f.is_file():
            continue
        if f.suffix.lower() not in _IMAGE_EXTS:
            continue
        if f.name in _SKIP_NAMES or f.name.startswith("."):
            continue
        if "三视图" not in f.stem:
            continue
        name = _extract_name_three_view(f.stem)
        if not name:
            continue
        rel = f"人物/{f.name}"
        rec = records.setdefault(name, LocalCharacterRecord(name=name))
        rec.three_view_path = rel
        rec.three_view_url = _asset_url(rel)


def _scan_voices(root: Path, records: dict, warnings: List[str]) -> None:
    """Scan 音色/ and populate records[name] with voice data."""
    voice_dir = root / "音色"
    if not voice_dir.is_dir():
        warnings.append(f"音色目录不存在: {voice_dir}")
        return
    # Group files by extracted character name
    groups: dict[str, list[Path]] = {}
    for f in voice_dir.iterdir():
        if not f.is_file():
            continue
        if f.suffix.lower() not in _AUDIO_EXTS:
            continue
        if f.name in _SKIP_NAMES or f.name.startswith("."):
            continue
        name = _extract_name_voice(f.stem)
        if not name:
            continue
        groups.setdefault(name, []).append(f)
    for name, files in groups.items():
        selected = _select_voice_file(files)
        rel = f"音色/{selected.name}"
        rec = records.setdefault(name, LocalCharacterRecord(name=name))
        rec.voice_path = rel
        rec.voice_url = _asset_url(rel)


def _scan_scenes(root: Path, warnings: List[str]) -> List[LocalSceneRecord]:
    """Scan 场景/ for scene records.

    Two kinds of entries are supported:
    - Subdirectory  (e.g. 场景/阿巳庭院/)  — folder with multiple preview images
    - Single image file (e.g. 场景/辰辰庭院.jpg) — treated as a one-image scene record

    When both a folder and a same-stem image file exist (e.g. 阿巳庭院/ and 阿巳庭院.png),
    the folder takes priority and the loose file is ignored.
    """
    scene_dir = root / "场景"
    if not scene_dir.is_dir():
        warnings.append(f"场景目录不存在: {scene_dir}")
        return []
    scenes: List[LocalSceneRecord] = []
    folder_stems: set = set()

    # Pass 1 — subdirectories
    for subdir in sorted(scene_dir.iterdir()):
        if not subdir.is_dir():
            continue
        if subdir.name in _SKIP_NAMES or subdir.name.startswith("."):
            continue
        folder_stems.add(subdir.name)
        folder_rel = f"场景/{subdir.name}"
        previews = _get_preview_images(subdir)
        preview_paths = [f"{folder_rel}/{p.name}" for p in previews]
        preview_urls = [_asset_url(pp) for pp in preview_paths]
        scenes.append(LocalSceneRecord(
            folder_name=subdir.name,
            folder_path=folder_rel,
            preview_paths=preview_paths,
            preview_urls=preview_urls,
        ))

    # Pass 2 — loose image files (skip if a same-stem folder already added)
    for image_file in sorted(scene_dir.iterdir()):
        if not image_file.is_file():
            continue
        if image_file.suffix.lower() not in _IMAGE_EXTS:
            continue
        if image_file.name in _SKIP_NAMES or image_file.name.startswith("."):
            continue
        stem = image_file.stem
        if stem in folder_stems:
            continue  # folder takes priority
        rel = f"场景/{image_file.name}"
        scenes.append(LocalSceneRecord(
            folder_name=stem,
            folder_path=rel,
            preview_paths=[rel],
            preview_urls=[_asset_url(rel)],
        ))

    return scenes


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def scan_local_assets(asset_root: "Path | str | None" = None) -> LocalAssetManifest:
    """
    Scan the main_assets directory and return a LocalAssetManifest.

    Never raises — all errors are captured in manifest.warnings.
    """
    warnings: List[str] = []
    if asset_root is None:
        asset_root = get_main_assets_root()
    root = Path(asset_root)

    if not root.exists():
        return LocalAssetManifest(
            root=str(root),
            warnings=[f"main_assets 目录不存在: {root}"],
        )
    if not root.is_dir():
        return LocalAssetManifest(
            root=str(root),
            warnings=[f"main_assets 路径不是目录: {root}"],
        )

    records: dict[str, LocalCharacterRecord] = {}

    try:
        _scan_characters(root, records, warnings)
    except Exception as exc:
        warnings.append(f"人物扫描失败: {exc}")

    try:
        _scan_voices(root, records, warnings)
    except Exception as exc:
        warnings.append(f"音色扫描失败: {exc}")

    scenes: List[LocalSceneRecord] = []
    try:
        scenes = _scan_scenes(root, warnings)
    except Exception as exc:
        warnings.append(f"场景扫描失败: {exc}")

    characters = sorted(records.values(), key=lambda r: r.name)
    return LocalAssetManifest(
        characters=characters,
        scenes=scenes,
        root=str(root),
        warnings=warnings,
    )
