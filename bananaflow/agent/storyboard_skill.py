from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, List, Tuple

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
    from ..services.ollama_client import OllamaTextClient, is_ollama_model
    from ..services.runtime_skill import get_runtime_skill_text
    from .storyboard_execution import compile_storyboard_execution_package
except Exception:  # pragma: no cover - compatible with direct python runs
    from services.ollama_client import OllamaTextClient, is_ollama_model
    from services.runtime_skill import get_runtime_skill_text
    from agent.storyboard_execution import compile_storyboard_execution_package


STORYBOARD_DEFAULT_MODEL = str(
    os.getenv("STORYBOARD_DEFAULT_MODEL")
    or os.getenv("IDEA_SCRIPT_DEFAULT_MODEL")
    or "ollama:gemma4:latest"
).strip() or "ollama:gemma4:latest"
STORYBOARD_DEFAULT_TIMEOUT_SEC = max(30, int(os.getenv("STORYBOARD_TIMEOUT_SEC") or 180))

PIPELINE_STAGES = [
    {
        "id": "script_read",
        "title": "脚本解读",
        "goal": "先理解戏剧结构、主角欲望、阻力、转折和观众信息顺序，不直接写镜头。",
    },
    {
        "id": "sequence_map",
        "title": "戏剧地图",
        "goal": "把脚本拆成可玩的戏剧段落，明确每段结束后改变了什么。",
    },
    {
        "id": "camera_strategy",
        "title": "镜头语言策略",
        "goal": "为每个序列指定景别呼吸、压力方向、信息模式和 close-up 预算。",
    },
    {
        "id": "scene_shot_flow",
        "title": "场景戏核与 Shot Flow",
        "goal": "按场景锁定戏核、观众站位、reaction owner、连续性锚点和 shot flow。",
    },
    {
        "id": "rough_thumbnail_sheet",
        "title": "粗分镜任务单",
        "goal": "输出 rough thumbnail pass 1，可直接给分镜师起草。",
    },
    {
        "id": "animatic_review",
        "title": "Animatic 复核",
        "goal": "检查节奏、信息顺序、假高潮、hold 点和声音节拍。",
    },
    {
        "id": "structural_revision",
        "title": "结构修订",
        "goal": "先修正结构，再修细节，明确该删、该保、该延后、该强化的内容。",
    },
    {
        "id": "final_delivery",
        "title": "最终分镜总稿",
        "goal": "整合成单一主交付物，附最终交付说明和下一阶段建议。",
    },
]
STAGE_INDEX = {stage["id"]: idx for idx, stage in enumerate(PIPELINE_STAGES)}
EXECUTION_STAGE = {
    "id": "execution_preparation",
    "title": "执行准备",
    "goal": "把最终分镜总稿编译成 asset_bible、shot_spec 和 prompt_pack，供后续自动视频生成使用。",
}
ALL_STAGE_IDS = [stage["id"] for stage in PIPELINE_STAGES] + [EXECUTION_STAGE["id"]]


def _clean_text(value: Any) -> str:
    return str(value or "").strip()


def _as_dict(value: Any) -> Dict[str, Any]:
    if isinstance(value, dict):
        return dict(value)
    return {}


def _as_list(value: Any) -> List[Any]:
    if isinstance(value, list):
        return list(value)
    return []


def _extract_json(text: str) -> Any:
    content = _clean_text(text)
    if not content:
        raise ValueError("empty_storyboard_response")
    try:
        return json.loads(content)
    except Exception:
        pass

    fenced = re.findall(r"```(?:json)?\s*([\s\S]*?)```", content, flags=re.IGNORECASE)
    for block in fenced:
        block_text = _clean_text(block)
        if not block_text:
            continue
        try:
            return json.loads(block_text)
        except Exception:
            continue

    first_obj = content.find("{")
    last_obj = content.rfind("}")
    if first_obj >= 0 and last_obj > first_obj:
        chunk = content[first_obj : last_obj + 1]
        try:
            return json.loads(chunk)
        except Exception:
            pass

    partial = _extract_partial_stage_payload(content)
    if partial:
        return partial

    raise ValueError("storyboard_json_parse_failed")


def _decode_json_string_fragment(value: str) -> str:
    raw = str(value or "")
    if not raw:
        return ""
    try:
        return json.loads(f"\"{raw}\"")
    except Exception:
        return raw.replace("\\n", "\n").replace("\\\"", "\"").replace("\\u003e", ">").replace("\\u003c", "<")


def _extract_string_field(content: str, field_name: str) -> str:
    pattern = rf'"{re.escape(field_name)}"\s*:\s*"((?:\\.|[^"\\])*)"'
    match = re.search(pattern, content, flags=re.DOTALL)
    if not match:
        return ""
    return _clean_text(_decode_json_string_fragment(match.group(1)))


def _extract_partial_sections(content: str) -> List[Dict[str, str]]:
    sections: List[Dict[str, str]] = []
    pattern = re.compile(
        r'\{\s*"id"\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*"title"\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*"content"\s*:\s*"((?:\\.|[^"\\])*)"\s*\}',
        flags=re.DOTALL,
    )
    for match in pattern.finditer(content):
        section_id = _clean_text(_decode_json_string_fragment(match.group(1)))
        title = _clean_text(_decode_json_string_fragment(match.group(2)))
        body = _clean_text(_decode_json_string_fragment(match.group(3)))
        if not body:
            continue
        sections.append(
            {
                "id": section_id or f"section_{len(sections) + 1}",
                "title": title or f"阶段 {len(sections) + 1}",
                "content": body,
            }
        )
    return sections


def _extract_partial_stage_payload(content: str) -> Dict[str, Any]:
    stage_id = _extract_string_field(content, "stage_id")
    stage_title = _extract_string_field(content, "stage_title")
    summary = _extract_string_field(content, "summary")
    content_text = _extract_string_field(content, "content")
    next_stage_hint = _extract_string_field(content, "next_stage_hint")
    sections = _extract_partial_sections(content)

    if not any([stage_id, stage_title, summary, content_text, next_stage_hint, sections]):
        return {}
    return {
        "stage_id": stage_id,
        "stage_title": stage_title,
        "summary": summary,
        "content": content_text,
        "next_stage_hint": next_stage_hint,
        "sections": sections,
        "raw_text": content,
    }


def _pick_text(data: Dict[str, Any], *keys: str) -> str:
    for key in keys:
        value = _clean_text(data.get(key))
        if value:
            return value
    return ""


def _project_title(payload: Dict[str, Any]) -> str:
    product = _clean_text(payload.get("product"))
    source_title = _clean_text(payload.get("source_title"))
    if product and source_title:
        return f"{product}：{source_title}"
    return source_title or product or "分镜项目"


