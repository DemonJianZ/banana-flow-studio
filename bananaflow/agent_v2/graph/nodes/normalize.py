from __future__ import annotations

import re
from typing import Any

from agent_v2.storyboard.script_table import (
    looks_like_storyboard_script_table,
    parse_storyboard_script_table,
    format_script_rows_for_prompt,
)

_STORYBOARD_EDIT_MARKERS = (
    "改", "修改", "调整", "优化", "重写", "强化", "弱化",
    "增加", "补充", "删除", "细化", "丰富", "延长", "缩短",
    "换成", "替换", "重做",
)

_STORYBOARD_KEYWORDS = ("分镜", "故事板", "storyboard", "shot list", "镜头脚本", "镜头设计")


def _find_storyboard_script_document(uploaded_documents: list[dict]) -> dict | None:
    for item in list(uploaded_documents or []):
        doc = dict(item or {})
        text_content = str(doc.get("text_content") or "").strip()
        name = str(doc.get("name") or "").strip()
        lower_name = name.lower()
        kind = str(doc.get("kind") or "").strip().lower()
        if kind == "storyboard_script_table":
            return doc
        if lower_name.endswith((".csv", ".tsv")) and (
            "storyboard" in lower_name or "shot" in lower_name
            or "scene" in lower_name or "分镜" in name or "镜头" in name
        ):
            doc["kind"] = "storyboard_script_table"
            return doc
        if not text_content:
            continue
        if looks_like_storyboard_script_table(text_content, name):
            return doc
        if parse_storyboard_script_table(text_content):
            doc["kind"] = "storyboard_script_table"
            return doc
    return None


def _extract_storyboard_args(state: dict) -> dict:
    message = str(state.get("message") or "").strip()
    uploaded_documents = list(state.get("uploaded_documents") or [])
    script_doc = _find_storyboard_script_document(uploaded_documents)

    aspect_ratio_match = re.search(r"\b(21:9|16:9|9:16|4:3|3:4|1:1)\b", message)
    style_match = re.search(r"([^\n，。,；;]{2,24}?风格)", message)
    duration_match = re.search(r"(\d+(?:\.\d+)?)\s*(秒|s|sec|分钟|分)", message, re.IGNORECASE)
    target_duration_sec = None
    if duration_match:
        value = float(duration_match.group(1))
        unit = duration_match.group(2).lower()
        target_duration_sec = value * 60.0 if unit in {"分钟", "分"} else value

    script_table = ""
    script_rows: list[dict] = []
    script_table_name = ""
    if script_doc:
        script_table = str(script_doc.get("text_content") or "").strip()
        script_table_name = str(script_doc.get("name") or "").strip()
        script_rows = format_script_rows_for_prompt(parse_storyboard_script_table(script_table))
    else:
        parsed = parse_storyboard_script_table(message)
        if parsed:
            script_table = message
            script_table_name = "pasted_storyboard_script.txt"
            script_rows = format_script_rows_for_prompt(parsed)

    brief_text = message if not script_table else (message or "请根据这份分镜头脚本整理成故事板")
    hints = dict(state.get("canvas_node_hints") or {})
    return {
        "brief": brief_text,
        "style": str(style_match.group(1) if style_match else "").strip(),
        "aspect_ratio": str(aspect_ratio_match.group(1) if aspect_ratio_match else "16:9").strip() or "16:9",
        "target_duration_sec": float(target_duration_sec or 30.0),
        "language": "zh-CN",
        "script_table": script_table,
        "script_table_name": script_table_name,
        "script_rows": script_rows,
        "_existing_storyboard_count": int(hints.get("storyboard_count") or 0),
    }


def _is_selected_storyboard_edit(state: dict) -> bool:
    selected = dict(state.get("selected_artifact") or {})
    if str(selected.get("kind") or "").strip() != "storyboard_selection":
        return False
    text = str(state.get("message") or "").strip()
    return bool(text) and any(marker in text for marker in _STORYBOARD_EDIT_MARKERS)


def normalize_request(state: dict) -> dict:
    """Detect shortcut intents from request fields; skip LLM if found."""
    message = str(state.get("message") or "").strip()
    force_action = str(state.get("force_action") or "").strip()
    ui_action = str(state.get("ui_action") or "").strip().lower()
    uploaded_documents = list(state.get("uploaded_documents") or [])

    trace_entry: dict[str, Any] = {"type": "NORMALIZE_REQUEST"}

    # 1. Uploaded storyboard script table
    script_doc = _find_storyboard_script_document(uploaded_documents)
    if script_doc:
        trace_entry["shortcut"] = "uploaded_storyboard_script_table"
        return {
            "intent": "tool_call",
            "intent_confidence": 1.0,
            "intent_reason": "uploaded_storyboard_script_table",
            "tool_name": "storyboard.design",
            "tool_args": _extract_storyboard_args(state),
            "trace": [trace_entry],
        }

    # 2. force_action
    if force_action:
        if force_action == "tool_call" and str(state.get("mode") or "").strip().lower() == "text2img":
            trace_entry["shortcut"] = "force_action_text2img_polish"
            return {
                "intent": "tool_call",
                "intent_confidence": 1.0,
                "intent_reason": "force_action",
                "tool_name": "prompt.polish",
                "tool_args": {"prompt": message, "mode": "text2img"},
                "trace": [trace_entry],
            }
        trace_entry["shortcut"] = f"force_action:{force_action}"
        return {
            "intent": force_action,
            "intent_confidence": 1.0,
            "intent_reason": "force_action",
            "tool_name": "",
            "tool_args": {},
            "trace": [trace_entry],
        }

    # 3. ui_action
    if ui_action == "prompt_polish":
        mode = str(state.get("mode") or "text2img").strip() or "text2img"
        trace_entry["shortcut"] = "ui_action.prompt_polish"
        return {
            "intent": "tool_call",
            "intent_confidence": 1.0,
            "intent_reason": "ui_action",
            "tool_name": "prompt.polish",
            "tool_args": {"prompt": message, "mode": mode},
            "trace": [trace_entry],
        }

    # No shortcut — let classify_intent call the LLM
    trace_entry["shortcut"] = None
    return {
        "intent": "",
        "intent_confidence": 0.0,
        "intent_reason": "",
        "tool_name": "",
        "tool_args": {},
        "trace": [trace_entry],
    }
