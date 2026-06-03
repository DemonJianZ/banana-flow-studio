/**
 * workbenchHelpers.js — 从 Workbench.jsx 提取的模块级工具函数
 * (Phase 5 迁移)
 *
 * 供 Workbench.jsx（保留部分）和 useCanvasNodeOps.js 共同 import。
 *
 * 包含：
 *   • 视频转线稿参数归一化
 *   • 故事板资产 prompt 构建
 *   • AI 图像/视频 URL 提取
 *   • AI Chat 参数 payload 构建
 *   • 工作台 AI Chat 枚举常量
 *   • 通用错误提取
 */

import {
  EMPTY_LIST,
  stripStoryboardDisplayIds,
  sortParamValues,
  findAIChatParamItem,
  getAIChatParamDisplayValue,
  DEFAULT_VIDEO_LINEART_STRENGTH,
  DEFAULT_VIDEO_LINEART_COLOR,
} from "../constants/workbench.jsx";

import {
  AI_CHAT_PART_ENUM_6,
  AI_CHAT_PART_ENUM_203,
  AI_CHAT_PART_ENUM_204,
  AI_CHAT_PART_ENUM_207,
  AI_CHAT_PART_ENUM_209,
  AI_CHAT_PART_ENUM_210,
  AI_CHAT_PART_ENUM_211,
} from "../api/aiChat";

// ─── Video lineart normalizers ────────────────────────────────────────────────

