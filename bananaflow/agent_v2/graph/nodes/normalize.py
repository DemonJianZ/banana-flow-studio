from __future__ import annotations

import re
from typing import Any

from agent_v2.storyboard.script_table import (
    looks_like_storyboard_script_table,
    parse_storyboard_script_table,
    format_script_rows_for_prompt,
)

_VIDEO_CANVAS_ACTIONS = {"shot_workflow.build_video_canvas"}
_STORYBOARD_EDIT_MARKERS = (
    "改", "修改", "调整", "优化", "重写", "强化", "弱化",
    "增加", "补充", "删除", "细化", "丰富", "延长", "缩短",
    "换成", "替换", "重做",
)

_STORYBOARD_KEYWORDS = ("分镜", "故事板", "storyboard", "shot list", "镜头脚本", "镜头设计")
_SHOT_WORKFLOW_ACTIONS = {"shot_workflow", "shot_workflow.compose"}
_SCRIPT_EXTRACT_ACTIONS = {"shot_workflow.extract", "shot_workflow_design"}
_ASSET_CANVAS_ACTIONS = {"shot_workflow.build_asset_canvas"}
_SHOT_WORKFLOW_MARKERS = ("文生图", "图生图", "出图", "生图", "图片生成", "工作流", "workflow", "画布", "节点")
_SCREENPLAY_MARKERS = (
    "人物：", "人物:", "角色：", "角色:", "场景：", "场景:",
    "时间：", "时间:", "画外音", "旁白", "△", "▲",
)


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


def _looks_like_pasted_screenplay(text: str) -> bool:
    source = str(text or "").strip()
    if len(source) < 80:
        return False
    marker_hits = sum(1 for marker in _SCREENPLAY_MARKERS if marker in source)
    dialogue_hits = len(re.findall(r"(?m)^\s*[\u4e00-\u9fa5A-Za-z·]{1,12}\s*[:：]", source))
    scene_hits = len(re.findall(r"(?m)^\s*[△▲]", source))
    return marker_hits >= 2 and (dialogue_hits >= 2 or scene_hits >= 2)


def _extract_asset_canvas_args(state: dict) -> dict:
    hints = dict(state.get("canvas_node_hints") or {})
    confirmed = dict(hints.get("confirmed_extraction") or {})
    return {
        "confirmed_extraction": confirmed,
        "current_nodes": list(state.get("current_nodes") or []),
    }


def _extract_script_extract_args(state: dict) -> dict:
    message = str(state.get("message") or "").strip()
    uploaded_documents = list(state.get("uploaded_documents") or [])
    hints = dict(state.get("canvas_node_hints") or {})
    existing_extraction = hints.get("existing_extraction") or None
    edit_instruction = str(hints.get("edit_instruction") or "").strip()
    return {
        "source_text": message,
        "source_documents": uploaded_documents,
        "existing_extraction": existing_extraction,
        "edit_instruction": edit_instruction,
    }


def _extract_shot_workflow_args(state: dict) -> dict:
    message = str(state.get("message") or "").strip()
    uploaded_documents = list(state.get("uploaded_documents") or [])
    # When confirming after extraction, source_text may be in canvas_node_hints
    hints = dict(state.get("canvas_node_hints") or {})
    confirmed = dict(hints.get("confirmed_extraction") or {})
    if not message and confirmed.get("source_text"):
        message = str(confirmed["source_text"])
    aspect_ratio_match = re.search(r"\b(21:9|16:9|9:16|4:3|3:4|1:1)\b", message)
    max_shots_match = re.search(r"(?:前|最多|限制)?\s*(\d{1,2})\s*(?:个)?(?:镜头|分镜|shot)", message, re.IGNORECASE)
    max_shots = int(max_shots_match.group(1)) if max_shots_match else 12
    mode_policy = "auto"
    lowered = message.lower()
    if "本地" in message or "comfyui" in lowered:
        mode_policy = "local_text2img"
    elif "图生图" in message or "参考图" in message or "保持角色" in message or "保持人物" in message:
        mode_policy = "multi_image_generate"
    elif "文生图" in message:
        mode_policy = "text2img"
    return {
        "source_text": message,
        "source_documents": uploaded_documents,
        "aspect_ratio": str(aspect_ratio_match.group(1) if aspect_ratio_match else "16:9").strip() or "16:9",
        "mode_policy": mode_policy,
        "max_shots": max(1, min(24, max_shots)),
        "selected_artifact": dict(state.get("selected_artifact") or {}),
        "current_nodes": list(state.get("current_nodes") or []),
        "current_connections": list(state.get("current_connections") or []),
    }


