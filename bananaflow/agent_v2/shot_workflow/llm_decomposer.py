from __future__ import annotations

import ast
import json
import re
from typing import Any

from .extractor import extract_shots_from_text
from .schemas import ShotSpec


# ---------------------------------------------------------------------------
# JSON parsing helpers (mirrors storyboard/designer.py pattern)
# ---------------------------------------------------------------------------

def _candidate_json_chunks(raw: str) -> list[str]:
    chunks: list[str] = []
    text = str(raw or "").strip()
    if not text:
        return chunks
    chunks.append(text)
    fenced = re.findall(r"```(?:json)?\s*([\s\S]*?)```", text, flags=re.IGNORECASE)
    for block in fenced:
        b = str(block or "").strip()
        if b:
            chunks.append(b)
    first_obj = text.find("{")
    last_obj = text.rfind("}")
    if first_obj >= 0 and last_obj > first_obj:
        chunks.append(text[first_obj : last_obj + 1])
    return chunks


def _strip_trailing_commas(text: str) -> str:
    return re.sub(r",(\s*[}\]])", r"\1", str(text or ""))


def _lenient_balanced_object(text: str) -> str:
    raw = str(text or "")
    start = raw.find("{")
    if start < 0:
        return raw
    out: list[str] = []
    stack: list[str] = []
    in_string = False
    escaped = False
    for ch in raw[start:]:
        out.append(ch)
        if in_string:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
            continue
        if ch in "{[":
            stack.append(ch)
            continue
        if ch in "}]":
            if not stack:
                out.pop()
                continue
            top = stack[-1]
            if (top == "{" and ch == "}") or (top == "[" and ch == "]"):
                stack.pop()
                if not stack:
                    break
                continue
            out.pop()
            continue
    while stack:
        opener = stack.pop()
        out.append("}" if opener == "{" else "]")
    return "".join(out)


def _pythonish_to_object(text: str) -> Any:
    normalized = re.sub(r"\btrue\b", "True", str(text or ""))
    normalized = re.sub(r"\bfalse\b", "False", normalized)
    normalized = re.sub(r"\bnull\b", "None", normalized)
    return ast.literal_eval(normalized)


def _parse_llm_json(text: str) -> dict:
    candidates = _candidate_json_chunks(str(text or ""))
    if not candidates:
        raise ValueError("shot_decompose_json_parse_failed")
    last_error: Exception | None = None
    for candidate in candidates:
        repaired = _lenient_balanced_object(candidate)
        for attempt in (candidate, _strip_trailing_commas(candidate), repaired, _strip_trailing_commas(repaired)):
            try:
                payload = json.loads(attempt or "{}")
                if isinstance(payload, dict):
                    return payload
            except Exception as exc:
                last_error = exc
        try:
            payload = _pythonish_to_object(_strip_trailing_commas(repaired))
            if isinstance(payload, dict):
                return dict(payload)
        except Exception as exc:
            last_error = exc
    if last_error is not None:
        raise last_error
    raise ValueError("shot_decompose_llm_output_not_object")


# ---------------------------------------------------------------------------
# Prompt builder
# ---------------------------------------------------------------------------

