from __future__ import annotations

import hashlib
import json
import os
from types import SimpleNamespace
from typing import Any, Dict, Iterable, List

try:
    from ..assets.index_tool import AssetIndexTool
    from ..assets.query_builder import ShotQueryBuilder
    from ..assets.schemas import AssetQuery
except Exception:  # pragma: no cover - 兼容 python bananaflow/main.py 直跑
    from assets.index_tool import AssetIndexTool
    from assets.query_builder import ShotQueryBuilder
    from assets.schemas import AssetQuery


MATCH_ASSETS_TOOL_NAME = "match_assets_for_shots"
MATCH_ASSETS_TOOL_VERSION = "1.0.0"
_SEGMENTS = ("HOOK", "VIEW", "STEPS", "PRODUCT", "CTA")


def _canonical_json(payload: Dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


_TOOL_DEFINITION_BASE: Dict[str, Any] = {
    "name": MATCH_ASSETS_TOOL_NAME,
    "description": (
        "Given shot/query inputs, retrieve top-k asset candidates per shot with explainable bucket/reason."
    ),
    "inputSchema": {
        "type": "object",
        "properties": {
            "queries": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "shot_id": {"type": "string"},
                        "top_k": {"type": "integer", "minimum": 1, "maximum": 20},
                        "segment": {"type": "string"},
                        "asset_query": {
                            "type": "object",
                            "properties": {
                                "required_tags": {"type": "array", "items": {"type": "string"}},
                                "preferred_tags": {"type": "array", "items": {"type": "string"}},
                                "forbidden_tags": {"type": "array", "items": {"type": "string"}},
                                "type": {"type": "string"},
                                "aspect": {"type": "string"},
                                "style": {"type": "string"},
                            },
                            "additionalProperties": True,
                        },
                    },
                    "required": ["shot_id", "asset_query"],
                    "additionalProperties": True,
                },
            },
            "shots": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "shot_id": {"type": "string"},
                        "segment": {"type": "string"},
                        "keyword_tags": {"type": "array", "items": {"type": "string"}},
                        "asset_requirements": {
                            "type": "array",
                            "items": {
                                "oneOf": [
                                    {"type": "string"},
                                    {
                                        "type": "object",
                                        "properties": {
                                            "type": {"type": "string"},
                                            "must_have": {"type": "string"},
                                            "avoid": {"type": "string"},
                                            "style": {"type": "string"},
                                            "aspect": {"type": "string"},
                                        },
                                        "additionalProperties": True,
                                    },
                                ]
                            },
                        },
                        "top_k": {"type": "integer", "minimum": 1, "maximum": 20},
                    },
                    "required": ["shot_id", "segment"],
                    "additionalProperties": True,
                },
            },
            "top_k": {"type": "integer", "minimum": 1, "maximum": 20, "default": 3},
            "db_path": {"type": "string"},
            "tag_normalize_enabled": {"type": "boolean"},
        },
        "anyOf": [{"required": ["queries"]}, {"required": ["shots"]}],
        "additionalProperties": False,
    },
    "outputSchema": {
        "type": "object",
        "properties": {
            "results": {
                "type": "object",
                "additionalProperties": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "asset_id": {"type": "string"},
                            "uri": {"type": "string"},
                            "score": {"type": "number"},
                            "bucket": {"type": "string"},
                            "reason": {"type": "string"},
                        },
                        "required": ["asset_id", "uri", "score", "bucket", "reason"],
                        "additionalProperties": True,
                    },
                },
            },
            "stats": {
                "type": "object",
                "properties": {
                    "shot_count": {"type": "integer"},
                    "matched_shot_count": {"type": "integer"},
                    "shot_match_rate": {"type": "number"},
                    "avg_candidates_per_shot": {"type": "number"},
                    "segment_match_rate": {"type": "object", "additionalProperties": {"type": "number"}},
                    "bucket_distribution": {"type": "object", "additionalProperties": {"type": "integer"}},
                },
                "additionalProperties": True,
            },
            "tool_version": {"type": "string"},
            "tool_hash": {"type": "string"},
        },
        "required": ["results", "stats", "tool_version", "tool_hash"],
        "additionalProperties": True,
    },
    "annotations": {
        "readOnlyHint": True,
        "idempotentHint": True,
        "destructiveHint": False,
    },
    "tool_version": MATCH_ASSETS_TOOL_VERSION,
}


MATCH_ASSETS_TOOL_HASH = hashlib.sha256(
    _canonical_json(_TOOL_DEFINITION_BASE).encode("utf-8")
).hexdigest()


def get_asset_match_tool_definition() -> Dict[str, Any]:
    payload = dict(_TOOL_DEFINITION_BASE)
    payload["tool_hash"] = MATCH_ASSETS_TOOL_HASH
    return payload


def _as_bool(value: Any, default: bool) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "on"}:
        return True
    if text in {"0", "false", "no", "off"}:
        return False
    return default


def _as_int(value: Any, default: int, min_value: int = 1, max_value: int = 20) -> int:
    try:
        iv = int(value)
    except Exception:
        iv = default
    return max(min_value, min(max_value, iv))


def _normalize_requirement(raw: Any) -> Any:
    if isinstance(raw, dict):
        return SimpleNamespace(
            type=str(raw.get("type") or "").strip(),
            must_have=str(raw.get("must_have") or "").strip(),
            avoid=str(raw.get("avoid") or "").strip(),
            style=str(raw.get("style") or "").strip(),
            aspect=str(raw.get("aspect") or "").strip() or "9:16",
        )
    text = str(raw or "").strip()
    return SimpleNamespace(type="", must_have=text, avoid="", style="", aspect="9:16")


