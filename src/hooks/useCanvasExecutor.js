/**
 * useCanvasExecutor.js — 画布节点执行引擎 hook
 * (Phase 6 迁移，原 Workbench.jsx 组件体内的 executeFlow 函数，~1016 行)
 *
 * 从 canvasStore 直接读写 nodes/connections（无 nodesRef/connectionsRef 闭包风险）。
 * applyNodeUpdate 改用 updateNodeData (O(1) Immer)，批量写用 setNodes/setConnections。
 */
import { useCanvasStore } from "../stores/canvasStore.js";
import {
  pickFirstImageUrl,
  pickFirstVideoUrl,
  summarizeAIChatResponse,
  extractAIChatDoneError,
  extractApiError,
  WORKBENCH_AI_CHAT_MODULE_ENUM,
  resolveWorkbenchAIChatPartEnum,
  buildAIChatParamPayload,
  findAIChatParamValueId,
  MULTI_ANGLE_VARIANTS,
  isAbortLikeError,
  MODES_WITHOUT_APP_AUTH,
  formatAIChatErrorMessage,
  isFirstLastFrameReferenceSelection,
} from "../lib/workbenchHelpers.js";
import {
  resolveMemberAuthorizationInfo,
  submitAIChatImageTask,
  aiChatStream,
} from "../api/aiChat";
import { API_BASE } from "../config.js";
import {
  NODE_TYPES,
  EMPTY_LIST,
  VOLC_VIDEO_HD_TEMPLATE_ENUM_1,
  DEFAULT_VIDEO_HD_MODEL_ID,
  FEATURE_EXTRACT_PRESET_PROMPTS,
  VIDEO_GEN_INPUT_HANDLE_LAST_FRAME,
  normalizeConnectionTargetHandle,
  listAIChatParamChoiceOptions,
} from "../constants/workbench.jsx";
import { buildCanvasNodePrompt } from "../components/agent-canvas/promptUtils.js";
import { cloneCanvasNodeLight } from "../hooks/useCanvas.js";
import { isVideoContent } from "../lib/mediaType.js";
import { buildRoleProfileStructuredOutput } from "../lib/roleProfileStructurer.js";

