from __future__ import annotations

from typing import Any, Dict, List

from pydantic import BaseModel, Field


class StoryboardAppearance(BaseModel):
    species: str = ""
    fur_color: str = ""
    build: str = ""
    material: str = ""
    outfit: List[str] = Field(default_factory=list)
    accessories: List[str] = Field(default_factory=list)
    expression: List[str] = Field(default_factory=list)
    details: List[str] = Field(default_factory=list)


class StoryboardVisualDesign(BaseModel):
    lighting: List[str] = Field(default_factory=list)
    mood: List[str] = Field(default_factory=list)
    contrast: str = ""
    surface: List[str] = Field(default_factory=list)
    focus: List[str] = Field(default_factory=list)
    camera_bias: List[str] = Field(default_factory=list)
    palette: List[str] = Field(default_factory=list)


class StoryboardDialogue(BaseModel):
    speaker: str = ""
    text: str = ""


class StoryboardShot(BaseModel):
    shot_id: str
    shot_no: int = Field(ge=1)
    duration_sec: float = Field(gt=0)
    camera: str = ""
    visual_description: str
    sound_description: str = ""
    dialogues: List[StoryboardDialogue] = Field(default_factory=list)
    voiceover: str = ""
    referenced_entities: List[str] = Field(default_factory=list)
    generation_notes: str = ""


class StoryboardScene(BaseModel):
    scene_id: str
    scene_no: int = Field(ge=1)
    title: str = ""
    summary: str = ""
    location: str = ""
    objective: str = ""
    shots: List[StoryboardShot] = Field(default_factory=list)
    scene_notes: str = ""


class StoryboardEntity(BaseModel):
    entity_id: str
    name: str
    kind: str = ""
    description: str = ""
    role: str = ""
    core_description: str = ""
    visual_traits: List[str] = Field(default_factory=list)
    appearance: StoryboardAppearance = Field(default_factory=StoryboardAppearance)
    style_notes: List[str] = Field(default_factory=list)
    story_function: str = ""
    visual_design: StoryboardVisualDesign = Field(default_factory=StoryboardVisualDesign)


class StoryboardEntities(BaseModel):
    characters: List[StoryboardEntity] = Field(default_factory=list)
    subjects: List[StoryboardEntity] = Field(default_factory=list)
    locations: List[StoryboardEntity] = Field(default_factory=list)


class StoryboardPlan(BaseModel):
    title: str
    aspect_ratio: str = "16:9"
    style: str = ""
    target_duration_sec: float = Field(gt=0)
    estimated_duration_sec: float = Field(gt=0)
    shot_default_duration_sec: float = Field(gt=0)
    entities: StoryboardEntities = Field(default_factory=StoryboardEntities)
    scenes: List[StoryboardScene] = Field(default_factory=list)
    global_notes: List[str] = Field(default_factory=list)
    design_rationale: str = ""
    warnings: List[str] = Field(default_factory=list)


def storyboard_plan_json_schema() -> Dict[str, Any]:
    return StoryboardPlan.model_json_schema()
