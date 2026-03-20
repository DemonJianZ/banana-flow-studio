# bananaflow/agent/deterministic.py
from typing import List, Dict, Any, Optional

from core.config import (
    MODEL_COMFYUI_IMAGE_Z_IMAGE_TURBO,
    MODEL_COMFYUI_QWEN_I2V,
    MODEL_GEMINI,
    VIDEO_MODEL_1_0,
)
from agent.normalizer import new_id
from utils.size import parse_aspect_ratio
from prompts.refine import simple_refine_prompt


def _normalize_conns(conns: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out = []
    for c in conns or []:
        f = c.get("from") or c.get("source")
        t = c.get("to") or c.get("target")
        if not f or not t:
            continue
        out.append({"id": c.get("id") or new_id("c"), "from": f, "to": t})
    return out


def _find_node(nodes: List[Dict[str, Any]], node_id: str) -> Optional[Dict[str, Any]]:
    return next((n for n in (nodes or []) if n.get("id") == node_id), None)


def _find_upstream_id(conns: List[Dict[str, Any]], to_id: str) -> Optional[str]:
    cn = _normalize_conns(conns)
    hit = next((c for c in cn if c.get("to") == to_id), None)
    return hit.get("from") if hit else None


FEATURE_EXTRACT_PRESET_PROMPTS = {
    "face": "提取画面中的面部特征，保留五官与肤色细节，去除背景与多余元素，结果自然清晰。",
    "background": "提取画面中的纯背景，移除所有主体与物体，保持背景干净自然，避免残影。",
    "outfit": "提取画面中的服装与首饰，保留材质与纹理细节，弱化人物面部与背景，结果清晰自然。",
}

MODE_SPECS = [
    {"mode": "local_text2img", "node_type": "processor", "keywords": ["本地文生图", "local_text2img"], "needs_text": True, "needs_image": False},
    {"mode": "text2img", "node_type": "processor", "keywords": ["文生图", "文字生图", "提示词出图", "图片生成"], "needs_text": True, "needs_image": False},
    {"mode": "multi_image_generate", "node_type": "processor", "keywords": ["图生图", "重绘", "风格迁移"], "needs_text": True, "needs_image": True},
    {"mode": "bg_replace", "node_type": "processor", "keywords": ["换背景", "背景替换", "换场景"], "needs_text": False, "needs_image": True},
    {"mode": "gesture_swap", "node_type": "processor", "keywords": ["换手势", "手势替换"], "needs_text": False, "needs_image": True},
    {"mode": "product_swap", "node_type": "processor", "keywords": ["换商品", "商品替换"], "needs_text": False, "needs_image": True},
    {"mode": "rmbg", "node_type": "processor", "keywords": ["背景移除", "抠图", "去背景", "去掉背景"], "needs_text": False, "needs_image": True},
    {"mode": "feature_extract", "node_type": "processor", "keywords": ["特征提取", "提取特征"], "needs_text": False, "needs_image": True},
    {"mode": "multi_angleshots", "node_type": "processor", "keywords": ["多角度镜头", "多角度", "多机位"], "needs_text": False, "needs_image": True},
    {"mode": "video_upscale", "node_type": "processor", "keywords": ["视频超分", "超分辨率视频", "视频增强", "视频修复"], "needs_text": False, "needs_image": True},
    {"mode": "local_img2video", "node_type": "video_gen", "keywords": ["本地图生视频", "本地视频生成", "local_img2video"], "needs_text": False, "needs_image": True},
    {"mode": "img2video", "node_type": "video_gen", "keywords": ["图生视频", "视频生成", "生成视频", "动图视频", "动态视频"], "needs_text": False, "needs_image": True},
]


def _keyword_index(text: str, keywords: List[str]) -> int:
    indexes = [text.find(keyword) for keyword in keywords if keyword and keyword in text]
    return min(indexes) if indexes else -1


def _dedupe_specs(specs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen = set()
    out = []
    for item in specs:
        key = (item.get("node_type"), item.get("mode"))
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


def _infer_requested_specs(user_prompt: str, selected_artifact: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
    text = (user_prompt or "").strip().lower()
    hits = []
    for spec in MODE_SPECS:
        idx = _keyword_index(text, [kw.lower() for kw in spec["keywords"]])
        if idx >= 0:
            hits.append((idx, spec))

    hits.sort(key=lambda item: item[0])
    ordered = _dedupe_specs([item[1] for item in hits])
    modes = {item["mode"] for item in ordered}
    if "local_text2img" in modes:
        ordered = [item for item in ordered if item["mode"] != "text2img"]
    if "local_img2video" in modes:
        ordered = [item for item in ordered if item["mode"] != "img2video"]
    if ordered:
        return ordered

    if any(term in text for term in ["提示词输入", "文本输入"]):
        return [{"mode": "text2img", "node_type": "processor", "needs_text": True, "needs_image": False}]

    if selected_artifact and selected_artifact.get("url"):
        return [{"mode": "multi_image_generate", "node_type": "processor", "needs_text": True, "needs_image": True}]

    return [{"mode": "text2img", "node_type": "processor", "needs_text": True, "needs_image": False}]


def _feature_extract_prompt(user_prompt: str) -> str:
    text = (user_prompt or "").lower()
    if any(term in text for term in ["背景", "background"]):
        return FEATURE_EXTRACT_PRESET_PROMPTS["background"]
    if any(term in text for term in ["服装", "首饰", "穿搭", "outfit"]):
        return FEATURE_EXTRACT_PRESET_PROMPTS["outfit"]
    return FEATURE_EXTRACT_PRESET_PROMPTS["face"]


def _build_templates(mode: str, user_prompt: str) -> Dict[str, Any]:
    aspect_ratio = parse_aspect_ratio(user_prompt)
    if mode in {"text2img", "local_text2img", "rmbg", "feature_extract"}:
        return {"size": "1024x1024", "aspect_ratio": aspect_ratio}
    if mode == "multi_image_generate":
        return {"size": "1024x1024", "aspect_ratio": aspect_ratio, "note": ""}
    if mode == "video_upscale":
        return {"segment_seconds": 3, "output_resolution": 1440, "workflow_batch_size": 1}
    if mode == "img2video":
        return {"motion": "", "camera": "", "duration": 5, "resolution": "1080p", "ratio": aspect_ratio, "note": "", "generate_audio_new": True}
    if mode == "local_img2video":
        return {"duration": 5, "resolution": "480p", "ratio": aspect_ratio, "note": ""}
    return {}


def _build_prompt(mode: str, refined_prompt: str, user_prompt: str) -> str:
    if mode == "feature_extract":
        return _feature_extract_prompt(user_prompt)
    if mode in {"rmbg", "multi_angleshots", "video_upscale"}:
        return ""
    if mode in {"img2video", "local_img2video"}:
        return refined_prompt or "natural motion"
    if mode in {"bg_replace", "gesture_swap", "product_swap"}:
        return refined_prompt or "Keep the original composition and improve the target edit naturally."
    if mode == "multi_image_generate":
        return refined_prompt or "Keep the original composition and regenerate with clean commercial quality."
    return refined_prompt or user_prompt.strip() or "Generate a clean commercial product photo, high quality, studio lighting."


def _build_node_data(spec: Dict[str, Any], refined_prompt: str, user_prompt: str) -> Dict[str, Any]:
    mode = spec["mode"]
    data = {
        "mode": mode,
        "prompt": _build_prompt(mode, refined_prompt, user_prompt),
        "templates": _build_templates(mode, user_prompt),
        "batchSize": 1,
        "status": "idle",
    }
    if spec["node_type"] == "processor":
        data["model"] = MODEL_COMFYUI_IMAGE_Z_IMAGE_TURBO if mode == "local_text2img" else MODEL_GEMINI
    elif spec["node_type"] == "video_gen":
        data["model"] = MODEL_COMFYUI_QWEN_I2V if mode == "local_img2video" else VIDEO_MODEL_1_0
    return data


def _resolve_anchor_node(
    current_nodes: Optional[List[Dict[str, Any]]],
    current_connections: Optional[List[Dict[str, Any]]],
    selected_artifact: Optional[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    nodes = current_nodes or []
    conns = current_connections or []
    from_node_id = (selected_artifact or {}).get("fromNodeId")
    if not from_node_id:
        return None

    from_node = _find_node(nodes, from_node_id)
    if not from_node:
        return None

    anchor_id = from_node_id
    if from_node.get("type") == "output":
        upstream = _find_upstream_id(conns, from_node_id)
        if upstream:
            anchor_id = upstream
    return _find_node(nodes, anchor_id)


def _suggest_origin(current_nodes: Optional[List[Dict[str, Any]]]) -> tuple[int, int]:
    nodes = current_nodes or []
    if not nodes:
        return 120, 120
    max_x = max(int(n.get("x", 0)) for n in nodes)
    min_y = min(int(n.get("y", 0)) for n in nodes)
    return max_x + 360, max(80, min_y)


def _build_chain_patch(
    user_prompt: str,
    refined_prompt: str,
    specs: List[Dict[str, Any]],
    selected_artifact: Optional[Dict[str, Any]],
    current_nodes: Optional[List[Dict[str, Any]]],
    current_connections: Optional[List[Dict[str, Any]]],
) -> Dict[str, Any]:
    specs = specs or [{"mode": "text2img", "node_type": "processor", "needs_text": True, "needs_image": False}]
    patch: List[Dict[str, Any]] = []
    selected_ids: List[str] = []
    anchor_node = _resolve_anchor_node(current_nodes, current_connections, selected_artifact)

    if anchor_node:
        base_x = int(anchor_node.get("x", 200)) + 350
        base_y = int(anchor_node.get("y", 200))
        upstream_anchor_id = str(anchor_node.get("id"))
    else:
        base_x, base_y = _suggest_origin(current_nodes)
        upstream_anchor_id = ""

    first_spec = specs[0]
    first_needs_image = bool(first_spec.get("needs_image"))
    first_needs_text = bool(first_spec.get("needs_text"))

    current_from_id = upstream_anchor_id
    current_x = base_x
    current_y = base_y

    if not current_from_id and first_needs_text:
        text_id = new_id("text")
        text_node_y = base_y if not first_needs_image else base_y - 120
        patch.append(
            {
                "op": "add_node",
                "node": {
                    "id": text_id,
                    "type": "text_input",
                    "x": base_x - 340,
                    "y": text_node_y,
                    "data": {"text": _build_prompt(first_spec["mode"], refined_prompt, user_prompt)},
                },
            }
        )
        selected_ids.append(text_id)

    if not current_from_id and first_needs_image:
        input_id = new_id("in")
        images = []
        if selected_artifact and selected_artifact.get("url"):
            images = [selected_artifact["url"]]
        input_node_y = base_y if not first_needs_text else base_y + 120
        patch.append(
            {
                "op": "add_node",
                "node": {
                    "id": input_id,
                    "type": "input",
                    "x": base_x - 340,
                    "y": input_node_y,
                    "data": {"images": images},
                },
            }
        )
        selected_ids.append(input_id)

    for index, spec in enumerate(specs):
        node_id = new_id("proc" if spec["node_type"] == "processor" else "vid")
        node_x = current_x
        node_y = current_y
        if index == 0 and first_needs_image and first_needs_text and not upstream_anchor_id:
            node_y = base_y

        patch.append(
            {
                "op": "add_node",
                "node": {
                    "id": node_id,
                    "type": spec["node_type"],
                    "x": node_x,
                    "y": node_y,
                    "data": _build_node_data(spec, refined_prompt, user_prompt),
                },
            }
        )
        selected_ids.append(node_id)

        if index == 0:
            if upstream_anchor_id:
                patch.append({"op": "add_connection", "connection": {"id": new_id("c"), "from": upstream_anchor_id, "to": node_id}})
            else:
                for item in patch:
                    if item.get("op") != "add_node":
                        continue
                    from_node = item.get("node") or {}
                    if from_node.get("type") not in {"text_input", "input"}:
                        continue
                    patch.append({"op": "add_connection", "connection": {"id": new_id("c"), "from": from_node["id"], "to": node_id}})
        elif current_from_id:
            patch.append({"op": "add_connection", "connection": {"id": new_id("c"), "from": current_from_id, "to": node_id}})

        current_from_id = node_id
        current_x = node_x + 360
        current_y = node_y

    out_id = new_id("out")
    patch.append(
        {
            "op": "add_node",
            "node": {
                "id": out_id,
                "type": "output",
                "x": current_x,
                "y": current_y,
                "data": {"images": []},
            },
        }
    )
    patch.append({"op": "add_connection", "connection": {"id": new_id("c"), "from": current_from_id, "to": out_id}})
    patch.append({"op": "select_nodes", "ids": selected_ids[-2:] if len(selected_ids) >= 2 else selected_ids})

    summary_modes = " -> ".join(spec["mode"] for spec in specs)
    summary = f"已按你的描述搭建画布流程：{summary_modes} -> output"
    thought = f"deterministic:{summary_modes}"
    return {"patch": patch, "summary": summary, "thought": thought}


def build_continue_chain_patch(
    refined_prompt: str,
    current_nodes: Optional[List[Dict[str, Any]]],
    current_connections: Optional[List[Dict[str, Any]]],
    selected_artifact: Dict[str, Any],
    model: str = MODEL_GEMINI,
    templates: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    nodes = current_nodes or []
    conns = current_connections or []
    from_node_id = (selected_artifact or {}).get("fromNodeId")

    if not from_node_id:
        raise RuntimeError("selected_artifact.fromNodeId 缺失，无法定位串联锚点")

    from_node = _find_node(nodes, from_node_id)
    if not from_node:
        raise RuntimeError(f"找不到 fromNodeId={from_node_id} 对应节点")

    # 如果选中的是 output 节点，则从其上游找真正的 anchor
    anchor_id = from_node_id
    if from_node.get("type") == "output":
        upstream = _find_upstream_id(conns, from_node_id)
        if upstream:
            anchor_id = upstream

    anchor_node = _find_node(nodes, anchor_id)
    if not anchor_node:
        raise RuntimeError(f"找不到 anchor 节点：{anchor_id}")

    base_x = int(anchor_node.get("x", 200))
    base_y = int(anchor_node.get("y", 200))

    proc_id = new_id("proc")
    out_id = new_id("out")
    tpl = templates or {"size": "1024x1024", "aspect_ratio": "1:1"}

    patch = [
        {
            "op": "add_node",
            "node": {
                "id": proc_id,
                "type": "processor",
                "x": base_x + 350,
                "y": base_y,
                "data": {
                    "mode": "multi_image_generate",
                    "prompt": refined_prompt,
                    "templates": tpl,
                    "batchSize": 1,
                    "status": "idle",
                    "model": model,
                },
            },
        },
        {
            "op": "add_node",
            "node": {
                "id": out_id,
                "type": "output",
                "x": base_x + 700,
                "y": base_y,
                "data": {"images": []},
            },
        },
        {"op": "add_connection", "connection": {"id": new_id("c"), "from": anchor_id, "to": proc_id}},
        {"op": "add_connection", "connection": {"id": new_id("c"), "from": proc_id, "to": out_id}},
        {"op": "select_nodes", "ids": [proc_id]},
    ]

    return {
        "patch": patch,
        "summary": "已在上一轮产出节点后追加：图生图 → 输出（并自动填充优化后的提示词）",
        "thought": f"chain-after: {anchor_id} -> {proc_id} -> {out_id}",
    }


def build_iterate_branch_with_new_input_patch(
    refined_prompt: str,
    selected_artifact: Dict[str, Any],
    model: str = MODEL_GEMINI,
    x0: int = 200,
    y0: int = 200,
    templates: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    in_id = new_id("in")
    proc_id = new_id("proc")
    out_id = new_id("out")
    tpl = templates or {"size": "1024x1024", "aspect_ratio": "1:1"}

    patch = [
        {
            "op": "add_node",
            "node": {"id": in_id, "type": "input", "x": x0, "y": y0, "data": {"images": [selected_artifact["url"]]}},
        },
        {
            "op": "add_node",
            "node": {
                "id": proc_id,
                "type": "processor",
                "x": x0 + 350,
                "y": y0,
                "data": {
                    "mode": "multi_image_generate",
                    "prompt": refined_prompt,
                    "templates": tpl,
                    "batchSize": 1,
                    "status": "idle",
                    "model": model,
                },
            },
        },
        {"op": "add_node", "node": {"id": out_id, "type": "output", "x": x0 + 700, "y": y0, "data": {"images": []}}},
        {"op": "add_connection", "connection": {"id": new_id("c"), "from": in_id, "to": proc_id}},
        {"op": "add_connection", "connection": {"id": new_id("c"), "from": proc_id, "to": out_id}},
        {"op": "select_nodes", "ids": [proc_id]},
    ]
    return {"patch": patch, "summary": "fromNodeId 缺失，已新建 input→图生图→输出 分支", "thought": "fallback new-input branch"}


def build_from_scratch_patch(
    user_prompt: str,
    model: str = MODEL_GEMINI,
    x0: int = 120,
    y0: int = 120,
) -> Dict[str, Any]:
    ar = parse_aspect_ratio(user_prompt)
    tpl = {"size": "1024x1024", "aspect_ratio": ar}

    text_id = new_id("text")
    gen_id = new_id("gen")
    out1_id = new_id("out")
    edit_id = new_id("edit")
    out2_id = new_id("out")

    initial_prompt = (user_prompt or "").strip() or "Generate a clean commercial product photo, high quality, studio lighting."
    default_edit_prompt = "Refine the image: improve composition and details. Keep style consistent."

    patch = [
        {"op": "add_node", "node": {"id": text_id, "type": "text_input", "x": x0, "y": y0, "data": {"text": initial_prompt}}},
        {
            "op": "add_node",
            "node": {
                "id": gen_id,
                "type": "processor",
                "x": x0 + 320,
                "y": y0,
                "data": {"mode": "text2img", "prompt": initial_prompt, "templates": tpl, "batchSize": 1, "status": "idle", "model": model},
            },
        },
        {"op": "add_node", "node": {"id": out1_id, "type": "output", "x": x0 + 640, "y": y0, "data": {"images": []}}},
        {
            "op": "add_node",
            "node": {
                "id": edit_id,
                "type": "processor",
                "x": x0 + 320,
                "y": y0 + 220,
                "data": {
                    "mode": "multi_image_generate",
                    "prompt": default_edit_prompt,
                    "templates": tpl,
                    "batchSize": 1,
                    "status": "idle",
                    "model": model,
                },
            },
        },
        {"op": "add_node", "node": {"id": out2_id, "type": "output", "x": x0 + 640, "y": y0 + 220, "data": {"images": []}}},
        {"op": "add_connection", "connection": {"id": new_id("c"), "from": text_id, "to": gen_id}},
        {"op": "add_connection", "connection": {"id": new_id("c"), "from": gen_id, "to": out1_id}},
        {"op": "add_connection", "connection": {"id": new_id("c"), "from": gen_id, "to": edit_id}},
        {"op": "add_connection", "connection": {"id": new_id("c"), "from": edit_id, "to": out2_id}},
        {"op": "select_nodes", "ids": [gen_id]},
    ]
    return {"patch": patch, "summary": "已从零搭建：文生图 + 连续图生图编辑链路", "thought": "scratch plan with continuous edit"}


def deterministic_plan_or_patch(
    user_prompt: str,
    selected_artifact: Optional[Dict[str, Any]],
    current_nodes: Optional[List[Dict[str, Any]]],
    current_connections: Optional[List[Dict[str, Any]]],
    fallback_refine: bool = True,
) -> Dict[str, Any]:
    """
    无模型/模型失败时的确定性规划：
    - 有 selected_artifact：优先续链（根据 fromNodeId 找 anchor）；失败则新建 input 分支
    - 无 selected_artifact：从零搭建（text_input -> text2img -> output + edit链）
    """
    refined = simple_refine_prompt(user_prompt) if fallback_refine else (user_prompt or "").strip()
    specs = _infer_requested_specs(user_prompt, selected_artifact)

    try:
        return _build_chain_patch(
            user_prompt=user_prompt,
            refined_prompt=refined,
            specs=specs,
            selected_artifact=selected_artifact,
            current_nodes=current_nodes,
            current_connections=current_connections,
        )
    except Exception:
        if selected_artifact and selected_artifact.get("url"):
            try:
                return build_continue_chain_patch(refined, current_nodes, current_connections, selected_artifact, model=MODEL_GEMINI)
            except Exception:
                return build_iterate_branch_with_new_input_patch(refined, selected_artifact, model=MODEL_GEMINI)

    return build_from_scratch_patch(user_prompt, model=MODEL_GEMINI)
