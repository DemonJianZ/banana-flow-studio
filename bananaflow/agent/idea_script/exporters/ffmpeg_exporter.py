from __future__ import annotations

import json
import os
import shlex
from contextlib import contextmanager, nullcontext
from typing import Any, Dict, Iterator, Tuple

from ..schemas import EditPlan

try:
    from opentelemetry import trace as _otel_trace  # type: ignore
except Exception:  # pragma: no cover
    _otel_trace = None


class _NoopSpan:
    def set_attribute(self, *args: Any, **kwargs: Any) -> None:
        return None


_TRACER = _otel_trace.get_tracer(__name__) if _otel_trace else None


@contextmanager
def _span(name: str, attributes: Dict[str, Any] | None = None) -> Iterator[Any]:
    if _TRACER is None:
        with nullcontext():
            yield _NoopSpan()
        return
    with _TRACER.start_as_current_span(name) as span:
        for key, value in dict(attributes or {}).items():
            try:
                if value is not None:
                    span.set_attribute(key, value)
            except Exception:
                continue
        yield span


def export_ffmpeg_bundle(
    plan: EditPlan | Dict[str, Any],
    out_dir: str,
    resolution: Tuple[int, int] = (720, 1280),
    fps: int = 30,
) -> Dict[str, Any]:
    plan_obj = plan if isinstance(plan, EditPlan) else EditPlan(**plan)
    width = int(resolution[0] if resolution else 720)
    height = int(resolution[1] if resolution else 1280)
    fps_value = int(fps or 30)
    bundle_dir = os.path.abspath(os.path.join(str(out_dir or "./exports/ffmpeg"), plan_obj.plan_id))
    os.makedirs(bundle_dir, exist_ok=True)

    clips = list(((plan_obj.tracks or [None])[0].clips if (plan_obj.tracks and plan_obj.tracks[0]) else []) or [])
    missing_primary_asset_count = sum(1 for clip in clips if getattr(clip, "primary_asset", None) is None)

    with _span(
        "idea_script.export_ffmpeg",
        {
            "plan_id": plan_obj.plan_id,
            "clip_count": len(clips),
            "missing_primary_asset_count": missing_primary_asset_count,
            "out_dir": bundle_dir,
            "resolution": f"{width}x{height}",
            "fps": fps_value,
        },
    ):
        plan_path = os.path.join(bundle_dir, "edit_plan.json")
        concat_path = os.path.join(bundle_dir, "concat_list.txt")
        render_path = os.path.join(bundle_dir, "render.sh")

        with open(plan_path, "w", encoding="utf-8") as f:
            json.dump(plan_obj.model_dump(mode="json"), f, ensure_ascii=False, indent=2)

        scale_filter = (
            f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
            f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black,fps={fps_value}"
        )
        segment_files: list[str] = []
        script_lines = [
            "#!/usr/bin/env bash",
            "set -euo pipefail",
            'SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"',
            'cd "$SCRIPT_DIR"',
            "",
        ]
        for idx, clip in enumerate(clips, start=1):
            segment_name = f"seg_{idx:03d}.mp4"
            primary = getattr(clip, "primary_asset", None)
            duration = max(0.1, float(getattr(clip, "duration_sec", 0.0) or 0.0))
            shot_id = str(getattr(clip, "shot_id", "") or f"shot_{idx}")
            if primary is None:
                script_lines.append(f"# clip {idx} ({shot_id}) missing primary_asset, skipped")
                continue
            uri = str(getattr(primary, "uri", "") or "").strip()
            if not uri:
                script_lines.append(f"# clip {idx} ({shot_id}) primary_asset.uri empty, skipped")
                continue
            cmd = (
                "ffmpeg -y "
                f"-ss 0 -t {duration:.3f} "
                f"-i {shlex.quote(uri)} "
                f"-vf {shlex.quote(scale_filter)} "
                f"-r {fps_value} -c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p -an "
                f"{shlex.quote(segment_name)}"
            )
            script_lines.append(cmd)
            segment_files.append(segment_name)

        with open(concat_path, "w", encoding="utf-8") as f:
            for seg in segment_files:
                f.write(f"file '{seg}'\n")

        script_lines.extend(
            [
                "",
                f'if [ ! -s "{os.path.basename(concat_path)}" ]; then',
                '  echo "No valid segments to concat."',
                "  exit 1",
                "fi",
                "",
                "# concat 优先 copy；失败时 fallback 重新编码",
                "if ffmpeg -y -f concat -safe 0 -i concat_list.txt -c copy output.mp4; then",
                '  echo "concat copy success: output.mp4"',
                "else",
                "  ffmpeg -y -f concat -safe 0 -i concat_list.txt "
                f"-c:v libx264 -preset veryfast -crf 23 -r {fps_value} -pix_fmt yuv420p -an output.mp4",
                "fi",
                "",
                'echo "done: output.mp4"',
            ]
        )

        with open(render_path, "w", encoding="utf-8") as f:
            f.write("\n".join(script_lines) + "\n")
        try:
            os.chmod(render_path, 0o755)
        except Exception:
            pass

    warning = missing_primary_asset_count > 0
    warning_reason = "missing_primary_asset" if warning else None
    return {
        "plan_id": plan_obj.plan_id,
        "bundle_dir": bundle_dir,
        "render_script_path": render_path,
        "files": [plan_path, concat_path, render_path],
        "clip_count": len(clips),
        "segment_count": len(segment_files),
        "missing_primary_asset_count": missing_primary_asset_count,
        "warning": warning,
        "warning_reason": warning_reason,
        "resolution": [width, height],
        "fps": fps_value,
    }
