from __future__ import annotations

from copy import deepcopy
import re
from typing import Any, Dict, List, Optional, Tuple

from agent_v2.storyboard.designer import default_storyboard_llm_generate
from agent_v2.storyboard.validator import validate_storyboard_payload


_REPLACE_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"(?:把|将)\s*(?P<old>[^，。,；;\s]{1,32})\s*(?:换成|改成|替换成|替换为)\s*(?P<new>[^，。,；;\s]{1,32})"),
    re.compile(r"(?P<old>[^，。,；;\s]{1,32})\s*(?:换成|改成|替换成|替换为)\s*(?P<new>[^，。,；;\s]{1,32})"),
)


def is_storyboard_local_edit_request(selected_artifact: Optional[Dict[str, Any]], current_nodes: Optional[List[Dict[str, Any]]]) -> bool:
    selected = selected_artifact or {}
    if str(selected.get("kind") or "").strip() != "storyboard_selection":
        return False
    node_id = str(selected.get("fromNodeId") or "").strip()
    if not node_id:
        return False
    node = next((item for item in list(current_nodes or []) if str(item.get("id") or "").strip() == node_id), None)
    if not node:
        return False
    return str(node.get("type") or "").strip() == "storyboard_plan" and isinstance((node.get("data") or {}).get("storyboard_plan"), dict)


def build_storyboard_local_edit_patch(
    user_prompt: str,
    selected_artifact: Optional[Dict[str, Any]],
    current_nodes: Optional[List[Dict[str, Any]]],
    *,
    req_id: str = "storyboard_local_edit",
    authorization: str = "",
) -> Optional[Dict[str, Any]]:
    if not is_storyboard_local_edit_request(selected_artifact, current_nodes):
        return None

    selected = selected_artifact or {}
    node_id = str(selected.get("fromNodeId") or "").strip()
    node = next((item for item in list(current_nodes or []) if str(item.get("id") or "").strip() == node_id), None)
    if not node:
        return None

    node_data = dict(node.get("data") or {})
    storyboard_plan = deepcopy(node_data.get("storyboard_plan") or {})
    if not isinstance(storyboard_plan, dict):
        return None

    meta = dict(selected.get("meta") or {})
    selection_type = str(meta.get("selectionType") or "").strip()
    selection_id = str(meta.get("selectionId") or "").strip()
    selection_label = str(meta.get("selectionLabel") or "").strip() or "故事板片段"
    updated_plan = _edit_storyboard_with_llm(
        user_prompt=str(user_prompt or "").strip(),
        storyboard_plan=storyboard_plan,
        selected_artifact=selected,
        req_id=req_id,
        authorization=authorization,
    )
    if updated_plan is None:
        updated_plan = _edit_storyboard_fragment_with_llm(
            user_prompt=str(user_prompt or "").strip(),
            storyboard_plan=storyboard_plan,
            selected_artifact=selected,
            req_id=req_id,
            authorization=authorization,
        )
    if updated_plan is None:
        updated_plan = _edit_storyboard_with_simple_replace(
            user_prompt=str(user_prompt or "").strip(),
            storyboard_plan=storyboard_plan,
            selection_type=selection_type,
            selection_id=selection_id,
        )
    if updated_plan is None:
        return None

    updated_data = {
        "title": str(updated_plan.get("title") or node_data.get("title") or "").strip() or node_data.get("title"),
        "storyboard_plan": updated_plan,
    }

    return {
        "patch": [
            {
                "op": "update_node",
                "id": node_id,
                "data": updated_data,
            },
            {
                "op": "select_nodes",
                "ids": [node_id],
            },
        ],
        "summary": f"已更新故事板中的{selection_label}。",
        "thought": f"storyboard_local_edit_llm:{selection_type or 'selection'}",
    }


def _edit_storyboard_with_llm(
    *,
    user_prompt: str,
    storyboard_plan: Dict[str, Any],
    selected_artifact: Dict[str, Any],
    req_id: str,
    authorization: str,
) -> Optional[Dict[str, Any]]:
    prompt = _build_storyboard_local_edit_prompt(
        user_prompt=user_prompt,
        storyboard_plan=storyboard_plan,
        selected_artifact=selected_artifact,
    )
    try:
        payload = default_storyboard_llm_generate(
            "local_edit",
            prompt,
            req_id=req_id,
            authorization=authorization,
        )
    except Exception:
        return None

    candidate = payload.get("storyboard_plan") if isinstance(payload.get("storyboard_plan"), dict) else payload
    if not isinstance(candidate, dict):
        return None

    try:
        plan, errors = validate_storyboard_payload(
            candidate,
            style=str(storyboard_plan.get("style") or "").strip(),
            aspect_ratio=str(storyboard_plan.get("aspect_ratio") or "16:9").strip() or "16:9",
            target_duration_sec=float(storyboard_plan.get("target_duration_sec") or 30.0),
            shot_duration_sec=float(storyboard_plan.get("shot_default_duration_sec") or 4.0),
            warnings=list(storyboard_plan.get("warnings") or []),
        )
    except Exception:
        return None
    if errors:
        return None
    return plan.model_dump()


