import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Download,
  Eye,
  ImagePlus,
  Loader2,
  RotateCcw,
  Scan,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import {
  AI_CHAT_PART_ENUM_203,
  resolveMemberAuthorizationInfo,
  submitAIChatImageTask,
  viewAIChatModelParams,
  viewAIChatModels,
} from "../api/aiChat";
import viewerHtml from "../assets/html-360-viewer/viewer360.html?raw";
import { findAIChatModelIdByKeywords } from "../lib/aiChatModelResolver";
import { downloadMedia } from "../lib/downloadMedia";
import { pickFirstImageUrl } from "../lib/mediaUrl";
import { buildPhotographerDashboardUrl } from "../lib/photographerHostRoute";

const WORKFLOW_MODULE_ENUM = "3";
const GPT_IMAGE2_KEYWORDS = [
  "gpt-image2",
  "gpt image2",
  "gpt-image-2",
  "gpt image 2",
];
const DEFAULT_SIZE = "4k";
const DEFAULT_RATIO = "16:9";
const PANORAMA_DEFAULT_PROMPT =
  `基于输入图像，生成一张完整单张全景图，将当前场景从正视图扩展为同一空间的完整环境视图。

空间结构约束：
该场景整体为单一、完整、连续的方形空间。请将场景理解为一个平面轮廓近似正方形的房间或环境，其四面墙围合形成完整闭环，四个角为清晰、稳定的直角关系，四边长度大致相等，不得扩展成长条形、L形、异形或由多个不同房间拼接而成的空间。

请先建立一个唯一且固定的三维场景模型，再从该模型生成全景图。最终结果必须来自同一个连续场景，而不是重新设计出的相似空间。

严格继承输入图像的视觉风格、渲染风格、色调、光照质量、材质表现和空间氛围，不得引入新风格。

全景图必须保持绝对一致：
- 相同建筑结构
- 相同空间布局
- 相同墙面、地面、天花板
- 相同门窗和开口逻辑
- 相同家具与装饰物位置、尺度、朝向
- 相同材质纹理
- 相同光照方向与阴影逻辑

对于输入图像中已经明确可见的内容，必须视为确定事实并严格保留，不得改动、替换、重排或风格漂移。

对于输入图像中未显示或被遮挡的区域，允许进行适度、合理、保守的推断性补全，但这种补全必须严格基于输入图像中已知的结构、布局、材质、功能和风格逻辑进行延续，而不是自由创作。

补全时请遵循以下规则：
1. 优先延续已知建筑结构与空间关系，确保整个空间是连续、闭合、统一的。
2. 优先延续墙面、地面、天花板、门窗、开口、梁柱、家具背面与遮挡部分的合理结构。
3. 优先延续已知家具系统、装饰语言、材质和色彩体系，保持同一场景的完整性。
4. 若需要补足全景完整性，可新增少量必要的、低存在感的补充内容，但这些内容只能用于维持空间闭环和结构合理性，不得成为新的视觉主体。
5. 若某些区域缺乏充分依据，应采用简洁、克制、低复杂度、低风险的补全方案，宁可少补，也不要出现明显错误。

生成结果应覆盖前方、左侧、右侧、后方、顶部和底部，完整展现整个环境。
左右边缘应自然无缝衔接，画面必须连续。

禁止出现以下问题：
- 随机变化
- 前后左右生成成不同场景
- 重复但不一致的物体
- 不合理的新结构
- 与原空间功能冲突的区域
- 新增高识别度主视觉家具或装饰
- 人物
- 夸张畸变
- 风格漂移

最终结果应是一张完整、准确、统一的全景图，可直接用于全景浏览或场景重建。`;

const createStepState = (prompt) => ({
  prompt,
  status: "idle",
  error: "",
  resultUrl: "",
});

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
      // ignore
    }
  }
  return "";
};

const buildFriendlyErrorMessage = (error, actionLabel = "任务处理") => {
  const raw = String(error?.message || error || "").trim();
  const aiChatErrMsg = extractAiChatDoneErrMsg(raw);
  const userFacingErrMsg = aiChatErrMsg || raw;
  if (userFacingErrMsg) return `${actionLabel}失败：${userFacingErrMsg}`;
  return `${actionLabel}失败，请稍后重试。`;
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

const getAIChatParamDisplayValue = (paramValue) => {
  const remark = String(paramValue?.remark || "").trim();
  const value = String(paramValue?.param_value || "").trim();
  return remark || value;
};

const resolveDefaultParamValueId = (paramItem) => {
  const first = sortParamValues(paramItem?.param_values || [])[0];
  const valueId = first?.param_value_id;
  if (valueId === undefined || valueId === null || valueId === "") return "";
  return String(valueId);
};

const buildAIChatParamPayload = (paramList) => {
  const payload = {};
  for (const item of Array.isArray(paramList) ? paramList : []) {
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
    if (name.includes("比例") || name.includes("ratio")) {
      payload.ai_image_param_ratio_id = valueId;
    }
  }
  return payload;
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
      getAIChatParamDisplayValue(paramValue).toLowerCase(),
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
      return normalizedCandidate.includes(normalizedTarget) || normalizedTarget.includes(normalizedCandidate);
    });
    if (matched) {
      const id = paramValue?.param_value_id;
      if (id === undefined || id === null || id === "") return "";
      return String(id);
    }
  }
  return "";
};

