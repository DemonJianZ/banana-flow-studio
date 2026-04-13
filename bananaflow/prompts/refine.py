import json
import re
from functools import lru_cache
from typing import Any

try:
    from ..core.config import MODEL_AGENT, MODEL_PROMPT_POLISH, AGENT_MODEL_HTTP_PROXY, AGENT_MODEL_HTTPS_PROXY
    from ..core.logging import sys_logger
    from ..services.genai_client import get_client, generate_content_with_proxy
    from ..services.ollama_client import is_ollama_model
except Exception:  # pragma: no cover - compatible with direct python bananaflow/main.py runs
    try:
        from core.config import MODEL_AGENT, MODEL_PROMPT_POLISH, AGENT_MODEL_HTTP_PROXY, AGENT_MODEL_HTTPS_PROXY
        from core.logging import sys_logger
        from services.genai_client import get_client, generate_content_with_proxy
        from services.ollama_client import is_ollama_model
    except Exception:  # pragma: no cover - test environments may not install runtime deps
        MODEL_AGENT = "ollama:gemma4:latest"
        MODEL_PROMPT_POLISH = "ollama:gemma4:latest"
        AGENT_MODEL_HTTP_PROXY = ""
        AGENT_MODEL_HTTPS_PROXY = ""

        class _FallbackLogger:
            def info(self, *args, **kwargs):
                return None

            def warning(self, *args, **kwargs):
                return None

            def error(self, *args, **kwargs):
                return None

        sys_logger = _FallbackLogger()

        def get_client():
            return None

        def generate_content_with_proxy(*args, **kwargs):
            raise RuntimeError("genai client is unavailable")

        def is_ollama_model(model):
            return str(model or "").strip().lower().startswith("ollama:")

try:
    from google.genai import types
except Exception:  # pragma: no cover - test environments may not install google-genai
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

PROMPT_POLISH_MAX_OUTPUT_TOKENS = -1

def simple_refine_prompt(user_prompt: str) -> str:
    p = (user_prompt or "").strip()
    p = p.replace("动漫", "anime").replace("二次元", "anime").replace("写实", "photorealistic").replace("更真实", "more photorealistic")
    return (
        f"Create a clear, stable English prompt based on this request: {p}. "
        "Keep composition, lighting, camera angle, and background unless explicitly specified. "
        "Only change what the user asks to change."
    )

def agent_refine_prompt(user_prompt: str) -> str:
    client = get_client()
    if client is None:
        return simple_refine_prompt(user_prompt)

    SYSTEM = """
You are a canvas prompt optimizer.
Rewrite the user's short request into a stable English instruction.

Rules:
- Output ONLY a single English prompt (no JSON, no markdown).
- Default constraints: keep composition/lighting/background unless specified.
- Be explicit about what to change vs what to keep.
"""
    resp = generate_content_with_proxy(
        model=MODEL_AGENT,
        contents=[types.Part(text=SYSTEM), types.Part(text=f"User request: {user_prompt.strip()}")],
        config=types.GenerateContentConfig(temperature=0.0, max_output_tokens=220),
        http_proxy=AGENT_MODEL_HTTP_PROXY,
        https_proxy=AGENT_MODEL_HTTPS_PROXY,
    )
    text = resp.candidates[0].content.parts[0].text.strip()
    return text.strip("`").strip()


def build_prompt_polish_system_prompt(mode: str) -> str:
    mode_key = (mode or "").strip().lower()
    base = (
        "你是用于图像和视频生成的提示词润色器。\n"
        "请把用户输入润色成 3 个候选版本，且必须保留原始画面结构与核心意象。\n"
        "输出语言必须与输入语言一致；如果输入是中文，输出也必须是中文，不要翻成英文。\n"
        "尽量保留主体、动作、构图、镜头、光线、背景、氛围的顺序，不要改成完全不同的场景。\n"
        "3 个版本分别是：\n"
        "1. 贴近原文，尽量少改，只提升流畅度；\n"
        "2. 镜头感更强一点，强化速度、动势、画面张力；\n"
        "3. 氛围和细节更强一点，但仍然贴近原始画面。\n"
        "只输出 JSON，不要输出解释、Markdown 或多余文本。格式必须是："
        "{\"variants\":[{\"label\":\"贴近原文\",\"text\":\"...\"},{\"label\":\"镜头增强\",\"text\":\"...\"},{\"label\":\"氛围增强\",\"text\":\"...\"}]}"
    )
    if mode_key in {"img2video", "local_img2video"}:
        base = base + "\n如果是视频相关提示词，请额外强化动作连续性、镜头推进和运动节奏。"
    elif mode_key == "relight":
        base = base + "\n如果是重打光场景，请优先保留主体与构图，只围绕光影、明暗、色温和质感润色。"
    elif mode_key == "multi_image_generate":
        base = base + "\n如果是多图生成场景，请优先保持商业图文的清晰主体、统一场景和完整构图。"
    return base


