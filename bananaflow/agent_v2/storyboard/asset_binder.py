"""
LAB-3 — Local asset binder.

Given a StoryboardPlan (already designed) and the main_assets root,
matches entities/locations to real assets and returns an enriched plan
with plan.local_asset_bindings populated.

Never raises — all errors become warnings in the bindings.

Main entry point:
    plan = bind_local_assets_to_plan(plan)
    plan = bind_local_assets_to_plan(plan, asset_root="/custom/path")
"""
from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Dict, FrozenSet, List, Optional, Set, Tuple

from .local_asset_library import (
    LocalAssetManifest,
    LocalCharacterRecord,
    LocalSceneRecord,
    get_main_assets_root,
    scan_local_assets,
)
from .schemas import (
    LocalCharacterBinding,
    LocalSceneBinding,
    StoryboardEntity,
    StoryboardLocalAssetBindings,
    StoryboardPlan,
)

_log = logging.getLogger(__name__)

_SCORE_TO_CODE: Dict[float, str] = {
    3.0: "exact",
    2.0: "prefix",
    1.5: "reverse_prefix",
    1.0: "substring",
    0.5: "reverse_substring",
}


# ---------------------------------------------------------------------------
# Alias registry helpers
# ---------------------------------------------------------------------------

def _load_alias_registry(asset_root: Path) -> Dict[str, str]:
    """
    Load asset_aliases.json from asset_root and return inverted dict[alias -> canonical_name].

    Missing or malformed file → empty dict.  Never raises.
    """
    try:
        alias_file = asset_root / "asset_aliases.json"
        if not alias_file.is_file():
            return {}
        data = json.loads(alias_file.read_text(encoding="utf-8"))
        inverted: Dict[str, str] = {}
        for entry in list(data.get("character_aliases") or []):
            canonical = str(entry.get("canonical_name") or "").strip()
            if not canonical:
                continue
            for alias in list(entry.get("aliases") or []):
                alias_str = str(alias).strip()
                if alias_str:
                    inverted[alias_str] = canonical
        return inverted
    except Exception:
        return {}


def extract_mentions(user_brief: str) -> FrozenSet[str]:
    """Extract @name mentions from user brief text."""
    if not user_brief:
        return frozenset()
    return frozenset(re.findall(r"@([一-鿿\w]+)", str(user_brief or "")))


# ---------------------------------------------------------------------------
# Scoring helpers
# ---------------------------------------------------------------------------

def _name_score(query: str, target: str) -> float:
    """
    Compute a match score between an entity name (query) and a known asset name (target).

    Scoring levels:
      3.0 — exact match
      2.0 — query starts with target  (e.g. "龙女辰辰" starts with "龙女")
      1.5 — target starts with query
      1.0 — target is substring of query anywhere
      0.5 — query is substring of target anywhere
      0.0 — no match
    """
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
    """Strip possessive/connective 的 between CJK chars: '小鲤的庭院' → '小鲤庭院'."""
    return re.sub(r"(?<=[一-鿿㐀-䶿])的(?=[一-鿿㐀-䶿])", "", str(text or ""))


def _cjk_tokens(text: str) -> Set[str]:
    """
    Generate meaningful CJK sub-tokens (bigrams + trigrams) from text.

    Example: "夜晚庭院" → {"夜晚", "晚庭", "庭院", "夜晚庭", "晚庭院"}
    This ensures "庭院" matches across "夜晚庭院" and "阿巳庭院".
    """
    chars = re.findall(r"[一-鿿㐀-䶿]", text)
    tokens: Set[str] = set()
    for n in (2, 3):
        for i in range(len(chars) - n + 1):
            tokens.add("".join(chars[i : i + n]))
    return tokens


def _scene_score(
    location_text: str,
    folder_name: str,
    active_character_names: Set[str],
) -> float:
    """
    Score how well a scene folder matches a location text.

    Components:
      +3.0  folder name is substring of location text (direct name mention)
      +2.0  location text is substring of folder name
      +1.0  per shared CJK token (2+ chars) between location text and folder name
      +1.5  folder name contains an active character name (character affinity)
    """
    score = 0.0
    f = folder_name.strip()
    loc = location_text.strip()
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

    for char_name in active_character_names:
        if char_name and char_name in f:
            score += 1.5
            break  # count at most once per folder

    return score


