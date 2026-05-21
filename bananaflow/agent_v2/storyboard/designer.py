from __future__ import annotations

import ast
import json
import re
import uuid
from typing import Any, Callable, Dict, Optional
from urllib.parse import unquote

from .prompts import (
    build_entity_design_prompt,
    build_intake_prompt,
    build_scene_outline_prompt,
    build_shot_design_prompt,
)
from .schemas import StoryboardPlan


def _load_config():
    try:
        from ...core.config import AGENT_MODEL_HTTP_PROXY, AGENT_MODEL_HTTPS_PROXY, MODEL_AGENT
    except Exception:  # pragma: no cover
        from core.config import AGENT_MODEL_HTTP_PROXY, AGENT_MODEL_HTTPS_PROXY, MODEL_AGENT
    return {
        "MODEL_AGENT": MODEL_AGENT,
        "AGENT_MODEL_HTTP_PROXY": AGENT_MODEL_HTTP_PROXY,
        "AGENT_MODEL_HTTPS_PROXY": AGENT_MODEL_HTTPS_PROXY,
    }


def _load_call_genai_retry_with_proxy():
    try:
        from ...services.genai_client import call_genai_retry_with_proxy
    except Exception:  # pragma: no cover
        from services.genai_client import call_genai_retry_with_proxy
    return call_genai_retry_with_proxy


def _load_ai_chat_text_client():
    try:
        from ...services.ai_chat_client import call_ai_chat_text
    except Exception:  # pragma: no cover
        from services.ai_chat_client import call_ai_chat_text
    return call_ai_chat_text


def _load_google_types():
    try:
        from google.genai import types
        return types
    except Exception:  # pragma: no cover
        class _FallbackPart:
            def __init__(self, text: str = "") -> None:
                self.text = text

        class _FallbackGenerateContentConfig:
            def __init__(self, **kwargs: Any) -> None:
                for key, value in kwargs.items():
                    setattr(self, key, value)

        class _FallbackTypes:
            Part = _FallbackPart
            GenerateContentConfig = _FallbackGenerateContentConfig

        return _FallbackTypes()


def _extract_text(response: Any) -> str:
    text = str(getattr(response, "text", "") or "").strip()
    if text:
        return text
    candidates = getattr(response, "candidates", None) or []
    for candidate in list(candidates or []):
        content = getattr(candidate, "content", None)
        parts = getattr(content, "parts", None) or []
        merged = "".join(str(getattr(part, "text", "") or "") for part in parts).strip()
        if merged:
            return merged
    return ""


def _build_json_repair_prompt(stage: str, raw_text: str) -> str:
    return (
        "你是 JSON 修复器。\n"
        "下面是 storyboard agent 在阶段输出的损坏 JSON。请保留原意，只修复格式，输出严格 JSON 对象。\n"
        f"阶段: {stage}\n"
        "要求:\n"
        "1. 只输出 JSON 对象，不要解释。\n"
        "2. 保留已有字段语义，不要扩写剧情。\n"
        "3. 所有 key 必须使用双引号。\n"
        "4. 修复缺失的冒号、逗号、括号、引号等格式错误。\n"
        "5. 如果是 entity_design，顶层应是 characters / subjects / locations。\n"
        "6. 如果是 scene_outline，顶层应是 title / global_notes / design_rationale / scenes。\n"
        "7. 如果是 shot_design，顶层应是 estimated_duration_sec / scenes。\n"
        "损坏内容如下:\n"
        f"{raw_text}"
    )


def _candidate_json_chunks(raw: str) -> list[str]:
    chunks: list[str] = []
    text = str(raw or "").strip()
    if not text:
        return chunks
    chunks.append(text)

    fenced = re.findall(r"```(?:json)?\s*([\s\S]*?)```", text, flags=re.IGNORECASE)
    for block in fenced:
        block_text = str(block or "").strip()
        if block_text:
            chunks.append(block_text)

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
    normalized = str(text or "")
    normalized = re.sub(r"\btrue\b", "True", normalized)
    normalized = re.sub(r"\bfalse\b", "False", normalized)
    normalized = re.sub(r"\bnull\b", "None", normalized)
    return ast.literal_eval(normalized)


def parse_llm_json(text: str) -> Dict[str, Any]:
    candidates = _candidate_json_chunks(str(text or ""))
    if not candidates:
        raise ValueError("storyboard_json_parse_failed")

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
    raise ValueError("storyboard_llm_output_not_object")


def _call_ai_chat_and_parse(
    *,
    message: str,
    authorization: str,
) -> Dict[str, Any]:
    response = _load_ai_chat_text_client()(message=message, authorization=authorization)
    return parse_llm_json(response.text)


