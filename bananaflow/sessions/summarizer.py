from __future__ import annotations

from typing import Any, Dict, Iterable, Optional


SUMMARY_VERSION = "template_v1"


def _text(value: Any) -> str:
    return str(value or "").strip()


def _short(value: Any, limit: int = 160) -> str:
    raw = _text(value).replace("\n", " ")
    if len(raw) <= limit:
        return raw
    if limit <= 3:
        return raw[:limit]
    return f"{raw[: limit - 3]}..."


def _truncate_summary(text: str, max_chars: int) -> str:
    content = _text(text)
    if max_chars <= 0:
        return ""
    if len(content) <= max_chars:
        return content
    marker = "\n...[truncated]...\n"
    if max_chars <= len(marker) + 20:
        return content[:max_chars]
    keep = max_chars - len(marker)
    head_len = int(keep * 0.8)
    tail_len = keep - head_len
    return f"{content[:head_len]}{marker}{content[-tail_len:]}"


def _iter_dicts(value: Any) -> Iterable[Dict[str, Any]]:
    if isinstance(value, dict):
        yield value
        for item in value.values():
            yield from _iter_dicts(item)
    elif isinstance(value, list):
        for item in value:
            yield from _iter_dicts(item)


def _extract_product(payload: Dict[str, Any]) -> Optional[str]:
    for key in ("product", "current_product"):
        text = _text(payload.get(key))
        if text:
            return text
    return None


def _extract_topic_titles(payload: Dict[str, Any]) -> list[str]:
    titles: list[str] = []
    raw_list = payload.get("topic_titles") or payload.get("titles")
    if isinstance(raw_list, list):
        for item in raw_list:
            text = _text(item)
            if text:
                titles.append(text)
    raw_topics = payload.get("topics")
    if isinstance(raw_topics, list):
        for item in raw_topics:
            if isinstance(item, dict):
                text = _text(item.get("title"))
                if text:
                    titles.append(text)
    out: list[str] = []
    seen = set()
    for title in titles:
        key = title.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(_short(title, limit=48))
        if len(out) >= 6:
            break
    return out


