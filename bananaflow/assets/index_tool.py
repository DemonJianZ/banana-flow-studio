from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from typing import Any, Iterable

try:
    from agent.idea_script.schemas import AssetRequirement
    from storage.migrations import ensure_asset_db
    from storage.sqlite import query_all
except Exception:  # pragma: no cover - 兼容作为 bananaflow 包导入
    from bananaflow.agent.idea_script.schemas import AssetRequirement
    from bananaflow.storage.migrations import ensure_asset_db
    from bananaflow.storage.sqlite import query_all

from .schemas import AssetCandidate, AssetQuery
from .tag_normalizer import normalize_tags


_TOKEN_RE = re.compile(r"[a-z0-9_]+|[\u4e00-\u9fff]+", re.IGNORECASE)
_BUCKET_ORDER = {"best_match": 0, "partial_match": 1, "fallback": 2}


@dataclass(frozen=True)
class _ScoreBreakdown:
    score: float
    bucket: str
    required_missing_count: int
    required_hit_count: int
    preferred_hit_count: int
    forbidden_hit_count: int
    type_match: int
    aspect_match: int


class AssetIndexTool:
    def __init__(self, db_path: str | None = None, tag_normalize_enabled: bool | None = None) -> None:
        default_path = os.getenv("BANANAFLOW_ASSET_DB_PATH", "./data/assets.db")
        self.db_path = os.path.abspath((db_path or default_path).strip())
        if tag_normalize_enabled is None:
            env_value = (os.getenv("IDEA_SCRIPT_TAG_NORMALIZE_ENABLED", "1") or "").strip().lower()
            self.tag_normalize_enabled = env_value not in {"0", "false", "no", "off"}
        else:
            self.tag_normalize_enabled = bool(tag_normalize_enabled)
        ensure_asset_db(self.db_path)

    def search(self, query: Any, top_k: int = 3) -> list[AssetCandidate]:
        q = self._normalize_query(query)
        if q is None:
            return []
        where = []
        params: list[Any] = []
        if (q.type or "").strip():
            where.append("asset_type = ?")
            params.append(str(q.type).strip())
        if (q.aspect or "").strip():
            where.append("aspect = ?")
            params.append(str(q.aspect).strip())
        where_clause = f"WHERE {' AND '.join(where)}" if where else ""
        rows = query_all(
            self.db_path,
            f"""
            SELECT asset_id, uri, asset_type, tags, scene, objects, style, aspect
            FROM assets
            {where_clause}
            """,
            tuple(params),
        )
        candidates: list[AssetCandidate] = []
        for row in rows:
            best = self._score_asset(row=row, query=q)
            if best is None:
                continue
            candidates.append(
                AssetCandidate(
                    asset_id=str(row["asset_id"] or "").strip(),
                    uri=str(row["uri"] or "").strip(),
                    score=round(float(best.score), 3),
                    bucket=best.bucket,  # type: ignore[arg-type]
                    reason=(
                        f"required_missing_count={best.required_missing_count},"
                        f"preferred_hit_count={best.preferred_hit_count},"
                        f"forbidden_hit_count={best.forbidden_hit_count},"
                        f"required_hit_count={best.required_hit_count},"
                        f"type_match={best.type_match},aspect_match={best.aspect_match}"
                    ),
                )
            )
        candidates.sort(key=lambda x: (_BUCKET_ORDER.get(str(x.bucket), 99), -float(x.score), x.asset_id))
        limit = max(1, min(int(top_k or 1), 20))
        return candidates[:limit]

    def _score_asset(self, row: Any, query: AssetQuery) -> _ScoreBreakdown | None:
        asset_type = str(row["asset_type"] or "").strip().lower()
        asset_aspect = str(row["aspect"] or "").strip()
        asset_tags = self._parse_json_list(row["tags"])
        asset_objects = self._parse_json_list(row["objects"])
        scene = str(row["scene"] or "").strip()
        uri = str(row["uri"] or "").strip()
        corpus = list(asset_tags) + list(asset_objects) + [scene, asset_type, asset_aspect, uri]
        asset_tokens = set(self._normalize_token_list(corpus))

        required = set(self._normalize_token_list(query.required_tags))
        preferred = set(self._normalize_token_list(query.preferred_tags))
        forbidden = set(self._normalize_token_list(query.forbidden_tags))

        required_hit_count = self._count_hits(required, asset_tokens)
        required_missing_count = max(0, len(required) - required_hit_count)
        preferred_hit_count = self._count_hits(preferred, asset_tokens)
        forbidden_hit_count = self._count_hits(forbidden, asset_tokens)

        type_match = 1 if (not query.type or query.type.strip().lower() == asset_type) else 0
        aspect_match = 1 if (not query.aspect or query.aspect.strip() == asset_aspect) else 0

        score = float(
            required_hit_count * 3
            + preferred_hit_count
            + type_match
            + aspect_match
            - forbidden_hit_count * 4
            - required_missing_count * 1.5
        )
        if forbidden_hit_count > 0:
            score -= 2.0

        bucket: str
        if required and required_missing_count == 0 and forbidden_hit_count == 0:
            bucket = "best_match"
        elif required_hit_count > 0 and forbidden_hit_count == 0:
            bucket = "partial_match"
        else:
            bucket = "fallback"

        if forbidden_hit_count > 0 and required_hit_count == 0:
            return None
        if score <= 0 and bucket == "fallback":
            return None

        return _ScoreBreakdown(
            score=score,
            bucket=bucket,
            required_missing_count=required_missing_count,
            required_hit_count=required_hit_count,
            preferred_hit_count=preferred_hit_count,
            forbidden_hit_count=forbidden_hit_count,
            type_match=type_match,
            aspect_match=aspect_match,
        )

    def _normalize_query(self, query: Any) -> AssetQuery | None:
        if query is None:
            return None
        if isinstance(query, AssetQuery):
            return query
        if isinstance(query, dict):
            return AssetQuery(**query)
        # backward-compatible: list[AssetRequirement|dict|str]
        reqs = self._normalize_requirements(query)
        if not reqs:
            return None
        required_tags: list[str] = []
        preferred_tags: list[str] = []
        forbidden_tags: list[str] = []
        query_type = ""
        aspect = ""
        for req in reqs:
            required_tags.extend(self._tokenize(req.must_have))
            forbidden_tags.extend(self._tokenize(req.avoid))
            preferred_tags.extend(self._tokenize(req.style))
            if not query_type and (req.type or "").strip():
                query_type = str(req.type).strip().lower()
            if not aspect and (req.aspect or "").strip():
                aspect = str(req.aspect).strip()
        return AssetQuery(
            required_tags=required_tags,
            preferred_tags=preferred_tags,
            forbidden_tags=forbidden_tags,
            type=query_type,
            aspect=(aspect or "9:16"),
        )

    def _coerce_requirement(self, raw: Any) -> AssetRequirement | None:
        if isinstance(raw, AssetRequirement):
            return raw
        if isinstance(raw, dict):
            must_have = str(raw.get("must_have") or "").strip()
            if not must_have:
                return None
            return AssetRequirement(
                type=str(raw.get("type") or "").strip(),
                must_have=must_have,
                avoid=str(raw.get("avoid") or "").strip(),
                style=str(raw.get("style") or "").strip(),
                aspect=str(raw.get("aspect") or "").strip() or "9:16",
            )
        text = str(raw or "").strip()
        if not text:
            return None
        return AssetRequirement(
            must_have=text,
            type="",
            avoid="",
            style="",
            aspect="9:16",
        )

    def _parse_json_list(self, value: Any) -> list[str]:
        if isinstance(value, list):
            source = value
        else:
            text = str(value or "").strip()
            if not text:
                return []
            try:
                decoded = json.loads(text)
            except Exception:
                decoded = []
            source = decoded if isinstance(decoded, list) else []
        out: list[str] = []
        seen = set()
        for item in source:
            token = str(item or "").strip()
            if not token or token in seen:
                continue
            seen.add(token)
            out.append(token)
        return out

    def _tokenize(self, value: Any) -> list[str]:
        text = str(value or "").strip().lower()
        if not text:
            return []
        return [m.group(0) for m in _TOKEN_RE.finditer(text.replace("-", "_"))]

    def _tokenize_many(self, values: Iterable[Any]) -> list[str]:
        out: list[str] = []
        for value in values:
            out.extend(self._tokenize(value))
        return out

    def _normalize_token_list(self, values: Iterable[Any]) -> list[str]:
        raw_tokens: list[str] = []
        for value in values or []:
            raw_tokens.extend(self._tokenize(value))
        if self.tag_normalize_enabled:
            return normalize_tags(raw_tokens)
        dedup: list[str] = []
        seen = set()
        for token in raw_tokens:
            if token in seen:
                continue
            seen.add(token)
            dedup.append(token)
        return dedup

    def _normalize_requirements(self, requirements: Any) -> list[AssetRequirement]:
        if requirements is None:
            return []
        source: list[Any]
        if isinstance(requirements, list):
            source = list(requirements)
        else:
            source = [requirements]
        normalized: list[AssetRequirement] = []
        for raw in source:
            item = self._coerce_requirement(raw)
            if item is None:
                continue
            normalized.append(item)
        return normalized

    def _count_hits(self, source_tokens: set[str], target_tokens: set[str]) -> int:
        if not source_tokens or not target_tokens:
            return 0
        return sum(1 for token in source_tokens if token in target_tokens)
