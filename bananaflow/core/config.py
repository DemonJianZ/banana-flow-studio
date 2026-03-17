import os

# ---- env ----
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
ARK_API_KEY = os.getenv("ARK_API_KEY") or "YOUR_ARK_API_KEY_HERE"

PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT", "dayu-ai")
LOCATION = os.getenv("GOOGLE_CLOUD_LOCATION", "global")

MODEL_GEMINI = "gemini-3-pro-image-preview"
MODEL_DOUBAO = "doubao-seedream-4.5"
MODEL_AGENT  = "gemini-3-flash-preview"
MODEL_AGENT_CHAT = "gemini-2.5-flash-lite"
AGENT_CHAT_HTTP_PROXY = os.getenv("AGENT_CHAT_HTTP_PROXY", "http://szdayu:123456@124.243.168.90:16607")
AGENT_CHAT_HTTPS_PROXY = os.getenv("AGENT_CHAT_HTTPS_PROXY", "http://szdayu:123456@124.243.168.90:16607")
MODEL_COMFYUI_OVERLAYTEXT = "comfyui-overlaytext"
MODEL_COMFYUI_RMBG = "comfyui-rmbg"
MODEL_COMFYUI_MULTI_ANGLESHOTS = "comfyui-multi-angleshots"
MODEL_COMFYUI_VIDEO_UPSCALE = "comfyui-video-upscale"
MODEL_COMFYUI_CONTROLNET = "comfyui-controlnet"
MODEL_COMFYUI_IMAGE_Z_IMAGE_TURBO = "comfyui-image-z-image-turbo"
MODEL_COMFYUI_QWEN_I2V = "comfyui-qwen-i2v"

ARK_VIDEO_API_URL = "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks"
ARK_VIDEO_MODEL_ID = "ep-20250708120248-4w7w5"
ARK_IMAGE_API_URL = "https://ark.cn-beijing.volces.com/api/v3/images/generations"
ARK_IMAGE_MODEL_ID = "ep-20251212110122-srwd7"
ARK_VIDEO_MODEL_ID_NEW = "ep-20251225103241-gkccd"
VIDEO_MODEL_1_0 = "Doubao-Seedance-1.0-pro"
VIDEO_MODEL_1_5 = "Doubao-Seedance-1.5-pro"

CONFIG_DIR = os.path.dirname(os.path.abspath(__file__))
PACKAGE_DIR = os.path.dirname(CONFIG_DIR)
BASE_DIR = os.path.dirname(PACKAGE_DIR)
COMFYUI_URL = os.getenv("COMFYUI_URL", "http://192.168.20.30:8188").rstrip("/")
_default_overlaytext = os.path.join(BASE_DIR, "workflows", "textoverlay.json")
if not os.path.exists(_default_overlaytext):
    _default_overlaytext = os.path.join(BASE_DIR, "bananaflow", "workflows", "textoverlay.json")
COMFYUI_OVERLAYTEXT_PATH = os.getenv("COMFYUI_OVERLAYTEXT_PATH", _default_overlaytext)
_default_rmbg = os.path.join(BASE_DIR, "workflows", "RMBG.json")
if not os.path.exists(_default_rmbg):
    _default_rmbg = os.path.join(BASE_DIR, "bananaflow", "workflows", "RMBG.json")
COMFYUI_RMBG_PATH = os.getenv("COMFYUI_RMBG_PATH", _default_rmbg)

_default_multi_angleshots = os.path.join(BASE_DIR, "workflows", "Multi-angleshots.json")
if not os.path.exists(_default_multi_angleshots):
    _default_multi_angleshots = os.path.join(BASE_DIR, "bananaflow", "workflows", "Multi-angleshots.json")
COMFYUI_MULTI_ANGLESHOTS_PATH = os.getenv("COMFYUI_MULTI_ANGLESHOTS_PATH", _default_multi_angleshots)

_default_upscale = os.path.join(BASE_DIR, "workflows", "UpScale_V2.json")
if not os.path.exists(_default_upscale):
    _default_upscale = os.path.join(BASE_DIR, "bananaflow", "workflows", "UpScale_V2.json")
