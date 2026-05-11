from __future__ import annotations

import json
from typing import Any, Dict, List


def _json(data: Dict[str, Any]) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2)


def build_intake_prompt(payload: Dict[str, Any]) -> str:
    return (
        "你是 Bananaflow 的分镜设计代理。\n"
        "任务：从用户创意 brief 中提炼一个清晰的分镜规划输入。\n"
        "输出严格 JSON，对象字段：title, style, aspect_ratio, target_duration_sec, shot_default_duration_sec, language, constraints, creative_goal。\n"
        "不要输出 markdown，不要解释。\n"
        f"输入：\n{_json(payload)}"
    )


def build_entity_design_prompt(payload: Dict[str, Any]) -> str:
    return (
        "你是分镜角色/主体设计器。\n"
        "基于 brief 输出严格 JSON，对象字段：characters, subjects, locations。\n"
        "characters / subjects / locations 都必须尽量完整。\n"
        "每个数组元素至少包含：entity_id, name, kind, description, core_description, visual_traits。\n"
        "其中 core_description 不是摘要标签，必须是一整段可直接用于视觉生成的中文描述。\n"
        "每个角色 / 主体的 core_description 至少写 1-3 句，优先覆盖：身份或物种、年龄或体态、材质或毛发、服装、配饰、表情、气质、关键视觉特征。\n"
        "例如不要只写“高冷、威严、警惕”，而要写成“一个极其坚固的黑色金属质感硬壳手提箱，带有复杂的密码锁和银色防撞包边”这种完整描述。\n"
        "description 可写成简短摘要，但 core_description 必须详细。\n"
        "如有信息，请补充：role, appearance, style_notes, story_function, visual_design。\n"
        "appearance 可包含：species, fur_color, build, material, outfit, accessories, expression, details。\n"
        "visual_design 可包含：lighting, mood, contrast, surface, focus, camera_bias, palette。\n"
        "name 尽量保持简洁中文名，不要擅自附带括号里的英文翻译，除非 brief 明确要求双语。\n"
        "locations 应优先写成可复用的场景视觉设定，而不是只写地点名。\n"
        "每个 location 的 core_description 必须是一整段可直接指导镜头设计和画面生成的中文描述，不允许只写“压抑、雨夜、紧张”这类标签。\n"
        "location 的 core_description 只描述环境本身，不要写角色动作、人物关系、主体交互、剧情推进、情绪爆发或镜头行为。\n"
        "也不要写“某角色站在这里”“角色之间形成对峙”这种叙事句；只写空间、光线、材质、空气、水迹、反射、雾气、陈设、色彩和氛围。\n"
        "每个 location 至少补充：空间形态、光线来源、主色调、材质/表面状态、天气或空气介质、反射/烟雾/水迹/道具状态、整体氛围。\n"
        "如果 brief 中存在不同视觉空间或局部环境，请拆成多个 locations，而不是合并成一个泛化场景。\n"
        "例如：主场景、局部特写环境、内部 reveal 空间、不同光线区域，都应分别设计。\n"
        "每个 location 的 core_description 也要尽量写出具体细节，例如光线来源、材质、颜色对比、雨水/烟雾/反光/道具状态等，而不是一句空泛概括。\n"
        "例如不要只写“雨夜暗巷，气氛肃杀”，而要写成“狭窄的旧城暗巷被暴雨浸透，冷蓝色月光和远处红色霓虹在积水地面上形成强烈冷暖反差，湿滑砖墙上残留雨水与霓虹反光，空气中带着潮湿雾气和压抑的肃杀感”。\n"
        "不要输出 markdown。\n"
        f"输入：\n{_json(payload)}"
    )