def normalize_prompt_polish_output(text: str) -> str:
    cleaned = (text or "").strip()
    if not cleaned:
        return ""
    cleaned = cleaned.replace("```text", "").replace("```", "").strip()
    cleaned = cleaned.strip("`").strip().strip('"').strip("'")
    lines = [line.strip() for line in cleaned.splitlines() if line.strip()]
    if not lines:
        return ""
    first = lines[0]
    for prefix in (
        "prompt:",
        "output:",
        "result:",
        "optimized prompt:",
        "polished prompt:",
        "here is the polished prompt:",
        "润色后提示词：",
        "优化后提示词：",
    ):
        if first.lower().startswith(prefix):
            first = first[len(prefix):].strip()
            break
    return first.strip("`").strip().strip('"').strip("'")


def _clean_prompt_polish_payload(text: str) -> str:
    cleaned = (text or "").strip()
    if not cleaned:
        return ""
    cleaned = cleaned.replace("```json", "").replace("```text", "").replace("```", "").strip()
    cleaned = cleaned.strip("`").strip().strip('"').strip("'")
    return cleaned


def _looks_chinese(text: str) -> bool:
    return bool(re.search(r"[\u4e00-\u9fff]", str(text or "")))


def _strip_variant_prefix(text: str) -> str:
    cleaned = normalize_prompt_polish_output(text)
    if not cleaned:
        return ""
    patterns = (
        r"^(?:版本\s*)?\d+\s*[\.、:：)\-]\s*",
        r"^[（(]?(?:版本\s*)?\d+\s*[)）\.、:：]\s*",
        r"^[A-Za-z]\s*[\.、:：)\-]\s*",
    )
    for pattern in patterns:
        cleaned = re.sub(pattern, "", cleaned).strip()
    return cleaned


def _coerce_prompt_polish_variants(value, fallback_label_prefix: str = "版本") -> list[dict[str, str]]:
    variants: list[dict[str, str]] = []
    if isinstance(value, dict):
        entries = None
        for key in ("variants", "candidates", "options", "results", "items", "data"):
            candidate = value.get(key)
            if isinstance(candidate, list):
                entries = candidate
                break
        if entries is None and any(key in value for key in ("text", "prompt", "content")):
            entries = [value]
        value = entries or []

    if not isinstance(value, list):
        return []

    for index, item in enumerate(value):
        label = ""
        text = ""
        if isinstance(item, str):
            text = item
        elif isinstance(item, dict):
            label = str(item.get("label") or item.get("title") or item.get("name") or "").strip()
            text = str(item.get("text") or item.get("prompt") or item.get("content") or "").strip()
        else:
            continue

        cleaned = _strip_variant_prefix(text)
        if not cleaned:
            continue
        variants.append(
            {
                "label": label or f"{fallback_label_prefix}{index + 1}",
                "text": cleaned,
            }
        )
    return variants


def _parse_prompt_polish_variants(raw_text: str) -> list[dict[str, str]]:
    cleaned = _clean_prompt_polish_payload(raw_text)
    if not cleaned:
        return []

    for candidate in (cleaned, cleaned.replace("\n", " ")):
        try:
            parsed = json.loads(candidate)
        except Exception:
            continue
        variants = _coerce_prompt_polish_variants(parsed, fallback_label_prefix="版本")
        if variants:
            return variants

    if "\n" in cleaned:
        lines = [line.strip() for line in cleaned.splitlines() if line.strip()]
        if len(lines) >= 2:
            variants = _coerce_prompt_polish_variants([_strip_variant_prefix(line) for line in lines], fallback_label_prefix="版本")
            if variants:
                return variants

    single = _strip_variant_prefix(cleaned)
    return [{"label": "版本1", "text": single}] if single else []


