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
    text_color: Optional[str] = None
    highlight_color: Optional[str] = None
    highlight_colors: Optional[List[str]] = None
    highlight_text: Optional[str] = None
    highlight_texts: Optional[List[str]] = None
    bold_text: Optional[str] = None
    bold_texts: Optional[List[str]] = None
    bold_color: Optional[str] = None
    bold_colors: Optional[List[str]] = None
    bold_size_delta: Optional[int] = None
    bold_strength: Optional[int] = None
    bg_color: Optional[str] = None
    use_bg_color: Optional[bool] = False
    size: Optional[str] = None
    aspect_ratio: Optional[str] = None
    font_name: Optional[str] = None
    font_size: Optional[int] = None
    highlight_opacity: Optional[float] = None
    highlight_padding: Optional[int] = None
    line_spacing: Optional[int] = None
    margins: Optional[int] = None
    style_image: Optional[str] = None

class OverlayTextResponse(BaseModel):
    image: str

class RmbgRequest(BaseModel):
    image: str
    size: Optional[str] = None
    aspect_ratio: Optional[str] = None

class RmbgResponse(BaseModel):
    image: str

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
