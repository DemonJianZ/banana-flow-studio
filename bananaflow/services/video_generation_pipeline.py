from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import time
from dataclasses import asdict, dataclass
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

from core.logging import sys_logger

try:
    from ..agent.idea_script.schemas import IdeaScriptResponse
    from .comfyui import run_image_z_image_turbo_workflow, run_video_wan_i2v_workflow
except Exception:  # pragma: no cover
    from agent.idea_script.schemas import IdeaScriptResponse
    from services.comfyui import run_image_z_image_turbo_workflow, run_video_wan_i2v_workflow


_DEFAULT_I2V_NEGATIVE_PROMPT = (
    "色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，"
    "JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，"
    "手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走"
)


@dataclass
class ShotVideoArtifact:
    shot_id: str
    segment: str
    image_path: str = ""
    clip_path: str = ""
    status: str = "pending"
    error: str = ""


def _safe_stem(value: str, fallback: str) -> str:
    text = str(value or "").strip()
    if not text:
        return fallback
    chars = []
    for ch in text:
        if ch.isalnum() or ch in {"-", "_"}:
            chars.append(ch)
        else:
            chars.append("_")
    cleaned = "".join(chars).strip("_")
    return cleaned or fallback


def _build_image_prompt(product: str, angle: str, shot: Any) -> str:
    return (
        f"Product: {product}. Angle: {angle}. Segment: {getattr(shot, 'segment', '')}. "
        f"Scene: {getattr(shot, 'scene', '')}. Action: {getattr(shot, 'action', '')}. "
        f"Camera: {getattr(shot, 'camera', '')}. Cinematic, high quality, single coherent frame."
    )


def _build_video_prompt(image_prompt: str, shot: Any, motion_hint: str) -> str:
    hint = (motion_hint or "").strip()
    return (
        f"{image_prompt} Animate subtle character motion and natural camera movement. "
        f"Keep identity and composition stable. Shot action: {getattr(shot, 'action', '')}. "
        f"Camera style: {getattr(shot, 'camera', '')}. {hint}"
    ).strip()


def _run_ffmpeg(cmd: Sequence[str], stage: str) -> None:
    try:
        proc = subprocess.run(list(cmd), capture_output=True, text=True, check=False)
    except FileNotFoundError:
        raise RuntimeError("ffmpeg is not installed on server")
    except Exception as e:  # pragma: no cover
        raise RuntimeError(f"ffmpeg failed to start at {stage}: {e}")
    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "").strip()
        if len(err) > 500:
            err = err[:500] + "..."
        raise RuntimeError(f"ffmpeg failed at {stage}: {err}")


def stitch_video_clips_ffmpeg(
    *,
    clip_paths: Sequence[str],
    output_video_path: str,
    resolution: Tuple[int, int] = (720, 1280),
    fps: int = 24,
    bgm_path: Optional[str] = None,
) -> str:
    clips = [str(p) for p in list(clip_paths or []) if str(p or "").strip()]
    if not clips:
        raise RuntimeError("No clips to stitch")

    width = max(64, int(resolution[0] or 720))
    height = max(64, int(resolution[1] or 1280))
    out_fps = max(1, int(fps or 24))
    output_video_path = os.path.abspath(str(output_video_path))
    os.makedirs(os.path.dirname(output_video_path), exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="bananaflow-stitch-") as temp_dir:
        normalized_paths: List[str] = []
        for idx, src in enumerate(clips):
            normalized = os.path.join(temp_dir, f"clip_{idx:04d}.mp4")
            vf = (
                f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
                f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,format=yuv420p"
            )
            _run_ffmpeg(
                [
                    "ffmpeg",
                    "-y",
                    "-i",
                    src,
                    "-vf",
                    vf,
                    "-r",
                    str(out_fps),
                    "-c:v",
                    "libx264",
                    "-preset",
                    "veryfast",
                    "-crf",
                    "20",
                    "-pix_fmt",
                    "yuv420p",
                    "-an",
                    normalized,
                ],
                stage=f"normalize_clip_{idx}",
            )
            normalized_paths.append(normalized)

        concat_list = os.path.join(temp_dir, "concat_list.txt")
        with open(concat_list, "w", encoding="utf-8") as f:
            for path in normalized_paths:
                escaped = path.replace("'", "'\\''")
                f.write(f"file '{escaped}'\n")

        stitched_path = os.path.join(temp_dir, "stitched.mp4")
        _run_ffmpeg(
            [
                "ffmpeg",
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                concat_list,
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-crf",
                "20",
                "-pix_fmt",
                "yuv420p",
                stitched_path,
            ],
            stage="concat",
        )

        if bgm_path and os.path.exists(bgm_path):
            _run_ffmpeg(
                [
                    "ffmpeg",
                    "-y",
                    "-i",
                    stitched_path,
                    "-stream_loop",
                    "-1",
                    "-i",
                    bgm_path,
                    "-shortest",
                    "-c:v",
                    "copy",
                    "-c:a",
                    "aac",
                    "-b:a",
                    "192k",
                    output_video_path,
                ],
                stage="mux_audio",
            )
        else:
            shutil.copyfile(stitched_path, output_video_path)

    return output_video_path


