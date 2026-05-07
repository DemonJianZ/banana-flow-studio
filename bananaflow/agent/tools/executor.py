from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Optional

from .errors import AgentToolExecutionError, AgentToolNotFoundError, AgentToolValidationError
from .registry import AgentToolRegistry


REDACTED_KEYS = ("authorization", "token", "api_key", "cookie", "password", "secret")


def _is_redacted_key(key: str) -> bool:
    lowered = str(key or "").strip().lower()
    return any(marker in lowered for marker in REDACTED_KEYS)


def _truncate_string(text: str, limit: int = 240) -> str:
    value = str(text or "")
    if value.startswith("data:"):
        head = value[:48]
        return f"{head}...<truncated:{len(value)}>"
    if len(value) > limit:
        return f"{value[:limit]}...<truncated:{len(value)}>"
    return value


def _sanitize_trace_value(value: Any) -> Any:
    if isinstance(value, dict):
        out: Dict[str, Any] = {}
        for key, item in value.items():
            if item is None:
                continue
            key_text = str(key)
            if _is_redacted_key(key_text):
                out[key_text] = "<redacted>"
            else:
                out[key_text] = _sanitize_trace_value(item)
        return out
    if isinstance(value, list):
        return [_sanitize_trace_value(item) for item in value if item is not None]
    if isinstance(value, tuple):
        return [_sanitize_trace_value(item) for item in value if item is not None]
    if isinstance(value, str):
        return _truncate_string(value)
    return value


def _remove_none_values(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _remove_none_values(item) for key, item in value.items() if item is not None}
    if isinstance(value, list):
        return [_remove_none_values(item) for item in value if item is not None]
    if isinstance(value, tuple):
        return [_remove_none_values(item) for item in value if item is not None]
    return value


@dataclass
class AgentToolContext:
    req_id: str = "tool"
    session_id: Optional[str] = None
    session_summary_present: Optional[bool] = None
    tenant_id: Optional[str] = None
    user_id: Optional[str] = None
    trajectory_sink: list[Dict[str, Any]] = field(default_factory=list)
    trace_sink: list[Dict[str, Any]] = field(default_factory=list)
    plan_lookup: Optional[Callable[[str], Optional[Dict[str, Any]]]] = None
    extra: Dict[str, Any] = field(default_factory=dict)


@dataclass
class AgentToolResult:
    ok: bool
    tool_name: str
    canonical_tool_name: str
    output: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    error_type: Optional[str] = None
    latency_ms: int = 0
    retry_count: int = 0
    tool_version: str = ""
    tool_hash: str = ""
    exception: Optional[BaseException] = None


