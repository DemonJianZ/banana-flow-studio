from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Optional

try:
    import httpx  # type: ignore
except Exception:  # pragma: no cover
    httpx = None  # type: ignore

try:
    from ..core.deepseek_config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_TIMEOUT_SEC
    from ..core.logging import sys_logger
    from .ollama_client import build_prompt_from_contents
except Exception:  # pragma: no cover - compatible with direct python bananaflow/main.py runs
    from core.deepseek_config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_TIMEOUT_SEC
    from core.logging import sys_logger
    from services.ollama_client import build_prompt_from_contents

DEEPSEEK_MODEL_PREFIX = "deepseek:"
DEEPSEEK_MODEL_NAMES = {
    "deepseek-v4-flash",
    "deepseek-v4-pro",
    "deepseek-chat",
    "deepseek-reasoner",
}


def is_deepseek_model(model: Optional[str]) -> bool:
    text = str(model or "").strip().lower()
    return text.startswith(DEEPSEEK_MODEL_PREFIX) or text in DEEPSEEK_MODEL_NAMES


def normalize_deepseek_model_name(model: Optional[str]) -> str:
    text = str(model or "").strip()
    if text.lower().startswith(DEEPSEEK_MODEL_PREFIX):
        return text.split(":", 1)[1].strip()
    return text


def _config_value(config: Any, key: str) -> Any:
    if config is None:
        return None
    if isinstance(config, dict):
        return config.get(key)
    return getattr(config, key, None)


@dataclass
class DeepSeekResponsePart:
    text: str


@dataclass
class DeepSeekResponseContent:
    parts: list[DeepSeekResponsePart] = field(default_factory=list)


@dataclass
class DeepSeekResponseCandidate:
    content: DeepSeekResponseContent


@dataclass
class DeepSeekGenerateResponse:
    text: str
    raw: dict[str, Any] = field(default_factory=dict)
    candidates: list[DeepSeekResponseCandidate] = field(init=False)

    def __post_init__(self) -> None:
        self.candidates = [
            DeepSeekResponseCandidate(content=DeepSeekResponseContent(parts=[DeepSeekResponsePart(text=self.text)]))
        ]


class DeepSeekTextClient:
    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout_sec: Optional[float] = None,
    ) -> None:
        self.api_key = str(api_key or DEEPSEEK_API_KEY or "").strip()
        self.base_url = str(base_url or DEEPSEEK_BASE_URL or "https://api.deepseek.com").strip().rstrip("/")
        self.timeout_sec = max(1.0, float(timeout_sec or DEEPSEEK_TIMEOUT_SEC or 120.0))

    def is_available(self) -> bool:
        return bool(self.api_key and self.base_url and httpx is not None)

    def generate_content(self, model: str, contents: Any, config: Any = None) -> DeepSeekGenerateResponse:
        if httpx is None:
            raise RuntimeError("httpx is unavailable for DeepSeek client")
        if not self.api_key:
            raise RuntimeError("DEEPSEEK_API_KEY is not configured")

        model_name = normalize_deepseek_model_name(model)
        if not model_name:
            raise RuntimeError("DeepSeek model name is empty")

        prompt = build_prompt_from_contents(contents)
        if not prompt:
            raise RuntimeError("DeepSeek prompt is empty")

        payload: dict[str, Any] = {
            "model": model_name,
            "messages": [{"role": "user", "content": prompt}],
            "stream": False,
        }
        temperature = _config_value(config, "temperature")
        if temperature is not None:
            payload["temperature"] = temperature
        top_p = _config_value(config, "top_p")
        if top_p is not None:
            payload["top_p"] = top_p
        max_output_tokens = _config_value(config, "max_output_tokens")
        if max_output_tokens and int(max_output_tokens) > 0:
            payload["max_tokens"] = int(max_output_tokens)
        response_mime_type = str(_config_value(config, "response_mime_type") or "").strip().lower()
        if response_mime_type == "application/json":
            payload["response_format"] = {"type": "json_object"}

        url = f"{self.base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        with httpx.Client(timeout=self.timeout_sec, trust_env=False) as client:
            resp = client.post(url, headers=headers, json=payload)
            resp_text = (resp.text or "").strip()
            if resp_text:
                sys_logger.info(
                    f"[deepseek] chat model={model_name} status={resp.status_code} "
                    f"raw={json.dumps(resp_text[:4000], ensure_ascii=False)}"
                )
            try:
                resp.raise_for_status()
            except Exception as exc:
                sys_logger.warning(
                    f"[deepseek] chat model={model_name} status={resp.status_code} "
                    f"error={exc} raw={json.dumps(resp_text[:4000], ensure_ascii=False)}"
                )
                raise
            data = resp.json()

        text = str(data.get("choices", [{}])[0].get("message", {}).get("content") or "").strip()
        if not text:
            raise RuntimeError(f"DeepSeek returned empty response: {json.dumps(data, ensure_ascii=False, default=str)[:2000]}")
        return DeepSeekGenerateResponse(text=text, raw=data)

