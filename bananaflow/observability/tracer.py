from __future__ import annotations

import contextlib
import re
import uuid
from typing import Any, Dict, Iterator, Optional

from .config import ObservabilityConfig, load_observability_config
from .providers import BaseObservabilityProvider, NoopProvider, create_provider


REDACTED_KEYS = ("authorization", "token", "api_key", "cookie", "password", "secret")
MAX_DEPTH = 4
MAX_ITEMS = 20
MAX_STRING = 240
_BASE64_RE = re.compile(r"^[A-Za-z0-9+/=]+$")


def _is_redacted_key(key: str) -> bool:
    lowered = str(key or "").strip().lower()
    return any(marker in lowered for marker in REDACTED_KEYS)


def _sanitize_string(text: str) -> str:
    value = str(text or "")
    if value.startswith("data:"):
        head = value[:48]
        return f"{head}...<truncated:{len(value)}>"
    if len(value) >= 128 and _BASE64_RE.match(value):
        return f"{value[:24]}...<truncated-base64:{len(value)}>"
    if len(value) > MAX_STRING:
        return f"{value[:MAX_STRING]}...<truncated:{len(value)}>"
    return value


def sanitize_observability_value(value: Any, *, depth: int = 0) -> Any:
    if depth >= MAX_DEPTH:
        return "<max-depth>"
    if isinstance(value, dict):
        out: Dict[str, Any] = {}
        for index, (key, item) in enumerate(value.items()):
            if index >= MAX_ITEMS:
                out["<truncated_keys>"] = len(value) - MAX_ITEMS
                break
            key_text = str(key)
            if item is None:
                continue
            if _is_redacted_key(key_text):
                out[key_text] = "<redacted>"
            else:
                out[key_text] = sanitize_observability_value(item, depth=depth + 1)
        return out
    if isinstance(value, list):
        out = [sanitize_observability_value(item, depth=depth + 1) for item in value[:MAX_ITEMS] if item is not None]
        if len(value) > MAX_ITEMS:
            out.append(f"<truncated_items:{len(value) - MAX_ITEMS}>")
        return out
    if isinstance(value, tuple):
        items = list(value)
        out = [sanitize_observability_value(item, depth=depth + 1) for item in items[:MAX_ITEMS] if item is not None]
        if len(items) > MAX_ITEMS:
            out.append(f"<truncated_items:{len(items) - MAX_ITEMS}>")
        return out
    if isinstance(value, str):
        return _sanitize_string(value)
    return value


class NoopTracer:
    provider_name = "none"

    def start_run(
        self,
        name: str,
        *,
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

    @contextlib.contextmanager
    def span(
        self,
        name: str,
        *,
        run_id: str,
        input_data: Any = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Iterator[Optional[str]]:
        yield None

    def generation(
        self,
        name: str,
        *,
        run_id: str,
        model: Optional[str] = None,
        input_data: Any = None,
        output_data: Any = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        return None

    def tool_call(
        self,
        tool_name: str,
        *,
        run_id: str,
        input_data: Any = None,
        output_data: Any = None,
        error: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        return None

    def score(
        self,
        name: str,
        *,
        run_id: str,
        value: float,
        comment: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        return None


class ObservabilityTracer:
    def __init__(self, provider: BaseObservabilityProvider, config: ObservabilityConfig) -> None:
        self.provider = provider
        self.config = config
        self.provider_name = getattr(provider, "provider_name", "none")

    def start_run(
        self,
        name: str,
        *,
        input_data: Any = None,
        metadata: Optional[Dict[str, Any]] = None,
        run_id: Optional[str] = None,
        tags: Optional[list[str]] = None,
    ) -> str:
        return self.provider.start_run(
            name=name,
            input_data=sanitize_observability_value(input_data),
            metadata=sanitize_observability_value(metadata or {}),
            run_id=run_id,
            tags=list(tags or []),
        )

    def end_run(
        self,
        run_id: str,
        *,
        output_data: Any = None,
        error: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        self.provider.end_run(
            run_id,
            output_data=sanitize_observability_value(output_data),
            error=_sanitize_string(error or "") if error else None,
            metadata=sanitize_observability_value(metadata or {}),
        )

    @contextlib.contextmanager
    def span(
        self,
        name: str,
        *,
        run_id: str,
        input_data: Any = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Iterator[str]:
        span_id = self.provider.start_span(
            run_id=run_id,
            name=name,
            input_data=sanitize_observability_value(input_data),
            metadata=sanitize_observability_value(metadata or {}),
        )
        try:
            yield span_id
        except Exception as exc:
            self.provider.end_span(
                span_id,
                error=_sanitize_string(str(exc)),
                metadata=sanitize_observability_value(metadata or {}),
            )
            raise
        else:
            self.provider.end_span(
                span_id,
                metadata=sanitize_observability_value(metadata or {}),
            )

    def generation(
        self,
        name: str,
        *,
        run_id: str,
        model: Optional[str] = None,
        input_data: Any = None,
        output_data: Any = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        self.provider.generation(
            run_id=run_id,
            name=name,
            model=model,
            input_data=sanitize_observability_value(input_data),
            output_data=sanitize_observability_value(output_data),
            metadata=sanitize_observability_value(metadata or {}),
        )

    def tool_call(
        self,
        tool_name: str,
        *,
        run_id: str,
        input_data: Any = None,
        output_data: Any = None,
        error: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        self.provider.tool_call(
            run_id=run_id,
            tool_name=tool_name,
            input_data=sanitize_observability_value(input_data),
            output_data=sanitize_observability_value(output_data),
            error=_sanitize_string(error or "") if error else None,
            metadata=sanitize_observability_value(metadata or {}),
        )

    def score(
        self,
        name: str,
        *,
        run_id: str,
        value: float,
        comment: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        self.provider.score(
            run_id=run_id,
            name=name,
            value=float(value),
            comment=_sanitize_string(comment or "") if comment else None,
            metadata=sanitize_observability_value(metadata or {}),
        )


def build_tracer(config: Optional[ObservabilityConfig] = None) -> ObservabilityTracer | NoopTracer:
    cfg = config or load_observability_config()
    if str(cfg.provider or "none").strip().lower() == "none":
        return NoopTracer()
    return ObservabilityTracer(create_provider(cfg), cfg)


_DEFAULT_TRACER: Optional[ObservabilityTracer | NoopTracer] = None


def get_tracer() -> ObservabilityTracer | NoopTracer:
    global _DEFAULT_TRACER
    if _DEFAULT_TRACER is None:
        _DEFAULT_TRACER = build_tracer()
    return _DEFAULT_TRACER


def reset_tracer_cache() -> None:
    global _DEFAULT_TRACER
    _DEFAULT_TRACER = None
