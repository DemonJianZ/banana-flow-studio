import os
import time
from contextlib import contextmanager
from google import genai
try:
    from ..core.config import API_KEY, PROJECT_ID, LOCATION, MODEL_GEMINI
    from ..core.logging import sys_logger
except Exception:  # pragma: no cover - compatible with direct python bananaflow/main.py runs
    from core.config import API_KEY, PROJECT_ID, LOCATION, MODEL_GEMINI
    from core.logging import sys_logger

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


def _build_client():
    if API_KEY:
        return genai.Client(api_key=API_KEY)
    return genai.Client(vertexai=True, project=PROJECT_ID, location=LOCATION)


def generate_content_with_proxy(model, contents, config, http_proxy=None, https_proxy=None):
    if http_proxy or https_proxy:
        with _temporary_proxy_env(http_proxy=http_proxy, https_proxy=https_proxy):
            client = _build_client()
            return client.models.generate_content(model=model, contents=contents, config=config)

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
            sys_logger.warning(f"[{req_id}] Gemini Retry {i+1}/{retries} failed: {e}")
            time.sleep(1 * (i + 1))
    raise RuntimeError(f"Gemini AI Service Failed: {last_err}")


def call_genai_retry_with_proxy(contents, config, req_id: str, retries=2, model=None, http_proxy=None, https_proxy=None):
    target_model = model or MODEL_GEMINI
    last_err = None
    for i in range(retries):
        try:
            with _temporary_proxy_env(http_proxy=http_proxy, https_proxy=https_proxy):
                client = _build_client()
                return client.models.generate_content(model=target_model, contents=contents, config=config)
        except Exception as e:
            last_err = e
            sys_logger.warning(f"[{req_id}] Gemini Proxy Retry {i+1}/{retries} failed: {e}")
            time.sleep(1 * (i + 1))
    raise RuntimeError(f"Gemini AI Service Failed: {last_err}")
