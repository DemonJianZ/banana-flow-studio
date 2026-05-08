from __future__ import annotations

import math
from abc import ABC, abstractmethod
from typing import Any, Dict, List

from .schemas import RetrievalDocument, RetrievalResultItem


class VectorStore(ABC):
    @abstractmethod
    def upsert(self, collection: str, documents: List[RetrievalDocument]) -> int:
        raise NotImplementedError

    @abstractmethod
    def search(
        self,
        collection: str,
        *,
        query_text: str,
        query_vector: List[float],
        top_k: int = 5,
        filters: Dict[str, Any] | None = None,
    ) -> List[RetrievalResultItem]:
        raise NotImplementedError


def _matches_filters(metadata: Dict[str, Any], filters: Dict[str, Any]) -> bool:
    for key, value in dict(filters or {}).items():
        if metadata.get(key) != value:
            return False
    return True


def _cosine_similarity(left: List[float], right: List[float]) -> float:
    if not left or not right or len(left) != len(right):
        return 0.0
    dot = sum(float(a) * float(b) for a, b in zip(left, right))
    left_norm = math.sqrt(sum(float(a) * float(a) for a in left))
    right_norm = math.sqrt(sum(float(b) * float(b) for b in right))
    if left_norm <= 0 or right_norm <= 0:
        return 0.0
    return dot / (left_norm * right_norm)


class InMemoryVectorStore(VectorStore):
    def __init__(self) -> None:
        self._collections: Dict[str, Dict[str, RetrievalDocument]] = {}

    def upsert(self, collection: str, documents: List[RetrievalDocument]) -> int:
        bucket = self._collections.setdefault(str(collection or "").strip(), {})
        written = 0
        for document in list(documents or []):
            bucket[str(document.doc_id)] = document
            written += 1
        return written

    def search(
        self,
        collection: str,
        *,
        query_text: str,
        query_vector: List[float],
        top_k: int = 5,
        filters: Dict[str, Any] | None = None,
    ) -> List[RetrievalResultItem]:
        bucket = self._collections.get(str(collection or "").strip(), {})
        items: List[RetrievalResultItem] = []
        query_terms = set(str(query_text or "").lower().split())
        for document in bucket.values():
            if not _matches_filters(document.metadata, dict(filters or {})):
                continue
            score = _cosine_similarity(list(document.vector or []), list(query_vector or []))
            if query_terms:
                text_terms = set(str(document.text or "").lower().split())
                overlap = len(query_terms & text_terms)
                if overlap > 0:
                    score += overlap / max(1.0, float(len(query_terms)))
            items.append(
                RetrievalResultItem(
                    doc_id=document.doc_id,
                    text=document.text,
                    score=round(float(score), 6),
                    metadata=dict(document.metadata or {}),
                )
            )
        items.sort(key=lambda item: (-float(item.score), item.doc_id))
        return items[: max(1, int(top_k or 1))]
