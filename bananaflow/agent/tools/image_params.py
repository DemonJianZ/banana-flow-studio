"""
agent/tools/image_params.py — 图片生成参数定义

IMAGE_MODELS：4 个可用模型
RATIO_OPTIONS：图片比例
SIZE_OPTIONS：尺寸/分辨率
"""
from __future__ import annotations

import os

# ── 4 个生图模型 ──────────────────────────────────────────────────────────────

IMAGE_MODELS = [
    {
        "value": "aichat_pro",
        "label": "会员·精品",
        "desc": "平台精品模型，质量最高",
        "requires_auth": True,
    },
    {
        "value": "aichat_std",
        "label": "会员·标准",
        "desc": "平台标准模型，速度较快",
        "requires_auth": True,
    },
    {
        "value": "doubao",
        "label": "豆包·Seedream",
        "desc": "字节豆包直出，风格丰富",
        "requires_auth": False,
    },
    {
        "value": "comfyui",
        "label": "本地·极速",
        "desc": "本地模型，速度最快",
        "requires_auth": False,
    },
]

# ── 图片比例 ──────────────────────────────────────────────────────────────────

RATIO_OPTIONS = [
    {"value": "1:1",  "label": "1:1",  "desc": "正方形"},
    {"value": "4:3",  "label": "4:3",  "desc": "横版"},
    {"value": "3:4",  "label": "3:4",  "desc": "竖版"},
    {"value": "16:9", "label": "16:9", "desc": "宽屏"},
    {"value": "9:16", "label": "9:16", "desc": "手机竖屏"},
]

# ── 尺寸分辨率 ────────────────────────────────────────────────────────────────

SIZE_OPTIONS = [
    {"value": "512x512",   "label": "512",   "desc": "快速预览"},
    {"value": "768x768",   "label": "768",   "desc": "标准"},
    {"value": "1024x1024", "label": "1024",  "desc": "高清（推荐）"},
    {"value": "1280x1280", "label": "1280",  "desc": "超高清"},
]


def get_model_by_id(model_id: str) -> dict:
    """根据 model_id 返回模型定义，未找到返回第一个。"""
    for m in IMAGE_MODELS:
        if m["value"] == model_id:
            return m
    return IMAGE_MODELS[0]
