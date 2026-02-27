from __future__ import annotations

from typing import Iterable, Sequence


INFERENCE_CONFIDENCE_THRESHOLD = 0.75
GENERATION_ANGLES = ("persona", "scene", "misconception")
SCRIPT_STRUCTURE_TAGS = ("[HOOK]", "[VIEW]", "[STEPS]", "[PRODUCT]", "[CTA]")
STORYBOARD_SEGMENTS = ("HOOK", "VIEW", "STEPS", "PRODUCT", "CTA")
PROMPT_VERSION = "idea_script_prompt_v3_1"

# persona 必须具体，禁止泛化表述
GENERIC_PERSONA_BANNED_TERMS = (
    "大多数人",
    "消费者",
    "女性群体",
    "男性群体",
    "护肤人群",
    "用户群体",
    "普通人",
    "学生党",
    "上班族",  # 单独使用时仍偏泛，允许在更具体修饰下出现
)

INFERENCE_RULES = """
你是 Audience Inference 节点。目标：从 product 推断一个“具体到可拍短视频”的受众画像。
规则：
1) persona 必须具体，禁止使用宽泛表述（如大多数人/消费者/女性群体/护肤人群）。
2) 输出 pain_points 要优先写显性痛点（能直接感知、可被镜头展示）。
3) 输出 scenes 要具体到使用/购买/决策场景。
4) confidence 为 0~1；信息不足时允许低分，但仍要给出最佳猜测。
5) unsafe_claim_risk 仅评估文案夸大/医疗化风险，不做效果保证。
6) 避免夸大、医疗化、绝对化表述。
""".strip()

INFERENCE_RETRY_RULES = """
这是 retry 推断。请优先补全“显性痛点”和“具体场景”，尽量把 persona 收窄到可操作的人群。
如果仍然信息不足，保持低 confidence，但不要编造专业结论。
""".strip()

GENERATOR_RULES = """
你是 Idea + Script Generator 节点。必须固定输出 3 个角度：
1) persona
2) scene
3) misconception

每个选题包含：title / hook / script_60s。
script_60s 必须严格包含并按顺序使用这 5 个标签段落：
[HOOK]...[VIEW]...[STEPS]...[PRODUCT]...[CTA]...
避免夸大、医疗化、绝对化表述。
""".strip()

GENERATOR_RETRY_SUFFIX = """
这是 generation retry。请优先修复 reviewer 指出的 blocking 问题，不要只是改写措辞或重复生成。
必须确保：
1) 固定输出 3 个 topic
2) angle 恰好覆盖 persona / scene / misconception 且不重复
3) 每个 topic 都有完整的 title / hook / script_60s
4) persona 不泛化
""".strip()

REVIEWER_RULES = """
你是 Reviewer 节点，检查：
1) topics 数量必须为 3
2) angle 不得重复
3) hook 要短而明确
4) script_60s 要口语化
5) persona 不能泛化
6) script_60s 要包含 [HOOK][VIEW][STEPS][PRODUCT][CTA] 标签结构（缺失可记为 non-blocking）
必要时做轻量修正（不改变核心意思）。
""".strip()

GENERATOR_FEW_SHOT = """
few_shot_example:
{
  "angle": "scene",
  "title": "早晚高峰地铁通勤下，怎么判断耳机值不值",
  "hook": "同一款耳机，换场景体验差很大",
  "script_60s": "[HOOK] 你在地铁里觉得降噪不够，先别急着下结论。\\n[VIEW] 先看场景里的关键失败点，再决定值不值。\\n[STEPS] 第一步记下你最常遇到的噪声；第二步对比通话清晰度；第三步连续佩戴30分钟看舒适度。\\n[PRODUCT] 如果这款耳机在通勤噪声和通话都稳定，就进入候选。\\n[CTA] 想要我这套对比清单，先收藏。"
}
""".strip()

RISK_SCANNER_RULES = """
你是 Risk Scanner 节点，扫描 title/hook/script_60s 中的高风险表达。
输出：
1) risk_level: low/medium/high
2) risky_spans: 字段 + 片段 + 原因 + 风险等级
规则：优先识别医疗化、绝对化、保证式承诺、极限效果承诺。
""".strip()

