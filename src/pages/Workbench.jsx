import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
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
} from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { useNavigate } from "../router";
import PreferenceSuggestionCard from "../components/agent-canvas/PreferenceSuggestionCard";
import DramaMarkdownBlock from "../components/workbench/DramaMarkdownBlock";
import ShotAnnotatedScriptBlock from "../components/workbench/ShotAnnotatedScriptBlock";
import ScriptExtractionCard from "../components/workbench/ScriptExtractionCard";
import AssetGenConfirmCard from "../components/workbench/AssetGenConfirmCard";
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
  extractCanvasSupplementalPrompt,
} from "../components/agent-canvas/promptUtils";
import {
  readAiChatAnchorDebugState,
  writeAiChatAnchorDebugState,
} from "../lib/aiChatAnchorDebug";
import {
  polishCanvasPrompt,
  runVideoSplitTask,
  runVideoLineartTask,
  runVideoRmbgTask,
  sendAgentMessage,
  pollStoryboardTask,
} from "../api/agentCanvas";
import {
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
import { useMemberInfo, formatMemberPoints } from "../hooks/useMemberInfo";
import { useSidebar } from "../hooks/useSidebar";
import { detectPreferenceSuggestions } from "../agent/preferenceSuggestion";
import { buildHitlFeedbackRows } from "../agent/hitlFeedbackHistory";
import { AI_CHAT_IMAGE_MODEL_ID_NANO_BANANA2, API_BASE } from "../config";
import { findAIChatModelIdByKeywords } from "../lib/aiChatModelResolver";
import { isVideoContent } from "../lib/mediaType.js";
import { buildRoleProfileStructuredOutput } from "../lib/roleProfileStructurer.js";
import {
  EMPTY_LIST,
  STORYBOARD_RUN_STEPS,
  SHOT_WORKFLOW_RUN_STEPS,
  AGENT_RESULT_CARD_WIDTH,
  isPreviewableArtifact,
  matchesSceneBinding,
  stripStoryboardDisplayIds,
  getAgentTurnStepLabel,
  NODE_TYPES,
  HIDDEN_IMAGE_CONFIG_MODES,
  VOLC_VIDEO_HD_TEMPLATE_ENUM_1,
  VOLC_VIDEO_HD_TEMPLATE_ENUM_2,
  DEFAULT_VIDEO_HD_MODEL_ID,
  isSeedanceOmniReferenceModel,
  sortParamValues,
  findAIChatParamItem,
  getAIChatParamDisplayValue,
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
  normalizeVideoSplitSegments,
  checkNodeReady,
} from "../constants/workbench.jsx";
import { useAssetLibrary, cloneAssetLibrarySnapshot, buildSnapshotDigest, normalizeAssetLibraryStore, buildAssetLibraryAssetsFromSnapshot, mergeAssetLibraryAssets, normalizeAssetLibraryPersona } from "../hooks/useAssetLibrary";
import { useCanvas, cloneCanvasNodeLight } from "../hooks/useCanvas";
import { useCanvasStore } from "../stores/canvasStore.js";
import {
  normalizeVideoLineartConfig,
  buildStoryboardStylePrefix,
  buildStoryboardAssetGenerationPrompt,
  normalizeStoryboardAssetCandidates,
  resolveStoryboardAssetPrimaryImage,
  buildStoryboardAssetEditPrompt,
  pickFirstImageUrl,
  pickFirstVideoUrl,
  summarizeAIChatResponse,
  extractAIChatDoneError,
  WORKBENCH_AI_CHAT_MODULE_ENUM,
  resolveWorkbenchAIChatPartEnum,
  buildAIChatParamPayload,
  findAIChatParamValueId,
  THREE_VIEW_PROMPT,
  THREE_VIEW_DEFAULT_TEMPLATES,
  extractApiError,
  isAbortLikeError,
  MULTI_ANGLE_VARIANTS,
  MODES_WITHOUT_APP_AUTH,
  formatAIChatErrorMessage,
  isFirstLastFrameReferenceSelection,
} from "../lib/workbenchHelpers.js";
import WorkbenchRunBar from "../components/workbench/WorkbenchRunBar.jsx";
import WorkbenchAssetLibrary from "../components/workbench/WorkbenchAssetLibrary.jsx";
import WorkbenchImagePreview from "../components/workbench/WorkbenchImagePreview.jsx";
import WorkbenchHistoryPanel from "../components/workbench/WorkbenchHistoryPanel.jsx";
import WorkbenchRegressionDialog from "../components/workbench/WorkbenchRegressionDialog.jsx";
import WorkbenchStoryboardAssetCard from "../components/workbench/WorkbenchStoryboardAssetCard.jsx";
import WorkbenchSidebar from "../components/workbench/WorkbenchSidebar.jsx";
import WorkbenchAgentComposer from "../components/workbench/WorkbenchAgentComposer.jsx";
import { useCanvasNodeOps } from "../hooks/useCanvasNodeOps.js";
import { useCanvasExecutor } from "../hooks/useCanvasExecutor.js";
import WorkbenchStoryboardShotCard from "../components/workbench/WorkbenchStoryboardShotCard.jsx";
import { useAgentChat, makeAgentId, HITL_FEEDBACK_REASON_OPTIONS } from "../hooks/useAgentChat";
import { useWorkbenchRun } from "../hooks/useWorkbenchRun";

const PreferencesPanel = React.lazy(() => import("../components/agent-canvas/PreferencesPanel"));


// ==========================================
// Config & Constants
// ==========================================
const generateId = () => Math.random().toString(36).substr(2, 9);
const GRID_SIZE = 20;
const ASSET_LIBRARY_STORE_KEY = "bananaflow_asset_library_v1";
const AGENT_COMPOSER_FILE_ACCEPT = "image/*,.csv,.tsv,.txt,.md,.markdown,.docx,.doc,text/plain,text/csv,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword";
const AGENT_DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;
const WORD_DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const WORD_LEGACY_DOC_MIME_TYPE = "application/msword";
const AGENT_QUICK_ACTIONS = [
  { id: "shot_workflow", label: "剧本工作流" },
  { id: "canvas", label: "搭建画布" },
];
const AGENT_SHOT_WORKFLOW_QUICK_PROMPT = "请为我上传或粘贴的剧本搭建每个镜头的文生图/图生图工作流";
const AGENT_CANVAS_EXAMPLES = [
  "帮我搭一个文生图接图生视频流程",
  "帮我搭一个上传图片后去背景再输出",
  "帮我搭一个本地文生图流程",
  "帮我搭一个上传商品图后做多角度镜头",
  "帮我搭一个上传图片后做特征提取再输出",
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


const STORYBOARD_SCRIPT_TEXT_MARKERS = [
  "人物：",
  "人物:",
  "角色：",
  "角色:",
  "场景：",
  "场景:",
  "时间：",
  "时间:",
  "画外音",
  "旁白",
  "△",
  "▲",
];

const looksLikeShotWorkflowScriptText = (text, uploadedDocuments = []) => {
  const docs = Array.isArray(uploadedDocuments) ? uploadedDocuments : [];
  if (docs.some((item) => String(item?.kind || "").trim() === "storyboard_script_table")) return true;
  const source = String(text || "").trim();
  if (source.length < 80) return false;
  if (/分镜|故事板|storyboard|shot list|镜头脚本|镜头设计/i.test(source)) return true;
  const markerHits = STORYBOARD_SCRIPT_TEXT_MARKERS.filter((marker) => source.includes(marker)).length;
  const dialogueHits = (source.match(/^\s*[\u4e00-\u9fa5A-Za-z·]{1,12}\s*[:：]/gm) || []).length;
  const sceneHits = (source.match(/^\s*[△▲]/gm) || []).length;
  return markerHits >= 2 && (dialogueHits >= 2 || sceneHits >= 2);
};

const countStoryboardShots = (plan) =>
  (Array.isArray(plan?.scenes) ? plan.scenes : []).reduce(
    (sum, scene) => sum + (Array.isArray(scene?.shots) ? scene.shots.length : 0),
    0,
  );

const buildStoryboardWorkflowStepState = (plan) => {
  const lab = plan?.local_asset_bindings || {};
  const boundCharacters = Array.isArray(lab.character_bindings) ? lab.character_bindings.length : 0;
  const boundScenes = Array.isArray(lab.scene_bindings) ? lab.scene_bindings.length : 0;
  const shotCount = countStoryboardShots(plan);
  return [
    { id: "script", label: "剧本输入", status: "success" },
    { id: "plan", label: "分镜设计", status: shotCount > 0 ? "success" : "ready", count: shotCount },
    { id: "assets", label: "资产绑定", status: boundCharacters || boundScenes ? "success" : "ready", count: boundCharacters + boundScenes },
    { id: "shots", label: "镜头图生产", status: "ready", count: shotCount },
  ];
};

const enhanceStoryboardPatchWithProductionWorkflow = (rawPatch, options = {}) => {
  const patch = Array.isArray(rawPatch) ? rawPatch : [];
  if (!patch.length) return [];
  const storyboardOpIndex = patch.findIndex((op) => op?.op === "add_node" && op?.node?.type === NODE_TYPES.STORYBOARD_PLAN);
  if (storyboardOpIndex < 0) return patch;

  const originalStoryboard = patch[storyboardOpIndex].node || {};
  const shouldCreateSourceNode = !options.sourceNodeId && options.createSourceNode !== false;
  const dx = shouldCreateSourceNode ? 440 : 0;
  const storyboardNodeIds = [];
  let firstStoryboardNodeId = "";
  let sourceNodeId = String(options.sourceNodeId || "").trim();
  let sourceNode = null;

  if (shouldCreateSourceNode) {
    sourceNodeId = `storyboard_input_${generateId()}`;
    const sourceText = String(options.sourceText || "").trim();
    const baseX = Number(originalStoryboard.x || 120);
    const baseY = Number(originalStoryboard.y || 120);
    sourceNode = {
      id: sourceNodeId,
      type: NODE_TYPES.STORYBOARD_INPUT,
      x: baseX,
      y: baseY,
      data: {
        title: "剧本输入",
        status: "success",
        error: "",
        scriptFileName: String(options.sourceTitle || "对话输入剧本").trim() || "对话输入剧本",
        summary: "已读取剧本，并接入故事板制作流程。",
        generatedStoryboardNodeIds: [],
        progressLabel: "",
        textPreview: sourceText.slice(0, 1200),
        source: "agent_chat_storyboard",
      },
    };
  }

  const enhancedPatch = patch.map((op) => {
    if (op?.op !== "add_node" || !op?.node) return op;
    const nextNode = {
      ...op.node,
      x: Number(op.node.x || 0) + dx,
      y: Number(op.node.y || 0),
      data: { ...(op.node.data || {}) },
    };
    if (nextNode.type === NODE_TYPES.STORYBOARD_PLAN) {
      const plan = nextNode.data.storyboard_plan || {};
      const shotCount = countStoryboardShots(plan);
      storyboardNodeIds.push(String(nextNode.id || "").trim());
      if (!firstStoryboardNodeId) firstStoryboardNodeId = String(nextNode.id || "").trim();
      nextNode.data = {
        ...nextNode.data,
        source_storyboard_input_node_id: sourceNodeId || nextNode.data.source_storyboard_input_node_id || "",
        workflow_mode: "storyboard_image_production",
        workflow_status: "ready",
        workflow_summary: shotCount > 0 ? `已拆分 ${shotCount} 个镜头，可继续批量生成分镜图。` : "分镜生产工作流已就绪。",
        workflow_steps: buildStoryboardWorkflowStepState(plan),
      };
    }
    return { ...op, node: nextNode };
  });

  if (sourceNode) {
    sourceNode.data.generatedStoryboardNodeIds = storyboardNodeIds.filter(Boolean);
    enhancedPatch.unshift({ op: "add_node", node: sourceNode });
  }
  if (sourceNodeId && firstStoryboardNodeId) {
    enhancedPatch.push({
      op: "add_connection",
      connection: { id: generateId(), from: sourceNodeId, to: firstStoryboardNodeId },
    });
  }
  if (firstStoryboardNodeId) {
    enhancedPatch.push({ op: "select_nodes", ids: [firstStoryboardNodeId] });
  }
  return enhancedPatch;
};

const isDocxDocumentFile = (file) => {
  const name = String(file?.name || "").trim().toLowerCase();
  const type = String(file?.type || "").trim().toLowerCase();
  return name.endsWith(".docx") || type === WORD_DOCX_MIME_TYPE;
};

const isLegacyWordDocumentFile = (file) => {
  const name = String(file?.name || "").trim().toLowerCase();
  const type = String(file?.type || "").trim().toLowerCase();
  return name.endsWith(".doc") || type === WORD_LEGACY_DOC_MIME_TYPE;
};

const isAgentComposerDocumentFile = (file) => {
  const name = String(file?.name || "").trim().toLowerCase();
  const type = String(file?.type || "").trim().toLowerCase();
  return Boolean(
    name.endsWith(".csv") ||
      name.endsWith(".tsv") ||
      name.endsWith(".txt") ||
      name.endsWith(".md") ||
      name.endsWith(".markdown") ||
      isDocxDocumentFile(file) ||
      isLegacyWordDocumentFile(file) ||
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
    } catch {
      // ignore decoder unsupported/runtime errors
    }
  }
  return String(bestText || "").trim();
};

const extractDocxTextContent = async (arrayBuffer) => {
  const mammothModule = await import("mammoth/mammoth.browser.js");
  const mammothClient = mammothModule.default || mammothModule;
  if (typeof mammothClient.extractRawText !== "function") {
    throw new Error("Word 文档解析器加载失败");
  }
  const result = await mammothClient.extractRawText({ arrayBuffer });
  return String(result?.value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
};

const readAgentDocumentText = async (file) => {
  if (isLegacyWordDocumentFile(file)) {
    throw new Error(`${file.name || "Word 文档"} 是旧版 .doc 格式，请另存为 .docx 后上传`);
  }
  const buffer = await file.arrayBuffer();
  if (isDocxDocumentFile(file)) {
    return extractDocxTextContent(buffer);
  }
  return decodeStoryboardDocumentBuffer(buffer);
};

const getAgentDocumentMimeType = (file) => {
  const type = String(file?.type || "").trim();
  if (type) return type;
  if (isDocxDocumentFile(file)) return WORD_DOCX_MIME_TYPE;
  if (isLegacyWordDocumentFile(file)) return WORD_LEGACY_DOC_MIME_TYPE;
  return "text/plain";
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



const getDefaultVideoModelId = (options) => {
  if (!Array.isArray(options) || options.length === 0) return DEFAULT_VIDEO_MODEL_ID;
  return options[0]?.id || DEFAULT_VIDEO_MODEL_ID;
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



const Workbench = () => {
  const { user, apiFetch } = useAuth();
  const navigate = useNavigate();
  const {
    setHoveredSidebarItemKey,
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

  const clearAgentCardSelectionRef = useRef(null);
  const boxSelectCompleteRef = useRef(null);
  const pasteToastRef = useRef(null);

  const {
    nodes, setNodes,
    connections, setConnections,
    history,        // Phase 2: 来自 store（只读引用，用于 dep array）
    historyStep,    // Phase 2: 来自 store（只读，用于 dep array）
    viewport, setViewport, viewportRef,
    selectedNodeIds, setSelectedNodeIds,
    selectedConnectionIds, setSelectedConnectionIds,
    activeNodeId, setActiveNodeId,
    setIsSpacePressed,
    selectionBox,
    connectingSource, setConnectingSource,
    hoveredConnectionId, setHoveredConnectionId,
    hoveredConnectTarget, setHoveredConnectTarget,
    mousePos,
    canvasDropActive,
    canvasDropUploading,
    canvasId,
    nodeElementMapRef, nodesRef, connectionsRef,
    canvasRef, canvasHoverClientRef,
    connectionDragSelectionRef,
    connectionHoverTargetRef,
    canUndo, canRedo,
    pushHistory, undo, redo,
    deleteSelection,
    deleteConnectionById,
    handleConnectionClick,
    screenToCanvas, zoomCanvas,
    arrangeCanvasNodes,
    handleWheel,
    handleCanvasMouseDown, handleNodeMouseDown,
    handleMouseMove, handleMouseUp,
    getCursor,
    createMediaUploadNodeAt,
    getCanvasViewportCenterPoint,
    handleCanvasDragEnter, handleCanvasDragOver, handleCanvasDragLeave, handleCanvasDrop,
    appendTemplateGraph,
    updateNodeData,
    applyPatch: storeApplyPatch,
  } = useCanvas({
    onClearAgentCardSelectionRef: clearAgentCardSelectionRef,
    onBoxSelectCompleteRef: boxSelectCompleteRef,
    onPasteToastRef: pasteToastRef,
  });

  const {
    assetLibraryStore, setAssetLibraryStore,
    showAssetLibrary, setShowAssetLibrary,
    assetLibraryTab, setAssetLibraryTab,
    assetLibraryLoaded,
    expandedAssetWorkIds, setExpandedAssetWorkIds,
    setAssetLibraryDetailWorkId,
    setAssetLibraryDetailPersonaId,
    editingAssetWorkTitleId,
    editingAssetWorkTitleDraft, setEditingAssetWorkTitleDraft,
    pendingUploadNodeId, setPendingUploadNodeId,
    assetLibraryPickerMode, setAssetLibraryPickerMode,
    assetLibraryPersonaImageInputRef,
    assetLibraryRestoredRef,
    assetLibraryDrafts, assetLibraryWorks,
    assetLibraryAssets, assetLibraryPersonas, personaMentionOptions,
    assetLibraryVersionsByWorkId,
    activeCanvasDraft, upsertCanvasDraftSnapshot,
    assetLibraryDetailWork, assetLibraryDetailPersona,
    assetLibraryDetailSnapshot, assetLibraryDetailDigest, assetLibraryDetailAssets,
    beginEditAssetWorkTitle, cancelEditAssetWorkTitle, commitEditAssetWorkTitle,
    createAssetLibraryPersona, updateAssetLibraryPersona, removeAssetLibraryPersona,
    handleAssetLibraryPersonaReferenceUpload, removeAssetLibraryItem,
  } = useAssetLibrary(canvasId);

  const onRunToastForAgentRef = useRef(null);
  const {
    agentInput, setAgentInput,
    agentInputFocused, setAgentInputFocused,
    agentPromptPolishLoading, setAgentPromptPolishLoading,
    agentPromptPolishError, setAgentPromptPolishError,
    promptPolishDialog,
    activeComposerActionId, setActiveComposerActionId,
    showCanvasExamples, setShowCanvasExamples,
    agentComposerFiles, setAgentComposerFiles,
    agentDevMode, setAgentDevMode,
    agentHistoryCollapsed,
    showPreferencesPanel, setShowPreferencesPanel,
    preferencesPanelPrefill, setPreferencesPanelPrefill,
    preferenceNotice, setPreferenceNotice,
    savingSuggestionId, setSavingSuggestionId,
    savingFeedbackTargetId, setSavingFeedbackTargetId,
    feedbackDialog, setFeedbackDialog,
    feedbackReasonChoice, setFeedbackReasonChoice,
    feedbackReasonNote, setFeedbackReasonNote,
    agentResultCards, setAgentResultCards,
    selectedAgentCardIds, setSelectedAgentCardIds,
    activeAgentCardId, setActiveAgentCardId,
    agentInputRef,
    agentUploadInputRef,
    agentComposerRef,
    agentCardDragRef,
    agentConversationBottomRef,
    agentSessions,
    activeAgentSession,
    agentTurns,
    activePendingTask,
    isCanvasPromptPending,
    isAgentMissionRunning,
    hasActiveAgentConversation,
    hasAgentResultCards,
    minimizedAgentCards,
    rightPanelContainerStyle,
    openPromptPolishPicker,
    closePromptPolishPicker,
    usePromptPolishVariant,
    handleRightPanelResizeStart,
    toggleAgentHistoryPanel,
    updateActiveAgentSession,
    appendAgentTurn,
    updateAgentTurn,
    createAgentSession,
    setActiveAgentSession,
    clearActiveAgentConversation,
    setPendingTaskForActiveSession,
    clearPendingTaskForActiveSession,
    refreshMemoryPreferences,
    updateSuggestionStatus,
    focusAgentResultCard,
    toggleAgentResultCardCollapsed,
    minimizeAgentResultCard,
    handleAgentCardWheelCapture,
    appendAssistantTurn,
  } = useAgentChat({ apiFetch, onRunToastRef: onRunToastForAgentRef });

  const {
    isRunning, setIsRunning,
    runAbortControllerRef, nodeAbortControllersRef,
    cancelledNodeIdsRef, runningNodeIdsRef,
    apiStatus,
    setGlobalError,
    previewImage, setPreviewImage,
    showHistoryPanel, setShowHistoryPanel,
    activeHistoryTab, setActiveHistoryTab,
    apiHistory,
    expandedHistoryIds, setExpandedHistoryIds,
    apiStats,
    runToast, setRunToast,
    normalizeHistoryOutputs,
    normalizeHistoryInputs,
    formatHistoryParams,
    cancelNodeGeneration,
    safeInvoke,
  } = useWorkbenchRun({ apiFetch });

  // ── Phase 5: canvas node operations hook (compact ops + storyboard gen) ────
  const {
    updateStoryboardAssetStatus,
    runStoryboardAssetDirectGeneration,
    runStoryboardShotGeneration,
    createImageOperationResultNode,
    runCompactRemoveWatermark,
    runCompactRmbg,
    createConnectedImg2ImgBranch,
    runCompactVideoUpscale,
    runVideoLineart,
    runVideoRmbg,
    runVideoSplit,
    runCompactThreeView,
  } = useCanvasNodeOps({
    apiFetch,
    defaultImageModelId,
    threeViewImageModelId,
    imageModelRecords,
    imageModelOptions,
    resolveModelParamsForId,
    activeArtifact,
    setRunToast,
    pushApiDebugDetail,
    updateApiDebugStatus,
    aiChatSessionIdRef,
    aiChatHistoryRecordIdRef,
    setHoveredStoryboardAssetCard,
    setHoveredStoryboardShotCard,
  });

  // ── Phase 6: canvas execution engine (executeFlow) ─────────────────────────
  const { executeFlow } = useCanvasExecutor({
    apiFetch,
    defaultImageModelId,
    defaultVideoModelId,
    imageModelOptions,
    resolveModelParamsForId,
    agentDevMode,
    aiChatSessionIdRef,
    aiChatHistoryRecordIdRef,
    pushApiDebugDetail,
    updateApiDebugStatus,
    runAbortControllerRef,
    nodeAbortControllersRef,
    cancelledNodeIdsRef,
    runningNodeIdsRef,
    setIsRunning,
    setRunToast,
    setGlobalError,
  });

  // Callback refs for useCanvas cross-cutting concerns
  clearAgentCardSelectionRef.current = () => {
    setSelectedAgentCardIds(new Set());
    setActiveAgentCardId(null);
  };
  boxSelectCompleteRef.current = (x1, y1, x2, y2, appendSelection) => {
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
  };
  pasteToastRef.current = (toast) => {
    setRunToast(toast);
    setTimeout(() => setRunToast(null), 2200);
  };
  onRunToastForAgentRef.current = setRunToast;

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
  const workspaceShellRef = useRef(null);
  const previewOpenedBySpaceRef = useRef(false);

  const isLeftSidebarCollapsed = true;
  const leftSidebarWidth = isLeftSidebarCollapsed ? 62 : 140;

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
  const defaultImageModelId = useMemo(() => getDefaultImageModelId(imageModelRecords), [imageModelRecords]);
  const threeViewImageModelId = useMemo(() => {
    const preferred = String(AI_CHAT_IMAGE_MODEL_ID_NANO_BANANA2 || "").trim();
    if (preferred) return preferred;
    return findAIChatModelIdByKeywords(imageModelRecords) || defaultImageModelId;
  }, [defaultImageModelId, imageModelRecords]);
  const defaultVideoModelId = useMemo(() => getDefaultVideoModelId(videoModelOptions), [videoModelOptions]);

  // For each text_input node: find sibling input nodes connected to the same downstream node
  const connectedInputsByNodeId = useMemo(() => {
    const map = new Map();
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    // Build downstream map: nodeId → Set of downstream nodeIds
    const downstreamOf = new Map();
    connections.forEach((c) => {
      if (!c.from || !c.to) return;
      if (!downstreamOf.has(c.from)) downstreamOf.set(c.from, new Set());
      downstreamOf.get(c.from).add(c.to);
    });
    // Build upstream map: nodeId → Set of upstream nodeIds
    const upstreamOf = new Map();
    connections.forEach((c) => {
      if (!c.from || !c.to) return;
      if (!upstreamOf.has(c.to)) upstreamOf.set(c.to, new Set());
      upstreamOf.get(c.to).add(c.from);
    });
    nodes.forEach((n) => {
      if (n.type !== "text_input") return;
      const downstreamIds = downstreamOf.get(n.id) || new Set();
      const siblingInputNodes = [];
      const seen = new Set();
      downstreamIds.forEach((downId) => {
        const upstreamIds = upstreamOf.get(downId) || new Set();
        upstreamIds.forEach((sibId) => {
          if (sibId === n.id || seen.has(sibId)) return;
          const sib = nodeById.get(sibId);
          if (sib && sib.type === "input") {
            seen.add(sibId);
            siblingInputNodes.push(sib);
          }
        });
      });
      map.set(n.id, siblingInputNodes);
    });
    return map;
  }, [nodes, connections]);

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
    memberInfoLoginUrl,
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

  const scheduleCloseStoryboardAssetHoverCard = useCallback(() => {
    if (storyboardAssetHoverCloseTimerRef.current) {
      window.clearTimeout(storyboardAssetHoverCloseTimerRef.current);
    }
    storyboardAssetHoverCloseTimerRef.current = window.setTimeout(() => {
      setHoveredStoryboardAssetCard((current) => (current?.sticky ? current : null));
      storyboardAssetHoverCloseTimerRef.current = null;
    }, 120);
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

  // _applyPatch — 委托给 canvasStore.applyPatch（Immer 事务，无闭包陈旧问题）
  // 返回值 { nodes, connections, viewport } 与原实现兼容，供 upsertCanvasDraftSnapshot 使用。
  const _applyPatch = useCallback((patchOps) => {
    if (!Array.isArray(patchOps) || patchOps.length === 0) return undefined;
    return storeApplyPatch(patchOps);
  }, [storeApplyPatch]);

  // Initialize — Phase 2: 改用 store.pushHistory() 推入初始快照
  // 执行时机：首次渲染后，canvas restore effect (line ~1982) 可能已恢复 localStorage 数据；
  // 若历史为空则推入当前状态作为第一个快照，确保 Ctrl+Z 不会越过初始状态。
  useEffect(() => {
    if (useCanvasStore.getState()._history.length === 0) {
      pushHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          : targetNode.type === NODE_TYPES.STORYBOARD_INPUT
          ? 380
          : targetNode.type === NODE_TYPES.ROLE_INPUT
          ? 76
          : 280;
      const height =
        targetNode.type === NODE_TYPES.STORYBOARD_PLAN
          ? 620
          : targetNode.type === NODE_TYPES.STORYBOARD_INPUT
          ? 260
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
    // Phase 2: undo/redo 现在是 store actions（读 get()，无需捕获 history/historyStep）
  }, [nodes, selectedNodeIds, selectedConnectionIds, toggleAgentHistoryPanel, activeArtifact, previewImage]);

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
      [NODE_TYPES.STORYBOARD_INPUT]: {
        title: "故事板输入",
        status: "idle",
        error: "",
        scriptFileName: "",
        summary: "",
        generatedStoryboardNodeIds: [],
        progressLabel: "",
      },
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
      const canInput = t !== NODE_TYPES.INPUT && t !== NODE_TYPES.TEXT_INPUT && t !== NODE_TYPES.STORYBOARD_INPUT && t !== NODE_TYPES.ROLE_INPUT;
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
    [activeAgentSession?.id, activeArtifact, apiFetch, canvasId, getRecentAgentUploadedDocuments, shouldReuseRecentUploadedDocuments],
  );



  const runCanvasPlanMission = useCallback(
    async (userText, routeMeta = {}, requestOptions = {}) => {
      updateApiDebugStatus("agentPlanner", {
        status: "loading",
        message: "POST /api/agent/invoke -> canvas_plan",
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
        if (!(agentResponse?.intent === "canvas_plan")) {
          throw new Error("Agent 未返回画布规划结果");
        }
        const toolResult = agentResponse.tool_result || {};

        const plannerDebug = toolResult?.debug?.planner || {};
        const plannerPath = String(plannerDebug?.planner_path || "unknown");
        updateApiDebugStatus("agentPlanner", {
          status: plannerPath.includes("fallback") || plannerPath === "legacy" ? "warning" : "success",
          message: `agent_v2 · thread=${plannerDebug?.thread_id || canvasId || "--"}`,
        });
        pushApiDebugDetail("agentPlanner", {
          type: "response",
          path: "/api/agent/invoke",
          payload: {
            prompt: requestPayload.prompt,
            supplementalPrompt: requestPayload.supplementalPrompt || "",
            currentNodes: requestPayload.currentNodes.length,
            currentConnections: requestPayload.currentConnections.length,
            canvasId: requestPayload.canvasId || "",
          },
          response: {
            debug: plannerDebug,
            patch_count: Array.isArray(agentResponse?.patches) ? agentResponse.patches.length : 0,
            summary: agentResponse?.message || toolResult?.summary || "",
            thought: agentResponse?.thought || toolResult?.thought || "",
          },
        });

        const patch = Array.isArray(agentResponse?.patches) ? agentResponse.patches : [];
        if (!patch.length && !parseCanvasClarification(agentResponse)) {
          throw new Error("Agent 未返回可执行的画布补丁");
        }

        if (patch.length) {
          pushHistory();
          _applyPatch(patch);
        }
        // Return agentResponse so callers can access top-level fields (thought, message, patches)
        return agentResponse;
      } catch (error) {
        updateApiDebugStatus("agentPlanner", {
          status: "error",
          message: error?.message || "POST /api/agent/invoke failed",
        });
        pushApiDebugDetail("agentPlanner", {
          type: "error",
          path: "/api/agent/invoke",
          message: error?.message || String(error || ""),
        });
        throw error;
      }
    },
    [activeArtifact, canvasId, _applyPatch, pushApiDebugDetail, pushHistory, runAgentConversation, updateApiDebugStatus],
  );

  const toValueArray = useCallback((value) => {
    if (Array.isArray(value)) {
      return value.map((item) => String(item || "").trim()).filter(Boolean);
    }
    const text = String(value || "").trim();
    if (!text) return [];
    return [text];
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
              String(response?.message || response?.summary || response?.thought || "").trim(),
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
                message: String(response?.message || response?.summary || response?.thought || "").trim(),
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

      // If there is an unconfirmed script extraction, treat the message as an edit instruction.
      const pendingExtractionTurn = agentTurns
        .filter((t) => t?.intent === "SCRIPT_EXTRACTION" && t?.status === "done" && !t?.extractionConfirmed && !t?.superseded)
        .at(-1);
      if (pendingExtractionTurn) {
        updateAgentTurn(pendingExtractionTurn.id, { superseded: true });
        const editTurnId = appendAgentTurn({
          userText: missionText,
          status: "running",
          assistantText: "",
          routeDebug: buildRouteDebug({ intent: "SCRIPT_EXTRACTION", reason: "script_edit_from_message", product: "" }, true),
          uploadedDocuments,
        });
        try {
          const editResponse = await runAgentConversation(missionText, { intent: "SCRIPT_EXTRACTION", reason: "script_edit_from_message", product: "" }, {
            forceAction: "shot_workflow.extract",
            canvasNodeHints: {
              existing_extraction: { ...pendingExtractionTurn.response, source_text: pendingExtractionTurn.response?.source_text || "" },
              edit_instruction: missionText,
            },
          });
          const editResponseText = String(editResponse?.message || "").trim();
          const editRouteDebug = buildRouteDebug({ intent: "SCRIPT_EXTRACTION", reason: "script_edit_from_message", product: "" }, true, editResponse);
          if (editResponse?.intent === "tool_call" && editResponse?.tool_result?.kind === "script_extraction") {
            updateAgentTurn(editTurnId, {
              status: "done",
              assistantText: editResponseText || "已根据您的要求更新了剧本解析结果，如有调整需求可以随时告诉我，如满意，将继续为您生成主体图及场景图。",
              routeDebug: editRouteDebug,
              response: editResponse.tool_result,
              intent: "SCRIPT_EXTRACTION",
              intentReason: editRouteDebug.reason,
            });
          } else {
            updateAgentTurn(editTurnId, {
              status: "assistant",
              assistantText: editResponseText || "已处理您的修改请求。",
              routeDebug: editRouteDebug,
            });
          }
        } catch (editError) {
          updateAgentTurn(editTurnId, { status: "error", assistantText: editError?.message || "修改失败，请稍后重试。" });
        }
        return;
      }

      const isShotWorkflowMission = looksLikeShotWorkflowScriptText(missionText, uploadedDocuments);
      const route = isShotWorkflowMission
        ? {
            intent: "SHOT_WORKFLOW",
            reason: "frontend_shot_workflow_script_detected",
            product: "",
          }
        : {
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
            ...(isShotWorkflowMission ? { forceAction: "shot_workflow_design" } : {}),
          },
        );
        const responseText = String(response?.message || "").trim();
        const routeDebug = buildRouteDebug(
          {
            ...route,
            reason: `agent_v2:${route.reason || "message"}`,
          },
          true,
          response,
        );

        if (response?.intent === "canvas_plan") {
          const plannerResult = response.tool_result || {};
          const patch = Array.isArray(response?.patches) ? response.patches : [];
          const clarification = parseCanvasClarification(response);
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
            assistantText: String(response?.message || plannerResult?.summary || plannerResult?.thought || responseText).trim(),
            showCancelPending: !!clarification,
            routeDebug,
            response: plannerResult,
            intent: "CANVAS",
            intentReason: routeDebug.reason,
          });
          if (clarification) {
            setRunToast({
              message: String(response?.message || plannerResult?.summary || plannerResult?.thought || responseText).trim(),
              type: "info",
            });
          }
          return;
        }

        if (
          response?.intent === "tool_call" &&
          response?.tool_result?.kind === "script_extraction"
        ) {
          updateAgentTurn(pendingTurnId, {
            status: "done",
            assistantText: responseText || String(response?.tool_result?.summary || "已从剧本中提取分镜信息，请确认后继续搭建工作流。").trim(),
            routeDebug,
            response: response.tool_result,
            intent: "SCRIPT_EXTRACTION",
            intentReason: routeDebug.reason,
          });
          return;
        }

        if (
          response?.intent === "tool_call" &&
          response?.tool_result?.kind === "shot_workflow" &&
          Array.isArray(response?.patches)
        ) {
          const patch = response.patches;
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
            assistantText: responseText || String(response?.tool_result?.summary || "已搭建分镜出图工作流。").trim(),
            routeDebug,
            response: response.tool_result,
            intent: "SHOT_WORKFLOW",
            intentReason: routeDebug.reason,
            stepIndex: SHOT_WORKFLOW_RUN_STEPS.length - 1,
          });
          return;
        }

        if (response?.intent === "tool_call" && response?.async_task?.task_id) {
          const storyboardTaskId = String(response.async_task.task_id);
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
            const rawPatch = Array.isArray(taskResult?.patch) ? taskResult.patch : [];
            const patch = enhanceStoryboardPatchWithProductionWorkflow(rawPatch, {
              sourceText: missionText,
              sourceTitle: uploadedDocuments.length ? uploadedDocuments.map((item) => item.name).filter(Boolean).join("，") : "对话输入剧本",
              createSourceNode: true,
            });
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
              stepIndex: STORYBOARD_RUN_STEPS.length - 1,
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



        const genericToolText = String(
          response?.tool_result?.summary ||
            response?.tool_result?.text ||
            response?.tool_result?.answer ||
            response?.summary ||
            ""
        ).trim();
        updateAgentTurn(pendingTurnId, {
          status: response?.intent === "clarify" ? "clarify" : "assistant",
          assistantText: responseText || genericToolText || "任务已处理。",
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
      agentTurns,
      appendAssistantTurn,
      appendAgentTurn,
      clearPendingTaskForActiveSession,
      runAgentConversation,
      apiFetch,
      runCanvasPlanMission,
      setPendingTaskForActiveSession,
      updateAgentTurn,
      updateActiveAgentSession,
      upsertCanvasDraftSnapshot,
    ],
  );

  // After extraction confirmed: show the asset gen ask card (client-side, no backend call)
  const confirmScriptExtraction = useCallback(
    (extractionData) => {
      appendAgentTurn({
        userText: "",
        assistantText: "已确认剧本提取内容，接下来是否要生成角色与场景的参考设定图？",
        status: "done",
        intent: "ASSET_GEN_CONFIRM",
        response: extractionData,
        routeDebug: buildRouteDebug({ intent: "ASSET_GEN_CONFIRM", reason: "script_extraction_confirmed", product: "" }, false),
      });
    },
    [appendAgentTurn],
  );

  // Build asset canvas groups
  const buildAssetCanvas = useCallback(
    async (extractionData) => {
      const pendingTurnId = appendAgentTurn({
        userText: "生成角色与场景参考设定图",
        status: "running",
        assistantText: "",
        routeDebug: buildRouteDebug({ intent: "ASSET_CANVAS_BUILT", reason: "asset_gen_confirmed", product: "" }, true),
        uploadedDocuments: [],
      });
      try {
        const response = await runAgentConversation(
          "生成角色与场景参考设定图",
          { intent: "ASSET_CANVAS_BUILT", reason: "asset_gen_confirmed", product: "" },
          { forceAction: "shot_workflow.build_asset_canvas", canvasNodeHints: { confirmed_extraction: extractionData } },
        );
        const responseText = String(response?.message || "").trim();
        const routeDebug = buildRouteDebug({ intent: "ASSET_CANVAS_BUILT", reason: "asset_gen_confirmed" }, true, response);
        const patch = Array.isArray(response?.patches) ? response.patches : [];
        if (patch.length) {
          pushHistory();
          const patchResult = _applyPatch(patch);
          if (patchResult?.nodes && patchResult?.connections) {
            upsertCanvasDraftSnapshot({ nodes: patchResult.nodes, connections: patchResult.connections, viewport: patchResult.viewport || viewportRef.current });
          }
        }
        updateAgentTurn(pendingTurnId, {
          status: "done",
          assistantText: responseText || String(response?.tool_result?.summary || "已在画布上创建参考设定图组。").trim(),
          routeDebug,
          response: response?.tool_result || {},
          intent: "ASSET_CANVAS_BUILT",
          intentReason: routeDebug.reason,
          extractionData: extractionData,
        });
      } catch (error) {
        updateAgentTurn(pendingTurnId, {
          status: "error",
          error: error?.message || "请求失败，请稍后重试。",
          routeDebug: buildRouteDebug({ intent: "ASSET_CANVAS_BUILT", reason: "asset_canvas_error" }, true),
        });
      }
    },
    [appendAgentTurn, runAgentConversation, updateAgentTurn, upsertCanvasDraftSnapshot, _applyPatch, pushHistory],
  );

  // Skip asset gen, go straight to shot workflow
  const skipToShotWorkflow = useCallback(
    async (extractionData) => {
      const sourceText = String(extractionData?.source_text || "").trim();
      const pendingTurnId = appendAgentTurn({
        userText: "跳过设定图，直接搭建出图工作流",
        status: "running",
        assistantText: "",
        routeDebug: buildRouteDebug({ intent: "SHOT_WORKFLOW", reason: "asset_gen_skipped", product: "" }, true),
        uploadedDocuments: [],
      });
      try {
        const response = await runAgentConversation(
          sourceText,
          { intent: "SHOT_WORKFLOW", reason: "asset_gen_skipped", product: "" },
          { forceAction: "shot_workflow.compose", canvasNodeHints: { confirmed_extraction: extractionData } },
        );
        const responseText = String(response?.message || "").trim();
        const routeDebug = buildRouteDebug({ intent: "SHOT_WORKFLOW", reason: "asset_gen_skipped" }, true, response);
        if (response?.intent === "tool_call" && response?.tool_result?.kind === "shot_workflow" && Array.isArray(response?.patches)) {
          const patch = response.patches;
          if (patch.length) {
            pushHistory();
            const patchResult = _applyPatch(patch);
            if (patchResult?.nodes && patchResult?.connections) {
              upsertCanvasDraftSnapshot({ nodes: patchResult.nodes, connections: patchResult.connections, viewport: patchResult.viewport || viewportRef.current });
            }
          }
          updateAgentTurn(pendingTurnId, {
            status: "done",
            assistantText: responseText || String(response?.tool_result?.summary || "已搭建分镜出图工作流。").trim(),
            routeDebug,
            response: response.tool_result,
            intent: "SHOT_WORKFLOW",
            intentReason: routeDebug.reason,
            stepIndex: SHOT_WORKFLOW_RUN_STEPS.length - 1,
          });
        } else {
          updateAgentTurn(pendingTurnId, { status: "done", assistantText: responseText || "已处理。", routeDebug });
        }
      } catch (error) {
        updateAgentTurn(pendingTurnId, {
          status: "error",
          error: error?.message || "请求失败，请稍后重试。",
          routeDebug: buildRouteDebug({ intent: "SHOT_WORKFLOW", reason: "skip_asset_gen_error" }, true),
        });
      }
    },
    [appendAgentTurn, runAgentConversation, updateAgentTurn, upsertCanvasDraftSnapshot, _applyPatch, pushHistory],
  );

  const buildDirectVideoCanvas = useCallback(
    async (extractionData) => {
      const sourceText = String(extractionData?.source_text || "").trim();
      const pendingTurnId = appendAgentTurn({
        userText: "直接参考主体和场景生成视频",
        status: "running",
        assistantText: "",
        routeDebug: buildRouteDebug({ intent: "VIDEO_CANVAS_BUILT", reason: "direct_video_chosen", product: "" }, true),
        uploadedDocuments: [],
      });
      try {
        const response = await runAgentConversation(
          sourceText,
          { intent: "VIDEO_CANVAS_BUILT", reason: "direct_video_chosen", product: "" },
          { forceAction: "shot_workflow.build_video_canvas", canvasNodeHints: { confirmed_extraction: extractionData } },
        );
        const responseText = String(response?.message || "").trim();
        const routeDebug = buildRouteDebug({ intent: "VIDEO_CANVAS_BUILT", reason: "direct_video_chosen" }, true, response);
        const patch = Array.isArray(response?.patches) ? response.patches : [];
        if (patch.length) {
          pushHistory();
          const patchResult = _applyPatch(patch);
          if (patchResult?.nodes && patchResult?.connections) {
            upsertCanvasDraftSnapshot({ nodes: patchResult.nodes, connections: patchResult.connections, viewport: patchResult.viewport || viewportRef.current });
          }
        }
        updateAgentTurn(pendingTurnId, {
          status: "done",
          assistantText: responseText || String(response?.tool_result?.summary || "已搭建图生视频工作流。").trim(),
          routeDebug,
          response: response?.tool_result || {},
          intent: "VIDEO_CANVAS_BUILT",
          intentReason: routeDebug.reason,
        });
      } catch (error) {
        updateAgentTurn(pendingTurnId, {
          status: "error",
          error: error?.message || "请求失败，请稍后重试。",
          routeDebug: buildRouteDebug({ intent: "VIDEO_CANVAS_BUILT", reason: "direct_video_error" }, true),
        });
      }
    },
    [appendAgentTurn, runAgentConversation, updateAgentTurn, upsertCanvasDraftSnapshot, _applyPatch, pushHistory],
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
      ? "请为这份分镜头脚本搭建每个镜头的出图工作流"
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
        setRunToast({ message: `暂不支持上传 ${file.name}，请使用 csv/tsv/txt/md/docx 或图片`, type: "error" });
        continue;
      }
      if (Number(file.size || 0) > AGENT_DOCUMENT_MAX_BYTES) {
        setRunToast({ message: `${file.name} 超过 5MB，先精简脚本表再上传`, type: "error" });
        continue;
      }
      try {
        const textContent = await readAgentDocumentText(file);
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
          mimeType: getAgentDocumentMimeType(file),
          textContent,
        });
      } catch (error) {
        setRunToast({ message: error?.message || `${file.name} 读取失败`, type: "error" });
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
      if (actionId === "shot_workflow") {
        setActiveComposerActionId((prev) => (prev === "shot_workflow" ? "" : "shot_workflow"));
        setShowCanvasExamples(false);
        setAgentInput((prev) => (String(prev || "").trim() ? prev : AGENT_SHOT_WORKFLOW_QUICK_PROMPT));
        setAgentInputFocused(true);
        agentInputRef.current?.focus();
        return;
      }
      if (actionId === "canvas") {
        const shouldClose = activeComposerActionId === "canvas" || showCanvasExamples;
        setActiveComposerActionId((prev) => (prev === "canvas" ? "" : "canvas"));
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
      }
    },
    [
      activeComposerActionId,
      appendAssistantTurn,
      clearPendingTaskForActiveSession,
      showCanvasExamples,
    ],
  );

  const insertCanvasPromptExample = useCallback((text) => {
    const nextText = String(text || "").trim();
    if (!nextText) return;
    setAgentInput(nextText);
    setAgentInputFocused(true);
    agentInputRef.current?.focus();
  }, []);

  const handleCanvasExamplePick = useCallback((text) => {
    const nextText = String(text || "").trim();
    if (!nextText) return;
    setActiveComposerActionId("canvas");
    setShowCanvasExamples(false);
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
    updateActiveAgentSession((session) => ({
      ...session,
      turns: (session.turns || []).map((item) =>
        item.id === turnId
          ? { ...item, status: "running", error: "", stepIndex: 0 }
          : item,
      ),
    }));
    void sendAgentMissionFromText(turn.userText || "", {
      uploadedDocuments: Array.isArray(turn.uploadedDocuments) ? turn.uploadedDocuments : [],
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

  // updateNodeData 由 useCanvas() → useCanvasStore 提供（O(1) Immer mutate，Phase 1 迁移）

  const runStoryboardInputFromFiles = useCallback(
    async (nodeId, files) => {
      const sourceNode = nodesRef.current.find((node) => node.id === nodeId);
      const fileList = Array.from(files || []).filter(Boolean);
      if (!sourceNode || !fileList.length) return;

      const documents = [];
      const rejectedNames = [];
      updateNodeData(nodeId, {
        status: "running",
        error: "",
        summary: "",
        progressLabel: "正在读取剧本文件",
        scriptFileName: fileList.map((file) => file.name).filter(Boolean).join("，"),
      });

      try {
        for (const file of fileList) {
          if (!isAgentComposerDocumentFile(file)) {
            rejectedNames.push(file.name || "未知文件");
            continue;
          }
          if (Number(file.size || 0) > AGENT_DOCUMENT_MAX_BYTES) {
            throw new Error(`${file.name} 超过 5MB，先精简剧本文件再上传`);
          }
          const textContent = await readAgentDocumentText(file);
          if (!textContent) {
            rejectedNames.push(file.name || "空文件");
            continue;
          }
          documents.push({
            name: file.name || "storyboard-script.txt",
            mime_type: getAgentDocumentMimeType(file),
            kind: "storyboard_script_table",
            text_content: textContent,
          });
        }

        if (!documents.length) {
          throw new Error(rejectedNames.length ? `未读取到可用剧本文件：${rejectedNames.join("，")}` : "未读取到可用剧本文件");
        }

        updateNodeData(nodeId, { progressLabel: "正在提交故事板设计任务" });
        const currentNodes = nodesRef.current || [];
        const storyboardCount = currentNodes.filter((node) => node?.type === NODE_TYPES.STORYBOARD_PLAN).length;
        const response = await sendAgentMessage(
          {
            message: `请将拖入的剧本文件生成可编辑故事板：${documents.map((item) => item.name).join("，")}`,
            currentNodes: cloneDeep(currentNodes),
            currentConnections: cloneDeep(connectionsRef.current || []),
            canvasId,
            threadId: canvasId,
            uploadedDocuments: documents,
            canvasNodeHints: { storyboard_count: storyboardCount },
          },
          apiFetch,
          { intent: "STORYBOARD", product: "", sessionId: activeAgentSession?.id || "" },
        );

        if (!(response?.intent === "tool_call" && response?.async_task?.task_id)) {
          throw new Error(String(response?.message || response?.error || "Agent 未返回故事板任务"));
        }

        updateNodeData(nodeId, { progressLabel: "AI 正在拆解场景和镜头" });
        const taskResult = await pollStoryboardTask(String(response.async_task.task_id), apiFetch, (status) => {
          if (status === "running") {
            updateNodeData(nodeId, { progressLabel: "故事板设计中，正在组织镜头节奏" });
          }
        });

        const rawPatch = Array.isArray(taskResult?.patch) ? taskResult.patch : [];
        if (!rawPatch.length) {
          throw new Error("故事板任务完成但没有返回画布节点");
        }

        const storyboardOp = rawPatch.find((op) => op?.op === "add_node" && op?.node?.type === NODE_TYPES.STORYBOARD_PLAN);
        const targetX = Number(sourceNode.x || 0) + 440;
        const targetY = Number(sourceNode.y || 0);
        const dx = storyboardOp?.node ? targetX - Number(storyboardOp.node.x || 0) : 0;
        const dy = storyboardOp?.node ? targetY - Number(storyboardOp.node.y || 0) : 0;
        const storyboardNodeIds = [];
        const positionedPatch = rawPatch.map((op) => {
          if (op?.op !== "add_node" || !op?.node) return op;
          const nextNode = {
            ...op.node,
            x: Number(op.node.x || 0) + dx,
            y: Number(op.node.y || 0) + dy,
          };
          if (nextNode.type === NODE_TYPES.STORYBOARD_PLAN) {
            storyboardNodeIds.push(String(nextNode.id || "").trim());
            nextNode.data = {
              ...(nextNode.data || {}),
              source_storyboard_input_node_id: nodeId,
            };
          }
          return { ...op, node: nextNode };
        });

        const firstStoryboardNodeId = storyboardNodeIds.find(Boolean) || "";
        const workflowPatch = enhanceStoryboardPatchWithProductionWorkflow(positionedPatch, {
          sourceNodeId: nodeId,
          createSourceNode: false,
        });

        pushHistory();
        const patchResult = _applyPatch(workflowPatch);
        if (patchResult?.nodes && patchResult?.connections) {
          upsertCanvasDraftSnapshot({
            nodes: patchResult.nodes,
            connections: patchResult.connections,
            viewport: patchResult.viewport || viewportRef.current,
          });
        }

        updateNodeData(nodeId, {
          status: "success",
          error: "",
          progressLabel: "",
          summary: String(taskResult?.summary || "已生成可编辑故事板").trim(),
          generatedStoryboardNodeIds: storyboardNodeIds,
        });
        setRunToast({ message: String(taskResult?.summary || "故事板已生成").trim(), type: "info" });
        window.setTimeout(() => setRunToast(null), 2200);
        if (firstStoryboardNodeId) {
          window.setTimeout(() => focusCanvasNode(firstStoryboardNodeId), 80);
        }
      } catch (error) {
        updateNodeData(nodeId, {
          status: "error",
          error: error?.message || String(error || "故事板生成失败"),
          progressLabel: "",
        });
        setRunToast({ message: error?.message || "故事板生成失败", type: "error" });
      }
    },
    [
      _applyPatch,
      activeAgentSession?.id,
      apiFetch,
      canvasId,
      connectionsRef,
      focusCanvasNode,
      nodesRef,
      pushHistory,
      setRunToast,
      updateNodeData,
      upsertCanvasDraftSnapshot,
      viewportRef,
    ],
  );

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
                          onClick={() => void sendAgentMissionFromText(AGENT_SHOT_WORKFLOW_QUICK_PROMPT)}
                          className="rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] text-slate-600 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 transition-colors"
                        >
                          发送剧本工作流示例
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
                              ) : turn?.intent === "SCRIPT_EXTRACTION" ? (
                                <div className="space-y-2">
                                  <div className="text-slate-600">{turn.assistantText || "已从剧本中提取分镜信息，请确认后继续。"}</div>
                                  <ScriptExtractionCard
                                    data={turn.response}
                                    confirmed={Boolean(turn.extractionConfirmed)}
                                    superseded={Boolean(turn.superseded)}
                                    onConfirm={() => {
                                      updateAgentTurn(turn.id, { extractionConfirmed: true });
                                      confirmScriptExtraction(turn.response);
                                    }}
                                  />
                                </div>
                              ) : turn?.intent === "ASSET_GEN_CONFIRM" ? (
                                <div className="space-y-2">
                                  <div className="text-slate-600">{turn.assistantText || "是否要生成角色与场景参考设定图？"}</div>
                                  <AssetGenConfirmCard
                                    data={turn.response}
                                    confirmed={Boolean(turn.assetGenConfirmed)}
                                    onConfirm={() => {
                                      updateAgentTurn(turn.id, { assetGenConfirmed: true });
                                      buildAssetCanvas(turn.response);
                                    }}
                                    onSkip={() => {
                                      updateAgentTurn(turn.id, { assetGenConfirmed: true });
                                      skipToShotWorkflow(turn.response);
                                    }}
                                  />
                                </div>
                              ) : turn?.intent === "ASSET_CANVAS_BUILT" ? (
                                <div className="space-y-2">
                                  <div className="text-slate-600">{turn.assistantText || turn.response?.summary || "已在画布上创建参考设定图组。"}</div>
                                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] text-slate-500">
                                    已创建 {turn.response?.char_count || 0} 个角色/道具组和 {turn.response?.scene_count || 0} 个场景组，点击运行即可生成参考图。
                                  </div>
                                  {Array.isArray(turn.response?.next_choices) && turn.response.next_choices.length > 0 && (
                                    <div className="space-y-1.5 pt-1">
                                      <div className="text-[11px] text-slate-500">接下来以哪种方式生成？</div>
                                      <div className="flex flex-wrap gap-2">
                                        {turn.response.next_choices.map((choice) => (
                                          <button
                                            key={choice.id}
                                            type="button"
                                            disabled={Boolean(turn.workflowChoiceSelected)}
                                            onClick={() => {
                                              updateAgentTurn(turn.id, { workflowChoiceSelected: choice.id });
                                              if (choice.id === "direct_video") {
                                                buildDirectVideoCanvas(turn.extractionData || turn.response);
                                              }
                                              // storyboard_first: TODO
                                            }}
                                            className={`rounded-full border px-3 py-1.5 text-[11px] transition-colors ${
                                              turn.workflowChoiceSelected === choice.id
                                                ? "border-blue-400 bg-blue-50 text-blue-700"
                                                : turn.workflowChoiceSelected
                                                ? "border-slate-200 bg-white text-slate-400 cursor-not-allowed opacity-50"
                                                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 cursor-pointer"
                                            }`}
                                          >
                                            {choice.label}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ) : turn?.intent === "VIDEO_CANVAS_BUILT" ? (
                                <div className="space-y-2">
                                  <div className="text-slate-600">{turn.assistantText || turn.response?.summary || "已搭建图生视频工作流。"}</div>
                                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] text-slate-500">
                                    已为 {(turn.response?.shots || []).length} 个镜头搭建图生视频节点，点击运行即可生成视频。
                                  </div>
                                </div>
                              ) : turn?.intent === "SHOT_WORKFLOW" ? (
                                <div className="space-y-2">
                                  <div className="text-slate-600">{turn.assistantText || turn.response?.summary || "已搭建分镜出图工作流。"}</div>
                                  {turn.response?.annotated_script ? (
                                    <ShotAnnotatedScriptBlock script={turn.response.annotated_script} />
                                  ) : null}
                                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] text-slate-500">
                                    已为 {(turn.response?.shots || []).length} 个分镜搭建出图节点，资产已自动绑定。
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  <div className="text-slate-600">{turn.assistantText || turn.response?.summary || "任务已处理。"}</div>
                                </div>
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
                                ) : turn?.intent !== "SCRIPT_EXTRACTION" && turn?.intent !== "ASSET_GEN_CONFIRM" && turn?.intent !== "ASSET_CANVAS_BUILT" && turn?.intent !== "VIDEO_CANVAS_BUILT" && turn?.intent !== "SHOT_WORKFLOW" ? (
                                  <button
                                    type="button"
                                    onClick={() => focusAgentResultCard(turn.id)}
                                    className="rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] text-slate-600 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 transition-colors"
                                  >
                                    {relatedCard?.minimized ? "恢复结果卡片" : "定位结果卡片"}
                                  </button>
                                ) : null}
                                {turn?.intent !== "STORYBOARD" && turn?.intent !== "SCRIPT_EXTRACTION" && turn?.intent !== "ASSET_GEN_CONFIRM" && turn?.intent !== "ASSET_CANVAS_BUILT" && turn?.intent !== "VIDEO_CANVAS_BUILT" && turn?.intent !== "SHOT_WORKFLOW" && relatedCard && !relatedCard.minimized && (
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

      {/* Asset Library — Phase 3: extracted to WorkbenchAssetLibrary */}
      {showAssetLibrary ? (
        <WorkbenchAssetLibrary
          show={showAssetLibrary}
          onClose={() => setShowAssetLibrary(false)}
          tab={assetLibraryTab}
          setTab={setAssetLibraryTab}
          drafts={assetLibraryDrafts}
          works={assetLibraryWorks}
          assets={assetLibraryAssets}
          personas={assetLibraryPersonas}
          versionsByWorkId={assetLibraryVersionsByWorkId}
          activeCanvasDraft={activeCanvasDraft}
          detailWork={assetLibraryDetailWork}
          detailPersona={assetLibraryDetailPersona}
          detailSnapshot={assetLibraryDetailSnapshot}
          detailDigest={assetLibraryDetailDigest}
          detailAssets={assetLibraryDetailAssets}
          setDetailWorkId={setAssetLibraryDetailWorkId}
          setDetailPersonaId={setAssetLibraryDetailPersonaId}
          editingTitleId={editingAssetWorkTitleId}
          editingTitleDraft={editingAssetWorkTitleDraft}
          setEditingTitleDraft={setEditingAssetWorkTitleDraft}
          beginEditTitle={beginEditAssetWorkTitle}
          cancelEditTitle={cancelEditAssetWorkTitle}
          commitEditTitle={commitEditAssetWorkTitle}
          expandedWorkIds={expandedAssetWorkIds}
          setExpandedWorkIds={setExpandedAssetWorkIds}
          pickerMode={assetLibraryPickerMode}
          setPickerMode={setAssetLibraryPickerMode}
          personaImageInputRef={assetLibraryPersonaImageInputRef}
          onRestoreSnapshot={restoreSnapshotToCanvas}
          onRestoreAsset={restoreAssetToCanvas}
          onSave={saveCurrentCanvasAsWork}
          onSaveNew={saveCurrentCanvasAsNewWork}
          createPersona={createAssetLibraryPersona}
          updatePersona={updateAssetLibraryPersona}
          removePersona={removeAssetLibraryPersona}
          onPersonaReferenceUpload={handleAssetLibraryPersonaReferenceUpload}
          removeItem={removeAssetLibraryItem}
          onAddPersonaToCanvas={createPersonaInputNodeAt}
        />
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
        {/* Sidebar — Phase 4: extracted to WorkbenchSidebar */}
        <WorkbenchSidebar
          hoveredSidebarPreview={hoveredSidebarPreview}
          setHoveredSidebarPreview={setHoveredSidebarPreview}
          setHoveredSidebarItemKey={setHoveredSidebarItemKey}
          sidebarNodeInputMenu={sidebarNodeInputMenu}
          setSidebarNodeInputMenu={setSidebarNodeInputMenu}
          sidebarWorkflowMenu={sidebarWorkflowMenu}
          setSidebarWorkflowMenu={setSidebarWorkflowMenu}
          sidebarImageCreateMenu={sidebarImageCreateMenu}
          setSidebarImageCreateMenu={setSidebarImageCreateMenu}
          activeSidebarItemKey={activeSidebarItemKey}
          setActiveSidebarItemKey={setActiveSidebarItemKey}
          showSidebarUploadMenu={showSidebarUploadMenu}
          setShowSidebarUploadMenu={setShowSidebarUploadMenu}
          sidebarVideoCreateMenu={sidebarVideoCreateMenu}
          setSidebarVideoCreateMenu={setSidebarVideoCreateMenu}
          sidebarUploadMenuRef={sidebarUploadMenuRef}
          sidebarUploadMenuCloseTimerRef={sidebarUploadMenuCloseTimerRef}
          sidebarNodeInputMenuCloseTimerRef={sidebarNodeInputMenuCloseTimerRef}
          sidebarImageCreateMenuCloseTimerRef={sidebarImageCreateMenuCloseTimerRef}
          sidebarVideoCreateMenuCloseTimerRef={sidebarVideoCreateMenuCloseTimerRef}
          sidebarWorkflowMenuCloseTimerRef={sidebarWorkflowMenuCloseTimerRef}
          sidebarImageUploadInputRef={sidebarImageUploadInputRef}
          sidebarVideoUploadInputRef={sidebarVideoUploadInputRef}
          leftSidebarWidth={leftSidebarWidth}
          workspaceShellRef={workspaceShellRef}
          memberLabel={memberLabel}
          memberAvatar={memberAvatar}
          memberPoint={memberPoint}
          memberTotalPoint={memberTotalPoint}
          memberInfoLoginUrl={memberInfoLoginUrl}
          userAuthsLoading={userAuthsLoading}
          isAdminUser={isAdminUser}
          navigateToMemberLogin={navigateToMemberLogin}
          setShowAssetLibrary={setShowAssetLibrary}
          setAssetLibraryPickerMode={setAssetLibraryPickerMode}
          setAssetLibraryTab={setAssetLibraryTab}
          setAssetLibraryDetailWorkId={setAssetLibraryDetailWorkId}
          navigate={navigate}
          defaultVideoModelId={defaultVideoModelId}
          onAddNode={addNode}
          onNavigate={handleAnchorActionClick}
          safeInvoke={safeInvoke}
          createText2ImgTemplate={createText2ImgTemplate}
          createImg2ImgTemplate={createImg2ImgTemplate}
          createMultiImg2ImgTemplate={createMultiImg2ImgTemplate}
          createImg2VideoTemplate={createImg2VideoTemplate}
          createText2VideoTemplate={createText2VideoTemplate}
          createOmniReferenceVideoTemplate={createOmniReferenceVideoTemplate}
        />

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

	          {/* Controls — Phase 3: extracted to WorkbenchRunBar */}
          <WorkbenchRunBar
            onSave={saveCurrentCanvasAsWork}
            onSaveNew={saveCurrentCanvasAsNewWork}
            onShowAssets={() => setShowAssetLibrary(true)}
            onArrange={arrangeCanvasNodes}
            zoomCanvas={zoomCanvas}
          />

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

	            {[...nodes].sort((a, b) =>
              a.type === "group_container" ? -1 : b.type === "group_container" ? 1 : 0
            ).map((n) => (
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
                connectedInputNodes={connectedInputsByNodeId.get(n.id) || []}
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
                onStoryboardScriptFiles={runStoryboardInputFromFiles}
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


          {/* AgentComposer — Phase 4: extracted to WorkbenchAgentComposer */}
          <WorkbenchAgentComposer
            agentComposerRef={agentComposerRef}
            agentInputRef={agentInputRef}
            agentUploadInputRef={agentUploadInputRef}
            agentInput={agentInput}
            setAgentInput={setAgentInput}
            agentInputFocused={agentInputFocused}
            setAgentInputFocused={setAgentInputFocused}
            agentPromptPolishLoading={agentPromptPolishLoading}
            agentPromptPolishError={agentPromptPolishError}
            setAgentPromptPolishError={setAgentPromptPolishError}
            agentComposerFiles={agentComposerFiles}
            activeComposerActionId={activeComposerActionId}
            showCanvasExamples={showCanvasExamples}
            setShowCanvasExamples={setShowCanvasExamples}
            isAgentMissionRunning={isAgentMissionRunning}
            isCanvasPromptPending={isCanvasPromptPending}
            preferenceNotice={preferenceNotice}
            setPreferenceNotice={setPreferenceNotice}
            agentDevMode={agentDevMode}
            setAgentDevMode={setAgentDevMode}
            activePendingTask={activePendingTask}
            selectedStoryboardTarget={selectedStoryboardTarget}
            hitlFeedbackRows={hitlFeedbackRows}
            devSuggestionLog={devSuggestionLog}
            devRegressionLog={devRegressionLog}
            personaMentionOptions={personaMentionOptions}
            isAdminUser={isAdminUser}
            setActiveArtifact={setActiveArtifact}
            sendAgentMission={sendAgentMission}
            polishAgentPromptInput={polishAgentPromptInput}
            handleAgentComposerUpload={handleAgentComposerUpload}
            removeAgentComposerFile={removeAgentComposerFile}
            handleAgentQuickAction={handleAgentQuickAction}
            insertCanvasPromptExample={insertCanvasPromptExample}
            handleCanvasExamplePick={handleCanvasExamplePick}
            handleSuggestionEdit={handleSuggestionEdit}
            openPreferencesPanelWithSuggestion={openPreferencesPanelWithSuggestion}
          />
        </div>{/* end canvas div (canvasRef) */}

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

      {/* History Panel — Phase 3: extracted to WorkbenchHistoryPanel */}
      <WorkbenchHistoryPanel
        show={showHistoryPanel}
        onClose={() => setShowHistoryPanel(false)}
        activeTab={activeHistoryTab}
        setActiveTab={setActiveHistoryTab}
        history={apiHistory}
        expandedIds={expandedHistoryIds}
        setExpandedIds={setExpandedHistoryIds}
        stats={apiStats}
        normalizeOutputs={normalizeHistoryOutputs}
        normalizeInputs={normalizeHistoryInputs}
        formatParams={formatHistoryParams}
        onPreview={setPreviewImage}
        onReuse={applyHistoryConfig}
      />

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
            onQuickExample={insertCanvasPromptExample}
            onPreferenceSaved={handlePreferenceSavedFromPanel}
            prefill={preferencesPanelPrefill}
          />
        </React.Suspense>
      )}

      {/* RegressionDialog — Phase 3: extracted to WorkbenchRegressionDialog */}
      <WorkbenchRegressionDialog
        show={HITL_FEEDBACK_UI_ENABLED && !!feedbackDialog}
        dialog={feedbackDialog}
        reasonChoice={feedbackReasonChoice}
        setReasonChoice={setFeedbackReasonChoice}
        reasonNote={feedbackReasonNote}
        setReasonNote={setFeedbackReasonNote}
        saving={!!savingFeedbackTargetId}
        onClose={closeRegressionFeedbackDialog}
        onConfirm={confirmRegressionFeedbackDialog}
        reasonOptions={HITL_FEEDBACK_REASON_OPTIONS}
      />



      {/* StoryboardAssetCard — Phase 3: extracted to WorkbenchStoryboardAssetCard */}
      <WorkbenchStoryboardAssetCard
        card={hoveredStoryboardAssetCard}
        closeTimerRef={storyboardAssetHoverCloseTimerRef}
        onScheduleClose={scheduleCloseStoryboardAssetHoverCard}
        setCard={setHoveredStoryboardAssetCard}
        onUpdateStatus={updateStoryboardAssetStatus}
        onGenerate={runStoryboardAssetDirectGeneration}
        onPreview={setPreviewImage}
      />

      {/* StoryboardShotCard — Phase 3: extracted to WorkbenchStoryboardShotCard */}
      <WorkbenchStoryboardShotCard
        card={hoveredStoryboardShotCard}
        closeTimerRef={storyboardShotHoverCloseTimerRef}
        onScheduleClose={scheduleCloseStoryboardShotHoverCard}
        onUpdateStatus={updateStoryboardAssetStatus}
        onGenerate={runStoryboardShotGeneration}
        onPreview={setPreviewImage}
      />

      {/* ImagePreview — Phase 3: extracted to WorkbenchImagePreview */}
      <WorkbenchImagePreview url={previewImage} onClose={() => setPreviewImage(null)} />
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
