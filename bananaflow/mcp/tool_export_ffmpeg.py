from __future__ import annotations

import hashlib
import json
from typing import Any, Callable, Dict, Optional

try:
    from ..agent.idea_script.exporters.ffmpeg_exporter import export_ffmpeg_bundle
except Exception:  # pragma: no cover - 兼容 python bananaflow/main.py 直跑
    from agent.idea_script.exporters.ffmpeg_exporter import export_ffmpeg_bundle


EXPORT_FFMPEG_TOOL_NAME = "export_ffmpeg_render_bundle"
EXPORT_FFMPEG_TOOL_VERSION = "1.0.0"


def _canonical_json(payload: Dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


_TOOL_DEFINITION_BASE: Dict[str, Any] = {
    "name": EXPORT_FFMPEG_TOOL_NAME,
    "description": "Export an EditPlan as an executable FFmpeg render bundle (does not execute ffmpeg).",
    "inputSchema": {
        "type": "object",
        "properties": {
            "plan_id": {"type": "string", "description": "Preferred plan identifier"},
            "plan": {"type": "object", "description": "EditPlan object payload"},
            "out_dir": {"type": "string", "default": "./exports/ffmpeg"},
            "resolution": {
                "type": "object",
                "properties": {
                    "w": {"type": "integer", "minimum": 64, "default": 720},
                    "h": {"type": "integer", "minimum": 64, "default": 1280},
                },
                "required": ["w", "h"],
                "additionalProperties": False,
            },
            "fps": {"type": "integer", "minimum": 1, "maximum": 120, "default": 30},
        },
        "anyOf": [{"required": ["plan_id"]}, {"required": ["plan"]}],
        "additionalProperties": False,
    },
    "outputSchema": {
        "type": "object",
        "properties": {
            "bundle_dir": {"type": "string"},
            "files": {"type": "array", "items": {"type": "string"}},
            "render_script_path": {"type": "string"},
            "concat_list_path": {"type": "string"},
            "edit_plan_path": {"type": "string"},
            "missing_primary_asset_count": {"type": "integer"},
            "warnings": {"type": "array", "items": {"type": "string"}},
            "tool_version": {"type": "string"},
            "tool_hash": {"type": "string"},
        },
        "required": [
            "bundle_dir",
            "files",
            "render_script_path",
            "concat_list_path",
            "edit_plan_path",
            "missing_primary_asset_count",
            "warnings",
            "tool_version",
            "tool_hash",
        ],
        "additionalProperties": True,
    },
    "annotations": {
        "idempotentHint": True,
        "destructiveHint": False,
        "readOnlyHint": False,
    },
    "tool_version": EXPORT_FFMPEG_TOOL_VERSION,
}


EXPORT_FFMPEG_TOOL_HASH = hashlib.sha256(
    _canonical_json(_TOOL_DEFINITION_BASE).encode("utf-8")
).hexdigest()


def get_export_ffmpeg_tool_definition() -> Dict[str, Any]:
    payload = dict(_TOOL_DEFINITION_BASE)
    payload["tool_hash"] = EXPORT_FFMPEG_TOOL_HASH
    return payload


def execute_export_ffmpeg_tool(
    arguments: Dict[str, Any],
    plan_lookup: Optional[Callable[[str], Optional[Dict[str, Any]]]] = None,
) -> Dict[str, Any]:
    args = dict(arguments or {})
    plan_id = str(args.get("plan_id") or "").strip()
    plan_data = args.get("plan")
    out_dir = str(args.get("out_dir") or "./exports/ffmpeg")
    resolution_obj = args.get("resolution") or {}
    fps = int(args.get("fps") or 30)

    if not plan_id and plan_data is None:
        raise ValueError("Invalid args: provide plan_id or plan. Recovery: pass a valid plan object.")

    resolved_plan: Optional[Dict[str, Any] | Any] = None
    if plan_id:
        if callable(plan_lookup):
            resolved_plan = plan_lookup(plan_id)
            if resolved_plan is None and plan_data is None:
                raise ValueError(
                    f"plan_id not found: {plan_id}. Recovery: provide plan payload directly."
                )
        elif plan_data is None:
            raise ValueError(
                "plan_id was provided but server has no plan resolver. Recovery: include plan payload."
            )

    if resolved_plan is None:
        resolved_plan = plan_data

    width = int((resolution_obj or {}).get("w") or 720)
    height = int((resolution_obj or {}).get("h") or 1280)

    result = export_ffmpeg_bundle(
        plan=resolved_plan,
        out_dir=out_dir,
        resolution=(width, height),
        fps=fps,
    )
    warnings = []
    if bool(result.get("warning")):
        warnings.append(str(result.get("warning_reason") or "unknown_warning"))

    files = list(result.get("files") or [])
    bundle_dir = str(result.get("bundle_dir") or "")
    concat_path = str(result.get("concat_list_path") or "")
    if not concat_path and bundle_dir:
        concat_path = f"{bundle_dir.rstrip('/')}/concat_list.txt"
    edit_plan_path = str(result.get("edit_plan_path") or "")
    if not edit_plan_path and bundle_dir:
        edit_plan_path = f"{bundle_dir.rstrip('/')}/edit_plan.json"

    return {
        "plan_id": result.get("plan_id") or plan_id,
        "bundle_dir": bundle_dir,
        "files": files,
        "render_script_path": result.get("render_script_path"),
        "concat_list_path": concat_path,
        "edit_plan_path": edit_plan_path,
        "missing_primary_asset_count": int(result.get("missing_primary_asset_count") or 0),
        "warnings": warnings,
        "tool_version": EXPORT_FFMPEG_TOOL_VERSION,
        "tool_hash": EXPORT_FFMPEG_TOOL_HASH,
        "clip_count": result.get("clip_count"),
        "segment_count": result.get("segment_count"),
        "resolution": result.get("resolution"),
        "fps": result.get("fps"),
        "warning": bool(result.get("warning")),
        "warning_reason": result.get("warning_reason"),
    }