def build_session_summary(events: list[dict], prev_summary: str | None, max_chars: int = 2000) -> str:
    mission: Optional[str] = None
    product: Optional[str] = None
    topic_titles: list[str] = []
    topic_count_hint: Optional[int] = None
    bundle_dir: Optional[str] = None
    edit_plan_exists = False
    export_status: Optional[str] = None
    compliance_risk: Optional[str] = None
    rewrite_applied: Optional[bool] = None
    prompt_version: Optional[str] = None
    policy_version: Optional[str] = None
    config_hash: Optional[str] = None
    selected_assets_overrides_count: Optional[int] = None
    tool_provenance: dict[str, dict[str, str]] = {}

    for evt in list(events or []):
        evt_type = _text((evt or {}).get("type")).upper()
        payload = (evt or {}).get("payload") or {}
        if not isinstance(payload, dict):
            payload = {}

        extracted_product = _extract_product(payload)
        if extracted_product:
            product = extracted_product

        if evt_type == "USER_MESSAGE":
            text = _short(payload.get("text"), limit=180)
            if text:
                mission = text
        elif evt_type == "INTENT_ROUTING":
            if not mission:
                intent = _text(payload.get("intent"))
                reason = _text(payload.get("reason"))
                mission = _short(f"{intent} ({reason})" if reason else intent, limit=180) if intent else mission
            if not product:
                extracted = _extract_product(payload)
                if extracted:
                    product = extracted
        elif evt_type in {"TOOL_CALL", "TOOL_RESULT"}:
            tool_name = _text(payload.get("tool_name"))
            if tool_name:
                provenance = tool_provenance.get(tool_name, {})
                server = _text(payload.get("mcp_server"))
                version = _text(payload.get("tool_version"))
                tool_hash = _text(payload.get("tool_hash"))
                if server:
                    provenance["server"] = server
                if version:
                    provenance["version"] = version
                if tool_hash:
                    provenance["hash"] = _short(tool_hash, limit=16)
                tool_provenance[tool_name] = provenance

            if "export_ffmpeg" in tool_name.lower():
                is_error = bool(payload.get("isError"))
                export_status = "error" if is_error else "ok"
                result_ref = payload.get("result_ref") or {}
                if isinstance(result_ref, dict):
                    bundle = _text(result_ref.get("bundle_dir"))
                    if bundle:
                        bundle_dir = bundle
                    try:
                        topic_hint = result_ref.get("topic_count")
                        if topic_hint is not None:
                            topic_count_hint = int(topic_hint)
                    except Exception:
                        pass
            if evt_type == "TOOL_RESULT":
                result_ref = payload.get("result_ref") or {}
                if isinstance(result_ref, dict):
                    bundle = _text(result_ref.get("bundle_dir"))
                    if bundle:
                        bundle_dir = bundle
                    try:
                        topic_hint = result_ref.get("topic_count")
                        if topic_hint is not None:
                            topic_count_hint = int(topic_hint)
                    except Exception:
                        pass
                    try:
                        edit_plan_count = result_ref.get("edit_plan_count")
                        if edit_plan_count is not None and int(edit_plan_count) > 0:
                            edit_plan_exists = True
                    except Exception:
                        pass

        elif evt_type == "ARTIFACT_CREATED":
            plan_ids = payload.get("edit_plan_ids")
            if isinstance(plan_ids, list) and len(plan_ids) > 0:
                edit_plan_exists = True
            bundle = _text(payload.get("bundle_dir"))
            if bundle:
                bundle_dir = bundle
        elif evt_type == "SESSION_STATE":
            overrides = payload.get("selected_assets_overrides")
            if isinstance(overrides, list):
                selected_assets_overrides_count = len(overrides)
            elif isinstance(overrides, dict):
                selected_assets_overrides_count = len(overrides.keys())

        titles = _extract_topic_titles(payload)
        if titles:
            topic_titles = titles

        for entry in _iter_dicts(payload):
            if not prompt_version:
                prompt_version = _text(entry.get("prompt_version")) or prompt_version
            if not policy_version:
                policy_version = _text(entry.get("policy_version")) or policy_version
            if not config_hash:
                config_hash = _text(entry.get("config_hash")) or config_hash
            if not compliance_risk:
                compliance_risk = _text(entry.get("compliance_risk")) or _text(entry.get("risk_level")) or compliance_risk
            if rewrite_applied is None:
                if "rewrite_applied" in entry:
                    rewrite_applied = bool(entry.get("rewrite_applied"))
                elif "safe_rewrite_applied" in entry:
                    rewrite_applied = bool(entry.get("safe_rewrite_applied"))

    outputs_parts = []
    if topic_titles:
        outputs_parts.append(f"topics={', '.join(topic_titles)}")
    elif topic_count_hint is not None:
        outputs_parts.append(f"topics_count={topic_count_hint}")
    outputs_parts.append(f"edit_plan={'yes' if edit_plan_exists else 'no'}")
    if bundle_dir:
        outputs_parts.append(f"bundle_dir={_short(bundle_dir, limit=64)}")
    if export_status:
        outputs_parts.append(f"export={export_status}")

    risk_parts = []
    if compliance_risk:
        risk_parts.append(f"compliance_risk={compliance_risk}")
    if rewrite_applied is not None:
        risk_parts.append(f"rewrite_applied={'yes' if rewrite_applied else 'no'}")

    tool_parts = []
    for tool_name in sorted(tool_provenance.keys()):
        info = tool_provenance.get(tool_name) or {}
        tags = []
        if info.get("server"):
            tags.append(f"server={info['server']}")
        if info.get("version"):
            tags.append(f"v={info['version']}")
        if info.get("hash"):
            tags.append(f"h={info['hash']}")
        if tags:
            tool_parts.append(f"{tool_name}({', '.join(tags)})")

    context_parts = []
    if prompt_version:
        context_parts.append(f"prompt={prompt_version}")
    if policy_version:
        context_parts.append(f"policy={policy_version}")
    if config_hash:
        context_parts.append(f"cfg={_short(config_hash, limit=16)}")

    lines = [
        f"- Mission: {_short(mission or 'n/a', limit=200)}",
        f"- Current product: {_short(product or 'n/a', limit=80)}",
        f"- Key outputs: {'; '.join(outputs_parts)}",
    ]
    if risk_parts:
        lines.append(f"- Risk status: {'; '.join(risk_parts)}")
    if tool_parts:
        lines.append(f"- Tool provenance: {'; '.join(tool_parts)}")
    if selected_assets_overrides_count is not None:
        lines.append(f"- User overrides: selected_assets_overrides_count={selected_assets_overrides_count}")
    if context_parts:
        lines.append(f"- ContextPack: {'; '.join(context_parts)}")

    delta = "\n".join(["Session Summary", *lines])
    prev = _text(prev_summary)
    if prev:
        merged = f"{prev}\n\nLatest Update\n{delta}"
    else:
        merged = delta
    return _truncate_summary(merged, max_chars=max_chars)
