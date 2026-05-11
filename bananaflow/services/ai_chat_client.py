from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import httpx

try:
    from ..core.config import AI_CHAT_DOWNSTREAM_URL, AI_CHAT_LANGUAGE_MODEL_ID
except Exception:  # pragma: no cover
    from core.config import AI_CHAT_DOWNSTREAM_URL, AI_CHAT_LANGUAGE_MODEL_ID


@dataclass
class AIChatTextResponse:
    text: str
    ai_chat_session_id: str = ""
    ai_chat_record_id: str = ""
    events: List[Dict[str, Any]] | None = None


def _coerce_json_payload(text: str) -> Dict[str, Any]:
    import json

    raw = str(text or "").strip()
    if not raw:
        return {}
    try:
        payload = json.loads(raw)
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def call_ai_chat_text(
    *,
    message: str,
    authorization: str,
    ai_chat_model_id: int = AI_CHAT_LANGUAGE_MODEL_ID,
    module_enum: int = 1,
    part_enum: int = 1,
    ai_chat_session_id: str = "",
    history_ai_chat_record_id: str = "",
    endpoint: str = "",
    timeout_seconds: float = 120.0,
) -> AIChatTextResponse:
    auth = str(authorization or "").strip()
    if not auth:
        raise ValueError("member_authorization_required")

    url = str(endpoint or AI_CHAT_DOWNSTREAM_URL or "").strip()
    if not url:
        raise RuntimeError("ai_chat_downstream_url_missing")

    data = {
        "module_enum": str(module_enum),
        "part_enum": str(part_enum),
        "ai_chat_model_id": str(ai_chat_model_id),
        "message": str(message or "").strip(),
    }
    if ai_chat_session_id:
        data["ai_chat_session_id"] = str(ai_chat_session_id)
    if history_ai_chat_record_id:
        data["history_ai_chat_record_id"] = str(history_ai_chat_record_id)

    headers = {
        "authorization": auth,
        "Accept": "text/event-stream",
    }
    text_parts: List[str] = []
    session_id = ""
    record_id = ""
    events: List[Dict[str, Any]] = []
    current_event = ""

    timeout = httpx.Timeout(timeout_seconds, connect=min(timeout_seconds, 30.0), read=timeout_seconds, write=60.0, pool=30.0)
    with httpx.Client(timeout=timeout, trust_env=False) as client:
        with client.stream("POST", url, headers=headers, data=data) as response:
            response.raise_for_status()
            for line in response.iter_lines():
                stripped = str(line or "").strip()
                if not stripped:
                    continue
                if stripped.startswith("event:"):
                    current_event = stripped[6:].strip().lower()
                    continue
                if not stripped.startswith("data:"):
                    continue
                payload = _coerce_json_payload(stripped[5:].strip())
                if current_event == "init":
                    session_id = str(payload.get("aiChatSessionId") or session_id or "")
                    record_id = str(payload.get("aiChatRecordId") or record_id or "")
                elif current_event == "data":
                    chunk = str(payload.get("content") or "")
                    if chunk:
                        text_parts.append(chunk)
                events.append({"event": current_event or "data", "data": payload})

    return AIChatTextResponse(
        text="".join(text_parts).strip(),
        ai_chat_session_id=session_id,
        ai_chat_record_id=record_id,
        events=events,
    )
