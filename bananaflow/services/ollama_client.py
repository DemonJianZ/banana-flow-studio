from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from typing import Any, Iterable, Optional

try:
    import httpx  # type: ignore
except Exception:  # pragma: no cover - allow requests fallback in light envs
    httpx = None  # type: ignore

try:
    import requests  # type: ignore
except Exception:  # pragma: no cover - runtime may still provide httpx only
    requests = None  # type: ignore

try:
    from ..core.logging import sys_logger
except Exception:  # pragma: no cover - compatible with direct python bananaflow/main.py runs
    try:
        from core.logging import sys_logger
    except Exception:  # pragma: no cover - test environments may not install runtime deps
        class _FallbackLogger:
            def info(self, *args, **kwargs):
                return None

            def warning(self, *args, **kwargs):
                return None

            def error(self, *args, **kwargs):
                return None

        sys_logger = _FallbackLogger()


OLLAMA_MODEL_PREFIX = "ollama:"


def is_ollama_model(model: Optional[str]) -> bool:
    return str(model or "").strip().lower().startswith(OLLAMA_MODEL_PREFIX)


def normalize_ollama_model_name(model: Optional[str]) -> str:
    text = str(model or "").strip()
    if is_ollama_model(text):
        return text.split(":", 1)[1].strip()
    return text


def flatten_text_parts(value: Any) -> list[str]:
    parts: list[str] = []

    def _walk(item: Any) -> None:
        if item is None:
            return
        if isinstance(item, str):
            text = item.strip()
            if text:
                parts.append(text)
            return
        text = str(getattr(item, "text", "") or "").strip()
        if text:
            parts.append(text)
        if hasattr(item, "parts"):
            for sub in getattr(item, "parts", None) or []:
                _walk(sub)
            return
        if isinstance(item, dict):
            text = str(item.get("text") or "").strip()
            if text:
                parts.append(text)
            for sub in item.get("parts") or []:
                _walk(sub)
            return
        if isinstance(item, Iterable) and not isinstance(item, (bytes, bytearray)):
            for sub in item:
                _walk(sub)
            return

    _walk(value)
    return parts


def build_prompt_from_contents(contents: Any) -> str:
    return "\n\n".join(flatten_text_parts(contents)).strip()


def _config_value(config: Any, key: str) -> Any:
    if config is None:
        return None
    if isinstance(config, dict):
        return config.get(key)
    return getattr(config, key, None)


@dataclass
class OllamaResponsePart:
    text: str


@dataclass
class OllamaResponseContent:
    parts: list[OllamaResponsePart] = field(default_factory=list)


@dataclass
class OllamaResponseCandidate:
    content: OllamaResponseContent


@dataclass
class OllamaGenerateResponse:
    text: str
    raw: dict[str, Any] = field(default_factory=dict)
    candidates: list[OllamaResponseCandidate] = field(init=False)

    def __post_init__(self) -> None:
        self.candidates = [
            OllamaResponseCandidate(content=OllamaResponseContent(parts=[OllamaResponsePart(text=self.text)]))
        ]


class OllamaTextClient:
    def __init__(
        self,
        base_url: Optional[str] = None,
        timeout_sec: Optional[float] = None,
    ) -> None:
        raw_base_url = str(
            base_url
            or os.getenv("BANANAFLOW_OLLAMA_BASE_URL")
            or os.getenv("OLLAMA_HOST")
            or "http://127.0.0.1:11434"
        ).strip()
        if raw_base_url and not raw_base_url.startswith(("http://", "https://")):
            raw_base_url = f"http://{raw_base_url}"
        self.base_url = raw_base_url.rstrip("/")
        self.timeout_sec = max(1.0, float(timeout_sec or os.getenv("BANANAFLOW_OLLAMA_TIMEOUT_SEC") or 60.0))

    def is_available(self) -> bool:
        try:
            if httpx is not None:
                with httpx.Client(timeout=min(self.timeout_sec, 2.0), trust_env=False) as client:
                    resp = client.get(f"{self.base_url}/api/tags")
                    return bool(resp.status_code < 500)
            if requests is None:
                return False
            resp = requests.get(
                f"{self.base_url}/api/tags",
                timeout=min(self.timeout_sec, 2.0),
                proxies={"http": None, "https": None},
            )
            return bool(resp.status_code < 500)
        except Exception:
            return False

    def generate_content(self, model: str, contents: Any, config: Any = None) -> OllamaGenerateResponse:
        model_name = normalize_ollama_model_name(model)
        if not model_name:
            raise RuntimeError("ollama model name is empty")

        prompt = build_prompt_from_contents(contents)
        if not prompt:
            raise RuntimeError("ollama prompt is empty")

        payload: dict[str, Any] = {
            "model": model_name,
            "prompt": prompt,
            "stream": False,
        }

        options: dict[str, Any] = {}
        temperature = _config_value(config, "temperature")
        if temperature is not None:
            options["temperature"] = temperature
        top_p = _config_value(config, "top_p")
        if top_p is not None:
            options["top_p"] = top_p
        max_output_tokens = _config_value(config, "max_output_tokens")
        if max_output_tokens:
            options["num_predict"] = int(max_output_tokens)
        if options:
            payload["options"] = options

        response_mime_type = str(_config_value(config, "response_mime_type") or "").strip().lower()
        if response_mime_type == "application/json":
            payload["format"] = "json"

        if httpx is not None:
            with httpx.Client(timeout=self.timeout_sec, trust_env=False) as client:
                resp = client.post(f"{self.base_url}/api/generate", json=payload)
                resp_text = (resp.text or "").strip()
                if resp_text:
                    sys_logger.info(
                        f"[ollama] generate model={model_name} status={resp.status_code} "
                        f"raw={json.dumps(resp_text[:4000], ensure_ascii=False)}"
                    )
                else:
                    sys_logger.info(f"[ollama] generate model={model_name} status={resp.status_code} raw=<empty>")
                try:
                    resp.raise_for_status()
                except Exception as e:
                    sys_logger.warning(
                        f"[ollama] generate model={model_name} status={resp.status_code} "
                        f"error={e} raw={json.dumps(resp_text[:4000], ensure_ascii=False)}"
                    )
                    raise
                data = resp.json()
        else:
            if requests is None:
                raise RuntimeError("Neither httpx nor requests is available for Ollama client")
            resp = requests.post(
                f"{self.base_url}/api/generate",
                json=payload,
                timeout=self.timeout_sec,
                proxies={"http": None, "https": None},
            )
            resp_text = (getattr(resp, "text", "") or "").strip()
            if resp_text:
                sys_logger.info(
                    f"[ollama] generate model={model_name} status={resp.status_code} "
                    f"raw={json.dumps(resp_text[:4000], ensure_ascii=False)}"
                )
            else:
                sys_logger.info(f"[ollama] generate model={model_name} status={resp.status_code} raw=<empty>")
            try:
                resp.raise_for_status()
            except Exception as e:
                sys_logger.warning(
                    f"[ollama] generate model={model_name} status={resp.status_code} "
                    f"error={e} raw={json.dumps(resp_text[:4000], ensure_ascii=False)}"
                )
                raise
            data = resp.json()

        text = str(data.get("response") or "").strip()
        if not text:
            sys_logger.warning(
                f"[ollama] generate model={model_name} empty response payload={json.dumps(data, ensure_ascii=False, default=str)}"
            )
            raise RuntimeError("ollama returned empty response")
        return OllamaGenerateResponse(text=text, raw=(data if isinstance(data, dict) else {}))
