from __future__ import annotations

import re
from typing import Any

from agent_v2.storyboard.local_asset_library import LocalAssetManifest, scan_local_assets
from .schemas import ShotSpec

_ALLOWED_MODES = {"text2img", "local_text2img", "multi_image_generate", "img2video"}


# ---------------------------------------------------------------------------
# Name-scoring helpers (simplified from storyboard/asset_binder.py)
# ---------------------------------------------------------------------------

def _name_score(query: str, target: str) -> float:
    q, t = query.strip(), target.strip()
    if not q or not t:
        return 0.0
    if q == t:
        return 3.0
    if q.startswith(t):
        return 2.0
    if t.startswith(q):
        return 1.5
    if t in q:
        return 1.0
    if q in t:
        return 0.5
    return 0.0


def _normalize_location(text: str) -> str:
    return re.sub(r"(?<=[一-鿿㐀-䶿])的(?=[一-鿿㐀-䶿])", "", str(text or ""))


def _cjk_tokens(text: str) -> set[str]:
    chars = re.findall(r"[一-鿿㐀-䶿]", text)
    tokens: set[str] = set()
    for n in (2, 3):
        for i in range(len(chars) - n + 1):
            tokens.add("".join(chars[i : i + n]))
    return tokens


def _scene_score(location_text: str, folder_name: str, active_char_names: set[str]) -> float:
    score = 0.0
    f, loc = folder_name.strip(), location_text.strip()
    if not f or not loc:
        return 0.0
    f_norm = _normalize_location(f)
    loc_norm = _normalize_location(loc)
    if f in loc or (f_norm and f_norm in loc_norm):
        score += 3.0
    elif loc in f or (loc_norm and loc_norm in f_norm):
        score += 2.0
    shared = _cjk_tokens(loc_norm) & _cjk_tokens(f_norm)
    score += len(shared) * 1.0
    for char_name in active_char_names:
        if char_name and char_name in f:
            score += 1.5
            break
    return score


# ---------------------------------------------------------------------------
# Per-shot matching
# ---------------------------------------------------------------------------

def _match_characters_for_shot(shot: ShotSpec, manifest: LocalAssetManifest) -> list[dict[str, Any]]:
    bindings: list[dict[str, Any]] = []
    for char_name in list(shot.get("characters") or []):
        best_score = 0.0
        best_rec = None
        for rec in manifest.characters:
            s = _name_score(char_name, rec.name)
            if s > best_score:
                best_score = s
                best_rec = rec
        if best_score >= 1.0 and best_rec is not None:
            bindings.append({
                "name": best_rec.name,
                "query_name": char_name,
                "three_view_url": best_rec.three_view_url,
                "voice_url": best_rec.voice_url,
                "score": best_score,
            })
    return bindings


def _match_scene_for_shot(
    shot: ShotSpec,
    manifest: LocalAssetManifest,
    active_char_names: set[str],
) -> dict[str, Any] | None:
    location_texts: list[str] = []
    if shot.get("scene"):
        location_texts.append(str(shot["scene"]))
    for loc in list(shot.get("locations") or []):
        if loc and loc not in location_texts:
            location_texts.append(loc)
    if not location_texts:
        return None

    best_score = 0.0
    best_rec = None
    best_loc = ""
    for loc_text in location_texts:
        for rec in manifest.scenes:
            s = _scene_score(loc_text, rec.folder_name, active_char_names)
            if s > best_score:
                best_score = s
                best_rec = rec
                best_loc = loc_text

    if best_score >= 1.0 and best_rec is not None:
        return {
            "folder_name": best_rec.folder_name,
            "preview_urls": list(best_rec.preview_urls),
            "matched_from": best_loc,
            "score": best_score,
        }
    return None


# ---------------------------------------------------------------------------
# Mode decision
# ---------------------------------------------------------------------------

def decide_mode(
    shot: ShotSpec,
    char_bindings: list[dict[str, Any]],
    mode_policy: str,
    selected_artifact: dict[str, Any] | None,
) -> str:
    policy = str(mode_policy or "auto").strip().lower()
    if policy in _ALLOWED_MODES:
        return policy

    if char_bindings and any(b.get("three_view_url") for b in char_bindings):
        return "multi_image_generate"

    if selected_artifact and selected_artifact.get("url"):
        return "multi_image_generate"

    if shot.get("needs_reference_image") or shot.get("reference_hint"):
        return "multi_image_generate"

    if policy in {"local", "comfyui", "local_text2img"}:
        return "local_text2img"

    return "text2img"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def bind_assets_to_shots(
    shots: list[ShotSpec],
    mode_policy: str = "auto",
    selected_artifact: dict[str, Any] | None = None,
) -> list[ShotSpec]:
    """
    Enriches each shot with asset_bindings and decides mode.
    Never raises — falls back to empty bindings on error.
    """
    try:
        manifest = scan_local_assets()
    except Exception:
        manifest = LocalAssetManifest()

    result: list[ShotSpec] = []
    for shot in shots:
        shot = dict(shot)
        try:
            char_bindings = _match_characters_for_shot(shot, manifest)
            active_char_names = {b["name"] for b in char_bindings}
            scene_binding = _match_scene_for_shot(shot, manifest, active_char_names)
            shot["asset_bindings"] = {
                "character_bindings": char_bindings,
                "scene_binding": scene_binding,
            }
            shot["mode"] = decide_mode(shot, char_bindings, mode_policy, selected_artifact)
        except Exception:
            shot.setdefault("asset_bindings", {"character_bindings": [], "scene_binding": None})
            if "mode" not in shot:
                shot["mode"] = "text2img"
        result.append(shot)
    return result
