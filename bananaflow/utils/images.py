import base64
from urllib.parse import unquote_to_bytes
from typing import Tuple
from core.logging import sys_logger

def parse_data_url(img_str: str) -> Tuple[str, bytes]:
    if not img_str:
        raise ValueError("Image data is empty")
    text = str(img_str).strip()
    mime_type = "image/png"
    payload = text

    if text.startswith("data:"):
        header, separator, data_part = text.partition(",")
        if not separator:
            raise ValueError("Invalid data URL")
        meta = header[5:]
        meta_parts = [part.strip() for part in meta.split(";") if str(part).strip()]
        if meta_parts and "/" in meta_parts[0]:
            mime_type = meta_parts[0]
        else:
            mime_type = "application/octet-stream"
        if any(part.lower() == "base64" for part in meta_parts[1:]):
            return mime_type, base64.b64decode(data_part)
        return mime_type, unquote_to_bytes(data_part)

    if "base64," in text:
        parts = text.split("base64,", 1)
        if len(parts) > 1:
            head = parts[0]
            if "image/jpeg" in head:
                mime_type = "image/jpeg"
            elif "image/webp" in head:
                mime_type = "image/webp"
            payload = parts[1]

    return mime_type, base64.b64decode(payload)

def bytes_to_data_url(data_bytes: bytes, mime_type="image/png") -> str:
    b64 = base64.b64encode(data_bytes).decode("utf-8")
    return f"data:{mime_type};base64,{b64}"

def get_image_from_response(response):
    if getattr(response, "candidates", None):
        for part in response.candidates[0].content.parts:
            if getattr(part, "inline_data", None):
                return part.inline_data.data
    return None
