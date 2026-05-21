from __future__ import annotations

from typing import Any, Dict, List, Optional

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


class LocalCharacterBinding(BaseModel):
    entity_id: str = ""
    entity_name: str = ""
    character_name: str = ""
    three_view_path: Optional[str] = None
    three_view_url: Optional[str] = None
    voice_path: Optional[str] = None
    voice_url: Optional[str] = None
    match_score: float = 0.0
    match_reason: str = ""
    confidence: float = 0.0
    match_status: str = "matched"
    reason_codes: List[str] = Field(default_factory=list)
    alias_used: Optional[str] = None


class LocalSceneBinding(BaseModel):
    folder_name: str = ""
    folder_path: str = ""
    preview_paths: List[str] = Field(default_factory=list)
    preview_urls: List[str] = Field(default_factory=list)
    matched_from: str = ""
    match_score: float = 0.0
    match_reason: str = ""


class StoryboardLocalAssetBindings(BaseModel):
    character_bindings: List[LocalCharacterBinding] = Field(default_factory=list)
    scene_bindings: List[LocalSceneBinding] = Field(default_factory=list)
    missing_characters: List[str] = Field(default_factory=list)
    missing_scenes: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    asset_root_used: str = ""


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
    local_asset_bindings: Optional[StoryboardLocalAssetBindings] = None


def storyboard_plan_json_schema() -> Dict[str, Any]:
    return StoryboardPlan.model_json_schema()
