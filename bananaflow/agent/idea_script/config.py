from __future__ import annotations

import hashlib
import json
import os
from typing import Optional

from pydantic import BaseModel, Field


def _as_bool(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    text = value.strip().lower()
    if text in {"1", "true", "yes", "on"}:
        return True
    if text in {"0", "false", "no", "off"}:
        return False
    return default


def _as_float(value: str | None) -> Optional[float]:
    if value is None or not value.strip():
        return None
    try:
        return float(value.strip())
    except Exception:
        return None


def _as_int(value: str | None) -> Optional[int]:
    if value is None or not value.strip():
        return None
    try:
        return int(value.strip())
    except Exception:
        return None


class NodeRuntimeConfig(BaseModel):
    model: Optional[str] = None
    temperature: Optional[float] = None
    top_p: Optional[float] = None
    max_tokens: Optional[int] = None
    timeout_sec: Optional[int] = None

    @classmethod
    def from_env(cls, node_name: str) -> "NodeRuntimeConfig":
        key = node_name.upper()
        return cls(
            model=(os.getenv(f"IDEA_SCRIPT_{key}_MODEL") or "").strip() or None,
            temperature=_as_float(os.getenv(f"IDEA_SCRIPT_{key}_TEMPERATURE")),
            top_p=_as_float(os.getenv(f"IDEA_SCRIPT_{key}_TOP_P")),
            max_tokens=_as_int(os.getenv(f"IDEA_SCRIPT_{key}_MAX_TOKENS")),
            timeout_sec=_as_int(os.getenv(f"IDEA_SCRIPT_{key}_TIMEOUT_SEC")),
        )


class IdeaScriptAgentConfig(BaseModel):
    inference: NodeRuntimeConfig = Field(default_factory=NodeRuntimeConfig)
    generation: NodeRuntimeConfig = Field(default_factory=NodeRuntimeConfig)
    review: NodeRuntimeConfig = Field(default_factory=NodeRuntimeConfig)
    risk_scan: NodeRuntimeConfig = Field(default_factory=NodeRuntimeConfig)
    safe_rewrite: NodeRuntimeConfig = Field(default_factory=NodeRuntimeConfig)
    score: NodeRuntimeConfig = Field(default_factory=NodeRuntimeConfig)
    storyboard_generate: NodeRuntimeConfig = Field(default_factory=NodeRuntimeConfig)
    storyboard_review: NodeRuntimeConfig = Field(default_factory=NodeRuntimeConfig)
    scoring_enabled: bool = False
    storyboard_enabled: bool = True
    asset_match_enabled: bool = True
    edit_plan_enabled: bool = True
    cache_enabled: bool = False
    cache_max_size: int = Field(default=64, ge=1)
    max_total_llm_calls: int = Field(default=20, ge=0)
    asset_db_path: str = "./data/assets.db"
    asset_match_top_k: int = Field(default=3, ge=1, le=20)
    tag_normalize_enabled: bool = True
    asset_match_use_mcp: bool = False
    mcp_use_registry: bool = False
    use_session_summary_in_context: bool = False
    use_user_preferences_in_context: bool = False
    context_max_recent_turns: int = Field(default=6, ge=1, le=20)
    context_max_summary_chars: int = Field(default=1500, ge=200, le=4000)
    context_max_turn_chars: int = Field(default=6000, ge=400, le=20000)
    context_max_pref_items: int = Field(default=10, ge=1, le=50)
    context_max_pref_chars: int = Field(default=1200, ge=200, le=8000)
    trajectory_eval_enabled: bool = False

    @classmethod
    def from_env(cls) -> "IdeaScriptAgentConfig":
        cache_max_size_env = _as_int(os.getenv("IDEA_SCRIPT_CACHE_MAX_SIZE"))
        max_total_llm_calls_env = _as_int(os.getenv("IDEA_SCRIPT_MAX_TOTAL_LLM_CALLS"))
        asset_match_top_k_env = _as_int(os.getenv("IDEA_SCRIPT_ASSET_MATCH_TOP_K"))
        context_max_recent_turns_env = _as_int(os.getenv("BANANAFLOW_CONTEXT_MAX_RECENT_TURNS"))
        context_max_summary_chars_env = _as_int(os.getenv("BANANAFLOW_CONTEXT_MAX_SUMMARY_CHARS"))
        context_max_turn_chars_env = _as_int(os.getenv("BANANAFLOW_CONTEXT_MAX_TURN_CHARS"))
        context_max_pref_items_env = _as_int(os.getenv("BANANAFLOW_MAX_PREF_ITEMS"))
        context_max_pref_chars_env = _as_int(os.getenv("BANANAFLOW_MAX_PREF_CHARS"))
        return cls(
            inference=NodeRuntimeConfig.from_env("inference"),
            generation=NodeRuntimeConfig.from_env("generation"),
            review=NodeRuntimeConfig.from_env("review"),
            risk_scan=NodeRuntimeConfig.from_env("risk_scan"),
            safe_rewrite=NodeRuntimeConfig.from_env("safe_rewrite"),
            score=NodeRuntimeConfig.from_env("score"),
            storyboard_generate=NodeRuntimeConfig.from_env("storyboard_generate"),
            storyboard_review=NodeRuntimeConfig.from_env("storyboard_review"),
            scoring_enabled=_as_bool(os.getenv("IDEA_SCRIPT_SCORING_ENABLED"), default=False),
            storyboard_enabled=_as_bool(os.getenv("IDEA_SCRIPT_STORYBOARD_ENABLED"), default=True),
            asset_match_enabled=_as_bool(os.getenv("IDEA_SCRIPT_ASSET_MATCH_ENABLED"), default=True),
            edit_plan_enabled=_as_bool(os.getenv("IDEA_SCRIPT_EDIT_PLAN_ENABLED"), default=True),
            cache_enabled=_as_bool(os.getenv("IDEA_SCRIPT_CACHE_ENABLED"), default=False),
            cache_max_size=(64 if cache_max_size_env is None else cache_max_size_env),
            max_total_llm_calls=(20 if max_total_llm_calls_env is None else max_total_llm_calls_env),
            asset_db_path=(os.getenv("BANANAFLOW_ASSET_DB_PATH", "./data/assets.db").strip() or "./data/assets.db"),
            asset_match_top_k=(3 if asset_match_top_k_env is None else asset_match_top_k_env),
            tag_normalize_enabled=_as_bool(os.getenv("IDEA_SCRIPT_TAG_NORMALIZE_ENABLED"), default=True),
            asset_match_use_mcp=_as_bool(os.getenv("IDEA_SCRIPT_ASSET_MATCH_USE_MCP"), default=False),
            mcp_use_registry=_as_bool(os.getenv("BANANAFLOW_MCP_USE_REGISTRY"), default=False),
            use_session_summary_in_context=_as_bool(
                os.getenv("BANANAFLOW_USE_SESSION_SUMMARY_IN_CONTEXT"),
                default=False,
            ),
            use_user_preferences_in_context=_as_bool(
                os.getenv("BANANAFLOW_USE_USER_PREFERENCES_IN_CONTEXT"),
                default=False,
            ),
            context_max_recent_turns=(6 if context_max_recent_turns_env is None else context_max_recent_turns_env),
            context_max_summary_chars=(1500 if context_max_summary_chars_env is None else context_max_summary_chars_env),
            context_max_turn_chars=(6000 if context_max_turn_chars_env is None else context_max_turn_chars_env),
            context_max_pref_items=(10 if context_max_pref_items_env is None else context_max_pref_items_env),
            context_max_pref_chars=(1200 if context_max_pref_chars_env is None else context_max_pref_chars_env),
            trajectory_eval_enabled=_as_bool(
                os.getenv("BANANAFLOW_ENABLE_TRAJECTORY_EVAL"),
                default=False,
            ),
        )

    def stable_config_hash(self) -> str:
        payload = self.model_dump(mode="json")
        serialized = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(serialized.encode("utf-8")).hexdigest()
