export type PreferenceKey = "platform" | "tone" | "camera_style" | "risk_posture";

export type PreferenceSuggestion = {
  id: string;
  key: PreferenceKey;
  value: string | string[];
  reason: string;
  source: "explicit_command" | "stable_phrase";
};

const PLATFORM_OPTIONS = ["抖音", "小红书", "视频号", "快手"] as const;
const TONE_OPTIONS = ["真实生活感", "高级感", "强转化", "搞笑", "专业科普"] as const;
const CAMERA_STYLE_OPTIONS = ["特写多", "POV", "节奏快", "镜头更稳", "多景别"] as const;
const RISK_OPTIONS = ["更保守", "平衡", "更激进"] as const;

const STABLE_MARKER_REGEX =
  /(以后|今后|从现在开始|默认|长期|一直|更喜欢|偏爱|习惯|爱用|语气更|镜头多|镜头更|风控更)/;

const splitMaybeMulti = (value: string): string[] => {
  return String(value || "")
    .split(/[、,，\s/]+/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const unique = (items: string[]): string[] => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!item || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
};

const normalizeCameraText = (text: string): string => {
  const raw = String(text || "").trim().toUpperCase();
  if (!raw) return "";
  if (raw.includes("POV")) return "POV";
  if (raw.includes("特写")) return "特写多";
  if (raw.includes("节奏快") || raw.includes("快节奏")) return "节奏快";
  if (raw.includes("镜头更稳") || raw.includes("稳一点") || raw.includes("更稳")) return "镜头更稳";
  if (raw.includes("多景别")) return "多景别";
  return String(text || "").trim();
};

const matchByContains = (text: string, options: readonly string[]): string[] => {
  const source = String(text || "");
  const hits: string[] = [];
  for (const option of options) {
    if (source.includes(option)) hits.push(option);
  }
  return unique(hits);
};

function normalizeToneValues(values: string[]): string[] {
  const hits: string[] = [];
  for (const item of values) {
    for (const option of TONE_OPTIONS) {
      if (item.includes(option)) hits.push(option);
    }
  }
  return unique(hits);
}

function normalizeCameraValues(values: string[]): string[] {
  const out: string[] = [];
  for (const item of values) {
    const normalized = normalizeCameraText(item);
    if (CAMERA_STYLE_OPTIONS.includes(normalized as (typeof CAMERA_STYLE_OPTIONS)[number])) {
      out.push(normalized);
      continue;
    }
    for (const option of CAMERA_STYLE_OPTIONS) {
      if (String(item || "").includes(option)) out.push(option);
    }
  }
  return unique(out);
}

function normalizeRiskValue(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.includes("更保守") || raw === "保守") return "更保守";
  if (raw.includes("更激进") || raw === "激进") return "更激进";
  if (raw.includes("平衡")) return "平衡";
  return "";
}

function normalizePlatformValue(value: string): string {
  const raw = String(value || "").trim();
  for (const option of PLATFORM_OPTIONS) {
    if (raw.includes(option)) return option;
  }
  return "";
}

