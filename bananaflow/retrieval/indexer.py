from __future__ import annotations

from typing import List

from .embeddings import BaseEmbedder, HashEmbedder
from .schemas import RetrievalDocument
from .vector_store import VectorStore


class RetrievalIndexer:
    def __init__(self, vector_store: VectorStore, *, embedder: BaseEmbedder | None = None) -> None:
        self.vector_store = vector_store
        self.embedder = embedder or HashEmbedder()

    def index_documents(self, collection: str, documents: List[RetrievalDocument]) -> int:
        docs = list(documents or [])
        pending = [doc for doc in docs if not list(doc.vector or [])]
        if pending:
            vectors = self.embedder.embed_texts([doc.text for doc in pending])
            enriched: List[RetrievalDocument] = []
            vector_by_id = {doc.doc_id: vector for doc, vector in zip(pending, vectors)}
            for doc in docs:
                enriched.append(
                    RetrievalDocument(
                        doc_id=doc.doc_id,
                        text=doc.text,
                        metadata=dict(doc.metadata or {}),
                        vector=list(doc.vector or vector_by_id.get(doc.doc_id) or []),
                    )
                )
            docs = enriched
        return self.vector_store.upsert(str(collection or "").strip(), docs)
