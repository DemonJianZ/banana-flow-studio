import os
import time
from contextlib import contextmanager
from typing import Optional

try:
    from google import genai  # type: ignore
except Exception:  # pragma: no cover - allow ollama-only runtime
    genai = None  # type: ignore

try:
    from ..core.config import API_KEY, PROJECT_ID, LOCATION, MODEL_AGENT, MODEL_GEMINI
    from ..core.logging import sys_logger
    from .ollama_client import OllamaTextClient, is_ollama_model
except Exception:  # pragma: no cover - compatible with direct python bananaflow/main.py runs
    from core.config import API_KEY, PROJECT_ID, LOCATION, MODEL_AGENT, MODEL_GEMINI
    from core.logging import sys_logger
    from services.ollama_client import OllamaTextClient, is_ollama_model

_client = None


@contextmanager
def _temporary_proxy_env(http_proxy=None, https_proxy=None):
    keys = ("http_proxy", "https_proxy", "HTTP_PROXY", "HTTPS_PROXY")
    old_env = {key: os.environ.get(key) for key in keys}
    try:
        if http_proxy:
            os.environ["http_proxy"] = http_proxy
            os.environ["HTTP_PROXY"] = http_proxy
        if https_proxy:
            os.environ["https_proxy"] = https_proxy
            os.environ["HTTPS_PROXY"] = https_proxy
        yield
    finally:
        for key, value in old_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


def _build_google_client():
    if genai is None:
        raise RuntimeError("google-genai is unavailable")
    if API_KEY:
        return genai.Client(api_key=API_KEY)
    return genai.Client(vertexai=True, project=PROJECT_ID, location=LOCATION)


def _ollama_requested() -> bool:
    if str(os.getenv("BANANAFLOW_OLLAMA_ENABLE") or "").strip().lower() in {"1", "true", "yes", "on"}:
        return True

    if is_ollama_model(MODEL_AGENT):
        return True

    env_keys = (
        "MODEL_AGENT",
        "MODEL_PROMPT_POLISH",
        "MODEL_AGENT_CHAT",
        "IDEA_SCRIPT_DEFAULT_MODEL",
        "IDEA_SCRIPT_INFERENCE_MODEL",
        "IDEA_SCRIPT_GENERATION_MODEL",
        "IDEA_SCRIPT_RISK_SCAN_MODEL",
        "IDEA_SCRIPT_SAFE_REWRITE_MODEL",
        "IDEA_SCRIPT_SCORE_MODEL",
        "IDEA_SCRIPT_STORYBOARD_GENERATE_MODEL",
    )
    return any(is_ollama_model(os.getenv(key)) for key in env_keys)


class _UnifiedModelsAdapter:
    def __init__(self, google_client=None, ollama_client: Optional[OllamaTextClient] = None) -> None:
        self.google_client = google_client
        self.ollama_client = ollama_client

    def generate_content(self, model, contents, config):
        if is_ollama_model(model):
            if self.ollama_client is None:
                raise RuntimeError("Ollama client not initialized")
            return self.ollama_client.generate_content(model=model, contents=contents, config=config)

        if self.google_client is None:
            raise RuntimeError("Google GenAI client not initialized")
        return self.google_client.models.generate_content(model=model, contents=contents, config=config)


class UnifiedGenAIClient:
    def __init__(self, google_client=None, ollama_client: Optional[OllamaTextClient] = None) -> None:
        self.models = _UnifiedModelsAdapter(google_client=google_client, ollama_client=ollama_client)


def _build_client():
    google_client = None
    ollama_client = None

    try:
        google_client = _build_google_client()
    except Exception as e:
        sys_logger.warning(f"Google GenAI client init skipped: {e}")

    if _ollama_requested():
        try:
            candidate = OllamaTextClient()
            if candidate.is_available():
                ollama_client = candidate
            else:
                sys_logger.warning("Ollama requested but /api/tags is unreachable")
        except Exception as e:
            sys_logger.warning(f"Ollama client init skipped: {e}")

    if google_client is None and ollama_client is None:
        raise RuntimeError("No LLM client is available")

    return UnifiedGenAIClient(google_client=google_client, ollama_client=ollama_client)


def generate_content_with_proxy(model, contents, config, http_proxy=None, https_proxy=None):
    if is_ollama_model(model):
        client = get_client()
        if client is None:
            raise RuntimeError("AI client not initialized")
        return client.models.generate_content(model=model, contents=contents, config=config)

    if http_proxy or https_proxy:
        with _temporary_proxy_env(http_proxy=http_proxy, https_proxy=https_proxy):
            google_client = _build_google_client()
            return google_client.models.generate_content(model=model, contents=contents, config=config)

    client = get_client()
    if client is None:
        raise RuntimeError("AI client not initialized")
    return client.models.generate_content(model=model, contents=contents, config=config)


def init_client():
    global _client
    if _client is not None:
        return _client
    try:
        _client = _build_client()
    except Exception as e:
        sys_logger.critical(f"Client Init Failed: {e}")
        _client = None
    return _client


def get_client():
    return init_client()


def call_genai_retry(contents, config, req_id: str, retries=2, model=None):
    client = get_client()
    if client is None:
        raise RuntimeError("AI client not initialized")

    target_model = model or MODEL_GEMINI
    last_err = None
    for i in range(retries):
        try:
            return client.models.generate_content(model=target_model, contents=contents, config=config)
        except Exception as e:
            last_err = e
            sys_logger.warning(f"[{req_id}] LLM Retry {i + 1}/{retries} failed: {e}")
            time.sleep(1 * (i + 1))
    raise RuntimeError(f"LLM Service Failed: {last_err}")


def call_genai_retry_with_proxy(
    contents,
    config,
    req_id: str,
    retries=2,
    model=None,
    http_proxy=None,
    https_proxy=None,
):
    target_model = model or MODEL_GEMINI
    last_err = None
    for i in range(retries):
        try:
            if is_ollama_model(target_model):
                client = get_client()
                if client is None:
                    raise RuntimeError("AI client not initialized")
                return client.models.generate_content(model=target_model, contents=contents, config=config)
            with _temporary_proxy_env(http_proxy=http_proxy, https_proxy=https_proxy):
                google_client = _build_google_client()
                return google_client.models.generate_content(model=target_model, contents=contents, config=config)
        except Exception as e:
            last_err = e
            sys_logger.warning(f"[{req_id}] LLM Proxy Retry {i + 1}/{retries} failed: {e}")
            time.sleep(1 * (i + 1))
    raise RuntimeError(f"LLM Service Failed: {last_err}")
