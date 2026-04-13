from __future__ import annotations

import re
from typing import Any, Dict, List


_DEFAULT_KPIS = ["浏览量", "点击率", "收藏/保存", "咨询数", "加购", "下单", "退款信号"]


def _clean_text(value: Any) -> str:
    return str(value or "").strip()


def _as_list(value: Any) -> List[Any]:
    if isinstance(value, list):
        return value
    return []


def _as_dict(value: Any) -> Dict[str, Any]:
    if isinstance(value, dict):
        return dict(value)
    return {}


def _dig(data: Any, *path: str) -> Any:
    current = data
    for key in path:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def pick_selected_topic(req_payload: Dict[str, Any], topics: List[Dict[str, Any]]) -> Dict[str, Any]:
    preferred_angle = _clean_text(req_payload.get("selected_angle"))
    if preferred_angle:
        for topic in topics:
            if _clean_text(topic.get("angle")) == preferred_angle:
                return topic
    return topics[0] if topics else {}


def parse_script_sections(script_text: str) -> Dict[str, str]:
    text = _clean_text(script_text)
    if not text:
        return {}
    sections: Dict[str, str] = {}
    pattern = re.compile(r"\[(HOOK|VIEW|STEPS|PRODUCT|CTA)\]\s*([\s\S]*?)(?=\[(?:HOOK|VIEW|STEPS|PRODUCT|CTA)\]|$)")
    for segment, content in pattern.findall(text):
        sections[str(segment)] = _clean_text(content)
    return sections


def _platform_plan(platform: str, conversion_goal: str = "", cta_hint: str = "") -> Dict[str, str]:
    return {
        "platform": platform,
        "goal": conversion_goal,
        "format": "",
        "cta": cta_hint or conversion_goal,
    }


def _split_sentences(value: str) -> List[str]:
    text = _clean_text(value)
    if not text:
        return []
    parts = [item.strip(" ，,。；;") for item in re.split(r"[。\n；;]", text) if item.strip(" ，,。；;")]
    return [item for item in parts if item]


def _product_title(product: str, selected_topic: Dict[str, Any]) -> str:
    title = _clean_text(selected_topic.get("title"))
    if not product:
        return title
    if not title:
        return f"{product} 真实使用场景解析"
    return f"{product} | {title}"


def _product_highlights(sections: Dict[str, str]) -> List[str]:
    highlights = _split_sentences(sections.get("PRODUCT") or "") + _split_sentences(sections.get("STEPS") or "")
    deduped: List[str] = []
    seen = set()
    for item in highlights:
        if item in seen:
            continue
        seen.add(item)
        deduped.append(item)
        if len(deduped) >= 4:
            break
    return deduped


