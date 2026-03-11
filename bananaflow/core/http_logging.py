import json
import os
import time
import uuid
from typing import Mapping

from fastapi import FastAPI
from starlette.datastructures import Headers
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from core.logging import sys_logger


_SENSITIVE_HEADERS = {
    "authorization",
    "cookie",
    "set-cookie",
    "x-api-key",
    "proxy-authorization",
}
_TEXTUAL_CONTENT_TYPES = (
    "application/json",
    "application/xml",
    "application/x-www-form-urlencoded",
    "application/javascript",
    "application/problem+json",
    "application/graphql",
)
_BINARY_CONTENT_TYPE_PREFIXES = (
    "image/",
    "video/",
    "audio/",
    "font/",
)
_BINARY_CONTENT_TYPES = {
    "application/octet-stream",
    "application/pdf",
    "application/zip",
    "application/x-zip-compressed",
    "application/vnd.openxmlformats-officedocument",
    "application/msword",
    "application/vnd.ms-excel",
}


def _env_int(name: str, default: int) -> int:
    try:
        return int(str(os.getenv(name, default)).strip())
    except Exception:
        return default


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "on"}:
        return True
    if text in {"0", "false", "no", "off"}:
        return False
    return default


def _content_type_base(content_type: str | None) -> str:
    return str(content_type or "").split(";", 1)[0].strip().lower()


def _is_textual_content_type(content_type: str | None) -> bool:
    content_type = _content_type_base(content_type)
    return content_type.startswith("text/") or content_type in _TEXTUAL_CONTENT_TYPES


def _is_binary_content_type(content_type: str | None) -> bool:
    content_type = _content_type_base(content_type)
    if not content_type:
        return False
    if content_type.startswith(_BINARY_CONTENT_TYPE_PREFIXES):
        return True
    return any(item in content_type for item in _BINARY_CONTENT_TYPES)


def _truncate_text(text: str, max_chars: int) -> str:
    if max_chars <= 0:
        return ""
    if len(text) <= max_chars:
        return text
    remaining = len(text) - max_chars
    return f"{text[:max_chars]}...<truncated {remaining} chars>"


def _sanitize_headers(headers: Mapping[str, str] | None) -> dict[str, str]:
    sanitized: dict[str, str] = {}
    for key, value in dict(headers or {}).items():
        lowered = str(key).lower()
        sanitized[str(key)] = "<redacted>" if lowered in _SENSITIVE_HEADERS else str(value)
    return sanitized


def _normalize_text_body(body_bytes: bytes, content_type: str | None, max_chars: int) -> str:
    text = body_bytes.decode("utf-8", errors="replace")
    if _content_type_base(content_type) == "application/json":
        try:
            text = json.dumps(json.loads(text), ensure_ascii=False, separators=(",", ":"))
        except Exception:
            pass
    return _truncate_text(text, max_chars)


def _render_body_preview(
    body_bytes: bytes | None,
    content_type: str | None,
    max_chars: int,
    total_bytes: int | None = None,
    was_skipped: bool = False,
) -> str:
    content_type = _content_type_base(content_type)
    total = len(body_bytes or b"") if total_bytes is None else int(total_bytes)
    if was_skipped:
        return f"<body omitted content_type={content_type or 'unknown'} bytes={total}>"
    if not body_bytes:
        return ""
    if "multipart/form-data" in content_type:
        return f"<multipart omitted bytes={total}>"
    if _is_binary_content_type(content_type):
        return f"<binary omitted content_type={content_type or 'unknown'} bytes={total}>"
    if _is_textual_content_type(content_type):
        preview = _normalize_text_body(body_bytes, content_type, max_chars)
        if total > len(body_bytes):
            preview = f"{preview}...<truncated_bytes total={total}>"
        return preview
    return f"<non-text omitted content_type={content_type or 'unknown'} bytes={total}>"


def _build_log_line(prefix: str, payload: dict) -> str:
    return f"{prefix} {json.dumps(payload, ensure_ascii=False, separators=(',', ':'))}"


def _headers_from_scope(scope: Scope) -> Headers:
    return Headers(raw=scope.get("headers") or [])


def _scope_query_string(scope: Scope) -> str:
    return (scope.get("query_string") or b"").decode("utf-8", errors="replace")