def _normalize_stage_result(data: Any, stage: Dict[str, str]) -> Dict[str, Any]:
    payload = _as_dict(data)
    if not payload:
        return {
            "stage_id": stage["id"],
            "stage_title": stage["title"],
            "summary": "",
            "content": _clean_text(data),
            "next_stage_hint": "",
            "sections": [],
            "raw": {},
        }

    stage_id = _pick_text(payload, "stage_id", "id") or stage["id"]
    stage_title = _pick_text(payload, "stage_title", "title") or stage["title"]
    summary = _pick_text(payload, "summary", "overview")
    content_text = _pick_text(payload, "content", "body", "text", "markdown")
    if stage["id"] == "final_delivery":
        content_text = _sanitize_final_delivery_content(content_text)
    if stage["id"] == "rough_thumbnail_sheet":
        raw_frames = [item for item in _as_list(payload.get("frames")) if _as_dict(item)]
        if raw_frames:
            frame_sections: List[Dict[str, str]] = []
            for index, item in enumerate(raw_frames, start=1):
                frame = _as_dict(item)
                frame_id = _pick_text(frame, "frame_id", "id") or f"Frame {index}"
                purpose = _pick_text(frame, "purpose")
                framing = _pick_text(frame, "framing")
                action = _pick_text(frame, "action")
                anchor = _pick_text(frame, "anchor", "continuity_anchor")
                note = _pick_text(frame, "note")
                detail_lines = [
                    f"景别：{framing}" if framing else "",
                    f"动作：{action}" if action else "",
                    f"锚点：{anchor}" if anchor else "",
                    f"备注：{note}" if note else "",
                ]
                frame_sections.append(
                    {
                        "id": f"frame_{index:02d}",
                        "title": frame_id,
                        "content": "\n".join(line for line in detail_lines if line),
                    }
                )
            if not summary:
                summary = f"共 {len(frame_sections)} 个 rough frame，可直接开画。"
            if not content_text:
                content_text = "已输出结构化粗分镜任务单，按 frame 顺序执行开画。"
            payload["sections"] = frame_sections
    sections = _extract_partial_sections(_pick_text(payload, "raw_text")) if not _as_list(payload.get("sections")) else []
    if not sections:
        raw_sections = _as_list(payload.get("sections"))
        for item in raw_sections:
            section = _as_dict(item)
            section_content = _pick_text(section, "content", "body", "text", "markdown")
            if not section_content:
                continue
            sections.append(
                {
                    "id": _pick_text(section, "id", "key") or f"section_{len(sections) + 1}",
                    "title": _pick_text(section, "title", "name", "label") or f"子段 {len(sections) + 1}",
                    "content": section_content,
                }
            )
    if stage["id"] == "final_delivery":
        sections = _normalize_manifest_sections(sections)
    return {
        "stage_id": stage_id,
        "stage_title": stage_title,
        "summary": summary,
        "content": content_text or _pick_text(payload, "raw_text"),
        "next_stage_hint": _pick_text(payload, "next_stage_hint", "next_stage", "next"),
        "sections": sections,
        "raw": payload,
    }


def _initial_state(payload: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "version": 1,
        "project_title": _project_title(payload),
        "source": {
            "product": _clean_text(payload.get("product")),
            "source_title": _clean_text(payload.get("source_title")),
            "selected_angle": _clean_text(payload.get("selected_angle")),
            "primary_platform": _clean_text(payload.get("primary_platform")),
            "secondary_platform": _clean_text(payload.get("secondary_platform")),
            "script": _clean_text(payload.get("script")),
        },
        "stages": {},
    }


def _normalize_state(payload: Dict[str, Any], state: Dict[str, Any] | None) -> Dict[str, Any]:
    current = _as_dict(state)
    normalized = _initial_state(payload)
    normalized["project_title"] = _pick_text(current, "project_title") or normalized["project_title"]
    stages = _as_dict(current.get("stages"))
    normalized_stages: Dict[str, Any] = {}
    for stage in PIPELINE_STAGES:
        item = _as_dict(stages.get(stage["id"]))
        if not item:
            continue
        normalized_stages[stage["id"]] = {
            "stage_id": stage["id"],
            "stage_title": _pick_text(item, "stage_title", "title") or stage["title"],
            "summary": _pick_text(item, "summary"),
            "content": _pick_text(item, "content"),
            "sections": _as_list(item.get("sections")),
            "status": _pick_text(item, "status") or "done",
        }
    normalized["stages"] = normalized_stages
    return normalized


def _completed_stage_ids(state: Dict[str, Any]) -> List[str]:
    stages = _as_dict(state.get("stages"))
    completed: List[str] = []
    final_stage = _as_dict(stages.get("final_delivery"))
    final_done = _pick_text(final_stage, "status") == "done" and (
        _pick_text(final_stage, "content") or _pick_text(final_stage, "summary")
    )
    for stage in PIPELINE_STAGES:
        item = _as_dict(stages.get(stage["id"]))
        if final_done and stage["id"] != EXECUTION_STAGE["id"]:
            completed.append(stage["id"])
            continue
        if _pick_text(item, "status") == "done" and (_pick_text(item, "content") or _pick_text(item, "summary")):
            completed.append(stage["id"])
    execution = _as_dict(state.get(EXECUTION_STAGE["id"]))
    if _pick_text(execution, "status") == "done":
        completed.append(EXECUTION_STAGE["id"])
    return completed


def _next_stage_id(state: Dict[str, Any]) -> str:
    completed = set(_completed_stage_ids(state))
    for stage in PIPELINE_STAGES:
        if stage["id"] not in completed:
            return stage["id"]
    if EXECUTION_STAGE["id"] not in completed:
        return EXECUTION_STAGE["id"]
    return ""


def _resolve_stage(action: str, target_stage: str, state: Dict[str, Any]) -> Dict[str, str]:
    requested = _clean_text(target_stage)
    if action == "rerun_stage":
        if requested in STAGE_INDEX:
            return PIPELINE_STAGES[STAGE_INDEX[requested]]
        if requested == EXECUTION_STAGE["id"]:
            return EXECUTION_STAGE
    next_stage = _next_stage_id(state)
    if next_stage:
        if next_stage == EXECUTION_STAGE["id"]:
            return EXECUTION_STAGE
        return PIPELINE_STAGES[STAGE_INDEX[next_stage]]
    return EXECUTION_STAGE


def _prior_stage_context(state: Dict[str, Any], current_stage_id: str) -> str:
    stages = _as_dict(state.get("stages"))
    current_idx = STAGE_INDEX.get(current_stage_id, 0)
    chunks: List[str] = []
    for stage in PIPELINE_STAGES[:current_idx]:
        item = _as_dict(stages.get(stage["id"]))
        if not item:
            continue
        content = _pick_text(item, "content")
        summary = _pick_text(item, "summary")
        if not content and not summary:
            continue
        chunks.append(
            f"## {stage['title']}\n"
            f"摘要：{summary}\n"
            f"{content}"
        )
    return "\n\n".join(chunks).strip()