SAFE_REWRITE_RULES = """
你是 Safe Rewrite 节点。仅改写风险句子，保留原表达风格与结构。
必须：
1) 只改 risky spans 所在句子
2) 不改非风险句子
3) 不新增夸大、医疗化、绝对化表达
""".strip()

SCORING_REVIEWER_RULES = """
你是 Scoring Reviewer 节点，按 rubric 输出 0~1 分数：
persona_specificity_score, hook_strength_score, topic_diversity_score, script_speakability_score, compliance_score。
""".strip()

STORYBOARD_GENERATOR_RULES = """
你是 Storyboard Agent 节点。输入为包含 [HOOK][VIEW][STEPS][PRODUCT][CTA] 标签脚本和 visual_keywords 的 TopicItem。
输出 6~8 个镜头，必须覆盖：
HOOK>=1, VIEW>=1, STEPS>=2, PRODUCT>=1, CTA>=1。
镜头总时长建议 55~65 秒，camera 类型至少 3 种。
每镜头必须输出：
shot_id, segment, duration_sec, camera, scene, action, keyword_tags(5~8), asset_requirements(1~3)。
""".strip()

STORYBOARD_REVIEWER_RULES = """
你是 Storyboard Reviewer 节点，检查并修复常见问题：
1) shot_count 是否在 6~8
2) segment 覆盖是否满足 HOOK/VIEW/STEPS/PRODUCT/CTA 要求
3) duration_total 是否合理（允许轻微偏差）
4) scene/action 不为空
5) keyword_tags 不为空
6) camera 类型不少于 3
""".strip()


def build_inference_prompt(product: str, retry: bool = False, previous_persona: str | None = None) -> str:
    parts = [INFERENCE_RULES]
    if retry:
        parts.append(INFERENCE_RETRY_RULES)
    parts.append(f"product: {product}")
    if previous_persona:
        parts.append(f"previous_persona: {previous_persona}")
    return "\n\n".join(parts)


def build_generator_prompt(
    product: str,
    persona: str,
    pain_points: Iterable[str],
    scenes: Iterable[str],
    retry: bool = False,
    blocking_issues: Sequence[str] | None = None,
) -> str:
    prompt = (
        f"{GENERATOR_RULES}\n\n"
        f"product: {product}\n"
        f"persona: {persona}\n"
        f"pain_points: {list(pain_points)}\n"
        f"scenes: {list(scenes)}\n\n"
        f"{GENERATOR_FEW_SHOT}\n\n"
        f"required_script_tags: {list(SCRIPT_STRUCTURE_TAGS)}"
    )
    if retry:
        prompt += f"\n\n{GENERATOR_RETRY_SUFFIX}"
        if blocking_issues:
            prompt += f"\nreviewer_blocking_issues: {list(blocking_issues)}"
    return prompt


def build_reviewer_prompt(product: str, persona: str) -> str:
    return f"{REVIEWER_RULES}\n\nproduct: {product}\npersona: {persona}"


def build_risk_scanner_prompt(product: str, persona: str) -> str:
    return f"{RISK_SCANNER_RULES}\n\nproduct: {product}\npersona: {persona}"


def build_safe_rewrite_prompt(product: str, persona: str) -> str:
    return f"{SAFE_REWRITE_RULES}\n\nproduct: {product}\npersona: {persona}"


def build_scoring_prompt(product: str, persona: str) -> str:
    return f"{SCORING_REVIEWER_RULES}\n\nproduct: {product}\npersona: {persona}"


def build_storyboard_prompt(product: str, persona: str, angle: str) -> str:
    return (
        f"{STORYBOARD_GENERATOR_RULES}\n\n"
        f"product: {product}\n"
        f"persona: {persona}\n"
        f"angle: {angle}\n"
        f"required_segments: {list(STORYBOARD_SEGMENTS)}"
    )


def build_storyboard_reviewer_prompt(product: str, persona: str, angle: str) -> str:
    return (
        f"{STORYBOARD_REVIEWER_RULES}\n\n"
        f"product: {product}\n"
        f"persona: {persona}\n"
        f"angle: {angle}\n"
        f"required_segments: {list(STORYBOARD_SEGMENTS)}"
    )
