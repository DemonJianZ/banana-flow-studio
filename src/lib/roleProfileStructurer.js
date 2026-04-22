export const ROLE_PROFILE_SCHEMA_VERSION = "role_profile_schema_v1";

const SOURCE = {
  EXPLICIT: "explicit",
  INFERRED: "inferred",
  EMPTY: "empty",
};

const cleanText = (value) => String(value ?? "").trim();

const field = (value, source = SOURCE.EMPTY, confidence = 0, evidence = "") => ({
  value,
  source,
  confidence,
  evidence: cleanText(evidence),
});

const listField = (items, source = SOURCE.EMPTY, confidence = 0, evidence = "") => ({
  values: Array.isArray(items) ? items.map(cleanText).filter(Boolean) : [],
  source,
  confidence,
  evidence: cleanText(evidence),
});

const splitClauses = (text) =>
  cleanText(text)
    .split(/[\n\r。；;，,、]+/)
    .map(cleanText)
    .filter(Boolean);

const unique = (items) => Array.from(new Set((items || []).map(cleanText).filter(Boolean)));

const pickFirstByPatterns = (text, patterns = []) => {
  const sourceText = cleanText(text);
  for (const pattern of patterns) {
    const match = sourceText.match(pattern);
    if (match?.[1]) return cleanText(match[1]);
  }
  return "";
};

const inferByKeywords = (text, rules = []) => {
  const sourceText = cleanText(text);
  for (const rule of rules) {
    if (rule.keywords.some((keyword) => sourceText.includes(keyword))) {
      return {
        value: rule.value,
        evidence: rule.keywords.find((keyword) => sourceText.includes(keyword)) || "",
      };
    }
  }
  return { value: "", evidence: "" };
};

const extractRelationshipEdges = (relationshipNetwork, roleName) => {
  const clauses = splitClauses(relationshipNetwork);
  const name = cleanText(roleName);
  return clauses.map((clause, index) => {
    const target =
      pickFirstByPatterns(clause, [
        /(?:与|和|跟)([^，。；;、\s]+)(?:是|为|关系|有|存在|互为)?/,
        /([^，。；;、\s]+)(?:是|为).{0,8}(?:朋友|恋人|敌人|对手|家人|父亲|母亲|哥哥|姐姐|弟弟|妹妹|搭档|上司|下属|债主|恩人)/,
      ]) || `关系对象${index + 1}`;
    const polarityRule = inferByKeywords(clause, [
      { keywords: ["敌", "仇", "竞争", "对手", "背叛", "冲突", "争夺"], value: "negative" },
      { keywords: ["爱", "恋", "朋友", "搭档", "盟友", "恩人", "保护"], value: "positive" },
      { keywords: ["利用", "控制", "依赖", "欠债", "交易", "隐瞒"], value: "mixed" },
    ]);
    const relationTypeRule = inferByKeywords(clause, [
      { keywords: ["父", "母", "家人", "哥哥", "姐姐", "弟弟", "妹妹", "亲属"], value: "family" },
      { keywords: ["恋", "爱", "前任", "夫妻", "婚约"], value: "romance" },
      { keywords: ["朋友", "搭档", "盟友"], value: "ally" },
      { keywords: ["敌", "仇", "对手", "竞争"], value: "rival" },
      { keywords: ["上司", "下属", "老板", "员工"], value: "workplace" },
      { keywords: ["债", "交易", "利用", "控制"], value: "transactional" },
    ]);
    const tensionRule = inferByKeywords(clause, [
      { keywords: ["生死", "复仇", "背叛", "夺", "仇"], value: "high" },
      { keywords: ["隐瞒", "误会", "竞争", "欠债", "控制"], value: "medium" },
    ]);
    return {
      target: field(target === name ? "" : target, target ? SOURCE.INFERRED : SOURCE.EMPTY, target ? 0.58 : 0, clause),
      relation_type: field(relationTypeRule.value || "unspecified", relationTypeRule.value ? SOURCE.INFERRED : SOURCE.EMPTY, relationTypeRule.value ? 0.64 : 0, relationTypeRule.evidence || clause),
      polarity: field(polarityRule.value || "neutral", polarityRule.value ? SOURCE.INFERRED : SOURCE.EMPTY, polarityRule.value ? 0.62 : 0, polarityRule.evidence || clause),
      tension_level: field(tensionRule.value || "low", tensionRule.value ? SOURCE.INFERRED : SOURCE.INFERRED, tensionRule.value ? 0.6 : 0.42, tensionRule.evidence || clause),
      raw_hint: clause,
    };
  });
};

