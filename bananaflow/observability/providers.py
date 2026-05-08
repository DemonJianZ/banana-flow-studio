from __future__ import annotations

import uuid
from typing import Any, Dict, Optional

from .config import ObservabilityConfig


class BaseObservabilityProvider:
    provider_name = "none"

    def start_run(
        self,
        *,
        name: str,
        input_data: Any = None,
        metadata: Optional[Dict[str, Any]] = None,
        run_id: Optional[str] = None,
        tags: Optional[list[str]] = None,
    ) -> str:
        return str(run_id or uuid.uuid4())

    def end_run(
        self,
        run_id: str,
        *,
        output_data: Any = None,
        error: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        return None

    def start_span(
        self,
        *,
        run_id: str,
        name: str,
        input_data: Any = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        return str(uuid.uuid4())

    def end_span(
        self,
        span_id: str,
        *,
        output_data: Any = None,
        error: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        return None

    def generation(
        self,
        *,
        run_id: str,
        name: str,
        model: Optional[str] = None,
        input_data: Any = None,
        output_data: Any = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        return None

    def tool_call(
        self,
        *,
        run_id: str,
        tool_name: str,
        input_data: Any = None,
        output_data: Any = None,
        error: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        return None

    def score(
        self,
        *,
        run_id: str,
        name: str,
        value: float,
        comment: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        return None


class NoopProvider(BaseObservabilityProvider):
    provider_name = "none"


class LangfuseProvider(BaseObservabilityProvider):
    provider_name = "langfuse"

    def __init__(self, config: ObservabilityConfig) -> None:
        self.config = config
        self._client = None
        try:
            from langfuse import Langfuse  # type: ignore

            kwargs: Dict[str, Any] = {}
            if config.langfuse_public_key:
                kwargs["public_key"] = config.langfuse_public_key
            if config.langfuse_secret_key:
                kwargs["secret_key"] = config.langfuse_secret_key
            if config.langfuse_host:
                kwargs["host"] = config.langfuse_host
            self._client = Langfuse(**kwargs)
        except Exception:
            self._client = None


class LangsmithProvider(BaseObservabilityProvider):
    provider_name = "langsmith"

    def __init__(self, config: ObservabilityConfig) -> None:
        self.config = config
        self._client = None
        try:
            from langsmith import Client  # type: ignore

            kwargs: Dict[str, Any] = {}
            if config.langsmith_api_key:
                kwargs["api_key"] = config.langsmith_api_key
            if config.langsmith_endpoint:
                kwargs["api_url"] = config.langsmith_endpoint
            self._client = Client(**kwargs)
        except Exception:
            self._client = None


def create_provider(config: ObservabilityConfig) -> BaseObservabilityProvider:
    provider_name = str(config.provider or "none").strip().lower()
    if provider_name == "langfuse":
        return LangfuseProvider(config)
    if provider_name == "langsmith":
        return LangsmithProvider(config)
    return NoopProvider()