def _call_with_retry(
    *,
    label: str,
    retries_per_step: int,
    fn: Callable[[], Any],
) -> Any:
    retries = max(0, int(retries_per_step or 0))
    last_error: Optional[Exception] = None
    for attempt in range(retries + 1):
        try:
            return fn()
        except Exception as e:
            last_error = e
            if attempt >= retries:
                break
            sys_logger.warning(f"{label} failed on attempt {attempt + 1}, retrying: {e}")
            time.sleep(0.5)
    raise RuntimeError(f"{label} failed after {retries + 1} attempts: {last_error}")


def render_storyboard_to_video(
    *,
    req_id: str,
    idea_script_output: IdeaScriptResponse,
    out_dir: str,
    resolution: Tuple[int, int] = (720, 1280),
    fps: int = 24,
    image_size: Tuple[int, int] = (1024, 1024),
    clip_length: int = 81,
    retries_per_step: int = 1,
    max_shots: int = 0,
    motion_hint: str = "",
    bgm_path: Optional[str] = None,
    image_generator: Callable[..., bytes] = run_image_z_image_turbo_workflow,
    clip_generator: Callable[..., Tuple[bytes, str]] = run_video_wan_i2v_workflow,
    stitcher: Callable[..., str] = stitch_video_clips_ffmpeg,
) -> Dict[str, Any]:
    root_dir = os.path.abspath(str(out_dir or "./exports/video_generation").strip())
    images_dir = os.path.join(root_dir, "images")
    clips_dir = os.path.join(root_dir, "clips")
    os.makedirs(images_dir, exist_ok=True)
    os.makedirs(clips_dir, exist_ok=True)

    artifacts: List[ShotVideoArtifact] = []
    successful_clips: List[str] = []
    shots_total = 0

    product = str(getattr(getattr(idea_script_output, "audience_context", None), "product", "") or "")
    for topic in list(getattr(idea_script_output, "topics", []) or []):
        angle = str(getattr(topic, "angle", "") or "")
        for shot in list(getattr(topic, "shots", []) or []):
            shots_total += 1
            if max_shots > 0 and shots_total > int(max_shots):
                break

            shot_id = str(getattr(shot, "shot_id", "") or f"shot_{shots_total}")
            stem = _safe_stem(shot_id, f"shot_{shots_total:03d}")
            artifact = ShotVideoArtifact(
                shot_id=shot_id,
                segment=str(getattr(shot, "segment", "") or ""),
                status="running",
            )
            artifacts.append(artifact)

            try:
                image_prompt = _build_image_prompt(product, angle, shot)
                image_bytes = _call_with_retry(
                    label=f"image_generation:{shot_id}",
                    retries_per_step=retries_per_step,
                    fn=lambda: image_generator(
                        req_id=req_id,
                        prompt=image_prompt,
                        width=int(image_size[0] or 1024),
                        height=int(image_size[1] or 1024),
                        filename_prefix=f"video_pipeline/{req_id}/img_{stem}",
                    ),
                )
                image_path = os.path.join(images_dir, f"{stem}.png")
                with open(image_path, "wb") as f:
                    f.write(image_bytes)
                artifact.image_path = image_path

                video_prompt = _build_video_prompt(image_prompt, shot, motion_hint=motion_hint)
                video_bytes, _video_mime = _call_with_retry(
                    label=f"video_generation:{shot_id}",
                    retries_per_step=retries_per_step,
                    fn=lambda: clip_generator(
                        req_id=req_id,
                        image_bytes=image_bytes,
                        positive_prompt=video_prompt,
                        negative_prompt=_DEFAULT_I2V_NEGATIVE_PROMPT,
                        width=int(image_size[0] or 1024),
                        height=int(image_size[1] or 1024),
                        length=max(1, int(clip_length or 81)),
                        fps=max(1, int(fps or 24)),
                        filename_prefix=f"video_pipeline/{req_id}/clip_{stem}",
                    ),
                )
                clip_path = os.path.join(clips_dir, f"{stem}.mp4")
                with open(clip_path, "wb") as f:
                    f.write(video_bytes)
                artifact.clip_path = clip_path
                artifact.status = "success"
                successful_clips.append(clip_path)
            except Exception as e:
                artifact.status = "error"
                artifact.error = str(e)
                sys_logger.warning(f"[{req_id}] shot render failed: shot_id={shot_id} err={e}")

        if max_shots > 0 and shots_total >= int(max_shots):
            break

    final_video_path = ""
    final_error = ""
    if successful_clips:
        try:
            final_video_path = stitcher(
                clip_paths=successful_clips,
                output_video_path=os.path.join(root_dir, "output_video.mp4"),
                resolution=resolution,
                fps=fps,
                bgm_path=bgm_path,
            )
        except Exception as e:
            final_error = str(e)
    else:
        final_error = "No successful shot clips generated"

    success_count = sum(1 for item in artifacts if item.status == "success")
    fail_count = sum(1 for item in artifacts if item.status == "error")
    return {
        "output_dir": root_dir,
        "output_video": final_video_path or None,
        "error": (final_error or None),
        "shots_total": shots_total,
        "shots_succeeded": success_count,
        "shots_failed": fail_count,
        "artifacts": [asdict(item) for item in artifacts],
    }


