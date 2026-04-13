from __future__ import annotations

from functools import lru_cache
import os
from pathlib import Path
from typing import Optional

try:
    from ..core.logging import sys_logger
except Exception:  # pragma: no cover - compatible with direct python bananaflow/main.py runs
    try:
        from core.logging import sys_logger
    except Exception:  # pragma: no cover - test environments may not install runtime deps
        class _FallbackLogger:
            def info(self, *args, **kwargs):
                return None

            def warning(self, *args, **kwargs):
                return None

        sys_logger = _FallbackLogger()


_DEFAULT_SKILL_MAX_CHARS = 12000
_PRIMARY_SKILL_FILES = ("SKILL.md", "skill.md", "README.md", "readme.md")
_DEFAULT_SCOPE_SKILL_NAMES = {
    "IDEA_SCRIPT": ("china-growth-ops-skill", "china-growth-ops"),
    "PROMPT_POLISH": ("china-growth-ops-skill", "china-growth-ops"),
    "STORYBOARD": ("storyboard-storytelling-pipeline",),
    "DRAMA": ("drama-creator",),
}
_SCOPE_REFERENCE_FILES = {
    "IDEA_SCRIPT": (
        "references/platforms.md",
        "references/verticals.md",
        "references/templates.md",
        "references/example-run.md",
    ),
    "PROMPT_POLISH": (
        "references/platforms.md",
        "references/templates.md",
    ),
    "STORYBOARD": (
        "references/floobynooby-core.md",
        "references/workflow.md",
        "references/templates.md",
    ),
}


def _normalize_scope(scope: str) -> str:
    return "".join(ch if ch.isalnum() else "_" for ch in str(scope or "").strip().upper()).strip("_")


def _candidate_paths(path_text: str) -> list[Path]:
    base = Path(os.path.expanduser(path_text)).resolve()
    if base.is_file():
        return [base]
    if not base.is_dir():
        return []

    candidates: list[Path] = []
    for name in _PRIMARY_SKILL_FILES:
        target = base / name
        if target.is_file():
            candidates.append(target)
    if candidates:
        return candidates

    for target in sorted(base.glob("*.md"))[:3]:
        if target.is_file():
            candidates.append(target)
    return candidates


def _read_skill_text_from_path(path_text: str, max_chars: int) -> str:
    for target in _candidate_paths(path_text):
        try:
            text = target.read_text(encoding="utf-8").strip()
        except Exception as e:
            sys_logger.warning(f"[runtime_skill] failed to read skill file: path={target} err={e}")
            continue
        if not text:
            continue
        if len(text) > max_chars:
            return text[:max_chars].rstrip() + "\n...[truncated]"
        return text
    return ""


def _read_text_file(target: Path, max_chars: int) -> str:
    try:
        text = target.read_text(encoding="utf-8").strip()
    except Exception as e:
        sys_logger.warning(f"[runtime_skill] failed to read skill file: path={target} err={e}")
        return ""
    if not text:
        return ""
    if len(text) > max_chars:
        return text[:max_chars].rstrip() + "\n...[truncated]"
    return text


def _read_skill_bundle_from_dir(skill_dir: Path, scope_key: str, max_chars: int) -> str:
    sections: list[str] = []
    remaining = max_chars

    primary_files = _candidate_paths(str(skill_dir))
    if not primary_files:
        return ""

    primary_text = _read_text_file(primary_files[0], remaining)
    if not primary_text:
        return ""
    sections.append(primary_text)
    remaining -= len(primary_text)

    for rel_path in _SCOPE_REFERENCE_FILES.get(scope_key, ()):
        if remaining <= 120:
            break
        target = skill_dir / rel_path
        if not target.is_file():
            continue
        text = _read_text_file(target, remaining - 80)
        if not text:
            continue
        sections.append(f"\n\n[Reference: {rel_path}]\n{text}")
        remaining = max_chars - sum(len(item) for item in sections)

    combined = "".join(sections).strip()
    if len(combined) > max_chars:
        return combined[:max_chars].rstrip() + "\n...[truncated]"
    return combined