def _call_genai_and_parse(
    *,
    prompt: str,
    req_id: str,
    stage: str,
    model: str,
    http_proxy: str,
    https_proxy: str,
) -> Dict[str, Any]:
    call_genai_retry_with_proxy = _load_call_genai_retry_with_proxy()
    types = _load_google_types()
    response = call_genai_retry_with_proxy(
        contents=[types.Part(text=prompt)],
        config=types.GenerateContentConfig(temperature=0.3),
        req_id=f"{req_id}:{stage}",
        retries=2,
        model=model,
        http_proxy=http_proxy,
        https_proxy=https_proxy,
    )
    return parse_llm_json(_extract_text(response))


def default_storyboard_llm_generate(
    stage: str,
    prompt: str,
    *,
    req_id: str = "storyboard",
    authorization: str = "",
) -> Dict[str, Any]:
    config = _load_config()
    auth = str(authorization or "").strip()
    if auth:
        raw_response = _load_ai_chat_text_client()(message=prompt, authorization=auth)
        raw_text = str(raw_response.text or "")
        try:
            return parse_llm_json(raw_text)
        except Exception:
            return _call_ai_chat_and_parse(
                message=_build_json_repair_prompt(stage, raw_text),
                authorization=auth,
            )

    call_genai_retry_with_proxy = _load_call_genai_retry_with_proxy()
    types = _load_google_types()
    response = call_genai_retry_with_proxy(
        contents=[types.Part(text=prompt)],
        config=types.GenerateContentConfig(temperature=0.3),
        req_id=f"{req_id}:{stage}",
        retries=2,
        model=config["MODEL_AGENT"],
        http_proxy=config["AGENT_MODEL_HTTP_PROXY"],
        https_proxy=config["AGENT_MODEL_HTTPS_PROXY"],
    )
    raw_text = _extract_text(response)
    try:
        return parse_llm_json(raw_text)
    except Exception:
        return _call_genai_and_parse(
            prompt=_build_json_repair_prompt(stage, raw_text),
            req_id=req_id,
            stage=f"{stage}:repair_json",
            model=config["MODEL_AGENT"],
            http_proxy=config["AGENT_MODEL_HTTP_PROXY"],
            https_proxy=config["AGENT_MODEL_HTTPS_PROXY"],
        )


_STORYBOARD_NODE_X_ORIGIN = 120
_STORYBOARD_NODE_X_STEP = 340


def build_storyboard_canvas_patch(
    plan: StoryboardPlan | Dict[str, Any],
    *,
    title: Optional[str] = None,
    existing_storyboard_count: int = 0,
) -> Dict[str, Any]:
    payload = plan.model_dump(mode="json") if isinstance(plan, StoryboardPlan) else dict(plan or {})
    plan_title = str(title or payload.get("title") or "Storyboard Plan").strip() or "Storyboard Plan"
    node_id = f"storyboard_plan_{uuid.uuid4().hex[:10]}"
    scene_count = len(list(payload.get("scenes") or []))
    shot_count = sum(len(list(s.get("shots") or [])) for s in list(payload.get("scenes") or []))
    summary_lines = [
        f"# {plan_title}",
        f"风格：{str(payload.get('style') or '-').strip() or '-'}",
        f"比例：{str(payload.get('aspect_ratio') or '16:9').strip() or '16:9'}",
        f"目标时长：{payload.get('target_duration_sec')}s  预计：{payload.get('estimated_duration_sec')}s",
        f"场景：{scene_count} 个  分镜：{shot_count} 个",
        "",
    ]
    for scene in list(payload.get("scenes") or []):
        summary_lines.append(f"## {scene.get('scene_no')} {str(scene.get('title') or '').strip()}")
        for shot in list(scene.get("shots") or []):
            summary_lines.append(
                f"- 镜头 {shot.get('shot_no')} ({shot.get('duration_sec')}s): {str(shot.get('visual_description') or '').strip()}"
            )
    # Offset horizontally so consecutive storyboard nodes don't overlap.
    x_pos = _STORYBOARD_NODE_X_ORIGIN + max(0, int(existing_storyboard_count)) * _STORYBOARD_NODE_X_STEP
    return {
        "patch": [
            {
                "op": "add_node",
                "node": {
                    "id": node_id,
                    "type": "storyboard_plan",
                    "x": x_pos,
                    "y": 120,
                    "data": {
                        "title": plan_title,
                        "text": "\n".join(summary_lines).strip(),
                        "node_kind": "storyboard_plan",
                        "storyboard_plan": payload,
                    },
                },
            }
        ],
        "summary": f"已生成分镜方案：{plan_title}（{scene_count} 场景 {shot_count} 分镜）",
    }