def build_structured_result(
    req_payload: Dict[str, Any],
    topics: List[Dict[str, Any]],
    raw_skill_payload: Dict[str, Any] | None = None,
    inference_payload: Dict[str, Any] | None = None,
    risk_level: str = "low",
    blocking_issues: List[str] | None = None,
    risky_spans: List[Dict[str, Any]] | None = None,
) -> Dict[str, Any]:
    raw = dict(raw_skill_payload or {})
    inferred = dict(inference_payload or {})
    product = _clean_text(req_payload.get("product"))
    audience = _clean_text(req_payload.get("audience"))
    conversion_goal = _clean_text(req_payload.get("conversion_goal"))
    primary_platform = _clean_text(req_payload.get("primary_platform"))
    secondary_platform = _clean_text(req_payload.get("secondary_platform"))
    selected_topic = pick_selected_topic(req_payload, topics)
    sections = parse_script_sections(_clean_text(selected_topic.get("script_60s")))
    selected_angle = (
        _clean_text(raw.get("selected_angle"))
        or _clean_text(_dig(raw, "offer_decision", "selected_angle"))
        or _clean_text(selected_topic.get("angle"))
    )
    selected_title = (
        _clean_text(_dig(raw, "copy_pack", "title"))
        or _clean_text(raw.get("selected_topic_title"))
        or _clean_text(selected_topic.get("title"))
    )
    selected_hook = (
        _clean_text(_dig(raw, "copy_pack", "hook"))
        or _clean_text(selected_topic.get("hook"))
        or _clean_text(sections.get("HOOK"))
    )

    raw_platform_plan = _as_dict(raw.get("platform_plan"))
    if not raw_platform_plan:
        primary_cta = _clean_text(sections.get("CTA")) or conversion_goal
        primary_plan = _platform_plan(primary_platform, conversion_goal, cta_hint=primary_cta) if primary_platform else {}
        secondary_plan = _platform_plan(secondary_platform, conversion_goal, cta_hint=primary_cta) if secondary_platform else {}
        raw_platform_plan = {
            "primary": primary_plan,
            "secondary": secondary_plan,
            "selected_angle_label": selected_angle,
        }

    raw_copy_pack = _as_dict(raw.get("copy_pack"))
    if not raw_copy_pack:
        raw_copy_pack = {
            "title": selected_title,
            "hook": selected_hook,
            "caption": _clean_text(sections.get("VIEW")),
            "short_video_hook": selected_hook,
            "product_title": _product_title(product, selected_topic),
            "product_highlights": _product_highlights(sections),
            "faq": [],
            "chat_reply_templates": [],
        }

    raw_browser_fields = _as_dict(raw.get("browser_ready_fields"))
    if not raw_browser_fields:
        raw_browser_fields = {
            "platform": primary_platform or _clean_text(_dig(raw_platform_plan, "primary", "platform")),
            "product_title": _product_title(product, selected_topic),
            "short_description": _clean_text(sections.get("PRODUCT")) or selected_title,
            "tags": [item for item in _as_list(selected_topic.get("visual_keywords"))[:4] if _clean_text(item)],
            "cta_text": _clean_text(sections.get("CTA")) or conversion_goal or _clean_text(_dig(raw_platform_plan, "primary", "cta")),
        }

    risk_notes = [
        _clean_text(item)
        for item in (
            _as_list(raw.get("risks_and_blockers"))
            or _as_list(raw.get("risk_notes"))
            or _as_list(raw.get("risks"))
        )
        if _clean_text(item)
    ]
    if not risk_notes:
        unsafe_claim_risk = _clean_text(raw.get("unsafe_claim_risk")) or _clean_text(inferred.get("unsafe_claim_risk"))
        if unsafe_claim_risk:
            risk_notes.append(unsafe_claim_risk)
    if not risk_notes:
        if risk_level in {"medium", "high"}:
            risk_notes.append("当前内容需要避免夸大、绝对化或敏感承诺。")
        for issue in list(blocking_issues or [])[:3]:
            risk_notes.append(f"待修正问题：{_clean_text(issue)}")
        for span in list(risky_spans or [])[:3]:
            reason = _clean_text((span or {}).get("reason"))
            text = _clean_text((span or {}).get("text"))
            note = " / ".join([item for item in (reason, text) if item])
            if note:
                risk_notes.append(note)
    if not risk_notes:
        risk_notes.append("发布前再检查一次措辞是否真实、克制、可验证。")

    kpi_list = [item for item in _as_list(raw.get("kpi_checklist")) if _clean_text(item)]
    if not kpi_list:
        kpi_list = list(_DEFAULT_KPIS)

    raw_next_actions = [item for item in _as_list(raw.get("next_actions")) if _clean_text(item)]
    next_actions = [_clean_text(item) for item in raw_next_actions[:4]]

    return {
        "selected_topic_angle": selected_angle or _clean_text(req_payload.get("selected_angle")),
        "selected_topic_title": selected_title,
        "platform_plan": raw_platform_plan,
        "copy_pack": raw_copy_pack,
        "browser_ready_fields": raw_browser_fields,
        "risks_and_blockers": risk_notes,
        "kpi_checklist": kpi_list,
        "next_actions": next_actions,
        "risky_span_count": len(list(risky_spans or [])),
    }
