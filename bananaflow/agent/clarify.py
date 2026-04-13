from __future__ import annotations

from typing import Any, Dict, Optional


_PROMPT_REQUIRED_MODES = {
    "text2img",
    "local_text2img",
    "multi_image_generate",
}
_USER_PROMPT_MARKER = "补充画面提示词："
_TEXT_TO_IMAGE_MODES = {
    "text2img",
    "local_text2img",
}
_WORKFLOW_HINTS = (
    "帮我搭",
    "搭一个",
    "搭建",
    "流程",
    "画布",
    "组件",
    "节点",
    "workflow",
    "canvas",
)
_MODE_HINTS = (
    ("local_text2img", ("本地文生图", "local_text2img")),
    ("text2img", ("文生图", "文字生图", "提示词出图", "图片生成")),
    ("multi_image_generate", ("图生图", "重绘", "风格迁移")),
)


def _extract_missing_prompt_mode(message: str) -> str:
    text = str(message or "").strip()
    marker = " requires data.prompt"
    if not text.endswith(marker):
        return ""
    mode = text[: -len(marker)].strip()
    return mode if mode in _PROMPT_REQUIRED_MODES else ""


def build_missing_prompt_clarification(message: str, user_prompt: str = "") -> Optional[Dict[str, str | list]]:
    mode = _extract_missing_prompt_mode(message)
    if not mode:
        return None
    return build_missing_prompt_clarification_for_mode(mode)


def build_missing_prompt_clarification_for_mode(mode: str) -> Optional[Dict[str, str | list]]:
    if mode not in _PROMPT_REQUIRED_MODES:
        return None

    if mode == "multi_image_generate":
        summary = (
            "继续搭建图生图流程前，还需要你补一句修改提示词。"
            "例如：保留主体构图，改成奶油质感电商海报，浅色背景，柔和打光。"
        )
    elif mode == "local_text2img":
        summary = (
            "继续搭建本地文生图流程前，还需要你补一句画面提示词。"
            "例如：一瓶极简风洗面奶产品图，白底，棚拍光，高清细节。"
        )
    else:
        summary = (
            "继续搭建文生图流程前，还需要你补一句画面提示词。"
            "例如：一瓶极简风洗面奶产品图，白底，棚拍光，高清细节。"
        )

    return {
        "patch": [],
        "summary": summary,
        "thought": f"clarify_missing_prompt:{mode}",
    }


def detect_canvas_prompt_gap(user_prompt: str, supplemental_prompt: str = "") -> str:
    if str(supplemental_prompt or "").strip():
        return ""

    text = str(user_prompt or "").strip().lower()
    if not text:
        return ""

    if not any(hint in text for hint in _WORKFLOW_HINTS):
        return ""

    # 如果用户已经在一句话里带了更具体的描述信息，就不要过度拦截
    if any(sep in text for sep in ("：", ":", "例如", "画面", "主体", "场景", "背景", "白底", "棚拍")):
        return ""

    for mode, keywords in _MODE_HINTS:
        if any(keyword.lower() in text for keyword in keywords):
            return mode
    return ""


def extract_supplemental_prompt(user_prompt: str, supplemental_prompt: str = "") -> str:
    direct = str(supplemental_prompt or "").strip()
    if direct:
        return direct
    text = str(user_prompt or "").strip()
    if not text:
        return ""
    idx = text.rfind(_USER_PROMPT_MARKER)
    if idx < 0:
        return ""
    return text[idx + len(_USER_PROMPT_MARKER) :].strip()


def _looks_like_edit_style_prompt(prompt: str) -> bool:
    text = str(prompt or "").strip().lower()
    if not text:
        return False
    return (
        text.startswith("edit the input image:")
        or "keep composition" in text
        or "keep composition, lighting, camera angle, and background" in text
        or "apply only the requested change" in text
    )


def backfill_missing_prompt_from_user_input(
    out: Dict[str, Any],
    user_prompt: str,
    supplemental_prompt: str = "",
) -> Dict[str, Any]:
    supplemental_prompt = extract_supplemental_prompt(user_prompt, supplemental_prompt)
    if not supplemental_prompt:
        return out

    patch = out.get("patch")
    if not isinstance(patch, list):
        return out

    has_prompt_mode = False
    for op in patch:
        if not isinstance(op, dict):
            continue
        op_name = str(op.get("op") or "").strip()
        if op_name == "add_node":
            node = op.get("node") or {}
            data = node.get("data") or {}
            if str(data.get("mode") or "").strip() in _PROMPT_REQUIRED_MODES:
                has_prompt_mode = True
                break
        elif op_name == "update_node":
            data = op.get("data") or {}
            if str(data.get("mode") or "").strip() in _PROMPT_REQUIRED_MODES:
                has_prompt_mode = True
                break

    for op in patch:
        if not isinstance(op, dict):
            continue
        op_name = str(op.get("op") or "").strip()
        if op_name == "add_node":
            node = op.get("node") or {}
            node_type = str(node.get("type") or "").strip()
            data = node.get("data") or {}
            if has_prompt_mode and node_type == "text_input":
                data["text"] = supplemental_prompt
                node["data"] = data
                op["node"] = node
                continue
            mode = str(data.get("mode") or "").strip()
            current_prompt = str(data.get("prompt") or "").strip()
            if mode in _PROMPT_REQUIRED_MODES:
                data["prompt"] = supplemental_prompt
                node["data"] = data
                op["node"] = node
            elif mode in _TEXT_TO_IMAGE_MODES and _looks_like_edit_style_prompt(current_prompt):
                data["prompt"] = supplemental_prompt
                node["data"] = data
                op["node"] = node
        elif op_name == "update_node":
            data = op.get("data") or {}
            if "text" in data:
                data["text"] = supplemental_prompt
            if "prompt" in data:
                data["prompt"] = supplemental_prompt
            op["data"] = data

    return out