def build_character_asset_nodes(
    plan: StoryboardPlan | Dict[str, Any] | None,
    *,
    storyboard_x: int = _STORYBOARD_NODE_X_ORIGIN,
) -> list[Dict[str, Any]]:
    """Build canvas add_node ops for bound character three-view assets."""
    try:
        if isinstance(plan, StoryboardPlan):
            payload = plan.model_dump(mode="json")
        elif isinstance(plan, dict):
            payload = dict(plan or {})
        else:
            return []

        bindings = payload.get("local_asset_bindings")
        if not isinstance(bindings, dict):
            return []

        character_bindings = bindings.get("character_bindings")
        if not isinstance(character_bindings, list):
            return []

        try:
            base_x = max(0, int(storyboard_x))
        except Exception:
            base_x = _STORYBOARD_NODE_X_ORIGIN

        ops: list[Dict[str, Any]] = []
        for index, binding in enumerate(character_bindings):
            if not isinstance(binding, dict):
                continue
            url = str(binding.get("three_view_url") or "").strip()
            if not url:
                continue

            character_name = str(binding.get("character_name") or "").strip()
            entity_name = str(binding.get("entity_name") or "").strip()
            raw_name = str(url or binding.get("three_view_path") or "").replace("\\", "/")
            asset_name = unquote(raw_name.rsplit("/", 1)[-1]).strip()
            display_name = character_name or entity_name or asset_name or "角色"
            title = f"{display_name} 三视图"

            ops.append(
                {
                    "op": "add_node",
                    "node": {
                        "id": f"local_asset_image_{uuid.uuid4().hex[:10]}",
                        "type": "local_asset_image",
                        "x": base_x + index * 240,
                        "y": 360,
                        "data": {
                            "title": title,
                            "asset_type": "character_three_view",
                            "character_name": character_name,
                            "entity_name": entity_name,
                            "asset_name": asset_name,
                            "url": url,
                            "source": "storyboard_local_asset_binding",
                            "binding": binding,
                        },
                    },
                }
            )
        return ops
    except Exception:
        return []


def build_stage_input(state: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "brief": state.get("brief") or "",
        "script_table": state.get("script_table") or "",
        "script_table_name": state.get("script_table_name") or "",
        "script_rows": list(state.get("script_rows") or []),
        "style": state.get("style") or "",
        "aspect_ratio": state.get("aspect_ratio") or "16:9",
        "target_duration_sec": state.get("target_duration_sec") or 30.0,
        "shot_duration_sec": state.get("shot_duration_sec") or 4.0,
        "language": state.get("language") or "zh-CN",
        "constraints": list(state.get("constraints") or []),
        "entities": state.get("entities") or {},
        "scenes": state.get("scenes") or [],
        "storyboard": state.get("storyboard") or {},
    }


def generate_stage_payload(
    stage: str,
    state: Dict[str, Any],
    *,
    llm_generate: Optional[Callable[[str, str], Dict[str, Any]]] = None,
    req_id: str = "storyboard",
) -> Dict[str, Any]:
    stage_input = build_stage_input(state)
    prompt_builder = {
        "intake": build_intake_prompt,
        "entity_design": build_entity_design_prompt,
        "scene_outline": build_scene_outline_prompt,
        "shot_design": build_shot_design_prompt,
    }[stage]
    generator = llm_generate or (lambda current_stage, prompt: default_storyboard_llm_generate(current_stage, prompt, req_id=req_id))
    return dict(generator(stage, prompt_builder(stage_input)) or {})


def design_storyboard(
    *,
    brief: str,
    style: str = "",
    aspect_ratio: str = "16:9",
    target_duration_sec: float = 30.0,
    shot_duration_sec: float = 4.0,
    language: str = "zh-CN",
    constraints: Optional[list[str]] = None,
    script_table: str = "",
    script_table_name: str = "",
    script_rows: Optional[list[Dict[str, Any]]] = None,
    trace_sink: Optional[list[Dict[str, Any]]] = None,
    llm_generate: Optional[Callable[[str, str], Dict[str, Any]]] = None,
    req_id: str = "storyboard",
    run_id: str = "",
    authorization: str = "",
) -> StoryboardPlan:
    if not str(brief or "").strip():
        raise ValueError("storyboard_brief_required")
    normalized_script_table = str(script_table or "").strip()
    normalized_script_rows = [dict(item or {}) for item in list(script_rows or []) if isinstance(item, dict)]
    from .graph import run_storyboard_graph

    final_state = run_storyboard_graph(
        {
            "brief": str(brief or "").strip(),
            "script_table": normalized_script_table,
            "script_table_name": str(script_table_name or "").strip(),
            "script_rows": normalized_script_rows,
            "style": str(style or "").strip(),
            "aspect_ratio": str(aspect_ratio or "16:9").strip() or "16:9",
            "target_duration_sec": float(target_duration_sec or 30.0),
            "shot_duration_sec": float(shot_duration_sec or 4.0),
            "language": str(language or "zh-CN").strip() or "zh-CN",
            "constraints": list(constraints or []),
            "entities": {},
            "scenes": [],
            "storyboard": {},
            "errors": [],
            "warnings": [],
            "repair_count": 0,
            "trace_sink": trace_sink if trace_sink is not None else [],
            "raw_outputs": {},
            "llm_generate": llm_generate or (lambda stage, prompt: default_storyboard_llm_generate(stage, prompt, req_id=req_id, authorization=authorization)),
            "req_id": req_id,
            "run_id": run_id,
        }
    )
    return StoryboardPlan.model_validate(dict(final_state.get("storyboard") or {}))
