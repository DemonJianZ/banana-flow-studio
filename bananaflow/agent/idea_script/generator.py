from __future__ import annotations

from typing import Any, Optional, Sequence

from .prompts import GENERATION_ANGLES, SCRIPT_STRUCTURE_TAGS, build_generator_prompt
from .schemas import AudienceInferenceResult, IdeaTopic


class IdeaScriptGeneratorNode:
    """
    MVP 版本默认模板生成，后续可接 LLM / 规则库 / RAG。
    """

    def __init__(
        self,
        llm_client: Optional[Any] = None,
        rules_provider: Optional[Any] = None,
        rag_provider: Optional[Any] = None,
        model_config: Optional[Any] = None,
    ) -> None:
        self.llm_client = llm_client
        self.rules_provider = rules_provider
        self.rag_provider = rag_provider
        self.model_config = model_config

    def run(
        self,
        audience_context: AudienceInferenceResult,
        retry: bool = False,
        reviewer_blocking_issues: Sequence[str] | None = None,
        previous_topics: Sequence[IdeaTopic] | None = None,
        allow_llm: bool = True,
    ) -> list[IdeaTopic]:
        _ = build_generator_prompt(
            product=audience_context.product,
            persona=audience_context.persona,
            pain_points=audience_context.pain_points,
            scenes=audience_context.scenes,
            retry=retry,
            blocking_issues=reviewer_blocking_issues,
        )

        if allow_llm and self.llm_client and hasattr(self.llm_client, "generate_idea_scripts"):
            try:
                out = self.llm_client.generate_idea_scripts(
                    audience_context=audience_context,
                    retry=retry,
                    reviewer_blocking_issues=list(reviewer_blocking_issues or []),
                    previous_topics=[t.model_dump() if hasattr(t, "model_dump") else t for t in (previous_topics or [])],
                )
                topics = [t if isinstance(t, IdeaTopic) else IdeaTopic(**t) for t in out]
                return self._enforce_output_contract(topics, audience_context)
            except Exception:
                pass

        product = audience_context.product
        persona = audience_context.persona
        primary_pain = (audience_context.pain_points or ["不知道怎么选"])[0]
        primary_scene = (audience_context.scenes or ["第一次使用当天"])[0]
        safety_line = self._safety_line(audience_context.unsafe_claim_risk)

        topics: list[IdeaTopic] = []
        for angle in GENERATION_ANGLES:
            if angle == "persona":
                hook = "不是所有人都该买这款"
                title = f"{product}适合谁买？先看这3个特征"
                script = self._compose_tagged_script(
                    hook_text=f"你先别急着下单，{product}真的不是谁都适合。",
                    view_text=f"如果你是“{persona}”，先看你最想避免的翻车点：{primary_pain}。",
                    steps_text="按三步来：先写下你每天最常用场景，再选一个最影响体验的指标，最后看同价位对比。",
                    product_text=f"如果这款{product}在你高频场景里表现更稳，就值得进入候选。",
                    cta_text=f"{safety_line}评论区打“清单”，我把判断步骤发你。",
                )
                visual_keywords = self._build_visual_keywords(
                    product=product,
                    angle=angle,
                    primary_scene=primary_scene,
                    primary_pain=primary_pain,
                )
            elif angle == "scene":
                hook = "同一款产品，不同场景差很多"
                title = f"{primary_scene}下，怎么判断{product}值不值"
                script = self._compose_tagged_script(
                    hook_text=f"同一款{product}，换个场景体验可能完全不一样。",
                    view_text=f"你常见场景是“{primary_scene}”时，不要先看花哨卖点，先看失败成本。",
                    steps_text="先演示开始前状态，再演示使用过程，最后给出10分钟后的结果和真实感受。",
                    product_text=f"这样判断会更稳：看这款{product}在该场景是否稳定达标。",
                    cta_text=f"{safety_line}想看我按场景做的对比模板，先收藏。",
                )
                visual_keywords = self._build_visual_keywords(
                    product=product,
                    angle=angle,
                    primary_scene=primary_scene,
                    primary_pain=primary_pain,
                )
            else:  # misconception
                hook = "很多人一开始就看错了"
                title = f"关于{product}，这个误区最容易让人买错"
                script = self._compose_tagged_script(
                    hook_text=f"很多人买{product}时，第一步就做错了：只看参数排名，不看真实需求。",
                    view_text="参数不是不能看，而是要放在场景之后看，顺序错了就容易买错。",
                    steps_text=f"先确定你是不是“{persona}”这类用户，再确认最在意的痛点是不是“{primary_pain}”，最后只看2到3个关键指标。",
                    product_text=f"按这个顺序再看这款{product}，你会更清楚它是不是你的答案。",
                    cta_text=f"{safety_line}关注我，后面继续拆更多常见误区。",
                )
                visual_keywords = self._build_visual_keywords(
                    product=product,
                    angle=angle,
                    primary_scene=primary_scene,
                    primary_pain=primary_pain,
                )

            topics.append(
                IdeaTopic(
                    angle=angle,
                    title=title,
                    hook=hook,
                    script_60s=script,
                    visual_keywords=visual_keywords,
                )
            )

        return self._enforce_output_contract(topics, audience_context)

    def _safety_line(self, risk: str) -> str:
        if risk == "high":
            return "内容仅做选购和使用体验参考，不替代专业诊断或治疗建议。"
        if risk == "medium":
            return "体验因人而异，建议先做小范围尝试或查看更详细说明。"
        return "最终效果会因使用方式和个人情况不同而有差异。"

    def _compose_tagged_script(
        self,
        hook_text: str,
        view_text: str,
        steps_text: str,
        product_text: str,
        cta_text: str,
    ) -> str:
        return (
            f"[HOOK] {hook_text}\n"
            f"[VIEW] {view_text}\n"
            f"[STEPS] {steps_text}\n"
            f"[PRODUCT] {product_text}\n"
            f"[CTA] {cta_text}"
        )

    def _build_visual_keywords(
        self,
        product: str,
        angle: str,
        primary_scene: str,
        primary_pain: str,
    ) -> list[str]:
        raw = [
            product,
            angle,
            primary_scene,
            primary_pain,
            "对比镜头",
            "口播近景",
            "步骤字幕",
            "使用实拍",
        ]
        keywords: list[str] = []
        seen = set()
        for item in raw:
            text = (item or "").strip()
            if not text or text in seen:
                continue
            seen.add(text)
            keywords.append(text)
            if len(keywords) >= 8:
                break
        while len(keywords) < 5:
            keywords.append(f"{product}素材{len(keywords) + 1}")
        return keywords

    def _enforce_output_contract(
        self,
        topics: list[IdeaTopic],
        audience_context: AudienceInferenceResult,
    ) -> list[IdeaTopic]:
        product = audience_context.product
        primary_scene = (audience_context.scenes or ["第一次使用当天"])[0]
        primary_pain = (audience_context.pain_points or ["不知道怎么选"])[0]
        normalized: list[IdeaTopic] = []
        for topic in topics:
            item = topic.model_copy(deep=True)
            item.script_60s = self._ensure_tagged_script(item, product)
            if not (5 <= len(item.visual_keywords or []) <= 8):
                item.visual_keywords = self._build_visual_keywords(
                    product=product,
                    angle=item.angle,
                    primary_scene=primary_scene,
                    primary_pain=primary_pain,
                )
            normalized.append(item)
        return normalized

    def _ensure_tagged_script(self, topic: IdeaTopic, product: str) -> str:
        script = (topic.script_60s or "").strip()
        if self._has_complete_tag_structure(script):
            return script

        cta = "如果这条有用，先收藏。"
        if any(marker in script for marker in ("评论区", "收藏", "关注", "私信")):
            cta = script
        return self._compose_tagged_script(
            hook_text=(topic.hook or "你先别急，先看这个点。"),
            view_text=(script or "先看场景，再看关键指标，判断会更稳。"),
            steps_text="第一步看你的高频场景；第二步看一个关键指标；第三步做同价位对比。",
            product_text=f"回到{product}本身，重点看它在你场景里的稳定表现。",
            cta_text=cta,
        )

    def _has_complete_tag_structure(self, script: str) -> bool:
        if not script:
            return False
        positions = []
        for tag in SCRIPT_STRUCTURE_TAGS:
            pos = script.find(tag)
            if pos < 0:
                return False
            positions.append(pos)
        return positions == sorted(positions)