def _looks_like_shot_workflow_request(text: str) -> bool:
    source = str(text or "").strip()
    if not source:
        return False
    has_shot_context = any(marker in source for marker in ("分镜", "镜头", "剧本", "shot")) or _looks_like_pasted_screenplay(source)
    has_workflow_context = any(marker in source for marker in _SHOT_WORKFLOW_MARKERS)
    return has_shot_context and has_workflow_context


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

    # 1. force_action
    if force_action:
        if force_action in _VIDEO_CANVAS_ACTIONS:
            trace_entry["shortcut"] = f"force_action:{force_action}"
            return {
                "intent": "tool_call",
                "intent_confidence": 1.0,
                "intent_reason": "force_action_video_canvas",
                "tool_name": "shot_workflow.build_video_canvas",
                "tool_args": _extract_asset_canvas_args(state),
                "trace": [trace_entry],
            }
        if force_action in _ASSET_CANVAS_ACTIONS:
            trace_entry["shortcut"] = f"force_action:{force_action}"
            return {
                "intent": "tool_call",
                "intent_confidence": 1.0,
                "intent_reason": "force_action_asset_canvas",
                "tool_name": "shot_workflow.build_asset_canvas",
                "tool_args": _extract_asset_canvas_args(state),
                "trace": [trace_entry],
            }
        if force_action in _SCRIPT_EXTRACT_ACTIONS:
            trace_entry["shortcut"] = f"force_action:{force_action}"
            return {
                "intent": "tool_call",
                "intent_confidence": 1.0,
                "intent_reason": "force_action_script_extract",
                "tool_name": "shot_workflow.extract",
                "tool_args": _extract_script_extract_args(state),
                "trace": [trace_entry],
            }
        if force_action in _SHOT_WORKFLOW_ACTIONS:
            trace_entry["shortcut"] = f"force_action:{force_action}"
            return {
                "intent": "tool_call",
                "intent_confidence": 1.0,
                "intent_reason": "force_action_shot_workflow",
                "tool_name": "shot_workflow.compose",
                "tool_args": _extract_shot_workflow_args(state),
                "trace": [trace_entry],
            }
        if force_action in {"storyboard", "storyboard_design", "storyboard.workflow"}:
            trace_entry["shortcut"] = f"force_action:{force_action}"
            return {
                "intent": "tool_call",
                "intent_confidence": 1.0,
                "intent_reason": "force_action_storyboard",
                "tool_name": "storyboard.design",
                "tool_args": _extract_storyboard_args(state),
                "trace": [trace_entry],
            }
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


    # 2. Uploaded storyboard script table
    script_doc = _find_storyboard_script_document(uploaded_documents)
    if script_doc and _looks_like_shot_workflow_request(message):
        trace_entry["shortcut"] = "uploaded_shot_workflow_script_table"
        return {
            "intent": "tool_call",
            "intent_confidence": 1.0,
            "intent_reason": "uploaded_shot_workflow_script_table",
            "tool_name": "shot_workflow.extract",
            "tool_args": _extract_script_extract_args(state),
            "trace": [trace_entry],
        }
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

    if _looks_like_pasted_screenplay(message) or _looks_like_shot_workflow_request(message):
        trace_entry["shortcut"] = "pasted_screenplay_shot_workflow"
        return {
            "intent": "tool_call",
            "intent_confidence": 0.95,
            "intent_reason": "pasted_screenplay_shot_workflow",
            "tool_name": "shot_workflow.extract",
            "tool_args": _extract_script_extract_args(state),
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
