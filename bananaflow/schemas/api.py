from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from core.config import MODEL_GEMINI

class EditRequest(BaseModel):
    image: str
    ref_image: Optional[str] = None
    background_image: Optional[str] = None
    mode: str
    prompt: str
    temperature: Optional[float] = 0.4
    model: Optional[str] = MODEL_GEMINI
    size: Optional[str] = None
    aspect_ratio: Optional[str] = None

class EditResponse(BaseModel):
    image: str

class Text2ImgRequest(BaseModel):
    prompt: str
    temperature: Optional[float] = 0.7
    model: Optional[str] = MODEL_GEMINI
    size: Optional[str] = "1024x1024"
    aspect_ratio: Optional[str] = "1:1"

class Text2ImgResponse(BaseModel):
    images: List[str]

class MultiImageRequest(BaseModel):
    prompt: str
    images: List[str]
    temperature: float = 0.7
    size: Optional[str] = "1024x1024"
    aspect_ratio: Optional[str] = "1:1"

class MultiImageResponse(BaseModel):
    image: str

class OverlayTextRequest(BaseModel):
    image: str
    text: str
    font_name: Optional[str] = None
    font_size: Optional[int] = None
    bold_strength: Optional[int] = None
    bold_text_1: Optional[str] = None
    bold_text_2: Optional[str] = None
    bold_text_3: Optional[str] = None
    bold_text_4: Optional[str] = None
    bold_text_5: Optional[str] = None
    font_color: Optional[str] = None
    text_bg_color: Optional[str] = None
    text_bg_opacity: Optional[float] = None
    text_bg_padding: Optional[int] = None
    highlight_text_1: Optional[str] = None
    highlight_text_2: Optional[str] = None
    highlight_text_3: Optional[str] = None
    highlight_text_4: Optional[str] = None
    highlight_text_5: Optional[str] = None
    highlight_color_1: Optional[str] = None
    highlight_color_2: Optional[str] = None
    highlight_color_3: Optional[str] = None
    highlight_color_4: Optional[str] = None
    highlight_color_5: Optional[str] = None
    highlight_opacity: Optional[float] = None
    highlight_padding: Optional[int] = None
    align: Optional[str] = None
    justify: Optional[str] = None
    margins: Optional[int] = None
    line_spacing: Optional[int] = None
    position_x: Optional[float] = None
    position_y: Optional[float] = None
    rotation_angle: Optional[float] = None
    rotation_options: Optional[str] = None
    font_color_hex: Optional[str] = None
    text_bg_color_hex: Optional[str] = None
    highlight_color_hex_1: Optional[str] = None
    highlight_color_hex_2: Optional[str] = None
    highlight_color_hex_3: Optional[str] = None
    highlight_color_hex_4: Optional[str] = None
    highlight_color_hex_5: Optional[str] = None

class OverlayTextResponse(BaseModel):
    image: str

class RmbgRequest(BaseModel):
    image: str
    size: Optional[str] = None
    aspect_ratio: Optional[str] = None

class RmbgResponse(BaseModel):
    image: str

class MultiAngleShotsRequest(BaseModel):
    image: str
    config: Optional[Dict[str, Any]] = Field(default_factory=dict)

class MultiAngleShotsResponse(BaseModel):
    images: List[str]

class VideoUpscaleRequest(BaseModel):
    video: str
    segment_seconds: Optional[int] = 3

class VideoUpscaleResponse(BaseModel):
    video: str

class VideoUpscaleTaskStartResponse(BaseModel):
    task_id: str
    status: str

class VideoUpscaleTaskStatusResponse(BaseModel):
    task_id: str
    status: str
    completed_chunks: int = 0
    total_chunks: int = 0
    progress: float = 0.0
    video: Optional[str] = None
    error: Optional[str] = None

# schemas/api.py
class Img2VideoRequest(BaseModel):
    image: str
    last_frame_image: Optional[str] = None
    prompt: Optional[str] = ""
    duration: int = 5
    fps: int = 24
    camera_fixed: bool = False
    resolution: Optional[str] = None
    ratio: Optional[str] = None
    model: Optional[str] = None   # ✅ 新增：既可传 ep-xxxx，也可传旧的名字
    seed: Optional[int] = None

class Img2VideoResponse(BaseModel):
    image: str

class SelectedArtifact(BaseModel):
    url: str
    kind: Optional[str] = "image"
    fromNodeId: Optional[str] = None
    createdAt: Optional[int] = None
    meta: Optional[Dict[str, Any]] = None

class AgentRequest(BaseModel):
    prompt: str = Field(default="")
    current_nodes: List[Dict[str, Any]] = Field(default_factory=list)
    current_connections: List[Dict[str, Any]] = Field(default_factory=list)
    selected_artifact: Optional[Dict[str, Any]] = None

    # ✅ 多画布关键字段
    canvas_id: Optional[str] = None
    thread_id: Optional[str] = None
