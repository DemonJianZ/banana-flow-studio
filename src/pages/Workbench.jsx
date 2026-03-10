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
  Hand,
  ShoppingBag,
  CheckSquare,
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
  Keyboard,
  Clipboard,
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
  extractProductKeyword,
  exportIdeaScriptFfmpegBundle,
  generateIdeaScriptMission,
  generateIdeaScriptVideo,
} from "../api/agentCanvas";
import {
  listPreferences as listMemoryPreferences,
  setPreference as setMemoryPreference,
} from "../api/memoryPreferences";
import { harvestEvalCase } from "../api/qualityFeedback";
import { detectIntent } from "../agent/router";
import { detectPreferenceSuggestions } from "../agent/preferenceSuggestion";
import { buildHitlFeedbackRows } from "../agent/hitlFeedbackHistory";

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
    const sessions = parsed.sessions.map((session) => ({
      ...session,
      turns: Array.isArray(session?.turns) ? session.turns : [],
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

const NODE_TYPES = {
  INPUT: "input",
  TEXT_INPUT: "text_input",
  PROCESSOR: "processor",
  POST_PROCESSOR: "post_processor",
  VIDEO_GEN: "video_gen",
  OUTPUT: "output",
};

const AI_MODELS = [
  { id: "gemini-3-pro-image-preview", name: "Gemini 3 Pro", vendor: "Google", icon: Sparkles },
  { id: "doubao-seedream-4.5", name: "Doubao 4.5", vendor: "ByteDance", icon: Zap },
];

const VIDEO_MODELS = [
  { id: "Doubao-Seedance-1.0-pro", name: "Doubao Seedance 1.0 Pro", vendor: "ByteDance" },
  { id: "Doubao-Seedance-1.5-pro", name: "Doubao Seedance 1.5 Pro", vendor: "ByteDance" },
];

const VIDEO_MODEL_1_0 = "Doubao-Seedance-1.0-pro";
const VIDEO_MODEL_1_5 = "Doubao-Seedance-1.5-pro";

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
    name: "创意生成 (Text2Img)",
    short: "文生图",
    icon: Wand2,
    desc: "从零生成营销素材",
    scenario: "灵感构思",
    category: "generate",
    refRequired: false,
  },
  local_text2img: {
    id: "local_text2img",
    name: "本地文生图",
    short: "本地文生图",
    icon: Server,
    desc: "调用 ComfyUI image_z_image_turbo 工作流",
    scenario: "本地推理 / 低延迟",
    category: "generate",
    refRequired: false,
  },
  multi_image_generate: {
    id: "multi_image_generate",
    name: "图生图 (Img2Img)",
    short: "图生图",
    icon: ImageIcon,
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
    icon: Clapperboard,
    desc: "单图扩展 8 个镜头角度",
    scenario: "电商展示/机位扩展",
    category: "skill",
    refRequired: false,
  },
  video_upscale: {
    id: "video_upscale",
    name: "超分辨率视频",
    short: "视频超分",
    icon: Sparkles,
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
    icon: Sparkles,
    desc: "提升分辨率与细节",
    scenario: "最终出图",
    category: "enhance",
    refRequired: false,
  },
  img2video: {
    id: "img2video",
    name: "图生视频 (I2V)",
    short: "生视频",
    icon: Clapperboard,
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
    icon: Server,
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
    return { mode, prompt: "", templates: { segment_seconds: 3, output_resolution: 1440, workflow_batch_size: 1 } };
  }
  return { mode, prompt: "", templates: {} };
};

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

const VIDEO_UPSCALE_RESOLUTION_OPTIONS = [
  { label: "1K", value: 1080 },
  { label: "2K", value: 1440 },
  { label: "4K", value: 2160 },
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
  if (url.includes(".mp4") || url.includes(".webm")) return true;
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

const SidebarBtn = ({ icon, label, desc, onClick, color, bg, active = false, compact = false }) => {
  const IconComponent = icon;
  return (
    <button
      onClick={onClick}
      title={compact ? label : undefined}
      className={`group relative flex w-full items-center rounded-md border text-left transition-colors ${
        compact
          ? "h-10 justify-center border-transparent text-slate-300 hover:bg-slate-800/70 hover:text-slate-100"
          : `h-10 gap-2.5 px-2.5 border-slate-800/70 ${
              active
                ? "bg-slate-800/85 text-slate-100 border-slate-700/90"
                : "bg-transparent text-slate-300 hover:bg-slate-800/70 hover:text-slate-100"
            }`
      }`}
    >
      <span
        className={`absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r ${
          active ? "bg-yellow-400" : "bg-transparent group-hover:bg-yellow-500/45"
        }`}
      />
      <div
        className={`${
          compact ? "w-7 h-7" : "w-6 h-6"
        } rounded-md ${bg} flex items-center justify-center ${color} shrink-0 ring-1 ${
          active ? "ring-yellow-500/35" : "ring-slate-700/70 group-hover:ring-slate-500/60"
        }`}
      >
        {IconComponent ? React.createElement(IconComponent, { className: "w-5 h-5" }) : null}
      </div>
      {!compact && (
        <>
          <div className="min-w-0 flex-1 overflow-hidden">
            <div className={`font-medium text-xs truncate ${active ? "text-slate-100" : "text-slate-200 group-hover:text-slate-100"}`}>{label}</div>
            <div className="text-[10px] text-slate-500 truncate">{desc}</div>
          </div>
          <Plus className={`w-3 h-3 shrink-0 transition-all ${active ? "text-yellow-300 opacity-90" : "text-slate-600 opacity-0 group-hover:opacity-100 group-hover:text-yellow-300"}`} />
        </>
      )}
    </button>
  );
};

const SidebarSectionHeader = ({ title, open, onToggle }) => (
  <button
    type="button"
    onClick={onToggle}
    className="w-full inline-flex items-center gap-2 py-1 text-[10px] font-semibold text-slate-300 uppercase tracking-[0.14em] hover:text-slate-100"
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




const PropertyPanel = ({ node, updateData, onClose }) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  if (!node || [NODE_TYPES.INPUT, NODE_TYPES.OUTPUT, NODE_TYPES.TEXT_INPUT].includes(node.type)) return null;

  const isProcessor = node.type === NODE_TYPES.PROCESSOR;
  const isPostProcessor = node.type === NODE_TYPES.POST_PROCESSOR;
  const isVideoGen = node.type === NODE_TYPES.VIDEO_GEN;

  const currentMode = TOOL_CARDS[node.data.mode] || TOOL_CARDS.bg_replace;
  const activeTemplates = PROMPT_TEMPLATES[node.data.mode];

  const theme = (() => {
    if (isPostProcessor) return { text: "text-cyan-400", bg: "bg-cyan-600", border: "border-cyan-500" };
    if (isVideoGen) return { text: "text-rose-400", bg: "bg-rose-600", border: "border-rose-500" };
    return { text: "text-purple-400", bg: "bg-purple-600", border: "border-purple-500" };
  })();

  const availableTools = Object.keys(TOOL_CARDS).filter((key) => {
    const tool = TOOL_CARDS[key];
    if (isProcessor) return tool.category === "generate" || tool.category === "skill";
    if (isPostProcessor) return tool.category === "enhance";
    if (isVideoGen) return tool.category === "video";
    return false;
  });

  const promptModes = ["text2img", "local_text2img", "multi_image_generate", "feature_extract", "local_img2video"];
  const isSkillProcessor = isProcessor && currentMode.category === "skill";
  const isMultiAnglesSkill = node.data.mode === "multi_angleshots";
  const isLocalText2Img = node.data.mode === "local_text2img";
  const isLocalImg2Video = node.data.mode === "local_img2video";

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
    node.data.prompt,
    node.data.templates?.style,
    node.data.templates?.direction,
    node.data.templates?.vibe,
    node.data.templates?.note,
  ]
    .filter(Boolean)
    .join(", ");

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
              {promptModes.includes(node.data.mode) ? "提示词 (Prompt)" : "补充描述 / Note"}
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
            <span>{isSkillProcessor ? "高级设置 (尺寸/比例/数量)" : "高级设置 (模型/尺寸/风格)"}</span>
            {showAdvanced ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>

          {showAdvanced && (
            <div className="space-y-4 animate-in slide-in-from-top-2 duration-200">
              {((isProcessor && !isSkillProcessor && !isLocalText2Img) || isPostProcessor) && (
            <div className="space-y-2">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Cpu className="w-3 h-3" /> AI 模型
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {AI_MODELS.map((m) => (
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
                {VIDEO_MODELS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      const nextModel = m.id;
                      const prevT = node.data.templates || {};

                      // ✅ 切到 1.5：时长 4~12；分辨率仅 480/720；默认开声音
                      if (nextModel === VIDEO_MODEL_1_5) {
                        const prevRes = (prevT.resolution || "").toLowerCase();
                        const nextResolution = ["480p", "720p"].includes(prevRes) ? prevRes : "720p";

                        const d = parseInt(String(prevT.duration ?? 5), 10);
                        const nextDuration = Math.min(12, Math.max(4, isNaN(d) ? 5 : d));

                        updateData(node.id, {
                          model: nextModel,
                          templates: {
                            ...prevT,
                            resolution: nextResolution,
                            duration: nextDuration,
                            generate_audio_new: prevT.generate_audio_new ?? true,
                          },
                        });
                        return;
                      }

                      // ✅ 切到 1.0：时长 3~12；分辨率允许 1080p
                      const d = parseInt(String(prevT.duration ?? 5), 10);
                      const nextDuration = Math.min(12, Math.max(3, isNaN(d) ? 5 : d));

                      const prevRes = (prevT.resolution || "").toLowerCase();
                      const nextResolution = prevRes || "1080p"; // 保留已有设置，没有就给 1080p

                      updateData(node.id, {
                        model: nextModel,
                        templates: {
                          ...prevT,
                          duration: nextDuration,
                          resolution: nextResolution,
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
    ) : node.data.model === VIDEO_MODEL_1_5 ? (
      <input
        type="number"
        min={4}
        max={12}
        step={1}
        value={parseInt(String(node.data.templates?.duration ?? 5), 10)}
        onChange={(e) => {
          const v = parseInt(e.target.value, 10);
          const clamped = Math.min(12, Math.max(4, isNaN(v) ? 5 : v));
          updateData(node.id, { templates: { ...(node.data.templates || {}), duration: clamped } });
        }}
        className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-200 outline-none"
      />
    ) : (
      <div className="grid grid-cols-3 gap-2">
        {[3, 5, 10].map((sec) => {
          const cur = parseInt(String(node.data.templates?.duration ?? 5), 10);
          const isSel = cur === sec;
          return (
            <button
              key={sec}
              type="button"
              onClick={() => updateData(node.id, { templates: { ...(node.data.templates || {}), duration: sec } })}
              className={`px-2 py-1.5 rounded-md text-[10px] border transition-all ${
                isSel ? "bg-rose-600 border-rose-500 text-white" : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-600"
              }`}
            >
              {sec}秒
            </button>
          );
        })}
      </div>
    )}
  </div>
)}
          {isVideoGen && (
  <div className="space-y-2">
    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">分辨率</div>

    <div className="grid grid-cols-3 gap-2">
      {(isLocalImg2Video ? ["480p", "720p"] : node.data.model === VIDEO_MODEL_1_5 ? ["480p", "720p"] : ["480p", "720p", "1080p"]).map((r) => {
        const fallbackResolution = isLocalImg2Video ? "480p" : "1080p";
        const isSel = (node.data.templates?.resolution || fallbackResolution) === r;
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

          {isProcessor && node.data.mode === "video_upscale" && (
            <div className="space-y-3">
              <div className="space-y-2">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">输出分辨率</div>
                <div className="grid grid-cols-3 gap-2">
                  {VIDEO_UPSCALE_RESOLUTION_OPTIONS.map((item) => {
                    const currentResolution = parseInt(String(node.data.templates?.output_resolution ?? 1440), 10) || 1440;
                    const isSel = currentResolution === item.value;
                    return (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => updateData(node.id, { templates: { ...(node.data.templates || {}), output_resolution: item.value } })}
                        className={`px-2 py-1.5 rounded-md text-[10px] border transition-all ${
                          isSel
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
              <div className="space-y-2">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">切片时长 (秒)</div>
                <input
                  type="number"
                  min={1}
                  max={10}
                  step={1}
                  value={parseInt(String(node.data.templates?.segment_seconds ?? 3), 10)}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    const next = Math.min(10, Math.max(1, isNaN(v) ? 3 : v));
                    updateData(node.id, { templates: { ...(node.data.templates || {}), segment_seconds: next } });
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-200 outline-none"
                />
              </div>
              <div className="space-y-2">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Batch Size (工作流)</div>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={parseInt(String(node.data.templates?.workflow_batch_size ?? 1), 10)}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    const next = Math.max(1, isNaN(v) ? 1 : v);
                    updateData(node.id, { templates: { ...(node.data.templates || {}), workflow_batch_size: next } });
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-200 outline-none"
                />
              </div>
              <div className="text-[10px] text-slate-500">
                1K/2K/4K 分别写入工作流参数 `resolution` 的 1080/1440/2160；Batch Size 会写入 `batch_size`。上传到 ComfyUI 前会先按切片时长分段处理。
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
              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">尺寸 (Size)</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {(node.data.mode === "local_text2img" ? ["1k", "2k"] : ["1k", "2k", "4k"]).map((opt) => {
                    let value = opt;
                    if (opt === "1k") value = "1024x1024";
                    const isSelected = node.data.templates?.size === value || (!node.data.templates?.size && opt === "1k");
                    return (
                      <button
                        key={opt}
                        onClick={() => updateData(node.id, { templates: { ...(node.data.templates || {}), size: value } })}
                        className={`px-2 py-1.5 rounded-md text-[10px] border transition-all ${
                          isSelected
                            ? "bg-purple-600 border-purple-500 text-white"
                            : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-600"
                        }`}
                        type="button"
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">比例 (Ratio)</div>
                {node.data.mode === "multi_image_generate" && (
                  <div className="text-[10px] text-slate-500 mb-2">可不选；不选时默认跟随输入图像尺寸</div>
                )}
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
              </div>
            </>
          )}

          {/* Style Templates */}
          {activeTemplates?.categories?.map((cat, idx) => (
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
      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Prompt 预览</div>
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
  onIterateImg2Img
}) => {
  const [showCopied, setShowCopied] = useState(false);

  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    Promise.all(
      files.map(
        (file) =>
          new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(file);
          })
      )
    ).then((newImages) => {
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

  let statusColor = "border-slate-800";
  if (node.data.status === "error") statusColor = "border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.3)]";
  else if (node.data.status === "success") statusColor = "border-green-500/50";
  else if (selected) statusColor = "border-white ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-900";

  let title = "Node";
  if (isInput) title = `图片/视频上传 (${node.data.images?.length || 0})`;
  if (isOutput) title = node.data.angleLabel ? `${node.data.angleLabel} 输出 (${node.data.images?.length || 0})` : `输出 (${node.data.images?.length || 0})`;
  if (isProcessor) title = TOOL_CARDS[node.data.mode]?.name || "图片生成";
  if (isPostProcessor) title = TOOL_CARDS[node.data.mode]?.name || "后期增强";
  if (isVideoGen) title = TOOL_CARDS[node.data.mode]?.name || "视频生成";
  if (node.type === NODE_TYPES.TEXT_INPUT) title = "Prompt";

  const getThemeColor = () => {
    if (isPostProcessor) return { text: "text-cyan-400", icon: Palette };
    if (isVideoGen) return { text: "text-rose-400", icon: Film };
    if (isInput) return { text: "text-blue-400", icon: Images };
    if (isOutput) return { text: "text-green-400", icon: Download };
    return { text: "text-purple-400", icon: Wand2 };
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
        className={`aspect-square relative group rounded overflow-hidden bg-slate-950 border cursor-pointer ${
          isActive ? "border-yellow-400 ring-2 ring-yellow-400/40" : "border-slate-800"
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
          className="nodrag absolute bottom-1 left-1 text-[9px] px-2 py-1 rounded bg-black/60 text-white opacity-0 group-hover:opacity-100 hover:bg-yellow-500/30 hover:text-yellow-200 transition"
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
      className={`absolute w-[280px] rounded-2xl border bg-slate-900/95 backdrop-blur-md shadow-2xl flex flex-col transition-colors transition-shadow duration-200 ${statusColor}`}
      style={{ left: node.x, top: node.y }}
      onMouseDown={onMouseDown}
    >
      {/* Header */}
      <div
        className={`flex justify-between items-center p-3 border-b border-slate-800 bg-slate-950/50 rounded-t-2xl handle cursor-grab active:cursor-grabbing ${
          selected ? "bg-blue-900/20" : ""
        }`}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          <Icon className={`w-4 h-4 ${theme.text}`} />
          <span className="font-semibold text-sm text-slate-200 truncate select-none">{title}</span>
          {isReady && (
            <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.8)]" title="Ready to Run" />
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
              className="text-red-400 hover:bg-red-900/30 p-1 rounded"
              title="重试"
              type="button"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}

          {isAI && (
            <div className={`p-1 rounded ${selected ? "bg-slate-800 text-white" : "text-slate-600"}`}>
              <Settings2 className="w-3.5 h-3.5" />
            </div>
          )}

          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.();
            }}
            className="text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded p-1 transition-colors"
            type="button"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="p-3 space-y-3">
        {/* Error */}
        {node.data.status === "error" && (
          <div className="bg-red-950/40 border border-red-900/50 rounded p-2 text-xs text-red-300 flex flex-col gap-2 animate-in fade-in zoom-in-95">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
              <span className="break-all font-mono">{node.data.error || "Unknown Error"}</span>
            </div>
            <div className="flex justify-end gap-2 border-t border-red-900/30 pt-1 mt-1">
              <button
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  copyDebugInfo();
                }}
                className="flex items-center gap-1 text-[9px] opacity-70 hover:opacity-100"
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
            {isProcessor && node.data.mode === "video_upscale" && (
              <div className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-300">
                提醒：上传480P视频
              </div>
            )}
            {node.data.status === "loading" && (
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> 处理中...
                  </span>
                  <span>
                    {node.data.progress || 0}/{node.data.total || 0}
                  </span>
                </div>
                <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: safeProgressWidth }} />
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
                <div className="flex flex-col items-center justify-center py-6 text-slate-600 bg-slate-950/50 rounded border border-dashed border-slate-800">
                  {isReady ? <Play className="w-6 h-6 mb-2 text-green-500/50" /> : <Icon className="w-6 h-6 mb-2 opacity-20" />}
                  <span className="text-[10px]">{isReady ? "准备就绪" : "等待连接..."}</span>
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
                className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] flex items-center justify-center gap-1 transition-colors border border-slate-700"
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
                className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] flex items-center justify-center gap-1 transition-colors border border-slate-700"
                title="先点缩略图选中你要迭代的产物，再点这里"
              >
                <ImageIcon className="w-3 h-3" /> 继续图生图 <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
        )}

        {/* Input */}
        {isInput && (
          <div className="relative bg-slate-950 rounded border border-slate-800 flex flex-col overflow-hidden group hover:border-blue-500 transition-colors h-32">
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
                            activeArtifact?.url === img ? "border-yellow-400 ring-2 ring-yellow-400/40" : "border-transparent"
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
                            activeArtifact?.url === img ? "border-yellow-400 ring-2 ring-yellow-400/40" : "border-transparent"
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
                        className="nodrag absolute bottom-1 left-1 text-[9px] px-1.5 py-0.5 rounded bg-black/60 text-white opacity-0 group-hover/img:opacity-100 hover:bg-yellow-500/30 hover:text-yellow-200 transition"
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
                        className="absolute -top-1 -right-1 bg-red-500 rounded-full p-0.5 opacity-0 group-hover/img:opacity-100"
                        type="button"
                        title="删除"
                      >
                        <X className="w-2 h-2 text-white" />
                      </button>
                    </div>
                  ))}

                  <div className="aspect-square bg-slate-800 rounded flex items-center justify-center cursor-pointer hover:bg-slate-700 relative">
                    <Plus className="w-4 h-4 text-slate-400" />
                    <input type="file" multiple accept="image/*,video/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleFileUpload} />
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 relative">
                  <Images className="w-6 h-6 mb-1 opacity-50" />
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
            className="relative min-h-[100px] max-h-[200px] overflow-y-auto bg-slate-950 rounded border border-slate-800 p-1 custom-scrollbar nodrag"
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
              <div className="h-full flex flex-col items-center justify-center text-xs text-slate-600 py-4">
                <CheckSquare className="w-6 h-6 opacity-20" />
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
                className="w-full mt-2 py-1 bg-green-900/30 text-green-400 border border-green-800 rounded text-[10px] flex justify-center items-center gap-1 hover:bg-green-900/50"
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
            className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-200 outline-none resize-none nodrag"
            rows={3}
            placeholder="输入提示词..."
            value={node.data.text || ""}
            onChange={(e) => updateData(node.id, { text: e.target.value })}
            onMouseDown={(e) => e.stopPropagation()}
          />
        )}
      </div>

      {/* Ports */}
      <div className="absolute top-[52px] w-full flex justify-between px-0 pointer-events-none">
        {node.type !== NODE_TYPES.INPUT && node.type !== NODE_TYPES.TEXT_INPUT && (
          <div
            onMouseUp={onConnectEnd}
            className="w-3 h-3 bg-slate-400 border-2 border-slate-800 rounded-full -ml-1.5 pointer-events-auto cursor-crosshair hover:bg-white hover:scale-125 z-20 shadow-lg"
          />
        )}
        {node.type !== NODE_TYPES.OUTPUT && (
          <div
            onMouseDown={onConnectStart}
            className="w-3 h-3 bg-slate-400 border-2 border-slate-800 rounded-full -mr-1.5 pointer-events-auto cursor-crosshair hover:bg-white hover:scale-125 ml-auto z-20 shadow-lg"
          />
        )}
      </div>
    </div>
  );
};

const newCanvasId = () => "canvas_" + Math.random().toString(36).slice(2, 12);

const Workbench = () => {
  const { user, logout, apiFetch } = useAuth();
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

  const [isRunning, setIsRunning] = useState(false);
  const [runScope, setRunScope] = useState("selected_downstream");
  const [apiStatus, setApiStatus] = useState("checking");
  const [_globalError, setGlobalError] = useState(null);
  const [loadingTip, setLoadingTip] = useState("");
  const [previewImage, setPreviewImage] = useState(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [activeHistoryTab, setActiveHistoryTab] = useState("recent");
  const [apiHistory, setApiHistory] = useState([]);
  const [expandedHistoryIds, setExpandedHistoryIds] = useState(new Set());
  const [apiStats, setApiStats] = useState(null);
  const [runToast, setRunToast] = useState(null);
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [leftSidebarQuery, setLeftSidebarQuery] = useState("");
  const [leftSidebarSectionOpen, setLeftSidebarSectionOpen] = useState({
    nodes: true,
    skills: false,
    workflows: false,
    learning: false,
  });
  const [activeSidebarItemKey, setActiveSidebarItemKey] = useState("");
  const [rightPanelWidth, setRightPanelWidth] = useState(292);
  const [canvasIdCopied, setCanvasIdCopied] = useState(false);
  const [agentStore, setAgentStore] = useState(() => loadAgentStore());
  const [agentInput, setAgentInput] = useState("");
  const [agentDevMode, setAgentDevMode] = useState(() => {
    try {
      return localStorage.getItem("agent_dev_mode") === "true";
    } catch {
      return false;
    }
  });
  const [agentHistoryCollapsed, setAgentHistoryCollapsed] = useState(false);
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
  const agentInputRef = useRef(null);
  const viewportRef = useRef(viewport);
  const agentCardDragRef = useRef(null);
  const agentConversationBottomRef = useRef(null);
  const exportAgentPlanRef = useRef(null);
  const rightPanelResizeRef = useRef(null);

  const agentSessions = agentStore.sessions ?? EMPTY_LIST;
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
    try {
      localStorage.setItem("agent_dev_mode", agentDevMode ? "true" : "false");
    } catch {
      // ignore localStorage write failure
    }
  }, [agentDevMode]);

  const canvasRef = useRef(null);
  const nodesRef = useRef(nodes);
  const connectionsRef = useRef(connections);

  const newCanvas = () => {
    const id = newCanvasId();
    setCanvasId(id);

    // 你想“新画布”是空白还是模板？这里示例空白
    pushHistory();
    setNodes([]);
    setConnections([]);
    setSelectedNodeIds(new Set());
    setSelectedConnectionIds(new Set());
    setActiveArtifact(null);
    setViewport({ x: 0, y: 0, zoom: 1 });
  };

  const [canvasId, setCanvasId] = useState(() => {
    // 如果你后续支持“画布列表/切换”，这里可以从 URL 参数取
    const saved = localStorage.getItem(CANVAS_KEY);
    return saved || newCanvasId();
  });
  const closeUserMenu = (e) => {
    const details = e?.currentTarget?.closest("details");
    if (details) details.removeAttribute("open");
  };
  const copyCanvasId = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(canvasId);
      setCanvasIdCopied(true);
      window.setTimeout(() => setCanvasIdCopied(false), 1200);
    } catch {
      setRunToast({ message: "复制 canvasId 失败", type: "error" });
    }
  }, [canvasId]);
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
      width: agentHistoryCollapsed ? CHAT_PANEL_COLLAPSED_WIDTH : rightPanelWidth,
      height: agentHistoryCollapsed ? CHAT_PANEL_COLLAPSED_HEIGHT : "auto",
      bottom: agentHistoryCollapsed ? "auto" : "7rem",
      transform: agentHistoryCollapsed ? "translateX(16px)" : "translateX(0px)",
      transition:
        "width 280ms cubic-bezier(0.22,1,0.36,1), height 280ms cubic-bezier(0.22,1,0.36,1), transform 280ms cubic-bezier(0.22,1,0.36,1)",
    }),
    [agentHistoryCollapsed, rightPanelWidth],
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
      if (e.key === " ") setIsSpacePressed(false);
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, history, historyStep, selectedNodeIds, selectedConnectionIds, toggleAgentHistoryPanel]);

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

  const handleMouseUp = () => {
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
  };

  const getCursor = () => (interactionMode === "panning" || isSpacePressed ? "grab" : interactionMode === "dragging_node" ? "grabbing" : "default");

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
        model: getProcessorModeDefaults(modePreset || "multi_image_generate").model || "gemini-3-pro-image-preview",
      },
      [NODE_TYPES.POST_PROCESSOR]: {
        mode: "relight",
        prompt: "",
        templates: { style: "", vibe: "", direction: "", note: "" },
        batchSize: 1,
        status: "idle",
        refImage: null,
        model: "gemini-3-pro-image-preview",
      },
      [NODE_TYPES.VIDEO_GEN]: {
        mode: modePreset === "local_img2video" ? "local_img2video" : "img2video",
        prompt: "",
        templates:
          modePreset === "local_img2video"
            ? { duration: 5, resolution: "480p", ratio: "1:1", note: "" }
            : { motion: "", camera: "", duration: 5, resolution: "1080p", ratio: "16:9", note: "", generate_audio_new: true },
        batchSize: 1,
        status: "idle",
        refImage: null,
        model: modePreset === "local_img2video" ? "comfyui-qwen-i2v" : VIDEO_MODEL_1_0,
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
    const n2 = { id: generateId(), type: NODE_TYPES.PROCESSOR, x: 500, y: 200, data: { mode: "text2img", prompt: "", templates: { size: "1024x1024", aspect_ratio: "1:1" }, batchSize: 1, status: "idle", model: "gemini-3-pro-image-preview" } };
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
    const n2 = { id: generateId(), type: NODE_TYPES.PROCESSOR, x: 500, y: 200, data: { mode: "multi_image_generate", prompt: "", templates: { size: "1024x1024", note: "" }, batchSize: 1, uploadedImages: [], status: "idle", model: "gemini-3-pro-image-preview" } };
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
    const n2 = { id: generateId(), type: NODE_TYPES.VIDEO_GEN, x: 500, y: 200, data: { mode: "img2video",model: VIDEO_MODEL_1_0, prompt: "", templates: { motion: "标准(Standard)", camera: "推近(Zoom In)", duration: 5, resolution: "1080p", ratio: "16:9", note: "" ,generate_audio_new: true,}, batchSize: 1, status: "idle", refImage: null } };
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

  const autoLayout = () => {
    pushHistory();
    const sorted = [...nodes].sort((a, b) => {
      const order = { [NODE_TYPES.INPUT]: 0, [NODE_TYPES.TEXT_INPUT]: 0, [NODE_TYPES.PROCESSOR]: 1, [NODE_TYPES.POST_PROCESSOR]: 2, [NODE_TYPES.VIDEO_GEN]: 3, [NODE_TYPES.OUTPUT]: 4 };
      return order[a.type] - order[b.type];
    });
    const newNodes = sorted.map((n, i) => ({ ...n, x: 100 + i * 350, y: 200 + (i % 2) * 50 }));
    setNodes(newNodes);
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
        model: VIDEO_MODEL_1_0,
        prompt: sourceNode.data.prompt || "",
        templates: { motion: "标准(Standard)", camera: "固定镜头(Fixed)", duration: 5,  resolution: "1080p", ratio: "16:9", note: "",generate_audio_new: true, },
        batchSize: 1,
        status: "idle",
        refImage: null,
      },
    };
    setNodes((prev) => [...prev, newNode]);
    setConnections((prev) => [...prev, { id: generateId(), from: sourceNodeId, to: newNodeId }]);
    setSelectedNodeIds(new Set([newNodeId]));
  };

  // ✅ 继续图生图：在“创意生成(text2img)”后，自动接：输入 -> 图生图 -> 输出
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
        model: "gemini-3-pro-image-preview",
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

    // 连起来：创意生成 -> 输入(锁定图) -> 图生图 -> 输出
    setConnections((prev) => [
      ...prev,
      { id: generateId(), from: sourceNodeId, to: inId },
      { id: generateId(), from: inId, to: procId },
      { id: generateId(), from: procId, to: outId },
    ]);

    setSelectedNodeIds(new Set([procId]));
    setSelectedConnectionIds(new Set());
  },
  [pushHistory, activeArtifact]
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
        appendAssistantTurn(missionText, getChitchatReply(missionText), {
          routeDebug: buildRouteDebug(route, false),
        });
        return;
      }

      if (route.intent === "HELP") {
        appendAssistantTurn(missionText, AGENT_HELP_TEXT, {
          quickActions: AGENT_DEFAULT_QUICK_ACTION_IDS,
          routeDebug: buildRouteDebug(route, false),
        });
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
      runVideoMissionOnTurn,
      setPendingTaskForActiveSession,
      updateActiveAgentSession,
    ],
  );

  const sendAgentMission = () => {
    const text = String(agentInput || "").trim();
    if (!text) return;
    setAgentInput("");
    void sendAgentMissionFromText(text);
  };

  const handleAgentQuickAction = useCallback(
    (actionId) => {
      if (actionId === "script") {
        setAgentInput("帮我设计一个洗面奶的爆款脚本");
        agentInputRef.current?.focus();
        return;
      }
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

                const resp = await apiFetch(procNode.data.mode === "local_text2img" ? `/api/local/text2img` : `/api/text2img`, {
                  method: "POST",
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
              } else if (
                procNode.type === NODE_TYPES.VIDEO_GEN ||
                procNode.data.mode === "img2video" ||
                procNode.data.mode === "local_img2video"
              ) {
                const rawDuration = procNode.data.templates?.duration || "5";
                const durationInt = parseInt(String(rawDuration).replace(/[^0-9]/g, "")) || 5;
                const isCameraFixed = procNode.data.templates?.camera?.includes("固定") || false;

                const payload = {
                  model: procNode.data.model || "Doubao-Seedance-1.0-pro", // ✅ 新增
                  image: inputImages[i],
                  last_frame_image: procNode.data.refImage || null,
                  prompt: procNode.data.prompt || sourceText || "natural motion",
                  duration: durationInt,
                  fps: 24,
                  camera_fixed: isCameraFixed,
                  resolution: procNode.data.templates?.resolution || "1080p",
                  ratio: procNode.data.templates?.ratio || "16:9",
                  generate_audio: true, // ✅ 仅 1.5
                  seed: 21,
                };

                const resp = await apiFetch(procNode.data.mode === "local_img2video" ? `/api/local/img2video` : `/api/img2video`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(payload),
                });
                const data = await resp.json();
                if (!resp.ok) throw new Error(extractApiError(data));
                resultUrl = data.image; // 若后端返回字段不同（例如 data.video），在这里改
              } else if (procNode.data.mode === "multi_image_generate") {
                const selectedAspectRatio = procNode.data.templates?.aspect_ratio;
                const resp = await apiFetch(`/api/multi_image_generate`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    prompt: sourceText || procNode.data.prompt,
                    images: inputImages,
                    temperature: 0.7,
                    ...(selectedAspectRatio
                      ? {
                          size: procNode.data.templates?.size || "1024x1024",
                          aspect_ratio: selectedAspectRatio,
                        }
                      : {}),
                  }),
                });
                const data = await resp.json();
                if (!resp.ok) throw new Error(extractApiError(data));
                resultUrl = data.image;
              } else if (procNode.data.mode === "rmbg") {
                const resp = await apiFetch(`/api/rmbg`, {
                  method: "POST",
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
                  throw new Error("超分辨率视频技能仅支持视频输入");
                }
                const startResp = await apiFetch(`/api/video_upscale/start`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    video: videoInput,
                    segment_seconds: parseInt(String(procNode.data.templates?.segment_seconds ?? 3), 10) || 3,
                    output_resolution: parseInt(String(procNode.data.templates?.output_resolution ?? 1440), 10) || 1440,
                    workflow_batch_size: parseInt(String(procNode.data.templates?.workflow_batch_size ?? 1), 10) || 1,
                  }),
                });
                const startData = await startResp.json();
                if (!startResp.ok) throw new Error(extractApiError(startData));
                const taskId = startData.task_id;
                if (!taskId) throw new Error("视频超分任务创建失败");

                let guard = 0;
                while (true) {
                  await new Promise((r) => setTimeout(r, 1200));
                  const statusResp = await apiFetch(`/api/video_upscale/status/${taskId}`);
                  const statusData = await statusResp.json();
                  if (!statusResp.ok) throw new Error(extractApiError(statusData));

                  const totalChunks = Math.max(0, parseInt(String(statusData.total_chunks || 0), 10) || 0);
                  const completedChunks = Math.max(0, parseInt(String(statusData.completed_chunks || 0), 10) || 0);
                  if (totalChunks > 0) {
                    applyNodeUpdate(procNode.id, {
                      total: totalChunks,
                      progress: Math.min(totalChunks, completedChunks),
                    });
                  }

                  if (statusData.status === "success") {
                    resultUrl = statusData.video;
                    break;
                  }
                  if (statusData.status === "error") {
                    throw new Error(statusData.error || "视频超分失败");
                  }

                  guard += 1;
                  if (guard > 1800) {
                    throw new Error("视频超分任务轮询超时");
                  }
                }
              } else if (procNode.data.mode === "multi_angleshots") {
                const resp = await apiFetch(`/api/multi_angleshots`, {
                  method: "POST",
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
          <path d={path} stroke={selectedConnectionIds.has(conn.id) ? "#fbbf24" : "#475569"} strokeWidth="2" fill="none" className="transition-colors duration-200" />
          {isRunning && (
            <circle r="3" fill="#fbbf24">
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
            icon: MousePointer2,
            label: "Prompt 输入",
            desc: "纯文本提示词",
            color: "text-yellow-400",
            bg: "bg-yellow-500/10",
            onClick: () => addNode(NODE_TYPES.TEXT_INPUT),
          },
          {
            id: "node_upload",
            icon: Images,
            label: "图片/视频上传",
            desc: "主商品图/素材",
            color: "text-blue-400",
            bg: "bg-blue-500/10",
            onClick: () => addNode(NODE_TYPES.INPUT),
          },
          {
            id: "node_image_generate",
            icon: Wand2,
            label: "图片生成",
            desc: "背景/手势/生成",
            color: "text-purple-400",
            bg: "bg-purple-500/10",
            onClick: () => addNode(NODE_TYPES.PROCESSOR),
          },
          {
            id: "node_video_generate",
            icon: Film,
            label: "视频生成",
            desc: "图生视频/动效",
            color: "text-rose-400",
            bg: "bg-rose-500/10",
            onClick: () => addNode(NODE_TYPES.VIDEO_GEN),
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
            color: "text-indigo-400",
            bg: "bg-indigo-500/10",
            onClick: () => addNode(NODE_TYPES.PROCESSOR, "rmbg"),
          },
          {
            id: "skill_feature_extract",
            icon: Scan,
            label: "特征提取",
            desc: "面部/背景/服装首饰",
            color: "text-lime-400",
            bg: "bg-lime-500/10",
            onClick: () => addNode(NODE_TYPES.PROCESSOR, "feature_extract"),
          },
          {
            id: "skill_multi_angleshots",
            icon: Clapperboard,
            label: "多角度镜头",
            desc: "单图扩展为 8 个机位",
            color: "text-amber-400",
            bg: "bg-amber-500/10",
            onClick: () => addNode(NODE_TYPES.PROCESSOR, "multi_angleshots"),
          },
          {
            id: "skill_video_upscale",
            icon: Sparkles,
            label: "超分辨率视频",
            desc: "3 秒切片后逐段超分",
            color: "text-cyan-400",
            bg: "bg-cyan-500/10",
            onClick: () => addNode(NODE_TYPES.PROCESSOR, "video_upscale"),
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
            desc: "换脸/换背景/换装",
            color: "text-emerald-400",
            bg: "bg-emerald-500/10",
            onClick: () => navigate("/app/swap"),
          },
          {
            id: "workflow_batch_video",
            icon: Clapperboard,
            label: "批量动图",
            desc: "单图生成短视频",
            color: "text-sky-400",
            bg: "bg-sky-500/10",
            onClick: () => navigate("/app/batch-video"),
          },
          {
            id: "workflow_batch_wordart",
            icon: MessageSquare,
            label: "批量花字",
            desc: "批量添加花字文案",
            color: "text-fuchsia-400",
            bg: "bg-fuchsia-500/10",
            onClick: () => navigate("/app/batch-wordart"),
          },
        ],
      },
      {
        key: "learning",
        title: "AI深度学习",
        items: [
          {
            id: "workflow_local_text2img",
            icon: Server,
            label: "本地：文生图",
            desc: "image_z_image_turbo 工作流",
            color: "text-emerald-300",
            bg: "bg-emerald-500/10",
            onClick: () => createLocalText2ImgTemplate(),
          },
          {
            id: "workflow_local_img2video",
            icon: Server,
            label: "本地：图生视频",
            desc: "Qwen_i2v 工作流",
            color: "text-sky-300",
            bg: "bg-sky-500/10",
            onClick: () => createLocalImg2VideoTemplate(),
          },
          {
            id: "workflow_pose_control",
            icon: Film,
            label: "视频：姿态控制",
            desc: "参考图 + 姿态视频驱动",
            color: "text-rose-300",
            bg: "bg-rose-500/10",
            onClick: () => navigate("/app/pose-control-video"),
          },
        ],
      },
    ];

    const query = leftSidebarQuery.trim().toLowerCase();
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
        {!leftSidebarCollapsed && (
          <div className="mb-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                value={leftSidebarQuery}
                onChange={(e) => setLeftSidebarQuery(e.target.value)}
                placeholder="搜索节点 / 技能 / 工作流"
                className="w-full h-9 rounded-md border border-slate-800/90 bg-slate-950/70 pl-8 pr-2.5 text-[11px] text-slate-200 placeholder:text-slate-500 outline-none focus:border-yellow-500/40"
              />
            </div>
          </div>
        )}

        {visibleSections.length === 0 && !leftSidebarCollapsed ? (
          <div className="rounded-md border border-slate-800/90 bg-slate-950/60 p-2.5 text-[11px] text-slate-400">
            未找到匹配项，请尝试其他关键词。
          </div>
        ) : (
          <div className="space-y-2">
            {visibleSections.map((section, idx) => {
              const sectionOpen = leftSidebarCollapsed ? true : !!leftSidebarSectionOpen[section.key];
              return (
                <div key={section.key} className={idx === 0 ? "" : "pt-1.5 border-t border-slate-800/70"}>
                  {!leftSidebarCollapsed && (
                    <SidebarSectionHeader
                      title={section.title}
                      open={sectionOpen}
                      onToggle={() => handleLeftSidebarSectionToggle(section.key)}
                    />
                  )}
                  {sectionOpen && (
                    <div className="space-y-1">
                      {section.items.map((item) => (
                        <SidebarBtn
                          key={item.id}
                          icon={item.icon}
                          label={item.label}
                          desc={item.desc}
                          color={item.color}
                          bg={item.bg}
                          active={activeSidebarItemKey === item.id}
                          compact={leftSidebarCollapsed}
                          onClick={() => {
                            setActiveSidebarItemKey(item.id);
                            item.onClick();
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

  return (
    <div className="h-screen w-screen bg-[var(--bf-bg)] text-[var(--bf-text)] overflow-hidden flex flex-col font-sans">
      <header className="h-[68px] bg-[var(--bf-panel-strong)] border-b border-[var(--bf-border)] flex items-center justify-between px-4 z-50 select-none shadow-[var(--bf-shadow-md)]">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => setLeftSidebarCollapsed((prev) => !prev)}
            className="h-8 w-8 rounded-md border border-slate-700/90 bg-slate-900/70 text-slate-300 hover:border-yellow-500/35 hover:text-yellow-100 hover:bg-slate-800 transition-colors"
            title={leftSidebarCollapsed ? "展开左侧栏" : "折叠左侧栏"}
          >
            {leftSidebarCollapsed ? <PanelLeftOpen className="w-4 h-4 mx-auto" /> : <PanelLeftClose className="w-4 h-4 mx-auto" />}
          </button>
          <div className="bg-yellow-500/10 p-1.5 rounded-lg border border-yellow-500/20">
            <Zap className="text-yellow-400 w-5 h-5" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-lg leading-tight tracking-tight truncate">
              BananaFlow <span className="text-yellow-400">Workbench</span>
            </span>
            <span className="text-[10px] text-slate-400 font-medium truncate">电商智能图像工作台</span>
          </div>
        </div>

        <div className="hidden lg:flex items-center gap-1 bg-slate-900/60 p-1 rounded-lg border border-slate-800/90">
          <ToolIconBtn icon={Undo} onClick={undo} disabled={historyStep <= 0} title="Undo (Ctrl+Z)" />
          <ToolIconBtn icon={Redo} onClick={redo} disabled={historyStep >= history.length - 1} title="Redo (Ctrl+Y)" />
          <div className="w-px h-4 bg-slate-700/80 mx-1" />
          <ToolIconBtn icon={Trash2} onClick={deleteSelection} title="Delete Selected" disabled={selectedNodeIds.size === 0 && selectedConnectionIds.size === 0} />
          <ToolIconBtn icon={Layout} onClick={autoLayout} title="Auto Layout" />
          <div className="ml-1 px-2 py-1 rounded border border-dashed border-slate-700 text-[10px] text-slate-500">工具位</div>
        </div>

        <div className="flex items-center gap-2">
          <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] border transition-colors ${apiStatus === "online" ? "text-emerald-300 border-emerald-700/60 bg-emerald-900/20" : "text-rose-300 border-rose-700/50 bg-rose-900/20"}`}>
            <Server className="w-3 h-3" /> {apiStatus === "online" ? "API Online" : "API Offline"}
          </div>

          <button
            onClick={() => setShowHistoryPanel(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] border border-slate-700/90 bg-slate-900/65 text-slate-300 hover:border-slate-600 hover:text-slate-100"
          >
            <History className="w-3 h-3" /> 历史
          </button>

          <button
            onClick={() => {
              setPreferencesPanelPrefill(null);
              setShowPreferencesPanel(true);
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] border border-slate-700/90 bg-slate-900/65 text-slate-300 hover:border-slate-600 hover:text-slate-100"
          >
            <Sliders className="w-3 h-3" /> 设置
          </button>

          <button
            type="button"
            onClick={copyCanvasId}
            title={canvasIdCopied ? "已复制" : "复制 canvasId"}
            className={`h-8 w-8 rounded-md border transition-colors ${canvasIdCopied ? "border-yellow-500/55 bg-yellow-500/15 text-yellow-100" : "border-slate-700/90 bg-slate-900/65 text-slate-300 hover:border-slate-600 hover:text-slate-100"}`}
          >
            {canvasIdCopied ? <CheckSquare className="w-4 h-4 mx-auto" /> : <Clipboard className="w-4 h-4 mx-auto" />}
          </button>

          <details className="relative">
            <summary className="list-none cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-700/90 bg-slate-900/65 text-[11px] text-slate-300 hover:border-slate-600 hover:text-slate-100 [&::-webkit-details-marker]:hidden">
              <span className="max-w-[120px] truncate">{user?.email || "Guest"}</span>
              <ChevronDown className="w-3 h-3 text-slate-500" />
            </summary>
            <div className="absolute right-0 top-full mt-1.5 w-52 rounded-lg border border-slate-700 bg-slate-900/98 shadow-2xl p-1.5 z-[70]">
              <div className="px-2 py-1 text-[10px] text-slate-500">当前会话</div>
              <div className="px-2 py-1.5 text-[11px] text-slate-200 truncate">{user?.email || "Guest"}</div>
              <button
                onClick={(e) => {
                  newCanvas();
                  closeUserMenu(e);
                }}
                className="w-full text-left px-2 py-1.5 rounded text-[11px] text-slate-200 hover:bg-slate-800"
              >
                新建画布
              </button>
              <button
                onClick={(e) => {
                  setIsDemoMode((prev) => !prev);
                  closeUserMenu(e);
                }}
                className="w-full text-left px-2 py-1.5 rounded text-[11px] text-slate-200 hover:bg-slate-800"
              >
                {isDemoMode ? "演示模式：ON" : "演示模式：OFF"}
              </button>
              <button
                onClick={(e) => {
                  logout(true);
                  closeUserMenu(e);
                }}
                className="w-full text-left px-2 py-1.5 rounded text-[11px] text-rose-200 hover:bg-rose-500/15"
              >
                退出登录
              </button>
            </div>
          </details>

          <div className="flex rounded-md shadow-lg shadow-purple-900/45">
            <button
              onClick={handleRunClick}
              disabled={isRunning}
              className={`flex items-center gap-2 px-4 py-2 rounded-l-md font-bold text-sm transition-all min-w-[112px] justify-center ${isRunning ? "bg-slate-700 cursor-not-allowed text-slate-300" : "bg-purple-600 hover:bg-purple-500 text-white"}`}
            >
              {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} <span className="truncate max-w-[150px]">{isRunning ? loadingTip : "运行"}</span>
            </button>
            <div className="relative group">
              <button className="px-2 py-2 bg-purple-700 rounded-r-md h-full hover:bg-purple-600 border-l border-purple-800">
                <ChevronDown className="w-4 h-4 text-purple-200" />
              </button>
              <div className="absolute right-0 top-full mt-1 w-32 bg-slate-900 border border-slate-700 rounded-lg shadow-xl overflow-hidden hidden group-hover:block z-50">
                <button onClick={() => setRunScope("all")} className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-800 ${runScope === "all" ? "text-purple-300" : "text-slate-300"}`}>运行全部</button>
                <button onClick={() => setRunScope("selected")} className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-800 ${runScope === "selected" ? "text-purple-300" : "text-slate-300"}`}>运行选中</button>
                <button onClick={() => setRunScope("selected_downstream")} className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-800 ${runScope === "selected_downstream" ? "text-purple-300" : "text-slate-300"}`}>选中 → 下游</button>
              </div>
            </div>
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

      <div className="flex-1 flex relative min-h-0 overflow-hidden">
        {/* Sidebar */}
        <div
          className={`z-40 flex flex-col select-none shrink-0 h-full min-h-0 overflow-y-auto custom-scrollbar [scrollbar-gutter:stable] overscroll-contain border-r border-[var(--bf-border)] bg-gradient-to-b from-slate-900/96 via-slate-900/92 to-slate-950/96 ${leftSidebarCollapsed ? "px-1.5 py-2" : "px-2.5 py-3"} shadow-[var(--bf-shadow-md)] ${leftSidebarCollapsed ? "items-center" : "items-stretch"}`}
          style={{ WebkitOverflowScrolling: "touch", width: leftSidebarCollapsed ? 70 : 270 }}
        >
          {!leftSidebarCollapsed && <div className="mb-2.5 h-px w-full bg-gradient-to-r from-yellow-500/45 via-purple-500/20 to-transparent" />}
          {renderSidebarContent()}
        </div>

        {/* Canvas */}
        <div
          ref={canvasRef}
          className="flex-1 relative bg-slate-950 overflow-hidden"
          style={{ cursor: getCursor() }}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
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

          {nodes.length === 0 && !hasAgentResultCards && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <div className="bg-slate-900/80 border border-slate-700 p-8 rounded-2xl shadow-2xl backdrop-blur-sm text-center max-w-lg pointer-events-auto" onMouseDown={(e) => e.stopPropagation()}>
                <div className="flex justify-center mb-4">
                  <Zap className="w-12 h-12 text-yellow-400 bg-yellow-500/10 p-2 rounded-xl" />
                </div>
                <h2 className="text-xl font-bold text-white mb-2">欢迎来到 FlowStudio</h2>
                <p className="text-sm text-slate-400 mb-8">选择下方模版，或直接使用下方 AI 输入框：</p>

                <div className="grid grid-cols-3 gap-4">
                  <button onClick={createText2ImgTemplate} className="group flex flex-col items-center gap-3 p-4 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 hover:border-purple-500/50 rounded-xl transition-all hover:-translate-y-1">
                    <div className="p-3 bg-purple-500/10 rounded-lg group-hover:bg-purple-500/20 transition-colors">
                      <Wand2 className="w-6 h-6 text-purple-400" />
                    </div>
                    <span className="text-xs font-bold text-slate-300 group-hover:text-white">文生图</span>
                  </button>

                  <button onClick={createImg2ImgTemplate} className="group flex flex-col items-center gap-3 p-4 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 hover:border-blue-500/50 rounded-xl transition-all hover:-translate-y-1">
                    <div className="p-3 bg-blue-500/10 rounded-lg group-hover:bg-blue-500/20 transition-colors">
                      <Images className="w-6 h-6 text-blue-400" />
                    </div>
                    <span className="text-xs font-bold text-slate-300 group-hover:text-white">图生图</span>
                  </button>

                  <button onClick={createImg2VideoTemplate} className="group flex flex-col items-center gap-3 p-4 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 hover:border-rose-500/50 rounded-xl transition-all hover:-translate-y-1">
                    <div className="p-3 bg-rose-500/10 rounded-lg group-hover:bg-rose-500/20 transition-colors">
                      <Clapperboard className="w-6 h-6 text-rose-400" />
                    </div>
                    <span className="text-xs font-bold text-slate-300 group-hover:text-white">图生视频</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="absolute bottom-6 left-6 z-50 flex gap-2 select-none">
            <div className="bg-slate-800 border border-slate-700 rounded-lg flex items-center p-1 shadow-xl text-slate-500">
              <button onClick={() => zoomCanvas(-0.2)} className="p-2 hover:bg-slate-700 hover:text-slate-200 rounded transition-colors"><Minus className="w-4 h-4" /></button>
              <span className="w-12 text-center text-xs font-mono text-slate-400">{Math.round(viewport.zoom * 100)}%</span>
              <button onClick={() => zoomCanvas(0.2)} className="p-2 hover:bg-slate-700 hover:text-slate-200 rounded transition-colors"><Plus className="w-4 h-4" /></button>
            </div>
            <button onClick={() => setViewport({ x: 0, y: 0, zoom: 1 })} className="bg-slate-800 border border-slate-700 rounded-lg p-2 hover:bg-slate-700 hover:text-slate-200 shadow-xl text-slate-500" title="Reset View">
              <Maximize className="w-4 h-4" />
            </button>
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-2 flex items-center gap-2 text-[10px] text-slate-500 shadow-xl">
              <Keyboard className="w-3 h-3" />
              <span>空格拖拽 | Delete 删除 | Ctrl+Z 撤销</span>
            </div>
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
            className="absolute right-4 top-4 z-[95] pointer-events-auto"
            style={rightPanelContainerStyle}
            onMouseDown={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
          >
            {!agentHistoryCollapsed && (
              <button
                type="button"
                onMouseDown={handleRightPanelResizeStart}
                className="absolute -left-2 top-0 bottom-0 w-2 rounded-md cursor-col-resize text-slate-600 hover:text-yellow-400"
                title="拖拽调整对话栏宽度"
                aria-label="拖拽调整对话栏宽度"
              >
                <GripVertical className="w-3.5 h-3.5 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
              </button>
            )}
            <div
              className={`h-full border overflow-hidden backdrop-blur-sm transition-[border-radius,background] duration-300 ${
                agentHistoryCollapsed
                  ? "rounded-[4px] border-[var(--bf-border)] bg-gradient-to-b from-slate-900/92 via-slate-900/88 to-slate-950/92"
                  : "rounded-xl border-[var(--bf-border)] bg-gradient-to-b from-slate-900/94 via-slate-900/92 to-slate-950/95"
              }`}
              style={{ boxShadow: agentHistoryCollapsed ? "0 0 8px rgba(2, 6, 23, 0.45)" : "var(--bf-shadow-md)" }}
            >
              <div
                className={`h-[50px] px-3 flex items-center justify-between ${
                  agentHistoryCollapsed ? "border-b border-slate-700/80 bg-slate-950/35" : "border-b border-slate-800/90 bg-slate-950/35"
                }`}
              >
                <div className="inline-flex min-w-0 items-center gap-1.5 text-xs">
                  <History className={`w-3.5 h-3.5 ${agentHistoryCollapsed ? "text-yellow-300" : "text-yellow-400"}`} />
                  <span className={`font-medium truncate ${agentHistoryCollapsed ? "text-slate-100" : "text-slate-200"}`}>
                    {agentHistoryCollapsed ? "对话" : "对话流"}
                  </span>
                </div>
                <div className="ml-auto flex items-center gap-1.5 shrink-0">
                  {!agentHistoryCollapsed ? (
                    <>
                      <button
                        type="button"
                        onClick={createAgentSession}
                        className="h-7 inline-flex items-center gap-1 px-2 rounded-md border border-slate-700/90 bg-slate-900/70 text-[11px] text-slate-200 hover:bg-slate-800 hover:border-yellow-500/35 hover:text-yellow-100 transition-colors"
                        title="新建会话"
                      >
                        <Plus className="w-3 h-3" />
                        新建
                      </button>
                      <button
                        type="button"
                        onClick={clearActiveAgentConversation}
                        disabled={!hasActiveAgentConversation || isAgentMissionRunning}
                        className={`h-7 inline-flex items-center gap-1 px-2 rounded-md border text-[11px] transition-colors ${
                          !hasActiveAgentConversation || isAgentMissionRunning
                            ? "border-slate-800 bg-slate-900/60 text-slate-600 cursor-not-allowed"
                            : "border-slate-700/90 bg-slate-900/70 text-slate-300 hover:bg-rose-500/12 hover:border-rose-500/35 hover:text-rose-100"
                        }`}
                        title="清除当前会话对话记录"
                      >
                        <Trash2 className="w-3 h-3" />
                        清除
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    onClick={toggleAgentHistoryPanel}
                    title={agentHistoryCollapsed ? "展开对话（Ctrl+Shift+E）" : "收起对话（Ctrl+Shift+E）"}
                    aria-label={agentHistoryCollapsed ? "展开对话（Ctrl+Shift+E）" : "收起对话（Ctrl+Shift+E）"}
                    className="p-1.5 rounded border border-slate-700/90 bg-slate-900/60 text-slate-300 hover:bg-slate-800 hover:border-yellow-500/35 hover:text-yellow-100 transition-colors"
                  >
                    <ChevronRight
                      className={`w-3.5 h-3.5 transition-transform duration-300 ${
                        agentHistoryCollapsed ? "rotate-180 scale-[1.03]" : "rotate-0"
                      }`}
                    />
                  </button>
                </div>
              </div>
              <div
                className={`h-[calc(100%-50px)] flex flex-col transition-[opacity,transform] duration-300 ${
                  agentHistoryCollapsed ? "opacity-0 translate-x-4 pointer-events-none" : "opacity-100 translate-x-0"
                }`}
              >
                <div className="border-b border-slate-800/90 p-2 bg-slate-950/25">
                  <select
                    value={activeAgentSession?.id || ""}
                    onChange={(e) => setActiveAgentSession(e.target.value)}
                    className="w-full bg-slate-950/95 border border-slate-700/90 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-100 outline-none focus:border-yellow-500/45"
                  >
                    {agentSessions.map((session) => (
                      <option key={session.id} value={session.id}>
                        {session.title || "新会话"} ({(session.turns || []).length})
                      </option>
                    ))}
                  </select>
                </div>
                {minimizedAgentCards.length > 0 && (
                  <div className="border-b border-slate-800/90 p-2 space-y-1.5 bg-slate-950/20">
                    <div className="text-[10px] uppercase tracking-wider text-slate-400">已最小化结果</div>
                    {minimizedAgentCards.map((card) => {
                      const turn = agentTurns.find((item) => item.id === card.turnId);
                      if (!turn) return null;
                      return (
                        <button
                          key={card.id}
                          type="button"
                          onClick={() => focusAgentResultCard(turn.id)}
                          className="w-full text-left px-2 py-1.5 rounded-lg border border-slate-700/90 bg-slate-950/80 text-[11px] text-slate-200 hover:bg-slate-800 hover:border-yellow-500/30 transition-colors"
                        >
                          恢复 · {turn.extractedProduct || "result"}
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5 custom-scrollbar bg-slate-950/20">
                  {agentTurns.length === 0 && (
                    <div className="px-2 py-2.5 rounded-lg border border-slate-800/80 bg-slate-950/55 space-y-2">
                      <div className="text-[11px] text-slate-400">暂无对话，先试一个 Mission 或快速打开模板。</div>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => void sendAgentMissionFromText("帮我设计一个洗面奶的爆款脚本")}
                          className="px-2 py-1 rounded border border-slate-700/90 bg-slate-900/85 text-[10px] text-slate-200 hover:bg-slate-800 hover:border-yellow-500/35 hover:text-yellow-100 transition-colors"
                        >
                          发送 Mission 示例
                        </button>
                        <button
                          type="button"
                          onClick={createText2ImgTemplate}
                          className="px-2 py-1 rounded border border-slate-700/90 bg-slate-900/85 text-[10px] text-slate-200 hover:bg-slate-800 hover:border-yellow-500/35 hover:text-yellow-100 transition-colors"
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
                            <div className="rounded-xl border border-purple-500/35 bg-gradient-to-r from-purple-600/20 to-yellow-500/10 px-2.5 py-2 text-[11px] text-purple-50 whitespace-pre-wrap break-words shadow-sm">
                              {turn.userText}
                            </div>
                            {agentDevMode && routeDebug && (
                              <div className="text-[10px] text-amber-100 bg-amber-500/10 border border-amber-500/25 rounded px-2 py-1">
                                intent={routeDebug.intent || "-"} | product={routeDebug.product || "-"} | reason={routeDebug.reason || "-"} | backend_call={routeDebug.backendCalled ? "Y" : "N"}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : null}
                      <div className="flex justify-start">
                        <div className="max-w-[92%] rounded-xl border border-slate-700/90 bg-slate-950/90 px-2.5 py-2 text-[11px] text-slate-200 shadow-sm">
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
                                        className="px-2 py-1 rounded border border-slate-700/90 bg-slate-900/85 text-[10px] text-slate-200 hover:bg-slate-800 hover:border-yellow-500/35 hover:text-yellow-100 transition-colors"
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
                                  className="px-2 py-1 rounded border border-slate-700/90 bg-slate-900/85 text-[10px] text-slate-200 hover:bg-slate-800 hover:border-yellow-500/35 hover:text-yellow-100 transition-colors"
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
                                      className="px-2 py-1 rounded-full border border-yellow-500/45 bg-yellow-500/10 text-[10px] text-yellow-100 hover:bg-yellow-500/20"
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
                                  className="px-2 py-1 rounded border border-slate-700/90 text-[10px] text-slate-200 hover:bg-slate-800 hover:border-yellow-500/35 hover:text-yellow-100 transition-colors"
                                >
                                  重试
                                </button>
                                {HITL_FEEDBACK_UI_ENABLED && (
                                  <button
                                    type="button"
                                    onClick={() => handleTurnMarkRegression(turn)}
                                    disabled={savingFeedbackTargetId === `turn_${turn.id}`}
                                    title="将当前会话标记为回归用例，进入评估集用于后续改进"
                                    className={`px-2 py-1 rounded border text-[10px] ${
                                      savingFeedbackTargetId === `turn_${turn.id}`
                                        ? "bg-slate-800 border-slate-700 text-slate-500 cursor-not-allowed"
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
                                  className="px-2 py-1 rounded border border-slate-700/90 text-[10px] text-slate-200 hover:bg-slate-800 hover:border-yellow-500/35 hover:text-yellow-100 transition-colors"
                                >
                                  {relatedCard?.minimized ? "恢复结果卡片" : "定位结果卡片"}
                                </button>
                                {relatedCard && !relatedCard.minimized && (
                                  <button
                                    type="button"
                                    onClick={() => minimizeAgentResultCard(relatedCard.id)}
                                    className="px-2 py-1 rounded border border-slate-700/90 text-[10px] text-slate-200 hover:bg-slate-800 hover:border-yellow-500/35 hover:text-yellow-100 transition-colors"
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
                                    className={`px-2 py-1 rounded border text-[10px] ${
                                      savingFeedbackTargetId === `turn_${turn.id}`
                                        ? "bg-slate-800 border-slate-700 text-slate-500 cursor-not-allowed"
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

          <div
            className="absolute left-1/2 -translate-x-1/2 bottom-4 z-40 w-[min(100%-2rem,640px)] pointer-events-auto"
            onMouseDown={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
          >
            <div className="rounded-xl border border-[var(--bf-border)] bg-gradient-to-r from-slate-900/95 via-slate-900/92 to-slate-950/95 shadow-[var(--bf-shadow-md)] backdrop-blur-md px-2.5 py-2">
              <div className="mb-2 h-px w-full bg-gradient-to-r from-yellow-500/45 via-purple-500/25 to-transparent" />
              <div className="flex items-end gap-1.5">
                <textarea
                  ref={agentInputRef}
                  value={agentInput}
                  onChange={(e) => setAgentInput(e.target.value)}
                  rows={1}
                  placeholder="输入 Mission，例如：帮我设计一个洗面奶的爆款脚本"
                  className="flex-1 min-h-[38px] max-h-24 rounded-lg border border-slate-700/85 bg-slate-950/95 px-3 py-2 text-xs text-slate-100 outline-none focus:border-yellow-500/45 focus:ring-1 focus:ring-yellow-500/30 resize-y placeholder:text-slate-500"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendAgentMission();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={sendAgentMission}
                  disabled={!agentInput.trim() || isAgentMissionRunning}
                  className={`h-9 px-3 rounded-md text-white inline-flex items-center gap-1 text-xs font-semibold ${
                    !agentInput.trim() || isAgentMissionRunning
                      ? "bg-slate-800 border border-slate-700 text-slate-500 cursor-not-allowed"
                      : "bg-gradient-to-r from-purple-600 to-violet-600 border border-purple-500/45 hover:from-purple-500 hover:to-violet-500 shadow-lg shadow-purple-900/35"
                  }`}
                >
                  {isAgentMissionRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  发送
                </button>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400">
                <span>Enter 发送，Shift+Enter 换行</span>
                <label className="inline-flex items-center gap-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={agentDevMode}
                    onChange={(e) => setAgentDevMode(e.target.checked)}
                    className="h-3 w-3 accent-yellow-500"
                  />
                  Dev Mode
                </label>
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
        <PropertyPanel node={activeNodeId ? nodes.find((n) => n.id === activeNodeId) : null} updateData={updateNodeData} onClose={() => setActiveNodeId(null)} />
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

export default Workbench;
