from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class ObservabilityConfig:
    provider: str = "none"
    langfuse_public_key: str = ""
    langfuse_secret_key: str = ""
    langfuse_host: str = ""
    langsmith_api_key: str = ""
    langsmith_project: str = ""
    langsmith_endpoint: str = ""


def load_observability_config() -> ObservabilityConfig:
    return ObservabilityConfig(
        provider=str(os.getenv("OBS_PROVIDER", "none") or "none").strip().lower(),
        langfuse_public_key=str(os.getenv("LANGFUSE_PUBLIC_KEY", "") or "").strip(),
        langfuse_secret_key=str(os.getenv("LANGFUSE_SECRET_KEY", "") or "").strip(),
        langfuse_host=str(os.getenv("LANGFUSE_HOST", "") or "").strip(),
        langsmith_api_key=str(os.getenv("LANGSMITH_API_KEY", "") or "").strip(),
        langsmith_project=str(os.getenv("LANGSMITH_PROJECT", "") or "").strip(),
        langsmith_endpoint=str(os.getenv("LANGSMITH_ENDPOINT", "") or "").strip(),
    )