class AgentToolExecutor:
    def __init__(self, registry: AgentToolRegistry) -> None:
        self.registry = registry
        self._last_call_meta: Dict[str, Any] = {}

    def get_last_call_meta(self) -> Dict[str, Any]:
        return dict(self._last_call_meta)

    def execute(
        self,
        tool_name: str,
        args: Optional[Dict[str, Any]] = None,
        *,
        context: Optional[AgentToolContext] = None,
    ) -> Dict[str, Any]:
        result = self.safe_execute(tool_name, args, context=context)
        if not result.ok:
            exc = result.exception
            if isinstance(exc, (AgentToolExecutionError, AgentToolValidationError, AgentToolNotFoundError)):
                raise exc
            if exc is not None:
                raise AgentToolExecutionError(str(result.error or exc)) from exc
            raise AgentToolExecutionError(str(result.error or f"{tool_name} failed"))
        return dict(result.output or {})

    def safe_execute(
        self,
        tool_name: str,
        args: Optional[Dict[str, Any]] = None,
        *,
        context: Optional[AgentToolContext] = None,
    ) -> AgentToolResult:
        call_context = context or AgentToolContext()
        started = time.perf_counter()
        payload = _remove_none_values(dict(args or {}))
        attempts = 0
        last_error: Optional[BaseException] = None
        canonical_name = str(tool_name or "").strip()
        tool_version = ""
        tool_hash = ""
        max_attempts = 1

        try:
            entry = self.registry.get(tool_name)
            spec = entry.spec
            canonical_name = spec.name
            tool_version = spec.tool_version
            tool_hash = spec.tool_hash
            payload = spec.validate_input(payload)
            retry_cfg = dict(spec.retry or {})
            max_attempts = max(1, int(retry_cfg.get("max_attempts") or 1))
        except Exception as exc:
            latency_ms = max(0, int((time.perf_counter() - started) * 1000))
            error_text = str(exc)
            error_type = type(exc).__name__
            self._last_call_meta = {
                "tool_name": canonical_name,
                "tool_version": tool_version,
                "tool_hash": tool_hash,
                "req_id": call_context.req_id,
                "latency_ms": latency_ms,
                "retry_count": 0,
                "agent_tool_registry": True,
                "error": error_text,
            }
            self._append_trace(
                call_context,
                tool_name=tool_name,
                canonical_tool_name=canonical_name,
                ok=False,
                args=payload if isinstance(payload, dict) else {},
                output=None,
                error={"type": error_type, "message": error_text},
                latency_ms=latency_ms,
                retry_count=0,
            )
            return AgentToolResult(
                ok=False,
                tool_name=str(tool_name or "").strip(),
                canonical_tool_name=canonical_name,
                error=error_text,
                error_type=error_type,
                latency_ms=latency_ms,
                retry_count=0,
                tool_version=tool_version,
                tool_hash=tool_hash,
                exception=exc,
            )

        while attempts < max_attempts:
            attempts += 1
            try:
                result = entry.handler(dict(payload), call_context)
                if not isinstance(result, dict):
                    raise AgentToolExecutionError(f"{canonical_name} returned non-object result")
                output = dict(result)
                output.setdefault("tool_name", spec.name)
                output.setdefault("tool_version", spec.tool_version)
                output.setdefault("tool_hash", spec.tool_hash)
                latency_ms = max(0, int((time.perf_counter() - started) * 1000))
                retry_count = max(0, attempts - 1)
                self._last_call_meta = {
                    "tool_name": spec.name,
                    "tool_version": spec.tool_version,
                    "tool_hash": spec.tool_hash,
                    "req_id": call_context.req_id,
                    "latency_ms": latency_ms,
                    "retry_count": retry_count,
                    "agent_tool_registry": True,
                }
                self._append_trace(
                    call_context,
                    tool_name=tool_name,
                    canonical_tool_name=canonical_name,
                    ok=True,
                    args=payload,
                    output=output,
                    error=None,
                    latency_ms=latency_ms,
                    retry_count=retry_count,
                )
                return AgentToolResult(
                    ok=True,
                    tool_name=str(tool_name or "").strip(),
                    canonical_tool_name=canonical_name,
                    output=output,
                    latency_ms=latency_ms,
                    retry_count=retry_count,
                    tool_version=tool_version,
                    tool_hash=tool_hash,
                )
            except Exception as exc:
                last_error = exc
                if attempts >= max_attempts:
                    break

        latency_ms = max(0, int((time.perf_counter() - started) * 1000))
        retry_count = max(0, attempts - 1)
        error_text = str(last_error) if last_error is not None else f"{canonical_name} failed"
        error_type = type(last_error).__name__ if last_error is not None else "AgentToolExecutionError"
        self._last_call_meta = {
            "tool_name": canonical_name,
            "tool_version": tool_version,
            "tool_hash": tool_hash,
            "req_id": call_context.req_id,
            "latency_ms": latency_ms,
            "retry_count": retry_count,
            "agent_tool_registry": True,
            "error": error_text,
        }
        self._append_trace(
            call_context,
            tool_name=tool_name,
            canonical_tool_name=canonical_name,
            ok=False,
            args=payload,
            output=None,
            error={"type": error_type, "message": error_text},
            latency_ms=latency_ms,
            retry_count=retry_count,
        )
        return AgentToolResult(
            ok=False,
            tool_name=str(tool_name or "").strip(),
            canonical_tool_name=canonical_name,
            error=error_text,
            error_type=error_type,
            latency_ms=latency_ms,
            retry_count=retry_count,
            tool_version=tool_version,
            tool_hash=tool_hash,
            exception=last_error,
        )

    def _append_trace(
        self,
        context: AgentToolContext,
        *,
        tool_name: str,
        canonical_tool_name: str,
        ok: bool,
        args: Dict[str, Any],
        output: Optional[Dict[str, Any]],
        error: Optional[Dict[str, Any]],
        latency_ms: int,
        retry_count: int,
    ) -> None:
        context.trace_sink.append(
            {
                "type": "AGENT_TOOL_CALL",
                "req_id": context.req_id,
                "tool_name": str(tool_name or "").strip(),
                "canonical_tool_name": canonical_tool_name,
                "ok": bool(ok),
                "latency_ms": int(latency_ms),
                "retry_count": int(retry_count),
                "args": _sanitize_trace_value(args),
                "output": _sanitize_trace_value(output or {}) if ok else None,
                "error": _sanitize_trace_value(error or {}) if not ok else None,
            }
        )
