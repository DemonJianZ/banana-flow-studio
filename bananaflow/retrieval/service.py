from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

from .embeddings import BaseEmbedder, HashEmbedder
from .qdrant_store import QdrantVectorStore
from .schemas import RetrievalQuery, RetrievalSearchResult, RetrievalResultItem
from .vector_store import InMemoryVectorStore, VectorStore


def _load_asset_index_tool():
    try:
        from ..assets.index_tool import AssetIndexTool
        from ..assets.schemas import AssetQuery
    except Exception:  # pragma: no cover
        from assets.index_tool import AssetIndexTool  # type: ignore
        from assets.schemas import AssetQuery  # type: ignore
    return AssetIndexTool, AssetQuery


def _load_eval_iter_jsonl():
    try:
        from ..quality.harvester import _iter_jsonl
    except Exception:  # pragma: no cover
        from quality.harvester import _iter_jsonl  # type: ignore
    return _iter_jsonl


class RetrievalService:
    def __init__(
        self,
        *,
        vector_store: Optional[VectorStore] = None,
        embedder: Optional[BaseEmbedder] = None,
        asset_db_path: Optional[str] = None,
        eval_cases_path: Optional[str] = None,
    ) -> None:
        self.vector_store = vector_store or InMemoryVectorStore()
        self.embedder = embedder or HashEmbedder()
        self.asset_db_path = str(asset_db_path or os.getenv("BANANAFLOW_ASSET_DB_PATH", "./data/assets.db")).strip()
        self.eval_cases_path = str(
            eval_cases_path or os.getenv("BANANAFLOW_EVAL_CASES_PATH", "./evals/idea_script/eval_cases/harvested.jsonl")
        ).strip()

    def search_assets(
        self,
        query: str,
        *,
        top_k: int = 5,
        db_path: Optional[str] = None,
        tag_normalize_enabled: Optional[bool] = None,
        filters: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        AssetIndexTool, AssetQuery = _load_asset_index_tool()
        resolved_db_path = str(db_path or self.asset_db_path or "").strip()
        aspect = str((filters or {}).get("aspect") or "").strip()
        asset_type = str((filters or {}).get("type") or "").strip()
        tool = AssetIndexTool(
            db_path=(resolved_db_path or None),
            tag_normalize_enabled=tag_normalize_enabled,
        )
        normalized_query = AssetQuery(
            required_tags=[str(query or "").strip()],
            preferred_tags=[],
            forbidden_tags=[],
            type=asset_type,
            aspect=aspect,
        )
        candidates = tool.search(normalized_query, top_k=max(1, int(top_k or 1)))
        items = []
        for candidate in list(candidates or []):
            payload = candidate.model_dump(mode="json") if hasattr(candidate, "model_dump") else dict(candidate)
            items.append(
                {
                    "doc_id": str(payload.get("asset_id") or ""),
                    "text": str(payload.get("reason") or ""),
                    "score": float(payload.get("score") or 0.0),
                    "metadata": {
                        "asset_id": str(payload.get("asset_id") or ""),
                        "uri": str(payload.get("uri") or ""),
                        "bucket": str(payload.get("bucket") or ""),
                        "reason": str(payload.get("reason") or ""),
                    },
                }
            )
        return {"collection": "assets", "query": str(query or ""), "items": items}

    def search_knowledge(
        self,
        query: str,
        *,
        top_k: int = 5,
        filters: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        return self._search_vector_collection("knowledge", query, top_k=top_k, filters=filters)

    def search_eval_cases(
        self,
        query: str,
        *,
        top_k: int = 5,
        filters: Optional[Dict[str, Any]] = None,
        eval_cases_path: Optional[str] = None,
    ) -> Dict[str, Any]:
        path = str(eval_cases_path or self.eval_cases_path or "").strip()
        if path and os.path.exists(path):
            loaded = self._search_eval_jsonl(path, query, top_k=top_k, filters=filters)
            if loaded["items"]:
                return loaded
        return self._search_vector_collection("eval_cases", query, top_k=top_k, filters=filters)

    def _search_vector_collection(
        self,
        collection: str,
        query: str,
        *,
        top_k: int,
        filters: Optional[Dict[str, Any]],
    ) -> Dict[str, Any]:
        normalized_query = RetrievalQuery(
            collection=str(collection or "").strip(),
            text=str(query or "").strip(),
            top_k=max(1, int(top_k or 1)),
            filters=dict(filters or {}),
        )
        vector = self.embedder.embed_text(normalized_query.text)
        items = self.vector_store.search(
            normalized_query.collection,
            query_text=normalized_query.text,
            query_vector=vector,
            top_k=normalized_query.top_k,
            filters=normalized_query.filters,
        )
        return self._result_to_dict(
            RetrievalSearchResult(
                collection=normalized_query.collection,
                query=normalized_query.text,
                items=list(items or []),
            )
        )

    def _search_eval_jsonl(
        self,
        path: str,
        query: str,
        *,
        top_k: int,
        filters: Optional[Dict[str, Any]],
    ) -> Dict[str, Any]:
        _iter_jsonl = _load_eval_iter_jsonl()
        query_text = str(query or "").strip().lower()
        rows = []
        for row in list(_iter_jsonl(path) or []):
            if not self._matches_filters(dict(row or {}), dict(filters or {})):
                continue
            blob = " ".join(
                [
                    str(row.get("reason") or ""),
                    str(row.get("session_id") or ""),
                    str((row.get("quality_metrics") or {}).get("product") or ""),
                    str((row.get("quality_metrics") or {}).get("persona") or ""),
                ]
            ).lower()
            score = 1.0 if query_text and query_text in blob else 0.0
            if query_text and score <= 0.0:
                continue
            rows.append(
                RetrievalResultItem(
                    doc_id=str(row.get("case_id") or ""),
                    text=str(row.get("reason") or ""),
                    score=score,
                    metadata=dict(row or {}),
                )
            )
        rows.sort(key=lambda item: (-float(item.score), item.doc_id))
        return self._result_to_dict(
            RetrievalSearchResult(
                collection="eval_cases",
                query=str(query or ""),
                items=rows[: max(1, int(top_k or 1))],
            )
        )

    def _matches_filters(self, row: Dict[str, Any], filters: Dict[str, Any]) -> bool:
        for key, expected in dict(filters or {}).items():
            if row.get(key) == expected:
                continue
            nested_quality = dict(row.get("quality_metrics") or {})
            nested_provenance = dict(row.get("provenance") or {})
            if nested_quality.get(key) == expected or nested_provenance.get(key) == expected:
                continue
            return False
        return True

    def _result_to_dict(self, result: RetrievalSearchResult) -> Dict[str, Any]:
        items = []
        for item in list(result.items or []):
            items.append(
                {
                    "doc_id": item.doc_id,
                    "text": item.text,
                    "score": float(item.score),
                    "metadata": dict(item.metadata or {}),
                }
            )
        return {"collection": result.collection, "query": result.query, "items": items}


def build_default_retrieval_service() -> RetrievalService:
    provider = str(os.getenv("RETRIEVAL_PROVIDER", "memory") or "memory").strip().lower()
    vector_store: VectorStore
    if provider == "qdrant":
        vector_store = QdrantVectorStore()
    else:
        vector_store = InMemoryVectorStore()
    return RetrievalService(vector_store=vector_store)