def _build_decompose_prompt(source_text: str, max_shots: int) -> str:
    system = (
        "你是专业分镜导演，擅长从剧本/故事板文本中拆分镜头并识别视觉实体。\n"
        "输出严格 JSON，顶层字段：shots（数组）、annotated_script（字符串）。\n"
        "不要输出 markdown，不要解释。\n\n"
        "shots 数组中每个对象必须包含字段：\n"
        "  shot_id (\"shot_01\", \"shot_02\"...), index (整数), title (简短标题),\n"
        "  scene (主要场景名), time (时间段，如白天/夜晚/黄昏),\n"
        "  characters (出现角色名列表), locations (地点/场景名列表), props (关键道具/物件列表),\n"
        "  visual_description (画面描述：主体、动作、构图、环境细节，必须可直接指导出图),\n"
        "  audio_description (画面可添加的环境音、动作音、氛围音乐或特殊音效；不要写角色台词、对白内容、说话声),\n"
        "  action (兼容字段，内容与 visual_description 保持一致或更简短),\n"
        "  dialogue (主角之间的台词对话，只放角色说出的文字，保留说话人，如 \"辰辰：秋水，节奏跟上。\\n秋水：阿巳！快来管管师父！\"；无台词则为空字符串),\n"
        "  camera (镜头语言，如 close-up / medium shot / wide shot / cinematic medium shot),\n"
        "  mood (情绪氛围，如 dramatic / serene / tense / comedic),\n"
        "  needs_reference_image (布尔值，若有具体角色/人物形象需保持一致则为 true),\n"
        "  duration (该镜头预计时长，整数秒；若剧本中有明确标注则取其值，否则根据动作/对话量估算，通常 3-8 秒)。\n\n"
        "annotated_script 是整个剧本的标注版本，在原文基础上用以下 token 标记关键实体：\n"
        "  角色：[[char:名字]]  场景/地点：[[scene:名字]]  道具：[[prop:名字]]\n"
        "  token 只标注实体名字本身，不嵌套，不改变原文其他内容。\n\n"
        f"最多拆分 {max_shots} 个镜头，根据剧本内容合理决定数量。\n"
        "如果剧本较短，拆分真实存在的镜头，不要虚构。\n\n"
    )
    return system + f"剧本原文：\n{source_text}"

# ---------------------------------------------------------------------------
# LLM caller (mirrors storyboard/designer.py dual-path pattern)
# ---------------------------------------------------------------------------

def _load_config() -> dict:
    try:
        from core.config import AGENT_MODEL_HTTP_PROXY, AGENT_MODEL_HTTPS_PROXY, MODEL_AGENT
    except ImportError:
        from bananaflow.core.config import AGENT_MODEL_HTTP_PROXY, AGENT_MODEL_HTTPS_PROXY, MODEL_AGENT
    return {"MODEL_AGENT": MODEL_AGENT, "HTTP_PROXY": AGENT_MODEL_HTTP_PROXY, "HTTPS_PROXY": AGENT_MODEL_HTTPS_PROXY}


def _call_llm(prompt: str, authorization: str = "") -> dict:
    auth = str(authorization or "").strip()
    if auth:
        try:
            from services.ai_chat_client import call_ai_chat_text
        except ImportError:
            from bananaflow.services.ai_chat_client import call_ai_chat_text
        from core.config import AI_CHAT_DOWNSTREAM_URL
        if AI_CHAT_DOWNSTREAM_URL:
            response = call_ai_chat_text(message=prompt, authorization=auth)
            return _parse_llm_json(str(response.text or ""))

    cfg = _load_config()
    try:
        from google.genai import types
        from services.genai_client import call_genai_retry_with_proxy
    except ImportError:
        from google.genai import types
        from bananaflow.services.genai_client import call_genai_retry_with_proxy

    response = call_genai_retry_with_proxy(
        contents=[types.Part(text=prompt)],
        config=types.GenerateContentConfig(temperature=0.3),
        req_id="shot_workflow:decompose",
        retries=2,
        model=cfg["MODEL_AGENT"],
        http_proxy=cfg["HTTP_PROXY"],
        https_proxy=cfg["HTTPS_PROXY"],
    )
    text = str(getattr(response, "text", "") or "").strip()
    if not text:
        for cand in (getattr(response, "candidates", None) or []):
            try:
                text = str(cand.content.parts[0].text or "").strip()
                if text:
                    break
            except Exception:
                pass
    return _parse_llm_json(text)


# ---------------------------------------------------------------------------
# Shot normalizer: turn raw LLM dict into ShotSpec list
# ---------------------------------------------------------------------------