_env_upscale = (os.getenv("COMFYUI_UPSCALE_PATH") or "").strip()
_upscale_aliases = {"upscale.json", "upscale_v2.json"}
if _env_upscale:
    _env_upscale_abs = _env_upscale if os.path.isabs(_env_upscale) else os.path.abspath(os.path.join(BASE_DIR, _env_upscale))
    _env_upscale_basename = os.path.basename(_env_upscale).lower()
    if _env_upscale_basename in _upscale_aliases:
        _upscale_dir = os.path.dirname(_env_upscale_abs) or BASE_DIR
        _upscale_candidates = (
            "UpScale_V2.json",
            "UpScale_v2.json",
            "upscale_v2.json",
            "upscale.json",
        )
        _resolved_upscale = ""
        for _name in _upscale_candidates:
            _candidate = os.path.join(_upscale_dir, _name)
            if os.path.exists(_candidate):
                _resolved_upscale = _candidate
                break
        if _resolved_upscale:
            COMFYUI_UPSCALE_PATH = _resolved_upscale
        elif os.path.exists(_env_upscale):
            COMFYUI_UPSCALE_PATH = _env_upscale
        elif os.path.exists(_env_upscale_abs):
            COMFYUI_UPSCALE_PATH = _env_upscale_abs
        else:
            COMFYUI_UPSCALE_PATH = _default_upscale
    elif os.path.exists(_env_upscale):
        COMFYUI_UPSCALE_PATH = _env_upscale
    elif os.path.exists(_env_upscale_abs):
        COMFYUI_UPSCALE_PATH = _env_upscale_abs
    else:
        COMFYUI_UPSCALE_PATH = _env_upscale
else:
    COMFYUI_UPSCALE_PATH = _default_upscale

_default_controlnet = os.path.join(BASE_DIR, "workflows", "Controlnet.json")
if not os.path.exists(_default_controlnet):
    _default_controlnet = os.path.join(BASE_DIR, "bananaflow", "workflows", "Controlnet.json")
COMFYUI_CONTROLNET_PATH = os.getenv("COMFYUI_CONTROLNET_PATH", _default_controlnet)

COMFYUI_OUTPUT_NODE_ID = os.getenv("COMFYUI_OUTPUT_NODE_ID", "4")
COMFYUI_TIMEOUT_SEC = int(os.getenv("COMFYUI_TIMEOUT_SEC", "120"))
COMFYUI_VIDEO_UPSCALE_TIMEOUT_SEC = int(os.getenv("COMFYUI_VIDEO_UPSCALE_TIMEOUT_SEC", "900"))
COMFYUI_POLL_INTERVAL_SEC = float(os.getenv("COMFYUI_POLL_INTERVAL_SEC", "1.0"))

_default_image_z_image_turbo = os.path.join(BASE_DIR, "workflows", "image_z_image_turbo.json")
if not os.path.exists(_default_image_z_image_turbo):
    _default_image_z_image_turbo = os.path.join(BASE_DIR, "bananaflow", "workflows", "image_z_image_turbo.json")
COMFYUI_IMAGE_Z_IMAGE_TURBO_PATH = os.getenv("COMFYUI_IMAGE_Z_IMAGE_TURBO_PATH", _default_image_z_image_turbo)

_default_video_wan_i2v = os.path.join(BASE_DIR, "workflows", "video_wan2_2_14B_i2v.json")
if not os.path.exists(_default_video_wan_i2v):
    _default_video_wan_i2v = os.path.join(BASE_DIR, "bananaflow", "workflows", "video_wan2_2_14B_i2v.json")
COMFYUI_VIDEO_WAN_I2V_PATH = os.getenv("COMFYUI_VIDEO_WAN_I2V_PATH", _default_video_wan_i2v)

_default_video_qwen_i2v = os.path.join(BASE_DIR, "workflows", "Qwen_i2v.json")
if not os.path.exists(_default_video_qwen_i2v):
    _default_video_qwen_i2v = os.path.join(BASE_DIR, "bananaflow", "workflows", "Qwen_i2v.json")
COMFYUI_VIDEO_QWEN_I2V_PATH = os.getenv("COMFYUI_VIDEO_QWEN_I2V_PATH", _default_video_qwen_i2v)

LOG_DIR = os.path.join(BASE_DIR, "logs")
DEBUG_DIR = os.path.join(BASE_DIR, "debug_output")
os.makedirs(LOG_DIR, exist_ok=True)
os.makedirs(DEBUG_DIR, exist_ok=True)