# ---------------------------------------------------------------------------
# Character / scene matchers
# ---------------------------------------------------------------------------

def _match_character(
    entity: StoryboardEntity,
    manifest: LocalAssetManifest,
) -> Tuple[Optional[LocalCharacterRecord], float, str]:
    """
    Find the best-matching LocalCharacterRecord for a StoryboardEntity.

    Returns (record, score, reason) or (None, 0.0, "") if no match (score < 1.0).
    """
    best_score = 0.0
    best_rec: Optional[LocalCharacterRecord] = None
    for rec in manifest.characters:
        s = _name_score(entity.name, rec.name)
        if s > best_score:
            best_score = s
            best_rec = rec

    if best_score < 1.0 or best_rec is None:
        return None, 0.0, ""

    reason_map = {3.0: "exact", 2.0: "prefix", 1.5: "reverse-prefix", 1.0: "substring"}
    reason = reason_map.get(best_score, f"score={best_score:.1f}")
    return best_rec, best_score, f"entity '{entity.name}' → '{best_rec.name}' ({reason})"


def _collect_location_texts(plan: StoryboardPlan) -> List[str]:
    """Gather all distinct location texts from entities and scenes."""
    texts: List[str] = []
    seen: Set[str] = set()

    def add(t: str) -> None:
        t = t.strip()
        if t and t not in seen:
            seen.add(t)
            texts.append(t)

    for loc in plan.entities.locations:
        add(loc.name)
        if loc.core_description:
            add(loc.core_description)
    for scene in plan.scenes:
        if scene.location:
            add(scene.location)
    return texts


