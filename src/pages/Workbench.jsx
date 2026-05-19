import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import {
  Upload,
  Image as ImageIcon,
  Wand2,
  Download,
  X,
  Play,
  Plus,
  Zap,
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
  AlertCircle,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Info,
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
  GripVertical,
  Volume2,
  VolumeX,
  FolderOpen,
  Save,
  Camera,
} from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { useNavigate } from "../router";
import TopicCards from "../components/agent-canvas/TopicCards";
import ScriptBriefCard from "../components/agent-canvas/ScriptBriefCard";
import ScriptExecutionPlan from "../components/agent-canvas/ScriptExecutionPlan";
import ScriptPlanSummary from "../components/agent-canvas/ScriptPlanSummary";
import PreferenceSuggestionCard from "../components/agent-canvas/PreferenceSuggestionCard";
import DramaMarkdownBlock from "../components/workbench/DramaMarkdownBlock";
import VideoPlayer from "../components/workbench/VideoPlayer";
import ToolIconBtn from "../components/workbench/ToolIconBtn";
import PromptPolishPickerModal from "../components/workbench/PromptPolishPickerModal";
import SidebarBtn from "../components/workbench/SidebarBtn";
import InlineDropdown from "../components/workbench/InlineDropdown";
import AgentResultCardContent from "../components/workbench/AgentResultCardContent";
import PersonaMentionTextarea from "../components/workbench/PersonaMentionTextarea";
import PropertyPanel from "../components/workbench/PropertyPanel";
import NodeComponent from "../components/workbench/NodeComponent";
import {
  buildCanvasNodePrompt,
  buildCanvasNodePreviewPrompt,
  extractCanvasSupplementalPrompt,
} from "../components/agent-canvas/promptUtils";
import {
  readAgentDevMode,
  readAiChatAnchorDebugState,
  writeAgentDevMode,
  writeAiChatAnchorDebugState,
} from "../lib/aiChatAnchorDebug";
import {
  extractProductKeyword,
  polishCanvasPrompt,
  runVideoSplitTask,
  runVideoLineartTask,
  runVideoRmbgTask,
  sendAgentMessage,
  pollStoryboardTask,
} from "../api/agentCanvas";
import {
  listPreferences as listMemoryPreferences,
  setPreference as setMemoryPreference,
} from "../api/memoryPreferences";
import { harvestEvalCase } from "../api/qualityFeedback";
import { createEmptyAssetLibraryStore, saveAssetLibraryDbStore, migrateAssetLibraryLocalStorage } from "../lib/assetLibraryDb";
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
import { useMemberInfo, formatMemberPoints } from "../hooks/useMemberInfo";
import { useSidebar } from "../hooks/useSidebar";
import { detectPreferenceSuggestions } from "../agent/preferenceSuggestion";
import { buildHitlFeedbackRows } from "../agent/hitlFeedbackHistory";
import { AI_CHAT_IMAGE_MODEL_ID_NANO_BANANA2, API_BASE } from "../config";
import Html360Viewer from "./Html360Viewer";
import { findAIChatModelIdByKeywords } from "../lib/aiChatModelResolver";
import { downloadMedia } from "../lib/downloadMedia";
import { isVideoContent } from "../lib/mediaType.js";
import { buildRoleProfileStructuredOutput } from "../lib/roleProfileStructurer.js";
import {
  EMPTY_LIST,
  AGENT_RUN_STEPS,
  DRAMA_RUN_STEPS,
  AGENT_RESULT_CARD_WIDTH,
  SCRIPT_PLATFORM_OPTIONS,
  SCRIPT_PRICE_BAND_OPTIONS,
  SCRIPT_CONVERSION_GOAL_OPTIONS,
  SCRIPT_AUDIENCE_OPTIONS,
  normalizeScriptBrief,
  buildArtifactSelectionKey,
  isSameArtifactSelection,
  isPreviewableArtifact,
  normalizeLocationName,
  matchesSceneBinding,
  stripStoryboardDisplayIds,
  escapeRegExp,
  collectStoryboardMentionTerms,
  renderStoryboardMentionText,
  extractScriptPlatform,
  buildInitialScriptBrief,
  getAgentResultCardWidth,
  getAgentTurnStepLabel,
  NODE_TYPES,
  HIDDEN_IMAGE_CONFIG_MODES,
  VOLC_VIDEO_HD_TEMPLATE_ENUM_1,
  VOLC_VIDEO_HD_TEMPLATE_ENUM_2,
  DEFAULT_VIDEO_HD_MODEL_ID,
  isSeedanceReferenceModeModel,
  isSeedanceOmniReferenceModel,
  sortParamValues,
  findAIChatParamItem,
  getAIChatParamDisplayValue,
  listAIChatParamValues,
  listAIChatParamChoiceOptions,
  normalizePromptPolishVariants,
  TOOL_CARDS,
  FEATURE_EXTRACT_PRESET_PROMPTS,
  getProcessorModeDefaults,
  VIDEO_HD_TEMPLATE_OPTIONS,
  PROMPT_TEMPLATES,
  ASPECT_RATIOS,
  VIDEO_GEN_INPUT_HANDLE_MAIN,
  VIDEO_GEN_INPUT_HANDLE_LAST_FRAME,
  normalizeConnectionTargetHandle,
  MEDIA_UPLOAD_NODE_EMPTY_HEIGHT,
  MAX_RENDERED_MEDIA_ITEMS_PER_NODE,
  DEFAULT_VIDEO_LINEART_STRENGTH,
  DEFAULT_VIDEO_LINEART_COLOR,
  DEFAULT_VIDEO_SPLIT_OUTPUT_RESOLUTION,
  isImageFileLike,
  isVideoFileLike,
  isMediaFileLike,
  normalizeInputMediaKind,
  getReferenceNodeTitle,
  readFilesAsDataUrls,
  normalizeVideoSplitSecond,
  normalizeVideoSplitSegments,
  checkNodeReady,
} from "../constants/workbench.jsx";

const PreferencesPanel = React.lazy(() => import("../components/agent-canvas/PreferencesPanel"));

// ==========================================
// Config & Constants
// ==========================================
const generateId = () => Math.random().toString(36).substr(2, 9);
const GRID_SIZE = 20;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3;
const MEDIA_UPLOAD_NODE_WIDTH = 280;
const MEDIA_UPLOAD_NODE_DROP_OFFSET_Y = 96;
const CANVAS_KEY = "bananaflow_canvas_id";
const AGENT_SESSION_STORE_KEY = "bananaflow_agent_canvas_sessions_v1";
const ASSET_LIBRARY_STORE_KEY = "bananaflow_asset_library_v1";
const AGENT_COMPOSER_FILE_ACCEPT = "image/*,.csv,.tsv,.txt,.md,.markdown,text/plain,text/csv,text/markdown";
const AGENT_DOCUMENT_MAX_BYTES = 1024 * 1024;
const AGENT_QUICK_ACTIONS = [
  { id: "script", label: "生成爆款脚本" },
  { id: "drama", label: "创作短剧" },
  { id: "canvas", label: "搭建画布" },
];
const AGENT_DEFAULT_QUICK_ACTION_IDS = ["script", "drama", "canvas"];
const AGENT_DRAMA_QUICK_PROMPT = "帮我创作一个竖屏短剧大纲";
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
const AGENT_CARD_SCROLL_BODY_SELECTOR = '[data-agent-card-scroll-body="true"]';

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

const isAgentComposerDocumentFile = (file) => {
  const name = String(file?.name || "").trim().toLowerCase();
  const type = String(file?.type || "").trim().toLowerCase();
  return Boolean(
    name.endsWith(".csv") ||
      name.endsWith(".tsv") ||
      name.endsWith(".txt") ||
      name.endsWith(".md") ||
      name.endsWith(".markdown") ||
      type.startsWith("text/") ||
      type === "application/csv" ||
      type === "text/csv"
  );
};

const looksLikeStoryboardScriptTableText = (text) => {
  const normalized = String(text || "").trim();
  if (!normalized) return false;
  const lowered = normalized.toLowerCase();
  return (
    (normalized.includes("镜号") && normalized.includes("画面内容")) ||
    (lowered.includes("shot") && lowered.includes("visual")) ||
    (lowered.includes("shot_no") && lowered.includes("dialogue")) ||
    (lowered.includes("shot number") && lowered.includes("duration"))
  );
};

const looksLikeStoryboardScriptTableFile = (fileName, text) => {
  const name = String(fileName || "").trim().toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".tsv")) {
    if (name.includes("storyboard") || name.includes("shot") || name.includes("scene") || name.includes("分镜") || name.includes("镜头")) {
      return true;
    }
  }
  return looksLikeStoryboardScriptTableText(text);
};

const scoreDecodedStoryboardText = (text) => {
  const source = String(text || "");
  if (!source) return -1_000_000;
  let score = 0;
  const replacementCount = (source.match(/�/g) || []).length;
  const cjkCount = (source.match(/[\u4e00-\u9fff]/g) || []).length;
  score -= replacementCount * 50;
  score += cjkCount * 2;
  if (looksLikeStoryboardScriptTableText(source)) score += 500;
  if (source.includes("镜号")) score += 200;
  if (source.includes("画面内容")) score += 200;
  if (source.includes("台词")) score += 80;
  if (source.includes("音效")) score += 80;
  if (source.includes("时长")) score += 80;
  return score;
};

const decodeStoryboardDocumentBuffer = (buffer) => {
  const bytes = buffer instanceof ArrayBuffer ? buffer : new ArrayBuffer(0);
  const encodingCandidates = ["utf-8", "gb18030", "gbk"];
  let bestText = "";
  let bestScore = -Infinity;
  for (const encoding of encodingCandidates) {
    try {
      const decoded = new TextDecoder(encoding, { fatal: false }).decode(bytes);
      const score = scoreDecodedStoryboardText(decoded);
      if (score > bestScore) {
        bestScore = score;
        bestText = decoded;
      }
    } catch (error) {
      // ignore decoder unsupported/runtime errors
    }
  }
  return String(bestText || "").trim();
};

const isAbortLikeError = (error) => {
  const name = String(error?.name || "").toLowerCase();
  const message = String(error?.message || error || "").toLowerCase();
  return name === "aborterror" || message.includes("aborted") || message.includes("已取消");
};

const LOADING_TIPS = [
  "正在重塑光影氛围...",
  "AI 正在计算物体表面漫反射...",
  "正在生成帧间动态光流...",
  "正在计算物理碰撞与运动轨迹...",
  "正在渲染关键帧插值...",
  "正在构思光影布局...",
  "精彩马上呈现...",
];


const normalizeVideoLineartStrength = (value) => {
  const parsed = parseInt(String(value ?? DEFAULT_VIDEO_LINEART_STRENGTH), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_VIDEO_LINEART_STRENGTH;
  return Math.max(1, Math.min(10, parsed));
};

const normalizeVideoLineartColor = (value) => {
  const text = String(value || "").trim();
  return text ? text.slice(0, 32) : DEFAULT_VIDEO_LINEART_COLOR;
};

const normalizeVideoLineartConfig = (value) => {
  const config = value && typeof value === "object" ? value : {};
  return {
    lineStrength: normalizeVideoLineartStrength(config?.lineStrength),
    lineColor: normalizeVideoLineartColor(config?.lineColor),
  };
};



const MODES_WITHOUT_APP_AUTH = new Set([
  "bg_replace",
  "gesture_swap",
  "product_swap",
  "local_text2img",
  "rmbg",
  "feature_extract",
  "multi_angleshots",
]);

const makeAgentId = () => Math.random().toString(36).slice(2, 10);

const buildRouteDebug = (route, backendCalled, backendDecision = null) => ({
  intent: route?.intent || "UNKNOWN",
  product: route?.product || "",
  reason: route?.reason || "",
  backendCalled: !!backendCalled,
  backendAction: backendDecision?.action || "",
  backendIntent: backendDecision?.intent || "",
  backendRule: backendDecision?.decision?.matched_rule || "",
  backendCapabilities: Array.isArray(backendDecision?.decision?.matched_capabilities)
    ? backendDecision.decision.matched_capabilities
    : [],
});

const getRouteIntentLabel = (intent) => {
  const labelMap = {
    SCRIPT: "脚本",
    DRAMA: "短剧",
    CANVAS: "画布",
    CHITCHAT: "闲聊",
    UNKNOWN: "未知",
  };
  return labelMap[intent] || String(intent || "未知");
};

const getDecisionLabel = (action) => {
  const labelMap = {
    answer_only: "直接回答",
    clarify: "澄清",
    tool_call: "工具调用",
    canvas_plan: "画布规划",
    workflow_plan: "工作流规划",
  };
  return labelMap[action] || String(action || "-");
};

const getFeedbackStatusLabel = (status) => {
  const labelMap = {
    pending: "待处理",
    ignored: "已忽略",
    accepted: "已采纳",
    resolved: "已解决",
    rejected: "已拒绝",
    done: "完成",
    error: "失败",
  };
  return labelMap[status] || String(status || "-");
};

const CANVAS_CLARIFY_THOUGHT_PREFIX = "clarify_missing_prompt:";
const CANVAS_PROMPT_EXAMPLES = [
  "一瓶极简风洗面奶产品图，白底，棚拍光，高清细节。",
  "保留主体构图，改成奶油质感电商海报，浅色背景，柔和打光。",
];

const parseCanvasClarification = (response) => {
  const thought = String(response?.thought || "").trim();
  if (!thought.startsWith(CANVAS_CLARIFY_THOUGHT_PREFIX)) return null;
  const mode = thought.slice(CANVAS_CLARIFY_THOUGHT_PREFIX.length).trim();
  return { mode };
};

const createDefaultAgentSession = () => ({
  id: `session_${makeAgentId()}`,
  title: "新会话",
  createdAt: Date.now(),
  updatedAt: Date.now(),
  turns: [],
  pendingTask: null,
});

const cloneDeep = (obj) => JSON.parse(JSON.stringify(obj));


const cloneCanvasNodeForHistory = (node) => ({
  ...node,
  data: { ...(node?.data || {}) },
});

const cloneCanvasNodeLight = cloneCanvasNodeForHistory;

const inferMediaKindFromMediaItems = (items = []) => {
  const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!safeItems.length) return "mixed";
  if (safeItems.every((item) => isVideoContent(item))) return "video";
  if (safeItems.every((item) => !isVideoContent(item))) return "image";
  return "mixed";
};

const buildStoryboardStylePrefix = (storyboardPlan = {}) => {
  const parts = [];
  const style = String(storyboardPlan?.style || "").trim();
  if (style) parts.push(style);
  const globalNotes = Array.isArray(storyboardPlan?.global_notes)
    ? storyboardPlan.global_notes.map((n) => String(n || "").trim()).filter(Boolean)
    : [];
  parts.push(...globalNotes.slice(0, 2));
  if (!globalNotes.length) {
    const rationale = String(storyboardPlan?.design_rationale || "").trim();
    if (rationale) parts.push(rationale.slice(0, 60));
  }
  return parts.join("，");
};

const buildStoryboardAssetGenerationPrompt = (assetType, asset, storyboardPlan = {}) => {
  const style = String(storyboardPlan?.style || "").trim();
  const aspectRatio = String(storyboardPlan?.aspect_ratio || "16:9").trim() || "16:9";
  const name = stripStoryboardDisplayIds(asset?.name || "");
  const coreDescription = String(asset?.core_description || asset?.description || "").trim();
  const visualTraits = Array.isArray(asset?.visual_traits) ? asset.visual_traits.filter(Boolean).join("，") : "";
  const detail = [coreDescription, visualTraits].filter(Boolean).join("，");
  const stylePrefix = buildStoryboardStylePrefix(storyboardPlan);
  const prefixStr = stylePrefix ? `${stylePrefix}。\n` : "";

  if (assetType === "characters") {
    return `${prefixStr}请生成一张故事板角色设定图，主体为${name}。角色描述：${detail || name}。要求：只表现该角色本人，不加入其他角色和无关主体；保持故事板既定服装、配饰、毛发/体态与气质；画面适合作为后续镜头统一参考，风格保持${style || "故事板原始风格"}，比例${aspectRatio}。`;
  }
  if (assetType === "subjects") {
    return `${prefixStr}请生成一张故事板主体设定图，主体为${name}。主体描述：${detail || name}。要求：只表现该主体本身，突出材质、结构、颜色和关键细节，不加入无关角色；适合作为后续镜头统一参考，风格保持${style || "故事板原始风格"}，比例${aspectRatio}。`;
  }
  return `${prefixStr}请生成一张故事板场景设定图，场景为${name}。场景描述：${detail || name}。要求：只表现环境本身，不加入角色动作和剧情事件；重点体现空间结构、光线、材质、空气、水迹、反射和整体氛围；适合作为后续镜头统一参考，风格保持${style || "故事板原始风格"}，比例${aspectRatio}。`;
};

const normalizeStoryboardAssetCandidates = (value) => {
  if (!Array.isArray(value)) return EMPTY_LIST;
  return value
    .map((item, index) => {
      if (typeof item === "string") {
        const url = String(item || "").trim();
        if (!url) return null;
        return {
          id: `candidate_${index}_${Math.random().toString(36).slice(2, 8)}`,
          url,
          createdAt: Date.now(),
          source: "legacy",
          prompt: "",
          instruction: "",
        };
      }
      const url = String(item?.url || item?.image || "").trim();
      if (!url) return null;
      return {
        id: String(item?.id || `candidate_${index}_${Math.random().toString(36).slice(2, 8)}`).trim(),
        url,
        createdAt: Number(item?.createdAt || Date.now()),
        source: String(item?.source || "generate").trim() || "generate",
        prompt: String(item?.prompt || "").trim(),
        instruction: String(item?.instruction || "").trim(),
      };
    })
    .filter(Boolean);
};

const resolveStoryboardAssetPrimaryImage = (assetState = {}) => {
  const lockedImageUrl = String(assetState?.lockedImageUrl || "").trim();
  if (lockedImageUrl) return lockedImageUrl;
  const selectedImageUrl = String(assetState?.selectedImageUrl || "").trim();
  if (selectedImageUrl) return selectedImageUrl;
  const candidates = normalizeStoryboardAssetCandidates(assetState?.candidates);
  if (candidates.length) return String(candidates[0]?.url || "").trim();
  const images = Array.isArray(assetState?.images) ? assetState.images.map((item) => String(item || "").trim()).filter(Boolean) : EMPTY_LIST;
  return images[0] || "";
};

const buildStoryboardAssetEditPrompt = ({
  assetType,
  asset,
  storyboardPlan = {},
  instruction = "",
  referenceImageUrl = "",
}) => {
  const basePrompt = buildStoryboardAssetGenerationPrompt(assetType, asset, storyboardPlan);
  const cleanInstruction = String(instruction || "").trim();
  if (!cleanInstruction) return basePrompt;
  const name = stripStoryboardDisplayIds(asset?.name || "");
  const referenceHint = referenceImageUrl ? "请基于所附参考图继续修改，保持同一主体身份与整体设计连续性。" : "请基于现有设定继续细化，不要偏离原主体。";
  if (assetType === "characters") {
    return `${basePrompt}\n${referenceHint}\n仅按以下要求调整该角色，不要改成其他角色，也不要引入新的无关角色或背景事件：${cleanInstruction}`;
  }
  if (assetType === "subjects") {
    return `${basePrompt}\n${referenceHint}\n仅按以下要求调整主体 ${name} 的材质、结构、细节或质感，不要替换成其他物件：${cleanInstruction}`;
  }
  return `${basePrompt}\n${referenceHint}\n仅按以下要求调整场景 ${name} 的环境光线、材质、天气、色调或氛围，不要加入角色动作与剧情：${cleanInstruction}`;
};

const isEditableElement = (element) => {
  if (!(element instanceof HTMLElement)) return false;
  if (element.isContentEditable) return true;
  const tagName = String(element.tagName || "").toLowerCase();
  if (["input", "textarea", "select"].includes(tagName)) return true;
  return Boolean(element.closest("input, textarea, select, [contenteditable='true'], [contenteditable=''], [role='textbox']"));
};

const getMediaUploadNodePosition = (point) => ({
  x: point.x - MEDIA_UPLOAD_NODE_WIDTH / 2,
  y: point.y - MEDIA_UPLOAD_NODE_DROP_OFFSET_Y,
});


const cloneAssetLibrarySnapshot = (value) => {
  try {
    return JSON.parse(JSON.stringify(value || {}));
  } catch {
    return { nodes: [], connections: [], viewport: { x: 0, y: 0, zoom: 1 } };
  }
};

const getSnapshotMediaItems = (snapshot) => {
  const nodes = Array.isArray(snapshot?.nodes) ? snapshot.nodes : [];
  const items = [];
  nodes.forEach((node) => {
    const mediaGroups = [
      ...(Array.isArray(node?.data?.images) ? node.data.images : []),
      ...(Array.isArray(node?.data?.uploadedImages) ? node.data.uploadedImages : []),
    ];
    mediaGroups
      .map((url) => String(url || "").trim())
      .filter(Boolean)
      .forEach((url, index) => {
        items.push({
          id: `${node?.id || "node"}_${index}`,
          url,
          kind: isVideoContent(url) ? "video" : "image",
          nodeId: String(node?.id || ""),
          nodeType: String(node?.type || ""),
          nodeTitle: String(node?.data?.title || "").trim(),
        });
      });
  });
  return items;
};

const getAssetLibraryAssetKey = (url, kind) => `${String(kind || "image").trim()}:${String(url || "").trim()}`;

const buildSnapshotDigest = (snapshot) => {
  const nodes = Array.isArray(snapshot?.nodes) ? snapshot.nodes : [];
  const connections = Array.isArray(snapshot?.connections) ? snapshot.connections : [];
  const mediaItems = getSnapshotMediaItems(snapshot);
  const images = mediaItems.filter((item) => item.kind === "image").length;
  const videos = mediaItems.filter((item) => item.kind === "video").length;
  const firstTextNode = nodes.find((node) => node?.type === "text_input" && String(node?.data?.text || "").trim());
  const firstPromptNode = nodes.find((node) => String(node?.data?.prompt || "").trim());
  const titleSource =
    String(firstTextNode?.data?.text || "").trim() ||
    String(firstPromptNode?.data?.prompt || "").trim() ||
    String(nodes[0]?.data?.title || "").trim();
  const title = titleSource ? titleSource.slice(0, 20) : "未命名作品";
  const summaryParts = [
    `${nodes.length} 个节点`,
    `${connections.length} 条连线`,
  ];
  if (images > 0) summaryParts.push(`${images} 张图片`);
  if (videos > 0) summaryParts.push(`${videos} 个视频`);
  return {
    title,
    coverUrl: mediaItems[0]?.url || "",
    mediaItems,
    summary: summaryParts.join(" · "),
    assetCount: mediaItems.length,
    nodeCount: nodes.length,
    connectionCount: connections.length,
  };
};

const normalizeAssetLibraryItem = (item) => ({
  id: String(item?.id || "").trim(),
  kind: String(item?.kind || "draft").trim() || "draft",
  canvasId: String(item?.canvasId || item?.canvas_id || "").trim(),
  title: String(item?.title || "").trim(),
  summary: String(item?.summary || "").trim(),
  coverUrl: String(item?.coverUrl || item?.cover_url || "").trim(),
  assetCount: Number(item?.assetCount ?? item?.asset_count ?? 0) || 0,
  nodeCount: Number(item?.nodeCount ?? item?.node_count ?? 0) || 0,
  connectionCount: Number(item?.connectionCount ?? item?.connection_count ?? 0) || 0,
  snapshot: item?.snapshot && typeof item.snapshot === "object" ? item.snapshot : { nodes: [], connections: [], viewport: {} },
  createdAt: String(item?.createdAt || item?.created_at || "").trim(),
  updatedAt: String(item?.updatedAt || item?.updated_at || "").trim(),
});

const normalizeAssetLibraryWork = (item) => ({
  ...normalizeAssetLibraryItem(item),
  latestVersionId: String(item?.latestVersionId || item?.latest_version_id || "").trim(),
  versionCount: Number(item?.versionCount ?? item?.version_count ?? 0) || 0,
});

const normalizeAssetLibraryWorkVersion = (item) => ({
  id: String(item?.id || "").trim(),
  workId: String(item?.workId || item?.work_id || "").trim(),
  canvasId: String(item?.canvasId || item?.canvas_id || "").trim(),
  title: String(item?.title || "").trim(),
  summary: String(item?.summary || "").trim(),
  coverUrl: String(item?.coverUrl || item?.cover_url || "").trim(),
  assetCount: Number(item?.assetCount ?? item?.asset_count ?? 0) || 0,
  nodeCount: Number(item?.nodeCount ?? item?.node_count ?? 0) || 0,
  connectionCount: Number(item?.connectionCount ?? item?.connection_count ?? 0) || 0,
  versionIndex: Number(item?.versionIndex ?? item?.version_index ?? 0) || 0,
  snapshot: item?.snapshot && typeof item.snapshot === "object" ? item.snapshot : { nodes: [], connections: [], viewport: {} },
  createdAt: Number(item?.createdAt ?? item?.created_at ?? 0) || 0,
});

const normalizeAssetLibraryAsset = (item) => ({
  id: String(item?.id || "").trim(),
  url: String(item?.url || "").trim(),
  kind: String(item?.kind || "image").trim() || "image",
  nodeId: String(item?.nodeId || item?.node_id || "").trim(),
  nodeType: String(item?.nodeType || item?.node_type || "").trim(),
  nodeTitle: String(item?.nodeTitle || item?.node_title || "").trim(),
  sourceKind: String(item?.sourceKind || item?.source_kind || "snapshot").trim() || "snapshot",
  workId: String(item?.workId || item?.work_id || "").trim(),
  versionId: String(item?.versionId || item?.version_id || "").trim(),
  canvasId: String(item?.canvasId || item?.canvas_id || "").trim(),
  title: String(item?.title || "").trim(),
  createdAt: Number(item?.createdAt ?? item?.created_at ?? 0) || 0,
  updatedAt: Number(item?.updatedAt ?? item?.updated_at ?? 0) || 0,
  lastUsedAt: Number(item?.lastUsedAt ?? item?.last_used_at ?? 0) || 0,
  usageCount: Number(item?.usageCount ?? item?.usage_count ?? 0) || 0,
});

const normalizeAssetLibraryPersona = (item) => {
  const now = Date.now();
  return {
    id: String(item?.id || "").trim(),
    name: String(item?.name || item?.title || "").trim(),
    description: String(item?.description || item?.summary || "").trim(),
    referenceImage: String(item?.referenceImage || item?.reference_image || item?.coverUrl || item?.cover_url || "").trim(),
    voiceDescription: String(item?.voiceDescription || item?.voice_description || "").trim(),
    relationshipNetwork: String(item?.relationshipNetwork || item?.relationship_network || "").trim(),
    createdAt: Number(item?.createdAt ?? item?.created_at ?? 0) || now,
    updatedAt: Number(item?.updatedAt ?? item?.updated_at ?? 0) || now,
  };
};

const buildPersonaInputNodeText = (persona) => {
  const name = String(persona?.name || "").trim();
  const description = String(persona?.description || "").trim();
  const voiceDescription = String(persona?.voiceDescription || "").trim();
  const relationshipNetwork = String(persona?.relationshipNetwork || "").trim();
  const parts = [];
  if (name) parts.push(`人物名称：${name}`);
  if (description) parts.push(`人物设定：${description}`);
  if (voiceDescription) parts.push(`音色描述：${voiceDescription}`);
  if (relationshipNetwork) parts.push(`关系网络：${relationshipNetwork}`);
  return parts.join("\n");
};

const buildAssetLibraryAssetsFromSnapshot = (snapshot, meta = {}) => {
  const timestamp = Number(meta?.createdAt ?? Date.now()) || Date.now();
  return getSnapshotMediaItems(snapshot).map((item) => ({
    id: `asset_${generateId()}`,
    url: item.url,
    kind: item.kind,
    nodeId: item.nodeId,
    nodeType: item.nodeType,
    nodeTitle: item.nodeTitle,
    sourceKind: String(meta?.sourceKind || "snapshot"),
    workId: String(meta?.workId || ""),
    versionId: String(meta?.versionId || ""),
    canvasId: String(meta?.canvasId || ""),
    title: item.nodeTitle || (item.kind === "video" ? "视频资产" : "图片资产"),
    createdAt: timestamp,
    updatedAt: timestamp,
    lastUsedAt: timestamp,
    usageCount: 1,
  }));
};

const mergeAssetLibraryAssets = (existingAssets, incomingAssets) => {
  const nextMap = new Map();
  (Array.isArray(existingAssets) ? existingAssets : []).forEach((item) => {
    const normalized = normalizeAssetLibraryAsset(item);
    if (!normalized.url) return;
    nextMap.set(getAssetLibraryAssetKey(normalized.url, normalized.kind), normalized);
  });
  (Array.isArray(incomingAssets) ? incomingAssets : []).forEach((item) => {
    const normalized = normalizeAssetLibraryAsset(item);
    if (!normalized.url) return;
    const key = getAssetLibraryAssetKey(normalized.url, normalized.kind);
    const existing = nextMap.get(key);
    nextMap.set(key, existing
      ? {
          ...existing,
          nodeId: normalized.nodeId || existing.nodeId,
          nodeType: normalized.nodeType || existing.nodeType,
          nodeTitle: normalized.nodeTitle || existing.nodeTitle,
          sourceKind: normalized.sourceKind || existing.sourceKind,
          workId: normalized.workId || existing.workId,
          versionId: normalized.versionId || existing.versionId,
          canvasId: normalized.canvasId || existing.canvasId,
          title: normalized.title || existing.title,
          updatedAt: Math.max(existing.updatedAt || 0, normalized.updatedAt || 0),
          lastUsedAt: Math.max(existing.lastUsedAt || 0, normalized.lastUsedAt || 0),
          usageCount: (Number(existing.usageCount || 0) || 0) + (Number(normalized.usageCount || 0) || 1),
        }
      : normalized);
  });
  return Array.from(nextMap.values()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 300);
};

const normalizeAssetLibraryStore = (store) => {
  const drafts = Array.isArray(store?.drafts) ? store.drafts.map(normalizeAssetLibraryItem) : [];
  const rawWorks = Array.isArray(store?.works) ? store.works : [];
  let works = rawWorks.map(normalizeAssetLibraryWork);
  let workVersions = Array.isArray(store?.workVersions) ? store.workVersions.map(normalizeAssetLibraryWorkVersion) : [];
  let assets = Array.isArray(store?.assets) ? store.assets.map(normalizeAssetLibraryAsset) : [];
  let personas = Array.isArray(store?.personas) ? store.personas.map(normalizeAssetLibraryPersona) : [];

  if (workVersions.length === 0) {
    const generatedVersions = [];
    works = works.map((work) => {
      const hasSnapshot = work?.snapshot && typeof work.snapshot === "object";
      if (!hasSnapshot) return work;
      const versionId = `legacy_version_${work.id || generateId()}`;
      const createdAt = Number(work.createdAt || work.updatedAt || Date.now()) || Date.now();
      generatedVersions.push({
        id: versionId,
        workId: work.id,
        canvasId: work.canvasId,
        title: work.title,
        summary: work.summary,
        coverUrl: work.coverUrl,
        assetCount: work.assetCount,
        nodeCount: work.nodeCount,
        connectionCount: work.connectionCount,
        versionIndex: 1,
        snapshot: cloneAssetLibrarySnapshot(work.snapshot),
        createdAt,
      });
      return {
        ...work,
        latestVersionId: versionId,
        versionCount: 1,
      };
    });
    workVersions = generatedVersions;
  }

  if (assets.length === 0) {
    const generatedAssets = [];
    workVersions.forEach((version) => {
      generatedAssets.push(
        ...buildAssetLibraryAssetsFromSnapshot(version.snapshot, {
          sourceKind: "work_version",
          workId: version.workId,
          versionId: version.id,
          canvasId: version.canvasId,
          createdAt: version.createdAt,
        }),
      );
    });
    drafts.forEach((draft) => {
      generatedAssets.push(
        ...buildAssetLibraryAssetsFromSnapshot(draft.snapshot, {
          sourceKind: "draft",
          canvasId: draft.canvasId,
          createdAt: Number(draft.updatedAt || draft.createdAt || Date.now()) || Date.now(),
        }),
      );
    });
    assets = mergeAssetLibraryAssets([], generatedAssets);
  } else {
    assets = mergeAssetLibraryAssets([], assets);
  }

  const versionCountByWorkId = new Map();
  workVersions.forEach((version) => {
    if (!version.workId) return;
    versionCountByWorkId.set(version.workId, (versionCountByWorkId.get(version.workId) || 0) + 1);
  });
  works = works.map((work) => ({
    ...work,
    versionCount: work.versionCount || versionCountByWorkId.get(work.id) || 0,
  }));
  personas = personas
    .filter((item) => item.id)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  return {
    drafts,
    works,
    workVersions: workVersions.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    assets,
    personas,
  };
};

const loadAssetLibraryStore = () => {
  try {
    const text = localStorage.getItem(ASSET_LIBRARY_STORE_KEY);
    if (!text) return createEmptyAssetLibraryStore();
    return normalizeAssetLibraryStore(JSON.parse(text));
  } catch {
    return createEmptyAssetLibraryStore();
  }
};

const saveAssetLibraryStore = (store, preferredCanvasId = "") => {
  try {
    const normalized = normalizeAssetLibraryStore(store);
    const drafts = Array.isArray(normalized?.drafts) ? normalized.drafts : [];
    const preferredDraft = preferredCanvasId
      ? drafts.find((item) => item?.canvasId === preferredCanvasId) || null
      : null;
    const fallbackDraft = preferredDraft || drafts[0] || null;
    const compactStore = {
      drafts: fallbackDraft ? [fallbackDraft] : [],
      works: [],
      workVersions: [],
      assets: [],
      personas: [],
    };
    localStorage.setItem(ASSET_LIBRARY_STORE_KEY, JSON.stringify(compactStore));
  } catch (error) {
    console.warn("[Workbench] asset_library_localstorage_save_skipped", error);
  }
};

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
        ? session.turns
          .map((turn) =>
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


const formatDebugTime = (timestamp) => {
  if (!timestamp) return "--";
  try {
    return new Date(timestamp).toLocaleTimeString("zh-CN", { hour12: false });
  } catch {
    return "--";
  }
};

const formatAssetLibraryTime = (timestamp) => {
  if (!timestamp) return "--";
  try {
    return new Date(timestamp).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
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

const API_DEBUG_DETAIL_KEYS = new Set(["aiChatLang", "aiChatImage", "userAuths", "aiChatAnchor", "agentPlanner"]);

const API_DEBUG_STATUS_LABEL = {
  idle: "待执行",
  loading: "请求中",
  success: "成功",
  warning: "警告",
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
const BIN_URL_PATTERN = /(https?:\/\/[^\s"'<>]+?\.bin(?:\?[^\s"'<>]*)?)/i;
const URL_PATTERN = /(https?:\/\/[^\s"'<>]+)/i;
const RELATIVE_IMAGE_PATH_PATTERN = /(\/[^\s"'<>]+?\.(?:png|jpe?g|webp|gif|bmp|svg)(?:\?[^\s"'<>]*)?)/i;
const RELATIVE_VIDEO_PATH_PATTERN = /(\/[^\s"'<>]+?\.(?:mp4|webm|mov|m4v|avi|mkv|m3u8)(?:\?[^\s"'<>]*)?)/i;
const RELATIVE_BIN_PATH_PATTERN = /(\/[^\s"'<>]+?\.bin(?:\?[^\s"'<>]*)?)/i;
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
  if (BIN_URL_PATTERN.test(text)) return true;
  if (text.startsWith("/") && RELATIVE_VIDEO_PATH_PATTERN.test(text)) return true;
  if (text.startsWith("/") && RELATIVE_BIN_PATH_PATTERN.test(text)) return true;
  if ((text.startsWith("http://") || text.startsWith("https://")) && /(video|mp4|webm|m3u8|play|mime=video|content_type=video|hdai_chat)/i.test(text)) return true;
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

  const ext = String(payload?.ext || "").trim().toLowerCase();
  if (ext === ".bin" || ext === "bin") {
    const directBinUrl = String(payload?.url || payload?.video_url || payload?.output_video || "").trim();
    if (directBinUrl) return directBinUrl;
  }

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

const AI_CHAT_PART_ENUM_1 = 1;
const AI_CHAT_PART_ENUM_2 = 2;
const AI_CHAT_PART_ENUM_3 = 3;
const AI_CHAT_PART_ENUM_4 = 4;
const AI_CHAT_PART_ENUM_5 = 5;

const DEFAULT_AI_MODELS = [];
const DEPRECATED_IMAGE_MODEL_IDS = new Set([
  "gemini-3-pro-image-preview",
  "doubao-seedream-4.5",
]);
const DEPRECATED_IMAGE_MODEL_NAMES = new Set([
  "gemini 3 pro",
  "doubao 4.5",
]);

const DEFAULT_VIDEO_MODELS = [];
const DEPRECATED_VIDEO_MODEL_IDS = new Set([
  "Doubao-Seedance-1.0-pro",
  "Doubao-Seedance-1.5-pro",
]);
const DEFAULT_IMAGE_MODEL_ID = DEFAULT_AI_MODELS[0]?.id || "";
const DEFAULT_VIDEO_MODEL_ID = DEFAULT_VIDEO_MODELS[0]?.id || "";

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

const isDeprecatedImageModel = (item) => {
  const id = String(item?.id || item?.value || "").trim().toLowerCase();
  const name = String(item?.name || item?.label || "").trim().toLowerCase();
  return DEPRECATED_IMAGE_MODEL_IDS.has(id) || DEPRECATED_IMAGE_MODEL_NAMES.has(name);
};

const filterDeprecatedImageModels = (items = EMPTY_LIST) =>
  (Array.isArray(items) ? items : EMPTY_LIST).filter((item) => !isDeprecatedImageModel(item));

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
  return options[0]?.id || DEFAULT_VIDEO_MODEL_ID;
};

const WORKBENCH_AI_CHAT_MODULE_ENUM = "3";

const resolveWorkbenchAIChatPartEnum = ({ mode }) => {
  if (mode === "video_upscale") return AI_CHAT_PART_ENUM_6;
  if (mode === "text2video") return AI_CHAT_PART_ENUM_204;
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

const resolveDefaultParamValueId = (paramItem) => {
  const first = sortParamValues(paramItem?.param_values || [])[0];
  const valueId = first?.param_value_id;
  if (valueId === undefined || valueId === null || valueId === "") return "";
  return String(valueId);
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
      continue;
    }
    if (name.includes("imagetype") || name.includes("image_type") || name.includes("模式")) {
      payload.ai_video_param_image_type_id = valueId;
    }
  }
  return payload;
};

const normalizeAIChatParamMatchText = (text) =>
  String(text || "")
    .trim()
    .toLowerCase()
    .replace(/秒|second|seconds|sec|fps/gi, "")
    .replace(/[（(].*?[）)]/g, "")
    .replace(/\s+/g, "")
    .replace(/_/g, "")
    .replace(/：/g, ":");

const findAIChatParamValueId = (paramList, keywords = [], preferredValue = "") => {
  const valueText = String(preferredValue || "").trim().toLowerCase();
  if (!valueText) return "";
  const item = findAIChatParamItem(paramList, keywords);
  if (!item) return "";
  const normalizedPreferred = normalizeAIChatParamMatchText(valueText);
  const useStrictNormalizedMatch =
    /^[0-9]+$/.test(normalizedPreferred) ||
    /^[0-9]+:[0-9]+$/.test(normalizedPreferred) ||
    /^[0-9]+p$/.test(normalizedPreferred);
  const values = sortParamValues(item?.param_values || EMPTY_LIST);
  for (const val of values) {
    const candidates = [
      String(val?.param_value_id || "").trim().toLowerCase(),
      String(val?.param_value || "").trim().toLowerCase(),
      String(val?.remark || "").trim().toLowerCase(),
      getAIChatParamDisplayValue(val).toLowerCase(),
    ].filter(Boolean);
    if (candidates.includes(valueText)) {
      const id = val?.param_value_id;
      return id === undefined || id === null || id === "" ? "" : String(id);
    }
    if (normalizedPreferred) {
      const matched = candidates.some((candidate) => {
        const normalizedCandidate = normalizeAIChatParamMatchText(candidate);
        if (!normalizedCandidate) return false;
        if (normalizedCandidate === normalizedPreferred) return true;
        if (useStrictNormalizedMatch) return false;
        return (
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

const normalizeImageTypeOptionText = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");

const isFirstLastFrameReferenceSelection = (selectedValue, options = EMPTY_LIST) => {
  const normalizedSelected = normalizeImageTypeOptionText(selectedValue);
  if (!normalizedSelected) return false;

  if (normalizedSelected === "2" || normalizedSelected.includes("首尾帧")) return true;

  const matchedOption = (Array.isArray(options) ? options : []).find((item) => {
    const optionValue = normalizeImageTypeOptionText(item?.value);
    const optionLabel = normalizeImageTypeOptionText(item?.label);
    return optionValue === normalizedSelected || optionLabel === normalizedSelected;
  });
  const descriptors = [selectedValue, matchedOption?.label, matchedOption?.value]
    .map(normalizeImageTypeOptionText)
    .filter(Boolean);
  return descriptors.some(
    (text) =>
      text.includes("首尾帧") ||
      text.includes("首帧尾帧") ||
      (text.includes("first") && text.includes("last")) ||
      (text.includes("last") && text.includes("frame")) ||
      (text.includes("end") && text.includes("frame"))
  );
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

const extractApiError = (data) => {
  const d = data?.detail ?? data?.message ?? data;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x?.msg || JSON.stringify(x)).join(" ; ");
  if (d && typeof d === "object") return JSON.stringify(d);
  return String(d);
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





const clampPanoramaZoom = (value) => Math.min(2.4, Math.max(0.75, Number(value) || 1));
const normalizePanoramaYaw = (value) => {
  const next = Number(value) || 0;
  return ((next % 360) + 360) % 360;
};

const PanoramaViewerSurface = ({
  image,
  yaw = 0,
  zoom = 1,
  onYawChange,
  onZoomChange,
  onReset,
  onOpenFullscreen,
  onSnapshot,
  className = "",
  compact = false,
}) => {
  const mountRef = useRef(null);
  const dragRef = useRef({ active: false, startX: 0, startYaw: 0 });
  const threeRef = useRef(null);
  const hasImage = Boolean(image);
  const safeYaw = normalizePanoramaYaw(yaw);
  const safeZoom = clampPanoramaZoom(zoom);
  const cameraFov = Math.max(32, Math.min(92, 76 / safeZoom));

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(cameraFov, 1, 0.1, 1100);
    camera.position.set(0, 0, 0.01);
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3));
    renderer.setClearColor(0x0f172a, 1);
    renderer.domElement.className = "h-full w-full";
    renderer.domElement.dataset.panoramaCanvas = "true";
    mount.appendChild(renderer.domElement);

    const geometry = new THREE.SphereGeometry(500, 64, 40);
    geometry.scale(-1, 1, 1);
    const material = new THREE.MeshBasicMaterial({ color: 0x182033 });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    let frameId = 0;
    let disposed = false;
    const resize = () => {
      if (disposed || !mount) return;
      const rect = mount.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const render = () => {
      if (disposed) return;
      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(render);
    };

    resize();
    window.addEventListener("resize", resize);
    frameId = window.requestAnimationFrame(render);
    threeRef.current = { camera, renderer, scene, geometry, material, mesh, resize };

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      threeRef.current = null;
      geometry.dispose();
      material.map?.dispose?.();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  useEffect(() => {
    const state = threeRef.current;
    if (!state) return;
    state.camera.fov = cameraFov;
    state.camera.updateProjectionMatrix();
    state.mesh.geometry = state.geometry;
    state.mesh.position.set(0, 0, 0);
    state.mesh.rotation.set(0, 0, 0);
    const phi = THREE.MathUtils.degToRad(90);
    const theta = THREE.MathUtils.degToRad(safeYaw);
    state.camera.lookAt(
      500 * Math.sin(phi) * Math.cos(theta),
      0,
      500 * Math.sin(phi) * Math.sin(theta),
    );
  }, [cameraFov, safeYaw]);

  useEffect(() => {
    const state = threeRef.current;
    if (!state) return undefined;
    if (!image) {
      state.material.map?.dispose?.();
      state.material.map = null;
      state.material.color.set(0x182033);
      state.material.needsUpdate = true;
      return undefined;
    }
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(
      image,
      (texture) => {
        if (cancelled || !threeRef.current) {
          texture.dispose();
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        const current = threeRef.current.material;
        current.map?.dispose?.();
        current.map = texture;
        current.color.set(0xffffff);
        current.needsUpdate = true;
      },
      undefined,
      () => {
        if (!threeRef.current) return;
        threeRef.current.material.color.set(0x182033);
        threeRef.current.material.needsUpdate = true;
      },
    );
    return () => {
      cancelled = true;
    };
  }, [image]);

  const handlePointerDown = (event) => {
    if (!hasImage) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = { active: true, startX: event.clientX, startYaw: safeYaw };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event) => {
    if (!dragRef.current.active) return;
    event.preventDefault();
    event.stopPropagation();
    const delta = event.clientX - dragRef.current.startX;
    onYawChange?.(normalizePanoramaYaw(dragRef.current.startYaw - delta / safeZoom));
  };

  const handlePointerUp = (event) => {
    if (!dragRef.current.active) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current.active = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const captureSnapshot = () => {
    const state = threeRef.current;
    if (!state || !hasImage) return;
    state.renderer.render(state.scene, state.camera);
    const dataUrl = state.renderer.domElement.toDataURL("image/png");
    if (dataUrl) onSnapshot?.(dataUrl);
  };

  return (
    <div
      className={`nodrag relative overflow-hidden rounded-[16px] border border-slate-200 bg-slate-950 ${className}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={(event) => {
        if (!hasImage) return;
        event.preventDefault();
        event.stopPropagation();
        onZoomChange?.(clampPanoramaZoom(safeZoom + (event.deltaY > 0 ? -0.08 : 0.08)));
      }}
    >
      <div ref={mountRef} className="absolute inset-0 cursor-grab active:cursor-grabbing" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-black/42 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/50 to-transparent" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-px w-8 -translate-x-1/2 bg-white/25" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-8 w-px -translate-y-1/2 bg-white/25" />

      {hasImage ? (
        <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full border border-white/15 bg-black/42 px-3 py-1.5 text-[11px] font-medium text-white/85 backdrop-blur-md">
          <Scan className="h-3.5 w-3.5" />
          <span>{Math.round(safeYaw)} deg</span>
          <span className="text-white/45">/</span>
          <span>{Math.round(safeZoom * 100)}%</span>
        </div>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-white/72">
          <Scan className="h-7 w-7 text-white/55" />
          <div className="text-[13px] font-medium text-white">等待全景图</div>
          <div className="text-[11px] leading-5 text-white/55">上传或连接一张 2:1 全景图后浏览</div>
        </div>
      )}

      {hasImage ? (
        <div className="absolute right-3 top-3 flex items-center gap-1.5">
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/42 text-white/82 backdrop-blur-md transition hover:bg-white/14 hover:text-white"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onReset?.();
            }}
            title="重置视角"
            aria-label="重置视角"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          {!compact ? (
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/42 text-white/82 backdrop-blur-md transition hover:bg-white/14 hover:text-white"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onOpenFullscreen?.();
              }}
              title="全屏浏览"
              aria-label="全屏浏览"
            >
              <Maximize className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/42 text-white/82 backdrop-blur-md transition hover:bg-white/14 hover:text-white"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              captureSnapshot();
            }}
            title="截图当前视角"
            aria-label="截图当前视角"
          >
            <Camera className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  );
};


const getNodeAnchorPosition = (node, nodeElement, direction = "output", handle = VIDEO_GEN_INPUT_HANDLE_MAIN) => {
  const width =
    nodeElement?.offsetWidth ||
    (node?.type === NODE_TYPES.STORYBOARD_PLAN ? 1280 : node?.type === NODE_TYPES.TEXT_INPUT ? 320 : 280);
  const height = nodeElement?.offsetHeight || 160;
  const isLastFrameHandle = normalizeConnectionTargetHandle(handle) === VIDEO_GEN_INPUT_HANDLE_LAST_FRAME;
  const lastFrameHandleY = Math.min(height - 24, Math.max(36, height / 2 + 40));

  return {
    x: direction === "output" ? node.x + width : node.x,
    y: node.y + (isLastFrameHandle ? lastFrameHandleY : height / 2),
  };
};






const newCanvasId = () => "canvas_" + Math.random().toString(36).slice(2, 12);

const Workbench = () => {
  const { user, logout, apiFetch } = useAuth();
  const navigate = useNavigate();
  const {
    hoveredSidebarItemKey, setHoveredSidebarItemKey,
    hoveredSidebarPreview, setHoveredSidebarPreview,
    sidebarNodeInputMenu, setSidebarNodeInputMenu,
    sidebarWorkflowMenu, setSidebarWorkflowMenu,
    sidebarImageCreateMenu, setSidebarImageCreateMenu,
    activeSidebarItemKey, setActiveSidebarItemKey,
    showSidebarUploadMenu, setShowSidebarUploadMenu,
    sidebarVideoCreateMenu, setSidebarVideoCreateMenu,
    sidebarUploadMenuRef,
    sidebarImageUploadInputRef,
    sidebarVideoUploadInputRef,
    sidebarUploadMenuCloseTimerRef,
    sidebarNodeInputMenuCloseTimerRef,
    sidebarImageCreateMenuCloseTimerRef,
    sidebarVideoCreateMenuCloseTimerRef,
    sidebarWorkflowMenuCloseTimerRef,
  } = useSidebar();
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
  const [hoveredConnectionId, setHoveredConnectionId] = useState("");
  const [hoveredConnectTarget, setHoveredConnectTarget] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [canvasDropActive, setCanvasDropActive] = useState(false);
  const [canvasDropUploading, setCanvasDropUploading] = useState(null);

  const [isRunning, setIsRunning] = useState(false);
  const runAbortControllerRef = useRef(null);
  const nodeAbortControllersRef = useRef(new Map());
  const cancelledNodeIdsRef = useRef(new Set());
  const runningNodeIdsRef = useRef(new Set());
  const [apiStatus, setApiStatus] = useState("checking");
  const [_globalError, setGlobalError] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [activeHistoryTab, setActiveHistoryTab] = useState("recent");
  const [apiHistory, setApiHistory] = useState([]);
  const [expandedHistoryIds, setExpandedHistoryIds] = useState(new Set());
  const [apiStats, setApiStats] = useState(null);
  const [runToast, setRunToast] = useState(null);
  const nodeElementMapRef = useRef(new Map());
  const [assetLibraryStore, setAssetLibraryStore] = useState(() => loadAssetLibraryStore());
  const [showAssetLibrary, setShowAssetLibrary] = useState(false);
  const [assetLibraryTab, setAssetLibraryTab] = useState("works");
  const [assetLibraryLoaded, setAssetLibraryLoaded] = useState(false);
  const [expandedAssetWorkIds, setExpandedAssetWorkIds] = useState(new Set());
  const [assetLibraryDetailWorkId, setAssetLibraryDetailWorkId] = useState("");
  const [assetLibraryDetailPersonaId, setAssetLibraryDetailPersonaId] = useState("");
  const [editingAssetWorkTitleId, setEditingAssetWorkTitleId] = useState("");
  const [editingAssetWorkTitleDraft, setEditingAssetWorkTitleDraft] = useState("");
  const [pendingUploadNodeId, setPendingUploadNodeId] = useState("");
  const [assetLibraryPickerMode, setAssetLibraryPickerMode] = useState(false);
  const [canvasId] = useState(() => {
    const saved = localStorage.getItem(CANVAS_KEY);
    return saved || newCanvasId();
  });
  const [rightPanelWidth, setRightPanelWidth] = useState(460);
  const [agentStore, setAgentStore] = useState(() => loadAgentStore());
  const [agentInput, setAgentInput] = useState("");
  const [agentInputFocused, setAgentInputFocused] = useState(false);
  const [agentPromptPolishLoading, setAgentPromptPolishLoading] = useState(false);
  const [agentPromptPolishError, setAgentPromptPolishError] = useState("");
  const [promptPolishDialog, setPromptPolishDialog] = useState(null);
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
    agentPlanner: { status: "idle", message: "", detail: "", updatedAt: 0 },
  }));
  const aiChatModelParamsCacheRef = useRef(new Map());
  const aiChatSessionIdRef = useRef("");
  const aiChatHistoryRecordIdRef = useRef("");
  const agentInputRef = useRef(null);
  const agentUploadInputRef = useRef(null);
  const agentComposerRef = useRef(null);
  const workspaceShellRef = useRef(null);
  const assetLibraryPersonaImageInputRef = useRef(null);
  const assetLibraryRestoredRef = useRef(false);
  const viewportRef = useRef(viewport);
  const promptPolishApplyRef = useRef(null);
  const agentCardDragRef = useRef(null);
  const agentConversationBottomRef = useRef(null);
  const rightPanelResizeRef = useRef(null);
  const nodeDragCleanupRef = useRef(null);
  const previewOpenedBySpaceRef = useRef(false);
  const connectionDragSelectionRef = useRef({ userSelect: "", webkitUserSelect: "" });
  const dragSelectionStyleRef = useRef({ userSelect: "", webkitUserSelect: "" });
  const connectionHoverTargetRef = useRef(null);

  const agentSessions = agentStore.sessions ?? EMPTY_LIST;
  const isLeftSidebarCollapsed = true;
  const leftSidebarWidth = isLeftSidebarCollapsed ? 62 : 140;
  const activeAgentSession = useMemo(
    () => agentSessions.find((session) => session.id === agentStore.activeSessionId) || agentSessions[0] || null,
    [agentSessions, agentStore.activeSessionId],
  );
  const agentTurns = activeAgentSession?.turns ?? EMPTY_LIST;
  const activePendingTask = activeAgentSession?.pendingTask || null;
  const isCanvasPromptPending =
    activePendingTask?.intent === "CANVAS" && (activePendingTask?.missing || []).includes("prompt");
  const isAgentMissionRunning = agentTurns.some((turn) => turn.status === "running");
  const hasActiveAgentConversation = agentTurns.length > 0 || !!activePendingTask;
  const hasAgentResultCards = agentResultCards.length > 0;
  const minimizedAgentCards = agentResultCards.filter((card) => card.minimized);
  const assetLibraryDrafts = useMemo(() => assetLibraryStore?.drafts || EMPTY_LIST, [assetLibraryStore]);
  const assetLibraryWorks = useMemo(() => assetLibraryStore?.works || EMPTY_LIST, [assetLibraryStore]);
  const assetLibraryWorkVersions = useMemo(() => assetLibraryStore?.workVersions || EMPTY_LIST, [assetLibraryStore]);
  const assetLibraryAssets = useMemo(() => assetLibraryStore?.assets || EMPTY_LIST, [assetLibraryStore]);
  const assetLibraryPersonas = useMemo(() => assetLibraryStore?.personas || EMPTY_LIST, [assetLibraryStore]);
  const personaMentionOptions = useMemo(
    () => (assetLibraryPersonas || []).filter((item) => String(item?.name || "").trim()),
    [assetLibraryPersonas],
  );
  const assetLibraryVersionsByWorkId = useMemo(() => {
    const next = new Map();
    assetLibraryWorkVersions.forEach((item) => {
      if (!item?.workId) return;
      if (!next.has(item.workId)) next.set(item.workId, []);
      next.get(item.workId).push(item);
    });
    next.forEach((list) => list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
    return next;
  }, [assetLibraryWorkVersions]);
  const assetLibraryAssetsByWorkId = useMemo(() => {
    const next = new Map();
    assetLibraryAssets.forEach((item) => {
      if (!item?.workId) return;
      if (!next.has(item.workId)) next.set(item.workId, []);
      next.get(item.workId).push(item);
    });
    next.forEach((list) => list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));
    return next;
  }, [assetLibraryAssets]);
  const activeCanvasDraft = useMemo(
    () => assetLibraryDrafts.find((item) => item.canvasId === canvasId) || null,
    [assetLibraryDrafts, canvasId],
  );
  const upsertCanvasDraftSnapshot = useCallback((snapshotInput) => {
    const snapshot = cloneAssetLibrarySnapshot(snapshotInput);
    const digest = buildSnapshotDigest(snapshot);
    const now = Date.now();
    const draftRecord = {
      id: `draft_${canvasId}`,
      canvasId,
      title: digest.title,
      summary: digest.summary,
      coverUrl: digest.coverUrl,
      assetCount: digest.assetCount,
      nodeCount: digest.nodeCount,
      connectionCount: digest.connectionCount,
      updatedAt: now,
      snapshot,
    };
    setAssetLibraryStore((prev) => {
      const current = normalizeAssetLibraryStore(prev);
      const draftsNext = [draftRecord, ...((current.drafts || []).filter((item) => item.canvasId !== canvasId))].slice(0, 12);
      const nonDraftAssets = (current.assets || []).filter(
        (item) => !(item.sourceKind === "draft" && item.canvasId === canvasId),
      );
      const draftAssets = buildAssetLibraryAssetsFromSnapshot(snapshot, {
        sourceKind: "draft",
        canvasId,
        createdAt: now,
      });
      const nextStore = {
        ...current,
        drafts: draftsNext,
        assets: mergeAssetLibraryAssets(nonDraftAssets, draftAssets),
      };
      saveAssetLibraryStore(nextStore, canvasId);
      void saveAssetLibraryDbStore(nextStore).catch((error) => {
        console.error("[Workbench] asset_library_indexeddb_save:error", error);
      });
      return nextStore;
    });
  }, [canvasId]);
  const assetLibraryDetailWork = useMemo(
    () => assetLibraryWorks.find((item) => item.id === assetLibraryDetailWorkId) || null,
    [assetLibraryWorks, assetLibraryDetailWorkId],
  );
  const assetLibraryDetailPersona = useMemo(
    () => assetLibraryPersonas.find((item) => item.id === assetLibraryDetailPersonaId) || null,
    [assetLibraryPersonas, assetLibraryDetailPersonaId],
  );
  const assetLibraryDetailVersions = useMemo(
    () => (assetLibraryDetailWork ? assetLibraryVersionsByWorkId.get(assetLibraryDetailWork.id) || EMPTY_LIST : EMPTY_LIST),
    [assetLibraryDetailWork, assetLibraryVersionsByWorkId],
  );
  const assetLibraryDetailLatestVersion = assetLibraryDetailVersions[0] || null;
  const assetLibraryDetailSnapshot = assetLibraryDetailLatestVersion?.snapshot || assetLibraryDetailWork?.snapshot || null;
  const assetLibraryDetailDigest = useMemo(
    () => (assetLibraryDetailSnapshot ? buildSnapshotDigest(assetLibraryDetailSnapshot) : null),
    [assetLibraryDetailSnapshot],
  );
  const assetLibraryDetailAssets = useMemo(() => {
    if (!assetLibraryDetailWork) return EMPTY_LIST;
    const linkedAssets = assetLibraryAssetsByWorkId.get(assetLibraryDetailWork.id) || EMPTY_LIST;
    if (linkedAssets.length > 0) return linkedAssets;
    return Array.isArray(assetLibraryDetailDigest?.mediaItems)
      ? assetLibraryDetailDigest.mediaItems.map((item, index) => ({
          id: `detail_fallback_${assetLibraryDetailWork.id}_${index}`,
          url: item.url,
          kind: item.kind,
          title: item.nodeTitle || (item.kind === "video" ? "视频素材" : "图片素材"),
          nodeTitle: item.nodeTitle,
          updatedAt: assetLibraryDetailWork.updatedAt || assetLibraryDetailWork.createdAt || Date.now(),
          createdAt: assetLibraryDetailWork.createdAt || assetLibraryDetailWork.updatedAt || Date.now(),
          usageCount: 1,
        }))
      : EMPTY_LIST;
  }, [assetLibraryAssetsByWorkId, assetLibraryDetailDigest, assetLibraryDetailWork]);

  useEffect(() => {
    if (assetLibraryDetailWorkId && !assetLibraryDetailWork) {
      setAssetLibraryDetailWorkId("");
    }
  }, [assetLibraryDetailWork, assetLibraryDetailWorkId]);

  useEffect(() => {
    if (assetLibraryDetailPersonaId && !assetLibraryDetailPersona) {
      setAssetLibraryDetailPersonaId("");
    }
  }, [assetLibraryDetailPersona, assetLibraryDetailPersonaId]);

  useEffect(() => {
    if (!pendingUploadNodeId) return;
    const exists = nodes.some((item) => item.id === pendingUploadNodeId);
    if (!exists) {
      setPendingUploadNodeId("");
    }
  }, [nodes, pendingUploadNodeId]);

  useEffect(() => {
    if (!showSidebarUploadMenu) return undefined;
    const handlePointerDown = (event) => {
      if (sidebarUploadMenuRef.current?.contains(event.target)) return;
      setShowSidebarUploadMenu(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [showSidebarUploadMenu]);

  useEffect(() => () => {
    if (sidebarUploadMenuCloseTimerRef.current) {
      window.clearTimeout(sidebarUploadMenuCloseTimerRef.current);
    }
    if (sidebarNodeInputMenuCloseTimerRef.current) {
      window.clearTimeout(sidebarNodeInputMenuCloseTimerRef.current);
    }
    if (sidebarImageCreateMenuCloseTimerRef.current) {
      window.clearTimeout(sidebarImageCreateMenuCloseTimerRef.current);
    }
    if (sidebarVideoCreateMenuCloseTimerRef.current) {
      window.clearTimeout(sidebarVideoCreateMenuCloseTimerRef.current);
    }
    if (sidebarWorkflowMenuCloseTimerRef.current) {
      window.clearTimeout(sidebarWorkflowMenuCloseTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!sidebarNodeInputMenu) return undefined;
    const handlePointerDown = (event) => {
      if (event.target.closest("[data-sidebar-node-input-menu='true']")) return;
      setSidebarNodeInputMenu(null);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [sidebarNodeInputMenu]);

  useEffect(() => {
    if (!sidebarImageCreateMenu) return undefined;
    const handlePointerDown = (event) => {
      if (event.target.closest("[data-sidebar-image-create-menu='true']")) return;
      setSidebarImageCreateMenu(null);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [sidebarImageCreateMenu]);

  useEffect(() => {
    if (!sidebarVideoCreateMenu) return undefined;
    const handlePointerDown = (event) => {
      if (event.target.closest("[data-sidebar-video-create-menu='true']")) return;
      setSidebarVideoCreateMenu(null);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [sidebarVideoCreateMenu]);

  const openPromptPolishPicker = useCallback(({ title = "AI 润色", sourcePrompt = "", variants = [], onUse }) => {
    const normalizedVariants = normalizePromptPolishVariants({ variants });
    if (!normalizedVariants.length) return;
    promptPolishApplyRef.current = typeof onUse === "function" ? onUse : null;
    setPromptPolishDialog({
      title,
      sourcePrompt: String(sourcePrompt || "").trim(),
      variants: normalizedVariants,
    });
  }, []);

  const closePromptPolishPicker = useCallback(() => {
    setPromptPolishDialog(null);
    promptPolishApplyRef.current = null;
  }, []);

  const usePromptPolishVariant = useCallback(
    (variant) => {
      const text = String(variant?.text || "").trim();
      if (!text) return;
      const apply = promptPolishApplyRef.current;
      closePromptPolishPicker();
      if (typeof apply === "function") {
        apply(text);
      }
    },
    [closePromptPolishPicker],
  );

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

  const languageModelOptions = useMemo(
    () => (Array.isArray(aiChatModels.language) && aiChatModels.language.length ? aiChatModels.language : EMPTY_LIST),
    [aiChatModels.language],
  );
  const imageModelRecords = useMemo(
    () => filterDeprecatedImageModels(Array.isArray(aiChatModels.image) && aiChatModels.image.length ? aiChatModels.image : EMPTY_LIST),
    [aiChatModels.image],
  );
  const imageModelOptions = useMemo(
    () => (imageModelRecords.length ? imageModelRecords : filterDeprecatedImageModels(DEFAULT_AI_MODELS)),
    [imageModelRecords],
  );
  const videoModelOptions = useMemo(() => {
    const source = Array.isArray(aiChatModels.video) && aiChatModels.video.length ? aiChatModels.video : DEFAULT_VIDEO_MODELS;
    return source.filter((item) => !DEPRECATED_VIDEO_MODEL_IDS.has(String(item?.id || "").trim()));
  }, [aiChatModels.video]);
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

  const {
    memberInfo,
    setMemberInfo,
    memberInfoLoading,
    memberInfoLoginUrl,
    userAuths,
    userAuthsLoading,
    navigateToMemberLogin,
    memberLabel,
    memberAvatar,
    memberPoint,
    memberTotalPoint,
    isAdminUser,
  } = useMemberInfo(apiFetch, user?.email, {
    updateApiDebugStatus,
    pushApiDebugDetail,
    setRunToast,
  });

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
    if (!defaultVideoModelId) return;
    let changed = false;
    const nextNodes = nodes.map((node) => {
      if (node?.type !== NODE_TYPES.VIDEO_GEN) return node;
      const currentModelId = String(node?.data?.model || "").trim();
      if (!DEPRECATED_VIDEO_MODEL_IDS.has(currentModelId)) return node;
      changed = true;
      return {
        ...node,
        data: {
          ...node.data,
          model: defaultVideoModelId,
        },
      };
  });
  if (changed) setNodes(nextNodes);
  }, [defaultVideoModelId, nodes]);

  useEffect(() => {
    if (!defaultImageModelId) return;
    let changed = false;
    const nextNodes = nodes.map((node) => {
      const isImageNode =
        node?.type === NODE_TYPES.PROCESSOR &&
        (node?.data?.mode === "text2img" || node?.data?.mode === "multi_image_generate");
      if (!isImageNode) return node;
      if (!isDeprecatedImageModel({ id: node?.data?.model })) return node;
      changed = true;
      return {
        ...node,
        data: {
          ...node.data,
          model: defaultImageModelId,
        },
      };
    });
    if (changed) setNodes(nextNodes);
  }, [defaultImageModelId, nodes]);

  useEffect(() => {
    writeAgentDevMode(agentDevMode);
  }, [agentDevMode]);

  const canvasRef = useRef(null);
  const canvasDragDepthRef = useRef(0);
  const canvasHoverClientRef = useRef(null);
  const nodesRef = useRef(nodes);
  const connectionsRef = useRef(connections);

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
    let cancelled = false;
    setAssetLibraryLoaded(false);
    migrateAssetLibraryLocalStorage(loadAssetLibraryStore)
      .then((store) => {
        if (cancelled) return;
        setAssetLibraryStore(normalizeAssetLibraryStore(store));
        setAssetLibraryLoaded(true);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("[Workbench] asset_library_indexeddb_load:error", error);
        setAssetLibraryStore(normalizeAssetLibraryStore(loadAssetLibraryStore()));
        setAssetLibraryLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!assetLibraryLoaded) return;
    saveAssetLibraryStore(assetLibraryStore, canvasId);
    void saveAssetLibraryDbStore(assetLibraryStore).catch((error) => {
      console.error("[Workbench] asset_library_indexeddb_save:error", error);
    });
  }, [assetLibraryLoaded, assetLibraryStore]);
  useEffect(() => {
    if (assetLibraryRestoredRef.current) return;
    const draft = (assetLibraryStore?.drafts || []).find((item) => item.canvasId === canvasId);
    const hasDraftContent =
      (Array.isArray(draft?.snapshot?.nodes) && draft.snapshot.nodes.length > 0) ||
      (Array.isArray(draft?.snapshot?.connections) && draft.snapshot.connections.length > 0);
    if (hasDraftContent) {
      const nextSnapshot = cloneAssetLibrarySnapshot(draft.snapshot);
      setNodes(Array.isArray(nextSnapshot.nodes) ? nextSnapshot.nodes : []);
      setConnections(Array.isArray(nextSnapshot.connections) ? nextSnapshot.connections : []);
      if (nextSnapshot.viewport && typeof nextSnapshot.viewport === "object") {
        setViewport({
          x: Number(nextSnapshot.viewport.x || 0),
          y: Number(nextSnapshot.viewport.y || 0),
          zoom: Number(nextSnapshot.viewport.zoom || 1) || 1,
        });
      }
      setRunToast({ message: "已恢复上次未完成的画布草稿", type: "info" });
      setTimeout(() => setRunToast(null), 2200);
    }
    assetLibraryRestoredRef.current = true;
  }, [assetLibraryStore, canvasId]);
  useEffect(() => {
    if (!assetLibraryRestoredRef.current || !assetLibraryLoaded) return undefined;
    const timer = window.setTimeout(() => {
      const snapshot = cloneAssetLibrarySnapshot({
        nodes,
        connections,
        viewport,
      });
      const digest = buildSnapshotDigest(snapshot);
      const draftRecord = {
        id: `draft_${canvasId}`,
        canvasId,
        title: digest.title,
        summary: digest.summary,
        coverUrl: digest.coverUrl,
        assetCount: digest.assetCount,
        nodeCount: digest.nodeCount,
        connectionCount: digest.connectionCount,
        updatedAt: Date.now(),
        snapshot,
      };
      setAssetLibraryStore((prev) => {
        const current = normalizeAssetLibraryStore(prev);
        const draftsNext = [draftRecord, ...((current.drafts || []).filter((item) => item.canvasId !== canvasId))].slice(0, 12);
        const nonDraftAssets = (current.assets || []).filter(
          (item) => !(item.sourceKind === "draft" && item.canvasId === canvasId),
        );
        const draftAssets = buildAssetLibraryAssetsFromSnapshot(snapshot, {
          sourceKind: "draft",
          canvasId,
          createdAt: Date.now(),
        });
        return {
          ...current,
          drafts: draftsNext,
          assets: mergeAssetLibraryAssets(nonDraftAssets, draftAssets),
        };
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [assetLibraryLoaded, canvasId, connections, nodes, viewport]);
  useEffect(() => {
    const onMouseMove = (event) => {
      const drag = rightPanelResizeRef.current;
      if (!drag) return;
      const delta = drag.startX - event.clientX;
      const next = Math.min(620, Math.max(420, drag.startWidth + delta));
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
            const stepCount = turn?.intent === "DRAMA" ? DRAMA_RUN_STEPS.length : AGENT_RUN_STEPS.length;
            return {
              ...turn,
              stepIndex: ((turn.stepIndex || 0) + 1) % stepCount,
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
    const resultTurns = agentTurns.filter(
      (turn) => ["done", "error"].includes(turn?.status) && turn?.intent !== "STORYBOARD",
    );
    setAgentResultCards((prev) => {
      const prevByTurnId = new Map(prev.map((item) => [item.turnId, item]));
      return resultTurns.map((turn, idx) => {
        const existing = prevByTurnId.get(turn.id);
        if (existing) {
          const targetWidth = getAgentResultCardWidth(turn);
          if (existing.w === targetWidth) return existing;
          return { ...existing, w: targetWidth };
        }
        return {
          id: `agent_card_${makeAgentId()}`,
          turnId: turn.id,
          x: 120 + (idx % 2) * 500,
          y: 120 + Math.floor(idx / 2) * 360,
          w: getAgentResultCardWidth(turn),
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
  useEffect(() => () => {
    if (storyboardAssetHoverCloseTimerRef.current) {
      window.clearTimeout(storyboardAssetHoverCloseTimerRef.current);
      storyboardAssetHoverCloseTimerRef.current = null;
    }
  }, []);
  useEffect(() => {
    return () => {
      if (storyboardShotHoverCloseTimerRef.current) {
        window.clearTimeout(storyboardShotHoverCloseTimerRef.current);
        storyboardShotHoverCloseTimerRef.current = null;
      }
    };
  }, []);
  const [activeArtifact, setActiveArtifact] = useState(null);
  const [hoveredStoryboardAssetCard, setHoveredStoryboardAssetCard] = useState(null);
  const storyboardAssetHoverCloseTimerRef = useRef(null);
  const [hoveredStoryboardShotCard, setHoveredStoryboardShotCard] = useState(null);
  const storyboardShotHoverCloseTimerRef = useRef(null);
  const selectedStoryboardTarget = useMemo(() => {
    if (String(activeArtifact?.kind || "").trim() !== "storyboard_selection") return null;
    const meta = activeArtifact?.meta && typeof activeArtifact.meta === "object" ? activeArtifact.meta : {};
    const typeLabelMap = {
      entity: "角色/主体",
      scene: "场景",
      shot: "镜头",
    };
    return {
      type: String(meta.selectionType || "").trim(),
      typeLabel: typeLabelMap[String(meta.selectionType || "").trim()] || "故事板片段",
      label: String(meta.selectionLabel || "").trim() || "故事板片段",
      summary: String(meta.selectionSummary || "").trim(),
      fromNodeId: String(activeArtifact?.fromNodeId || "").trim(),
    };
  }, [activeArtifact]);

  const activeStoryboardNode = useMemo(() => {
    const artifactNodeId = String(activeArtifact?.fromNodeId || "").trim();
    if (artifactNodeId) {
      const byArtifact = nodes.find((node) => node.id === artifactNodeId && node.type === NODE_TYPES.STORYBOARD_PLAN);
      if (byArtifact) return byArtifact;
    }
    if (selectedNodeIds.size === 1) {
      const selectedId = Array.from(selectedNodeIds)[0];
      const bySelection = nodes.find((node) => node.id === selectedId && node.type === NODE_TYPES.STORYBOARD_PLAN);
      if (bySelection) return bySelection;
    }
    return null;
  }, [activeArtifact, nodes, selectedNodeIds]);

  const selectStoryboardAssetFromPanel = useCallback(
    (assetType, asset, storyboardNode = activeStoryboardNode) => {
      if (!storyboardNode || !asset) return;
      const normalizedType = assetType === "locations" ? "scene" : "entity";
      const selectionId = String(asset?.entity_id || asset?.name || "").trim();
      const selectionLabelPrefix = assetType === "characters" ? "角色" : assetType === "subjects" ? "主体" : "场景";
      setActiveArtifact({
        kind: "storyboard_selection",
        fromNodeId: storyboardNode.id,
        meta: {
          selectionType: normalizedType,
          selectionId,
          selectionLabel: `${selectionLabelPrefix} · ${String(asset?.name || "").trim()}`,
          selectionSummary: String(asset?.core_description || asset?.description || "").trim(),
          payload:
            assetType === "locations"
              ? {
                  sceneId: "",
                  sceneNo: null,
                  sceneTitle: String(asset?.name || "").trim(),
                  sceneLocation: String(asset?.name || "").trim(),
                  locationId: selectionId,
                }
              : {
                  entityId: selectionId,
                  entityName: String(asset?.name || "").trim(),
                  entityType: selectionLabelPrefix,
                },
        },
      });
      setAgentInputFocused(true);
    },
    [activeStoryboardNode],
  );

  const focusRelatedStoryboardShot = useCallback(
    (assetType, asset, storyboardNode = activeStoryboardNode) => {
      if (!storyboardNode || !asset) return;
      const plan = storyboardNode.data?.storyboard_plan || {};
      const scenes = Array.isArray(plan?.scenes) ? plan.scenes : [];
      const assetName = String(asset?.name || "").trim();
      const matchingScene =
        assetType === "locations"
          ? scenes.find((scene) => String(scene?.location || "").trim() === assetName)
          : scenes.find((scene) =>
              (Array.isArray(scene?.shots) ? scene.shots : []).some((shot) =>
                (Array.isArray(shot?.referenced_entities) ? shot.referenced_entities : []).includes(assetName),
              ),
            );
      if (matchingScene) {
        const firstShot = (Array.isArray(matchingScene?.shots) ? matchingScene.shots : [])[0];
        if (firstShot) {
          setActiveArtifact({
            kind: "storyboard_selection",
            fromNodeId: storyboardNode.id,
            meta: {
              selectionType: "shot",
              selectionId: String(firstShot?.shot_id || "").trim(),
              selectionLabel: `镜头 ${firstShot?.shot_no || 1} · ${String(matchingScene?.location || matchingScene?.title || "").trim()}`,
              selectionSummary: String(firstShot?.visual_description || "").trim(),
              payload: {
                shotId: String(firstShot?.shot_id || "").trim(),
                shotNo: firstShot?.shot_no || 1,
                sceneId: String(matchingScene?.scene_id || "").trim(),
                sceneTitle: String(matchingScene?.title || "").trim(),
                sceneLocation: String(matchingScene?.location || "").trim(),
              },
            },
          });
        }
      }
      setSelectedNodeIds(new Set([storyboardNode.id]));
    },
    [activeStoryboardNode],
  );

  const resolveStoryboardAssetForMention = useCallback((storyboardNode, mentionEntry) => {
    if (!storyboardNode || !mentionEntry?.assetType) return null;
    const plan = storyboardNode.data?.storyboard_plan || {};
    const entities = plan?.entities || {};
    const collection = Array.isArray(entities?.[mentionEntry.assetType]) ? entities[mentionEntry.assetType] : [];
    const assetId = String(mentionEntry.assetId || "").trim();
    const assetName = stripStoryboardDisplayIds(mentionEntry.assetName || mentionEntry.term || "");
    return (
      collection.find((item) => String(item?.entity_id || "").trim() === assetId) ||
      collection.find((item) => stripStoryboardDisplayIds(item?.name || "") === assetName) ||
      null
    );
  }, []);

  const closeStoryboardAssetHoverCard = useCallback(() => {
    if (storyboardAssetHoverCloseTimerRef.current) {
      window.clearTimeout(storyboardAssetHoverCloseTimerRef.current);
      storyboardAssetHoverCloseTimerRef.current = null;
    }
    setHoveredStoryboardAssetCard(null);
  }, []);

  const scheduleCloseStoryboardAssetHoverCard = useCallback(() => {
    if (storyboardAssetHoverCloseTimerRef.current) {
      window.clearTimeout(storyboardAssetHoverCloseTimerRef.current);
    }
    storyboardAssetHoverCloseTimerRef.current = window.setTimeout(() => {
      setHoveredStoryboardAssetCard((current) => (current?.sticky ? current : null));
      storyboardAssetHoverCloseTimerRef.current = null;
    }, 120);
  }, []);

  const closeStoryboardShotHoverCard = useCallback(() => {
    if (storyboardShotHoverCloseTimerRef.current) {
      window.clearTimeout(storyboardShotHoverCloseTimerRef.current);
      storyboardShotHoverCloseTimerRef.current = null;
    }
    setHoveredStoryboardShotCard(null);
  }, []);

  const scheduleCloseStoryboardShotHoverCard = useCallback(() => {
    if (storyboardShotHoverCloseTimerRef.current) {
      window.clearTimeout(storyboardShotHoverCloseTimerRef.current);
    }
    storyboardShotHoverCloseTimerRef.current = window.setTimeout(() => {
      setHoveredStoryboardShotCard((current) => (current?.sticky ? current : null));
      storyboardShotHoverCloseTimerRef.current = null;
    }, 300);
  }, []);

  const openStoryboardShotHoverCard = useCallback((storyboardNode, scene, shot, chipElement) => {
    if (!storyboardNode || !shot) return;
    if (storyboardShotHoverCloseTimerRef.current) {
      window.clearTimeout(storyboardShotHoverCloseTimerRef.current);
      storyboardShotHoverCloseTimerRef.current = null;
    }
    const rect = chipElement?.getBoundingClientRect?.() || { left: 0, bottom: 0 };
    const x = Math.min(rect.left, Math.max(window.innerWidth - 380, 24));
    const y = Math.min(rect.bottom + 6, Math.max(window.innerHeight - 480, 24));
    setHoveredStoryboardShotCard({ nodeId: storyboardNode.id, scene, shot, x, y, sticky: false });
  }, []);

  const openStoryboardAssetHoverCard = useCallback(
    (storyboardNode, mentionEntry, event) => {
      if (!storyboardNode || !mentionEntry?.assetType) return;
      const asset = resolveStoryboardAssetForMention(storyboardNode, mentionEntry);
      if (!asset) return;
      if (storyboardAssetHoverCloseTimerRef.current) {
        window.clearTimeout(storyboardAssetHoverCloseTimerRef.current);
        storyboardAssetHoverCloseTimerRef.current = null;
      }
      const x = Math.min((event?.clientX || 0) + 14, Math.max(window.innerWidth - 380, 24));
      const y = Math.min((event?.clientY || 0) + 14, Math.max(window.innerHeight - 420, 24));
      setHoveredStoryboardAssetCard({
        nodeId: storyboardNode.id,
        assetType: mentionEntry.assetType,
        asset,
        x,
        y,
        sticky: false,
        tweakText: "",
        customPrompt: "",
      });
    },
    [resolveStoryboardAssetForMention],
  );

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
  return { nodes: nextNodes, connections: nextConns, viewport: finalViewport || viewportRef.current };
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

  useEffect(() => {
    if (!sidebarWorkflowMenu) return undefined;
    const handlePointerDown = (event) => {
      if (workspaceShellRef.current?.contains(event.target)) {
        const target = event.target;
        if (target?.closest?.("[data-sidebar-workflow-menu='true']") || target?.closest?.("[data-sidebar-workflow-trigger='true']")) {
          return;
        }
      }
      setSidebarWorkflowMenu(null);
    };
    document.addEventListener("mousedown", handlePointerDown, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown, true);
    };
  }, [sidebarWorkflowMenu]);

  const pushHistory = useCallback(() => {
    const s = {
      nodes: nodes.map(cloneCanvasNodeForHistory),
      connections: connections.map((connection) => ({ ...connection })),
    };
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
  const canUndo = historyStep > 0;
  const canRedo = historyStep < history.length - 1;

  const restoreSnapshotToCanvas = useCallback(
    (snapshot, successMessage = "已恢复到画布") => {
      if (!snapshot || typeof snapshot !== "object") return;
      pushHistory();
      const nextSnapshot = cloneAssetLibrarySnapshot(snapshot);
      setNodes(Array.isArray(nextSnapshot.nodes) ? nextSnapshot.nodes : []);
      setConnections(Array.isArray(nextSnapshot.connections) ? nextSnapshot.connections : []);
      if (nextSnapshot.viewport && typeof nextSnapshot.viewport === "object") {
        setViewport({
          x: Number(nextSnapshot.viewport.x || 0),
          y: Number(nextSnapshot.viewport.y || 0),
          zoom: Number(nextSnapshot.viewport.zoom || 1) || 1,
        });
      }
      setSelectedNodeIds(new Set());
      setSelectedConnectionIds(new Set());
      setActiveNodeId(null);
      setShowAssetLibrary(false);
      setAssetLibraryDetailWorkId("");
      setAssetLibraryDetailPersonaId("");
      setRunToast({ message: successMessage, type: "info" });
      setTimeout(() => setRunToast(null), 2200);
    },
    [pushHistory],
  );

  const focusCanvasNode = useCallback((nodeId) => {
    const focusNode = (targetNode) => {
      if (!targetNode) return;

      const width =
        targetNode.type === NODE_TYPES.STORYBOARD_PLAN
          ? 1280
          : targetNode.type === NODE_TYPES.TEXT_INPUT
          ? 320
          : targetNode.type === NODE_TYPES.ROLE_INPUT
          ? 76
          : 280;
      const height =
        targetNode.type === NODE_TYPES.STORYBOARD_PLAN
          ? 620
          : targetNode.type === NODE_TYPES.ROLE_INPUT
          ? 76
          : 200;

      setSelectedNodeIds(new Set([targetNode.id]));
      setSelectedConnectionIds(new Set());
      setActiveNodeId(targetNode.id);

      const canvasEl = canvasRef.current;
      if (!canvasEl) return;
      const zoom = viewportRef.current?.zoom || 1;
      const centerX = Number(targetNode.x || 0) + width / 2;
      const centerY = Number(targetNode.y || 0) + height / 2;
      setViewport((prev) => ({
        ...prev,
        x: canvasEl.clientWidth / 2 - centerX * zoom,
        y: canvasEl.clientHeight / 2 - centerY * zoom,
      }));
    };

    const normalizedNodeId = String(nodeId || "").trim();
    const currentNodes = nodesRef.current || [];
    const directTarget = normalizedNodeId
      ? currentNodes.find((node) => node.id === normalizedNodeId)
      : null;
    if (directTarget) {
      focusNode(directTarget);
      return;
    }

    const latestStoryboardNode = [...currentNodes].reverse().find((node) => node.type === NODE_TYPES.STORYBOARD_PLAN);
    if (latestStoryboardNode) {
      focusNode(latestStoryboardNode);
      return;
    }

    const draftNodes = Array.isArray(activeCanvasDraft?.snapshot?.nodes) ? activeCanvasDraft.snapshot.nodes : [];
    const draftTarget = normalizedNodeId
      ? draftNodes.find((node) => node.id === normalizedNodeId)
      : [...draftNodes].reverse().find((node) => node.type === NODE_TYPES.STORYBOARD_PLAN);
    if (!draftTarget || !activeCanvasDraft?.snapshot) return;

    restoreSnapshotToCanvas(activeCanvasDraft.snapshot, "已恢复故事板到画布");
    window.setTimeout(() => {
      const restoredNodes = nodesRef.current || [];
      const restoredTarget = normalizedNodeId
        ? restoredNodes.find((node) => node.id === normalizedNodeId)
        : [...restoredNodes].reverse().find((node) => node.type === NODE_TYPES.STORYBOARD_PLAN);
      if (restoredTarget) focusNode(restoredTarget);
    }, 80);
  }, [activeCanvasDraft, restoreSnapshotToCanvas]);

  const saveCanvasToAssetLibrary = useCallback((forceNewWork = false) => {
    if (nodes.length === 0 && connections.length === 0) {
      setRunToast({ message: "当前画布为空，先添加素材或工作流再保存", type: "error" });
      setTimeout(() => setRunToast(null), 2200);
      return;
    }
    const snapshot = cloneAssetLibrarySnapshot({
      nodes,
      connections,
      viewport,
    });
    const digest = buildSnapshotDigest(snapshot);
    const now = Date.now();
    setAssetLibraryStore((prev) => {
      const current = normalizeAssetLibraryStore(prev);
      const existingWork = forceNewWork ? null : (current.works || []).find((item) => item.canvasId === canvasId) || null;
      const workId = existingWork?.id || `work_${generateId()}`;
      const existingVersions = (current.workVersions || []).filter((item) => item.workId === workId);
      const versionRecord = {
        id: `work_version_${generateId()}`,
        workId,
        canvasId,
        title: digest.title,
        summary: digest.summary,
        coverUrl: digest.coverUrl,
        assetCount: digest.assetCount,
        nodeCount: digest.nodeCount,
        connectionCount: digest.connectionCount,
        versionIndex: existingVersions.length + 1,
        snapshot,
        createdAt: now,
      };
      const workRecord = {
        ...(existingWork || {}),
        id: workId,
        kind: "work",
        canvasId,
        title: digest.title,
        summary: digest.summary,
        coverUrl: digest.coverUrl,
        assetCount: digest.assetCount,
        nodeCount: digest.nodeCount,
        connectionCount: digest.connectionCount,
        latestVersionId: versionRecord.id,
        versionCount: existingVersions.length + 1,
        createdAt: existingWork?.createdAt || now,
        updatedAt: now,
        snapshot,
      };
      const nextWorks = existingWork
        ? [workRecord, ...(current.works || []).filter((item) => item.id !== workId)]
        : [workRecord, ...(current.works || [])];
      const nextAssets = mergeAssetLibraryAssets(
        current.assets,
        buildAssetLibraryAssetsFromSnapshot(snapshot, {
          sourceKind: "work_version",
          workId,
          versionId: versionRecord.id,
          canvasId,
          createdAt: now,
        }),
      );
      return {
        ...current,
        works: nextWorks.slice(0, 30),
        workVersions: [versionRecord, ...(current.workVersions || [])].slice(0, 200),
        assets: nextAssets,
        drafts: (current.drafts || []).map((item) =>
          item.canvasId === canvasId
            ? {
                ...item,
                title: workRecord.title,
                summary: workRecord.summary,
                coverUrl: workRecord.coverUrl,
                assetCount: workRecord.assetCount,
                nodeCount: workRecord.nodeCount,
                connectionCount: workRecord.connectionCount,
                snapshot,
                updatedAt: now,
              }
            : item,
        ),
      };
    });
    setShowAssetLibrary(true);
    setAssetLibraryTab("works");
    setAssetLibraryDetailWorkId("");
    setAssetLibraryDetailPersonaId("");
    setRunToast({ message: forceNewWork ? "已另存为新作品" : "已保存到作品库，并追加一个新版本", type: "info" });
    setTimeout(() => setRunToast(null), 2200);
  }, [canvasId, connections, nodes, viewport]);

  const saveCurrentCanvasAsWork = useCallback(() => {
    saveCanvasToAssetLibrary(false);
  }, [saveCanvasToAssetLibrary]);

  const saveCurrentCanvasAsNewWork = useCallback(() => {
    saveCanvasToAssetLibrary(true);
  }, [saveCanvasToAssetLibrary]);

  const beginEditAssetWorkTitle = useCallback((work) => {
    const workId = String(work?.id || "").trim();
    if (!workId) return;
    setEditingAssetWorkTitleId(workId);
    setEditingAssetWorkTitleDraft(String(work?.title || "").trim() || "未命名作品");
  }, []);

  const cancelEditAssetWorkTitle = useCallback(() => {
    setEditingAssetWorkTitleId("");
    setEditingAssetWorkTitleDraft("");
  }, []);

  const commitEditAssetWorkTitle = useCallback((workId) => {
    const normalizedWorkId = String(workId || editingAssetWorkTitleId || "").trim();
    if (!normalizedWorkId) return;
    const nextTitle = String(editingAssetWorkTitleDraft || "").trim() || "未命名作品";
    setAssetLibraryStore((prev) => {
      const current = normalizeAssetLibraryStore(prev);
      return {
        ...current,
        works: (current.works || []).map((item) =>
          item.id === normalizedWorkId
            ? {
                ...item,
                title: nextTitle,
                updatedAt: Date.now(),
              }
            : item,
        ),
      };
    });
    setEditingAssetWorkTitleId("");
    setEditingAssetWorkTitleDraft("");
  }, [editingAssetWorkTitleDraft, editingAssetWorkTitleId]);

  const createAssetLibraryPersona = useCallback(() => {
    const now = Date.now();
    const persona = {
      id: `persona_${generateId()}`,
      name: "未命名人物",
      description: "点击进入详情编辑人物介绍",
      referenceImage: "",
      voiceDescription: "",
      relationshipNetwork: "",
      createdAt: now,
      updatedAt: now,
    };
    setAssetLibraryStore((prev) => {
      const current = normalizeAssetLibraryStore(prev);
      return {
        ...current,
        personas: [persona, ...(current.personas || [])].slice(0, 100),
      };
    });
    setAssetLibraryTab("personas");
    setAssetLibraryDetailWorkId("");
    setAssetLibraryDetailPersonaId(persona.id);
  }, []);

  const updateAssetLibraryPersona = useCallback((personaId, patch) => {
    const normalizedPersonaId = String(personaId || "").trim();
    if (!normalizedPersonaId || !patch || typeof patch !== "object") return;
    setAssetLibraryStore((prev) => {
      const current = normalizeAssetLibraryStore(prev);
      return {
        ...current,
        personas: (current.personas || []).map((item) =>
          item.id === normalizedPersonaId
            ? normalizeAssetLibraryPersona({
                ...item,
                ...patch,
                updatedAt: Date.now(),
              })
            : item,
        ),
      };
    });
  }, []);

  const removeAssetLibraryPersona = useCallback((personaId) => {
    const normalizedPersonaId = String(personaId || "").trim();
    if (!normalizedPersonaId) return;
    setAssetLibraryStore((prev) => {
      const current = normalizeAssetLibraryStore(prev);
      return {
        ...current,
        personas: (current.personas || []).filter((item) => item.id !== normalizedPersonaId),
      };
    });
    setAssetLibraryDetailPersonaId("");
  }, []);

  const handleAssetLibraryPersonaReferenceUpload = useCallback(
    async (event) => {
      const files = Array.from(event.target.files || []).filter((file) => isImageFileLike(file));
      if (!files.length) {
        event.target.value = "";
        return;
      }
      try {
        const [referenceImage] = await readFilesAsDataUrls(files.slice(0, 1));
        if (referenceImage && assetLibraryDetailPersonaId) {
          updateAssetLibraryPersona(assetLibraryDetailPersonaId, { referenceImage });
        }
      } finally {
        event.target.value = "";
      }
    },
    [assetLibraryDetailPersonaId, updateAssetLibraryPersona],
  );

  const removeAssetLibraryItem = useCallback((kind, id) => {
    setAssetLibraryStore((prev) => {
      const current = normalizeAssetLibraryStore(prev);
      if (kind === "works") {
        return {
          ...current,
          works: (current.works || []).filter((item) => item.id !== id),
          workVersions: (current.workVersions || []).filter((item) => item.workId !== id),
        };
      }
      return {
        ...current,
        [kind]: (current?.[kind] || []).filter((item) => item.id !== id),
      };
    });
  }, []);

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

  const deleteConnectionById = useCallback((connectionId) => {
    if (!connectionId) return;
    pushHistory();
    setConnections((prev) => prev.filter((conn) => conn.id !== connectionId));
    setHoveredConnectionId((prev) => (prev === connectionId ? "" : prev));
    setSelectedConnectionIds((prev) => {
      const next = new Set(prev);
      next.delete(connectionId);
      return next;
    });
  }, [pushHistory]);

  const handleConnectionClick = useCallback((event, connectionId) => {
    event.stopPropagation();
    const shouldAppend = event.shiftKey || event.ctrlKey || event.metaKey;
    setSelectedNodeIds(new Set());
    setSelectedConnectionIds((prev) => {
      if (!shouldAppend) return new Set([connectionId]);
      const next = new Set(prev);
      if (next.has(connectionId)) next.delete(connectionId);
      else next.add(connectionId);
      return next;
    });
  }, []);

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
            isPreviewableArtifact(activeArtifact) &&
            activeArtifact?.kind === "image" &&
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

  const arrangeCanvasNodes = useCallback(() => {
    const currentNodes = Array.isArray(nodesRef.current) ? nodesRef.current : [];
    if (currentNodes.length === 0) return;

    pushHistory();

    const currentConnections = Array.isArray(connectionsRef.current) ? connectionsRef.current : [];
    const nodeIds = new Set(currentNodes.map((node) => node.id));
    const validConnections = currentConnections.filter((conn) => nodeIds.has(conn.from) && nodeIds.has(conn.to));
    const outgoing = new Map(currentNodes.map((node) => [node.id, []]));
    const incomingCount = new Map(currentNodes.map((node) => [node.id, 0]));

    validConnections.forEach((conn) => {
      outgoing.get(conn.from)?.push(conn.to);
      incomingCount.set(conn.to, (incomingCount.get(conn.to) || 0) + 1);
    });

    const rankById = new Map();
    const queue = currentNodes
      .filter((node) => (incomingCount.get(node.id) || 0) === 0)
      .sort((a, b) => (a.x - b.x) || (a.y - b.y));
    const indegree = new Map(incomingCount);

    queue.forEach((node) => rankById.set(node.id, 0));
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const node = queue[cursor];
      const currentRank = rankById.get(node.id) || 0;
      (outgoing.get(node.id) || []).forEach((targetId) => {
        rankById.set(targetId, Math.max(rankById.get(targetId) || 0, currentRank + 1));
        indegree.set(targetId, Math.max(0, (indegree.get(targetId) || 0) - 1));
        if ((indegree.get(targetId) || 0) === 0) {
          const targetNode = currentNodes.find((item) => item.id === targetId);
          if (targetNode) queue.push(targetNode);
        }
      });
    }

    currentNodes.forEach((node) => {
      if (!rankById.has(node.id)) {
        const predecessorRanks = validConnections
          .filter((conn) => conn.to === node.id && rankById.has(conn.from))
          .map((conn) => rankById.get(conn.from) + 1);
        rankById.set(node.id, predecessorRanks.length ? Math.max(...predecessorRanks) : 0);
      }
    });

    const getNodeSize = (node) => {
      const element = nodeElementMapRef.current.get(node.id);
      const width =
        element?.offsetWidth ||
        (node.type === NODE_TYPES.STORYBOARD_PLAN
          ? 1280
          : node.type === NODE_TYPES.TEXT_INPUT
          ? 320
          : node.type === NODE_TYPES.ROLE_INPUT
          ? 76
          : 280);
      const height = element?.offsetHeight || (node.type === NODE_TYPES.STORYBOARD_PLAN ? 620 : node.type === NODE_TYPES.ROLE_INPUT ? 76 : 180);
      return { width, height };
    };

    const layers = new Map();
    currentNodes.forEach((node) => {
      const rank = rankById.get(node.id) || 0;
      if (!layers.has(rank)) layers.set(rank, []);
      layers.get(rank).push(node);
    });

    const sortedRanks = Array.from(layers.keys()).sort((a, b) => a - b);
    const layerOrderByRank = new Map();
    sortedRanks.forEach((rank) => {
      layerOrderByRank.set(
        rank,
        layers.get(rank).slice().sort((a, b) => (a.y - b.y) || (a.x - b.x)),
      );
    });

    const getNeighborAverageOrder = (nodeId, neighborDirection, orderById) => {
      const neighborIds = validConnections
        .filter((conn) => (neighborDirection === "incoming" ? conn.to === nodeId : conn.from === nodeId))
        .map((conn) => (neighborDirection === "incoming" ? conn.from : conn.to))
        .filter((id) => orderById.has(id));
      if (!neighborIds.length) return null;
      return neighborIds.reduce((sum, id) => sum + orderById.get(id), 0) / neighborIds.length;
    };

    for (let pass = 0; pass < 4; pass += 1) {
      const forwardRanks = sortedRanks.slice(1);
      forwardRanks.forEach((rank) => {
        const orderById = new Map();
        sortedRanks.forEach((rankForOrder) => {
          (layerOrderByRank.get(rankForOrder) || []).forEach((node, index) => {
            orderById.set(node.id, index);
          });
        });
        layerOrderByRank.set(
          rank,
          (layerOrderByRank.get(rank) || []).slice().sort((a, b) => {
            const aScore = getNeighborAverageOrder(a.id, "incoming", orderById);
            const bScore = getNeighborAverageOrder(b.id, "incoming", orderById);
            if (aScore !== null || bScore !== null) return (aScore ?? Number.MAX_SAFE_INTEGER) - (bScore ?? Number.MAX_SAFE_INTEGER);
            return (a.y - b.y) || (a.x - b.x);
          }),
        );
      });

      const backwardRanks = sortedRanks.slice(0, -1).reverse();
      backwardRanks.forEach((rank) => {
        const orderById = new Map();
        sortedRanks.forEach((rankForOrder) => {
          (layerOrderByRank.get(rankForOrder) || []).forEach((node, index) => {
            orderById.set(node.id, index);
          });
        });
        layerOrderByRank.set(
          rank,
          (layerOrderByRank.get(rank) || []).slice().sort((a, b) => {
            const aScore = getNeighborAverageOrder(a.id, "outgoing", orderById);
            const bScore = getNeighborAverageOrder(b.id, "outgoing", orderById);
            if (aScore !== null || bScore !== null) return (aScore ?? Number.MAX_SAFE_INTEGER) - (bScore ?? Number.MAX_SAFE_INTEGER);
            return (a.y - b.y) || (a.x - b.x);
          }),
        );
      });
    }

    const baseX = Math.min(...currentNodes.map((node) => Number(node.x) || 0));
    const baseY = Math.min(...currentNodes.map((node) => Number(node.y) || 0));
    const gapX = 300;
    const gapY = 84;
    const layerMetrics = sortedRanks.map((rank) => {
      const layerNodes = layerOrderByRank.get(rank) || [];
      const sizes = layerNodes.map(getNodeSize);
      const width = Math.max(...sizes.map((size) => size.width), 0);
      const height = sizes.reduce((sum, size) => sum + size.height, 0) + Math.max(0, sizes.length - 1) * gapY;
      return { rank, nodes: layerNodes, sizes, width, height };
    });
    const maxLayerHeight = Math.max(...layerMetrics.map((layer) => layer.height), 0);
    const xByRank = new Map();
    let xCursor = baseX;
    layerMetrics.forEach((layer) => {
      xByRank.set(layer.rank, xCursor);
      xCursor += layer.width + gapX;
    });

    const arrangedPositions = new Map();
    layerMetrics.forEach((layer) => {
      let yCursor = baseY + Math.max(0, (maxLayerHeight - layer.height) / 2);
      layer.nodes.forEach((node, index) => {
        const size = layer.sizes[index] || getNodeSize(node);
        arrangedPositions.set(node.id, {
          x: xByRank.get(layer.rank) || baseX,
          y: yCursor,
        });
        yCursor += size.height + gapY;
      });
    });

    const nextNodes = currentNodes.map((node) => ({
      ...node,
      ...(arrangedPositions.get(node.id) || {}),
    }));
    setNodes(nextNodes);
    setSelectedNodeIds(new Set());
    setSelectedConnectionIds(new Set());

    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (canvasRect && nextNodes.length > 0) {
      const padding = 120;
      const bounds = nextNodes.reduce(
        (acc, node) => {
          const size = getNodeSize(node);
          return {
            minX: Math.min(acc.minX, node.x),
            minY: Math.min(acc.minY, node.y),
            maxX: Math.max(acc.maxX, node.x + size.width),
            maxY: Math.max(acc.maxY, node.y + size.height),
          };
        },
        { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
      );
      const contentWidth = Math.max(1, bounds.maxX - bounds.minX + padding * 2);
      const contentHeight = Math.max(1, bounds.maxY - bounds.minY + padding * 2);
      const nextZoom = Math.min(1, Math.max(MIN_ZOOM, Math.min(canvasRect.width / contentWidth, canvasRect.height / contentHeight)));
      setViewport({
        x: (canvasRect.width - (bounds.maxX - bounds.minX) * nextZoom) / 2 - bounds.minX * nextZoom,
        y: (canvasRect.height - (bounds.maxY - bounds.minY) * nextZoom) / 2 - bounds.minY * nextZoom,
        zoom: nextZoom,
      });
    }

    setRunToast({ message: "已辅助整理画布节点", type: "info" });
    setTimeout(() => setRunToast(null), 1800);
  }, [pushHistory]);

  const handleWheel = (e) => {
    if (isEditableElement(e.target)) {
      return;
    }
    if (e.target instanceof Element && e.target.closest('[data-agent-card-root="true"]')) {
      return;
    }
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
      e.preventDefault();
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

  e.preventDefault();
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
      if (canvasRef.current?.contains(e.target)) {
        canvasHoverClientRef.current = { x: e.clientX, y: e.clientY };
      }
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

  useEffect(() => {
    const shouldDisableSelection = interactionMode === "selecting" || interactionMode === "dragging_node";
    const bodyStyle = document.body?.style;

    if (!shouldDisableSelection) {
      if (bodyStyle) {
        bodyStyle.userSelect = dragSelectionStyleRef.current.userSelect;
        bodyStyle.webkitUserSelect = dragSelectionStyleRef.current.webkitUserSelect;
      }
      return undefined;
    }

    if (bodyStyle) {
      dragSelectionStyleRef.current = {
        userSelect: bodyStyle.userSelect,
        webkitUserSelect: bodyStyle.webkitUserSelect,
      };
      bodyStyle.userSelect = "none";
      bodyStyle.webkitUserSelect = "none";
    }

    return () => {
      if (bodyStyle) {
        bodyStyle.userSelect = dragSelectionStyleRef.current.userSelect;
        bodyStyle.webkitUserSelect = dragSelectionStyleRef.current.webkitUserSelect;
      }
    };
  }, [interactionMode]);

  const getCursor = () => (interactionMode === "panning" || isSpacePressed ? "grab" : interactionMode === "dragging_node" ? "grabbing" : "default");

  const createMediaUploadNodeAt = useCallback((point, mediaItems, mediaKind = "mixed") => {
    const safeMediaItems = Array.isArray(mediaItems) ? mediaItems.filter(Boolean) : [];
    if (!safeMediaItems.length) return;
    const position = getMediaUploadNodePosition(point);
    const normalizedMediaKind =
      normalizeInputMediaKind(mediaKind) === "mixed"
        ? inferMediaKindFromMediaItems(safeMediaItems)
        : normalizeInputMediaKind(mediaKind);

    pushHistory();
    const nodeId = generateId();
    const nextNode = {
      id: nodeId,
      type: NODE_TYPES.INPUT,
      x: position.x,
      y: position.y,
      data: {
        images: safeMediaItems,
        mediaKind: normalizedMediaKind,
        title: getReferenceNodeTitle(normalizedMediaKind),
      },
    };

    setNodes((prev) => [...prev, nextNode]);
    setSelectedNodeIds(new Set([nodeId]));
    setSelectedConnectionIds(new Set());
    setActiveNodeId(nodeId);
  }, [pushHistory]);

  const getCanvasViewportCenterPoint = useCallback(() => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const centerX = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const centerY = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
    return screenToCanvas(centerX, centerY);
  }, [screenToCanvas]);

  const createPersonaInputNodeAt = useCallback((persona, point = null) => {
    const normalizedPersona = normalizeAssetLibraryPersona(persona);
    if (!normalizedPersona.id) return;
    const targetPoint = point || getCanvasViewportCenterPoint();
    const nodeId = generateId();
    const referenceImage = String(normalizedPersona.referenceImage || "").trim();
    const structuredProfile = buildRoleProfileStructuredOutput({
      roleName: normalizedPersona.name,
      characterSetting: normalizedPersona.description,
      relationshipNetwork: normalizedPersona.relationshipNetwork,
      worldviewBackground: "",
    });
    const structuredText = JSON.stringify(structuredProfile, null, 2);

    pushHistory();
    setNodes((prev) => [
      ...prev,
      {
        id: nodeId,
        type: NODE_TYPES.ROLE_INPUT,
        x: targetPoint.x - 38,
        y: targetPoint.y - 38,
        data: {
          personaId: normalizedPersona.id,
          name: normalizedPersona.name || "未命名人物",
          description: normalizedPersona.description,
          referenceImage,
          voiceDescription: normalizedPersona.voiceDescription,
          relationshipNetwork: normalizedPersona.relationshipNetwork,
          images: referenceImage ? [referenceImage] : [],
          structuredProfile,
          text: structuredText,
        },
      },
    ]);
    setSelectedNodeIds(new Set([nodeId]));
    setSelectedConnectionIds(new Set());
    setActiveNodeId(nodeId);
    setShowAssetLibrary(false);
    setAssetLibraryDetailWorkId("");
    setAssetLibraryDetailPersonaId("");
    setAssetLibraryPickerMode(false);
    setRunToast({ message: "已添加角色到画布，并完成结构化", type: "info" });
    setTimeout(() => setRunToast(null), 2200);
  }, [getCanvasViewportCenterPoint, pushHistory]);

  const handleSidebarMediaUpload = useCallback(
    async (event, mediaKind = "mixed") => {
      const normalizedMediaKind = normalizeInputMediaKind(mediaKind);
      const files = Array.from(event.target.files || []).filter((file) => {
        if (normalizedMediaKind === "image") return isImageFileLike(file);
        if (normalizedMediaKind === "video") return isVideoFileLike(file);
        return isMediaFileLike(file);
      });
      if (!files.length) {
        event.target.value = "";
        return;
      }
      try {
        const mediaItems = await readFilesAsDataUrls(files);
        createMediaUploadNodeAt(getCanvasViewportCenterPoint(), mediaItems, normalizedMediaKind);
        const imageCount = files.filter((file) => isImageFileLike(file)).length;
        const videoCount = files.length - imageCount;
        setRunToast({
          message: `已添加到画布：${files.length} 个文件${imageCount ? ` · ${imageCount} 张图片` : ""}${videoCount ? ` · ${videoCount} 个视频` : ""}`,
          type: "info",
        });
        setTimeout(() => setRunToast(null), 2200);
      } finally {
        event.target.value = "";
      }
    },
    [createMediaUploadNodeAt, getCanvasViewportCenterPoint],
  );

  const getCanvasPastePoint = useCallback(() => {
    const hoverPoint = canvasHoverClientRef.current;
    if (hoverPoint) {
      return screenToCanvas(hoverPoint.x, hoverPoint.y);
    }
    return getCanvasViewportCenterPoint();
  }, [getCanvasViewportCenterPoint, screenToCanvas]);

  const restoreAssetToCanvas = useCallback(
    (asset) => {
      const url = String(asset?.url || "").trim();
      if (!url) return;
      createMediaUploadNodeAt(getCanvasViewportCenterPoint(), [url], isVideoContent(url) ? "video" : "image");
      setShowAssetLibrary(false);
      setAssetLibraryDetailWorkId("");
      setAssetLibraryDetailPersonaId("");
      setAssetLibraryPickerMode(false);
      setRunToast({ message: "已将素材放回画布", type: "info" });
      setTimeout(() => setRunToast(null), 2200);
      setAssetLibraryStore((prev) => {
        const current = normalizeAssetLibraryStore(prev);
        return {
          ...current,
          assets: (current.assets || []).map((item) =>
            item.id === asset.id
              ? {
                  ...item,
                  lastUsedAt: Date.now(),
                  usageCount: (Number(item.usageCount || 0) || 0) + 1,
                }
              : item,
          ),
        };
      });
    },
    [createMediaUploadNodeAt, getCanvasViewportCenterPoint],
  );

  const handleCanvasDragEnter = useCallback((e) => {
    const hasMediaFiles = Array.from(e.dataTransfer?.items || []).some(
      (item) =>
        item.kind === "file" &&
        (String(item.type || "").startsWith("image/") ||
          String(item.type || "").startsWith("video/") ||
          Array.from(e.dataTransfer?.types || []).includes("Files")),
    );
    if (!hasMediaFiles) return;
    canvasDragDepthRef.current += 1;
    setCanvasDropActive(true);
  }, []);

  const handleCanvasDragOver = useCallback((e) => {
    const hasMediaFiles = Array.from(e.dataTransfer?.items || []).some(
      (item) =>
        item.kind === "file" &&
        (String(item.type || "").startsWith("image/") ||
          String(item.type || "").startsWith("video/") ||
          Array.from(e.dataTransfer?.types || []).includes("Files")),
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
    const files = Array.from(e.dataTransfer?.files || []).filter((file) => isMediaFileLike(file));
    canvasDragDepthRef.current = 0;
    setCanvasDropActive(false);
    e.preventDefault();
    if (!files.length) return;

    const point = screenToCanvas(e.clientX, e.clientY);
    const position = getMediaUploadNodePosition(point);
    const imageCount = files.filter((file) => isImageFileLike(file)).length;
    const videoCount = files.length - imageCount;
    setCanvasDropUploading({
      x: position.x,
      y: position.y,
      total: files.length,
      images: imageCount,
      videos: videoCount,
    });
    try {
      const droppedMediaItems = await readFilesAsDataUrls(files);
      createMediaUploadNodeAt(
        point,
        droppedMediaItems,
        imageCount === files.length ? "image" : videoCount === files.length ? "video" : "mixed",
      );
    } finally {
      setCanvasDropUploading(null);
    }
  }, [createMediaUploadNodeAt, screenToCanvas]);

  useEffect(() => {
    const handleWindowPaste = async (event) => {
      if (isEditableElement(event.target) || isEditableElement(document.activeElement)) return;

      const clipboardItems = Array.from(event.clipboardData?.items || []);
      const mediaFiles = clipboardItems
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile())
        .filter((file) => file && isMediaFileLike(file));

      if (!mediaFiles.length) return;

      event.preventDefault();
      const point = getCanvasPastePoint();
      const position = getMediaUploadNodePosition(point);
      const imageCount = mediaFiles.filter((file) => isImageFileLike(file)).length;
      const videoCount = mediaFiles.length - imageCount;
      setCanvasDropUploading({
        x: position.x,
        y: position.y,
        total: mediaFiles.length,
        images: imageCount,
        videos: videoCount,
      });

      try {
        const pastedMediaItems = await readFilesAsDataUrls(mediaFiles);
        createMediaUploadNodeAt(point, pastedMediaItems, mediaFiles.every((file) => isImageFileLike(file)) ? "image" : mediaFiles.every((file) => isVideoFileLike(file)) ? "video" : "mixed");
        setRunToast({
          message: `已粘贴到画布：${mediaFiles.length} 个文件${imageCount ? ` · ${imageCount} 张图片` : ""}${videoCount ? ` · ${videoCount} 个视频` : ""}`,
          type: "info",
        });
        setTimeout(() => setRunToast(null), 2200);
      } finally {
        setCanvasDropUploading(null);
      }
    };

    window.addEventListener("paste", handleWindowPaste);
    return () => {
      window.removeEventListener("paste", handleWindowPaste);
    };
  }, [createMediaUploadNodeAt, getCanvasPastePoint]);

  const addNode = (t, modePreset = null) => {
    if (t === NODE_TYPES.POST_PROCESSOR) return;
    pushHistory();
    const id = generateId();

    const r = canvasRef.current?.getBoundingClientRect();
    const cx = r ? r.width / 2 : window.innerWidth / 2;
    const cy = r ? r.height / 2 : window.innerHeight / 2;
    const c = screenToCanvas(cx, cy);
    const processorModePreset = modePreset === "image_creation" ? "text2img" : (modePreset || "multi_image_generate");
    const processorDefaults = getProcessorModeDefaults(processorModePreset);

    const d = {
      [NODE_TYPES.INPUT]: { images: [], mediaKind: "image", title: getReferenceNodeTitle("image") },
      [NODE_TYPES.TEXT_INPUT]: { text: "" },
      [NODE_TYPES.ROLE_INPUT]: { personaId: "", name: "", referenceImage: "", images: [], text: "" },
      [NODE_TYPES.ROLE_STRUCTURER]: {
        title: "角色结构化",
        roleName: "",
        characterSetting: "",
        relationshipNetwork: "",
        worldviewBackground: "",
        structuredProfile: null,
        text: "",
        status: "idle",
        error: "",
      },
      [NODE_TYPES.PROCESSOR]: {
        ...processorDefaults,
        title: modePreset === "image_creation" ? "图像创作" : "",
        batchSize: 1,
        uploadedImages: [],
        status: "idle",
        refImage: null,
        model: processorDefaults.model || defaultImageModelId,
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
        title: modePreset === "first_last_reference" ? "视频创作" : modePreset === "omni_reference" ? "全能生视频" : "",
        mode: modePreset === "text2video" ? "text2video" : modePreset === "local_img2video" ? "local_img2video" : "img2video",
        prompt: "",
        templates:
          modePreset === "local_img2video"
            ? { duration: 5, resolution: "480p", ratio: "1:1", note: "" }
            : {
                motion: "",
                camera: modePreset === "first_last_reference" ? "固定镜头(Fixed)" : "",
                duration: 5,
                resolution: "1080p",
                ratio: "",
                note: "",
                imageType: modePreset === "omni_reference" ? "4" : modePreset === "first_last_reference" ? "2" : "",
                generate_audio_new: true,
              },
        batchSize: 1,
        status: "idle",
        refImage: null,
        lastFrameImage: "",
        firstLastFrameOnly: modePreset === "first_last_reference",
        omniReferenceOnly: modePreset === "omni_reference",
        model: modePreset === "local_img2video"
          ? "comfyui-qwen-i2v"
          : modePreset === "omni_reference"
          ? (
              videoModelOptions.find((item) => isSeedanceOmniReferenceModel(item?.id, item?.name, item?.label, item?.remark))?.id ||
              defaultVideoModelId
            )
          : defaultVideoModelId,
      },
      [NODE_TYPES.OUTPUT]: { images: [] },
    };

    const newNode = { id, type: t, x: c.x - 140, y: c.y - 100, data: d[t] };

    let newConnection = null;
    if (selectedNodeIds.size === 1) {
      const sourceId = Array.from(selectedNodeIds)[0];
      const sourceNode = nodes.find((n) => n.id === sourceId);
      const canInput = t !== NODE_TYPES.INPUT && t !== NODE_TYPES.TEXT_INPUT && t !== NODE_TYPES.ROLE_INPUT;
      if (sourceNode && canInput) {
        newConnection = { id: generateId(), from: sourceId, to: id };
        newNode.x = sourceNode.x + 350;
        newNode.y = sourceNode.y;
      }
    }

    setNodes((p) => [...p, newNode]);
    if (newConnection) setConnections((p) => [...p, newConnection]);
    setSelectedNodeIds(new Set([id]));
    return id;
  };

  const appendTemplateGraph = useCallback(
    (templateNodes, templateConnections, options = {}) => {
      const safeTemplateNodes = Array.isArray(templateNodes) ? templateNodes.filter(Boolean) : [];
      const safeTemplateConnections = Array.isArray(templateConnections) ? templateConnections.filter(Boolean) : [];
      if (!safeTemplateNodes.length) return;

      pushHistory();

      const baseNodes = Array.isArray(nodesRef.current) ? nodesRef.current : [];
      const baseConnections = Array.isArray(connectionsRef.current) ? connectionsRef.current : [];
      const templateMinX = Math.min(...safeTemplateNodes.map((node) => Number(node.x) || 0));
      const templateMaxX = Math.max(...safeTemplateNodes.map((node) => Number(node.x) || 0));
      const templateMinY = Math.min(...safeTemplateNodes.map((node) => Number(node.y) || 0));
      const templateMaxY = Math.max(...safeTemplateNodes.map((node) => Number(node.y) || 0));
      const templateWidth = Math.max(0, templateMaxX - templateMinX);
      const templateHeight = Math.max(0, templateMaxY - templateMinY);

      let offsetX = 0;
      let offsetY = 0;

      if (baseNodes.length > 0) {
        const baseMaxX = Math.max(...baseNodes.map((node) => Number(node.x) || 0));
        const baseMinY = Math.min(...baseNodes.map((node) => Number(node.y) || 0));
        const baseMaxY = Math.max(...baseNodes.map((node) => Number(node.y) || 0));
        const targetLeft = baseMaxX + 360;
        const availableHeight = Math.max(0, baseMaxY - baseMinY);
        const targetTop = baseMinY + Math.max(0, (availableHeight - templateHeight) / 2);
        offsetX = targetLeft - templateMinX;
        offsetY = targetTop - templateMinY;
      } else if (options.alignToViewportCenter) {
        const center = getCanvasViewportCenterPoint();
        offsetX = center.x - (templateMinX + templateWidth / 2);
        offsetY = center.y - (templateMinY + templateHeight / 2);
      }

      const nextNodes = safeTemplateNodes.map((node) => ({
        ...node,
        x: (Number(node.x) || 0) + offsetX,
        y: (Number(node.y) || 0) + offsetY,
      }));

      setNodes([...baseNodes, ...nextNodes]);
      setConnections([...baseConnections, ...safeTemplateConnections]);
      setSelectedNodeIds(new Set(nextNodes.map((node) => node.id)));
      setSelectedConnectionIds(new Set());
      setActiveNodeId(nextNodes[0]?.id || null);
    },
    [getCanvasViewportCenterPoint, pushHistory],
  );

  const createText2ImgTemplate = () => {
    const n1 = { id: generateId(), type: NODE_TYPES.TEXT_INPUT, x: 100, y: 200, data: { text: "赛博朋克风格的未来城市街道，霓虹灯光" } };
    const n2 = { id: generateId(), type: NODE_TYPES.PROCESSOR, x: 500, y: 200, data: { mode: "text2img", prompt: "", templates: { size: "1k", aspect_ratio: "1:1" }, batchSize: 1, status: "idle", model: defaultImageModelId } };
    const n3 = { id: generateId(), type: NODE_TYPES.OUTPUT, x: 900, y: 200, data: { images: [] } };
    appendTemplateGraph([n1, n2, n3], [
      { id: generateId(), from: n1.id, to: n2.id },
      { id: generateId(), from: n2.id, to: n3.id },
    ], { alignToViewportCenter: true });
  };

  const createImg2ImgTemplate = () => {
    const n0 = { id: generateId(), type: NODE_TYPES.TEXT_INPUT, x: 100, y: 100, data: { text: "保持原图构图，转为水彩风格" } };
    const n1 = { id: generateId(), type: NODE_TYPES.INPUT, x: 100, y: 350, data: { images: [], mediaKind: "image", title: getReferenceNodeTitle("image") } };
    const n2 = { id: generateId(), type: NODE_TYPES.PROCESSOR, x: 500, y: 200, data: { mode: "multi_image_generate", prompt: "", templates: { size: "1k", note: "" }, batchSize: 1, uploadedImages: [], status: "idle", model: defaultImageModelId } };
    const n3 = { id: generateId(), type: NODE_TYPES.OUTPUT, x: 900, y: 200, data: { images: [] } };
    appendTemplateGraph([n0, n1, n2, n3], [
      { id: generateId(), from: n0.id, to: n2.id },
      { id: generateId(), from: n1.id, to: n2.id },
      { id: generateId(), from: n2.id, to: n3.id },
    ], { alignToViewportCenter: true });
  };

  const createMultiImg2ImgTemplate = () => {
    const n0 = { id: generateId(), type: NODE_TYPES.TEXT_INPUT, x: 100, y: 710, data: { text: "融合三张参考图的主体特征与风格，生成统一新画面" } };
    const n1 = { id: generateId(), type: NODE_TYPES.INPUT, x: 100, y: 20, data: { images: [], mediaKind: "image", title: `${getReferenceNodeTitle("image")} 1` } };
    const n2 = { id: generateId(), type: NODE_TYPES.INPUT, x: 100, y: 250, data: { images: [], mediaKind: "image", title: `${getReferenceNodeTitle("image")} 2` } };
    const n3 = { id: generateId(), type: NODE_TYPES.INPUT, x: 100, y: 480, data: { images: [], mediaKind: "image", title: `${getReferenceNodeTitle("image")} 3` } };
    const n4 = { id: generateId(), type: NODE_TYPES.PROCESSOR, x: 500, y: 360, data: { mode: "multi_image_generate", prompt: "", templates: { size: "1k", note: "" }, batchSize: 1, uploadedImages: [], status: "idle", model: defaultImageModelId } };
    const n5 = { id: generateId(), type: NODE_TYPES.OUTPUT, x: 900, y: 360, data: { images: [] } };
    appendTemplateGraph([n0, n1, n2, n3, n4, n5], [
      { id: generateId(), from: n0.id, to: n4.id },
      { id: generateId(), from: n1.id, to: n4.id },
      { id: generateId(), from: n2.id, to: n4.id },
      { id: generateId(), from: n3.id, to: n4.id },
      { id: generateId(), from: n4.id, to: n5.id },
    ], { alignToViewportCenter: true });
  };



  const createImg2VideoTemplate = () => {
    const n0 = { id: generateId(), type: NODE_TYPES.TEXT_INPUT, x: 100, y: 80, data: { text: "让参考图中的主体自然运动，镜头平稳推进，动作连贯" } };
    const n1 = { id: generateId(), type: NODE_TYPES.INPUT, x: 100, y: 320, data: { images: [], mediaKind: "image", title: getReferenceNodeTitle("image") } };
    const n2 = { id: generateId(), type: NODE_TYPES.VIDEO_GEN, x: 500, y: 200, data: { mode: "img2video",model: defaultVideoModelId, prompt: "", templates: { motion: "标准(Standard)", camera: "推近(Zoom In)", duration: 5, resolution: "1080p", ratio: "", note: "" ,generate_audio_new: true,}, batchSize: 1, status: "idle", refImage: null } };
    const n3 = { id: generateId(), type: NODE_TYPES.OUTPUT, x: 900, y: 200, data: { images: [] } };
    appendTemplateGraph([n0, n1, n2, n3], [
      { id: generateId(), from: n0.id, to: n2.id },
      { id: generateId(), from: n1.id, to: n2.id },
      { id: generateId(), from: n2.id, to: n3.id },
    ], { alignToViewportCenter: true });
  };

  const createText2VideoTemplate = () => {
    const n0 = { id: generateId(), type: NODE_TYPES.TEXT_INPUT, x: 100, y: 120, data: { text: "未来城市街头，镜头缓慢推进，霓虹灯闪烁，人物自然行走" } };
    const n1 = { id: generateId(), type: NODE_TYPES.VIDEO_GEN, x: 500, y: 120, data: { mode: "text2video", model: defaultVideoModelId, prompt: "", templates: { motion: "标准(Standard)", camera: "推近(Zoom In)", duration: 5, resolution: "1080p", ratio: "", note: "", generate_audio_new: true }, batchSize: 1, status: "idle", refImage: null } };
    const n2 = { id: generateId(), type: NODE_TYPES.OUTPUT, x: 900, y: 120, data: { images: [] } };
    appendTemplateGraph([n0, n1, n2], [
      { id: generateId(), from: n0.id, to: n1.id },
      { id: generateId(), from: n1.id, to: n2.id },
    ], { alignToViewportCenter: true });
  };

  const createOmniReferenceVideoTemplate = () => {
    const n0 = { id: generateId(), type: NODE_TYPES.TEXT_INPUT, x: 100, y: 200, data: { text: "综合参考图中的主体、风格和镜头语言，生成自然视频" } };
    const n1 = { id: generateId(), type: NODE_TYPES.INPUT, x: 100, y: 20, data: { images: [], mediaKind: "image", title: getReferenceNodeTitle("image") } };
    const n2 = { id: generateId(), type: NODE_TYPES.INPUT, x: 100, y: 380, data: { images: [], mediaKind: "video", title: getReferenceNodeTitle("video") } };
    const omniModelId =
      videoModelOptions.find((item) => isSeedanceOmniReferenceModel(item?.id, item?.name, item?.label, item?.remark))?.id ||
      defaultVideoModelId;
    const n3 = { id: generateId(), type: NODE_TYPES.VIDEO_GEN, x: 500, y: 200, data: { title: "全能生视频", mode: "img2video", model: omniModelId, prompt: "", templates: { motion: "标准(Standard)", camera: "推近(Zoom In)", duration: 5, resolution: "1080p", ratio: "", note: "", imageType: "4", generate_audio_new: true }, batchSize: 1, status: "idle", refImage: null, omniReferenceOnly: true } };
    const n4 = { id: generateId(), type: NODE_TYPES.OUTPUT, x: 900, y: 200, data: { images: [] } };
    appendTemplateGraph([n0, n1, n2, n3, n4], [
      { id: generateId(), from: n0.id, to: n3.id },
      { id: generateId(), from: n1.id, to: n3.id },
      { id: generateId(), from: n2.id, to: n3.id },
      { id: generateId(), from: n3.id, to: n4.id },
    ], { alignToViewportCenter: true });
  };

  const createVideo2VideoTemplate = () => {
    const n1 = { id: generateId(), type: NODE_TYPES.INPUT, x: 100, y: 200, data: { images: [], mediaKind: "video", title: getReferenceNodeTitle("video") } };
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
    appendTemplateGraph([n1, n2, n3], [
      { id: generateId(), from: n1.id, to: n2.id },
      { id: generateId(), from: n2.id, to: n3.id },
    ], { alignToViewportCenter: true });
  };

  const createVideoUpscaleTemplate = () => {
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
    appendTemplateGraph([n1, n2, n3], [
      { id: generateId(), from: n1.id, to: n2.id },
      { id: generateId(), from: n2.id, to: n3.id },
    ], { alignToViewportCenter: true });
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

  const createPromptQuickChain = useCallback((sourceNodeId, kind) => {
    const sourceNode = nodesRef.current.find((n) => n.id === sourceNodeId && n.type === NODE_TYPES.TEXT_INPUT);
    if (!sourceNode) return;

    pushHistory();

    const isVideo = kind === "video";
    const creativeNodeId = generateId();
    const outputNodeId = generateId();
    const outgoingCount = (connectionsRef.current || []).filter((conn) => conn.from === sourceNodeId).length;
    const creativeX = sourceNode.x + 390;
    const creativeY = sourceNode.y + (isVideo ? 220 : 0) + Math.min(outgoingCount, 4) * 18;
    const outputX = creativeX + 360;
    const outputY = creativeY;
    const imageDefaults = getProcessorModeDefaults("text2img");

    const creativeNode = isVideo
      ? {
          id: creativeNodeId,
          type: NODE_TYPES.VIDEO_GEN,
          x: creativeX,
          y: creativeY,
          data: {
            title: "视频创作",
            mode: "text2video",
            model: defaultVideoModelId,
            prompt: "",
            templates: {
              motion: "标准(Standard)",
              camera: "推近(Zoom In)",
              duration: 5,
              resolution: "1080p",
              ratio: "",
              note: "",
              generate_audio_new: true,
            },
            batchSize: 1,
            status: "idle",
            refImage: null,
          },
        }
      : {
          id: creativeNodeId,
          type: NODE_TYPES.PROCESSOR,
          x: creativeX,
          y: creativeY,
          data: {
            ...imageDefaults,
            title: "图像创作",
            batchSize: 1,
            uploadedImages: [],
            status: "idle",
            refImage: null,
            model: imageDefaults.model || defaultImageModelId,
          },
        };

    const outputNode = {
      id: outputNodeId,
      type: NODE_TYPES.OUTPUT,
      x: outputX,
      y: outputY,
      data: { images: [] },
    };

    setNodes((prev) => [...prev, creativeNode, outputNode]);
    setConnections((prev) => [
      ...prev,
      { id: generateId(), from: sourceNodeId, to: creativeNodeId },
      { id: generateId(), from: creativeNodeId, to: outputNodeId },
    ]);
    setSelectedNodeIds(new Set([creativeNodeId]));
    setSelectedConnectionIds(new Set());
  }, [defaultImageModelId, defaultVideoModelId, pushHistory]);

  const updateStoryboardAssetStatus = useCallback((storyboardNodeId, assetType, assetId, patch) => {
    if (!storyboardNodeId || !assetType || !assetId || !patch || !["object", "function"].includes(typeof patch)) return;
    setNodes((prev) =>
      prev.map((node) => {
        if (node.id !== storyboardNodeId) return node;
        const currentState =
          node?.data?.storyboard_asset_state && typeof node.data.storyboard_asset_state === "object"
            ? node.data.storyboard_asset_state
            : { characters: {}, subjects: {}, locations: {}, shots: {} };
        const currentAssetState = { ...(((currentState[assetType] || {})[assetId] || {})) };
        const nextAssetState =
          typeof patch === "function"
            ? patch(currentAssetState)
            : {
                ...currentAssetState,
                ...patch,
              };
        return {
          ...node,
          data: {
            ...node.data,
            storyboard_asset_state: {
              ...currentState,
              [assetType]: {
                ...(currentState[assetType] || {}),
                [assetId]: nextAssetState,
              },
            },
          },
        };
      }),
    );
  }, []);

  const runStoryboardAssetDirectGeneration = useCallback(
    async (storyboardNode, assetType, asset, options = {}) => {
      if (!storyboardNode || !asset || !apiFetch) return;
      const assetId = String(asset?.entity_id || asset?.name || "").trim();
      const currentAssetState = storyboardNode?.data?.storyboard_asset_state?.[assetType]?.[assetId] || {};
      const referenceImageUrl =
        String(options?.referenceImageUrl || "").trim() ||
        resolveStoryboardAssetPrimaryImage(currentAssetState);
      const tweakText = String(options?.tweakText || "").trim();
      const customPrompt = String(options?.customPrompt || "").trim();
      const prompt = customPrompt
        ? customPrompt
        : tweakText
          ? buildStoryboardAssetEditPrompt({
              assetType,
              asset,
              storyboardPlan: storyboardNode.data?.storyboard_plan || {},
              instruction: tweakText,
              referenceImageUrl,
            })
          : buildStoryboardAssetGenerationPrompt(assetType, asset, storyboardNode.data?.storyboard_plan || {});
      updateStoryboardAssetStatus(storyboardNode.id, assetType, assetId, {
        prompt,
        status: "running",
        error: "",
        lastInstruction: tweakText,
      });
      setHoveredStoryboardAssetCard((current) =>
        current && current.nodeId === storyboardNode.id && current.assetType === assetType && String(current.asset?.entity_id || current.asset?.name || "").trim() === assetId
          ? {
              ...current,
              sticky: true,
              tweakText: tweakText ? "" : current.tweakText || "",
              customPrompt: customPrompt ? customPrompt : current.customPrompt || "",
            }
          : current,
      );
      try {
        const preferredNanoModelId = String(AI_CHAT_IMAGE_MODEL_ID_NANO_BANANA2 || "").trim();
        const loadedModelIdSet = new Set(
          (Array.isArray(imageModelRecords) ? imageModelRecords : [])
            .map((item) => String(item?.id || item?.value || "").trim())
            .filter(Boolean),
        );
        const targetModelId =
          (preferredNanoModelId && loadedModelIdSet.has(preferredNanoModelId) ? preferredNanoModelId : "") ||
          findAIChatModelIdByKeywords(imageModelRecords) ||
          "";
        if (!targetModelId) {
          throw new Error("未找到 nano banana2 对应的图像模型ID");
        }

        const paramList = await resolveModelParamsForId(targetModelId);
        const resolvedParamPayload = buildAIChatParamPayload(paramList);
        const selectedSize = "1k";
        const selectedRatio = String(storyboardNode.data?.storyboard_plan?.aspect_ratio || "16:9").trim() || "16:9";
        const matchedSizeId = findAIChatParamValueId(paramList, ["size", "尺寸"], selectedSize);
        const matchedRatioId = findAIChatParamValueId(paramList, ["ratio", "比例", "宽高比", "画幅", "aspect"], selectedRatio);
        if (matchedSizeId) {
          resolvedParamPayload.ai_image_param_size_id = matchedSizeId;
        }
        if (matchedRatioId) {
          resolvedParamPayload.ai_image_param_ratio_id = matchedRatioId;
        }

        const authorizationInfo = resolveMemberAuthorizationInfo();
        const proxyPayload = {
          authorization: authorizationInfo?.value || "",
          history_ai_chat_record_id: aiChatHistoryRecordIdRef.current || "",
          module_enum: WORKBENCH_AI_CHAT_MODULE_ENUM,
          part_enum: String(resolveWorkbenchAIChatPartEnum({ mode: "text2img" })),
          ai_chat_session_id: aiChatSessionIdRef.current || "",
          ai_chat_model_id: targetModelId,
          message: prompt,
          images: referenceImageUrl ? [referenceImageUrl] : undefined,
          ...resolvedParamPayload,
        };
        if (!proxyPayload.authorization) {
          throw new Error("缺少 member authorization，无法调用 nano banana2 生成");
        }
        const proxyData = await submitAIChatImageTask(apiFetch, proxyPayload);
        if (proxyData?.source_session_id) aiChatSessionIdRef.current = String(proxyData.source_session_id);
        if (proxyData?.source_history_record_id) aiChatHistoryRecordIdRef.current = String(proxyData.source_history_record_id);
        const resultUrl =
          pickFirstImageUrl(proxyData?.image_url) ||
          pickFirstImageUrl(proxyData?.events) ||
          pickFirstImageUrl(proxyData?.text) ||
          pickFirstImageUrl(proxyData) ||
          "";
        const doneErrMsg = extractAIChatDoneError(proxyData);
        if (!resultUrl && doneErrMsg) {
          throw new Error(`AI Chat 返回错误：${doneErrMsg}`);
        }
        if (!resultUrl) {
          const summary = summarizeAIChatResponse(proxyData);
          throw new Error(`nano banana2 未返回可解析图片${summary ? ` | 响应摘要: ${summary}` : ""}`);
        }
        const generatedAt = Date.now();
        updateStoryboardAssetStatus(storyboardNode.id, assetType, assetId, (prevAssetState) => {
          const prevCandidates = normalizeStoryboardAssetCandidates(prevAssetState?.candidates);
          const nextCandidate = {
            id: `candidate_${generatedAt}_${Math.random().toString(36).slice(2, 8)}`,
            url: resultUrl,
            createdAt: generatedAt,
            source: tweakText ? "tweak" : "generate",
            prompt,
            instruction: tweakText,
          };
          const nextCandidates = [nextCandidate, ...prevCandidates.filter((item) => String(item?.url || "").trim() !== resultUrl)].slice(0, 8);
          const wasLocked = !!prevAssetState?.locked;
          return {
            ...prevAssetState,
            prompt,
            status: "success",
            error: "",
            images: [resultUrl],
            candidates: nextCandidates,
            selectedCandidateId: nextCandidate.id,
            selectedImageUrl: resultUrl,
            lastGeneratedAt: generatedAt,
            lastInstruction: tweakText,
            lastCustomPrompt: customPrompt,
            ...(wasLocked
              ? {
                  locked: true,
                  lockedAt: prevAssetState?.lockedAt || generatedAt,
                  lockedImageUrl: resultUrl,
                }
              : {}),
          };
        });
      } catch (error) {
        updateStoryboardAssetStatus(storyboardNode.id, assetType, assetId, {
          prompt,
          status: "error",
          error: String(error?.message || error || "生成失败"),
        });
      } finally {
        setHoveredStoryboardAssetCard((current) =>
          current && current.nodeId === storyboardNode.id && current.assetType === assetType && String(current.asset?.entity_id || current.asset?.name || "").trim() === assetId
            ? { ...current, sticky: false }
            : current,
        );
      }
    },
    [apiFetch, imageModelRecords, resolveModelParamsForId, updateStoryboardAssetStatus],
  );

  const runStoryboardShotGeneration = useCallback(
    async (storyboardNode, _scene, shot) => {
      if (!storyboardNode || !shot || !apiFetch) return;
      const shotId = String(shot?.shot_id || "").trim();
      if (!shotId) return;

      updateStoryboardAssetStatus(storyboardNode.id, "shots", shotId, {
        status: "running",
        error: "",
      });
      setHoveredStoryboardShotCard((current) =>
        current && current.nodeId === storyboardNode.id && String(current.shot?.shot_id || "") === shotId
          ? { ...current, sticky: true }
          : current,
      );

      try {
        // --- Resolve model ID (same pattern as runStoryboardAssetDirectGeneration) ---
        const preferredNanoModelId = String(AI_CHAT_IMAGE_MODEL_ID_NANO_BANANA2 || "").trim();
        const loadedModelIdSet = new Set(
          (Array.isArray(imageModelRecords) ? imageModelRecords : [])
            .map((item) => String(item?.id || item?.value || "").trim())
            .filter(Boolean),
        );
        const targetModelId =
          (preferredNanoModelId && loadedModelIdSet.has(preferredNanoModelId) ? preferredNanoModelId : "") ||
          findAIChatModelIdByKeywords(imageModelRecords) ||
          "";
        if (!targetModelId) throw new Error("未找到 gptimage2 对应的图像模型ID");

        // --- Resolve params (size + ratio) ---
        const paramList = await resolveModelParamsForId(targetModelId);
        const resolvedParamPayload = buildAIChatParamPayload(paramList);
        const selectedRatio = String(storyboardNode.data?.storyboard_plan?.aspect_ratio || "16:9").trim() || "16:9";
        const matchedSizeId = findAIChatParamValueId(paramList, ["size", "尺寸"], "1k");
        const matchedRatioId = findAIChatParamValueId(paramList, ["ratio", "比例", "宽高比", "画幅", "aspect"], selectedRatio);
        if (matchedSizeId) resolvedParamPayload.ai_image_param_size_id = matchedSizeId;
        if (matchedRatioId) resolvedParamPayload.ai_image_param_ratio_id = matchedRatioId;

        // --- Collect reference images from local_asset_bindings and storyboard_asset_state ---
        const plan = storyboardNode.data?.storyboard_plan || {};
        const assetState = storyboardNode.data?.storyboard_asset_state || {};
        const lab = plan.local_asset_bindings || {};
        const charBindings = Array.isArray(lab.character_bindings) ? lab.character_bindings : [];
        const sceneBindings = Array.isArray(lab.scene_bindings) ? lab.scene_bindings : [];
        const referenceImages = [];

        // Helper: resolve relative asset URLs to absolute so the backend can fetch them
        const apiRoot = (API_BASE || "").replace(/\/+$/, "");
        const resolveAssetUrl = (url) => {
          const u = String(url || "").trim();
          if (!u) return "";
          return u.startsWith("http") ? u : `${apiRoot}${u}`;
        };

        // Character three-view and generated asset images
        for (const cb of charBindings) {
          const threeViewUrl = String(cb?.three_view_url || "").trim();
          if (threeViewUrl) {
            referenceImages.push({ type: "character", name: stripStoryboardDisplayIds(String(cb?.character_name || cb?.entity_name || "")), url: resolveAssetUrl(threeViewUrl) });
          }
          const entityId = String(cb?.entity_id || "").trim();
          const charAssetUrl = String(assetState?.characters?.[entityId]?.selectedImageUrl || "").trim();
          if (charAssetUrl) {
            referenceImages.push({ type: "asset", name: stripStoryboardDisplayIds(String(cb?.entity_name || "")), url: resolveAssetUrl(charAssetUrl) });
          }
        }
        // Subject generated asset images
        for (const ent of (Array.isArray(plan.entities?.subjects) ? plan.entities.subjects : [])) {
          const entityId = String(ent?.entity_id || "").trim();
          const subjAssetUrl = String(assetState?.subjects?.[entityId]?.selectedImageUrl || "").trim();
          if (subjAssetUrl) {
            referenceImages.push({ type: "asset", name: stripStoryboardDisplayIds(String(ent?.name || "")), url: resolveAssetUrl(subjAssetUrl) });
          }
        }
        // Scene preview + generated asset images
        for (const sb of sceneBindings) {
          const previewUrl = String((Array.isArray(sb?.preview_urls) ? sb.preview_urls : [])[0] || "").trim();
          if (previewUrl) {
            referenceImages.push({ type: "scene", name: String(sb?.folder_name || sb?.matched_from || "").trim(), url: resolveAssetUrl(previewUrl) });
          }
        }
        for (const locEnt of (Array.isArray(plan.entities?.locations) ? plan.entities.locations : [])) {
          const entityId = String(locEnt?.entity_id || "").trim();
          const locAssetUrl = String(assetState?.locations?.[entityId]?.selectedImageUrl || "").trim();
          if (locAssetUrl) {
            referenceImages.push({ type: "asset", name: stripStoryboardDisplayIds(String(locEnt?.name || "")), url: resolveAssetUrl(locAssetUrl) });
          }
        }

        // --- Build and POST request ---
        const authorizationInfo = resolveMemberAuthorizationInfo();
        if (!authorizationInfo?.value) throw new Error("缺少 member authorization");

        const submitResp = await apiFetch("/api/storyboard/generate_shot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shot: {
              shot_id: shot.shot_id,
              shot_no: shot.shot_no,
              visual_description: String(shot.visual_description || "").trim(),
              camera: String(shot.camera || "").trim(),
              duration_sec: shot.duration_sec ?? 4.0,
              referenced_entities: Array.isArray(shot.referenced_entities) ? shot.referenced_entities : [],
              generation_notes: String(shot.generation_notes || "").trim(),
            },
            storyboard_plan: {
              title: String(plan.title || "").trim(),
              style: String(plan.style || "").trim(),
              aspect_ratio: String(plan.aspect_ratio || "16:9").trim(),
              global_notes: Array.isArray(plan.global_notes) ? plan.global_notes : [],
              design_rationale: String(plan.design_rationale || "").trim(),
            },
            entities: {
              characters: Array.isArray(plan.entities?.characters) ? plan.entities.characters : [],
              subjects: Array.isArray(plan.entities?.subjects) ? plan.entities.subjects : [],
              locations: Array.isArray(plan.entities?.locations) ? plan.entities.locations : [],
            },
            reference_images: referenceImages,
            ai_chat_model_id: targetModelId,
            authorization: authorizationInfo.value,
            history_ai_chat_record_id: aiChatHistoryRecordIdRef.current || "",
            module_enum: WORKBENCH_AI_CHAT_MODULE_ENUM,
            part_enum: String(resolveWorkbenchAIChatPartEnum({ mode: "text2img" })),
            ai_chat_session_id: aiChatSessionIdRef.current || "",
            ...resolvedParamPayload,
          }),
        });
        const submitData = await submitResp.json().catch(() => ({}));
        if (!submitResp.ok) throw new Error(String(submitData?.detail || "分镜图任务提交失败"));
        const taskId = String(submitData?.task_id || "").trim();
        if (!taskId) throw new Error("未返回 task_id");

        // --- Poll for result ---
        const pollIntervalMs = 1200;
        const timeoutMs = 600000;
        const startedAt = Date.now();
        let proxyData = null;
        while (true) {
          if (Date.now() - startedAt > timeoutMs) throw new Error("分镜图生成超时");
          const statusResp = await apiFetch(`/api/ai_chat_image_via_curl/${encodeURIComponent(taskId)}`);
          const statusData = await statusResp.json().catch(() => ({}));
          if (!statusResp.ok) throw new Error(String(statusData?.detail || statusData?.error || `轮询失败 HTTP ${statusResp.status}`));
          const status = String(statusData?.status || "").toUpperCase();
          if (status === "SUCCESS") {
            proxyData = statusData?.result && typeof statusData.result === "object" ? statusData.result : {};
            if (proxyData?.source_session_id) aiChatSessionIdRef.current = String(proxyData.source_session_id);
            if (proxyData?.source_history_record_id) aiChatHistoryRecordIdRef.current = String(proxyData.source_history_record_id);
            break;
          }
          if (status === "FAILED" || status === "TIMEOUT") {
            const result = statusData?.result && typeof statusData.result === "object" ? statusData.result : {};
            const errMsg = String(result?.done_error || statusData?.error || `分镜图生成${status === "TIMEOUT" ? "超时" : "失败"}`);
            throw new Error(errMsg);
          }
          await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        }

        const resultUrl =
          pickFirstImageUrl(proxyData?.image_url) ||
          pickFirstImageUrl(proxyData?.events) ||
          pickFirstImageUrl(proxyData?.text) ||
          pickFirstImageUrl(proxyData) ||
          "";
        if (!resultUrl) throw new Error("分镜图生成未返回图片");

        const generatedAt = Date.now();
        updateStoryboardAssetStatus(storyboardNode.id, "shots", shotId, (prev) => {
          const prevCandidates = normalizeStoryboardAssetCandidates(prev?.candidates);
          const nextCandidate = {
            id: `candidate_${generatedAt}_${Math.random().toString(36).slice(2, 8)}`,
            url: resultUrl,
            createdAt: generatedAt,
            source: "generate",
          };
          const nextCandidates = [nextCandidate, ...prevCandidates.filter((c) => String(c?.url || "") !== resultUrl)].slice(0, 8);
          return {
            ...prev,
            status: "success",
            error: "",
            images: [resultUrl],
            candidates: nextCandidates,
            selectedCandidateId: nextCandidate.id,
            selectedImageUrl: resultUrl,
            lastGeneratedAt: generatedAt,
          };
        });
      } catch (error) {
        updateStoryboardAssetStatus(storyboardNode.id, "shots", shotId, {
          status: "error",
          error: String(error?.message || error || "分镜图生成失败"),
        });
      } finally {
        setHoveredStoryboardShotCard((current) =>
          current && current.nodeId === storyboardNode.id && String(current.shot?.shot_id || "") === shotId
            ? { ...current, sticky: false }
            : current,
        );
      }
    },
    [apiFetch, imageModelRecords, resolveModelParamsForId, updateStoryboardAssetStatus, resolveMemberAuthorizationInfo],
  );

  const createImageOperationResultNode = useCallback((sourceNodeId, resultImages, title) => {
    const safeImages = (Array.isArray(resultImages) ? resultImages : [])
      .map((item) => String(item || "").trim())
      .filter(Boolean);
    if (!safeImages.length) return "";

    const sourceNode = nodesRef.current.find((node) => node.id === sourceNodeId);
    if (!sourceNode) return "";

    const resultNodeId = generateId();
    const outgoingCount = (connectionsRef.current || []).filter((connection) => connection.from === sourceNodeId).length;
    const resultNode = {
      id: resultNodeId,
      type: NODE_TYPES.OUTPUT,
      x: sourceNode.x + 350,
      y: sourceNode.y + Math.min(outgoingCount, 5) * 64,
      data: {
        title,
        images: safeImages,
      },
    };

    setNodes((prev) => [...prev, resultNode]);
    setConnections((prev) => [...prev, { id: generateId(), from: sourceNodeId, to: resultNodeId }]);
    setSelectedNodeIds(new Set([resultNodeId]));
    setSelectedConnectionIds(new Set());
    return resultNodeId;
  }, []);

  const runCompactRemoveWatermark = useCallback(
    async (sourceNodeId, imageIndex = 0) => {
      try {
        const sourceNode = nodesRef.current.find((n) => n.id === sourceNodeId);
        const images = Array.isArray(sourceNode?.data?.images) ? sourceNode.data.images : [];
        const imageEntries = images
          .map((item, index) => ({ item, index }))
          .filter(({ item }) => !!item && !isVideoContent(item));
        if (!imageEntries.length) {
          throw new Error("缺少去水印输入图片");
        }

        const resultImages = [];
        for (const { item, index } of imageEntries) {
          const resp = await apiFetch(`/api/remove_watermark`, {
            method: "POST",
            skipAuth: true,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              image: item,
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
          resultImages.push(nextImage);
        }

        pushHistory();
        createImageOperationResultNode(sourceNodeId, resultImages, "去水印结果");
        setRunToast({
          message: imageEntries.length > 1 ? `批量去水印完成，共 ${imageEntries.length} 张` : "去水印完成",
          type: "info",
        });
        setTimeout(() => setRunToast(null), 2200);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error || "去水印失败");
        setRunToast({ message: `去水印失败：${message}`, type: "error" });
        setTimeout(() => setRunToast(null), 2600);
        throw error;
      }
    },
    [apiFetch, createImageOperationResultNode, pushHistory],
  );

  const runCompactRmbg = useCallback(
    async (sourceNodeId, imageIndex = 0) => {
      try {
        const sourceNode = nodesRef.current.find((n) => n.id === sourceNodeId);
        const images = Array.isArray(sourceNode?.data?.images) ? sourceNode.data.images : [];
        const imageEntries = images
          .map((item, index) => ({ item, index }))
          .filter(({ item }) => !!item && !isVideoContent(item));
        if (!imageEntries.length) {
          throw new Error("缺少抠图输入图片");
        }

        const resultImages = [];
        for (const { item, index } of imageEntries) {
          const resp = await apiFetch(`/api/rmbg`, {
            method: "POST",
            skipAuth: true,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              image: item,
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
            throw new Error("抠图未返回结果");
          }
          resultImages.push(nextImage);
        }

        pushHistory();
        createImageOperationResultNode(sourceNodeId, resultImages, "抠图结果");
        setRunToast({
          message: imageEntries.length > 1 ? `批量抠图完成，共 ${imageEntries.length} 张` : "抠图完成",
          type: "info",
        });
        setTimeout(() => setRunToast(null), 2200);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error || "抠图失败");
        setRunToast({ message: `抠图失败：${message}`, type: "error" });
        setTimeout(() => setRunToast(null), 2600);
        throw error;
      }
    },
    [apiFetch, createImageOperationResultNode, pushHistory],
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
        data: { images: [picked], mediaKind: "image", title: getReferenceNodeTitle("image") },
      };

      const img2imgNode = {
        id: procId,
        type: NODE_TYPES.PROCESSOR,
        x: baseX + 350,
        y: baseY,
        data: {
          mode: "multi_image_generate",
          prompt: "",
          templates: { size: "1k", note: "" },
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
      const firstSourceImage = String(retrySources?.[imageEntries[0]?.index] || imageEntries[0]?.item || "").trim();
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

  const runVideoLineart = useCallback(
    async (sourceNodeId, mediaIndex = 0, config = {}) => {
      try {
        const sourceNode = nodesRef.current.find((node) => node.id === sourceNodeId);
        const sourceImages = Array.isArray(sourceNode?.data?.images) ? sourceNode.data.images : [];
        const safeIndex = Math.max(0, Math.min(mediaIndex, sourceImages.length - 1));
        const retrySources =
          sourceNode?.data?.videoLineartSourceVideos && typeof sourceNode.data.videoLineartSourceVideos === "object"
            ? sourceNode.data.videoLineartSourceVideos
            : {};
        const retrySourceVideo = String(retrySources?.[safeIndex] || "").trim();
        const sourceVideo = retrySourceVideo || sourceImages[safeIndex] || sourceImages[0] || "";
        if (!sourceVideo || !isVideoContent(sourceVideo)) {
          throw new Error("缺少可用于转线稿的视频素材");
        }

        const safeConfig = normalizeVideoLineartConfig(config);
        const result = await runVideoLineartTask(
          {
            video: sourceVideo,
            lineStrength: safeConfig.lineStrength,
            lineColor: safeConfig.lineColor,
          },
          apiFetch,
        );
        const resultUrl = String(result?.video || "").trim();
        if (!resultUrl) {
          throw new Error("视频转线稿未返回结果");
        }

        pushHistory();
        const nextImages = [...sourceImages];
        nextImages[safeIndex] = resultUrl;
        updateNodeData(sourceNodeId, {
          images: nextImages,
          videoLineartSourceVideos: {
            ...retrySources,
            [safeIndex]: retrySourceVideo || sourceVideo,
          },
          videoLineartLastResultVideo: resultUrl,
          videoLineartConfig: safeConfig,
          status: "idle",
          error: "",
        });
        setRunToast({ message: "视频转线稿完成", type: "info" });
        setTimeout(() => setRunToast(null), 2200);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error || "视频转线稿失败");
        setRunToast({ message: `视频转线稿失败：${message}`, type: "error" });
        setTimeout(() => setRunToast(null), 2600);
        throw error;
      }
    },
    [apiFetch, pushHistory],
  );

  const runVideoRmbg = useCallback(
    async (sourceNodeId, mediaIndex = 0) => {
      try {
        const sourceNode = nodesRef.current.find((node) => node.id === sourceNodeId);
        const sourceImages = Array.isArray(sourceNode?.data?.images) ? sourceNode.data.images : [];
        const safeIndex = Math.max(0, Math.min(mediaIndex, sourceImages.length - 1));
        const retrySources =
          sourceNode?.data?.videoRmbgSourceVideos && typeof sourceNode.data.videoRmbgSourceVideos === "object"
            ? sourceNode.data.videoRmbgSourceVideos
            : {};
        const retrySourceVideo = String(retrySources?.[safeIndex] || "").trim();
        const sourceVideo = retrySourceVideo || sourceImages[safeIndex] || sourceImages[0] || "";
        if (!sourceVideo || !isVideoContent(sourceVideo)) {
          throw new Error("缺少可用于去背景的视频素材");
        }

        const result = await runVideoRmbgTask(
          {
            video: sourceVideo,
          },
          apiFetch,
        );
        const resultUrl = String(result?.video || "").trim();
        if (!resultUrl) {
          throw new Error("视频去背景未返回结果");
        }

        pushHistory();
        const nextImages = [...sourceImages];
        nextImages[safeIndex] = resultUrl;
        updateNodeData(sourceNodeId, {
          images: nextImages,
          videoRmbgSourceVideos: {
            ...retrySources,
            [safeIndex]: retrySourceVideo || sourceVideo,
          },
          videoRmbgLastResultVideo: resultUrl,
          status: "idle",
          error: "",
        });
        setRunToast({ message: "视频去背景完成", type: "info" });
        setTimeout(() => setRunToast(null), 2200);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error || "视频去背景失败");
        setRunToast({ message: `视频去背景失败：${message}`, type: "error" });
        setTimeout(() => setRunToast(null), 2600);
        throw error;
      }
    },
    [apiFetch, pushHistory],
  );

  const runVideoSplit = useCallback(
    async (sourceNodeId, mediaIndex = 0, segments = [], options = {}) => {
      try {
        const sourceNode = nodesRef.current.find((node) => node.id === sourceNodeId);
        const sourceImages = Array.isArray(sourceNode?.data?.images) ? sourceNode.data.images : [];
        const safeIndex = Math.max(0, Math.min(mediaIndex, sourceImages.length - 1));
        const sourceVideo = sourceImages[safeIndex] || sourceImages[0] || "";
        if (!sourceVideo || !isVideoContent(sourceVideo)) {
          throw new Error("缺少可用于编辑的视频素材");
        }

        const safeSegments = normalizeVideoSplitSegments(segments);
        const result = await runVideoSplitTask(
          {
            video: sourceVideo,
            segments: safeSegments,
            outputResolution: String(options?.outputResolution || DEFAULT_VIDEO_SPLIT_OUTPUT_RESOLUTION).trim().toLowerCase(),
            includeAudio: Boolean(options?.includeAudio),
          },
          apiFetch,
        );
        const outputVideos = Array.isArray(result?.videos)
          ? result.videos.map((item) => String(item || "").trim()).filter(Boolean)
          : [];
        if (!outputVideos.length) {
          throw new Error("视频分割未返回结果");
        }

        pushHistory();
        const baseX = Number(sourceNode?.x || 0) + 320;
        const baseY = Number(sourceNode?.y || 0);
        const columnCount = outputVideos.length > 3 ? 2 : 1;
        const newNodes = outputVideos.map((video, index) => {
          const column = index % columnCount;
          const row = Math.floor(index / columnCount);
          return {
            id: generateId(),
            type: NODE_TYPES.INPUT,
            x: baseX + column * 320,
            y: baseY + row * 220,
            data: {
              images: [video],
              title: `视频分段 ${index + 1}`,
            },
          };
        });

        setNodes((prev) => [...prev, ...newNodes]);
        setSelectedNodeIds(new Set(newNodes.map((node) => node.id)));
        setSelectedConnectionIds(new Set());
        setActiveNodeId(newNodes[0]?.id || null);
        setRunToast({ message: `视频分割完成，已生成 ${outputVideos.length} 个组件`, type: "info" });
        setTimeout(() => setRunToast(null), 2400);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error || "视频分割失败");
        setRunToast({ message: `视频分割失败：${message}`, type: "error" });
        setTimeout(() => setRunToast(null), 2600);
        throw error;
      }
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

  const appendAgentTurn = useCallback((turnInput = {}) => {
    const turnId = turnInput?.id || `turn_${makeAgentId()}`;
    const nextTurn = {
      id: turnId,
      userText: String(turnInput?.userText || "").trim(),
      extractedProduct: String(turnInput?.extractedProduct || "").trim(),
      status: turnInput?.status || "assistant",
      assistantText: String(turnInput?.assistantText || ""),
      quickActions: Array.isArray(turnInput?.quickActions) ? turnInput.quickActions : [],
      productChips: Array.isArray(turnInput?.productChips) ? turnInput.productChips : [],
      memorySuggestions: Array.isArray(turnInput?.memorySuggestions)
        ? turnInput.memorySuggestions.map((item, idx) => ({
            ...item,
            id: item?.id || `suggest_${turnId}_${idx}`,
            status: item?.status || "pending",
          }))
        : [],
      showCancelPending: !!turnInput?.showCancelPending,
      routeDebug: turnInput?.routeDebug || null,
      scriptBriefDraft: turnInput?.scriptBriefDraft ? normalizeScriptBrief(turnInput.scriptBriefDraft) : null,
      scriptBrief: turnInput?.scriptBrief ? normalizeScriptBrief(turnInput.scriptBrief) : null,
      dramaPayload: turnInput?.dramaPayload || null,
      response: turnInput?.response || null,
      intent: turnInput?.intent || "",
      intentReason: turnInput?.intentReason || "",
      exports: turnInput?.exports || {},
      uploadedDocuments: Array.isArray(turnInput?.uploadedDocuments) ? turnInput.uploadedDocuments : [],
      stepIndex: Number(turnInput?.stepIndex || 0),
      error: String(turnInput?.error || ""),
      createdAt: Number(turnInput?.createdAt || Date.now()) || Date.now(),
    };
    updateActiveAgentSession((session) => ({
      ...session,
      title:
        session.title === "新会话" && nextTurn.userText
          ? shortenSessionTitle(nextTurn.userText)
          : session.title,
      turns: [...(session.turns || []), nextTurn],
    }));
    return turnId;
  }, [updateActiveAgentSession]);

  const updateAgentTurn = useCallback((turnId, updater) => {
    if (!turnId) return;
    updateActiveAgentSession((session) => ({
      ...session,
      turns: (session.turns || []).map((turn) => {
        if (turn.id !== turnId) return turn;
        const patch =
          typeof updater === "function"
            ? updater(turn)
            : (updater && typeof updater === "object" ? updater : {});
        return {
          ...turn,
          ...(patch || {}),
          routeDebug: patch && Object.prototype.hasOwnProperty.call(patch, "routeDebug")
            ? patch.routeDebug
            : turn.routeDebug,
        };
      }),
    }));
  }, [updateActiveAgentSession]);

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
      const existing = prev.find((card) => card.turnId === turnId);
      const turn = (activeAgentSession?.turns || []).find((item) => item.id === turnId);
      const targetWidth = getAgentResultCardWidth(turn);
      if (existing) {
        if (existing.w === targetWidth) return prev;
        return prev.map((card) => (card.turnId === turnId ? { ...card, w: targetWidth } : card));
      }
      const idx = prev.length;
      return [
        ...prev,
        {
          id: `agent_card_${makeAgentId()}`,
          turnId,
          x: 120 + (idx % 2) * 500,
          y: 120 + Math.floor(idx / 2) * 360,
          w: targetWidth,
          collapsed: false,
          minimized: false,
        },
      ];
    });
  }, [activeAgentSession?.turns]);

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

  const revealAgentResultCardInCanvas = useCallback(
    (turnId) => {
      const card = agentResultCards.find((item) => item.turnId === turnId);
      if (!card) {
        ensureAgentResultCard(turnId);
        return;
      }

      setAgentResultCards((prev) =>
        prev.map((item) =>
          item.turnId === turnId ? { ...item, minimized: false, collapsed: false } : item,
        ),
      );
      setSelectedAgentCardIds(new Set([card.id]));
      setActiveAgentCardId(card.id);

      const canvasEl = canvasRef.current;
      const turn = (activeAgentSession?.turns || []).find((item) => item.id === turnId);
      if (!canvasEl) return;

      const currentViewport = viewportRef.current || { x: 0, y: 0, zoom: 1 };
      const zoom = currentViewport.zoom || 1;
      const padding = 64;
      const estimatedHeight = 680;

      const visibleLeft = -currentViewport.x / zoom;
      const visibleTop = -currentViewport.y / zoom;
      const visibleRight = visibleLeft + canvasEl.clientWidth / zoom;
      const visibleBottom = visibleTop + canvasEl.clientHeight / zoom;

      const cardLeft = card.x;
      const cardTop = card.y;
      const cardRight = card.x + card.w;
      const cardBottom = card.y + estimatedHeight;

      let nextX = currentViewport.x;
      let nextY = currentViewport.y;

      if (cardLeft < visibleLeft + padding) {
        nextX = -(cardLeft - padding) * zoom;
      } else if (cardRight > visibleRight - padding) {
        nextX = (canvasEl.clientWidth - (cardRight + padding) * zoom);
      }

      if (cardTop < visibleTop + padding) {
        nextY = -(cardTop - padding) * zoom;
      } else if (cardBottom > visibleBottom - padding) {
        nextY = (canvasEl.clientHeight - (cardBottom + padding) * zoom);
      }

      if (nextX !== currentViewport.x || nextY !== currentViewport.y) {
        setViewport((prev) => ({
          ...prev,
          x: nextX,
          y: nextY,
        }));
      }
    },
    [activeAgentSession?.turns, agentResultCards, ensureAgentResultCard],
  );

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

  const handleAgentCardWheelCapture = useCallback((e) => {
    e.stopPropagation();
    const cardEl = e.currentTarget;
    const scrollBody = cardEl.querySelector(AGENT_CARD_SCROLL_BODY_SELECTOR);
    if (!(scrollBody instanceof HTMLElement)) {
      e.preventDefault();
      return;
    }

    if (e.target instanceof Node && scrollBody.contains(e.target)) {
      return;
    }

    const maxScrollTop = Math.max(0, scrollBody.scrollHeight - scrollBody.clientHeight);
    if (maxScrollTop <= 0) {
      e.preventDefault();
      return;
    }

    const nextScrollTop = Math.max(0, Math.min(scrollBody.scrollTop + e.deltaY, maxScrollTop));
    if (nextScrollTop !== scrollBody.scrollTop) {
      scrollBody.scrollTop = nextScrollTop;
    }
    e.preventDefault();
  }, []);

  const appendAssistantTurn = useCallback(
    (userText, assistantText, options = {}) => {
      const {
        status = "assistant",
        quickActions = [],
        productChips = [],
        routeDebug = null,
        memorySuggestions = [],
        showCancelPending = false,
        userTextOverride,
        scriptBriefDraft = null,
      } = options || {};
      const finalUserText = userTextOverride !== undefined ? String(userTextOverride || "") : String(userText || "");
      appendAgentTurn({
        userText: finalUserText,
        extractedProduct: "",
        status,
        assistantText,
        quickActions,
        productChips,
        memorySuggestions,
        showCancelPending,
        routeDebug,
        scriptBriefDraft,
      });
    },
    [appendAgentTurn],
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

  const buildAgentRecentMessages = useCallback(() => {
    const turns = activeAgentSession?.turns || [];
    const recent = [];
    for (const turn of turns.slice(-6)) {
      const userText = String(turn?.userText || "").trim();
      const assistantText = String(turn?.assistantText || "").trim();
      if (userText) recent.push({ role: "user", text: userText });
      if (assistantText) recent.push({ role: "assistant", text: assistantText });
    }
    return recent;
  }, [activeAgentSession?.turns]);

  const getRecentAgentUploadedDocuments = useCallback(() => {
    const turns = activeAgentSession?.turns || [];
    for (const turn of [...turns].reverse()) {
      const docs = Array.isArray(turn?.uploadedDocuments) ? turn.uploadedDocuments : [];
      if (docs.length) return docs;
    }
    return [];
  }, [activeAgentSession?.turns]);

  const shouldReuseRecentUploadedDocuments = useCallback((message) => {
    const text = String(message || "").trim();
    if (!text) return false;
    return /(这份|这个|上面|刚才|上传|脚本|表格|csv|整理成故事板|导入故事板|按这份)/i.test(text);
  }, []);

  const runAgentConversation = useCallback(
    async (userText, route = null, extraPayload = null) => {
      const message = String(userText || "").trim();
      if (!message) return null;
      const explicitUploadedDocuments = Array.isArray(extraPayload?.uploadedDocuments) ? extraPayload.uploadedDocuments : [];
      const uploadedDocuments =
        explicitUploadedDocuments.length > 0
          ? explicitUploadedDocuments
          : shouldReuseRecentUploadedDocuments(message)
          ? getRecentAgentUploadedDocuments()
          : [];
      const meta = {
        intent: route?.intent || "",
        product: route?.product || "",
        sessionId: activeAgentSession?.id || "",
      };
      const currentNodes = nodesRef.current || [];
      const storyboardCount = currentNodes.filter((n) => n?.type === "storyboard_plan").length;
      const response = await sendAgentMessage(
        {
          message,
          recentMessages: buildAgentRecentMessages(),
          currentNodes: cloneDeep(currentNodes),
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
          uploadedDocuments,
          canvasNodeHints: { storyboard_count: storyboardCount },
          ...(extraPayload && typeof extraPayload === "object" ? extraPayload : {}),
        },
        apiFetch,
        meta,
      );
      return response;
    },
    [activeAgentSession?.id, activeArtifact, apiFetch, buildAgentRecentMessages, canvasId, getRecentAgentUploadedDocuments, shouldReuseRecentUploadedDocuments],
  );

  const runMissionOnTurn = useCallback(
    async (turnId, userText, extractedProduct, routeMeta = {}, scriptBrief = null) => {
      try {
        const normalizedBrief = normalizeScriptBrief(
          scriptBrief || { product: extractedProduct },
        );
        const agentResponse = await runAgentConversation(
          userText,
          routeMeta,
          {
            product: normalizedBrief.product || extractedProduct || "",
            audience: normalizedBrief.audience || "",
            priceBand: normalizedBrief.priceBand || "",
            conversionGoal: normalizedBrief.conversionGoal || "",
            primaryPlatform: normalizedBrief.primaryPlatform || "",
            secondaryPlatform: normalizedBrief.secondaryPlatform || "",
            selectedAngle: normalizedBrief.selectedAngle || "",
          },
        );
        // Backend may route to storyboard.design even when called from the script flow.
        if (agentResponse?.action === "tool_call" && agentResponse?.data?.is_async && agentResponse?.data?.task_id) {
          const storyboardTaskId = String(agentResponse.data.task_id);
          updateActiveAgentSession((session) => ({
            ...session,
            turns: (session.turns || []).map((turn) =>
              turn.id === turnId
                ? { ...turn, status: "running", assistantText: "分镜方案生成中...", intent: "STORYBOARD" }
                : turn,
            ),
          }));
          const taskResult = await pollStoryboardTask(storyboardTaskId, apiFetch, (s) => {
            if (s === "running") {
              updateActiveAgentSession((session) => ({
                ...session,
                turns: (session.turns || []).map((turn) =>
                  turn.id === turnId
                    ? { ...turn, assistantText: "分镜方案生成中（AI 正在思考）..." }
                    : turn,
                ),
              }));
            }
          });
          const sbPatch = Array.isArray(taskResult?.patch) ? taskResult.patch : [];
          const sbNodeIds = sbPatch
            .filter((op) => op?.op === "add_node" && op?.node?.type === "storyboard_plan")
            .map((op) => String(op?.node?.id || "").trim())
            .filter(Boolean);
          if (sbPatch.length) {
            pushHistory();
            const pr = _applyPatch(sbPatch);
            if (pr?.nodes && pr?.connections) {
              upsertCanvasDraftSnapshot({ nodes: pr.nodes, connections: pr.connections, viewport: pr.viewport || viewportRef.current });
            }
          }
          updateActiveAgentSession((session) => ({
            ...session,
            turns: (session.turns || []).map((turn) =>
              turn.id === turnId
                ? {
                    ...turn,
                    status: "done",
                    stepIndex: AGENT_RUN_STEPS.length - 1,
                    assistantText: String(taskResult?.summary || "已生成可编辑分镜方案。").trim(),
                    response: { storyboardNodeIds: sbNodeIds, summary: String(taskResult?.summary || "").trim() },
                    intent: "STORYBOARD",
                    intentReason: "storyboard_from_script_flow",
                  }
                : turn,
            ),
          }));
          ensureAgentResultCard(turnId);
          return;
        }

        if (!(agentResponse?.action === "tool_call" && Array.isArray(agentResponse?.data?.topics))) {
          throw new Error("Agent 未返回脚本结果");
        }
        const response = agentResponse.data;
        updateActiveAgentSession((session) => {
          const turnsNext = (session.turns || []).map((turn) =>
            turn.id === turnId
              ? {
                  ...turn,
                  status: "done",
                  stepIndex: AGENT_RUN_STEPS.length - 1,
                  response,
                  exports: turn.exports || {},
                  scriptBrief: normalizedBrief,
                  scriptBriefDraft: null,
                }
              : turn,
          );
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
    [ensureAgentResultCard, runAgentConversation, updateActiveAgentSession, apiFetch, pushHistory, _applyPatch, upsertCanvasDraftSnapshot, viewportRef],
  );

  const runDramaMissionOnTurn = useCallback(
    async (turnId, dramaPayload, routeMeta = {}) => {
      try {
        const payload = dramaPayload && typeof dramaPayload === "object"
          ? dramaPayload
          : { prompt: String(dramaPayload || "").trim() };
        const agentResponse = await runAgentConversation(
          String(payload?.prompt || "").trim(),
          routeMeta,
          {
            taskMode: payload?.taskMode || payload?.task_mode || "",
            episodeCount: payload?.episodeCount ?? payload?.episode_count,
            existingScript: payload?.existingScript || payload?.existing_script || "",
          },
        );
        if (!(agentResponse?.action === "tool_call" && typeof agentResponse?.data?.text === "string")) {
          throw new Error("Agent 未返回短剧结果");
        }
        const response = agentResponse.data;
        updateActiveAgentSession((session) => ({
          ...session,
          turns: (session.turns || []).map((turn) =>
            turn.id === turnId
              ? {
                  ...turn,
                  status: "done",
                  stepIndex: AGENT_RUN_STEPS.length - 1,
                  response,
                  exports: turn.exports || {},
                  dramaPayload: payload,
                }
              : turn,
          ),
        }));
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
        setRunToast({ message: error?.message || "短剧创作失败", type: "error" });
      }
    },
    [ensureAgentResultCard, runAgentConversation, updateActiveAgentSession],
  );

  const runCanvasPlanMission = useCallback(
    async (userText, routeMeta = {}, requestOptions = {}) => {
      updateApiDebugStatus("agentPlanner", {
        status: "loading",
        message: "POST /api/agent/message -> canvas_plan",
        detail: "",
      });
      try {
        const requestPayload = {
          prompt: userText,
          supplementalPrompt: String(requestOptions?.supplementalPrompt || "").trim(),
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
        };
        const agentResponse = await runAgentConversation(
          userText,
          routeMeta,
          {
            supplementalPrompt: requestPayload.supplementalPrompt || "",
          },
        );
        if (!(agentResponse?.action === "canvas_plan" && agentResponse?.data && typeof agentResponse.data === "object")) {
          throw new Error("Agent 未返回画布规划结果");
        }
        const response = agentResponse.data;

        const plannerDebug = response?.debug?.planner || {};
        const plannerPath = String(plannerDebug?.planner_path || "unknown");
        updateApiDebugStatus("agentPlanner", {
          status: plannerPath.includes("fallback") || plannerPath === "legacy" ? "warning" : "success",
          message: `agent_v2 · thread=${plannerDebug?.thread_id || canvasId || "--"}`,
        });
        pushApiDebugDetail("agentPlanner", {
          type: "response",
          path: "/api/agent/message",
          payload: {
            prompt: requestPayload.prompt,
            supplementalPrompt: requestPayload.supplementalPrompt || "",
            currentNodes: requestPayload.currentNodes.length,
            currentConnections: requestPayload.currentConnections.length,
            canvasId: requestPayload.canvasId || "",
          },
          response: {
            debug: plannerDebug,
            patch_count: Array.isArray(response?.patch) ? response.patch.length : 0,
            summary: response?.summary || "",
            thought: response?.thought || "",
          },
        });

        const patch = Array.isArray(response?.patch) ? response.patch : [];
        if (!patch.length && !parseCanvasClarification(response)) {
          throw new Error("Agent 未返回可执行的画布补丁");
        }

        if (patch.length) {
          pushHistory();
          _applyPatch(patch);
        }
        return response;
      } catch (error) {
        updateApiDebugStatus("agentPlanner", {
          status: "error",
          message: error?.message || "POST /api/agent/message failed",
        });
        pushApiDebugDetail("agentPlanner", {
          type: "error",
          path: "/api/agent/message",
          message: error?.message || String(error || ""),
        });
        throw error;
      }
    },
    [activeArtifact, canvasId, _applyPatch, pushApiDebugDetail, pushHistory, runAgentConversation, updateApiDebugStatus],
  );

  const getLatestResultTurn = useCallback(() => {
    const turns = activeAgentSession?.turns || [];
    return [...turns].reverse().find((turn) => turn?.status === "done" && turn?.response) || null;
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
      if (!/(脚本|导出|渲染|帮助|怎么|你好|谢谢)/.test(raw)) {
        return raw;
      }
    }
    return "";
  }, []);

  const updateScriptBriefDraft = useCallback((turnId, nextBrief) => {
    updateActiveAgentSession((session) => ({
      ...session,
      turns: (session.turns || []).map((turn) =>
        turn.id === turnId
          ? {
              ...turn,
              scriptBriefDraft: normalizeScriptBrief(nextBrief),
            }
          : turn,
      ),
    }));
  }, [updateActiveAgentSession]);

  const selectScriptAngleForTurn = useCallback((turnId, angle) => {
    updateActiveAgentSession((session) => ({
      ...session,
      turns: (session.turns || []).map((turn) => {
        if (turn.id !== turnId) return turn;
        const baseBrief = normalizeScriptBrief(turn.scriptBrief || turn.scriptBriefDraft || {});
        return {
          ...turn,
          scriptBrief: {
            ...baseBrief,
            selectedAngle: angle,
          },
        };
      }),
    }));
  }, [updateActiveAgentSession]);

  const cancelScriptBriefTurn = useCallback((turnId) => {
    updateActiveAgentSession((session) => ({
      ...session,
      turns: (session.turns || []).map((turn) =>
        turn.id === turnId
          ? {
              ...turn,
              status: "assistant",
              assistantText: "已取消这次脚本设定。",
              scriptBriefDraft: null,
            }
          : turn,
      ),
    }));
  }, [updateActiveAgentSession]);

  const submitScriptBriefTurn = useCallback((turnId, { useDefaults = false } = {}) => {
    const turn = (activeAgentSession?.turns || []).find((item) => item.id === turnId);
    if (!turn) return;
    const fallbackBrief = buildInitialScriptBrief(turn.userText || "", turn.extractedProduct || "");
    const currentBrief = normalizeScriptBrief(turn.scriptBriefDraft || turn.scriptBrief || fallbackBrief);
    const nextBrief = normalizeScriptBrief(
      useDefaults
        ? {
            ...fallbackBrief,
            ...currentBrief,
            product: currentBrief.product || fallbackBrief.product,
            primaryPlatform: currentBrief.primaryPlatform || fallbackBrief.primaryPlatform || "抖音",
            conversionGoal: currentBrief.conversionGoal || fallbackBrief.conversionGoal || "点击商品详情",
          }
        : currentBrief,
    );

    if (!nextBrief.product) {
      setRunToast({ message: "请先填写产品 / 服务", type: "error" });
      return;
    }
    if (!nextBrief.primaryPlatform) {
      setRunToast({ message: "请至少选择一个主平台", type: "error" });
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
              extractedProduct: nextBrief.product,
              scriptBrief: nextBrief,
              scriptBriefDraft: nextBrief,
              routeDebug: buildRouteDebug(
                {
                  intent: "SCRIPT",
                  product: nextBrief.product,
                  reason: useDefaults ? "script_brief_submit_defaults" : "script_brief_submit",
                },
                true,
              ),
            }
          : item,
      ),
    }));
    ensureAgentResultCard(turnId);
    runMissionOnTurn(
      turnId,
      turn.userText || "",
      nextBrief.product,
      {
        intent: "SCRIPT",
        product: nextBrief.product,
        sessionId: activeAgentSession?.id || "",
      },
      nextBrief,
    );
  }, [activeAgentSession?.id, activeAgentSession?.turns, ensureAgentResultCard, runMissionOnTurn, setRunToast, updateActiveAgentSession]);

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
    async (text, options = {}) => {
      const missionText = String(text || "").trim();
      const uploadedDocuments = Array.isArray(options?.uploadedDocuments) ? options.uploadedDocuments : [];
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
          const initialBrief = buildInitialScriptBrief(pendingTask.rawText || missionText, filledProduct);
          updateActiveAgentSession((session) => ({
            ...session,
            turns: [
              ...(session.turns || []),
              {
                id: turnId,
                userText: pendingTask.rawText || missionText,
                extractedProduct: filledProduct,
                status: "clarify",
                assistantText: `已识别产品「${filledProduct}」，请确认这次脚本设定。`,
                createdAt: Date.now(),
                stepIndex: 0,
                exports: {},
                intent: "SCRIPT",
                intentReason: "pending_task_filled",
                routeDebug: buildRouteDebug(
                  { intent: "SCRIPT", reason: "pending_task_filled", product: filledProduct },
                  false,
                ),
                scriptBriefDraft: initialBrief,
              },
            ],
            pendingTask: null,
          }));
          return;
        }
      }

      if (pendingTask?.intent === "CANVAS" && (pendingTask?.missing || []).includes("prompt")) {
        const supplementedPrompt = String(missionText || "").trim();
        if (supplementedPrompt) {
          clearPendingTaskForActiveSession();
          try {
            const response = await runCanvasPlanMission(
              pendingTask.rawText || "",
              {
                intent: "CANVAS",
                product: "",
                sessionId,
              },
              {
                supplementalPrompt: supplementedPrompt,
              },
            );
            const clarification = parseCanvasClarification(response);
            if (clarification) {
              setPendingTaskForActiveSession({
                intent: "CANVAS",
                rawText: pendingTask.rawText || "",
                extractedProduct: "",
                missing: ["prompt"],
                clarifyMode: clarification.mode,
                createdAt: Date.now(),
              });
            }
            appendAssistantTurn(
              missionText,
              String(response?.summary || response?.response_text || response?.thought || "").trim(),
              {
                status: clarification ? "clarify" : "assistant",
                userTextOverride: "",
                showCancelPending: !!clarification,
                routeDebug: buildRouteDebug(
                  {
                    intent: "CANVAS",
                    reason: clarification ? "canvas_prompt_clarification_pending" : "canvas_prompt_clarification_filled",
                    product: "",
                  },
                  true,
                ),
              },
            );
            if (clarification) {
              setRunToast({
                message: String(response?.summary || response?.response_text || response?.thought || "").trim(),
                type: "info",
              });
            }
          } catch (error) {
            appendAssistantTurn(
              missionText,
              error?.message || "画布自动搭建失败，请稍后重试。",
              {
                userTextOverride: "",
                routeDebug: buildRouteDebug(
                  { intent: "CANVAS", reason: "canvas_prompt_clarification_failed", product: "" },
                  true,
                ),
              },
            );
            setRunToast({ message: error?.message || "画布自动搭建失败", type: "error" });
          }
          return;
        }
      }

      const route = {
        intent: "UNKNOWN",
        reason: "frontend_router_removed",
        product: "",
      };
      const extractedSupplementalPrompt = extractCanvasSupplementalPrompt(missionText);
      const pendingTurnId = appendAgentTurn({
        userText: missionText,
        status: "running",
        assistantText: "",
        routeDebug: buildRouteDebug(route, true),
        uploadedDocuments,
      });
      try {
        const response = await runAgentConversation(
          missionText,
          route,
          {
            supplementalPrompt: extractedSupplementalPrompt || "",
            uploadedDocuments,
          },
        );
        const responseText = String(response?.response_text || "").trim();
        const routeDebug = buildRouteDebug(
          {
            ...route,
            reason: response?.decision?.matched_rule
              ? `agent_v2:${response.decision.matched_rule}`
              : `agent_v2:${route.reason || "message"}`,
          },
          true,
          response,
        );

        if (response?.action === "canvas_plan" && response?.data && typeof response.data === "object") {
          const plannerResult = response.data;
          const patch = Array.isArray(plannerResult?.patch) ? plannerResult.patch : [];
          const clarification = parseCanvasClarification(plannerResult);
          if (patch.length) {
            pushHistory();
            const patchResult = _applyPatch(patch);
            if (patchResult?.nodes && patchResult?.connections) {
              upsertCanvasDraftSnapshot({
                nodes: patchResult.nodes,
                connections: patchResult.connections,
                viewport: patchResult.viewport || viewportRef.current,
              });
            }
          }
          if (clarification) {
            setPendingTaskForActiveSession({
              intent: "CANVAS",
              rawText: missionText,
              extractedProduct: "",
              missing: ["prompt"],
              clarifyMode: clarification.mode,
              createdAt: Date.now(),
            });
          }
          updateAgentTurn(pendingTurnId, {
            status: clarification ? "clarify" : "assistant",
            assistantText: String(plannerResult?.summary || plannerResult?.response_text || plannerResult?.thought || responseText).trim(),
            showCancelPending: !!clarification,
            routeDebug,
            response: plannerResult,
            intent: "CANVAS",
            intentReason: routeDebug.reason,
          });
          if (clarification) {
            setRunToast({
              message: String(plannerResult?.summary || plannerResult?.response_text || plannerResult?.thought || responseText).trim(),
              type: "info",
            });
          }
          return;
        }

        if (response?.action === "tool_call" && response?.data?.is_async && response?.data?.task_id) {
          const storyboardTaskId = String(response.data.task_id);
          updateAgentTurn(pendingTurnId, {
            status: "running",
            assistantText: responseText || "分镜方案生成中，请稍候...",
            routeDebug,
            intent: "STORYBOARD",
            intentReason: routeDebug.reason,
          });
          try {
            const taskResult = await pollStoryboardTask(storyboardTaskId, apiFetch, (s) => {
              if (s === "running") {
                updateAgentTurn(pendingTurnId, { assistantText: "分镜方案生成中（AI 正在思考）..." });
              }
            });
            const patch = Array.isArray(taskResult?.patch) ? taskResult.patch : [];
            const storyboardNodeIds = patch
              .filter((op) => op?.op === "add_node" && op?.node?.type === "storyboard_plan")
              .map((op) => String(op?.node?.id || "").trim())
              .filter(Boolean);
            if (patch.length) {
              pushHistory();
              const patchResult = _applyPatch(patch);
              if (patchResult?.nodes && patchResult?.connections) {
                upsertCanvasDraftSnapshot({
                  nodes: patchResult.nodes,
                  connections: patchResult.connections,
                  viewport: patchResult.viewport || viewportRef.current,
                });
              }
            }
            updateAgentTurn(pendingTurnId, {
              status: "done",
              assistantText: String(taskResult?.summary || "已生成可编辑分镜方案。").trim(),
              routeDebug,
              response: { storyboardNodeIds, summary: String(taskResult?.summary || "").trim() },
              intent: "STORYBOARD",
              intentReason: routeDebug.reason,
              stepIndex: AGENT_RUN_STEPS.length - 1,
            });
          } catch (storyboardErr) {
            updateAgentTurn(pendingTurnId, {
              status: "error",
              error: storyboardErr?.message || "分镜生成失败，请稍后重试。",
              routeDebug,
            });
          }
          return;
        }

        if (
          response?.action === "tool_call" &&
          response?.data?.canvas_patch &&
          typeof response.data.canvas_patch === "object"
        ) {
          const canvasPatchResult = response.data.canvas_patch;
          const patch = Array.isArray(canvasPatchResult?.patch) ? canvasPatchResult.patch : [];
          const storyboardNodeIds = patch
            .filter((op) => op?.op === "add_node" && op?.node?.type === NODE_TYPES.STORYBOARD_PLAN)
            .map((op) => String(op?.node?.id || "").trim())
            .filter(Boolean);
          if (patch.length) {
            pushHistory();
            const patchResult = _applyPatch(patch);
            if (patchResult?.nodes && patchResult?.connections) {
              upsertCanvasDraftSnapshot({
                nodes: patchResult.nodes,
                connections: patchResult.connections,
                viewport: patchResult.viewport || viewportRef.current,
              });
            }
          }
          updateAgentTurn(pendingTurnId, {
            status: "done",
            assistantText: String(
              responseText ||
                canvasPatchResult?.summary ||
                response?.data?.summary ||
                "已生成可编辑分镜方案。"
            ).trim(),
            routeDebug,
            response: {
              ...(response.data || {}),
              storyboardNodeIds,
              summary: String(
                responseText ||
                  canvasPatchResult?.summary ||
                  response?.data?.summary ||
                  "已生成可编辑分镜方案。"
              ).trim(),
            },
            intent: "STORYBOARD",
            intentReason: routeDebug.reason,
            stepIndex: AGENT_RUN_STEPS.length - 1,
          });
          return;
        }

        if (response?.action === "tool_call" && Array.isArray(response?.data?.topics)) {
          const product = String(
            response?.data?.audience_context?.product ||
              extractProductKeyword(missionText) ||
              "",
          ).trim();
          updateAgentTurn(pendingTurnId, {
            extractedProduct: product,
            status: "done",
            stepIndex: AGENT_RUN_STEPS.length - 1,
            exports: {},
            intent: "SCRIPT",
            intentReason: routeDebug.reason,
            routeDebug,
            response: response.data,
            scriptBrief: normalizeScriptBrief({ product }),
            scriptBriefDraft: null,
          });
          return;
        }

        if (
          response?.action === "tool_call" &&
          typeof response?.data?.text === "string" &&
          (Object.prototype.hasOwnProperty.call(response?.data || {}, "summary") ||
            Object.prototype.hasOwnProperty.call(response?.data || {}, "mode"))
        ) {
          const dramaPayload = {
            prompt: missionText,
            taskMode: String(response?.data?.mode || "").trim() || "episode_script",
          };
          updateAgentTurn(pendingTurnId, {
            extractedProduct: "",
            status: "done",
            stepIndex: DRAMA_RUN_STEPS.length - 1,
            exports: {},
            intent: "DRAMA",
            intentReason: routeDebug.reason,
            routeDebug,
            response: response.data,
            dramaPayload,
          });
          return;
        }

        updateAgentTurn(pendingTurnId, {
          status: response?.action === "clarify" ? "clarify" : "assistant",
          assistantText: responseText || "我在。",
          routeDebug,
        });
      } catch (error) {
        updateAgentTurn(pendingTurnId, {
          status: "error",
          error: error?.message || "请求失败，请稍后重试。",
          routeDebug: buildRouteDebug({ ...route, reason: "agent_v2_error" }, true),
        });
      }

    },
    [
      activeAgentSession?.id,
      activeAgentSession?.pendingTask,
      activeAgentSession?.turns,
      appendAssistantTurn,
      appendAgentTurn,
      clearPendingTaskForActiveSession,
      resolvePendingProductCandidate,
      runAgentConversation,
      runDramaMissionOnTurn,
      runMissionOnTurn,
      sendAIChatLanguageStream,
      apiFetch,
      runCanvasPlanMission,
      setPendingTaskForActiveSession,
      updateAgentTurn,
      updateActiveAgentSession,
      upsertCanvasDraftSnapshot,
    ],
  );

  const sendAgentMission = () => {
    const text = String(agentInput || "").trim();
    const documentAttachments = agentComposerFiles
      .filter((item) => item.kind === "document")
      .map((item) => ({
        name: item.name,
        mime_type: item.mimeType || "",
        kind: item.documentKind || "document",
        text_content: item.textContent || "",
      }))
      .filter((item) => String(item.text_content || "").trim());
    const imageAttachments = agentComposerFiles.filter((item) => item.kind === "image");
    const fallbackText = documentAttachments.some(
      (item) =>
        item.kind === "storyboard_script_table" ||
        /\.(csv|tsv)$/i.test(String(item.name || "")),
    )
      ? "请将这份分镜头脚本整理成故事板"
      : documentAttachments.length
      ? "请处理我上传的文件"
      : "";
    const effectiveText = text || fallbackText;
    if (!effectiveText) {
      if (agentComposerFiles.length > 0) {
        setRunToast({ message: "请补充一句需求描述，或上传可解析的脚本表文件", type: "info" });
      }
      return;
    }
    const attachmentNote = imageAttachments.length
      ? `\n\n[已附参考图片: ${imageAttachments.map((item) => item.name).join("，")}]`
      : "";
    setAgentInput("");
    setActiveComposerActionId("");
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
    void sendAgentMissionFromText(`${effectiveText}${attachmentNote}`, {
      uploadedDocuments: documentAttachments,
    });
  };

  const polishAgentPromptInput = async () => {
    const sourcePrompt = String(agentInput || "").trim();
    if (!sourcePrompt) {
      setAgentPromptPolishError("请先输入提示词");
      return;
    }
    if (!apiFetch) {
      setAgentPromptPolishError("缺少 API 连接");
      return;
    }
    setAgentPromptPolishLoading(true);
    setAgentPromptPolishError("");
    try {
      const result = await polishCanvasPrompt({ prompt: sourcePrompt, mode: "text2img" }, apiFetch);
      const variants = normalizePromptPolishVariants(result);
      if (!variants.length) throw new Error("润色结果为空");
      openPromptPolishPicker({
        title: "提示词润色",
        sourcePrompt,
        variants,
        onUse: (text) => {
          setAgentInput(text);
          setAgentInputFocused(true);
          agentInputRef.current?.focus();
        },
      });
    } catch (error) {
      setAgentPromptPolishError(error instanceof Error ? error.message : String(error));
    } finally {
      setAgentPromptPolishLoading(false);
    }
  };

  const handleAgentComposerUpload = useCallback(async (event) => {
    const files = Array.from(event.target?.files || []);
    if (!files.length) return;
    const preparedItems = [];
    for (const file of files) {
      const duplicate = agentComposerFiles.some(
        (item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified,
      );
      if (duplicate) continue;
      if (String(file.type || "").startsWith("image/")) {
        preparedItems.push({
          id: `agent_file_${makeAgentId()}`,
          kind: "image",
          name: file.name,
          size: file.size,
          lastModified: file.lastModified,
          previewUrl: URL.createObjectURL(file),
        });
        continue;
      }
      if (!isAgentComposerDocumentFile(file)) {
        setRunToast({ message: `暂不支持上传 ${file.name}，请使用 csv/tsv/txt/md 或图片`, type: "error" });
        continue;
      }
      if (Number(file.size || 0) > AGENT_DOCUMENT_MAX_BYTES) {
        setRunToast({ message: `${file.name} 超过 1MB，先精简脚本表再上传`, type: "error" });
        continue;
      }
      try {
        const textContent = decodeStoryboardDocumentBuffer(await file.arrayBuffer());
        if (!textContent) {
          setRunToast({ message: `${file.name} 内容为空`, type: "error" });
          continue;
        }
        preparedItems.push({
          id: `agent_file_${makeAgentId()}`,
          kind: "document",
          documentKind: looksLikeStoryboardScriptTableFile(file.name, textContent) ? "storyboard_script_table" : "document",
          name: file.name,
          size: file.size,
          lastModified: file.lastModified,
          mimeType: String(file.type || "").trim() || "text/plain",
          textContent,
        });
      } catch (error) {
        setRunToast({ message: `${file.name} 读取失败`, type: "error" });
      }
    }
    if (preparedItems.length) {
      setAgentComposerFiles((prev) => [...prev, ...preparedItems].slice(0, 4));
      setAgentInputFocused(true);
      agentInputRef.current?.focus();
    }
    event.target.value = "";
  }, [agentComposerFiles, setRunToast]);

  const removeAgentComposerFile = useCallback((fileId) => {
    setAgentComposerFiles((prev) => {
      const target = prev.find((item) => item.id === fileId);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((item) => item.id !== fileId);
    });
  }, []);

  const handleAgentQuickAction = useCallback(
    (actionId) => {
      if (actionId === "script") {
        const shouldClose = activeComposerActionId === "script" || showScriptExamples;
        setActiveComposerActionId((prev) => (prev === "script" ? "" : "script"));
        setShowCanvasExamples(false);
        setShowScriptExamples(!shouldClose);
        setAgentInputFocused(true);
        agentInputRef.current?.focus();
        return;
      }
      if (actionId === "drama") {
        setActiveComposerActionId("drama");
        setShowCanvasExamples(false);
        setShowScriptExamples(false);
        setAgentInput((prev) => (String(prev || "").trim() ? prev : AGENT_DRAMA_QUICK_PROMPT));
        setAgentInputFocused(true);
        agentInputRef.current?.focus();
        return;
      }
      if (actionId === "canvas") {
        const shouldClose = activeComposerActionId === "canvas" || showCanvasExamples;
        setActiveComposerActionId((prev) => (prev === "canvas" ? "" : "canvas"));
        setShowScriptExamples(false);
        setShowCanvasExamples(!shouldClose);
        setAgentInputFocused(true);
        agentInputRef.current?.focus();
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
    },
    [
      activeComposerActionId,
      appendAssistantTurn,
      clearPendingTaskForActiveSession,
      showCanvasExamples,
      showScriptExamples,
    ],
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

  const insertCanvasPromptExample = useCallback((text) => {
    const nextText = String(text || "").trim();
    if (!nextText) return;
    setAgentInput(nextText);
    setAgentInputFocused(true);
    agentInputRef.current?.focus();
  }, []);

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
      const reason =
        turn?.status === "error" || response?.generation_warning || response?.inference_warning
          ? (turn?.intent === "DRAMA" ? "短剧创作失败" : "生成脚本失败")
          : (turn?.intent === "DRAMA" ? "短剧结果需要复核" : "脚本结果需要复核");
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
    if (turn?.intent === "DRAMA") {
      const dramaPayload =
        turn?.dramaPayload && typeof turn.dramaPayload === "object"
          ? turn.dramaPayload
          : { prompt: String(turn?.userText || "").trim() };
      if (!String(dramaPayload?.prompt || "").trim()) {
        setRunToast({ message: "缺少短剧创作内容", type: "error" });
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
                dramaPayload,
                routeDebug: buildRouteDebug(
                  { intent: "DRAMA", product: "", reason: "retry" },
                  true,
                ),
              }
            : item,
        ),
      }));
      runDramaMissionOnTurn(turnId, dramaPayload, {
        intent: "DRAMA",
        product: "",
        sessionId: activeAgentSession?.id || "",
      });
      return;
    }
    if (turn?.intent === "STORYBOARD") {
      updateActiveAgentSession((session) => ({
        ...session,
        turns: (session.turns || []).map((item) =>
          item.id === turnId
            ? { ...item, status: "running", error: "", stepIndex: 0 }
            : item,
        ),
      }));
      void sendAgentMissionFromText(turn.userText || "", {});
      return;
    }
    const brief = normalizeScriptBrief(turn.scriptBrief || turn.scriptBriefDraft || {});
    const product = brief.product || turn.extractedProduct || extractProductKeyword(turn.userText || "");
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
              scriptBrief: {
                ...brief,
                product,
              },
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
    }, {
      ...brief,
      product,
    });
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
    e.preventDefault();
    e.stopPropagation();
    connectionHoverTargetRef.current = null;
    setHoveredConnectTarget(null);
    const r = e.currentTarget.getBoundingClientRect();
    setConnectingSource({ nodeId: nid, x: r.left + r.width / 2, y: r.top + r.height / 2 });
  };

  const completeConnection = useCallback((tid, toHandle = VIDEO_GEN_INPUT_HANDLE_MAIN) => {
    const normalizedToHandle = normalizeConnectionTargetHandle(toHandle);
    if (
      connectingSource &&
      connectingSource.nodeId !== tid &&
      !connectionsRef.current.find(
        (c) =>
          c.from === connectingSource.nodeId &&
          c.to === tid &&
          normalizeConnectionTargetHandle(c.toHandle) === normalizedToHandle,
      )
    ) {
      setConnections((prev) => [
        ...prev,
        { id: generateId(), from: connectingSource.nodeId, to: tid, toHandle: normalizedToHandle },
      ]);
    }
    connectionHoverTargetRef.current = null;
    setHoveredConnectTarget(null);
    setConnectingSource(null);
  }, [connectingSource]);

  const handleConnectionTargetHover = useCallback((tid, toHandle = VIDEO_GEN_INPUT_HANDLE_MAIN) => {
    if (!connectingSource) return;
    const nextTarget = {
      nodeId: tid,
      toHandle: normalizeConnectionTargetHandle(toHandle),
    };
    connectionHoverTargetRef.current = nextTarget;
    setHoveredConnectTarget(nextTarget);
  }, [connectingSource]);

  const handleConnectionTargetLeave = useCallback((tid, toHandle = VIDEO_GEN_INPUT_HANDLE_MAIN) => {
    const normalizedToHandle = normalizeConnectionTargetHandle(toHandle);
    if (
      connectionHoverTargetRef.current?.nodeId === tid &&
      normalizeConnectionTargetHandle(connectionHoverTargetRef.current?.toHandle) === normalizedToHandle
    ) {
      connectionHoverTargetRef.current = null;
      setHoveredConnectTarget(null);
    }
  }, []);

  useEffect(() => {
    if (!connectingSource) {
      const bodyStyle = document.body?.style;
      if (bodyStyle) {
        bodyStyle.userSelect = connectionDragSelectionRef.current.userSelect;
        bodyStyle.webkitUserSelect = connectionDragSelectionRef.current.webkitUserSelect;
      }
      return undefined;
    }

    const bodyStyle = document.body?.style;
    if (bodyStyle) {
      connectionDragSelectionRef.current = {
        userSelect: bodyStyle.userSelect,
        webkitUserSelect: bodyStyle.webkitUserSelect,
      };
      bodyStyle.userSelect = "none";
      bodyStyle.webkitUserSelect = "none";
    }

    const cleanupConnectionDrag = () => {
      const hoverTarget = connectionHoverTargetRef.current;
      if (hoverTarget?.nodeId) {
        completeConnection(hoverTarget.nodeId, hoverTarget.toHandle);
        return;
      }
      connectionHoverTargetRef.current = null;
      setHoveredConnectTarget(null);
      setConnectingSource(null);
    };

    window.addEventListener("mouseup", cleanupConnectionDrag);
    window.addEventListener("pointerup", cleanupConnectionDrag);
    window.addEventListener("blur", cleanupConnectionDrag);

    return () => {
      window.removeEventListener("mouseup", cleanupConnectionDrag);
      window.removeEventListener("pointerup", cleanupConnectionDrag);
      window.removeEventListener("blur", cleanupConnectionDrag);
      if (bodyStyle) {
        bodyStyle.userSelect = connectionDragSelectionRef.current.userSelect;
        bodyStyle.webkitUserSelect = connectionDragSelectionRef.current.webkitUserSelect;
      }
    };
  }, [completeConnection, connectingSource]);

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
      return <div className="w-full h-28 rounded-lg border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center text-[11px] text-slate-500">暂无{title}</div>;
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
              className="relative block w-full h-28 rounded-lg border border-slate-200 overflow-hidden bg-slate-100"
              title="点击放大预览"
            >
              {isVideo ? (
                <VideoPlayer src={item.url} className="w-full h-full object-cover" controls />
              ) : (
                <img src={item.url} alt={item.label || title} className="w-full h-full object-cover" />
              )}
              {item.label && (
                <span className="absolute left-1 top-1 text-[10px] px-1.5 py-0.5 rounded border border-slate-200 bg-white/90 text-slate-700">
                  {item.label}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  };

  const cancelCurrentGeneration = useCallback(() => {
    const controller = runAbortControllerRef.current;
    if (!controller || controller.signal.aborted) return;
    controller.abort(new DOMException("生成已取消", "AbortError"));
    nodeAbortControllersRef.current.forEach((nodeController) => {
      if (!nodeController.signal.aborted) {
        nodeController.abort(new DOMException("生成已取消", "AbortError"));
      }
    });
    setRunToast({ message: "正在取消当前生成...", type: "info" });
    setTimeout(() => setRunToast(null), 1800);
  }, []);

  const cancelNodeGeneration = useCallback((nodeId) => {
    const normalizedNodeId = String(nodeId || "").trim();
    if (!normalizedNodeId) return;
    cancelledNodeIdsRef.current.add(normalizedNodeId);
    const controller = nodeAbortControllersRef.current.get(normalizedNodeId);
    if (controller && !controller.signal.aborted) {
      controller.abort(new DOMException("节点生成已取消", "AbortError"));
    }
    setNodes((prev) =>
      prev.map((node) =>
        node.id === normalizedNodeId && node.data?.status === "loading"
          ? {
              ...node,
              data: {
                ...node.data,
                status: "idle",
                error: "已取消",
                progress: 0,
                total: 0,
              },
            }
          : node,
      ),
    );
    setRunToast({ message: "已取消该节点生成", type: "info" });
    setTimeout(() => setRunToast(null), 1800);
  }, []);

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
    if (runAbortControllerRef.current && !runAbortControllerRef.current.signal.aborted) {
      setRunToast({ message: "已有生成任务正在运行", type: "info" });
      setTimeout(() => setRunToast(null), 1800);
      return;
    }
    setGlobalError(null);

    const baseNodes = nodesRef.current;
    const baseConnections = connectionsRef.current;

    const runtimeNodes = new Map(baseNodes.map((n) => [n.id, cloneCanvasNodeLight(n)]));

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
              next.push({ id: generateId(), from: conn.from, to: conn.to, ...(conn.toHandle ? { toHandle: conn.toHandle } : {}) });
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
    const runController = new AbortController();
    const runSignal = runController.signal;
    runAbortControllerRef.current = runController;
    runningNodeIdsRef.current = new Set(targetIds);
    cancelledNodeIdsRef.current = new Set();
    nodeAbortControllersRef.current = new Map();
    let currentNodeSignal = null;
    const throwIfCancelled = () => {
      if (runSignal.aborted) {
        throw runSignal.reason || new DOMException("生成已取消", "AbortError");
      }
    };
    const runApiFetch = (url, init = {}) => {
      throwIfCancelled();
      return apiFetch(url, { ...init, signal: currentNodeSignal || runSignal });
    };
    const runSubmitAIChatImageTask = (payload, options = {}) =>
      submitAIChatImageTask(runApiFetch, payload, { ...options, signal: currentNodeSignal || runSignal });

    setIsRunning(true);

    setNodes((prev) =>
      prev.map((n) =>
        specificNodesSet.has(n.id) ? { ...n, data: { ...n.data, status: "loading", error: null, progress: 0, total: 0 } } : n
      )
    );

    try {
      for (const nodeId of finalOrder) {
        throwIfCancelled();
        if (cancelledNodeIdsRef.current.has(nodeId)) {
          setNodes((prev) =>
            prev.map((node) =>
              node.id === nodeId && node.data?.status === "loading"
                ? { ...node, data: { ...node.data, status: "idle", error: "已取消", progress: 0, total: 0 } }
                : node,
            ),
          );
          continue;
        }
        const procNode = runtimeNodes.get(nodeId);
        if (!procNode) continue;
        const nodeController = new AbortController();
        nodeAbortControllersRef.current.set(nodeId, nodeController);
        currentNodeSignal = nodeController.signal;
        let nodeWasCancelled = false;
        const markCurrentNodeCancelled = () => {
          nodeWasCancelled = true;
          cancelledNodeIdsRef.current.add(nodeId);
          applyNodeUpdate(procNode.id, {
            status: "idle",
            error: "已取消",
            progress: 0,
            total: 0,
          });
        };

        const incomingConns = baseConnections.filter((c) => c.to === procNode.id);
        const primaryIncomingConns = incomingConns.filter(
          (c) => normalizeConnectionTargetHandle(c.toHandle) !== VIDEO_GEN_INPUT_HANDLE_LAST_FRAME,
        );
        const lastFrameIncomingConns = incomingConns.filter(
          (c) => normalizeConnectionTargetHandle(c.toHandle) === VIDEO_GEN_INPUT_HANDLE_LAST_FRAME,
        );
        const sourceNodes = primaryIncomingConns.map((c) => runtimeNodes.get(c.from)).filter(Boolean);
        const lastFrameSourceNodes = lastFrameIncomingConns.map((c) => runtimeNodes.get(c.from)).filter(Boolean);

        const outputConn = baseConnections.find((c) => c.from === procNode.id);
        const targetOutput = outputConn ? runtimeNodes.get(outputConn.to) : null;

        const batchSize = procNode.data.batchSize || 1;

        let inputImages = [];
        let sourceText = "";
        const sourceNodeMediaGroups = [];
        const lastFrameImages = [];

        sourceNodes.forEach((sn) => {
          const snImages = sn.data.images || [];
          const snUploads = sn.data.uploadedImages || [];
          const mediaGroup = [...snImages, ...snUploads].filter(Boolean);
          if (mediaGroup.length) sourceNodeMediaGroups.push(mediaGroup);
          inputImages.push(...snImages, ...snUploads);
          if (sn.data.text) sourceText += sn.data.text + " ";
        });
        lastFrameSourceNodes.forEach((sn) => {
          lastFrameImages.push(...(sn.data.images || []), ...(sn.data.uploadedImages || []));
        });
        sourceText = sourceText.trim();

        if (procNode.type === NODE_TYPES.ROLE_STRUCTURER) {
          const profile = buildRoleProfileStructuredOutput({
            roleName: procNode.data.roleName,
            characterSetting: procNode.data.characterSetting || sourceText,
            relationshipNetwork: procNode.data.relationshipNetwork,
            worldviewBackground: procNode.data.worldviewBackground,
          });
          applyNodeUpdate(procNode.id, {
            structuredProfile: profile,
            text: JSON.stringify(profile, null, 2),
            status: "success",
            error: "",
            progress: 1,
            total: 1,
          });
          nodeAbortControllersRef.current.delete(nodeId);
          currentNodeSignal = null;
          continue;
        }



        const shouldAutoUseImg2ImgForImageCreation =
          procNode.type === NODE_TYPES.PROCESSOR &&
          procNode.data.mode === "text2img" &&
          procNode.data.title === "图像创作" &&
          inputImages.length > 0;
        const effectiveProcMode = shouldAutoUseImg2ImgForImageCreation ? "multi_image_generate" : procNode.data.mode;
        const shouldAggregateMultiSourceImg2Video =
          effectiveProcMode === "img2video" && sourceNodeMediaGroups.length > 1;
        const needsSingle =
          effectiveProcMode === "multi_image_generate" ||
          effectiveProcMode === "text2img" ||
          effectiveProcMode === "local_text2img" ||
          effectiveProcMode === "text2video";
        const effectiveInputCount = needsSingle || shouldAggregateMultiSourceImg2Video ? 1 : inputImages.length;

        if (effectiveInputCount === 0 && !needsSingle) {
          applyNodeUpdate(procNode.id, { status: "error", error: "溯源失败：未检测到输入图片（请确认上游节点已先产出 images，并且连线正确）" });
          nodeAbortControllersRef.current.delete(nodeId);
          currentNodeSignal = null;
          continue;
        }

        const totalTasks = effectiveInputCount * batchSize;
        applyNodeUpdate(procNode.id, { status: "loading", total: totalTasks, progress: 0 });

        const outputImages = [];

        for (let i = 0; i < effectiveInputCount; i++) {
          throwIfCancelled();
          for (let b = 0; b < batchSize; b++) {
            throwIfCancelled();
            try {
              let resultUrl = null;

              if (effectiveProcMode === "text2img" || effectiveProcMode === "local_text2img") {
                const promptToUse = sourceText || buildCanvasNodePrompt(procNode);
                if (!promptToUse?.trim()) throw new Error("缺少输入文本提示词");

                if (effectiveProcMode === "local_text2img") {
                  const resp = await runApiFetch(`/api/local/text2img`, {
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
                    const matchedRatioId = findAIChatParamValueId(paramList, ["ratio", "比例", "宽高比", "画幅", "aspect"], selectedRatio);
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
                      const proxyData = await runSubmitAIChatImageTask(proxyPayload, {
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
                        runApiFetch,
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
                          signal: runSignal,
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
                procNode.data.mode === "text2video" ||
                procNode.data.mode === "img2video" ||
                procNode.data.mode === "local_img2video"
              ) {
                const rawDuration = procNode.data.templates?.duration || "5";
                const durationInt = parseInt(String(rawDuration).replace(/[^0-9]/g, "")) || 5;
                const isCameraFixed = procNode.data.templates?.camera?.includes("固定") || false;
                const aggregatedPrimaryImage = shouldAggregateMultiSourceImg2Video
                  ? sourceNodeMediaGroups[0]?.[0] || ""
                  : "";
                const aggregatedReferenceImages = shouldAggregateMultiSourceImg2Video
                  ? sourceNodeMediaGroups.slice(1).flat().filter(Boolean)
                  : [];

                const payload = {
                  model: procNode.data.model || defaultVideoModelId,
                  image: procNode.data.mode === "text2video" ? "" : (shouldAggregateMultiSourceImg2Video ? aggregatedPrimaryImage : inputImages[i]),
                  prompt: buildCanvasNodePrompt(procNode, sourceText) || "natural motion",
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
                  const resp = await runApiFetch(`/api/local/img2video`, {
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
                    message: `POST /api/ai_chat_image_via_curl part=${resolveWorkbenchAIChatPartEnum({ mode: procNode.data.mode === "text2video" ? "text2video" : "img2video" })}`,
                  });
                  let effectiveLastFrameImage = null;
                  try {
                    const modelId = String(payload.model || "").trim();
                    if (!modelId) throw new Error(procNode.data.mode === "text2video" ? "缺少文生视频模型ID" : "缺少图生视频模型ID");
                    const paramList = await resolveModelParamsForId(modelId);
                    const resolvedParamPayload = buildAIChatParamPayload(paramList);
                    const selectedResolution = String(payload.resolution || "").trim();
                    const selectedRatio = String(procNode.data.templates?.ratio || "").trim();
                    const selectedDuration = String(durationInt || "").trim();
                    const selectedImageType = procNode.data.mode === "text2video" ? "" : String(procNode.data.templates?.imageType || "").trim();
                    const imageTypeOptions = listAIChatParamChoiceOptions(
                      paramList,
                      ["imagetype", "image_type", "模式", "参考模式", "参考类型"]
                    );
                    effectiveLastFrameImage = isFirstLastFrameReferenceSelection(selectedImageType, imageTypeOptions)
                      ? (lastFrameImages[0] || procNode.data.lastFrameImage || procNode.data.refImage || null)
                      : null;
                    const matchedResolutionId = findAIChatParamValueId(paramList, ["resolution", "分辨率", "清晰度"], selectedResolution);
                    const matchedRatioId = findAIChatParamValueId(paramList, ["ratio", "比例", "宽高比", "画幅", "aspect"], selectedRatio);
                    const matchedDurationId = findAIChatParamValueId(paramList, ["duration", "时长", "秒数"], selectedDuration);
                    const matchedImageTypeId = findAIChatParamValueId(paramList, ["imagetype", "image_type", "模式", "参考模式", "参考类型"], selectedImageType);
                    if (selectedResolution && !matchedResolutionId) {
                      throw new Error(`未匹配到resolution参数ID: ${selectedResolution}`);
                    }
                    if (selectedDuration && !matchedDurationId) {
                      throw new Error(`未匹配到duration参数ID: ${selectedDuration}`);
                    }
                    if (selectedImageType && !matchedImageTypeId) {
                      throw new Error(`未匹配到imagetype参数ID: ${selectedImageType}`);
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
                    if (matchedImageTypeId) {
                      resolvedParamPayload.ai_video_param_image_type_id = matchedImageTypeId;
                    }
                    const authorizationInfo = resolveMemberAuthorizationInfo();
                    const imagesPayload = procNode.data.mode === "text2video"
                      ? EMPTY_LIST
                      : [payload.image, ...aggregatedReferenceImages, effectiveLastFrameImage].filter(Boolean);
                    const proxyPayload = {
                      ...(agentDevMode ? { endpoint: "http://192.168.20.12:16313/ai/aiChat" } : {}),
                      authorization: authorizationInfo?.value || "",
                      history_ai_chat_record_id: aiChatHistoryRecordIdRef.current || "",
                      module_enum: WORKBENCH_AI_CHAT_MODULE_ENUM,
                      part_enum: String(resolveWorkbenchAIChatPartEnum({ mode: procNode.data.mode === "text2video" ? "text2video" : "img2video" })),
                      ai_chat_session_id: aiChatSessionIdRef.current || "",
                      ai_chat_model_id: modelId,
                      message: payload.prompt || "natural motion",
                      async: "0",
                      timeout_seconds: 600,
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
                          image_type: selectedImageType || "-",
                          image_type_id: resolvedParamPayload.ai_video_param_image_type_id || "",
                        },
                      },
                      authorizationSource: authorizationInfo?.source || "none",
                    });
                    const proxyData = await runSubmitAIChatImageTask(proxyPayload, {
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
                      throw new Error(`${procNode.data.mode === "text2video" ? "aiChat 文生视频" : "aiChat 图生视频"}未返回可解析URL${summary ? ` | 响应摘要: ${summary}` : ""}`);
                    }
                    updateApiDebugStatus("aiChatImage", {
                      status: "success",
                      message: `part=${resolveWorkbenchAIChatPartEnum({ mode: procNode.data.mode === "text2video" ? "text2video" : "img2video" })} model=${modelId} params=${Object.keys(resolvedParamPayload).length}`,
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
                      message: procNode.data.mode === "text2video" ? "text2video 代理失败" : "img2video 代理失败，回退 /api/img2video",
                    });
                    if (procNode.data.mode === "text2video") {
                      throw new Error(`text2video 代理失败: ${proxyErrorMsg}`);
                    }
                    if (shouldAggregateMultiSourceImg2Video && aggregatedReferenceImages.length) {
                      throw new Error(`img2video 代理失败: ${proxyErrorMsg}; 多输入节点聚合模式不支持回退 /api/img2video`);
                    }
                    try {
                      const fallbackPayload = effectiveLastFrameImage
                        ? {
                            ...payload,
                            last_frame_image: effectiveLastFrameImage,
                          }
                        : payload;
                      const resp = await runApiFetch(`/api/img2video`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(fallbackPayload),
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
              } else if (effectiveProcMode === "multi_image_generate") {
                const promptToUse = sourceText || buildCanvasNodePrompt(procNode);
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
                  const matchedRatioId = findAIChatParamValueId(paramList, ["ratio", "比例", "宽高比", "画幅", "aspect"], selectedRatio);
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
                  const proxyData = await runSubmitAIChatImageTask(proxyPayload, {
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
                const resp = await runApiFetch(`/api/rmbg`, {
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
                const resp = await runApiFetch(`/api/multi_image_generate`, {
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
                    ...(agentDevMode ? { endpoint: "http://192.168.20.12:16313/ai/aiChat" } : {}),
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
                  const proxyData = await runSubmitAIChatImageTask(proxyPayload, {
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
                const resp = await runApiFetch(`/api/multi_angleshots`, {
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
                const resp = await runApiFetch(`/api/edit`, {
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
              if (runSignal.aborted) {
                throw e;
              }
              if (currentNodeSignal?.aborted || cancelledNodeIdsRef.current.has(nodeId) || isAbortLikeError(e)) {
                markCurrentNodeCancelled();
                break;
              }
              console.error("Task execution failed:", e);
              applyNodeUpdate(procNode.id, { status: "error", error: e.message || String(e) });
            }

            if (nodeWasCancelled) break;
            throwIfCancelled();
            const currentProgress = i * batchSize + (b + 1);
            applyNodeUpdate(procNode.id, { progress: currentProgress });
          }
          if (nodeWasCancelled) break;
        }

        if (nodeWasCancelled) {
          nodeAbortControllersRef.current.delete(nodeId);
          currentNodeSignal = null;
          continue;
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
        nodeAbortControllersRef.current.delete(nodeId);
        currentNodeSignal = null;
      }
    } catch (error) {
      if (runSignal.aborted || isAbortLikeError(error)) {
        const runningIds = new Set(runningNodeIdsRef.current || []);
        setNodes((prev) =>
          prev.map((node) =>
            runningIds.has(node.id) && node.data?.status === "loading"
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    status: "idle",
                    error: "已取消",
                    progress: 0,
                    total: 0,
                  },
                }
              : node,
          ),
        );
        setRunToast({ message: "已取消当前生成", type: "info" });
        setTimeout(() => setRunToast(null), 1800);
      } else {
        console.error("[Workbench] executeFlow:error", error);
        setGlobalError(error instanceof Error ? error.message : String(error || "运行失败"));
      }
    } finally {
      if (runAbortControllerRef.current === runController) {
        runAbortControllerRef.current = null;
      }
      nodeAbortControllersRef.current.clear();
      cancelledNodeIdsRef.current = new Set();
      runningNodeIdsRef.current = new Set();
      setIsRunning(false);
    }
  };

  const runCompactThreeView = useCallback(
    async (sourceNodeId, imageIndex = 0) => {
      const sourceNode = nodesRef.current.find((node) => node.id === sourceNodeId);
      const sourceImages = Array.isArray(sourceNode?.data?.images) ? sourceNode.data.images : [];
      const retrySources =
        sourceNode?.data?.compactThreeViewSourceImages && typeof sourceNode.data.compactThreeViewSourceImages === "object"
          ? sourceNode.data.compactThreeViewSourceImages
          : {};
      const imageEntries = sourceImages
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => !!item && !isVideoContent(item));
      if (!imageEntries.length) {
        throw new Error("缺少三视图输入图片");
      }
      const firstSourceImage = String(retrySources?.[imageEntries[0]?.index] || imageEntries[0]?.item || "").trim();

      const modelId = String(threeViewImageModelId || "").trim();
      if (!modelId) {
        throw new Error("图片模型仍在加载，请稍后重试");
      }

      const paramList = await resolveModelParamsForId(modelId);
      const resolvedParamPayload = buildAIChatParamPayload(paramList);
      const matchedSizeId =
        findAIChatParamValueId(paramList, ["size", "尺寸"], THREE_VIEW_DEFAULT_TEMPLATES.size) ||
        findAIChatParamValueId(paramList, ["size", "尺寸"], "1024x1024");
      const matchedRatioId = findAIChatParamValueId(paramList, ["ratio", "比例", "宽高比", "画幅", "aspect"], THREE_VIEW_DEFAULT_TEMPLATES.aspect_ratio);

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
        images: firstSourceImage ? [firstSourceImage] : [],
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
          images: [`count=${imageEntries.length}`],
        },
        authorizationSource: authorizationInfo?.source || "none",
      });
      const nextRetrySources = { ...retrySources };
      const resultImages = [];
      for (const { item, index } of imageEntries) {
        const retrySourceImage = String(nextRetrySources?.[index] || "").trim();
        const sourceImage = retrySourceImage || item;
        const proxyData = await submitAIChatImageTask(
          apiFetch,
          {
            ...proxyPayload,
            history_ai_chat_record_id: aiChatHistoryRecordIdRef.current || "",
            ai_chat_session_id: aiChatSessionIdRef.current || "",
            images: [sourceImage],
          },
          {
            onDebug: (event) => pushApiDebugDetail("aiChatImage", event),
          },
        );
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
        resultImages.push(resultUrl);
      }

      pushHistory();
      createImageOperationResultNode(sourceNodeId, resultImages, "三视图结果");
      updateApiDebugStatus("aiChatImage", {
        status: "success",
        message: `three-view model=${modelId} params=${Object.keys(resolvedParamPayload).length}`,
      });
      setRunToast({
        message: imageEntries.length > 1 ? `批量三视图完成，共 ${imageEntries.length} 张` : "三视图生成完成",
        type: "info",
      });
      setTimeout(() => setRunToast(null), 2200);
    },
    [
      apiFetch,
      pushApiDebugDetail,
      pushHistory,
      createImageOperationResultNode,
      resolveModelParamsForId,
      threeViewImageModelId,
      updateApiDebugStatus,
    ],
  );

  const handleNodeElementChange = useCallback((nodeId, element) => {
    if (!nodeId) return;
    if (element) {
      nodeElementMapRef.current.set(nodeId, element);
    } else {
      nodeElementMapRef.current.delete(nodeId);
    }
  }, []);

  const renderConnections = () =>
    connections.map((conn) => {
      const fromNode = nodes.find((n) => n.id === conn.from);
      const toNode = nodes.find((n) => n.id === conn.to);
      if (!fromNode || !toNode) return null;

      const fromAnchor = getNodeAnchorPosition(
        fromNode,
        nodeElementMapRef.current.get(fromNode.id),
        "output",
      );
      const toAnchor = getNodeAnchorPosition(
        toNode,
        nodeElementMapRef.current.get(toNode.id),
        "input",
        conn.toHandle,
      );
      const x1 = fromAnchor.x;
      const y1 = fromAnchor.y;
      const x2 = toAnchor.x;
      const y2 = toAnchor.y;

      const cp1x = x1 + (x2 - x1) / 2;
      const cp2x = x2 - (x2 - x1) / 2;
      const path = `M ${x1} ${y1} C ${cp1x} ${y1}, ${cp2x} ${y2}, ${x2} ${y2}`;
      const isSelected = selectedConnectionIds.has(conn.id);
      const isHovered = hoveredConnectionId === conn.id;
      const isInteractive = isSelected || isHovered;
      const t = 0.5;
      const invT = 1 - t;
      const midX =
        invT * invT * invT * x1 +
        3 * invT * invT * t * cp1x +
        3 * invT * t * t * cp2x +
        t * t * t * x2;
      const midY =
        invT * invT * invT * y1 +
        3 * invT * invT * t * y1 +
        3 * invT * t * t * y2 +
        t * t * t * y2;

      return (
        <g
          key={conn.id}
          onMouseEnter={() => setHoveredConnectionId(conn.id)}
          onMouseLeave={() => setHoveredConnectionId((prev) => (prev === conn.id ? "" : prev))}
        >
          <path
            d={path}
            stroke="transparent"
            strokeWidth="16"
            fill="none"
            className="cursor-pointer pointer-events-auto"
            pointerEvents="stroke"
            onMouseDown={(event) => {
              event.stopPropagation();
            }}
            onClick={(event) => handleConnectionClick(event, conn.id)}
            onDoubleClick={(event) => {
              event.stopPropagation();
              deleteConnectionById(conn.id);
            }}
          />
          <path
            d={path}
            stroke={isInteractive ? "#22d3ee" : "rgba(100,116,139,0.72)"}
            strokeWidth={isInteractive ? "3" : "2.2"}
            fill="none"
            className="pointer-events-none transition-colors duration-200"
          />
          {isInteractive ? (
            <g
              className="cursor-pointer pointer-events-auto"
              pointerEvents="all"
              onMouseDown={(event) => {
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.stopPropagation();
                deleteConnectionById(conn.id);
              }}
            >
              <title>删除连接</title>
              <circle
                cx={midX}
                cy={midY}
                r="18"
                fill="rgba(255,255,255,0.001)"
                pointerEvents="all"
              />
              <circle
                cx={midX}
                cy={midY}
                r="11"
                fill="white"
                stroke="#fb7185"
                strokeWidth="1.5"
                pointerEvents="all"
              />
              <path
                d={`M ${midX - 3.5} ${midY - 3.5} L ${midX + 3.5} ${midY + 3.5} M ${midX + 3.5} ${midY - 3.5} L ${midX - 3.5} ${midY + 3.5}`}
                stroke="#e11d48"
                strokeWidth="1.5"
                strokeLinecap="round"
                pointerEvents="none"
              />
            </g>
          ) : null}
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

    const sourceAnchor = getNodeAnchorPosition(
      n,
      nodeElementMapRef.current.get(n.id),
      "output",
    );
    const x1 = sourceAnchor.x,
      y1 = sourceAnchor.y;
    const hoverTargetNode = hoveredConnectTarget?.nodeId ? nodes.find((nn) => nn.id === hoveredConnectTarget.nodeId) : null;
    const hoverTargetAnchor = hoverTargetNode
      ? getNodeAnchorPosition(
          hoverTargetNode,
          nodeElementMapRef.current.get(hoverTargetNode.id),
          "input",
          hoveredConnectTarget?.toHandle,
        )
      : null;
    const target = hoverTargetAnchor || screenToCanvas(mousePos.x, mousePos.y);
    const path = `M ${x1} ${y1} C ${x1 + (target.x - x1) / 2} ${y1}, ${target.x - (target.x - x1) / 2} ${target.y}, ${target.x} ${target.y}`;
    return (
      <>
        <path d={path} stroke="#fbbf24" strokeWidth={2 / viewport.zoom} strokeDasharray="5,5" fill="none" />
        {hoverTargetAnchor ? (
          <circle
            cx={hoverTargetAnchor.x}
            cy={hoverTargetAnchor.y}
            r={8 / viewport.zoom}
            fill="rgba(34,211,238,0.14)"
            stroke="#22d3ee"
            strokeWidth={1.6 / viewport.zoom}
          />
        ) : null}
      </>
    );
  };

  const renderSidebarContent = (onAction) => {
    const sections = [
      {
        key: "nodes",
        title: "节点",
        items: [
          {
            id: "node_input",
            icon: Plus,
            label: "输入",
            desc: "提示词 / 图像创作 / 视频创作",
            color: "text-yellow-400",
            bg: "bg-yellow-500/10",
            onClick: () => {},
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
        items: [],
      },
      {
        key: "workflows",
        title: "工作流",
        items: [
          {
            id: "node_image_generate",
            icon: ImagePlus,
            label: "图片工作流",
            desc: "文生图 / 图生图 / 全景浏览",
            color: "text-purple-400",
            bg: "bg-purple-500/10",
            onClick: () => {},
          },
          {
            id: "node_video_generate",
            icon: Film,
            label: "视频工作流",
            desc: "文生视频 / 图生视频 / 首尾帧 / 全能参考",
            color: "text-rose-400",
            bg: "bg-rose-500/10",
            onClick: () => {},
          },
          {
            id: "workflow_bundle",
            icon: Layers,
            label: "工作流组件",
            desc: "三合一换图 / 批量动图 / 批量花字",
            color: "text-purple-300",
            bg: "bg-purple-500/10",
            onClick: () => {},
          },
        ],
      },
    ];

    const visibleItems = sections.flatMap((section) =>
      section.items.map((item) => ({
        ...item,
        sectionTitle: section.title,
      })),
    );

    return (
      <>
        <div className="flex flex-col items-center gap-1.5">
          {visibleItems.map((item, itemIndex) => (
            <SidebarBtn
              key={item.id}
              icon={item.icon}
              itemId={item.id}
              label={item.label}
              desc={item.desc}
              color={item.color}
              bg={item.bg}
              active={activeSidebarItemKey === item.id}
              compact
              category={item.sectionTitle}
              primary={false}
              menuTrigger={item.id === "node_input" || item.id === "node_image_generate" || item.id === "node_video_generate" || item.id === "workflow_bundle"}
              onHoverChange={(isHovering, target) => {
                setHoveredSidebarItemKey(isHovering ? item.id : "");
                if (isHovering && target && workspaceShellRef.current) {
                  const itemRect = target.getBoundingClientRect();
                  const shellRect = workspaceShellRef.current.getBoundingClientRect();
                  if (item.id === "node_input") {
                    if (sidebarNodeInputMenuCloseTimerRef.current) {
                      window.clearTimeout(sidebarNodeInputMenuCloseTimerRef.current);
                      sidebarNodeInputMenuCloseTimerRef.current = null;
                    }
                    setSidebarNodeInputMenu({
                      top: itemRect.top - shellRect.top + itemRect.height / 2,
                    });
                  }
                  if (item.id === "node_image_generate") {
                    if (sidebarImageCreateMenuCloseTimerRef.current) {
                      window.clearTimeout(sidebarImageCreateMenuCloseTimerRef.current);
                      sidebarImageCreateMenuCloseTimerRef.current = null;
                    }
                    setSidebarImageCreateMenu({
                      top: itemRect.top - shellRect.top + itemRect.height / 2,
                    });
                  }
                  if (item.id === "node_video_generate") {
                    if (sidebarVideoCreateMenuCloseTimerRef.current) {
                      window.clearTimeout(sidebarVideoCreateMenuCloseTimerRef.current);
                      sidebarVideoCreateMenuCloseTimerRef.current = null;
                    }
                    setSidebarVideoCreateMenu({
                      top: itemRect.top - shellRect.top + itemRect.height / 2,
                    });
                  }
                  if (item.id === "workflow_bundle") {
                    if (sidebarWorkflowMenuCloseTimerRef.current) {
                      window.clearTimeout(sidebarWorkflowMenuCloseTimerRef.current);
                      sidebarWorkflowMenuCloseTimerRef.current = null;
                    }
                    setSidebarWorkflowMenu({
                      top: itemRect.top - shellRect.top + itemRect.height / 2,
                    });
                  }
                  setHoveredSidebarPreview({
                    ...item,
                    active: activeSidebarItemKey === item.id,
                    top: itemRect.top - shellRect.top + itemRect.height / 2,
                  });
                  return;
                }
                if (item.id === "node_input") {
                  if (sidebarNodeInputMenuCloseTimerRef.current) {
                    window.clearTimeout(sidebarNodeInputMenuCloseTimerRef.current);
                  }
                  sidebarNodeInputMenuCloseTimerRef.current = window.setTimeout(() => {
                    setSidebarNodeInputMenu(null);
                    sidebarNodeInputMenuCloseTimerRef.current = null;
                  }, 140);
                }
                if (item.id === "node_image_generate") {
                  if (sidebarImageCreateMenuCloseTimerRef.current) {
                    window.clearTimeout(sidebarImageCreateMenuCloseTimerRef.current);
                  }
                  sidebarImageCreateMenuCloseTimerRef.current = window.setTimeout(() => {
                    setSidebarImageCreateMenu(null);
                    sidebarImageCreateMenuCloseTimerRef.current = null;
                  }, 140);
                }
                if (item.id === "node_video_generate") {
                  if (sidebarVideoCreateMenuCloseTimerRef.current) {
                    window.clearTimeout(sidebarVideoCreateMenuCloseTimerRef.current);
                  }
                  sidebarVideoCreateMenuCloseTimerRef.current = window.setTimeout(() => {
                    setSidebarVideoCreateMenu(null);
                    sidebarVideoCreateMenuCloseTimerRef.current = null;
                  }, 140);
                }
                if (item.id === "workflow_bundle") {
                  if (sidebarWorkflowMenuCloseTimerRef.current) {
                    window.clearTimeout(sidebarWorkflowMenuCloseTimerRef.current);
                  }
                  sidebarWorkflowMenuCloseTimerRef.current = window.setTimeout(() => {
                    setSidebarWorkflowMenu(null);
                    sidebarWorkflowMenuCloseTimerRef.current = null;
                  }, 140);
                }
                setHoveredSidebarPreview(null);
              }}
              onClick={(event) => {
                setActiveSidebarItemKey(item.id);
                if (item.id === "node_input" || item.id === "node_image_generate" || item.id === "node_video_generate" || item.id === "workflow_bundle") return;
                safeInvoke(() => item.onClick?.(event), item.label || "侧栏操作");
                onAction?.();
              }}
            />
          ))}
        </div>
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
    { key: "agentPlanner", label: "Agent Planner(LangGraph)" },
  ];

  const getApiDebugStatusClass = (status) => {
    if (status === "success") return "text-emerald-700 border-emerald-200 bg-emerald-50";
    if (status === "loading") return "text-cyan-700 border-cyan-200 bg-cyan-50";
    if (status === "warning") return "text-amber-700 border-amber-200 bg-amber-50";
    if (status === "timeout" || status === "error" || status === "login_required") {
      return "text-rose-700 border-rose-200 bg-rose-50";
    }
    return "text-slate-600 border-slate-200 bg-white";
  };

  const workbenchLightVars = {
    "--bf-bg": "#f7f7f2",
    "--bf-panel": "rgba(255,255,255,0.88)",
    "--bf-panel-strong": "rgba(255,255,255,0.96)",
    "--bf-panel-soft": "rgba(255,255,255,0.72)",
    "--bf-border": "rgba(15,23,42,0.08)",
    "--bf-border-strong": "rgba(15,23,42,0.14)",
    "--bf-text": "rgba(15,23,42,0.92)",
    "--bf-text-muted": "rgba(71,85,105,0.92)",
    "--bf-text-subtle": "rgba(100,116,139,0.92)",
    "--bf-shadow-lg": "0 28px 60px -30px rgba(15,23,42,0.16)",
    "--bf-shadow-md": "0 18px 40px -28px rgba(15,23,42,0.14)",
  };

  return (
    <div
      className="h-screen w-screen bg-[var(--bf-bg)] text-[var(--bf-text)] overflow-hidden flex flex-col font-sans"
      style={workbenchLightVars}
    >
      <header className="relative h-[68px] bg-[var(--bf-panel-strong)] border-b border-[var(--bf-border)] flex items-center justify-between px-4 z-50 select-none shadow-[var(--bf-shadow-md)] backdrop-blur-xl">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(255,255,255,0.72)_68%,rgba(255,255,255,0.38))]" />
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex flex-col min-w-0">
            <span className="truncate bg-[linear-gradient(135deg,#0f172a_0%,#334155_54%,#64748b_100%)] bg-clip-text text-[25px] font-normal leading-tight tracking-[0.10em] text-transparent [font-family:'STXingkai','Xingkai_SC','STKaiti','KaiTi','Georgia',serif]">
              Yu Canvas
            </span>
            <span className="text-[10px] font-normal text-slate-500 tracking-[0.18em] truncate">AI小禹无限画布</span>
          </div>
        </div>

        <div className="relative flex items-center gap-2">
          {isAdminUser && agentDevMode && (
            <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[10px] transition-colors ${
              apiStatus === "online"
                ? "text-emerald-200 border-emerald-500/20 bg-emerald-500/10"
                : "text-rose-200 border-rose-500/20 bg-rose-500/10"
            }`}>
              <Server className="w-3 h-3" /> {apiStatus === "online" ? "API Online" : "API Offline"}
            </div>
          )}

          <div className="relative">
            <button
              type="button"
              onClick={toggleAgentHistoryPanel}
              title={agentHistoryCollapsed ? "展开对话（Ctrl+Shift+E）" : "收起对话（Ctrl+Shift+E）"}
              aria-label={agentHistoryCollapsed ? "展开对话（Ctrl+Shift+E）" : "收起对话（Ctrl+Shift+E）"}
              className={`inline-flex h-10 items-center gap-2 rounded-[18px] border px-3.5 text-[11px] transition-colors ${
                agentHistoryCollapsed
                  ? "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                  : "border-cyan-200 bg-cyan-50 text-cyan-700 shadow-[0_12px_24px_rgba(15,23,42,0.08)]"
              }`}
            >
              <History className="w-3.5 h-3.5 text-slate-500" />
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
                  className="absolute -left-2 top-0 bottom-0 w-2 rounded-md cursor-col-resize text-slate-500 hover:text-cyan-600"
                  title="拖拽调整对话栏宽度"
                  aria-label="拖拽调整对话栏宽度"
                >
                  <GripVertical className="w-3.5 h-3.5 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
                </button>
                <div
                  className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white"
                  style={{ boxShadow: "0 24px 60px rgba(15,23,42,0.12)" }}
                >
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,250,252,0.78)_42%,rgba(255,255,255,0.62))]" />
              <div className="relative flex h-[54px] shrink-0 items-center justify-between border-b border-slate-200 bg-white/70 px-4">
                <div className="inline-flex min-w-0 items-center gap-1.5 text-xs">
                  <History className="w-3.5 h-3.5 text-slate-500" />
                  <span className="font-medium truncate text-slate-700">对话流</span>
                </div>
                <div className="ml-auto flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={createAgentSession}
                    className="h-8 inline-flex items-center gap-1 px-2.5 rounded-full border border-slate-200 bg-white text-[11px] text-slate-700 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 transition-colors"
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
                        ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-700"
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
                    className="p-2 rounded-full border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 transition-colors"
                  >
                    <ChevronRight className="w-3.5 h-3.5 rotate-90" />
                  </button>
                </div>
              </div>
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="relative shrink-0 border-b border-slate-200 bg-white/70 p-3">
                  <select
                    value={activeAgentSession?.id || ""}
                    onChange={(e) => setActiveAgentSession(e.target.value)}
                    className="w-full rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-700 outline-none focus:border-slate-400"
                  >
                    {agentSessions.map((session) => (
                      <option key={session.id} value={session.id}>
                        {session.title || "新会话"} ({(session.turns || []).length})
                      </option>
                    ))}
                  </select>
                </div>
                {minimizedAgentCards.length > 0 && (
                  <div className="relative shrink-0 space-y-2 border-b border-slate-200 bg-white/70 p-3">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">已最小化结果</div>
                    {minimizedAgentCards.map((card) => {
                      const turn = agentTurns.find((item) => item.id === card.turnId);
                      if (!turn) return null;
                      return (
                        <button
                          key={card.id}
                          type="button"
                          onClick={() => focusAgentResultCard(turn.id)}
                          className="w-full rounded-[16px] border border-slate-200 bg-white px-3 py-2 text-left text-[11px] text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
                        >
                          恢复 · {turn.extractedProduct || "结果"}
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className="relative min-h-0 flex-1 overflow-y-auto bg-[#fbfbf8] p-3 space-y-3 custom-scrollbar">
                  {agentTurns.length === 0 && (
                    <div className="space-y-2 rounded-[20px] border border-slate-200 bg-white px-3 py-3">
                      <div className="text-[11px] text-slate-400">暂无对话，先试一个任务示例或快速打开模板。</div>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => void sendAgentMissionFromText("帮我设计一个洗面奶的爆款脚本")}
                          className="rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] text-slate-600 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 transition-colors"
                        >
                          发送任务示例
                        </button>
                        <button
                          type="button"
                          onClick={() => safeInvoke(createText2ImgTemplate, "打开文生图模板")}
                          className="rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] text-slate-600 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 transition-colors"
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
                            {isAdminUser && agentDevMode && routeDebug && (
                              <div className="rounded-[16px] border border-slate-300 bg-slate-100 px-2.5 py-1.5 text-[10px] text-slate-800">
                                后端决策={getDecisionLabel(routeDebug.backendAction)} | 产品={routeDebug.product || "-"} | 规则={routeDebug.backendRule || routeDebug.reason || "-"} | 能力={(routeDebug.backendCapabilities || []).join(", ") || "-"} | 后端调用={routeDebug.backendCalled ? "是" : "否"}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : null}
                      <div className="flex justify-start">
                        <div className="max-w-[92%] rounded-[22px] border border-slate-200 bg-white px-3 py-2.5 text-[11px] text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
                          {turn.status === "running" && (
                            <div className="inline-flex items-center gap-1.5 text-slate-500">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              {getAgentTurnStepLabel(turn)}
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
                                        className="rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] text-slate-600 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 transition-colors"
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
                                  className="rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] text-slate-600 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 transition-colors"
                                >
                                  取消
                                </button>
                              )}
                              {turn.scriptBriefDraft ? (
                                <ScriptBriefCard
                                  draft={normalizeScriptBrief(turn.scriptBriefDraft)}
                                  audienceOptions={SCRIPT_AUDIENCE_OPTIONS}
                                  priceBandOptions={SCRIPT_PRICE_BAND_OPTIONS}
                                  conversionGoalOptions={SCRIPT_CONVERSION_GOAL_OPTIONS}
                                  platformOptions={SCRIPT_PLATFORM_OPTIONS}
                                  onChange={(nextBrief) => updateScriptBriefDraft(turn.id, nextBrief)}
                                  onSubmit={() => submitScriptBriefTurn(turn.id)}
                                  onSubmitDefaults={() => submitScriptBriefTurn(turn.id, { useDefaults: true })}
                                  onCancel={() => cancelScriptBriefTurn(turn.id)}
                                />
                              ) : null}
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
                              <div className="text-rose-600">{turn.error || "请求失败"}</div>
                              <div className="flex flex-wrap gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => retryAgentTurn(turn.id)}
                                  className="rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] text-slate-600 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 transition-colors"
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
                                        ? "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed"
                                        : "bg-fuchsia-50 border-fuchsia-200 text-fuchsia-700 hover:bg-fuchsia-100"
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
                              {turn?.intent === "STORYBOARD" ? (
                                <div className="space-y-2">
                                  <div className="text-slate-600">{turn.assistantText || turn.response?.summary || "已生成故事板"}</div>
                                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] leading-6 text-slate-600">
                                    已将故事板节点加入当前画布，并写入当前会话记录。
                                  </div>
                                </div>
                              ) : turn?.intent === "DRAMA" ? (
                                <div className="space-y-2">
                                  <div className="text-slate-600">{turn.response?.summary || "短剧内容已生成"}</div>
                                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[11px] leading-6 max-h-52 overflow-y-auto">
                                    <DramaMarkdownBlock value={turn.response?.text || ""} className="space-y-1.5" />
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <ScriptPlanSummary brief={normalizeScriptBrief(turn.scriptBrief || {})} />
                                  <div className="text-slate-600">已生成 {(turn.response?.topics || []).length} 个主题</div>
                                  {(turn.response?.topics || []).length > 0 ? (
                                    <div className="space-y-2">
                                      <TopicCards
                                        topics={turn.response?.topics || []}
                                        selectedAngle={normalizeScriptBrief(turn.scriptBrief || {}).selectedAngle || ""}
                                        onSelectAngle={(angle) => selectScriptAngleForTurn(turn.id, angle)}
                                      />
                                      <ScriptExecutionPlan
                                        brief={normalizeScriptBrief(turn.scriptBrief || {})}
                                        topics={turn.response?.topics || []}
                                        response={turn.response || null}
                                      />
                                    </div>
                                  ) : null}
                                </>
                              )}
                              <div className="flex gap-1.5">
                                {turn?.intent === "STORYBOARD" ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const nodeId = Array.isArray(turn?.response?.storyboardNodeIds)
                                        ? turn.response.storyboardNodeIds.find(Boolean)
                                        : "";
                                      if (nodeId) focusCanvasNode(nodeId);
                                    }}
                                    className="rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] text-slate-600 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 transition-colors"
                                  >
                                    定位故事板
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => focusAgentResultCard(turn.id)}
                                    className="rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] text-slate-600 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 transition-colors"
                                  >
                                    {relatedCard?.minimized ? "恢复结果卡片" : "定位结果卡片"}
                                  </button>
                                )}
                                {turn?.intent !== "STORYBOARD" && relatedCard && !relatedCard.minimized && (
                                  <button
                                    type="button"
                                    onClick={() => minimizeAgentResultCard(relatedCard.id)}
                                    className="rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] text-slate-600 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 transition-colors"
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
                                        ? "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed"
                                        : "bg-fuchsia-50 border-fuchsia-200 text-fuchsia-700 hover:bg-fuchsia-100"
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
        <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-lg shadow-[0_18px_36px_rgba(15,23,42,0.14)] border flex items-center gap-2 animate-in slide-in-from-top-5 duration-300 ${runToast.type === "error" ? "bg-rose-50 border-rose-200 text-rose-700" : "bg-white border-slate-200 text-slate-700"}`}>
          {runToast.type === "error" ? <AlertCircle className="w-4 h-4" /> : <Activity className="w-4 h-4 text-purple-400" />}
          <span className="text-xs font-medium">{runToast.message}</span>
          {typeof runToast.onAction === "function" && runToast.actionLabel && (
            <button
              type="button"
              onClick={() => {
                runToast.onAction();
                setRunToast(null);
              }}
              className="ml-1 px-1.5 py-0.5 rounded border border-cyan-200 bg-cyan-50 text-cyan-700 text-[10px] hover:bg-cyan-100"
            >
              {runToast.actionLabel}
            </button>
          )}
          <button
            type="button"
            onClick={() => setRunToast(null)}
            className="ml-1 text-slate-400 hover:text-slate-900"
            aria-label="关闭通知"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {showAssetLibrary ? (
        <div
          className="fixed inset-0 z-[88] bg-[rgba(15,23,42,0.14)] backdrop-blur-[2px]"
          onMouseDown={() => {
            setShowAssetLibrary(false);
            setAssetLibraryDetailWorkId("");
            setAssetLibraryDetailPersonaId("");
            setAssetLibraryPickerMode(false);
          }}
        >
          <div
            className="absolute right-4 top-24 bottom-4 z-[89] flex w-[420px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_28px_60px_rgba(15,23,42,0.16)]"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.8)_46%,rgba(255,255,255,0.7))]" />
            <div className="relative flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <div className="text-[15px] font-semibold text-slate-800">用户资产库</div>
                <div className="mt-1 text-[12px] leading-5 text-slate-500">
                  {assetLibraryDetailPersona
                    ? "编辑人物设定、参考图、音色描述和关系网络，用于后续创作复用。"
                    : assetLibraryDetailWork
                    ? "查看作品封面、摘要与素材，并继续创作。"
                    : "自动保存当前草稿，手动沉淀作品，并随时恢复到画布继续创作。"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAssetLibrary(false);
                  setAssetLibraryDetailWorkId("");
                  setAssetLibraryDetailPersonaId("");
                  setAssetLibraryPickerMode(false);
                }}
                className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900"
                aria-label="关闭资产库"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="relative flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50/80 px-5 py-3">
              {assetLibraryDetailWork || assetLibraryDetailPersona ? (
                <button
                  type="button"
                  onClick={() => {
                    setAssetLibraryDetailWorkId("");
                    setAssetLibraryDetailPersonaId("");
                  }}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
                >
                  <ChevronRight className="h-3.5 w-3.5 rotate-180" />
                  返回列表
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setAssetLibraryTab("works");
                  setAssetLibraryDetailWorkId("");
                  setAssetLibraryDetailPersonaId("");
                }}
                className={`rounded-full px-3 py-1.5 text-[11px] transition-colors ${
                  assetLibraryTab === "works" ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
                }`}
              >
                作品 {assetLibraryWorks.length}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAssetLibraryTab("personas");
                  setAssetLibraryDetailWorkId("");
                  setAssetLibraryDetailPersonaId("");
                }}
                className={`rounded-full px-3 py-1.5 text-[11px] transition-colors ${
                  assetLibraryTab === "personas" ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
                }`}
              >
                人物 {assetLibraryPersonas.length}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAssetLibraryTab("drafts");
                  setAssetLibraryDetailWorkId("");
                  setAssetLibraryDetailPersonaId("");
                }}
                className={`rounded-full px-3 py-1.5 text-[11px] transition-colors ${
                  assetLibraryTab === "drafts" ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
                }`}
              >
                草稿 {assetLibraryDrafts.length}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAssetLibraryTab("assets");
                  setAssetLibraryDetailWorkId("");
                  setAssetLibraryDetailPersonaId("");
                }}
                className={`rounded-full px-3 py-1.5 text-[11px] transition-colors ${
                  assetLibraryTab === "assets" ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
                }`}
              >
                素材 {assetLibraryAssets.length}
              </button>
              <div className="group relative ml-auto">
                <button
                  type="button"
                  onClick={saveCurrentCanvasAsWork}
                  disabled={nodes.length === 0 && connections.length === 0}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[10px] transition-colors ${
                    nodes.length === 0 && connections.length === 0
                      ? "cursor-not-allowed border border-slate-200 bg-white text-slate-300"
                      : "border border-cyan-200 bg-cyan-50 text-cyan-700 hover:bg-cyan-100 hover:text-cyan-800"
                  }`}
                >
                  <Save className="h-3.5 w-3.5" />
                  保存作品
                </button>
                {nodes.length === 0 && connections.length === 0 ? null : (
                  <button
                    type="button"
                    className="pointer-events-none absolute right-0 top-[calc(100%-1px)] z-20 w-max rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] text-slate-600 opacity-0 shadow-[0_16px_32px_rgba(15,23,42,0.12)] transition-all hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-700 group-hover:pointer-events-auto group-hover:opacity-100"
                    onClick={saveCurrentCanvasAsNewWork}
                  >
                    另存作品
                  </button>
                )}
              </div>
            </div>
            <div className="relative min-h-0 flex-1 overflow-y-auto bg-slate-50/70 p-4 custom-scrollbar">
              {assetLibraryDetailPersona ? (
                <div className="space-y-4">
                  <input
                    ref={assetLibraryPersonaImageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      void handleAssetLibraryPersonaReferenceUpload(event);
                    }}
                  />
                  <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_22px_44px_rgba(15,23,42,0.08)]">
                    <div className="p-5">
                      <button
                        type="button"
                        onClick={() => assetLibraryPersonaImageInputRef.current?.click()}
                        className="group flex h-48 w-full items-center justify-center overflow-hidden rounded-[24px] border border-dashed border-slate-200 bg-slate-100 transition-colors hover:border-cyan-200 hover:bg-cyan-50/60"
                      >
                        {assetLibraryDetailPersona.referenceImage ? (
                          <img
                            src={assetLibraryDetailPersona.referenceImage}
                            alt={assetLibraryDetailPersona.name || "人物参考图"}
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                          />
                        ) : (
                          <div className="flex flex-col items-center gap-2 text-slate-400">
                            <ImagePlus className="h-7 w-7" />
                            <span className="text-[12px]">上传人物参考图</span>
                          </div>
                        )}
                      </button>
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => assetLibraryPersonaImageInputRef.current?.click()}
                          className="inline-flex items-center justify-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-[11px] font-medium text-white transition-colors hover:bg-slate-800"
                        >
                          <Upload className="h-3.5 w-3.5" />
                          {assetLibraryDetailPersona.referenceImage ? "更换参考图" : "上传参考图"}
                        </button>
                        {assetLibraryDetailPersona.referenceImage ? (
                          <button
                            type="button"
                            onClick={() => updateAssetLibraryPersona(assetLibraryDetailPersona.id, { referenceImage: "" })}
                            className="inline-flex items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-[11px] text-slate-500 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            移除参考图
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                    <label className="block">
                      <span className="text-[11px] font-semibold text-slate-500">形象名称</span>
                      <input
                        type="text"
                        value={assetLibraryDetailPersona.name}
                        onChange={(event) => updateAssetLibraryPersona(assetLibraryDetailPersona.id, { name: event.target.value })}
                        placeholder="例如：冷感银发女主"
                        className="mt-2 w-full rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-2.5 text-[14px] font-semibold text-slate-900 outline-none transition-colors focus:border-cyan-200 focus:bg-white focus:ring-2 focus:ring-cyan-100"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-semibold text-slate-500">人物设定</span>
                      <textarea
                        value={assetLibraryDetailPersona.description}
                        onChange={(event) => updateAssetLibraryPersona(assetLibraryDetailPersona.id, { description: event.target.value })}
                        placeholder="描述人物背景、性格、外貌、气质、服装、常用场景等。"
                        rows={5}
                        className="mt-2 w-full resize-none rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-2.5 text-[12px] leading-6 text-slate-700 outline-none transition-colors focus:border-cyan-200 focus:bg-white focus:ring-2 focus:ring-cyan-100"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-semibold text-slate-500">音色描述</span>
                      <textarea
                        value={assetLibraryDetailPersona.voiceDescription}
                        onChange={(event) => updateAssetLibraryPersona(assetLibraryDetailPersona.id, { voiceDescription: event.target.value })}
                        placeholder="描述声音年龄感、语速、情绪、口音或旁白风格。"
                        rows={4}
                        className="mt-2 w-full resize-none rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-2.5 text-[12px] leading-6 text-slate-700 outline-none transition-colors focus:border-cyan-200 focus:bg-white focus:ring-2 focus:ring-cyan-100"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-semibold text-slate-500">关系网络</span>
                      <textarea
                        value={assetLibraryDetailPersona.relationshipNetwork}
                        onChange={(event) => updateAssetLibraryPersona(assetLibraryDetailPersona.id, { relationshipNetwork: event.target.value })}
                        placeholder="记录与其他人物、品牌、组织或故事线的关系，例如：导师、竞争者、搭档、家人。"
                        rows={5}
                        className="mt-2 w-full resize-none rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-2.5 text-[12px] leading-6 text-slate-700 outline-none transition-colors focus:border-cyan-200 focus:bg-white focus:ring-2 focus:ring-cyan-100"
                      />
                    </label>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (!window.confirm("确认删除这个人物形象吗？")) return;
                      removeAssetLibraryPersona(assetLibraryDetailPersona.id);
                    }}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-[12px] text-slate-500 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 className="h-4 w-4" />
                    删除人物形象
                  </button>
                </div>
              ) : assetLibraryDetailWork ? (
                <div className="space-y-6">
                  <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_22px_44px_rgba(15,23,42,0.08)]">
                    <div className="flex gap-5 p-5">
                      <div className="flex h-36 w-36 shrink-0 items-center justify-center overflow-hidden rounded-[22px] border border-slate-200 bg-slate-100 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
                        {assetLibraryDetailWork.coverUrl ? (
                          isVideoContent(assetLibraryDetailWork.coverUrl) ? (
                            <video src={assetLibraryDetailWork.coverUrl} className="h-full w-full object-cover" muted loop playsInline />
                          ) : (
                            <img src={assetLibraryDetailWork.coverUrl} alt={assetLibraryDetailWork.title} className="h-full w-full object-cover" />
                          )
                        ) : (
                          <FolderOpen className="h-6 w-6 text-slate-400" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[22px] font-semibold tracking-[-0.02em] text-slate-950">
                          {assetLibraryDetailWork.title || "未命名作品"}
                        </div>
                        <div className="mt-3 text-[12px] leading-6 text-slate-500">
                          {assetLibraryDetailWork.summary || assetLibraryDetailDigest?.summary || "暂无摘要"}
                        </div>
                        <div className="mt-5 flex flex-wrap items-center gap-3">
                          <button
                            type="button"
                            onClick={() => restoreSnapshotToCanvas(assetLibraryDetailSnapshot, "已恢复作品到画布")}
                            className="inline-flex min-w-[112px] items-center justify-center gap-1.5 rounded-full bg-slate-900 px-5 py-2 text-[11px] font-medium text-white transition-colors hover:bg-slate-800"
                          >
                            <FolderOpen className="h-3.5 w-3.5" />
                            继续创作
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!window.confirm("确认删除这份作品吗？")) return;
                              removeAssetLibraryItem("works", assetLibraryDetailWork.id);
                              setAssetLibraryDetailWorkId("");
                            }}
                            className="inline-flex min-w-[112px] items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-5 py-2 text-[11px] text-slate-500 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            删除作品
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                    <div className="border-b border-slate-200 px-4 py-3">
                      <div className="text-[13px] font-semibold text-slate-800">关联素材</div>
                      <div className="mt-1 text-[11px] text-slate-500">从这个作品沉淀出来的图片和视频，可随时放回画布复用。</div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 p-3">
                      {assetLibraryDetailAssets.length === 0 ? (
                        <div className="col-span-2 rounded-[18px] border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-[11px] text-slate-500">
                          这份作品还没有沉淀出独立素材。
                        </div>
                      ) : null}
                      {assetLibraryDetailAssets.map((item) => (
                        <div key={item.id} className="group overflow-hidden rounded-[18px] border border-slate-200 bg-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_28px_rgba(15,23,42,0.08)]">
                          <div className="flex h-32 items-center justify-center overflow-hidden bg-slate-100">
                            {item.url ? (
                              item.kind === "video" ? (
                                <video src={item.url} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" muted loop playsInline />
                              ) : (
                                <img src={item.url} alt={item.title || "素材"} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                              )
                            ) : (
                              <FolderOpen className="h-5 w-5 text-slate-400" />
                            )}
                          </div>
                          <div className="space-y-2 p-3">
                            <div className="truncate text-[11px] font-medium text-slate-800">
                              {item.title || (item.kind === "video" ? "视频素材" : "图片素材")}
                            </div>
                            <div className="text-[10px] leading-5 text-slate-400">
                              {item.nodeTitle || "来自画布节点"} · {item.kind === "video" ? "视频" : "图片"}
                            </div>
                            <button
                              type="button"
                              onClick={() => restoreAssetToCanvas(item)}
                              className="inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
                            >
                              <FolderOpen className="h-3 w-3" />
                              {assetLibraryPickerMode ? "选择素材" : "放回画布"}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : assetLibraryTab === "drafts" ? (
                <div className="space-y-3">
                  {activeCanvasDraft ? (
                    <div className="rounded-[20px] border border-cyan-200 bg-cyan-50 px-4 py-3 text-[12px] text-cyan-700">
                      当前画布草稿已自动保存：{formatAssetLibraryTime(activeCanvasDraft.updatedAt)}
                    </div>
                  ) : null}
                  {assetLibraryDrafts.length === 0 ? (
                    <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-[12px] text-slate-500">
                      还没有草稿。开始拖素材、搭工作流后会自动出现在这里。
                    </div>
                  ) : null}
                  {assetLibraryDrafts.map((item) => {
                    const digest = buildSnapshotDigest(item.snapshot);
                    const imageCount = digest.mediaItems.filter((media) => media.kind === "image").length;
                    const videoCount = digest.mediaItems.filter((media) => media.kind === "video").length;
                    return (
                      <div
                        key={item.id}
                        className="cursor-pointer overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.05)] transition-all hover:border-slate-300 hover:shadow-[0_16px_32px_rgba(15,23,42,0.08)]"
                        onClick={() => setAssetLibraryDetailWorkId(item.id)}
                      >
                        <div className="flex gap-3 p-3">
                          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[18px] border border-slate-200 bg-slate-100">
                            {item.coverUrl ? (
                              isVideoContent(item.coverUrl) ? (
                                <video src={item.coverUrl} className="h-full w-full object-cover" muted loop playsInline />
                              ) : (
                                <img src={item.coverUrl} alt={item.title} className="h-full w-full object-cover" />
                              )
                            ) : (
                              <FolderOpen className="h-5 w-5 text-slate-400" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[15px] font-semibold tracking-[-0.01em] text-slate-950">{item.title || "未命名草稿"}</div>
                            <div className="mt-1 text-[11px] leading-5 text-slate-500">{item.summary || digest.summary}</div>
                            <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-slate-400">
                              <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5">{formatAssetLibraryTime(item.updatedAt)}</span>
                              <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5">{item.nodeCount || digest.nodeCount} 节点</span>
                              {imageCount > 0 ? <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5">{imageCount} 图</span> : null}
                              {videoCount > 0 ? <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5">{videoCount} 视频</span> : null}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 border-t border-slate-200 px-3 py-2.5">
                          <button
                            type="button"
                            onClick={() => restoreSnapshotToCanvas(item.snapshot, "已恢复草稿到画布")}
                            className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3.5 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-slate-800"
                          >
                            <FolderOpen className="h-3.5 w-3.5" />
                            恢复到画布
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!window.confirm("确认删除这份草稿吗？")) return;
                              removeAssetLibraryItem("drafts", item.id);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-full px-1 py-1.5 text-[11px] text-slate-500 transition-colors hover:text-rose-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            删除
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : assetLibraryTab === "personas" ? (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={createAssetLibraryPersona}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-[20px] border border-cyan-200 bg-cyan-50 px-4 py-3 text-[12px] font-medium text-cyan-700 transition-colors hover:bg-cyan-100 hover:text-cyan-800"
                  >
                    <Plus className="h-4 w-4" />
                    新建人物形象
                  </button>
                  {assetLibraryPersonas.length === 0 ? (
                    <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-[12px] text-slate-500">
                      还没有人物形象。新建后可维护名称、介绍、参考图、音色描述和关系网络。
                    </div>
                  ) : null}
                  {assetLibraryPersonas.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => {
                        setAssetLibraryDetailWorkId("");
                        setAssetLibraryDetailPersonaId(item.id);
                      }}
                      className="flex w-full cursor-pointer gap-3 overflow-hidden rounded-[24px] border border-slate-200 bg-white p-3 text-left shadow-[0_10px_24px_rgba(15,23,42,0.05)] transition-all hover:border-slate-300 hover:shadow-[0_16px_32px_rgba(15,23,42,0.08)]"
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        setAssetLibraryDetailWorkId("");
                        setAssetLibraryDetailPersonaId(item.id);
                      }}
                    >
                      <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[18px] border border-slate-200 bg-slate-100">
                        {item.referenceImage ? (
                          <img src={item.referenceImage} alt={item.name || "人物参考图"} className="h-full w-full object-cover" />
                        ) : (
                          <ImageIcon className="h-5 w-5 text-slate-400" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 py-0.5">
                        <div className="truncate text-[15px] font-semibold tracking-[-0.01em] text-slate-950">
                          {item.name || "未命名人物"}
                        </div>
                        <div className="mt-1 line-clamp-2 text-[11px] leading-5 text-slate-500">
                          {item.description || "暂无人物介绍"}
                        </div>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            createPersonaInputNodeAt(item);
                          }}
                          className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-[11px] font-medium text-cyan-700 transition-colors hover:bg-cyan-100 hover:text-cyan-800"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          添加并结构化
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : assetLibraryTab === "works" ? (
                <div className="space-y-3">
                  {assetLibraryWorks.length === 0 ? (
                    <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-[12px] text-slate-500">
                      还没有保存作品。先把当前画布保存为作品，后续就能反复复现和继续编辑。
                    </div>
                  ) : null}
                  {assetLibraryWorks.map((item) => {
                    const versions = assetLibraryVersionsByWorkId.get(item.id) || EMPTY_LIST;
                    const latestVersion = versions[0] || null;
                    const latestSnapshot = latestVersion?.snapshot || item.snapshot;
                    const digest = buildSnapshotDigest(latestSnapshot);
                    const isExpanded = expandedAssetWorkIds.has(item.id);
                    return (
                      <div
                        key={item.id}
                        className="cursor-pointer overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.05)] transition-all hover:border-slate-300 hover:shadow-[0_16px_32px_rgba(15,23,42,0.08)]"
                        onClick={() => setAssetLibraryDetailWorkId(item.id)}
                      >
                        <div className="flex gap-3 p-3">
                          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[18px] border border-slate-200 bg-slate-100">
                            {item.coverUrl ? (
                              isVideoContent(item.coverUrl) ? (
                                <video src={item.coverUrl} className="h-full w-full object-cover" muted loop playsInline />
                              ) : (
                                <img src={item.coverUrl} alt={item.title} className="h-full w-full object-cover" />
                              )
                            ) : (
                              <FolderOpen className="h-5 w-5 text-slate-400" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            {editingAssetWorkTitleId === item.id ? (
                              <input
                                type="text"
                                value={editingAssetWorkTitleDraft}
                                autoFocus
                                className="block w-full rounded-[10px] border border-cyan-200 bg-cyan-50/70 px-2 py-1 text-[15px] font-semibold tracking-[-0.01em] text-slate-950 outline-none ring-2 ring-cyan-100"
                                onChange={(e) => setEditingAssetWorkTitleDraft(e.target.value)}
                                onBlur={(e) => {
                                  if (e.currentTarget.dataset.cancelled === "true") return;
                                  commitEditAssetWorkTitle(item.id);
                                }}
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    commitEditAssetWorkTitle(item.id);
                                  }
                                  if (e.key === "Escape") {
                                    e.preventDefault();
                                    e.currentTarget.dataset.cancelled = "true";
                                    cancelEditAssetWorkTitle();
                                  }
                                }}
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  beginEditAssetWorkTitle(item);
                                }}
                                className="block max-w-full truncate rounded-[10px] px-1 py-0.5 text-left text-[15px] font-semibold tracking-[-0.01em] text-slate-950 transition-colors hover:bg-cyan-50 hover:text-cyan-700"
                                title="点击编辑标题"
                              >
                                {item.title || "未命名作品"}
                              </button>
                            )}
                            <div className="mt-1 text-[11px] leading-5 text-slate-500">{item.summary || digest.summary}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 border-t border-slate-200 px-3 py-2.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              restoreSnapshotToCanvas(latestSnapshot, "已恢复作品到画布");
                            }}
                            className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3.5 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-slate-800"
                          >
                            <FolderOpen className="h-3.5 w-3.5" />
                            继续创作
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedAssetWorkIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(item.id)) next.delete(item.id);
                                else next.add(item.id);
                                return next;
                              });
                            }}
                            className="inline-flex items-center gap-1.5 rounded-full px-1 py-1.5 text-[11px] text-slate-500 transition-colors hover:text-slate-700"
                          >
                            <History className="h-3.5 w-3.5" />
                            版本 {versions.length || 1}
                            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!window.confirm("确认删除这份作品吗？")) return;
                              removeAssetLibraryItem("works", item.id);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-full px-1 py-1.5 text-[11px] text-slate-500 transition-colors hover:text-rose-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            删除
                          </button>
                        </div>
                        {isExpanded ? (
                          <div className="border-t border-slate-200 bg-slate-50/80 px-3 py-3">
                            <div className="mb-2 text-[11px] font-medium text-slate-600">版本历史</div>
                            <div className="space-y-2">
                              {versions.map((version) => (
                                <div key={version.id} className="flex items-center gap-2 rounded-[18px] border border-slate-200 bg-white px-3 py-2">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 text-[11px] text-slate-700">
                                      <span className="font-medium">版本 {version.versionIndex || 1}</span>
                                      <span className="text-slate-400">{formatAssetLibraryTime(version.createdAt)}</span>
                                    </div>
                                    <div className="mt-1 truncate text-[10px] text-slate-400">
                                      {version.summary || buildSnapshotDigest(version.snapshot).summary}
                                    </div>
                                  </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                restoreSnapshotToCanvas(version.snapshot, `已恢复版本 ${version.versionIndex || 1} 到画布`);
                              }}
                              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
                            >
                                    恢复
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-3">
                  {assetLibraryAssets.length === 0 ? (
                    <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-[12px] text-slate-500">
                      还没有沉淀素材。上传图片/视频或保存作品后，这里的素材会持续累积。
                    </div>
                  ) : null}
                  {assetLibraryAssets.map((item) => (
                    <div key={item.id} className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                      <div className="flex gap-3 p-3">
                        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[18px] border border-slate-200 bg-slate-100">
                          {item.url ? (
                            item.kind === "video" ? (
                              <video src={item.url} className="h-full w-full object-cover" muted loop playsInline />
                            ) : (
                              <img src={item.url} alt={item.title || "素材"} className="h-full w-full object-cover" />
                            )
                          ) : (
                            <FolderOpen className="h-5 w-5 text-slate-400" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[15px] font-semibold tracking-[-0.01em] text-slate-950">{item.title || (item.kind === "video" ? "视频素材" : "图片素材")}</div>
                          <div className="mt-1 text-[11px] leading-5 text-slate-400">
                            {item.nodeTitle || "来自画布节点"} · {item.kind === "video" ? "视频" : "图片"} · {item.sourceKind === "work_version" ? "作品版本" : "草稿"}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-slate-400">
                            <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5">{formatAssetLibraryTime(item.updatedAt || item.createdAt)}</span>
                            <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5">已复用 {item.usageCount || 1} 次</span>
                            {item.workId ? <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5">关联作品</span> : null}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 border-t border-slate-200 px-3 py-2.5">
                        <button
                          type="button"
                          onClick={() => restoreAssetToCanvas(item)}
                          className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3.5 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-slate-800"
                        >
                          <FolderOpen className="h-3.5 w-3.5" />
                          {assetLibraryPickerMode ? "选择素材" : "放回画布"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {isAdminUser && agentDevMode ? (
        <div className="fixed right-4 bottom-4 z-[92] w-[320px] max-w-[calc(100vw-1rem)] overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.12)]">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.82)_48%,rgba(255,255,255,0.72))]" />
          <button
            type="button"
            onClick={() => setApiDebugOpen((prev) => !prev)}
            className="relative flex w-full items-center justify-between border-b border-slate-200 px-4 py-3 text-left"
          >
            <span className="text-xs font-semibold text-slate-800">新接口状态</span>
            <span className="text-[10px] text-slate-500">{apiDebugOpen ? "收起" : "展开"}</span>
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
                      <details className="mt-1.5 rounded-[14px] border border-slate-200 bg-slate-50">
                        <summary className="cursor-pointer list-none px-2 py-1.5 text-[9px] text-slate-700 [&::-webkit-details-marker]:hidden">
                          查看详细信息
                        </summary>
                        <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all border-t border-slate-200 px-2 py-1.5 text-[9px] leading-4 text-slate-700">
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
        <input
          ref={sidebarImageUploadInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            void handleSidebarMediaUpload(event, "image");
          }}
        />
        <input
          ref={sidebarVideoUploadInputRef}
          type="file"
          accept="video/*"
          multiple
          className="hidden"
          onChange={(event) => {
            void handleSidebarMediaUpload(event, "video");
          }}
        />
        {/* Sidebar */}
        <div className="absolute left-4 top-1/2 z-40 flex -translate-y-1/2 shrink-0 flex-col items-center gap-2">
          <div
            ref={sidebarUploadMenuRef}
            className="relative shrink-0"
            style={{ width: leftSidebarWidth }}
            onMouseEnter={() => {
              if (sidebarUploadMenuCloseTimerRef.current) {
                window.clearTimeout(sidebarUploadMenuCloseTimerRef.current);
                sidebarUploadMenuCloseTimerRef.current = null;
              }
              setActiveSidebarItemKey("node_upload");
              setShowSidebarUploadMenu(true);
            }}
            onMouseLeave={() => {
              if (sidebarUploadMenuCloseTimerRef.current) {
                window.clearTimeout(sidebarUploadMenuCloseTimerRef.current);
              }
              sidebarUploadMenuCloseTimerRef.current = window.setTimeout(() => {
                setShowSidebarUploadMenu(false);
                sidebarUploadMenuCloseTimerRef.current = null;
              }, 140);
            }}
          >
            <div className="mx-auto flex w-full rounded-[32px] border border-[#E5E7EB] bg-[rgba(255,255,255,0.96)] p-1.5 shadow-[0_4px_16px_rgba(0,0,0,0.06)] backdrop-blur-xl">
              <button
                type="button"
                onClick={() => {}}
                className="animate-bf-breathe flex h-11 w-full scale-[1.05] items-center justify-center rounded-[24px] border border-[#B9E975] bg-[linear-gradient(135deg,#A7E163_0%,#8FD14F_100%)] text-[#1F2937] transition-all duration-200 ease-in-out hover:scale-[1.075] hover:brightness-[1.02]"
                style={{
                  boxShadow: "0 0 0 4px rgba(163,230,53,0.15), 0 8px 20px rgba(0,0,0,0.12)",
                }}
                title="图片/视频上传"
                aria-label="图片/视频上传"
              >
                <Upload className="h-[18px] w-[18px]" strokeWidth={2.2} />
              </button>
            </div>
            {showSidebarUploadMenu ? (
              <div
                className="absolute left-[calc(100%+14px)] top-1/2 z-[58] w-48 -translate-y-1/2 rounded-[24px] border border-slate-200 bg-[rgba(255,255,255,0.98)] p-2 shadow-[0_20px_44px_rgba(15,23,42,0.12)] backdrop-blur-xl"
                onMouseEnter={() => {
                  if (sidebarUploadMenuCloseTimerRef.current) {
                    window.clearTimeout(sidebarUploadMenuCloseTimerRef.current);
                    sidebarUploadMenuCloseTimerRef.current = null;
                  }
                  setShowSidebarUploadMenu(true);
                }}
                onMouseLeave={() => {
                  if (sidebarUploadMenuCloseTimerRef.current) {
                    window.clearTimeout(sidebarUploadMenuCloseTimerRef.current);
                  }
                  sidebarUploadMenuCloseTimerRef.current = window.setTimeout(() => {
                    setShowSidebarUploadMenu(false);
                    sidebarUploadMenuCloseTimerRef.current = null;
                  }, 140);
                }}
              >
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left text-[12px] text-slate-700 transition-colors hover:bg-slate-50"
                  onClick={() => {
                    setShowSidebarUploadMenu(false);
                    sidebarImageUploadInputRef.current?.click();
                  }}
                >
                  <ImageIcon className="h-4 w-4 text-slate-500" />
                  <span>上传图片</span>
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left text-[12px] text-slate-700 transition-colors hover:bg-slate-50"
                  onClick={() => {
                    setShowSidebarUploadMenu(false);
                    sidebarVideoUploadInputRef.current?.click();
                  }}
                >
                  <Film className="h-4 w-4 text-slate-500" />
                  <span>上传视频</span>
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left text-[12px] text-slate-700 transition-colors hover:bg-slate-50"
                  onClick={() => {
                    setShowSidebarUploadMenu(false);
                    setAssetLibraryPickerMode(true);
                    setAssetLibraryTab("assets");
                    setAssetLibraryDetailWorkId("");
                    setShowAssetLibrary(true);
                  }}
                >
                  <FolderOpen className="h-4 w-4 text-slate-500" />
                  <span>从资产库选择</span>
                </button>
              </div>
            ) : null}
          </div>
          <div
            className="flex h-auto flex-col items-center rounded-[32px] border border-[#E5E7EB] bg-[rgba(255,255,255,0.9)] px-2 py-2.5 shadow-[0_4px_16px_rgba(0,0,0,0.06)] backdrop-blur-xl select-none"
            style={{ WebkitOverflowScrolling: "touch", width: leftSidebarWidth }}
          >
            <div className="w-full overflow-visible">
              {renderSidebarContent()}
            </div>
          </div>
          <div className="shrink-0" style={{ width: leftSidebarWidth }}>
            <div className="mx-auto flex w-full flex-col items-center gap-1.5 rounded-[32px] border border-[#E5E7EB] bg-[rgba(255,255,255,0.9)] px-2 py-1.5 shadow-[0_4px_16px_rgba(0,0,0,0.06)] backdrop-blur-xl">
              <button
                type="button"
                onClick={undo}
                disabled={!canUndo}
                title="撤销"
                aria-label="撤销"
                className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                  canUndo
                    ? "text-[#6B7280] hover:bg-[#EAECEF] hover:text-slate-800 active:bg-[#E1E5E9]"
                    : "cursor-not-allowed text-slate-300"
                }`}
              >
                <span className="flex h-7 w-7 items-center justify-center">
                  <Undo className="h-[18px] w-[18px]" strokeWidth={2.2} />
                </span>
              </button>
              <button
                type="button"
                onClick={redo}
                disabled={!canRedo}
                title="重做"
                aria-label="重做"
                className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                  canRedo
                    ? "text-[#6B7280] hover:bg-[#EAECEF] hover:text-slate-800 active:bg-[#E1E5E9]"
                    : "cursor-not-allowed text-slate-300"
                }`}
              >
                <span className="flex h-7 w-7 items-center justify-center">
                  <Redo className="h-[18px] w-[18px]" strokeWidth={2.2} />
                </span>
              </button>
            </div>
          </div>
        </div>

        <div className="absolute bottom-4 left-4 z-40 shrink-0" style={{ width: leftSidebarWidth }}>
          <details className="relative group">
            <summary
              className="list-none mx-auto flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-[#E5E7EB] bg-[rgba(255,255,255,0.9)] text-slate-700 shadow-[0_4px_16px_rgba(0,0,0,0.06)] backdrop-blur-xl hover:bg-[#F8FAFC] hover:text-slate-900 [&::-webkit-details-marker]:hidden"
              title={memberLabel}
            >
              {memberAvatar ? (
                <img src={memberAvatar} alt={memberLabel} className="h-full w-full rounded-full object-cover" />
              ) : (
                <span className="text-xs font-semibold">{String(memberLabel || "G").slice(0, 1).toUpperCase()}</span>
              )}
            </summary>
            <div className="absolute bottom-full left-0 z-[70] mb-2 w-56 rounded-[24px] border border-[#E5E7EB] bg-[rgba(255,255,255,0.96)] p-3 shadow-[0_20px_44px_rgba(15,23,42,0.1)] backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                  {memberAvatar ? (
                    <img src={memberAvatar} alt={memberLabel} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-slate-700">
                      {String(memberLabel || "G").slice(0, 1).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-slate-800">{memberLabel}</div>
                  <div className="text-[10px] text-slate-400">
                    {memberInfoLoginUrl ? "会员未登录" : "会员信息"}
                  </div>
                  <div className="mt-1">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[9px] ${
                        userAuthsLoading
                          ? "border-slate-200 bg-slate-50 text-slate-500"
                          : isAdminUser
                          ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-100"
                          : "border-slate-200 bg-slate-50 text-slate-500"
                      }`}
                    >
                      {userAuthsLoading ? "权限加载中" : isAdminUser ? "管理员" : "普通成员"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                  <div className="text-[10px] text-slate-500">当前积分</div>
                  <div className="mt-0.5 text-xs font-semibold text-yellow-700">{formatMemberPoints(memberPoint)}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                  <div className="text-[10px] text-slate-500">累计积分</div>
                  <div className="mt-0.5 text-xs font-semibold text-emerald-700">{formatMemberPoints(memberTotalPoint)}</div>
                </div>
              </div>
              {memberInfoLoginUrl ? (
                <button
                  type="button"
                  onClick={() => navigateToMemberLogin(memberInfoLoginUrl)}
                  className="mt-2 w-full rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-left text-[11px] text-cyan-700 hover:border-cyan-300 hover:bg-cyan-100"
                >
                  前往会员登录
                </button>
              ) : null}
            </div>
          </details>
        </div>

        {isLeftSidebarCollapsed && hoveredSidebarPreview ? (
          <div
            className="pointer-events-none absolute z-[55] w-72 -translate-y-1/2 rounded-[24px] border border-[#E5E7EB] bg-[rgba(255,255,255,0.96)] px-4 py-4 text-left shadow-[0_20px_44px_rgba(15,23,42,0.1)] backdrop-blur-xl"
            style={{ left: leftSidebarWidth + 18, top: hoveredSidebarPreview.top }}
          >
            <div className="absolute left-[-6px] top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 border-l border-t border-[#E5E7EB] bg-[rgba(255,255,255,0.96)]" />
            <div className="flex items-start gap-3">
              <div
                className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F3F4F6] text-[#6B7280] ring-1 ${
                  hoveredSidebarPreview.active ? "ring-slate-400/35" : "ring-slate-200"
                }`}
              >
                {hoveredSidebarPreview.icon
                  ? React.createElement(hoveredSidebarPreview.icon, { className: "w-4 h-4" })
                  : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium leading-5 text-slate-800">
                  {hoveredSidebarPreview.label}
                </div>
                <div className="mt-1.5 text-[11px] leading-5 text-slate-400 whitespace-normal break-words">
                  {hoveredSidebarPreview.desc}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {sidebarNodeInputMenu ? (
          <div
            data-sidebar-node-input-menu="true"
            className="absolute z-[58] w-72 -translate-y-1/2 rounded-[24px] border border-[#E5E7EB] bg-[rgba(255,255,255,0.98)] p-3 shadow-[0_20px_44px_rgba(15,23,42,0.12)] backdrop-blur-xl"
            style={{ left: leftSidebarWidth + 18, top: sidebarNodeInputMenu.top }}
            onMouseEnter={() => {
              if (sidebarNodeInputMenuCloseTimerRef.current) {
                window.clearTimeout(sidebarNodeInputMenuCloseTimerRef.current);
                sidebarNodeInputMenuCloseTimerRef.current = null;
              }
            }}
            onMouseLeave={() => {
              if (sidebarNodeInputMenuCloseTimerRef.current) {
                window.clearTimeout(sidebarNodeInputMenuCloseTimerRef.current);
              }
              sidebarNodeInputMenuCloseTimerRef.current = window.setTimeout(() => {
                setSidebarNodeInputMenu(null);
                sidebarNodeInputMenuCloseTimerRef.current = null;
              }, 140);
            }}
          >
            <div className="mb-2 px-1 text-[11px] font-medium text-slate-500">选择输入</div>
            <div className="space-y-1.5">
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left transition-colors hover:bg-[#F3F4F6]"
                onClick={() => {
                  setActiveSidebarItemKey("node_text_prompt");
                  setSidebarNodeInputMenu(null);
                  safeInvoke(() => addNode(NODE_TYPES.TEXT_INPUT), "提示词输入");
                }}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F3F4F6] text-[#6B7280]">
                  <Clipboard className="h-[18px] w-[18px]" />
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-slate-800">提示词输入</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">纯文本提示词输入，可连接到创作节点</div>
                </div>
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left transition-colors hover:bg-[#F3F4F6]"
                onClick={() => {
                  setActiveSidebarItemKey("node_image_generate");
                  setSidebarNodeInputMenu(null);
                  safeInvoke(() => addNode(NODE_TYPES.PROCESSOR, "image_creation"), "图像创作");
                }}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F3F4F6] text-[#6B7280]">
                  <ImagePlus className="h-[18px] w-[18px]" />
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-slate-800">图像创作</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">与现有生图节点一致，支持模型、尺寸和比例</div>
                </div>
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left transition-colors hover:bg-[#F3F4F6]"
                onClick={() => {
                  setActiveSidebarItemKey("node_video_generate");
                  setSidebarNodeInputMenu(null);
                  safeInvoke(() => addNode(NODE_TYPES.VIDEO_GEN, "first_last_reference"), "视频创作");
                }}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F3F4F6] text-[#6B7280]">
                  <Film className="h-[18px] w-[18px]" />
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-slate-800">视频创作</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">内置首尾帧参考 / 全能参考模式切换</div>
                </div>
              </button>
            </div>
          </div>
        ) : null}

        {sidebarWorkflowMenu ? (
          <div
            data-sidebar-workflow-menu="true"
            className="absolute z-[58] w-72 -translate-y-1/2 rounded-[24px] border border-[#E5E7EB] bg-[rgba(255,255,255,0.98)] p-3 shadow-[0_20px_44px_rgba(15,23,42,0.12)] backdrop-blur-xl"
            style={{ left: leftSidebarWidth + 18, top: sidebarWorkflowMenu.top }}
            onMouseEnter={() => {
              if (sidebarWorkflowMenuCloseTimerRef.current) {
                window.clearTimeout(sidebarWorkflowMenuCloseTimerRef.current);
                sidebarWorkflowMenuCloseTimerRef.current = null;
              }
            }}
            onMouseLeave={() => {
              if (sidebarWorkflowMenuCloseTimerRef.current) {
                window.clearTimeout(sidebarWorkflowMenuCloseTimerRef.current);
              }
              sidebarWorkflowMenuCloseTimerRef.current = window.setTimeout(() => {
                setSidebarWorkflowMenu(null);
                sidebarWorkflowMenuCloseTimerRef.current = null;
              }, 140);
            }}
          >
            <div className="mb-2 px-1 text-[11px] font-medium text-slate-500">选择工作流</div>
            <div className="space-y-1.5">
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left transition-colors hover:bg-[#F3F4F6]"
                onClick={() => {
                  setActiveSidebarItemKey("workflow_swap");
                  setSidebarWorkflowMenu(null);
                  safeInvoke(
                    () =>
                      handleAnchorActionClick({
                        partEnum: AI_CHAT_PART_ENUM_209,
                        modelId: 4,
                        to: "workflow_swap",
                        debugLabel: "三合一换图",
                        action: () => navigate("/app/swap"),
                      }),
                    "三合一换图",
                  );
                }}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F3F4F6] text-[#6B7280]">
                  <Layers className="h-[18px] w-[18px]" />
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-slate-800">三合一换图</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">换脸 / 换背景 / 换装 / 视频超清</div>
                </div>
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left transition-colors hover:bg-[#F3F4F6]"
                onClick={() => {
                  setActiveSidebarItemKey("workflow_batch_video");
                  setSidebarWorkflowMenu(null);
                  safeInvoke(
                    () =>
                      handleAnchorActionClick({
                        partEnum: AI_CHAT_PART_ENUM_210,
                        modelId: 4,
                        to: "workflow_batch_video",
                        debugLabel: "批量动图",
                        action: () => navigate("/app/batch-video"),
                      }),
                    "批量动图",
                  );
                }}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F3F4F6] text-[#6B7280]">
                  <Film className="h-[18px] w-[18px]" />
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-slate-800">批量动图</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">单图生成短视频 / 视频超清</div>
                </div>
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left transition-colors hover:bg-[#F3F4F6]"
                onClick={() => {
                  setActiveSidebarItemKey("workflow_batch_wordart");
                  setSidebarWorkflowMenu(null);
                  safeInvoke(
                    () =>
                      handleAnchorActionClick({
                        partEnum: AI_CHAT_PART_ENUM_211,
                        modelId: defaultVideoModelId,
                        to: "workflow_batch_wordart",
                        debugLabel: "批量花字",
                        action: () => navigate("/app/batch-wordart"),
                      }),
                    "批量花字",
                  );
                }}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F3F4F6] text-[#6B7280]">
                  <Palette className="h-[18px] w-[18px]" />
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-slate-800">批量花字</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">批量添加花字文案</div>
                </div>
              </button>
            </div>
          </div>
        ) : null}

        {sidebarImageCreateMenu ? (
          <div
            data-sidebar-image-create-menu="true"
            className="absolute z-[58] w-72 -translate-y-1/2 rounded-[24px] border border-[#E5E7EB] bg-[rgba(255,255,255,0.98)] p-3 shadow-[0_20px_44px_rgba(15,23,42,0.12)] backdrop-blur-xl"
            style={{ left: leftSidebarWidth + 18, top: sidebarImageCreateMenu.top }}
            onMouseEnter={() => {
              if (sidebarImageCreateMenuCloseTimerRef.current) {
                window.clearTimeout(sidebarImageCreateMenuCloseTimerRef.current);
                sidebarImageCreateMenuCloseTimerRef.current = null;
              }
            }}
            onMouseLeave={() => {
              if (sidebarImageCreateMenuCloseTimerRef.current) {
                window.clearTimeout(sidebarImageCreateMenuCloseTimerRef.current);
              }
              sidebarImageCreateMenuCloseTimerRef.current = window.setTimeout(() => {
                setSidebarImageCreateMenu(null);
                sidebarImageCreateMenuCloseTimerRef.current = null;
              }, 140);
            }}
          >
            <div className="mb-2 px-1 text-[11px] font-medium text-slate-500">选择创作方式</div>
            <div className="space-y-1.5">
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left transition-colors hover:bg-[#F3F4F6]"
                onClick={() => {
                  setSidebarImageCreateMenu(null);
                  safeInvoke(
                    () =>
                      handleAnchorActionClick({
                        partEnum: AI_CHAT_PART_ENUM_203,
                        modelId: defaultImageModelId,
                        to: "node_image_generate_text2img",
                        debugLabel: "文生图",
                        action: () => createText2ImgTemplate(),
                      }),
                    "文生图",
                  );
                }}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F3F4F6] text-[#6B7280]">
                  <ImagePlus className="h-[18px] w-[18px]" />
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-slate-800">文生图</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">从提示词直接生成图片</div>
                </div>
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left transition-colors hover:bg-[#F3F4F6]"
                onClick={() => {
                  setSidebarImageCreateMenu(null);
                  safeInvoke(
                    () =>
                      handleAnchorActionClick({
                        partEnum: AI_CHAT_PART_ENUM_203,
                        modelId: defaultImageModelId,
                        to: "node_image_generate_img2img",
                        debugLabel: "图生图",
                        action: () => createImg2ImgTemplate(),
                      }),
                    "图生图",
                  );
                }}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F3F4F6] text-[#6B7280]">
                  <Images className="h-[18px] w-[18px]" />
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-slate-800">图生图</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">基于单张参考图继续创作</div>
                </div>
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left transition-colors hover:bg-[#F3F4F6]"
                onClick={() => {
                  setSidebarImageCreateMenu(null);
                  safeInvoke(createMultiImg2ImgTemplate, "多图生图");
                }}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F3F4F6] text-[#6B7280]">
                  <Layers className="h-[18px] w-[18px]" />
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-slate-800">多图生图</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">多参考图联合生成与重绘</div>
                </div>
              </button>

            </div>
          </div>
        ) : null}

        {sidebarVideoCreateMenu ? (
          <div
            data-sidebar-video-create-menu="true"
            className="absolute z-[58] w-72 -translate-y-1/2 rounded-[24px] border border-[#E5E7EB] bg-[rgba(255,255,255,0.98)] p-3 shadow-[0_20px_44px_rgba(15,23,42,0.12)] backdrop-blur-xl"
            style={{ left: leftSidebarWidth + 18, top: sidebarVideoCreateMenu.top }}
            onMouseEnter={() => {
              if (sidebarVideoCreateMenuCloseTimerRef.current) {
                window.clearTimeout(sidebarVideoCreateMenuCloseTimerRef.current);
                sidebarVideoCreateMenuCloseTimerRef.current = null;
              }
            }}
            onMouseLeave={() => {
              if (sidebarVideoCreateMenuCloseTimerRef.current) {
                window.clearTimeout(sidebarVideoCreateMenuCloseTimerRef.current);
              }
              sidebarVideoCreateMenuCloseTimerRef.current = window.setTimeout(() => {
                setSidebarVideoCreateMenu(null);
                sidebarVideoCreateMenuCloseTimerRef.current = null;
              }, 140);
            }}
          >
            <div className="mb-2 px-1 text-[11px] font-medium text-slate-500">选择创作方式</div>
            <div className="space-y-1.5">
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left transition-colors hover:bg-[#F3F4F6]"
                onClick={() => {
                  setSidebarVideoCreateMenu(null);
                  safeInvoke(createText2VideoTemplate, "文生视频");
                }}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F3F4F6] text-[#6B7280]">
                  <Clapperboard className="h-[18px] w-[18px]" />
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-slate-800">文生视频</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">直接用提示词生成视频</div>
                </div>
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left transition-colors hover:bg-[#F3F4F6]"
                onClick={() => {
                  setSidebarVideoCreateMenu(null);
                  safeInvoke(createImg2VideoTemplate, "图生视频");
                }}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F3F4F6] text-[#6B7280]">
                  <ImagePlus className="h-[18px] w-[18px]" />
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-slate-800">图生视频</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">单张图片生成视频</div>
                </div>
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left transition-colors hover:bg-[#F3F4F6]"
                onClick={() => {
                  setSidebarVideoCreateMenu(null);
                  safeInvoke(createOmniReferenceVideoTemplate, "全能生视频");
                }}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F3F4F6] text-[#6B7280]">
                  <Sparkles className="h-[18px] w-[18px]" />
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-slate-800">全能生视频</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">多参考图联合驱动视频生成</div>
                </div>
              </button>
            </div>
          </div>
        ) : null}

        {/* Canvas */}
        <div
          ref={canvasRef}
          className="flex-1 relative overflow-hidden bg-[#fafaf6]"
          style={{ cursor: getCursor() }}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => {
            canvasHoverClientRef.current = null;
          }}
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
              backgroundImage: "linear-gradient(rgba(203,213,225,0.9) 1px, transparent 1px), linear-gradient(90deg, rgba(203,213,225,0.9) 1px, transparent 1px)",
              backgroundSize: `${GRID_SIZE * viewport.zoom}px ${GRID_SIZE * viewport.zoom}px`,
              backgroundPosition: `${viewport.x}px ${viewport.y}px`,
            }}
          />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              opacity: 0.08,
              backgroundImage: "linear-gradient(rgba(226,232,240,0.96) 1px, transparent 1px), linear-gradient(90deg, rgba(226,232,240,0.96) 1px, transparent 1px)",
              backgroundSize: `${GRID_SIZE * 4 * viewport.zoom}px ${GRID_SIZE * 4 * viewport.zoom}px`,
              backgroundPosition: `${viewport.x}px ${viewport.y}px`,
            }}
          />
          <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at center, rgba(255,255,255,0) 44%, rgba(241,245,249,0.22) 84%, rgba(226,232,240,0.42) 100%)" }} />

	          {canvasDropActive ? (
	            <div className="pointer-events-none absolute inset-6 z-20 rounded-[32px] border border-cyan-500/40 bg-cyan-500/8 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.18)] backdrop-blur-[1px]" />
	          ) : null}

	          {nodes.length === 0 && !hasAgentResultCards ? (
	            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
	              <div className="flex items-center gap-4 text-[11px] tracking-[0.16em] text-slate-400/75">
	                <div className="h-px w-14 bg-[linear-gradient(90deg,rgba(148,163,184,0),rgba(148,163,184,0.45),rgba(148,163,184,0))]" />
	                <span>拖拽图片或视频到画布</span>
	                <div className="h-px w-14 bg-[linear-gradient(90deg,rgba(148,163,184,0),rgba(148,163,184,0.45),rgba(148,163,184,0))]" />
	              </div>
	            </div>
	          ) : null}

	          {/* Controls */}
          <div
            className="absolute bottom-6 right-6 z-50 flex gap-2 select-none"
          >
            <div className="group relative">
              <button
                type="button"
                disabled={nodes.length === 0 && connections.length === 0}
                className={`relative inline-flex h-9 w-9 items-center justify-center rounded-[16px] shadow-[0_18px_36px_rgba(15,23,42,0.08)] transition-colors ${
                  nodes.length === 0 && connections.length === 0
                    ? "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400"
                    : "border border-cyan-200 bg-cyan-50 text-cyan-700 hover:bg-cyan-100 hover:text-cyan-800"
                }`}
                title="保存作品"
              >
                <Save className="h-3.5 w-3.5" />
              </button>
              {nodes.length === 0 && connections.length === 0 ? null : (
                <div className="pointer-events-none absolute bottom-[calc(100%-1px)] right-0 z-50 flex w-max gap-1 rounded-[18px] border border-slate-200 bg-white p-1 opacity-0 shadow-[0_18px_36px_rgba(15,23,42,0.14)] transition-all group-hover:pointer-events-auto group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={saveCurrentCanvasAsWork}
                    className="inline-flex items-center gap-1.5 rounded-[14px] px-3 py-2 text-[11px] text-slate-700 transition-colors hover:bg-cyan-50 hover:text-cyan-700"
                    title="保存为当前作品的新版本"
                  >
                    <Save className="h-3.5 w-3.5" />
                    保存作品
                  </button>
                  <button
                    type="button"
                    onClick={saveCurrentCanvasAsNewWork}
                    className="inline-flex items-center gap-1.5 rounded-[14px] px-3 py-2 text-[11px] text-slate-700 transition-colors hover:bg-cyan-50 hover:text-cyan-700"
                    title="另存为新作品"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    另存作品
                  </button>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowAssetLibrary(true)}
              className="relative inline-flex items-center gap-1.5 rounded-[16px] border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-700 shadow-[0_18px_36px_rgba(15,23,42,0.08)] transition-colors hover:bg-slate-50 hover:text-slate-900"
              title="打开资产库"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              资产库
            </button>
            <button
              type="button"
              onClick={arrangeCanvasNodes}
              disabled={nodes.length === 0}
              className={`relative inline-flex items-center gap-1.5 rounded-[16px] border px-3 py-2 text-[11px] shadow-[0_18px_36px_rgba(15,23,42,0.08)] transition-colors ${
                nodes.length === 0
                  ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-cyan-50 hover:text-cyan-700"
              }`}
              title="一键辅助整理排序"
            >
              <Layout className="h-3.5 w-3.5" />
              整理
            </button>
            <div className="relative flex items-center rounded-[16px] border border-slate-200 bg-white p-0.5 shadow-[0_18px_36px_rgba(15,23,42,0.08)] text-slate-500">
              <button onClick={() => zoomCanvas(-0.2)} className="relative rounded-[12px] p-1.5 transition-colors hover:bg-slate-100 hover:text-slate-900"><Minus className="w-3 h-3" /></button>
              <span className="relative w-9 text-center text-[10px] font-mono text-slate-700">{Math.round(viewport.zoom * 100)}%</span>
              <button onClick={() => zoomCanvas(0.2)} className="relative rounded-[12px] p-1.5 transition-colors hover:bg-slate-100 hover:text-slate-900"><Plus className="w-3 h-3" /></button>
            </div>
            <button onClick={() => setViewport({ x: 0, y: 0, zoom: 1 })} className="relative rounded-[16px] border border-slate-200 bg-white p-2 text-slate-500 shadow-[0_18px_36px_rgba(15,23,42,0.08)] transition-colors hover:bg-slate-50 hover:text-slate-900" title="Reset View">
              <Maximize className="w-3 h-3" />
            </button>
          </div>

	          <div className="absolute inset-0 origin-top-left" style={{ transform: `translate(${viewport.x}px,${viewport.y}px) scale(${viewport.zoom})` }}>
	            <svg className="absolute inset-0 overflow-visible pointer-events-none" style={{ width: 1, height: 1 }}>
	              {renderConnections()}
	              {renderTempConnection()}
	            </svg>

	            {canvasDropUploading ? (
	              <div
	                className="pointer-events-none absolute z-40 w-[280px] overflow-visible border border-cyan-300 bg-white shadow-none"
	                style={{ left: canvasDropUploading.x, top: canvasDropUploading.y }}
	              >
	                <div className="absolute -top-5 left-0 select-none text-[11px] font-medium tracking-[0.08em] text-slate-500">
	                  图片/视频上传
	                </div>
	                <div
	                  className="relative flex min-h-[132px] flex-col items-center justify-center overflow-hidden px-4 py-8 text-center"
	                  style={{ minHeight: MEDIA_UPLOAD_NODE_EMPTY_HEIGHT }}
	                >
	                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.16),transparent_48%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.92))]" />
	                  <div className="relative flex h-11 w-11 items-center justify-center border border-cyan-200 bg-cyan-50 text-cyan-700 shadow-[0_12px_26px_rgba(34,211,238,0.12)]">
	                    <Loader2 className="h-5 w-5 animate-spin" />
	                  </div>
	                  <div className="relative mt-3 text-[13px] font-medium text-slate-800">文件上传中...</div>
	                  <div className="relative mt-1 text-[11px] leading-5 text-slate-500">
	                    正在导入 {canvasDropUploading.total} 个文件
	                    {canvasDropUploading.images ? ` · ${canvasDropUploading.images} 张图片` : ""}
	                    {canvasDropUploading.videos ? ` · ${canvasDropUploading.videos} 个视频` : ""}
	                  </div>
	                  <div className="relative mt-4 h-1.5 w-full overflow-hidden border border-slate-200 bg-slate-100">
	                    <div className="h-full w-full animate-pulse bg-[linear-gradient(90deg,rgba(34,211,238,0.18),rgba(34,211,238,0.82),rgba(59,130,246,0.72),rgba(34,211,238,0.18))]" />
	                  </div>
	                </div>
	              </div>
	            ) : null}

	            {nodes.map((n) => (
              <NodeComponent
                key={n.id}
                node={n}
                selected={selectedNodeIds.has(n.id)}
                onMouseDown={(e) => handleNodeMouseDown(e, n.id)}
                updateData={updateNodeData}
	                apiFetch={apiFetch}
	                onOpenPromptPolishPicker={openPromptPolishPicker}
                imageModelOptions={imageModelOptions}
                videoModelOptions={videoModelOptions}
                resolveModelParamsForId={resolveModelParamsForId}
                personaMentionOptions={personaMentionOptions}
                onDelete={() => deleteNode(n.id)}
                onConnectStart={(e) => {
                  e.stopPropagation();
                  pushHistory();
                  startConnection(e, n.id);
                }}
                onConnectTargetHover={(toHandle) => {
                  handleConnectionTargetHover(n.id, toHandle);
                }}
                onConnectTargetLeave={(toHandle) => {
                  handleConnectionTargetLeave(n.id, toHandle);
                }}
                connecting={!!connectingSource}
                hoveredConnectTarget={hoveredConnectTarget}
                onPreview={setPreviewImage}
                onContinue={createConnectedVideoNode}
                onRetry={() => executeFlow(new Set([n.id]))}
                isReady={checkNodeReady(n, nodes, connections)}
                onSelectArtifact={setActiveArtifact} // ✅ 修复：现在生效
                activeArtifact={activeArtifact}
                onIterateImg2Img={createConnectedImg2ImgBranch}
                onRunCompactRmbg={runCompactRmbg}
                onRunCompactRemoveWatermark={runCompactRemoveWatermark}
                onRunCompactThreeView={runCompactThreeView}
                onRunCompactVideoUpscale={runCompactVideoUpscale}
                onRunVideoRmbg={runVideoRmbg}
                onRunVideoLineart={runVideoLineart}
                onRunVideoSplit={runVideoSplit}
                onQuickCreateFromText={createPromptQuickChain}
                onRunNode={(nodeId) => executeFlow(new Set([nodeId]))}
                onCancelNode={() => cancelNodeGeneration(n.id)}
                shouldAutoOpenUploadPicker={pendingUploadNodeId === n.id}
                onAutoOpenUploadPickerHandled={(nodeId) => {
                  setPendingUploadNodeId((prev) => (prev === nodeId ? "" : prev));
                }}
                onNodeElementChange={handleNodeElementChange}
                onStoryboardMentionHover={openStoryboardAssetHoverCard}
                onStoryboardMentionLeave={scheduleCloseStoryboardAssetHoverCard}
                onShotChipClick={openStoryboardShotHoverCard}
                setRunToast={setRunToast}
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
              return (
                <div
                  key={card.id}
                  data-agent-card-root="true"
                  className={`absolute overflow-hidden rounded-xl border bg-white shadow-[0_18px_48px_rgba(15,23,42,0.1)] ${
                    selectedAgentCardIds.has(card.id)
                      ? "border-cyan-400/70 ring-1 ring-cyan-400/45"
                      : activeAgentCardId === card.id
                      ? "border-violet-400/70 ring-1 ring-violet-400/50"
                      : "border-slate-200"
                  }`}
                  style={{ left: card.x, top: card.y, width: card.w, zIndex: activeAgentCardId === card.id ? 85 : 70 }}
                  onWheelCapture={handleAgentCardWheelCapture}
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
                  <div className="h-9 px-2.5 flex items-center gap-2 border-b border-slate-200 bg-slate-50">
                    <div
                      className="flex-1 min-w-0 flex items-center justify-between cursor-move"
                      onMouseDown={(e) => handleAgentCardMouseDown(e, card.id)}
                    >
                      <div className="text-[11px] font-semibold text-slate-700 truncate">
                        {turn?.intent === "DRAMA" ? "短剧" : "脚本"} · {turn?.extractedProduct || (turn?.intent === "DRAMA" ? "创作任务" : "未知")}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="p-1 rounded hover:bg-slate-100 text-slate-500"
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
                      className="p-1 rounded hover:bg-slate-100 text-slate-500"
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
                    <div
                      data-agent-card-scroll-body="true"
                      className="p-2.5 max-h-[62vh] overflow-y-auto custom-scrollbar"
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <div className="mb-2 text-[11px] text-slate-500 whitespace-pre-wrap break-words">
                            任务：{turn?.userText || "-"}
                      </div>
                      <AgentResultCardContent
                        turn={turn}
                        onRetry={retryAgentTurn}
                        onBriefChange={updateScriptBriefDraft}
                        onBriefSubmit={(turnId) => submitScriptBriefTurn(turnId)}
                        onBriefSubmitDefaults={(turnId) => submitScriptBriefTurn(turnId, { useDefaults: true })}
                        onBriefCancel={cancelScriptBriefTurn}
                        onSelectAngle={selectScriptAngleForTurn}
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
                <div className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_64px_rgba(15,23,42,0.1)]">
                  <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.84)_52%,rgba(255,255,255,0.72))]" />
                  <div className="relative border-b border-slate-200 px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[15px] font-semibold text-slate-800">{showScriptExamples ? "生成脚本案例" : "画布编排案例"}</div>
                        <div className="mt-1 text-[12px] leading-5 text-slate-500">
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
                        className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900"
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
                        className="flex min-h-[84px] items-start gap-3 rounded-[22px] border border-slate-200 bg-white px-4 py-3 text-left transition-colors hover:border-slate-300 hover:bg-slate-50"
                      >
                        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-700">
                          {index + 1}
                        </span>
                        <span className="text-[13px] leading-6 text-slate-700 whitespace-normal break-words">{example}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
            <div
              className={`relative overflow-hidden border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.08)] transition-all duration-200 ${
                agentInputFocused || agentInput.trim()
                  ? "rounded-[32px] px-5 py-5"
                  : "rounded-[40px] px-4 py-3"
              }`}
            >
              <input
                ref={agentUploadInputRef}
                type="file"
                accept={AGENT_COMPOSER_FILE_ACCEPT}
                multiple
                className="hidden"
                onChange={handleAgentComposerUpload}
              />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.72)_54%,rgba(255,255,255,0.84))]" />
              {isCanvasPromptPending ? (
                <div className="relative mb-4 rounded-[22px] border border-cyan-200 bg-cyan-50 px-4 py-3 text-[12px] text-cyan-700">
                  <div className="font-medium">当前在等你补充画面提示词</div>
                  <div className="mt-1 text-cyan-600">
                    直接在下方输入框补一句你想生成的画面，再按回车发送即可。
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {CANVAS_PROMPT_EXAMPLES.map((example) => (
                      <button
                        key={example}
                        type="button"
                        onClick={() => insertCanvasPromptExample(example)}
                        className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1.5 text-[11px] text-cyan-50 hover:bg-cyan-400/15"
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {selectedStoryboardTarget ? (
                <div className="relative mb-3 flex flex-wrap items-start gap-2 rounded-[18px] border border-cyan-200 bg-cyan-50 px-3.5 py-3 text-[12px] text-cyan-800">
                  <span className="rounded-full border border-cyan-200 bg-white px-2.5 py-1 text-[10px] font-medium text-cyan-700">
                    正在编辑 {selectedStoryboardTarget.typeLabel}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-medium text-slate-800 break-words">
                      {selectedStoryboardTarget.label}
                    </div>
                    {selectedStoryboardTarget.summary ? (
                      <div className="mt-1 text-[11px] leading-5 text-slate-600 break-words">
                        {selectedStoryboardTarget.summary}
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveArtifact((current) => (current?.kind === "storyboard_selection" ? null : current))}
                    className="rounded-full border border-cyan-200 bg-white px-2.5 py-1 text-[10px] text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
                  >
                    清除选择
                  </button>
                </div>
              ) : null}
              <div className="relative flex gap-4">
                <button
                  type="button"
                  title="上传参考图片或分镜脚本表"
                  onClick={() => agentUploadInputRef.current?.click()}
                  className={`mt-1 flex shrink-0 items-center justify-center rounded-[20px] border border-slate-200 bg-slate-50 text-slate-700 transition-all disabled:cursor-not-allowed disabled:opacity-90 ${
                    agentInputFocused || agentInput.trim() ? "h-[84px] w-[68px] -rotate-6" : "h-8 w-8 -rotate-[8deg] rounded-[12px]"
                  }`}
                >
                  <Plus className={`${agentInputFocused || agentInput.trim() ? "h-5 w-5" : "h-4 w-4"}`} />
                </button>
                <div className={`relative min-w-0 flex-1 ${isCanvasPromptPending ? "pr-28" : "pr-14"}`}>
                  <PersonaMentionTextarea
                    ref={agentInputRef}
                    value={agentInput}
                    onChange={(e) => {
                      setAgentPromptPolishError("");
                      setAgentInput(e.target.value);
                    }}
                    personas={personaMentionOptions}
                    wrapperClassName="relative"
                    overlayClassName={`text-[15px] leading-7 ${
                      agentInputFocused || agentInput.trim() ? "min-h-[120px]" : "h-9 min-h-9 pt-[2px] text-[14px] leading-8"
                    }`}
                    onFocus={() => setAgentInputFocused(true)}
                    onMouseDown={() => setAgentInputFocused(true)}
                    rows={1}
                    placeholder={
                      isCanvasPromptPending
                        ? "请在这里补一句画面提示词，例如：一瓶极简风洗面奶产品图，白底，棚拍光，高清细节。"
                        : activeComposerActionId === "drama"
                        ? "请输入短剧需求，发送后会直接进入短剧创作流程。"
                        : "输入你的需求，Agent 会先理解你的目标，再决定是直接回答、调用工具还是规划画布。"
                    }
                    className={`w-full resize-none overflow-y-auto bg-transparent text-[15px] leading-7 outline-none placeholder:text-slate-400 ${
                      agentInputFocused || agentInput.trim() ? "min-h-[120px]" : "h-9 min-h-9 pt-[2px] text-[14px] leading-8"
                    }`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendAgentMission();
                      }
                    }}
                  />
                  {isCanvasPromptPending && (
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={polishAgentPromptInput}
                      disabled={agentPromptPolishLoading || !agentInput.trim()}
                      className={`absolute bottom-0 right-14 flex h-9 items-center justify-center gap-1.5 rounded-full border px-3 text-[10px] font-medium transition-all ${
                        agentPromptPolishLoading
                          ? "border-cyan-300 bg-cyan-50 text-cyan-700"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
                      } ${agentInputFocused || agentInput.trim() ? "" : "bottom-0.5 h-8"}`}
                      title="提示词润色"
                    >
                      {agentPromptPolishLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                      <span>AI润色</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={sendAgentMission}
                    disabled={(!agentInput.trim() && agentComposerFiles.length === 0) || isAgentMissionRunning}
                    className={`absolute bottom-0 right-0 flex h-12 w-12 items-center justify-center rounded-full border transition-all ${
                      ((!agentInput.trim() && agentComposerFiles.length === 0) || isAgentMissionRunning)
                        ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                        : "border-cyan-200 bg-cyan-50 text-cyan-700 shadow-[0_10px_24px_rgba(15,23,42,0.08)] hover:translate-y-[-1px] hover:bg-cyan-100"
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
              {agentPromptPolishError && (
                <div className="mt-2 text-[10px] text-amber-400">{agentPromptPolishError}</div>
              )}
              <div
                className={`relative flex flex-wrap gap-2 transition-all duration-200 ${
                  agentComposerFiles.length > 0 ? "mt-3 max-h-24 opacity-100" : "max-h-0 overflow-hidden opacity-0"
                }`}
              >
                {agentComposerFiles.map((file) => (
                  <div
                    key={file.id}
                    className="group flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-2 py-1.5"
                  >
                    {file.kind === "image" ? (
                      <img
                        src={file.previewUrl}
                        alt={file.name}
                        className="h-10 w-10 rounded-xl object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                        <FolderOpen className="h-4 w-4" />
                      </div>
                    )}
                    <div className="max-w-32 truncate text-[11px] text-slate-600">{file.name}</div>
                    <button
                      type="button"
                      onClick={() => removeAgentComposerFile(file.id)}
                      className="rounded-full p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
                      title={file.kind === "image" ? "移除图片" : "移除文件"}
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
                        ? "border-cyan-200 bg-cyan-50 text-cyan-700 shadow-[0_8px_20px_rgba(15,23,42,0.06)]"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    生成脚本
                  </button>
                </div>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => handleAgentQuickAction("drama")}
                    className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[12px] transition-all ${
                      activeComposerActionId === "drama"
                        ? "border-cyan-200 bg-cyan-50 text-cyan-700 shadow-[0_8px_20px_rgba(15,23,42,0.06)]"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <Clapperboard className="h-3.5 w-3.5" />
                    短剧创作
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
                        ? "border-cyan-200 bg-cyan-50 text-cyan-700 shadow-[0_8px_20px_rgba(15,23,42,0.06)]"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <Layout className="h-3.5 w-3.5" />
                    画布编排
                  </button>
                </div>
                {isAdminUser ? (
                  <label className="ml-auto inline-flex cursor-pointer select-none items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-[12px] text-slate-600">
                    <input
                      type="checkbox"
                      checked={agentDevMode}
                      onChange={(e) => setAgentDevMode(e.target.checked)}
                      className="h-3.5 w-3.5 accent-slate-300"
                    />
                    开发模式
                  </label>
                ) : null}
              </div>
              <div
                className={`text-[11px] text-slate-500 transition-all duration-200 ${
                  agentInputFocused || agentInput.trim() ? "mt-3 max-h-8 opacity-100" : "max-h-0 overflow-hidden opacity-0"
                }`}
              >
                回车发送，Shift+回车换行
              </div>
              {preferenceNotice && (
                <div className="mt-2 rounded border border-yellow-200 bg-yellow-50 p-2 text-[10px] text-yellow-800 flex items-center justify-between gap-2">
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
                      className="px-1.5 py-0.5 rounded border border-yellow-200 hover:bg-yellow-100"
                    >
                      快速查看
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreferenceNotice(null)}
                      className="text-yellow-700 hover:text-yellow-900"
                      aria-label="关闭偏好通知"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}
              {HITL_FEEDBACK_UI_ENABLED && (
                <div className="mt-2 rounded border border-fuchsia-200 bg-fuchsia-50 p-2 text-[10px] space-y-1">
                  <div className="text-fuchsia-700">反馈历史</div>
                  {hitlFeedbackRows.length === 0 ? (
                    <div className="text-slate-500">暂无反馈记录</div>
                  ) : (
                    <div className="space-y-1 max-h-24 overflow-y-auto custom-scrollbar">
                      {hitlFeedbackRows.map((row) => (
                        <div key={row.id} className="rounded border border-slate-200 bg-white px-1.5 py-1">
                          <div className="text-slate-700">
                            {row.message}
                            {row.key ? ` · ${row.key}` : ""}
                            {row.reason ? ` · ${row.reason}` : ""}
                          </div>
                          <div className="text-slate-500">
                            {new Date(Number(row.updatedAt || Date.now())).toLocaleString()}
                            {row.caseId ? ` · 用例ID=${row.caseId}` : ""}
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
                              className="mt-1 px-1.5 py-0.5 rounded border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
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
              {isAdminUser && agentDevMode && (
                <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-2 text-[10px] text-slate-500 space-y-1.5">
                  <div className="text-slate-700">开发：记忆建议</div>
                  <div>
                    待处理任务：{" "}
                    {activePendingTask
                      ? `${getRouteIntentLabel(activePendingTask.intent)} 缺失=${(activePendingTask.missing || []).join(",") || "-"}`
                      : "无"}
                  </div>
                  {devSuggestionLog.length === 0 ? (
                    <div className="text-slate-400">暂无建议</div>
                  ) : (
                    <div className="space-y-1 max-h-24 overflow-y-auto custom-scrollbar">
                      {devSuggestionLog.map((row, idx) => (
                        <div key={`${row.turnId}_${row.key}_${idx}`} className="border border-slate-200 rounded px-1.5 py-1">
                          <div>
                            [{getFeedbackStatusLabel(row.status)}] {row.key}
                          </div>
                          <div className="text-slate-400">{Array.isArray(row.value) ? row.value.join("/") : String(row.value || "")}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {HITL_FEEDBACK_UI_ENABLED && (
                    <div className="pt-1 border-t border-slate-200 space-y-1">
                      <div className="text-slate-700">开发：失败回归</div>
                      {devRegressionLog.length === 0 ? (
                        <div className="text-slate-400">暂无回归反馈</div>
                      ) : (
                        <div className="space-y-1 max-h-24 overflow-y-auto custom-scrollbar">
                          {devRegressionLog.map((row, idx) => (
                            <div key={`${row.turnId}_${idx}`} className="border border-slate-200 rounded px-1.5 py-1">
                              <div>
                                [{getFeedbackStatusLabel(row.status)}] 原因={row.reason || "-"}
                              </div>
                          <div className="text-slate-400">
                                用例ID={row.caseId || "-"} {row.error ? `错误=${row.error}` : ""}
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
	          node={(() => {
	            const activeNode = activeNodeId ? nodes.find((n) => n.id === activeNodeId) : null;
	            if (activeNode?.type === NODE_TYPES.VIDEO_GEN && (activeNode?.data?.mode === "img2video" || activeNode?.data?.mode === "text2video")) return null;
	            if (activeNode?.type === NODE_TYPES.PROCESSOR && (activeNode?.data?.mode === "text2img" || activeNode?.data?.mode === "multi_image_generate")) return null;
	            return activeNode;
	          })()}
	          updateData={updateNodeData}
	          onClose={() => setActiveNodeId(null)}
          apiFetch={apiFetch}
          onOpenPromptPolishPicker={openPromptPolishPicker}
          imageModelOptions={imageModelOptions}
          videoModelOptions={videoModelOptions}
          resolveModelParamsForId={resolveModelParamsForId}
          personaMentionOptions={personaMentionOptions}
        />
      </div>

      <PromptPolishPickerModal
        open={Boolean(promptPolishDialog)}
        title={promptPolishDialog?.title || "AI 润色"}
        sourcePrompt={promptPolishDialog?.sourcePrompt || ""}
        variants={promptPolishDialog?.variants || EMPTY_LIST}
        onClose={closePromptPolishPicker}
        onUse={usePromptPolishVariant}
      />

      {/* History Panel（保持你原逻辑） */}
      {showHistoryPanel && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white/40 backdrop-blur-sm" onClick={() => setShowHistoryPanel(false)}>
          <div className="w-[600px] bg-white border border-slate-200 rounded-2xl shadow-[0_28px_64px_rgba(15,23,42,0.14)] flex flex-col max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <div className="flex gap-4">
                <button onClick={() => setActiveHistoryTab("recent")} className={`text-sm font-bold pb-1 border-b-2 transition-colors ${activeHistoryTab === "recent" ? "border-cyan-300 text-cyan-700" : "border-transparent text-slate-500"}`}>
                  最近任务
                </button>
                <button onClick={() => setActiveHistoryTab("stats")} className={`text-sm font-bold pb-1 border-b-2 transition-colors ${activeHistoryTab === "stats" ? "border-cyan-300 text-cyan-700" : "border-transparent text-slate-500"}`}>
                  数据趋势
                </button>
              </div>
              <button onClick={() => setShowHistoryPanel(false)} className="text-slate-500 hover:text-slate-900">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-[#fbfbf8]">
              {activeHistoryTab === "recent" ? (
                <div className="space-y-3">
                  {apiHistory.length === 0 && <div className="text-center text-slate-500 py-8">暂无历史记录</div>}
                  {apiHistory.map((item, i) => {
                    const inputMedia = normalizeHistoryInputs(item.inputs);
                    const outputMedia = normalizeHistoryOutputs(item.outputs);
                    const paramRows = formatHistoryParams(item.inputs);
                    const isExpanded = expandedHistoryIds.has(item.id || String(i));
                    return (
                      <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors space-y-3">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded uppercase">{TOOL_CARDS[item.mode]?.short || item.mode}</span>
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
                              className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded transition-colors flex items-center gap-1"
                            >
                              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />} 详情
                            </button>
                            <button onClick={() => applyHistoryConfig(item)} className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded transition-colors flex items-center gap-1">
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
                          <div className="border-t border-slate-200 pt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <div className="text-[11px] text-slate-500 mb-2">输入参数</div>
                              {paramRows.length === 0 ? (
                                <div className="text-[11px] text-slate-600">无可显示参数</div>
                              ) : (
                                <div className="grid grid-cols-1 gap-1 text-[11px] text-slate-600">
                                  {paramRows.map((row) => (
                                    <div key={row.key} className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded px-2 py-1">
                                      <span className="text-slate-500">{row.key}</span>
                                      <span className="text-slate-700 break-all">{String(row.value)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div>
                              <div className="text-[11px] text-slate-500 mb-2">输出信息</div>
                              <div className="text-[11px] text-slate-700 bg-slate-50 border border-slate-200 rounded px-2 py-2">
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
                            <div className="w-24 text-xs text-slate-500 truncate text-right">{TOOL_CARDS[mode]?.short || mode}</div>
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
                        <span key={i} className="text-xs bg-white border border-slate-200 px-2 py-1 rounded-full text-slate-600 hover:text-slate-900 hover:border-slate-300 cursor-pointer transition-colors">
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
            <div className="fixed right-0 top-0 z-[120] h-full w-[min(94vw,560px)] border-l border-slate-200 bg-white text-slate-700 p-4">
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
        <div className="fixed inset-0 z-[130] bg-white/40 backdrop-blur-[1px] flex items-center justify-center px-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-[0_28px_64px_rgba(15,23,42,0.14)]">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-800">标记为回归用例</div>
                <div className="text-[11px] text-slate-400 mt-0.5">可补充失败原因，便于后续回归修复</div>
              </div>
              <button
                type="button"
                onClick={closeRegressionFeedbackDialog}
                className="p-1 rounded border border-slate-200 text-slate-500 hover:bg-slate-100"
                aria-label="关闭回归反馈弹窗"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <label className="block text-[11px] text-slate-600 space-y-1">
                <span>选择失败原因</span>
                <select
                  value={feedbackReasonChoice}
                  onChange={(e) => setFeedbackReasonChoice(e.target.value)}
                  className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none"
                >
                  {HITL_FEEDBACK_REASON_OPTIONS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-[11px] text-slate-600 space-y-1">
                <span>补充说明（可选）</span>
                <textarea
                  rows={3}
                  value={feedbackReasonNote}
                  onChange={(e) => setFeedbackReasonNote(e.target.value)}
                  placeholder="例如：素材主镜头经常命中错误资产"
                  className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none resize-y"
                />
              </label>
            </div>
            <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeRegressionFeedbackDialog}
                className="px-3 py-1.5 rounded border border-slate-200 text-xs text-slate-700 hover:bg-slate-100"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmRegressionFeedbackDialog}
                className="px-3 py-1.5 rounded border border-fuchsia-200 bg-fuchsia-50 text-xs text-fuchsia-700 hover:bg-fuchsia-100"
              >
                确认标记
              </button>
            </div>
          </div>
        </div>
      )}



      {hoveredStoryboardAssetCard
        ? createPortal(
            (() => {
              const storyboardNode = nodes.find((item) => item.id === hoveredStoryboardAssetCard.nodeId) || null;
              const assetType = hoveredStoryboardAssetCard.assetType;
              const asset = hoveredStoryboardAssetCard.asset || null;
              const assetId = String(asset?.entity_id || asset?.name || "").trim();
              const assetState =
                storyboardNode?.data?.storyboard_asset_state?.[assetType]?.[assetId] || {};
              const isLocked = !!assetState?.locked;
              const generatedAt = assetState?.lastGeneratedAt ? new Date(assetState.lastGeneratedAt).toLocaleString() : "";
              const tabLabel = assetType === "characters" ? "角色" : assetType === "subjects" ? "主体" : "场景";
              const generatedImages = Array.isArray(assetState?.images) ? assetState.images.filter(Boolean) : [];
              const candidateItems = normalizeStoryboardAssetCandidates(assetState?.candidates);
              const selectedImageUrl =
                String(assetState?.selectedImageUrl || "").trim() ||
                String(candidateItems[0]?.url || "").trim() ||
                String(generatedImages[0] || "").trim();
              const selectedCandidateId =
                String(assetState?.selectedCandidateId || "").trim() ||
                String(candidateItems.find((item) => String(item?.url || "").trim() === selectedImageUrl)?.id || "").trim();
              const lockedImageUrl = String(assetState?.lockedImageUrl || "").trim();
              const generationStatus = String(assetState?.status || "").trim();
              const tweakText = String(hoveredStoryboardAssetCard?.tweakText || "").trim();
              const effectivePrompt =
                String(hoveredStoryboardAssetCard?.customPrompt || "").trim() ||
                String(assetState?.prompt || "").trim() ||
                buildStoryboardAssetGenerationPrompt(assetType, asset, storyboardNode?.data?.storyboard_plan || {});
              return (
                <div
                  className="fixed z-[190] w-[360px] pointer-events-auto"
                  style={{ left: hoveredStoryboardAssetCard.x, top: hoveredStoryboardAssetCard.y }}
                  onMouseEnter={() => {
                    if (storyboardAssetHoverCloseTimerRef.current) {
                      window.clearTimeout(storyboardAssetHoverCloseTimerRef.current);
                      storyboardAssetHoverCloseTimerRef.current = null;
                    }
                  }}
                  onMouseLeave={scheduleCloseStoryboardAssetHoverCard}
                  onMouseDown={(event) => event.stopPropagation()}
                  onWheel={(event) => event.stopPropagation()}
                >
                  <div className="overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-[0_24px_64px_rgba(15,23,42,0.16)]">
                    <div className="border-b border-slate-200 px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[11px] font-medium text-slate-500">{tabLabel}</div>
                          <div className="mt-1 text-[13px] font-semibold text-slate-900 break-words">
                            {String(asset?.name || "").trim() || tabLabel}
                          </div>
                        </div>
                      </div>
                      {generatedAt ? <div className="mt-2 text-[10px] text-slate-400">最近生成：{generatedAt}</div> : null}
                    </div>
                    <div className="space-y-3 p-4">
                      {(() => {
                        // Pre-compute whether a local asset image is available so we can suppress the text description.
                        const lab = storyboardNode?.data?.storyboard_plan?.local_asset_bindings || {};
                        let hasLocalImage = false;
                        if (assetType === "characters" || assetType === "subjects") {
                          const cb = (Array.isArray(lab.character_bindings) ? lab.character_bindings : [])
                            .find((b) => String(b?.entity_id || "").trim() === assetId);
                          hasLocalImage = !!String(cb?.three_view_url || "").trim();
                        } else if (assetType === "locations") {
                          const assetName = String(asset?.name || "").trim();
                          const sb = (Array.isArray(lab.scene_bindings) ? lab.scene_bindings : [])
                            .find((b) => matchesSceneBinding(b, assetId) || matchesSceneBinding(b, assetName));
                          hasLocalImage = !!(sb && Array.isArray(sb.preview_urls) && sb.preview_urls.some(Boolean));
                        }
                        if (hasLocalImage) return null;
                        return (
                          <div className="text-[11px] leading-5 text-slate-600 break-words">
                            {String(asset?.core_description || asset?.description || "暂无描述").trim()}
                          </div>
                        );
                      })()}
                      {(assetType === "characters" || assetType === "subjects") && (() => {
                        const charBindings = Array.isArray(storyboardNode?.data?.storyboard_plan?.local_asset_bindings?.character_bindings)
                          ? storyboardNode.data.storyboard_plan.local_asset_bindings.character_bindings
                          : [];
                        const binding = charBindings.find((cb) => String(cb?.entity_id || "").trim() === assetId) || null;
                        const rawUrl = String(binding?.three_view_url || "").trim();
                        if (!rawUrl) return null;
                        const fullUrl = `${(API_BASE || "").replace(/\/+$/, "")}${rawUrl}`;
                        return (
                          <div>
                            <div className="mb-1.5 text-[11px] font-medium text-slate-500">三视图参考</div>
                            <button
                              type="button"
                              onClick={() => setPreviewImage(fullUrl)}
                              className="block w-full overflow-hidden rounded-[14px] border border-slate-200 bg-slate-50"
                            >
                              <img src={fullUrl} alt={`${String(asset?.name || "").trim()} 三视图`} className="w-full object-contain" style={{ maxHeight: 160 }} />
                            </button>
                            {binding?.alias_used && (
                              <div className="mt-1 text-[10px] text-slate-400">
                                别名匹配: <span className="text-slate-600">{binding.alias_used}</span>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                      {(assetType === "characters" || assetType === "subjects") && (() => {
                        const charBindings = Array.isArray(storyboardNode?.data?.storyboard_plan?.local_asset_bindings?.character_bindings)
                          ? storyboardNode.data.storyboard_plan.local_asset_bindings.character_bindings
                          : [];
                        const binding = charBindings.find((cb) => String(cb?.entity_id || "").trim() === assetId) || null;
                        const rawVoiceUrl = String(binding?.voice_url || "").trim();
                        if (!rawVoiceUrl) return null;
                        const fullVoiceUrl = `${(API_BASE || "").replace(/\/+$/, "")}${rawVoiceUrl}`;
                        const voiceFileName = String(binding?.voice_path || "").split("/").pop() || "音色预览";
                        return (
                          <div>
                            <div className="mb-1.5 text-[11px] font-medium text-slate-500">匹配音色</div>
                            <div className="rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-2.5">
                              <div className="mb-2 text-[10px] text-slate-500 truncate">{voiceFileName}</div>
                              <audio
                                controls
                                src={fullVoiceUrl}
                                className="w-full h-8"
                                style={{ minWidth: 0 }}
                              />
                            </div>
                          </div>
                        );
                      })()}
                      {assetType === "locations" && (() => {
                        const sceneBindings = Array.isArray(storyboardNode?.data?.storyboard_plan?.local_asset_bindings?.scene_bindings)
                          ? storyboardNode.data.storyboard_plan.local_asset_bindings.scene_bindings
                          : [];
                        const assetName = String(asset?.name || "").trim();
                        const binding = sceneBindings.find((sb) => matchesSceneBinding(sb, assetId) || matchesSceneBinding(sb, assetName)) || null;
                        const previewUrls = Array.isArray(binding?.preview_urls) ? binding.preview_urls.filter(Boolean) : [];
                        if (!previewUrls.length) return null;
                        const apiRoot = (API_BASE || "").replace(/\/+$/, "");
                        return (
                          <div>
                            <div className="mb-1.5 text-[11px] font-medium text-slate-500">场景参考</div>
                            <div className={`grid gap-2 ${previewUrls.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
                              {previewUrls.map((rawUrl, idx) => {
                                const fullUrl = `${apiRoot}${rawUrl}`;
                                return (
                                  <button
                                    key={idx}
                                    type="button"
                                    onClick={() => setPreviewImage(fullUrl)}
                                    className="overflow-hidden rounded-[14px] border border-slate-200 bg-slate-50"
                                  >
                                    <img src={fullUrl} alt={`${assetName} 场景参考 ${idx + 1}`} className="w-full object-cover" style={{ maxHeight: 120 }} />
                                  </button>
                                );
                              })}
                            </div>
                            {binding?.matched_from && binding.matched_from !== binding.folder_name && (
                              <div className="mt-1 text-[10px] text-slate-400">
                                匹配来源: <span className="text-slate-600">{binding.matched_from}</span>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                      {generationStatus === "running" ? (
                        <div className="flex items-center gap-2 rounded-[12px] border border-cyan-200 bg-cyan-50 px-3 py-2 text-[11px] text-cyan-700">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          正在生成中...
                        </div>
                      ) : null}
                      {generationStatus === "error" && String(assetState?.error || "").trim() ? (
                        <div className="rounded-[12px] border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] leading-5 text-rose-700">
                          {String(assetState.error).trim()}
                        </div>
                      ) : null}
                      {selectedImageUrl ? (
                        <button
                          type="button"
                          onClick={() => setPreviewImage(selectedImageUrl)}
                          className="block overflow-hidden rounded-[14px] border border-slate-200 bg-slate-50"
                        >
                          <img src={selectedImageUrl} alt={`${asset?.name || tabLabel}-selected`} className="h-40 w-full object-cover" />
                        </button>
                      ) : null}
                      {candidateItems.length ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-[11px] font-medium text-slate-600">候选版本</div>
                            <div className="text-[10px] text-slate-400">{candidateItems.length} 张</div>
                          </div>
                          <div className="grid grid-cols-4 gap-2">
                            {candidateItems.map((item, imageIndex) => {
                              const image = String(item?.url || "").trim();
                              if (!image) return null;
                              const isCurrent = image === selectedImageUrl || String(item?.id || "").trim() === selectedCandidateId;
                              const isLockedImage = !!lockedImageUrl && image === lockedImageUrl;
                              return (
                                <button
                                  key={String(item?.id || `${assetId}-img-${imageIndex}`)}
                                  type="button"
                                  onClick={() => {
                                    updateStoryboardAssetStatus(storyboardNode?.id, assetType, assetId, {
                                      selectedCandidateId: String(item?.id || "").trim(),
                                      selectedImageUrl: image,
                                    });
                                    setPreviewImage(image);
                                  }}
                                  className={`relative overflow-hidden rounded-[12px] border bg-slate-50 ${
                                    isCurrent ? "border-cyan-300 ring-2 ring-cyan-200/80" : "border-slate-200"
                                  }`}
                                >
                                  <img src={image} alt={`${asset?.name || tabLabel}-${imageIndex + 1}`} className="h-20 w-full object-cover" />
                                  {isLockedImage ? (
                                    <span className="absolute left-1 top-1 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] text-white">定稿</span>
                                  ) : isCurrent ? (
                                    <span className="absolute left-1 top-1 rounded-full bg-cyan-500 px-1.5 py-0.5 text-[9px] text-white">当前</span>
                                  ) : null}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                      <div className="space-y-2">
                        <div className="text-[11px] font-medium text-slate-600">一句话微调</div>
                        <textarea
                          value={hoveredStoryboardAssetCard?.tweakText || ""}
                          onChange={(event) => {
                            const nextValue = String(event?.target?.value || "");
                            setHoveredStoryboardAssetCard((current) =>
                              current && current.nodeId === storyboardNode?.id && current.assetType === assetType && String(current.asset?.entity_id || current.asset?.name || "").trim() === assetId
                                ? { ...current, tweakText: nextValue, sticky: true }
                                : current,
                            );
                          }}
                          onFocus={() => {
                            setHoveredStoryboardAssetCard((current) =>
                              current && current.nodeId === storyboardNode?.id && current.assetType === assetType && String(current.asset?.entity_id || current.asset?.name || "").trim() === assetId
                                ? { ...current, sticky: true }
                                : current,
                            );
                          }}
                          onBlur={() => {
                            setHoveredStoryboardAssetCard((current) =>
                              current && current.nodeId === storyboardNode?.id && current.assetType === assetType && String(current.asset?.entity_id || current.asset?.name || "").trim() === assetId
                                ? { ...current, sticky: false }
                                : current,
                            );
                          }}
                          rows={3}
                          placeholder={
                            assetType === "locations"
                              ? "例如：霓虹减少一些，整体更冷、更潮湿。"
                              : assetType === "subjects"
                              ? "例如：金属质感更强，锁扣细节更复杂。"
                              : "例如：毛色偏灰蓝，眼神更冷酷，更有压迫感。"
                          }
                          className="w-full resize-none rounded-[12px] border border-slate-200 bg-white px-3 py-2 text-[11px] leading-5 text-slate-700 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            runStoryboardAssetDirectGeneration(storyboardNode, assetType, asset);
                          }}
                          disabled={generationStatus === "running"}
                          className="inline-flex items-center gap-1.5 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-[11px] text-cyan-700 transition-colors hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          {assetState?.lastGeneratedAt ? "重生成" : "生成"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            runStoryboardAssetDirectGeneration(storyboardNode, assetType, asset, {
                              tweakText,
                              referenceImageUrl: selectedImageUrl,
                            });
                          }}
                          disabled={generationStatus === "running" || !tweakText}
                          className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-[11px] text-violet-700 transition-colors hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Wand2 className="h-3.5 w-3.5" />
                          按要求微调
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })(),
            document.body,
          )
        : null}

      {hoveredStoryboardShotCard
        ? createPortal(
            (() => {
              const storyboardNode = nodes.find((n) => n.id === hoveredStoryboardShotCard.nodeId) || null;
              const shot = hoveredStoryboardShotCard.shot || null;
              const scene = hoveredStoryboardShotCard.scene || null;
              const shotId = String(shot?.shot_id || "").trim();
              const shotAssetState = storyboardNode?.data?.storyboard_asset_state?.shots?.[shotId] || {};
              const generationStatus = String(shotAssetState?.status || "").trim();
              const isRunning = generationStatus === "running";
              const selectedImageUrl = String(shotAssetState?.selectedImageUrl || "").trim();
              const candidateItems = normalizeStoryboardAssetCandidates(shotAssetState?.candidates);
              const generatedAt = shotAssetState?.lastGeneratedAt ? new Date(shotAssetState.lastGeneratedAt).toLocaleString() : "";
              const errorMsg = String(shotAssetState?.error || "").trim();
              const sceneDisplayName = stripStoryboardDisplayIds(String(scene?.location || scene?.title || "").trim()) || `场景 ${scene?.scene_no || ""}`;

              return (
                <div
                  className="fixed z-[191] w-[360px] pointer-events-auto"
                  style={{ left: hoveredStoryboardShotCard.x, top: hoveredStoryboardShotCard.y }}
                  onMouseEnter={() => {
                    if (storyboardShotHoverCloseTimerRef.current) {
                      window.clearTimeout(storyboardShotHoverCloseTimerRef.current);
                      storyboardShotHoverCloseTimerRef.current = null;
                    }
                  }}
                  onMouseLeave={scheduleCloseStoryboardShotHoverCard}
                  onMouseDown={(e) => e.stopPropagation()}
                  onWheel={(e) => e.stopPropagation()}
                >
                  <div className="overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-[0_24px_64px_rgba(15,23,42,0.16)]">
                    {/* Header */}
                    <div className="border-b border-slate-200 px-4 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="rounded-md bg-orange-50 px-1.5 py-0.5 text-[11px] font-semibold text-orange-700 ring-1 ring-orange-200">
                            @镜头{shot?.shot_no}
                          </span>
                          <span className="truncate text-[12px] font-medium text-slate-700">{sceneDisplayName}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-500 shrink-0">
                          {String(shot?.camera || "").trim() ? <span>{String(shot.camera).trim()}</span> : null}
                          {shot?.duration_sec ? <span>{shot.duration_sec}s</span> : null}
                        </div>
                      </div>
                      {generatedAt ? <div className="mt-1.5 text-[10px] text-slate-400">最近生成：{generatedAt}</div> : null}
                    </div>

                    {/* Body */}
                    <div className="space-y-3 p-4">
                      {/* Generated image */}
                      {selectedImageUrl ? (
                        <div>
                          <button
                            type="button"
                            onClick={() => setPreviewImage(selectedImageUrl)}
                            className="block w-full overflow-hidden rounded-[14px] border border-slate-200 bg-slate-50"
                          >
                            <img
                              src={selectedImageUrl}
                              alt={`镜头${shot?.shot_no} 分镜图`}
                              className="w-full object-contain"
                              style={{ maxHeight: 200 }}
                            />
                          </button>
                          {/* Candidate thumbnails row */}
                          {candidateItems.length > 1 ? (
                            <div className="mt-2 flex gap-1.5 overflow-x-auto">
                              {candidateItems.map((c) => (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => {
                                    if (!shotId) return;
                                    updateStoryboardAssetStatus(storyboardNode?.id, "shots", shotId, {
                                      selectedImageUrl: c.url,
                                      selectedCandidateId: c.id,
                                    })
                                  }}
                                  className={`h-14 w-14 shrink-0 overflow-hidden rounded-[8px] border-2 transition-colors ${
                                    c.url === selectedImageUrl ? "border-orange-400" : "border-slate-200 hover:border-slate-400"
                                  }`}
                                >
                                  <img src={c.url} alt="" className="h-full w-full object-cover" />
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {/* Visual description */}
                      {String(shot?.visual_description || "").trim() ? (
                        <div className="text-[11px] leading-5 text-slate-600 break-words">
                          {String(shot.visual_description).trim()}
                        </div>
                      ) : null}

                      {/* Dialogues */}
                      {Array.isArray(shot?.dialogues) && shot.dialogues.length > 0 ? (
                        <div className="space-y-0.5">
                          {shot.dialogues.map((d, di) => {
                            const speaker = String(d?.speaker || "").trim();
                            const line = String(d?.text || "").trim();
                            if (!line) return null;
                            return (
                              <div key={di} className="text-[10px] leading-5 text-slate-500 break-words">
                                {speaker ? (
                                  <>
                                    <span className="font-medium text-slate-700">{speaker}：</span>
                                    <span>{line}</span>
                                  </>
                                ) : (
                                  <span>"{line}"</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : null}

                      {/* Error message */}
                      {errorMsg ? (
                        <div className="rounded-[10px] bg-rose-50 px-3 py-2 text-[11px] text-rose-600">{errorMsg}</div>
                      ) : null}

                      {/* Generate button */}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={isRunning}
                          onClick={() => {
                            if (storyboardNode) runStoryboardShotGeneration(storyboardNode, scene, shot);
                          }}
                          className={`flex flex-1 items-center justify-center gap-1.5 rounded-[12px] py-2.5 text-[12px] font-medium transition-colors ${
                            isRunning
                              ? "cursor-not-allowed bg-slate-100 text-slate-400"
                              : "bg-orange-500 text-white hover:bg-orange-600"
                          }`}
                        >
                          {isRunning ? (
                            <><Loader2 className="h-3.5 w-3.5 animate-spin" />生成中…</>
                          ) : selectedImageUrl ? (
                            <><RotateCcw className="h-3.5 w-3.5" />重生成</>
                          ) : (
                            <><Sparkles className="h-3.5 w-3.5" />生成分镜图</>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })(),
            document.body,
          )
        : null}

      {/* Preview Modal */}
      {previewImage && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white/60 backdrop-blur-sm p-10" onClick={() => setPreviewImage(null)}>
          <div className="relative max-w-full max-h-full flex items-center justify-center" onMouseDown={(e) => e.stopPropagation()}>
            {isVideoContent(previewImage) ? (
              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <VideoPlayer src={previewImage} className="max-w-full max-h-[90vh] rounded-lg shadow-2xl border border-slate-200 bg-white" controls autoPlay />
                <button className="absolute -top-12 right-0 text-slate-500 hover:text-slate-900 transition-colors bg-white/90 border border-slate-200 p-2 rounded-full hover:bg-slate-50" onClick={() => setPreviewImage(null)}>
                  <X className="w-6 h-6" />
                </button>
              </div>
            ) : (
              <>
                <img src={previewImage} className="max-w-full max-h-[90vh] rounded-lg shadow-2xl border border-slate-200 object-contain" alt="Preview" onClick={(e) => e.stopPropagation()} />
                <button className="absolute -top-12 right-0 text-slate-500 hover:text-slate-900 transition-colors bg-white/90 border border-slate-200 p-2 rounded-full hover:bg-slate-50" onClick={() => setPreviewImage(null)}>
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
      <div className="h-screen w-screen bg-[#f7f7f2] text-slate-800 flex items-center justify-center p-6">
        <div className="w-[min(92vw,640px)] rounded-xl border border-rose-200 bg-white p-5 shadow-[0_24px_56px_rgba(15,23,42,0.12)]">
          <div className="text-sm font-semibold text-rose-600">页面运行异常</div>
          <div className="mt-2 text-xs text-slate-600 break-all">{this.state.message || "未知错误"}</div>
          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={this.handleRecover}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
            >
              尝试恢复
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs text-cyan-700 hover:bg-cyan-100"
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