def _build_stage_prompt(payload: Dict[str, Any], state: Dict[str, Any], stage: Dict[str, str], skill_text: str) -> str:
    source = _as_dict(state.get("source"))
    prior_context = _prior_stage_context(state, stage["id"])
    extra_instruction = ""
    if stage["id"] == "rough_thumbnail_sheet":
        extra_instruction += (
            "\nRough thumbnail special rule:\n"
            "Do not output abstract methodology only.\n"
            "You must output an actionable rough thumbnail task list as a JSON-first frames array.\n"
            "Add a top-level field named 'frames'. It must be an array.\n"
            "Each frame item must contain: frame_id, purpose, framing, action, anchor, note.\n"
            "Each frame item should be drawable by a storyboard artist immediately.\n"
            "You may still include summary/content/sections, but frames is mandatory for this stage.\n"
        )
    if stage["id"] == "final_delivery":
        extra_instruction = (
            "\nFinal delivery special rule:\n"
            "Keep the normal human-readable final storyboard draft.\n"
            "Also add one extra section with id='shot_manifest' and title='Shot Manifest'.\n"
            "The section content must be a JSON array string. Each item should describe one shot with these fields:\n"
            "sequence_id, scene_id, shot_id, sequence_title, scene_title, purpose, story_function, subject, action, framing, camera_angle, camera_movement, duration_sec, emotion, continuity_anchor, look_name, location_name, audio_cue, transition_in, transition_out, climax_weight, prompt_intent.\n"
            "Use fixed enums only:\n"
            "story_function=[hook, problem, turn, progression, climax, cta, resolution]\n"
            "camera_angle=[eye_level, close_angle, over_shoulder, high_angle, low_angle, pov]\n"
            "camera_movement=[static, rapid_cut, graphic_motion, tracking, push_in, pull_out, pan, slow_motion, handheld]\n"
            "transition_in/transition_out=[cold_open, hard_cut, match_cut, scene_cut, look_reveal_cut, location_cut, linger_cut, hold_on_end, fade_in, fade_out, dissolve]\n"
            "climax_weight must be numeric and limited to 0.0-1.0.\n"
            "Do not remove the normal human-readable final delivery content.\n"
        )
    return (
        "You are executing the storyboard-storytelling-pipeline skill as a stage-based orchestrator.\n"
        "Follow the skill and references as the primary authority.\n"
        "Work only on the requested stage, but keep all previous approved stages intact.\n"
        "Output Chinese JSON only.\n"
        "Required schema:\n"
        "{"
        "\"stage_id\":\"\","
        "\"stage_title\":\"\","
        "\"summary\":\"\","
        "\"content\":\"\","
        "\"sections\":[{\"id\":\"\",\"title\":\"\",\"content\":\"\"}],"
        "\"next_stage_hint\":\"\""
        "}\n"
        "For this stage, produce executable storyboard deliverables, not generic advice.\n"
        "If prior context exists, continue from it instead of restarting.\n\n"
        f"{extra_instruction}\n"
        f"Skill bundle:\n{skill_text}\n\n"
        f"Project: {_pick_text(state, 'project_title') or _project_title(payload)}\n"
        f"Target stage id: {stage['id']}\n"
        f"Target stage title: {stage['title']}\n"
        f"Stage goal: {stage['goal']}\n"
        f"Product: {_pick_text(source, 'product')}\n"
        f"Source title: {_pick_text(source, 'source_title')}\n"
        f"Selected angle: {_pick_text(source, 'selected_angle')}\n"
        f"Primary platform: {_pick_text(source, 'primary_platform')}\n"
        f"Secondary platform: {_pick_text(source, 'secondary_platform')}\n"
        f"User request: {_clean_text(payload.get('prompt')) or '生成分镜'}\n\n"
        f"Script / source material:\n{_pick_text(source, 'script')}\n\n"
        f"Approved prior stage context:\n{prior_context or 'None'}\n"
    )


def _stage_text_bundle(stage_result: Dict[str, Any]) -> str:
    parts = [
        _pick_text(stage_result, "summary"),
        _pick_text(stage_result, "content"),
    ]
    for section in _as_list(stage_result.get("sections")):
        item = _as_dict(section)
        parts.append(_pick_text(item, "title"))
        parts.append(_pick_text(item, "content"))
    return "\n".join(part for part in parts if _clean_text(part))


def _validate_stage_result(stage: Dict[str, str], stage_result: Dict[str, Any]) -> Tuple[bool, str]:
    stage_id = stage["id"]
    bundle = _stage_text_bundle(stage_result)
    if not bundle:
        return False, "阶段结果为空"

    if stage_id == "scene_shot_flow":
        has_scene = bool(re.search(r"场景|scene", bundle, re.IGNORECASE))
        has_shot = bool(re.search(r"\bshot\b|镜头", bundle, re.IGNORECASE))
        if not (has_scene and has_shot):
            return False, "必须明确 scene 与 shot flow，不能只给抽象结构总结"

    if stage_id == "rough_thumbnail_sheet":
        raw = _as_dict(stage_result.get("raw"))
        raw_frames = [item for item in _as_list(raw.get("frames")) if _as_dict(item)]
        if raw_frames:
            return True, ""
        has_frames = bool(re.search(r"方格|frame|panel|\bshot\s*\d+", bundle, re.IGNORECASE))
        if not has_frames:
            return False, "必须输出 frames 数组，且内容为可直接开画的编号 frame/shot 任务单"
        if re.search(r"本阶段的任务是|核心冲突是|确保观众的注意力", _pick_text(stage_result, "content")) and not re.search(
            r"方格|frame|panel|\bshot\s*\d+",
            _pick_text(stage_result, "content"),
            re.IGNORECASE,
        ):
            return False, "不能只重复阶段目标或结构原则，必须给具体 thumbnail 任务"

    if stage_id == "final_delivery":
        content = _pick_text(stage_result, "content")
        if re.search(r"此处应包含|由于篇幅限制|结构化描述代替|完整分镜板", content):
            return False, "最终分镜总稿不能包含占位说明，必须直接给结构化镜头稿"
        sections = [_as_dict(item) for item in _as_list(stage_result.get("sections"))]
        has_manifest = any(
            _pick_text(section, "id") == "shot_manifest" or "shot manifest" in _pick_text(section, "title").lower()
            for section in sections
        )
        if not has_manifest:
            return False, "最终分镜总稿必须附带 shot_manifest section"

    return True, ""


def _build_retry_prompt(base_prompt: str, stage: Dict[str, str], reason: str) -> str:
    return (
        f"{base_prompt}\n\n"
        "Validation retry:\n"
        f"The previous output for stage '{stage['id']}' was rejected.\n"
        f"Reason: {reason}\n"
        "You must regenerate only this stage and satisfy the missing deliverable requirements.\n"
        "Do not repeat abstract explanation. Output the concrete stage artifact in JSON.\n"
    )


def _build_blocked_stage_result(stage: Dict[str, str], reason: str) -> Dict[str, Any]:
    reason_text = _clean_text(reason) or "当前阶段输出未满足执行要求。"
    return {
        "stage_id": stage["id"],
        "stage_title": stage["title"],
        "summary": f"{stage['title']} 未通过质量校验：{reason_text}",
        "content": (
            "系统已自动重试一次，但当前阶段产物仍不满足最小交付要求。"
            "请直接使用“重试本阶段”，直到该阶段输出具体可执行产物，而不是抽象说明。"
        ),
        "sections": [
            {
                "id": "blocked_reason",
                "title": "未通过原因",
                "content": reason_text,
            }
        ],
        "raw": {
            "blocked_reason": reason_text,
        },
    }


def _manifest_sections_from_stage_result(stage_result: Dict[str, Any]) -> List[Dict[str, Any]]:
    sections = [_as_dict(item) for item in _as_list(stage_result.get("sections"))]
    return [
        section
        for section in sections
        if _pick_text(section, "id") == "shot_manifest" or "shot manifest" in _pick_text(section, "title").lower()
    ]


