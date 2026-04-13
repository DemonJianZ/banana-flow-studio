import { extractProductKeyword } from "../api/agentCanvas";

export type Intent =
  | "CANVAS"
  | "CHITCHAT"
  | "DRAMA"
  | "HELP"
  | "SCRIPT"
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

const DRAMA_KEYWORDS = [
  "短剧",
  "竖屏短剧",
  "剧情大纲",
  "分集大纲",
  "打脸场景",
  "悬念钩子",
  "人物小传",
];

const CANVAS_KEYWORDS = [
  "画布",
  "工作流",
  "workflow",
  "节点",
  "组件",
  "搭建",
  "编排",
  "串联",
  "连接",
  "流程",
  "自动搭建",
  "自动编排",
  "帮我搭",
  "帮我建",
  "帮我排",
];

const CANVAS_COMPONENT_TERMS = [
  "提示词输入",
  "上传",
  "图片上传",
  "视频上传",
  "图片生成",
  "文生图",
  "图生图",
  "视频生成",
  "图生视频",
  "本地文生图",
  "本地图生视频",
  "背景移除",
  "抠图",
  "特征提取",
  "多角度镜头",
  "输出",
  "结果输出",
  "rmbg",
];

const WEAK_SCRIPT_TERMS = ["脚本", "口播", "选题", "爆款", "文案", "带货"];
const WEAK_DRAMA_TERMS = ["短剧", "剧情大纲", "分集", "打脸场景", "人物小传"];
const WEAK_CANVAS_TERMS = ["画布", "工作流", "节点", "组件", "搭建", "编排", "流程", "串联"];
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

function hasTerm(text: string, terms: string[]): string | null {
  for (const term of terms) {
    if (text.includes(term.toLowerCase())) return term;
  }
  return null;
}

function weakIntentFallback(raw: string, normalized: string): DetectIntentResult | null {
  const weakCanvas = hasTerm(normalized, WEAK_CANVAS_TERMS);
  if (weakCanvas) {
    return { intent: "CANVAS", reason: `weak:${weakCanvas}` };
  }

  const weakScript = hasTerm(normalized, WEAK_SCRIPT_TERMS);
  if (weakScript) {
    const product = extractProductKeyword(raw) || undefined;
    return { intent: "SCRIPT", product, reason: `weak:${weakScript}` };
  }

  const weakDrama = hasTerm(normalized, WEAK_DRAMA_TERMS);
  if (weakDrama) {
    return { intent: "DRAMA", reason: `weak:${weakDrama}` };
  }

  const weakHelp = hasTerm(normalized, WEAK_HELP_TERMS);
  if (weakHelp) return { intent: "HELP", reason: `weak:${weakHelp}` };

  const weakChitchat = hasTerm(normalized, WEAK_CHITCHAT_TERMS);
  if (weakChitchat) return { intent: "CHITCHAT", reason: `weak:${weakChitchat}` };

  return null;
}

export function detectIntent(text: string, _sessionState: any): DetectIntentResult {
  const raw = String(text || "").trim();
  const normalized = normalizeText(raw);
  if (!raw) return { intent: "UNKNOWN", reason: "empty_input" };

  const hitCanvas = findFirstKeyword(normalized, CANVAS_KEYWORDS);
  const hitDrama = findFirstKeyword(normalized, DRAMA_KEYWORDS);
  const hitScript = findFirstKeyword(normalized, SCRIPT_KEYWORDS);
  const hitHelp = findFirstKeyword(normalized, HELP_KEYWORDS);
  const hitChitchat = findFirstKeyword(normalized, CHITCHAT_KEYWORDS);

  const hasCanvasComponent = CANVAS_COMPONENT_TERMS.some((term) => normalized.includes(term.toLowerCase()));
  if (hitCanvas || hasCanvasComponent) {
    return { intent: "CANVAS", reason: hitCanvas ? `keyword:${hitCanvas}` : "component_term_match" };
  }

  if (hitDrama) {
    return { intent: "DRAMA", reason: `keyword:${hitDrama}` };
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

  const weak = weakIntentFallback(raw, normalized);
  if (weak) return weak;

  return { intent: "UNKNOWN", reason: "no_keyword_match" };
}
