import React, { useState, useCallback, useEffect, useMemo } from "react";
import {
  X,
  Play,
  Loader2,
  ChevronRight,
  ChevronDown,
  Sparkles,
  Sliders,
  Cpu,
  // icons used by TOOL_CARDS
  Layers,
  Hand,
  ShoppingBag,
  ImagePlus,
  Images,
  Scissors,
  Scan,
  LayoutGrid,
  TrendingUp,
  Film,
  Sun,
  Clapperboard,
} from "lucide-react";
import { EMPTY_LIST } from "../../constants/workbench.jsx";
import InlineDropdown from "./InlineDropdown";
import PersonaMentionTextarea from "./PersonaMentionTextarea";
import { polishCanvasPrompt } from "../../api/agentCanvas";
import { buildCanvasNodePreviewPrompt } from "../agent-canvas/promptUtils";

// ---------------------------------------------------------------------------
// Local copies of constants/utilities that are also used elsewhere in
// Workbench.jsx.  These are duplicated here so PropertyPanel is self-contained
// and does not import from src/pages/Workbench.jsx.
// ---------------------------------------------------------------------------

const NODE_TYPES = {
  INPUT: "input",
  TEXT_INPUT: "text_input",
  STORYBOARD_PLAN: "storyboard_plan",
  LOCAL_ASSET_IMAGE: "local_asset_image",
  ROLE_INPUT: "role_input",
  ROLE_STRUCTURER: "role_structurer",
  PROCESSOR: "processor",
  POST_PROCESSOR: "post_processor",
  VIDEO_GEN: "video_gen",
  PANORAMA_VIEWER: "panorama_viewer",
  OUTPUT: "output",
};

const VOLC_VIDEO_HD_TEMPLATE_ENUM_1 = 1;
const VOLC_VIDEO_HD_TEMPLATE_ENUM_2 = 2;
const DEFAULT_VIDEO_HD_MODEL_ID = "1";

