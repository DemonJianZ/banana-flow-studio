import React from "react";
import {
  Layers,
  Hand,
  ShoppingBag,
  ImagePlus,
  Images,
  Scissors,
  Scan,
  LayoutGrid,
  TrendingUp,
  Sun,
  Film,
  Clapperboard,
} from "lucide-react";
import { extractProductKeyword } from "../api/agentCanvas";
import { buildCanvasNodePrompt } from "../components/agent-canvas/promptUtils";

// ==========================================
// Run Steps
// ==========================================
export const AGENT_RUN_STEPS = [
  "推断受众",
  "生成脚本",
  "合规扫描",
  "素材匹配",
  "生成剪辑计划",
];

export const STORYBOARD_RUN_STEPS = [
  "读取剧本",
  "拆分场景",
  "设计镜头",
  "匹配资产",
  "搭建生产工作流",
];

export const SHOT_WORKFLOW_RUN_STEPS = [
  "读取剧本",
  "拆分镜头",
  "判断文生图/图生图",
  "生成镜头提示词",
  "搭建出图工作流",
];

export const DRAMA_RUN_STEPS = [
  "理解需求",
  "创作短剧",
  "整理输出",
];

// ==========================================
// Script Brief Options
// ==========================================
export const SCRIPT_PLATFORM_OPTIONS = ["抖音", "小红书", "快手", "微信", "淘宝/天猫", "京东", "拼多多", "1688"];
export const SCRIPT_PRICE_BAND_OPTIONS = ["9-49元", "50-99元", "100-199元", "200-499元", "500元以上"];
export const SCRIPT_CONVERSION_GOAL_OPTIONS = ["点击商品详情", "私信咨询", "加购下单", "收藏种草", "留资获客"];
export const SCRIPT_AUDIENCE_OPTIONS = [
  "通勤白领",
  "学生党",
  "油皮女生",
  "宝妈人群",
  "租房青年",
  "新手买家",
];

// ==========================================
// Misc Constants
// ==========================================
export const AGENT_RESULT_CARD_WIDTH = 460;
export const EMPTY_LIST = Object.freeze([]);

// ==========================================
// Script Brief Utilities
// ==========================================
export const normalizeScriptBrief = (brief = {}) => ({
  product: String(brief?.product || "").trim(),
  audience: String(brief?.audience || "").trim(),
  priceBand: String(brief?.priceBand || "").trim(),
  conversionGoal: String(brief?.conversionGoal || "").trim(),
  primaryPlatform: String(brief?.primaryPlatform || "").trim(),
  secondaryPlatform: String(brief?.secondaryPlatform || "").trim(),
  selectedAngle: String(brief?.selectedAngle || "").trim(),
});

// ==========================================
// Artifact Selection Utilities
// ==========================================
export const buildArtifactSelectionKey = (artifact) => {
  if (!artifact || typeof artifact !== "object") return "";
  const kind = String(artifact.kind || "").trim();
  const fromNodeId = String(artifact.fromNodeId || "").trim();
  if (kind === "storyboard_selection") {
    const meta = artifact.meta && typeof artifact.meta === "object" ? artifact.meta : {};
    const selectionType = String(meta.selectionType || "").trim();
    const selectionId = String(meta.selectionId || "").trim();
    return `storyboard:${fromNodeId}:${selectionType}:${selectionId}`;
  }
  const url = String(artifact.url || "").trim();
  if (url) return `url:${url}`;
  return `${kind}:${fromNodeId}:${String(artifact.createdAt || "").trim()}`;
};

export const isSameArtifactSelection = (left, right) =>
  !!buildArtifactSelectionKey(left) &&
  buildArtifactSelectionKey(left) === buildArtifactSelectionKey(right);

export const isPreviewableArtifact = (artifact) => {
  if (!artifact || typeof artifact !== "object") return false;
  const kind = String(artifact.kind || "").trim();
  const url = String(artifact.url || "").trim();
  return !!url && (kind === "image" || kind === "video");
};

