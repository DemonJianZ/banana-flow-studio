import json
from typing import List

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from screenplay_workflow.scene_splitter import split_scenes_stream
from screenplay_workflow.character_extractor import extract_characters_stream
from screenplay_workflow.storyboard_generator import generate_storyboard_stream
from screenplay_workflow.prompt_optimizer import optimize_prompts_stream
from screenplay_workflow.schemas import Scene, Character, Shot

screenplay_router = APIRouter(prefix="/api/screenplay", tags=["screenplay"])


# ── Node 1：场景切分 ───────────────────────────────────────────────────────────

class SceneSplitRequest(BaseModel):
    script: str


@screenplay_router.post("/scenes")
async def analyze_scenes(req: SceneSplitRequest):
    async def _stream():
        yield f"data: {json.dumps({'type': 'ping'})}\n\n"
        async for event in split_scenes_stream(req.script):
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(
        _stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Node 2：角色提取 ───────────────────────────────────────────────────────────

class CharacterExtractRequest(BaseModel):
    script: str
    scenes: List[Scene]


@screenplay_router.post("/characters")
async def extract_characters(req: CharacterExtractRequest):
    async def _stream():
        yield f"data: {json.dumps({'type': 'ping'})}\n\n"
        async for event in extract_characters_stream(req.script, req.scenes):
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(
        _stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Node 3：分镜生成 ───────────────────────────────────────────────────────────

class StoryboardRequest(BaseModel):
    script: str
    scenes: List[Scene]
    characters: List[Character]


@screenplay_router.post("/storyboard")
async def generate_storyboard(req: StoryboardRequest):
    async def _stream():
        yield f"data: {json.dumps({'type': 'ping'})}\n\n"
        async for event in generate_storyboard_stream(
            req.script, req.scenes, req.characters
        ):
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(
        _stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Node 4：提示词优化 ─────────────────────────────────────────────────────────

class PromptOptimizeRequest(BaseModel):
    shots: List[Shot]
    characters: List[Character]


@screenplay_router.post("/prompts")
async def optimize_prompts(req: PromptOptimizeRequest):
    async def _stream():
        yield f"data: {json.dumps({'type': 'ping'})}\n\n"
        async for event in optimize_prompts_stream(req.shots, req.characters):
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(
        _stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