def _edit_storyboard_fragment_with_llm(
    *,
    user_prompt: str,
    storyboard_plan: Dict[str, Any],
    selected_artifact: Dict[str, Any],
    req_id: str,
    authorization: str,
) -> Optional[Dict[str, Any]]:
    meta = dict(selected_artifact.get("meta") or {})
    selection_type = str(meta.get("selectionType") or "").strip()
    selection_id = str(meta.get("selectionId") or "").strip()
    selection_payload = dict(meta.get("payload") or {}) if isinstance(meta.get("payload"), dict) else {}
    current_item = _find_selected_item(storyboard_plan, selection_type, selection_id)
    if not isinstance(current_item, dict):
        return None

    prompt = _build_storyboard_fragment_edit_prompt(
        user_prompt=user_prompt,
        storyboard_plan=storyboard_plan,
        selected_artifact=selected_artifact,
        current_item=current_item,
    )
    try:
        payload = default_storyboard_llm_generate(
            "local_edit_fragment",
            prompt,
            req_id=req_id,
            authorization=authorization,
        )
    except Exception:
        return None

    updated_item = payload.get("updated_item")
    if not isinstance(updated_item, dict):
        return None

    merged_plan = deepcopy(storyboard_plan)
    old_name = str(current_item.get("name") or "").strip()
    merged_item = _merge_selected_item(current_item, updated_item, selection_type)
    applied = _apply_selected_item_update(merged_plan, selection_type, selection_id, merged_item)
    if not applied:
        return None

    new_name = str(merged_item.get("name") or "").strip()
    if selection_type == "entity" and old_name and new_name and old_name != new_name:
        _replace_in_scenes_and_shots(merged_plan, old_name, new_name)
        _replace_in_value(merged_plan, selection_payload.get("entityName") or "", new_name)

    try:
        plan, errors = validate_storyboard_payload(
            merged_plan,
            style=str(storyboard_plan.get("style") or "").strip(),
            aspect_ratio=str(storyboard_plan.get("aspect_ratio") or "16:9").strip() or "16:9",
            target_duration_sec=float(storyboard_plan.get("target_duration_sec") or 30.0),
            shot_duration_sec=float(storyboard_plan.get("shot_default_duration_sec") or 4.0),
            warnings=list(storyboard_plan.get("warnings") or []),
        )
    except Exception:
        return None
    if errors:
        return None
    return plan.model_dump()


def _build_storyboard_local_edit_prompt(
    *,
    user_prompt: str,
    storyboard_plan: Dict[str, Any],
    selected_artifact: Dict[str, Any],
) -> str:
    meta = dict(selected_artifact.get("meta") or {})
    selection_payload = dict(meta.get("payload") or {}) if isinstance(meta.get("payload"), dict) else {}
    return (
        "你是故事板局部编辑器。你会基于用户当前选中的故事板片段，对现有 StoryboardPlan 做最小必要修改。\n"
        "输出要求：\n"
        "1. 只输出严格 JSON，对象格式为 {\"storyboard_plan\": {...}, \"summary\": \"...\"}。\n"
        "2. storyboard_plan 必须是完整可用的 StoryboardPlan，而不是局部 diff。\n"
        "3. 保留所有已有 entity_id / scene_id / shot_id / shot_no / scene_no，除非用户明确要求重构。\n"
        "4. 优先只修改与当前选中片段相关的字段，同时保持上下游一致。例如角色改动要同步相关镜头描述与引用。\n"
        "5. 不要把这次请求改写成文生图/流程搭建，不要输出 canvas patch。\n"
        "6. 默认保留原有比例、风格、总时长与镜头结构，除非用户明确要求改这些。\n"
        "7. 用中文输出描述。\n\n"
        f"用户指令:\n{user_prompt}\n\n"
        "当前选中片段:\n"
        f"{_json_dumps_compact({'selectionType': meta.get('selectionType'), 'selectionId': meta.get('selectionId'), 'selectionLabel': meta.get('selectionLabel'), 'selectionSummary': meta.get('selectionSummary'), 'payload': selection_payload})}\n\n"
        "当前完整故事板:\n"
        f"{_json_dumps_compact(storyboard_plan)}"
    )


