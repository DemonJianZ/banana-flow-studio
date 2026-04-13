from __future__ import annotations

import os
import re
from typing import Any, Dict, Optional

try:
    from google.genai import types  # type: ignore
except Exception:  # pragma: no cover - allow ollama-only runtime
    class _FallbackPart:
        def __init__(self, text: str = "") -> None:
            self.text = text

    class _FallbackGenerateContentConfig:
        def __init__(self, **kwargs) -> None:
            for key, value in kwargs.items():
                setattr(self, key, value)

    class _FallbackTypes:
        Part = _FallbackPart
        GenerateContentConfig = _FallbackGenerateContentConfig

    types = _FallbackTypes()

try:
    from ...services.genai_client import call_genai_retry_with_proxy
    from ...services.ollama_client import OllamaTextClient, is_ollama_model
    from ...services.runtime_skill import build_runtime_skill_block
except Exception:  # pragma: no cover - compatible with direct python bananaflow/main.py runs
    from services.genai_client import call_genai_retry_with_proxy
    from services.ollama_client import OllamaTextClient, is_ollama_model
    from services.runtime_skill import build_runtime_skill_block


DEFAULT_DRAMA_MODEL = str(
    os.getenv("DRAMA_CREATOR_DEFAULT_MODEL")
    or os.getenv("IDEA_SCRIPT_DEFAULT_MODEL")
    or "ollama:gemma4:latest"
).strip() or "ollama:gemma4:latest"
DEFAULT_DRAMA_TIMEOUT_SEC = max(1, int(os.getenv("DRAMA_CREATOR_TIMEOUT_SEC") or 180))


def _clean_text(value: Any) -> str:
    return str(value or "").strip()


def _normalize_latex_symbols(value: Any) -> str:
    text = str(value or "")
    replacements = (
        ("\\leftrightarrow", "↔"),
        ("\\leftarrow", "←"),
        ("\\rightarrow", "→"),
        ("\\Rightarrow", "⇒"),
        ("\\Leftarrow", "⇐"),
        ("\\to", "→"),
        ("\\times", "×"),
        ("\\cdot", "·"),
        ("\\leq", "≤"),
        ("\\geq", "≥"),
        ("\\neq", "≠"),
    )
    for source, target in replacements:
        text = text.replace(source, target)

    def _unwrap_math(match: re.Match[str]) -> str:
        return _normalize_latex_symbols(match.group(1))

    text = re.sub(r"\$([^$\n]{1,120})\$", _unwrap_math, text)
    text = re.sub(r"\\\(([\s\S]{1,120}?)\\\)", _unwrap_math, text)
    text = re.sub(r"\\\[([\s\S]{1,120}?)\\\]", _unwrap_math, text)
    return text


def _sanitize_markdown_markers(value: Any) -> str:
    return (
        _normalize_latex_symbols(value)
        .replace("\r\n", "\n")
        .replace("**", "")
        .replace("__", "")
        .strip()
    )


class DramaCreatorClient:
    def __init__(
        self,
        model: Optional[str] = None,
        temperature: Optional[float] = None,
        top_p: Optional[float] = None,
        max_tokens: Optional[int] = None,
        timeout_sec: Optional[int] = None,
        http_proxy: Optional[str] = None,
        https_proxy: Optional[str] = None,
    ) -> None:
        self.model = str(model or DEFAULT_DRAMA_MODEL).strip() or DEFAULT_DRAMA_MODEL
        self.temperature = float(temperature) if temperature is not None else 0.7
        self.top_p = float(top_p) if top_p is not None else None
        self.max_tokens = int(max_tokens) if max_tokens else None
        self.timeout_sec = max(1, int(timeout_sec or DEFAULT_DRAMA_TIMEOUT_SEC))
        self.http_proxy = str(http_proxy or os.getenv("DRAMA_CREATOR_HTTP_PROXY") or "").strip() or None
        self.https_proxy = str(https_proxy or os.getenv("DRAMA_CREATOR_HTTPS_PROXY") or "").strip() or None
        self.is_ollama = is_ollama_model(self.model)
        self.ollama_client = OllamaTextClient(timeout_sec=self.timeout_sec) if self.is_ollama else None
        self.skill_block = build_runtime_skill_block("drama", language="zh")

    def _extract_text(self, response: Any) -> str:
        text = getattr(response, "text", None)
        if isinstance(text, str) and text.strip():
            return text.strip()

        candidates = getattr(response, "candidates", None) or []
        for cand in candidates:
            content = getattr(cand, "content", None)
            if content is None:
                continue
            parts = getattr(content, "parts", None) or []
            for part in parts:
                part_text = getattr(part, "text", None)
                if isinstance(part_text, str) and part_text.strip():
                    return part_text.strip()
        return ""

    def _build_prompt(
        self,
        *,
        prompt: str,
        task_mode: str = "",
        episode_count: Optional[int] = None,
        existing_script: str = "",
    ) -> str:
        lines = [
            "你是 Banana Flow Studio 的竖屏短剧创作助手。",
            "请直接根据用户需求完成创作，不要先讲泛泛方法论。",
            "默认输出中文，优先给出可直接继续使用的成品内容。",
            "如果任务是剧本创作，请直接输出可拍摄剧本；如果是大纲、优化、创意发想，请用清晰标题和结构化小节输出。",
            "可以使用 Markdown 的标题、列表、引用、编号结构，但不要输出 ** 或 __ 这类强调标记。",
        ]
        if task_mode:
            lines.append(f"任务模式：{task_mode}")
        if episode_count is not None and episode_count > 0:
            lines.append(f"目标集数：{episode_count}")
        if existing_script:
            lines.append("现有剧本/素材：")
            lines.append(existing_script)
        lines.append("用户需求：")
        lines.append(prompt)
        if self.skill_block:
            lines.append("")
            lines.append(self.skill_block)
        return "\n".join(line for line in lines if line is not None).strip()

    def generate(
        self,
        *,
        prompt: str,
        task_mode: str = "",
        episode_count: Optional[int] = None,
        existing_script: str = "",
    ) -> Dict[str, str]:
        clean_prompt = _clean_text(prompt)
        if not clean_prompt:
            raise ValueError("drama_prompt_required")

        full_prompt = self._build_prompt(
            prompt=clean_prompt,
            task_mode=_clean_text(task_mode),
            episode_count=episode_count,
            existing_script=_clean_text(existing_script),
        )
        cfg_kwargs: Dict[str, Any] = {"temperature": self.temperature}
        if self.top_p is not None:
            cfg_kwargs["top_p"] = self.top_p
        if self.max_tokens is not None and self.max_tokens > 0:
            cfg_kwargs["max_output_tokens"] = self.max_tokens

        if self.is_ollama:
            if self.ollama_client is None:
                raise RuntimeError("drama_ollama_client_unavailable")
            response = self.ollama_client.generate_content(
                model=self.model,
                contents=[types.Part(text=full_prompt)],
                config=types.GenerateContentConfig(**cfg_kwargs),
            )
        else:
            response = call_genai_retry_with_proxy(
                contents=[types.Part(text=full_prompt)],
                config=types.GenerateContentConfig(**cfg_kwargs),
                req_id=f"drama_creator:{self.model}",
                model=self.model,
                http_proxy=self.http_proxy,
                https_proxy=self.https_proxy,
            )

        text = _sanitize_markdown_markers(self._extract_text(response))
        if not text:
            raise RuntimeError("drama_creator_empty_response")
        summary = _sanitize_markdown_markers(text.splitlines()[0].strip() if text.splitlines() else text[:80].strip())
        return {
            "text": text,
            "summary": summary[:120],
            "model": self.model,
        }
