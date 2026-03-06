from __future__ import annotations

from typing import Any, Dict, Optional

try:
    from ...context.context_builder import ContextPack, render_context_sections
except Exception:  # pragma: no cover - 兼容 python bananaflow/main.py 直跑
    from context.context_builder import ContextPack, render_context_sections

from .prompts import (
    GENERIC_PERSONA_BANNED_TERMS,
    INFERENCE_CONFIDENCE_THRESHOLD,
    build_inference_prompt,
)
from .schemas import AudienceInferenceResult


_RISK_KEYWORDS: Dict[str, str] = {
    "治疗": "high",
    "治": "high",
    "药": "high",
    "处方": "high",
    "减肥": "high",
    "增高": "high",
    "祛痘": "medium",
    "美白": "medium",
    "抗衰": "medium",
    "保健": "medium",
    "营养": "medium",
    "儿童": "medium",
    "婴儿": "medium",
}


def is_generic_persona(persona: str) -> bool:
    text = (persona or "").strip()
    if not text:
        return True
    if len(text) < 8:
        return True
    for banned in GENERIC_PERSONA_BANNED_TERMS:
        if banned in text and len(text) <= len(banned) + 6:
            return True
    exact_generic = {
        "消费者",
        "普通用户",
        "女性",
        "男性",
        "学生",
        "上班族",
        "护肤人群",
    }
    return text in exact_generic