def _append_clause(base: str, clause: str, *, chinese: bool) -> str:
    core = (base or "").strip().rstrip("。！？!?.,")
    addition = (clause or "").strip().strip("，,。！？!?")
    if not core:
        return ""
    if not addition:
        return f"{core}。" if chinese else f"{core}."
    if chinese:
        return f"{core}，{addition}。"
    return f"{core}, {addition}."


def _build_prompt_polish_single_prompt(user_prompt: str, mode: str) -> str:
    prompt = normalize_prompt_polish_output(user_prompt)
    mode_key = (mode or "").strip().lower()
    extra = ""
    if mode_key in {"img2video", "local_img2video"}:
        extra = "如果是视频相关提示词，请额外强化动作连续性、镜头推进和运动节奏。"
    elif mode_key == "relight":
        extra = "如果是重打光场景，请优先保留主体与构图，只围绕光影、明暗、色温和质感润色。"
    elif mode_key == "multi_image_generate":
        extra = "如果是多图生成场景，请优先保持商业图文的清晰主体、统一场景和完整构图。"
    prompt_text = (
        "请在不改变原始画面结构的前提下，将这段提示词润色得更自然、更具体。"
        "输出语言必须与输入语言一致；如果输入是中文，输出也必须是中文，不要翻成英文。"
        "尽量保留主体、动作、构图、光线、背景、镜头和氛围的顺序，不要改成完全不同的场景。"
        "只输出最终润色结果，不要输出解释、Markdown 或编号。"
        f"{extra}"
        f"原始提示词：{prompt}"
    )
    return prompt_text


def _build_prompt_polish_variants(base_text: str, mode: str, seed_text: str = "") -> list[dict[str, str]]:
    source = normalize_prompt_polish_output(seed_text or base_text)
    base = normalize_prompt_polish_output(base_text or seed_text)
    if not base:
        return []

    chinese = _looks_chinese(source or base)
    mode_key = (mode or "").strip().lower()

    if chinese:
        if mode_key in {"img2video", "local_img2video"}:
            variants = [
                {"label": "贴近原文", "text": _append_clause(base, "", chinese=True)},
                {"label": "镜头增强", "text": _append_clause(base, "强化动作连续性、镜头推进和速度张力", chinese=True)},
                {"label": "氛围增强", "text": _append_clause(base, "突出空间层次、动态细节与电影感冷冽氛围", chinese=True)},
            ]
        elif mode_key == "relight":
            variants = [
                {"label": "贴近原文", "text": _append_clause(base, "", chinese=True)},
                {"label": "光影增强", "text": _append_clause(base, "强化光影变化、明暗层次与材质质感", chinese=True)},
                {"label": "氛围增强", "text": _append_clause(base, "突出冷暖对比、空间层次与环境氛围", chinese=True)},
            ]
        else:
            variants = [
                {"label": "贴近原文", "text": _append_clause(base, "", chinese=True)},
                {"label": "镜头增强", "text": _append_clause(base, "强化速度感、动势与画面张力", chinese=True)},
                {"label": "氛围增强", "text": _append_clause(base, "突出构图层次、雪雾细节与电影感", chinese=True)},
            ]
    else:
        if mode_key in {"img2video", "local_img2video"}:
            variants = [
                {"label": "Close to original", "text": _append_clause(base, "", chinese=False)},
                {"label": "Motion Boost", "text": _append_clause(base, "emphasize continuous motion, camera push-in, and speed tension", chinese=False)},
                {"label": "Atmosphere Boost", "text": _append_clause(base, "highlight depth, motion detail, and cinematic atmosphere", chinese=False)},
            ]
        elif mode_key == "relight":
            variants = [
                {"label": "Close to original", "text": _append_clause(base, "", chinese=False)},
                {"label": "Lighting Boost", "text": _append_clause(base, "emphasize lighting changes, tonal contrast, and material texture", chinese=False)},
                {"label": "Atmosphere Boost", "text": _append_clause(base, "highlight color temperature, depth, and ambient mood", chinese=False)},
            ]
        else:
            variants = [
                {"label": "Close to original", "text": _append_clause(base, "", chinese=False)},
                {"label": "Camera Boost", "text": _append_clause(base, "emphasize motion, framing, and visual tension", chinese=False)},
                {"label": "Atmosphere Boost", "text": _append_clause(base, "highlight composition, detail, and cinematic mood", chinese=False)},
            ]

    seen = set()
    deduped: list[dict[str, str]] = []
    for idx, item in enumerate(variants):
        text = normalize_prompt_polish_output(item.get("text") or "")
        if not text or text in seen:
            continue
        seen.add(text)
        deduped.append({
            "label": item.get("label") or (f"版本{idx + 1}" if chinese else f"Variant {idx + 1}"),
            "text": text,
        })
    return deduped