class HttpTrafficLogMiddleware:
    def __init__(self, app: ASGIApp, max_body_chars: int, max_capture_bytes: int):
        self.app = app
        self.max_body_chars = max_body_chars
        self.max_capture_bytes = max_capture_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        state = scope.setdefault("state", {})
        req_id = str(state.get("req_id") or "") or str(uuid.uuid4())[:8]
        state["req_id"] = req_id
        started = time.perf_counter()

        request_headers = _headers_from_scope(scope)
        request_content_type = request_headers.get("content-type", "")
        request_content_length = int(request_headers.get("content-length", "0") or 0)
        skip_request_body = (
            "multipart/form-data" in request_content_type.lower() or request_content_length > self.max_capture_bytes
        )

        request_body = b""
        receive_for_app: Receive = receive
        if not skip_request_body:
            body_chunks = []
            disconnected = False
            more_body = True
            while more_body:
                message = await receive()
                if message["type"] == "http.disconnect":
                    disconnected = True
                    break
                chunk = message.get("body", b"")
                if chunk:
                    body_chunks.append(chunk)
                more_body = bool(message.get("more_body", False))
            request_body = b"".join(body_chunks)
            request_replayed = False

            async def receive_for_app() -> Message:
                nonlocal request_replayed
                if request_replayed:
                    if disconnected:
                        return {"type": "http.disconnect"}
                    return {"type": "http.request", "body": b"", "more_body": False}
                request_replayed = True
                return {"type": "http.request", "body": request_body, "more_body": False}

        req_payload = {
            "req_id": req_id,
            "method": scope.get("method", ""),
            "path": scope.get("path", ""),
            "query": _scope_query_string(scope),
            "client": (scope.get("client") or [""])[0],
            "headers": _sanitize_headers(request_headers),
            "content_type": request_content_type,
            "body": _render_body_preview(
                request_body,
                request_content_type,
                self.max_body_chars,
                total_bytes=request_content_length if request_content_length > 0 else len(request_body),
                was_skipped=skip_request_body,
            ),
        }
        sys_logger.info(_build_log_line(f"[{req_id}] http.request", req_payload))

        response_status = 500
        response_headers: dict[str, str] = {}
        response_preview = bytearray()
        response_total_bytes = 0
        response_logged = False

        async def send_wrapper(message: Message) -> None:
            nonlocal response_status, response_headers, response_total_bytes, response_logged
            if message["type"] == "http.response.start":
                raw_headers = list(message.get("headers") or [])
                if not any(key.lower() == b"x-request-id" for key, _ in raw_headers):
                    raw_headers.append((b"x-request-id", req_id.encode("latin-1")))
                message = {**message, "headers": raw_headers}
                response_status = int(message.get("status", 500))
                response_headers = _sanitize_headers(
                    {
                        key.decode("latin-1"): value.decode("latin-1")
                        for key, value in (message.get("headers") or [])
                    }
                )
            elif message["type"] == "http.response.body":
                body = message.get("body", b"") or b""
                response_total_bytes += len(body)
                if len(response_preview) < self.max_capture_bytes:
                    response_preview.extend(body[: self.max_capture_bytes - len(response_preview)])
                if not message.get("more_body", False) and not response_logged:
                    response_logged = True
                    response_content_type = response_headers.get("content-type", "")
                    res_payload = {
                        "req_id": req_id,
                        "method": scope.get("method", ""),
                        "path": scope.get("path", ""),
                        "status_code": response_status,
                        "duration_ms": round((time.perf_counter() - started) * 1000, 2),
                        "headers": response_headers,
                        "content_type": response_content_type,
                        "body": _render_body_preview(
                            bytes(response_preview),
                            response_content_type,
                            self.max_body_chars,
                            total_bytes=response_total_bytes,
                            was_skipped=response_total_bytes > self.max_capture_bytes
                            and not _is_textual_content_type(response_content_type),
                        ),
                    }
                    sys_logger.info(_build_log_line(f"[{req_id}] http.response", res_payload))
            await send(message)

        try:
            await self.app(scope, receive_for_app, send_wrapper)
        except Exception as exc:
            err_payload = {
                "req_id": req_id,
                "method": scope.get("method", ""),
                "path": scope.get("path", ""),
                "duration_ms": round((time.perf_counter() - started) * 1000, 2),
                "error": str(exc),
            }
            sys_logger.error(_build_log_line(f"[{req_id}] http.response_error", err_payload))
            raise


def install_http_logging(app: FastAPI) -> None:
    if not _env_bool("BANANAFLOW_HTTP_LOG_ENABLED", default=True):
        return

    app.add_middleware(
        HttpTrafficLogMiddleware,
        max_body_chars=_env_int("BANANAFLOW_HTTP_LOG_MAX_BODY_CHARS", 4000),
        max_capture_bytes=max(1024, _env_int("BANANAFLOW_HTTP_LOG_MAX_CAPTURE_BYTES", 65536)),
    )
