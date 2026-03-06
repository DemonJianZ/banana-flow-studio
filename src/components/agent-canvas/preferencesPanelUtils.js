export const PREFERENCE_FIELDS = [
  {
    key: "platform",
    label: "平台偏好",
    type: "single",
    options: ["抖音", "小红书", "视频号", "快手"],
  },
  {
    key: "tone",
    label: "语气偏好",
    type: "multi",
    options: ["真实生活感", "高级感", "强转化", "搞笑", "专业科普"],
  },
  {
    key: "camera_style",
    label: "镜头偏好",
    type: "multi",
    options: ["特写多", "POV", "节奏快", "镜头更稳", "多景别"],
  },
  {
    key: "risk_posture",
    label: "风控偏好",
    type: "single",
    options: ["更保守", "平衡", "更激进"],
  },
];

export const HOT_KEYS = new Set(["platform", "tone"]);

export const DEFAULT_PREFS = {
  platform: "抖音",
  tone: ["真实生活感"],
  camera_style: ["镜头更稳"],
  risk_posture: "平衡",
};

export const QUICK_TEMPLATES = [
  {
    id: "tpl_xhs_default",
    label: "默认平台=小红书",
    description: "适合内容种草表达",
    values: {
      platform: "小红书",
      tone: ["真实生活感"],
      risk_posture: "平衡",
    },
  },
  {
    id: "tpl_douyin_convert",
    label: "抖音强转化",
    description: "偏短平快+高转化",
    values: {
      platform: "抖音",
      tone: ["强转化"],
      camera_style: ["节奏快", "特写多"],
    },
  },
  {
    id: "tpl_safe_professional",
    label: "专业科普+保守",
    description: "合规优先的稳健表达",
    values: {
      tone: ["专业科普"],
      risk_posture: "更保守",
      camera_style: ["镜头更稳"],
    },
  },
];

export const asArray = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  const text = String(value || "").trim();
  if (!text) return [];
  return [text];
};

export const normalizeImportedProfile = (raw) => {
  if (!raw || typeof raw !== "object") return null;
  const values = raw.values && typeof raw.values === "object" ? raw.values : raw;
  const filtered = {};
  for (const field of PREFERENCE_FIELDS) {
    const value = values[field.key];
    if (value === undefined || value === null) continue;
    if (field.type === "multi") {
      const next = asArray(value);
      if (next.length > 0) filtered[field.key] = next;
      continue;
    }
    const next = String(value || "").trim();
    if (next) filtered[field.key] = next;
  }
  if (Object.keys(filtered).length === 0) return null;
  return {
    id: `profile_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: String(raw.name || raw.profile_name || "导入偏好档案").slice(0, 40),
    values: filtered,
    created_at: new Date().toISOString(),
  };
};

export const countActivePreferences = (preferencesByKey) =>
  Object.values(preferencesByKey || {}).filter((item) => item && item.is_active !== false).length;

export const buildClearablePreferenceKeys = (preferencesByKey) =>
  Object.keys(preferencesByKey || {}).filter(
    (key) => preferencesByKey[key] && preferencesByKey[key].is_active !== false,
  );
