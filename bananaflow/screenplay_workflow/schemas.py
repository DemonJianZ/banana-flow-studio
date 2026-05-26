from typing import List, Optional
from pydantic import BaseModel


class Scene(BaseModel):
    scene_id: int
    time: str       # 日 / 夜 / 黄昏 / 清晨 / 室内不分昼夜 / 未指定
    location: str
    summary: str
    raw_text: Optional[str] = None


class SceneSplitResult(BaseModel):
    scenes: List[Scene]
    total_scenes: int


class Character(BaseModel):
    name: str
    role_type: str          # 主角 / 配角 / 群演
    appearance: str         # 外貌描述，无明确描述时为"未定义"
    personality: str        # 性格特征（2-3个词）
    emotion_arc: str        # 跨场景情绪弧线描述
    scenes: List[int]       # 出现的场景编号列表


class CharacterExtractResult(BaseModel):
    characters: List[Character]
    total_characters: int


class SceneSubject(BaseModel):
    scene_id: int
    subjects: List[str]     # 主体列表（人物名 / 物体）
    subject_state: str      # 主体状态描述（姿势、表情、服装）
    env_type: str           # 室内 / 室外 / 自然 / 城市 / 混合 / 未知
    lighting: str           # 光线氛围
    bg_elements: List[str]  # 关键背景元素
    composition: str        # 主体与背景的空间/构图关系


class SubjectExtractResult(BaseModel):
    subjects: List[SceneSubject]
    total_scenes: int


class Shot(BaseModel):
    shot_id: int            # 全局唯一编号
    scene_id: int
    shot_index: int         # 在场景内的序号（从 1 开始）
    shot_type: str          # 特写 / 近景 / 中景 / 全景 / 远景
    camera_movement: str    # 固定 / 推 / 拉 / 摇 / 跟 / 升 / 降
    content: str            # 画面内容描述
    mood: str               # 情绪基调（2-3 个词）
    duration: int           # 建议时长（秒）


class StoryboardResult(BaseModel):
    shots: List[Shot]
    total_shots: int


class ShotPrompt(BaseModel):
    shot_id: int
    scene_id: int
    shot_index: int
    prompt_zh: str          # 中文提示词
    prompt_en: str          # 英文提示词
    negative_prompt: str    # 负向提示词（英文）


class PromptOptimizeResult(BaseModel):
    prompts: List[ShotPrompt]
    total_prompts: int
