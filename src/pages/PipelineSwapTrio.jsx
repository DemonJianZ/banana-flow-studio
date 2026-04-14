import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Download,
  ImagePlus,
  Loader2,
  Play,
  RotateCcw,
  Square,
  Trash2,
  TrendingUp,
  Upload,
  X,
} from "lucide-react";
import { Link } from "../router";
import { useAuth } from "../auth/AuthProvider";
import AiChatAnchorStatusCard from "../components/AiChatAnchorStatusCard";
import { resolveMemberAuthorizationInfo, submitAIChatImageTask, viewAIChatModelParams, viewAIChatModels } from "../api/aiChat";
import { downloadMedia } from "../lib/downloadMedia";
import { AI_CHAT_IMAGE_MODEL_ID_NANO_BANANA2 } from "../config";
import { findAIChatModelIdByKeywords } from "../lib/aiChatModelResolver";

const SWAP_MODE_META = {
  face: {
    value: "face",
    label: "换脸",
    title: "流水线三合一换图",
    subtitle: "批量替换主图内容，可切换换脸/换背景/换装",
    startBtn: "开始换脸",
    refSectionTitle: "参考图添加区域",
    refAddBtn: "添加参考图",
    refEmptyTitle: "拖拽或点击上传参考图",
    refEmptyHint: "支持多张，建议清晰正脸、光线自然",
    promptHint: "用于增强换脸指令，默认已经适配常见场景",
    resultLabel: "换脸结果",
    downloadPrefix: "face-swap",
    defaultPrompt:
      "将主图中的人脸替换为参考图的人脸，保持主图的姿势、光线、背景、服装和整体风格不变，结果自然真实。",
  },
  background: {
    value: "background",
    label: "换背景",
    title: "流水线三合一换图",
    subtitle: "批量替换主图内容，可切换换脸/换背景/换装",
    startBtn: "开始换背景",
    refSectionTitle: "背景参考图添加区域",
    refAddBtn: "添加背景参考图",
    refEmptyTitle: "拖拽或点击上传背景参考图",
    refEmptyHint: "支持多张，建议背景清晰、光线自然",
    promptHint: "用于增强换背景指令，默认已经适配常见场景",
    resultLabel: "换背景结果",
    downloadPrefix: "bg-swap",
    defaultPrompt:
      "将主图中的背景替换为参考图的背景，保持主体、光线、构图和整体风格不变，结果自然真实。",
  },
  outfit: {
    value: "outfit",
    label: "换装",
    title: "流水线三合一换图",
    subtitle: "批量替换主图内容，可切换换脸/换背景/换装",
    startBtn: "开始换装",
    refSectionTitle: "服装参考图添加区域",
    refAddBtn: "添加服装参考图",
    refEmptyTitle: "拖拽或点击上传服装参考图",
    refEmptyHint: "支持多张，建议服装清晰、光线自然",
    promptHint: "用于增强换装指令，默认已经适配常见场景",
    resultLabel: "换装结果",
    downloadPrefix: "outfit-swap",
    defaultPrompt:
      "将主图中的服装替换为参考图的服装，保持人物面部、姿势、光线、背景和整体风格不变，结果自然真实。",
  },
};

const SWAP_MODE_OPTIONS = [
  { value: "face", label: "换脸" },
  { value: "background", label: "换背景" },
  { value: "outfit", label: "换装" },
];
const DEFAULT_VIDEO_PROMPT =
  "画面轻微晃动，镜头产生呼吸感；画面中不出现任何额外元素，商品保持静止。";
const LEGACY_AI_CHAT_IMAGE_MODEL_ID = "4";
const AI_CHAT_I2V_MODEL_ID = "6";
const AI_CHAT_VIDEO_HD_MODEL_ID = "1";
const DEFAULT_VIDEO_DURATION = 3;
const DEFAULT_VIDEO_RESOLUTION = "1080p";
const AI_CHAT_WORKFLOW_MODULE_ENUM = "3";
const AI_CHAT_IMAGE_PART_ENUM = "203";
const AI_CHAT_VIDEO_PART_ENUM = "204";
const AI_CHAT_VIDEO_HD_PART_ENUM = "215";
const MOTION_FAILURE_MESSAGE = "当前网络波动或请求超时，请稍后重试。";
const VIDEO_HD_TEMPLATE_ENUM_2K = "1";
const VIDEO_HD_TEMPLATE_ENUM_4K = "2";
const VIDEO_HD_TEMPLATE_OPTIONS = [
  { label: "2K", value: VIDEO_HD_TEMPLATE_ENUM_2K },
  { label: "4K", value: VIDEO_HD_TEMPLATE_ENUM_4K },
];
const MOTION_RESOLUTION_OPTIONS = [
  { label: "480P", value: "480p" },
  { label: "720P", value: "720p" },
  { label: "1080P", value: "1080p" },
];

const generateId = () => Math.random().toString(36).slice(2, 11);

const SIZE_OPTIONS = [
  { label: "1K (1024 x 1024)", value: "1024x1024" },
  { label: "2K (2048 x 2048)", value: "2048x2048" },
  { label: "4K (4096 x 4096)", value: "4096x4096" },
];

const RATIO_OPTIONS = [
  { label: "1:1", value: "1:1" },
  { label: "4:3", value: "4:3" },
  { label: "3:4", value: "3:4" },
  { label: "16:9", value: "16:9" },
  { label: "9:16", value: "9:16" },
  { label: "21:9", value: "21:9" },
];
const MAX_CONCURRENT = 2;

const extractApiError = (data) => {
  const d = data?.detail ?? data?.message ?? data;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x?.msg || JSON.stringify(x)).join(" ; ");
  if (d && typeof d === "object") return JSON.stringify(d);
  return String(d);
};



const extractAiChatDoneErrMsg = (rawText = "") => {
  const text = String(rawText || "").trim();
  if (!text) return "";
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines) {
    if (!line.startsWith("{") || !line.endsWith("}")) continue;
    try {
      const payload = JSON.parse(line);
      const finish = payload?.finish;
      const errMsg = String(payload?.errMsg || payload?.message || payload?.detail || "").trim();
      if ((finish === true || String(finish).toLowerCase() === "true") && errMsg) {
        return errMsg;
      }
    } catch {
      // ignore non-json lines
    }
  }
  return "";
};

