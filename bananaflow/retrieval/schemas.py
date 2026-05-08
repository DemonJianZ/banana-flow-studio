from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass(frozen=True)
class RetrievalDocument:
    doc_id: str
    text: str
    metadata: Dict[str, Any] = field(default_factory=dict)
    vector: Optional[List[float]] = None


@dataclass(frozen=True)
class RetrievalQuery:
    collection: str
    text: str
    top_k: int = 5
    filters: Dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class RetrievalResultItem:
    doc_id: str
    text: str
    score: float
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class RetrievalSearchResult:
    collection: str
    query: str
    items: List[RetrievalResultItem] = field(default_factory=list)