def build_scene_outline_prompt(payload: Dict[str, Any]) -> str:
    return (
        "你是分镜场景大纲设计器。\n"
        "请把 brief 拆成 1-N 个 scene，大纲必须可继续细化成镜头。\n"
        "场景大纲必须显式引用前面设计好的角色、主体、场景设定，并保持风格一致。\n"
        "输出严格 JSON，对象字段：title, global_notes, design_rationale, scenes。\n"
        "scene 字段：scene_id, scene_no, title, summary, location, objective, scene_notes。\n"
        "scene.location 必须对应 locations 里的某一个名称或设定名，不要发明新的 location 名称。\n"
        "scene 与 location 应是一对一关系：一个物理空间或视觉空间只对应一个 scene，不要把同一 location 因为剧情动作不同拆成多个 scene。\n"
        "如果同一 location 内发生多个叙事阶段，请放进同一个 scene，用更多 shots 来承载变化，而不是新增 scene。\n"
        "scene.location 才是场景的核心空间名；scene.title 应尽量与 scene.location 保持同一空间语义，不要写成动作、事件、情节推进或人物行为。\n"
        "例如可以写“雨夜暗巷”“手提箱内部”“巷口交汇点”，不要写“秘密接头”“真相揭露”“失控追逐”这种动作或事件标题。\n"
        "动作、冲突和剧情推进应写到 summary / objective / scene_notes，而不是写进 scene.title。\n"
        "scene_notes 不能空泛，必须补充这个场景的具体视觉细节，例如灯光、氛围、地面状态、反射、烟雾、景深、关键道具位置。\n"
        "scene_notes 仍然只描述该空间/场景本身，不写角色关系和动作过程。\n"
        "scene.title 也不要默认写成“场景1/场景2”，应尽量根据 location 生成可读的空间场景名。\n"
        "如果多个 scene 处在不同视觉空间，请让它们引用不同的 location，而不是重复一个 location。\n"
        "最终 scenes 列表必须完整覆盖后续镜头设计会用到的所有场景，不要让 shot 阶段再额外发明场景。\n"
        "不要输出 shots。\n"
        f"输入：\n{_json(payload)}"
    )


def build_shot_design_prompt(payload: Dict[str, Any]) -> str:
    return (
        "你是分镜镜头设计器。\n"
        "请为每个 scene 设计 shots，并输出严格 JSON。\n"
        "对象字段：estimated_duration_sec, scenes。\n"
        "输出的 scenes 必须严格沿用输入 scene_outline 中已有的 scene_id、scene_no、title、location，不要新增、删除或改写场景名称和 location。\n"
        "如果某个镜头发生在输入中不存在的场景或空间，说明 scene_outline 不完整，应把它并入最接近的已有 scene，而不是发明新的 scene。\n"
        "每个 shot 字段必须包含：shot_id, shot_no, duration_sec, camera, visual_description, sound_description, dialogues, voiceover, referenced_entities, generation_notes。\n"
        "shots 必须尽量复用前面已定义的 characters / subjects / locations，保持角色外观和场景光影一致。\n"
        "每个 shot 的 visual_description 必须服从所属 scene 的场景设定，不要和 scene.location / scene_notes 冲突。\n"
        "dialogues 为数组，元素字段：speaker, text。\n"
        "不要输出 markdown。\n"
        f"输入：\n{_json(payload)}"
    )


def build_repair_prompt(payload: Dict[str, Any], errors: List[str]) -> str:
    return (
        "你是分镜 JSON 修复器。\n"
        "请修复已有 storyboard plan，使其满足校验规则。\n"
        "输出严格 JSON 的完整 StoryboardPlan 对象。\n"
        "修复时遵守这些语义约束：\n"
        "1. scene.location 才是空间/地点本体，scene.title 必须保持空间语义，不要写成动作、事件或剧情推进。\n"
        "2. 一个 location 只能对应一个 scene；同一地点的不同剧情阶段应合并到同一个 scene，用 shots 表达变化。\n"
        "3. 不同 scene 的 summary / scene_notes 不能写成同一段描述；每个 scene 都要有自己的空间细节、光线、材质和氛围。\n"
        "4. 不同 location 的 core_description 不能完全重复；如果是不同场景，就必须写出可区分的视觉差异。\n"
        "5. location/core_description 只描述环境本身，不要提角色、主体交互或动作过程。\n"
        "6. 镜头里的场景应服从已有 scene/location 设定，不要额外发明新的场景表述。\n"
        "必须修复这些问题：\n"
        f"{_json({'errors': errors})}\n"
        f"当前计划：\n{_json(payload)}"
    )