def _normalize_shot(shot: Dict[str, Any]) -> Any:
    reqs = [_normalize_requirement(item) for item in list(shot.get("asset_requirements") or [])]
    return SimpleNamespace(
        shot_id=str(shot.get("shot_id") or "").strip(),
        segment=str(shot.get("segment") or "").strip().upper(),
        keyword_tags=list(shot.get("keyword_tags") or []),
        asset_requirements=reqs,
    )


def _candidate_to_dict(candidate: Any) -> Dict[str, Any]:
    if hasattr(candidate, "model_dump"):
        return dict(candidate.model_dump(mode="json"))
    return {
        "asset_id": str(getattr(candidate, "asset_id", "") or ""),
        "uri": str(getattr(candidate, "uri", "") or ""),
        "score": float(getattr(candidate, "score", 0.0) or 0.0),
        "bucket": str(getattr(candidate, "bucket", "fallback") or "fallback"),
        "reason": str(getattr(candidate, "reason", "") or ""),
    }


def _build_stats(
    results: Dict[str, List[Dict[str, Any]]],
    shot_segments: Dict[str, str],
) -> Dict[str, Any]:
    shot_count = len(results)
    matched_shot_count = sum(1 for cands in results.values() if cands)
    total_candidates = sum(len(cands or []) for cands in results.values())
    shot_match_rate = round(float(matched_shot_count) / float(shot_count), 3) if shot_count > 0 else 0.0
    avg_candidates_per_shot = round(float(total_candidates) / float(shot_count), 3) if shot_count > 0 else 0.0

    segment_total = {seg: 0 for seg in _SEGMENTS}
    segment_matched = {seg: 0 for seg in _SEGMENTS}
    bucket_distribution = {"best_match": 0, "partial_match": 0, "fallback": 0}

    for shot_id, cands in results.items():
        segment = str(shot_segments.get(shot_id, "") or "").upper()
        if segment in segment_total:
            segment_total[segment] += 1
            if cands:
                segment_matched[segment] += 1
        for cand in list(cands or []):
            bucket = str(cand.get("bucket") or "")
            if bucket in bucket_distribution:
                bucket_distribution[bucket] += 1

    segment_match_rate: Dict[str, float] = {}
    for seg in _SEGMENTS:
        total = int(segment_total.get(seg, 0) or 0)
        matched = int(segment_matched.get(seg, 0) or 0)
        segment_match_rate[seg] = round(float(matched) / float(total), 3) if total > 0 else 0.0

    return {
        "shot_count": shot_count,
        "matched_shot_count": matched_shot_count,
        "shot_match_rate": shot_match_rate,
        "avg_candidates_per_shot": avg_candidates_per_shot,
        "segment_match_rate": segment_match_rate,
        "bucket_distribution": bucket_distribution,
    }


def execute_asset_match_tool(arguments: Dict[str, Any]) -> Dict[str, Any]:
    args = dict(arguments or {})
    queries = list(args.get("queries") or [])
    shots = list(args.get("shots") or [])
    if not queries and not shots:
        raise ValueError("Invalid args: provide queries or shots. Recovery: send one of the two modes.")

    db_path = os.path.abspath(
        str(args.get("db_path") or os.getenv("BANANAFLOW_ASSET_DB_PATH", "./data/assets.db")).strip()
    )
    default_top_k = _as_int(args.get("top_k"), default=3)
    tag_normalize_enabled = _as_bool(
        args.get("tag_normalize_enabled"),
        default=_as_bool(os.getenv("IDEA_SCRIPT_TAG_NORMALIZE_ENABLED"), default=True),
    )

    tool = AssetIndexTool(db_path=db_path, tag_normalize_enabled=tag_normalize_enabled)
    query_builder = ShotQueryBuilder()

    results: Dict[str, List[Dict[str, Any]]] = {}
    shot_segments: Dict[str, str] = {}

    if queries:
        for idx, item in enumerate(queries, start=1):
            if not isinstance(item, dict):
                continue
            shot_id = str(item.get("shot_id") or f"shot_{idx}").strip()
            query_data = item.get("asset_query") or {}
            if not isinstance(query_data, dict):
                raise ValueError(
                    f"Invalid queries[{idx - 1}].asset_query. Recovery: provide object with required_tags/preferred_tags/forbidden_tags/type/aspect."
                )
            query_obj = AssetQuery(**query_data)
            top_k = _as_int(item.get("top_k"), default=default_top_k)
            candidates = tool.search(query=query_obj, top_k=top_k)
            results[shot_id] = [_candidate_to_dict(c) for c in candidates]
            shot_segments[shot_id] = str(item.get("segment") or "").upper()

    if shots:
        for idx, raw in enumerate(shots, start=1):
            if not isinstance(raw, dict):
                continue
            shot = _normalize_shot(raw)
            shot_id = str(getattr(shot, "shot_id", "") or f"shot_{idx}")
            if not shot_id:
                shot_id = f"shot_{idx}"
            query_obj = query_builder.build(shot)
            top_k = _as_int(raw.get("top_k"), default=default_top_k)
            candidates = tool.search(query=query_obj, top_k=top_k)
            results[shot_id] = [_candidate_to_dict(c) for c in candidates]
            shot_segments[shot_id] = str(getattr(shot, "segment", "") or "").upper()

    stats = _build_stats(results=results, shot_segments=shot_segments)
    return {
        "results": results,
        "stats": stats,
        "tool_version": MATCH_ASSETS_TOOL_VERSION,
        "tool_hash": MATCH_ASSETS_TOOL_HASH,
        "db_path": db_path,
        "tag_normalize_enabled": bool(tag_normalize_enabled),
    }
