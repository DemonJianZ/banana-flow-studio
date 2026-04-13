from __future__ import annotations

import re
from typing import Any, Dict, List

from .common import clean_text, first_match, full_stage_bundle, stage_content


LOOK_PATTERNS = [
    re.compile(r"(?:Look|造型)\s*([A-Z0-9一二三四五六七八九十]+)\s*[:：]\s*(.+)"),
]
LOCATION_PATTERNS = [
    re.compile(r"(?:Location|地点|场景世界)\s*([A-Z0-9一二三四五六七八九十]+)\s*[:：]\s*(.+)"),
]


def _build_host_identity(storyboard_master: Dict[str, Any], bundle: str) -> Dict[str, Any]:
    title = clean_text(storyboard_master.get("project_title"))
    source_title = first_match(r"(?:project_title|source_title)[:：]?\s*(.+)", bundle)
    host_name = first_match(r"(?:Host|主角|出镜人|模特)\s*[:：]\s*(.+)", bundle) or "主出镜"
    role = first_match(r"(?:Role|角色定位)\s*[:：]\s*(.+)", bundle) or ("OOTD vlog 主持人" if "OOTD" in title or "穿搭" in title else "视频主角")
    identity_notes = [
        note
        for note in [
            first_match(r"(?:Identity|身份)\s*[:：]\s*(.+)", bundle),
            source_title,
            "保持人物面部、体态、发色和整体气质在全片一致",
        ]
        if note
    ]
    return {
        "host_id": "host_main",
        "name": host_name,
        "role": role,
        "identity_notes": identity_notes,
        "continuity_notes": [
            "除明确换装段落外，不改变主角脸型、发型和年龄感。",
            "同一 look 内保持妆面、发丝质感和配饰位置一致。",
        ],
    }


def _extract_looks(bundle: str) -> List[Dict[str, Any]]:
    looks: List[Dict[str, Any]] = []
    for pattern in LOOK_PATTERNS:
        for match in pattern.finditer(bundle):
            label = clean_text(match.group(1))
            body = clean_text(match.group(2))
            parts = [part.strip(" .，。") for part in re.split(r"[+、,，/]", body) if clean_text(part)]
            hero_items = parts[:2] or [body]
            accessories = parts[2:] if len(parts) > 2 else []
            palette_match = re.findall(r"(奶油白|白色|米色|卡其|牛仔蓝|黑色|灰色|焦糖|银色|金色|酒红|橄榄绿)", body)
            looks.append(
                {
                    "look_id": f"look_{label.lower()}",
                    "name": f"Look {label}",
                    "style": body,
                    "hero_items": hero_items,
                    "accessories": accessories,
                    "color_palette": palette_match or ["中性色", "点缀金属色"],
                    "mood": "轻松街拍",
                    "continuity_rules": [
                        "同一 look 段落内不更换核心单品。",
                        "同一 look 的配饰材质和数量保持稳定。",
                    ],
                }
            )
    if looks:
        return looks
    return [
        {
            "look_id": "look_main",
            "name": "Look Main",
            "style": "都市日常 OOTD，轻街拍质感，层次清晰",
            "hero_items": ["基础上装", "主搭下装"],
            "accessories": ["耳饰", "包袋"],
            "color_palette": ["奶油白", "牛仔蓝", "城市中性色"],
            "mood": "自在、明快、适合逛街 vlog",
            "continuity_rules": [
                "镜头切换时保持主搭单品的一致识别性。",
                "避免无动机漂移到完全不同的穿搭体系。",
            ],
        }
    ]


def _extract_locations(bundle: str) -> List[Dict[str, Any]]:
    locations: List[Dict[str, Any]] = []
    for pattern in LOCATION_PATTERNS:
        for match in pattern.finditer(bundle):
            label = clean_text(match.group(1))
            body = clean_text(match.group(2))
            locations.append(
                {
                    "location_id": f"location_{label.lower()}",
                    "name": body.split("，")[0].split(",")[0] or f"场景 {label}",
                    "world_type": "real_world_lifestyle",
                    "signature_elements": [item.strip() for item in re.split(r"[、,，/]", body) if clean_text(item)][:4] or [body],
                    "mood": "真实城市生活",
                    "continuity_rules": [
                        "同一 location 内保持光线方向和环境物件一致。",
                        "不要漂移到与该场景不相干的建筑风格或气候。",
                    ],
                }
            )
    if locations:
        return locations
    return [
        {
            "location_id": "location_city_block",
            "name": "城市街区",
            "world_type": "real_world_lifestyle",
            "signature_elements": ["街角店铺", "步行道", "橱窗反光", "自然人流"],
            "mood": "轻快、可逛、适合街拍",
            "continuity_rules": [
                "同段落内保持街区材质和人流密度一致。",
                "避免背景从城市街拍漂移到棚拍或度假风景。",
            ],
        }
    ]


def _build_global_style(storyboard_master: Dict[str, Any]) -> Dict[str, Any]:
    camera_strategy = stage_content(storyboard_master, "camera_strategy")
    return {
        "format": "vertical_short_form_vlog",
        "lighting": first_match(r"(暖调自然光[^。\n]*)", camera_strategy) or "自然光为主，必要时辅以柔光反射",
        "color_strategy": first_match(r"(高饱和度[^。\n]*)", camera_strategy) or "肤色稳定，服装主色清晰，避免过重滤镜污染",
        "lens_language": first_match(r"(特写[^。\n]*中景[^。\n]*)", camera_strategy) or "以中近景和细节特写交替，保留街拍呼吸感",
        "motion_language": first_match(r"(平稳[^。\n]*运镜[^。\n]*)", camera_strategy) or "以轻推、轻跟、轻摆动为主，避免无意义飘移",
        "texture_bias": "保留服装面料、城市反光和皮肤真实纹理",
    }


def build_asset_bible(storyboard_master: Dict[str, Any]) -> Dict[str, Any]:
    bundle = full_stage_bundle(storyboard_master)
    looks = _extract_looks(bundle)
    locations = _extract_locations(bundle)
    negative_rules = [
        "不要无动机更换主角长相、体型、年龄感或发型。",
        "不要让同一 look 在相邻镜头中漂移为不同单品或不同季节穿搭。",
        "不要把真实城市街拍空间漂移为棚拍、异国景点或超现实场景。",
        "不要在高潮镜头中削弱 hero item、主体姿态或服装层次。",
    ]
    return {
        "schema_version": "1.0",
        "project_title": clean_text(storyboard_master.get("project_title")) or "storyboard_project",
        "source_storyboard_stage": clean_text(storyboard_master.get("stage_id")) or "final_delivery",
        "host_identity": _build_host_identity(storyboard_master, bundle),
        "look_definitions": looks,
        "locations": locations,
        "global_visual_style": _build_global_style(storyboard_master),
        "negative_drift_rules": negative_rules,
        "climax_protection": {
            "protected_story_beats": [
                "换装 reveal",
                "hero look 定格",
                "最终 OOTD 成片展示",
            ],
            "protected_looks": [item["look_id"] for item in looks[:2]],
            "protected_locations": [item["location_id"] for item in locations[:2]],
            "protected_shots": [],
        },
    }