def _dialogue_to_text(value: Any) -> str:
    if isinstance(value, list):
        lines: list[str] = []
        for item in value:
            if isinstance(item, dict):
                speaker = str(item.get("speaker") or item.get("role") or item.get("name") or "").strip()
                text = str(item.get("text") or item.get("line") or item.get("content") or "").strip()
                if speaker and text:
                    lines.append(f"{speaker}：{text}")
                elif text:
                    lines.append(text)
            else:
                text = str(item or "").strip()
                if text:
                    lines.append(text)
        return "\n".join(lines).strip()
    return str(value or "").strip()



def _clean_audio_description(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""

    kept: list[str] = []
    for chunk in re.split(r"[\n；;]+", text):
        item = chunk.strip(" 。，,;；")
        if not item:
            continue

        audio_label = re.match(r"^(环境音|环境声|音效|配乐|动作音|动作声|氛围音乐|特殊音效|声音)\s*[:：]\s*(.+)$", item, re.I)
        if audio_label:
            item = audio_label.group(2).strip(" 。，,;；")

        if re.match(r"^(台词|对白|dialogue|lines?)\s*[:：]", item, re.I):
            continue
        if re.match(r"^[\u4e00-\u9fa5A-Za-z·]{1,12}\s*[:：]", item):
            continue
        if item in {"对白", "台词", "说话声", "角色台词", "角色对白"}:
            continue
        kept.append(item)

    return "；".join(kept).strip()


def _normalize_shot(raw: Any, idx: int) -> ShotSpec:
    d = dict(raw or {})
    shot_id = str(d.get("shot_id") or f"shot_{idx:02d}").strip()
    index = int(d.get("index") or idx)

    def _strlist(v: Any) -> list[str]:
        if isinstance(v, list):
            return [str(x).strip() for x in v if str(x).strip()]
        if isinstance(v, str) and v.strip():
            return [v.strip()]
        return []

    visual = str(
        d.get("visual_description")
        or d.get("picture_description")
        or d.get("screen_description")
        or d.get("action")
        or ""
    ).strip()
    audio = _clean_audio_description(
        d.get("audio_description")
        or d.get("sound_effect_description")
        or d.get("sound_effect")
        or d.get("sfx")
        or ""
    )
    dialogue = _dialogue_to_text(d.get("dialogue") or d.get("dialogues") or d.get("lines") or "")

    return {
        "shot_id": shot_id,
        "index": index,
        "title": str(d.get("title") or f"镜头 {index}").strip(),
        "scene": str(d.get("scene") or "").strip(),
        "time": str(d.get("time") or "").strip(),
        "characters": _strlist(d.get("characters")),
        "locations": _strlist(d.get("locations")),
        "props": _strlist(d.get("props")),
        "visual_description": visual,
        "audio_description": audio,
        "action": str(d.get("action") or visual).strip(),
        "dialogue": dialogue,
        "camera": str(d.get("camera") or "cinematic medium shot").strip(),
        "mood": str(d.get("mood") or "cinematic, clean, coherent").strip(),
        "needs_reference_image": bool(d.get("needs_reference_image")),
        "duration": int(d.get("duration") or 5),
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def decompose_shots(
    source_text: str,
    max_shots: int = 12,
    authorization: str = "",
) -> tuple[list[ShotSpec], str]:
    """
    Returns (shots, annotated_script).
    Falls back to regex extractor on LLM failure.
    """
    text = str(source_text or "").strip()
    if not text:
        return [], ""

    prompt = _build_decompose_prompt(text, max_shots)
    try:
        payload = _call_llm(prompt, authorization=authorization)
    except Exception:
        shots_fallback = extract_shots_from_text(text, max_shots=max_shots)
        return shots_fallback, ""

    raw_shots = list(payload.get("shots") or [])
    annotated_script = str(payload.get("annotated_script") or "").strip()

    if not raw_shots:
        shots_fallback = extract_shots_from_text(text, max_shots=max_shots)
        return shots_fallback, annotated_script

    shots: list[ShotSpec] = [_normalize_shot(s, i + 1) for i, s in enumerate(raw_shots[:max(1, max_shots)])]
    return shots, annotated_script