def _normalize_manifest_rows(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    normalized: List[Dict[str, Any]] = []
    for index, item in enumerate(rows, start=1):
        row = _as_dict(item)
        story_function = _normalize_story_function(_pick_text(row, "story_function"))
        normalized.append(
            {
                "sequence_id": _pick_text(row, "sequence_id") or f"seq_{index:02d}",
                "scene_id": _pick_text(row, "scene_id") or f"scene_{index:02d}",
                "shot_id": _pick_text(row, "shot_id") or f"shot_{index:03d}",
                "sequence_title": _pick_text(row, "sequence_title") or _pick_text(row, "sequence_id") or f"seq_{index:02d}",
                "scene_title": _pick_text(row, "scene_title") or _pick_text(row, "scene_id") or f"scene_{index:02d}",
                "purpose": _pick_text(row, "purpose") or "推进当前镜头信息表达",
                "story_function": story_function,
                "subject": _pick_text(row, "subject") or _semantic_subject_from_action(_pick_text(row, "action"), f"shot_{index:03d}"),
                "action": _pick_text(row, "action"),
                "framing": _pick_text(row, "framing") or "MS",
                "camera_angle": _normalize_camera_angle(_pick_text(row, "camera_angle")),
                "camera_movement": _normalize_camera_movement(_pick_text(row, "camera_movement")),
                "duration_sec": float(row.get("duration_sec") or 2.0),
                "emotion": _pick_text(row, "emotion") or "observational",
                "continuity_anchor": _pick_text(row, "continuity_anchor") or _pick_text(row, "scene_title") or f"scene_{index:02d}",
                "look_name": _pick_text(row, "look_name"),
                "location_name": _pick_text(row, "location_name"),
                "look_ref": _pick_text(row, "look_ref"),
                "location_ref": _pick_text(row, "location_ref"),
                "audio_cue": _pick_text(row, "audio_cue"),
                "transition_in": _normalize_transition(_pick_text(row, "transition_in")),
                "transition_out": _normalize_transition(_pick_text(row, "transition_out")),
                "climax_weight": round(min(max(float(row.get("climax_weight") or 0.35), 0.0), 1.0), 2),
                "prompt_intent": _pick_text(row, "prompt_intent") or f"{story_function}:{_pick_text(row, 'subject') or _pick_text(row, 'shot_id')}",
            }
        )
    return normalized


def _normalize_manifest_sections(sections: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    normalized_sections: List[Dict[str, Any]] = []
    for section in sections:
        item = _as_dict(section)
        is_manifest = _pick_text(item, "id") == "shot_manifest" or "shot manifest" in _pick_text(item, "title").lower()
        if not is_manifest:
            normalized_sections.append(item)
            continue
        try:
            rows = json.loads(_pick_text(item, "content"))
        except Exception:
            normalized_sections.append(item)
            continue
        if not isinstance(rows, list):
            normalized_sections.append(item)
            continue
        normalized_sections.append(
            {
                "id": "shot_manifest",
                "title": "Shot Manifest",
                "content": json.dumps(_normalize_manifest_rows([_as_dict(row) for row in rows if _as_dict(row)]), ensure_ascii=False),
            }
        )
    return normalized_sections


def _parse_labelled_value(text: str, label: str) -> str:
    pattern = rf"{re.escape(label)}\s*[：:]\s*(.+)"
    match = re.search(pattern, _clean_text(text))
    return _clean_text(match.group(1)) if match else ""


def _first_sentence(text: str) -> str:
    source = _clean_text(text)
    if not source:
        return ""
    parts = re.split(r"[。！？\n]", source)
    for part in parts:
        cleaned = _clean_text(part)
        if cleaned:
            return cleaned
    return source


def _sanitize_final_delivery_content(text: str) -> str:
    source = _clean_text(text)
    if not source:
        return ""
    lines = []
    for raw_line in source.splitlines():
        line = raw_line.rstrip()
        stripped = _clean_text(line)
        if re.search(r"此处应包含|由于篇幅限制|结构化描述代替|完整的分镜板描述|完整分镜板", stripped):
            continue
        if re.fullmatch(r"shot manifest", stripped, flags=re.IGNORECASE):
            break
        lines.append(line)
    return "\n".join(lines).strip()


def _normalize_story_function(value: str) -> str:
    text = _clean_text(value).lower()
    if text in {"hook", "problem", "turn", "progression", "climax", "cta", "resolution"}:
        return text
    if re.search(r"hook|opening|开场", text):
        return "hook"
    if re.search(r"problem|痛点|误区|冲突", text):
        return "problem"
    if re.search(r"turn|reveal|转折|顿悟", text):
        return "turn"
    if re.search(r"climax|高潮|hero", text):
        return "climax"
    if re.search(r"cta|行动|购买|关注|call", text):
        return "cta"
    if re.search(r"resolution|收束|总结", text):
        return "resolution"
    return "progression"


def _normalize_camera_angle(value: str) -> str:
    text = _clean_text(value).lower()
    if text in {"eye_level", "close_angle", "over_shoulder", "high_angle", "low_angle", "pov"}:
        return text
    if re.search(r"over.?shoulder|ots|过肩", text):
        return "over_shoulder"
    if re.search(r"high|俯|top", text):
        return "high_angle"
    if re.search(r"low|仰", text):
        return "low_angle"
    if re.search(r"pov|主观", text):
        return "pov"
    if re.search(r"close|特写|cu|ecu", text):
        return "close_angle"
    return "eye_level"


def _normalize_camera_movement(value: str) -> str:
    text = _clean_text(value).lower()
    if text in {"static", "rapid_cut", "graphic_motion", "tracking", "push_in", "pull_out", "pan", "slow_motion", "handheld"}:
        return text
    if re.search(r"rapid|快切|快速切换", text):
        return "rapid_cut"
    if re.search(r"graphic|动画|cg", text):
        return "graphic_motion"
    if re.search(r"tracking|跟拍|推轨|推镜|平移", text):
        return "tracking"
    if re.search(r"push|推近|dolly in|zoom in", text):
        return "push_in"
    if re.search(r"pull|拉远|dolly out|zoom out", text):
        return "pull_out"
    if re.search(r"pan|摇摄|摇镜", text):
        return "pan"
    if re.search(r"slow|慢动作|停留", text):
        return "slow_motion"
    if re.search(r"handheld|手持|晃动", text):
        return "handheld"
    return "static"


def _normalize_transition(value: str) -> str:
    text = _clean_text(value).lower()
    if text in {"cold_open", "hard_cut", "match_cut", "scene_cut", "look_reveal_cut", "location_cut", "linger_cut", "hold_on_end", "fade_in", "fade_out", "dissolve"}:
        return text
    if re.search(r"cold|开场", text):
        return "cold_open"
    if re.search(r"match", text):
        return "match_cut"
    if re.search(r"scene", text):
        return "scene_cut"
    if re.search(r"look", text):
        return "look_reveal_cut"
    if re.search(r"location", text):
        return "location_cut"
    if re.search(r"linger|停留", text):
        return "linger_cut"
    if re.search(r"hold|end", text):
        return "hold_on_end"
    if re.search(r"fade.?in", text):
        return "fade_in"
    if re.search(r"fade.?out", text):
        return "fade_out"
    if re.search(r"dissolve", text):
        return "dissolve"
    return "hard_cut"


def _semantic_subject_from_action(action: str, fallback: str) -> str:
    source = _clean_text(action)
    if not source:
        return fallback
    if re.search(r"博主|模特|主持人", source):
        if re.search(r"成分表", source):
            return "博主质疑成分表"
        if re.search(r"不.?手势|摇头", source):
            return "博主否定清洁力误区"
        if re.search(r"自信|专业|图表|公式|复配", source):
            return "博主引出科学方案"
        if re.search(r"微笑|关注我|指向", source):
            return "博主总结并发出行动引导"
        return "博主讲解镜头"
    if re.search(r"保护膜|膜层", source):
        return "保护膜形成动画"
    if re.search(r"屏障受损|裂纹|红色|干燥", source):
        return "屏障受损皮肤 CG"
    if re.search(r"早晨|洗脸|浴室", source):
        return "早晨温和净化演示"
    if re.search(r"晚上|夜晚|修复|平滑|饱满", source):
        return "夜晚修复护理演示"
    return _first_sentence(source)[:32] or fallback


def _is_frame_like_label(value: str) -> bool:
    text = _clean_text(value)
    if not text:
        return False
    return bool(
        re.search(r"frame|方格|panel", text, re.IGNORECASE)
        or re.fullmatch(r"F\d+(?:_\d+)+", text, flags=re.IGNORECASE)
        or re.fullmatch(r"S\d+(?:_\d+)+", text, flags=re.IGNORECASE)
    )


def _scene_metadata_from_flow(state: Dict[str, Any]) -> Dict[int, Dict[str, str]]:
    stages = _as_dict(state.get("stages"))
    scene_flow = _as_dict(stages.get("scene_shot_flow"))
    content = _pick_text(scene_flow, "content")
    if not content:
        return {}
    matches = list(
        re.finditer(
            r"【\s*([^】]+?)\s*】(?:\(([^)]*)\))?\s*(.*?)(?=【\s*[^】]+?\s*】|$)",
            content,
            flags=re.DOTALL,
        )
    )
    scene_map: Dict[int, Dict[str, str]] = {}
    for index, match in enumerate(matches, start=1):
        scene_title = _clean_text(match.group(1)) or f"场景 {index}"
        block = _clean_text(match.group(3))
        goal = _parse_labelled_value(block, "目标")
        scene_core = _parse_labelled_value(block, "戏核")
        anchor = _parse_labelled_value(block, "连续性锚点")
        scene_map[index] = {
            "sequence_title": scene_title,
            "scene_title": scene_title,
            "purpose": goal or scene_core or _first_sentence(block) or scene_title,
            "continuity_anchor": anchor or scene_title,
        }
    return scene_map


def _camera_angle_from_fields(framing: str, action: str, note: str) -> str:
    source = " ".join(filter(None, [_clean_text(framing), _clean_text(action), _clean_text(note)]))
    if re.search(r"俯角|top|高位", source, re.IGNORECASE):
        return "high_angle"
    if re.search(r"仰角|low angle", source, re.IGNORECASE):
        return "low_angle"
    if re.search(r"过肩|OTS", source, re.IGNORECASE):
        return "over_shoulder"
    if re.search(r"特写|CU|ECU", source, re.IGNORECASE):
        return "close_angle"
    return "eye_level"


def _camera_movement_from_fields(framing: str, action: str, note: str) -> str:
    source = " ".join(filter(None, [_clean_text(framing), _clean_text(action), _clean_text(note)]))
    if re.search(r"快速切换|快切", source):
        return "rapid_cut"
    if re.search(r"慢动作|停留|沉淀", source):
        return "slow_motion"
    if re.search(r"摇|pan|跟拍|tracking", source, re.IGNORECASE):
        return "tracking"
    if re.search(r"动画|CG", source, re.IGNORECASE):
        return "graphic_motion"
    return "static"


def _story_function_from_entry(frame_label: str, action: str, note: str) -> str:
    source = " ".join(filter(None, [_clean_text(frame_label), _clean_text(action), _clean_text(note)]))
    if re.search(r"F5_|关注|CTA|行动", source, re.IGNORECASE):
        return "cta"
    if re.search(r"F3_|保护膜|科学公式|复配|顿悟", source, re.IGNORECASE):
        return "turn"
    if re.search(r"F1_|误区|质疑|焦虑", source, re.IGNORECASE):
        return "hook"
    if re.search(r"F4_|早晨|夜晚|修复|实践", source, re.IGNORECASE):
        return "progression"
    return "progression"


def _emotion_from_entry(action: str, note: str) -> str:
    source = " ".join(filter(None, [_clean_text(action), _clean_text(note)]))
    if re.search(r"犀利|焦虑|冲击|痛苦|刺激", source):
        return "tense"
    if re.search(r"自信|顿悟|专业", source):
        return "uplifted"
    if re.search(r"轻柔|舒缓|仪式感|柔和|沉淀", source):
        return "soothing"
    return "observational"


def _climax_weight_from_entry(frame_label: str, action: str, note: str) -> float:
    source = " ".join(filter(None, [_clean_text(frame_label), _clean_text(action), _clean_text(note)]))
    base = 0.32
    if re.search(r"F1_", source):
        base = 0.48
    if re.search(r"F3_", source):
        base = 0.78
    if re.search(r"F5_", source):
        base = 0.72
    if re.search(r"保护膜|顿悟|高光|核心", source):
        base += 0.08
    if re.search(r"关注|CTA|行动", source):
        base += 0.06
    return round(min(base, 0.92), 2)


def _purpose_from_entry(frame_label: str, action: str, note: str) -> str:
    story_function = _story_function_from_entry(frame_label, action, note)
    if story_function == "hook":
        return "建立误区焦虑并抓住注意力"
    if story_function == "turn":
        return "引出科学方案并完成认知转折"
    if story_function == "cta":
        return "收束核心观点并发出行动引导"
    source = " ".join(filter(None, [_clean_text(action), _clean_text(note)]))
    if re.search(r"早晨|晚上|夜晚|使用|洗脸|浴室", source):
        return "将知识点落到日常使用场景"
    if re.search(r"屏障受损|裂纹|刺激", source):
        return "把问题状态视觉化并确认冲突"
    return "推进当前场景的信息表达"


def _rows_from_rough_block_entries(entries: List[Dict[str, str]], purpose: str, scene_map: Dict[int, Dict[str, str]]) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for index, entry in enumerate(entries, start=1):
        frame_label = _pick_text(entry, "frame_id", "title") or f"Frame {index}"
        framing = _pick_text(entry, "framing") or "MS"
        action = _pick_text(entry, "action") or _pick_text(entry, "content")
        anchor = _pick_text(entry, "anchor", "continuity_anchor") or frame_label
        note = _pick_text(entry, "note")
        scene_index_match = re.match(r"[FS](\d+)(?:_\d+)+", frame_label, flags=re.IGNORECASE)
        scene_index = int(scene_index_match.group(1)) if scene_index_match else 1
        scene_meta = scene_map.get(
            scene_index,
            {
                "sequence_title": f"场景 {scene_index}",
                "scene_title": f"场景 {scene_index}",
                "purpose": "",
                "continuity_anchor": anchor,
            },
        )
        story_function = _normalize_story_function(_story_function_from_entry(frame_label, action, note))
        climax_weight = _climax_weight_from_entry(frame_label, action, note)
        resolved_purpose = _pick_text(scene_meta, "purpose") or _purpose_from_entry(frame_label, action, note) or purpose or "粗分镜任务单回填"
        rows.append(
            {
                "sequence_id": f"seq_{scene_index:02d}",
                "scene_id": f"scene_{scene_index:02d}",
                "shot_id": f"shot_{index:03d}",
                "sequence_title": _pick_text(scene_meta, "sequence_title") or f"场景 {scene_index}",
                "scene_title": _pick_text(scene_meta, "scene_title") or f"场景 {scene_index}",
                "purpose": resolved_purpose,
                "story_function": story_function,
                "subject": _semantic_subject_from_action(action, frame_label),
                "action": action,
                "framing": framing,
                "camera_angle": _normalize_camera_angle(_camera_angle_from_fields(framing, action, note)),
                "camera_movement": _normalize_camera_movement(_camera_movement_from_fields(framing, action, note)),
                "duration_sec": 2.0,
                "emotion": _emotion_from_entry(action, note),
                "continuity_anchor": anchor or _pick_text(scene_meta, "continuity_anchor") or frame_label,
                "audio_cue": note,
                "transition_in": "hard_cut" if index == 1 else "match_cut",
                "transition_out": "hard_cut",
                "climax_weight": climax_weight,
                "prompt_intent": f"{story_function}:{_semantic_subject_from_action(action, frame_label)}",
            }
        )
    return rows


def _parse_rough_thumbnail_blocks(text: str) -> List[Dict[str, str]]:
    content = _clean_text(text)
    if not content:
        return []

    entries: List[Dict[str, str]] = []
    current: Dict[str, str] | None = None
    for raw_line in content.splitlines():
        line = _clean_text(raw_line)
        if not line:
            continue
        if _is_frame_like_label(line):
            if current:
                entries.append(current)
            current = {"frame_id": line}
            continue
        if current is None:
            continue
        for label, key in (("景别", "framing"), ("动作", "action"), ("锚点", "anchor"), ("备注", "note")):
            value = _parse_labelled_value(line, label)
            if value:
                current[key] = value
                break
        else:
            current["content"] = f"{_pick_text(current, 'content')}\n{line}".strip()
    if current:
        entries.append(current)
    return [entry for entry in entries if _pick_text(entry, "frame_id")]


def _synthesize_manifest_rows_from_state(state: Dict[str, Any]) -> List[Dict[str, Any]]:
    stages = _as_dict(state.get("stages"))
    rough = _as_dict(stages.get("rough_thumbnail_sheet"))
    rough_sections = [_as_dict(item) for item in _as_list(rough.get("sections")) if _as_dict(item)]
    rows: List[Dict[str, Any]] = []
    purpose = ""
    scene_map = _scene_metadata_from_flow(state)
    section_entries: List[Dict[str, str]] = []
    for section in rough_sections:
        title = _pick_text(section, "title")
        if not _is_frame_like_label(title):
            continue
        content = _pick_text(section, "content")
        section_entries.append(
            {
                "frame_id": title,
                "framing": _parse_labelled_value(content, "景别"),
                "action": _parse_labelled_value(content, "动作") or (content.splitlines()[0] if content else ""),
                "anchor": _parse_labelled_value(content, "锚点"),
                "note": _parse_labelled_value(content, "备注"),
                "content": content,
            }
        )
    rows = _rows_from_rough_block_entries(section_entries, purpose, scene_map)
    if rows:
        return rows

    rough_content = _pick_text(rough, "content")
    if rough_content:
        block_entries = _parse_rough_thumbnail_blocks(rough_content)
        rows = _rows_from_rough_block_entries(block_entries, purpose, scene_map)
        if rows:
            return rows
        for index, line in enumerate(_clean_text(rough_content).splitlines(), start=1):
            if not re.search(r"frame|方格|panel|\bshot\b", line, re.IGNORECASE):
                continue
            rows.append(
                {
                    "shot_id": f"shot_{len(rows) + 1:03d}",
                    "sequence_id": "seq_01",
                    "scene_id": "scene_01",
                    "sequence_title": "粗分镜序列",
                    "scene_title": "粗分镜场景",
                    "purpose": _purpose_from_entry(f"frame_{index:02d}", line, ""),
                    "story_function": "progression",
                    "subject": f"Frame {index}",
                    "action": _clean_text(re.sub(r"^\s*(?:frame|方格|panel|shot)\s*[:：#]?\s*\d*\s*", "", line, flags=re.IGNORECASE)),
                    "framing": "MS",
                    "camera_angle": "eye_level",
                    "camera_movement": "static",
                    "duration_sec": 2.0,
                    "emotion": "observational",
                    "continuity_anchor": f"frame_{index:02d}",
                    "audio_cue": "",
                    "transition_in": "hard_cut" if not rows else "match_cut",
                    "transition_out": "hard_cut",
                    "climax_weight": 0.35,
                    "prompt_intent": f"progression:frame_{index:02d}",
                }
            )
    if rows:
        return rows

    scene_flow = _as_dict(stages.get("scene_shot_flow"))
    scene_flow_content = _pick_text(scene_flow, "content")
    for match in re.finditer(r"Shot\s*(\d+)\s*(?:\(([^)]*)\))?\s*[:：]\s*(.+)", scene_flow_content or "", flags=re.IGNORECASE):
        shot_label = _clean_text(match.group(1))
        framing = _clean_text(match.group(2)) or "MS"
        description = _clean_text(match.group(3))
        rows.append(
            {
                "shot_id": f"shot_{int(shot_label):03d}" if shot_label.isdigit() else f"shot_{len(rows)+1:03d}",
                "sequence_id": "seq_01",
                "scene_id": "scene_01",
                "sequence_title": "场景分镜序列",
                "scene_title": "场景分镜场景",
                "purpose": "推进当前场景的信息表达",
                "story_function": "progression",
                "subject": description.split("，")[0].split(",")[0],
                "action": description,
                "framing": framing,
                "camera_angle": "eye_level",
                "camera_movement": "static",
                "duration_sec": 2.0,
                "emotion": "observational",
                "continuity_anchor": f"shot_{shot_label}",
                "audio_cue": "",
                "transition_in": "hard_cut" if not rows else "match_cut",
                "transition_out": "hard_cut",
                "climax_weight": 0.35,
                "prompt_intent": f"progression:shot_{shot_label}",
            }
        )
    return rows


def _append_local_shot_manifest(payload: Dict[str, Any], state: Dict[str, Any], stage_result: Dict[str, Any]) -> Dict[str, Any]:
    if stage_result.get("stage_id") != "final_delivery":
        return stage_result
    if _manifest_sections_from_stage_result(stage_result):
        return stage_result

    temp_state = _normalize_state(payload, state)
    temp_state["stages"]["final_delivery"] = {
        "stage_id": "final_delivery",
        "stage_title": "最终分镜总稿",
        "summary": _pick_text(stage_result, "summary"),
        "content": _pick_text(stage_result, "content"),
        "sections": _as_list(stage_result.get("sections")),
        "status": "done",
    }
    storyboard_master = _storyboard_master_from_state(payload, temp_state)
    compiled = compile_storyboard_execution_package(storyboard_master)
    shot_spec = _as_dict(compiled.get("shot_spec"))
    shots = [_as_dict(item) for item in _as_list(shot_spec.get("shots")) if _as_dict(item)]
    if not shots:
        fallback_rows = _synthesize_manifest_rows_from_state(temp_state)
        if fallback_rows:
            next_sections = list(_as_list(stage_result.get("sections")))
            next_sections.append(
                {
                    "id": "shot_manifest",
                    "title": "Shot Manifest",
                    "content": json.dumps(fallback_rows, ensure_ascii=False),
                }
            )
            next_raw = _as_dict(stage_result.get("raw"))
            next_raw["shot_manifest_source"] = "rough_thumbnail_fallback"
            return {
                **stage_result,
                "sections": next_sections,
                "raw": next_raw,
            }
    if not shots:
        return stage_result

    manifest_rows = []
    for shot in shots:
        manifest_rows.append(
            {
                "shot_id": _pick_text(shot, "shot_id"),
                "sequence_id": _pick_text(shot, "sequence_id"),
                "sequence_title": _pick_text(next((seq for seq in _as_list(shot_spec.get("sequences")) if _pick_text(_as_dict(seq), "sequence_id") == _pick_text(shot, "sequence_id")), {}), "title"),
                "scene_id": _pick_text(shot, "scene_id"),
                "scene_title": _pick_text(
                    next(
                        (
                            scene
                            for seq in _as_list(shot_spec.get("sequences"))
                            for scene in _as_list(_as_dict(seq).get("scenes"))
                            if _pick_text(_as_dict(scene), "scene_id") == _pick_text(shot, "scene_id")
                        ),
                        {},
                    ),
                    "title",
                ),
                "purpose": _pick_text(shot, "purpose"),
                "story_function": _normalize_story_function(_pick_text(shot, "story_function")),
                "subject": _pick_text(shot, "subject"),
                "action": _pick_text(shot, "action"),
                "framing": _pick_text(shot, "framing"),
                "camera_angle": _normalize_camera_angle(_pick_text(shot, "camera_angle")),
                "camera_movement": _normalize_camera_movement(_pick_text(shot, "camera_movement")),
                "duration_sec": float(shot.get("duration_sec") or 2.0),
                "emotion": _pick_text(shot, "emotion"),
                "continuity_anchor": _pick_text(shot, "continuity_anchor"),
                "look_ref": _pick_text(shot, "look_ref"),
                "location_ref": _pick_text(shot, "location_ref"),
                "audio_cue": _pick_text(shot, "audio_cue"),
                "transition_in": _normalize_transition(_pick_text(shot, "transition_in")),
                "transition_out": _normalize_transition(_pick_text(shot, "transition_out")),
                "climax_weight": round(min(max(float(shot.get("climax_weight") or 0.35), 0.0), 1.0), 2),
                "prompt_intent": _pick_text(shot, "prompt_intent"),
            }
        )
    next_sections = list(_as_list(stage_result.get("sections")))
    next_sections.append(
        {
            "id": "shot_manifest",
            "title": "Shot Manifest",
            "content": json.dumps(manifest_rows, ensure_ascii=False),
        }
    )
    next_raw = _as_dict(stage_result.get("raw"))
    next_raw["shot_manifest_source"] = "local_compiler"
    return {
        **stage_result,
        "sections": next_sections,
        "raw": next_raw,
    }


def _build_pipeline_response(payload: Dict[str, Any], state: Dict[str, Any], stage_result: Dict[str, Any], model: str) -> Dict[str, Any]:
    completed_ids = _completed_stage_ids(state)
    current_stage_state = _as_dict(state.get(EXECUTION_STAGE["id"])) if stage_result["stage_id"] == EXECUTION_STAGE["id"] else _as_dict(_as_dict(state.get("stages")).get(stage_result["stage_id"]))
    is_blocked = _pick_text(current_stage_state, "status") == "blocked"
    next_id = _next_stage_id(state)
    next_stage_title = (
        PIPELINE_STAGES[STAGE_INDEX[next_id]]["title"]
        if next_id in STAGE_INDEX
        else EXECUTION_STAGE["title"] if next_id == EXECUTION_STAGE["id"] else ""
    )
    sections: List[Dict[str, str]] = []
    for stage in PIPELINE_STAGES:
        item = _as_dict(_as_dict(state.get("stages")).get(stage["id"]))
        if not item:
            continue
        stage_content = _pick_text(item, "content")
        if stage_content:
            sections.append({"id": stage["id"], "title": stage["title"], "content": stage_content})
        for sub in _as_list(item.get("sections")):
            section = _as_dict(sub)
            sub_content = _pick_text(section, "content")
            if not sub_content:
                continue
            sections.append(
                {
                    "id": _pick_text(section, "id") or f"{stage['id']}_section_{len(sections)+1}",
                    "title": _pick_text(section, "title") or stage["title"],
                    "content": sub_content,
                }
            )

    final_stage = _as_dict(_as_dict(state.get("stages")).get("final_delivery"))
    final_storyboard_master = _pick_text(final_stage, "content")
    delivery_note = _pick_text(final_stage, "summary")
    execution = _as_dict(state.get(EXECUTION_STAGE["id"]))
    return {
        "model": model,
        "project_title": _pick_text(state, "project_title") or _project_title(payload),
        "stage_id": stage_result["stage_id"],
        "current_step": stage_result["stage_title"],
        "summary": stage_result["summary"],
        "sections": sections,
        "final_storyboard_master": final_storyboard_master,
        "delivery_note": delivery_note,
        "next_stage": "" if is_blocked else (next_stage_title or _pick_text(stage_result, "next_stage_hint")),
        "completed_stage_ids": completed_ids,
        "pending_stage_ids": [stage_id for stage_id in ALL_STAGE_IDS if stage_id not in completed_ids],
        "can_continue": False if is_blocked else bool(next_id),
        "state": state,
        "raw": _as_dict(stage_result.get("raw")),
        "asset_bible": _as_dict(execution.get("asset_bible")),
        "shot_spec": _as_dict(execution.get("shot_spec")),
        "prompt_pack": _as_dict(execution.get("prompt_pack")),
    }


def _storyboard_master_from_state(payload: Dict[str, Any], state: Dict[str, Any]) -> Dict[str, Any]:
    final_stage = _as_dict(_as_dict(state.get("stages")).get("final_delivery"))
    return {
        "project_title": _pick_text(state, "project_title") or _project_title(payload),
        "stage_id": "final_delivery",
        "current_step": "最终分镜总稿",
        "summary": _pick_text(final_stage, "summary"),
        "final_storyboard_master": _pick_text(final_stage, "content"),
        "state": state,
    }


def _build_execution_stage_result(payload: Dict[str, Any], state: Dict[str, Any]) -> Dict[str, Any]:
    storyboard_master = _storyboard_master_from_state(payload, state)
    compiled = compile_storyboard_execution_package(storyboard_master)
    asset_bible = _as_dict(compiled.get("asset_bible"))
    shot_spec = _as_dict(compiled.get("shot_spec"))
    prompt_pack = _as_dict(compiled.get("prompt_pack"))
    shot_count = len(_as_list(shot_spec.get("shots")))
    sequence_count = len(_as_list(shot_spec.get("sequences")))
    prompt_count = len(_as_list(prompt_pack.get("prompts")))
    if shot_count <= 0:
        return {
            "stage_id": EXECUTION_STAGE["id"],
            "stage_title": EXECUTION_STAGE["title"],
            "summary": "execution layer 编译未完成：未从 storyboard 结果中解析出可执行 shot。",
            "content": (
                "已生成 asset_bible，但 shot_spec / prompt_pack 为空。"
                "这说明当前 storyboard 结果缺少可解析的逐镜头信息，或现有文本格式未命中 parser。"
                "后续应补充可解析的 scene/shot 行，或扩展 parser，而不是把该结果视为成功执行准备。"
            ),
            "sections": [
                {
                    "id": "asset_bible",
                    "title": "Asset Bible",
                    "content": f"look={len(_as_list(asset_bible.get('look_definitions')))}，location={len(_as_list(asset_bible.get('locations')))}，资产锁定已生成。",
                },
                {
                    "id": "shot_spec",
                    "title": "Shot Spec",
                    "content": "shot=0，当前不能进入后续自动视频生成。",
                },
                {
                    "id": "prompt_pack",
                    "title": "Prompt Pack",
                    "content": "prompt=0，需先补足可解析 shot。",
                },
            ],
            "raw": {
                "asset_bible": asset_bible,
                "shot_spec": shot_spec,
                "prompt_pack": prompt_pack,
                "blocked_reason": "no_parsed_shots",
            },
        }
    return {
        "stage_id": EXECUTION_STAGE["id"],
        "stage_title": EXECUTION_STAGE["title"],
        "summary": f"已编译 execution layer：{sequence_count} 个 sequence，{shot_count} 个 shot，{prompt_count} 个 prompt 任务。",
        "content": (
            "已从最终分镜总稿生成机器可执行产物：asset_bible、shot_spec、prompt_pack。"
            "后续视频自动化应直接消费这三份结构化结果，而不是重新解析自然语言分镜。"
        ),
        "sections": [
            {
                "id": "asset_bible",
                "title": "Asset Bible",
                "content": f"look={len(_as_list(asset_bible.get('look_definitions')))}，location={len(_as_list(asset_bible.get('locations')))}，已锁定 continuity / climax protection。",
            },
            {
                "id": "shot_spec",
                "title": "Shot Spec",
                "content": f"sequence={sequence_count}，shot={shot_count}，保留 sequence / scene / shot 三层关系。",
            },
            {
                "id": "prompt_pack",
                "title": "Prompt Pack",
                "content": f"prompt={prompt_count}，每个 shot 已生成 keyframe / motion / negative / continuity / edit note。",
            },
        ],
        "raw": {
            "asset_bible": asset_bible,
            "shot_spec": shot_spec,
            "prompt_pack": prompt_pack,
        },
    }


class StoryboardPipelineOrchestrator:
    def __init__(self, model: str | None = None, timeout_sec: int | None = None) -> None:
        self.model = (model or STORYBOARD_DEFAULT_MODEL).strip() or STORYBOARD_DEFAULT_MODEL
        self.timeout_sec = max(30, int(timeout_sec or STORYBOARD_DEFAULT_TIMEOUT_SEC))
        self.skill_text = get_runtime_skill_text("storyboard")

    def is_available(self) -> bool:
        if not self.skill_text:
            return False
        if not is_ollama_model(self.model):
            return False
        try:
            return OllamaTextClient(timeout_sec=self.timeout_sec).is_available()
        except Exception:
            return False

    def run(
        self,
        payload: Dict[str, Any],
        *,
        action: str = "start",
        state: Dict[str, Any] | None = None,
        target_stage: str = "",
    ) -> Dict[str, Any]:
        script = _clean_text(payload.get("script"))
        if not script:
            raise RuntimeError("storyboard_script_missing")
        normalized_state = _normalize_state(payload, state)
        stage = _resolve_stage(_clean_text(action) or "start", target_stage, normalized_state)
        if stage["id"] == EXECUTION_STAGE["id"]:
            final_stage = _as_dict(_as_dict(normalized_state.get("stages")).get("final_delivery"))
            if not (_pick_text(final_stage, "content") or _pick_text(final_stage, "summary")):
                raise RuntimeError("storyboard_final_delivery_missing")
            stage_result = _build_execution_stage_result(payload, normalized_state)
            normalized_state[EXECUTION_STAGE["id"]] = {
                "stage_id": EXECUTION_STAGE["id"],
                "stage_title": EXECUTION_STAGE["title"],
                "summary": stage_result["summary"],
                "content": stage_result["content"],
                "sections": stage_result["sections"],
                "status": "done",
                "asset_bible": _as_dict(_as_dict(stage_result.get("raw")).get("asset_bible")),
                "shot_spec": _as_dict(_as_dict(stage_result.get("raw")).get("shot_spec")),
                "prompt_pack": _as_dict(_as_dict(stage_result.get("raw")).get("prompt_pack")),
            }
            return _build_pipeline_response(payload, normalized_state, stage_result, self.model)

        if not self.skill_text:
            raise RuntimeError("storyboard_skill_not_loaded")
        if not is_ollama_model(self.model):
            raise RuntimeError("storyboard_model_not_supported")

        client = OllamaTextClient(timeout_sec=self.timeout_sec)
        if not client.is_available():
            raise RuntimeError("storyboard_llm_unavailable")

        prompt = _build_stage_prompt(payload, normalized_state, stage, self.skill_text)
        config = types.GenerateContentConfig(
            temperature=0.2,
            top_p=0.9,
            max_output_tokens=3200,
            response_mime_type="application/json",
        )
        response = client.generate_content(
            model=self.model,
            contents=[types.Part(text=prompt)],
            config=config,
        )
        parsed = _extract_json(getattr(response, "text", "") or "")
        stage_result = _normalize_stage_result(parsed, stage)
        stage_result = _append_local_shot_manifest(payload, normalized_state, stage_result)
        valid, reason = _validate_stage_result(stage, stage_result)
        if not valid:
            retry_prompt = _build_retry_prompt(prompt, stage, reason)
            retry_response = client.generate_content(
                model=self.model,
                contents=[types.Part(text=retry_prompt)],
                config=config,
            )
            retry_parsed = _extract_json(getattr(retry_response, "text", "") or "")
            retry_stage_result = _normalize_stage_result(retry_parsed, stage)
            retry_stage_result = _append_local_shot_manifest(payload, normalized_state, retry_stage_result)
            retry_valid, retry_reason = _validate_stage_result(stage, retry_stage_result)
            if retry_valid:
                stage_result = retry_stage_result
            else:
                stage_result = _build_blocked_stage_result(stage, retry_reason or reason)
        normalized_state["stages"][stage["id"]] = {
            "stage_id": stage["id"],
            "stage_title": stage["title"],
            "summary": stage_result["summary"],
            "content": stage_result["content"],
            "sections": stage_result["sections"],
            "status": "blocked" if _pick_text(_as_dict(stage_result.get("raw")), "blocked_reason") else "done",
        }
        return _build_pipeline_response(payload, normalized_state, stage_result, self.model)


def run_storyboard_pipeline(
    payload: Dict[str, Any],
    *,
    action: str = "start",
    state: Dict[str, Any] | None = None,
    target_stage: str = "",
) -> Dict[str, Any]:
    orchestrator = StoryboardPipelineOrchestrator()
    return orchestrator.run(payload, action=action, state=state, target_stage=target_stage)