def _project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _local_skill_roots() -> list[Path]:
    root = _project_root()
    return [
        root / "skills" / ".agents" / "skills",
        root / "skills",
    ]


def _discover_local_skill_path(scope_key: str) -> Optional[Path]:
    name_env_keys = []
    if scope_key:
        name_env_keys.extend(
            [
                f"BANANAFLOW_{scope_key}_SKILL_NAME",
            ]
        )
    name_env_keys.extend(["BANANAFLOW_RUNTIME_SKILL_NAME"])

    preferred_names: list[str] = []
    for key in name_env_keys:
        value = str(os.getenv(key) or "").strip()
        if value:
            preferred_names.append(value)
    preferred_names.extend(_DEFAULT_SCOPE_SKILL_NAMES.get(scope_key, ()))

    for root in _local_skill_roots():
        if not root.is_dir():
            continue
        for name in preferred_names:
            candidate = root / name
            if candidate.is_dir():
                return candidate

    for root in _local_skill_roots():
        if not root.is_dir():
            continue
        for child in sorted(root.iterdir()):
            if child.is_dir() and _candidate_paths(str(child)):
                return child
    return None


@lru_cache(maxsize=16)
def get_runtime_skill_text(scope: str) -> str:
    scope_key = _normalize_scope(scope)
    max_chars = max(1000, int(os.getenv("BANANAFLOW_RUNTIME_SKILL_MAX_CHARS") or _DEFAULT_SKILL_MAX_CHARS))

    text_env_keys = []
    path_env_keys = []
    if scope_key:
        text_env_keys.extend(
            [
                f"BANANAFLOW_{scope_key}_SKILL_TEXT",
                f"BANANAFLOW_{scope_key}_SKILL",
            ]
        )
        path_env_keys.extend(
            [
                f"BANANAFLOW_{scope_key}_SKILL_FILE",
                f"BANANAFLOW_{scope_key}_SKILL_PATH",
                f"BANANAFLOW_{scope_key}_SKILL_DIR",
            ]
        )
    text_env_keys.extend(["BANANAFLOW_RUNTIME_SKILL_TEXT", "BANANAFLOW_RUNTIME_SKILL"])
    path_env_keys.extend(["BANANAFLOW_RUNTIME_SKILL_FILE", "BANANAFLOW_RUNTIME_SKILL_PATH", "BANANAFLOW_RUNTIME_SKILL_DIR"])

    for key in text_env_keys:
        value = str(os.getenv(key) or "").strip()
        if not value:
            continue
        return value[:max_chars].rstrip() + ("\n...[truncated]" if len(value) > max_chars else "")

    for key in path_env_keys:
        value = str(os.getenv(key) or "").strip()
        if not value:
            continue
        expanded = Path(os.path.expanduser(value)).resolve()
        if expanded.is_dir():
            text = _read_skill_bundle_from_dir(expanded, scope_key=scope_key, max_chars=max_chars)
        else:
            text = _read_skill_text_from_path(value, max_chars=max_chars)
        if text:
            return text

    local_skill_path = _discover_local_skill_path(scope_key)
    if local_skill_path is not None:
        text = _read_skill_bundle_from_dir(local_skill_path, scope_key=scope_key, max_chars=max_chars)
        if text:
            return text

    return ""


def build_runtime_skill_block(scope: str, *, language: str = "zh") -> str:
    skill_text = get_runtime_skill_text(scope)
    if not skill_text:
        return ""

    lang = str(language or "zh").strip().lower()
    if lang.startswith("en"):
        return (
            "External skill instructions:\n"
            "Follow the skill when relevant, but do not violate the explicit schema, safety rules, or output format.\n"
            f"{skill_text}"
        )
    return (
        "外部技能约束：\n"
        "在相关时遵循以下技能内容，但不要违反明确的输出格式、安全规则和结构要求。\n"
        f"{skill_text}"
    )


def clear_runtime_skill_cache() -> None:
    get_runtime_skill_text.cache_clear()