def _pad_prompt_polish_variants(
    variants: list[dict[str, str]],
    mode: str,
    seed_text: str = "",
) -> list[dict[str, str]]:
    cleaned: list[dict[str, str]] = []
    seen: set[str] = set()

    for index, item in enumerate(variants or []):
        text = normalize_prompt_polish_output(item.get("text") or "")
        if not text or text in seen:
            continue
        seen.add(text)
        cleaned.append(
            {
                "label": item.get("label") or f"版本{index + 1}",
                "text": text,
            }
        )

    base_text = cleaned[0]["text"] if cleaned else normalize_prompt_polish_output(seed_text)
    derived = _build_prompt_polish_variants(base_text or seed_text, mode=mode, seed_text=seed_text)
    for item in derived:
        text = normalize_prompt_polish_output(item.get("text") or "")
        if not text or text in seen:
            continue
        seen.add(text)
        cleaned.append(item)

    return cleaned[:3]


def ollama_prompt_polish(user_prompt: str, mode: str = "text2img", req_id: str = "prompt_polish") -> dict[str, Any]:
    prompt = (user_prompt or "").strip()
    if not prompt:
        return {"text": "", "variants": []}
    if not is_ollama_model(MODEL_PROMPT_POLISH):
        raise RuntimeError("MODEL_PROMPT_POLISH must use ollama: prefix")

    attempts = [
        (
            "structured",
            [
                types.Part(text=build_prompt_polish_system_prompt(mode)),
                types.Part(text=f"User prompt: {prompt}"),
            ],
        ),
        (
            "single_prompt",
            [types.Part(text=_build_prompt_polish_single_prompt(prompt, mode))],
        ),
    ]

    last_err = None
    for attempt_name, contents in attempts:
        try:
            debug_prompt = "\n\n".join(str(getattr(part, "text", "") or "").strip() for part in contents if str(getattr(part, "text", "") or "").strip())
            sys_logger.info(
                f"[{req_id}] prompt_polish attempt={attempt_name} model={MODEL_PROMPT_POLISH} "
                f"prompt={json.dumps(debug_prompt, ensure_ascii=False)}"
            )
            response = generate_content_with_proxy(
                model=MODEL_PROMPT_POLISH,
                contents=contents,
                config=types.GenerateContentConfig(temperature=0.1, max_output_tokens=PROMPT_POLISH_MAX_OUTPUT_TOKENS),
                http_proxy=AGENT_MODEL_HTTP_PROXY,
                https_proxy=AGENT_MODEL_HTTPS_PROXY,
            )
            raw_payload = getattr(response, "raw", None)
            if raw_payload is not None:
                sys_logger.info(
                    f"[{req_id}] prompt_polish attempt={attempt_name} raw={json.dumps(raw_payload, ensure_ascii=False, default=str)}"
                )
            text = ""
            try:
                text = str(response.candidates[0].content.parts[0].text or "").strip()
            except Exception:
                text = str(getattr(response, "text", "") or "").strip()
            variants = _parse_prompt_polish_variants(text)
            if variants:
                variants = _pad_prompt_polish_variants(variants, mode=mode, seed_text=prompt)
            else:
                variants = _build_prompt_polish_variants(text or prompt, mode=mode, seed_text=prompt)
            if variants:
                return {"text": variants[0]["text"], "variants": variants[:3]}
            last_err = "ollama returned empty response"
            sys_logger.warning(f"[{req_id}] prompt_polish attempt={attempt_name} empty response")
        except Exception as e:
            last_err = e
            sys_logger.warning(f"[{req_id}] prompt_polish attempt={attempt_name} error: {e}")

    sys_logger.warning(f"[{req_id}] prompt_polish fallback: {last_err}")
    fallback_variants = _build_prompt_polish_variants(prompt, mode=mode, seed_text=prompt)
    if fallback_variants:
        return {"text": fallback_variants[0]["text"], "variants": fallback_variants[:3]}
    cleaned = normalize_prompt_polish_output(prompt)
    return {"text": cleaned, "variants": [{"label": "版本1", "text": cleaned}] if cleaned else []}


@lru_cache(maxsize=512)
def cached_refine_prompt(user_prompt: str) -> str:
    return agent_refine_prompt(user_prompt)
