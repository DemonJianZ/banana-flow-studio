import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  Upload,
  Image as ImageIcon,
  Wand2,
  Download,
  X,
  Play,
  Plus,
  Zap,
  MousePointer2,
  Layers,
  Loader2,
  Images,
  ImagePlus,
  Minus,
  Maximize,
  Trash2,
  Undo,
  Redo,
  Copy,
  Clipboard,
  Hand,
  ShoppingBag,
  MessageSquare,
  AlertCircle,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Info,
  Settings2,
  History,
  TrendingUp,
  RefreshCw,
  LayoutGrid,
  Square,
  CheckCircle2,
  Sun,
  Sparkles,
  Sliders,
  Palette,
  Clapperboard,
  Film,
  WifiOff,
  FileWarning,
  ArrowRight,
  Cpu,
  MoreHorizontal,
  RotateCcw,
  Link as LinkIcon,
  Server,
  Activity,
  Layout,
  Send,
  Scan,
  Scissors,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  GripVertical,
} from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { useNavigate } from "../router";
import TopicCards from "../components/agent-canvas/TopicCards";
import StoryboardView from "../components/agent-canvas/StoryboardView";
import AssetMatchView from "../components/agent-canvas/AssetMatchView";
import EditPlanView from "../components/agent-canvas/EditPlanView";
import ExportPanel from "../components/agent-canvas/ExportPanel";
import PreferenceSuggestionCard from "../components/agent-canvas/PreferenceSuggestionCard";
import {
  readAgentDevMode,
  readAiChatAnchorDebugState,
  writeAgentDevMode,
  writeAiChatAnchorDebugState,
} from "../lib/aiChatAnchorDebug";
import {
  extractProductKeyword,
  generateAgentChitchat,
  exportIdeaScriptFfmpegBundle,
  generateIdeaScriptMission,
  generateIdeaScriptVideo,
  planAgentCanvas,
} from "../api/agentCanvas";
import {
  listPreferences as listMemoryPreferences,
  setPreference as setMemoryPreference,
} from "../api/memoryPreferences";
import { harvestEvalCase } from "../api/qualityFeedback";
import {
  aiChatAnchor,
  aiChatStream,
  AI_CHAT_ANCHOR_OPERATE_ENUM_1,
  AI_CHAT_PART_ENUM_6,
  AI_CHAT_PART_ENUM_203,
  AI_CHAT_PART_ENUM_204,
  AI_CHAT_PART_ENUM_207,
  AI_CHAT_PART_ENUM_209,
  AI_CHAT_PART_ENUM_210,
  AI_CHAT_PART_ENUM_211,
  isLoginRequiredError,
  resolveMemberAuthorizationInfo,
  submitAIChatImageTask,
  viewAIChatModelParams,
  viewAIChatModels,
} from "../api/aiChat";
import { viewMemberInfo } from "../api/memberInfo";
import { viewUserAuths } from "../api/userAuths";
import { detectIntent } from "../agent/router";
import { detectPreferenceSuggestions } from "../agent/preferenceSuggestion";
import { buildHitlFeedbackRows } from "../agent/hitlFeedbackHistory";
import { AI_CHAT_IMAGE_MODEL_ID_NANO_BANANA2 } from "../config";
import { findAIChatModelIdByKeywords } from "../lib/aiChatModelResolver";

const PreferencesPanel = React.lazy(() => import("../components/agent-canvas/PreferencesPanel"));

// ==========================================
// Config & Constants
// ==========================================
const generateId = () => Math.random().toString(36).substr(2, 9);
const GRID_SIZE = 20;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3;
const CANVAS_KEY = "bananaflow_canvas_id";
const AGENT_SESSION_STORE_KEY = "bananaflow_agent_canvas_sessions_v1";
const AGENT_RUN_STEPS = [
  "推断受众",
  "生成脚本",
  "合规扫描",
  "生成分镜",
  "素材匹配",
  "生成剪辑计划",
];
const AGENT_WARNING_KEYS = [
  { key: "inference_warning", label: "Inference" },
  { key: "compliance_warning", label: "Compliance" },
  { key: "edit_plan_warning", label: "EditPlan" },
  { key: "budget_exhausted", label: "Budget" },
];
const AGENT_QUICK_ACTIONS = [
  { id: "script", label: "生成爆款脚本" },
  { id: "storyboard", label: "生成分镜" },
  { id: "video", label: "生成成片视频" },
  { id: "export", label: "导出渲染包" },
  { id: "export_now", label: "现在导出渲染包" },
  { id: "help", label: "查看示例" },
];
const AGENT_DEFAULT_QUICK_ACTION_IDS = ["script", "storyboard", "video", "export", "help"];
const AGENT_SCRIPT_EXAMPLES = [
  "帮我写一个洗面奶的爆款口播脚本，主打温和清洁和控油",
  "帮我写一个防晒霜的小红书种草脚本，突出清爽不搓泥",
  "帮我写一个眼霜的直播带货脚本，突出淡纹和保湿",
  "帮我写一个面膜的15秒短视频脚本，强调急救补水",
  "帮我写一个洗发水的对比型爆款脚本，突出去屑控油",
];
const AGENT_CANVAS_EXAMPLES = [
  "帮我搭一个文生图接图生视频流程",
  "帮我搭一个上传图片后去背景再输出",
  "帮我搭一个本地文生图流程",
  "帮我搭一个上传商品图后做多角度镜头",
  "帮我搭一个上传图片后做特征提取再输出",
];
const AGENT_PRODUCT_CHIPS = [
  "洗面奶",
  "防晒",
  "眼霜",
  "面膜",
  "精华",
  "粉底",
  "卸妆",
  "身体乳",
  "洗发水",
  "益生菌",
];
const CHAT_PANEL_COLLAPSED_HEIGHT = 50;
const CHAT_PANEL_COLLAPSED_WIDTH = 168;

const isFlagEnabled = (...values) =>
  values.some((value) =>
    ["1", "true", "yes", "on"].includes(String(value || "0").trim().toLowerCase()),
  );

const HITL_FEEDBACK_UI_ENABLED = isFlagEnabled(
  import.meta.env.VITE_ENABLE_HITL_FEEDBACK,
  import.meta.env.VITE_BANANAFLOW_ENABLE_HITL_FEEDBACK,
);

const HITL_FEEDBACK_REASON_OPTIONS = [
  "资产匹配回归",
  "生成脚本失败",
  "导出结果异常",
  "偏好建议误判",
  "其他",
];
const EMPTY_LIST = Object.freeze([]);

const LOADING_TIPS = [
  "正在重塑光影氛围...",
  "AI 正在计算物体表面漫反射...",
  "正在生成帧间动态光流...",
  "正在计算物理碰撞与运动轨迹...",
  "正在渲染关键帧插值...",
  "正在构思光影布局...",
  "精彩马上呈现...",
];

const MODES_WITHOUT_APP_AUTH = new Set([
  "bg_replace",
  "gesture_swap",
  "product_swap",
  "local_text2img",
  "rmbg",
  "feature_extract",
  "multi_angleshots",
]);

const HIDDEN_IMAGE_CONFIG_MODES = new Set([
  "bg_replace",
  "gesture_swap",
  "product_swap",
]);

const makeAgentId = () => Math.random().toString(36).slice(2, 10);

const buildRouteDebug = (route, backendCalled) => ({
  intent: route?.intent || "UNKNOWN",
  product: route?.product || "",
  reason: route?.reason || "",
  backendCalled: !!backendCalled,
});

const getChitchatReply = (text) => {
  const message = String(text || "").toLowerCase();
  if (message.includes("谢谢")) return "不客气，我在这儿，随时可以开始做脚本。";
  if (message.includes("晚安")) return "晚安，明天继续做内容也可以。";
  if (message.includes("拜拜") || message.includes("bye")) return "回头见，需要时直接叫我。";
  return "我在。你可以让我生成脚本、分镜，或者导出渲染包。";
};

const AGENT_HELP_TEXT = [
  "我可以帮你做：",
  "0) 自动搭画布：输入“帮我搭一个文生图接图生视频流程”",
  "1) 爆款脚本：输入“帮我做一个洗面奶爆款脚本”",
  "2) 分镜查看：输入“给我生成分镜”",
  "3) 生成视频：输入“帮我生成成片视频”",
  "4) 导出渲染包：输入“导出 ffmpeg 渲染包”",
  "",
  "示例：",
  "• 帮我写一个防晒的口播脚本",
  "• 把上一个脚本拆成分镜",
  "• 导出刚才的渲染包",
].join("\n");

const createDefaultAgentSession = () => ({
  id: `session_${makeAgentId()}`,
  title: "新会话",
  createdAt: Date.now(),
  updatedAt: Date.now(),
  turns: [],
  pendingTask: null,
});

const cloneDeep = (obj) => JSON.parse(JSON.stringify(obj));

const readFilesAsDataUrls = (files) =>
  Promise.all(
    Array.from(files || []).map(
      (file) =>
        new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(file);
        }),
    ),
  );

const shortenSessionTitle = (text, maxLen = 16) => {
  const value = String(text || "").trim();
  if (!value) return "新会话";
  return value.length > maxLen ? `${value.slice(0, maxLen)}...` : value;
};

const loadAgentStore = () => {
  try {
    const text = localStorage.getItem(AGENT_SESSION_STORE_KEY);
    if (!text) {
      const session = createDefaultAgentSession();
      return { sessions: [session], activeSessionId: session.id };
    }
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed?.sessions) || parsed.sessions.length === 0) {
      const session = createDefaultAgentSession();
      return { sessions: [session], activeSessionId: session.id };
    }
    const staleRunningError = "任务已中断：页面刷新或上次请求未完成，请重新发起。";
    const sessions = parsed.sessions.map((session) => ({
      ...session,
      turns: Array.isArray(session?.turns)
        ? session.turns.map((turn) =>
            turn?.status === "running"
              ? {
                  ...turn,
                  status: "error",
                  error: turn?.error || staleRunningError,
                }
              : turn,
          )
        : [],
      pendingTask: session?.pendingTask || null,
    }));
    return {
      sessions,
      activeSessionId: parsed.activeSessionId || sessions[0].id,
    };
  } catch {
    const session = createDefaultAgentSession();
    return { sessions: [session], activeSessionId: session.id };
  }
};

const saveAgentStore = (store) => {
  localStorage.setItem(AGENT_SESSION_STORE_KEY, JSON.stringify(store));
};

const resolveMemberDisplayName = (response) => {
  const pickValue = (record) => {
    if (typeof record === "string") return record.trim();
    if (!record || typeof record !== "object") return "";
    const value =
      record.name ||
      record.nickname ||
      record.nick_name ||
      record.real_name ||
      record.user_name ||
      record.username ||
      record.member_name ||
      record.email ||
      record.mobile ||
      record.phone;
    return String(value || "").trim();
  };

  const directValue = pickValue(resolveMemberRecord(response));
  if (directValue) return directValue;

  const visited = new Set();
  const queue = [response];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== "object" || Array.isArray(current) || visited.has(current)) {
      continue;
    }
    visited.add(current);

    const value = pickValue(current);
    if (value) return value;

    if (current.data && typeof current.data === "object") queue.push(current.data);
    if (current.user && typeof current.user === "object") queue.push(current.user);
    if (current.member && typeof current.member === "object") queue.push(current.member);
    if (current.info && typeof current.info === "object") queue.push(current.info);
  }

  return "";
};

const resolveMemberRecord = (response) => {
  const visited = new Set();
  const queue = [response];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== "object" || Array.isArray(current) || visited.has(current)) {
      continue;
    }
    visited.add(current);

    const hasMemberFields =
      current.name ||
      current.nickname ||
      current.nick_name ||
      current.real_name ||
      current.user_name ||
      current.username ||
      current.member_name ||
      current.avatar ||
      current.avatar_url ||
      current.head_img ||
      current.headimgurl ||
      current.photo ||
      current.point !== undefined ||
      current.total_point !== undefined ||
      current.totalPoint !== undefined;

    if (hasMemberFields) return current;

    if (current.data && typeof current.data === "object") queue.push(current.data);
    if (current.user && typeof current.user === "object") queue.push(current.user);
    if (current.member && typeof current.member === "object") queue.push(current.member);
    if (current.info && typeof current.info === "object") queue.push(current.info);
  }

  return null;
};

const resolveMemberAvatar = (response) => {
  const record = resolveMemberRecord(response);
  const value = record?.avatar || record?.avatar_url || record?.head_img || record?.headimgurl || record?.photo;
  return typeof value === "string" ? value.trim() : "";
};

const resolveMemberPoints = (response, fieldNames) => {
  const record = resolveMemberRecord(response);
  if (!record) return null;

  for (const fieldName of fieldNames) {
    const value = record[fieldName];
    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) {
      return numericValue;
    }
  }

  return null;
};

const formatMemberPoints = (value) => {
  if (!Number.isFinite(value)) return "--";
  return new Intl.NumberFormat("zh-CN").format(value);
};

const formatDebugTime = (timestamp) => {
  if (!timestamp) return "--";
  try {
    return new Date(timestamp).toLocaleTimeString("zh-CN", { hour12: false });
  } catch {
    return "--";
  }
};

const stringifyDebugValue = (value) => {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value || "");
  }
};

const buildApiDebugDetailText = (event) => {
  if (!event || typeof event !== "object") return "";
  const lines = [];
  if (event.url) lines.push(`url: ${event.url}`);
  if (event.path) lines.push(`path: ${event.path}`);
  if (event.source) lines.push(`source: ${event.source}`);
  if (Array.isArray(event.candidates) && event.candidates.length) lines.push(`candidates: ${event.candidates.join(" -> ")}`);
  if (event.authorizationSource) lines.push(`auth: ${event.authorizationSource}`);
  if (event.message) lines.push(`message: ${event.message}`);
  if (event.payload !== undefined) {
    lines.push("payload:");
    lines.push(stringifyDebugValue(event.payload));
  }
  if (event.response !== undefined) {
    lines.push("response:");
    lines.push(stringifyDebugValue(event.response));
  }
  return lines.join("\n").trim();
};

const API_DEBUG_DETAIL_KEYS = new Set(["aiChatLang", "aiChatImage", "userAuths", "aiChatAnchor"]);

const API_DEBUG_STATUS_LABEL = {
  idle: "待执行",
  loading: "请求中",
  success: "成功",
  error: "失败",
  timeout: "超时",
  login_required: "需登录",
};

const formatAIChatErrorMessage = (error) => {
  const messageCandidates = [
    error?.message,
    error?.data?.message,
    error?.data?.detail,
    error?.data?.errMsg,
    error?.data?.data?.message,
  ];
  const baseMessage = messageCandidates.find(
    (value) => typeof value === "string" && value.trim(),
  );
  const parts = [];
  if (baseMessage) parts.push(baseMessage.trim());
  if (error?.status !== undefined && error?.status !== null) parts.push(`status=${error.status}`);
  if (error?.errNo !== undefined && error?.errNo !== null) parts.push(`err_no=${error.errNo}`);
  if (error?.source) parts.push(`source=${error.source}`);
  if (error?.path) parts.push(`path=${error.path}`);
  if (parts.length > 0) return parts.join(" | ");
  return "未知错误（无错误信息）";
};

const IMAGE_URL_PATTERN = /(https?:\/\/[^\s"'<>]+?\.(?:png|jpe?g|webp|gif|bmp|svg)(?:\?[^\s"'<>]*)?)/i;
const VIDEO_URL_PATTERN = /(https?:\/\/[^\s"'<>]+?\.(?:mp4|webm|mov|m4v|avi|mkv|m3u8)(?:\?[^\s"'<>]*)?)/i;
const URL_PATTERN = /(https?:\/\/[^\s"'<>]+)/i;
const RELATIVE_IMAGE_PATH_PATTERN = /(\/[^\s"'<>]+?\.(?:png|jpe?g|webp|gif|bmp|svg)(?:\?[^\s"'<>]*)?)/i;
const RELATIVE_VIDEO_PATH_PATTERN = /(\/[^\s"'<>]+?\.(?:mp4|webm|mov|m4v|avi|mkv|m3u8)(?:\?[^\s"'<>]*)?)/i;
const MARKDOWN_IMAGE_PATTERN = /!\[[^\]]*?\]\(([^)]+)\)/i;

const isLikelyImageUrl = (value) => {
  const text = String(value || "").trim();
  if (!text) return false;
  if (text.startsWith("data:image/")) return true;
  if (text.startsWith("blob:")) return true;
  if (text.startsWith("http://") || text.startsWith("https://")) return true;
  if (text.startsWith("/") && RELATIVE_IMAGE_PATH_PATTERN.test(text)) return true;
  return IMAGE_URL_PATTERN.test(text);
};

const pickFirstImageUrl = (payload) => {
  if (!payload) return "";
  if (typeof payload === "string") {
    const text = payload.trim();
    if (!text) return "";
    if (isLikelyImageUrl(text)) return text;
    const markdownImage = text.match(MARKDOWN_IMAGE_PATTERN)?.[1];
    if (markdownImage && isLikelyImageUrl(markdownImage)) return markdownImage.trim();
    if ((text.startsWith("{") && text.endsWith("}")) || (text.startsWith("[") && text.endsWith("]"))) {
      try {
        const parsed = JSON.parse(text);
        const nested = pickFirstImageUrl(parsed);
        if (nested) return nested;
      } catch {
        // ignore invalid JSON string
      }
    }
    const matched = text.match(IMAGE_URL_PATTERN);
    return matched?.[1] || "";
  }
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = pickFirstImageUrl(item);
      if (found) return found;
    }
    return "";
  }
  if (typeof payload !== "object") return "";

  const directKeys = [
    "image",
    "image_url",
    "imageUrl",
    "image_uri",
    "imageUri",
    "image_path",
    "imagePath",
    "url",
    "uri",
    "src",
    "path",
    "file_url",
    "download_url",
    "cdn_url",
    "oss_url",
    "origin_url",
    "output",
    "result",
  ];
  for (const key of directKeys) {
    const found = pickFirstImageUrl(payload[key]);
    if (found) return found;
  }

  const listKeys = ["images", "image_list", "image_urls", "outputs", "results", "attachments", "files", "data", "list", "items"];
  for (const key of listKeys) {
    const found = pickFirstImageUrl(payload[key]);
    if (found) return found;
  }

  for (const value of Object.values(payload)) {
    const found = pickFirstImageUrl(value);
    if (found) return found;
  }
  return "";
};

const isLikelyVideoUrl = (value) => {
  const text = String(value || "").trim();
  if (!text) return false;
  if (text.startsWith("data:video/")) return true;
  if (VIDEO_URL_PATTERN.test(text)) return true;
  if (text.startsWith("/") && RELATIVE_VIDEO_PATH_PATTERN.test(text)) return true;
  if ((text.startsWith("http://") || text.startsWith("https://")) && /(video|mp4|webm|m3u8|play)/i.test(text)) return true;
  return false;
};

const pickFirstVideoUrl = (payload) => {
  if (!payload) return "";
  if (typeof payload === "string") {
    const text = payload.trim();
    if (!text) return "";
    if (isLikelyVideoUrl(text)) return text;
    if ((text.startsWith("{") && text.endsWith("}")) || (text.startsWith("[") && text.endsWith("]"))) {
      try {
        const parsed = JSON.parse(text);
        const nested = pickFirstVideoUrl(parsed);
        if (nested) return nested;
      } catch {
        // ignore invalid JSON string
      }
    }
    const matched = text.match(VIDEO_URL_PATTERN) || text.match(URL_PATTERN);
    return isLikelyVideoUrl(matched?.[1] || "") ? matched[1] : "";
  }
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = pickFirstVideoUrl(item);
      if (found) return found;
    }
    return "";
  }
  if (typeof payload !== "object") return "";

  const directKeys = [
    "video",
    "video_url",
    "videoUrl",
    "video_uri",
    "videoUri",
    "video_path",
    "videoPath",
    "output_video",
    "outputVideo",
    "play_url",
    "playUrl",
    "url",
    "uri",
    "src",
    "path",
    "file_url",
    "download_url",
    "cdn_url",
    "oss_url",
    "origin_url",
    "result",
    "output",
  ];
  for (const key of directKeys) {
    const found = pickFirstVideoUrl(payload[key]);
    if (found) return found;
  }

  const listKeys = ["videos", "video_list", "video_urls", "outputs", "results", "attachments", "files", "data", "list", "items"];
  for (const key of listKeys) {
    const found = pickFirstVideoUrl(payload[key]);
    if (found) return found;
  }

  for (const value of Object.values(payload)) {
    const found = pickFirstVideoUrl(value);
    if (found) return found;
  }
  return "";
};

const summarizeAIChatResponse = (resp) => {
  try {
    const raw = JSON.stringify(resp || {});
    if (!raw) return "";
    return raw.length > 240 ? `${raw.slice(0, 240)}...` : raw;
  } catch {
    const text = String(resp || "");
    return text.length > 240 ? `${text.slice(0, 240)}...` : text;
  }
};

const extractAIChatDoneError = (resp) => {
  // If the stream already yielded a usable image URL, prefer the result and
  // ignore terminal errMsg noise from the upstream SSE protocol.
  if (pickFirstImageUrl(resp)) return "";
  const events = Array.isArray(resp?.events) ? resp.events : EMPTY_LIST;
  for (const event of events) {
    if (!event || typeof event !== "object") continue;
    const isDone = event.finish === true || String(event.event || "").toLowerCase() === "done";
    const errMsg = String(event.errMsg || event.error || event.message || "").trim();
    if (isDone && errMsg) return errMsg;
  }
  return "";
};

const NODE_TYPES = {
  INPUT: "input",
  TEXT_INPUT: "text_input",
  PROCESSOR: "processor",
  POST_PROCESSOR: "post_processor",
  VIDEO_GEN: "video_gen",
  OUTPUT: "output",
};

const AI_CHAT_PART_ENUM_1 = 1;
const AI_CHAT_PART_ENUM_2 = 2;
const AI_CHAT_PART_ENUM_3 = 3;
const AI_CHAT_PART_ENUM_4 = 4;
const AI_CHAT_PART_ENUM_5 = 5;

const DEFAULT_AI_MODELS = [
  { id: "gemini-3-pro-image-preview", name: "Gemini 3 Pro", vendor: "Google", icon: Sparkles },
  { id: "doubao-seedream-4.5", name: "Doubao 4.5", vendor: "ByteDance", icon: Zap },
];

const DEFAULT_VIDEO_MODELS = [
  { id: "Doubao-Seedance-1.0-pro", name: "Doubao Seedance 1.0 Pro", vendor: "ByteDance" },
  { id: "Doubao-Seedance-1.5-pro", name: "Doubao Seedance 1.5 Pro", vendor: "ByteDance" },
];

const VIDEO_MODEL_1_0 = "Doubao-Seedance-1.0-pro";
const VIDEO_MODEL_1_5 = "Doubao-Seedance-1.5-pro";
const VOLC_VIDEO_HD_TEMPLATE_ENUM_1 = 1;
const VOLC_VIDEO_HD_TEMPLATE_ENUM_2 = 2;
const DEFAULT_VIDEO_HD_MODEL_ID = "1";
const DEFAULT_IMAGE_MODEL_ID = DEFAULT_AI_MODELS[0].id;
const DEFAULT_VIDEO_MODEL_ID = DEFAULT_VIDEO_MODELS[0].id;

const pickModelField = (record, keys) => {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
};

const resolveAIChatModelVendor = (record) =>
  pickModelField(record, [
    "vendor",
    "vendor_name",
    "provider",
    "provider_name",
    "company",
    "company_name",
    "platform",
    "platform_name",
    "source",
  ]);

const resolveAIChatModelIcon = (record) => {
  const vendor = resolveAIChatModelVendor(record).toLowerCase();
  const modelId = pickModelField(record, ["model", "model_id", "ai_chat_model", "ai_chat_model_id", "id"]).toLowerCase();
  if (vendor.includes("google") || modelId.includes("gemini")) return Sparkles;
  if (vendor.includes("byte") || vendor.includes("doubao") || modelId.includes("doubao") || modelId.includes("seed")) {
    return Zap;
  }
  return Cpu;
};

const normalizeAIChatModelOption = (record, fallback = {}) => {
  if (typeof record === "string") {
    const value = record.trim();
    return value ? { id: value, name: value, vendor: fallback.vendor || "", icon: fallback.icon || Cpu } : null;
  }
  if (!record || typeof record !== "object") return null;

  const id = pickModelField(record, [
    "model",
    "model_id",
    "ai_chat_model",
    "ai_chat_model_id",
    "id",
    "value",
    "code",
  ]);
  const name = pickModelField(record, [
    "ai_model_name",
    "model_name",
    "ai_chat_model_name",
    "name",
    "label",
    "title",
    "text",
    "desc",
  ]);

  if (!id && !name) return null;

  return {
    id: id || name,
    name: name || id,
    vendor: resolveAIChatModelVendor(record) || fallback.vendor || "",
    icon: fallback.icon || resolveAIChatModelIcon(record),
  };
};

const extractAIChatModelRecords = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return EMPTY_LIST;

  const queue = [payload];
  const visited = new Set();
  const preferredKeys = ["list", "records", "items", "rows", "models", "model_list", "data", "result"];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== "object" || visited.has(current)) continue;
    visited.add(current);

    for (const key of preferredKeys) {
      if (Array.isArray(current[key])) return current[key];
    }

    for (const value of Object.values(current)) {
      if (Array.isArray(value)) return value;
      if (value && typeof value === "object") queue.push(value);
    }
  }

  return EMPTY_LIST;
};

const buildAIChatModelOptions = (payload, fallbackOptions) => {
  const normalized = extractAIChatModelRecords(payload)
    .map((item) => normalizeAIChatModelOption(item))
    .filter(Boolean);

  if (!normalized.length) return fallbackOptions;

  const seen = new Set();
  return normalized.filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
};

const getDefaultImageModelId = (options, allowFallback = false) => {
  const list = Array.isArray(options) ? options : EMPTY_LIST;
  if (!list.length) return allowFallback ? DEFAULT_IMAGE_MODEL_ID : "";
  const preferred = list.find((item) => String(item?.id || "").trim() === "4");
  return preferred?.id || list[0]?.id || (allowFallback ? DEFAULT_IMAGE_MODEL_ID : "");
};
const getDefaultLanguageModelId = (options) => {
  const list = Array.isArray(options) ? options : EMPTY_LIST;
  if (!list.length) return "";
  const preferred = list.find((item) => {
    const id = String(item?.id || "").trim().toLowerCase();
    const name = String(item?.name || "").trim().toLowerCase();
    return name.includes("gemini-3-flash") || id.includes("gemini-3-flash");
  });
  return preferred?.id || list[0]?.id || "";
};
const getDefaultVideoModelId = (options) => {
  if (!Array.isArray(options) || options.length === 0) return DEFAULT_VIDEO_MODEL_ID;
  return options.find((item) => item.id === VIDEO_MODEL_1_0)?.id || options[0].id;
};

const WORKBENCH_AI_CHAT_MODULE_ENUM = "3";

const resolveWorkbenchAIChatPartEnum = ({ mode }) => {
  if (mode === "video_upscale") return AI_CHAT_PART_ENUM_6;
  if (mode === "img2video") return AI_CHAT_PART_ENUM_204;
  if (mode === "feature_extract") return AI_CHAT_PART_ENUM_207;
  if (mode === "workflow_swap") return AI_CHAT_PART_ENUM_209;
  if (mode === "workflow_batch_video") return AI_CHAT_PART_ENUM_210;
  if (mode === "workflow_batch_wordart") return AI_CHAT_PART_ENUM_211;
  return AI_CHAT_PART_ENUM_203;
};

const extractModelParamList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return EMPTY_LIST;
  const queue = [payload];
  const visited = new Set();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== "object" || visited.has(current)) continue;
    visited.add(current);
    if (Array.isArray(current.list)) return current.list;
    for (const value of Object.values(current)) {
      if (Array.isArray(value)) return value;
      if (value && typeof value === "object") queue.push(value);
    }
  }
  return EMPTY_LIST;
};

const sortParamValues = (values) => {
  const list = Array.isArray(values) ? values.slice() : [];
  list.sort((a, b) => {
    const ai = Number(a?.order_index ?? Number.MAX_SAFE_INTEGER);
    const bi = Number(b?.order_index ?? Number.MAX_SAFE_INTEGER);
    return ai - bi;
  });
  return list;
};

const resolveDefaultParamValueId = (paramItem) => {
  const first = sortParamValues(paramItem?.param_values || [])[0];
  const valueId = first?.param_value_id;
  if (valueId === undefined || valueId === null || valueId === "") return "";
  return String(valueId);
};

const resolveAdminFlagFromUserAuths = (payload) => {
  if (!payload || typeof payload !== "object") return false;
  const queue = [payload];
  const visited = new Set();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== "object" || visited.has(current)) continue;
    visited.add(current);
    if (typeof current.is_ok === "boolean") return current.is_ok;
    if (typeof current.isOk === "boolean") return current.isOk;
    for (const value of Object.values(current)) {
      if (value && typeof value === "object") queue.push(value);
    }
  }
  return false;
};

const buildAIChatParamPayload = (paramList) => {
  const payload = {};
  for (const item of paramList) {
    const valueId = resolveDefaultParamValueId(item);
    if (!valueId) continue;
    const name = String(item?.param_name || item?.name || item?.desc || "").toLowerCase();
    if (name.includes("任务") || name.includes("task") || name.includes("类型")) {
      payload.ai_image_param_task_type_id = valueId;
      continue;
    }
    if (name.includes("尺寸") || name.includes("size")) {
      payload.ai_image_param_size_id = valueId;
      continue;
    }
    if (name.includes("分辨率") || name.includes("resolution")) {
      payload.ai_video_param_resolution_id = valueId;
      continue;
    }
    if (name.includes("比例") || name.includes("ratio")) {
      payload.ai_image_param_ratio_id = valueId;
      continue;
    }
    if (name.includes("时长") || name.includes("duration")) {
      payload.ai_video_param_duration_id = valueId;
    }
  }
  return payload;
};

const findAIChatParamItem = (paramList, keywords = []) => {
  const list = Array.isArray(paramList) ? paramList : EMPTY_LIST;
  const lowerKeywords = keywords.map((item) => String(item || "").toLowerCase()).filter(Boolean);
  for (const item of list) {
    const name = String(item?.param_name || item?.name || item?.desc || "").toLowerCase();
    if (!name) continue;
    if (lowerKeywords.some((keyword) => name.includes(keyword))) return item;
  }
  return null;
};

const findAIChatParamValueId = (paramList, keywords = [], preferredValue = "") => {
  const valueText = String(preferredValue || "").trim().toLowerCase();
  if (!valueText) return "";
  const item = findAIChatParamItem(paramList, keywords);
  if (!item) return "";
  const normalizeText = (text) =>
    String(text || "")
      .trim()
      .toLowerCase()
      .replace(/秒|second|seconds|sec|s/gi, "")
      .replace(/\s+/g, "");
  const normalizedPreferred = normalizeText(valueText);
  const values = sortParamValues(item?.param_values || EMPTY_LIST);
  for (const val of values) {
    const candidates = [
      String(val?.param_value || "").trim().toLowerCase(),
      String(val?.remark || "").trim().toLowerCase(),
    ].filter(Boolean);
    if (candidates.includes(valueText)) {
      const id = val?.param_value_id;
      return id === undefined || id === null || id === "" ? "" : String(id);
    }
    if (normalizedPreferred) {
      const matched = candidates.some((candidate) => {
        const normalizedCandidate = normalizeText(candidate);
        if (!normalizedCandidate) return false;
        return (
          normalizedCandidate === normalizedPreferred ||
          normalizedCandidate.includes(normalizedPreferred) ||
          normalizedPreferred.includes(normalizedCandidate)
        );
      });
      if (matched) {
        const id = val?.param_value_id;
        return id === undefined || id === null || id === "" ? "" : String(id);
      }
    }
  }
  return "";
};

const listAIChatParamValues = (paramList, keywords = []) => {
  const item = findAIChatParamItem(paramList, keywords);
  if (!item) return EMPTY_LIST;
  return sortParamValues(item?.param_values || EMPTY_LIST)
    .map((val) => String(val?.param_value || "").trim())
    .filter(Boolean);
};

const TOOL_CARDS = {
  bg_replace: {
    id: "bg_replace",
    name: "一键换背景",
    short: "换背景",
    icon: Layers,
    desc: "保留商品和手，仅替换背景",
    scenario: "主图合成 / 详情页",
    refLabel: "背景参考图",
    category: "generate",
    refRequired: true,
  },
  gesture_swap: {
    id: "gesture_swap",
    name: "参考图换手势",
    short: "换手势",
    icon: Hand,
    desc: "保留商品与背景，迁移手势",
    scenario: "模仿网红手势",
    refLabel: "手势参考图",
    category: "generate",
    refRequired: true,
  },
  product_swap: {
    id: "product_swap",
    name: "保留手势换商品",
    short: "换商品",
    icon: ShoppingBag,
    desc: "保留手势与背景，替换商品",
    scenario: "多商品复用模版",
    refLabel: "新商品图",
    category: "generate",
    refRequired: true,
  },
  text2img: {
    id: "text2img",
    name: "文生图",
    short: "文生图",
    icon: ImagePlus,
    desc: "从零生成营销素材",
    scenario: "灵感构思",
    category: "generate",
    refRequired: false,
  },
  local_text2img: {
    id: "local_text2img",
    name: "本地文生图",
    short: "本地文生图",
    icon: ImagePlus,
    desc: "调用 ComfyUI image_z_image_turbo 工作流",
    scenario: "本地推理 / 低延迟",
    category: "generate",
    refRequired: false,
  },
  multi_image_generate: {
    id: "multi_image_generate",
    name: "图生图",
    short: "图生图",
    icon: Images,
    desc: "参考原图生成新图像",
    scenario: "风格迁移/重绘",
    category: "generate",
    refRequired: false,
  },
  rmbg: {
    id: "rmbg",
    name: "背景移除 (RMBG)",
    short: "背景移除",
    icon: Scissors,
    desc: "自动去除背景，输出透明图",
    scenario: "电商抠图/素材准备",
    category: "skill",
    refRequired: false,
  },
  feature_extract: {
    id: "feature_extract",
    name: "特征提取 (Feature)",
    short: "特征提取",
    icon: Scan,
    desc: "面部/背景/服装首饰特征提取",
    scenario: "素材清理/特征强化",
    category: "skill",
    refRequired: false,
  },
  multi_angleshots: {
    id: "multi_angleshots",
    name: "多角度镜头",
    short: "多角度",
    icon: LayoutGrid,
    desc: "单图扩展 8 个镜头角度",
    scenario: "电商展示/机位扩展",
    category: "skill",
    refRequired: false,
  },
  video_upscale: {
    id: "video_upscale",
    name: "视频超清",
    short: "视频超清",
    icon: TrendingUp,
    desc: "视频清晰度增强（自动按 3 秒切片）",
    scenario: "低清视频修复",
    category: "skill",
    refRequired: false,
  },
  relight: {
    id: "relight",
    name: "智能打光 (Relight)",
    short: "光影精修",
    icon: Sun,
    desc: '修复光线不自然，重塑光影',
    scenario: '解决"贴图感" / 氛围增强',
    refLabel: "光影参考图",
    category: "enhance",
    refRequired: false,
  },
  upscale: {
    id: "upscale",
    name: "高清放大 (Upscale)",
    short: "超清放大",
    icon: TrendingUp,
    desc: "提升分辨率与细节",
    scenario: "最终出图",
    category: "enhance",
    refRequired: false,
  },
  img2video: {
    id: "img2video",
    name: "图生视频",
    short: "生视频",
    icon: Film,
    desc: "静态图片转动态短视频",
    scenario: "电商动态详情 / 社交媒体",
    refLabel: "尾帧参考图",
    category: "video",
    refRequired: false,
  },
  local_img2video: {
    id: "local_img2video",
    name: "本地图生视频",
    short: "本地图生视频",
    icon: Film,
    desc: "调用 ComfyUI Qwen_i2v 工作流",
    scenario: "本地视频生成",
    refLabel: "输入图像",
    category: "video",
    refRequired: false,
  },
};

const FEATURE_EXTRACT_PRESET_PROMPTS = {
  face: "提取画面中的面部特征，保留五官与肤色细节，去除背景与多余元素，结果自然清晰。",
  background: "提取画面中的纯背景，移除所有主体与物体，保持背景干净自然，避免残影。",
  outfit: "提取画面中的服装与首饰，保留材质与纹理细节，弱化人物面部与背景，结果清晰自然。",
};

const THREE_VIEW_PROMPT =
  "A character turnaround sheet on a pure white background, arranged horizontally from left to right: close-up portrait of the face, left side full-body view, front full-body view, back full-body view. Keep the subject's original appearance, hairstyle, outfit, proportions, and design details exactly consistent with the input image. Full-body shots for the side, front, and back views. The face close-up should clearly show the character's facial features and expression. No extra characters, no chibi figure, no additional objects, clean white background, character design sheet style.";

const THREE_VIEW_DEFAULT_TEMPLATES = {
  size: "1K",
  aspect_ratio: "16:9",
  note: "",
};

const MULTI_ANGLE_VARIANTS = [
  { key: "close_up", label: "特写", prompt: "Turn the camera to a close-up.", seed: "304838848282290", filename_prefix: "ComfyUI-close_up" },
  { key: "wide_shot", label: "广角", prompt: "Turn the camera to a wide-angle lens.", seed: "171478573572619", filename_prefix: "ComfyUI-wide_shot" },
  { key: "45_right", label: "右 45°", prompt: "Rotate the camera 45 degrees to the right.", seed: "1085411248135824", filename_prefix: "ComfyUI-45_right" },
  { key: "90_right", label: "右 90°", prompt: "Rotate the camera 90 degrees to the right.", seed: "1055668484280226", filename_prefix: "ComfyUI-90_right" },
  { key: "aerial_view", label: "俯视", prompt: "Turn the camera to an aerial view.", seed: "1118480615401224", filename_prefix: "ComfyUI-aerial_view" },
  { key: "low_angle", label: "低角度", prompt: "Turn the camera to a low-angle view.", seed: "490672281762243", filename_prefix: "ComfyUI-low_angle" },
  { key: "45_left", label: "左 45°", prompt: "Rotate the camera 45 degrees to the left.", seed: "850991843243451", filename_prefix: "ComfyUI-45_left" },
  { key: "90_left", label: "左 90°", prompt: "Rotate the camera 90 degrees to the left.", seed: "1039279712437261", filename_prefix: "ComfyUI-90_left" },
];

const getProcessorModeDefaults = (mode) => {
  if (mode === "text2img") {
    return { mode, prompt: "", templates: { size: "1024x1024", aspect_ratio: "1:1" } };
  }
  if (mode === "local_text2img") {
    return { mode, prompt: "", templates: { size: "1024x1024", aspect_ratio: "1:1" }, model: "comfyui-image-z-image-turbo" };
  }
  if (mode === "multi_image_generate") {
    return { mode, prompt: "", templates: { size: "1024x1024", note: "" } };
  }
  if (mode === "rmbg") {
    return { mode, prompt: "", templates: { size: "1024x1024", aspect_ratio: "1:1" } };
  }
  if (mode === "feature_extract") {
    return {
      mode,
      prompt: FEATURE_EXTRACT_PRESET_PROMPTS.face,
      templates: { size: "1024x1024", aspect_ratio: "1:1", preset: "face" },
    };
  }
  if (mode === "multi_angleshots") {
    return { mode, prompt: "", templates: {} };
  }
  if (mode === "video_upscale") {
    return { mode, prompt: "视频画质增强", model: DEFAULT_VIDEO_HD_MODEL_ID, templates: { template_enum: VOLC_VIDEO_HD_TEMPLATE_ENUM_1 } };
  }
  return { mode, prompt: "", templates: {} };
};

const VIDEO_HD_TEMPLATE_OPTIONS = [
  { label: "2K", value: VOLC_VIDEO_HD_TEMPLATE_ENUM_1 },
  { label: "4K", value: VOLC_VIDEO_HD_TEMPLATE_ENUM_2 },
];

const PROMPT_TEMPLATES = {
  bg_replace: {
    categories: [
      { name: "场景风格", key: "style", options: ["纯白摄影棚", "极简家居", "大理石台面", "清新自然户外", "高级展台", "赛博朋克"] },
      { name: "光影氛围", key: "vibe", options: ["柔和明亮", "自然光", "专业布光", "电影感", "暖色调", "冷淡风"] },
    ],
  },
  gesture_swap: {
    categories: [{ name: "手势类型", key: "style", options: ["单手握持", "指尖捏住", "双手捧起", "手掌展示", "使用中(涂抹)"] }],
  },
  product_swap: {
    categories: [{ name: "商品材质", key: "style", options: ["哑光质感", "亮面反光", "透明玻璃", "金属光泽", "磨砂表面"] }],
  },
  relight: {
    categories: [
      { name: "布光类型", key: "style", options: ["柔和漫射光(Soft)", "伦勃朗光(Rembrandt)", "强对比侧光(Hard Side)", "自然窗光(Window)", "蝴蝶光(Butterfly)", "赛博霓虹(Neon)"] },
      { name: "光源位置", key: "direction", options: ["左侧光", "右侧光", "顶光", "逆光(Backlight)", "正面平光"] },
      { name: "色温/氛围", key: "vibe", options: ["暖色调(Warm)", "冷色调(Cool)", "中性白(Neutral)", "夕阳感(Sunset)", "清晨感(Morning)"] },
    ],
  },
  img2video: {
    categories: [
      { name: "画幅比例", key: "ratio", options: ["16:9", "9:16", "3:4", "21:9", "adaptive"] },
    ],
  },
  local_img2video: {
    categories: [
      { name: "画幅比例", key: "ratio", options: ["1:1", "16:9", "9:16", "4:3", "3:4"] },
    ],
  },
};

const ASPECT_RATIOS = [
  { label: "1:1", w: 24, h: 24 },
  { label: "4:3", w: 32, h: 24 },
  { label: "3:4", w: 24, h: 32 },
  { label: "16:9", w: 40, h: 22 },
  { label: "21:9", w: 44, h: 20 },
  { label: "9:16", w: 22, h: 40 },
];

const extractApiError = (data) => {
  const d = data?.detail ?? data?.message ?? data;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x?.msg || JSON.stringify(x)).join(" ; ");
  if (d && typeof d === "object") return JSON.stringify(d);
  return String(d);
};

const isVideoContent = (url) => {
  if (!url) return false;
  if (url.startsWith("data:video")) return true;
  if (/\.(mp4|webm|mov|m4v|avi|mkv|m3u8)(?:$|\?)/i.test(url)) return true;
  if (/\/video\b|output_video|play_url|m3u8|mime=video/i.test(url)) return true;
  return false;
};

// --- Helper: Graph Traversal ---
const getDownstreamNodes = (startNodeIds, nodes, connections) => {
  const visited = new Set(startNodeIds);
  const queue = [...startNodeIds];
  while (queue.length > 0) {
    const currentId = queue.shift();
    const outgoing = connections.filter((c) => c.from === currentId).map((c) => c.to);
    for (const nextId of outgoing) {
      if (!visited.has(nextId)) {
        visited.add(nextId);
        queue.push(nextId);
      }
    }
  }
  return visited;
};



// --- Helper: Node Ready Check ---
const checkNodeReady = (node, nodes, connections) => {
  if (node.type === NODE_TYPES.INPUT) return (node.data.images?.length || 0) > 0;
  if (node.type === NODE_TYPES.TEXT_INPUT) return (node.data.text?.length || 0) > 0;
  if (node.type === NODE_TYPES.OUTPUT) return true;

  const inputConns = connections.filter((c) => c.to === node.id);
  const sourceNodes = inputConns.map((c) => nodes.find((n) => n.id === c.from)).filter(Boolean);

  const hasUpstreamImages = sourceNodes.some((n) => (n.data.images?.length || 0) > 0 || (n.data.uploadedImages?.length || 0) > 0);
  const hasUpstreamText = sourceNodes.some((n) => (n.data.text?.length || 0) > 0);
  const hasLocalImages = (node.data.uploadedImages?.length || 0) > 0;
  const hasInternalPrompt = node.data.prompt && node.data.prompt.length > 0;

  if (node.data.mode === "text2img" || node.data.mode === "local_text2img") return hasUpstreamText || hasInternalPrompt;
  if (node.data.mode === "multi_image_generate") return hasUpstreamImages || hasLocalImages;
  if (node.data.mode === "img2video" || node.data.mode === "local_img2video") return hasUpstreamImages;
  return hasUpstreamImages;
};

const VideoPlayer = ({ src, className, controls = false, autoPlay = true, ...props }) => {
  const [error, setError] = useState(false);
  if (error)
    return (
      <div className={`flex flex-col items-center justify-center bg-slate-900 text-slate-500 ${className}`}>
        <FileWarning className="w-6 h-6 mb-1 text-red-400" />
        <span className="text-[10px]">视频加载失败</span>
      </div>
    );
  return (
    <video
      src={src}
      className={className}
      controls={controls}
      autoPlay={autoPlay}
      loop
      muted
      playsInline
      crossOrigin="anonymous"
      onError={() => setError(true)}
      {...props}
    />
  );
};

const ToolIconBtn = ({ icon, onClick, disabled, active, title }) => {
  const IconComponent = icon;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded transition-colors ${
        disabled
          ? "text-slate-600 cursor-not-allowed"
          : active
          ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
          : "text-slate-500 hover:bg-slate-800 hover:text-slate-200"
      }`}
    >
      {IconComponent ? React.createElement(IconComponent, { className: "w-4 h-4" }) : null}
    </button>
  );
};

const SidebarBtn = ({
  icon,
  label,
  desc,
  onClick,
  color,
  bg,
  active = false,
  compact = false,
  expanded = false,
  onHoverChange,
  category = "",
}) => {
  const IconComponent = icon;
  return (
    <button
      onClick={onClick}
      onMouseEnter={(event) => onHoverChange?.(true, event.currentTarget)}
      onMouseLeave={() => onHoverChange?.(false)}
      className={`group relative flex items-center border text-left transition-all duration-200 ${
        compact
          ? `justify-center rounded-xl ${
              expanded ? "h-12 w-12 -translate-y-0.5" : "h-10 w-10"
            } ${
              active
                ? "border-cyan-400/25 bg-[linear-gradient(180deg,rgba(15,23,42,0.95),rgba(30,41,59,0.9))] text-slate-100 shadow-[0_10px_24px_rgba(8,145,178,0.14)]"
                : "border-transparent text-slate-300 hover:bg-slate-800/70 hover:text-slate-100"
            }`
          : `mx-auto min-h-[88px] w-full items-center justify-between overflow-hidden rounded-[22px] px-3.5 py-3 ${
              active
                ? "bg-[linear-gradient(180deg,rgba(15,23,42,0.95),rgba(30,41,59,0.9))] text-slate-100 border-cyan-400/25 shadow-[0_10px_24px_rgba(8,145,178,0.14)]"
                : "bg-[linear-gradient(180deg,rgba(15,23,42,0.82),rgba(15,23,42,0.68))] text-slate-300 border-slate-800/80 hover:border-slate-600/80 hover:bg-slate-900/90"
            }`
      }`}
    >
      <span
        className={`absolute left-0 top-2.5 bottom-2.5 w-0.5 rounded-r transition-all ${
          active ? "bg-cyan-300" : expanded ? "bg-cyan-400/45" : "bg-transparent"
        }`}
      />
      <div
        className={`${
          compact ? (expanded ? "w-8 h-8" : "w-7 h-7") : "h-10 w-10"
        } rounded-2xl ${bg} flex items-center justify-center ${color} shrink-0 ring-1 transition-all ${
          active ? "ring-cyan-400/35" : "ring-slate-700/70 group-hover:ring-slate-500/60"
        }`}
      >
        {IconComponent
          ? React.createElement(IconComponent, {
              className: compact ? (expanded ? "w-[22px] h-[22px]" : "w-5 h-5") : "w-[18px] h-[18px]",
            })
          : null}
      </div>
      {!compact && (
        <>
          <div className="ml-3 min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className={`truncate text-[13px] font-medium leading-5 ${active ? "text-slate-100" : "text-slate-200 group-hover:text-slate-100"}`}>{label}</div>
              {category ? (
                <span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] leading-none ${
                  active
                    ? "border-cyan-400/20 bg-cyan-400/10 text-cyan-100"
                    : "border-slate-700/80 bg-slate-900/75 text-slate-400"
                }`}>
                  {category}
                </span>
              ) : null}
            </div>
            <div className="mt-1 text-[11px] leading-5 text-slate-400 whitespace-normal break-words">{desc}</div>
          </div>
        </>
      )}
    </button>
  );
};

const SidebarSectionHeader = ({ title, open, onToggle }) => (
  <button
    type="button"
    onClick={onToggle}
    className="inline-flex w-full items-center gap-2 rounded-xl px-1 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300 transition-colors hover:text-slate-100"
  >
    <span className={`transition-transform ${open ? "rotate-90" : ""}`}>
      <ChevronRight className="w-3 h-3 text-slate-500" />
    </span>
    <span className="h-1.5 w-1.5 rounded-full bg-yellow-400/90 shrink-0" />
    <span>{title}</span>
    <span className="h-px flex-1 bg-gradient-to-r from-yellow-500/25 via-slate-500/25 to-transparent" />
  </button>
);

const AgentResultCardContent = ({
  turn,
  onRetry,
  onSelectPrimary,
  onExport,
  onCopyPath,
}) => {
  const response = turn?.response || null;
  const topics = response?.topics || [];
  const matchedAssets = response?.matched_assets || {};
  const plans = turn?.localEditPlans || response?.edit_plans || [];
  const exportMap = turn?.exports || {};

  if (turn?.status === "running") {
    return (
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 text-xs text-slate-200">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Agent 执行中
        </div>
        <div className="text-[11px] text-slate-400">
          当前步骤：{AGENT_RUN_STEPS[Math.min(turn?.stepIndex || 0, AGENT_RUN_STEPS.length - 1)]}
        </div>
      </div>
    );
  }

  if (turn?.status === "clarify") {
    return <div className="text-xs text-slate-200">{turn?.assistantText || "你想做哪个产品/品类？"}</div>;
  }

  if (turn?.status === "error") {
    return (
      <div className="space-y-2">
        <div className="inline-flex items-center gap-1.5 text-xs text-red-300">
          <AlertCircle className="w-3.5 h-3.5" />
          {turn?.error || "请求失败"}
        </div>
        <button
          type="button"
          onClick={() => onRetry?.(turn?.id)}
          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-700 text-[11px] text-slate-200 hover:bg-slate-800"
        >
          <RotateCcw className="w-3 h-3" />
          重试
        </button>
      </div>
    );
  }

  if (!response) {
    return <div className="text-xs text-slate-500">暂无结果</div>;
  }

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-300">
        <div>persona: {response?.audience_context?.persona || "-"}</div>
        <div>confidence: {response?.audience_context?.confidence ?? "-"}</div>
        <div>prompt: {response?.prompt_version || "-"}</div>
        <div>policy: {response?.policy_version || "-"}</div>
        <div>llm_calls: {response?.total_llm_calls ?? 0}</div>
      </div>
      <div className="flex flex-wrap gap-1">
        {AGENT_WARNING_KEYS.map((item) => {
          const active = !!response?.[item.key];
          return (
            <span
              key={item.key}
              className={`px-1.5 py-0.5 rounded border text-[10px] ${
                active
                  ? "bg-amber-500/15 border-amber-400/40 text-amber-200"
                  : "bg-slate-800 border-slate-700 text-slate-400"
              }`}
            >
              {item.label}:{active ? "Y" : "N"}
            </span>
          );
        })}
      </div>

      <details className="rounded border border-slate-800 bg-slate-950/70" open>
        <summary className="cursor-pointer px-2 py-1.5 text-xs text-slate-200">Topics</summary>
        <div className="px-2 pb-2">
          <TopicCards topics={topics} />
        </div>
      </details>

      <details
        className="rounded border border-slate-800 bg-slate-950/70"
        open={turn?.uiFocusSection === "storyboard"}
      >
        <summary className="cursor-pointer px-2 py-1.5 text-xs text-slate-200">Storyboard</summary>
        <div className="px-2 pb-2">
          <StoryboardView topics={topics} />
        </div>
      </details>

      <details className="rounded border border-slate-800 bg-slate-950/70">
        <summary className="cursor-pointer px-2 py-1.5 text-xs text-slate-200">Asset Match</summary>
        <div className="px-2 pb-2">
          <AssetMatchView
            topics={topics}
            matchedAssets={matchedAssets}
            onSelectPrimary={(shotId, candidate) => onSelectPrimary?.(turn?.id, shotId, candidate)}
          />
        </div>
      </details>

      <details className="rounded border border-slate-800 bg-slate-950/70">
        <summary className="cursor-pointer px-2 py-1.5 text-xs text-slate-200">EditPlan</summary>
        <div className="px-2 pb-2">
          <EditPlanView plans={plans} />
        </div>
      </details>

      <details className="rounded border border-slate-800 bg-slate-950/70">
        <summary className="cursor-pointer px-2 py-1.5 text-xs text-slate-200">Export</summary>
        <div className="px-2 pb-2">
          <ExportPanel
            plans={plans}
            exportMap={exportMap}
            onExport={(plan) => onExport?.(turn?.id, plan)}
            onCopyPath={onCopyPath}
          />
        </div>
      </details>
    </div>
  );
};




const PropertyPanel = ({
  node,
  updateData,
  onClose,
  imageModelOptions = EMPTY_LIST,
  videoModelOptions = EMPTY_LIST,
  resolveModelParamsForId,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [videoParamOptions, setVideoParamOptions] = useState(() => ({
    resolution: EMPTY_LIST,
    ratio: EMPTY_LIST,
    duration: EMPTY_LIST,
  }));
  const [videoParamLoading, setVideoParamLoading] = useState(false);
  const [videoParamError, setVideoParamError] = useState("");
  const [imageParamOptions, setImageParamOptions] = useState(() => ({
    taskType: EMPTY_LIST,
    size: EMPTY_LIST,
    ratio: EMPTY_LIST,
  }));
  const [imageParamLoading, setImageParamLoading] = useState(false);
  const [imageParamError, setImageParamError] = useState("");
  const hasConfigNode = !!node && ![NODE_TYPES.INPUT, NODE_TYPES.OUTPUT, NODE_TYPES.TEXT_INPUT].includes(node?.type);

  const isProcessor = node?.type === NODE_TYPES.PROCESSOR;
  const isPostProcessor = node?.type === NODE_TYPES.POST_PROCESSOR;
  const isVideoGen = node?.type === NODE_TYPES.VIDEO_GEN;

  const currentMode = TOOL_CARDS[node?.data?.mode] || TOOL_CARDS.bg_replace;
  const activeTemplates = PROMPT_TEMPLATES[node?.data?.mode];

  const theme = (() => {
    if (isPostProcessor) return { text: "text-cyan-400", bg: "bg-cyan-600", border: "border-cyan-500" };
    if (isVideoGen) return { text: "text-rose-400", bg: "bg-rose-600", border: "border-rose-500" };
    return { text: "text-purple-400", bg: "bg-purple-600", border: "border-purple-500" };
  })();

  const availableTools = Object.keys(TOOL_CARDS).filter((key) => {
    const tool = TOOL_CARDS[key];
    if (isProcessor) {
      return (tool.category === "generate" || tool.category === "skill")
        && key !== "video_upscale"
        && !HIDDEN_IMAGE_CONFIG_MODES.has(key);
    }
    if (isPostProcessor) return tool.category === "enhance";
    if (isVideoGen) return tool.category === "video";
    return false;
  });

  const promptModes = ["text2img", "local_text2img", "multi_image_generate", "feature_extract", "local_img2video"];
  const isSkillProcessor = isProcessor && currentMode.category === "skill";
  const isMultiAnglesSkill = node?.data?.mode === "multi_angleshots";
  const isVideoUpscaleSkill = node?.data?.mode === "video_upscale";
  const isLocalText2Img = node?.data?.mode === "local_text2img";
  const isLocalImg2Video = node?.data?.mode === "local_img2video";
  const isRemoteImg2Video = isVideoGen && !isLocalImg2Video && node?.data?.mode === "img2video";
  const isRemoteImageGen =
    isProcessor &&
    !isLocalText2Img &&
    (node?.data?.mode === "text2img" || node?.data?.mode === "multi_image_generate");
  const currentVideoModelId = String(node?.data?.model || "").trim();
  const currentImageModelId = String(node?.data?.model || "").trim();

  useEffect(() => {
    const tid = window.setTimeout(() => {
      setShowAdvanced(Boolean(node?.id));
    }, 0);
    return () => window.clearTimeout(tid);
  }, [node?.id]);

  useEffect(() => {
    let cancelled = false;
    if (!isRemoteImg2Video || typeof resolveModelParamsForId !== "function" || !currentVideoModelId) {
      return () => {
        cancelled = true;
      };
    }
    Promise.resolve().then(() => {
      if (cancelled) return;
      setVideoParamLoading(true);
      setVideoParamError("");
    });
    resolveModelParamsForId(currentVideoModelId)
      .then((paramList) => {
        if (cancelled) return;
        const readOptions = (keywords = []) => {
          const item = findAIChatParamItem(paramList, keywords);
          if (!item) return EMPTY_LIST;
          return sortParamValues(item?.param_values || EMPTY_LIST)
            .map((val) => String(val?.param_value || "").trim())
            .filter(Boolean);
        };
        setVideoParamOptions({
          resolution: readOptions(["resolution", "分辨率"]),
          ratio: readOptions(["ratio", "比例", "宽高比"]),
          duration: readOptions(["duration", "时长"]),
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setVideoParamError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (cancelled) return;
        setVideoParamLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isRemoteImg2Video, resolveModelParamsForId, currentVideoModelId]);

  useEffect(() => {
    let cancelled = false;
    if (!isRemoteImageGen || typeof resolveModelParamsForId !== "function" || !currentImageModelId) {
      return () => {
        cancelled = true;
      };
    }
    Promise.resolve().then(() => {
      if (cancelled) return;
      setImageParamLoading(true);
      setImageParamError("");
    });
    resolveModelParamsForId(currentImageModelId)
      .then((paramList) => {
        if (cancelled) return;
        setImageParamOptions({
          taskType: listAIChatParamValues(paramList, ["task", "任务", "类型"]),
          size: listAIChatParamValues(paramList, ["size", "尺寸"]),
          ratio: listAIChatParamValues(paramList, ["ratio", "比例", "宽高比"]),
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setImageParamError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (cancelled) return;
        setImageParamLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isRemoteImageGen, resolveModelParamsForId, currentImageModelId]);

  const remoteResolutionOptions = useMemo(() => {
    if (videoParamOptions.resolution.length) return videoParamOptions.resolution;
    return currentVideoModelId === VIDEO_MODEL_1_5 ? ["480p", "720p"] : ["480p", "720p", "1080p"];
  }, [videoParamOptions.resolution, currentVideoModelId]);

  const remoteDurationOptions = useMemo(() => {
    if (videoParamOptions.duration.length) return videoParamOptions.duration;
    return currentVideoModelId === VIDEO_MODEL_1_5 ? ["4", "5", "8", "12"] : ["3", "5", "10"];
  }, [videoParamOptions.duration, currentVideoModelId]);

  const remoteRatioOptions = useMemo(() => {
    if (videoParamOptions.ratio.length) return videoParamOptions.ratio;
    return ["16:9", "9:16", "3:4", "21:9", "adaptive"];
  }, [videoParamOptions.ratio]);

  const remoteImageSizeOptions = useMemo(() => {
    if (imageParamOptions.size.length) return imageParamOptions.size;
    return imageParamLoading || imageParamError ? ["1024x1024", "2k", "4k"] : EMPTY_LIST;
  }, [imageParamOptions.size, imageParamLoading, imageParamError]);

  const remoteImageRatioOptions = useMemo(() => {
    if (imageParamOptions.ratio.length) return imageParamOptions.ratio;
    return EMPTY_LIST;
  }, [imageParamOptions.ratio]);

  const remoteImageTaskTypeOptions = useMemo(() => {
    if (imageParamOptions.taskType.length) return imageParamOptions.taskType;
    return EMPTY_LIST;
  }, [imageParamOptions.taskType]);

  useEffect(() => {
    if (!isRemoteImg2Video) return;
    if (!node) return;
    const currentTemplates = node.data.templates || {};
    const nextTemplates = { ...currentTemplates };
    let changed = false;

    const currentResolution = String(currentTemplates.resolution || "").trim().toLowerCase();
    const allowedResolutions = new Set(remoteResolutionOptions.map((item) => String(item).trim().toLowerCase()));
    if (remoteResolutionOptions.length && !allowedResolutions.has(currentResolution)) {
      nextTemplates.resolution = remoteResolutionOptions[0];
      changed = true;
    }

    const currentDuration = String(currentTemplates.duration ?? "").trim();
    const allowedDurations = new Set(remoteDurationOptions.map((item) => String(item).trim()));
    if (remoteDurationOptions.length && !allowedDurations.has(currentDuration)) {
      nextTemplates.duration = remoteDurationOptions[0];
      changed = true;
    }

    const currentRatio = String(currentTemplates.ratio || "").trim();
    const allowedRatios = new Set(remoteRatioOptions.map((item) => String(item).trim()));
    if (currentRatio && remoteRatioOptions.length && !allowedRatios.has(currentRatio)) {
      nextTemplates.ratio = "";
      changed = true;
    }

    if (changed) updateData(node.id, { templates: nextTemplates });
  }, [isRemoteImg2Video, remoteResolutionOptions, remoteDurationOptions, remoteRatioOptions, node?.data?.templates, node?.id, updateData]);

  useEffect(() => {
    if (!isRemoteImageGen || !node) return;
    const currentTemplates = node.data.templates || {};
    const nextTemplates = { ...currentTemplates };
    let changed = false;

    const currentSize = String(currentTemplates.size || "").trim();
    if (remoteImageSizeOptions.length && currentSize && !remoteImageSizeOptions.includes(currentSize)) {
      nextTemplates.size = remoteImageSizeOptions[0];
      changed = true;
    }

    const currentRatio = String(currentTemplates.aspect_ratio || "").trim();
    if (currentRatio && remoteImageRatioOptions.length && !remoteImageRatioOptions.includes(currentRatio)) {
      delete nextTemplates.aspect_ratio;
      changed = true;
    }

    const currentTaskType = String(currentTemplates.task_type || "").trim();
    if (currentTaskType && remoteImageTaskTypeOptions.length && !remoteImageTaskTypeOptions.includes(currentTaskType)) {
      delete nextTemplates.task_type;
      changed = true;
    }

    if (changed) updateData(node.id, { templates: nextTemplates });
  }, [
    isRemoteImageGen,
    remoteImageSizeOptions,
    remoteImageRatioOptions,
    remoteImageTaskTypeOptions,
    node?.data?.templates,
    node?.id,
    updateData,
  ]);

  const effectiveTemplates = useMemo(() => {
    if (!activeTemplates) return activeTemplates;
    if (!isRemoteImg2Video || !Array.isArray(activeTemplates.categories)) return activeTemplates;
    return {
      ...activeTemplates,
      categories: activeTemplates.categories.map((cat) =>
        cat?.key === "ratio" ? { ...cat, options: remoteRatioOptions } : cat,
      ),
    };
  }, [activeTemplates, isRemoteImg2Video, remoteRatioOptions]);

  const handleRefUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => updateData(node.id, { refImage: reader.result });
    reader.readAsDataURL(file);
  };


  const updateTemplateData = (key, value) => {
    // multi_image_generate 的 prompt 更像“主 prompt”
    const newTemplates = { ...(node.data.templates || {}), [key]: value };
    // ✅ img2video：note 就是主提示词（直接覆盖 prompt）
    if (node.data.mode === "img2video" && key === "note") {
      updateData(node.id, { templates: newTemplates, prompt: value });
      return;
    }

    const parts = [];
    if (newTemplates.style) parts.push(newTemplates.style);
    if (newTemplates.vibe) parts.push(newTemplates.vibe);
    if (newTemplates.direction) parts.push(newTemplates.direction);
    if (newTemplates.note) parts.push(newTemplates.note);

    // text2img / multi_image_generate：prompt 不强制拼接
    const autoPrompt = parts.filter(Boolean).join(", ");
    updateData(node.id, { templates: newTemplates, prompt: node.data.mode === "relight" ? autoPrompt : (node.data.prompt || autoPrompt) });
  };

  const previewPrompt = [
    node?.data?.prompt,
    node?.data?.templates?.style,
    node?.data?.templates?.direction,
    node?.data?.templates?.vibe,
    node?.data?.templates?.note,
  ]
    .filter(Boolean)
    .join(", ");

  if (!hasConfigNode) return null;

  return (
  <div className="w-80 bg-slate-900 border-l border-slate-800 z-40 flex flex-col shadow-xl shrink-0 h-full min-h-0 overflow-hidden animate-in slide-in-from-right duration-200">
    {/* Header（固定） */}
    <div className="flex items-center justify-between border-b border-slate-800 p-4">
      <div className="flex items-center gap-2">
        <Sliders className="w-4 h-4 text-slate-400" />
        <span className="font-bold text-sm text-slate-200">配置面板</span>
      </div>
      <button onClick={onClose} className="text-slate-500 hover:text-white p-1 rounded hover:bg-slate-800">
        <X className="w-4 h-4" />
      </button>
    </div>

    {/* 内容区（可滚动） */}
    <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 custom-scrollbar">
      {/* 基础设置 */}
      <div className="space-y-3">
        {!isSkillProcessor && (
          <div className="space-y-2">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">模式选择</div>

            <div className="grid grid-cols-2 gap-2">
              {availableTools.map((key) => {
                const tool = TOOL_CARDS[key];
                const isActive = node.data.mode === key;
                if (key === "text2img" || key === "multi_image_generate") return null;

                return (
                  <button
                    key={key}
                    onClick={() => {
                      const next = getProcessorModeDefaults(key);
                      updateData(node.id, { mode: next.mode, prompt: next.prompt, templates: next.templates });
                    }}
                    className={`relative flex flex-col p-2 rounded-lg border text-left transition-all ${
                      isActive
                        ? `bg-opacity-10 ${theme.bg} ${theme.border} shadow-sm`
                        : "bg-slate-950 border-slate-800 hover:border-slate-600"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <tool.icon className={`w-4 h-4 ${isActive ? theme.text : "text-slate-500"}`} />
                      <span className={`text-xs font-bold ${isActive ? theme.text : "text-slate-300"}`}>{tool.short}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {isProcessor && (
              <div className="flex gap-2 pt-1">
                {["text2img", "multi_image_generate"].map((key) => {
                  const tool = TOOL_CARDS[key];
                  const isActive = node.data.mode === key;
                  return (
                    <button
                      key={key}
                      onClick={() => {
                        const next = getProcessorModeDefaults(key);
                        updateData(node.id, { mode: next.mode, prompt: next.prompt, templates: next.templates });
                      }}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border text-[10px] transition-colors ${
                        isActive
                          ? "bg-purple-600/10 border-purple-500 text-purple-400"
                          : "bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-600"
                      }`}
                    >
                      <tool.icon className="w-3 h-3" />
                      {tool.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

{isVideoGen && !isLocalImg2Video && (
  <div className="space-y-1">
    <div className="flex justify-between items-center">
      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">尾帧参考图</div>
      <span className="text-[9px] text-slate-500 bg-slate-800 px-1.5 rounded">可选</span>
    </div>

    <div
      className={`relative w-full rounded border border-dashed bg-slate-950/50 flex items-center justify-center group transition-colors ${
        node.data.refImage ? `h-32 border-rose-500/50` : `h-24 border-slate-700 hover:border-rose-500`
      }`}
    >
      {node.data.refImage ? (
        <>
          <img
            src={node.data.refImage}
            className="w-full h-full object-cover rounded opacity-90 hover:opacity-100 transition-opacity"
            alt=""
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              updateData(node.id, { refImage: null });
            }}
            className="absolute top-1 right-1 bg-black/60 rounded-full p-1.5 hover:bg-red-500 z-20 transition-colors"
            title="移除尾帧"
          >
            <X className="w-3 h-3 text-white" />
          </button>
        </>
      ) : (
        <div className="flex flex-col items-center text-slate-500 text-center px-4 cursor-pointer relative">
          <ImagePlus className="w-6 h-6 mb-2 text-slate-600" />
          <span className="text-[11px] font-medium text-slate-400">点击上传尾帧</span>
          <span className="text-[9px] text-slate-600 mt-1">用于引导结尾画面（可不传）</span>
          <input
            type="file"
            accept="image/*"
            className="absolute inset-0 opacity-0 cursor-pointer"
            onChange={handleRefUpload}
          />
        </div>
      )}
    </div>
  </div>
)}
        

        {!isSkillProcessor && (
          <div className="space-y-1">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              {promptModes.includes(node.data.mode) ? "提示词" : "补充描述 / Note"}
            </div>
            <textarea
              className={`w-full bg-slate-950 border rounded p-2 text-xs text-slate-200 outline-none resize-none transition-colors border-slate-800 focus:${theme.border}`}
              rows={3}
              placeholder={
                node.data.mode === "relight"
                  ? "例如: 增加暖色调氛围..."
                  : node.data.mode === "rmbg"
                  ? "背景移除无需提示词"
                  : "输入额外指令..."
              }
              value={
                promptModes.includes(node.data.mode)
                  ? (node.data.prompt || "")
                  : (node.data.templates?.note || node.data.prompt || "")
              }
              onChange={(e) => {
                if (promptModes.includes(node.data.mode)) updateData(node.id, { prompt: e.target.value });
                else updateTemplateData("note", e.target.value);
              }}
            />
          </div>
        )}
      </div>

      {/* 高级设置 */}
      {!isMultiAnglesSkill && (
        <>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center justify-between text-xs text-slate-400 bg-slate-800/50 p-2 rounded hover:bg-slate-800 mt-2"
            type="button"
          >
            <span>{isVideoUpscaleSkill ? "高级设置 (输出规格)" : (isSkillProcessor ? "高级设置 (尺寸/比例/数量)" : "高级设置 (模型/尺寸/风格)")}</span>
            {showAdvanced ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>

          {showAdvanced && (
            <div className="space-y-4 animate-in slide-in-from-top-2 duration-200">
              {isProcessor && isVideoUpscaleSkill && (
                <div className="space-y-2">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">输出规格</div>
                  <div className="grid grid-cols-2 gap-2">
                    {VIDEO_HD_TEMPLATE_OPTIONS.map((item) => {
                      const currentValue = parseInt(String(node.data.templates?.template_enum ?? VOLC_VIDEO_HD_TEMPLATE_ENUM_1), 10);
                      const isSelected = currentValue === item.value;
                      return (
                        <button
                          key={item.value}
                          type="button"
                          onClick={() => updateData(node.id, {
                            templates: {
                              ...(node.data.templates || {}),
                              template_enum: item.value,
                            },
                          })}
                          className={`px-2 py-1.5 rounded-md text-[10px] border transition-all ${
                            isSelected
                              ? "bg-rose-600 border-rose-500 text-white"
                              : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-600"
                          }`}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {((isProcessor && !isSkillProcessor && !isLocalText2Img) || isPostProcessor) && (
            <div className="space-y-2">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Cpu className="w-3 h-3" /> AI 模型
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {imageModelOptions.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => updateData(node.id, { model: m.id })}
                    className={`flex items-center gap-2 p-2 rounded-lg border text-xs transition-all text-left ${
                      node.data.model === m.id
                        ? "bg-indigo-600/20 border-indigo-500 text-indigo-300"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-600"
                    }`}
                    type="button"
                  >
                    <div className={`w-2 h-2 rounded-full shrink-0 ${node.data.model === m.id ? "bg-indigo-400" : "bg-slate-600"}`} />
                    <div className="flex flex-col overflow-hidden">
                      <span className="truncate font-medium">{m.name}</span>
                      <span className="text-[9px] opacity-60 truncate">{m.vendor}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {isVideoGen && !isLocalImg2Video && (
            <div className="space-y-2">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Cpu className="w-3 h-3" /> 视频模型
                </span>
              </div>
              
              <div className="grid grid-cols-1 gap-2">
                {videoModelOptions.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      const nextModel = m.id;
                      const prevT = node.data.templates || {};
                      updateData(node.id, {
                        model: nextModel,
                        templates: {
                          ...prevT,
                          generate_audio_new: prevT.generate_audio_new ?? true,
                        },
                      });
                    }}
                    className={`flex items-center gap-2 p-2 rounded-lg border text-xs transition-all text-left ${
                      node.data.model === m.id
                        ? "bg-rose-600/20 border-rose-500 text-rose-200"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-600"
                    }`}
                    type="button"
                  >
                    <div className={`w-2 h-2 rounded-full shrink-0 ${node.data.model === m.id ? "bg-rose-300" : "bg-slate-600"}`} />
                    <div className="flex flex-col overflow-hidden">
                      <span className="truncate font-medium">{m.name}</span>
                      <span className="text-[9px] opacity-60 truncate">{m.vendor}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
          {isVideoGen && (
  <div className="space-y-2">
    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">视频时长 (秒)</div>

    {isLocalImg2Video ? (
      <input
        type="number"
        min={1}
        max={20}
        step={1}
        value={parseInt(String(node.data.templates?.duration ?? 5), 10)}
        onChange={(e) => {
          const v = parseInt(e.target.value, 10);
          const clamped = Math.min(20, Math.max(1, isNaN(v) ? 5 : v));
          updateData(node.id, { templates: { ...(node.data.templates || {}), duration: clamped } });
        }}
        className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-200 outline-none"
      />
    ) : (
      <div className="grid grid-cols-4 gap-2">
        {remoteDurationOptions.map((sec) => {
          const secText = String(sec).trim();
          const cur = String(node.data.templates?.duration ?? "").trim();
          const isSel = cur ? cur === secText : secText === String(remoteDurationOptions[0] || "").trim();
          return (
            <button
              key={secText}
              type="button"
              onClick={() => updateData(node.id, { templates: { ...(node.data.templates || {}), duration: secText } })}
              className={`px-2 py-1.5 rounded-md text-[10px] border transition-all ${
                isSel ? "bg-rose-600 border-rose-500 text-white" : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-600"
              }`}
            >
              {secText}秒
            </button>
          );
        })}
      </div>
    )}
    {!isLocalImg2Video && videoParamLoading ? <div className="text-[10px] text-slate-500">参数加载中...</div> : null}
    {!isLocalImg2Video && videoParamError ? <div className="text-[10px] text-amber-400">{videoParamError}</div> : null}
  </div>
)}
          {isVideoGen && (
  <div className="space-y-2">
    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">分辨率</div>

    <div className="grid grid-cols-3 gap-2">
      {(isLocalImg2Video ? ["480p", "720p"] : remoteResolutionOptions).map((r) => {
        const fallbackResolution = isLocalImg2Video ? "480p" : "1080p";
        const remoteFallbackResolution = String(remoteResolutionOptions[0] || fallbackResolution);
        const isSel = (node.data.templates?.resolution || remoteFallbackResolution) === r;
        const label = r.toUpperCase(); // 480P/720P/1080P
        return (
          <button
            key={r}
            onClick={() => updateData(node.id, { templates: { ...(node.data.templates || {}), resolution: r } })}
            className={`px-2 py-1.5 rounded-md text-[10px] border transition-all ${
              isSel ? "bg-rose-600 border-rose-500 text-white" : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-600"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  </div>
)}

          {/* Size & Ratio */}
          {isProcessor &&
            (node.data.mode === "text2img" ||
              node.data.mode === "local_text2img" ||
              node.data.mode === "multi_image_generate" ||
              node.data.mode === "feature_extract" ||
              node.data.mode === "rmbg") && (
            <>
              {isRemoteImageGen && remoteImageTaskTypeOptions.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">任务类型 (Task)</div>
                  <div className="flex flex-wrap gap-1.5">
                    {remoteImageTaskTypeOptions.map((opt) => {
                      const isSelected = String(node.data.templates?.task_type || "").trim() === String(opt).trim();
                      return (
                        <button
                          key={opt}
                          onClick={() => {
                            const nextTemplates = { ...(node.data.templates || {}) };
                            nextTemplates.task_type = isSelected ? "" : opt;
                            updateData(node.id, { templates: nextTemplates });
                          }}
                          className={`px-2 py-1 rounded-md text-[10px] border transition-all ${
                            isSelected ? "bg-purple-600 border-purple-500 text-white" : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-600"
                          }`}
                          type="button"
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">尺寸 (Size)</div>
                {(node.data.mode === "local_text2img" ? ["1k", "2k"] : (isRemoteImageGen ? remoteImageSizeOptions : ["1k", "2k", "4k"])).length > 0 ? (
                  <div className="grid grid-cols-3 gap-1.5">
                    {(node.data.mode === "local_text2img" ? ["1k", "2k"] : (isRemoteImageGen ? remoteImageSizeOptions : ["1k", "2k", "4k"])).map((opt) => {
                      let value = opt;
                      if (!isRemoteImageGen && opt === "1k") value = "1024x1024";
                      const fallbackSize = isRemoteImageGen ? String(remoteImageSizeOptions[0] || "") : "1024x1024";
                      const isSelected = String(node.data.templates?.size || fallbackSize) === String(value);
                      return (
                        <button
                          key={String(opt)}
                          onClick={() => updateData(node.id, { templates: { ...(node.data.templates || {}), size: value } })}
                          className={`px-2 py-1.5 rounded-md text-[10px] border transition-all ${
                            isSelected
                              ? "bg-purple-600 border-purple-500 text-white"
                              : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-600"
                          }`}
                          type="button"
                        >
                          {String(opt)}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-[10px] text-slate-500">该模型未返回尺寸参数</div>
                )}
                {isRemoteImageGen && imageParamLoading ? <div className="mt-2 text-[10px] text-slate-500">参数加载中...</div> : null}
                {isRemoteImageGen && imageParamError ? <div className="mt-2 text-[10px] text-amber-400">{imageParamError}</div> : null}
              </div>

              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">比例 (Ratio)</div>
                {node.data.mode === "multi_image_generate" && (
                  <div className="text-[10px] text-slate-500 mb-2">可不选；不选时默认跟随输入图像尺寸</div>
                )}
                {isRemoteImageGen ? (
                  remoteImageRatioOptions.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {remoteImageRatioOptions.map((ratioText) => {
                      const selectedRatio = String(node.data.templates?.aspect_ratio || "").trim();
                      const isImg2Img = node.data.mode === "multi_image_generate";
                      const isSelected = selectedRatio === String(ratioText).trim();
                      return (
                        <button
                          key={ratioText}
                          onClick={() => {
                            const nextTemplates = { ...(node.data.templates || {}) };
                            if (isImg2Img && isSelected) {
                              delete nextTemplates.aspect_ratio;
                            } else {
                              nextTemplates.aspect_ratio = ratioText;
                            }
                            updateData(node.id, { templates: nextTemplates });
                          }}
                          className={`px-2 py-1 rounded-md text-[10px] border transition-all ${
                            isSelected
                              ? "bg-purple-600 border-purple-500 text-white"
                              : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-600"
                          }`}
                          type="button"
                        >
                          {ratioText}
                        </button>
                      );
                    })}
                  </div>
                  ) : (
                    <div className="text-[10px] text-slate-500">该模型未返回比例参数</div>
                  )
                ) : (
                  <div className="grid grid-cols-5 gap-2">
                    {ASPECT_RATIOS.map((ar) => {
                      const selectedRatio = node.data.templates?.aspect_ratio;
                      const isImg2Img = node.data.mode === "multi_image_generate";
                      const isSelected = (isImg2Img ? selectedRatio : selectedRatio || "1:1") === ar.label;
                      return (
                        <button
                          key={ar.label}
                          onClick={() => {
                            const nextTemplates = { ...(node.data.templates || {}) };
                            if (isImg2Img && isSelected) {
                              delete nextTemplates.aspect_ratio;
                            } else {
                              nextTemplates.aspect_ratio = ar.label;
                            }
                            updateData(node.id, { templates: nextTemplates });
                          }}
                          className={`flex flex-col items-center gap-1 p-1 rounded-md border transition-all ${
                            isSelected
                              ? "bg-purple-600 border-purple-500 text-white"
                              : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-600 hover:bg-slate-800"
                          }`}
                          title={ar.label}
                          type="button"
                        >
                          <div
                            className={`border ${isSelected ? "border-white bg-white/20" : "border-slate-500 bg-slate-800"}`}
                            style={{ width: ar.w, height: ar.h, borderRadius: 2 }}
                          />
                          <span className="text-[9px] scale-90">{ar.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Style Templates */}
          {effectiveTemplates?.categories?.map((cat, idx) => (
            <div key={idx} className="space-y-1.5">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{cat.name}</div>
              <div className="flex flex-wrap gap-1.5">
                {cat.options.map((opt) => {
                  const isSelected = node.data.templates?.[cat.key] === opt;
                  return (
                    <button
                      key={opt}
                      onClick={() =>
                        updateData(node.id, {
                          templates: { ...(node.data.templates || {}), [cat.key]: isSelected ? "" : opt },
                        })
                      }
                      className={`px-2 py-1 rounded-md text-[10px] border transition-all ${
                        isSelected ? `${theme.bg} ${theme.border} text-white` : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-600"
                      }`}
                      type="button"
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Batch Size */}
              {node.data.mode !== "multi_angleshots" && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">生成数量</span>
                    <span className={`text-xs font-mono ${theme.text}`}>{node.data.batchSize || 1} 次</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="4"
                    step="1"
                    value={node.data.batchSize || 1}
                    onChange={(e) => updateData(node.id, { batchSize: parseInt(e.target.value) })}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>

    {/* Preview（固定在底部） */}
    <div className="p-4 border-t border-slate-800">
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">提示词预览</div>
      <div className="text-[10px] text-slate-400 font-mono bg-black/20 p-2 rounded border border-slate-800/50 break-words">
        {previewPrompt || "(暂无内容)"}
      </div>
    </div>
  </div>
);};

const NodeComponent = ({
  node,
  selected,
  onMouseDown,
  updateData,
  onDelete,
  onConnectStart,
  onConnectEnd,
  onPreview,
  onContinue,
  isReady,
  onRetry,
  onSelectArtifact,
  activeArtifact,
  onIterateImg2Img,
  onRunCompactRemoveWatermark,
  onRunCompactThreeView,
  onRunCompactVideoUpscale,
}) => {
  const [showCopied, setShowCopied] = useState(false);
  const [compactActiveIndex, setCompactActiveIndex] = useState(0);
  const [showCompactInputActions, setShowCompactInputActions] = useState(false);
  const [showCompactVideoUpscaleOptions, setShowCompactVideoUpscaleOptions] = useState(false);
  const [compactRemovePending, setCompactRemovePending] = useState(false);
  const [compactThreeViewPending, setCompactThreeViewPending] = useState(false);
  const [compactVideoUpscalePending, setCompactVideoUpscalePending] = useState(false);
  const nodeRootRef = useRef(null);

  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    readFilesAsDataUrls(files).then((newImages) => {
      const currentImages = node.data.images || [];
      updateData(node.id, { images: [...currentImages, ...newImages] });
    });

    e.target.value = "";
  };

  const removeImage = (index) => {
    const newImages = (node.data.images || []).filter((_, i) => i !== index);
    updateData(node.id, { images: newImages });
  };

  const downloadAll = () => {
    (node.data.images || []).forEach((img, i) => {
      const link = document.createElement("a");
      link.href = img;
      link.download = `batch_result_${i}.${isVideoContent(img) ? "mp4" : "png"}`;
      link.click();
    });
  };

  const copyDebugInfo = () => {
    const info = JSON.stringify(
      {
        id: node.id,
        type: node.type,
        mode: node.data.mode,
        status: node.data.status,
        error: node.data.error,
        time: new Date().toISOString(),
      },
      null,
      2
    );
    navigator.clipboard.writeText(info);
    setShowCopied(true);
    setTimeout(() => setShowCopied(false), 2000);
  };

  const isProcessor = node.type === NODE_TYPES.PROCESSOR;
  const isPostProcessor = node.type === NODE_TYPES.POST_PROCESSOR;
  const isVideoGen = node.type === NODE_TYPES.VIDEO_GEN;
  const isAI = isProcessor || isPostProcessor || isVideoGen;
  const isInput = node.type === NODE_TYPES.INPUT;
  const isOutput = node.type === NODE_TYPES.OUTPUT;
  const isCompactInput = isInput && !!node.data.compact;
  const compactImages = isCompactInput ? (node.data.images || []) : EMPTY_LIST;
  const compactActiveImage = compactImages[compactActiveIndex] || compactImages[0] || "";
  const compactActiveIsVideo = isVideoContent(compactActiveImage);
  const hasCompactThreeViewResult = isCompactInput && !!String(node.data.compactThreeViewSourceImage || "").trim();

  useEffect(() => {
    setCompactActiveIndex((prev) => {
      const maxIndex = Math.max(0, compactImages.length - 1);
      return Math.min(prev, maxIndex);
    });
  }, [compactImages.length]);

  useEffect(() => {
    setShowCompactInputActions(false);
    setShowCompactVideoUpscaleOptions(false);
    setCompactActiveIndex(0);
  }, [node.id]);

  useEffect(() => {
    if (!showCompactInputActions) {
      setShowCompactVideoUpscaleOptions(false);
    }
  }, [showCompactInputActions]);

  useEffect(() => {
    if (!showCompactInputActions) return undefined;

    const handleOutsideMouseDown = (event) => {
      if (nodeRootRef.current?.contains(event.target)) return;
      setShowCompactInputActions(false);
    };

    document.addEventListener("mousedown", handleOutsideMouseDown, true);
    return () => {
      document.removeEventListener("mousedown", handleOutsideMouseDown, true);
    };
  }, [showCompactInputActions]);

  const handleCompactThreeViewClick = async () => {
    if (compactRemovePending || compactThreeViewPending || compactVideoUpscalePending) return;
    try {
      setCompactThreeViewPending(true);
      await onRunCompactThreeView?.(node.id, compactActiveIndex);
      setShowCompactInputActions(false);
    } catch (error) {
      console.error("[Workbench] three_view_direct:error", error);
    } finally {
      setCompactThreeViewPending(false);
    }
  };

  const handleCompactRemoveClick = async () => {
    if (compactRemovePending || compactThreeViewPending || compactVideoUpscalePending) return;
    try {
      setCompactRemovePending(true);
      await onRunCompactRemoveWatermark?.(node.id, compactActiveIndex);
      setShowCompactInputActions(false);
    } catch (error) {
      console.error("[Workbench] remove_watermark_direct:error", error);
    } finally {
      setCompactRemovePending(false);
    }
  };

  const handleCompactVideoUpscaleClick = async () => {
    if (compactRemovePending || compactThreeViewPending || compactVideoUpscalePending) return;
    setShowCompactVideoUpscaleOptions((prev) => !prev);
  };

  const handleCompactVideoUpscaleOptionClick = async (templateEnum) => {
    if (compactRemovePending || compactThreeViewPending || compactVideoUpscalePending) return;
    try {
      setCompactVideoUpscalePending(true);
      await onRunCompactVideoUpscale?.(node.id, compactActiveIndex, templateEnum);
      setShowCompactVideoUpscaleOptions(false);
      setShowCompactInputActions(false);
    } catch (error) {
      console.error("[Workbench] video_upscale_direct:error", error);
    } finally {
      setCompactVideoUpscalePending(false);
    }
  };

  let statusColor =
    "border-slate-800/85 shadow-[0_24px_56px_rgba(2,6,23,0.42)] hover:border-slate-700/90";
  if (node.data.status === "error") {
    statusColor =
      "border-red-900/70 shadow-[0_24px_60px_rgba(127,29,29,0.28)] ring-1 ring-red-500/12";
  } else if (node.data.status === "success") {
    statusColor =
      "border-emerald-900/55 shadow-[0_24px_60px_rgba(2,44,34,0.28)]";
  } else if (selected) {
    statusColor =
      "border-cyan-800/80 ring-1 ring-cyan-400/22 shadow-[0_28px_64px_rgba(8,145,178,0.18)]";
  }

  let title = "Node";
  if (isInput) title = node.data.title || (isCompactInput ? "图片编辑区" : `图片/视频上传 (${node.data.images?.length || 0})`);
  if (isOutput) title = node.data.title || (node.data.angleLabel ? `${node.data.angleLabel} 输出 (${node.data.images?.length || 0})` : `输出 (${node.data.images?.length || 0})`);
  if (isProcessor) title = node.data.title || TOOL_CARDS[node.data.mode]?.name || "图片生成";
  if (isPostProcessor) title = node.data.title || TOOL_CARDS[node.data.mode]?.name || "后期增强";
  if (isVideoGen) title = node.data.title || TOOL_CARDS[node.data.mode]?.name || "视频生成";
  if (node.type === NODE_TYPES.TEXT_INPUT) title = "提示词";

  const getThemeColor = () => {
    const modeCard = TOOL_CARDS[node.data.mode] || null;
    if (node.type === NODE_TYPES.TEXT_INPUT) return { text: "text-amber-300", icon: Clipboard };
    if (isPostProcessor) return { text: "text-cyan-400", icon: modeCard?.icon || Palette };
    if (isVideoGen) return { text: "text-rose-400", icon: modeCard?.icon || Film };
    if (isInput) return { text: "text-blue-400", icon: Upload };
    if (isOutput) return { text: "text-green-400", icon: Download };
    if (isProcessor) {
      if (modeCard?.category === "skill") return { text: "text-amber-300", icon: modeCard.icon };
      if (modeCard?.category === "enhance") return { text: "text-cyan-300", icon: modeCard.icon };
      return { text: "text-purple-400", icon: modeCard?.icon || ImagePlus };
    }
    return { text: "text-purple-400", icon: ImagePlus };
  };
  const theme = getThemeColor();
  const Icon = theme.icon;

  const safeProgressWidth = (() => {
    const total = node.data.total || 0;
    const prog = node.data.progress || 0;
    if (!total) return "0%";
    return `${Math.min(100, (prog / total) * 100)}%`;
  })();

  const renderArtifactThumb = (img, i, meta = {}) => {
    const isActive = activeArtifact?.url === img;

    return (
      <div
        key={i}
        className={`aspect-square relative group overflow-hidden rounded-[18px] border bg-[linear-gradient(150deg,rgba(6,11,21,0.98),rgba(13,22,39,0.95)_58%,rgba(9,17,31,0.98))] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] cursor-pointer ${
          isActive ? "border-amber-700/80 ring-1 ring-amber-400/18" : "border-slate-800/90"
        }`}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          // ✅ 点缩略图：只预览
          onPreview?.(img);
        }}
        title="点击预览"
      >
        {isVideoContent(img) ? (
          <video src={img} className="w-full h-full object-cover" muted loop playsInline />
        ) : (
          <img src={img} className="w-full h-full object-cover" alt="" />
        )}

        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />

        {/* ✅ 真正可点的“选中产物”按钮：只选中，不预览 */}
        <button
          type="button"
          className="nodrag absolute bottom-1.5 left-1.5 text-[9px] px-2 py-1 rounded-full border border-slate-700/80 bg-slate-950/84 text-slate-100 opacity-0 backdrop-blur-sm group-hover:opacity-100 hover:border-amber-700/60 hover:bg-amber-500/12 hover:text-amber-100 transition"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();

            const next = {
              url: img,
              kind: isVideoContent(img) ? "video" : "image",
              fromNodeId: node.id,
              createdAt: Date.now(),
              meta,
            };

            // ✅ 再点一次同一个：取消选中
            onSelectArtifact?.(activeArtifact?.url === img ? null : next);
          }}

          title="选中为 Agent 上下文"
        >
          选中产物
        </button>

        {isActive && (
          <div className="absolute top-1 left-1">
            <CheckCircle2 className="w-4 h-4 text-yellow-300 drop-shadow" />
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      ref={nodeRootRef}
      className={`absolute ${isCompactInput ? "w-[292px] overflow-visible rounded-[22px] border-slate-800/70" : "w-[280px] overflow-hidden rounded-[30px]"} border bg-[linear-gradient(155deg,rgba(6,12,24,0.98),rgba(10,19,35,0.96)_50%,rgba(7,15,29,0.98))] backdrop-blur-xl shadow-[0_30px_80px_rgba(2,6,23,0.48)] flex flex-col transition-colors transition-shadow duration-200 ${isCompactInput ? "" : "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-14 before:bg-[linear-gradient(180deg,rgba(148,163,184,0.06),rgba(148,163,184,0))]"} ${statusColor}`}
      style={{ left: node.x, top: node.y }}
      onMouseDown={onMouseDown}
    >
      {!isCompactInput && (
        <div
          className={`relative flex justify-between items-center px-4 py-3.5 border-b border-slate-800/80 bg-[linear-gradient(180deg,rgba(15,23,42,0.28),rgba(15,23,42,0.06))] handle cursor-grab active:cursor-grabbing ${
            selected ? "bg-cyan-950/24" : ""
          }`}
        >
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-[14px] border border-slate-800/80 bg-slate-900/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
              <Icon className={`w-4 h-4 ${theme.text}`} />
            </div>
            <span className="font-medium text-[13px] tracking-[0.01em] text-slate-100 truncate select-none">{title}</span>
            {isReady && (
              <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.85)]" title="Ready to Run" />
            )}
          </div>
          <div className="flex gap-1">
            {node.data.status === "error" && (
              <button
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onRetry?.();
                }}
                className="rounded-full border border-red-900/70 bg-red-950/50 p-1.5 text-red-300 transition hover:border-red-800 hover:bg-red-900/60"
                title="重试"
                type="button"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}

            {isAI && (
              <div className={`rounded-full border p-1.5 ${selected ? "border-slate-700/90 bg-slate-900/80 text-white" : "border-slate-800/80 bg-slate-900/55 text-slate-500"}`}>
                <Settings2 className="w-3.5 h-3.5" />
              </div>
            )}

            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onDelete?.();
              }}
              className="rounded-full border border-slate-800/80 bg-slate-900/55 p-1.5 text-slate-500 transition-colors hover:border-red-900 hover:bg-red-950/55 hover:text-red-300"
              type="button"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {isCompactInput && (
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onDelete?.();
          }}
          className="nodrag absolute right-2.5 top-2.5 z-20 rounded-full border border-slate-800/90 bg-slate-950/82 p-1.5 text-slate-300 transition hover:border-red-900 hover:bg-red-950/55 hover:text-red-300"
          type="button"
          title="删除"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      <div className={`${isCompactInput ? "nodrag space-y-2 p-1.5" : "space-y-3 p-4"}`}>
        {/* Error */}
        {node.data.status === "error" && (
          <div className="rounded-[22px] border border-red-900/70 bg-[linear-gradient(180deg,rgba(69,10,10,0.7),rgba(28,10,10,0.76))] px-3 py-2.5 text-xs text-red-200 flex flex-col gap-2 animate-in fade-in zoom-in-95 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
              <span className="break-all font-mono">{node.data.error || "Unknown Error"}</span>
            </div>
            <div className="mt-1 flex justify-end gap-2 border-t border-red-400/10 pt-1">
              <button
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  copyDebugInfo();
                }}
                className="flex items-center gap-1 text-[9px] opacity-75 transition hover:opacity-100"
                type="button"
              >
                <Clipboard className="w-3 h-3" /> {showCopied ? "已复制!" : "复制调试信息"}
              </button>
            </div>
          </div>
        )}

        {/* AI nodes */}
        {isAI && (
          <div className="space-y-2">
            {node.data.status === "loading" && (
              <div className="space-y-1.5 rounded-[22px] border border-slate-800/80 bg-slate-900/42 px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                <div className="flex justify-between text-[10px] text-slate-300">
                  <span className="flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> 处理中...
                  </span>
                  <span>
                    {node.data.progress || 0}/{node.data.total || 0}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-950/90">
                  <div className="h-full bg-[linear-gradient(90deg,rgba(34,211,238,0.88),rgba(59,130,246,0.92))] transition-all duration-300" style={{ width: safeProgressWidth }} />
                </div>
              </div>
            )}

            {/* Results */}
            {node.data.status === "success" && node.data.images && node.data.images.length > 0 ? (
              <div className="grid grid-cols-2 gap-1.5">
                {node.data.images.map((img, i) =>
                  renderArtifactThumb(img, i, { mode: node.data.mode, prompt: node.data.prompt, model: node.data.model })
                )}
              </div>
            ) : (
              !["loading", "error"].includes(node.data.status) && (
                <div className="flex flex-col items-center justify-center rounded-[24px] border border-dashed border-slate-800/85 bg-[linear-gradient(180deg,rgba(15,23,42,0.34),rgba(15,23,42,0.16))] py-7 text-slate-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                  {isReady ? <Play className="mb-2 h-6 w-6 text-emerald-300/70" /> : <Icon className="mb-2 h-6 w-6 opacity-25" />}
                  <span className="text-[10px] tracking-[0.03em]">{isReady ? "准备就绪" : "等待连接..."}</span>
                </div>
              )
            )}

            {node.data.status === "success" && (isProcessor || isPostProcessor) && (
              <button
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onContinue?.(node.id);
                }}
                className="flex w-full items-center justify-center gap-1 rounded-full border border-slate-800/80 bg-slate-900/60 py-2 text-[10px] text-slate-200 transition-colors hover:border-cyan-800 hover:bg-cyan-950/36"
                type="button"
              >
                <Film className="w-3 h-3" /> 生成视频 <ArrowRight className="w-3 h-3" />
              </button>
            )}
            {/* ✅ 文生图后：一键续上图生图分支 */}
            {node.data.status === "success" && isProcessor && (node.data.mode === "text2img" || node.data.mode === "local_text2img") && (
              <button
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onIterateImg2Img?.(node.id);
                }}
                className="flex w-full items-center justify-center gap-1 rounded-full border border-slate-800/80 bg-slate-900/60 py-2 text-[10px] text-slate-200 transition-colors hover:border-cyan-800 hover:bg-cyan-950/36"
                title="先点缩略图选中你要迭代的产物，再点这里"
              >
                <ImageIcon className="w-3 h-3" /> 继续图生图 <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
        )}

        {/* Input */}
        {isInput && isCompactInput && (
          <div className="space-y-2">
            <div className="relative overflow-visible">
              <div className="overflow-hidden rounded-[18px] border border-slate-800/75 bg-[linear-gradient(160deg,rgba(5,9,18,0.98),rgba(11,18,32,0.96)_56%,rgba(7,13,24,0.98))] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                <button
                  type="button"
                  className={`nodrag relative block h-[286px] w-full overflow-hidden bg-black/35 transition-[transform,filter,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    showCompactInputActions
                      ? "scale-[0.985] shadow-[0_18px_45px_rgba(8,15,34,0.5)]"
                      : "hover:scale-[1.01] hover:brightness-105"
                  }`}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowCompactInputActions((prev) => !prev);
                  }}
                >
                  {compactActiveImage ? (
                    compactActiveIsVideo ? (
                      <video
                        src={compactActiveImage}
                        className={`h-full w-full object-contain transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                          showCompactInputActions ? "scale-[1.015]" : "scale-100"
                        }`}
                        muted
                        loop
                        playsInline
                      />
                    ) : (
                      <img
                        src={compactActiveImage}
                        className={`h-full w-full object-contain transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                          showCompactInputActions ? "scale-[1.015]" : "scale-100"
                        }`}
                        alt=""
                      />
                    )
                  ) : null}
                  {compactRemovePending ? (
                    <div className="pointer-events-none absolute inset-0 z-[2] overflow-hidden">
                      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.18),rgba(2,6,23,0.56))] backdrop-blur-[2px]" />
                      <div className="absolute inset-y-0 left-1/2 w-[44%] -translate-x-1/2 bg-[linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,0.18),rgba(125,211,252,0.14),rgba(255,255,255,0))] opacity-80 blur-xl animate-pulse" />
                      <div className="absolute inset-x-0 top-[18%] h-px bg-[linear-gradient(90deg,rgba(34,211,238,0),rgba(34,211,238,0.7),rgba(34,211,238,0))] shadow-[0_0_18px_rgba(34,211,238,0.35)] animate-pulse" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="rounded-[20px] border border-white/14 bg-[linear-gradient(145deg,rgba(255,255,255,0.18),rgba(255,255,255,0.06))] px-4 py-3 text-center text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_16px_40px_rgba(2,6,23,0.24)] backdrop-blur-xl">
                          <div className="flex items-center justify-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin text-cyan-100" />
                            <span className="text-[12px] font-medium tracking-[0.04em] text-slate-50">正在去除水印</span>
                          </div>
                          <div className="mt-1 text-[10px] text-slate-200/80">请稍候，图片正在轻量修复中</div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  {compactVideoUpscalePending ? (
                    <div className="pointer-events-none absolute inset-0 z-[2] overflow-hidden">
                      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.24),rgba(2,6,23,0.62))] backdrop-blur-[2px]" />
                      <div className="absolute inset-y-0 left-1/2 w-[46%] -translate-x-1/2 bg-[linear-gradient(90deg,rgba(255,255,255,0),rgba(251,113,133,0.16),rgba(244,63,94,0.22),rgba(255,255,255,0))] opacity-85 blur-xl animate-pulse" />
                      <div className="absolute inset-x-0 top-[22%] h-px bg-[linear-gradient(90deg,rgba(244,63,94,0),rgba(251,113,133,0.7),rgba(244,63,94,0))] shadow-[0_0_18px_rgba(244,63,94,0.3)] animate-pulse" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="rounded-[20px] border border-white/14 bg-[linear-gradient(145deg,rgba(255,255,255,0.18),rgba(255,255,255,0.06))] px-4 py-3 text-center text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_16px_40px_rgba(2,6,23,0.24)] backdrop-blur-xl">
                          <div className="flex items-center justify-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin text-rose-100" />
                            <span className="text-[12px] font-medium tracking-[0.04em] text-slate-50">正在视频超清</span>
                          </div>
                          <div className="mt-1 text-[10px] text-slate-200/80">请稍候，正在直接生成清晰版本</div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_35%,rgba(34,211,238,0.12),transparent_42%)] opacity-80 transition-opacity duration-300" />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                </button>
                {compactActiveImage ? (
                  <button
                    type="button"
                    className="nodrag absolute bottom-3 right-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-slate-700/80 bg-slate-950/78 text-slate-100 shadow-[0_12px_24px_rgba(2,6,23,0.35)] backdrop-blur-md transition duration-200 hover:-translate-y-0.5 hover:border-cyan-500/55 hover:bg-cyan-500/12 hover:text-cyan-100"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onPreview?.(compactActiveImage);
                    }}
                    title="放大预览"
                  >
                    <Maximize className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>

              {compactActiveImage ? (
                <div
                  className={`nodrag absolute left-full top-1/2 z-30 ml-3 -translate-y-1/2 rounded-[22px] border border-slate-700/80 bg-[linear-gradient(180deg,rgba(2,6,23,0.98),rgba(15,23,42,0.96))] p-2 shadow-[0_22px_54px_rgba(2,6,23,0.48)] backdrop-blur-xl transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    showCompactInputActions
                      ? "pointer-events-auto translate-x-0 scale-100 opacity-100"
                      : "pointer-events-none -translate-x-3 scale-95 opacity-0"
                  }`}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  {compactActiveIsVideo ? (
                    <div className="w-full space-y-2">
                      <button
                        type="button"
                        disabled={compactRemovePending || compactThreeViewPending || compactVideoUpscalePending}
                        className="flex w-full items-center justify-center gap-1.5 rounded-full border border-rose-300/20 bg-[linear-gradient(135deg,rgba(244,63,94,0.2),rgba(190,24,93,0.16))] px-4 py-2 text-[11px] font-medium text-rose-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_14px_28px_rgba(76,5,25,0.22)] backdrop-blur-xl transition duration-200 hover:-translate-y-0.5 hover:border-rose-300/35 hover:bg-[linear-gradient(135deg,rgba(251,113,133,0.24),rgba(244,63,94,0.18))] disabled:translate-y-0 disabled:cursor-wait disabled:opacity-65 disabled:brightness-100"
                        onClick={handleCompactVideoUpscaleClick}
                      >
                        {compactVideoUpscalePending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TrendingUp className="h-3.5 w-3.5" />}
                        {compactVideoUpscalePending ? "处理中..." : "视频超清"}
                      </button>
                      {showCompactVideoUpscaleOptions ? (
                        <div className="grid grid-cols-2 gap-2">
                          {VIDEO_HD_TEMPLATE_OPTIONS.map((item) => (
                            <button
                              key={item.value}
                              type="button"
                              disabled={compactVideoUpscalePending}
                              className="rounded-[14px] border border-slate-700/80 bg-slate-950/72 px-3 py-2 text-[11px] font-medium text-slate-100 transition hover:-translate-y-0.5 hover:border-rose-400/45 hover:bg-rose-500/10 disabled:translate-y-0 disabled:cursor-wait disabled:opacity-65"
                              onClick={() => handleCompactVideoUpscaleOptionClick(item.value)}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={compactRemovePending || compactThreeViewPending || compactVideoUpscalePending}
                        className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-full border border-cyan-300/20 bg-[linear-gradient(135deg,rgba(34,211,238,0.18),rgba(14,116,144,0.16))] px-4 py-2 text-[11px] font-medium text-cyan-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_14px_28px_rgba(8,47,73,0.22)] backdrop-blur-xl transition duration-200 hover:-translate-y-0.5 hover:border-cyan-300/35 hover:bg-[linear-gradient(135deg,rgba(34,211,238,0.24),rgba(56,189,248,0.18))] disabled:translate-y-0 disabled:cursor-wait disabled:opacity-65 disabled:brightness-100"
                        onClick={handleCompactThreeViewClick}
                      >
                        {compactThreeViewPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Layout className="h-3.5 w-3.5" />}
                        {compactThreeViewPending ? "生成中..." : hasCompactThreeViewResult ? "重试三视图" : "三视图"}
                      </button>
                      <button
                        type="button"
                        disabled={compactRemovePending || compactThreeViewPending || compactVideoUpscalePending}
                        className="rounded-full border border-white/18 bg-[linear-gradient(135deg,rgba(255,255,255,0.16),rgba(255,255,255,0.07))] px-4 py-2 text-[11px] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_14px_28px_rgba(2,6,23,0.22)] backdrop-blur-xl transition duration-200 hover:-translate-y-0.5 hover:border-cyan-300/35 hover:bg-[linear-gradient(135deg,rgba(255,255,255,0.22),rgba(125,211,252,0.12))] hover:text-cyan-50 disabled:translate-y-0 disabled:cursor-wait disabled:opacity-65 disabled:brightness-100"
                        onClick={handleCompactRemoveClick}
                      >
                        {compactRemovePending ? "处理中..." : "去水印"}
                      </button>
                    </>
                  )}
                </div>
              ) : null}
            </div>

            {compactImages.length > 1 ? (
              <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                {compactImages.map((img, index) => {
                  const isThumbActive = index === compactActiveIndex;
                  return (
                    <button
                      key={`${node.id}-${index}`}
                      type="button"
                      className={`nodrag relative h-16 w-16 shrink-0 overflow-hidden rounded-[16px] border transition duration-200 ${
                        isThumbActive
                          ? "border-cyan-500/60 ring-1 ring-cyan-400/25 shadow-[0_10px_24px_rgba(6,182,212,0.16)]"
                          : "border-slate-800/85 hover:border-slate-700 hover:-translate-y-0.5"
                      }`}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setCompactActiveIndex(index);
                        setShowCompactInputActions(false);
                      }}
                    >
                      {isVideoContent(img) ? (
                        <video src={img} className="h-full w-full object-cover" muted loop playsInline />
                      ) : (
                        <img src={img} className="h-full w-full object-cover" alt="" />
                      )}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        )}

        {isInput && !isCompactInput && (
          <div className="relative flex h-32 flex-col overflow-hidden rounded-[24px] border border-slate-800/85 bg-[linear-gradient(160deg,rgba(5,9,18,0.98),rgba(11,18,32,0.96)_56%,rgba(7,13,24,0.98))] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] group transition-colors hover:border-cyan-800">
            <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
              {node.data.images?.length > 0 ? (
                <div className="grid grid-cols-3 gap-1">
                  {node.data.images.map((img, i) => (
                    <div key={i} className="aspect-square relative group/img">
                      {/* ✅ 点图只预览；选中用按钮 */}
                      {isVideoContent(img) ? (
                        <video
                          src={img}
                          className={`w-full h-full object-cover rounded cursor-pointer border ${
                            activeArtifact?.url === img ? "border-amber-700 ring-1 ring-amber-400/18" : "border-transparent"
                          }`}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            onPreview?.(img);
                          }}
                          title="点击预览"
                          muted
                          loop
                          playsInline
                        />
                      ) : (
                        <img
                          src={img}
                          className={`w-full h-full object-cover rounded cursor-pointer border ${
                            activeArtifact?.url === img ? "border-amber-700 ring-1 ring-amber-400/18" : "border-transparent"
                          }`}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            onPreview?.(img);
                          }}
                          title="点击预览"
                          alt=""
                        />
                      )}

                      <button
                        type="button"
                        className="nodrag absolute bottom-1.5 left-1.5 rounded-full border border-slate-700/80 bg-slate-950/84 px-1.5 py-0.5 text-[9px] text-white opacity-0 backdrop-blur-sm transition group-hover/img:opacity-100 hover:border-amber-700/60 hover:bg-amber-500/12 hover:text-amber-100"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectArtifact?.({
                            url: img,
                            kind: isVideoContent(img) ? "video" : "image",
                            fromNodeId: node.id,
                            createdAt: Date.now(),
                            meta: { mode: "input" },
                          });
                        }}
                        title="选中为 Agent 上下文"
                      >
                        选中
                      </button>

                      <button
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeImage(i);
                        }}
                        className="absolute -right-1 -top-1 rounded-full border border-red-300/18 bg-red-500/90 p-0.5 opacity-0 transition group-hover/img:opacity-100"
                        type="button"
                        title="删除"
                      >
                        <X className="w-2 h-2 text-white" />
                      </button>
                    </div>
                  ))}

                  <div className="relative flex aspect-square cursor-pointer items-center justify-center rounded-[18px] border border-dashed border-slate-800/85 bg-slate-900/45 transition hover:border-cyan-800 hover:bg-cyan-950/30">
                    <Plus className="w-4 h-4 text-slate-300" />
                    <input type="file" multiple accept="image/*,video/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleFileUpload} />
                  </div>
                </div>
              ) : (
                <div className="relative flex h-full flex-col items-center justify-center text-slate-400">
                  <Images className="mb-1 h-6 w-6 opacity-55" />
                  <span className="text-[10px]">点击上传</span>
                  <input type="file" multiple accept="image/*,video/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleFileUpload} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Output */}
        {isOutput && (
          <div
            className="relative min-h-[100px] max-h-[200px] overflow-y-auto rounded-[24px] border border-slate-800/85 bg-[linear-gradient(160deg,rgba(5,9,18,0.98),rgba(11,18,32,0.96)_56%,rgba(7,13,24,0.98))] p-1.5 custom-scrollbar nodrag shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {node.data.images?.length > 0 ? (
              <div className="grid grid-cols-2 gap-1">
                {node.data.images.map((img, i) => (
                  <div key={i} className="aspect-square relative">
                    {renderArtifactThumb(img, i, {
                      mode: node.data.mode,
                      prompt: node.data.prompt,
                      model: node.data.model,
                    })}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center py-5 text-xs text-slate-500">
                <CheckCircle2 className="h-6 w-6 opacity-25" />
                <span>结果展示区</span>
              </div>
            )}

            {node.data.images?.length > 0 && (
              <button
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  downloadAll();
                }}
                className="mt-2 flex w-full items-center justify-center gap-1 rounded-full border border-emerald-900/60 bg-emerald-950/50 py-1.5 text-[10px] text-emerald-200 transition hover:border-emerald-800 hover:bg-emerald-950/70"
                type="button"
              >
                <Download className="w-3 h-3" /> 下载全部
              </button>
            )}
          </div>
        )}

        {/* Text input */}
        {node.type === NODE_TYPES.TEXT_INPUT && (
          <textarea
            className="w-full resize-none rounded-[24px] border border-slate-800/85 bg-[linear-gradient(160deg,rgba(5,9,18,0.98),rgba(11,18,32,0.96)_56%,rgba(7,13,24,0.98))] px-3 py-2.5 text-xs text-slate-100 outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] nodrag placeholder:text-slate-500"
            rows={3}
            placeholder="输入提示词..."
            value={node.data.text || ""}
            onChange={(e) => updateData(node.id, { text: e.target.value })}
            onMouseDown={(e) => e.stopPropagation()}
          />
        )}
      </div>

      {/* Ports */}
      <div className="pointer-events-none absolute top-[58px] w-full flex justify-between px-0">
        {node.type !== NODE_TYPES.INPUT && node.type !== NODE_TYPES.TEXT_INPUT && (
          <div
            onMouseUp={onConnectEnd}
            className="pointer-events-auto -ml-1.5 h-3 w-3 cursor-crosshair rounded-full border border-slate-700 bg-slate-900 shadow-[0_0_0_2px_rgba(2,6,23,0.65)] transition hover:border-cyan-700 hover:bg-cyan-950 z-20"
          />
        )}
        {node.type !== NODE_TYPES.OUTPUT && (
          <div
            onMouseDown={onConnectStart}
            className="pointer-events-auto -mr-1.5 ml-auto h-3 w-3 cursor-crosshair rounded-full border border-slate-700 bg-slate-900 shadow-[0_0_0_2px_rgba(2,6,23,0.65)] transition hover:border-cyan-700 hover:bg-cyan-950 z-20"
          />
        )}
      </div>
    </div>
  );
};

const newCanvasId = () => "canvas_" + Math.random().toString(36).slice(2, 12);

const Workbench = () => {
  const { user, logout, apiFetch } = useAuth();
  const [memberInfo, setMemberInfo] = useState(null);
  const [memberInfoLoading, setMemberInfoLoading] = useState(true);
  const [memberInfoLoginUrl, setMemberInfoLoginUrl] = useState("");
  const [userAuths, setUserAuths] = useState(null);
  const [userAuthsLoading, setUserAuthsLoading] = useState(true);
  const navigate = useNavigate();
  const [nodes, setNodes] = useState([]);
  const [connections, setConnections] = useState([]);
  const [history, setHistory] = useState([]);
  const [historyStep, setHistoryStep] = useState(-1);
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });

  const [selectedNodeIds, setSelectedNodeIds] = useState(new Set());
  const [selectedConnectionIds, setSelectedConnectionIds] = useState(new Set());
  const [activeNodeId, setActiveNodeId] = useState(null);

  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [interactionMode, setInteractionMode] = useState("idle");
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [initialNodePos, setInitialNodePos] = useState({});
  const [selectionBox, setSelectionBox] = useState(null);
  const [connectingSource, setConnectingSource] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [canvasDropActive, setCanvasDropActive] = useState(false);

  const [isRunning, setIsRunning] = useState(false);
  const [runScope, setRunScope] = useState("selected_downstream");
  const [apiStatus, setApiStatus] = useState("checking");
  const [_globalError, setGlobalError] = useState(null);
  const [loadingTip, setLoadingTip] = useState("");
  const [previewImage, setPreviewImage] = useState(null);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [activeHistoryTab, setActiveHistoryTab] = useState("recent");
  const [apiHistory, setApiHistory] = useState([]);
  const [expandedHistoryIds, setExpandedHistoryIds] = useState(new Set());
  const [apiStats, setApiStats] = useState(null);
  const [runToast, setRunToast] = useState(null);
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [leftSidebarQuery, setLeftSidebarQuery] = useState("");
  const [hoveredSidebarItemKey, setHoveredSidebarItemKey] = useState("");
  const [hoveredSidebarPreview, setHoveredSidebarPreview] = useState(null);
  const [leftSidebarSectionOpen, setLeftSidebarSectionOpen] = useState({
    nodes: true,
    skills: false,
    workflows: false,
    learning: false,
  });
  const [activeSidebarItemKey, setActiveSidebarItemKey] = useState("");
  const [rightPanelWidth, setRightPanelWidth] = useState(292);
  const [agentStore, setAgentStore] = useState(() => loadAgentStore());
  const [agentInput, setAgentInput] = useState("");
  const [agentInputFocused, setAgentInputFocused] = useState(false);
  const [activeComposerActionId, setActiveComposerActionId] = useState("");
  const [showScriptExamples, setShowScriptExamples] = useState(false);
  const [showCanvasExamples, setShowCanvasExamples] = useState(false);
  const [agentComposerFiles, setAgentComposerFiles] = useState([]);
  const [agentDevMode, setAgentDevMode] = useState(() => {
    return readAgentDevMode();
  });
  const [agentHistoryCollapsed, setAgentHistoryCollapsed] = useState(true);
  const [showPreferencesPanel, setShowPreferencesPanel] = useState(false);
  const [preferencesPanelPrefill, setPreferencesPanelPrefill] = useState(null);
  const [preferenceNotice, setPreferenceNotice] = useState(null);
  const [memoryPreferencesCache, setMemoryPreferencesCache] = useState({ byKey: {}, loaded: false });
  const [savingSuggestionId, setSavingSuggestionId] = useState("");
  const [savingFeedbackTargetId, setSavingFeedbackTargetId] = useState("");
  const [feedbackDialog, setFeedbackDialog] = useState(null);
  const [feedbackReasonChoice, setFeedbackReasonChoice] = useState(HITL_FEEDBACK_REASON_OPTIONS[0]);

  const navigateToMemberLogin = useCallback(
    (loginUrl = "") => {
      try {
        const microLogout = window.microApp?.getData?.()?.logout;
        if (typeof microLogout === "function") {
          microLogout();
          return;
        }
      } catch (error) {
        console.warn("[memberInfo] microApp logout failed", error);
      }

      const targetUrl = String(loginUrl || "").trim();
      if (targetUrl) {
        window.open(targetUrl, "_blank", "noopener,noreferrer");
      }
    },
    [],
  );
  const [feedbackReasonNote, setFeedbackReasonNote] = useState("");
  const [agentResultCards, setAgentResultCards] = useState([]);
  const [selectedAgentCardIds, setSelectedAgentCardIds] = useState(new Set());
  const [activeAgentCardId, setActiveAgentCardId] = useState(null);
  const [aiChatModels, setAiChatModels] = useState(() => ({
    language: EMPTY_LIST,
    image: EMPTY_LIST,
    video: DEFAULT_VIDEO_MODELS,
  }));
  const [apiDebugOpen, setApiDebugOpen] = useState(true);
  const [apiDebugStatus, setApiDebugStatus] = useState(() => ({
    memberInfo: { status: "idle", message: "", detail: "", updatedAt: 0 },
    userAuths: { status: "idle", message: "", detail: "", updatedAt: 0 },
    modelParams: { status: "idle", message: "", detail: "", updatedAt: 0 },
    modelsLang: { status: "idle", message: "", detail: "", updatedAt: 0 },
    modelsImage: { status: "idle", message: "", detail: "", updatedAt: 0 },
    modelsVideo: { status: "idle", message: "", detail: "", updatedAt: 0 },
    modelsVideoEnhance: { status: "idle", message: "", detail: "", updatedAt: 0 },
    aiChatAnchor: { status: "idle", message: "", detail: "", updatedAt: 0 },
    aiChatLang: { status: "idle", message: "", detail: "", updatedAt: 0 },
    aiChatImage: { status: "idle", message: "", detail: "", updatedAt: 0 },
  }));
  const aiChatModelParamsCacheRef = useRef(new Map());
  const aiChatSessionIdRef = useRef("");
  const aiChatHistoryRecordIdRef = useRef("");
  const agentInputRef = useRef(null);
  const agentUploadInputRef = useRef(null);
  const agentComposerRef = useRef(null);
  const workspaceShellRef = useRef(null);
  const viewportRef = useRef(viewport);
  const agentCardDragRef = useRef(null);
  const agentConversationBottomRef = useRef(null);
  const exportAgentPlanRef = useRef(null);
  const rightPanelResizeRef = useRef(null);
  const nodeDragCleanupRef = useRef(null);
  const previewOpenedBySpaceRef = useRef(false);

  const agentSessions = agentStore.sessions ?? EMPTY_LIST;
  const isLeftSidebarCollapsed = leftSidebarCollapsed;
  const leftSidebarWidth = isLeftSidebarCollapsed ? 76 : 340;
  const activeAgentSession = useMemo(
    () => agentSessions.find((session) => session.id === agentStore.activeSessionId) || agentSessions[0] || null,
    [agentSessions, agentStore.activeSessionId],
  );
  const agentTurns = activeAgentSession?.turns ?? EMPTY_LIST;
  const activePendingTask = activeAgentSession?.pendingTask || null;
  const isAgentMissionRunning = agentTurns.some((turn) => turn.status === "running");
  const hasActiveAgentConversation = agentTurns.length > 0 || !!activePendingTask;
  const hasAgentResultCards = agentResultCards.length > 0;
  const minimizedAgentCards = agentResultCards.filter((card) => card.minimized);

  useEffect(() => {
    return () => {
      agentComposerFiles.forEach((item) => {
        if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
    };
  }, [agentComposerFiles]);

  useEffect(() => {
    if (!agentInputFocused) return undefined;
    const handlePointerDown = (event) => {
      if (agentComposerRef.current?.contains(event.target)) return;
      setAgentInputFocused(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [agentInputFocused]);

  const memberLabel = useMemo(() => {
    if (memberInfoLoading) return "加载中";
    return resolveMemberDisplayName(memberInfo) || user?.email || "Guest";
  }, [memberInfo, memberInfoLoading, user?.email]);
  const memberAvatar = useMemo(() => resolveMemberAvatar(memberInfo), [memberInfo]);
  const memberPoint = useMemo(() => resolveMemberPoints(memberInfo, ["point"]), [memberInfo]);
  const memberTotalPoint = useMemo(() => resolveMemberPoints(memberInfo, ["total_point", "totalPoint"]), [memberInfo]);
  const isAdminUser = useMemo(() => resolveAdminFlagFromUserAuths(userAuths), [userAuths]);
  const languageModelOptions = useMemo(
    () => (Array.isArray(aiChatModels.language) && aiChatModels.language.length ? aiChatModels.language : EMPTY_LIST),
    [aiChatModels.language],
  );
  const imageModelRecords = useMemo(
    () => (Array.isArray(aiChatModels.image) && aiChatModels.image.length ? aiChatModels.image : EMPTY_LIST),
    [aiChatModels.image],
  );
  const imageModelOptions = useMemo(
    () => (imageModelRecords.length ? imageModelRecords : DEFAULT_AI_MODELS),
    [imageModelRecords],
  );
  const videoModelOptions = useMemo(
    () => (Array.isArray(aiChatModels.video) && aiChatModels.video.length ? aiChatModels.video : DEFAULT_VIDEO_MODELS),
    [aiChatModels.video],
  );
  const defaultLanguageModelId = useMemo(() => getDefaultLanguageModelId(languageModelOptions), [languageModelOptions]);
  const defaultImageModelId = useMemo(() => getDefaultImageModelId(imageModelRecords), [imageModelRecords]);
  const threeViewImageModelId = useMemo(() => {
    const preferred = String(AI_CHAT_IMAGE_MODEL_ID_NANO_BANANA2 || "").trim();
    if (preferred) return preferred;
    return findAIChatModelIdByKeywords(imageModelRecords) || defaultImageModelId;
  }, [defaultImageModelId, imageModelRecords]);
  const defaultVideoModelId = useMemo(() => getDefaultVideoModelId(videoModelOptions), [videoModelOptions]);
  const updateApiDebugStatus = useCallback((key, next) => {
    if (key === "aiChatAnchor") {
      const current = readAiChatAnchorDebugState();
      writeAiChatAnchorDebugState({
        ...current,
        ...next,
        updatedAt: Date.now(),
      });
    }
    setApiDebugStatus((prev) => {
      const merged = {
        ...(prev[key] || { status: "idle", message: "", detail: "", updatedAt: 0 }),
        ...next,
        updatedAt: Date.now(),
      };
      return {
        ...prev,
        [key]: merged,
      };
    });
  }, []);
  const pushApiDebugDetail = useCallback((key, event) => {
    const nextDetail = buildApiDebugDetailText(event);
    if (!nextDetail) return;
    if (key === "aiChatAnchor") {
      const current = readAiChatAnchorDebugState();
      const detail =
        event?.type === "start" || !current.detail
          ? nextDetail
          : `${current.detail}\n\n[${event.type || "event"}]\n${nextDetail}`;
      writeAiChatAnchorDebugState({
        ...current,
        detail,
        updatedAt: Date.now(),
      });
    }
    setApiDebugStatus((prev) => {
      const current = prev[key] || { status: "idle", message: "", detail: "", updatedAt: 0 };
      const detail =
        event?.type === "start" || !current.detail
          ? nextDetail
          : `${current.detail}\n\n[${event.type || "event"}]\n${nextDetail}`;
      const merged = {
        ...current,
        detail,
        updatedAt: Date.now(),
      };
      return {
        ...prev,
        [key]: merged,
      };
    });
  }, []);

  const triggerAIChatAnchor = useCallback(
    async ({ partEnum, modelId = 1, from, to, debugLabel }) => {
      const rawModelId = String(modelId ?? "").trim();
      const numericModelId = Number(rawModelId);
      const resolvedModelId = Number.isFinite(numericModelId) && numericModelId > 0 ? numericModelId : 1;
      const payload = {
        part_enum: Number(partEnum),
        operate_enum: AI_CHAT_ANCHOR_OPERATE_ENUM_1,
        ai_chat_model_id: resolvedModelId,
        from: String(from || window.location.pathname || "/app"),
        to: String(to || ""),
      };

      updateApiDebugStatus("aiChatAnchor", {
        status: "loading",
        message: `POST /ai/aiChatAnchor part=${payload.part_enum}`,
      });

      try {
        const data = await aiChatAnchor(apiFetch, payload, {
          onDebug: (event) => pushApiDebugDetail("aiChatAnchor", event),
        });
        updateApiDebugStatus("aiChatAnchor", {
          status: "success",
          message: `${debugLabel || payload.to || payload.part_enum} 已上报`,
        });
        return data;
      } catch (error) {
        updateApiDebugStatus("aiChatAnchor", {
          status: isLoginRequiredError(error) ? "login_required" : "error",
          message: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    },
    [apiFetch, pushApiDebugDetail, updateApiDebugStatus],
  );

  const handleAnchorActionClick = useCallback(
    ({ partEnum, modelId, to, debugLabel, action }) => {
      void triggerAIChatAnchor({
        partEnum,
        modelId,
        to,
        debugLabel,
      });
      action?.();
    },
    [triggerAIChatAnchor],
  );

  const resolveModelParamsForId = useCallback(
    async (modelId) => {
      const normalizedModelId = String(modelId || "").trim();
      if (!normalizedModelId) return EMPTY_LIST;
      const cached = aiChatModelParamsCacheRef.current.get(normalizedModelId);
      if (cached) return cached;
      const numericModelId = Number(normalizedModelId);
      const requestModelId = Number.isFinite(numericModelId) ? numericModelId : normalizedModelId;

      updateApiDebugStatus("modelParams", {
        status: "loading",
        message: `POST /ai/viewAIChatModelParams id=${normalizedModelId}`,
      });
      const data = await viewAIChatModelParams(apiFetch, { ai_chat_model_id: requestModelId }, {
        onDebug: (event) => pushApiDebugDetail("modelParams", event),
      });
      const list = extractModelParamList(data);
      aiChatModelParamsCacheRef.current.set(normalizedModelId, list);
      updateApiDebugStatus("modelParams", {
        status: "success",
        message: `id=${normalizedModelId}, params=${list.length}`,
      });
      return list;
    },
    [apiFetch, pushApiDebugDetail, updateApiDebugStatus],
  );

  useEffect(() => {
    let cancelled = false;
    let timerId = 0;
    let timeoutId = 0;
    let activeController = null;

    const loadMemberInfo = async (attempt = 0) => {
      const requestController = new AbortController();
      activeController = requestController;
      let didTimeout = false;

      if (attempt === 0) setMemberInfoLoading(true);
      if (attempt === 0) updateApiDebugStatus("memberInfo", { status: "loading", message: "POST /ai/viewMemberInfo" });
      console.info("[memberInfo] load:attempt", { attempt });
      if (timeoutId) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        didTimeout = true;
        updateApiDebugStatus("memberInfo", { status: "timeout", message: "请求超时(10s)" });
        console.warn("[memberInfo] load:timeout", { attempt });
        requestController.abort(new DOMException("viewMemberInfo timeout", "AbortError"));
      }, 10000);

      try {
        const data = await viewMemberInfo(apiFetch, {}, {
          signal: requestController.signal,
          onDebug: (event) => pushApiDebugDetail("memberInfo", event),
        });
        if (cancelled) return;
        if (timeoutId) window.clearTimeout(timeoutId);
        console.info("[memberInfo] load:done", { attempt, data });
        setMemberInfoLoginUrl("");
        setMemberInfo(data);
        setMemberInfoLoading(false);
        updateApiDebugStatus("memberInfo", { status: "success", message: "获取成功" });
      } catch (error) {
        if (timeoutId) window.clearTimeout(timeoutId);
        if (cancelled) return;
        if (requestController.signal.aborted && !didTimeout) return;
        console.error("[memberInfo] load:failed", {
          attempt,
          didTimeout,
          message: error instanceof Error ? error.message : String(error),
        });
        // const ssoUrl = error?.ssoUrl || error?.data?.data?.sso_url || "";
        const ssoUrl = 'http://test.dayukeji-inc.cn/aigc_test/#/dashboard'
        const isLoginRequired = isLoginRequiredError(error);
        if (ssoUrl) {
          setMemberInfoLoginUrl(ssoUrl);
        }
        if (didTimeout || isLoginRequired) {
          if (isLoginRequired) {
            updateApiDebugStatus("memberInfo", { status: "login_required", message: error?.message || "请登录后再操作" });
          }
          setMemberInfo(null);
          setMemberInfoLoading(false);
          if (isLoginRequired && ssoUrl) {
            navigateToMemberLogin(ssoUrl);
            setRunToast({
              type: "error",
              message: "会员服务未登录，请先完成 SSO 登录。",
              actionLabel: "前往登录",
              onAction: () => navigateToMemberLogin(ssoUrl),
            });
          }
          return;
        }
        updateApiDebugStatus("memberInfo", { status: "error", message: error instanceof Error ? error.message : String(error) });
        if (attempt < 2) {
          timerId = window.setTimeout(() => {
            loadMemberInfo(attempt + 1);
          }, 400 * (attempt + 1));
          return;
        }
        setMemberInfo(null);
        setMemberInfoLoading(false);
      }
    };

    loadMemberInfo();
    return () => {
      cancelled = true;
      activeController?.abort();
      if (timerId) window.clearTimeout(timerId);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [apiFetch, navigateToMemberLogin, pushApiDebugDetail, updateApiDebugStatus]);

  useEffect(() => {
    let cancelled = false;
    let timerId = 0;
    let timeoutId = 0;
    let activeController = null;

    const loadUserAuths = async (attempt = 0) => {
      const requestController = new AbortController();
      activeController = requestController;
      let didTimeout = false;

      if (attempt === 0) setUserAuthsLoading(true);
      if (attempt === 0) updateApiDebugStatus("userAuths", { status: "loading", message: "POST /user/auths" });
      console.info("[userAuths] load:attempt", { attempt });
      if (timeoutId) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        didTimeout = true;
        updateApiDebugStatus("userAuths", { status: "timeout", message: "请求超时(10s)" });
        console.warn("[userAuths] load:timeout", { attempt });
        requestController.abort(new DOMException("viewUserAuths timeout", "AbortError"));
      }, 10000);

      try {
        const data = await viewUserAuths(apiFetch, {}, {
          signal: requestController.signal,
          onDebug: (event) => pushApiDebugDetail("userAuths", event),
        });
        if (cancelled) return;
        if (timeoutId) window.clearTimeout(timeoutId);
        console.info("[userAuths] load:done", { attempt, data, isAdmin: resolveAdminFlagFromUserAuths(data) });
        setUserAuths(data);
        setUserAuthsLoading(false);
        updateApiDebugStatus("userAuths", {
          status: "success",
          message: resolveAdminFlagFromUserAuths(data) ? "admin" : "loaded",
        });
      } catch (error) {
        if (timeoutId) window.clearTimeout(timeoutId);
        if (cancelled) return;
        if (requestController.signal.aborted && !didTimeout) return;
        console.error("[userAuths] load:failed", {
          attempt,
          didTimeout,
          message: error instanceof Error ? error.message : String(error),
        });
        const isLoginRequired = isLoginRequiredError(error);
        if (didTimeout || isLoginRequired) {
          if (isLoginRequired) {
            updateApiDebugStatus("userAuths", { status: "login_required", message: error?.message || "请登录后再操作" });
          }
          setUserAuths(null);
          setUserAuthsLoading(false);
          return;
        }
        updateApiDebugStatus("userAuths", { status: "error", message: error instanceof Error ? error.message : String(error) });
        if (attempt < 2) {
          timerId = window.setTimeout(() => {
            loadUserAuths(attempt + 1);
          }, 400 * (attempt + 1));
          return;
        }
        setUserAuths(null);
        setUserAuthsLoading(false);
      }
    };

    loadUserAuths();
    return () => {
      cancelled = true;
      activeController?.abort();
      if (timerId) window.clearTimeout(timerId);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [apiFetch, pushApiDebugDetail, updateApiDebugStatus]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const requestModelsWithTimeout = async (partEnum, fallbackOptions, debugKey, debugLabel) => {
      const requestController = new AbortController();
      const onAbort = () => requestController.abort();
      controller.signal.addEventListener("abort", onAbort, { once: true });
      updateApiDebugStatus(debugKey, { status: "loading", message: `POST /ai/viewAIChatModels part=${partEnum}` });
      const timeoutId = window.setTimeout(() => {
        updateApiDebugStatus(debugKey, { status: "timeout", message: "请求超时(4s)" });
        requestController.abort(new DOMException("viewAIChatModels timeout", "AbortError"));
      }, 4000);
      try {
        const data = await viewAIChatModels(
          apiFetch,
          { module_enum: 1, part_enum: partEnum },
          {
            signal: requestController.signal,
            onDebug: (event) => pushApiDebugDetail(debugKey, event),
          },
        );
        const options = buildAIChatModelOptions(data, fallbackOptions);
        updateApiDebugStatus(debugKey, { status: "success", message: `${debugLabel}模型 ${options.length}` });
        return options;
      } catch (error) {
        if (!requestController.signal.aborted) {
          console.error(`[aiChat:models] request:error(part=${partEnum})`, {
            message: error instanceof Error ? error.message : String(error),
            status: error?.status,
            err_no: error?.errNo,
            source: error?.source,
            path: error?.path,
            data: error?.data,
          });
          updateApiDebugStatus(debugKey, {
            status: "error",
            message: `${error instanceof Error ? error.message : "请求失败"}${error?.source ? ` [${error.source}]` : ""}`,
          });
        }
        return fallbackOptions;
      } finally {
        window.clearTimeout(timeoutId);
        controller.signal.removeEventListener("abort", onAbort);
      }
    };

    const loadAIChatModels = async () => {
      const language = await requestModelsWithTimeout(
        AI_CHAT_PART_ENUM_1,
        EMPTY_LIST,
        "modelsLang",
        "语言",
      );
      if (cancelled || controller.signal.aborted) return;
      const image = await requestModelsWithTimeout(
        AI_CHAT_PART_ENUM_2,
        EMPTY_LIST,
        "modelsImage",
        "图片",
      );
      if (cancelled || controller.signal.aborted) return;
      const video = await requestModelsWithTimeout(
        AI_CHAT_PART_ENUM_3,
        DEFAULT_VIDEO_MODELS,
        "modelsVideo",
        "视频",
      );
      if (cancelled || controller.signal.aborted) return;
      await requestModelsWithTimeout(
        AI_CHAT_PART_ENUM_6,
        EMPTY_LIST,
        "modelsVideoEnhance",
        "视频超清",
      );
      if (cancelled || controller.signal.aborted) return;

      setAiChatModels({ language, image, video });
    };

    loadAIChatModels();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [apiFetch, pushApiDebugDetail, updateApiDebugStatus]);

  useEffect(() => {
    if (!imageModelRecords.length) {
      updateApiDebugStatus("modelParams", { status: "idle", message: "等待图片模型列表" });
      return;
    }
    const modelId = String(defaultImageModelId || "").trim();
    if (!modelId) {
      updateApiDebugStatus("modelParams", { status: "idle", message: "缺少默认图片模型ID" });
      return;
    }

    let cancelled = false;

    const preloadModelParams = async () => {
      try {
        const list = await resolveModelParamsForId(modelId);
        if (cancelled) return;
        aiChatModelParamsCacheRef.current.set(modelId, list);
      } catch (error) {
        if (cancelled) return;
        console.error(`[aiChat:modelParams] request:error(id=${modelId})`, {
          message: error instanceof Error ? error.message : String(error),
          status: error?.status,
          err_no: error?.errNo,
          source: error?.source,
          path: error?.path,
          data: error?.data,
        });
        updateApiDebugStatus("modelParams", {
          status: "error",
          message: `${error instanceof Error ? error.message : "请求失败"}${error?.source ? ` [${error.source}]` : ""}`,
        });
      }
    };

    updateApiDebugStatus("modelParams", {
      status: "loading",
      message: `POST /ai/viewAIChatModelParams id=${modelId}`,
    });
    preloadModelParams();

    return () => {
      cancelled = true;
    };
  }, [defaultImageModelId, imageModelRecords.length, resolveModelParamsForId, updateApiDebugStatus]);

  useEffect(() => {
    writeAgentDevMode(agentDevMode);
  }, [agentDevMode]);

  const canvasRef = useRef(null);
  const canvasDragDepthRef = useRef(0);
  const nodesRef = useRef(nodes);
  const connectionsRef = useRef(connections);

  const [canvasId] = useState(() => {
    // 如果你后续支持“画布列表/切换”，这里可以从 URL 参数取
    const saved = localStorage.getItem(CANVAS_KEY);
    return saved || newCanvasId();
  });
  const handleLeftSidebarSectionToggle = useCallback((key) => {
    setLeftSidebarSectionOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);
  const handleRightPanelResizeStart = useCallback(
    (e) => {
      if (agentHistoryCollapsed) return;
      e.preventDefault();
      rightPanelResizeRef.current = {
        startX: e.clientX,
        startWidth: rightPanelWidth,
      };
    },
    [agentHistoryCollapsed, rightPanelWidth],
  );
  const toggleAgentHistoryPanel = useCallback(() => {
    setAgentHistoryCollapsed((prev) => !prev);
  }, []);
  const rightPanelContainerStyle = useMemo(
    () => ({
      width: rightPanelWidth,
      height: "min(70vh, calc(100vh - 180px))",
      maxHeight: "calc(100vh - 180px)",
      transition: "width 280ms cubic-bezier(0.22,1,0.36,1)",
    }),
    [rightPanelWidth],
  );

  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { connectionsRef.current = connections; }, [connections]);
  useEffect(() => { viewportRef.current = viewport; }, [viewport]);
  useEffect(() => {
    localStorage.setItem(CANVAS_KEY, canvasId);
  }, [canvasId]);
  useEffect(() => {
    saveAgentStore(agentStore);
  }, [agentStore]);
  useEffect(() => {
    const onMouseMove = (event) => {
      const drag = rightPanelResizeRef.current;
      if (!drag) return;
      const delta = drag.startX - event.clientX;
      const next = Math.min(420, Math.max(280, drag.startWidth + delta));
      setRightPanelWidth(next);
    };
    const onMouseUp = () => {
      rightPanelResizeRef.current = null;
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setAgentStore((prev) => {
        const sessionsNext = (prev.sessions || []).map((session) => {
          if (session.id !== prev.activeSessionId) return session;
          let hasRunning = false;
          const turnsNext = (session.turns || []).map((turn) => {
            if (turn.status !== "running") return turn;
            hasRunning = true;
            return {
              ...turn,
              stepIndex: ((turn.stepIndex || 0) + 1) % AGENT_RUN_STEPS.length,
            };
          });
          if (!hasRunning) return session;
          return { ...session, turns: turnsNext, updatedAt: Date.now() };
        });
        return { ...prev, sessions: sessionsNext };
      });
    }, 900);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    agentConversationBottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [agentTurns]);
  useEffect(() => {
    const resultTurns = agentTurns.filter((turn) => ["done", "error"].includes(turn?.status));
    setAgentResultCards((prev) => {
      const prevByTurnId = new Map(prev.map((item) => [item.turnId, item]));
      return resultTurns.map((turn, idx) => {
        const existing = prevByTurnId.get(turn.id);
        if (existing) return existing;
        return {
          id: `agent_card_${makeAgentId()}`,
          turnId: turn.id,
          x: 120 + (idx % 2) * 500,
          y: 120 + Math.floor(idx / 2) * 360,
          w: 460,
          collapsed: false,
          minimized: false,
        };
      });
    });
    setActiveAgentCardId(null);
    setSelectedAgentCardIds(new Set());
  }, [activeAgentSession?.id, agentTurns]);
  useEffect(() => () => {
    agentCardDragRef.current = null;
  }, []);
  const [activeArtifact, setActiveArtifact] = useState(null);

  const _applyPatch = useCallback((patchOps) => {
  if (!Array.isArray(patchOps) || patchOps.length === 0) return;

  // 从 ref 拿最新快照，避免闭包/批处理导致的“旧状态”
  let nextNodes = Array.isArray(nodesRef.current) ? [...nodesRef.current] : [];
  let nextConns = Array.isArray(connectionsRef.current) ? [...connectionsRef.current] : [];

  let finalSelectedNodeIds = null;
  let finalSelectedConnectionIds = null;
  let finalViewport = null;

  const hasNode = (id) => nextNodes.some(n => n?.id === id);
  const hasConn = (id) => nextConns.some(c => c?.id === id);

  const removeNodeAndEdges = (nodeId) => {
    nextNodes = nextNodes.filter(n => n.id !== nodeId);
    nextConns = nextConns.filter(c => c.from !== nodeId && c.to !== nodeId);
  };

  const removeConnById = (connId) => {
    nextConns = nextConns.filter(c => c.id !== connId);
  };

  patchOps.forEach((op) => {
    if (!op || !op.op) return;

    switch (op.op) {
      case "add_node": {
        const node = op.node;
        if (!node?.id) return;
        // 避免重复 add
        if (!hasNode(node.id)) nextNodes.push(node);
        break;
      }

      case "add_connection": {
        const c = op.connection;
        if (!c?.id || !c.from || !c.to) return;
        if (!hasConn(c.id)) nextConns.push(c);
        break;
      }

      case "update_node": {
        const id = op.id;
        if (!id) return;
        nextNodes = nextNodes.map(n => {
          if (n.id !== id) return n;

          // 允许更新 x/y（可选）
          const x = op.x ?? n.x;
          const y = op.y ?? n.y;

          // 合并 data（浅合并，够用；如果你 data 很深可换 deep merge）
          const mergedData = { ...(n.data || {}), ...(op.data || {}) };

          return { ...n, x, y, data: mergedData };
        });
        break;
      }

      // ✅兼容：remove_* / delete_* 都支持
      case "remove_node":
      case "delete_node": {
        if (!op.id) return;
        removeNodeAndEdges(op.id);
        break;
      }

      case "remove_connection":
      case "delete_connection": {
        if (!op.id) return;
        removeConnById(op.id);
        break;
      }

      // 可选：移动节点（如果后端以后加 move_node）
      case "move_node": {
        const { id, x, y } = op;
        if (!id) return;
        nextNodes = nextNodes.map(n => (n.id === id ? { ...n, x: x ?? n.x, y: y ?? n.y } : n));
        break;
      }

      // 可选：替换连接（等价于 remove + add）
      case "replace_connection": {
        const { id, connection } = op;
        if (id) removeConnById(id);
        if (connection?.id && connection.from && connection.to && !hasConn(connection.id)) {
          nextConns.push(connection);
        }
        break;
      }

      case "select_nodes": {
        finalSelectedNodeIds = new Set(op.ids || []);
        finalSelectedConnectionIds = new Set();
        break;
      }

      case "set_viewport": {
        finalViewport = op.viewport || null;
        break;
      }

      default:
        break;
    }
  });

  // 最后一次性提交（更稳）
  setNodes(nextNodes);
  setConnections(nextConns);

  if (finalSelectedNodeIds) {
    setSelectedNodeIds(finalSelectedNodeIds);
    setSelectedConnectionIds(finalSelectedConnectionIds || new Set());
  }
  if (finalViewport) setViewport(finalViewport);
}, [setNodes, setConnections, setSelectedNodeIds, setSelectedConnectionIds, setViewport]);

  // Initialize
  useEffect(() => {
    apiFetch("/docs")
      .then((r) => (r.ok ? setApiStatus("online") : setApiStatus("offline")))
      .catch(() => setApiStatus("offline"));

    if (history.length === 0) {
      setHistory([{ nodes: [], connections: [] }]);
      setHistoryStep(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiFetch]);

  // Sync active node
  useEffect(() => {
    if (selectedNodeIds.size === 1) setActiveNodeId(Array.from(selectedNodeIds)[0]);
    else setActiveNodeId(null);
  }, [selectedNodeIds]);

  const pushHistory = useCallback(() => {
    const s = { nodes: JSON.parse(JSON.stringify(nodes)), connections: JSON.parse(JSON.stringify(connections)) };
    setHistory((p) => {
      const n = p.slice(0, historyStep + 1);
      n.push(s);
      if (n.length > 50) n.shift();
      return n;
    });
    setHistoryStep((p) => Math.min(p + 1, 49));
  }, [nodes, connections, historyStep]);

  const undo = () => {
    if (historyStep > 0) {
      const p = history[historyStep - 1];
      setNodes(p.nodes);
      setConnections(p.connections);
      setHistoryStep(historyStep - 1);
    }
  };

  const redo = () => {
    if (historyStep < history.length - 1) {
      const n = history[historyStep + 1];
      setNodes(n.nodes);
      setConnections(n.connections);
      setHistoryStep(historyStep + 1);
    }
  };

  const deleteSelection = () => {
    if (selectedNodeIds.size === 0 && selectedConnectionIds.size === 0) return;
    pushHistory();
    setNodes((p) => p.filter((n) => !selectedNodeIds.has(n.id)));
    setConnections((p) =>
      p.filter((c) => !selectedConnectionIds.has(c.id) && !selectedNodeIds.has(c.from) && !selectedNodeIds.has(c.to))
    );
    setSelectedNodeIds(new Set());
    setSelectedConnectionIds(new Set());
  };

  useEffect(() => {
    const kd = (e) => {
      const lowerKey = e.key.toLowerCase();
      if (lowerKey === "e" && e.ctrlKey && e.shiftKey) {
        e.preventDefault();
        toggleAgentHistoryPanel();
        return;
      }
      if (["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
      switch (lowerKey) {
        case " ":
          if (
            !e.repeat &&
            activeArtifact?.url &&
            !isVideoContent(activeArtifact.url) &&
            !previewImage
          ) {
            e.preventDefault();
            previewOpenedBySpaceRef.current = true;
            setPreviewImage(activeArtifact.url);
            return;
          }
          if (!e.repeat) setIsSpacePressed(true);
          break;
        case "z":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            e.shiftKey ? redo() : undo();
          }
          break;
        case "y":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            redo();
          }
          break;
        case "a":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            setSelectedNodeIds(new Set(nodes.map((n) => n.id)));
          }
          break;
        case "delete":
        case "backspace":
          deleteSelection();
          break;
        case "=":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            zoomCanvas(0.2);
          }
          break;
        case "-":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            zoomCanvas(-0.2);
          }
          break;
        case "0":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            setViewport({ x: 0, y: 0, zoom: 1 });
          }
          break;
      }
    };
    const ku = (e) => {
      if (e.key === " ") {
        if (previewOpenedBySpaceRef.current) {
          previewOpenedBySpaceRef.current = false;
          setPreviewImage((current) => (current === activeArtifact?.url ? null : current));
          return;
        }
        setIsSpacePressed(false);
      }
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, history, historyStep, selectedNodeIds, selectedConnectionIds, toggleAgentHistoryPanel, activeArtifact, previewImage]);

  const screenToCanvas = useCallback((sx, sy) => {
    const r = canvasRef.current?.getBoundingClientRect();
    return {
      x: (sx - (r ? r.left : 0) - viewport.x) / viewport.zoom,
      y: (sy - (r ? r.top : 0) - viewport.y) / viewport.zoom,
    };
  }, [viewport]);

  const zoomCanvas = (d, c = { x: window.innerWidth / 2, y: window.innerHeight / 2 }) => {
    const z = Math.min(Math.max(viewport.zoom + d, MIN_ZOOM), MAX_ZOOM);
    const w = screenToCanvas(c.x, c.y);
    const r = canvasRef.current?.getBoundingClientRect();
    setViewport({
      x: c.x - (r ? r.left : 0) - w.x * z,
      y: c.y - (r ? r.top : 0) - w.y * z,
      zoom: z,
    });
  };

  const handleWheel = (e) => {
    if (e.ctrlKey || e.metaKey) e.preventDefault();
    zoomCanvas(-e.deltaY * 0.001, { x: e.clientX, y: e.clientY });
  };

  const handleCanvasMouseDown = (e) => {
    if (e.button === 1 || (e.button === 0 && (isSpacePressed || e.altKey || e.metaKey))) {
      setInteractionMode("panning");
      setDragStart({ x: e.clientX - viewport.x, y: e.clientY - viewport.y });
      return;
    }
    if (e.button === 0 && !isSpacePressed && !e.altKey && !e.metaKey) {
      const appendSelection = e.shiftKey || e.ctrlKey;
      if (!appendSelection) {
        setSelectedNodeIds(new Set());
        setSelectedConnectionIds(new Set());
        setSelectedAgentCardIds(new Set());
        setActiveAgentCardId(null);
      }
      const s = screenToCanvas(e.clientX, e.clientY);
      setSelectionBox({ startX: s.x, startY: s.y, curX: s.x, curY: s.y, appendSelection });
      setInteractionMode("selecting");
    }
  };

const handleNodeMouseDown = (e, nid) => {
  e.stopPropagation();

  // ✅ 如果点在 nodrag 区域：只做“选中”，不要进入拖拽
  const isNoDragZone = !!e.target.closest(".nodrag");

  const s = new Set(selectedNodeIds);
  if (e.shiftKey || e.ctrlKey) s.has(nid) ? s.delete(nid) : s.add(nid);
  else if (!s.has(nid)) { s.clear(); s.add(nid); }

  setSelectedNodeIds(s);
  setSelectedConnectionIds(new Set());

  if (isNoDragZone) {
    setInteractionMode("idle");
    return;
  }

  setInteractionMode("dragging_node");
  setDragStart({ x: e.clientX, y: e.clientY });

  const p = {};
  nodes.forEach(n => {
    if (s.has(n.id) || n.id === nid) p[n.id] = { x: n.x, y: n.y };
  });
  setInitialNodePos(p);

  if (nodeDragCleanupRef.current) {
    nodeDragCleanupRef.current();
  }

  const startX = e.clientX;
  const startY = e.clientY;

  const onWindowMouseMove = (event) => {
    const dx = (event.clientX - startX) / viewport.zoom;
    const dy = (event.clientY - startY) / viewport.zoom;
    setNodes((prev) =>
      prev.map((n) => (p[n.id] ? { ...n, x: p[n.id].x + dx, y: p[n.id].y + dy } : n))
    );
  };

  const cleanupDrag = () => {
    window.removeEventListener("mousemove", onWindowMouseMove);
    window.removeEventListener("mouseup", cleanupDrag, true);
    window.removeEventListener("blur", cleanupDrag);
    nodeDragCleanupRef.current = null;
    setInteractionMode((prev) => {
      if (prev === "dragging_node") pushHistory();
      return "idle";
    });
    setSelectionBox(null);
    setConnectingSource(null);
  };

  nodeDragCleanupRef.current = cleanupDrag;
  window.addEventListener("mousemove", onWindowMouseMove);
  window.addEventListener("mouseup", cleanupDrag, true);
  window.addEventListener("blur", cleanupDrag);
};

  const handleMouseMove = useCallback(
    (e) => {
      setMousePos({ x: e.clientX, y: e.clientY });
      if (interactionMode === "panning") setViewport({ ...viewport, x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
      else if (interactionMode === "dragging_node") {
        const dx = (e.clientX - dragStart.x) / viewport.zoom;
        const dy = (e.clientY - dragStart.y) / viewport.zoom;
        setNodes((p) =>
          p.map((n) => (initialNodePos[n.id] ? { ...n, x: initialNodePos[n.id].x + dx, y: initialNodePos[n.id].y + dy } : n))
        );
      } else if (interactionMode === "selecting") {
        const c = screenToCanvas(e.clientX, e.clientY);
        setSelectionBox((p) => ({ ...p, curX: c.x, curY: c.y }));
      }
    },
    [interactionMode, dragStart, viewport, initialNodePos, screenToCanvas]
  );

  const handleMouseUp = useCallback(() => {
    if (interactionMode === "dragging_node") {
      nodeDragCleanupRef.current?.();
      return;
    }
    if (interactionMode === "dragging_node") pushHistory();
    if (interactionMode === "selecting" && selectionBox) {
      const x1 = Math.min(selectionBox.startX, selectionBox.curX);
      const x2 = Math.max(selectionBox.startX, selectionBox.curX);
      const y1 = Math.min(selectionBox.startY, selectionBox.curY);
      const y2 = Math.max(selectionBox.startY, selectionBox.curY);
      const appendSelection = !!selectionBox.appendSelection;
      const s = appendSelection ? new Set(selectedNodeIds) : new Set();
      nodes.forEach((n) => {
        if (n.x < x2 && n.x + 280 > x1 && n.y < y2 && n.y + 200 > y1) s.add(n.id);
      });
      setSelectedNodeIds(s);
      const selectedCards = appendSelection ? new Set(selectedAgentCardIds) : new Set();
      agentResultCards.forEach((card) => {
        if (card.minimized) return;
        const cardHeight = card.collapsed ? 70 : 420;
        if (card.x < x2 && card.x + (card.w || 460) > x1 && card.y < y2 && card.y + cardHeight > y1) {
          selectedCards.add(card.id);
        }
      });
      setSelectedAgentCardIds(selectedCards);
      if (selectedCards.size === 1) setActiveAgentCardId(Array.from(selectedCards)[0]);
      if (selectedCards.size === 0) setActiveAgentCardId(null);
    }
    setInteractionMode("idle");
    setSelectionBox(null);
    setConnectingSource(null);
  }, [interactionMode, selectionBox, selectedNodeIds, nodes, selectedAgentCardIds, agentResultCards, activeAgentCardId, pushHistory]);

  useEffect(() => {
    if (!["panning", "selecting"].includes(interactionMode)) return undefined;

    const handleWindowMouseMove = (event) => {
      handleMouseMove(event);
    };
    const handleWindowMouseUp = () => {
      handleMouseUp();
    };

    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("mouseup", handleWindowMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup", handleWindowMouseUp);
    };
  }, [interactionMode, handleMouseMove, handleMouseUp]);

  const getCursor = () => (interactionMode === "panning" || isSpacePressed ? "grab" : interactionMode === "dragging_node" ? "grabbing" : "default");

  const createCompactInputNodeAt = useCallback((point, mediaItems) => {
    const safeMediaItems = Array.isArray(mediaItems) ? mediaItems.filter(Boolean) : [];
    if (!safeMediaItems.length) return;
    const hasVideos = safeMediaItems.some((item) => isVideoContent(item));

    pushHistory();
    const nodeId = generateId();
    const nextNode = {
      id: nodeId,
      type: NODE_TYPES.INPUT,
      x: point.x - 118,
      y: point.y - 88,
      data: {
        images: safeMediaItems,
        compact: true,
        title: hasVideos ? "图片/视频编辑区" : "图片编辑区",
      },
    };

    setNodes((prev) => [...prev, nextNode]);
    setSelectedNodeIds(new Set([nodeId]));
    setSelectedConnectionIds(new Set());
    setActiveNodeId(nodeId);
  }, [pushHistory]);

  const handleCanvasDragEnter = useCallback((e) => {
    const hasMediaFiles = Array.from(e.dataTransfer?.items || []).some(
      (item) =>
        item.kind === "file" &&
        (String(item.type || "").startsWith("image/") || String(item.type || "").startsWith("video/")),
    );
    if (!hasMediaFiles) return;
    canvasDragDepthRef.current += 1;
    setCanvasDropActive(true);
  }, []);

  const handleCanvasDragOver = useCallback((e) => {
    const hasMediaFiles = Array.from(e.dataTransfer?.items || []).some(
      (item) =>
        item.kind === "file" &&
        (String(item.type || "").startsWith("image/") || String(item.type || "").startsWith("video/")),
    );
    if (!hasMediaFiles) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (!canvasDropActive) setCanvasDropActive(true);
  }, [canvasDropActive]);

  const handleCanvasDragLeave = useCallback((e) => {
    const nextTarget = e.relatedTarget;
    if (nextTarget && canvasRef.current?.contains(nextTarget)) return;
    canvasDragDepthRef.current = Math.max(0, canvasDragDepthRef.current - 1);
    if (canvasDragDepthRef.current === 0) setCanvasDropActive(false);
  }, []);

  const handleCanvasDrop = useCallback(async (e) => {
    const files = Array.from(e.dataTransfer?.files || []).filter(
      (file) => String(file.type || "").startsWith("image/") || String(file.type || "").startsWith("video/"),
    );
    canvasDragDepthRef.current = 0;
    setCanvasDropActive(false);
    if (!files.length) return;

    e.preventDefault();
    const point = screenToCanvas(e.clientX, e.clientY);
    const droppedMediaItems = await readFilesAsDataUrls(files);
    createCompactInputNodeAt(point, droppedMediaItems);
  }, [createCompactInputNodeAt, screenToCanvas]);

  const addNode = (t, modePreset = null) => {
    if (t === NODE_TYPES.POST_PROCESSOR) return;
    pushHistory();
    const id = generateId();

    const r = canvasRef.current?.getBoundingClientRect();
    const cx = r ? r.width / 2 : window.innerWidth / 2;
    const cy = r ? r.height / 2 : window.innerHeight / 2;
    const c = screenToCanvas(cx, cy);

    const d = {
      [NODE_TYPES.INPUT]: { images: [] },
      [NODE_TYPES.TEXT_INPUT]: { text: "" },
      [NODE_TYPES.PROCESSOR]: {
        ...getProcessorModeDefaults(modePreset || "multi_image_generate"),
        batchSize: 1,
        uploadedImages: [],
        status: "idle",
        refImage: null,
        model: getProcessorModeDefaults(modePreset || "multi_image_generate").model || defaultImageModelId,
      },
      [NODE_TYPES.POST_PROCESSOR]: {
        mode: "relight",
        prompt: "",
        templates: { style: "", vibe: "", direction: "", note: "" },
        batchSize: 1,
        status: "idle",
        refImage: null,
        model: defaultImageModelId,
      },
      [NODE_TYPES.VIDEO_GEN]: {
        mode: modePreset === "local_img2video" ? "local_img2video" : "img2video",
        prompt: "",
        templates:
          modePreset === "local_img2video"
            ? { duration: 5, resolution: "480p", ratio: "1:1", note: "" }
            : { motion: "", camera: "", duration: 5, resolution: "1080p", ratio: "", note: "", generate_audio_new: true },
        batchSize: 1,
        status: "idle",
        refImage: null,
        model: modePreset === "local_img2video" ? "comfyui-qwen-i2v" : defaultVideoModelId,
      },
      [NODE_TYPES.OUTPUT]: { images: [] },
    };

    const newNode = { id, type: t, x: c.x - 140, y: c.y - 100, data: d[t] };

    let newConnection = null;
    if (selectedNodeIds.size === 1) {
      const sourceId = Array.from(selectedNodeIds)[0];
      const sourceNode = nodes.find((n) => n.id === sourceId);
      const canOutput = sourceNode?.type !== NODE_TYPES.OUTPUT;
      const canInput = t !== NODE_TYPES.INPUT && t !== NODE_TYPES.TEXT_INPUT;
      if (sourceNode && canOutput && canInput) {
        newConnection = { id: generateId(), from: sourceId, to: id };
        newNode.x = sourceNode.x + 350;
        newNode.y = sourceNode.y;
      }
    }

    setNodes((p) => [...p, newNode]);
    if (newConnection) setConnections((p) => [...p, newConnection]);
    setSelectedNodeIds(new Set([id]));
  };

  const createText2ImgTemplate = () => {
    pushHistory();
    const n1 = { id: generateId(), type: NODE_TYPES.TEXT_INPUT, x: 100, y: 200, data: { text: "赛博朋克风格的未来城市街道，霓虹灯光" } };
    const n2 = { id: generateId(), type: NODE_TYPES.PROCESSOR, x: 500, y: 200, data: { mode: "text2img", prompt: "", templates: { size: "1024x1024", aspect_ratio: "1:1" }, batchSize: 1, status: "idle", model: defaultImageModelId } };
    const n3 = { id: generateId(), type: NODE_TYPES.OUTPUT, x: 900, y: 200, data: { images: [] } };
    setNodes([n1, n2, n3]);
    setConnections([
      { id: generateId(), from: n1.id, to: n2.id },
      { id: generateId(), from: n2.id, to: n3.id },
    ]);
    setViewport({ x: 0, y: 0, zoom: 1 });
  };

  const createImg2ImgTemplate = () => {
    pushHistory();
    const n0 = { id: generateId(), type: NODE_TYPES.TEXT_INPUT, x: 100, y: 100, data: { text: "保持原图构图，转为水彩风格" } };
    const n1 = { id: generateId(), type: NODE_TYPES.INPUT, x: 100, y: 350, data: { images: [] } };
    const n2 = { id: generateId(), type: NODE_TYPES.PROCESSOR, x: 500, y: 200, data: { mode: "multi_image_generate", prompt: "", templates: { size: "1024x1024", note: "" }, batchSize: 1, uploadedImages: [], status: "idle", model: defaultImageModelId } };
    const n3 = { id: generateId(), type: NODE_TYPES.OUTPUT, x: 900, y: 200, data: { images: [] } };
    setNodes([n0, n1, n2, n3]);
    setConnections([
      { id: generateId(), from: n0.id, to: n2.id },
      { id: generateId(), from: n1.id, to: n2.id },
      { id: generateId(), from: n2.id, to: n3.id },
    ]);
    setViewport({ x: 0, y: 0, zoom: 1 });
  };

  const createImg2VideoTemplate = () => {
    pushHistory();
    const n1 = { id: generateId(), type: NODE_TYPES.INPUT, x: 100, y: 200, data: { images: [] } };
    const n2 = { id: generateId(), type: NODE_TYPES.VIDEO_GEN, x: 500, y: 200, data: { mode: "img2video",model: defaultVideoModelId, prompt: "", templates: { motion: "标准(Standard)", camera: "推近(Zoom In)", duration: 5, resolution: "1080p", ratio: "", note: "" ,generate_audio_new: true,}, batchSize: 1, status: "idle", refImage: null } };
    const n3 = { id: generateId(), type: NODE_TYPES.OUTPUT, x: 900, y: 200, data: { images: [] } };
    setNodes([n1, n2, n3]);
    setConnections([
      { id: generateId(), from: n1.id, to: n2.id },
      { id: generateId(), from: n2.id, to: n3.id },
    ]);
    setViewport({ x: 0, y: 0, zoom: 1 });
  };

  const createVideoUpscaleTemplate = () => {
    pushHistory();
    const n1 = { id: generateId(), type: NODE_TYPES.INPUT, x: 100, y: 200, data: { images: [] } };
    const n2 = {
      id: generateId(),
      type: NODE_TYPES.PROCESSOR,
      x: 500,
      y: 200,
      data: {
        mode: "video_upscale",
        prompt: "视频画质增强",
        templates: { template_enum: VOLC_VIDEO_HD_TEMPLATE_ENUM_1 },
        batchSize: 1,
        status: "idle",
        refImage: null,
        model: DEFAULT_VIDEO_HD_MODEL_ID,
      },
    };
    const n3 = { id: generateId(), type: NODE_TYPES.OUTPUT, x: 900, y: 200, data: { images: [] } };
    setNodes([n1, n2, n3]);
    setConnections([
      { id: generateId(), from: n1.id, to: n2.id },
      { id: generateId(), from: n2.id, to: n3.id },
    ]);
    setViewport({ x: 0, y: 0, zoom: 1 });
  };

  const createLocalText2ImgTemplate = () => {
    pushHistory();
    const n1 = { id: generateId(), type: NODE_TYPES.TEXT_INPUT, x: 100, y: 200, data: { text: "极简电商海报风格，主体居中，光线干净，细节清晰" } };
    const n2 = {
      id: generateId(),
      type: NODE_TYPES.PROCESSOR,
      x: 500,
      y: 200,
      data: {
        mode: "local_text2img",
        prompt: "",
        templates: { size: "1024x1024", aspect_ratio: "1:1" },
        batchSize: 1,
        uploadedImages: [],
        status: "idle",
        refImage: null,
        model: "comfyui-image-z-image-turbo",
      },
    };
    const n3 = { id: generateId(), type: NODE_TYPES.OUTPUT, x: 900, y: 200, data: { images: [] } };
    setNodes([n1, n2, n3]);
    setConnections([
      { id: generateId(), from: n1.id, to: n2.id },
      { id: generateId(), from: n2.id, to: n3.id },
    ]);
    setViewport({ x: 0, y: 0, zoom: 1 });
  };

  const createLocalImg2VideoTemplate = () => {
    pushHistory();
    const n1 = { id: generateId(), type: NODE_TYPES.INPUT, x: 100, y: 200, data: { images: [] } };
    const n2 = {
      id: generateId(),
      type: NODE_TYPES.VIDEO_GEN,
      x: 500,
      y: 200,
      data: {
        mode: "local_img2video",
        model: "comfyui-qwen-i2v",
        prompt: "natural motion",
        templates: { duration: 5, resolution: "480p", ratio: "1:1", note: "" },
        batchSize: 1,
        status: "idle",
        refImage: null,
      },
    };
    const n3 = { id: generateId(), type: NODE_TYPES.OUTPUT, x: 900, y: 200, data: { images: [] } };
    setNodes([n1, n2, n3]);
    setConnections([
      { id: generateId(), from: n1.id, to: n2.id },
      { id: generateId(), from: n2.id, to: n3.id },
    ]);
    setViewport({ x: 0, y: 0, zoom: 1 });
  };

  const createConnectedVideoNode = (sourceNodeId) => {
    pushHistory();
    const sourceNode = nodes.find((n) => n.id === sourceNodeId);
    if (!sourceNode) return;
    const newNodeId = generateId();
    const newNode = {
      id: newNodeId,
      type: NODE_TYPES.VIDEO_GEN,
      x: sourceNode.x + 350,
      y: sourceNode.y,
      data: {
        mode: "img2video",
        model: defaultVideoModelId,
        prompt: sourceNode.data.prompt || "",
        templates: { motion: "标准(Standard)", camera: "固定镜头(Fixed)", duration: 5,  resolution: "1080p", ratio: "", note: "",generate_audio_new: true, },
        batchSize: 1,
        status: "idle",
        refImage: null,
      },
    };
    setNodes((prev) => [...prev, newNode]);
    setConnections((prev) => [...prev, { id: generateId(), from: sourceNodeId, to: newNodeId }]);
    setSelectedNodeIds(new Set([newNodeId]));
  };

  const runCompactRemoveWatermark = useCallback(
    async (sourceNodeId, imageIndex = 0) => {
      try {
        const sourceNode = nodesRef.current.find((n) => n.id === sourceNodeId);
        const images = Array.isArray(sourceNode?.data?.images) ? sourceNode.data.images : [];
        const safeIndex = Math.max(0, Math.min(imageIndex, images.length - 1));
        const sourceImage = images[safeIndex] || images[0] || "";
        if (!sourceImage) {
          throw new Error("缺少去水印输入图片");
        }

        const resp = await apiFetch(`/api/remove_watermark`, {
          method: "POST",
          skipAuth: true,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image: sourceImage,
            size: "1024x1024",
            aspect_ratio: "1:1",
          }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          throw new Error(extractApiError(data));
        }

        const nextImage = data.image || data.images?.[0] || "";
        if (!nextImage) {
          throw new Error("去水印未返回结果");
        }

        const nextImages = [...images];
        nextImages[safeIndex] = nextImage;
        pushHistory();
        updateNodeData(sourceNodeId, {
          images: nextImages,
          status: "idle",
          error: "",
        });
        setRunToast({ message: "去水印完成", type: "info" });
        setTimeout(() => setRunToast(null), 2200);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error || "去水印失败");
        setRunToast({ message: `去水印失败：${message}`, type: "error" });
        setTimeout(() => setRunToast(null), 2600);
        throw error;
      }
    },
    [apiFetch, pushHistory],
  );

  // ✅ 继续图生图：在“文生图(text2img)”后，自动接：输入 -> 图生图 -> 输出
  const createConnectedImg2ImgBranch = useCallback(
    (sourceNodeId) => {
      pushHistory();

      const sourceNode = nodesRef.current.find((n) => n.id === sourceNodeId);
      if (!sourceNode) return;

      const imgs = sourceNode.data.images || [];

      // 优先用你刚刚“点缩略图选中的产物”
      const picked =
        activeArtifact?.fromNodeId === sourceNodeId ? activeArtifact.url : (imgs[0] || null);

      if (!picked) return;

      const inId = generateId();
      const procId = generateId();
      const outId = generateId();

      // 放到源节点右下方，避免重叠
      const baseX = sourceNode.x + 350;
      const baseY = sourceNode.y + 240;

      const inputNode = {
        id: inId,
        type: NODE_TYPES.INPUT,
        x: baseX,
        y: baseY,
        data: { images: [picked] },
      };

      const img2imgNode = {
        id: procId,
        type: NODE_TYPES.PROCESSOR,
        x: baseX + 350,
        y: baseY,
        data: {
          mode: "multi_image_generate",
          prompt: "",
          templates: { size: "1024x1024", note: "" },
          batchSize: 1,
          uploadedImages: [],
          status: "idle",
          refImage: null,
          model: defaultImageModelId,
        },
      };

      const outputNode = {
        id: outId,
        type: NODE_TYPES.OUTPUT,
        x: baseX + 700,
        y: baseY,
        data: { images: [] },
      };

      setNodes((prev) => [...prev, inputNode, img2imgNode, outputNode]);

      // 连起来：文生图 -> 输入(锁定图) -> 图生图 -> 输出
      setConnections((prev) => [
        ...prev,
        { id: generateId(), from: sourceNodeId, to: inId },
        { id: generateId(), from: inId, to: procId },
        { id: generateId(), from: procId, to: outId },
      ]);

      setSelectedNodeIds(new Set([procId]));
      setSelectedConnectionIds(new Set());
    },
    [pushHistory, activeArtifact, defaultImageModelId],
  );

  const runCompactVideoUpscale = useCallback(
    async (sourceNodeId, imageIndex = 0, templateEnum = VOLC_VIDEO_HD_TEMPLATE_ENUM_1) => {
      const sourceNode = nodesRef.current.find((node) => node.id === sourceNodeId);
      const sourceImages = Array.isArray(sourceNode?.data?.images) ? sourceNode.data.images : [];
      const safeIndex = Math.max(0, Math.min(imageIndex, sourceImages.length - 1));
      const retrySources =
        sourceNode?.data?.compactVideoUpscaleSources && typeof sourceNode.data.compactVideoUpscaleSources === "object"
          ? sourceNode.data.compactVideoUpscaleSources
          : {};
      const retrySourceVideo = String(retrySources?.[safeIndex] || "").trim();
      const sourceVideo = retrySourceVideo || sourceImages[safeIndex] || sourceImages[0] || "";
      if (!sourceVideo || !isVideoContent(sourceVideo)) {
        throw new Error("缺少可用于视频超清的视频素材");
      }

      const safeTemplateEnum =
        parseInt(String(templateEnum ?? VOLC_VIDEO_HD_TEMPLATE_ENUM_1), 10) || VOLC_VIDEO_HD_TEMPLATE_ENUM_1;
      const authorizationInfo = resolveMemberAuthorizationInfo();
      const proxyPayload = {
        authorization: authorizationInfo?.value || "",
        history_ai_chat_record_id: aiChatHistoryRecordIdRef.current || "",
        module_enum: WORKBENCH_AI_CHAT_MODULE_ENUM,
        part_enum: String(resolveWorkbenchAIChatPartEnum({ mode: "video_upscale" })),
        ai_chat_session_id: aiChatSessionIdRef.current || "",
        ai_chat_model_id: DEFAULT_VIDEO_HD_MODEL_ID,
        message: "视频画质增强",
        template_enum: String(safeTemplateEnum),
        async: "false",
        files: [sourceVideo],
      };

      if (!proxyPayload.authorization) {
        throw new Error("缺少 member authorization，无法调用后端curl代理");
      }

      updateApiDebugStatus("aiChatImage", {
        status: "loading",
        message: `POST /api/ai_chat_image_via_curl part=${resolveWorkbenchAIChatPartEnum({ mode: "video_upscale" })}`,
      });
      pushApiDebugDetail("aiChatImage", {
        type: "start",
        path: "/api/ai_chat_image_via_curl",
        payload: {
          ...proxyPayload,
          authorization: `${proxyPayload.authorization.slice(0, 18)}...`,
          files: ["count=1(video)"],
        },
        authorizationSource: authorizationInfo?.source || "none",
      });

      const proxyData = await submitAIChatImageTask(apiFetch, proxyPayload, {
        onDebug: (event) => pushApiDebugDetail("aiChatImage", event),
      });
      if (proxyData?.source_session_id) aiChatSessionIdRef.current = String(proxyData.source_session_id);
      if (proxyData?.source_history_record_id) aiChatHistoryRecordIdRef.current = String(proxyData.source_history_record_id);

      const resultUrl =
        pickFirstVideoUrl(proxyData?.video_url) ||
        pickFirstVideoUrl(proxyData?.output_video) ||
        pickFirstVideoUrl(proxyData?.events) ||
        pickFirstVideoUrl(proxyData?.text) ||
        pickFirstVideoUrl(proxyData) ||
        pickFirstImageUrl(proxyData?.image_url) ||
        pickFirstImageUrl(proxyData?.events) ||
        pickFirstImageUrl(proxyData?.text) ||
        "";
      const doneErrMsg = String(proxyData?.done_error || "").trim();
      if (!resultUrl && doneErrMsg) {
        throw new Error(`AI Chat 返回错误：${doneErrMsg}`);
      }
      if (!resultUrl) {
        const summary = summarizeAIChatResponse(proxyData);
        throw new Error(`aiChat 视频超清未返回可解析URL${summary ? ` | 响应摘要: ${summary}` : ""}`);
      }

      pushHistory();
      const nextImages = [...sourceImages];
      nextImages[safeIndex] = resultUrl;
      updateNodeData(sourceNodeId, {
        images: nextImages,
        compactVideoUpscaleSources: {
          ...retrySources,
          [safeIndex]: retrySourceVideo || sourceVideo,
        },
        compactVideoUpscaleLastResultVideo: resultUrl,
        compactVideoUpscaleLastTemplateEnum: safeTemplateEnum,
        status: "idle",
        error: "",
      });
      updateApiDebugStatus("aiChatImage", {
        status: "success",
        message: `part=${resolveWorkbenchAIChatPartEnum({ mode: "video_upscale" })} template=${safeTemplateEnum}`,
      });
      setRunToast({ message: `视频超清完成 (${safeTemplateEnum === VOLC_VIDEO_HD_TEMPLATE_ENUM_2 ? "4K" : "2K"})`, type: "info" });
      setTimeout(() => setRunToast(null), 2200);
    },
    [apiFetch, pushHistory],
  );

  const updateActiveAgentSession = useCallback((updater) => {
    setAgentStore((prev) => {
      const sessionsNext = (prev.sessions || []).map((session) => {
        if (session.id !== prev.activeSessionId) return session;
        const next = updater(session);
        return { ...next, updatedAt: Date.now() };
      });
      return { ...prev, sessions: sessionsNext };
    });
  }, []);

  const createAgentSession = () => {
    const nextSession = createDefaultAgentSession();
    setAgentStore((prev) => ({
      sessions: [nextSession, ...(prev.sessions || [])],
      activeSessionId: nextSession.id,
    }));
    setAgentInput("");
  };

  const setActiveAgentSession = (sessionId) => {
    setAgentStore((prev) => ({ ...prev, activeSessionId: sessionId }));
  };

  const clearActiveAgentConversation = useCallback(() => {
    if (isAgentMissionRunning) {
      setRunToast({ message: "Agent 正在执行任务，请稍后再清除对话记录", type: "error" });
      return;
    }
    if (!hasActiveAgentConversation) {
      setRunToast({ message: "当前会话暂无可清除的对话记录", type: "info" });
      return;
    }
    const turnCount = activeAgentSession?.turns?.length || 0;
    if (!window.confirm(`确认清除当前会话的对话记录吗？${turnCount > 0 ? `（共 ${turnCount} 条）` : ""}`)) {
      return;
    }
    updateActiveAgentSession((session) => ({
      ...session,
      title: "新会话",
      turns: [],
      pendingTask: null,
    }));
    setAgentInput("");
    setAgentResultCards([]);
    setSelectedAgentCardIds(new Set());
    setActiveAgentCardId(null);
    setRunToast({ message: "已清除当前会话对话记录", type: "info" });
  }, [
    activeAgentSession?.turns?.length,
    hasActiveAgentConversation,
    isAgentMissionRunning,
    updateActiveAgentSession,
  ]);

  const setPendingTaskForActiveSession = useCallback(
    (task) => {
      updateActiveAgentSession((session) => ({ ...session, pendingTask: task || null }));
    },
    [updateActiveAgentSession],
  );

  const clearPendingTaskForActiveSession = useCallback(() => {
    setPendingTaskForActiveSession(null);
  }, [setPendingTaskForActiveSession]);

  const mapPreferenceListToKey = useCallback((preferences) => {
    const byKey = {};
    for (const item of preferences || []) {
      const key = String(item?.key || "").trim();
      if (!key) continue;
      byKey[key] = item;
    }
    return byKey;
  }, []);

  const refreshMemoryPreferences = useCallback(
    async (force = false) => {
      if (!force && memoryPreferencesCache.loaded) {
        return memoryPreferencesCache.byKey || {};
      }
      try {
        const data = await listMemoryPreferences(apiFetch);
        const byKey = mapPreferenceListToKey(data?.preferences || []);
        setMemoryPreferencesCache({ byKey, loaded: true });
        return byKey;
      } catch (error) {
        setRunToast({
          message: error?.message || "加载用户偏好失败",
          type: "error",
        });
        return memoryPreferencesCache.byKey || {};
      }
    },
    [apiFetch, mapPreferenceListToKey, memoryPreferencesCache.byKey, memoryPreferencesCache.loaded],
  );

  const updateSuggestionStatus = useCallback(
    (turnId, suggestionId, status, errorText = "") => {
      updateActiveAgentSession((session) => ({
        ...session,
        turns: (session.turns || []).map((turn) => {
          if (turn.id !== turnId) return turn;
          const memorySuggestions = (turn.memorySuggestions || []).map((item) =>
            item.id === suggestionId
              ? {
                  ...item,
                  status,
                  errorText: errorText || "",
                  updatedAt: Date.now(),
                }
              : item,
          );
          return { ...turn, memorySuggestions };
        }),
      }));
    },
    [updateActiveAgentSession],
  );

  const ensureAgentResultCard = useCallback((turnId) => {
    setAgentResultCards((prev) => {
      if (prev.some((card) => card.turnId === turnId)) return prev;
      const idx = prev.length;
      return [
        ...prev,
        {
          id: `agent_card_${makeAgentId()}`,
          turnId,
          x: 120 + (idx % 2) * 500,
          y: 120 + Math.floor(idx / 2) * 360,
          w: 460,
          collapsed: false,
          minimized: false,
        },
      ];
    });
  }, []);

  const handleAgentCardMouseDown = (e, cardId) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.shiftKey || e.ctrlKey) {
      setSelectedAgentCardIds((prev) => {
        const next = new Set(prev);
        if (next.has(cardId)) next.delete(cardId);
        else next.add(cardId);
        return next;
      });
      return;
    }
    const card = agentResultCards.find((item) => item.id === cardId);
    if (!card) return;
    let dragCardIds = selectedAgentCardIds;
    if (!selectedAgentCardIds.has(cardId)) {
      dragCardIds = new Set([cardId]);
      setSelectedAgentCardIds(new Set([cardId]));
    }
    setSelectedNodeIds(new Set());
    setSelectedConnectionIds(new Set());
    setActiveAgentCardId(cardId);
    const startPositions = {};
    agentResultCards.forEach((item) => {
      if (dragCardIds.has(item.id)) {
        startPositions[item.id] = { x: item.x, y: item.y };
      }
    });
    agentCardDragRef.current = {
      cardIds: Array.from(dragCardIds),
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startPositions,
    };

    const onMouseMove = (event) => {
      const dragState = agentCardDragRef.current;
      if (!dragState) return;
      const zoom = viewportRef.current?.zoom || 1;
      const dx = (event.clientX - dragState.startMouseX) / zoom;
      const dy = (event.clientY - dragState.startMouseY) / zoom;
      setAgentResultCards((prev) =>
        prev.map((item) =>
          dragState.cardIds.includes(item.id)
            ? {
                ...item,
                x: (dragState.startPositions[item.id]?.x || item.x) + dx,
                y: (dragState.startPositions[item.id]?.y || item.y) + dy,
              }
            : item,
        ),
      );
    };

    const onMouseUp = () => {
      agentCardDragRef.current = null;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const focusAgentResultCard = useCallback((turnId) => {
    const card = agentResultCards.find((item) => item.turnId === turnId);
    if (card) {
      setAgentResultCards((prev) =>
        prev.map((item) =>
          item.turnId === turnId ? { ...item, minimized: false, collapsed: false } : item,
        ),
      );
      setSelectedAgentCardIds(new Set([card.id]));
      setActiveAgentCardId(card.id);
      return;
    }
    ensureAgentResultCard(turnId);
  }, [agentResultCards, ensureAgentResultCard]);

  const toggleAgentResultCardCollapsed = (cardId) => {
    setAgentResultCards((prev) =>
      prev.map((item) =>
        item.id === cardId ? { ...item, collapsed: !item.collapsed } : item,
      ),
    );
  };

  const minimizeAgentResultCard = (cardId) => {
    setAgentResultCards((prev) =>
      prev.map((item) =>
        item.id === cardId ? { ...item, minimized: true, collapsed: true } : item,
      ),
    );
    setSelectedAgentCardIds((prev) => {
      const next = new Set(prev);
      next.delete(cardId);
      return next;
    });
    if (activeAgentCardId === cardId) setActiveAgentCardId(null);
  };

  const runMissionOnTurn = useCallback(
    async (turnId, userText, extractedProduct, routeMeta = {}) => {
      try {
        const response = await generateIdeaScriptMission(extractedProduct, apiFetch, routeMeta);
        updateActiveAgentSession((session) => {
          const turnsNext = (session.turns || []).map((turn) =>
            turn.id === turnId
              ? {
                  ...turn,
                  status: "done",
                  stepIndex: AGENT_RUN_STEPS.length - 1,
                  response,
                  localEditPlans: cloneDeep(response?.edit_plans || []),
                  exports: turn.exports || {},
                }
              : turn,
          );
          const planCount = (response?.edit_plans || []).length;
          const hasShots = !!(response?.topics || []).some((topic) => (topic?.shots || []).length > 0);
          const pendingTask = session?.pendingTask || null;
          if (planCount > 0 && pendingTask?.intent === "EXPORT") {
            turnsNext.push({
              id: `turn_${makeAgentId()}`,
              userText: "",
              extractedProduct: "",
              status: "assistant",
              assistantText: "剪辑计划已就绪。要现在导出渲染包吗？",
              quickActions: ["export_now"],
              productChips: [],
              routeDebug: buildRouteDebug(
                { intent: "EXPORT", reason: "pending_task_plan_ready", product: extractedProduct || "" },
                false,
              ),
              createdAt: Date.now(),
              stepIndex: 0,
            });
            return { ...session, turns: turnsNext, pendingTask: null };
          }
          if (hasShots && pendingTask?.intent === "STORYBOARD") {
            turnsNext.push({
              id: `turn_${makeAgentId()}`,
              userText: "",
              extractedProduct: "",
              status: "assistant",
              assistantText: "脚本与分镜素材已准备好，需要我现在帮你定位分镜吗？",
              quickActions: ["storyboard"],
              productChips: [],
              routeDebug: buildRouteDebug(
                { intent: "STORYBOARD", reason: "pending_task_script_ready", product: extractedProduct || "" },
                false,
              ),
              createdAt: Date.now(),
              stepIndex: 0,
            });
            return { ...session, turns: turnsNext, pendingTask: null };
          }
          return { ...session, turns: turnsNext };
        });
        ensureAgentResultCard(turnId);
      } catch (error) {
        updateActiveAgentSession((session) => ({
          ...session,
          turns: (session.turns || []).map((turn) =>
            turn.id === turnId
              ? {
                  ...turn,
                  status: "error",
                  error: error?.message || String(error) || "请求失败",
                }
              : turn,
          ),
        }));
        ensureAgentResultCard(turnId);
        setRunToast({ message: error?.message || "Idea Script 生成失败", type: "error" });
      }
    },
    [apiFetch, ensureAgentResultCard, updateActiveAgentSession],
  );

  const appendAssistantTurn = useCallback(
    (userText, assistantText, options = {}) => {
      const {
        quickActions = [],
        productChips = [],
        routeDebug = null,
        memorySuggestions = [],
        showCancelPending = false,
        userTextOverride,
      } = options || {};
      const finalUserText = userTextOverride !== undefined ? String(userTextOverride || "") : String(userText || "");
      const turnId = `turn_${makeAgentId()}`;
      updateActiveAgentSession((session) => ({
        ...session,
        title:
          session.title === "新会话" && finalUserText
            ? shortenSessionTitle(finalUserText)
            : session.title,
        turns: [
          ...(session.turns || []),
          {
            id: turnId,
            userText: finalUserText,
            extractedProduct: "",
            status: "assistant",
            assistantText,
            quickActions,
            productChips,
            memorySuggestions: (memorySuggestions || []).map((item, idx) => ({
              ...item,
              id: item?.id || `suggest_${turnId}_${idx}`,
              status: item?.status || "pending",
            })),
            showCancelPending: !!showCancelPending,
            routeDebug,
            createdAt: Date.now(),
            stepIndex: 0,
          },
        ],
      }));
    },
    [updateActiveAgentSession],
  );

  const sendAIChatLanguageStream = useCallback(
    async (userText, route = null) => {
      const message = String(userText || "").trim();
      if (!message) return { ok: false, error: "消息为空" };
      if (!defaultLanguageModelId) {
        updateApiDebugStatus("aiChatLang", { status: "error", message: "缺少语言模型ID" });
        setRunToast({ message: "AI Chat 失败：缺少语言模型ID", type: "error" });
        return { ok: false, error: "缺少语言模型ID" };
      }

      const turnId = `turn_${makeAgentId()}`;
      updateApiDebugStatus("aiChatLang", { status: "loading", message: "POST /ai/aiChat part=1" });
      updateActiveAgentSession((session) => ({
        ...session,
        title: session.title === "新会话" ? shortenSessionTitle(message) : session.title,
        turns: [
          ...(session.turns || []),
          {
            id: turnId,
            userText: message,
            extractedProduct: "",
            status: "assistant",
            assistantText: "",
            quickActions: [],
            productChips: [],
            routeDebug: buildRouteDebug(route || { intent: "CHITCHAT", reason: "ai_chat_stream", product: "" }, true),
            createdAt: Date.now(),
            stepIndex: 0,
          },
        ],
      }));

      let fullText = "";
      try {
        updateApiDebugStatus("aiChatLang", {
          status: "loading",
          message: `POST /ai/viewAIChatModelParams id=${defaultLanguageModelId}`,
        });
        await Promise.race([
          resolveModelParamsForId(defaultLanguageModelId),
          new Promise((_, reject) =>
            window.setTimeout(() => reject(new Error("语言模型参数请求超时(4s)")), 4000),
          ),
        ]).catch((error) => {
          pushApiDebugDetail("aiChatLang", {
            type: "warning",
            path: "/ai/viewAIChatModelParams",
            message: error instanceof Error ? error.message : String(error),
          });
        });
        const authorizationInfo = resolveMemberAuthorizationInfo();
        updateApiDebugStatus("aiChatLang", { status: "loading", message: "POST /api/ai_chat_stream_via_curl" });
        await aiChatStream(
          apiFetch,
          {
            history_ai_chat_record_id: aiChatHistoryRecordIdRef.current || undefined,
            module_enum: "1",
            part_enum: String(AI_CHAT_PART_ENUM_1),
            ai_chat_session_id: aiChatSessionIdRef.current || undefined,
            ai_chat_model_id: defaultLanguageModelId,
            message,
          },
          {
            authorization: authorizationInfo?.value || "",
            preferApiFetchFirst: true,
            useBackendCurlProxy: true,
            onDebug: (event) => pushApiDebugDetail("aiChatLang", event),
            onChunk: (chunk) => {
              const delta = String(chunk || "");
              if (!delta) return;
              fullText += delta;
              updateActiveAgentSession((session) => ({
                ...session,
                turns: (session.turns || []).map((turn) =>
                  turn.id === turnId ? { ...turn, assistantText: fullText } : turn,
                ),
              }));
            },
            onMeta: (meta) => {
              if (meta?.aiChatSessionId) aiChatSessionIdRef.current = meta.aiChatSessionId;
              if (meta?.historyAiChatRecordId) aiChatHistoryRecordIdRef.current = meta.historyAiChatRecordId;
            },
          },
        );

        if (!fullText) fullText = "已收到响应，但内容为空。";
        updateApiDebugStatus("aiChatLang", {
          status: "success",
          message: `ok model=${defaultLanguageModelId}`,
        });
        return { ok: true, error: "" };
      } catch (error) {
        const messageText = formatAIChatErrorMessage(error);
        updateApiDebugStatus("aiChatLang", {
          status: "error",
          message: messageText,
        });
        updateActiveAgentSession((session) => ({
          ...session,
          turns: (session.turns || []).map((turn) =>
            turn.id === turnId
              ? {
                  ...turn,
                  assistantText: fullText || `请求失败：${messageText}`,
                }
              : turn,
          ),
        }));
        setRunToast({ message: `AI Chat 失败：${messageText}`, type: "error" });
        return { ok: false, error: messageText };
      }
    },
    [apiFetch, defaultLanguageModelId, pushApiDebugDetail, resolveModelParamsForId, updateActiveAgentSession, updateApiDebugStatus],
  );

  const runVideoMissionOnTurn = useCallback(
    async (turnId, userText, extractedProduct, routeMeta = {}) => {
      try {
        const response = await generateIdeaScriptVideo(
          {
            product: extractedProduct,
            outDir: "./exports/video_generation",
            outputWidth: 720,
            outputHeight: 1280,
            fps: 24,
            clipLength: 81,
            retriesPerStep: 1,
            maxShots: 0,
            motionHint: "",
          },
          apiFetch,
          routeMeta,
        );
        const ideaScript = response?.idea_script || {};
        updateActiveAgentSession((session) => ({
          ...session,
          turns: (session.turns || []).map((turn) =>
            turn.id === turnId
              ? {
                  ...turn,
                  status: "done",
                  stepIndex: AGENT_RUN_STEPS.length - 1,
                  response: ideaScript,
                  localEditPlans: cloneDeep(ideaScript?.edit_plans || []),
                  exports: turn.exports || {},
                  videoResult: {
                    enabled: !!response?.video_generation_enabled,
                    mode: response?.fallback_mode || "",
                    outputDir: response?.output_dir || "",
                    outputVideo: response?.output_video || "",
                    shotsTotal: Number(response?.shots_total || 0),
                    shotsSucceeded: Number(response?.shots_succeeded || 0),
                    shotsFailed: Number(response?.shots_failed || 0),
                    error: response?.error || "",
                  },
                }
              : turn,
          ),
        }));
        ensureAgentResultCard(turnId);
        const videoPath = String(response?.output_video || "").trim();
        if (videoPath) {
          appendAssistantTurn("", `视频生成完成：${videoPath}`, {
            userTextOverride: "",
            routeDebug: buildRouteDebug(
              { intent: "VIDEO", reason: "video_generation_completed", product: extractedProduct || "" },
              false,
            ),
          });
        } else if (response?.video_generation_enabled === false) {
          appendAssistantTurn("", "视频生成功能当前未开启（BANANAFLOW_ENABLE_VIDEO_GENERATION=1）。已返回脚本结果。", {
            userTextOverride: "",
            routeDebug: buildRouteDebug(
              { intent: "VIDEO", reason: "video_generation_disabled", product: extractedProduct || "" },
              false,
            ),
          });
        } else if (response?.error) {
          appendAssistantTurn("", `视频生成失败：${response.error}`, {
            userTextOverride: "",
            routeDebug: buildRouteDebug(
              { intent: "VIDEO", reason: "video_generation_error", product: extractedProduct || "" },
              false,
            ),
          });
        } else {
          appendAssistantTurn("", "视频生成已完成，请查看输出目录。", {
            userTextOverride: "",
            routeDebug: buildRouteDebug(
              { intent: "VIDEO", reason: "video_generation_done_no_path", product: extractedProduct || "" },
              false,
            ),
          });
        }
      } catch (error) {
        updateActiveAgentSession((session) => ({
          ...session,
          turns: (session.turns || []).map((turn) =>
            turn.id === turnId
              ? {
                  ...turn,
                  status: "error",
                  error: error?.message || String(error) || "请求失败",
                }
              : turn,
          ),
        }));
        ensureAgentResultCard(turnId);
        setRunToast({ message: error?.message || "视频生成失败", type: "error" });
      }
    },
    [apiFetch, appendAssistantTurn, ensureAgentResultCard, updateActiveAgentSession],
  );

  const runCanvasPlanMission = useCallback(
    async (userText, routeMeta = {}) => {
      const response = await planAgentCanvas(
        {
          prompt: userText,
          currentNodes: cloneDeep(nodesRef.current || []),
          currentConnections: cloneDeep(connectionsRef.current || []),
          selectedArtifact: activeArtifact
            ? {
                url: activeArtifact.url,
                kind: activeArtifact.kind || "image",
                fromNodeId: activeArtifact.fromNodeId || null,
                createdAt: activeArtifact.createdAt || Date.now(),
                meta: activeArtifact.meta || {},
              }
            : null,
          canvasId,
          threadId: canvasId,
        },
        apiFetch,
        routeMeta,
      );

      const patch = Array.isArray(response?.patch) ? response.patch : [];
      if (!patch.length) {
        throw new Error("Agent 未返回可执行的画布补丁");
      }

      pushHistory();
      _applyPatch(patch);
      return response;
    },
    [activeArtifact, apiFetch, canvasId, _applyPatch, pushHistory],
  );

  const getLatestResultTurn = useCallback(() => {
    const turns = activeAgentSession?.turns || [];
    return [...turns].reverse().find((turn) => turn?.status === "done" && turn?.response) || null;
  }, [activeAgentSession?.turns]);

  const getLatestPlanTurn = useCallback(() => {
    const turns = activeAgentSession?.turns || [];
    return (
      [...turns].reverse().find((turn) => {
        const plans = turn?.localEditPlans || turn?.response?.edit_plans || [];
        return turn?.status === "done" && plans.length > 0;
      }) || null
    );
  }, [activeAgentSession?.turns]);

  const toValueArray = useCallback((value) => {
    if (Array.isArray(value)) {
      return value.map((item) => String(item || "").trim()).filter(Boolean);
    }
    const text = String(value || "").trim();
    if (!text) return [];
    return [text];
  }, []);

  const resolvePendingProductCandidate = useCallback((text) => {
    const raw = String(text || "").trim();
    if (!raw) return "";
    const byExtractor = extractProductKeyword(raw);
    if (byExtractor) return byExtractor;
    if (raw.length <= 24 && !/[，。,.;；\s]/.test(raw)) {
      if (!/(脚本|分镜|导出|渲染|帮助|怎么|你好|谢谢)/.test(raw)) {
        return raw;
      }
    }
    return "";
  }, []);

  const openPreferencesPanelWithSuggestion = useCallback((suggestion) => {
    if (!suggestion) return;
    setPreferencesPanelPrefill({
      key: suggestion.key,
      value: suggestion.value,
      confidence: 0.9,
      source: "hitl_memory_suggestion",
      ts: Date.now(),
    });
    setShowPreferencesPanel(true);
  }, []);

  const handlePreferenceSavedFromPanel = useCallback(
    (payload) => {
      const key = String(payload?.key || "").trim();
      if (!key) return;
      const notice = {
        key,
        value: payload?.value,
        ts: Date.now(),
      };
      setPreferenceNotice(notice);
      setRunToast({
        message: `偏好已更新：${key}`,
        type: "info",
      });
    },
    [],
  );

  const confirmMemorySuggestion = useCallback(
    async (turnId, suggestion) => {
      if (!suggestion?.id || !suggestion?.key) return;
      setSavingSuggestionId(suggestion.id);
      updateSuggestionStatus(turnId, suggestion.id, "pending");
      try {
        const cacheByKey = await refreshMemoryPreferences(false);
        let nextValue = suggestion.value;
        if (suggestion.key === "tone" || suggestion.key === "camera_style") {
          const existing = toValueArray(cacheByKey?.[suggestion.key]?.value);
          const incoming = toValueArray(suggestion.value);
          nextValue = Array.from(new Set([...existing, ...incoming]));
        }
        await setMemoryPreference(apiFetch, {
          key: suggestion.key,
          value: nextValue,
          confidence: 0.9,
        });
        await refreshMemoryPreferences(true);
        updateSuggestionStatus(turnId, suggestion.id, "saved");
        setPreferenceNotice({
          key: suggestion.key,
          value: nextValue,
          ts: Date.now(),
        });
        setRunToast({ message: `偏好已保存：${suggestion.key}`, type: "info" });
      } catch (error) {
        updateSuggestionStatus(
          turnId,
          suggestion.id,
          "error",
          error?.message || "保存失败",
        );
        setRunToast({ message: error?.message || "偏好保存失败", type: "error" });
      } finally {
        setSavingSuggestionId("");
      }
    },
    [
      apiFetch,
      refreshMemoryPreferences,
      toValueArray,
      updateSuggestionStatus,
    ],
  );

  const ignoreMemorySuggestion = useCallback(
    (turnId, suggestion) => {
      if (!suggestion?.id) return;
      updateSuggestionStatus(turnId, suggestion.id, "ignored");
      setRunToast({ message: `已忽略建议：${suggestion.key}`, type: "info" });
    },
    [updateSuggestionStatus],
  );

  const devSuggestionLog = useMemo(() => {
    const rows = [];
    for (const turn of agentTurns) {
      for (const suggestion of turn?.memorySuggestions || []) {
        rows.push({
          turnId: turn.id,
          key: suggestion.key,
          value: suggestion.value,
          status: suggestion.status || "pending",
          reason: suggestion.reason || "",
        });
      }
    }
    return rows.slice(-10).reverse();
  }, [agentTurns]);

  const hitlFeedbackRows = useMemo(() => buildHitlFeedbackRows(agentTurns), [agentTurns]);

  const devRegressionLog = useMemo(() => {
    const rows = [];
    for (const turn of agentTurns) {
      if (!turn?.qualityFeedback) continue;
      rows.push({
        turnId: turn.id,
        status: turn.qualityFeedback.status || "unknown",
        reason: turn.qualityFeedback.reason || "",
        caseId: turn.qualityFeedback.caseId || "",
        error: turn.qualityFeedback.error || "",
      });
    }
    return rows.slice(-10).reverse();
  }, [agentTurns]);

  const sendAgentMissionFromText = useCallback(
    async (text) => {
      const missionText = String(text || "").trim();
      if (!missionText) return;
      const sessionId = activeAgentSession?.id || "";
      const pendingTask = activeAgentSession?.pendingTask || null;
      const memorySuggestions = detectPreferenceSuggestions(missionText);
      if (memorySuggestions.length > 0) {
        appendAssistantTurn(missionText, "检测到可保存的长期偏好，是否写入你的偏好记忆？", {
          userTextOverride: "",
          memorySuggestions,
          routeDebug: buildRouteDebug(
            { intent: "HELP", reason: "memory_suggestion_hitl", product: "" },
            false,
          ),
        });
      }

      if (missionText === "取消" && pendingTask) {
        clearPendingTaskForActiveSession();
        appendAssistantTurn(missionText, "已取消待处理任务。", {
          userTextOverride: "",
          routeDebug: buildRouteDebug(
            { intent: pendingTask.intent, reason: "pending_task_cancelled", product: pendingTask.extractedProduct || "" },
            false,
          ),
        });
        return;
      }

      if (pendingTask?.intent === "SCRIPT" && (pendingTask?.missing || []).includes("product")) {
        const filledProduct = resolvePendingProductCandidate(missionText);
        if (filledProduct) {
          const turnId = `turn_${makeAgentId()}`;
          updateActiveAgentSession((session) => ({
            ...session,
            turns: [
              ...(session.turns || []),
              {
                id: turnId,
                userText: pendingTask.rawText || missionText,
                extractedProduct: filledProduct,
                status: "running",
                createdAt: Date.now(),
                stepIndex: 0,
                exports: {},
                intent: "SCRIPT",
                intentReason: "pending_task_filled",
                routeDebug: buildRouteDebug(
                  { intent: "SCRIPT", reason: "pending_task_filled", product: filledProduct },
                  true,
                ),
              },
            ],
            pendingTask: null,
          }));
          runMissionOnTurn(turnId, pendingTask.rawText || missionText, filledProduct, {
            intent: "SCRIPT",
            product: filledProduct,
            sessionId,
          });
          return;
        }
      }

      const route = detectIntent(missionText, {
        activeSessionId: sessionId,
        turns: activeAgentSession?.turns || [],
      });

      if (route.intent === "CHITCHAT") {
        try {
          const response = await generateAgentChitchat(missionText, apiFetch, {
            intent: route.intent,
            product: route.product || "",
            sessionId,
          });
          appendAssistantTurn(missionText, String(response?.text || "").trim() || getChitchatReply(missionText), {
            routeDebug: buildRouteDebug(
              { ...route, reason: "agent_chitchat_gemini_2_5_flash_lite" },
              true,
            ),
          });
        } catch {
          appendAssistantTurn(missionText, getChitchatReply(missionText), {
            routeDebug: buildRouteDebug(
              { ...route, reason: "local_chitchat_reply_fallback" },
              false,
            ),
          });
        }
        return;
      }

      if (route.intent === "HELP") {
        appendAssistantTurn(missionText, AGENT_HELP_TEXT, {
          quickActions: AGENT_DEFAULT_QUICK_ACTION_IDS,
          routeDebug: buildRouteDebug(route, false),
        });
        return;
      }

      if (route.intent === "CANVAS") {
        appendAssistantTurn(missionText, "正在按你的要求自动搭建画布组件，请稍等。", {
          userTextOverride: "",
          routeDebug: buildRouteDebug(route, true),
        });
        try {
          const response = await runCanvasPlanMission(missionText, {
            intent: route.intent,
            product: route.product || "",
            sessionId,
          });
          appendAssistantTurn(
            missionText,
            String(response?.summary || "").trim() || "已根据你的需求完成画布自动搭建。",
            {
              userTextOverride: "",
              routeDebug: buildRouteDebug(
                { ...route, reason: response?.thought ? `${route.reason}|${response.thought}` : route.reason },
                true,
              ),
            },
          );
        } catch (error) {
          appendAssistantTurn(
            missionText,
            error?.message || "画布自动搭建失败，请稍后重试。",
            {
              userTextOverride: "",
              routeDebug: buildRouteDebug(route, true),
            },
          );
          setRunToast({ message: error?.message || "画布自动搭建失败", type: "error" });
        }
        return;
      }

      if (route.intent === "SCRIPT") {
        const product = route.product || extractProductKeyword(missionText);
        if (!product) {
          const routeDebug = buildRouteDebug(route, false);
          setPendingTaskForActiveSession({
            intent: "SCRIPT",
            rawText: missionText,
            extractedProduct: "",
            missing: ["product"],
            createdAt: Date.now(),
          });
          appendAssistantTurn(missionText, "你想做哪个产品/品类？", {
            quickActions: AGENT_DEFAULT_QUICK_ACTION_IDS,
            productChips: AGENT_PRODUCT_CHIPS,
            showCancelPending: true,
            routeDebug,
          });
          return;
        }
        const turnId = `turn_${makeAgentId()}`;
        const routeWithProduct = { ...route, product };
        const routeDebug = buildRouteDebug(routeWithProduct, true);
        updateActiveAgentSession((session) => ({
          ...session,
          title: session.title === "新会话" ? shortenSessionTitle(missionText) : session.title,
          turns: [
            ...(session.turns || []),
            {
              id: turnId,
              userText: missionText,
              extractedProduct: product,
              status: "running",
              createdAt: Date.now(),
              stepIndex: 0,
              exports: {},
              intent: route.intent,
              intentReason: route.reason,
              routeDebug,
            },
          ],
          pendingTask: session?.pendingTask?.intent === "SCRIPT" ? null : session?.pendingTask || null,
        }));
        runMissionOnTurn(turnId, missionText, product, {
          intent: route.intent,
          product,
          sessionId,
        });
        return;
      }

      if (route.intent === "VIDEO") {
        const product = route.product || extractProductKeyword(missionText);
        if (!product) {
          appendAssistantTurn(missionText, "要生成视频，请先告诉我产品/品类（例如：帮我生成洗面奶成片视频）。", {
            quickActions: ["script", "video", "help"],
            productChips: AGENT_PRODUCT_CHIPS,
            routeDebug: buildRouteDebug(route, false),
          });
          return;
        }
        const turnId = `turn_${makeAgentId()}`;
        const routeWithProduct = { ...route, product };
        const routeDebug = buildRouteDebug(routeWithProduct, true);
        updateActiveAgentSession((session) => ({
          ...session,
          title: session.title === "新会话" ? shortenSessionTitle(missionText) : session.title,
          turns: [
            ...(session.turns || []),
            {
              id: turnId,
              userText: missionText,
              extractedProduct: product,
              status: "running",
              createdAt: Date.now(),
              stepIndex: 0,
              exports: {},
              intent: route.intent,
              intentReason: route.reason,
              routeDebug,
            },
          ],
        }));
        runVideoMissionOnTurn(turnId, missionText, product, {
          intent: route.intent,
          product,
          sessionId,
        });
        return;
      }

      if (route.intent === "STORYBOARD") {
        const latestTurn = getLatestResultTurn();
        const hasShots = !!latestTurn?.response?.topics?.some((topic) => (topic?.shots || []).length > 0);
        if (!latestTurn || !hasShots) {
          setPendingTaskForActiveSession({
            intent: "STORYBOARD",
            rawText: missionText,
            extractedProduct: route.product || "",
            missing: ["script"],
            createdAt: Date.now(),
          });
          appendAssistantTurn(missionText, "还没有可用脚本上下文，先让我生成一次脚本，再帮你看分镜。", {
            quickActions: ["script", "help"],
            routeDebug: buildRouteDebug(route, false),
          });
          return;
        }
        updateActiveAgentSession((session) => ({
          ...session,
          turns: (session.turns || []).map((turn) =>
            turn.id === latestTurn.id ? { ...turn, uiFocusSection: "storyboard" } : turn,
          ),
        }));
        focusAgentResultCard(latestTurn.id);
        appendAssistantTurn(missionText, "已定位到最新结果卡片。请展开 Storyboard 区域查看分镜。", {
          routeDebug: buildRouteDebug(route, false),
        });
        return;
      }

      if (route.intent === "EXPORT") {
        const latestPlanTurn = getLatestPlanTurn();
        const plans = latestPlanTurn?.localEditPlans || latestPlanTurn?.response?.edit_plans || [];
        if (!latestPlanTurn || plans.length === 0) {
          setPendingTaskForActiveSession({
            intent: "EXPORT",
            rawText: missionText,
            extractedProduct: route.product || "",
            missing: ["plan"],
            createdAt: Date.now(),
          });
          appendAssistantTurn(missionText, "当前没有可导出的剪辑计划，请先生成脚本与分镜。", {
            quickActions: ["script", "storyboard"],
            routeDebug: buildRouteDebug(route, false),
          });
          return;
        }
        const targetPlan = plans[0];
        appendAssistantTurn(missionText, `开始导出渲染包${targetPlan?.plan_id ? `（${targetPlan.plan_id}）` : ""}，请稍等。`, {
          routeDebug: buildRouteDebug(route, true),
        });
        const exportResult = await (exportAgentPlanRef.current
          ? exportAgentPlanRef.current(latestPlanTurn.id, targetPlan, {
              intent: route.intent,
              product: targetPlan?.product || route.product || latestPlanTurn?.extractedProduct || "",
              sessionId,
            })
          : Promise.resolve({ ok: false, error: "导出能力尚未初始化，请稍后重试。" }));
        if (exportResult?.ok) {
          const renderPath =
            exportResult?.result?.render_script ||
            exportResult?.result?.render_sh ||
            exportResult?.result?.bundle_dir ||
            exportResult?.result?.bundle_path ||
            "";
          appendAssistantTurn(missionText, renderPath ? `导出完成：${renderPath}` : "导出完成。可在结果卡片的 Export 区查看文件路径。", {
            routeDebug: buildRouteDebug(route, false),
          });
        } else {
          appendAssistantTurn(missionText, exportResult?.error || "导出失败，请稍后重试。", {
            routeDebug: buildRouteDebug(route, false),
          });
        }
        return;
      }

      appendAssistantTurn(missionText, "你想要我做脚本/分镜/导出，还是随便聊聊？", {
        quickActions: AGENT_DEFAULT_QUICK_ACTION_IDS,
        routeDebug: buildRouteDebug(route, false),
      });
    },
    [
      activeAgentSession?.id,
      activeAgentSession?.pendingTask,
      activeAgentSession?.turns,
      appendAssistantTurn,
      clearPendingTaskForActiveSession,
      focusAgentResultCard,
      getLatestPlanTurn,
      getLatestResultTurn,
      resolvePendingProductCandidate,
      runMissionOnTurn,
      sendAIChatLanguageStream,
      apiFetch,
      runVideoMissionOnTurn,
      runCanvasPlanMission,
      setPendingTaskForActiveSession,
      updateActiveAgentSession,
    ],
  );

  const sendAgentMission = () => {
    const text = String(agentInput || "").trim();
    if (!text) {
      if (agentComposerFiles.length > 0) {
        setRunToast({ message: "请补充一句需求描述，再连同图片一起发送", type: "info" });
      }
      return;
    }
    const attachmentNote = agentComposerFiles.length
      ? `\n\n[已附参考图片: ${agentComposerFiles.map((item) => item.name).join("，")}]`
      : "";
    setAgentInput("");
    setShowScriptExamples(false);
    setShowCanvasExamples(false);
    setAgentComposerFiles((prev) => {
      prev.forEach((item) => {
        if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
      return [];
    });
    if (agentUploadInputRef.current) {
      agentUploadInputRef.current.value = "";
    }
    void sendAgentMissionFromText(`${text}${attachmentNote}`);
  };

  const handleAgentComposerUpload = useCallback((event) => {
    const files = Array.from(event.target?.files || []);
    if (!files.length) return;
    const accepted = files.filter((file) => String(file.type || "").startsWith("image/"));
    if (!accepted.length) {
      setRunToast({ message: "目前仅支持上传图片", type: "error" });
      event.target.value = "";
      return;
    }
    setAgentComposerFiles((prev) => {
      const next = [...prev];
      accepted.forEach((file) => {
        const duplicate = next.some(
          (item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified,
        );
        if (duplicate) return;
        next.push({
          id: `agent_file_${makeAgentId()}`,
          name: file.name,
          size: file.size,
          lastModified: file.lastModified,
          previewUrl: URL.createObjectURL(file),
        });
      });
      return next.slice(0, 4);
    });
    setAgentInputFocused(true);
    agentInputRef.current?.focus();
    event.target.value = "";
  }, []);

  const removeAgentComposerFile = useCallback((fileId) => {
    setAgentComposerFiles((prev) => {
      const target = prev.find((item) => item.id === fileId);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((item) => item.id !== fileId);
    });
  }, []);

  const composerQuickActions = [
    { id: "storyboard", label: "生成分镜", icon: Clapperboard },
    { id: "video", label: "成片视频", icon: Film },
    { id: "export", label: "导出渲染包", icon: Download },
    { id: "help", label: "查看示例", icon: MessageSquare },
  ];

  const handleAgentQuickAction = useCallback(
    (actionId) => {
      setActiveComposerActionId((prev) => (prev === actionId ? "" : actionId));
      setShowScriptExamples(false);
      setShowCanvasExamples(false);
      if (actionId === "storyboard") {
        void sendAgentMissionFromText("生成分镜");
        return;
      }
      if (actionId === "video") {
        void sendAgentMissionFromText("生成成片视频");
        return;
      }
      if (actionId === "export" || actionId === "export_now") {
        void sendAgentMissionFromText("导出渲染包");
        return;
      }
      if (actionId === "cancel_pending") {
        clearPendingTaskForActiveSession();
        appendAssistantTurn("", "已取消待处理任务。", {
          userTextOverride: "",
          routeDebug: buildRouteDebug(
            { intent: "UNKNOWN", reason: "pending_task_cancelled_by_quick_action", product: "" },
            false,
          ),
        });
        return;
      }
      void sendAgentMissionFromText("你能做什么");
    },
    [appendAssistantTurn, clearPendingTaskForActiveSession, sendAgentMissionFromText],
  );

  const handleAgentProductChip = useCallback(
    (product) => {
      const pendingTask = activeAgentSession?.pendingTask || null;
      if (pendingTask?.intent === "SCRIPT" && (pendingTask?.missing || []).includes("product")) {
        setAgentInput(product);
        void sendAgentMissionFromText(product);
        return;
      }
      const nextText = `帮我设计一个${product}的爆款脚本`;
      setAgentInput(nextText);
      void sendAgentMissionFromText(nextText);
    },
    [activeAgentSession?.pendingTask, sendAgentMissionFromText],
  );

  const insertPreferenceQuickExample = useCallback((text) => {
    const nextText = String(text || "帮我用小红书语气设计洗面奶爆款脚本").trim();
    if (!nextText) return;
    setAgentInput(nextText);
    agentInputRef.current?.focus();
  }, []);

  const handleCanvasExamplePick = useCallback((text) => {
    const nextText = String(text || "").trim();
    if (!nextText) return;
    setActiveComposerActionId("canvas");
    setShowScriptExamples(false);
    setShowCanvasExamples(false);
    setAgentInput(nextText);
    setAgentInputFocused(true);
    agentInputRef.current?.focus();
  }, []);

  const handleScriptExamplePick = useCallback((text) => {
    const nextText = String(text || "").trim();
    if (!nextText) return;
    setActiveComposerActionId("script");
    setShowCanvasExamples(false);
    setShowScriptExamples(false);
    setAgentInput(nextText);
    setAgentInputFocused(true);
    agentInputRef.current?.focus();
  }, []);

  const handleSuggestionConfirm = useCallback(
    (turnId, suggestion) => {
      void confirmMemorySuggestion(turnId, suggestion);
    },
    [confirmMemorySuggestion],
  );

  const handleSuggestionIgnore = useCallback(
    (turnId, suggestion) => {
      ignoreMemorySuggestion(turnId, suggestion);
    },
    [ignoreMemorySuggestion],
  );

  const handleSuggestionEdit = useCallback(
    (suggestion) => {
      openPreferencesPanelWithSuggestion(suggestion);
    },
    [openPreferencesPanelWithSuggestion],
  );

  const openRegressionFeedbackDialog = useCallback((payload = {}) => {
    if (!HITL_FEEDBACK_UI_ENABLED) return;
    const baseReason = String(payload?.defaultReason || HITL_FEEDBACK_REASON_OPTIONS[0]).trim();
    const isMatched = HITL_FEEDBACK_REASON_OPTIONS.includes(baseReason);
    setFeedbackReasonChoice(
      isMatched ? baseReason : HITL_FEEDBACK_REASON_OPTIONS[HITL_FEEDBACK_REASON_OPTIONS.length - 1],
    );
    setFeedbackReasonNote(isMatched ? "" : baseReason);
    setFeedbackDialog({
      turnId: payload?.turnId || "",
      suggestionId: payload?.suggestionId || "",
      intent: payload?.intent || "SCRIPT",
      product: payload?.product || "",
      fallbackReason: baseReason,
    });
  }, []);

  const closeRegressionFeedbackDialog = useCallback(() => {
    setFeedbackDialog(null);
    setFeedbackReasonChoice(HITL_FEEDBACK_REASON_OPTIONS[0]);
    setFeedbackReasonNote("");
  }, []);

  const markTurnAsRegressionCase = useCallback(
    async (turnId, options = {}) => {
      if (!HITL_FEEDBACK_UI_ENABLED) return;
      const turn = (activeAgentSession?.turns || []).find((item) => item.id === turnId);
      const sessionId = activeAgentSession?.id || "";
      if (!turn || !sessionId) {
        setRunToast({ message: "缺少会话信息，无法标记回归用例", type: "error" });
        return;
      }
      const suggestionId = String(options?.suggestionId || "").trim();
      const reason = String(options?.reason || "").trim() || "人工标记回归";
      const targetId = suggestionId ? `suggest_${suggestionId}` : `turn_${turnId}`;
      const intent = String(options?.intent || turn?.routeDebug?.intent || turn?.intent || "SCRIPT");
      const product = String(
        options?.product ||
          turn?.routeDebug?.product ||
          turn?.extractedProduct ||
          turn?.response?.audience_context?.product ||
          "",
      );

      setSavingFeedbackTargetId(targetId);
      try {
        const out = await harvestEvalCase(
          apiFetch,
          {
            session_id: sessionId,
            reason,
            include_trajectory: true,
          },
          {
            intent,
            product,
            sessionId,
          },
        );
        updateActiveAgentSession((session) => ({
          ...session,
          turns: (session.turns || []).map((item) => {
            if (item.id !== turnId) return item;
            const nextTurn = {
              ...item,
              qualityFeedback: {
                status: "harvested",
                reason,
                caseId: out?.case_id || "",
                outputPath: out?.output_path || "",
                updatedAt: Date.now(),
              },
            };
            if (!suggestionId) return nextTurn;
            return {
              ...nextTurn,
              memorySuggestions: (item.memorySuggestions || []).map((suggestion) =>
                suggestion.id === suggestionId
                  ? {
                      ...suggestion,
                      status: "regression_marked",
                      updatedAt: Date.now(),
                    }
                  : suggestion,
              ),
            };
          }),
        }));
        setRunToast({ message: "已标记为回归用例", type: "info" });
      } catch (error) {
        updateActiveAgentSession((session) => ({
          ...session,
          turns: (session.turns || []).map((item) =>
            item.id === turnId
              ? {
                  ...item,
                  qualityFeedback: {
                    status: "failed",
                    reason,
                    error: error?.message || "回归标记失败",
                    updatedAt: Date.now(),
                  },
                }
              : item,
          ),
        }));
        setRunToast({ message: error?.message || "标记回归失败", type: "error" });
      } finally {
        setSavingFeedbackTargetId("");
      }
    },
    [activeAgentSession?.id, activeAgentSession?.turns, apiFetch, updateActiveAgentSession],
  );

  const confirmRegressionFeedbackDialog = useCallback(() => {
    if (!feedbackDialog?.turnId) return;
    const note = String(feedbackReasonNote || "").trim();
    const choice = String(feedbackReasonChoice || "").trim() || feedbackDialog.fallbackReason || "人工标记回归";
    const reason = note ? `${choice}:${note}` : choice;
    void markTurnAsRegressionCase(feedbackDialog.turnId, {
      suggestionId: feedbackDialog.suggestionId || "",
      reason,
      intent: feedbackDialog.intent || "SCRIPT",
      product: feedbackDialog.product || "",
    });
    closeRegressionFeedbackDialog();
  }, [
    closeRegressionFeedbackDialog,
    feedbackDialog,
    feedbackReasonChoice,
    feedbackReasonNote,
    markTurnAsRegressionCase,
  ]);

  const handleSuggestionMarkRegression = useCallback(
    (turnId, suggestion) => {
      if (!suggestion?.id) return;
      const reason = suggestion?.key ? `偏好建议回归:${suggestion.key}` : "偏好建议误判";
      openRegressionFeedbackDialog({
        turnId,
        suggestionId: suggestion.id,
        defaultReason: reason,
        intent: "SCRIPT",
      });
    },
    [openRegressionFeedbackDialog],
  );

  const handleTurnMarkRegression = useCallback(
    (turn) => {
      if (!turn?.id) return;
      const response = turn?.response || {};
      let reason = "资产匹配回归";
      if (turn?.status === "error" || response?.generation_warning || response?.inference_warning) {
        reason = "生成脚本失败";
      } else if (response?.asset_match_warning || Number(response?.shot_match_rate || 0) < 0.5) {
        reason = "资产匹配回归";
      }
      openRegressionFeedbackDialog({
        turnId: turn.id,
        defaultReason: reason,
        intent: turn?.routeDebug?.intent || turn?.intent || "SCRIPT",
        product: turn?.routeDebug?.product || turn?.extractedProduct || "",
      });
    },
    [openRegressionFeedbackDialog],
  );

  const retryAgentTurn = (turnId) => {
    const turn = (activeAgentSession?.turns || []).find((item) => item.id === turnId);
    if (!turn) return;
    const product = turn.extractedProduct || extractProductKeyword(turn.userText || "");
    if (!product) {
      setRunToast({ message: "请先说明产品/品类", type: "error" });
      return;
    }
    updateActiveAgentSession((session) => ({
      ...session,
      turns: (session.turns || []).map((item) =>
        item.id === turnId
          ? {
              ...item,
              status: "running",
              error: "",
              stepIndex: 0,
              extractedProduct: product,
              routeDebug: buildRouteDebug(
                { intent: "SCRIPT", product, reason: "retry" },
                true,
              ),
            }
          : item,
      ),
    }));
    runMissionOnTurn(turnId, turn.userText || "", product, {
      intent: "SCRIPT",
      product,
      sessionId: activeAgentSession?.id || "",
    });
  };

  const selectPrimaryAssetForShot = (turnId, shotId, candidate) => {
    updateActiveAgentSession((session) => ({
      ...session,
      turns: (session.turns || []).map((turn) => {
        if (turn.id !== turnId) return turn;
        const plans = cloneDeep(turn.localEditPlans || turn.response?.edit_plans || []);
        for (const plan of plans) {
          for (const track of plan.tracks || []) {
            for (const clip of track.clips || []) {
              if (clip.shot_id !== shotId) continue;
              const oldPrimary = clip.primary_asset || null;
              clip.primary_asset = {
                asset_id: candidate?.asset_id || "",
                uri: candidate?.uri || "",
                score: candidate?.score ?? 0,
                bucket: candidate?.bucket || "fallback",
                reason: candidate?.reason || "",
              };
              const merged = [oldPrimary, ...(clip.alternates || []), clip.primary_asset]
                .filter(Boolean)
                .filter((item, idx, arr) => arr.findIndex((x) => x.asset_id === item.asset_id) === idx);
              clip.alternates = merged
                .filter((item) => item.asset_id !== clip.primary_asset.asset_id)
                .slice(0, 3);
            }
          }
        }
        return { ...turn, localEditPlans: plans };
      }),
    }));
  };

  async function exportAgentPlan(turnId, plan, routeMeta = {}) {
    const planId = plan?.plan_id || `plan_${makeAgentId()}`;
    updateActiveAgentSession((session) => ({
      ...session,
      turns: (session.turns || []).map((turn) => {
        if (turn.id !== turnId) return turn;
        const exports = { ...(turn.exports || {}) };
        exports[planId] = { ...(exports[planId] || {}), loading: true, error: "" };
        return { ...turn, exports };
      }),
    }));

    try {
      const result = await exportIdeaScriptFfmpegBundle(
        {
          planId: plan?.plan_id || "",
          plan,
          outDir: "./exports/ffmpeg",
          w: 720,
          h: 1280,
          fps: 30,
        },
        apiFetch,
        {
          intent: routeMeta?.intent || "EXPORT",
          product: routeMeta?.product || plan?.product || "",
          sessionId: routeMeta?.sessionId || activeAgentSession?.id || "",
        },
      );

      updateActiveAgentSession((session) => ({
        ...session,
        turns: (session.turns || []).map((turn) => {
          if (turn.id !== turnId) return turn;
          const exports = { ...(turn.exports || {}) };
          exports[planId] = { loading: false, error: "", result };
          return { ...turn, exports };
        }),
      }));
      setRunToast({ message: "FFmpeg 渲染包导出成功", type: "info" });
      return { ok: true, result };
    } catch (error) {
      updateActiveAgentSession((session) => ({
        ...session,
        turns: (session.turns || []).map((turn) => {
          if (turn.id !== turnId) return turn;
          const exports = { ...(turn.exports || {}) };
          exports[planId] = { loading: false, error: error?.message || "导出失败" };
          return { ...turn, exports };
        }),
      }));
      setRunToast({ message: error?.message || "导出失败", type: "error" });
      return { ok: false, error: error?.message || "导出失败" };
    }
  }
  exportAgentPlanRef.current = exportAgentPlan;

  const copyRenderScriptPath = async (path) => {
    if (!path) return;
    try {
      await navigator.clipboard.writeText(path);
      setRunToast({ message: "render.sh 路径已复制", type: "info" });
    } catch {
      setRunToast({ message: "复制 render.sh 路径失败", type: "error" });
    }
  };

  const deleteNode = (id) => {
    pushHistory();
    setNodes((p) => p.filter((n) => n.id !== id));
    setConnections((p) => p.filter((c) => c.from !== id && c.to !== id));
    setSelectedNodeIds((p) => {
      const s = new Set(p);
      s.delete(id);
      return s;
    });
  };

  const updateNodeData = (id, d) => setNodes((p) => p.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...d } } : n)));

  const startConnection = (e, nid) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    setConnectingSource({ nodeId: nid, x: r.left + r.width / 2, y: r.top + r.height / 2 });
  };

  const completeConnection = (e, tid) => {
    e.stopPropagation();
    if (connectingSource && connectingSource.nodeId !== tid && !connections.find((c) => c.from === connectingSource.nodeId && c.to === tid)) {
      setConnections([...connections, { id: generateId(), from: connectingSource.nodeId, to: tid }]);
    }
    setConnectingSource(null);
  };

  const fetchHistoryAndStats = async () => {
    try {
      const histResp = await apiFetch(`/api/history`);
      if (histResp.ok) setApiHistory(await histResp.json());
      const statsResp = await apiFetch(`/api/stats`);
      if (statsResp.ok) setApiStats(await statsResp.json());
    } catch (e) {
      console.error("Failed to fetch history/stats", e);
    }
  };

  useEffect(() => {
    if (showHistoryPanel) fetchHistoryAndStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHistoryPanel]);

  const normalizeHistoryOutputs = (outputs) => {
    if (!outputs) return [];
    if (Array.isArray(outputs)) return outputs.map((url) => ({ label: "输出", url }));
    const items = [];
    if (Array.isArray(outputs.images)) outputs.images.forEach((url, i) => items.push({ label: `输出图${outputs.images.length > 1 ? ` #${i + 1}` : ""}`, url }));
    if (Array.isArray(outputs.videos)) outputs.videos.forEach((url, i) => items.push({ label: `输出视频${outputs.videos.length > 1 ? ` #${i + 1}` : ""}`, url }));
    if (typeof outputs.image === "string") items.push({ label: "输出图", url: outputs.image });
    if (typeof outputs.video === "string") items.push({ label: "输出视频", url: outputs.video });
    return items;
  };

  const normalizeHistoryInputs = (inputs) => {
    if (!inputs || typeof inputs !== "object") return [];
    const items = [];
    const pushList = (label, list) => {
      if (!Array.isArray(list)) return;
      list.forEach((url, i) => {
        if (url) items.push({ label: `${label}${list.length > 1 ? ` #${i + 1}` : ""}`, url });
      });
    };
    const pushOne = (label, url) => {
      if (url) items.push({ label, url });
    };
    pushList("输入图", inputs.images);
    pushOne("输入图", inputs.image);
    pushOne("参考图", inputs.ref_image);
    pushOne("背景图", inputs.background_image);
    pushOne("尾帧", inputs.last_frame_image);
    pushOne("风格图", inputs.style_image);
    return items;
  };

  const formatHistoryParams = (inputs) => {
    if (!inputs || typeof inputs !== "object") return [];
    const exclude = new Set(["image", "images", "ref_image", "background_image", "last_frame_image", "style_image", "prompt", "text"]);
    return Object.entries(inputs)
      .filter(([key, value]) => !exclude.has(key) && value !== undefined && value !== null && value !== "")
      .map(([key, value]) => ({ key, value }));
  };

  const applyHistoryConfig = (item) => {
    const targetCategory = TOOL_CARDS[item.mode]?.category;
    const targetType = targetCategory === "enhance" ? NODE_TYPES.POST_PROCESSOR : targetCategory === "video" ? NODE_TYPES.VIDEO_GEN : NODE_TYPES.PROCESSOR;
    const targetNodeId = Array.from(selectedNodeIds).find((id) => nodes.find((n) => n.id === id)?.type === targetType);
    if (!targetNodeId) {
      alert(`请先在画布上选中一个匹配的节点，再点击复用。`);
      return;
    }
    const targetNode = nodes.find((n) => n.id === targetNodeId);
    const nextTemplates = {
      ...(targetNode?.data?.templates || {}),
      ...(item.templates || {}),
      note: item.prompt || "",
    };
    pushHistory();
    updateNodeData(targetNodeId, {
      mode: item.mode,
      prompt: item.prompt,
      templates: nextTemplates,
      model: item.model || targetNode?.data?.model,
    });
    setShowHistoryPanel(false);
  };

  const renderHistoryMedia = (media, title) => {
    if (!media || media.length === 0) {
      return <div className="w-full h-28 rounded-lg border border-dashed border-slate-800 flex items-center justify-center text-[11px] text-slate-600">暂无{title}</div>;
    }
    return (
      <div className="grid grid-cols-2 gap-2">
        {media.map((item, idx) => {
          const isVideo = isVideoContent(item.url);
          return (
            <button
              key={`${title}-${idx}`}
              type="button"
              onClick={() => setPreviewImage(item.url)}
              className="relative block w-full h-28 rounded-lg border border-slate-800 overflow-hidden bg-slate-950"
              title="点击放大预览"
            >
              {isVideo ? (
                <VideoPlayer src={item.url} className="w-full h-full object-cover" controls />
              ) : (
                <img src={item.url} alt={item.label || title} className="w-full h-full object-cover" />
              )}
              {item.label && (
                <span className="absolute left-1 top-1 text-[10px] px-1.5 py-0.5 rounded bg-black/60 text-white">
                  {item.label}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  };

  const handleRunClick = () => {
    let targetNodes = [];
    const allAiNodes = nodes.filter((n) => [NODE_TYPES.PROCESSOR, NODE_TYPES.POST_PROCESSOR, NODE_TYPES.VIDEO_GEN].includes(n.type));

    if (runScope === "all") targetNodes = allAiNodes;
    else if (runScope === "selected") targetNodes = allAiNodes.filter((n) => selectedNodeIds.has(n.id));
    else if (runScope === "selected_downstream") {
      const startIds = Array.from(selectedNodeIds).filter((id) => allAiNodes.find((n) => n.id === id));
      if (startIds.length === 0) {
        setGlobalError("请先选中起始节点");
        return;
      }
      const downstreamIds = getDownstreamNodes(startIds, nodes, connections);
      targetNodes = allAiNodes.filter((n) => downstreamIds.has(n.id));
    }

    if (targetNodes.length === 0) {
      setGlobalError("没有可运行的节点");
      return;
    }

    let taskCount = 0;
    targetNodes.forEach((n) => (taskCount += n.data.batchSize || 1));
    setRunToast({ message: `准备执行：${targetNodes.length} 个节点 / 共 ${taskCount} 次生成任务`, type: "info" });
    setTimeout(() => setRunToast(null), 3000);
    executeFlow(new Set(targetNodes.map((n) => n.id)));
  };

  const safeInvoke = useCallback(
    (action, actionName = "操作") => {
      try {
        action?.();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error || "未知错误");
        console.error(`[Workbench] action:error(${actionName})`, error);
        setRunToast({ type: "error", message: `${actionName}失败：${message}` });
      }
    },
    [],
  );

  const executeFlow = async (specificNodesSet) => {
    setGlobalError(null);

    const baseNodes = nodesRef.current;
    const baseConnections = connectionsRef.current;

    const clone = (obj) => (typeof structuredClone === "function" ? structuredClone(obj) : JSON.parse(JSON.stringify(obj)));
    const runtimeNodes = new Map(baseNodes.map((n) => [n.id, clone(n)]));

    const applyNodeUpdate = (id, patch) => {
      const cur = runtimeNodes.get(id);
      if (!cur) return;
      cur.data = { ...cur.data, ...patch };
      runtimeNodes.set(id, cur);
      setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)));
    };

    const ensureMultiAnglesOutputNodes = (sourceNode, images) => {
      const angleCount = MULTI_ANGLE_VARIANTS.length;
      const groupedImages = Array.from({ length: angleCount }, () => []);
      images.forEach((img, idx) => {
        groupedImages[idx % angleCount].push(img);
      });

      const existingOutputs = Array.from(runtimeNodes.values()).filter(
        (n) =>
          n.type === NODE_TYPES.OUTPUT &&
          n.data?.autoFrom === sourceNode.id &&
          Number.isInteger(n.data?.angleIndex) &&
          n.data.angleIndex >= 0 &&
          n.data.angleIndex < angleCount
      );
      const existingByIndex = new Map(existingOutputs.map((n) => [n.data.angleIndex, n]));

      const createdNodes = [];
      const patches = new Map();
      const requiredConnections = [];

      for (let i = 0; i < angleCount; i++) {
        const existing = existingByIndex.get(i);
        const angleMeta = MULTI_ANGLE_VARIANTS[i];
        const patch = {
          images: groupedImages[i] || [],
          autoFrom: sourceNode.id,
          angleIndex: i,
          angleKey: angleMeta?.key || `angle_${i + 1}`,
          angleLabel: angleMeta?.label || `角度 ${i + 1}`,
        };

        if (existing) {
          existing.data = { ...existing.data, ...patch };
          runtimeNodes.set(existing.id, existing);
          patches.set(existing.id, patch);
          requiredConnections.push({ from: sourceNode.id, to: existing.id });
          continue;
        }

        const col = i % 2;
        const row = Math.floor(i / 2);
        const newNodeId = generateId();
        const newNode = {
          id: newNodeId,
          type: NODE_TYPES.OUTPUT,
          x: sourceNode.x + 360 + col * 320,
          y: sourceNode.y - 120 + row * 190,
          data: patch,
        };
        runtimeNodes.set(newNodeId, clone(newNode));
        createdNodes.push(newNode);
        patches.set(newNodeId, patch);
        requiredConnections.push({ from: sourceNode.id, to: newNodeId });
      }

      if (createdNodes.length > 0 || patches.size > 0) {
        setNodes((prev) => {
          const next = prev.map((n) => {
            const patch = patches.get(n.id);
            if (!patch) return n;
            return { ...n, data: { ...n.data, ...patch } };
          });
          return createdNodes.length > 0 ? [...next, ...createdNodes] : next;
        });
      }

      if (requiredConnections.length > 0) {
        setConnections((prev) => {
          const next = [...prev];
          requiredConnections.forEach((conn) => {
            if (!next.some((c) => c.from === conn.from && c.to === conn.to)) {
              next.push({ id: generateId(), from: conn.from, to: conn.to });
            }
          });
          return next;
        });
      }
    };

    const targetIds = Array.from(specificNodesSet);
    const targetNodes = targetIds.map((id) => runtimeNodes.get(id)).filter(Boolean);
    if (targetNodes.length === 0) return;

    const targetSet = new Set(targetIds);
    const indeg = new Map();
    const adj = new Map();
    targetIds.forEach((id) => {
      indeg.set(id, 0);
      adj.set(id, []);
    });

    baseConnections.forEach((c) => {
      if (targetSet.has(c.from) && targetSet.has(c.to)) {
        indeg.set(c.to, (indeg.get(c.to) || 0) + 1);
        adj.get(c.from).push(c.to);
      }
    });

    const q = [];
    targetIds.forEach((id) => {
      if ((indeg.get(id) || 0) === 0) q.push(id);
    });

    const orderedIds = [];
    while (q.length) {
      const id = q.shift();
      orderedIds.push(id);
      for (const nxt of adj.get(id) || []) {
        indeg.set(nxt, indeg.get(nxt) - 1);
        if (indeg.get(nxt) === 0) q.push(nxt);
      }
    }

    const finalOrder = orderedIds.length === targetIds.length ? orderedIds : targetIds;

    setIsRunning(true);
    setLoadingTip(LOADING_TIPS[Math.floor(Math.random() * LOADING_TIPS.length)]);
    const tipInterval = setInterval(() => setLoadingTip(LOADING_TIPS[Math.floor(Math.random() * LOADING_TIPS.length)]), 3000);

    setNodes((prev) =>
      prev.map((n) =>
        specificNodesSet.has(n.id) ? { ...n, data: { ...n.data, status: "loading", error: null, progress: 0, total: 0 } } : n
      )
    );

    try {
      for (const nodeId of finalOrder) {
        const procNode = runtimeNodes.get(nodeId);
        if (!procNode) continue;

        const incomingConns = baseConnections.filter((c) => c.to === procNode.id);
        const sourceNodes = incomingConns.map((c) => runtimeNodes.get(c.from)).filter(Boolean);

        const outputConn = baseConnections.find((c) => c.from === procNode.id);
        const targetOutput = outputConn ? runtimeNodes.get(outputConn.to) : null;

        const batchSize = procNode.data.batchSize || 1;

        let inputImages = [];
        let sourceText = "";

        sourceNodes.forEach((sn) => {
          const snImages = sn.data.images || [];
          const snUploads = sn.data.uploadedImages || [];
          inputImages.push(...snImages, ...snUploads);
          if (sn.data.text) sourceText += sn.data.text + " ";
        });
        sourceText = sourceText.trim();

        const needsSingle =
          procNode.data.mode === "multi_image_generate" ||
          procNode.data.mode === "text2img" ||
          procNode.data.mode === "local_text2img";
        const effectiveInputCount = needsSingle ? 1 : inputImages.length;

        if (effectiveInputCount === 0 && !needsSingle) {
          applyNodeUpdate(procNode.id, { status: "error", error: "溯源失败：未检测到输入图片（请确认上游节点已先产出 images，并且连线正确）" });
          continue;
        }

        const totalTasks = effectiveInputCount * batchSize;
        applyNodeUpdate(procNode.id, { status: "loading", total: totalTasks, progress: 0 });

        const outputImages = [];

        for (let i = 0; i < effectiveInputCount; i++) {
          for (let b = 0; b < batchSize; b++) {
            try {
              let resultUrl = null;

              if (procNode.data.mode === "text2img" || procNode.data.mode === "local_text2img") {
                const promptToUse = sourceText || procNode.data.prompt;
                if (!promptToUse?.trim()) throw new Error("缺少输入文本提示词");

                if (procNode.data.mode === "local_text2img") {
                  const resp = await apiFetch(`/api/local/text2img`, {
                    method: "POST",
                    skipAuth: true,
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      prompt: promptToUse,
                      model: procNode.data.model,
                      size: procNode.data.templates?.size || "1024x1024",
                      aspect_ratio: procNode.data.templates?.aspect_ratio || "1:1",
                    }),
                  });
                  const data = await resp.json();
                  if (!resp.ok) throw new Error(extractApiError(data));
                  if (data.images?.length > 0) resultUrl = data.images[0];
                } else {
                  const modelId = String(procNode.data.model || defaultImageModelId || "").trim();
                  if (!modelId) throw new Error("缺少图像模型ID");

                  updateApiDebugStatus("aiChatImage", {
                    status: "loading",
                    message: `POST /ai/aiChat part=${resolveWorkbenchAIChatPartEnum({ mode: "text2img" })}`,
                  });

                  const model4Option = imageModelOptions.find((item) => String(item?.id || "").trim() === "4");
                  const fallbackModelId = model4Option ? "4" : "";
                  let aiChatResponse = null;
                  let effectiveModelId = modelId;
                  let effectiveParamCount = 0;
                  const requestAIChatImage = async (targetModelId) => {
                    const paramList = await resolveModelParamsForId(targetModelId);
                    const resolvedParamPayload = buildAIChatParamPayload(paramList);
                    const selectedTaskType = String(procNode.data.templates?.task_type || "").trim();
                    const selectedSize = String(procNode.data.templates?.size || "").trim();
                    const selectedRatio = String(procNode.data.templates?.aspect_ratio || "").trim();
                    const matchedTaskTypeId = findAIChatParamValueId(paramList, ["task", "任务", "类型"], selectedTaskType);
                    const matchedSizeId = findAIChatParamValueId(paramList, ["size", "尺寸"], selectedSize);
                    const matchedRatioId = findAIChatParamValueId(paramList, ["ratio", "比例", "宽高比"], selectedRatio);
                    if (selectedTaskType) {
                      if (!matchedTaskTypeId) throw new Error(`未匹配到task参数ID: ${selectedTaskType}`);
                      resolvedParamPayload.ai_image_param_task_type_id = matchedTaskTypeId;
                    }
                    if (selectedSize) {
                      if (!matchedSizeId) throw new Error(`未匹配到size参数ID: ${selectedSize}`);
                      resolvedParamPayload.ai_image_param_size_id = matchedSizeId;
                    }
                    if (selectedRatio) {
                      if (!matchedRatioId) throw new Error(`未匹配到ratio参数ID: ${selectedRatio}`);
                      resolvedParamPayload.ai_image_param_ratio_id = matchedRatioId;
                    }
                    effectiveParamCount = Object.keys(resolvedParamPayload).length;
                    const authorizationInfo = resolveMemberAuthorizationInfo();
                    const proxyPayload = {
                      authorization: authorizationInfo?.value || "",
                      history_ai_chat_record_id: aiChatHistoryRecordIdRef.current || "",
                      module_enum: WORKBENCH_AI_CHAT_MODULE_ENUM,
                      part_enum: String(resolveWorkbenchAIChatPartEnum({ mode: "text2img" })),
                      ai_chat_session_id: aiChatSessionIdRef.current || "",
                      ai_chat_model_id: targetModelId,
                      message: promptToUse,
                      ...resolvedParamPayload,
                    };
                    if (!proxyPayload.authorization) {
                      throw new Error("缺少 member authorization，无法调用后端curl代理");
                    }
                    pushApiDebugDetail("aiChatImage", {
                      type: "start",
                      path: "/api/ai_chat_image_via_curl",
                      payload: {
                        ...proxyPayload,
                        authorization: `${proxyPayload.authorization.slice(0, 18)}...`,
                      },
                      authorizationSource: authorizationInfo?.source || "none",
                    });
                    try {
                      const proxyData = await submitAIChatImageTask(apiFetch, proxyPayload, {
                        onDebug: (event) => pushApiDebugDetail("aiChatImage", event),
                      });
                      if (proxyData?.source_session_id) aiChatSessionIdRef.current = String(proxyData.source_session_id);
                      if (proxyData?.source_history_record_id) aiChatHistoryRecordIdRef.current = String(proxyData.source_history_record_id);
                      pushApiDebugDetail("aiChatImage", {
                        type: "success",
                        path: "/api/ai_chat_image_via_curl",
                        mode: "json",
                        response: proxyData,
                      });
                      return {
                        meta: {
                          image_url: proxyData?.image_url || "",
                          ai_chat_session_id: proxyData?.source_session_id || "",
                          history_ai_chat_record_id: proxyData?.source_history_record_id || "",
                        },
                        events: Array.isArray(proxyData?.events) ? proxyData.events.map((item) => item?.data ?? item).filter(Boolean) : EMPTY_LIST,
                        data: proxyData,
                        text: String(proxyData?.text || ""),
                      };
                    } catch (proxyError) {
                      pushApiDebugDetail("aiChatImage", {
                        type: "error",
                        path: "/api/ai_chat_image_via_curl",
                        message: proxyError instanceof Error ? proxyError.message : String(proxyError),
                      });
                      return aiChatStream(
                        apiFetch,
                        {
                          history_ai_chat_record_id: aiChatHistoryRecordIdRef.current || undefined,
                          module_enum: WORKBENCH_AI_CHAT_MODULE_ENUM,
                          part_enum: String(resolveWorkbenchAIChatPartEnum({ mode: "text2img" })),
                          ai_chat_session_id: aiChatSessionIdRef.current || undefined,
                          ai_chat_model_id: targetModelId,
                          message: promptToUse,
                          ...resolvedParamPayload,
                        },
                        {
                          onDebug: (event) => pushApiDebugDetail("aiChatImage", event),
                          onMeta: (meta) => {
                            if (meta?.aiChatSessionId) aiChatSessionIdRef.current = meta.aiChatSessionId;
                            if (meta?.historyAiChatRecordId) aiChatHistoryRecordIdRef.current = meta.historyAiChatRecordId;
                          },
                        },
                      );
                    }
                  };
                  try {
                    aiChatResponse = await requestAIChatImage(modelId);
                    const firstErrMsg = extractAIChatDoneError(aiChatResponse);
                    const canRetryWithModel4 =
                      !!firstErrMsg && !!fallbackModelId && String(modelId) !== fallbackModelId;
                    if (canRetryWithModel4) {
                      updateApiDebugStatus("aiChatImage", {
                        status: "loading",
                        message: `part=${resolveWorkbenchAIChatPartEnum({ mode: "text2img" })} model=${modelId}失败，自动重试model=${fallbackModelId}`,
                      });
                      aiChatResponse = await requestAIChatImage(fallbackModelId);
                      effectiveModelId = fallbackModelId;
                    }
                  } catch (error) {
                    updateApiDebugStatus("aiChatImage", {
                      status: "error",
                      message: formatAIChatErrorMessage(error),
                    });
                    throw error;
                  }

                  resultUrl =
                    pickFirstImageUrl(aiChatResponse?.meta) ||
                    pickFirstImageUrl(aiChatResponse?.events) ||
                    pickFirstImageUrl(aiChatResponse?.data) ||
                    pickFirstImageUrl(aiChatResponse?.text) ||
                    "";

                  const doneErrMsg = extractAIChatDoneError(aiChatResponse);
                  if (!resultUrl || doneErrMsg) {
                    console.info(
                      "[aiChatImage] parsed-response",
                      JSON.stringify(
                        {
                          result_url: resultUrl || "",
                          done_error: doneErrMsg || "",
                          event_count: Array.isArray(aiChatResponse?.events) ? aiChatResponse.events.length : 0,
                          last_events: Array.isArray(aiChatResponse?.events) ? aiChatResponse.events.slice(-3) : [],
                          response_summary: summarizeAIChatResponse(aiChatResponse),
                        },
                        null,
                        2,
                      ),
                    );
                  }
                  if (!resultUrl && doneErrMsg) {
                    throw new Error(`AI Chat 返回错误：${doneErrMsg}`);
                  }

                  if (!resultUrl) {
                    const summary = summarizeAIChatResponse(aiChatResponse);
                    throw new Error(
                      `aiChat 文生图未返回可解析图片URL${summary ? ` | 响应摘要: ${summary}` : ""}`,
                    );
                  }
                  updateApiDebugStatus("aiChatImage", {
                    status: "success",
                    message: `part=${resolveWorkbenchAIChatPartEnum({ mode: "text2img" })} model=${effectiveModelId} params=${effectiveParamCount}`,
                  });
                }
              } else if (
                procNode.type === NODE_TYPES.VIDEO_GEN ||
                procNode.data.mode === "img2video" ||
                procNode.data.mode === "local_img2video"
              ) {
                const rawDuration = procNode.data.templates?.duration || "5";
                const durationInt = parseInt(String(rawDuration).replace(/[^0-9]/g, "")) || 5;
                const isCameraFixed = procNode.data.templates?.camera?.includes("固定") || false;

                const payload = {
                  model: procNode.data.model || defaultVideoModelId,
                  image: inputImages[i],
                  last_frame_image: procNode.data.refImage || null,
                  prompt: procNode.data.prompt || sourceText || "natural motion",
                  duration: durationInt,
                  fps: 24,
                  camera_fixed: isCameraFixed,
                  resolution: procNode.data.templates?.resolution || "1080p",
                  generate_audio: true, // ✅ 仅 1.5
                  seed: 21,
                  ...(String(procNode.data.templates?.ratio || "").trim()
                    ? { ratio: String(procNode.data.templates?.ratio || "").trim() }
                    : {}),
                };
                if (procNode.data.mode === "local_img2video") {
                  const resp = await apiFetch(`/api/local/img2video`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                  });
                  const data = await resp.json();
                  if (!resp.ok) throw new Error(extractApiError(data));
                  resultUrl = data.image;
                } else {
                  updateApiDebugStatus("aiChatImage", {
                    status: "loading",
                    message: `POST /api/ai_chat_image_via_curl part=${resolveWorkbenchAIChatPartEnum({ mode: "img2video" })}`,
                  });
                  try {
                    const modelId = String(payload.model || "").trim();
                    if (!modelId) throw new Error("缺少图生视频模型ID");
                    const paramList = await resolveModelParamsForId(modelId);
                    const resolvedParamPayload = buildAIChatParamPayload(paramList);
                    const selectedResolution = String(payload.resolution || "").trim();
                    const selectedRatio = String(procNode.data.templates?.ratio || "").trim();
                    const selectedDuration = String(durationInt || "").trim();
                    const matchedResolutionId = findAIChatParamValueId(paramList, ["resolution", "分辨率"], selectedResolution);
                    const matchedRatioId = findAIChatParamValueId(paramList, ["ratio", "比例", "宽高比"], selectedRatio);
                    const matchedDurationId = findAIChatParamValueId(paramList, ["duration", "时长"], selectedDuration);
                    if (selectedResolution && !matchedResolutionId) {
                      throw new Error(`未匹配到resolution参数ID: ${selectedResolution}`);
                    }
                    if (selectedDuration && !matchedDurationId) {
                      throw new Error(`未匹配到duration参数ID: ${selectedDuration}`);
                    }
                    if (matchedResolutionId) {
                      resolvedParamPayload.ai_video_param_resolution_id = matchedResolutionId;
                    }
                    if (selectedRatio) {
                      if (!matchedRatioId) {
                        throw new Error(`未匹配到ratio参数ID: ${selectedRatio}`);
                      }
                      resolvedParamPayload.ai_video_param_ratio_id = matchedRatioId;
                    } else {
                      delete resolvedParamPayload.ai_video_param_ratio_id;
                    }
                    if (matchedDurationId) {
                      resolvedParamPayload.ai_video_param_duration_id = matchedDurationId;
                    }
                    const authorizationInfo = resolveMemberAuthorizationInfo();
                    const imagesPayload = [payload.image, payload.last_frame_image].filter(Boolean);
                    const proxyPayload = {
                      authorization: authorizationInfo?.value || "",
                      history_ai_chat_record_id: aiChatHistoryRecordIdRef.current || "",
                      module_enum: WORKBENCH_AI_CHAT_MODULE_ENUM,
                      part_enum: String(resolveWorkbenchAIChatPartEnum({ mode: "img2video" })),
                      ai_chat_session_id: aiChatSessionIdRef.current || "",
                      ai_chat_model_id: modelId,
                      message: payload.prompt || "natural motion",
                      images: imagesPayload,
                      ...resolvedParamPayload,
                    };
                    if (!proxyPayload.authorization) {
                      throw new Error("缺少 member authorization，无法调用后端curl代理");
                    }
                    pushApiDebugDetail("aiChatImage", {
                      type: "start",
                      path: "/api/ai_chat_image_via_curl",
                      payload: {
                        ...proxyPayload,
                        authorization: `${proxyPayload.authorization.slice(0, 18)}...`,
                        images: [`count=${imagesPayload.length}`],
                        param_mapping: {
                          resolution: selectedResolution || "-",
                          resolution_id: resolvedParamPayload.ai_video_param_resolution_id || "",
                          ratio: selectedRatio || "-",
                          ratio_id: resolvedParamPayload.ai_video_param_ratio_id || "",
                          duration: selectedDuration || "-",
                          duration_id: resolvedParamPayload.ai_video_param_duration_id || "",
                        },
                      },
                      authorizationSource: authorizationInfo?.source || "none",
                    });
                    const proxyData = await submitAIChatImageTask(apiFetch, proxyPayload, {
                      onDebug: (event) => pushApiDebugDetail("aiChatImage", event),
                    });
                    if (proxyData?.source_session_id) aiChatSessionIdRef.current = String(proxyData.source_session_id);
                    if (proxyData?.source_history_record_id) aiChatHistoryRecordIdRef.current = String(proxyData.source_history_record_id);
                    pushApiDebugDetail("aiChatImage", {
                      type: "success",
                      path: "/api/ai_chat_image_via_curl",
                      mode: "json",
                      response: proxyData,
                    });
                    resultUrl =
                      pickFirstVideoUrl(proxyData?.video_url) ||
                      pickFirstVideoUrl(proxyData?.output_video) ||
                      pickFirstVideoUrl(proxyData?.events) ||
                      pickFirstVideoUrl(proxyData?.text) ||
                      pickFirstVideoUrl(proxyData) ||
                      pickFirstImageUrl(proxyData?.image_url) ||
                      pickFirstImageUrl(proxyData?.events) ||
                      pickFirstImageUrl(proxyData?.text) ||
                      "";
                    const doneErrMsg = String(proxyData?.done_error || "").trim();
                    if (!resultUrl && doneErrMsg) throw new Error(`AI Chat 返回错误：${doneErrMsg}`);
                    if (!resultUrl) {
                      const summary = summarizeAIChatResponse(proxyData);
                      throw new Error(`aiChat 图生视频未返回可解析URL${summary ? ` | 响应摘要: ${summary}` : ""}`);
                    }
                    updateApiDebugStatus("aiChatImage", {
                      status: "success",
                      message: `part=${resolveWorkbenchAIChatPartEnum({ mode: "img2video" })} model=${modelId} params=${Object.keys(resolvedParamPayload).length}`,
                    });
                  } catch (proxyError) {
                    pushApiDebugDetail("aiChatImage", {
                      type: "error",
                      path: "/api/ai_chat_image_via_curl",
                      message: proxyError instanceof Error ? proxyError.message : String(proxyError),
                    });
                    const proxyErrorMsg = proxyError instanceof Error ? proxyError.message : String(proxyError);
                    const shouldSkipFallback =
                      proxyErrorMsg.includes("缺少 member authorization") ||
                      proxyErrorMsg.toLowerCase().includes("authorization 不能为空");
                    if (shouldSkipFallback) {
                      throw new Error(proxyErrorMsg);
                    }
                    updateApiDebugStatus("aiChatImage", {
                      status: "loading",
                      message: "img2video 代理失败，回退 /api/img2video",
                    });
                    try {
                      const resp = await apiFetch(`/api/img2video`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload),
                      });
                      const data = await resp.json();
                      if (!resp.ok) throw new Error(extractApiError(data));
                      resultUrl = data.image;
                    } catch (fallbackError) {
                      const fallbackMsg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
                      throw new Error(`img2video 代理失败: ${proxyErrorMsg}; 回退失败: ${fallbackMsg}`);
                    }
                  }
                }
              } else if (procNode.data.mode === "multi_image_generate") {
                const promptToUse = sourceText || procNode.data.prompt;
                if (!promptToUse?.trim()) throw new Error("缺少图生图提示词");
                if (!Array.isArray(inputImages) || !inputImages.length) throw new Error("缺少图生图输入图片");
                const modelId = String(procNode.data.model || defaultImageModelId || "").trim();
                if (!modelId) throw new Error("缺少图像模型ID");
                updateApiDebugStatus("aiChatImage", {
                  status: "loading",
                  message: `POST /api/ai_chat_image_via_curl part=${resolveWorkbenchAIChatPartEnum({ mode: "multi_image_generate" })}`,
                });
                try {
                  const paramList = await resolveModelParamsForId(modelId);
                  const resolvedParamPayload = buildAIChatParamPayload(paramList);
                  const selectedTaskType = String(procNode.data.templates?.task_type || "").trim();
                  const selectedSize = String(procNode.data.templates?.size || "").trim();
                  const selectedRatio = String(procNode.data.templates?.aspect_ratio || "").trim();
                  const matchedTaskTypeId = findAIChatParamValueId(paramList, ["task", "任务", "类型"], selectedTaskType);
                  const matchedSizeId = findAIChatParamValueId(paramList, ["size", "尺寸"], selectedSize);
                  const matchedRatioId = findAIChatParamValueId(paramList, ["ratio", "比例", "宽高比"], selectedRatio);
                  if (selectedTaskType) {
                    if (!matchedTaskTypeId) throw new Error(`未匹配到task参数ID: ${selectedTaskType}`);
                    resolvedParamPayload.ai_image_param_task_type_id = matchedTaskTypeId;
                  }
                  if (selectedSize) {
                    if (!matchedSizeId) throw new Error(`未匹配到size参数ID: ${selectedSize}`);
                    resolvedParamPayload.ai_image_param_size_id = matchedSizeId;
                  }
                  if (selectedRatio) {
                    if (!matchedRatioId) throw new Error(`未匹配到ratio参数ID: ${selectedRatio}`);
                    resolvedParamPayload.ai_image_param_ratio_id = matchedRatioId;
                  } else {
                    delete resolvedParamPayload.ai_image_param_ratio_id;
                  }
                  const authorizationInfo = resolveMemberAuthorizationInfo();
                  const proxyPayload = {
                    authorization: authorizationInfo?.value || "",
                    history_ai_chat_record_id: aiChatHistoryRecordIdRef.current || "",
                    module_enum: WORKBENCH_AI_CHAT_MODULE_ENUM,
                    part_enum: String(resolveWorkbenchAIChatPartEnum({ mode: "multi_image_generate" })),
                    ai_chat_session_id: aiChatSessionIdRef.current || "",
                    ai_chat_model_id: modelId,
                    message: promptToUse,
                    images: inputImages,
                    ...resolvedParamPayload,
                  };
                  if (!proxyPayload.authorization) {
                    throw new Error("缺少 member authorization，无法调用后端curl代理");
                  }
                  pushApiDebugDetail("aiChatImage", {
                    type: "start",
                    path: "/api/ai_chat_image_via_curl",
                    payload: {
                      ...proxyPayload,
                      authorization: `${proxyPayload.authorization.slice(0, 18)}...`,
                      images: Array.isArray(inputImages) ? [`count=${inputImages.length}`] : [],
                    },
                    authorizationSource: authorizationInfo?.source || "none",
                  });
                  const proxyData = await submitAIChatImageTask(apiFetch, proxyPayload, {
                    onDebug: (event) => pushApiDebugDetail("aiChatImage", event),
                  });
                  if (proxyData?.source_session_id) aiChatSessionIdRef.current = String(proxyData.source_session_id);
                  if (proxyData?.source_history_record_id) aiChatHistoryRecordIdRef.current = String(proxyData.source_history_record_id);
                  pushApiDebugDetail("aiChatImage", {
                    type: "success",
                    path: "/api/ai_chat_image_via_curl",
                    mode: "json",
                    response: proxyData,
                  });
                  resultUrl =
                    pickFirstVideoUrl(proxyData?.video_url) ||
                    pickFirstVideoUrl(proxyData?.output_video) ||
                    pickFirstVideoUrl(proxyData?.events) ||
                    pickFirstVideoUrl(proxyData?.text) ||
                    pickFirstVideoUrl(proxyData) ||
                    pickFirstImageUrl(proxyData?.image_url) ||
                    pickFirstImageUrl(proxyData?.events) ||
                    pickFirstImageUrl(proxyData?.text) ||
                    "";
                  const doneErrMsg = String(proxyData?.done_error || "").trim();
                  if (!resultUrl && doneErrMsg) throw new Error(`AI Chat 返回错误：${doneErrMsg}`);
                  if (!resultUrl) {
                    const summary = summarizeAIChatResponse(proxyData);
                    throw new Error(`aiChat 图生图未返回可解析图片URL${summary ? ` | 响应摘要: ${summary}` : ""}`);
                  }
                  updateApiDebugStatus("aiChatImage", {
                    status: "success",
                    message: `img2img model=${modelId} params=${Object.keys(resolvedParamPayload).length}`,
                  });
                } catch (proxyError) {
                  pushApiDebugDetail("aiChatImage", {
                    type: "error",
                    path: "/api/ai_chat_image_via_curl",
                    message: proxyError instanceof Error ? proxyError.message : String(proxyError),
                  });
                  updateApiDebugStatus("aiChatImage", {
                    status: "error",
                    message: proxyError instanceof Error ? proxyError.message : String(proxyError),
                  });
                  throw proxyError;
                }
              } else if (procNode.data.mode === "rmbg") {
                const resp = await apiFetch(`/api/rmbg`, {
                  method: "POST",
                  skipAuth: true,
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    image: inputImages[i],
                    size: procNode.data.templates?.size || "1024x1024",
                    aspect_ratio: procNode.data.templates?.aspect_ratio || "1:1",
                  }),
                });
                const data = await resp.json();
                if (!resp.ok) throw new Error(extractApiError(data));
                resultUrl = data.image || data.images?.[0];
              } else if (procNode.data.mode === "feature_extract") {
                const resp = await apiFetch(`/api/multi_image_generate`, {
                  method: "POST",
                  skipAuth: true,
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    prompt: sourceText || procNode.data.prompt || FEATURE_EXTRACT_PRESET_PROMPTS.face,
                    images: [inputImages[i]],
                    temperature: 0.7,
                    size: procNode.data.templates?.size || "1024x1024",
                    aspect_ratio: procNode.data.templates?.aspect_ratio || "1:1",
                  }),
                });
                const data = await resp.json();
                if (!resp.ok) throw new Error(extractApiError(data));
                resultUrl = data.image || data.images?.[0];
              } else if (procNode.data.mode === "video_upscale") {
                const videoInput = inputImages[i];
                if (!isVideoContent(videoInput)) {
                  throw new Error("视频超清技能仅支持视频输入");
                }
                updateApiDebugStatus("aiChatImage", {
                  status: "loading",
                  message: `POST /api/ai_chat_image_via_curl part=${resolveWorkbenchAIChatPartEnum({ mode: "video_upscale" })}`,
                });
                try {
                  const authorizationInfo = resolveMemberAuthorizationInfo();
                  const proxyPayload = {
                    ...(agentDevMode ? { endpoint: "http://172.16.20.19:16313/ai/aiChat" } : {}),
                    authorization: authorizationInfo?.value || "",
                    module_enum: WORKBENCH_AI_CHAT_MODULE_ENUM,
                    part_enum: String(resolveWorkbenchAIChatPartEnum({ mode: "video_upscale" })),
                    ai_chat_model_id: String(procNode.data.model || DEFAULT_VIDEO_HD_MODEL_ID).trim() || DEFAULT_VIDEO_HD_MODEL_ID,
                    message: String(procNode.data.prompt || "视频画质增强").trim() || "视频画质增强",
                    template_enum: String(
                      parseInt(String(procNode.data.templates?.template_enum ?? VOLC_VIDEO_HD_TEMPLATE_ENUM_1), 10)
                        || VOLC_VIDEO_HD_TEMPLATE_ENUM_1,
                    ),
                    async: "false",
                    files: [videoInput],
                  };
                  if (!proxyPayload.authorization) {
                    throw new Error("缺少 member authorization，无法调用后端curl代理");
                  }
                  pushApiDebugDetail("aiChatImage", {
                    type: "start",
                    path: "/api/ai_chat_image_via_curl",
                    payload: {
                      ...proxyPayload,
                      authorization: `${proxyPayload.authorization.slice(0, 18)}...`,
                      files: ["count=1(video)"],
                    },
                    authorizationSource: authorizationInfo?.source || "none",
                  });
                  const proxyData = await submitAIChatImageTask(apiFetch, proxyPayload, {
                    onDebug: (event) => pushApiDebugDetail("aiChatImage", event),
                  });
                  if (proxyData?.source_session_id) aiChatSessionIdRef.current = String(proxyData.source_session_id);
                  if (proxyData?.source_history_record_id) aiChatHistoryRecordIdRef.current = String(proxyData.source_history_record_id);
                  pushApiDebugDetail("aiChatImage", {
                    type: "success",
                    path: "/api/ai_chat_image_via_curl",
                    mode: "json",
                    response: proxyData,
                  });
                  resultUrl =
                    pickFirstVideoUrl(proxyData?.video_url) ||
                    pickFirstVideoUrl(proxyData?.output_video) ||
                    pickFirstVideoUrl(proxyData?.events) ||
                    pickFirstVideoUrl(proxyData?.text) ||
                    pickFirstVideoUrl(proxyData) ||
                    pickFirstImageUrl(proxyData?.image_url) ||
                    pickFirstImageUrl(proxyData?.events) ||
                    pickFirstImageUrl(proxyData?.text) ||
                    "";
                  const doneErrMsg = String(proxyData?.done_error || "").trim();
                  if (!resultUrl && doneErrMsg) throw new Error(`AI Chat 返回错误：${doneErrMsg}`);
                  if (!resultUrl) {
                    const summary = summarizeAIChatResponse(proxyData);
                    throw new Error(`aiChat 视频超清未返回可解析URL${summary ? ` | 响应摘要: ${summary}` : ""}`);
                  }
                  updateApiDebugStatus("aiChatImage", {
                    status: "success",
                    message: `part=${resolveWorkbenchAIChatPartEnum({ mode: "video_upscale" })} template=${proxyPayload.template_enum}`,
                  });
                } catch (proxyError) {
                  pushApiDebugDetail("aiChatImage", {
                    type: "error",
                    path: "/api/ai_chat_image_via_curl",
                    message: proxyError instanceof Error ? proxyError.message : String(proxyError),
                  });
                  updateApiDebugStatus("aiChatImage", {
                    status: "error",
                    message: proxyError instanceof Error ? proxyError.message : String(proxyError),
                  });
                  throw proxyError;
                }
              } else if (procNode.data.mode === "multi_angleshots") {
                const resp = await apiFetch(`/api/multi_angleshots`, {
                  method: "POST",
                  skipAuth: true,
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    image: inputImages[i],
                  }),
                });
                const data = await resp.json();
                if (!resp.ok) throw new Error(extractApiError(data));
                const eightResults = Array.isArray(data.images) ? data.images : [];
                if (eightResults.length === 0) throw new Error("多角度镜头未返回结果");
                outputImages.push(...eightResults.filter(Boolean));
                resultUrl = null;
              } else {
                const payload = {
                  image: inputImages[i],
                  mode: procNode.data.mode,
                  prompt: procNode.data.prompt || sourceText,
                  ref_image: procNode.data.refImage,
                  model: procNode.data.model,
                };
                const resp = await apiFetch(`/api/edit`, {
                  method: "POST",
                  skipAuth: MODES_WITHOUT_APP_AUTH.has(procNode.data.mode),
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(payload),
                });
                const data = await resp.json();
                if (!resp.ok) throw new Error(extractApiError(data));
                resultUrl = data.image;
              }

              if (resultUrl) outputImages.push(resultUrl);
            } catch (e) {
              console.error("Task execution failed:", e);
              applyNodeUpdate(procNode.id, { status: "error", error: e.message || String(e) });
            }

            const currentProgress = i * batchSize + (b + 1);
            applyNodeUpdate(procNode.id, { progress: currentProgress });
          }
        }

        if (outputImages.length > 0) {
          applyNodeUpdate(procNode.id, { status: "success", images: outputImages });
          if (procNode.data.mode === "multi_angleshots") {
            ensureMultiAnglesOutputNodes(procNode, outputImages);
          } else if (targetOutput && targetOutput.type === NODE_TYPES.OUTPUT) {
            const prevOut = targetOutput.data.images || [];
            applyNodeUpdate(targetOutput.id, { images: [...prevOut, ...outputImages] });
          }
        }
      }
    } finally {
      clearInterval(tipInterval);
      setIsRunning(false);
    }
  };

  const runCompactThreeView = useCallback(
    async (sourceNodeId, imageIndex = 0) => {
      const sourceNode = nodesRef.current.find((node) => node.id === sourceNodeId);
      const sourceImages = Array.isArray(sourceNode?.data?.images) ? sourceNode.data.images : [];
      const safeIndex = Math.max(0, Math.min(imageIndex, sourceImages.length - 1));
      const retrySourceImage = String(sourceNode?.data?.compactThreeViewSourceImage || "").trim();
      const sourceImage = retrySourceImage || sourceImages[safeIndex] || sourceImages[0] || "";
      if (!sourceImage) {
        throw new Error("缺少三视图输入图片");
      }

      const modelId = String(threeViewImageModelId || "").trim();
      if (!modelId) {
        throw new Error("图片模型仍在加载，请稍后重试");
      }

      const paramList = await resolveModelParamsForId(modelId);
      const resolvedParamPayload = buildAIChatParamPayload(paramList);
      const matchedSizeId =
        findAIChatParamValueId(paramList, ["size", "尺寸"], THREE_VIEW_DEFAULT_TEMPLATES.size) ||
        findAIChatParamValueId(paramList, ["size", "尺寸"], "1024x1024");
      const matchedRatioId = findAIChatParamValueId(paramList, ["ratio", "比例", "宽高比"], THREE_VIEW_DEFAULT_TEMPLATES.aspect_ratio);

      if (!matchedSizeId) {
        throw new Error(`未匹配到size参数ID: ${THREE_VIEW_DEFAULT_TEMPLATES.size}`);
      }
      if (!matchedRatioId) {
        throw new Error(`未匹配到ratio参数ID: ${THREE_VIEW_DEFAULT_TEMPLATES.aspect_ratio}`);
      }

      resolvedParamPayload.ai_image_param_size_id = matchedSizeId;
      resolvedParamPayload.ai_image_param_ratio_id = matchedRatioId;

      const authorizationInfo = resolveMemberAuthorizationInfo();
      const proxyPayload = {
        authorization: authorizationInfo?.value || "",
        history_ai_chat_record_id: aiChatHistoryRecordIdRef.current || "",
        module_enum: WORKBENCH_AI_CHAT_MODULE_ENUM,
        part_enum: String(resolveWorkbenchAIChatPartEnum({ mode: "multi_image_generate" })),
        ai_chat_session_id: aiChatSessionIdRef.current || "",
        ai_chat_model_id: modelId,
        message: THREE_VIEW_PROMPT,
        images: [sourceImage],
        ...resolvedParamPayload,
      };

      if (!proxyPayload.authorization) {
        throw new Error("缺少 member authorization，无法调用后端curl代理");
      }

      updateApiDebugStatus("aiChatImage", {
        status: "loading",
        message: `POST /api/ai_chat_image_via_curl part=${resolveWorkbenchAIChatPartEnum({ mode: "multi_image_generate" })}`,
      });
      pushApiDebugDetail("aiChatImage", {
        type: "start",
        path: "/api/ai_chat_image_via_curl",
        payload: {
          ...proxyPayload,
          authorization: `${proxyPayload.authorization.slice(0, 18)}...`,
          images: ["count=1"],
        },
        authorizationSource: authorizationInfo?.source || "none",
      });

      const proxyData = await submitAIChatImageTask(apiFetch, proxyPayload, {
        onDebug: (event) => pushApiDebugDetail("aiChatImage", event),
      });
      if (proxyData?.source_session_id) aiChatSessionIdRef.current = String(proxyData.source_session_id);
      if (proxyData?.source_history_record_id) aiChatHistoryRecordIdRef.current = String(proxyData.source_history_record_id);

      const resultUrl =
        pickFirstImageUrl(proxyData?.image_url) ||
        pickFirstImageUrl(proxyData?.events) ||
        pickFirstImageUrl(proxyData?.text) ||
        "";
      const doneErrMsg = String(proxyData?.done_error || "").trim();
      if (!resultUrl && doneErrMsg) {
        throw new Error(`AI Chat 返回错误：${doneErrMsg}`);
      }
      if (!resultUrl) {
        const summary = summarizeAIChatResponse(proxyData);
        throw new Error(`aiChat 三视图未返回可解析图片URL${summary ? ` | 响应摘要: ${summary}` : ""}`);
      }

      pushHistory();
      const nextImages = [...sourceImages];
      nextImages[safeIndex] = resultUrl;
      updateNodeData(sourceNodeId, {
        images: nextImages,
        compactThreeViewSourceImage: retrySourceImage || sourceImage,
        compactThreeViewLastResultImage: resultUrl,
        status: "idle",
        error: "",
      });
      updateApiDebugStatus("aiChatImage", {
        status: "success",
        message: `three-view model=${modelId} params=${Object.keys(resolvedParamPayload).length}`,
      });
      setRunToast({ message: "三视图生成完成", type: "info" });
      setTimeout(() => setRunToast(null), 2200);
    },
    [
      apiFetch,
      pushApiDebugDetail,
      pushHistory,
      resolveModelParamsForId,
      threeViewImageModelId,
      updateApiDebugStatus,
      updateNodeData,
    ],
  );

  const renderConnections = () =>
    connections.map((conn) => {
      const fromNode = nodes.find((n) => n.id === conn.from);
      const toNode = nodes.find((n) => n.id === conn.to);
      if (!fromNode || !toNode) return null;

      const x1 = fromNode.x + 280;
      const y1 = fromNode.y + 58;
      const x2 = toNode.x;
      const y2 = toNode.y + 58;

      const cp1x = x1 + (x2 - x1) / 2;
      const cp2x = x2 - (x2 - x1) / 2;
      const path = `M ${x1} ${y1} C ${cp1x} ${y1}, ${cp2x} ${y2}, ${x2} ${y2}`;

      return (
        <g key={conn.id}>
          <path d={path} stroke="transparent" strokeWidth="10" fill="none" className="cursor-pointer" />
          <path
            d={path}
            stroke={selectedConnectionIds.has(conn.id) ? "#67e8f9" : "rgba(100,116,139,0.72)"}
            strokeWidth="2.2"
            fill="none"
            className="transition-colors duration-200"
          />
          {isRunning && (
            <circle r="3.5" fill="#67e8f9">
              <animateMotion dur="1.5s" repeatCount="indefinite" path={path} />
            </circle>
          )}
        </g>
      );
    });

  const renderTempConnection = () => {
    if (!connectingSource) return null;
    const n = nodes.find((nn) => nn.id === connectingSource.nodeId);
    if (!n) return null;

    const x1 = n.x + 280,
      y1 = n.y + 58;
    const target = screenToCanvas(mousePos.x, mousePos.y);
    const path = `M ${x1} ${y1} C ${x1 + (target.x - x1) / 2} ${y1}, ${target.x - (target.x - x1) / 2} ${target.y}, ${target.x} ${target.y}`;
    return <path d={path} stroke="#fbbf24" strokeWidth={2 / viewport.zoom} strokeDasharray="5,5" fill="none" />;
  };

  const renderSidebarContent = (onAction) => {
    const sections = [
      {
        key: "nodes",
        title: "节点",
        items: [
          {
            id: "node_text_prompt",
            icon: Clipboard,
            label: "提示词输入",
            desc: "纯文本提示词",
            color: "text-yellow-400",
            bg: "bg-yellow-500/10",
            onClick: () => addNode(NODE_TYPES.TEXT_INPUT),
          },
          {
            id: "node_upload",
            icon: Upload,
            label: "图片/视频上传",
            desc: "主商品图/素材",
            color: "text-blue-400",
            bg: "bg-blue-500/10",
            onClick: () => addNode(NODE_TYPES.INPUT),
          },
          {
            id: "node_image_generate",
            icon: ImagePlus,
            label: "图片生成",
            desc: "背景/手势/生成",
            color: "text-purple-400",
            bg: "bg-purple-500/10",
            onClick: () =>
              handleAnchorActionClick({
                partEnum: AI_CHAT_PART_ENUM_203,
                modelId: defaultImageModelId,
                to: "node_image_generate",
                debugLabel: "图片生成",
                action: () => addNode(NODE_TYPES.PROCESSOR),
              }),
          },
          {
            id: "node_video_generate",
            icon: Film,
            label: "视频生成",
            desc: "图生视频/动效",
            color: "text-rose-400",
            bg: "bg-rose-500/10",
            onClick: () =>
              handleAnchorActionClick({
                partEnum: AI_CHAT_PART_ENUM_204,
                modelId: defaultVideoModelId,
                to: "node_video_generate",
                debugLabel: "视频生成",
                action: () => addNode(NODE_TYPES.VIDEO_GEN),
              }),
          },
          {
            id: "node_output",
            icon: Download,
            label: "结果输出",
            desc: "预览与下载",
            color: "text-green-400",
            bg: "bg-green-500/10",
            onClick: () => addNode(NODE_TYPES.OUTPUT),
          },
        ],
      },
      {
        key: "skills",
        title: "技能",
        items: [
          {
            id: "skill_rmbg",
            icon: Scissors,
            label: "背景移除",
            desc: "抠图去背景（可串联）",
            color: "text-cyan-300",
            bg: "bg-cyan-500/10",
            onClick: () => addNode(NODE_TYPES.PROCESSOR, "rmbg"),
          },
          {
            id: "skill_feature_extract",
            icon: Scan,
            label: "特征提取",
            desc: "面部/背景/服装首饰",
            color: "text-cyan-300",
            bg: "bg-cyan-500/10",
            onClick: () =>
              handleAnchorActionClick({
                partEnum: AI_CHAT_PART_ENUM_207,
                modelId: defaultImageModelId,
                to: "skill_feature_extract",
                debugLabel: "特征提取",
                action: () => addNode(NODE_TYPES.PROCESSOR, "feature_extract"),
              }),
          },
          {
            id: "skill_multi_angleshots",
            icon: LayoutGrid,
            label: "多角度镜头",
            desc: "单图扩展为 8 个机位",
            color: "text-purple-300",
            bg: "bg-purple-500/10",
            onClick: () => addNode(NODE_TYPES.PROCESSOR, "multi_angleshots"),
          },
          {
            id: "skill_video_upscale",
            icon: TrendingUp,
            label: "视频超清",
            desc: "视频画质增强",
            color: "text-rose-300",
            bg: "bg-rose-500/10",
            onClick: () =>
              handleAnchorActionClick({
                partEnum: AI_CHAT_PART_ENUM_6,
                modelId: 1,
                to: "skill_video_upscale",
                debugLabel: "视频超清",
                action: () => addNode(NODE_TYPES.PROCESSOR, "video_upscale"),
              }),
          },
        ],
      },
      {
        key: "workflows",
        title: "工作流",
        items: [
          {
            id: "workflow_swap",
            icon: Layers,
            label: "三合一换图",
            desc: "换脸/换背景/换装/视频超清",
            color: "text-purple-300",
            bg: "bg-purple-500/10",
            onClick: () =>
              handleAnchorActionClick({
                partEnum: AI_CHAT_PART_ENUM_209,
                modelId: 4,
                to: "workflow_swap",
                debugLabel: "三合一换图",
                action: () => navigate("/app/swap"),
              }),
          },
          {
            id: "workflow_batch_video",
            icon: Film,
            label: "批量动图",
            desc: "单图生成短视频/视频超清",
            color: "text-sky-400",
            bg: "bg-sky-500/10",
            onClick: () =>
              handleAnchorActionClick({
                partEnum: AI_CHAT_PART_ENUM_210,
                modelId: 4,
                to: "workflow_batch_video",
                debugLabel: "批量动图",
                action: () => navigate("/app/batch-video"),
              }),
          },
          {
            id: "workflow_batch_wordart",
            icon: Palette,
            label: "批量花字",
            desc: "批量添加花字文案",
            color: "text-cyan-300",
            bg: "bg-cyan-500/10",
            onClick: () =>
              handleAnchorActionClick({
                partEnum: AI_CHAT_PART_ENUM_211,
                modelId: defaultVideoModelId,
                to: "workflow_batch_wordart",
                debugLabel: "批量花字",
                action: () => navigate("/app/batch-wordart"),
              }),
          },
        ],
      },
      ...(isAdminUser
        ? [
            {
              key: "learning",
              title: "AI深度学习",
              items: [
                {
                  id: "workflow_local_text2img",
                  icon: ImagePlus,
                  label: "本地：文生图",
                  desc: "image_z_image_turbo 工作流",
                  color: "text-purple-300",
                  bg: "bg-purple-500/10",
                  onClick: () => createLocalText2ImgTemplate(),
                },
                {
                  id: "workflow_local_img2video",
                  icon: Film,
                  label: "本地：图生视频",
                  desc: "Qwen_i2v 工作流",
                  color: "text-sky-300",
                  bg: "bg-sky-500/10",
                  onClick: () => createLocalImg2VideoTemplate(),
                },
                {
                  id: "workflow_pose_control",
                  icon: Hand,
                  label: "视频：姿态控制",
                  desc: "参考图 + 姿态视频驱动",
                  color: "text-rose-300",
                  bg: "bg-rose-500/10",
                  onClick: () => navigate("/app/pose-control-video"),
                },
              ],
            },
          ]
        : []),
    ];

    const query = leftSidebarQuery.trim().toLowerCase();
    const hasSidebarQuery = Boolean(query);
    const visibleSections = sections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => {
          if (!query) return true;
          return [item.label, item.desc, section.title].join(" ").toLowerCase().includes(query);
        }),
      }))
      .filter((section) => section.items.length > 0);

    return (
      <>
        {visibleSections.length === 0 && !isLeftSidebarCollapsed ? (
          <div className="rounded-md border border-slate-800/90 bg-slate-950/60 p-2.5 text-[11px] text-slate-400">
            未找到匹配项，请尝试其他关键词。
          </div>
        ) : (
          <div className={`flex flex-col space-y-2 ${isLeftSidebarCollapsed ? "items-center" : "items-stretch"}`}>
            {visibleSections.map((section, idx) => {
              const sectionOpen = isLeftSidebarCollapsed ? true : hasSidebarQuery ? true : !!leftSidebarSectionOpen[section.key];
              return (
                <div
                  key={section.key}
                  className={`flex w-full flex-col ${
                    isLeftSidebarCollapsed
                      ? `items-center ${idx === 0 ? "" : "border-t border-slate-800/70 pt-1.5"}`
                      : "items-stretch rounded-[20px] border border-slate-800/80 bg-[linear-gradient(180deg,rgba(7,10,18,0.72),rgba(2,6,23,0.4))] px-3 py-2.5"
                  }`}
                >
                  {!isLeftSidebarCollapsed && (
                    <SidebarSectionHeader
                      title={section.title}
                      open={sectionOpen}
                      onToggle={() => handleLeftSidebarSectionToggle(section.key)}
                    />
                  )}
                  {sectionOpen && (
                    <div className={isLeftSidebarCollapsed ? "flex w-full flex-col items-center space-y-1.5" : "mt-2 flex w-full flex-col space-y-2"}>
                      {section.items.map((item) => (
                        <SidebarBtn
                          key={item.id}
                          icon={item.icon}
                          label={item.label}
                          desc={item.desc}
                          color={item.color}
                          bg={item.bg}
                          active={activeSidebarItemKey === item.id}
                          compact={isLeftSidebarCollapsed}
                          expanded={isLeftSidebarCollapsed ? hoveredSidebarItemKey === item.id : true}
                          category={section.title}
                          onHoverChange={(isHovering, target) => {
                            if (!isLeftSidebarCollapsed) {
                              setHoveredSidebarItemKey("");
                              setHoveredSidebarPreview(null);
                              return;
                            }
                            setHoveredSidebarItemKey(isHovering ? item.id : "");
                            if (isHovering && target && workspaceShellRef.current) {
                              const itemRect = target.getBoundingClientRect();
                              const shellRect = workspaceShellRef.current.getBoundingClientRect();
                              setHoveredSidebarPreview({
                                ...item,
                                active: activeSidebarItemKey === item.id,
                                top: itemRect.top - shellRect.top + itemRect.height / 2,
                              });
                              return;
                            }
                            setHoveredSidebarPreview(null);
                          }}
                          onClick={() => {
                            setActiveSidebarItemKey(item.id);
                            safeInvoke(item.onClick, item.label || "侧栏操作");
                            onAction?.();
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </>
    );
  };

  const apiDebugItems = [
    { key: "memberInfo", label: "memberInfo" },
    { key: "userAuths", label: "userAuths" },
    { key: "modelParams", label: "modelParams(id=4)" },
    { key: "modelsLang", label: "models(part=1)" },
    { key: "modelsImage", label: "models(part=2)" },
    { key: "modelsVideo", label: "models(part=3)" },
    { key: "modelsVideoEnhance", label: "models(part=6)" },
    { key: "aiChatAnchor", label: "aiChatAnchor(module=3)" },
    { key: "aiChatLang", label: "aiChat(part=1 语言)" },
    { key: "aiChatImage", label: "aiChat(module=3 图片/视频)" },
  ];

  const getApiDebugStatusClass = (status) => {
    if (status === "success") return "text-emerald-300 border-emerald-700/60 bg-emerald-950/30";
    if (status === "loading") return "text-cyan-200 border-cyan-700/60 bg-cyan-950/30";
    if (status === "timeout" || status === "error" || status === "login_required") {
      return "text-rose-200 border-rose-700/60 bg-rose-950/30";
    }
    return "text-slate-300 border-slate-700/70 bg-slate-900/60";
  };

  return (
    <div className="h-screen w-screen bg-[var(--bf-bg)] text-[var(--bf-text)] overflow-hidden flex flex-col font-sans">
      <header className="relative h-[68px] bg-[var(--bf-panel-strong)] border-b border-[var(--bf-border)] flex items-center justify-between px-4 z-50 select-none shadow-[var(--bf-shadow-md)]">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),transparent_45%)]" />
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex flex-col min-w-0">
            <span className="truncate bg-[linear-gradient(135deg,rgba(248,250,252,0.94)_0%,rgba(203,213,225,0.86)_48%,rgba(148,163,184,0.72)_100%)] bg-clip-text text-[25px] font-normal leading-tight tracking-[0.10em] text-transparent [font-family:'STXingkai','Xingkai_SC','STKaiti','KaiTi','Georgia',serif] [text-shadow:0_0_14px_rgba(148,163,184,0.06)]">
              Yu Canvas
            </span>
            <span className="text-[10px] font-normal text-slate-400/90 tracking-[0.18em] truncate">AI小禹无限画布</span>
          </div>
        </div>

        <div className="relative flex items-center gap-2">
          {agentDevMode && (
            <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[10px] transition-colors ${
              apiStatus === "online"
                ? "text-emerald-200 border-emerald-500/20 bg-emerald-500/10"
                : "text-rose-200 border-rose-500/20 bg-rose-500/10"
            }`}>
              <Server className="w-3 h-3" /> {apiStatus === "online" ? "API Online" : "API Offline"}
            </div>
          )}

          <button
            onClick={() => setShowHistoryPanel(true)}
            className="inline-flex h-10 items-center gap-1.5 rounded-[18px] border border-slate-800/90 bg-[linear-gradient(145deg,rgba(5,5,7,0.98),rgba(12,12,16,0.96)_55%,rgba(8,8,11,0.98))] px-3.5 text-[11px] text-slate-300 shadow-[0_14px_28px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors hover:border-slate-700 hover:bg-slate-950 hover:text-white"
          >
            <History className="w-3 h-3" /> 历史
          </button>

          <button
            onClick={() => {
              setPreferencesPanelPrefill(null);
              setShowPreferencesPanel(true);
            }}
            className="inline-flex h-10 items-center gap-1.5 rounded-[18px] border border-slate-800/90 bg-[linear-gradient(145deg,rgba(5,5,7,0.98),rgba(12,12,16,0.96)_55%,rgba(8,8,11,0.98))] px-3.5 text-[11px] text-slate-300 shadow-[0_14px_28px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors hover:border-slate-700 hover:bg-slate-950 hover:text-white"
          >
            <Sliders className="w-3 h-3" /> 设置
          </button>

          <div className="flex overflow-hidden rounded-[20px] border border-slate-800/90 shadow-[0_16px_32px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,255,255,0.04)]">
            <button
              onClick={() => safeInvoke(handleRunClick, "运行工作流")}
              disabled={isRunning}
              className={`flex min-w-[118px] items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold transition-all ${
                isRunning
                  ? "cursor-not-allowed bg-slate-700 text-slate-300"
                  : "bg-[linear-gradient(180deg,rgba(28,28,32,0.98),rgba(10,10,12,0.98))] text-white hover:bg-[linear-gradient(180deg,rgba(36,36,40,0.98),rgba(12,12,14,0.98))]"
              }`}
            >
              {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} <span className="truncate max-w-[150px]">{isRunning ? loadingTip : "运行"}</span>
            </button>
            <div className="relative group">
              <button className="h-full border-l border-slate-800/90 bg-[linear-gradient(180deg,rgba(28,28,32,0.98),rgba(10,10,12,0.98))] px-3 hover:bg-[linear-gradient(180deg,rgba(36,36,40,0.98),rgba(12,12,14,0.98))]">
                <ChevronDown className="w-4 h-4 text-slate-200" />
              </button>
              <div className="absolute right-0 top-full z-50 mt-2 hidden w-36 overflow-hidden rounded-[20px] border border-slate-800/90 bg-[linear-gradient(145deg,rgba(5,5,7,0.98),rgba(12,12,16,0.98)_55%,rgba(8,8,11,0.98))] shadow-[0_18px_36px_rgba(0,0,0,0.42)] group-hover:block">
                <button onClick={() => setRunScope("all")} className={`w-full px-3 py-2 text-left text-xs hover:bg-white/6 ${runScope === "all" ? "text-slate-100" : "text-slate-300"}`}>运行全部</button>
                <button onClick={() => setRunScope("selected")} className={`w-full px-3 py-2 text-left text-xs hover:bg-white/6 ${runScope === "selected" ? "text-slate-100" : "text-slate-300"}`}>运行选中</button>
                <button onClick={() => setRunScope("selected_downstream")} className={`w-full px-3 py-2 text-left text-xs hover:bg-white/6 ${runScope === "selected_downstream" ? "text-slate-100" : "text-slate-300"}`}>选中 → 下游</button>
              </div>
            </div>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={toggleAgentHistoryPanel}
              title={agentHistoryCollapsed ? "展开对话（Ctrl+Shift+E）" : "收起对话（Ctrl+Shift+E）"}
              aria-label={agentHistoryCollapsed ? "展开对话（Ctrl+Shift+E）" : "收起对话（Ctrl+Shift+E）"}
              className={`inline-flex h-10 items-center gap-2 rounded-[18px] border px-3.5 text-[11px] transition-colors ${
                agentHistoryCollapsed
                  ? "border-slate-800/90 bg-[linear-gradient(145deg,rgba(5,5,7,0.98),rgba(12,12,16,0.96)_55%,rgba(8,8,11,0.98))] text-slate-200 hover:border-slate-700 hover:bg-slate-950 hover:text-white"
                  : "border-slate-700 bg-[linear-gradient(180deg,rgba(28,28,32,0.96),rgba(10,10,12,0.98))] text-white shadow-[0_10px_24px_rgba(0,0,0,0.26)]"
              }`}
            >
              <History className="w-3.5 h-3.5 text-yellow-400" />
              <span className="font-medium">对话流</span>
              <ChevronRight
                className={`w-3.5 h-3.5 transition-transform duration-300 ${
                  agentHistoryCollapsed ? "rotate-0" : "rotate-90"
                }`}
              />
            </button>

            {!agentHistoryCollapsed && (
              <div
                className="absolute right-0 top-full mt-3 z-[95] pointer-events-auto"
                style={rightPanelContainerStyle}
                onMouseDown={(e) => e.stopPropagation()}
                onWheel={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onMouseDown={handleRightPanelResizeStart}
                  className="absolute -left-2 top-0 bottom-0 w-2 rounded-md cursor-col-resize text-slate-700 hover:text-slate-300"
                  title="拖拽调整对话栏宽度"
                  aria-label="拖拽调整对话栏宽度"
                >
                  <GripVertical className="w-3.5 h-3.5 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
                </button>
                <div
                  className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] border border-slate-800/90 bg-[linear-gradient(145deg,rgba(5,5,7,0.98),rgba(12,12,16,0.96)_55%,rgba(8,8,11,0.98))]"
                  style={{ boxShadow: "0 24px 60px rgba(0,0,0,0.48), inset 0 1px 0 rgba(255,255,255,0.05)" }}
                >
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.03),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.008)_34%,transparent_100%)]" />
              <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-white/18" />
              <div className="relative flex h-[54px] shrink-0 items-center justify-between border-b border-white/10 bg-black/10 px-4">
                <div className="inline-flex min-w-0 items-center gap-1.5 text-xs">
                  <History className="w-3.5 h-3.5 text-yellow-400" />
                  <span className="font-medium truncate text-slate-200">对话流</span>
                </div>
                <div className="ml-auto flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={createAgentSession}
                    className="h-8 inline-flex items-center gap-1 px-2.5 rounded-full border border-white/10 bg-white/5 text-[11px] text-slate-200 hover:bg-white/8 hover:border-cyan-400/25 hover:text-white transition-colors"
                    title="新建会话"
                  >
                    <Plus className="w-3 h-3" />
                    新建
                  </button>
                  <button
                    type="button"
                    onClick={clearActiveAgentConversation}
                    disabled={!hasActiveAgentConversation || isAgentMissionRunning}
                    className={`h-8 inline-flex items-center gap-1 px-2.5 rounded-full border text-[11px] transition-colors ${
                      !hasActiveAgentConversation || isAgentMissionRunning
                        ? "border-white/5 bg-white/[0.03] text-slate-600 cursor-not-allowed"
                        : "border-white/10 bg-white/5 text-slate-300 hover:bg-rose-500/12 hover:border-rose-500/35 hover:text-rose-100"
                    }`}
                    title="清除当前会话对话记录"
                  >
                    <Trash2 className="w-3 h-3" />
                    清除
                  </button>
                  <button
                    type="button"
                    onClick={toggleAgentHistoryPanel}
                    title="收起对话（Ctrl+Shift+E）"
                    aria-label="收起对话（Ctrl+Shift+E）"
                    className="p-2 rounded-full border border-white/10 bg-white/5 text-slate-300 hover:bg-white/8 hover:border-cyan-400/25 hover:text-white transition-colors"
                  >
                    <ChevronRight className="w-3.5 h-3.5 rotate-90" />
                  </button>
                </div>
              </div>
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="relative shrink-0 border-b border-white/10 bg-black/10 p-3">
                  <select
                    value={activeAgentSession?.id || ""}
                    onChange={(e) => setActiveAgentSession(e.target.value)}
                    className="w-full rounded-[18px] border border-white/10 bg-black/20 px-3 py-2 text-[11px] text-slate-100 outline-none focus:border-cyan-400/35"
                  >
                    {agentSessions.map((session) => (
                      <option key={session.id} value={session.id}>
                        {session.title || "新会话"} ({(session.turns || []).length})
                      </option>
                    ))}
                  </select>
                </div>
                {minimizedAgentCards.length > 0 && (
                  <div className="relative shrink-0 space-y-2 border-b border-white/10 bg-black/10 p-3">
                    <div className="text-[10px] uppercase tracking-wider text-slate-400">已最小化结果</div>
                    {minimizedAgentCards.map((card) => {
                      const turn = agentTurns.find((item) => item.id === card.turnId);
                      if (!turn) return null;
                      return (
                        <button
                          key={card.id}
                          type="button"
                          onClick={() => focusAgentResultCard(turn.id)}
                          className="w-full rounded-[16px] border border-white/10 bg-white/5 px-3 py-2 text-left text-[11px] text-slate-200 hover:bg-white/8 hover:border-cyan-400/25 transition-colors"
                        >
                          恢复 · {turn.extractedProduct || "result"}
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className="relative min-h-0 flex-1 overflow-y-auto bg-black/10 p-3 space-y-3 custom-scrollbar">
                  {agentTurns.length === 0 && (
                    <div className="space-y-2 rounded-[20px] border border-white/10 bg-white/[0.04] px-3 py-3">
                      <div className="text-[11px] text-slate-400">暂无对话，先试一个 Mission 或快速打开模板。</div>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => void sendAgentMissionFromText("帮我设计一个洗面奶的爆款脚本")}
                          className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] text-slate-200 hover:bg-white/8 hover:border-cyan-400/25 hover:text-white transition-colors"
                        >
                          发送 Mission 示例
                        </button>
                        <button
                          type="button"
                          onClick={() => safeInvoke(createText2ImgTemplate, "打开文生图模板")}
                          className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] text-slate-200 hover:bg-white/8 hover:border-cyan-400/25 hover:text-white transition-colors"
                        >
                          打开模板
                        </button>
                      </div>
                    </div>
                  )}
                  {agentTurns.map((turn) => {
                    const relatedCard = agentResultCards.find((item) => item.turnId === turn.id);
                    const quickActions = Array.isArray(turn.quickActions) ? turn.quickActions : [];
                    const productChips = Array.isArray(turn.productChips) ? turn.productChips : [];
                    const memorySuggestions = Array.isArray(turn.memorySuggestions) ? turn.memorySuggestions : [];
                    const routeDebug = turn.routeDebug || null;
                    return (
                    <div key={turn.id} className="space-y-1.5">
                      {turn.userText ? (
                        <div className="flex justify-end">
                          <div className="max-w-[92%] space-y-1">
                            <div className="rounded-[20px] border border-cyan-400/20 bg-[linear-gradient(180deg,rgba(14,116,144,0.24),rgba(21,94,117,0.18))] px-3 py-2.5 text-[11px] text-slate-50 whitespace-pre-wrap break-words shadow-[0_10px_24px_rgba(8,145,178,0.12)]">
                              {turn.userText}
                            </div>
                            {agentDevMode && routeDebug && (
                              <div className="rounded-[16px] border border-amber-500/20 bg-amber-500/10 px-2.5 py-1.5 text-[10px] text-amber-100">
                                intent={routeDebug.intent || "-"} | product={routeDebug.product || "-"} | reason={routeDebug.reason || "-"} | backend_call={routeDebug.backendCalled ? "Y" : "N"}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : null}
                      <div className="flex justify-start">
                        <div className="max-w-[92%] rounded-[22px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(15,23,42,0.80))] px-3 py-2.5 text-[11px] text-slate-200 shadow-[0_10px_24px_rgba(2,6,23,0.22)]">
                          {turn.status === "running" && (
                            <div className="inline-flex items-center gap-1.5 text-slate-300">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              {AGENT_RUN_STEPS[Math.min(turn.stepIndex || 0, AGENT_RUN_STEPS.length - 1)]}
                            </div>
                          )}
                          {(turn.status === "assistant" || turn.status === "clarify") && (
                            <div className="space-y-1.5">
                              <div>{turn.assistantText || "你想做哪个产品/品类？"}</div>
                              {memorySuggestions.length > 0 && (
                                <div className="space-y-1.5">
                                  {memorySuggestions.map((suggestion) => (
                                    <PreferenceSuggestionCard
                                      key={`${turn.id}_${suggestion.id}`}
                                      suggestion={suggestion}
                                      disabled={
                                        savingSuggestionId === suggestion.id ||
                                        savingFeedbackTargetId === `suggest_${suggestion.id}`
                                      }
                                      onConfirm={() => handleSuggestionConfirm(turn.id, suggestion)}
                                      onIgnore={() => handleSuggestionIgnore(turn.id, suggestion)}
                                      onEdit={() => handleSuggestionEdit(suggestion)}
                                      showRegressionAction={HITL_FEEDBACK_UI_ENABLED}
                                      regressionTooltip="将该建议对应会话加入回归评估集，帮助后续质量修复"
                                      onMarkRegression={() => handleSuggestionMarkRegression(turn.id, suggestion)}
                                    />
                                  ))}
                                </div>
                              )}
                              {quickActions.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {quickActions.map((actionId) => {
                                    const action = AGENT_QUICK_ACTIONS.find((item) => item.id === actionId);
                                    if (!action) return null;
                                    return (
                                    <button
                                      key={`${turn.id}_${actionId}`}
                                      type="button"
                                      onClick={() => handleAgentQuickAction(actionId)}
                                        className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] text-slate-200 hover:bg-white/8 hover:border-cyan-400/25 hover:text-white transition-colors"
                                      >
                                        {action.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                              {turn.showCancelPending && (
                                <button
                                  type="button"
                                  onClick={() => handleAgentQuickAction("cancel_pending")}
                                  className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] text-slate-200 hover:bg-white/8 hover:border-cyan-400/25 hover:text-white transition-colors"
                                >
                                  取消
                                </button>
                              )}
                              {productChips.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {productChips.map((product) => (
                                    <button
                                      key={`${turn.id}_product_${product}`}
                                      type="button"
                                      onClick={() => handleAgentProductChip(product)}
                                      className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2.5 py-1.5 text-[10px] text-cyan-50 hover:bg-cyan-400/15"
                                    >
                                      {product}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                          {turn.status === "error" && (
                            <div className="space-y-1.5">
                              <div className="text-red-300">{turn.error || "请求失败"}</div>
                              <div className="flex flex-wrap gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => retryAgentTurn(turn.id)}
                                  className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] text-slate-200 hover:bg-white/8 hover:border-cyan-400/25 hover:text-white transition-colors"
                                >
                                  重试
                                </button>
                                {HITL_FEEDBACK_UI_ENABLED && (
                                  <button
                                    type="button"
                                    onClick={() => handleTurnMarkRegression(turn)}
                                    disabled={savingFeedbackTargetId === `turn_${turn.id}`}
                                    title="将当前会话标记为回归用例，进入评估集用于后续改进"
                                    className={`rounded-full border px-2.5 py-1.5 text-[10px] ${
                                      savingFeedbackTargetId === `turn_${turn.id}`
                                        ? "bg-white/[0.04] border-white/5 text-slate-500 cursor-not-allowed"
                                        : "bg-fuchsia-600/20 border-fuchsia-500/60 text-fuchsia-100 hover:bg-fuchsia-600/30"
                                    }`}
                                  >
                                    标记为回归用例
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                          {turn.status === "done" && (
                            <div className="space-y-1.5">
                              <div className="text-slate-300">
                                已生成 {(turn.response?.topics || []).length} 个 topic / {(turn.response?.edit_plans || []).length} 个 plan
                              </div>
                              <div className="flex gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => focusAgentResultCard(turn.id)}
                                  className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] text-slate-200 hover:bg-white/8 hover:border-cyan-400/25 hover:text-white transition-colors"
                                >
                                  {relatedCard?.minimized ? "恢复结果卡片" : "定位结果卡片"}
                                </button>
                                {relatedCard && !relatedCard.minimized && (
                                  <button
                                    type="button"
                                    onClick={() => minimizeAgentResultCard(relatedCard.id)}
                                    className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] text-slate-200 hover:bg-white/8 hover:border-cyan-400/25 hover:text-white transition-colors"
                                  >
                                    最小化到对话流
                                  </button>
                                )}
                                {HITL_FEEDBACK_UI_ENABLED && (
                                  <button
                                    type="button"
                                    onClick={() => handleTurnMarkRegression(turn)}
                                    disabled={savingFeedbackTargetId === `turn_${turn.id}`}
                                    title="将当前会话标记为回归用例，进入评估集用于后续改进"
                                    className={`rounded-full border px-2.5 py-1.5 text-[10px] ${
                                      savingFeedbackTargetId === `turn_${turn.id}`
                                        ? "bg-white/[0.04] border-white/5 text-slate-500 cursor-not-allowed"
                                        : "bg-fuchsia-600/20 border-fuchsia-500/60 text-fuchsia-100 hover:bg-fuchsia-600/30"
                                    }`}
                                  >
                                    标记为回归用例
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )})}
                  <div ref={agentConversationBottomRef} />
                </div>
              </div>
            </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Toast */}
      {runToast && (
        <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-lg shadow-2xl border flex items-center gap-2 animate-in slide-in-from-top-5 duration-300 ${runToast.type === "error" ? "bg-red-950/90 border-red-800 text-red-200" : "bg-slate-800/90 border-slate-600 text-white"}`}>
          {runToast.type === "error" ? <AlertCircle className="w-4 h-4" /> : <Activity className="w-4 h-4 text-purple-400" />}
          <span className="text-xs font-medium">{runToast.message}</span>
          {typeof runToast.onAction === "function" && runToast.actionLabel && (
            <button
              type="button"
              onClick={() => {
                runToast.onAction();
                setRunToast(null);
              }}
              className="ml-1 px-1.5 py-0.5 rounded border border-cyan-500/60 text-cyan-100 text-[10px] hover:bg-cyan-600/20"
            >
              {runToast.actionLabel}
            </button>
          )}
          <button
            type="button"
            onClick={() => setRunToast(null)}
            className="ml-1 text-slate-400 hover:text-white"
            aria-label="关闭通知"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {agentDevMode ? (
        <div className="fixed right-4 bottom-4 z-[92] w-[320px] max-w-[calc(100vw-1rem)] overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(145deg,rgba(9,15,28,0.96),rgba(14,25,45,0.90)_55%,rgba(10,18,34,0.94))] shadow-[0_24px_60px_rgba(2,6,23,0.45),inset_0_1px_0_rgba(255,255,255,0.14)]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.14),transparent_26%),radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_35%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01)_34%,transparent_100%)]" />
          <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-white/18" />
          <button
            type="button"
            onClick={() => setApiDebugOpen((prev) => !prev)}
            className="relative flex w-full items-center justify-between border-b border-white/10 px-4 py-3 text-left"
          >
            <span className="text-xs font-semibold text-slate-100">新接口状态</span>
            <span className="text-[10px] text-slate-400">{apiDebugOpen ? "收起" : "展开"}</span>
          </button>
          {apiDebugOpen ? (
            <div className="relative space-y-2 p-3">
              {apiDebugItems.map((item) => {
                const state = apiDebugStatus[item.key] || { status: "idle", message: "", detail: "", updatedAt: 0 };
                return (
                  <div key={item.key} className={`rounded-[18px] border px-3 py-2 ${getApiDebugStatusClass(state.status)}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold truncate">{item.label}</span>
                      <span className="text-[10px] opacity-90">{API_DEBUG_STATUS_LABEL[state.status] || state.status}</span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="text-[10px] opacity-85 truncate">{state.message || "--"}</span>
                      <span className="text-[10px] opacity-70 shrink-0">{formatDebugTime(state.updatedAt)}</span>
                    </div>
                    {API_DEBUG_DETAIL_KEYS.has(item.key) && state.detail ? (
                      <details className="mt-1.5 rounded-[14px] border border-white/10 bg-black/10">
                        <summary className="cursor-pointer list-none px-2 py-1.5 text-[9px] text-slate-200/85 [&::-webkit-details-marker]:hidden">
                          查看详细信息
                        </summary>
                        <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all border-t border-white/10 px-2 py-1.5 text-[9px] leading-4 text-slate-100/90">
                          {state.detail}
                        </pre>
                      </details>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      <div ref={workspaceShellRef} className="flex-1 flex relative min-h-0 overflow-hidden">
        {/* Sidebar */}
        <div className="relative z-40 my-4 flex h-[calc(100%-2rem)] shrink-0 flex-col justify-between self-start">
          <div
            className={`flex min-h-0 flex-1 flex-col items-center self-start px-2 py-3 select-none`}
            style={{ WebkitOverflowScrolling: "touch", width: leftSidebarWidth }}
          >
            {!isLeftSidebarCollapsed && (
              <div className="mb-3 w-full">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                  <input
                    value={leftSidebarQuery}
                    onChange={(e) => setLeftSidebarQuery(e.target.value)}
                    placeholder="搜索节点 / 技能 / 工作流"
                    className="h-9 w-full rounded-md border border-slate-800/90 bg-slate-950/70 pl-8 pr-2.5 text-[11px] text-slate-200 placeholder:text-slate-500 outline-none focus:border-yellow-500/40"
                  />
                </div>
              </div>
            )}
            <div className="min-h-0 w-full flex-1 overflow-y-auto overflow-x-visible custom-scrollbar [scrollbar-gutter:stable] overscroll-contain">
              {!isLeftSidebarCollapsed && <div className="mb-2.5 h-px w-full bg-gradient-to-r from-slate-500/40 via-slate-700/20 to-transparent" />}
              {renderSidebarContent()}
            </div>
            <div className="mt-3 w-full">
              <button
                type="button"
                onClick={() => setLeftSidebarCollapsed((prev) => !prev)}
                title={isLeftSidebarCollapsed ? "展开左侧菜单" : "收起左侧菜单"}
                aria-label={isLeftSidebarCollapsed ? "展开左侧菜单" : "收起左侧菜单"}
                className={`flex items-center justify-center rounded-xl border border-slate-700/80 bg-slate-950/95 text-slate-300 shadow-[0_10px_28px_rgba(0,0,0,0.28)] transition-colors hover:border-cyan-400/35 hover:bg-slate-900 hover:text-white ${
                  isLeftSidebarCollapsed ? "mx-auto h-9 w-9" : "h-10 w-full gap-2 text-[11px]"
                }`}
              >
                {isLeftSidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                {!isLeftSidebarCollapsed && <span>{isLeftSidebarCollapsed ? "展开左侧菜单" : "收起组件列表"}</span>}
              </button>
            </div>
          </div>
          <div className="mt-3 shrink-0 p-2" style={{ width: leftSidebarWidth }}>
            {isLeftSidebarCollapsed ? (
              <details className="relative group">
                <summary
                  className="list-none mx-auto flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-slate-700/90 bg-slate-900/80 text-slate-200 hover:border-yellow-500/35 hover:text-yellow-100 [&::-webkit-details-marker]:hidden"
                  title={memberLabel}
                >
                  {memberAvatar ? (
                    <img src={memberAvatar} alt={memberLabel} className="h-full w-full rounded-xl object-cover" />
                  ) : (
                    <span className="text-xs font-semibold">{String(memberLabel || "G").slice(0, 1).toUpperCase()}</span>
                  )}
                </summary>
                <div className="absolute bottom-full left-0 mb-2 w-56 rounded-xl border border-slate-700/90 bg-slate-900/98 p-3 shadow-2xl z-[70]">
                  <div className="flex items-center gap-3">
                    <div className="h-11 w-11 overflow-hidden rounded-xl border border-slate-700/90 bg-slate-800/90">
                      {memberAvatar ? (
                        <img src={memberAvatar} alt={memberLabel} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-slate-200">
                          {String(memberLabel || "G").slice(0, 1).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-slate-100">{memberLabel}</div>
                      <div className="text-[10px] text-slate-400">
                        {memberInfoLoginUrl ? "会员未登录" : "会员信息"}
                      </div>
                      <div className="mt-1">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-[9px] ${
                            userAuthsLoading
                              ? "border-slate-700/80 bg-slate-900/70 text-slate-400"
                              : isAdminUser
                              ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-100"
                              : "border-slate-700/80 bg-slate-900/70 text-slate-400"
                          }`}
                        >
                          {userAuthsLoading ? "权限加载中" : isAdminUser ? "管理员" : "普通成员"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-slate-800/90 bg-slate-950/80 px-2 py-1.5">
                      <div className="text-[10px] text-slate-500">当前积分</div>
                      <div className="mt-0.5 text-xs font-semibold text-yellow-200">{formatMemberPoints(memberPoint)}</div>
                    </div>
                    <div className="rounded-lg border border-slate-800/90 bg-slate-950/80 px-2 py-1.5">
                      <div className="text-[10px] text-slate-500">累计积分</div>
                      <div className="mt-0.5 text-xs font-semibold text-emerald-200">{formatMemberPoints(memberTotalPoint)}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => logout(true)}
                    className="mt-3 w-full rounded-lg border border-slate-700/90 bg-slate-900/80 px-3 py-2 text-left text-[11px] text-slate-200 hover:border-rose-500/35 hover:bg-rose-500/10 hover:text-rose-100"
                  >
                    退出登录
                  </button>
                  {memberInfoLoginUrl ? (
                    <button
                      type="button"
                      onClick={() => navigateToMemberLogin(memberInfoLoginUrl)}
                      className="mt-2 w-full rounded-lg border border-cyan-700/70 bg-cyan-950/40 px-3 py-2 text-left text-[11px] text-cyan-100 hover:border-cyan-500/60 hover:bg-cyan-900/40"
                    >
                      前往会员登录
                    </button>
                  ) : null}
                </div>
              </details>
            ) : (
              <div className="rounded-2xl border border-slate-800/90 bg-slate-950/75 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 overflow-hidden rounded-2xl border border-slate-700/90 bg-slate-800/90">
                    {memberAvatar ? (
                      <img src={memberAvatar} alt={memberLabel} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-slate-200">
                        {String(memberLabel || "G").slice(0, 1).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-100">{memberLabel}</div>
                    <div className="truncate text-[10px] text-slate-400">
                      {memberInfoLoginUrl ? "会员未登录" : user?.email || "会员信息"}
                    </div>
                    <div className="mt-1">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[9px] ${
                          userAuthsLoading
                            ? "border-slate-700/80 bg-slate-900/70 text-slate-400"
                            : isAdminUser
                            ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-100"
                            : "border-slate-700/80 bg-slate-900/70 text-slate-400"
                        }`}
                      >
                        {userAuthsLoading ? "权限加载中" : isAdminUser ? "管理员" : "普通成员"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-slate-800/90 bg-slate-900/75 px-2.5 py-2">
                    <div className="text-[10px] text-slate-500">当前积分</div>
                    <div className="mt-1 text-sm font-semibold text-yellow-200">{formatMemberPoints(memberPoint)}</div>
                  </div>
                  <div className="rounded-xl border border-slate-800/90 bg-slate-900/75 px-2.5 py-2">
                    <div className="text-[10px] text-slate-500">累计积分</div>
                    <div className="mt-1 text-sm font-semibold text-emerald-200">{formatMemberPoints(memberTotalPoint)}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => logout(true)}
                  className="mt-3 w-full rounded-xl border border-slate-700/90 bg-slate-900/80 px-3 py-2 text-[11px] text-slate-200 hover:border-rose-500/35 hover:bg-rose-500/10 hover:text-rose-100 transition-colors"
                >
                  退出登录
                </button>
                {memberInfoLoginUrl ? (
                  <button
                    type="button"
                    onClick={() => navigateToMemberLogin(memberInfoLoginUrl)}
                    className="mt-2 w-full rounded-xl border border-cyan-700/70 bg-cyan-950/40 px-3 py-2 text-[11px] text-cyan-100 hover:border-cyan-500/60 hover:bg-cyan-900/40 transition-colors"
                  >
                    前往会员登录
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </div>

        {isLeftSidebarCollapsed && hoveredSidebarPreview ? (
          <div
            className="pointer-events-none absolute z-[55] w-72 -translate-y-1/2 rounded-2xl border border-slate-800/90 bg-[linear-gradient(180deg,rgba(5,5,7,0.98),rgba(12,12,16,0.94))] px-3.5 py-3.5 text-left shadow-2xl"
            style={{ left: leftSidebarWidth + 6, top: hoveredSidebarPreview.top }}
          >
            <div className="absolute left-[-6px] top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 border-l border-t border-slate-800/90 bg-[#070709]" />
            <div className="flex items-start gap-3">
              <div
                className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${hoveredSidebarPreview.bg} ${hoveredSidebarPreview.color} ring-1 ${
                  hoveredSidebarPreview.active ? "ring-cyan-400/35" : "ring-slate-700/70"
                }`}
              >
                {hoveredSidebarPreview.icon
                  ? React.createElement(hoveredSidebarPreview.icon, { className: "w-4 h-4" })
                  : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className={`text-[13px] font-medium leading-5 ${hoveredSidebarPreview.active ? "text-white" : "text-slate-100"}`}>
                  {hoveredSidebarPreview.label}
                </div>
                <div className="mt-1.5 text-[11px] leading-5 text-slate-400 whitespace-normal break-words">
                  {hoveredSidebarPreview.desc}
                </div>
                <div className="mt-2 text-[10px] text-slate-500">点击后会直接创建对应组件或进入对应工作流。</div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Canvas */}
        <div
          ref={canvasRef}
          className="flex-1 relative overflow-hidden bg-[#020203]"
          style={{ cursor: getCursor() }}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
          onDragEnter={handleCanvasDragEnter}
          onDragOver={handleCanvasDragOver}
          onDragLeave={handleCanvasDragLeave}
          onDrop={handleCanvasDrop}
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              opacity: 0.05,
              backgroundImage: "linear-gradient(rgba(148,163,184,0.95) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.95) 1px, transparent 1px)",
              backgroundSize: `${GRID_SIZE * viewport.zoom}px ${GRID_SIZE * viewport.zoom}px`,
              backgroundPosition: `${viewport.x}px ${viewport.y}px`,
            }}
          />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              opacity: 0.08,
              backgroundImage: "linear-gradient(rgba(100,116,139,0.95) 1px, transparent 1px), linear-gradient(90deg, rgba(100,116,139,0.95) 1px, transparent 1px)",
              backgroundSize: `${GRID_SIZE * 4 * viewport.zoom}px ${GRID_SIZE * 4 * viewport.zoom}px`,
              backgroundPosition: `${viewport.x}px ${viewport.y}px`,
            }}
          />
          <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at center, rgba(2,6,23,0) 46%, rgba(2,6,23,0.34) 84%, rgba(2,6,23,0.56) 100%)" }} />

          {canvasDropActive ? (
            <div className="pointer-events-none absolute inset-6 z-20 rounded-[32px] border border-cyan-500/40 bg-cyan-500/8 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.18)] backdrop-blur-[1px]">
              <div className="absolute inset-x-8 top-28 rounded-[24px] border border-dashed border-cyan-400/35 bg-slate-950/55 px-6 py-4 text-center shadow-[0_18px_48px_rgba(8,145,178,0.12)]">
                <div className="text-sm font-medium text-cyan-100">拖到这里创建图片/视频编辑区</div>
                <div className="mt-1 text-xs text-slate-300">落下后会在当前位置生成一个小型编辑卡片，图片可继续三视图、图生图、去水印，视频可直接一键接入视频超清。</div>
              </div>
            </div>
          ) : null}

          {nodes.length === 0 && !hasAgentResultCards ? (
            <div className="absolute inset-x-0 top-6 z-20 flex justify-center px-6 pointer-events-none">
              <div
                className="pointer-events-auto flex w-full max-w-4xl items-center justify-center gap-3 px-2 py-2"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => safeInvoke(createText2ImgTemplate, "打开文生图模板")}
                  className="group flex min-w-[170px] items-center gap-3 rounded-[20px] border border-slate-800/80 bg-[linear-gradient(180deg,rgba(12,12,16,0.82),rgba(5,5,7,0.72))] px-4 py-3 text-left shadow-[0_12px_28px_rgba(0,0,0,0.28)] backdrop-blur-md transition-all hover:-translate-y-0.5 hover:border-slate-700 hover:bg-black"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-white/[0.03] ring-1 ring-white/5 transition-colors group-hover:bg-white/[0.05]">
                    <Wand2 className="h-5 w-5 text-slate-200" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-100">文生图</div>
                    <div className="mt-0.5 text-[11px] leading-5 text-slate-500">从文字快速起图</div>
                  </div>
                </button>

                <button
                  onClick={() => safeInvoke(createImg2ImgTemplate, "打开图生图模板")}
                  className="group flex min-w-[170px] items-center gap-3 rounded-[20px] border border-slate-800/80 bg-[linear-gradient(180deg,rgba(12,12,16,0.82),rgba(5,5,7,0.72))] px-4 py-3 text-left shadow-[0_12px_28px_rgba(0,0,0,0.28)] backdrop-blur-md transition-all hover:-translate-y-0.5 hover:border-slate-700 hover:bg-black"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-white/[0.03] ring-1 ring-white/5 transition-colors group-hover:bg-white/[0.05]">
                    <Images className="h-5 w-5 text-slate-200" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-100">图生图</div>
                    <div className="mt-0.5 text-[11px] leading-5 text-slate-500">基于现有素材重绘</div>
                  </div>
                </button>

                <button
                  onClick={() => safeInvoke(createImg2VideoTemplate, "打开图生视频模板")}
                  className="group flex min-w-[170px] items-center gap-3 rounded-[20px] border border-slate-800/80 bg-[linear-gradient(180deg,rgba(12,12,16,0.82),rgba(5,5,7,0.72))] px-4 py-3 text-left shadow-[0_12px_28px_rgba(0,0,0,0.28)] backdrop-blur-md transition-all hover:-translate-y-0.5 hover:border-slate-700 hover:bg-black"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-white/[0.03] ring-1 ring-white/5 transition-colors group-hover:bg-white/[0.05]">
                    <Clapperboard className="h-5 w-5 text-slate-200" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-100">图生视频</div>
                    <div className="mt-0.5 text-[11px] leading-5 text-slate-500">从单图生成视频流程</div>
                  </div>
                </button>

                <button
                  onClick={() => safeInvoke(createVideoUpscaleTemplate, "打开视频超清模板")}
                  className="group flex min-w-[170px] items-center gap-3 rounded-[20px] border border-slate-800/80 bg-[linear-gradient(180deg,rgba(12,12,16,0.82),rgba(5,5,7,0.72))] px-4 py-3 text-left shadow-[0_12px_28px_rgba(0,0,0,0.28)] backdrop-blur-md transition-all hover:-translate-y-0.5 hover:border-slate-700 hover:bg-black"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-white/[0.03] ring-1 ring-white/5 transition-colors group-hover:bg-white/[0.05]">
                    <TrendingUp className="h-5 w-5 text-slate-200" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-100">视频超清</div>
                    <div className="mt-0.5 text-[11px] leading-5 text-slate-500">上传视频后直接做画质增强</div>
                  </div>
                </button>
              </div>
            </div>
          ) : null}

          {nodes.length === 0 && !hasAgentResultCards && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <div
                className="pointer-events-auto relative max-w-xl overflow-hidden rounded-[32px] border border-slate-800/90 bg-[linear-gradient(145deg,rgba(5,5,7,0.98),rgba(12,12,16,0.96)_55%,rgba(8,8,11,0.98))] px-8 py-8 text-center shadow-[0_24px_60px_rgba(0,0,0,0.48),inset_0_1px_0_rgba(255,255,255,0.05)]"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.03),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.008)_34%,transparent_100%)]" />
                <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-white/18" />
                <div className="relative">
                  <div className="mx-auto mb-6 flex w-fit items-center gap-4 rounded-[28px] border border-slate-800/80 bg-[linear-gradient(180deg,rgba(10,16,28,0.94),rgba(5,8,16,0.88))] px-5 py-4 shadow-[0_18px_38px_rgba(2,6,23,0.34)]">
                    <div className="flex h-16 w-16 items-center justify-center rounded-[20px] border border-cyan-500/20 bg-cyan-500/10">
                      <MousePointer2 className="h-7 w-7 text-cyan-200" />
                    </div>
                    <div className="flex flex-col items-center gap-2">
                      <ArrowRight className="h-4 w-4 text-slate-500" />
                      <div className="h-1 w-12 rounded-full bg-[linear-gradient(90deg,rgba(34,211,238,0),rgba(34,211,238,0.75),rgba(34,211,238,0))]" />
                    </div>
                    <div className="relative flex h-20 w-28 items-center justify-center rounded-[22px] border border-dashed border-cyan-400/35 bg-[linear-gradient(180deg,rgba(8,15,28,0.84),rgba(4,8,18,0.72))]">
                      <div className="absolute inset-2 rounded-[16px] border border-white/5" />
                      <Upload className="h-7 w-7 text-cyan-200" />
                      <div className="absolute bottom-2 text-[9px] tracking-[0.18em] text-cyan-100/75">CANVAS</div>
                    </div>
                  </div>
                  <p className="mx-auto max-w-md text-sm leading-6 text-slate-300">
                    将图片拖拽到画布中，即可开始快捷编辑。
                  </p>
                  <div className="mt-3 text-[11px] leading-6 text-slate-500">
                    支持一键三视图、图生图、去水印、图生视频。
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="absolute bottom-6 left-6 z-50 flex gap-2 select-none">
            <div className="relative flex items-center rounded-[16px] border border-slate-800/90 bg-[linear-gradient(145deg,rgba(5,5,7,0.98),rgba(12,12,16,0.96)_55%,rgba(8,8,11,0.98))] p-0.5 shadow-[0_18px_36px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,255,255,0.05)] text-slate-400">
              <div className="pointer-events-none absolute inset-0 rounded-[16px] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.008)_34%,transparent_100%)]" />
              <button onClick={() => zoomCanvas(-0.2)} className="relative rounded-[12px] p-1.5 transition-colors hover:bg-white/8 hover:text-slate-100"><Minus className="w-3 h-3" /></button>
              <span className="relative w-9 text-center text-[10px] font-mono text-slate-300">{Math.round(viewport.zoom * 100)}%</span>
              <button onClick={() => zoomCanvas(0.2)} className="relative rounded-[12px] p-1.5 transition-colors hover:bg-white/8 hover:text-slate-100"><Plus className="w-3 h-3" /></button>
            </div>
            <button onClick={() => setViewport({ x: 0, y: 0, zoom: 1 })} className="relative rounded-[16px] border border-slate-800/90 bg-[linear-gradient(145deg,rgba(5,5,7,0.98),rgba(12,12,16,0.96)_55%,rgba(8,8,11,0.98))] p-2 text-slate-400 shadow-[0_18px_36px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,255,255,0.05)] transition-colors hover:bg-slate-950 hover:text-slate-100" title="Reset View">
              <Maximize className="w-3 h-3" />
            </button>
          </div>

          <div className="absolute inset-0 origin-top-left" style={{ transform: `translate(${viewport.x}px,${viewport.y}px) scale(${viewport.zoom})` }}>
            <svg className="absolute inset-0 overflow-visible pointer-events-none" style={{ width: 1, height: 1 }}>
              {renderConnections()}
              {renderTempConnection()}
            </svg>

            {nodes.map((n) => (
              <NodeComponent
                key={n.id}
                node={n}
                selected={selectedNodeIds.has(n.id)}
                onMouseDown={(e) => handleNodeMouseDown(e, n.id)}
                updateData={updateNodeData}
                onDelete={() => deleteNode(n.id)}
                onConnectStart={(e) => {
                  e.stopPropagation();
                  pushHistory();
                  startConnection(e, n.id);
                }}
                onConnectEnd={(e) => {
                  e.stopPropagation();
                  pushHistory();
                  completeConnection(e, n.id);
                }}
                onPreview={setPreviewImage}
                onContinue={createConnectedVideoNode}
                onRetry={() => executeFlow(new Set([n.id]))}
                isReady={checkNodeReady(n, nodes, connections)}
                onSelectArtifact={setActiveArtifact} // ✅ 修复：现在生效
                activeArtifact={activeArtifact}
                onIterateImg2Img={createConnectedImg2ImgBranch}
                onRunCompactRemoveWatermark={runCompactRemoveWatermark}
                onRunCompactThreeView={runCompactThreeView}
                onRunCompactVideoUpscale={runCompactVideoUpscale}
              />
            ))}

            {selectionBox && (
              <div
                className="absolute border border-blue-500 bg-blue-500/20 pointer-events-none z-50"
                style={{
                  left: Math.min(selectionBox.startX, selectionBox.curX),
                  top: Math.min(selectionBox.startY, selectionBox.curY),
                  width: Math.abs(selectionBox.curX - selectionBox.startX),
                  height: Math.abs(selectionBox.curY - selectionBox.startY),
                }}
              />
            )}

            {agentResultCards.map((card) => {
              const turn = agentTurns.find((item) => item.id === card.turnId);
              if (!turn || card.minimized) return null;
              const statusText =
                turn.status === "done"
                  ? "completed"
                  : turn.status === "running"
                  ? "running"
                  : turn.status === "error"
                  ? "error"
                  : turn.status === "clarify"
                  ? "clarify"
                  : turn.status;
              return (
                <div
                  key={card.id}
                  className={`absolute rounded-xl border bg-slate-900/95 shadow-2xl overflow-hidden ${
                    selectedAgentCardIds.has(card.id)
                      ? "border-cyan-400/70 ring-1 ring-cyan-400/45"
                      : activeAgentCardId === card.id
                      ? "border-violet-400/70 ring-1 ring-violet-400/50"
                      : "border-slate-700"
                  }`}
                  style={{ left: card.x, top: card.y, width: card.w, zIndex: activeAgentCardId === card.id ? 85 : 70 }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    if (e.shiftKey || e.ctrlKey) {
                      setSelectedAgentCardIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(card.id)) next.delete(card.id);
                        else next.add(card.id);
                        return next;
                      });
                    } else if (!selectedAgentCardIds.has(card.id)) {
                      setSelectedAgentCardIds(new Set([card.id]));
                    }
                    setActiveAgentCardId(card.id);
                  }}
                >
                  <div className="h-9 px-2.5 border-b border-slate-800 bg-slate-800/90 flex items-center gap-2">
                    <div
                      className="flex-1 min-w-0 flex items-center justify-between cursor-move"
                      onMouseDown={(e) => handleAgentCardMouseDown(e, card.id)}
                    >
                      <div className="text-[11px] font-semibold text-slate-200 truncate">
                        Agent Result · {turn?.extractedProduct || "unknown"}
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded border border-slate-600 text-slate-300 ml-2">
                        {statusText}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="p-1 rounded hover:bg-slate-700 text-slate-300"
                      title={card.collapsed ? "展开" : "折叠"}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleAgentResultCardCollapsed(card.id);
                      }}
                    >
                      {card.collapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      className="p-1 rounded hover:bg-slate-700 text-slate-300"
                      title="最小化到对话流"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        minimizeAgentResultCard(card.id);
                      }}
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {!card.collapsed && (
                    <div className="p-2.5 max-h-[62vh] overflow-y-auto custom-scrollbar" onMouseDown={(e) => e.stopPropagation()}>
                      <div className="mb-2 text-[11px] text-slate-400 whitespace-pre-wrap break-words">
                        Mission: {turn?.userText || "-"}
                      </div>
                      <AgentResultCardContent
                        turn={turn}
                        onRetry={retryAgentTurn}
                        onSelectPrimary={selectPrimaryAssetForShot}
                        onExport={exportAgentPlan}
                        onCopyPath={copyRenderScriptPath}
                      />
                    </div>
                  )}
                  {card.collapsed && (
                    <div className="px-2.5 py-2 text-[11px] text-slate-400">
                      已折叠，点击上方按钮可展开。
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div
            ref={agentComposerRef}
            className={`absolute left-1/2 -translate-x-1/2 bottom-10 z-40 pointer-events-auto transition-all duration-200 ${
              agentInputFocused || agentInput.trim()
                ? "w-[min(100%-2rem,860px)]"
                : "w-[min(100%-2rem,680px)]"
            }`}
            onMouseDown={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
          >
            {showScriptExamples || showCanvasExamples ? (
              <div className="absolute bottom-[calc(100%+1rem)] left-1/2 z-30 w-[min(92vw,760px)] -translate-x-1/2">
                <div className="relative overflow-hidden rounded-[28px] border border-cyan-500/20 bg-[linear-gradient(145deg,rgba(4,10,20,0.98),rgba(8,18,30,0.96)_58%,rgba(4,8,16,0.98))] shadow-[0_24px_64px_rgba(2,8,23,0.56)]">
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.08),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01)_36%,transparent_100%)]" />
                  <div className="relative border-b border-white/8 px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[15px] font-semibold text-cyan-100">{showScriptExamples ? "生成脚本案例" : "画布编排案例"}</div>
                        <div className="mt-1 text-[12px] leading-5 text-slate-400">
                          {showScriptExamples
                            ? "选择一条常用脚本需求，直接填入 Agent 输入框继续生成脚本。"
                            : "选择一条常用案例，直接填入 Agent 输入框继续生成画布。"}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setShowScriptExamples(false);
                          setShowCanvasExamples(false);
                        }}
                        className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-white"
                        aria-label={showScriptExamples ? "关闭生成脚本案例" : "关闭画布编排案例"}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="relative grid gap-3 p-4 md:grid-cols-2">
                    {(showScriptExamples ? AGENT_SCRIPT_EXAMPLES : AGENT_CANVAS_EXAMPLES).map((example, index) => (
                      <button
                        key={example}
                        type="button"
                        onClick={() => (showScriptExamples ? handleScriptExamplePick(example) : handleCanvasExamplePick(example))}
                        className="flex min-h-[84px] items-start gap-3 rounded-[22px] border border-slate-800/80 bg-white/[0.03] px-4 py-3 text-left transition-colors hover:border-cyan-500/35 hover:bg-cyan-500/8"
                      >
                        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-500/12 text-[11px] font-semibold text-cyan-100">
                          {index + 1}
                        </span>
                        <span className="text-[13px] leading-6 text-slate-200 whitespace-normal break-words">{example}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
            <div
              className={`relative overflow-hidden border border-slate-800/90 bg-[linear-gradient(145deg,rgba(5,5,7,0.98),rgba(12,12,16,0.96)_55%,rgba(8,8,11,0.98))] shadow-[0_24px_60px_rgba(0,0,0,0.48),inset_0_1px_0_rgba(255,255,255,0.05)] transition-all duration-200 ${
                agentInputFocused || agentInput.trim()
                  ? "rounded-[32px] px-5 py-5"
                  : "rounded-[40px] px-4 py-3"
              }`}
            >
              <input
                ref={agentUploadInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleAgentComposerUpload}
              />
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.03),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.008)_34%,transparent_100%)]" />
              <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-white/18" />
              <div className="relative flex gap-4">
                <button
                  type="button"
                  title="上传参考图片"
                  onClick={() => agentUploadInputRef.current?.click()}
                  className={`mt-1 flex shrink-0 items-center justify-center rounded-[20px] border border-slate-800/90 bg-[linear-gradient(180deg,rgba(26,26,30,0.96),rgba(10,10,12,0.98))] text-slate-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all disabled:cursor-not-allowed disabled:opacity-90 ${
                    agentInputFocused || agentInput.trim() ? "h-[84px] w-[68px] -rotate-6" : "h-8 w-8 -rotate-[8deg] rounded-[12px]"
                  }`}
                >
                  <Plus className={`${agentInputFocused || agentInput.trim() ? "h-5 w-5" : "h-4 w-4"}`} />
                </button>
                <div className="relative min-w-0 flex-1 pr-16">
                  <textarea
                    ref={agentInputRef}
                    value={agentInput}
                    onChange={(e) => setAgentInput(e.target.value)}
                    onFocus={() => setAgentInputFocused(true)}
                    onMouseDown={() => setAgentInputFocused(true)}
                    rows={1}
                    placeholder="输入你的需求，让 Agent 帮你生成脚本、分镜、成片方案或渲染包。"
                    className={`w-full resize-none overflow-y-auto bg-transparent text-[15px] leading-7 text-slate-100 outline-none placeholder:text-slate-500 ${
                      agentInputFocused || agentInput.trim() ? "min-h-[120px]" : "h-9 min-h-9 pt-[2px] text-[14px] leading-8"
                    }`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendAgentMission();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={sendAgentMission}
                    disabled={(!agentInput.trim() && agentComposerFiles.length === 0) || isAgentMissionRunning}
                    className={`absolute bottom-0 right-0 flex h-12 w-12 items-center justify-center rounded-full border transition-all ${
                      ((!agentInput.trim() && agentComposerFiles.length === 0) || isAgentMissionRunning)
                        ? "cursor-not-allowed border-slate-800/90 bg-[linear-gradient(180deg,rgba(32,32,36,0.92),rgba(10,10,12,0.98))] text-slate-500"
                        : "border-slate-700 bg-[linear-gradient(180deg,rgba(36,36,40,0.96),rgba(8,8,10,0.98))] text-white shadow-[0_10px_24px_rgba(0,0,0,0.34)] hover:translate-y-[-1px]"
                    } ${agentInputFocused || agentInput.trim() ? "" : "h-9 w-9 bottom-0.5"}`}
                  >
                    {isAgentMissionRunning ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ChevronUp className={`${agentInputFocused || agentInput.trim() ? "h-4 w-4" : "h-3.5 w-3.5"}`} />
                    )}
                  </button>
                </div>
              </div>
              <div
                className={`relative flex flex-wrap gap-2 transition-all duration-200 ${
                  agentComposerFiles.length > 0 ? "mt-3 max-h-24 opacity-100" : "max-h-0 overflow-hidden opacity-0"
                }`}
              >
                {agentComposerFiles.map((file) => (
                  <div
                    key={file.id}
                    className="group flex items-center gap-2 rounded-2xl border border-slate-800/90 bg-white/[0.03] px-2 py-1.5"
                  >
                    <img
                      src={file.previewUrl}
                      alt={file.name}
                      className="h-10 w-10 rounded-xl object-cover"
                    />
                    <div className="max-w-32 truncate text-[11px] text-slate-300">{file.name}</div>
                    <button
                      type="button"
                      onClick={() => removeAgentComposerFile(file.id)}
                      className="rounded-full p-1 text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-white"
                      title="移除图片"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <div
                className={`relative flex flex-wrap items-center gap-2 pr-16 transition-all duration-200 ${
                  agentInputFocused || agentInput.trim() ? "mt-4 max-h-32 opacity-100" : "mt-0 max-h-0 overflow-hidden opacity-0"
                }`}
              >
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      const shouldClose = activeComposerActionId === "script" || showScriptExamples;
                      setActiveComposerActionId((prev) => (prev === "script" ? "" : "script"));
                      setShowCanvasExamples(false);
                      setShowScriptExamples(!shouldClose);
                      setAgentInputFocused(true);
                    }}
                    className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[12px] transition-all ${
                      activeComposerActionId === "script" || showScriptExamples
                        ? "border-amber-500/55 bg-amber-500/10 text-amber-100 shadow-[0_8px_20px_rgba(245,158,11,0.12)]"
                        : "border-slate-800/90 bg-white/[0.03] text-slate-300 hover:bg-white/[0.05]"
                    }`}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    生成脚本
                  </button>
                </div>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      const shouldClose = activeComposerActionId === "canvas" || showCanvasExamples;
                      setActiveComposerActionId((prev) => (prev === "canvas" ? "" : "canvas"));
                      setShowScriptExamples(false);
                      setShowCanvasExamples(!shouldClose);
                      setAgentInputFocused(true);
                    }}
                    className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[12px] transition-all ${
                      activeComposerActionId === "canvas" || showCanvasExamples
                        ? "border-cyan-500/55 bg-cyan-500/10 text-cyan-100 shadow-[0_8px_20px_rgba(6,182,212,0.12)]"
                        : "border-slate-800/90 bg-white/[0.03] text-slate-300 hover:bg-white/[0.05]"
                    }`}
                  >
                    <Layout className="h-3.5 w-3.5" />
                    画布编排
                  </button>
                </div>
                {composerQuickActions.map((action) => {
                  const Icon = action.icon;
                  const isActive = activeComposerActionId === action.id;
                  return (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => handleAgentQuickAction(action.id)}
                      className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[12px] transition-all ${
                        isActive
                          ? "border-slate-700 bg-[linear-gradient(180deg,rgba(30,30,34,0.96),rgba(10,10,12,0.98))] text-white shadow-[0_8px_20px_rgba(0,0,0,0.28)]"
                          : "border-slate-800/90 bg-white/[0.03] text-slate-300 hover:bg-white/[0.05]"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {action.label}
                    </button>
                  );
                })}
                <label className="ml-auto inline-flex cursor-pointer select-none items-center gap-2 rounded-full border border-slate-800/90 bg-white/[0.03] px-3 py-2 text-[12px] text-slate-300">
                  <input
                    type="checkbox"
                    checked={agentDevMode}
                    onChange={(e) => setAgentDevMode(e.target.checked)}
                    className="h-3.5 w-3.5 accent-slate-300"
                  />
                  Dev Mode
                </label>
              </div>
              <div
                className={`text-[11px] text-slate-500 transition-all duration-200 ${
                  agentInputFocused || agentInput.trim() ? "mt-3 max-h-8 opacity-100" : "max-h-0 overflow-hidden opacity-0"
                }`}
              >
                Enter 发送，Shift+Enter 换行
              </div>
              {preferenceNotice && (
                <div className="mt-2 rounded border border-yellow-500/35 bg-yellow-500/10 p-2 text-[10px] text-yellow-100 flex items-center justify-between gap-2">
                  <div className="truncate">
                    已更新偏好：{preferenceNotice.key}
                    {preferenceNotice.value
                      ? ` = ${
                          Array.isArray(preferenceNotice.value)
                            ? preferenceNotice.value.join("/")
                            : String(preferenceNotice.value)
                        }`
                      : ""}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        openPreferencesPanelWithSuggestion(preferenceNotice);
                        setPreferenceNotice(null);
                      }}
                      className="px-1.5 py-0.5 rounded border border-yellow-500/50 hover:bg-yellow-500/20"
                    >
                      快速查看
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreferenceNotice(null)}
                      className="text-yellow-200/80 hover:text-yellow-50"
                      aria-label="关闭偏好通知"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}
              {HITL_FEEDBACK_UI_ENABLED && (
                <div className="mt-2 rounded border border-fuchsia-500/30 bg-fuchsia-900/10 p-2 text-[10px] space-y-1">
                  <div className="text-fuchsia-100">反馈历史</div>
                  {hitlFeedbackRows.length === 0 ? (
                    <div className="text-slate-500">暂无反馈记录</div>
                  ) : (
                    <div className="space-y-1 max-h-24 overflow-y-auto custom-scrollbar">
                      {hitlFeedbackRows.map((row) => (
                        <div key={row.id} className="rounded border border-slate-700/80 bg-slate-950/60 px-1.5 py-1">
                          <div className="text-slate-200">
                            {row.message}
                            {row.key ? ` · ${row.key}` : ""}
                            {row.reason ? ` · ${row.reason}` : ""}
                          </div>
                          <div className="text-slate-500">
                            {new Date(Number(row.updatedAt || Date.now())).toLocaleString()}
                            {row.caseId ? ` · case_id=${row.caseId}` : ""}
                          </div>
                          {row.kind === "suggestion" && row.status === "ignored" && (
                            <button
                              type="button"
                              onClick={() =>
                                handleSuggestionEdit({
                                  key: row.key,
                                  value: row.value,
                                })
                              }
                              className="mt-1 px-1.5 py-0.5 rounded border border-indigo-500/60 text-indigo-100 hover:bg-indigo-600/20"
                            >
                              快速编辑
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {agentDevMode && (
                <div className="mt-2 rounded border border-slate-700 bg-slate-950/70 p-2 text-[10px] text-slate-400 space-y-1.5">
                  <div className="text-slate-300">Dev: memory_suggestions</div>
                  <div>
                    pendingTask:{" "}
                    {activePendingTask
                      ? `${activePendingTask.intent} missing=${(activePendingTask.missing || []).join(",") || "-"}`
                      : "none"}
                  </div>
                  {devSuggestionLog.length === 0 ? (
                    <div className="text-slate-500">no suggestions</div>
                  ) : (
                    <div className="space-y-1 max-h-24 overflow-y-auto custom-scrollbar">
                      {devSuggestionLog.map((row, idx) => (
                        <div key={`${row.turnId}_${row.key}_${idx}`} className="border border-slate-800 rounded px-1.5 py-1">
                          <div>
                            [{row.status}] {row.key}
                          </div>
                          <div className="text-slate-500">{Array.isArray(row.value) ? row.value.join("/") : String(row.value || "")}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {HITL_FEEDBACK_UI_ENABLED && (
                    <div className="pt-1 border-t border-slate-800 space-y-1">
                      <div className="text-slate-300">Dev: 失败回归</div>
                      {devRegressionLog.length === 0 ? (
                        <div className="text-slate-500">no regression feedback</div>
                      ) : (
                        <div className="space-y-1 max-h-24 overflow-y-auto custom-scrollbar">
                          {devRegressionLog.map((row, idx) => (
                            <div key={`${row.turnId}_${idx}`} className="border border-slate-800 rounded px-1.5 py-1">
                              <div>
                                [{row.status}] reason={row.reason || "-"}
                              </div>
                              <div className="text-slate-500">
                                case_id={row.caseId || "-"} {row.error ? `error=${row.error}` : ""}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ✅ 属性栏（保留并确保存在） */}
        <PropertyPanel
          node={activeNodeId ? nodes.find((n) => n.id === activeNodeId) : null}
          updateData={updateNodeData}
          onClose={() => setActiveNodeId(null)}
          imageModelOptions={imageModelOptions}
          videoModelOptions={videoModelOptions}
          resolveModelParamsForId={resolveModelParamsForId}
        />
      </div>

      {/* History Panel（保持你原逻辑） */}
      {showHistoryPanel && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowHistoryPanel(false)}>
          <div className="w-[600px] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-800">
              <div className="flex gap-4">
                <button onClick={() => setActiveHistoryTab("recent")} className={`text-sm font-bold pb-1 border-b-2 transition-colors ${activeHistoryTab === "recent" ? "border-purple-500 text-white" : "border-transparent text-slate-500"}`}>
                  最近任务
                </button>
                <button onClick={() => setActiveHistoryTab("stats")} className={`text-sm font-bold pb-1 border-b-2 transition-colors ${activeHistoryTab === "stats" ? "border-purple-500 text-white" : "border-transparent text-slate-500"}`}>
                  数据趋势
                </button>
              </div>
              <button onClick={() => setShowHistoryPanel(false)} className="text-slate-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-slate-950/50">
              {activeHistoryTab === "recent" ? (
                <div className="space-y-3">
                  {apiHistory.length === 0 && <div className="text-center text-slate-500 py-8">暂无历史记录</div>}
                  {apiHistory.map((item, i) => {
                    const inputMedia = normalizeHistoryInputs(item.inputs);
                    const outputMedia = normalizeHistoryOutputs(item.outputs);
                    const paramRows = formatHistoryParams(item.inputs);
                    const isExpanded = expandedHistoryIds.has(item.id || String(i));
                    return (
                      <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-purple-500/50 transition-colors space-y-3">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded uppercase">{TOOL_CARDS[item.mode]?.short || item.mode}</span>
                            <span className="text-[10px] text-slate-500">{new Date(item.time).toLocaleString()}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                const key = item.id || String(i);
                                setExpandedHistoryIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(key)) next.delete(key);
                                  else next.add(key);
                                  return next;
                                });
                              }}
                              className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-3 py-1.5 rounded transition-colors flex items-center gap-1"
                            >
                              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />} 详情
                            </button>
                            <button onClick={() => applyHistoryConfig(item)} className="text-xs bg-slate-800 hover:bg-purple-600 text-slate-300 hover:text-white px-3 py-1.5 rounded transition-colors flex items-center gap-1">
                              <RefreshCw className="w-3 h-3" /> 复用
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <div className="text-[11px] text-slate-500">输入内容</div>
                            {renderHistoryMedia(inputMedia, "输入")}
                            <div className="mt-2 text-[11px] text-slate-400 whitespace-pre-wrap break-words">
                              <span className="text-slate-500">提示词：</span>
                              {item.final_prompt || item.prompt || "(无)"}
                            </div>
                          </div>
                          <div className="space-y-2">
                            <div className="text-[11px] text-slate-500">输出结果</div>
                            {renderHistoryMedia(outputMedia, "输出")}
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="border-t border-slate-800 pt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <div className="text-[11px] text-slate-500 mb-2">输入参数</div>
                              {paramRows.length === 0 ? (
                                <div className="text-[11px] text-slate-600">无可显示参数</div>
                              ) : (
                                <div className="grid grid-cols-1 gap-1 text-[11px] text-slate-300">
                                  {paramRows.map((row) => (
                                    <div key={row.key} className="flex items-center justify-between gap-3 bg-slate-950/50 border border-slate-800 rounded px-2 py-1">
                                      <span className="text-slate-500">{row.key}</span>
                                      <span className="text-slate-200 break-all">{String(row.value)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div>
                              <div className="text-[11px] text-slate-500 mb-2">输出信息</div>
                              <div className="text-[11px] text-slate-300 bg-slate-950/50 border border-slate-800 rounded px-2 py-2">
                                {outputMedia.length > 0 ? `输出数量：${outputMedia.length}` : "无输出"}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-6">
                  <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">热门模式分布</h4>
                    <div className="space-y-2">
                      {apiStats &&
                        Object.entries(apiStats.modes || {}).map(([mode, count]) => (
                          <div key={mode} className="flex items-center gap-3">
                            <div className="w-24 text-xs text-slate-300 truncate text-right">{TOOL_CARDS[mode]?.short || mode}</div>
                            <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-500" style={{ width: `${Math.min((count / 20) * 100, 100)}%` }} />
                            </div>
                            <div className="w-8 text-xs text-slate-500">{count}次</div>
                          </div>
                        ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">高频关键词 (灵感库)</h4>
                    <div className="flex flex-wrap gap-2">
                      {(apiStats?.keywords || []).map((word, i) => (
                        <span key={i} className="text-xs bg-slate-800 border border-slate-700 px-2 py-1 rounded-full text-slate-300 hover:text-white hover:border-blue-500 cursor-pointer transition-colors">
                          #{word}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showPreferencesPanel && (
        <React.Suspense
          fallback={
            <div className="fixed right-0 top-0 z-[120] h-full w-[min(94vw,560px)] border-l border-slate-700 bg-slate-900 text-slate-300 p-4">
              <div className="inline-flex items-center gap-2 text-xs">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                正在加载偏好面板...
              </div>
            </div>
          }
        >
          <PreferencesPanel
            open={showPreferencesPanel}
            onClose={() => {
              setShowPreferencesPanel(false);
              setPreferencesPanelPrefill(null);
            }}
            apiFetch={apiFetch}
            onQuickExample={insertPreferenceQuickExample}
            onPreferenceSaved={handlePreferenceSavedFromPanel}
            prefill={preferencesPanelPrefill}
          />
        </React.Suspense>
      )}

      {HITL_FEEDBACK_UI_ENABLED && feedbackDialog && (
        <div className="fixed inset-0 z-[130] bg-black/40 backdrop-blur-[1px] flex items-center justify-center px-4">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-100">标记为回归用例</div>
                <div className="text-[11px] text-slate-400 mt-0.5">可补充失败原因，便于后续回归修复</div>
              </div>
              <button
                type="button"
                onClick={closeRegressionFeedbackDialog}
                className="p-1 rounded border border-slate-700 text-slate-300 hover:bg-slate-800"
                aria-label="关闭回归反馈弹窗"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <label className="block text-[11px] text-slate-300 space-y-1">
                <span>选择失败原因</span>
                <select
                  value={feedbackReasonChoice}
                  onChange={(e) => setFeedbackReasonChoice(e.target.value)}
                  className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 outline-none"
                >
                  {HITL_FEEDBACK_REASON_OPTIONS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-[11px] text-slate-300 space-y-1">
                <span>补充说明（可选）</span>
                <textarea
                  rows={3}
                  value={feedbackReasonNote}
                  onChange={(e) => setFeedbackReasonNote(e.target.value)}
                  placeholder="例如：素材主镜头经常命中错误资产"
                  className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 outline-none resize-y"
                />
              </label>
            </div>
            <div className="px-4 py-3 border-t border-slate-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeRegressionFeedbackDialog}
                className="px-3 py-1.5 rounded border border-slate-700 text-xs text-slate-200 hover:bg-slate-800"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmRegressionFeedbackDialog}
                className="px-3 py-1.5 rounded border border-fuchsia-500/60 bg-fuchsia-600/20 text-xs text-fuchsia-100 hover:bg-fuchsia-600/30"
              >
                确认标记
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewImage && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-10" onClick={() => setPreviewImage(null)}>
          <div className="relative max-w-full max-h-full flex items-center justify-center" onMouseDown={(e) => e.stopPropagation()}>
            {isVideoContent(previewImage) ? (
              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <VideoPlayer src={previewImage} className="max-w-full max-h-[90vh] rounded-lg shadow-2xl border border-slate-700 bg-black" controls autoPlay />
                <button className="absolute -top-12 right-0 text-white/70 hover:text-white transition-colors bg-slate-800/50 p-2 rounded-full hover:bg-slate-700/80" onClick={() => setPreviewImage(null)}>
                  <X className="w-6 h-6" />
                </button>
              </div>
            ) : (
              <>
                <img src={previewImage} className="max-w-full max-h-[90vh] rounded-lg shadow-2xl border border-slate-700 object-contain" alt="Preview" onClick={(e) => e.stopPropagation()} />
                <button className="absolute -top-12 right-0 text-white/70 hover:text-white transition-colors bg-slate-800/50 p-2 rounded-full hover:bg-slate-700/80" onClick={() => setPreviewImage(null)}>
                  <X className="w-6 h-6" />
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

class WorkbenchErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error?.message || "未知页面错误",
    };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[Workbench] runtime:error", {
      message: error?.message || String(error),
      stack: error?.stack || "",
      componentStack: errorInfo?.componentStack || "",
    });
  }

  handleRecover = () => {
    this.setState({ hasError: false, message: "" });
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="h-screen w-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="w-[min(92vw,640px)] rounded-xl border border-rose-700/70 bg-slate-900/95 p-5 shadow-2xl">
          <div className="text-sm font-semibold text-rose-300">页面运行异常</div>
          <div className="mt-2 text-xs text-slate-300 break-all">{this.state.message || "未知错误"}</div>
          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={this.handleRecover}
              className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-100 hover:bg-slate-700"
            >
              尝试恢复
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md border border-cyan-700/70 bg-cyan-900/30 px-3 py-1.5 text-xs text-cyan-100 hover:bg-cyan-900/50"
            >
              刷新页面
            </button>
          </div>
        </div>
      </div>
    );
  }
}

const WorkbenchWithBoundary = () => (
  <WorkbenchErrorBoundary>
    <Workbench />
  </WorkbenchErrorBoundary>
);

export default WorkbenchWithBoundary;
