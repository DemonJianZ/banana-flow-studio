from __future__ import annotations

import json
import os
import shlex
import sys
from dataclasses import dataclass, field
from typing import Dict, List


def _as_bool(value: object, default: bool) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "on"}:
        return True
    if text in {"0", "false", "no", "off"}:
        return False
    return default


def _parse_command(value: object, default: List[str]) -> List[str]:
    if isinstance(value, list):
        out = [str(item).strip() for item in value if str(item).strip()]
        return out or list(default)
    text = str(value or "").strip()
    if not text:
        return list(default)
    return [part for part in shlex.split(text) if str(part).strip()] or list(default)


def _parse_env(value: object) -> Dict[str, str]:
    if isinstance(value, dict):
        return {str(k): str(v) for k, v in value.items()}
    text = str(value or "").strip()
    if not text:
        return {}
    try:
        raw = json.loads(text)
    except Exception:
        return {}
    if not isinstance(raw, dict):
        return {}
    return {str(k): str(v) for k, v in raw.items()}


@dataclass(frozen=True)
class MCPServerConfig:
    name: str
    command: List[str]
    env: Dict[str, str] = field(default_factory=dict)
    enabled: bool = True


def _default_servers() -> List[MCPServerConfig]:
    return [
        MCPServerConfig(
            name="export_ffmpeg",
            command=[sys.executable, "-m", "bananaflow.mcp.server_export_ffmpeg"],
            env={},
            enabled=True,
        ),
        MCPServerConfig(
            name="asset_match",
            command=[sys.executable, "-m", "bananaflow.mcp.server_asset_match"],
            env={},
            enabled=True,
        ),
    ]


def load_server_configs_from_env() -> List[MCPServerConfig]:
    raw_json = (os.getenv("BANANAFLOW_MCP_SERVERS_JSON") or "").strip()
    if raw_json:
        try:
            decoded = json.loads(raw_json)
        except Exception:
            decoded = []
        if isinstance(decoded, list):
            parsed: List[MCPServerConfig] = []
            for idx, item in enumerate(decoded):
                if not isinstance(item, dict):
                    continue
                name = str(item.get("name") or f"server_{idx + 1}").strip() or f"server_{idx + 1}"
                default_cmd = [sys.executable, "-m", "bananaflow.mcp.server_export_ffmpeg"]
                parsed.append(
                    MCPServerConfig(
                        name=name,
                        command=_parse_command(item.get("command"), default=default_cmd),
                        env=_parse_env(item.get("env")),
                        enabled=_as_bool(item.get("enabled"), default=True),
                    )
                )
            if parsed:
                return parsed

    defaults = _default_servers()
    out: List[MCPServerConfig] = []
    for item in defaults:
        env_prefix = f"BANANAFLOW_MCP_SERVER_{item.name.upper()}"
        out.append(
            MCPServerConfig(
                name=item.name,
                command=_parse_command(os.getenv(f"{env_prefix}_CMD"), default=item.command),
                env=_parse_env(os.getenv(f"{env_prefix}_ENV_JSON")),
                enabled=_as_bool(os.getenv(f"{env_prefix}_ENABLED"), default=item.enabled),
            )
        )
    return out
