import { extractProductKeyword } from "../api/agentCanvas";

export type Intent =
  | "CHITCHAT"
  | "HELP"
  | "SCRIPT"
  | "STORYBOARD"
  | "VIDEO"
  | "EXPORT"
  | "UNKNOWN";

type DetectIntentResult = {
  intent: Intent;
  product?: string;
  reason: string;
};

const CHITCHAT_KEYWORDS = [
  "你好",
  "hi",
  "hello",
  "在吗",
  "谢谢",
  "哈哈",
  "早上好",
  "晚安",
  "拜拜",
  "bye",
];

const HELP_KEYWORDS = [
  "你能做什么",
  "怎么用",
  "帮助",
  "功能",
  "支持什么",
  "示例",
  "教程",
  "怎么开始",
];

const SCRIPT_KEYWORDS = [
  "脚本",
  "口播",
  "选题",
  "爆款",
  "文案",
  "带货",
  "标题",
  "开场",
  "钩子",
];

const STORYBOARD_KEYWORDS = [
  "分镜",
  "镜头",
  "画面",
  "shot",
  "拆镜头",
  "脚本拆镜头",
];

const EXPORT_KEYWORDS = [
  "导出",
  "渲染",
  "ffmpeg",
  "render.sh",
  "打包",
];

const VIDEO_KEYWORDS = [
  "生成视频",
  "出视频",
  "成片",
  "视频成片",
  "动态视频",
  "视频生成",
  "一键成片",
  "i2v",
];

const WEAK_SCRIPT_TERMS = ["脚本", "口播", "选题", "爆款", "文案", "带货"];
const WEAK_STORYBOARD_TERMS = ["分镜", "镜头", "画面", "shot"];
const WEAK_EXPORT_TERMS = ["导出", "打包", "渲染", "ffmpeg", "render"];
const WEAK_VIDEO_TERMS = ["成片", "视频", "动态视频", "视频生成", "i2v"];
const WEAK_HELP_TERMS = ["帮助", "怎么用", "你能做什么", "示例"];
const WEAK_CHITCHAT_TERMS = ["你好", "在吗", "谢谢", "哈哈", "晚安", "拜拜"];

function normalizeText(text: string): string {
  return String(text || "").trim().toLowerCase();
}

function findFirstKeyword(text: string, keywords: string[]): string | null {
  for (const keyword of keywords) {
    if (text.includes(keyword.toLowerCase())) return keyword;
  }
  return null;
}

function hasResultContext(sessionState: any): boolean {
  const turns = sessionState?.turns || [];
  return turns.some((turn: any) => turn?.response && turn?.status === "done");
}

function hasEditPlanContext(sessionState: any): boolean {
  const turns = sessionState?.turns || [];
  return turns.some((turn: any) => {
    const plans = turn?.localEditPlans || turn?.response?.edit_plans || [];
    return turn?.status === "done" && plans.length > 0;
  });
}

function hasTerm(text: string, terms: string[]): string | null {
  for (const term of terms) {
    if (text.includes(term.toLowerCase())) return term;
  }
  return null;
}

function weakIntentFallback(raw: string, normalized: string): DetectIntentResult | null {
  const weakScript = hasTerm(normalized, WEAK_SCRIPT_TERMS);
  if (weakScript) {
    const product = extractProductKeyword(raw) || undefined;
    return { intent: "SCRIPT", product, reason: `weak:${weakScript}` };
  }

  const weakStoryboard = hasTerm(normalized, WEAK_STORYBOARD_TERMS);
  if (weakStoryboard) {
    const product = extractProductKeyword(raw) || undefined;
    return { intent: "STORYBOARD", product, reason: `weak:${weakStoryboard}` };
  }

  const weakExport = hasTerm(normalized, WEAK_EXPORT_TERMS);
  if (weakExport) return { intent: "EXPORT", reason: `weak:${weakExport}` };

  const weakVideo = hasTerm(normalized, WEAK_VIDEO_TERMS);
  if (weakVideo) {
    const product = extractProductKeyword(raw) || undefined;
    return { intent: "VIDEO", product, reason: `weak:${weakVideo}` };
  }

  const weakHelp = hasTerm(normalized, WEAK_HELP_TERMS);
  if (weakHelp) return { intent: "HELP", reason: `weak:${weakHelp}` };

  const weakChitchat = hasTerm(normalized, WEAK_CHITCHAT_TERMS);
  if (weakChitchat) return { intent: "CHITCHAT", reason: `weak:${weakChitchat}` };

  return null;
}

export function detectIntent(text: string, sessionState: any): DetectIntentResult {
  const raw = String(text || "").trim();
  const normalized = normalizeText(raw);
  if (!raw) return { intent: "UNKNOWN", reason: "empty_input" };

  const hitExport = findFirstKeyword(normalized, EXPORT_KEYWORDS);
  const hitVideo = findFirstKeyword(normalized, VIDEO_KEYWORDS);
  const hitStoryboard = findFirstKeyword(normalized, STORYBOARD_KEYWORDS);
  const hitScript = findFirstKeyword(normalized, SCRIPT_KEYWORDS);
  const hitHelp = findFirstKeyword(normalized, HELP_KEYWORDS);
  const hitChitchat = findFirstKeyword(normalized, CHITCHAT_KEYWORDS);

  if (hitVideo) {
    const product = extractProductKeyword(raw) || undefined;
    return { intent: "VIDEO", product, reason: `keyword:${hitVideo}` };
  }

  if (hitExport) {
    return { intent: "EXPORT", reason: `keyword:${hitExport}` };
  }

  if (hitStoryboard) {
    const product = extractProductKeyword(raw) || undefined;
    return {
      intent: "STORYBOARD",
      product,
      reason: `keyword:${hitStoryboard}`,
    };
  }

  if (hitScript) {
    const product = extractProductKeyword(raw) || undefined;
    return { intent: "SCRIPT", product, reason: `keyword:${hitScript}` };
  }

  if (hitHelp) {
    return { intent: "HELP", reason: `keyword:${hitHelp}` };
  }

  if (hitChitchat && raw.length <= 20) {
    return { intent: "CHITCHAT", reason: `keyword:${hitChitchat}` };
  }

  if (hasEditPlanContext(sessionState) && /(导出|打包|渲染|render)/i.test(raw)) {
    return { intent: "EXPORT", reason: "context_export_hint" };
  }

  if (hasResultContext(sessionState) && /(继续|下一步|再来|接着)/.test(raw)) {
    return { intent: "STORYBOARD", reason: "context_continue" };
  }

  const weak = weakIntentFallback(raw, normalized);
  if (weak) return weak;

  return { intent: "UNKNOWN", reason: "no_keyword_match" };
}