def run_e2e_video_workflow(
    *,
    req_id: str,
    product: str,
    out_dir: str,
    enable_video_generation: bool,
    run_idea_script_fn: Callable[[str], IdeaScriptResponse],
    resolution: Tuple[int, int] = (720, 1280),
    fps: int = 24,
    image_size: Tuple[int, int] = (1024, 1024),
    clip_length: int = 81,
    retries_per_step: int = 1,
    max_shots: int = 0,
    motion_hint: str = "",
    bgm_path: Optional[str] = None,
    image_generator: Callable[..., bytes] = run_image_z_image_turbo_workflow,
    clip_generator: Callable[..., Tuple[bytes, str]] = run_video_wan_i2v_workflow,
    stitcher: Callable[..., str] = stitch_video_clips_ffmpeg,
) -> Dict[str, Any]:
    idea_script_output = run_idea_script_fn(str(product or "").strip())
    shots_total = sum(
        len(list(getattr(topic, "shots", []) or []))
        for topic in list(getattr(idea_script_output, "topics", []) or [])
    )

    if not enable_video_generation:
        return {
            "video_generation_enabled": False,
            "fallback_mode": "idea_script_only",
            "idea_script": idea_script_output,
            "output_dir": "",
            "output_video": None,
            "error": None,
            "shots_total": shots_total,
            "shots_succeeded": 0,
            "shots_failed": 0,
            "artifacts": [],
        }

    render_result = render_storyboard_to_video(
        req_id=req_id,
        idea_script_output=idea_script_output,
        out_dir=out_dir,
        resolution=resolution,
        fps=fps,
        image_size=image_size,
        clip_length=clip_length,
        retries_per_step=retries_per_step,
        max_shots=max_shots,
        motion_hint=motion_hint,
        bgm_path=bgm_path,
        image_generator=image_generator,
        clip_generator=clip_generator,
        stitcher=stitcher,
    )
    return {
        "video_generation_enabled": True,
        "fallback_mode": "video_generation",
        "idea_script": idea_script_output,
        **render_result,
    }