def _build_storyboard_fragment_edit_prompt(
    *,
    user_prompt: str,
    storyboard_plan: Dict[str, Any],
    selected_artifact: Dict[str, Any],
    current_item: Dict[str, Any],
) -> str:
    meta = dict(selected_artifact.get("meta") or {})
    selection_type = str(meta.get("selectionType") or "").strip()
    selection_payload = dict(meta.get("payload") or {}) if isinstance(meta.get("payload"), dict) else {}
    return (
        "你是故事板局部编辑器。你只重写当前选中的故事板片段，并保持其余结构不变。\n"
        "输出要求：\n"
        "1. 只输出严格 JSON，对象格式为 {\"updated_item\": {...}, \"summary\": \"...\"}。\n"
        "2. updated_item 只表示当前选中的片段：entity / scene / shot。\n"
        "3. 保留当前片段的 id 与编号字段，不要删掉关键字段。\n"
        "4. 你可以重写名称、描述、旁白、镜头说明、场景氛围等内容，但必须与当前故事板风格一致。\n"
        "5. 如果修改角色/主体，请让更新后的设定能够支持后续镜头统一，不要写成文生图提示词。\n"
        "6. 用中文输出。\n\n"
        f"用户指令:\n{user_prompt}\n\n"
        "当前选中信息:\n"
        f"{_json_dumps_compact({'selectionType': selection_type, 'selectionLabel': meta.get('selectionLabel'), 'selectionSummary': meta.get('selectionSummary'), 'payload': selection_payload})}\n\n"
        "当前选中片段:\n"
        f"{_json_dumps_compact(current_item)}\n\n"
        "当前故事板上下文（节选）:\n"
        f"{_json_dumps_compact({'title': storyboard_plan.get('title'), 'style': storyboard_plan.get('style'), 'aspect_ratio': storyboard_plan.get('aspect_ratio'), 'entities': (storyboard_plan.get('entities') or {}), 'scene_count': len(list(storyboard_plan.get('scenes') or []))})}"
    )


def _json_dumps_compact(value: Any) -> str:
    import json

    return json.dumps(value, ensure_ascii=False, indent=2)


def _edit_storyboard_with_simple_replace(
    *,
    user_prompt: str,
    storyboard_plan: Dict[str, Any],
    selection_type: str,
    selection_id: str,
) -> Optional[Dict[str, Any]]:
    old_value, new_value = _extract_replace_directive(user_prompt)
    if not old_value or not new_value:
        return None

    updated_plan = deepcopy(storyboard_plan)
    changed = False
    if selection_type == "entity":
        changed = _replace_in_entities(updated_plan, selection_id, old_value, new_value)
        if changed:
            _replace_in_scenes_and_shots(updated_plan, old_value, new_value)
    elif selection_type == "scene":
        changed = _replace_in_scene(updated_plan, selection_id, old_value, new_value)
    elif selection_type == "shot":
        changed = _replace_in_shot(updated_plan, selection_id, old_value, new_value)
    else:
        changed = _replace_in_value(updated_plan, old_value, new_value)

    if not changed:
        return None
    return updated_plan


def _find_selected_item(storyboard_plan: Dict[str, Any], selection_type: str, selection_id: str) -> Optional[Dict[str, Any]]:
    if selection_type == "entity":
        entities = storyboard_plan.get("entities") or {}
        for key in ("characters", "subjects", "locations"):
            for item in list(entities.get(key) or []):
                if isinstance(item, dict) and str(item.get("entity_id") or "").strip() == selection_id:
                    return deepcopy(item)
        return None
    if selection_type == "scene":
        for scene in list(storyboard_plan.get("scenes") or []):
            if isinstance(scene, dict) and str(scene.get("scene_id") or "").strip() == selection_id:
                return deepcopy(scene)
        return None
    if selection_type == "shot":
        for scene in list(storyboard_plan.get("scenes") or []):
            if not isinstance(scene, dict):
                continue
            for shot in list(scene.get("shots") or []):
                if isinstance(shot, dict) and str(shot.get("shot_id") or "").strip() == selection_id:
                    return deepcopy(shot)
        return None
    return None


def _merge_selected_item(current_item: Dict[str, Any], updated_item: Dict[str, Any], selection_type: str) -> Dict[str, Any]:
    merged = deepcopy(current_item)
    merged.update({key: value for key, value in dict(updated_item or {}).items() if value is not None})
    if selection_type == "entity":
        merged["entity_id"] = str(current_item.get("entity_id") or merged.get("entity_id") or "").strip()
        merged["kind"] = str(current_item.get("kind") or merged.get("kind") or "").strip()
    elif selection_type == "scene":
        merged["scene_id"] = str(current_item.get("scene_id") or merged.get("scene_id") or "").strip()
        merged["scene_no"] = int(current_item.get("scene_no") or merged.get("scene_no") or 1)
    elif selection_type == "shot":
        merged["shot_id"] = str(current_item.get("shot_id") or merged.get("shot_id") or "").strip()
        merged["shot_no"] = int(current_item.get("shot_no") or merged.get("shot_no") or 1)
    return merged