def _match_scenes(
    plan: StoryboardPlan,
    manifest: LocalAssetManifest,
    active_character_names: Set[str],
) -> Tuple[List[LocalSceneBinding], List[str]]:
    """
    Match scene folders to location texts in the plan.

    Uses greedy bipartite assignment (score descending): each location_text
    claims at most one folder and each folder is claimed by at most one
    location_text.  This prevents a generic word like '庭院' from stealing a
    folder already claimed by the precise text '辰辰庭院'.
    """
    location_texts = _collect_location_texts(plan)
    if not location_texts or not manifest.scenes:
        missing = location_texts[:] if location_texts else []
        return [], missing

    # Collect all candidate (score, loc_text, record) triples above threshold.
    candidates: List[Tuple[float, str, LocalSceneRecord]] = []
    for loc_text in location_texts:
        for rec in manifest.scenes:
            s = _scene_score(loc_text, rec.folder_name, active_character_names)
            if s >= 1.0:
                candidates.append((s, loc_text, rec))

    if not candidates:
        return [], location_texts[:]

    # Greedy assignment: sort by score desc, assign 1-to-1.
    candidates.sort(key=lambda x: -x[0])
    assigned_locs: Set[str] = set()
    assigned_folders: Set[str] = set()
    bindings: List[LocalSceneBinding] = []

    for score, loc_text, rec in candidates:
        if loc_text in assigned_locs or rec.folder_name in assigned_folders:
            continue
        assigned_locs.add(loc_text)
        assigned_folders.add(rec.folder_name)
        reason = f"location '{loc_text}' → '{rec.folder_name}' (score={score:.1f})"
        bindings.append(LocalSceneBinding(
            folder_name=rec.folder_name,
            folder_path=rec.folder_path,
            preview_paths=rec.preview_paths,
            preview_urls=rec.preview_urls,
            matched_from=loc_text,
            match_score=score,
            match_reason=reason,
        ))

    missing_scenes: List[str] = [
        loc for loc in location_texts if loc not in assigned_locs
    ]
    return bindings, missing_scenes


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def bind_local_assets_to_plan(
    plan: StoryboardPlan,
    asset_root: "Path | str | None" = None,
    user_brief: str = "",
) -> StoryboardPlan:
    """
    Enrich plan with local_asset_bindings.

    Scans main_assets/, matches characters and scenes, and returns a new
    StoryboardPlan instance with local_asset_bindings populated.

    user_brief is used to extract @mention explicit references for confidence boost.

    Never raises — all errors become warnings in the bindings payload.
    The plan's own warnings list is not modified; binding warnings live in
    plan.local_asset_bindings.warnings.
    """
    outer_warnings: List[str] = []

    try:
        root = Path(asset_root) if asset_root is not None else get_main_assets_root()
        manifest = scan_local_assets(root)
        outer_warnings.extend(manifest.warnings)
    except Exception as exc:
        _log.warning("local_asset_binder: scan failed: %s", exc)
        empty = StoryboardLocalAssetBindings(warnings=[f"资产扫描失败: {exc}"])
        return plan.model_copy(update={"local_asset_bindings": empty})

    try:
        alias_registry = _load_alias_registry(root)
        explicit_set = extract_mentions(str(user_brief or ""))

        character_bindings: List[LocalCharacterBinding] = []
        missing_characters: List[str] = []

        # Search characters + subjects (both can be named characters)
        entities_to_bind = list(plan.entities.characters) + list(plan.entities.subjects)
        active_character_names: Set[str] = set()

        for entity in entities_to_bind:
            try:
                rec, score, reason = _match_character(entity, manifest)

                # Alias expansion: if direct match is weak, try alias → canonical lookup
                alias_used: Optional[str] = None
                if score < 1.0 and entity.name in alias_registry:
                    canonical = alias_registry[entity.name]
                    for char_rec in manifest.characters:
                        s = _name_score(canonical, char_rec.name)
                        if s > score:
                            score = s
                            rec = char_rec
                            alias_used = entity.name

                if rec is not None and score >= 1.0:
                    active_character_names.add(rec.name)

                    # Determine match_status — use prefix match to handle greedy CJK tokenisation.
                    # "@龙女辰辰登场" extracts token "龙女辰辰登场"; entity "龙女辰辰" is a prefix
                    # of that token, so we still recognise it as an explicit mention.
                    entity_explicit = entity.name in explicit_set or any(
                        tok.startswith(entity.name) for tok in explicit_set
                    )
                    alias_explicit = bool(alias_used) and (
                        alias_used in explicit_set
                        or any(tok.startswith(alias_used) for tok in explicit_set)
                    )
                    if entity_explicit or alias_explicit:
                        match_status = "explicit"
                    elif alias_used:
                        match_status = "alias_matched"
                    else:
                        match_status = "matched"

                    # Build reason_codes
                    reason_codes: List[str] = [_SCORE_TO_CODE.get(score, f"score_{score:.1f}")]
                    if alias_used:
                        reason_codes.append("alias_expanded")
                        reason = reason + f" via alias '{alias_used}'"
                    if match_status == "explicit":
                        reason_codes.append("explicit_mention")

                    confidence = 1.0 if match_status == "explicit" else min(1.0, score / 3.0)

                    character_bindings.append(LocalCharacterBinding(
                        entity_id=entity.entity_id,
                        entity_name=entity.name,
                        character_name=rec.name,
                        three_view_path=rec.three_view_path,
                        three_view_url=rec.three_view_url,
                        voice_path=rec.voice_path,
                        voice_url=rec.voice_url,
                        match_score=score,
                        match_reason=reason,
                        confidence=confidence,
                        match_status=match_status,
                        reason_codes=reason_codes,
                        alias_used=alias_used,
                    ))
                else:
                    missing_characters.append(entity.name)
            except Exception as exc:
                _log.warning("local_asset_binder: character match failed for '%s': %s", entity.name, exc)
                outer_warnings.append(f"角色匹配失败 '{entity.name}': {exc}")

        scene_bindings: List[LocalSceneBinding] = []
        missing_scenes: List[str] = []
        try:
            scene_bindings, missing_scenes = _match_scenes(plan, manifest, active_character_names)
        except Exception as exc:
            _log.warning("local_asset_binder: scene matching failed: %s", exc)
            outer_warnings.append(f"场景匹配失败: {exc}")

        bindings = StoryboardLocalAssetBindings(
            character_bindings=character_bindings,
            scene_bindings=scene_bindings,
            missing_characters=missing_characters,
            missing_scenes=missing_scenes,
            warnings=outer_warnings,
            asset_root_used=str(root),
        )
        return plan.model_copy(update={"local_asset_bindings": bindings})

    except Exception as exc:
        _log.exception("local_asset_binder: unexpected error: %s", exc)
        empty = StoryboardLocalAssetBindings(warnings=[f"资产绑定意外失败: {exc}"])
        return plan.model_copy(update={"local_asset_bindings": empty})
