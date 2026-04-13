from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable, Optional

from .prompts import build_risk_scanner_prompt
from .schemas import ComplianceScanResult, RiskLevel, RiskySpan, TopicItem

RISK_POLICY_VERSION = "risk_policy_v1"


@dataclass(frozen=True)
class _RiskRule:
    keyword: str
    level: RiskLevel
    reason: str


_RISK_RULES: tuple[_RiskRule, ...] = (
    _RiskRule(keyword="包治百病", level="high", reason="医疗化且绝对化承诺"),
    _RiskRule(keyword="根治", level="high", reason="治疗承诺风险"),
    _RiskRule(keyword="治愈", level="high", reason="医疗效果承诺"),
    _RiskRule(keyword="治疗", level="high", reason="医疗化表述"),
    _RiskRule(keyword="药到病除", level="high", reason="治疗结果保证"),
    _RiskRule(keyword="100%", level="high", reason="绝对化保证"),
    _RiskRule(keyword="百分百", level="high", reason="绝对化保证"),
    _RiskRule(keyword="保证有效", level="high", reason="保证式承诺"),
    _RiskRule(keyword="无副作用", level="high", reason="安全性绝对化承诺"),
    _RiskRule(keyword="立刻见效", level="high", reason="即时效果承诺"),
    _RiskRule(keyword="永久有效", level="high", reason="持续效果绝对化承诺"),
    _RiskRule(keyword="美白", level="medium", reason="功效敏感词"),
    _RiskRule(keyword="祛痘", level="medium", reason="功效敏感词"),
    _RiskRule(keyword="抗衰", level="medium", reason="功效敏感词"),
    _RiskRule(keyword="减肥", level="medium", reason="体重管理敏感词"),
    _RiskRule(keyword="增高", level="medium", reason="身体变化敏感词"),
    _RiskRule(keyword="不反弹", level="medium", reason="效果持续性承诺"),
    _RiskRule(keyword="快速见效", level="medium", reason="短期效果承诺"),
)

_RISK_ORDER = {"low": 0, "medium": 1, "high": 2}


class ComplianceGuardNode:
    """
    对 topics 的 title/hook/script_60s 做轻量风险扫描。
    扩展点：
    - llm_client: 后续可接结构化合规识别
    - rules_provider: 后续可替换风险词典来源
    """

    def __init__(
        self,
        llm_client: Optional[Any] = None,
        rules_provider: Optional[Any] = None,
        model_config: Optional[Any] = None,
    ) -> None:
        self.llm_client = llm_client
        self.rules_provider = rules_provider
        self.model_config = model_config

    def run(
        self,
        product: str,
        persona: str,
        topics: Iterable[Any],
        allow_llm: bool = True,
    ) -> ComplianceScanResult:
        _ = build_risk_scanner_prompt(product=product, persona=persona)
        normalized = self._normalize_topics(topics)

        if allow_llm and self.llm_client and hasattr(self.llm_client, "scan_compliance_risk"):
            try:
                out = self.llm_client.scan_compliance_risk(
                    product=product,
                    persona=persona,
                    topics=[t.model_dump() for t in normalized],
                )
                if isinstance(out, ComplianceScanResult):
                    return out
                return ComplianceScanResult(**out)
            except Exception:
                pass

        spans: list[RiskySpan] = []
        seen = set()
        for idx, topic in enumerate(normalized):
            for field_name in ("title", "hook", "script_60s"):
                text = getattr(topic, field_name, "") or ""
                for item in self._scan_field(
                    topic_index=idx,
                    angle=topic.angle,
                    field=field_name,  # type: ignore[arg-type]
                    text=text,
                ):
                    key = (
                        item.topic_index,
                        item.field,
                        item.text,
                        item.reason,
                        item.risk_level,
                    )
                    if key in seen:
                        continue
                    seen.add(key)
                    spans.append(item)

        risk_level = self._aggregate_risk_level(spans)
        return ComplianceScanResult(risk_level=risk_level, risky_spans=spans)

    def _normalize_topics(self, topics: Iterable[Any]) -> list[TopicItem]:
        normalized: list[TopicItem] = []
        for raw in topics or []:
            try:
                if isinstance(raw, TopicItem):
                    normalized.append(raw)
                elif hasattr(raw, "model_dump"):
                    normalized.append(TopicItem(**raw.model_dump()))
                elif isinstance(raw, dict):
                    normalized.append(TopicItem(**raw))
            except Exception:
                continue
        return normalized

    def _scan_field(
        self,
        topic_index: int,
        angle: str,
        field: str,
        text: str,
    ) -> list[RiskySpan]:
        spans: list[RiskySpan] = []
        content = text or ""
        for rule in _RISK_RULES:
            start = 0
            while True:
                pos = content.find(rule.keyword, start)
                if pos < 0:
                    break
                left = max(0, pos - 10)
                right = min(len(content), pos + len(rule.keyword) + 10)
                snippet = content[left:right].strip() or rule.keyword
                spans.append(
                    RiskySpan(
                        topic_index=topic_index,
                        angle=(angle or "").strip() or None,
                        field=field,  # type: ignore[arg-type]
                        text=snippet,
                        reason=rule.reason,
                        risk_level=rule.level,
                    )
                )
                start = pos + len(rule.keyword)
        return spans

    def _aggregate_risk_level(self, spans: list[RiskySpan]) -> RiskLevel:
        max_level: RiskLevel = "low"
        for span in spans:
            if _RISK_ORDER[span.risk_level] > _RISK_ORDER[max_level]:
                max_level = span.risk_level
        return max_level


class RiskScannerNode(ComplianceGuardNode):
    pass