def _apply_selected_item_update(storyboard_plan: Dict[str, Any], selection_type: str, selection_id: str, merged_item: Dict[str, Any]) -> bool:
    if selection_type == "entity":
        entities = storyboard_plan.get("entities") or {}
        for key in ("characters", "subjects", "locations"):
            items = entities.get(key) or []
            for index, item in enumerate(list(items)):
                if isinstance(item, dict) and str(item.get("entity_id") or "").strip() == selection_id:
                    items[index] = merged_item
                    return True
        return False
    if selection_type == "scene":
        scenes = storyboard_plan.get("scenes") or []
        for index, scene in enumerate(list(scenes)):
            if isinstance(scene, dict) and str(scene.get("scene_id") or "").strip() == selection_id:
                scenes[index] = merged_item
                return True
        return False
    if selection_type == "shot":
        scenes = storyboard_plan.get("scenes") or []
        for scene in scenes:
            if not isinstance(scene, dict):
                continue
            shots = scene.get("shots") or []
            for index, shot in enumerate(list(shots)):
                if isinstance(shot, dict) and str(shot.get("shot_id") or "").strip() == selection_id:
                    shots[index] = merged_item
                    return True
        return False
    return False


def _extract_replace_directive(user_prompt: str) -> Tuple[str, str]:
    text = str(user_prompt or "").strip()
    for pattern in _REPLACE_PATTERNS:
        match = pattern.search(text)
        if match:
            old_value = str(match.group("old") or "").strip()
            new_value = str(match.group("new") or "").strip()
            if old_value and new_value and old_value != new_value:
                return old_value, new_value
    return "", ""


def _replace_in_entities(plan: Dict[str, Any], selection_id: str, old_value: str, new_value: str) -> bool:
    entities = plan.get("entities") or {}
    changed = False
    for key in ("characters", "subjects", "locations"):
        items = entities.get(key)
        if not isinstance(items, list):
            continue
        for item in items:
            if not isinstance(item, dict):
                continue
            if selection_id and str(item.get("entity_id") or "").strip() != selection_id:
                continue
            if _replace_in_value(item, old_value, new_value):
                changed = True
    return changed


def _replace_in_scene(plan: Dict[str, Any], selection_id: str, old_value: str, new_value: str) -> bool:
    scenes = plan.get("scenes") or []
    changed = False
    for scene in scenes:
        if not isinstance(scene, dict):
            continue
        if selection_id and str(scene.get("scene_id") or "").strip() != selection_id:
            continue
        if _replace_in_value(scene, old_value, new_value):
            changed = True
    return changed


def _replace_in_shot(plan: Dict[str, Any], selection_id: str, old_value: str, new_value: str) -> bool:
    scenes = plan.get("scenes") or []
    changed = False
    for scene in scenes:
        if not isinstance(scene, dict):
            continue
        shots = scene.get("shots") or []
        for shot in shots:
            if not isinstance(shot, dict):
                continue
            if selection_id and str(shot.get("shot_id") or "").strip() != selection_id:
                continue
            if _replace_in_value(shot, old_value, new_value):
                changed = True
    return changed


def _replace_in_scenes_and_shots(plan: Dict[str, Any], old_value: str, new_value: str) -> bool:
    changed = False
    scenes = plan.get("scenes") or []
    for scene in scenes:
        if not isinstance(scene, dict):
            continue
        if _replace_in_value(scene, old_value, new_value):
            changed = True
    return changed


def _replace_in_value(value: Any, old_value: str, new_value: str) -> bool:
    changed = False
    if isinstance(value, dict):
        for key, item in list(value.items()):
            if isinstance(item, str):
                replaced = item.replace(old_value, new_value)
                if replaced != item:
                    value[key] = replaced
                    changed = True
            elif isinstance(item, (dict, list)):
                if _replace_in_value(item, old_value, new_value):
                    changed = True
    elif isinstance(value, list):
        for index, item in enumerate(list(value)):
            if isinstance(item, str):
                replaced = item.replace(old_value, new_value)
                if replaced != item:
                    value[index] = replaced
                    changed = True
            elif isinstance(item, (dict, list)):
                if _replace_in_value(item, old_value, new_value):
                    changed = True
    return changed