function parseExplicitCommand(text: string): PreferenceSuggestion[] {
  const source = String(text || "");
  const suggestions: PreferenceSuggestion[] = [];

  const platformMatch = source.match(/偏好平台\s*[:=]\s*([^\n。；;]+)/);
  if (platformMatch?.[1]) {
    const platform = normalizePlatformValue(platformMatch[1]);
    if (platform) {
      suggestions.push({
        id: `suggest_platform_${platform}`,
        key: "platform",
        value: platform,
        reason: "检测到显式偏好命令：偏好平台=...",
        source: "explicit_command",
      });
    }
  }

  const toneMatch = source.match(/偏好语气\s*[:=]\s*([^\n。；;]+)/);
  if (toneMatch?.[1]) {
    const tones = normalizeToneValues(splitMaybeMulti(toneMatch[1]));
    if (tones.length) {
      suggestions.push({
        id: `suggest_tone_${tones.join("_")}`,
        key: "tone",
        value: tones,
        reason: "检测到显式偏好命令：偏好语气=...",
        source: "explicit_command",
      });
    }
  }

  const cameraMatch = source.match(/镜头偏好\s*[:=]\s*([^\n。；;]+)/);
  if (cameraMatch?.[1]) {
    const styles = normalizeCameraValues(splitMaybeMulti(cameraMatch[1]));
    if (styles.length) {
      suggestions.push({
        id: `suggest_camera_${styles.join("_")}`,
        key: "camera_style",
        value: styles,
        reason: "检测到显式偏好命令：镜头偏好=...",
        source: "explicit_command",
      });
    }
  }

  const riskMatch = source.match(/风控偏好\s*[:=]\s*([^\n。；;]+)/);
  if (riskMatch?.[1]) {
    const risk = normalizeRiskValue(riskMatch[1]);
    if (risk) {
      suggestions.push({
        id: `suggest_risk_${risk}`,
        key: "risk_posture",
        value: risk,
        reason: "检测到显式偏好命令：风控偏好=...",
        source: "explicit_command",
      });
    }
  }

  return suggestions;
}

function parseStablePhrase(text: string): PreferenceSuggestion[] {
  const source = String(text || "");
  const marker = source.match(STABLE_MARKER_REGEX);
  if (!marker) return [];

  const suggestions: PreferenceSuggestion[] = [];

  const platformHits = matchByContains(source, PLATFORM_OPTIONS);
  if (platformHits.length) {
    suggestions.push({
      id: `suggest_platform_${platformHits[0]}`,
      key: "platform",
      value: platformHits[0],
      reason: `检测到长期偏好表达（${marker[1]}）`,
      source: "stable_phrase",
    });
  }

  const toneHits = normalizeToneValues(matchByContains(source, TONE_OPTIONS));
  if (toneHits.length && /(语气|风格|口播|内容调性)/.test(source)) {
    suggestions.push({
      id: `suggest_tone_${toneHits.join("_")}`,
      key: "tone",
      value: toneHits,
      reason: `检测到长期语气偏好（${marker[1]}）`,
      source: "stable_phrase",
    });
  }

  const cameraCandidates = [
    ...matchByContains(source, CAMERA_STYLE_OPTIONS),
    ...(source.includes("特写") ? ["特写多"] : []),
    ...(/pov/i.test(source) ? ["POV"] : []),
    ...(source.includes("节奏快") || source.includes("快节奏") ? ["节奏快"] : []),
    ...(source.includes("镜头更稳") || source.includes("稳一点") || source.includes("更稳")
      ? ["镜头更稳"]
      : []),
    ...(source.includes("多景别") ? ["多景别"] : []),
  ];
  const cameraHits = normalizeCameraValues(cameraCandidates);
  if (cameraHits.length && /镜头|画面|剪辑/.test(source)) {
    suggestions.push({
      id: `suggest_camera_${cameraHits.join("_")}`,
      key: "camera_style",
      value: cameraHits,
      reason: `检测到长期镜头偏好（${marker[1]}）`,
      source: "stable_phrase",
    });
  }

  const riskHits = matchByContains(source, RISK_OPTIONS);
  if (riskHits.length && /风控|风险|审查|合规/.test(source)) {
    suggestions.push({
      id: `suggest_risk_${riskHits[0]}`,
      key: "risk_posture",
      value: riskHits[0],
      reason: `检测到长期风控偏好（${marker[1]}）`,
      source: "stable_phrase",
    });
  }

  return suggestions;
}

export function detectPreferenceSuggestions(text: string): PreferenceSuggestion[] {
  const source = String(text || "").trim();
  if (!source) return [];

  const explicit = parseExplicitCommand(source);
  if (explicit.length) {
    return explicit;
  }

  return parseStablePhrase(source);
}
