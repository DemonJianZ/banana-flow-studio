from __future__ import annotations

from typing import Iterable, Sequence


INFERENCE_CONFIDENCE_THRESHOLD = 0.75
GENERATION_TOPIC_COUNT = 3
SCRIPT_STRUCTURE_TAGS = ("[HOOK]", "[VIEW]", "[STEPS]", "[PRODUCT]", "[CTA]")
STORYBOARD_SEGMENTS = ("HOOK", "VIEW", "STEPS", "PRODUCT", "CTA")
PROMPT_VERSION = "idea_script_prompt_v4_0"

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
You are the audience inference step inside the china-growth-ops workflow.
Treat the external skill instructions and attached reference snippets as the source of truth.

Goal:
- lock one concrete commercial unit for one product
- infer one narrow target buyer that fits the product and the primary platform-first test
- keep the output useful for downstream China-market growth copy generation

Rules:
1) persona must be specific, concrete, and shootable; never use generic audience labels.
2) pain_points must be visible or decision-critical, not abstract brand language.
3) scenes must map to real purchase, usage, or comparison moments.
4) prefer one SKU, one buyer, one primary platform-first assumption.
5) confidence stays in 0~1; lower it when assumptions are thin.
6) unsafe_claim_risk only evaluates copy/compliance risk, not product quality.
7) do not invent medical, legal, guaranteed-income, or absolute claims.
8) all human-readable fields must be in Simplified Chinese.
Return JSON only.
""".strip()

INFERENCE_RETRY_RULES = """
This is a retry pass.
Tighten the buyer definition, make pain points more visible, and make scenes more operational.
Do not fall back to generic copy. If evidence is still weak, keep confidence low.
""".strip()

GENERATOR_RULES = """
You are the copy generation step inside the china-growth-ops workflow.
Treat the external skill instructions and attached references as the source of truth.

Task:
- generate exactly 3 candidate angles from one shared commercial brief
- keep the angle labels in the skill's own wording; do not map them to internal taxonomy labels
- make the copy feel platform-aware for Chinese-market growth operations
- return the full skill-native package whenever possible

Preferred JSON shape:
{
  "offer_decision": {...},
  "candidate_angles": [
    {
      "angle": string,
      "title": string,
      "hook": string,
      "script_60s": string,
      "visual_keywords": string[]
    }
  ],
  "selected_angle": string,
  "platform_plan": {...},
  "copy_pack": {...},
  "browser_ready_fields": {...},
  "risks_and_blockers": string[],
  "kpi_checklist": string[]
}

If your skill-native structure uses different field names, keep the same meaning and stay consistent.

Rules:
1) All human-readable fields must be in Simplified Chinese.
2) Do not reuse generic house-style templates.
3) Derive all three angles from the same product, buyer, pain, price band, conversion goal, and platform pair.
4) Keep claims compliant: no medical, legal, guaranteed, or absolute promises.
5) Return JSON only.
6) The 3 angle labels must be distinct and commercially meaningful in the skill's own language.
""".strip()

GENERATOR_RETRY_SUFFIX = """
This is a generation retry.
Fix the blocking issues directly instead of paraphrasing the same output.
You must still return exactly 3 topics with distinct angle labels.
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


def _brief_lines(brief_context: dict | None = None) -> list[str]:
    brief = dict(brief_context or {})
    mapping = (
        ("audience", "target_audience"),
        ("price_band", "price_band"),
        ("conversion_goal", "conversion_goal"),
        ("primary_platform", "primary_platform"),
        ("secondary_platform", "secondary_platform"),
        ("selected_angle", "preferred_angle"),
    )
    lines: list[str] = []
    for source_key, label in mapping:
        text = str(brief.get(source_key) or "").strip()
        if text:
            lines.append(f"{label}: {text}")
    return lines


def build_inference_prompt(
    product: str,
    retry: bool = False,
    previous_persona: str | None = None,
    brief_context: dict | None = None,
) -> str:
    parts = [INFERENCE_RULES]
    if retry:
        parts.append(INFERENCE_RETRY_RULES)
    parts.append(f"product: {product}")
    parts.extend(_brief_lines(brief_context))
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
    brief_context: dict | None = None,
) -> str:
    prompt = (
        f"{GENERATOR_RULES}\n\n"
        f"product: {product}\n"
        f"persona: {persona}\n"
        f"pain_points: {list(pain_points)}\n"
        f"scenes: {list(scenes)}"
    )
    brief_lines = _brief_lines(brief_context)
    if brief_lines:
        prompt += "\n" + "\n".join(brief_lines)
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