class AudienceInferenceNode:
    """
    MVP 版本默认使用规则 + 模板推断。
    扩展点：
    - llm_client: 后续接大模型结构化推断
    - rag_provider: 后续接行业知识/RAG
    - rules_provider: 后续接业务规则库
    """

    def __init__(
        self,
        llm_client: Optional[Any] = None,
        rag_provider: Optional[Any] = None,
        rules_provider: Optional[Any] = None,
        model_config: Optional[Any] = None,
    ) -> None:
        self.llm_client = llm_client
        self.rag_provider = rag_provider
        self.rules_provider = rules_provider
        self.model_config = model_config

    def run(
        self,
        product: str,
        retry: bool = False,
        previous: Optional[AudienceInferenceResult] = None,
        allow_llm: bool = True,
        context_pack: Optional[ContextPack] = None,
    ) -> AudienceInferenceResult:
        product = (product or "").strip()
        prompt = build_inference_prompt(product, retry=retry, previous_persona=(previous.persona if previous else None))
        if context_pack is not None:
            prompt = f"{prompt}\n\n{render_context_sections(context_pack)}"

        if allow_llm and self.llm_client and hasattr(self.llm_client, "infer_audience"):
            try:
                out = self.llm_client.infer_audience(
                    product=product,
                    retry=retry,
                    previous=previous,
                    prompt_override=prompt,
                )
                if isinstance(out, AudienceInferenceResult):
                    result = out
                else:
                    result = AudienceInferenceResult(**out)
                if is_generic_persona(result.persona):
                    result.confidence = min(result.confidence, 0.69)
                return result
            except Exception:
                # MVP: LLM 失败时回退到规则推断
                pass

        return self._heuristic_infer(product=product, retry=retry, previous=previous)

    def _heuristic_infer(
        self,
        product: str,
        retry: bool = False,
        previous: Optional[AudienceInferenceResult] = None,
    ) -> AudienceInferenceResult:
        product_l = product.lower()

        persona = self._build_persona(product)
        pain_points = self._build_pain_points(product, retry=retry, previous=previous)
        scenes = self._build_scenes(product)
        confidence = self._estimate_confidence(product, retry=retry, persona=persona, previous=previous)
        unsafe_claim_risk = self._infer_unsafe_claim_risk(product_l)

        if is_generic_persona(persona):
            confidence = min(confidence, INFERENCE_CONFIDENCE_THRESHOLD - 0.06)
            persona = f"最近两周频繁搜索“{product}”并准备在本月下单、但还在比较方案的首次购买者"

        why_this_persona = (
            "该人群处于明确决策期，显性痛点可被短视频镜头直接呈现，"
            "同时对对比、避坑、使用步骤类内容响应更高。"
        )
        if retry:
            why_this_persona += "（retry 已优先补强显性痛点与使用场景）"

        return AudienceInferenceResult(
            product=product,
            persona=persona,
            pain_points=pain_points,
            scenes=scenes,
            why_this_persona=why_this_persona,
            confidence=max(0.0, min(1.0, round(confidence, 2))),
            unsafe_claim_risk=unsafe_claim_risk,
        )

    def _build_persona(self, product: str) -> str:
        p = product.lower()
        if any(k in p for k in ("护肤", "面霜", "精华", "乳液", "面膜", "爽肤水")):
            return "28-35岁通勤白领，长期空调房久坐、晚上经常熬夜，换季时脸颊干但T区易出油的人"
        if any(k in p for k in ("咖啡", "咖啡机", "手冲", "咖啡豆")):
            return "工作日早上时间紧、但希望在家稳定喝到一杯不苦涩咖啡的城市上班族"
        if any(k in p for k in ("拖把", "扫地机", "清洁", "吸尘器")):
            return "家里有小孩或宠物、每天都要处理地面毛发和碎屑、清洁时间被压缩的家庭主理人"
        if any(k in p for k in ("枕头", "床垫", "睡眠")):
            return "最近一个月睡醒肩颈发紧、白天久坐办公、开始主动调整睡眠环境的办公室人群"
        if any(k in p for k in ("耳机", "蓝牙耳机", "降噪")):
            return "通勤地铁时间长、需要在嘈杂环境下接电话和听内容、预算敏感的职场新人"
        return f"最近30天正在比较“{product}”同价位方案、准备首次购买且担心踩坑的决策期用户"

    def _build_pain_points(
        self,
        product: str,
        retry: bool = False,
        previous: Optional[AudienceInferenceResult] = None,
    ) -> list[str]:
        base = [
            "看了很多参数，但还是不知道哪项指标和自己真实使用最相关",
            "担心买贵或买错，实际体验和页面描述不一致",
            "想尽快做决定，但没有一个清晰的判断步骤",
        ]
        p = product.lower()
        if any(k in p for k in ("护肤", "面霜", "精华", "面膜")):
            base = [
                "上脸一开始还行，但白天容易搓泥或和底妆打架",
                "成分名看不懂，不知道该优先解决干、油、暗沉中的哪一个",
                "怕踩雷刺激，想要稳一点但又不想完全没体感",
            ]
        elif any(k in p for k in ("耳机", "蓝牙耳机", "降噪")):
            base = [
                "地铁和办公室切换时，降噪和通透模式来回调很麻烦",
                "通话时对方总说听不清，自己却不知道问题出在哪",
                "参数看着都差不多，但实际佩戴半小时耳朵就不舒服",
            ]

        if retry:
            explicit = [
                f"不知道在自己的真实场景里（如{self._build_scenes(product)[0]}）会不会出现明显翻车体验",
                "希望看到可执行的判断标准，而不是泛泛的优缺点列表",
            ]
            if previous and previous.pain_points:
                explicit.insert(0, f"此前推断偏泛，需补强显性痛点：{previous.pain_points[0]}")
            # 去重并保留顺序
            seen = set()
            merged = []
            for item in explicit + base:
                if item not in seen:
                    seen.add(item)
                    merged.append(item)
            return merged[:4]

        return base[:3]

    def _build_scenes(self, product: str) -> list[str]:
        p = product.lower()
        if any(k in p for k in ("护肤", "面霜", "精华", "面膜")):
            return ["早上通勤前护肤+上妆前", "换季皮肤状态不稳定的一周", "晚上加班回家后的简化护肤"]
        if any(k in p for k in ("耳机", "蓝牙耳机", "降噪")):
            return ["早晚高峰地铁通勤", "开放办公区远程会议", "午休或下班路上听播客"]
        if any(k in p for k in ("咖啡", "咖啡机", "手冲", "咖啡豆")):
            return ["工作日早上10分钟内出门前", "午后犯困但不想点外卖咖啡", "周末在家招待朋友"]
        return ["下单前最后对比阶段", "第一次使用当天", "连续使用一周后的真实反馈阶段"]

    def _estimate_confidence(
        self,
        product: str,
        retry: bool,
        persona: str,
        previous: Optional[AudienceInferenceResult],
    ) -> float:
        score = 0.62
        product_text = (product or "").strip()
        if len(product_text) >= 4:
            score += 0.06
        if len(product_text) >= 8:
            score += 0.05
        if any(sep in product_text for sep in (" ", "，", ",", "适合", "用于", "带", "款")):
            score += 0.05
        if not is_generic_persona(persona):
            score += 0.06
        if retry:
            score += 0.04
            if previous and previous.confidence < INFERENCE_CONFIDENCE_THRESHOLD:
                score += 0.02
        # 明显过于泛的产品输入拉低分数
        if product_text in {"护肤品", "耳机", "鞋子", "零食", "日用品"}:
            score -= 0.08
        return score

    def _infer_unsafe_claim_risk(self, product_l: str) -> str:
        risk = "low"
        for kw, level in _RISK_KEYWORDS.items():
            if kw in product_l:
                if level == "high":
                    return "high"
                risk = "medium"
        return risk
