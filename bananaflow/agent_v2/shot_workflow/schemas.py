from __future__ import annotations

from typing import Any, TypedDict


class ShotSpec(TypedDict, total=False):
    shot_id: str
    index: int
    title: str
    scene: str
    time: str
    characters: list[str]
    locations: list[str]
    props: list[str]
    visual_description: str
    audio_description: str
    action: str
    dialogue: str
    camera: str
    mood: str
    reference_hint: str
    needs_reference_image: bool
    mode: str
    prompt: str
    duration: int
    asset_bindings: dict[str, Any]


class ShotWorkflowState(TypedDict, total=False):
    args: dict[str, Any]
    source_text: str
    source_documents: list[dict[str, Any]]
    aspect_ratio: str
    mode_policy: str
    max_shots: int
    authorization: str
    selected_artifact: dict[str, Any] | None
    current_nodes: list[dict[str, Any]]
    current_connections: list[dict[str, Any]]
    shots: list[ShotSpec]
    annotated_script: str
    patch: list[dict[str, Any]]
    warnings: list[str]
    summary: str
    trace: list[dict[str, Any]]