const listAIChatParamValues = (paramList, aliases = []) => {
  const item = findAIChatParamItem(paramList, aliases);
  if (!item) return [];
  return sortParamValues(item?.param_values || [])
    .map((paramValue) => getAIChatParamDisplayValue(paramValue))
    .filter(Boolean);
};

const extractModelParamList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
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
  return [];
};

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });

const STEP_META = {
  title: "全景图合成",
  actionLabel: "生成全景图",
  resultLabel: "全景结果",
  autoLoadViewer: true,
  filename: "panorama-output.png",
};

const StepComposer = ({
  stepState,
  onRun,
  onDownload,
  onLoadViewer,
  onPreview,
  isReady,
}) => {
  const isRunning = stepState.status === "loading";
  return (
    <section className="border-t border-slate-200 px-5 py-5 first:border-t-0">
      <div className="min-w-0">
        <div className="text-[14px] font-semibold text-slate-800">{STEP_META.title}</div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="inline-flex h-9 items-center gap-2 rounded-[12px] border border-cyan-500 bg-cyan-500 px-3.5 text-[13px] font-semibold text-white shadow-[0_10px_24px_rgba(6,182,212,0.18)] transition hover:border-cyan-600 hover:bg-cyan-600 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-300 disabled:text-white disabled:shadow-none"
          onClick={onRun}
          disabled={!isReady || isRunning}
        >
          {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          {STEP_META.actionLabel}
        </button>
        {stepState.resultUrl ? (
          <>
            <button
              type="button"
              className="inline-flex h-9 items-center gap-2 rounded-[12px] border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              onClick={onDownload}
            >
              <Download className="h-4 w-4" />
              下载
            </button>
            <button
              type="button"
              className="inline-flex h-9 items-center gap-2 rounded-[12px] border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-700 transition hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700"
              onClick={onLoadViewer}
            >
              <Eye className="h-4 w-4" />
              载入浏览器
            </button>
          </>
        ) : null}
      </div>
      {stepState.error ? <div className="mt-3 text-[12px] leading-5 text-rose-600">{stepState.error}</div> : null}
      {stepState.resultUrl ? (
        <div className="mt-3 overflow-hidden rounded-[16px] border border-slate-200 bg-white shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2.5">
            <div className="text-[12px] font-medium text-slate-700">{STEP_META.resultLabel}</div>
          </div>
          <button
            type="button"
            className="block w-full bg-slate-100"
            onClick={onPreview}
            title="放大预览"
          >
            <img
              src={stepState.resultUrl}
              alt={STEP_META.resultLabel}
              className="block h-44 w-full cursor-zoom-in object-cover transition hover:opacity-95"
            />
          </button>
        </div>
      ) : null}
    </section>
  );
};

export default function Html360Viewer({ embedded = false, onClose = null }) {
  const { apiFetch } = useAuth();
  const dashboardUrl = useMemo(() => buildPhotographerDashboardUrl(), []);
  const [inputImage, setInputImage] = useState(null);
  const [viewerAsset, setViewerAsset] = useState(null);
  const [previewAsset, setPreviewAsset] = useState(null);
  const [iframeNonce, setIframeNonce] = useState(0);
  const [panoramaStep, setPanoramaStep] = useState(() => createStepState(PANORAMA_DEFAULT_PROMPT));
  const [globalError, setGlobalError] = useState("");
  const [aiChatImageModelId, setAiChatImageModelId] = useState("");
  const inputRef = useRef(null);
  const aiChatModelParamsCacheRef = useRef(new Map());
  const aiChatSessionIdRef = useRef("");
  const aiChatHistoryRecordIdRef = useRef("");
  const abortControllersRef = useRef({ multiView: null, panorama: null });

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const loadGptImage2ModelId = async () => {
      try {
        const data = await viewAIChatModels(
          apiFetch,
          { module_enum: Number(WORKFLOW_MODULE_ENUM), part_enum: Number(AI_CHAT_PART_ENUM_203) },
          { signal: controller.signal },
        );
        const resolvedModelId = findAIChatModelIdByKeywords(data, GPT_IMAGE2_KEYWORDS);
        if (!cancelled && resolvedModelId) {
          setAiChatImageModelId(resolvedModelId);
          setGlobalError("");
          return;
        }
        if (!cancelled) {
          setAiChatImageModelId("");
          setGlobalError("未找到 gpt-image2 模型，无法生成全景图。");
        }
      } catch {
        if (!cancelled) {
          setAiChatImageModelId("");
          setGlobalError("加载模型列表失败，无法确认 gpt-image2 是否可用。");
        }
      }
    };

    void loadGptImage2ModelId();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [apiFetch]);

  useEffect(() => {
    return () => {
      Object.values(abortControllersRef.current || {}).forEach((controller) => controller?.abort?.());
    };
  }, []);

  const resolveModelParamsForId = useCallback(
    async (modelId) => {
      const normalizedModelId = String(modelId || "").trim();
      if (!normalizedModelId) return [];
      const cached = aiChatModelParamsCacheRef.current.get(normalizedModelId);
      if (cached) return cached;
      const numericModelId = Number(normalizedModelId);
      const requestModelId = Number.isFinite(numericModelId) ? numericModelId : normalizedModelId;
      const data = await viewAIChatModelParams(apiFetch, { ai_chat_model_id: requestModelId }, { preferApiFetchFirst: true });
      const list = extractModelParamList(data);
      aiChatModelParamsCacheRef.current.set(normalizedModelId, list);
      return list;
    },
    [apiFetch],
  );

  const updatePanoramaStep = useCallback((patch) => {
    setPanoramaStep((prev) =>
      typeof patch === "function"
        ? patch(prev)
        : {
            ...prev,
            ...patch,
          },
    );
  }, []);

  const viewerDocument = useMemo(() => {
    const params = new URLSearchParams(window.location.search || "");
    if (viewerAsset?.url) {
      params.set("url", viewerAsset.url);
    } else {
      params.delete("url");
    }
    const query = params.toString();
    const injectedSearch = query ? `?${query}` : "";
    return viewerHtml.replace(
      "const urlParams = new URLSearchParams(window.location.search);",
      `const urlParams = new URLSearchParams(${JSON.stringify(injectedSearch)});`,
    );
  }, [viewerAsset]);

  const handleInputFiles = useCallback(async (files) => {
    const file = Array.from(files || []).find((item) => item.type.startsWith("image/"));
    if (!file) return;
    const url = await readFileAsDataUrl(file);
    setInputImage({
      name: file.name || "input-image",
      url,
    });
    setGlobalError("");
  }, []);

  const handleLoadViewer = useCallback(
    (stepKey) => {
      if (stepKey === "input") {
        if (!inputImage?.url) return;
        setViewerAsset({ url: inputImage.url, label: inputImage.name || "输入图" });
        setIframeNonce((prev) => prev + 1);
        return;
      }
      if (!panoramaStep?.resultUrl) return;
      setViewerAsset({
        url: panoramaStep.resultUrl,
        label: STEP_META.resultLabel,
      });
      setIframeNonce((prev) => prev + 1);
    },
    [inputImage, panoramaStep],
  );

  const handleDownload = useCallback(async () => {
    if (!panoramaStep?.resultUrl) return;
    await downloadMedia(panoramaStep.resultUrl, STEP_META.filename);
  }, [panoramaStep]);

  const handlePreview = useCallback(() => {
    if (!panoramaStep?.resultUrl) return;
    setPreviewAsset({
      url: panoramaStep.resultUrl,
      label: STEP_META.resultLabel,
    });
  }, [panoramaStep]);

  const runGenerationStep = useCallback(
    async () => {
      if (!inputImage?.url) {
        setGlobalError("请先上传输入图。");
        return;
      }

      const prompt = String(panoramaStep.prompt || "").trim();
      if (!prompt) {
        updatePanoramaStep({ error: "提示词不能为空。" });
        return;
      }

      const memberAuth = resolveMemberAuthorizationInfo()?.value || "";
      if (!memberAuth) {
        updatePanoramaStep({ error: "缺少 member authorization，无法调用 gpt-image2(agent) 后端。" });
        return;
      }

      const modelId = String(aiChatImageModelId || "").trim();
      if (!modelId) {
        updatePanoramaStep({ error: "图像模型仍在加载，请稍后重试。" });
        return;
      }

      abortControllersRef.current.panorama?.abort?.();
      const controller = new AbortController();
      abortControllersRef.current.panorama = controller;
      setGlobalError("");
      updatePanoramaStep({ status: "loading", error: "" });

      try {
        const paramList = await resolveModelParamsForId(modelId);
        const resolvedParamPayload = buildAIChatParamPayload(paramList);
        const effectiveSize = DEFAULT_SIZE;
        const effectiveAspectRatio = DEFAULT_RATIO;
        const matchedSizeId = findAIChatParamValueId(paramList, ["size", "尺寸"], effectiveSize);
        const matchedRatioId = findAIChatParamValueId(paramList, ["ratio", "比例", "宽高比", "画幅", "aspect"], effectiveAspectRatio);

        if (effectiveSize && !matchedSizeId) {
          throw new Error(`未匹配到 size 参数: ${effectiveSize}`);
        }
        if (effectiveAspectRatio && !matchedRatioId) {
          throw new Error(`未匹配到 ratio 参数: ${effectiveAspectRatio}`);
        }

        if (matchedSizeId) {
          resolvedParamPayload.ai_image_param_size_id = matchedSizeId;
        }
        if (matchedRatioId) {
          resolvedParamPayload.ai_image_param_ratio_id = matchedRatioId;
        } else {
          delete resolvedParamPayload.ai_image_param_ratio_id;
        }

        const proxyPayload = {
          authorization: memberAuth,
          history_ai_chat_record_id: aiChatHistoryRecordIdRef.current || "",
          module_enum: WORKFLOW_MODULE_ENUM,
          part_enum: String(AI_CHAT_PART_ENUM_203),
          ai_chat_session_id: aiChatSessionIdRef.current || "",
          ai_chat_model_id: modelId,
          message: prompt,
          images: [inputImage.url],
          ...resolvedParamPayload,
        };

        const proxyData = await submitAIChatImageTask(apiFetch, proxyPayload, {
          signal: controller.signal,
        });

        if (proxyData?.source_session_id) aiChatSessionIdRef.current = String(proxyData.source_session_id);
        if (proxyData?.source_history_record_id) {
          aiChatHistoryRecordIdRef.current = String(proxyData.source_history_record_id);
        }

        const resultUrl =
          pickFirstImageUrl(proxyData?.image_url) ||
          pickFirstImageUrl(proxyData?.events) ||
          pickFirstImageUrl(proxyData?.text) ||
          pickFirstImageUrl(proxyData) ||
          "";
        const doneErrMsg = String(proxyData?.done_error || "").trim();
        if (!resultUrl && doneErrMsg) throw new Error(doneErrMsg);
        if (!resultUrl) throw new Error("未返回可解析的图片结果。");

        updatePanoramaStep({ status: "success", error: "", resultUrl });
        if (STEP_META.autoLoadViewer) {
          setViewerAsset({
            url: resultUrl,
            label: STEP_META.resultLabel,
          });
          setIframeNonce((prev) => prev + 1);
        }
      } catch (error) {
        const isAbort = error?.name === "AbortError";
        updatePanoramaStep({
          status: "idle",
          error: isAbort ? "任务已取消。" : buildFriendlyErrorMessage(error, STEP_META.title || "图片生成"),
        });
        if (!isAbort) {
          setGlobalError(buildFriendlyErrorMessage(error, STEP_META.title || "图片生成"));
        }
        return;
      } finally {
        if (abortControllersRef.current.panorama === controller) {
          abortControllersRef.current.panorama = null;
        }
      }
    },
    [
      aiChatImageModelId,
      apiFetch,
      inputImage,
      panoramaStep,
      resolveModelParamsForId,
      updatePanoramaStep,
    ],
  );

  const activeInputReady = !!inputImage?.url;

  return (
    <div className={`relative flex min-h-0 flex-col overflow-hidden bg-[#F6F7F8] text-slate-800 ${embedded ? "h-full" : "h-screen"}`}>
      <header className="flex h-[56px] shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
        <div className="flex min-w-0 items-center gap-3">
          {embedded ? (
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-[12px] border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800"
              onClick={onClose}
              title="关闭浏览器"
              aria-label="关闭浏览器"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          ) : (
            <a
              href={dashboardUrl}
              className="inline-flex h-9 w-9 items-center justify-center rounded-[12px] border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800"
              title="返回画布"
              aria-label="返回画布"
            >
              <ArrowLeft className="h-4 w-4" />
            </a>
          )}
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-[12px] border border-cyan-200 bg-cyan-50 text-cyan-700">
              <Scan className="h-4 w-4 shrink-0" />
            </div>
            <div className="truncate text-[14px] font-semibold text-slate-800">360 全景浏览器</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-[12px] border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            onClick={() => setIframeNonce((prev) => prev + 1)}
            title="重载 3D 预览"
          >
            <RotateCcw className="h-4 w-4" />
            重载预览
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[380px,minmax(0,1fr)] gap-4 p-4">
        <aside className="min-h-0 overflow-y-auto rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_42px_rgba(15,23,42,0.06)]">
          <section className="px-5 py-5">
            <div className="text-[14px] font-semibold text-slate-800">输入图</div>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                void handleInputFiles(event.target.files);
                event.target.value = "";
              }}
            />
            {!inputImage ? (
              <button
                type="button"
                className="mt-3 flex h-40 w-full flex-col items-center justify-center gap-3 rounded-[18px] border border-dashed border-slate-200 bg-slate-50 text-slate-500 transition hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700"
                onClick={() => inputRef.current?.click()}
              >
                <Upload className="h-5 w-5" />
                <div className="text-[13px] font-medium">上传输入图</div>
              </button>
            ) : null}
            {inputImage ? (
              <div className="mt-3 overflow-hidden rounded-[18px] border border-slate-200 bg-white shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                <img src={inputImage.url} alt={inputImage.name} className="block h-44 w-full object-cover" />
                <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-3 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium text-slate-700">{inputImage.name}</div>
                  </div>
                  <button
                    type="button"
                    className="inline-flex h-8 items-center gap-2 rounded-[10px] border border-slate-200 bg-white px-3 text-[12px] font-medium text-slate-700 transition hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700"
                    onClick={() => handleLoadViewer("input")}
                  >
                    <Eye className="h-4 w-4" />
                    载入浏览器
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          <StepComposer
            stepState={panoramaStep}
            onRun={() => {
              void runGenerationStep();
            }}
            onDownload={handleDownload}
            onLoadViewer={() => handleLoadViewer("panorama")}
            onPreview={handlePreview}
            isReady={activeInputReady}
          />

          {globalError ? (
            <section className="border-t border-slate-200 px-5 py-5">
              <div className="rounded-[16px] border border-rose-200 bg-rose-50 px-3 py-3 text-[12px] leading-5 text-rose-700">
                {globalError}
              </div>
            </section>
          ) : null}
        </aside>

        <section className="flex min-h-0 min-w-0 flex-col rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_42px_rgba(15,23,42,0.06)]">
          <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
            <div className="min-w-0">
              <div className="truncate text-[14px] font-semibold text-slate-800">3D 浏览预览</div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {panoramaStep.resultUrl ? (
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-2 rounded-[12px] border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-700 transition hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700"
                  onClick={() => handleLoadViewer("panorama")}
                >
                  <ImagePlus className="h-4 w-4" />
                  载入全景结果
                </button>
              ) : null}
            </div>
          </div>

          <div className="relative min-h-0 flex-1 bg-[#F8FAFC] p-5">
            <div className="relative h-full overflow-hidden rounded-[20px] border border-slate-200 bg-black shadow-[0_16px_36px_rgba(15,23,42,0.12)]">
            <iframe
              key={`${iframeNonce}:${viewerAsset?.url || "empty"}`}
              title="360 panorama viewer"
              srcDoc={viewerDocument}
              className="h-full w-full border-0 bg-black"
              allow="fullscreen; xr-spatial-tracking"
              allowFullScreen
            />
            {!viewerAsset?.url ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="rounded-[18px] border border-white/70 bg-white/92 px-5 py-4 text-center shadow-[0_16px_36px_rgba(15,23,42,0.12)] backdrop-blur-sm">
                  <div className="text-[14px] font-semibold text-slate-800">等待载入全景图</div>
                </div>
              </div>
            ) : null}
            </div>
          </div>
        </section>
      </div>

      {previewAsset?.url ? (
        <div
          className="absolute inset-0 z-[220] flex items-center justify-center bg-white/55 p-6 backdrop-blur-sm"
          onClick={() => setPreviewAsset(null)}
        >
          <div
            className="relative flex max-h-full max-w-[min(92vw,1400px)] flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_32px_96px_rgba(15,23,42,0.16)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div className="min-w-0 truncate text-[13px] font-medium text-slate-800">{previewAsset.label}</div>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-[12px] border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800"
                onClick={() => setPreviewAsset(null)}
                title="关闭预览"
                aria-label="关闭预览"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-auto bg-slate-50 p-4">
              <img
                src={previewAsset.url}
                alt={previewAsset.label}
                className="mx-auto block max-h-[calc(92vh-96px)] w-auto max-w-[92vw] rounded-[16px] border border-slate-200 bg-white object-contain shadow-[0_12px_28px_rgba(15,23,42,0.08)]"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