// ==========================================
// Location / Scene Binding Utilities
// ==========================================
export const normalizeLocationName = (text) =>
  String(text || "").replace(/(?<=[一-鿿㐀-䶿])的(?=[一-鿿㐀-䶿])/g, "");

export const matchesSceneBinding = (sb, needle) => {
  const fName = String(sb?.folder_name || "").trim();
  const mFrom = String(sb?.matched_from || "").trim();
  const n = String(needle || "").trim();
  if (!n || n.length < 2) return false;
  const nNorm = normalizeLocationName(n);
  const fNorm = normalizeLocationName(fName);
  const mNorm = normalizeLocationName(mFrom);
  return (
    fName === n || mFrom === n ||
    fNorm === nNorm ||
    fName.includes(n) || mFrom.includes(n) || n.includes(fName) ||
    (nNorm.length >= 2 && (fNorm.includes(nNorm) || mNorm.includes(nNorm) || nNorm.includes(fNorm)))
  );
};

// ==========================================
// Storyboard Text Utilities
// ==========================================
export const stripStoryboardDisplayIds = (value) =>
  String(value || "")
    .replace(/[（(]\s*(?:[A-Za-z]{1,16}_\d{1,6}|[A-Z]\d{2,6}|char[_-]?\d{1,6}|scene[_-]?\d{1,6}|shot[_-]?\d{1,6}|loc[_-]?\d{1,6}|subj[_-]?\d{1,6}|entity[_-]?\d{1,6})\s*[)）]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

export const escapeRegExp = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const collectStoryboardMentionTerms = (storyboardPlan = {}) => {
  const entities = storyboardPlan?.entities || {};
  const scenes = Array.isArray(storyboardPlan?.scenes) ? storyboardPlan.scenes : [];
  const locations = Array.isArray(entities?.locations) ? entities.locations : [];
  const charBindings = Array.isArray(storyboardPlan?.local_asset_bindings?.character_bindings)
    ? storyboardPlan.local_asset_bindings.character_bindings : [];
  const sceneBindings = Array.isArray(storyboardPlan?.local_asset_bindings?.scene_bindings)
    ? storyboardPlan.local_asset_bindings.scene_bindings : [];
  const boundEntityIds = new Set(
    charBindings
      .filter((cb) => String(cb?.three_view_url || cb?.voice_url || "").trim())
      .map((cb) => String(cb?.entity_id || "").trim())
      .filter(Boolean),
  );
  const locationEntityByName = new Map(
    locations
      .map((item) => [stripStoryboardDisplayIds(item?.name || ""), item])
      .filter(([name]) => !!name),
  );
  const sceneByLocation = new Map();
  scenes.forEach((scene, index) => {
    const locationName = stripStoryboardDisplayIds(scene?.location || "");
    if (!locationName || sceneByLocation.has(locationName)) return;
    const matchedLocation = locationEntityByName.get(locationName);
    sceneByLocation.set(locationName, {
      assetType: "locations",
      assetId: String(matchedLocation?.entity_id || locationName).trim(),
      assetName: locationName,
      selectionType: "scene",
      selectionId: String(scene?.scene_id || `scene-${index + 1}`).trim(),
      selectionLabel: `场景 ${scene?.scene_no || index + 1} · ${locationName}`,
      selectionSummary: String(scene?.scene_notes || scene?.summary || "").trim(),
      payload: {
        sceneId: String(scene?.scene_id || `scene-${index + 1}`).trim(),
        sceneNo: scene?.scene_no || index + 1,
        sceneTitle: String(scene?.title || "").trim(),
        sceneLocation: String(scene?.location || "").trim(),
      },
    });
  });
  const seen = new Map();
  const pushEntry = (rawTerm, type, selection = null) => {
    const term = stripStoryboardDisplayIds(rawTerm);
    if (!term) return;
    if (!seen.has(term)) seen.set(term, { term, type, ...(selection || {}) });
  };
  (Array.isArray(entities?.characters) ? entities.characters : []).forEach((item) => {
    const entityId = String(item?.entity_id || "").trim();
    pushEntry(item?.name, "character", {
      assetType: "characters",
      assetId: entityId,
      assetName: stripStoryboardDisplayIds(item?.name || ""),
      hasBinding: boundEntityIds.has(entityId),
      selectionType: "entity",
      selectionId: entityId,
      selectionLabel: `角色 · ${String(item?.name || "").trim()}`,
      selectionSummary: String(item?.core_description || item?.description || "").trim(),
      payload: {
        entityId,
        entityName: String(item?.name || "").trim(),
        entityType: "角色",
      },
    });
  });
  (Array.isArray(entities?.subjects) ? entities.subjects : []).forEach((item) => {
    const entityId = String(item?.entity_id || "").trim();
    pushEntry(item?.name, "subject", {
      assetType: "subjects",
      assetId: entityId,
      assetName: stripStoryboardDisplayIds(item?.name || ""),
      hasBinding: boundEntityIds.has(entityId),
      selectionType: "entity",
      selectionId: entityId,
      selectionLabel: `主体 · ${String(item?.name || "").trim()}`,
      selectionSummary: String(item?.core_description || item?.description || "").trim(),
      payload: {
        entityId,
        entityName: String(item?.name || "").trim(),
        entityType: "主体",
      },
    });
  });
  locations.forEach((item) => {
    const locationName = stripStoryboardDisplayIds(item?.name || "");
    const hasSceneBinding = sceneBindings.some((sb) => matchesSceneBinding(sb, locationName));
    pushEntry(item?.name, "scene", {
      ...(sceneByLocation.get(locationName) || {
        assetType: "locations",
        assetId: String(item?.entity_id || "").trim(),
        assetName: locationName,
        selectionType: "scene",
        selectionId: String(item?.entity_id || locationName).trim(),
        selectionLabel: `场景 · ${String(item?.name || "").trim()}`,
        selectionSummary: String(item?.core_description || item?.description || "").trim(),
        payload: {
          sceneId: "",
          sceneNo: null,
          sceneTitle: String(item?.name || "").trim(),
          sceneLocation: String(item?.name || "").trim(),
          locationId: String(item?.entity_id || "").trim(),
        },
      }),
      hasBinding: hasSceneBinding,
    });
  });
  scenes.forEach((item, index) => {
    const selection = {
      selectionType: "scene",
      selectionId: String(item?.scene_id || `scene-${index + 1}`).trim(),
      selectionLabel: `场景 ${item?.scene_no || index + 1} · ${stripStoryboardDisplayIds(item?.location || "") || `场景 ${index + 1}`}`,
      selectionSummary: String(item?.scene_notes || item?.summary || "").trim(),
      payload: {
        sceneId: String(item?.scene_id || `scene-${index + 1}`).trim(),
        sceneNo: item?.scene_no || index + 1,
        sceneTitle: String(item?.title || "").trim(),
        sceneLocation: String(item?.location || "").trim(),
      },
    };
    const locationName = stripStoryboardDisplayIds(item?.location || "");
    pushEntry(item?.location, "scene", sceneByLocation.get(locationName) || selection);
  });
  return Array.from(seen.values())
    .sort((a, b) => b.term.length - a.term.length);
};

export const renderStoryboardMentionText = (
  value,
  mentionTerms = [],
  onMentionSelect = null,
  onMentionHover = null,
  onMentionLeave = null,
  storyboardNode = null,
) => {
  const text = stripStoryboardDisplayIds(value);
  if (!text) return "";
  const termEntries = Array.from(
    new Map(
      (mentionTerms || [])
        .map((item) => {
          const term = stripStoryboardDisplayIds(item?.term || "");
          if (!term) return null;
          return {
            ...item,
            term,
            type: String(item?.type || "").trim() || "default",
          };
        })
        .filter(Boolean)
        .map((item) => [item.term, item]),
    ).values(),
  ).sort((a, b) => b.term.length - a.term.length);
  const terms = termEntries.map((item) => item.term);
  if (!terms.length) return text;
  const pattern = new RegExp(`(${terms.map((item) => escapeRegExp(item)).join("|")})`, "g");
  const parts = text.split(pattern);
  if (parts.length <= 1) return text;
  const mentionTypeByTerm = new Map(termEntries.map((item) => [item.term, item.type]));
  return parts.map((part, index) => {
    if (!part) return null;
    const matched = terms.some((term) => term === part);
    if (!matched) {
      return <React.Fragment key={`storyboard-text-${index}`}>{part}</React.Fragment>;
    }
    const mentionType = mentionTypeByTerm.get(part) || "default";
    const mentionClassName =
      mentionType === "character"
        ? "bg-cyan-50 text-cyan-700 ring-cyan-200/80"
        : mentionType === "subject"
        ? "bg-violet-50 text-violet-700 ring-violet-200/80"
        : mentionType === "scene"
        ? "bg-amber-50 text-amber-700 ring-amber-200/80"
        : "bg-slate-100 text-slate-700 ring-slate-200/80";
    const mentionEntry = termEntries.find((item) => item.term === part) || null;
    return (
      <span
        key={`storyboard-mention-${index}`}
        className={`rounded-md px-1 py-0.5 font-medium ring-1 ${mentionClassName} ${mentionEntry && typeof onMentionSelect === "function" ? "cursor-pointer hover:brightness-95" : ""}`}
        role={mentionEntry && typeof onMentionSelect === "function" ? "button" : undefined}
        tabIndex={mentionEntry && typeof onMentionSelect === "function" ? 0 : undefined}
        onMouseDown={
          mentionEntry && typeof onMentionSelect === "function"
            ? (event) => {
                event.stopPropagation();
              }
            : undefined
        }
        onClick={
          mentionEntry && typeof onMentionSelect === "function"
            ? (event) => {
                event.stopPropagation();
                onMentionSelect(mentionEntry);
              }
            : undefined
        }
        onMouseEnter={
          mentionEntry && typeof onMentionHover === "function"
            ? (event) => {
                event.stopPropagation();
                onMentionHover(storyboardNode, mentionEntry, event);
              }
            : undefined
        }
        onMouseLeave={
          mentionEntry && typeof onMentionLeave === "function"
            ? (event) => {
                event.stopPropagation();
                onMentionLeave();
              }
            : undefined
        }
        onKeyDown={
          mentionEntry && typeof onMentionSelect === "function"
            ? (event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                event.stopPropagation();
                onMentionSelect(mentionEntry);
              }
            : undefined
        }
      >
        {mentionEntry?.hasBinding ? "@" : ""}{part}
      </span>
    );
  });
};

// ==========================================
// Script Platform / Brief Builders
// ==========================================
export const extractScriptPlatform = (text) => {
  const source = String(text || "");
  if (!source) return "";
  if (/小红书/i.test(source)) return "小红书";
  if (/抖音/i.test(source)) return "抖音";
  if (/快手/i.test(source)) return "快手";
  if (/微信|企微|企业微信/i.test(source)) return "微信";
  if (/淘宝|天猫/i.test(source)) return "淘宝/天猫";
  if (/京东/i.test(source)) return "京东";
  if (/拼多多|拼夕夕/i.test(source)) return "拼多多";
  if (/1688/i.test(source)) return "1688";
  return "";
};

export const buildInitialScriptBrief = (missionText, product = "") => {
  const normalizedProduct = String(product || extractProductKeyword(missionText) || "").trim();
  return normalizeScriptBrief({
    product: normalizedProduct,
    primaryPlatform: extractScriptPlatform(missionText) || "抖音",
    conversionGoal: "点击商品详情",
  });
};

// ==========================================
// Agent Result Card Utilities
// ==========================================
export const getAgentResultCardWidth = () => AGENT_RESULT_CARD_WIDTH;

export const getAgentTurnSteps = (turn) => {
  if (turn?.intent === "DRAMA") return DRAMA_RUN_STEPS;
  if (turn?.intent === "STORYBOARD") return STORYBOARD_RUN_STEPS;
  if (turn?.intent === "SHOT_WORKFLOW") return SHOT_WORKFLOW_RUN_STEPS;
  return AGENT_RUN_STEPS;
};

export const getAgentTurnStepLabel = (turn) => {
  const steps = getAgentTurnSteps(turn);
  return steps[Math.min(turn?.stepIndex || 0, steps.length - 1)];
};

// ==========================================
// Node / Canvas Constants
// ==========================================
export const NODE_TYPES = {
  INPUT: "input",
  TEXT_INPUT: "text_input",
  STORYBOARD_INPUT: "storyboard_input",
  STORYBOARD_PLAN: "storyboard_plan",
  LOCAL_ASSET_IMAGE: "local_asset_image",
  ROLE_INPUT: "role_input",
  ROLE_STRUCTURER: "role_structurer",
  PROCESSOR: "processor",
  POST_PROCESSOR: "post_processor",
  VIDEO_GEN: "video_gen",
  OUTPUT: "output",
  GROUP_CONTAINER: "group_container",
};

export const HIDDEN_IMAGE_CONFIG_MODES = new Set([
  "bg_replace",
  "gesture_swap",
  "product_swap",
]);

// ==========================================
// Video HD Constants
// ==========================================
export const VOLC_VIDEO_HD_TEMPLATE_ENUM_1 = 1;
export const VOLC_VIDEO_HD_TEMPLATE_ENUM_2 = 2;
export const DEFAULT_VIDEO_HD_MODEL_ID = "1";

// ==========================================
// Seedance Model Helpers
// ==========================================
export const isSeedanceReferenceModeModel = (...values) =>
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

export const isSeedanceOmniReferenceModel = (...values) =>
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

// ==========================================
// AI Chat Param Helpers
// ==========================================
export const sortParamValues = (values) => {
  const list = Array.isArray(values) ? values.slice() : [];
  list.sort((a, b) => {
    const ai = Number(a?.order_index ?? Number.MAX_SAFE_INTEGER);
    const bi = Number(b?.order_index ?? Number.MAX_SAFE_INTEGER);
    return ai - bi;
  });
  return list;
};

export const findAIChatParamItem = (paramList, keywords = []) => {
  const list = Array.isArray(paramList) ? paramList : EMPTY_LIST;
  const lowerKeywords = keywords.map((item) => String(item || "").toLowerCase()).filter(Boolean);
  for (const item of list) {
    const name = String(item?.param_name || item?.name || item?.desc || "").toLowerCase();
    if (!name) continue;
    if (lowerKeywords.some((keyword) => name.includes(keyword))) return item;
  }
  return null;
};

export const getAIChatParamDisplayValue = (paramValue) => {
  const remark = String(paramValue?.remark || "").trim();
  const value = String(paramValue?.param_value || "").trim();
  return remark || value;
};

export const listAIChatParamValues = (paramList, keywords = []) => {
  const item = findAIChatParamItem(paramList, keywords);
  if (!item) return EMPTY_LIST;
  return sortParamValues(item?.param_values || EMPTY_LIST)
    .map((val) => getAIChatParamDisplayValue(val))
    .filter(Boolean);
};

export const listAIChatParamChoiceOptions = (paramList, keywords = []) => {
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

// ==========================================
// Prompt Polish Helpers
// ==========================================
export const normalizePromptPolishVariants = (result) => {
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

// ==========================================
// Tool Cards
// ==========================================
export const TOOL_CARDS = {
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

// ==========================================
// Feature Extract / Processor Defaults
// ==========================================
export const FEATURE_EXTRACT_PRESET_PROMPTS = {
  face: "提取画面中的面部特征，保留五官与肤色细节，去除背景与多余元素，结果自然清晰。",
  background: "提取画面中的纯背景，移除所有主体与物体，保持背景干净自然，避免残影。",
  outfit: "提取画面中的服装与首饰，保留材质与纹理细节，弱化人物面部与背景，结果清晰自然。",
};

export const getProcessorModeDefaults = (mode) => {
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

export const VIDEO_HD_TEMPLATE_OPTIONS = [
  { label: "2K", value: VOLC_VIDEO_HD_TEMPLATE_ENUM_1 },
  { label: "4K", value: VOLC_VIDEO_HD_TEMPLATE_ENUM_2 },
];

// ==========================================
// Prompt Templates & Aspect Ratios
// ==========================================
export const PROMPT_TEMPLATES = {
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

export const ASPECT_RATIOS = [
  { label: "1:1", w: 24, h: 24 },
  { label: "4:3", w: 32, h: 24 },
  { label: "3:4", w: 24, h: 32 },
  { label: "16:9", w: 40, h: 22 },
  { label: "21:9", w: 44, h: 20 },
  { label: "9:16", w: 22, h: 40 },
];

// ==========================================
// Canvas / Node helpers shared between NodeComponent and Workbench
// ==========================================

export const VIDEO_GEN_INPUT_HANDLE_MAIN = "main";
export const VIDEO_GEN_INPUT_HANDLE_LAST_FRAME = "last_frame";

export const normalizeConnectionTargetHandle = (handle) =>
  String(handle || "").trim() === VIDEO_GEN_INPUT_HANDLE_LAST_FRAME
    ? VIDEO_GEN_INPUT_HANDLE_LAST_FRAME
    : VIDEO_GEN_INPUT_HANDLE_MAIN;

export const MEDIA_UPLOAD_NODE_EMPTY_HEIGHT = 132;
export const MAX_RENDERED_MEDIA_ITEMS_PER_NODE = 24;

export const DEFAULT_VIDEO_LINEART_STRENGTH = 2;
export const DEFAULT_VIDEO_LINEART_COLOR = "black";
export const DEFAULT_VIDEO_SPLIT_OUTPUT_RESOLUTION = "720p";

// ---- File type helpers ----
const IMAGE_FILE_EXT_PATTERN = /\.(?:png|jpe?g|webp|gif|bmp|svg|avif|heic|heif)$/i;
const VIDEO_FILE_EXT_PATTERN = /\.(?:mp4|webm|mov|m4v|avi|mkv|m3u8)$/i;

export const isImageFileLike = (file) => {
  const mime = String(file?.type || "").trim().toLowerCase();
  if (mime.startsWith("image/")) return true;
  const name = String(file?.name || "").trim();
  return IMAGE_FILE_EXT_PATTERN.test(name);
};

export const isVideoFileLike = (file) => {
  const mime = String(file?.type || "").trim().toLowerCase();
  if (mime.startsWith("video/")) return true;
  const name = String(file?.name || "").trim();
  return VIDEO_FILE_EXT_PATTERN.test(name);
};

export const isAudioFileLike = (file) => {
  const mime = String(file?.type || "").trim().toLowerCase();
  if (mime.startsWith("audio/")) return true;
  const name = String(file?.name || "").trim().toLowerCase();
  return /\.(mp3|wav|aac|ogg|flac|m4a|opus|wma)$/.test(name);
};

export const isMediaFileLike = (file) => isImageFileLike(file) || isVideoFileLike(file);

export const normalizeInputMediaKind = (value) => (value === "image" || value === "video" || value === "audio" ? value : "mixed");

export const getReferenceNodeTitle = (mediaKind = "mixed") => {
  const normalizedMediaKind = normalizeInputMediaKind(mediaKind);
  if (normalizedMediaKind === "image") return "图片参考";
  if (normalizedMediaKind === "video") return "视频参考";
  return "媒体参考";
};

// ---- File reading helpers ----
const MAX_UPLOAD_IMAGE_DIMENSION = 1920;
const UPLOAD_IMAGE_JPEG_QUALITY = 0.84;

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });

const shouldCompressImageFile = (file) => {
  const mime = String(file?.type || "").toLowerCase();
  if (!mime.startsWith("image/")) return false;
  if (mime.includes("svg") || mime.includes("gif")) return false;
  return true;
};

const compressImageFileToDataUrl = async (file) => {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    const loaded = new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("图片解码失败"));
    });
    image.src = objectUrl;
    await loaded;

    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    if (!sourceWidth || !sourceHeight) return readFileAsDataUrl(file);

    const scale = Math.min(1, MAX_UPLOAD_IMAGE_DIMENSION / Math.max(sourceWidth, sourceHeight));
    const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
    const targetHeight = Math.max(1, Math.round(sourceHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return readFileAsDataUrl(file);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

    return canvas.toDataURL("image/jpeg", UPLOAD_IMAGE_JPEG_QUALITY);
  } catch (error) {
    console.warn("[Workbench] image-compress-fallback", error);
    return readFileAsDataUrl(file);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const readMediaFileAsDataUrl = (file) => {
  if (shouldCompressImageFile(file)) return compressImageFileToDataUrl(file);
  return readFileAsDataUrl(file);
};

export const readFilesAsDataUrls = (files) =>
  Promise.all(Array.from(files || []).map((file) => readMediaFileAsDataUrl(file)));

// ---- Video split helpers ----
export const normalizeVideoSplitSecond = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.round(parsed * 100) / 100);
};

export const normalizeVideoSplitSegments = (segments, durationSec = 0) => {
  const safeDuration = normalizeVideoSplitSecond(durationSec, 0);
  const normalized = (Array.isArray(segments) ? segments : [])
    .map((item) => {
      const startSec = normalizeVideoSplitSecond(item?.startSec, 0);
      const rawEndSec = normalizeVideoSplitSecond(item?.endSec, startSec + 1);
      const endSec = safeDuration > 0 ? Math.min(rawEndSec, safeDuration) : rawEndSec;
      return {
        startSec,
        endSec,
      };
    })
    .filter((item) => item.endSec > item.startSec);

  return normalized;
};

// ---- Node ready check ----
export const checkNodeReady = (node, nodes, connections) => {
  if (node.type === NODE_TYPES.INPUT) return (node.data.images?.length || 0) > 0;
  if (node.type === NODE_TYPES.TEXT_INPUT) return (node.data.text?.length || 0) > 0;
  if (node.type === NODE_TYPES.STORYBOARD_INPUT) return String(node.data?.status || "idle") === "success";
  if (node.type === NODE_TYPES.STORYBOARD_PLAN) return true;
  if (node.type === NODE_TYPES.ROLE_INPUT) return Boolean(node.data.personaId || node.data.referenceImage || node.data.text);
  if (node.type === NODE_TYPES.ROLE_STRUCTURER) {
    return Boolean(
      String(node.data.roleName || "").trim() ||
        String(node.data.characterSetting || "").trim() ||
        String(node.data.relationshipNetwork || "").trim() ||
        String(node.data.worldviewBackground || "").trim()
    );
  }
  if (node.type === NODE_TYPES.OUTPUT) return true;

  const inputConns = connections.filter((c) => c.to === node.id);
  if (node.type === NODE_TYPES.VIDEO_GEN && node.data.mode === "img2video" && node.data.firstLastFrameOnly) {
    const mainSourceNodes = inputConns
      .filter((c) => normalizeConnectionTargetHandle(c.toHandle) !== VIDEO_GEN_INPUT_HANDLE_LAST_FRAME)
      .map((c) => nodes.find((n) => n.id === c.from))
      .filter(Boolean);
    const hasMainImage = mainSourceNodes.some((n) => (n.data.images?.length || 0) > 0 || (n.data.uploadedImages?.length || 0) > 0);
    const hasPrompt = mainSourceNodes.some((n) => (n.data.text?.length || 0) > 0) || buildCanvasNodePrompt(node).length > 0;
    return hasMainImage && hasPrompt;
  }
  const sourceNodes = inputConns.map((c) => nodes.find((n) => n.id === c.from)).filter(Boolean);

  const hasUpstreamImages = sourceNodes.some((n) => (n.data.images?.length || 0) > 0 || (n.data.uploadedImages?.length || 0) > 0);
  const hasUpstreamText = sourceNodes.some((n) => (n.data.text?.length || 0) > 0);
  const hasLocalImages = (node.data.uploadedImages?.length || 0) > 0;
  const hasInternalPrompt = buildCanvasNodePrompt(node).length > 0;

  if (node.data.mode === "text2img" || node.data.mode === "local_text2img" || node.data.mode === "text2video") return hasUpstreamText || hasInternalPrompt;
  if (node.data.mode === "multi_image_generate") return hasUpstreamImages || hasLocalImages;
  if (node.data.mode === "img2video" || node.data.mode === "local_img2video") return hasUpstreamImages;
  return hasUpstreamImages;
};