export const normalizeVideoLineartStrength = (value) => {
  const parsed = parseInt(String(value ?? DEFAULT_VIDEO_LINEART_STRENGTH), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_VIDEO_LINEART_STRENGTH;
  return Math.max(1, Math.min(10, parsed));
};

export const normalizeVideoLineartColor = (value) => {
  const text = String(value || "").trim();
  return text ? text.slice(0, 32) : DEFAULT_VIDEO_LINEART_COLOR;
};

export const normalizeVideoLineartConfig = (value) => {
  const config = value && typeof value === "object" ? value : {};
  return {
    lineStrength: normalizeVideoLineartStrength(config?.lineStrength),
    lineColor: normalizeVideoLineartColor(config?.lineColor),
  };
};

// ─── Storyboard asset prompt helpers ─────────────────────────────────────────

export const buildStoryboardStylePrefix = (storyboardPlan = {}) => {
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

export const buildStoryboardAssetGenerationPrompt = (assetType, asset, storyboardPlan = {}) => {
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

export const normalizeStoryboardAssetCandidates = (value) => {
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

export const resolveStoryboardAssetPrimaryImage = (assetState = {}) => {
  const lockedImageUrl = String(assetState?.lockedImageUrl || "").trim();
  if (lockedImageUrl) return lockedImageUrl;
  const selectedImageUrl = String(assetState?.selectedImageUrl || "").trim();
  if (selectedImageUrl) return selectedImageUrl;
  const candidates = normalizeStoryboardAssetCandidates(assetState?.candidates);
  if (candidates.length) return String(candidates[0]?.url || "").trim();
  const images = Array.isArray(assetState?.images)
    ? assetState.images.map((item) => String(item || "").trim()).filter(Boolean)
    : EMPTY_LIST;
  return images[0] || "";
};

export const buildStoryboardAssetEditPrompt = ({
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
  const referenceHint = referenceImageUrl
    ? "请基于所附参考图继续修改，保持同一主体身份与整体设计连续性。"
    : "请基于现有设定继续细化，不要偏离原主体。";
  if (assetType === "characters") {
    return `${basePrompt}\n${referenceHint}\n仅按以下要求调整该角色，不要改成其他角色，也不要引入新的无关角色或背景事件：${cleanInstruction}`;
  }
  if (assetType === "subjects") {
    return `${basePrompt}\n${referenceHint}\n仅按以下要求调整主体 ${name} 的材质、结构、细节或质感，不要替换成其他物件：${cleanInstruction}`;
  }
  return `${basePrompt}\n${referenceHint}\n仅按以下要求调整场景 ${name} 的环境光线、材质、天气、色调或氛围，不要加入角色动作与剧情：${cleanInstruction}`;
};

// ─── URL pattern constants ────────────────────────────────────────────────────

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

export const pickFirstImageUrl = (payload) => {
  if (!payload) return "";
  if (typeof payload === "string") {
    const text = payload.trim();
    if (!text) return "";
    if (isLikelyImageUrl(text)) return text;
    const markdownImage = text.match(MARKDOWN_IMAGE_PATTERN)?.[1];
    if (markdownImage && isLikelyImageUrl(markdownImage)) return markdownImage.trim();
    if ((text.startsWith("{") && text.endsWith("}")) || (text.startsWith("[") && text.endsWith("]"))) {
      try { const nested = pickFirstImageUrl(JSON.parse(text)); if (nested) return nested; } catch { /* ignore */ }
    }
    return text.match(IMAGE_URL_PATTERN)?.[1] || "";
  }
  if (Array.isArray(payload)) {
    for (const item of payload) { const found = pickFirstImageUrl(item); if (found) return found; }
    return "";
  }
  if (typeof payload !== "object") return "";
  const directKeys = ["image","image_url","imageUrl","image_uri","imageUri","image_path","imagePath","url","uri","src","path","file_url","download_url","cdn_url","oss_url","origin_url","output","result"];
  for (const key of directKeys) { const found = pickFirstImageUrl(payload[key]); if (found) return found; }
  const listKeys = ["images","image_list","image_urls","outputs","results","attachments","files","data","list","items"];
  for (const key of listKeys) { const found = pickFirstImageUrl(payload[key]); if (found) return found; }
  for (const value of Object.values(payload)) { const found = pickFirstImageUrl(value); if (found) return found; }
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

export const pickFirstVideoUrl = (payload) => {
  if (!payload) return "";
  if (typeof payload === "string") {
    const text = payload.trim();
    if (!text) return "";
    if (isLikelyVideoUrl(text)) return text;
    if ((text.startsWith("{") && text.endsWith("}")) || (text.startsWith("[") && text.endsWith("]"))) {
      try { const nested = pickFirstVideoUrl(JSON.parse(text)); if (nested) return nested; } catch { /* ignore */ }
    }
    const matched = text.match(VIDEO_URL_PATTERN) || text.match(URL_PATTERN);
    return isLikelyVideoUrl(matched?.[1] || "") ? matched[1] : "";
  }
  if (Array.isArray(payload)) {
    for (const item of payload) { const found = pickFirstVideoUrl(item); if (found) return found; }
    return "";
  }
  if (typeof payload !== "object") return "";
  const ext = String(payload?.ext || "").trim().toLowerCase();
  if (ext === ".bin" || ext === "bin") {
    const directBinUrl = String(payload?.url || payload?.video_url || payload?.output_video || "").trim();
    if (directBinUrl) return directBinUrl;
  }
  const directKeys = ["video","video_url","videoUrl","video_uri","videoUri","video_path","videoPath","output_video","outputVideo","play_url","playUrl","url","uri","src","path","file_url","download_url","cdn_url","oss_url","origin_url","result","output"];
  for (const key of directKeys) { const found = pickFirstVideoUrl(payload[key]); if (found) return found; }
  const listKeys = ["videos","video_list","video_urls","outputs","results","attachments","files","data","list","items"];
  for (const key of listKeys) { const found = pickFirstVideoUrl(payload[key]); if (found) return found; }
  for (const value of Object.values(payload)) { const found = pickFirstVideoUrl(value); if (found) return found; }
  return "";
};

// ─── AI Chat response helpers ─────────────────────────────────────────────────

export const summarizeAIChatResponse = (resp) => {
  try {
    const raw = JSON.stringify(resp || {});
    if (!raw) return "";
    return raw.length > 240 ? `${raw.slice(0, 240)}...` : raw;
  } catch {
    const text = String(resp || "");
    return text.length > 240 ? `${text.slice(0, 240)}...` : text;
  }
};

export const extractAIChatDoneError = (resp) => {
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

// ─── AI Chat module & part enum constants ────────────────────────────────────

export const WORKBENCH_AI_CHAT_MODULE_ENUM = "3";

export const resolveWorkbenchAIChatPartEnum = ({ mode }) => {
  if (mode === "video_upscale") return AI_CHAT_PART_ENUM_6;
  if (mode === "text2video") return AI_CHAT_PART_ENUM_204;
  if (mode === "img2video") return AI_CHAT_PART_ENUM_204;
  if (mode === "feature_extract") return AI_CHAT_PART_ENUM_207;
  if (mode === "workflow_swap") return AI_CHAT_PART_ENUM_209;
  if (mode === "workflow_batch_video") return AI_CHAT_PART_ENUM_210;
  if (mode === "workflow_batch_wordart") return AI_CHAT_PART_ENUM_211;
  return AI_CHAT_PART_ENUM_203;
};

// ─── AI Chat param payload helpers ───────────────────────────────────────────

const resolveDefaultParamValueId = (paramItem) => {
  const first = sortParamValues(paramItem?.param_values || [])[0];
  const valueId = first?.param_value_id;
  if (valueId === undefined || valueId === null || valueId === "") return "";
  return String(valueId);
};

export const buildAIChatParamPayload = (paramList) => {
  const payload = {};
  for (const item of paramList) {
    const valueId = resolveDefaultParamValueId(item);
    if (!valueId) continue;
    const name = String(item?.param_name || item?.name || item?.desc || "").toLowerCase();
    if (name.includes("任务") || name.includes("task") || name.includes("类型")) { payload.ai_image_param_task_type_id = valueId; continue; }
    if (name.includes("尺寸") || name.includes("size")) { payload.ai_image_param_size_id = valueId; continue; }
    if (name.includes("分辨率") || name.includes("resolution")) { payload.ai_video_param_resolution_id = valueId; continue; }
    if (name.includes("比例") || name.includes("ratio")) { payload.ai_image_param_ratio_id = valueId; continue; }
    if (name.includes("时长") || name.includes("duration")) { payload.ai_video_param_duration_id = valueId; continue; }
    if (name.includes("imagetype") || name.includes("image_type") || name.includes("模式")) { payload.ai_video_param_image_type_id = valueId; }
  }
  return payload;
};

const normalizeAIChatParamMatchText = (text) =>
  String(text || "").trim().toLowerCase()
    .replace(/秒|second|seconds|sec|fps/gi, "")
    .replace(/[（(].*?[）)]/g, "")
    .replace(/\s+/g, "")
    .replace(/_/g, "")
    .replace(/：/g, ":");

export const findAIChatParamValueId = (paramList, keywords = [], preferredValue = "") => {
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
        return normalizedCandidate.includes(normalizedPreferred) || normalizedPreferred.includes(normalizedCandidate);
      });
      if (matched) {
        const id = val?.param_value_id;
        return id === undefined || id === null || id === "" ? "" : String(id);
      }
    }
  }
  return "";
};

// ─── Three-view generation constants ─────────────────────────────────────────

export const THREE_VIEW_PROMPT =
  "A character turnaround sheet on a pure white background, arranged horizontally from left to right: close-up portrait of the face, left side full-body view, front full-body view, back full-body view. Keep the subject's original appearance, hairstyle, outfit, proportions, and design details exactly consistent with the input image. Full-body shots for the side, front, and back views. The face close-up should clearly show the character's facial features and expression. No extra characters, no chibi figure, no additional objects, clean white background, character design sheet style.";

export const THREE_VIEW_DEFAULT_TEMPLATES = {
  size: "1K",
  aspect_ratio: "16:9",
  note: "",
};

// ─── Modes that skip app-level auth (use skipAuth: true on apiFetch) ─────────

export const MODES_WITHOUT_APP_AUTH = new Set([
  "bg_replace",
  "gesture_swap",
  "product_swap",
  "local_text2img",
  "rmbg",
  "feature_extract",
  "multi_angleshots",
]);

// ─── Abort error detection ────────────────────────────────────────────────────

export const isAbortLikeError = (error) => {
  const name = String(error?.name || "").toLowerCase();
  const message = String(error?.message || error || "").toLowerCase();
  return name === "aborterror" || message.includes("aborted") || message.includes("已取消");
};

// ─── Multi-angle output variants ─────────────────────────────────────────────

export const MULTI_ANGLE_VARIANTS = [
  { key: "close_up",    label: "特写",   prompt: "Turn the camera to a close-up.",                    seed: "304838848282290",  filename_prefix: "ComfyUI-close_up" },
  { key: "wide_shot",   label: "广角",   prompt: "Turn the camera to a wide-angle lens.",              seed: "171478573572619",  filename_prefix: "ComfyUI-wide_shot" },
  { key: "45_right",   label: "右 45°", prompt: "Rotate the camera 45 degrees to the right.",        seed: "1085411248135824", filename_prefix: "ComfyUI-45_right" },
  { key: "90_right",   label: "右 90°", prompt: "Rotate the camera 90 degrees to the right.",        seed: "1055668484280226", filename_prefix: "ComfyUI-90_right" },
  { key: "aerial_view", label: "俯视",   prompt: "Turn the camera to an aerial view.",                seed: "1118480615401224", filename_prefix: "ComfyUI-aerial_view" },
  { key: "low_angle",  label: "低角度", prompt: "Turn the camera to a low-angle view.",               seed: "490672281762243",  filename_prefix: "ComfyUI-low_angle" },
  { key: "45_left",    label: "左 45°", prompt: "Rotate the camera 45 degrees to the left.",         seed: "850991843243451",  filename_prefix: "ComfyUI-45_left" },
  { key: "90_left",    label: "左 90°", prompt: "Rotate the camera 90 degrees to the left.",         seed: "1039279712437261", filename_prefix: "ComfyUI-90_left" },
];

// ─── AI Chat error formatting ────────────────────────────────────────────────

export const formatAIChatErrorMessage = (error) => {
  const messageCandidates = [
    error?.message,
    error?.data?.message,
    error?.data?.detail,
    error?.data?.errMsg,
    error?.data?.data?.message,
  ];
  const baseMessage = messageCandidates.find((v) => typeof v === "string" && v.trim());
  const parts = [];
  if (baseMessage) parts.push(baseMessage.trim());
  if (error?.status !== undefined && error?.status !== null) parts.push(`status=${error.status}`);
  if (error?.errNo !== undefined && error?.errNo !== null) parts.push(`err_no=${error.errNo}`);
  if (error?.source) parts.push(`source=${error.source}`);
  if (error?.path) parts.push(`path=${error.path}`);
  if (parts.length > 0) return parts.join(" | ");
  return "未知错误（无错误信息）";
};

// ─── Video gen first/last frame reference detection ──────────────────────────

const normalizeImageTypeOptionText = (value) =>
  String(value || "").trim().toLowerCase().replace(/\s+/g, "");

export const isFirstLastFrameReferenceSelection = (selectedValue, options = EMPTY_LIST) => {
  const normalizedSelected = normalizeImageTypeOptionText(selectedValue);
  if (!normalizedSelected) return false;
  if (normalizedSelected === "2" || normalizedSelected.includes("首尾帧")) return true;
  const matchedOption = (Array.isArray(options) ? options : []).find((item) => {
    const optionValue = normalizeImageTypeOptionText(item?.value);
    const optionLabel = normalizeImageTypeOptionText(item?.label);
    return optionValue === normalizedSelected || optionLabel === normalizedSelected;
  });
  const descriptors = [selectedValue, matchedOption?.label, matchedOption?.value]
    .map(normalizeImageTypeOptionText).filter(Boolean);
  return descriptors.some(
    (text) =>
      text.includes("首尾帧") || text.includes("首帧尾帧") ||
      (text.includes("first") && text.includes("last")) ||
      (text.includes("last") && text.includes("frame")) ||
      (text.includes("end") && text.includes("frame"))
  );
};

// ─── Agent route / debug helpers ─────────────────────────────────────────────
// NOTE: Originally defined at Workbench.jsx module scope; restored Phase 7 bug-fix.

export const buildRouteDebug = (route, backendCalled, backendDecision = null) => ({
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

export const getDecisionLabel = (action) => {
  const m = { answer_only: "直接回答", clarify: "澄清", tool_call: "工具调用", canvas_plan: "画布规划", workflow_plan: "工作流规划" };
  return m[action] || String(action || "-");
};

const CANVAS_CLARIFY_THOUGHT_PREFIX = "clarify_missing_prompt:";

export const parseCanvasClarification = (response) => {
  const thought = String(response?.thought || "").trim();
  if (!thought.startsWith(CANVAS_CLARIFY_THOUGHT_PREFIX)) return null;
  const mode = thought.slice(CANVAS_CLARIFY_THOUGHT_PREFIX.length).trim();
  return { mode };
};

// ─── Deep clone (JSON round-trip, safe for plain data objects) ───────────────
// NOTE: Originally defined at Workbench.jsx module scope; restored Phase 7 bug-fix.

export const cloneDeep = (obj) => JSON.parse(JSON.stringify(obj));

// ─── Generic error extractor ──────────────────────────────────────────────────

export const extractApiError = (data) => {
  const d = data?.detail ?? data?.message ?? data;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x?.msg || JSON.stringify(x)).join(" ; ");
  if (d && typeof d === "object") return JSON.stringify(d);
  return String(d);
};