// generateId — not exported from constants, define locally
const generateId = () => Math.random().toString(36).slice(2, 11);

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCanvasExecutor({
  // API
  apiFetch,
  // Model params
  defaultImageModelId,
  defaultVideoModelId,
  imageModelOptions,
  resolveModelParamsForId,
  // Session / debug
  agentDevMode,
  aiChatSessionIdRef,
  aiChatHistoryRecordIdRef,
  pushApiDebugDetail,
  updateApiDebugStatus,
  // Run state (from useWorkbenchRun — passed directly to avoid creating a second instance)
  runAbortControllerRef,
  nodeAbortControllersRef,
  cancelledNodeIdsRef,
  runningNodeIdsRef,
  setIsRunning,
  setRunToast,
  setGlobalError,
}) {
  // ── canvas store ────────────────────────────────────────────────────────────
  const storeSetNodes = useCanvasStore((s) => s.setNodes);
  const storeSetConnections = useCanvasStore((s) => s.setConnections);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);

  // ── helpers to read latest nodes/connections without stale closures ──────────
  const getNodes = () => useCanvasStore.getState().nodes;
  const getConnections = () => useCanvasStore.getState().connections;

  // ────────────────────────────────────────────────────────────────────────────
  // executeFlow — main canvas execution engine
  // ────────────────────────────────────────────────────────────────────────────

  const executeFlow = async (specificNodesSet) => {
    if (runAbortControllerRef.current && !runAbortControllerRef.current.signal.aborted) {
      setRunToast({ message: "已有生成任务正在运行", type: "info" });
      setTimeout(() => setRunToast(null), 1800);
      return;
    }
    setGlobalError(null);

    const baseNodes = getNodes();
    const baseConnections = getConnections();

    const runtimeNodes = new Map(baseNodes.map((n) => [n.id, cloneCanvasNodeLight(n)]));

    // applyNodeUpdate: O(1) Immer via updateNodeData (also syncs runtimeNodes cache)
    const applyNodeUpdate = (id, patch) => {
      const cur = runtimeNodes.get(id);
      if (!cur) return;
      cur.data = { ...cur.data, ...patch };
      runtimeNodes.set(id, cur);
      updateNodeData(id, patch);
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
        runtimeNodes.set(newNodeId, cloneCanvasNodeLight(newNode));
        createdNodes.push(newNode);
        patches.set(newNodeId, patch);
        requiredConnections.push({ from: sourceNode.id, to: newNodeId });
      }

      if (createdNodes.length > 0 || patches.size > 0) {
        storeSetNodes((prev) => {
          const next = prev.map((n) => {
            const patch = patches.get(n.id);
            if (!patch) return n;
            return { ...n, data: { ...n.data, ...patch } };
          });
          return createdNodes.length > 0 ? [...next, ...createdNodes] : next;
        });
      }

      if (requiredConnections.length > 0) {
        storeSetConnections((prev) => {
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

    storeSetNodes((prev) =>
      prev.map((n) =>
        specificNodesSet.has(n.id) ? { ...n, data: { ...n.data, status: "loading", error: null, progress: 0, total: 0 } } : n
      )
    );

    try {
      for (const nodeId of finalOrder) {
        throwIfCancelled();
        if (cancelledNodeIdsRef.current.has(nodeId)) {
          storeSetNodes((prev) =>
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
          applyNodeUpdate(procNode.id, { status: "idle", error: "已取消", progress: 0, total: 0 });
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
                      payload: { ...proxyPayload, authorization: `${proxyPayload.authorization.slice(0, 18)}...` },
                      authorizationSource: authorizationInfo?.source || "none",
                    });
                    try {
                      const proxyData = await runSubmitAIChatImageTask(proxyPayload, {
                        onDebug: (event) => pushApiDebugDetail("aiChatImage", event),
                      });
                      if (proxyData?.source_session_id) aiChatSessionIdRef.current = String(proxyData.source_session_id);
                      if (proxyData?.source_history_record_id) aiChatHistoryRecordIdRef.current = String(proxyData.source_history_record_id);
                      pushApiDebugDetail("aiChatImage", { type: "success", path: "/api/ai_chat_image_via_curl", mode: "json", response: proxyData });
                      return {
                        meta: { image_url: proxyData?.image_url || "", ai_chat_session_id: proxyData?.source_session_id || "", history_ai_chat_record_id: proxyData?.source_history_record_id || "" },
                        events: Array.isArray(proxyData?.events) ? proxyData.events.map((item) => item?.data ?? item).filter(Boolean) : EMPTY_LIST,
                        data: proxyData,
                        text: String(proxyData?.text || ""),
                      };
                    } catch (proxyError) {
                      pushApiDebugDetail("aiChatImage", { type: "error", path: "/api/ai_chat_image_via_curl", message: proxyError instanceof Error ? proxyError.message : String(proxyError) });
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
                    const canRetryWithModel4 = !!firstErrMsg && !!fallbackModelId && String(modelId) !== fallbackModelId;
                    if (canRetryWithModel4) {
                      updateApiDebugStatus("aiChatImage", { status: "loading", message: `part=${resolveWorkbenchAIChatPartEnum({ mode: "text2img" })} model=${modelId}失败，自动重试model=${fallbackModelId}` });
                      aiChatResponse = await requestAIChatImage(fallbackModelId);
                      effectiveModelId = fallbackModelId;
                    }
                  } catch (error) {
                    updateApiDebugStatus("aiChatImage", { status: "error", message: formatAIChatErrorMessage(error) });
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
                    console.info("[aiChatImage] parsed-response", JSON.stringify({ result_url: resultUrl || "", done_error: doneErrMsg || "", event_count: Array.isArray(aiChatResponse?.events) ? aiChatResponse.events.length : 0, last_events: Array.isArray(aiChatResponse?.events) ? aiChatResponse.events.slice(-3) : [], response_summary: summarizeAIChatResponse(aiChatResponse) }, null, 2));
                  }
                  if (!resultUrl && doneErrMsg) throw new Error(`AI Chat 返回错误：${doneErrMsg}`);
                  if (!resultUrl) {
                    const summary = summarizeAIChatResponse(aiChatResponse);
                    throw new Error(`aiChat 文生图未返回可解析图片URL${summary ? ` | 响应摘要: ${summary}` : ""}`);
                  }
                  updateApiDebugStatus("aiChatImage", { status: "success", message: `part=${resolveWorkbenchAIChatPartEnum({ mode: "text2img" })} model=${effectiveModelId} params=${effectiveParamCount}` });
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
                const aggregatedPrimaryImage = shouldAggregateMultiSourceImg2Video ? sourceNodeMediaGroups[0]?.[0] || "" : "";
                const aggregatedReferenceImages = shouldAggregateMultiSourceImg2Video ? sourceNodeMediaGroups.slice(1).flat().filter(Boolean) : [];

                const payload = {
                  model: procNode.data.model || defaultVideoModelId,
                  image: procNode.data.mode === "text2video" ? "" : (shouldAggregateMultiSourceImg2Video ? aggregatedPrimaryImage : inputImages[i]),
                  prompt: buildCanvasNodePrompt(procNode, sourceText) || "natural motion",
                  duration: durationInt,
                  fps: 24,
                  camera_fixed: isCameraFixed,
                  resolution: procNode.data.templates?.resolution || "1080p",
                  generate_audio: true,
                  seed: 21,
                  ...(String(procNode.data.templates?.ratio || "").trim() ? { ratio: String(procNode.data.templates?.ratio || "").trim() } : {}),
                };
                if (procNode.data.mode === "local_img2video") {
                  const resp = await runApiFetch(`/api/local/img2video`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
                  const data = await resp.json();
                  if (!resp.ok) throw new Error(extractApiError(data));
                  resultUrl = data.image;
                } else {
                  updateApiDebugStatus("aiChatImage", { status: "loading", message: `POST /api/ai_chat_image_via_curl part=${resolveWorkbenchAIChatPartEnum({ mode: procNode.data.mode === "text2video" ? "text2video" : "img2video" })}` });
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
                    const imageTypeOptions = listAIChatParamChoiceOptions(paramList, ["imagetype", "image_type", "模式", "参考模式", "参考类型"]);
                    effectiveLastFrameImage = isFirstLastFrameReferenceSelection(selectedImageType, imageTypeOptions)
                      ? (lastFrameImages[0] || procNode.data.lastFrameImage || procNode.data.refImage || null)
                      : null;
                    const matchedResolutionId = findAIChatParamValueId(paramList, ["resolution", "分辨率", "清晰度"], selectedResolution);
                    const matchedRatioId = findAIChatParamValueId(paramList, ["ratio", "比例", "宽高比", "画幅", "aspect"], selectedRatio);
                    const matchedDurationId = findAIChatParamValueId(paramList, ["duration", "时长", "秒数"], selectedDuration);
                    const matchedImageTypeId = findAIChatParamValueId(paramList, ["imagetype", "image_type", "模式", "参考模式", "参考类型"], selectedImageType);
                    if (selectedResolution && !matchedResolutionId) throw new Error(`未匹配到resolution参数ID: ${selectedResolution}`);
                    if (selectedDuration && !matchedDurationId) throw new Error(`未匹配到duration参数ID: ${selectedDuration}`);
                    if (selectedImageType && !matchedImageTypeId) throw new Error(`未匹配到imagetype参数ID: ${selectedImageType}`);
                    if (matchedResolutionId) resolvedParamPayload.ai_video_param_resolution_id = matchedResolutionId;
                    if (selectedRatio) {
                      if (!matchedRatioId) throw new Error(`未匹配到ratio参数ID: ${selectedRatio}`);
                      resolvedParamPayload.ai_video_param_ratio_id = matchedRatioId;
                    } else {
                      delete resolvedParamPayload.ai_video_param_ratio_id;
                    }
                    if (matchedDurationId) resolvedParamPayload.ai_video_param_duration_id = matchedDurationId;
                    if (matchedImageTypeId) resolvedParamPayload.ai_video_param_image_type_id = matchedImageTypeId;
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
                    if (!proxyPayload.authorization) throw new Error("缺少 member authorization，无法调用后端curl代理");
                    pushApiDebugDetail("aiChatImage", {
                      type: "start",
                      path: "/api/ai_chat_image_via_curl",
                      payload: {
                        ...proxyPayload,
                        authorization: `${proxyPayload.authorization.slice(0, 18)}...`,
                        images: [`count=${imagesPayload.length}`],
                        param_mapping: { resolution: selectedResolution || "-", resolution_id: resolvedParamPayload.ai_video_param_resolution_id || "", ratio: selectedRatio || "-", ratio_id: resolvedParamPayload.ai_video_param_ratio_id || "", duration: selectedDuration || "-", duration_id: resolvedParamPayload.ai_video_param_duration_id || "", image_type: selectedImageType || "-", image_type_id: resolvedParamPayload.ai_video_param_image_type_id || "" },
                      },
                      authorizationSource: authorizationInfo?.source || "none",
                    });
                    const proxyData = await runSubmitAIChatImageTask(proxyPayload, { onDebug: (event) => pushApiDebugDetail("aiChatImage", event) });
                    if (proxyData?.source_session_id) aiChatSessionIdRef.current = String(proxyData.source_session_id);
                    if (proxyData?.source_history_record_id) aiChatHistoryRecordIdRef.current = String(proxyData.source_history_record_id);
                    pushApiDebugDetail("aiChatImage", { type: "success", path: "/api/ai_chat_image_via_curl", mode: "json", response: proxyData });
                    resultUrl =
                      pickFirstVideoUrl(proxyData?.video_url) || pickFirstVideoUrl(proxyData?.output_video) ||
                      pickFirstVideoUrl(proxyData?.events) || pickFirstVideoUrl(proxyData?.text) || pickFirstVideoUrl(proxyData) ||
                      pickFirstImageUrl(proxyData?.image_url) || pickFirstImageUrl(proxyData?.events) || pickFirstImageUrl(proxyData?.text) || "";
                    const doneErrMsg = String(proxyData?.done_error || "").trim();
                    if (!resultUrl && doneErrMsg) throw new Error(`AI Chat 返回错误：${doneErrMsg}`);
                    if (!resultUrl) {
                      const summary = summarizeAIChatResponse(proxyData);
                      throw new Error(`${procNode.data.mode === "text2video" ? "aiChat 文生视频" : "aiChat 图生视频"}未返回可解析URL${summary ? ` | 响应摘要: ${summary}` : ""}`);
                    }
                    updateApiDebugStatus("aiChatImage", { status: "success", message: `part=${resolveWorkbenchAIChatPartEnum({ mode: procNode.data.mode === "text2video" ? "text2video" : "img2video" })} model=${modelId} params=${Object.keys(resolvedParamPayload).length}` });
                  } catch (proxyError) {
                    pushApiDebugDetail("aiChatImage", { type: "error", path: "/api/ai_chat_image_via_curl", message: proxyError instanceof Error ? proxyError.message : String(proxyError) });
                    const proxyErrorMsg = proxyError instanceof Error ? proxyError.message : String(proxyError);
                    const shouldSkipFallback = proxyErrorMsg.includes("缺少 member authorization") || proxyErrorMsg.toLowerCase().includes("authorization 不能为空");
                    if (shouldSkipFallback) throw new Error(proxyErrorMsg);
                    updateApiDebugStatus("aiChatImage", { status: "loading", message: procNode.data.mode === "text2video" ? "text2video 代理失败" : "img2video 代理失败，回退 /api/img2video" });
                    if (procNode.data.mode === "text2video") throw new Error(`text2video 代理失败: ${proxyErrorMsg}`);
                    if (shouldAggregateMultiSourceImg2Video && aggregatedReferenceImages.length) throw new Error(`img2video 代理失败: ${proxyErrorMsg}; 多输入节点聚合模式不支持回退 /api/img2video`);
                    try {
                      const fallbackPayload = effectiveLastFrameImage ? { ...payload, last_frame_image: effectiveLastFrameImage } : payload;
                      const resp = await runApiFetch(`/api/img2video`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fallbackPayload) });
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
                updateApiDebugStatus("aiChatImage", { status: "loading", message: `POST /api/ai_chat_image_via_curl part=${resolveWorkbenchAIChatPartEnum({ mode: "multi_image_generate" })}` });
                try {
                  const paramList = await resolveModelParamsForId(modelId);
                  const resolvedParamPayload = buildAIChatParamPayload(paramList);
                  const selectedTaskType = String(procNode.data.templates?.task_type || "").trim();
                  const selectedSize = String(procNode.data.templates?.size || "").trim();
                  const selectedRatio = String(procNode.data.templates?.aspect_ratio || "").trim();
                  const matchedTaskTypeId = findAIChatParamValueId(paramList, ["task", "任务", "类型"], selectedTaskType);
                  const matchedSizeId = findAIChatParamValueId(paramList, ["size", "尺寸"], selectedSize);
                  const matchedRatioId = findAIChatParamValueId(paramList, ["ratio", "比例", "宽高比", "画幅", "aspect"], selectedRatio);
                  if (selectedTaskType) { if (!matchedTaskTypeId) throw new Error(`未匹配到task参数ID: ${selectedTaskType}`); resolvedParamPayload.ai_image_param_task_type_id = matchedTaskTypeId; }
                  if (selectedSize) { if (!matchedSizeId) throw new Error(`未匹配到size参数ID: ${selectedSize}`); resolvedParamPayload.ai_image_param_size_id = matchedSizeId; }
                  if (selectedRatio) { if (!matchedRatioId) throw new Error(`未匹配到ratio参数ID: ${selectedRatio}`); resolvedParamPayload.ai_image_param_ratio_id = matchedRatioId; } else { delete resolvedParamPayload.ai_image_param_ratio_id; }
                  const authorizationInfo = resolveMemberAuthorizationInfo();
                  const apiRoot = (API_BASE || "").replace(/\/+$/, "");
                  const resolvedInputImages = await Promise.all(
                    inputImages.map(async (url) => {
                      if (typeof url === "string" && url.startsWith("/main_assets/")) {
                        try { const resp = await fetch(`${apiRoot}${url}`); const blob = await resp.blob(); return await new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(blob); }); } catch { return url; }
                      }
                      return url;
                    })
                  );
                  const proxyPayload = {
                    authorization: authorizationInfo?.value || "",
                    history_ai_chat_record_id: aiChatHistoryRecordIdRef.current || "",
                    module_enum: WORKBENCH_AI_CHAT_MODULE_ENUM,
                    part_enum: String(resolveWorkbenchAIChatPartEnum({ mode: "multi_image_generate" })),
                    ai_chat_session_id: aiChatSessionIdRef.current || "",
                    ai_chat_model_id: modelId,
                    message: promptToUse,
                    images: resolvedInputImages,
                    ...resolvedParamPayload,
                  };
                  if (!proxyPayload.authorization) throw new Error("缺少 member authorization，无法调用后端curl代理");
                  pushApiDebugDetail("aiChatImage", { type: "start", path: "/api/ai_chat_image_via_curl", payload: { ...proxyPayload, authorization: `${proxyPayload.authorization.slice(0, 18)}...`, images: Array.isArray(inputImages) ? [`count=${inputImages.length}`] : [] }, authorizationSource: authorizationInfo?.source || "none" });
                  const proxyData = await runSubmitAIChatImageTask(proxyPayload, { onDebug: (event) => pushApiDebugDetail("aiChatImage", event) });
                  if (proxyData?.source_session_id) aiChatSessionIdRef.current = String(proxyData.source_session_id);
                  if (proxyData?.source_history_record_id) aiChatHistoryRecordIdRef.current = String(proxyData.source_history_record_id);
                  pushApiDebugDetail("aiChatImage", { type: "success", path: "/api/ai_chat_image_via_curl", mode: "json", response: proxyData });
                  resultUrl =
                    pickFirstVideoUrl(proxyData?.video_url) || pickFirstVideoUrl(proxyData?.output_video) ||
                    pickFirstVideoUrl(proxyData?.events) || pickFirstVideoUrl(proxyData?.text) || pickFirstVideoUrl(proxyData) ||
                    pickFirstImageUrl(proxyData?.image_url) || pickFirstImageUrl(proxyData?.events) || pickFirstImageUrl(proxyData?.text) || "";
                  const doneErrMsg = String(proxyData?.done_error || "").trim();
                  if (!resultUrl && doneErrMsg) throw new Error(`AI Chat 返回错误：${doneErrMsg}`);
                  if (!resultUrl) { const summary = summarizeAIChatResponse(proxyData); throw new Error(`aiChat 图生图未返回可解析图片URL${summary ? ` | 响应摘要: ${summary}` : ""}`); }
                  updateApiDebugStatus("aiChatImage", { status: "success", message: `img2img model=${modelId} params=${Object.keys(resolvedParamPayload).length}` });
                } catch (proxyError) {
                  pushApiDebugDetail("aiChatImage", { type: "error", path: "/api/ai_chat_image_via_curl", message: proxyError instanceof Error ? proxyError.message : String(proxyError) });
                  updateApiDebugStatus("aiChatImage", { status: "error", message: proxyError instanceof Error ? proxyError.message : String(proxyError) });
                  throw proxyError;
                }
              } else if (procNode.data.mode === "rmbg") {
                const resp = await runApiFetch(`/api/rmbg`, { method: "POST", skipAuth: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: inputImages[i], size: procNode.data.templates?.size || "1024x1024", aspect_ratio: procNode.data.templates?.aspect_ratio || "1:1" }) });
                const data = await resp.json();
                if (!resp.ok) throw new Error(extractApiError(data));
                resultUrl = data.image || data.images?.[0];
              } else if (procNode.data.mode === "feature_extract") {
                const resp = await runApiFetch(`/api/multi_image_generate`, { method: "POST", skipAuth: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: sourceText || procNode.data.prompt || FEATURE_EXTRACT_PRESET_PROMPTS.face, images: [inputImages[i]], temperature: 0.7, size: procNode.data.templates?.size || "1024x1024", aspect_ratio: procNode.data.templates?.aspect_ratio || "1:1" }) });
                const data = await resp.json();
                if (!resp.ok) throw new Error(extractApiError(data));
                resultUrl = data.image || data.images?.[0];
              } else if (procNode.data.mode === "video_upscale") {
                const videoInput = inputImages[i];
                if (!isVideoContent(videoInput)) throw new Error("视频超清技能仅支持视频输入");
                updateApiDebugStatus("aiChatImage", { status: "loading", message: `POST /api/ai_chat_image_via_curl part=${resolveWorkbenchAIChatPartEnum({ mode: "video_upscale" })}` });
                try {
                  const authorizationInfo = resolveMemberAuthorizationInfo();
                  const proxyPayload = {
                    ...(agentDevMode ? { endpoint: "http://192.168.20.12:16313/ai/aiChat" } : {}),
                    authorization: authorizationInfo?.value || "",
                    module_enum: WORKBENCH_AI_CHAT_MODULE_ENUM,
                    part_enum: String(resolveWorkbenchAIChatPartEnum({ mode: "video_upscale" })),
                    ai_chat_model_id: String(procNode.data.model || DEFAULT_VIDEO_HD_MODEL_ID).trim() || DEFAULT_VIDEO_HD_MODEL_ID,
                    message: String(procNode.data.prompt || "视频画质增强").trim() || "视频画质增强",
                    template_enum: String(parseInt(String(procNode.data.templates?.template_enum ?? VOLC_VIDEO_HD_TEMPLATE_ENUM_1), 10) || VOLC_VIDEO_HD_TEMPLATE_ENUM_1),
                    async: "false",
                    files: [videoInput],
                  };
                  if (!proxyPayload.authorization) throw new Error("缺少 member authorization，无法调用后端curl代理");
                  pushApiDebugDetail("aiChatImage", { type: "start", path: "/api/ai_chat_image_via_curl", payload: { ...proxyPayload, authorization: `${proxyPayload.authorization.slice(0, 18)}...`, files: ["count=1(video)"] }, authorizationSource: authorizationInfo?.source || "none" });
                  const proxyData = await runSubmitAIChatImageTask(proxyPayload, { onDebug: (event) => pushApiDebugDetail("aiChatImage", event) });
                  if (proxyData?.source_session_id) aiChatSessionIdRef.current = String(proxyData.source_session_id);
                  if (proxyData?.source_history_record_id) aiChatHistoryRecordIdRef.current = String(proxyData.source_history_record_id);
                  pushApiDebugDetail("aiChatImage", { type: "success", path: "/api/ai_chat_image_via_curl", mode: "json", response: proxyData });
                  resultUrl =
                    pickFirstVideoUrl(proxyData?.video_url) || pickFirstVideoUrl(proxyData?.output_video) ||
                    pickFirstVideoUrl(proxyData?.events) || pickFirstVideoUrl(proxyData?.text) || pickFirstVideoUrl(proxyData) ||
                    pickFirstImageUrl(proxyData?.image_url) || pickFirstImageUrl(proxyData?.events) || pickFirstImageUrl(proxyData?.text) || "";
                  const doneErrMsg = String(proxyData?.done_error || "").trim();
                  if (!resultUrl && doneErrMsg) throw new Error(`AI Chat 返回错误：${doneErrMsg}`);
                  if (!resultUrl) { const summary = summarizeAIChatResponse(proxyData); throw new Error(`aiChat 视频超清未返回可解析URL${summary ? ` | 响应摘要: ${summary}` : ""}`); }
                  updateApiDebugStatus("aiChatImage", { status: "success", message: `part=${resolveWorkbenchAIChatPartEnum({ mode: "video_upscale" })} template=${proxyPayload.template_enum}` });
                } catch (proxyError) {
                  pushApiDebugDetail("aiChatImage", { type: "error", path: "/api/ai_chat_image_via_curl", message: proxyError instanceof Error ? proxyError.message : String(proxyError) });
                  updateApiDebugStatus("aiChatImage", { status: "error", message: proxyError instanceof Error ? proxyError.message : String(proxyError) });
                  throw proxyError;
                }
              } else if (procNode.data.mode === "multi_angleshots") {
                const resp = await runApiFetch(`/api/multi_angleshots`, { method: "POST", skipAuth: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: inputImages[i] }) });
                const data = await resp.json();
                if (!resp.ok) throw new Error(extractApiError(data));
                const eightResults = Array.isArray(data.images) ? data.images : [];
                if (eightResults.length === 0) throw new Error("多角度镜头未返回结果");
                outputImages.push(...eightResults.filter(Boolean));
                resultUrl = null;
              } else {
                const payload = { image: inputImages[i], mode: procNode.data.mode, prompt: procNode.data.prompt || sourceText, ref_image: procNode.data.refImage, model: procNode.data.model };
                const resp = await runApiFetch(`/api/edit`, { method: "POST", skipAuth: MODES_WITHOUT_APP_AUTH.has(procNode.data.mode), headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
                const data = await resp.json();
                if (!resp.ok) throw new Error(extractApiError(data));
                resultUrl = data.image;
              }

              if (resultUrl) outputImages.push(resultUrl);
            } catch (e) {
              if (runSignal.aborted) throw e;
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
        storeSetNodes((prev) =>
          prev.map((node) =>
            runningIds.has(node.id) && node.data?.status === "loading"
              ? { ...node, data: { ...node.data, status: "idle", error: "已取消", progress: 0, total: 0 } }
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

  return { executeFlow };
}