const buildFriendlyErrorMessage = (error, actionLabel = "任务处理") => {
  const raw = String(error?.message || error || "").trim();
  const aiChatErrMsg = extractAiChatDoneErrMsg(raw);
  const userFacingErrMsg = aiChatErrMsg || raw;
  if (userFacingErrMsg) {
    return `${actionLabel}失败：${userFacingErrMsg}`;
  }

  const lower = raw.toLowerCase();
  const isSensitive = /(敏感|违规|违法|违禁|unsafe|policy|forbidden|blocked|审核|内容安全)/i.test(raw);
  const isTimeout = /(timeout|timed out|超时|deadline|504|408|time limit)/i.test(raw);
  const isNetwork = /(network|failed to fetch|err_network|ecconn|断网|网络|连接失败|socket|dns)/i.test(raw);

  let headline = `${actionLabel}失败，请稍后重试。`;
  if (isSensitive) {
    headline = `${actionLabel}失败：可能触发内容安全限制，请调整提示词或文件后重试。`;
  } else if (isTimeout || isNetwork || lower.includes("abort")) {
    headline = `${actionLabel}失败：当前网络波动或请求超时，请稍后重试。`;
  }
  return headline;
};

const normalizeText = (value) => String(value || "").trim().toLowerCase();

const sortParamValues = (values) => {
  const list = Array.isArray(values) ? values.slice() : [];
  list.sort((a, b) => {
    const ai = Number(a?.order_index ?? Number.MAX_SAFE_INTEGER);
    const bi = Number(b?.order_index ?? Number.MAX_SAFE_INTEGER);
    return ai - bi;
  });
  return list;
};

const findAIChatParamItem = (paramList, aliases = []) => {
  const keywords = aliases.map((item) => String(item || "").toLowerCase()).filter(Boolean);
  if (!keywords.length) return null;
  for (const item of Array.isArray(paramList) ? paramList : []) {
    const name = String(item?.param_name || item?.name || item?.desc || "").toLowerCase();
    if (!name) continue;
    if (keywords.some((keyword) => name.includes(keyword))) return item;
  }
  return null;
};

const getAIChatParamDisplayValue = (paramValue) => {
  const remark = String(paramValue?.remark || "").trim();
  const value = String(paramValue?.param_value || "").trim();
  return remark || value;
};

const findAIChatParamValueId = (paramList, aliases = [], selectedValue = "") => {
  const target = normalizeText(selectedValue);
  if (!target) return "";
  const item = findAIChatParamItem(paramList, aliases);
  if (!item) return "";
  const normalizeMatchText = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/秒|second|seconds|sec|fps/gi, "")
      .replace(/[（(].*?[）)]/g, "")
      .replace(/\s+/g, "")
      .replace(/_/g, "")
      .replace(/：/g, ":");
  const normalizedTarget = normalizeMatchText(target);
  const useStrictNormalizedMatch =
    /^[0-9]+$/.test(normalizedTarget) ||
    /^[0-9]+:[0-9]+$/.test(normalizedTarget) ||
    /^[0-9]+p$/.test(normalizedTarget);
  const values = sortParamValues(item?.param_values || []);
  for (const paramValue of values) {
    const candidates = [
      String(paramValue?.param_value_id || "").trim().toLowerCase(),
      String(paramValue?.param_value || "").trim().toLowerCase(),
      String(paramValue?.remark || "").trim().toLowerCase(),
    ].filter(Boolean);
    if (candidates.includes(target)) {
      const id = paramValue?.param_value_id;
      if (id === undefined || id === null || id === "") return "";
      return String(id);
    }
    const matched = candidates.some((candidate) => {
      const normalizedCandidate = normalizeMatchText(candidate);
      if (!normalizedCandidate || !normalizedTarget) return false;
      if (normalizedCandidate === normalizedTarget) return true;
      if (useStrictNormalizedMatch) return false;
      return (
        normalizedCandidate.includes(normalizedTarget) ||
        normalizedTarget.includes(normalizedCandidate)
      );
    });
    if (matched) {
      const id = paramValue?.param_value_id;
      if (id === undefined || id === null || id === "") return "";
      return String(id);
    }
  }
  return "";
};

const listAIChatParamChoiceOptions = (paramList, aliases = []) => {
  const item = findAIChatParamItem(paramList, aliases);
  if (!item) return [];
  return sortParamValues(item?.param_values || [])
    .map((paramValue) => {
      const label = getAIChatParamDisplayValue(paramValue);
      if (!label) return null;
      return { value: label, label };
    })
    .filter(Boolean);
};

const pickFirstImageUrl = (payload) => {
  if (!payload) return "";
  if (typeof payload === "string") {
    const matched = payload.match(/https?:\/\/[^\s"'<>]+/i);
    return matched?.[0] || "";
  }
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = pickFirstImageUrl(item);
      if (found) return found;
    }
    return "";
  }
  if (typeof payload === "object") {
    const directKeys = ["image_url", "imageUrl", "url", "image", "output_url", "outputUrl", "result_url", "resultUrl"];
    for (const key of directKeys) {
      const found = pickFirstImageUrl(payload[key]);
      if (found) return found;
    }
    for (const value of Object.values(payload)) {
      const found = pickFirstImageUrl(value);
      if (found) return found;
    }
  }
  return "";
};

