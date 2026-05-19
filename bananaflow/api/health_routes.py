"""Health check endpoints: /healthz (liveness) and /readyz (readiness)."""
from __future__ import annotations

import os
import tempfile
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import APIRouter

from core.config import COMFYUI_URL, AI_CHAT_DOWNSTREAM_URL, DATA_DIR, API_KEY

health_router = APIRouter()

_DATA_DIR = DATA_DIR
_COMFYUI_URL = COMFYUI_URL
_AI_CHAT_URL = AI_CHAT_DOWNSTREAM_URL
_GEMINI_KEY = API_KEY or ""
_JWT_DEFAULT = "bananaflow_dev_secret"
_JWT_SECRET = os.getenv("JWT_SECRET", _JWT_DEFAULT)
_PROBE_TIMEOUT = 0.5  # seconds


@health_router.get("/healthz")
def healthz() -> dict[str, Any]:
    return {"status": "ok", "timestamp": _now()}


@health_router.get("/readyz")
def readyz() -> Any:
    from fastapi.responses import JSONResponse

    checks: dict[str, Any] = {}

    # 1. SQLite data dir writable
    checks["sqlite_writable"] = _check_sqlite_writable()

    # 2. JWT secret is not development default
    checks["jwt_secret"] = _check_jwt_secret()

    # 3. External deps (skip if not configured)
    checks["comfyui"] = _check_http_reachable("comfyui", _COMFYUI_URL)
    checks["ai_chat_downstream"] = _check_http_reachable("ai_chat_downstream", _AI_CHAT_URL)
    checks["gemini_key"] = _check_gemini_key()

    # Determine overall status
    statuses = {c["status"] for c in checks.values()}
    if "error" in statuses:
        overall = "not_ready"
        http_code = 503
    elif "degraded" in statuses:
        overall = "degraded"
        http_code = 200
    else:
        overall = "ok"
        http_code = 200

    body = {"status": overall, "timestamp": _now(), "checks": checks}
    return JSONResponse(content=body, status_code=http_code)


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _check_sqlite_writable() -> dict[str, Any]:
    import bananaflow.api.health_routes as _self
    data_dir = _self._DATA_DIR
    try:
        os.makedirs(data_dir, exist_ok=True)
        fd, path = tempfile.mkstemp(dir=data_dir, prefix=".readyz_")
        os.close(fd)
        os.unlink(path)
        return {"status": "ok"}
    except Exception as exc:
        return {"status": "error", "reason": str(exc)}


def _check_jwt_secret() -> dict[str, Any]:
    import bananaflow.api.health_routes as _self
    if _self._JWT_SECRET == _self._JWT_DEFAULT:
        return {"status": "degraded", "reason": "development default secret — set JWT_SECRET in production"}
    return {"status": "ok"}


def _check_http_reachable(name: str, url: str) -> dict[str, Any]:
    url = str(url or "").strip()
    if not url:
        return {"status": "skip", "reason": f"{name} not configured"}
    try:
        with httpx.Client(timeout=_PROBE_TIMEOUT) as client:
            client.get(url)
        return {"status": "ok"}
    except httpx.TimeoutException:
        return {"status": "degraded", "reason": f"{url} did not respond within {_PROBE_TIMEOUT}s"}
    except Exception as exc:
        return {"status": "degraded", "reason": str(exc)}


def _check_gemini_key() -> dict[str, Any]:
    import bananaflow.api.health_routes as _self
    key = str(_self._GEMINI_KEY or "").strip()
    if not key:
        return {"status": "skip", "reason": "GEMINI_API_KEY / GOOGLE_API_KEY not set"}
    return {"status": "ok"}
