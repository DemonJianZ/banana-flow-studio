from __future__ import annotations

import hashlib
import math
import re
from abc import ABC, abstractmethod
from typing import List


_TOKEN_RE = re.compile(r"[a-z0-9_]+|[\u4e00-\u9fff]+", re.IGNORECASE)


class BaseEmbedder(ABC):
    @abstractmethod
    def embed_texts(self, texts: List[str]) -> List[List[float]]:
        raise NotImplementedError

    def embed_text(self, text: str) -> List[float]:
        return self.embed_texts([text])[0]


class HashEmbedder(BaseEmbedder):
    def __init__(self, dim: int = 16) -> None:
        self.dim = max(4, int(dim or 16))

    def embed_texts(self, texts: List[str]) -> List[List[float]]:
        return [self._embed_one(str(text or "")) for text in list(texts or [])]

    def _embed_one(self, text: str) -> List[float]:
        vec = [0.0] * self.dim
        tokens = [match.group(0).lower() for match in _TOKEN_RE.finditer(str(text or ""))]
        if not tokens:
            return vec
        for token in tokens:
            digest = hashlib.sha256(token.encode("utf-8")).digest()
            for index in range(self.dim):
                vec[index] += float(digest[index % len(digest)])
        norm = math.sqrt(sum(item * item for item in vec))
        if norm <= 0:
            return vec
        return [item / norm for item in vec]
