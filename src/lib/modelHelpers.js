/**
 * modelHelpers.js — AI Chat 模型列表处理工具
 * (Phase 8 从 Workbench.jsx 模块顶部迁移)
 *
 * 供 Workbench.jsx useMemo 计算 imageModelOptions / videoModelOptions。
 */
import { Sparkles, Zap, Cpu } from "lucide-react";
import { EMPTY_LIST } from "../constants/workbench.jsx";

// ─── Deprecated model lists ───────────────────────────────────────────────────

export const DEFAULT_AI_MODELS = [];

export const DEPRECATED_IMAGE_MODEL_IDS = new Set([
  "gemini-3-pro-image-preview",
  "doubao-seedream-4.5",
]);

export const DEPRECATED_IMAGE_MODEL_NAMES = new Set([
  "gemini 3 pro",
  "doubao 4.5",
]);

export const DEFAULT_VIDEO_MODELS = [];

export const DEPRECATED_VIDEO_MODEL_IDS = new Set([
  "Doubao-Seedance-1.0-pro",
  "Doubao-Seedance-1.5-pro",
]);

export const DEFAULT_IMAGE_MODEL_ID = DEFAULT_AI_MODELS[0]?.id || "";
export const DEFAULT_VIDEO_MODEL_ID = DEFAULT_VIDEO_MODELS[0]?.id || "";

// ─── Model record normalisation helpers ──────────────────────────────────────

const pickModelField = (record, keys) => {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
};

const resolveAIChatModelVendor = (record) =>
  pickModelField(record, ["vendor","vendor_name","provider","provider_name","company","company_name","platform","platform_name","source"]);

const resolveAIChatModelIcon = (record) => {
  const vendor = resolveAIChatModelVendor(record).toLowerCase();
  const modelId = pickModelField(record, ["model","model_id","ai_chat_model","ai_chat_model_id","id"]).toLowerCase();
  if (vendor.includes("google") || modelId.includes("gemini")) return Sparkles;
  if (vendor.includes("byte") || vendor.includes("doubao") || modelId.includes("doubao") || modelId.includes("seed")) return Zap;
  return Cpu;
};

export const normalizeAIChatModelOption = (record, fallback = {}) => {
  if (typeof record === "string") {
    const value = record.trim();
    return value ? { id: value, name: value, vendor: fallback.vendor || "", icon: fallback.icon || Cpu } : null;
  }
  if (!record || typeof record !== "object") return null;
  const id = pickModelField(record, ["model","model_id","ai_chat_model","ai_chat_model_id","id","value","code"]);
  const name = pickModelField(record, ["ai_model_name","model_name","ai_chat_model_name","name","label","title","text","desc"]);
  if (!id && !name) return null;
  return {
    id: id || name,
    name: name || id,
    vendor: resolveAIChatModelVendor(record) || fallback.vendor || "",
    icon: fallback.icon || resolveAIChatModelIcon(record),
  };
};

export const extractAIChatModelRecords = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return EMPTY_LIST;
  const queue = [payload];
  const visited = new Set();
  const preferredKeys = ["list","records","items","rows","models","model_list","data","result"];
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

export const buildAIChatModelOptions = (payload, fallbackOptions) => {
  const normalized = extractAIChatModelRecords(payload).map((item) => normalizeAIChatModelOption(item)).filter(Boolean);
  if (!normalized.length) return fallbackOptions;
  const seen = new Set();
  return normalized.filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
};

export const getDefaultImageModelId = (options, allowFallback = false) => {
  const list = Array.isArray(options) ? options : EMPTY_LIST;
  if (!list.length) return allowFallback ? DEFAULT_IMAGE_MODEL_ID : "";
  const preferred = list.find((item) => String(item?.id || "").trim() === "4");
  return preferred?.id || list[0]?.id || (allowFallback ? DEFAULT_IMAGE_MODEL_ID : "");
};

export const isDeprecatedImageModel = (item) => {
  const id = String(item?.id || item?.value || "").trim().toLowerCase();
  const name = String(item?.name || item?.label || "").trim().toLowerCase();
  return DEPRECATED_IMAGE_MODEL_IDS.has(id) || DEPRECATED_IMAGE_MODEL_NAMES.has(name);
};

export const filterDeprecatedImageModels = (items = EMPTY_LIST) =>
  (Array.isArray(items) ? items : EMPTY_LIST).filter((item) => !isDeprecatedImageModel(item));

export const getDefaultVideoModelId = (options) => {
  if (!Array.isArray(options) || options.length === 0) return DEFAULT_VIDEO_MODEL_ID;
  return options[0]?.id || DEFAULT_VIDEO_MODEL_ID;
};
