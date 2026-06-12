"""
agent/tools/specs.py — DeepSeek/OpenAI function calling tool specifications.

Each entry follows the OpenAI tool format and is used:
1. By the classify node as part of the system prompt (tool descriptions).
2. By the tool executor to validate and dispatch calls.
"""
from __future__ import annotations

from typing import Any, Dict, List

TOOL_SPECS: List[Dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "generate_image",
            "description": (
                "根据文字描述生成一张电商图片。"
                "当用户说「帮我生图」「生成图片」「出图」「做一张」时调用。"
                "不能用于：修改已有图片（用 edit_image）、去背景（用 remove_background）。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "prompt": {
                        "type": "string",
                        "description": "图片内容描述，越详细效果越好。英文效果通常优于中文。",
                    },
                    "style": {
                        "type": "string",
                        "enum": ["商业白底", "生活场景", "艺术风格", "产品特写"],
                        "description": "图片整体风格",
                    },
                    "ratio": {
                        "type": "string",
                        "enum": ["1:1", "4:3", "3:4", "16:9", "9:16"],
                        "description": "图片宽高比，默认 1:1",
                    },
                },
                "required": ["prompt"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "remove_background",
            "description": (
                "去除图片背景，返回透明背景图。"
                "当用户说「去背景」「抠图」「去底」「透明背景」时调用。"
                "需要用户上传了图片才能使用。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "image_url": {
                        "type": "string",
                        "description": "要去背景的图片 URL 或 data URL",
                    },
                },
                "required": [],   # image_url may come from uploaded_documents
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "generate_video",
            "description": (
                "把一张图片生成成短视频（图生视频）。"
                "当用户说「做视频」「生成视频」「图转视频」时调用。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "image_url": {
                        "type": "string",
                        "description": "作为视频首帧的图片 URL",
                    },
                    "prompt": {
                        "type": "string",
                        "description": "视频运动描述，例如「轻微晃动，商品保持静止」",
                    },
                    "duration": {
                        "type": "integer",
                        "enum": [3, 5, 8, 10],
                        "description": "视频时长（秒），默认 5",
                    },
                    "ratio": {
                        "type": "string",
                        "enum": ["9:16", "16:9", "1:1"],
                        "description": "视频宽高比，默认 9:16",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_storyboard",
            "description": (
                "根据产品脚本生成完整分镜方案，含场景分割、角色提取、镜头描述和图像提示词。"
                "当用户提供脚本/文案并说「做分镜」「分镜策划」「生成分镜」时调用。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "script": {
                        "type": "string",
                        "description": "产品广告脚本或短视频文案全文",
                    },
                    "platform": {
                        "type": "string",
                        "enum": ["抖音", "小红书", "快手", "微信", "淘宝/天猫", "京东"],
                        "description": "目标发布平台",
                    },
                },
                "required": ["script"],
            },
        },
    },
]

# Quick lookup dict
TOOL_SPEC_MAP: Dict[str, Dict[str, Any]] = {
    spec["function"]["name"]: spec["function"]
    for spec in TOOL_SPECS
}