const HIDDEN_IMAGE_CONFIG_MODES = new Set([
  "bg_replace",
  "gesture_swap",
  "product_swap",
]);

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
    name: "抠图 (RMBG)",
    short: "抠图",
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
  text2video: {
    id: "text2video",
    name: "文生视频",
    short: "文生视频",
    icon: Clapperboard,
    desc: "直接调用视频模型生成视频",
    scenario: "纯提示词生成动态视频",
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

const getProcessorModeDefaults = (mode) => {
  if (mode === "text2img") {
    return { mode, prompt: "", templates: { size: "1k", aspect_ratio: "1:1" } };
  }
  if (mode === "local_text2img") {
    return { mode, prompt: "", templates: { size: "1024x1024", aspect_ratio: "1:1" }, model: "comfyui-image-z-image-turbo" };
  }
  if (mode === "multi_image_generate") {
    return { mode, prompt: "", templates: { size: "1k", note: "" } };
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
  text2video: {
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

const isSeedanceReferenceModeModel = (...values) =>
  values.some((value) => {
    const text = String(value || "").trim().toLowerCase();
    if (!text) return false;
    return (
      text.includes("seedance2.0") ||
      text.includes("seedance 2.0") ||
      text.includes("seedance-2.0") ||
      text.includes("seedance_2.0")
    );
  });

const isSeedanceOmniReferenceModel = (...values) =>
  values.some((value) => {
    const text = String(value || "").trim().toLowerCase();
    if (!text) return false;
    return (
      text.includes("seedance2.0") ||
      text.includes("seedance 2.0") ||
      text.includes("seedance-2.0") ||
      text.includes("seedance_2.0")
    );
  });

const sortParamValues = (values) => {
  const list = Array.isArray(values) ? values.slice() : [];
  list.sort((a, b) => {
    const ai = Number(a?.order_index ?? Number.MAX_SAFE_INTEGER);
    const bi = Number(b?.order_index ?? Number.MAX_SAFE_INTEGER);
    return ai - bi;
  });
  return list;
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

const getAIChatParamDisplayValue = (paramValue) => {
  const remark = String(paramValue?.remark || "").trim();
  const value = String(paramValue?.param_value || "").trim();
  return remark || value;
};

const listAIChatParamValues = (paramList, keywords = []) => {
  const item = findAIChatParamItem(paramList, keywords);
  if (!item) return EMPTY_LIST;
  return sortParamValues(item?.param_values || EMPTY_LIST)
    .map((val) => getAIChatParamDisplayValue(val))
    .filter(Boolean);
};

const listAIChatParamChoiceOptions = (paramList, keywords = []) => {
  const item = findAIChatParamItem(paramList, keywords);
  if (!item) return EMPTY_LIST;
  return sortParamValues(item?.param_values || EMPTY_LIST)
    .map((val) => {
      const label = getAIChatParamDisplayValue(val);
      const value = label;
      if (!value || !label) return null;
      return { value, label };
    })
    .filter(Boolean);
};

const normalizePromptPolishVariants = (result) => {
  const rawVariants = Array.isArray(result?.variants) ? result.variants : [];
  const variants = [];
  const seen = new Set();

  rawVariants.forEach((item, index) => {
    const text = String(item?.text || "").trim();
    if (!text || seen.has(text)) return;
    seen.add(text);
    variants.push({
      label: String(item?.label || `版本${index + 1}`).trim() || `版本${index + 1}`,
      text,
    });
  });

  if (!variants.length) {
    const text = String(result?.text || "").trim();
    if (text) {
      variants.push({ label: "版本1", text });
    }
  }

  return variants.slice(0, 3);
};

// ---------------------------------------------------------------------------
// PropertyPanel component
// ---------------------------------------------------------------------------

const PropertyPanel = ({
  node,
  updateData,
  onClose,
  apiFetch,
  onOpenPromptPolishPicker,
  imageModelOptions = EMPTY_LIST,
  videoModelOptions = EMPTY_LIST,
  resolveModelParamsForId,
  personaMentionOptions = EMPTY_LIST,
  embedded = false,
  onRunNode,
  onCancelNode,
  isReady,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [expandedParam, setExpandedParam] = useState(null); // "model"|"duration"|"resolution"|"ratio"
  const [promptPolishLoading, setPromptPolishLoading] = useState(false);
  const [promptPolishError, setPromptPolishError] = useState("");
  const [videoParamOptions, setVideoParamOptions] = useState(() => ({
    resolution: EMPTY_LIST,
    ratio: EMPTY_LIST,
    duration: EMPTY_LIST,
    imageType: EMPTY_LIST,
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
  const hasConfigNode = !!node && ![
    NODE_TYPES.INPUT,
    NODE_TYPES.OUTPUT,
    NODE_TYPES.TEXT_INPUT,
    NODE_TYPES.STORYBOARD_PLAN,
    NODE_TYPES.ROLE_INPUT,
    NODE_TYPES.ROLE_STRUCTURER,
  ].includes(node?.type);

  const isProcessor = node?.type === NODE_TYPES.PROCESSOR;
  const isPostProcessor = node?.type === NODE_TYPES.POST_PROCESSOR;
  const isVideoGen = node?.type === NODE_TYPES.VIDEO_GEN;
  const isEmbeddedVideoConfig = embedded && isVideoGen;

  const currentMode = TOOL_CARDS[node?.data?.mode] || TOOL_CARDS.bg_replace;
  const activeTemplates = PROMPT_TEMPLATES[node?.data?.mode];

  const theme = (() => {
    if (isPostProcessor) return { text: "text-cyan-700", bg: "bg-cyan-50", border: "border-cyan-200" };
    if (isVideoGen) return { text: "text-rose-700", bg: "bg-rose-50", border: "border-rose-200" };
    return { text: "text-purple-700", bg: "bg-purple-50", border: "border-purple-200" };
  })();

  const availableTools = Object.keys(TOOL_CARDS).filter((key) => {
    const tool = TOOL_CARDS[key];
    if (isProcessor) {
      return (tool.category === "generate" || tool.category === "skill")
        && key !== "video_upscale"
        && !HIDDEN_IMAGE_CONFIG_MODES.has(key);
    }
    if (isPostProcessor) return tool.category === "enhance";
    if (isVideoGen) return tool.category === "video" && key !== "local_img2video";
    return false;
  });

  const promptModes = ["text2img", "local_text2img", "multi_image_generate", "feature_extract", "local_img2video", "text2video"];
  const isSkillProcessor = isProcessor && currentMode.category === "skill";
  const isMultiAnglesSkill = node?.data?.mode === "multi_angleshots";
  const isVideoUpscaleSkill = node?.data?.mode === "video_upscale";
  const isLocalText2Img = node?.data?.mode === "local_text2img";
  const isLocalImg2Video = node?.data?.mode === "local_img2video";
  const isRemoteVideoGen = isVideoGen && !isLocalImg2Video;
  const isOmniReferenceVideoGen = isVideoGen && Boolean(node?.data?.omniReferenceOnly);
  const isFirstLastFrameVideoGen = isVideoGen && Boolean(node?.data?.firstLastFrameOnly);
  const isRemoteImageGen =
    isProcessor &&
    !isLocalText2Img &&
    (node?.data?.mode === "text2img" || node?.data?.mode === "multi_image_generate");
  const currentVideoModelId = String(node?.data?.model || "").trim();
  const currentImageModelId = String(node?.data?.model || "").trim();
  const currentVideoModelOption = useMemo(
    () => videoModelOptions.find((item) => String(item?.id || "").trim() === currentVideoModelId) || null,
    [videoModelOptions, currentVideoModelId]
  );
  const filteredVideoModelOptions = useMemo(() => {
    if (!isOmniReferenceVideoGen) return videoModelOptions;
    return videoModelOptions.filter((item) =>
      isSeedanceOmniReferenceModel(item?.id, item?.name, item?.label, item?.remark)
    );
  }, [isOmniReferenceVideoGen, videoModelOptions]);
  const supportsReferenceMode = useMemo(
    () =>
      isSeedanceReferenceModeModel(
        currentVideoModelId,
        currentVideoModelOption?.name,
        currentVideoModelOption?.label,
        currentVideoModelOption?.remark
      ),
    [currentVideoModelId, currentVideoModelOption]
  );

  useEffect(() => {
    const tid = window.setTimeout(() => {
      setShowAdvanced(Boolean(node?.id));
    }, 0);
    return () => window.clearTimeout(tid);
  }, [node?.id]);

  useEffect(() => {
    setExpandedParam(null);
  }, [node?.id]);

  useEffect(() => {
    let cancelled = false;
    if (!isRemoteVideoGen || typeof resolveModelParamsForId !== "function" || !currentVideoModelId) {
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
            .map((val) => getAIChatParamDisplayValue(val))
            .filter(Boolean);
        };
        setVideoParamOptions({
          resolution: readOptions(["resolution", "分辨率", "清晰度"]),
          ratio: readOptions(["ratio", "比例", "宽高比", "画幅", "aspect"]),
          duration: readOptions(["duration", "时长", "秒数"]),
          imageType: listAIChatParamChoiceOptions(paramList, ["imagetype", "image_type", "模式", "参考模式", "参考类型"]),
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
  }, [isRemoteVideoGen, resolveModelParamsForId, currentVideoModelId]);

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
    return ["480p", "720p", "1080p"];
  }, [videoParamOptions.resolution]);

  const remoteDurationOptions = useMemo(() => {
    if (videoParamOptions.duration.length) return videoParamOptions.duration;
    return ["3", "5", "10"];
  }, [videoParamOptions.duration]);

  const remoteRatioOptions = useMemo(() => {
    if (videoParamOptions.ratio.length) return videoParamOptions.ratio;
    return ["16:9", "9:16", "3:4", "21:9", "adaptive"];
  }, [videoParamOptions.ratio]);

  const remoteImageTypeOptions = useMemo(() => {
    if (isOmniReferenceVideoGen) {
      return [{ value: "4", label: "全能参考" }];
    }
    if (isFirstLastFrameVideoGen) {
      return [{ value: "2", label: "首尾帧" }];
    }
    if (videoParamOptions.imageType.length) return videoParamOptions.imageType;
    if (supportsReferenceMode) {
      return [
        { value: "2", label: "首尾帧" },
        { value: "4", label: "全能参考" },
      ];
    }
    return EMPTY_LIST;
  }, [isFirstLastFrameVideoGen, isOmniReferenceVideoGen, videoParamOptions.imageType, supportsReferenceMode]);
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
  const compactEmbeddedVideoDurationOptions = useMemo(() => {
    const normalized = Array.from(new Set(remoteDurationOptions.map((item) => String(item).trim()).filter(Boolean)));
    const preferred = ["5", "10", "15"];
    const picked = preferred.filter((item) => normalized.includes(item));
    for (const item of normalized) {
      if (picked.includes(item)) continue;
      picked.push(item);
      if (picked.length >= 3) break;
    }
    return picked
      .slice(0, 3)
      .sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0));
  }, [remoteDurationOptions]);
  const compactEmbeddedVideoRatioOptions = useMemo(() => {
    const normalized = Array.from(new Set(remoteRatioOptions.map((item) => String(item).trim()).filter(Boolean)));
    const preferred = ["16:9", "9:16", "3:4", "1:1"];
    const picked = preferred.filter((item) => normalized.includes(item));
    for (const item of normalized) {
      if (picked.includes(item)) continue;
      if (String(item).toLowerCase() === "adaptive") continue;
      picked.push(item);
      if (picked.length >= 3) break;
    }
    return picked.slice(0, 3);
  }, [remoteRatioOptions]);
  useEffect(() => {
    if (!isRemoteVideoGen) return;
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

    const currentImageType = String(currentTemplates.imageType || "").trim();
    const allowedImageTypes = new Set(remoteImageTypeOptions.map((item) => String(item?.value || "").trim()).filter(Boolean));
    if (remoteImageTypeOptions.length && !allowedImageTypes.has(currentImageType)) {
      nextTemplates.imageType = String(remoteImageTypeOptions[0]?.value || "").trim();
      changed = true;
    }

    if (changed) updateData(node.id, { templates: nextTemplates });
  }, [isRemoteVideoGen, remoteResolutionOptions, remoteDurationOptions, remoteRatioOptions, remoteImageTypeOptions, node?.data?.templates, node?.id, updateData]);

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
    if (!isRemoteVideoGen || !Array.isArray(activeTemplates.categories)) return activeTemplates;
    return {
      ...activeTemplates,
      categories: activeTemplates.categories.map((cat) =>
        cat?.key === "ratio" ? { ...cat, options: remoteRatioOptions } : cat,
      ),
    };
  }, [activeTemplates, isRemoteVideoGen, remoteRatioOptions]);

  const updateTemplateData = (key, value) => {
    // multi_image_generate 的 prompt 更像"主 prompt"
    const newTemplates = { ...(node.data.templates || {}), [key]: value };
    // ✅ img2video：note 就是主提示词（直接覆盖 prompt）
    if ((node.data.mode === "img2video" || node.data.mode === "text2video") && key === "note") {
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

  const promptValue = promptModes.includes(node?.data?.mode)
    ? (node?.data?.prompt || "")
    : (node?.data?.templates?.note || node?.data?.prompt || "");
  const previewPrompt = buildCanvasNodePreviewPrompt(node);
  const showPromptPolishButton = Boolean(
    promptModes.includes(node?.data?.mode) ||
    node?.data?.mode === "img2video" ||
    node?.data?.mode === "local_img2video" ||
    node?.data?.mode === "relight",
  );

  const handlePolishPrompt = async () => {
    const sourcePrompt = String(promptValue || "").trim();
    if (!sourcePrompt) {
      setPromptPolishError("请先输入提示词");
      return;
    }
    if (!apiFetch) {
      setPromptPolishError("缺少 API 连接");
      return;
    }
    setPromptPolishLoading(true);
    setPromptPolishError("");
    try {
      const result = await polishCanvasPrompt(
        { prompt: sourcePrompt, mode: node?.data?.mode },
        apiFetch,
      );
      const variants = normalizePromptPolishVariants(result);
      if (!variants.length) {
        throw new Error("润色结果为空");
      }
      onOpenPromptPolishPicker?.({
        title: "提示词润色",
        sourcePrompt,
        variants,
        onUse: (text) => {
          if (promptModes.includes(node?.data?.mode)) updateData(node.id, { prompt: text });
          else updateTemplateData("note", text);
        },
      });
    } catch (error) {
      setPromptPolishError(error instanceof Error ? error.message : String(error));
    } finally {
      setPromptPolishLoading(false);
    }
  };

  const getEmbeddedVideoOptionBadge = useCallback((label, value = "") => {
    const text = `${String(label || "")} ${String(value || "")}`.toLowerCase();
    if (text.includes("vip")) return "VIP";
    return "";
  }, []);

  const renderEmbeddedVideoSegmentGroup = useCallback(
    ({
      title,
      options = EMPTY_LIST,
      selectedValue = "",
      onSelect,
      wide = false,
    }) => (
      <div className="space-y-2">
        <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">{title}</div>
        <div className="flex flex-wrap gap-2">
          {options.map((option) => {
            const value = String(option?.value ?? "").trim();
            const label = String(option?.label ?? option?.value ?? "").trim();
            const description = String(option?.description || "").trim();
            const badge = String(option?.badge || getEmbeddedVideoOptionBadge(label, value)).trim();
            const isSelected = String(selectedValue || "").trim() === value;

            return (
              <button
                key={`${title}_${value}`}
                type="button"
                onClick={() => onSelect?.(value)}
                className={`relative flex min-h-[36px] items-center justify-center rounded-[10px] border px-3 py-2 text-[11px] font-medium transition-all ${
                  wide ? "min-w-[132px] flex-1 justify-start text-left" : "min-w-[68px]"
                } ${
                  isSelected
                    ? "border-cyan-200 bg-cyan-50 text-cyan-700"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                {badge ? (
                  <span className={`absolute right-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold leading-none ${
                    isSelected ? "bg-cyan-100 text-cyan-700" : "bg-slate-100 text-slate-500"
                  }`}>
                    {badge}
                  </span>
                ) : null}
                <span className={`flex min-w-0 ${wide ? "flex-col items-start gap-0.5 pr-7" : "items-center"}`}>
                  <span className="truncate">{label}</span>
                  {wide && description ? <span className="truncate text-[10px] text-slate-400">{description}</span> : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    ),
    [getEmbeddedVideoOptionBadge],
  );

  if (!hasConfigNode) return null;

  return (
  <div
    className={
      embedded
        ? "nodrag overflow-visible rounded-t-[16px] bg-[linear-gradient(180deg,rgba(248,250,252,0.98),rgba(255,255,255,0.96))] px-4 pt-3 pb-0"
        : "w-80 bg-white border-l border-slate-200 z-40 flex flex-col shadow-[0_24px_48px_rgba(15,23,42,0.08)] shrink-0 h-full min-h-0 overflow-hidden animate-in slide-in-from-right duration-200"
    }
    onMouseDown={(e) => {
      if (embedded) e.stopPropagation();
    }}
  >
    {!embedded && (
      <div className="flex items-center justify-between border-b border-slate-200 p-4">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-slate-500" />
          <span className="font-bold text-sm text-slate-800">配置面板</span>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-900 p-1 rounded hover:bg-slate-100">
          <X className="w-4 h-4" />
        </button>
      </div>
    )}

    <div className={embedded ? "space-y-1" : "flex-1 min-h-0 overflow-y-auto p-4 space-y-4 custom-scrollbar"}>
      {/* 基础设置 */}
      <div className={embedded ? "space-y-1" : "space-y-3"}>
        {!isSkillProcessor && !isEmbeddedVideoConfig && (
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
                        : "bg-white border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <tool.icon className={`w-4 h-4 ${isActive ? theme.text : "text-slate-500"}`} />
                      <span className={`text-xs font-bold ${isActive ? theme.text : "text-slate-600"}`}>{tool.short}</span>
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
                          ? "bg-purple-50 border-purple-200 text-purple-700"
                          : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
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

        {isEmbeddedVideoConfig && (() => {
          const selectedModel = filteredVideoModelOptions.find((m) => String(m.id) === String(node.data.model || "")) || filteredVideoModelOptions[0];
          const selectedDuration = String(node.data.templates?.duration ?? compactEmbeddedVideoDurationOptions[0] ?? remoteDurationOptions[0] ?? "").trim();
          const selectedResolution = String(node.data.templates?.resolution || remoteResolutionOptions[0] || "").trim();
          const selectedRatio = String(node.data.templates?.ratio || compactEmbeddedVideoRatioOptions[0] || remoteRatioOptions[0] || "").trim();

          const paramRowClass = "flex items-center justify-between rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-xs cursor-pointer hover:border-slate-300 transition-colors";
          const paramLabelClass = "text-[10px] font-medium text-slate-400 uppercase tracking-[0.08em]";
          const paramValueClass = "text-[11px] font-semibold text-slate-700 flex items-center gap-1";

          const renderParamPopup = (key) => {
            if (key === "model") {
              return (
                <div className="flex flex-wrap gap-1.5">
                  {filteredVideoModelOptions.map((item) => {
                    const isSel = String(item.id) === String(node.data.model || filteredVideoModelOptions[0]?.id || "");
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          const prevT = node.data.templates || {};
                          updateData(node.id, { model: item.id, templates: { ...prevT, generate_audio_new: prevT.generate_audio_new ?? true } });
                          setExpandedParam(null);
                        }}
                        className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-[999px] border px-3 py-1.5 text-[11px] transition-colors ${
                          isSel
                            ? "border-cyan-200 bg-cyan-50 text-cyan-700 font-semibold"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                        }`}
                      >
                        <span className={`h-2 w-2 shrink-0 rounded-full ${isSel ? "bg-cyan-400" : "bg-slate-300"}`} />
                        <span className="max-w-[140px] truncate">{item.name}</span>
                      </button>
                    );
                  })}
                </div>
              );
            }

            if (key === "duration") {
              return (
                <div className="flex flex-wrap gap-1.5">
                  {remoteDurationOptions.map((item) => {
                    const val = String(item).trim();
                    const isSel = val === selectedDuration;
                    return (
                      <button
                        key={val}
                        type="button"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          updateData(node.id, { templates: { ...(node.data.templates || {}), duration: val } });
                          setExpandedParam(null);
                        }}
                        className={`rounded-[999px] border px-3 py-1.5 text-[11px] transition-colors ${
                          isSel ? "border-cyan-200 bg-cyan-50 text-cyan-700 font-semibold" : "border-slate-200 text-slate-600 hover:border-slate-300"
                        }`}
                      >
                        {val}秒
                      </button>
                    );
                  })}
                </div>
              );
            }

            if (key === "resolution") {
              return (
                <div className="flex flex-wrap gap-1.5">
                  {remoteResolutionOptions.map((item) => {
                    const val = String(item).trim();
                    const isSel = val === selectedResolution;
                    return (
                      <button
                        key={val}
                        type="button"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          updateData(node.id, { templates: { ...(node.data.templates || {}), resolution: val } });
                          setExpandedParam(null);
                        }}
                        className={`rounded-[999px] border px-3 py-1.5 text-[11px] transition-colors ${
                          isSel ? "border-cyan-200 bg-cyan-50 text-cyan-700 font-semibold" : "border-slate-200 text-slate-600 hover:border-slate-300"
                        }`}
                      >
                        {val.toUpperCase()}
                      </button>
                    );
                  })}
                </div>
              );
            }

            if (key === "ratio") {
              return (
                <div className="flex flex-wrap gap-1.5">
                  {remoteRatioOptions.map((item) => {
                    const val = String(item).trim();
                    const isSel = val === selectedRatio;
                    return (
                      <button
                        key={val}
                        type="button"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          updateData(node.id, { templates: { ...(node.data.templates || {}), ratio: val } });
                          setExpandedParam(null);
                        }}
                        className={`rounded-[999px] border px-3 py-1.5 text-[11px] transition-colors ${
                          isSel ? "border-cyan-200 bg-cyan-50 text-cyan-700 font-semibold" : "border-slate-200 text-slate-600 hover:border-slate-300"
                        }`}
                      >
                        {val}
                      </button>
                    );
                  })}
                </div>
              );
            }

            return null;
          };

          const renderParamRow = (key, label, displayValue) => {
            const isOpen = expandedParam === key;
            return (
              <div
                key={key}
                className="relative"
                onMouseEnter={() => setExpandedParam(key)}
                onMouseLeave={() => setExpandedParam((current) => (current === key ? null : current))}
              >
                <button
                  type="button"
                  className={paramRowClass}
                  style={{ width: "100%" }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className={paramLabelClass}>{label}</span>
                  <span className={paramValueClass}>
                    {displayValue}
                    <ChevronRight className={`w-3 h-3 text-slate-400 transition-transform ${isOpen ? "translate-x-0.5 text-slate-500" : ""}`} />
                  </span>
                </button>
                {isOpen ? (
                  <div
                    className="absolute left-[calc(100%-1px)] top-1/2 z-[140] w-max max-w-[320px] -translate-y-1/2 rounded-[14px] border border-slate-200 bg-white px-3 py-3 shadow-[0_20px_40px_rgba(15,23,42,0.22)]"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">{label}</div>
                    {renderParamPopup(key)}
                  </div>
                ) : null}
              </div>
            );
          };

          return (
            <div className="relative space-y-1.5">
              {/* 模型 */}
              {renderParamRow("model", "模型", selectedModel?.name || "选择模型")}

              {/* 时长 */}
              {renderParamRow("duration", "时长", selectedDuration ? `${selectedDuration}秒` : "-")}

              {/* 分辨率 */}
              {renderParamRow("resolution", "分辨率", selectedResolution ? selectedResolution.toUpperCase() : "-")}

              {/* 比例 */}
              {renderParamRow("ratio", "比例", selectedRatio || "-")}

              {videoParamLoading ? <div className="text-[10px] text-slate-500">参数加载中...</div> : null}
              {videoParamError ? <div className="text-[10px] text-amber-400">{videoParamError}</div> : null}

              {/* 运行按钮 */}
              <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onRunNode?.(node.id); }}
                disabled={!isReady || node.data.status === "loading"}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-[10px] border border-cyan-500 bg-cyan-500 px-4 text-[12px] font-semibold text-white shadow-[0_8px_20px_rgba(6,182,212,0.2)] transition hover:bg-cyan-600 hover:border-cyan-600 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-300 disabled:shadow-none"
              >
                {node.data.status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {node.data.status === "loading" ? "运行中..." : "运行"}
              </button>
              {node.data.status === "loading" && onCancelNode ? (
                <button
                  type="button"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCancelNode?.();
                  }}
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-[10px] border border-rose-200 bg-rose-50 px-4 text-[12px] font-semibold text-rose-600 transition hover:border-rose-300 hover:bg-rose-100 hover:text-rose-700"
                  title="取消该节点生成"
                >
                  <X className="h-4 w-4" />
                  取消
                </button>
              ) : null}
            </div>
          );
        })()}


        {!isSkillProcessor && promptModes.includes(node.data.mode) && node.data.mode !== "text2video" && (
          <div className="space-y-1">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              提示词
            </div>
            <div className="relative">
              <PersonaMentionTextarea
                wrapperClassName="rounded border border-slate-200 bg-white transition-colors focus-within:border-slate-300"
                className="w-full resize-none rounded bg-transparent p-2 pb-9 pr-10 text-xs leading-5 outline-none placeholder:text-slate-400"
                overlayClassName="p-2 pb-9 pr-10 text-xs leading-5"
                personas={personaMentionOptions}
                rows={3}
                placeholder={
                  node.data.mode === "relight"
                    ? "例如: 增加暖色调氛围..."
                    : node.data.mode === "rmbg"
                    ? "抠图无需提示词"
                    : "输入额外指令..."
                }
                value={promptValue}
                onChange={(e) => {
                  setPromptPolishError("");
                  updateData(node.id, { prompt: e.target.value });
                }}
              />

              {showPromptPolishButton && (
                <button
                  type="button"
                  onClick={handlePolishPrompt}
                  disabled={promptPolishLoading || !String(promptValue || "").trim()}
                  className={`absolute bottom-2 right-2 inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${
                    promptPolishLoading
                      ? "border-purple-200 bg-purple-50 text-purple-700"
                      : "border-slate-200 bg-white text-slate-600 hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  }`}
                  title="提示词润色"
                >
                  {promptPolishLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>
            {promptPolishError && <div className="text-[10px] text-amber-400">{promptPolishError}</div>}
          </div>
        )}
      </div>

      {/* 高级设置 */}
      {!isMultiAnglesSkill && (
        <>
          {!embedded && (
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center justify-between text-xs text-slate-500 bg-slate-50 p-2 rounded hover:bg-slate-100 mt-2"
              type="button"
            >
              <span>{isVideoUpscaleSkill ? "高级设置 (输出规格)" : (isSkillProcessor ? "高级设置 (尺寸/比例/数量)" : "高级设置 (模型/尺寸/风格)")}</span>
              {showAdvanced ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </button>
          )}

          {(embedded || showAdvanced) && (
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
                              ? "bg-rose-50 border-rose-200 text-rose-700"
                              : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
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
                        ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                        : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
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

          {!embedded && isVideoGen && !isLocalImg2Video && (
            <div className="space-y-2">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Cpu className="w-3 h-3" /> 视频模型
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {filteredVideoModelOptions.map((m) => (
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
                        ? "bg-rose-50 border-rose-200 text-rose-700"
                        : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
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
          {!embedded && isVideoGen && (
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
        className="w-full bg-white border border-slate-200 rounded p-2 text-xs text-slate-700 outline-none"
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
                isSel ? "bg-rose-50 border-rose-200 text-rose-700" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
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
          {!embedded && isVideoGen && (
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
              isSel ? "bg-rose-50 border-rose-200 text-rose-700" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
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
                            isSelected ? "bg-purple-50 border-purple-200 text-purple-700" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
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
                              ? "bg-purple-50 border-purple-200 text-purple-700"
                              : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
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
                              ? "bg-purple-50 border-purple-200 text-purple-700"
                              : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
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
                              ? "bg-purple-50 border-purple-200 text-purple-700"
                              : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
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
          {!embedded && effectiveTemplates?.categories?.map((cat, idx) => (
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
                        isSelected ? `${theme.bg} ${theme.border} ${theme.text}` : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
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
              {!embedded && node.data.mode !== "multi_angleshots" && !isVideoGen && (
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
                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>

    {!embedded && (
      <div className="p-4 border-t border-slate-200">
        <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">提示词预览</div>
        <div className="text-[10px] text-slate-500 font-mono bg-slate-50 p-2 rounded border border-slate-200 break-words">
          {previewPrompt || "(暂无内容)"}
        </div>
      </div>
    )}
  </div>
);};

export default PropertyPanel;
