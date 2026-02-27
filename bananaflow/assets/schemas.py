from __future__ import annotations

from typing import List, Literal

from pydantic import BaseModel, Field


MatchBucket = Literal["best_match", "partial_match", "fallback"]


class AssetQuery(BaseModel):
    required_tags: List[str] = Field(default_factory=list)
    preferred_tags: List[str] = Field(default_factory=list)
    forbidden_tags: List[str] = Field(default_factory=list)
    type: str = ""
    aspect: str = "9:16"


class AssetCandidate(BaseModel):
    asset_id: str
    uri: str
    score: float
    bucket: MatchBucket
    reason: str
