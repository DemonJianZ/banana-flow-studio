import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { viewAIChatModelParams, viewAIChatModels, AI_CHAT_PART_ENUM_6 } from "../api/aiChat";
import { AI_CHAT_IMAGE_MODEL_ID_NANO_BANANA2 } from "../config";
import { EMPTY_LIST, NODE_TYPES } from "../constants/workbench.jsx";
import { findAIChatModelIdByKeywords } from "../lib/aiChatModelResolver";
import { extractModelParamList } from "../lib/workbenchHelpers.js";
import {
  DEFAULT_AI_MODELS,
  DEFAULT_VIDEO_MODELS,
  DEPRECATED_VIDEO_MODEL_IDS,
  buildAIChatModelOptions,
  filterDeprecatedImageModels,
  getDefaultImageModelId,
  getDefaultVideoModelId,
  isDeprecatedImageModel,
} from "../lib/modelHelpers.js";

const AI_CHAT_PART_ENUM_LANGUAGE = 1;
const AI_CHAT_PART_ENUM_IMAGE = 2;
const AI_CHAT_PART_ENUM_VIDEO = 3;
const AI_CHAT_MODELS_CACHE_KEY = "bananaflow_ai_chat_models_v1";
const AI_CHAT_MODEL_PARAMS_CACHE_KEY = "bananaflow_ai_chat_model_params_v1";
const AI_CHAT_MODEL_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function readStorageJson(key) {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`[aiChat:cache] read failed (${key})`, error);
    return null;
  }
}

function writeStorageJson(key, value) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`[aiChat:cache] write failed (${key})`, error);
  }
}

function isFreshCacheTimestamp(updatedAt) {
  const timestamp = Number(updatedAt || 0);
  return timestamp > 0 && Date.now() - timestamp <= AI_CHAT_MODEL_CACHE_TTL_MS;
}

function normalizeCachedAIChatModels(payload, { allowExpired = false } = {}) {
  const updatedAt = Number(payload?.updatedAt || 0);
  if (!allowExpired && !isFreshCacheTimestamp(updatedAt)) return null;
  const models = payload?.models;
  if (!models || typeof models !== "object") return null;
  return {
    updatedAt,
    models: {
      language: Array.isArray(models.language) ? models.language : EMPTY_LIST,
      image: Array.isArray(models.image) ? models.image : EMPTY_LIST,
      video: Array.isArray(models.video) && models.video.length ? models.video : DEFAULT_VIDEO_MODELS,
    },
    videoEnhance: Array.isArray(payload?.videoEnhance) ? payload.videoEnhance : EMPTY_LIST,
  };
}

function readCachedAIChatModels(options) {
  return normalizeCachedAIChatModels(readStorageJson(AI_CHAT_MODELS_CACHE_KEY), options);
}

function writeCachedAIChatModels({ language, image, video, videoEnhance }) {
  writeStorageJson(AI_CHAT_MODELS_CACHE_KEY, {
    version: 1,
    updatedAt: Date.now(),
    models: { language, image, video },
    videoEnhance: Array.isArray(videoEnhance) ? videoEnhance : EMPTY_LIST,
  });
}

function getInitialAIChatModels() {
  return readCachedAIChatModels({ allowExpired: true })?.models || {
    language: EMPTY_LIST,
    image: EMPTY_LIST,
    video: DEFAULT_VIDEO_MODELS,
  };
}

function readCachedAIChatModelParams() {
  const payload = readStorageJson(AI_CHAT_MODEL_PARAMS_CACHE_KEY);
  const paramsByModelId = payload?.paramsByModelId;
  const cache = new Map();
  if (!paramsByModelId || typeof paramsByModelId !== "object") return cache;
  Object.entries(paramsByModelId).forEach(([modelId, record]) => {
    const normalizedModelId = String(modelId || "").trim();
    if (!normalizedModelId || !isFreshCacheTimestamp(record?.updatedAt)) return;
    const list = Array.isArray(record?.list) ? record.list : null;
    if (!list) return;
    cache.set(normalizedModelId, list);
  });
  return cache;
}

