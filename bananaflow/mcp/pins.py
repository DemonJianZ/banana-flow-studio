from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Dict, Optional

from .tool_asset_match import (
    MATCH_ASSETS_TOOL_HASH,
    MATCH_ASSETS_TOOL_NAME,
    MATCH_ASSETS_TOOL_VERSION,
)
from .tool_export_ffmpeg import (
    EXPORT_FFMPEG_TOOL_HASH,
    EXPORT_FFMPEG_TOOL_NAME,
    EXPORT_FFMPEG_TOOL_VERSION,
)


@dataclass(frozen=True)
class MCPToolPin:
    name: str
    tool_version: str
    tool_hash: str


class MCPToolPinStore:
    def __init__(self, pins: Optional[Dict[str, MCPToolPin]] = None) -> None:
        self._pins: Dict[str, MCPToolPin] = dict(pins or {})

    def get(self, tool_name: str) -> Optional[MCPToolPin]:
        return self._pins.get(str(tool_name or "").strip())

    def as_dict(self) -> Dict[str, MCPToolPin]:
        return dict(self._pins)

    @classmethod
    def from_env(cls) -> "MCPToolPinStore":
        default_pins = {
            EXPORT_FFMPEG_TOOL_NAME: MCPToolPin(
                name=EXPORT_FFMPEG_TOOL_NAME,
                tool_version=(os.getenv("BANANAFLOW_MCP_EXPORT_FFMPEG_TOOL_VERSION") or "").strip()
                or EXPORT_FFMPEG_TOOL_VERSION,
                tool_hash=(os.getenv("BANANAFLOW_MCP_EXPORT_FFMPEG_TOOL_HASH") or "").strip()
                or EXPORT_FFMPEG_TOOL_HASH,
            ),
            MATCH_ASSETS_TOOL_NAME: MCPToolPin(
                name=MATCH_ASSETS_TOOL_NAME,
                tool_version=(os.getenv("BANANAFLOW_MCP_MATCH_ASSETS_TOOL_VERSION") or "").strip()
                or MATCH_ASSETS_TOOL_VERSION,
                tool_hash=(os.getenv("BANANAFLOW_MCP_MATCH_ASSETS_TOOL_HASH") or "").strip()
                or MATCH_ASSETS_TOOL_HASH,
            ),
        }
        overlay_raw = (os.getenv("BANANAFLOW_MCP_TOOL_PINS_JSON") or "").strip()
        if overlay_raw:
            try:
                overlay = json.loads(overlay_raw)
            except Exception:
                overlay = {}
            if isinstance(overlay, dict):
                for tool_name, pin_data in overlay.items():
                    if not isinstance(pin_data, dict):
                        continue
                    name = str(tool_name or "").strip()
                    if not name:
                        continue
                    tool_version = str(pin_data.get("tool_version") or "").strip()
                    tool_hash = str(pin_data.get("tool_hash") or "").strip()
                    if not tool_version or not tool_hash:
                        continue
                    default_pins[name] = MCPToolPin(
                        name=name,
                        tool_version=tool_version,
                        tool_hash=tool_hash,
                    )
        return cls(default_pins)
