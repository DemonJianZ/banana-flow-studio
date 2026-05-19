"""Fail-fast helpers for required configuration values."""
from __future__ import annotations


class MissingConfigError(RuntimeError):
    """Raised when a required configuration value is absent."""


def require_endpoint(name: str, url: str | None) -> str:
    """Return *url* stripped of trailing slash, or raise MissingConfigError.

    Use at route-handler call sites to turn a missing env var into a clear
    503 rather than a malformed URL silently sent to the wrong host.
    """
    value = str(url or "").strip()
    if not value:
        raise MissingConfigError(
            f"配置缺失：{name} 未设置，请在 .env 中配置"
        )
    return value.rstrip("/")