const inferRoleProfile = ({ roleName = "", characterSetting = "", relationshipNetwork = "", worldviewBackground = "" } = {}) => {
  const combined = [roleName, characterSetting, relationshipNetwork, worldviewBackground].map(cleanText).filter(Boolean).join("\n");
  const desire = pickFirstByPatterns(characterSetting, [
    /(?:想要|渴望|目标|追求|希望)([^。；;\n]+)/,
    /(?:为了)([^。；;\n]+?)(?:，|,|而|$)/,
  ]);
  const fear = pickFirstByPatterns(characterSetting, [
    /(?:害怕|恐惧|最怕|担心)([^。；;\n]+)/,
    /(?:不愿|不能接受)([^。；;\n]+)/,
  ]);
  const identityRule = inferByKeywords(characterSetting, [
    { keywords: ["总裁", "老板", "集团", "公司"], value: "business_power_holder" },
    { keywords: ["学生", "校园", "老师"], value: "campus_role" },
    { keywords: ["医生", "律师", "警察", "经纪人", "明星"], value: "professional_role" },
    { keywords: ["公主", "皇帝", "王爷", "宗门", "修仙"], value: "fantasy_hierarchy_role" },
  ]);
  const flawRule = inferByKeywords(characterSetting, [
    { keywords: ["自卑", "缺爱", "敏感"], value: "low_self_worth" },
    { keywords: ["骄傲", "强势", "控制"], value: "control_or_pride" },
    { keywords: ["隐瞒", "秘密", "伪装"], value: "concealment" },
    { keywords: ["冲动", "鲁莽"], value: "impulsiveness" },
  ]);
  const pressureRule = inferByKeywords([relationshipNetwork, worldviewBackground].join("\n"), [
    { keywords: ["阶层", "豪门", "家族", "继承"], value: "status_or_family_pressure" },
    { keywords: ["债", "钱", "破产", "贫穷"], value: "economic_pressure" },
    { keywords: ["舆论", "粉丝", "名声"], value: "public_reputation_pressure" },
    { keywords: ["规则", "禁忌", "契约"], value: "world_rule_pressure" },
  ]);

  const relationshipEdges = extractRelationshipEdges(relationshipNetwork, roleName);
  const missingFields = [];
  if (!cleanText(roleName)) missingFields.push("role_name");
  if (!cleanText(characterSetting)) missingFields.push("character_setting");
  if (!cleanText(relationshipNetwork)) missingFields.push("relationship_network");
  if (!cleanText(worldviewBackground)) missingFields.push("worldview_background");
  if (!desire) missingFields.push("core_desire");
  if (!fear) missingFields.push("core_fear");

  const contradictions = [];
  if (/善良|正直|守护/.test(characterSetting) && /杀人|背叛|勒索|虐待/.test(characterSetting)) {
    contradictions.push("人物正向价值与高伤害行为同时出现，后续需要解释动机或情境。");
  }
  if (/贫穷|破产|负债/.test(characterSetting) && /富豪|总裁|豪门继承人/.test(characterSetting)) {
    contradictions.push("经济状态存在潜在冲突，可作为反差设定，也可能需要澄清。");
  }

  return {
    schema_version: ROLE_PROFILE_SCHEMA_VERSION,
    role_identity_layer: {
      role_name: field(cleanText(roleName), roleName ? SOURCE.EXPLICIT : SOURCE.EMPTY, roleName ? 1 : 0, roleName),
      aliases: listField([], SOURCE.EMPTY, 0),
      social_identity: field(identityRule.value, identityRule.value ? SOURCE.INFERRED : SOURCE.EMPTY, identityRule.value ? 0.58 : 0, identityRule.evidence),
      public_mask: field(pickFirstByPatterns(characterSetting, [/(?:表面上|外表|人前)([^。；;\n]+)/]), SOURCE.INFERRED, 0.48),
      private_self: field(pickFirstByPatterns(characterSetting, [/(?:内心|私下|真实)([^。；;\n]+)/]), SOURCE.INFERRED, 0.48),
      worldview_position: field(cleanText(worldviewBackground), worldviewBackground ? SOURCE.EXPLICIT : SOURCE.EMPTY, worldviewBackground ? 0.9 : 0, worldviewBackground),
    },
    drive_layer: {
      core_desire: field(desire, desire ? SOURCE.INFERRED : SOURCE.EMPTY, desire ? 0.66 : 0, desire),
      core_fear: field(fear, fear ? SOURCE.INFERRED : SOURCE.EMPTY, fear ? 0.64 : 0, fear),
      scarcity_or_wound: field(pickFirstByPatterns(characterSetting, [/(?:创伤|伤口|缺少|失去|曾经)([^。；;\n]+)/]), SOURCE.INFERRED, 0.54),
      belief: field(pickFirstByPatterns(characterSetting, [/(?:相信|认为|信念是?)([^。；;\n]+)/]), SOURCE.INFERRED, 0.52),
      value_priority: listField(unique([desire ? "goal_completion" : "", fear ? "risk_avoidance" : ""]), SOURCE.INFERRED, desire || fear ? 0.46 : 0),
      action_tendency: field(flawRule.value === "impulsiveness" ? "act_first" : flawRule.value === "control_or_pride" ? "control_first" : "", flawRule.value ? SOURCE.INFERRED : SOURCE.EMPTY, flawRule.value ? 0.5 : 0, flawRule.evidence),
    },
    drama_leverage_layer: {
      external_pressure: field(pressureRule.value, pressureRule.value ? SOURCE.INFERRED : SOURCE.EMPTY, pressureRule.value ? 0.6 : 0, pressureRule.evidence),
      inner_contradiction: field(contradictions[0] || "", contradictions.length ? SOURCE.INFERRED : SOURCE.EMPTY, contradictions.length ? 0.55 : 0),
      moral_dilemma: field("", SOURCE.EMPTY, 0),
      exploitable_flaws: listField(flawRule.value ? [flawRule.value] : [], flawRule.value ? SOURCE.INFERRED : SOURCE.EMPTY, flawRule.value ? 0.58 : 0, flawRule.evidence),
      trigger_events: listField([], SOURCE.EMPTY, 0),
      stakes: field(pickFirstByPatterns(combined, [/(?:代价|后果|否则|一旦)([^。；;\n]+)/]), SOURCE.INFERRED, 0.48),
      conflict_vectors: listField(unique([
        pressureRule.value ? pressureRule.value : "",
        relationshipEdges.some((item) => item.polarity.value === "negative") ? "relationship_opposition" : "",
        desire && fear ? "desire_vs_fear" : "",
      ]), SOURCE.INFERRED, 0.56),
    },
    relationship_hint_layer: {
      relationship_edges: relationshipEdges,
      alliance_candidates: listField(relationshipEdges.filter((item) => item.polarity.value === "positive").map((item) => item.target.value), SOURCE.INFERRED, 0.55),
      opposition_candidates: listField(relationshipEdges.filter((item) => item.polarity.value === "negative").map((item) => item.target.value), SOURCE.INFERRED, 0.55),
      dependency_points: listField(splitClauses(relationshipNetwork).filter((item) => /依赖|欠|控制|交易|保护|利用/.test(item)), SOURCE.INFERRED, 0.5),
    },
    consistency_checks: {
      missing_fields: missingFields,
      contradictions,
      risk_notes: missingFields.length
        ? ["结构化结果存在空字段，下游冲突挖掘应降低相关字段权重。"]
        : [],
    },
  };
};

export const buildRoleProfileStructuredOutput = (input = {}) => inferRoleProfile(input);
