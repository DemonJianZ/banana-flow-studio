from __future__ import annotations

import os
from typing import Any, Dict, List

from .schemas import RetrievalDocument, RetrievalResultItem
from .vector_store import VectorStore


class QdrantVectorStore(VectorStore):
    def __init__(
        self,
        *,
        url: str | None = None,
        api_key: str | None = None,
        collection_prefix: str = "bananaflow",
    ) -> None:
        self.url = str(url or os.getenv("QDRANT_URL", "http://localhost:6333")).strip()
        self.api_key = str(api_key or os.getenv("QDRANT_API_KEY", "")).strip()
        self.collection_prefix = str(collection_prefix or "bananaflow").strip() or "bananaflow"
        self._client = None
        self._models = None

    def _get_runtime(self):
        if self._client is not None and self._models is not None:
            return self._client, self._models
        from qdrant_client import QdrantClient  # type: ignore
        from qdrant_client.http import models  # type: ignore

        kwargs: Dict[str, Any] = {"url": self.url}
        if self.api_key:
            kwargs["api_key"] = self.api_key
        self._client = QdrantClient(**kwargs)
        self._models = models
        return self._client, self._models

    def _collection_name(self, collection: str) -> str:
        return f"{self.collection_prefix}_{str(collection or '').strip()}"

    def _ensure_collection(self, collection: str, vector_size: int) -> None:
        client, models = self._get_runtime()
        name = self._collection_name(collection)
        try:
            client.get_collection(name)
            return
        except Exception:
            pass
        client.create_collection(
            collection_name=name,
            vectors_config=models.VectorParams(size=max(1, int(vector_size or 1)), distance=models.Distance.COSINE),
        )

    def upsert(self, collection: str, documents: List[RetrievalDocument]) -> int:
        docs = [doc for doc in list(documents or []) if list(doc.vector or [])]
        if not docs:
            return 0
        client, models = self._get_runtime()
        name = self._collection_name(collection)
        self._ensure_collection(collection, len(list(docs[0].vector or [])))
        points = []
        for index, document in enumerate(docs):
            points.append(
                models.PointStruct(
                    id=str(document.doc_id or index),
                    vector=list(document.vector or []),
                    payload={
                        "text": str(document.text or ""),
                        "metadata": dict(document.metadata or {}),
                    },
                )
            )
        client.upsert(collection_name=name, points=points)
        return len(points)

    def search(
        self,
        collection: str,
        *,
        query_text: str,
        query_vector: List[float],
        top_k: int = 5,
        filters: Dict[str, Any] | None = None,
    ) -> List[RetrievalResultItem]:
        client, models = self._get_runtime()
        name = self._collection_name(collection)
        qdrant_filter = None
        if filters:
            qdrant_filter = models.Filter(
                must=[
                    models.FieldCondition(
                        key=f"metadata.{key}",
                        match=models.MatchValue(value=value),
                    )
                    for key, value in dict(filters or {}).items()
                ]
            )
        results = client.search(
            collection_name=name,
            query_vector=list(query_vector or []),
            query_filter=qdrant_filter,
            limit=max(1, int(top_k or 1)),
        )
        items: List[RetrievalResultItem] = []
        for item in list(results or []):
            payload = dict(getattr(item, "payload", {}) or {})
            items.append(
                RetrievalResultItem(
                    doc_id=str(getattr(item, "id", "") or ""),
                    text=str(payload.get("text") or ""),
                    score=round(float(getattr(item, "score", 0.0) or 0.0), 6),
                    metadata=dict(payload.get("metadata") or {}),
                )
            )
        return items