const pickFirstVideoUrl = (payload) => {
  const normalizeVideoUrl = (raw) => {
    const text = String(raw || "").trim();
    return text || "";
  };
  const isLikelyVideoUrl = (raw) => {
    const text = String(raw || "").trim();
    if (!text) return false;
    if (/^data:video\//i.test(text)) return true;
    if (/\.(mp4|webm|mov|m4v|avi|mkv|m3u8)(?:$|[?#])/i.test(text)) return true;
    if (/video|play_url|output_video|mime=video|content_type=video|hdai_chat/i.test(text)) return true;
    return false;
  };
  if (!payload) return "";
  if (typeof payload === "string") {
    const matched = payload.match(/https?:\/\/[^\s"'<>]+/i);
    const value = matched?.[0] || "";
    return isLikelyVideoUrl(value) ? normalizeVideoUrl(value) : "";
  }
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = pickFirstVideoUrl(item);
      if (found) return found;
    }
    return "";
  }
  if (typeof payload === "object") {
    const ext = String(payload?.ext || "").trim().toLowerCase();
    if (ext === ".bin" || ext === "bin") {
      const directBinUrl = normalizeVideoUrl(payload?.url || payload?.video_url || payload?.output_video || "");
      if (directBinUrl) return directBinUrl;
    }
    const directKeys = ["video_url", "videoUrl", "video", "output_video", "outputVideo", "play_url", "playUrl", "url"];
    for (const key of directKeys) {
      const found = pickFirstVideoUrl(payload[key]);
      if (found) return found;
    }
    for (const value of Object.values(payload)) {
      const found = pickFirstVideoUrl(value);
      if (found) return found;
    }
  }
  return "";
};

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });

const buildResultsSeed = (mainItems, refItems) =>
  mainItems.flatMap((main) =>
    refItems.map((ref) => ({
      id: `${main.id}-${ref.id}`,
      mainId: main.id,
      refId: ref.id,
      inputUrl: main.url,
      inputName: main.name,
      refUrl: ref.url,
      refName: ref.name,
      outputUrl: null,
      status: "pending",
      error: null,
      videoUrl: null,
      videoStatus: "idle",
      videoError: null,
      upscaledVideoUrl: null,
      upscaleStatus: "idle",
      upscaleError: null,
      upscaleTemplateEnum: VIDEO_HD_TEMPLATE_ENUM_2K,
    })),
  );

const PipelineSwapTrio = () => {
  const { apiFetch } = useAuth();
  const [mainImages, setMainImages] = useState([]);
  const [refImages, setRefImages] = useState([]);
  const [swapMode, setSwapMode] = useState("face");
  const [prompt, setPrompt] = useState(SWAP_MODE_META.face.defaultPrompt);
  const [size, setSize] = useState("1024x1024");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [videoResolution, setVideoResolution] = useState(DEFAULT_VIDEO_RESOLUTION);
  const [videoImageType, setVideoImageType] = useState("");
  const [videoImageTypeOptions, setVideoImageTypeOptions] = useState([]);
  const [results, setResults] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [previewImage, setPreviewImage] = useState(null);
  const [previewVideo, setPreviewVideo] = useState(null);
  const [aiChatImageModelId, setAiChatImageModelId] = useState(
    String(AI_CHAT_IMAGE_MODEL_ID_NANO_BANANA2 || "").trim() || LEGACY_AI_CHAT_IMAGE_MODEL_ID,
  );
  const resultsSeedRef = useRef([]);
  const aiChatModelParamsCacheRef = useRef(new Map());
  const aiChatSessionIdRef = useRef("");
  const aiChatHistoryRecordIdRef = useRef("");
  const abortControllerRef = useRef(null);
  const mainInputRef = useRef(null);
  const refInputRef = useRef(null);
  const activeMode = useMemo(() => SWAP_MODE_META[swapMode] || SWAP_MODE_META.face, [swapMode]);

  useEffect(() => {
    if (String(AI_CHAT_IMAGE_MODEL_ID_NANO_BANANA2 || "").trim()) return undefined;

    const controller = new AbortController();
    let cancelled = false;

    const loadNanoBanana2ModelId = async () => {
      try {
        const data = await viewAIChatModels(
          apiFetch,
          { module_enum: Number(AI_CHAT_WORKFLOW_MODULE_ENUM), part_enum: Number(AI_CHAT_IMAGE_PART_ENUM) },
          { signal: controller.signal },
        );
        const resolvedModelId = findAIChatModelIdByKeywords(data);
        if (!cancelled && resolvedModelId) {
          setAiChatImageModelId(resolvedModelId);
        }
      } catch {
        // Keep the legacy model id when nano banana2 cannot be resolved.
      }
    };

    void loadNanoBanana2ModelId();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [apiFetch]);

  useEffect(() => {
    let cancelled = false;

    const loadVideoImageTypeOptions = async () => {
      try {
        let paramList = aiChatModelParamsCacheRef.current.get(AI_CHAT_I2V_MODEL_ID);
        if (!Array.isArray(paramList)) {
          const paramsData = await viewAIChatModelParams(
            apiFetch,
            { ai_chat_model_id: Number(AI_CHAT_I2V_MODEL_ID) || AI_CHAT_I2V_MODEL_ID },
            { preferApiFetchFirst: true },
          );
          paramList = Array.isArray(paramsData?.list)
            ? paramsData.list
            : Array.isArray(paramsData?.data?.list)
              ? paramsData.data.list
              : [];
          aiChatModelParamsCacheRef.current.set(AI_CHAT_I2V_MODEL_ID, paramList);
        }
        if (cancelled) return;
        const nextOptions = listAIChatParamChoiceOptions(paramList, ["imagetype", "image_type", "模式", "参考模式", "参考类型"]);
        setVideoImageTypeOptions(nextOptions);
        setVideoImageType((prev) => {
          const current = String(prev || "").trim();
          if (current && nextOptions.some((option) => option.value === current)) return current;
          return String(nextOptions[0]?.value || "").trim();
        });
      } catch {
        if (!cancelled) {
          setVideoImageTypeOptions([]);
          setVideoImageType("");
        }
      }
    };

    void loadVideoImageTypeOptions();
    return () => {
      cancelled = true;
    };
  }, [apiFetch]);

  const hasReadyInputs = mainImages.length > 0;

  const totalSuccess = useMemo(() => results.filter((item) => item.status === "success").length, [results]);
  const totalFailed = useMemo(
    () => results.filter((item) => item.status === "error" || item.status === "cancelled").length,
    [results],
  );
  const retryableCount = useMemo(
    () => results.filter((item) => item.status === "error" || item.status === "cancelled" || item.status === "pending").length,
    [results],
  );
  const motionTargets = useMemo(
    () => results.filter((item) => item.outputUrl && item.videoStatus !== "running"),
    [results],
  );
  const hasMotionRunning = useMemo(
    () => results.some((item) => item.videoStatus === "running"),
    [results],
  );
  const progressPct = useMemo(() => {
    if (!progress.total) return 0;
    return Math.min(100, Math.round((progress.done / progress.total) * 100));
  }, [progress.done, progress.total]);

  const updateResult = useCallback((id, patch) => {
    setResults((prev) => {
      const base = prev.length ? prev : resultsSeedRef.current;
      if (!base.length) return prev;
      const next = base.map((item) => (item.id === id ? { ...item, ...patch } : item));
      resultsSeedRef.current = next;
      return next;
    });
  }, [resultsSeedRef]);

  const handleMainFiles = useCallback(async (files) => {
    const fileList = Array.from(files || []).filter((file) => file.type.startsWith("image/"));
    if (fileList.length === 0) return;

    const newItems = [];
    for (const file of fileList) {
      const url = await readFileAsDataUrl(file);
      newItems.push({ id: generateId(), name: file.name, url, file });
    }

    setMainImages((prev) => [...prev, ...newItems]);
    setResults([]);
  }, []);

  const handleRefFiles = useCallback(async (files) => {
    const fileList = Array.from(files || []).filter((file) => file.type.startsWith("image/"));
    if (fileList.length === 0) return;

    const newItems = [];
    for (const file of fileList) {
      const url = await readFileAsDataUrl(file);
      newItems.push({ id: generateId(), name: file.name, url, file });
    }

    setRefImages((prev) => [...prev, ...newItems]);
    setResults([]);
  }, []);

  const removeMainImage = useCallback((id) => {
    setMainImages((prev) => prev.filter((item) => item.id !== id));
    setResults((prev) => prev.filter((item) => item.mainId !== id));
  }, []);

  const removeRefImage = useCallback((id) => {
    setRefImages((prev) => prev.filter((item) => item.id !== id));
    setResults((prev) => prev.filter((item) => item.refId !== id));
  }, []);

  const clearMainImages = useCallback(() => {
    setMainImages([]);
    setResults([]);
  }, []);

  const clearRefImages = useCallback(() => {
    setRefImages([]);
    setResults([]);
  }, []);

  const runTasks = useCallback(async (tasks) => {
    if (!tasks.length || isRunning) return;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsRunning(true);
    setError("");
    setProgress({ done: 0, total: tasks.length });

    let cursor = 0;
    const nextTask = () => {
      if (controller.signal.aborted) return null;
      const task = tasks[cursor];
      cursor += 1;
      return task || null;
    };

    const workers = Array.from({ length: Math.min(MAX_CONCURRENT, tasks.length) }, () =>
      (async () => {
        while (true) {
          const task = nextTask();
          if (!task) break;
          updateResult(task.id, {
            status: "running",
            error: null,
            videoUrl: null,
            videoStatus: "idle",
            videoError: null,
            upscaledVideoUrl: null,
            upscaleStatus: "idle",
            upscaleError: null,
            upscaleTemplateEnum: VIDEO_HD_TEMPLATE_ENUM_2K,
          });

          try {
            const promptToUse = prompt?.trim() || activeMode.defaultPrompt;
            const inputImages = task.refUrl ? [task.inputUrl, task.refUrl] : [task.inputUrl];
            const memberAuth = resolveMemberAuthorizationInfo()?.value || "";
            if (!memberAuth) throw new Error("缺少 member authorization，无法调用 ai_chat_image_via_curl");
            if (!aiChatImageModelId) throw new Error("缺少图像模型ID，无法调用 ai_chat_image_via_curl");

            let paramList = aiChatModelParamsCacheRef.current.get(aiChatImageModelId);
            if (!Array.isArray(paramList)) {
              const paramsData = await viewAIChatModelParams(
                apiFetch,
                { ai_chat_model_id: Number(aiChatImageModelId) || aiChatImageModelId },
                { preferApiFetchFirst: true },
              );
              paramList = Array.isArray(paramsData?.list)
                ? paramsData.list
                : Array.isArray(paramsData?.data?.list)
                  ? paramsData.data.list
                  : [];
              aiChatModelParamsCacheRef.current.set(aiChatImageModelId, paramList);
            }

            const proxyPayload = {
              authorization: memberAuth,
              history_ai_chat_record_id: aiChatHistoryRecordIdRef.current || "",
              module_enum: AI_CHAT_WORKFLOW_MODULE_ENUM,
              part_enum: AI_CHAT_IMAGE_PART_ENUM,
              message: promptToUse,
              ai_chat_session_id: aiChatSessionIdRef.current || "",
              ai_chat_model_id: aiChatImageModelId,
              ai_image_param_size_id: findAIChatParamValueId(paramList, ["size", "尺寸"], size),
              ai_image_param_ratio_id: findAIChatParamValueId(paramList, ["ratio", "比例", "宽高比"], aspectRatio),
              images: inputImages,
            };

            const proxyData = await submitAIChatImageTask(apiFetch, proxyPayload, {
              signal: controller.signal,
            });
            if (proxyData?.source_session_id) aiChatSessionIdRef.current = String(proxyData.source_session_id);
            if (proxyData?.source_history_record_id) aiChatHistoryRecordIdRef.current = String(proxyData.source_history_record_id);
            const outputUrl =
              pickFirstImageUrl(proxyData?.image_url) ||
              pickFirstImageUrl(proxyData?.events) ||
              pickFirstImageUrl(proxyData?.text) ||
              "";
            const doneErr = String(proxyData?.done_error || "").trim();
            if (!outputUrl && doneErr) throw new Error(doneErr);
            if (!outputUrl) throw new Error("未返回生成结果");

            updateResult(task.id, {
              status: "success",
              outputUrl,
              error: null,
              videoUrl: null,
              videoStatus: "idle",
              videoError: null,
              upscaledVideoUrl: null,
              upscaleStatus: "idle",
              upscaleError: null,
              upscaleTemplateEnum: VIDEO_HD_TEMPLATE_ENUM_2K,
            });
          } catch (err) {
            if (controller.signal.aborted) {
              updateResult(task.id, { status: "cancelled", error: "任务已取消" });
            } else {
              updateResult(task.id, { status: "error", error: buildFriendlyErrorMessage(err, "图片生成") });
            }
          } finally {
            setProgress((prev) => ({ done: prev.done + 1, total: prev.total }));
          }
        }
      })(),
    );

    await Promise.all(workers);
    abortControllerRef.current = null;
    setIsRunning(false);
  }, [activeMode.defaultPrompt, aiChatImageModelId, apiFetch, aspectRatio, isRunning, prompt, size, updateResult]);

  const handleRun = useCallback(async () => {
    if (isRunning) return;
    if (!hasReadyInputs) {
      setError("请先上传主图");
      return;
    }

    const effectiveRefs = refImages.length > 0 ? refImages : [{ id: "no-ref", name: "无参考图", url: null }];
    const seed = buildResultsSeed(mainImages, effectiveRefs);
    resultsSeedRef.current = seed;
    setResults(seed);
    await runTasks(seed);
  }, [hasReadyInputs, isRunning, mainImages, refImages, runTasks]);

  const handleRetryFailed = useCallback(async () => {
    if (isRunning) return;
    const failed = (resultsSeedRef.current.length ? resultsSeedRef.current : results).filter(
      (item) => item.status === "error" || item.status === "cancelled" || item.status === "pending",
    );
    if (!failed.length) {
      setError("当前没有可重试的失败任务");
      return;
    }
    failed.forEach((item) => updateResult(item.id, { status: "pending", error: null }));
    await runTasks(failed.map((item) => ({ ...item, outputUrl: null })));
  }, [isRunning, results, runTasks, updateResult]);

  const handleCancel = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const handleDropMain = useCallback(
    (event) => {
      event.preventDefault();
      handleMainFiles(event.dataTransfer?.files);
    },
    [handleMainFiles],
  );

  const handleDropRef = useCallback(
    (event) => {
      event.preventDefault();
      handleRefFiles(event.dataTransfer?.files);
    },
    [handleRefFiles],
  );

  const handleGenerateMotion = useCallback(async (item) => {
    if (!item?.outputUrl) return;
    if (item.videoStatus === "running") return;

    updateResult(item.id, { videoStatus: "running", videoError: null });
    try {
      const memberAuth = resolveMemberAuthorizationInfo()?.value || "";
      const selectedRatio = String(aspectRatio || "1:1").trim() || "1:1";
      let outputUrl = "";

      if (memberAuth) {
        try {
          let paramList = aiChatModelParamsCacheRef.current.get(AI_CHAT_I2V_MODEL_ID);
          if (!Array.isArray(paramList)) {
            const paramsData = await viewAIChatModelParams(
              apiFetch,
              { ai_chat_model_id: Number(AI_CHAT_I2V_MODEL_ID) || AI_CHAT_I2V_MODEL_ID },
              { preferApiFetchFirst: true },
            );
            paramList = Array.isArray(paramsData?.list)
              ? paramsData.list
              : Array.isArray(paramsData?.data?.list)
                ? paramsData.data.list
                : [];
            aiChatModelParamsCacheRef.current.set(AI_CHAT_I2V_MODEL_ID, paramList);
          }
          if (!Array.isArray(paramList) || paramList.length === 0) {
            throw new Error("viewAIChatModelParams 未返回有效参数，无法提交图生视频请求");
          }

          const matchedResolutionId = findAIChatParamValueId(paramList, ["resolution", "分辨率"], videoResolution);
          const matchedRatioId = findAIChatParamValueId(
            paramList,
            ["ratio", "比例", "宽高比"],
            selectedRatio,
          );
          const matchedDurationId = findAIChatParamValueId(paramList, ["duration", "时长"], String(DEFAULT_VIDEO_DURATION));
          const selectedImageType = String(videoImageType || "").trim();
          const matchedImageTypeId = selectedImageType
            ? findAIChatParamValueId(paramList, ["imagetype", "image_type", "模式", "参考模式", "参考类型"], selectedImageType)
            : "";

          if (!matchedResolutionId) {
            throw new Error(`未从模型参数中匹配到分辨率: ${videoResolution}`);
          }
          if (!matchedDurationId) {
            throw new Error(`未从模型参数中匹配到时长: ${DEFAULT_VIDEO_DURATION}`);
          }
          if (!matchedRatioId) {
            throw new Error(`未从模型参数中匹配到比例: ${selectedRatio}`);
          }
          if (selectedImageType && !matchedImageTypeId) {
            throw new Error(`未从模型参数中匹配到参考模式: ${selectedImageType}`);
          }

          const proxyPayload = {
            authorization: memberAuth,
            history_ai_chat_record_id: aiChatHistoryRecordIdRef.current || "",
            module_enum: AI_CHAT_WORKFLOW_MODULE_ENUM,
            part_enum: AI_CHAT_VIDEO_PART_ENUM,
            message: DEFAULT_VIDEO_PROMPT,
            ai_chat_session_id: aiChatSessionIdRef.current || "",
            ai_chat_model_id: AI_CHAT_I2V_MODEL_ID,
            async: "0",
            timeout_seconds: 600,
            ai_video_param_resolution_id: matchedResolutionId,
            ai_video_param_duration_id: matchedDurationId,
            ai_video_param_ratio_id: matchedRatioId,
            ...(matchedImageTypeId ? { ai_video_param_image_type_id: matchedImageTypeId } : {}),
            images: [item.outputUrl],
          };

          const proxyData = await submitAIChatImageTask(apiFetch, proxyPayload);
          if (proxyData?.source_session_id) aiChatSessionIdRef.current = String(proxyData.source_session_id);
          if (proxyData?.source_history_record_id) aiChatHistoryRecordIdRef.current = String(proxyData.source_history_record_id);
          outputUrl =
            pickFirstVideoUrl(proxyData?.video_url) ||
            pickFirstVideoUrl(proxyData?.output_video) ||
            pickFirstVideoUrl(proxyData?.events) ||
            pickFirstVideoUrl(proxyData?.text) ||
            pickFirstVideoUrl(proxyData) ||
            pickFirstImageUrl(proxyData?.image_url) ||
            pickFirstImageUrl(proxyData?.events) ||
            pickFirstImageUrl(proxyData?.text) ||
            pickFirstImageUrl(proxyData) ||
            "";
          const doneErr = String(proxyData?.done_error || "").trim();
          if (!outputUrl && doneErr) throw new Error(doneErr);
        } catch {
          outputUrl = "";
        }
      }

      if (!outputUrl) {
        const resp = await apiFetch(`/api/img2video`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(memberAuth ? { "X-AI-Chat-Authorization": memberAuth } : {}),
          },
          body: JSON.stringify({
            model: "Doubao-Seedance-1.0-pro",
            image: item.outputUrl,
            last_frame_image: null,
            prompt: DEFAULT_VIDEO_PROMPT,
            duration: DEFAULT_VIDEO_DURATION,
            fps: 24,
            camera_fixed: false,
            resolution: videoResolution,
            ratio: selectedRatio,
            seed: 21,
          }),
        });

        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(extractApiError(data));
        outputUrl = data.video || data.image || data.images?.[0];
      }
      if (!outputUrl) throw new Error("未返回动图结果");
      updateResult(item.id, {
        videoStatus: "success",
        videoUrl: outputUrl,
        videoError: null,
        upscaledVideoUrl: null,
        upscaleStatus: "idle",
        upscaleError: null,
        upscaleTemplateEnum: item.upscaleTemplateEnum || VIDEO_HD_TEMPLATE_ENUM_2K,
      });
    } catch (err) {
      updateResult(item.id, { videoStatus: "error", videoError: MOTION_FAILURE_MESSAGE });
    }
  }, [apiFetch, aspectRatio, updateResult, videoImageType, videoResolution]);

  const handleUpscaleVideo = useCallback(async (item) => {
    if (!item?.videoUrl) return;
    if (item.upscaleStatus === "running") return;

    const selectedTemplateEnum = String(item.upscaleTemplateEnum || VIDEO_HD_TEMPLATE_ENUM_2K);
    updateResult(item.id, { upscaleStatus: "running", upscaleError: null });
    try {
      const memberAuth = resolveMemberAuthorizationInfo()?.value || "";
      if (!memberAuth) throw new Error("缺少会员授权，无法执行视频超清");

      const proxyPayload = {
        authorization: memberAuth,
        module_enum: AI_CHAT_WORKFLOW_MODULE_ENUM,
        part_enum: AI_CHAT_VIDEO_HD_PART_ENUM,
        ai_chat_model_id: AI_CHAT_VIDEO_HD_MODEL_ID,
        message: "视频画质增强",
        template_enum: selectedTemplateEnum,
        async: "false",
        files: [item.videoUrl],
      };

      const proxyData = await submitAIChatImageTask(apiFetch, proxyPayload);
      if (proxyData?.source_session_id) aiChatSessionIdRef.current = String(proxyData.source_session_id);
      if (proxyData?.source_history_record_id) aiChatHistoryRecordIdRef.current = String(proxyData.source_history_record_id);
      const outputUrl =
        pickFirstVideoUrl(proxyData?.video_url) ||
        pickFirstVideoUrl(proxyData?.output_video) ||
        pickFirstVideoUrl(proxyData?.events) ||
        pickFirstVideoUrl(proxyData?.text) ||
        pickFirstVideoUrl(proxyData) ||
        pickFirstImageUrl(proxyData?.image_url) ||
        pickFirstImageUrl(proxyData?.events) ||
        pickFirstImageUrl(proxyData?.text) ||
        pickFirstImageUrl(proxyData) ||
        "";
      const doneErr = String(proxyData?.done_error || "").trim();
      if (!outputUrl && doneErr) throw new Error(doneErr);
      if (!outputUrl) throw new Error("未返回超清视频结果");

      updateResult(item.id, {
        upscaledVideoUrl: outputUrl,
        upscaleStatus: "success",
        upscaleError: null,
        upscaleTemplateEnum: selectedTemplateEnum,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err || "视频超清失败");
      updateResult(item.id, { upscaleStatus: "error", upscaleError: message });
    }
  }, [apiFetch, updateResult]);

  const handleGenerateAllMotion = useCallback(async () => {
    if (motionTargets.length === 0) return;
    await Promise.allSettled(motionTargets.map((item) => handleGenerateMotion(item)));
  }, [handleGenerateMotion, motionTargets]);

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      <header className="px-4 sm:px-6 py-4 border-b border-slate-800 bg-slate-900/60">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Link to="/app" className="flex items-center gap-2 text-slate-400 hover:text-white text-sm">
            <ArrowLeft className="w-4 h-4" />
            返回工作台
          </Link>
          <div className="w-px h-5 bg-slate-800" />
          <div>
            <h1 className="text-lg font-bold">{activeMode.title}</h1>
            <p className="text-xs text-slate-400">{activeMode.subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <div className="text-xs text-slate-400">
            {progress.total > 0 ? `进度 ${progress.done}/${progress.total} (${progressPct}%)` : "等待任务"}
          </div>
          {isRunning && (
            <button
              onClick={handleCancel}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-amber-500/50 text-amber-200 bg-amber-500/10 hover:bg-amber-500/15 transition-colors"
            >
              <Square className="w-3.5 h-3.5" />
              取消
            </button>
          )}
          <button
            onClick={handleRetryFailed}
            disabled={isRunning || retryableCount === 0}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
              !isRunning && retryableCount > 0
                ? "bg-slate-800 border-slate-700 hover:border-purple-500 hover:text-white"
                : "bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed"
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            重试失败
          </button>
          <button
            onClick={handleRun}
            disabled={!hasReadyInputs || isRunning}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
              hasReadyInputs && !isRunning
                ? "bg-purple-600 border-purple-500 hover:bg-purple-500"
                : "bg-slate-800 border-slate-700 text-slate-500 cursor-not-allowed"
            }`}
          >
            {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {isRunning ? "处理中" : activeMode.startBtn}
          </button>
        </div>
        </div>
      </header>

      <div className="flex-1 px-6 py-6 space-y-6">
        {progress.total > 0 && (
          <div className="space-y-1.5" aria-live="polite">
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-purple-500 transition-all duration-300" style={{ width: `${progressPct}%` }} />
            </div>
            <div className="text-[11px] text-slate-400">
              成功 {totalSuccess} · 失败 {totalFailed} · 总计 {progress.total}
            </div>
          </div>
        )}
        {error && (
          <div className="flex items-start gap-2 bg-red-950/60 border border-red-800 text-red-200 px-4 py-2 rounded-lg text-sm whitespace-pre-line">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section
            className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col gap-4"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDropMain}
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">主图添加区域</h2>
                <p className="text-xs text-slate-500">支持批量上传，多图将自动依次处理</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => mainInputRef.current?.click()}
                  className="text-xs px-3 py-1.5 rounded-md bg-slate-800 border border-slate-700 hover:border-purple-500 hover:text-white transition-colors"
                >
                  <Upload className="w-3 h-3 inline-block mr-1" />
                  添加图片
                </button>
                <button
                  onClick={clearMainImages}
                  disabled={mainImages.length === 0}
                  className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                    mainImages.length
                      ? "bg-slate-800 border-slate-700 hover:border-red-500 hover:text-white"
                      : "bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed"
                  }`}
                >
                  <Trash2 className="w-3 h-3 inline-block mr-1" />
                  清空
                </button>
              </div>
            </div>

            <input
              ref={mainInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleMainFiles(e.target.files)}
            />

            {mainImages.length === 0 ? (
              <div className="flex flex-col items-center justify-center border border-dashed border-slate-700 rounded-xl py-10 text-slate-500">
                <ImagePlus className="w-8 h-8 mb-2" />
                <div className="text-sm">拖拽或点击上传主图</div>
                <div className="text-xs text-slate-600 mt-1">支持 JPG/PNG，多张批量导入</div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {mainImages.map((item) => (
                  <div key={item.id} className="relative group rounded-lg overflow-hidden border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setPreviewImage(item.url)}
                      className="block w-full h-28"
                      title="点击放大预览"
                    >
                      <img src={item.url} alt={item.name} className="w-full h-full object-cover" />
                    </button>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        removeMainImage(item.id);
                      }}
                      className="absolute top-1 right-1 bg-black/60 p-1 rounded-full opacity-0 group-hover:opacity-100 transition"
                      title="移除"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section
            className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col gap-4"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDropRef}
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">{activeMode.refSectionTitle}</h2>
                <p className="text-xs text-slate-500">可选，支持多张上传；未提供则按提示词编辑</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => refInputRef.current?.click()}
                  className="text-xs px-3 py-1.5 rounded-md bg-slate-800 border border-slate-700 hover:border-purple-500 hover:text-white transition-colors"
                >
                  <Upload className="w-3 h-3 inline-block mr-1" />
                  {activeMode.refAddBtn}
                </button>
                <button
                  onClick={clearRefImages}
                  disabled={refImages.length === 0}
                  className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                    refImages.length > 0
                      ? "bg-slate-800 border-slate-700 hover:border-red-500 hover:text-white"
                      : "bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed"
                  }`}
                >
                  <Trash2 className="w-3 h-3 inline-block mr-1" />
                  清空
                </button>
              </div>
            </div>

            <input
              ref={refInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleRefFiles(e.target.files)}
            />

            {refImages.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {refImages.map((item) => (
                  <div key={item.id} className="relative group rounded-lg overflow-hidden border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setPreviewImage(item.url)}
                      className="block w-full h-28"
                      title="点击放大预览"
                    >
                      <img src={item.url} alt={item.name} className="w-full h-full object-cover" />
                    </button>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        removeRefImage(item.id);
                      }}
                      className="absolute top-1 right-1 bg-black/60 p-1 rounded-full opacity-0 group-hover:opacity-100 transition"
                      title="移除"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center border border-dashed border-slate-700 rounded-xl py-10 text-slate-500">
                <ImagePlus className="w-8 h-8 mb-2" />
                <div className="text-sm">{activeMode.refEmptyTitle}</div>
                <div className="text-xs text-slate-600 mt-1">{activeMode.refEmptyHint}</div>
              </div>
            )}
          </section>
        </div>

        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold">提示词（可选）</h2>
              <p className="text-xs text-slate-500">{activeMode.promptHint}</p>
            </div>
            <div className="text-xs text-slate-500">已完成 {totalSuccess}/{results.length || 0}</div>
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-5 gap-4">
            <label className="text-xs text-slate-400 space-y-2">
              <span className="block">功能类型</span>
              <select
                value={swapMode}
                disabled={isRunning}
                onChange={(e) => {
                  const nextMode = e.target.value;
                  setSwapMode(nextMode);
                  setPrompt((SWAP_MODE_META[nextMode] || SWAP_MODE_META.face).defaultPrompt);
                  setResults([]);
                }}
                className="w-full rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-200 px-3 py-2 focus:outline-none focus:border-purple-500 disabled:opacity-60"
              >
                {SWAP_MODE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value} className="bg-slate-900">
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-400 space-y-2">
              <span className="block">分辨率</span>
              <select
                value={size}
                onChange={(e) => setSize(e.target.value)}
                className="w-full rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-200 px-3 py-2 focus:outline-none focus:border-purple-500"
              >
                {SIZE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value} className="bg-slate-900">
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-400 space-y-2">
              <span className="block">比例</span>
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value)}
                className="w-full rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-200 px-3 py-2 focus:outline-none focus:border-purple-500"
              >
                {RATIO_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value} className="bg-slate-900">
                    {opt.label}
                  </option>
                ))}
                </select>
              </label>
            <label className="text-xs text-slate-400 space-y-2">
              <span className="block">动图分辨率</span>
              <select
                value={videoResolution}
                onChange={(e) => setVideoResolution(e.target.value)}
                className="w-full rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-200 px-3 py-2 focus:outline-none focus:border-purple-500"
              >
                {MOTION_RESOLUTION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value} className="bg-slate-900">
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            {videoImageTypeOptions.length > 0 && (
              <label className="text-xs text-slate-400 space-y-2">
                <span className="block">参考模式</span>
                <select
                  value={videoImageType}
                  onChange={(e) => setVideoImageType(e.target.value)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-200 px-3 py-2 focus:outline-none focus:border-purple-500"
                >
                  {videoImageTypeOptions.map((opt) => (
                    <option key={opt.value} value={opt.value} className="bg-slate-900">
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            className="mt-3 w-full rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-200 p-3 focus:outline-none focus:border-purple-500"
          />
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">输出结果</h2>
            {results.some((item) => item.outputUrl) && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleGenerateAllMotion}
                  disabled={isRunning || hasMotionRunning || motionTargets.length === 0}
                  className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                    !isRunning && !hasMotionRunning && motionTargets.length > 0
                      ? "bg-slate-800 border-slate-700 hover:border-purple-500 hover:text-white"
                      : "bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed"
                  }`}
                >
                  {hasMotionRunning ? <Loader2 className="w-3 h-3 inline-block mr-1 animate-spin" /> : <Play className="w-3 h-3 inline-block mr-1" />}
                  全部转动图
                </button>
                <button
                  onClick={() => {
                    results.forEach((item) => {
                      if (!item.outputUrl) return;
                      const link = document.createElement("a");
                      link.href = item.outputUrl;
                      link.download = `${activeMode.downloadPrefix}-${item.id}.png`;
                      link.click();
                    });
                  }}
                  className="text-xs px-3 py-1.5 rounded-md bg-slate-800 border border-slate-700 hover:border-purple-500 hover:text-white transition-colors"
                >
                  <Download className="w-3 h-3 inline-block mr-1" />
                  下载全部
                </button>
              </div>
            )}
          </div>

          {results.length === 0 ? (
            <div className="border border-dashed border-slate-800 rounded-xl py-12 text-center text-slate-500">
              结果将在这里展示
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {results.map((item) => (
                <div key={item.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span title={`${item.inputName || "主图"} + ${item.refName || "未提供"}`}>
                      任务 {item.mainId?.slice(-4)}/{item.refId?.slice(-4)}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full border ${
                        item.status === "success"
                          ? "text-green-400 border-green-500/40 bg-green-500/10"
                          : item.status === "error"
                          ? "text-red-400 border-red-500/40 bg-red-500/10"
                          : item.status === "cancelled"
                          ? "text-amber-300 border-amber-500/40 bg-amber-500/10"
                          : item.status === "running"
                          ? "text-purple-300 border-purple-500/40 bg-purple-500/10"
                          : "text-slate-400 border-slate-700 bg-slate-800"
                      }`}
                    >
                      {item.status === "success"
                        ? "完成"
                        : item.status === "error"
                        ? "失败"
                        : item.status === "cancelled"
                        ? "已取消"
                        : item.status === "running"
                        ? "处理中"
                        : "排队中"}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-2">
                      <div className="text-[11px] text-slate-500">主图</div>
                      <button
                        type="button"
                        onClick={() => setPreviewImage(item.inputUrl)}
                        className="block w-full h-40 rounded-lg border border-slate-800 overflow-hidden"
                        title="点击放大预览"
                      >
                        <img src={item.inputUrl} alt="主图" className="w-full h-full object-cover" />
                      </button>
                    </div>
                    <div className="space-y-2">
                      <div className="text-[11px] text-slate-500">参考图</div>
                      {item.refUrl ? (
                        <button
                          type="button"
                          onClick={() => setPreviewImage(item.refUrl)}
                          className="block w-full h-40 rounded-lg border border-slate-800 overflow-hidden"
                          title="点击放大预览"
                        >
                          <img src={item.refUrl} alt="参考图" className="w-full h-full object-cover" />
                        </button>
                      ) : (
                        <div className="w-full h-40 rounded-lg border border-dashed border-slate-800 flex items-center justify-center text-xs text-slate-600">
                          未提供参考图
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="text-[11px] text-slate-500">{activeMode.resultLabel}</div>
                        <div className="flex items-center gap-1.5">
                          {item.outputUrl && (
                            <button
                              onClick={() => handleGenerateMotion(item)}
                              disabled={item.videoStatus === "running"}
                              className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                                item.videoStatus === "running"
                                  ? "border-slate-800 text-slate-600 cursor-not-allowed"
                                  : "border-slate-700 text-slate-400 hover:text-white hover:border-purple-500"
                              }`}
                            >
                              {item.videoStatus === "running" ? (
                                <Loader2 className="w-3 h-3 inline-block mr-1 animate-spin" />
                              ) : (
                                <Play className="w-3 h-3 inline-block mr-1" />
                              )}
                              一键转动图
                            </button>
                          )}
                          {item.outputUrl && (
                            <button
                              onClick={() => {
                                const link = document.createElement("a");
                                link.href = item.outputUrl;
                                link.download = `${activeMode.downloadPrefix}-${item.id}.png`;
                                link.click();
                              }}
                              className="text-[11px] px-2 py-0.5 rounded border border-slate-700 text-slate-400 hover:text-white hover:border-purple-500 transition-colors"
                            >
                              <Download className="w-3 h-3 inline-block mr-1" />
                              下载
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="relative">
                        {item.status === "running" && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg z-10">
                            <Loader2 className="w-5 h-5 animate-spin" />
                          </div>
                        )}
                        {item.outputUrl ? (
                          <button
                            type="button"
                            onClick={() => setPreviewImage(item.outputUrl)}
                            className="block w-full h-40 rounded-lg border border-slate-800 overflow-hidden"
                            title="点击放大预览"
                          >
                            <img src={item.outputUrl} alt={activeMode.resultLabel} className="w-full h-full object-cover" />
                          </button>
                        ) : (
                          <div className="w-full h-40 rounded-lg border border-dashed border-slate-800 flex items-center justify-center text-xs text-slate-600">
                            {item.status === "error" ? "生成失败" : "等待生成"}
                          </div>
                        )}
                      </div>
                      {(item.videoUrl || item.videoStatus === "running" || item.videoError) && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="text-[11px] text-slate-500">动图结果</div>
                            <div className="flex items-center gap-1.5">
                              {item.videoUrl && (
                                <div className="flex items-center gap-1">
                                  <div className="flex items-center rounded border border-slate-800 bg-slate-950/70 p-0.5">
                                    {VIDEO_HD_TEMPLATE_OPTIONS.map((option) => {
                                      const isSelected = String(item.upscaleTemplateEnum || VIDEO_HD_TEMPLATE_ENUM_2K) === option.value;
                                      return (
                                        <button
                                          key={option.value}
                                          onClick={() => updateResult(item.id, { upscaleTemplateEnum: option.value })}
                                          disabled={item.upscaleStatus === "running"}
                                          className={`rounded px-1.5 py-0.5 text-[10px] transition-colors ${
                                            isSelected
                                              ? "bg-fuchsia-500/20 text-fuchsia-200"
                                              : "text-slate-500 hover:text-slate-200"
                                          }`}
                                        >
                                          {option.label}
                                        </button>
                                      );
                                    })}
                                  </div>
                                  <button
                                    onClick={() => handleUpscaleVideo(item)}
                                    disabled={item.upscaleStatus === "running"}
                                    className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                                      item.upscaleStatus === "running"
                                        ? "border-slate-800 text-slate-600 cursor-not-allowed"
                                        : "border-slate-700 text-slate-400 hover:text-white hover:border-purple-500"
                                    }`}
                                  >
                                    {item.upscaleStatus === "running" ? (
                                      <>
                                        <Loader2 className="w-3 h-3 inline-block animate-spin mr-1" />
                                        超清中
                                      </>
                                    ) : (
                                      <>
                                        <TrendingUp className="w-3 h-3 inline-block mr-1" />
                                        视频超清
                                      </>
                                    )}
                                  </button>
                                </div>
                              )}
                              {item.videoUrl && (
                                <button
                                  onClick={() => {
                                    void downloadMedia(item.videoUrl, `motion-${item.id}.mp4`);
                                  }}
                                  className="text-[11px] px-2 py-0.5 rounded border border-slate-700 text-slate-400 hover:text-white hover:border-purple-500 transition-colors"
                                >
                                  <Download className="w-3 h-3 inline-block mr-1" />
                                  下载
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="relative">
                            {item.videoStatus === "running" && (
                              <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg z-10">
                                <Loader2 className="w-5 h-5 animate-spin" />
                              </div>
                            )}
                            {item.videoUrl ? (
                              <button
                                type="button"
                                onClick={() => setPreviewVideo(item.videoUrl)}
                                className="block w-full h-40 rounded-lg border border-slate-800 overflow-hidden"
                                title="点击放大预览"
                              >
                                <video src={item.videoUrl} className="w-full h-full object-cover" muted loop playsInline />
                              </button>
                            ) : (
                              <div className="w-full h-40 rounded-lg border border-dashed border-slate-800 flex items-center justify-center text-xs text-slate-600">
                                {item.videoError ? "生成失败" : "等待生成"}
                              </div>
                            )}
                          </div>
                          {(item.upscaledVideoUrl || item.upscaleStatus === "running" || item.upscaleError) && (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="text-[11px] text-slate-500">超清结果</div>
                                {item.upscaledVideoUrl && (
                                  <button
                                    onClick={() => {
                                      void downloadMedia(item.upscaledVideoUrl, `motion-hd-${item.id}.mp4`);
                                    }}
                                    className="text-[11px] px-2 py-0.5 rounded border border-slate-700 text-slate-400 hover:text-white hover:border-purple-500 transition-colors"
                                  >
                                    <Download className="w-3 h-3 inline-block mr-1" />
                                    下载
                                  </button>
                                )}
                              </div>
                              <div className="relative">
                                {item.upscaleStatus === "running" && (
                                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg z-10">
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                  </div>
                                )}
                                {item.upscaledVideoUrl ? (
                                  <button
                                    type="button"
                                    onClick={() => setPreviewVideo(item.upscaledVideoUrl)}
                                    className="block w-full h-40 rounded-lg border border-slate-800 overflow-hidden"
                                    title="点击放大预览"
                                  >
                                    <video src={item.upscaledVideoUrl} className="w-full h-full object-cover" muted loop playsInline />
                                  </button>
                                ) : (
                                  <div className="w-full h-40 rounded-lg border border-dashed border-slate-800 flex items-center justify-center text-xs text-slate-600">
                                    {item.upscaleError ? "超清失败" : "等待超清"}
                                  </div>
                                )}
                              </div>
                              {item.upscaleError && <div className="text-[11px] text-rose-300">{item.upscaleError}</div>}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  {item.error && (
                    <div className="text-xs text-red-400 flex items-start gap-2 whitespace-pre-line">
                      <AlertCircle className="w-3 h-3 mt-0.5" />
                      {item.error}
                    </div>
                  )}
                  {item.videoError && (
                    <div className="text-xs text-red-400 flex items-start gap-2 whitespace-pre-line">
                      <AlertCircle className="w-3 h-3 mt-0.5" />
                      动图生成失败：{item.videoError}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {previewImage && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <img src={previewImage} alt="预览" className="max-w-full max-h-[90vh] rounded-lg border border-slate-700 object-contain" />
            <button
              className="absolute -top-10 right-0 text-white/70 hover:text-white transition-colors bg-slate-800/70 p-2 rounded-full hover:bg-slate-700/80"
              onClick={() => setPreviewImage(null)}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      {previewVideo && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6"
          onClick={() => setPreviewVideo(null)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <video
              src={previewVideo}
              controls
              autoPlay
              className="max-w-full max-h-[90vh] rounded-lg border border-slate-700 object-contain"
            />
            <button
              className="absolute -top-10 right-0 text-white/70 hover:text-white transition-colors bg-slate-800/70 p-2 rounded-full hover:bg-slate-700/80"
              onClick={() => setPreviewVideo(null)}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      <AiChatAnchorStatusCard />
    </div>
  );
};

export default PipelineSwapTrio;