function writeCachedAIChatModelParams(cache) {
  const paramsByModelId = {};
  const updatedAt = Date.now();
  cache.forEach((list, modelId) => {
    const normalizedModelId = String(modelId || "").trim();
    if (!normalizedModelId || !Array.isArray(list)) return;
    paramsByModelId[normalizedModelId] = { updatedAt, list };
  });
  writeStorageJson(AI_CHAT_MODEL_PARAMS_CACHE_KEY, {
    version: 1,
    updatedAt,
    paramsByModelId,
  });
}

export function useWorkbenchAiModels({
  apiFetch,
  nodes,
  setNodes,
  pushApiDebugDetail,
  updateApiDebugStatus,
}) {
  const [aiChatModels, setAiChatModels] = useState(getInitialAIChatModels);
  const aiChatModelParamsCacheRef = useRef(null);
  if (!aiChatModelParamsCacheRef.current) {
    aiChatModelParamsCacheRef.current = readCachedAIChatModelParams();
  }

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

  const resolveModelParamsForId = useCallback(
    async (modelId) => {
      const normalizedModelId = String(modelId || "").trim();
      if (!normalizedModelId) return EMPTY_LIST;
      const cached = aiChatModelParamsCacheRef.current.get(normalizedModelId);
      if (cached) {
        updateApiDebugStatus("modelParams", {
          status: "success",
          message: `本地缓存 id=${normalizedModelId}, params=${cached.length}`,
        });
        return cached;
      }
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
      writeCachedAIChatModelParams(aiChatModelParamsCacheRef.current);
      updateApiDebugStatus("modelParams", {
        status: "success",
        message: `id=${normalizedModelId}, params=${list.length}`,
      });
      return list;
    },
    [apiFetch, pushApiDebugDetail, updateApiDebugStatus],
  );

  useEffect(() => {
    const freshCached = readCachedAIChatModels();
    if (freshCached) {
      setAiChatModels(freshCached.models);
      updateApiDebugStatus("modelsLang", {
        status: "success",
        message: `本地缓存 语言模型 ${freshCached.models.language.length}`,
      });
      updateApiDebugStatus("modelsImage", {
        status: "success",
        message: `本地缓存 图片模型 ${freshCached.models.image.length}`,
      });
      updateApiDebugStatus("modelsVideo", {
        status: "success",
        message: `本地缓存 视频模型 ${freshCached.models.video.length}`,
      });
      updateApiDebugStatus("modelsVideoEnhance", {
        status: "success",
        message: `本地缓存 视频超清模型 ${freshCached.videoEnhance.length}`,
      });
      return undefined;
    }

    const staleCached = readCachedAIChatModels({ allowExpired: true });
    if (staleCached) {
      setAiChatModels(staleCached.models);
    }

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
        AI_CHAT_PART_ENUM_LANGUAGE,
        staleCached?.models.language || EMPTY_LIST,
        "modelsLang",
        "语言",
      );
      if (cancelled || controller.signal.aborted) return;
      const image = await requestModelsWithTimeout(
        AI_CHAT_PART_ENUM_IMAGE,
        staleCached?.models.image || EMPTY_LIST,
        "modelsImage",
        "图片",
      );
      if (cancelled || controller.signal.aborted) return;
      const video = await requestModelsWithTimeout(
        AI_CHAT_PART_ENUM_VIDEO,
        staleCached?.models.video || DEFAULT_VIDEO_MODELS,
        "modelsVideo",
        "视频",
      );
      if (cancelled || controller.signal.aborted) return;
      const videoEnhance = await requestModelsWithTimeout(
        AI_CHAT_PART_ENUM_6,
        staleCached?.videoEnhance || EMPTY_LIST,
        "modelsVideoEnhance",
        "视频超清",
      );
      if (cancelled || controller.signal.aborted) return;

      setAiChatModels({ language, image, video });
      writeCachedAIChatModels({ language, image, video, videoEnhance });
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
  }, [defaultVideoModelId, nodes, setNodes]);

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
  }, [defaultImageModelId, nodes, setNodes]);

  return {
    imageModelRecords,
    imageModelOptions,
    videoModelOptions,
    defaultImageModelId,
    threeViewImageModelId,
    defaultVideoModelId,
    resolveModelParamsForId,
  };
}
