/**
 * useCanvasNodeOps.js — 画布节点紧凑操作 hook
 * (Phase 5 迁移，原 Workbench.jsx 组件体内的 12 个 useCallback)
 *
 * 包含：storyboard 资产/镜头生成、图片/视频紧凑操作（抠图/去水印/超清/
 * 转线稿/去背景/分割/三视图）、img2img 分支创建。
 *
 * 从 canvasStore 直接读写 nodes/connections（无 nodesRef 陈旧闭包风险），
 * 从 workbenchHelpers 导入所有 AI Chat 相关工具函数。
 */

import { useCallback } from "react";
import { useCanvasStore } from "../stores/canvasStore.js";
import {
  buildStoryboardAssetGenerationPrompt,
  buildStoryboardAssetEditPrompt,
  normalizeStoryboardAssetCandidates,
  resolveStoryboardAssetPrimaryImage,
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
  normalizeVideoLineartConfig,
} from "../lib/workbenchHelpers.js";
import {
  resolveMemberAuthorizationInfo,
  submitAIChatImageTask,
} from "../api/aiChat";
import { AI_CHAT_IMAGE_MODEL_ID_NANO_BANANA2 } from "../config.js";
import { findAIChatModelIdByKeywords } from "../lib/aiChatModelResolver.js";
import {
  runVideoLineartTask,
  runVideoRmbgTask,
  runVideoSplitTask,
} from "../api/canvasVideoTasks";
import {
  NODE_TYPES,
  getReferenceNodeTitle,
  EMPTY_LIST,
  normalizeVideoSplitSegments,
  DEFAULT_VIDEO_SPLIT_OUTPUT_RESOLUTION,
  stripStoryboardDisplayIds,
  VOLC_VIDEO_HD_TEMPLATE_ENUM_1,
  VOLC_VIDEO_HD_TEMPLATE_ENUM_2,
  DEFAULT_VIDEO_HD_MODEL_ID,
} from "../constants/workbench.jsx";
import { isVideoContent } from "../lib/mediaType.js";
import { API_BASE } from "../config.js";

// generateId is not exported from constants — define locally
const generateId = () => Math.random().toString(36).slice(2, 11);

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCanvasNodeOps({
  // API
  apiFetch,
  // Model params
  defaultImageModelId,
  threeViewImageModelId,
  imageModelRecords,
  resolveModelParamsForId,
  // Canvas artifacts
  activeArtifact,            // used by createConnectedImg2ImgBranch
  // Toast / preview
  setRunToast,
  // Admin debug (optional — only runCompactVideoUpscale + runCompactThreeView)
  pushApiDebugDetail,
  updateApiDebugStatus,
  // AI session refs (passed as React.MutableRefObject)
  aiChatSessionIdRef,
  aiChatHistoryRecordIdRef,
  // Storyboard hover card state setters (from Workbench.jsx useState)
  setHoveredStoryboardAssetCard,
  setHoveredStoryboardShotCard,
}) {
  // ── canvas store actions ───────────────────────────────────────────────────
  const storeSetNodes = useCanvasStore((s) => s.setNodes);
  const storeSetConnections = useCanvasStore((s) => s.setConnections);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const pushHistory = useCanvasStore((s) => s.pushHistory);
  const storeSetSelectedNodeIds = useCanvasStore((s) => s.setSelectedNodeIds);
  const storeSetSelectedConnectionIds = useCanvasStore((s) => s.setSelectedConnectionIds);
  const setActiveNodeId = useCanvasStore((s) => s.setActiveNodeId);

  // ── helpers to read latest nodes/connections without stale closures ─────────
  const getNodes = () => useCanvasStore.getState().nodes;
  const getConnections = () => useCanvasStore.getState().connections;

  // ────────────────────────────────────────────────────────────────────────────
  // updateStoryboardAssetStatus
  // ────────────────────────────────────────────────────────────────────────────

  const updateStoryboardAssetStatus = useCallback((storyboardNodeId, assetType, assetId, patch) => {
    if (!storyboardNodeId || !assetType || !assetId || !patch || !["object", "function"].includes(typeof patch)) return;
    storeSetNodes((prev) =>
      prev.map((node) => {
        if (node.id !== storyboardNodeId) return node;
        const currentState =
          node?.data?.storyboard_asset_state && typeof node.data.storyboard_asset_state === "object"
            ? node.data.storyboard_asset_state
            : { characters: {}, subjects: {}, locations: {}, shots: {} };
        const currentAssetState = { ...(((currentState[assetType] || {})[assetId] || {})) };
        const nextAssetState =
          typeof patch === "function"
            ? patch(currentAssetState)
            : { ...currentAssetState, ...patch };
        return {
          ...node,
          data: {
            ...node.data,
            storyboard_asset_state: {
              ...currentState,
              [assetType]: { ...(currentState[assetType] || {}), [assetId]: nextAssetState },
            },
          },
        };
      }),
    );
  }, [storeSetNodes]);

  // ────────────────────────────────────────────────────────────────────────────
  // runStoryboardAssetDirectGeneration
  // ────────────────────────────────────────────────────────────────────────────

  const runStoryboardAssetDirectGeneration = useCallback(
    async (storyboardNode, assetType, asset, options = {}) => {
      if (!storyboardNode || !asset || !apiFetch) return;
      const assetId = String(asset?.entity_id || asset?.name || "").trim();
      const currentAssetState = storyboardNode?.data?.storyboard_asset_state?.[assetType]?.[assetId] || {};
      const referenceImageUrl = String(options?.referenceImageUrl || "").trim() || resolveStoryboardAssetPrimaryImage(currentAssetState);
      const tweakText = String(options?.tweakText || "").trim();
      const customPrompt = String(options?.customPrompt || "").trim();
      const prompt = customPrompt
        ? customPrompt
        : tweakText
          ? buildStoryboardAssetEditPrompt({ assetType, asset, storyboardPlan: storyboardNode.data?.storyboard_plan || {}, instruction: tweakText, referenceImageUrl })
          : buildStoryboardAssetGenerationPrompt(assetType, asset, storyboardNode.data?.storyboard_plan || {});

      updateStoryboardAssetStatus(storyboardNode.id, assetType, assetId, { prompt, status: "running", error: "", lastInstruction: tweakText });
      setHoveredStoryboardAssetCard?.((current) =>
        current && current.nodeId === storyboardNode.id && current.assetType === assetType && String(current.asset?.entity_id || current.asset?.name || "").trim() === assetId
          ? { ...current, sticky: true, tweakText: tweakText ? "" : current.tweakText || "", customPrompt: customPrompt ? customPrompt : current.customPrompt || "" }
          : current,
      );
      try {
        const preferredNanoModelId = String(AI_CHAT_IMAGE_MODEL_ID_NANO_BANANA2 || "").trim();
        const loadedModelIdSet = new Set(
          (Array.isArray(imageModelRecords) ? imageModelRecords : []).map((item) => String(item?.id || item?.value || "").trim()).filter(Boolean),
        );
        const targetModelId =
          (preferredNanoModelId && loadedModelIdSet.has(preferredNanoModelId) ? preferredNanoModelId : "") ||
          findAIChatModelIdByKeywords(imageModelRecords) || "";
        if (!targetModelId) throw new Error("未找到 nano banana2 对应的图像模型ID");

        const paramList = await resolveModelParamsForId(targetModelId);
        const resolvedParamPayload = buildAIChatParamPayload(paramList);
        const selectedSize = "1k";
        const selectedRatio = String(storyboardNode.data?.storyboard_plan?.aspect_ratio || "16:9").trim() || "16:9";
        const matchedSizeId = findAIChatParamValueId(paramList, ["size", "尺寸"], selectedSize);
        const matchedRatioId = findAIChatParamValueId(paramList, ["ratio", "比例", "宽高比", "画幅", "aspect"], selectedRatio);
        if (matchedSizeId) resolvedParamPayload.ai_image_param_size_id = matchedSizeId;
        if (matchedRatioId) resolvedParamPayload.ai_image_param_ratio_id = matchedRatioId;

        const authorizationInfo = resolveMemberAuthorizationInfo();
        const proxyPayload = {
          authorization: authorizationInfo?.value || "",
          history_ai_chat_record_id: aiChatHistoryRecordIdRef.current || "",
          module_enum: WORKBENCH_AI_CHAT_MODULE_ENUM,
          part_enum: String(resolveWorkbenchAIChatPartEnum({ mode: "text2img" })),
          ai_chat_session_id: aiChatSessionIdRef.current || "",
          ai_chat_model_id: targetModelId,
          message: prompt,
          images: referenceImageUrl ? [referenceImageUrl] : undefined,
          ...resolvedParamPayload,
        };
        if (!proxyPayload.authorization) throw new Error("缺少 member authorization，无法调用 nano banana2 生成");

        const proxyData = await submitAIChatImageTask(apiFetch, proxyPayload);
        if (proxyData?.source_session_id) aiChatSessionIdRef.current = String(proxyData.source_session_id);
        if (proxyData?.source_history_record_id) aiChatHistoryRecordIdRef.current = String(proxyData.source_history_record_id);

        const resultUrl = pickFirstImageUrl(proxyData?.image_url) || pickFirstImageUrl(proxyData?.events) || pickFirstImageUrl(proxyData?.text) || pickFirstImageUrl(proxyData) || "";
        const doneErrMsg = extractAIChatDoneError(proxyData);
        if (!resultUrl && doneErrMsg) throw new Error(`AI Chat 返回错误：${doneErrMsg}`);
        if (!resultUrl) { const summary = summarizeAIChatResponse(proxyData); throw new Error(`nano banana2 未返回可解析图片${summary ? ` | 响应摘要: ${summary}` : ""}`); }

        const generatedAt = Date.now();
        updateStoryboardAssetStatus(storyboardNode.id, assetType, assetId, (prevAssetState) => {
          const prevCandidates = normalizeStoryboardAssetCandidates(prevAssetState?.candidates);
          const nextCandidate = { id: `candidate_${generatedAt}_${Math.random().toString(36).slice(2, 8)}`, url: resultUrl, createdAt: generatedAt, source: tweakText ? "tweak" : "generate", prompt, instruction: tweakText };
          const nextCandidates = [nextCandidate, ...prevCandidates.filter((item) => String(item?.url || "").trim() !== resultUrl)].slice(0, 8);
          return { ...prevAssetState, prompt, status: "success", error: "", images: [resultUrl], candidates: nextCandidates, selectedCandidateId: nextCandidate.id, selectedImageUrl: resultUrl, lastGeneratedAt: generatedAt, lastInstruction: tweakText, lastCustomPrompt: customPrompt, ...(prevAssetState?.locked ? { locked: true, lockedAt: prevAssetState?.lockedAt || generatedAt, lockedImageUrl: resultUrl } : {}) };
        });
      } catch (error) {
        updateStoryboardAssetStatus(storyboardNode.id, assetType, assetId, { prompt, status: "error", error: String(error?.message || error || "生成失败") });
      } finally {
        setHoveredStoryboardAssetCard?.((current) =>
          current && current.nodeId === storyboardNode.id && current.assetType === assetType && String(current.asset?.entity_id || current.asset?.name || "").trim() === assetId
            ? { ...current, sticky: false } : current,
        );
      }
    },
    [apiFetch, imageModelRecords, resolveModelParamsForId, updateStoryboardAssetStatus, setHoveredStoryboardAssetCard, aiChatHistoryRecordIdRef, aiChatSessionIdRef],
  );

  // ────────────────────────────────────────────────────────────────────────────
  // runStoryboardShotGeneration
  // ────────────────────────────────────────────────────────────────────────────

  const runStoryboardShotGeneration = useCallback(
    async (storyboardNode, _scene, shot) => {
      if (!storyboardNode || !shot || !apiFetch) return;
      const shotId = String(shot?.shot_id || "").trim();
      if (!shotId) return;

      updateStoryboardAssetStatus(storyboardNode.id, "shots", shotId, { status: "running", error: "" });
      setHoveredStoryboardShotCard?.((current) =>
        current && current.nodeId === storyboardNode.id && String(current.shot?.shot_id || "") === shotId
          ? { ...current, sticky: true } : current,
      );

      try {
        const preferredNanoModelId = String(AI_CHAT_IMAGE_MODEL_ID_NANO_BANANA2 || "").trim();
        const loadedModelIdSet = new Set((Array.isArray(imageModelRecords) ? imageModelRecords : []).map((item) => String(item?.id || item?.value || "").trim()).filter(Boolean));
        const targetModelId = (preferredNanoModelId && loadedModelIdSet.has(preferredNanoModelId) ? preferredNanoModelId : "") || findAIChatModelIdByKeywords(imageModelRecords) || "";
        if (!targetModelId) throw new Error("未找到 gptimage2 对应的图像模型ID");

        const paramList = await resolveModelParamsForId(targetModelId);
        const resolvedParamPayload = buildAIChatParamPayload(paramList);
        const selectedRatio = String(storyboardNode.data?.storyboard_plan?.aspect_ratio || "16:9").trim() || "16:9";
        const matchedSizeId = findAIChatParamValueId(paramList, ["size", "尺寸"], "1k");
        const matchedRatioId = findAIChatParamValueId(paramList, ["ratio", "比例", "宽高比", "画幅", "aspect"], selectedRatio);
        if (matchedSizeId) resolvedParamPayload.ai_image_param_size_id = matchedSizeId;
        if (matchedRatioId) resolvedParamPayload.ai_image_param_ratio_id = matchedRatioId;

        const plan = storyboardNode.data?.storyboard_plan || {};
        const assetState = storyboardNode.data?.storyboard_asset_state || {};
        const lab = plan.local_asset_bindings || {};
        const charBindings = Array.isArray(lab.character_bindings) ? lab.character_bindings : [];
        const sceneBindings = Array.isArray(lab.scene_bindings) ? lab.scene_bindings : [];
        const referenceImages = [];
        const apiRoot = (API_BASE || "").replace(/\/+$/, "");
        const resolveAssetUrl = (url) => { const u = String(url || "").trim(); if (!u) return ""; return u.startsWith("http") ? u : `${apiRoot}${u}`; };

        for (const cb of charBindings) {
          const threeViewUrl = String(cb?.three_view_url || "").trim();
          if (threeViewUrl) referenceImages.push({ type: "character", name: stripStoryboardDisplayIds(String(cb?.character_name || cb?.entity_name || "")), url: resolveAssetUrl(threeViewUrl) });
          const entityId = String(cb?.entity_id || "").trim();
          const charAssetUrl = String(assetState?.characters?.[entityId]?.selectedImageUrl || "").trim();
          if (charAssetUrl) referenceImages.push({ type: "asset", name: stripStoryboardDisplayIds(String(cb?.entity_name || "")), url: resolveAssetUrl(charAssetUrl) });
        }
        for (const ent of (Array.isArray(plan.entities?.subjects) ? plan.entities.subjects : [])) {
          const entityId = String(ent?.entity_id || "").trim();
          const subjAssetUrl = String(assetState?.subjects?.[entityId]?.selectedImageUrl || "").trim();
          if (subjAssetUrl) referenceImages.push({ type: "asset", name: stripStoryboardDisplayIds(String(ent?.name || "")), url: resolveAssetUrl(subjAssetUrl) });
        }
        for (const sb of sceneBindings) {
          const previewUrl = String((Array.isArray(sb?.preview_urls) ? sb.preview_urls : [])[0] || "").trim();
          if (previewUrl) referenceImages.push({ type: "scene", name: String(sb?.folder_name || sb?.matched_from || "").trim(), url: resolveAssetUrl(previewUrl) });
        }
        for (const locEnt of (Array.isArray(plan.entities?.locations) ? plan.entities.locations : [])) {
          const entityId = String(locEnt?.entity_id || "").trim();
          const locAssetUrl = String(assetState?.locations?.[entityId]?.selectedImageUrl || "").trim();
          if (locAssetUrl) referenceImages.push({ type: "asset", name: stripStoryboardDisplayIds(String(locEnt?.name || "")), url: resolveAssetUrl(locAssetUrl) });
        }

        const authorizationInfo = resolveMemberAuthorizationInfo();
        if (!authorizationInfo?.value) throw new Error("缺少 member authorization");

        const submitResp = await apiFetch("/api/storyboard/generate_shot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shot: { shot_id: shot.shot_id, shot_no: shot.shot_no, visual_description: String(shot.visual_description || "").trim(), camera: String(shot.camera || "").trim(), duration_sec: shot.duration_sec ?? 4.0, referenced_entities: Array.isArray(shot.referenced_entities) ? shot.referenced_entities : [], generation_notes: String(shot.generation_notes || "").trim() },
            storyboard_plan: { title: String(plan.title || "").trim(), style: String(plan.style || "").trim(), aspect_ratio: String(plan.aspect_ratio || "16:9").trim(), global_notes: Array.isArray(plan.global_notes) ? plan.global_notes : [], design_rationale: String(plan.design_rationale || "").trim() },
            entities: { characters: Array.isArray(plan.entities?.characters) ? plan.entities.characters : [], subjects: Array.isArray(plan.entities?.subjects) ? plan.entities.subjects : [], locations: Array.isArray(plan.entities?.locations) ? plan.entities.locations : [] },
            reference_images: referenceImages,
            ai_chat_model_id: targetModelId,
            authorization: authorizationInfo.value,
            history_ai_chat_record_id: aiChatHistoryRecordIdRef.current || "",
            module_enum: WORKBENCH_AI_CHAT_MODULE_ENUM,
            part_enum: String(resolveWorkbenchAIChatPartEnum({ mode: "text2img" })),
            ai_chat_session_id: aiChatSessionIdRef.current || "",
            ...resolvedParamPayload,
          }),
        });
        const submitData = await submitResp.json().catch(() => ({}));
        if (!submitResp.ok) throw new Error(String(submitData?.detail || "分镜图任务提交失败"));
        const taskId = String(submitData?.task_id || "").trim();
        if (!taskId) throw new Error("未返回 task_id");

        const pollIntervalMs = 1200;
        const timeoutMs = 600000;
        const startedAt = Date.now();
        let proxyData = null;
        while (true) {
          if (Date.now() - startedAt > timeoutMs) throw new Error("分镜图生成超时");
          const statusResp = await apiFetch(`/api/ai_chat_image_via_curl/${encodeURIComponent(taskId)}`);
          const statusData = await statusResp.json().catch(() => ({}));
          if (!statusResp.ok) throw new Error(String(statusData?.detail || statusData?.error || `轮询失败 HTTP ${statusResp.status}`));
          const status = String(statusData?.status || "").toUpperCase();
          if (status === "SUCCESS") {
            proxyData = statusData?.result && typeof statusData.result === "object" ? statusData.result : {};
            if (proxyData?.source_session_id) aiChatSessionIdRef.current = String(proxyData.source_session_id);
            if (proxyData?.source_history_record_id) aiChatHistoryRecordIdRef.current = String(proxyData.source_history_record_id);
            break;
          }
          if (status === "FAILED" || status === "TIMEOUT") {
            const result = statusData?.result && typeof statusData.result === "object" ? statusData.result : {};
            throw new Error(String(result?.done_error || statusData?.error || `分镜图生成${status === "TIMEOUT" ? "超时" : "失败"}`));
          }
          await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        }

        const resultUrl = pickFirstImageUrl(proxyData?.image_url) || pickFirstImageUrl(proxyData?.events) || pickFirstImageUrl(proxyData?.text) || pickFirstImageUrl(proxyData) || "";
        if (!resultUrl) throw new Error("分镜图生成未返回图片");

        const generatedAt = Date.now();
        updateStoryboardAssetStatus(storyboardNode.id, "shots", shotId, (prev) => {
          const prevCandidates = normalizeStoryboardAssetCandidates(prev?.candidates);
          const nextCandidate = { id: `candidate_${generatedAt}_${Math.random().toString(36).slice(2, 8)}`, url: resultUrl, createdAt: generatedAt, source: "generate" };
          const nextCandidates = [nextCandidate, ...prevCandidates.filter((c) => String(c?.url || "") !== resultUrl)].slice(0, 8);
          return { ...prev, status: "success", error: "", images: [resultUrl], candidates: nextCandidates, selectedCandidateId: nextCandidate.id, selectedImageUrl: resultUrl, lastGeneratedAt: generatedAt };
        });
      } catch (error) {
        updateStoryboardAssetStatus(storyboardNode.id, "shots", shotId, { status: "error", error: String(error?.message || error || "分镜图生成失败") });
      } finally {
        setHoveredStoryboardShotCard?.((current) =>
          current && current.nodeId === storyboardNode.id && String(current.shot?.shot_id || "") === shotId
            ? { ...current, sticky: false } : current,
        );
      }
    },
    [apiFetch, imageModelRecords, resolveModelParamsForId, updateStoryboardAssetStatus, setHoveredStoryboardShotCard, aiChatHistoryRecordIdRef, aiChatSessionIdRef],
  );

  // ────────────────────────────────────────────────────────────────────────────
  // createImageOperationResultNode
  // ────────────────────────────────────────────────────────────────────────────

  const createImageOperationResultNode = useCallback((sourceNodeId, resultImages, title) => {
    const safeImages = (Array.isArray(resultImages) ? resultImages : []).map((item) => String(item || "").trim()).filter(Boolean);
    if (!safeImages.length) return "";
    const sourceNode = getNodes().find((node) => node.id === sourceNodeId);
    if (!sourceNode) return "";
    const resultNodeId = generateId();
    const outgoingCount = getConnections().filter((connection) => connection.from === sourceNodeId).length;
    const resultNode = {
      id: resultNodeId,
      type: NODE_TYPES.OUTPUT,
      x: sourceNode.x + 350,
      y: sourceNode.y + Math.min(outgoingCount, 5) * 64,
      data: { title, images: safeImages },
    };
    storeSetNodes((prev) => [...prev, resultNode]);
    storeSetConnections((prev) => [...prev, { id: generateId(), from: sourceNodeId, to: resultNodeId }]);
    storeSetSelectedNodeIds(new Set([resultNodeId]));
    storeSetSelectedConnectionIds(new Set());
    return resultNodeId;
  }, [storeSetNodes, storeSetConnections, storeSetSelectedNodeIds, storeSetSelectedConnectionIds]);

  // ────────────────────────────────────────────────────────────────────────────
  // runCompactRemoveWatermark
  // ────────────────────────────────────────────────────────────────────────────

  const runCompactRemoveWatermark = useCallback(
    async (sourceNodeId) => {
      try {
        const sourceNode = getNodes().find((n) => n.id === sourceNodeId);
        const images = Array.isArray(sourceNode?.data?.images) ? sourceNode.data.images : [];
        const imageEntries = images.map((item, index) => ({ item, index })).filter(({ item }) => !!item && !isVideoContent(item));
        if (!imageEntries.length) throw new Error("缺少去水印输入图片");
        const resultImages = [];
        for (const { item } of imageEntries) {
          const resp = await apiFetch("/api/remove_watermark", { method: "POST", skipAuth: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: item, size: "1024x1024", aspect_ratio: "1:1" }) });
          const data = await resp.json().catch(() => ({}));
          if (!resp.ok) throw new Error(extractApiError(data));
          const nextImage = data.image || data.images?.[0] || "";
          if (!nextImage) throw new Error("去水印未返回结果");
          resultImages.push(nextImage);
        }
        pushHistory();
        createImageOperationResultNode(sourceNodeId, resultImages, "去水印结果");
        setRunToast({ message: imageEntries.length > 1 ? `批量去水印完成，共 ${imageEntries.length} 张` : "去水印完成", type: "info" });
        setTimeout(() => setRunToast(null), 2200);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error || "去水印失败");
        setRunToast({ message: `去水印失败：${message}`, type: "error" });
        setTimeout(() => setRunToast(null), 2600);
        throw error;
      }
    },
    [apiFetch, createImageOperationResultNode, pushHistory, setRunToast],
  );

  // ────────────────────────────────────────────────────────────────────────────
  // runCompactRmbg
  // ────────────────────────────────────────────────────────────────────────────

  const runCompactRmbg = useCallback(
    async (sourceNodeId) => {
      try {
        const sourceNode = getNodes().find((n) => n.id === sourceNodeId);
        const images = Array.isArray(sourceNode?.data?.images) ? sourceNode.data.images : [];
        const imageEntries = images.map((item, index) => ({ item, index })).filter(({ item }) => !!item && !isVideoContent(item));
        if (!imageEntries.length) throw new Error("缺少抠图输入图片");
        const resultImages = [];
        for (const { item } of imageEntries) {
          const resp = await apiFetch("/api/rmbg", { method: "POST", skipAuth: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: item, size: "1024x1024", aspect_ratio: "1:1" }) });
          const data = await resp.json().catch(() => ({}));
          if (!resp.ok) throw new Error(extractApiError(data));
          const nextImage = data.image || data.images?.[0] || "";
          if (!nextImage) throw new Error("抠图未返回结果");
          resultImages.push(nextImage);
        }
        pushHistory();
        createImageOperationResultNode(sourceNodeId, resultImages, "抠图结果");
        setRunToast({ message: imageEntries.length > 1 ? `批量抠图完成，共 ${imageEntries.length} 张` : "抠图完成", type: "info" });
        setTimeout(() => setRunToast(null), 2200);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error || "抠图失败");
        setRunToast({ message: `抠图失败：${message}`, type: "error" });
        setTimeout(() => setRunToast(null), 2600);
        throw error;
      }
    },
    [apiFetch, createImageOperationResultNode, pushHistory, setRunToast],
  );

  // ────────────────────────────────────────────────────────────────────────────
  // createConnectedImg2ImgBranch
  // ────────────────────────────────────────────────────────────────────────────

  const createConnectedImg2ImgBranch = useCallback(
    (sourceNodeId) => {
      pushHistory();
      const sourceNode = getNodes().find((n) => n.id === sourceNodeId);
      if (!sourceNode) return;
      const imgs = sourceNode.data.images || [];
      const picked = activeArtifact?.fromNodeId === sourceNodeId ? activeArtifact.url : (imgs[0] || null);
      if (!picked) return;
      const inId = generateId(), procId = generateId(), outId = generateId();
      const baseX = sourceNode.x + 350, baseY = sourceNode.y + 240;
      const inputNode = { id: inId, type: NODE_TYPES.INPUT, x: baseX, y: baseY, data: { images: [picked], mediaKind: "image", title: getReferenceNodeTitle("image") } };
      const img2imgNode = { id: procId, type: NODE_TYPES.PROCESSOR, x: baseX + 350, y: baseY, data: { mode: "multi_image_generate", prompt: "", templates: { size: "1k", note: "" }, batchSize: 1, uploadedImages: [], status: "idle", refImage: null, model: defaultImageModelId } };
      const outputNode = { id: outId, type: NODE_TYPES.OUTPUT, x: baseX + 700, y: baseY, data: { images: [] } };
      storeSetNodes((prev) => [...prev, inputNode, img2imgNode, outputNode]);
      storeSetConnections((prev) => [...prev, { id: generateId(), from: sourceNodeId, to: inId }, { id: generateId(), from: inId, to: procId }, { id: generateId(), from: procId, to: outId }]);
      storeSetSelectedNodeIds(new Set([procId]));
      storeSetSelectedConnectionIds(new Set());
    },
    [pushHistory, activeArtifact, defaultImageModelId, storeSetNodes, storeSetConnections, storeSetSelectedNodeIds, storeSetSelectedConnectionIds],
  );

  // ────────────────────────────────────────────────────────────────────────────
  // runCompactVideoUpscale
  // ────────────────────────────────────────────────────────────────────────────

  const runCompactVideoUpscale = useCallback(
    async (sourceNodeId, imageIndex = 0, templateEnum = VOLC_VIDEO_HD_TEMPLATE_ENUM_1) => {
      const sourceNode = getNodes().find((node) => node.id === sourceNodeId);
      const sourceImages = Array.isArray(sourceNode?.data?.images) ? sourceNode.data.images : [];
      const safeIndex = Math.max(0, Math.min(imageIndex, sourceImages.length - 1));
      const retrySources = sourceNode?.data?.compactVideoUpscaleSources && typeof sourceNode.data.compactVideoUpscaleSources === "object" ? sourceNode.data.compactVideoUpscaleSources : {};
      const retrySourceVideo = String(retrySources?.[safeIndex] || "").trim();
      const sourceVideo = retrySourceVideo || sourceImages[safeIndex] || sourceImages[0] || "";
      if (!sourceVideo || !isVideoContent(sourceVideo)) throw new Error("缺少可用于视频超清的视频素材");

      const safeTemplateEnum = parseInt(String(templateEnum ?? VOLC_VIDEO_HD_TEMPLATE_ENUM_1), 10) || VOLC_VIDEO_HD_TEMPLATE_ENUM_1;
      const authorizationInfo = resolveMemberAuthorizationInfo();
      const proxyPayload = {
        authorization: authorizationInfo?.value || "",
        history_ai_chat_record_id: aiChatHistoryRecordIdRef.current || "",
        module_enum: WORKBENCH_AI_CHAT_MODULE_ENUM,
        part_enum: String(resolveWorkbenchAIChatPartEnum({ mode: "video_upscale" })),
        ai_chat_session_id: aiChatSessionIdRef.current || "",
        ai_chat_model_id: DEFAULT_VIDEO_HD_MODEL_ID,
        message: "视频画质增强",
        template_enum: String(safeTemplateEnum),
        async: "false",
        files: [sourceVideo],
      };
      if (!proxyPayload.authorization) throw new Error("缺少 member authorization，无法调用后端curl代理");

      updateApiDebugStatus?.("aiChatImage", { status: "loading", message: `POST /api/ai_chat_image_via_curl part=${resolveWorkbenchAIChatPartEnum({ mode: "video_upscale" })}` });
      pushApiDebugDetail?.("aiChatImage", { type: "start", path: "/api/ai_chat_image_via_curl", payload: { ...proxyPayload, authorization: `${proxyPayload.authorization.slice(0, 18)}...`, files: ["count=1(video)"] }, authorizationSource: authorizationInfo?.source || "none" });

      const proxyData = await submitAIChatImageTask(apiFetch, proxyPayload, { onDebug: (event) => pushApiDebugDetail?.("aiChatImage", event) });
      if (proxyData?.source_session_id) aiChatSessionIdRef.current = String(proxyData.source_session_id);
      if (proxyData?.source_history_record_id) aiChatHistoryRecordIdRef.current = String(proxyData.source_history_record_id);

      const resultUrl = pickFirstVideoUrl(proxyData?.video_url) || pickFirstVideoUrl(proxyData?.output_video) || pickFirstVideoUrl(proxyData?.events) || pickFirstVideoUrl(proxyData?.text) || pickFirstVideoUrl(proxyData) || pickFirstImageUrl(proxyData?.image_url) || pickFirstImageUrl(proxyData?.events) || pickFirstImageUrl(proxyData?.text) || "";
      if (!resultUrl && String(proxyData?.done_error || "").trim()) throw new Error(`AI Chat 返回错误：${String(proxyData.done_error).trim()}`);
      if (!resultUrl) { const summary = summarizeAIChatResponse(proxyData); throw new Error(`aiChat 视频超清未返回可解析URL${summary ? ` | 响应摘要: ${summary}` : ""}`); }

      pushHistory();
      const nextImages = [...sourceImages]; nextImages[safeIndex] = resultUrl;
      updateNodeData(sourceNodeId, { images: nextImages, compactVideoUpscaleSources: { ...retrySources, [safeIndex]: retrySourceVideo || sourceVideo }, compactVideoUpscaleLastResultVideo: resultUrl, compactVideoUpscaleLastTemplateEnum: safeTemplateEnum, status: "idle", error: "" });
      updateApiDebugStatus?.("aiChatImage", { status: "success", message: `part=${resolveWorkbenchAIChatPartEnum({ mode: "video_upscale" })} template=${safeTemplateEnum}` });
      setRunToast({ message: `视频超清完成 (${safeTemplateEnum === VOLC_VIDEO_HD_TEMPLATE_ENUM_2 ? "4K" : "2K"})`, type: "info" });
      setTimeout(() => setRunToast(null), 2200);
    },
    [apiFetch, pushHistory, updateNodeData, setRunToast, pushApiDebugDetail, updateApiDebugStatus, aiChatHistoryRecordIdRef, aiChatSessionIdRef],
  );

  // ────────────────────────────────────────────────────────────────────────────
  // runVideoLineart
  // ────────────────────────────────────────────────────────────────────────────

  const runVideoLineart = useCallback(
    async (sourceNodeId, mediaIndex = 0, config = {}) => {
      try {
        const sourceNode = getNodes().find((node) => node.id === sourceNodeId);
        const sourceImages = Array.isArray(sourceNode?.data?.images) ? sourceNode.data.images : [];
        const safeIndex = Math.max(0, Math.min(mediaIndex, sourceImages.length - 1));
        const retrySources = sourceNode?.data?.videoLineartSourceVideos && typeof sourceNode.data.videoLineartSourceVideos === "object" ? sourceNode.data.videoLineartSourceVideos : {};
        const retrySourceVideo = String(retrySources?.[safeIndex] || "").trim();
        const sourceVideo = retrySourceVideo || sourceImages[safeIndex] || sourceImages[0] || "";
        if (!sourceVideo || !isVideoContent(sourceVideo)) throw new Error("缺少可用于转线稿的视频素材");

        const safeConfig = normalizeVideoLineartConfig(config);
        const result = await runVideoLineartTask({ video: sourceVideo, lineStrength: safeConfig.lineStrength, lineColor: safeConfig.lineColor }, apiFetch);
        const resultUrl = String(result?.video || "").trim();
        if (!resultUrl) throw new Error("视频转线稿未返回结果");

        pushHistory();
        const nextImages = [...sourceImages]; nextImages[safeIndex] = resultUrl;
        updateNodeData(sourceNodeId, { images: nextImages, videoLineartSourceVideos: { ...retrySources, [safeIndex]: retrySourceVideo || sourceVideo }, videoLineartLastResultVideo: resultUrl, videoLineartConfig: safeConfig, status: "idle", error: "" });
        setRunToast({ message: "视频转线稿完成", type: "info" });
        setTimeout(() => setRunToast(null), 2200);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error || "视频转线稿失败");
        setRunToast({ message: `视频转线稿失败：${message}`, type: "error" });
        setTimeout(() => setRunToast(null), 2600);
        throw error;
      }
    },
    [apiFetch, pushHistory, updateNodeData, setRunToast],
  );

  // ────────────────────────────────────────────────────────────────────────────
  // runVideoRmbg
  // ────────────────────────────────────────────────────────────────────────────

  const runVideoRmbg = useCallback(
    async (sourceNodeId, mediaIndex = 0) => {
      try {
        const sourceNode = getNodes().find((node) => node.id === sourceNodeId);
        const sourceImages = Array.isArray(sourceNode?.data?.images) ? sourceNode.data.images : [];
        const safeIndex = Math.max(0, Math.min(mediaIndex, sourceImages.length - 1));
        const retrySources = sourceNode?.data?.videoRmbgSourceVideos && typeof sourceNode.data.videoRmbgSourceVideos === "object" ? sourceNode.data.videoRmbgSourceVideos : {};
        const retrySourceVideo = String(retrySources?.[safeIndex] || "").trim();
        const sourceVideo = retrySourceVideo || sourceImages[safeIndex] || sourceImages[0] || "";
        if (!sourceVideo || !isVideoContent(sourceVideo)) throw new Error("缺少可用于去背景的视频素材");

        const result = await runVideoRmbgTask({ video: sourceVideo }, apiFetch);
        const resultUrl = String(result?.video || "").trim();
        if (!resultUrl) throw new Error("视频去背景未返回结果");

        pushHistory();
        const nextImages = [...sourceImages]; nextImages[safeIndex] = resultUrl;
        updateNodeData(sourceNodeId, { images: nextImages, videoRmbgSourceVideos: { ...retrySources, [safeIndex]: retrySourceVideo || sourceVideo }, videoRmbgLastResultVideo: resultUrl, status: "idle", error: "" });
        setRunToast({ message: "视频去背景完成", type: "info" });
        setTimeout(() => setRunToast(null), 2200);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error || "视频去背景失败");
        setRunToast({ message: `视频去背景失败：${message}`, type: "error" });
        setTimeout(() => setRunToast(null), 2600);
        throw error;
      }
    },
    [apiFetch, pushHistory, updateNodeData, setRunToast],
  );

  // ────────────────────────────────────────────────────────────────────────────
  // runVideoSplit
  // ────────────────────────────────────────────────────────────────────────────

  const runVideoSplit = useCallback(
    async (sourceNodeId, mediaIndex = 0, segments = [], options = {}) => {
      try {
        const sourceNode = getNodes().find((node) => node.id === sourceNodeId);
        const sourceImages = Array.isArray(sourceNode?.data?.images) ? sourceNode.data.images : [];
        const safeIndex = Math.max(0, Math.min(mediaIndex, sourceImages.length - 1));
        const sourceVideo = sourceImages[safeIndex] || sourceImages[0] || "";
        if (!sourceVideo || !isVideoContent(sourceVideo)) throw new Error("缺少可用于编辑的视频素材");

        const safeSegments = normalizeVideoSplitSegments(segments);
        const result = await runVideoSplitTask({ video: sourceVideo, segments: safeSegments, outputResolution: String(options?.outputResolution || DEFAULT_VIDEO_SPLIT_OUTPUT_RESOLUTION).trim().toLowerCase(), includeAudio: Boolean(options?.includeAudio) }, apiFetch);
        const outputVideos = Array.isArray(result?.videos) ? result.videos.map((item) => String(item || "").trim()).filter(Boolean) : [];
        if (!outputVideos.length) throw new Error("视频分割未返回结果");

        pushHistory();
        const baseX = Number(sourceNode?.x || 0) + 320;
        const baseY = Number(sourceNode?.y || 0);
        const columnCount = outputVideos.length > 3 ? 2 : 1;
        const newNodes = outputVideos.map((video, index) => ({
          id: generateId(),
          type: NODE_TYPES.INPUT,
          x: baseX + (index % columnCount) * 320,
          y: baseY + Math.floor(index / columnCount) * 220,
          data: { images: [video], title: `视频分段 ${index + 1}` },
        }));
        storeSetNodes((prev) => [...prev, ...newNodes]);
        storeSetSelectedNodeIds(new Set(newNodes.map((node) => node.id)));
        storeSetSelectedConnectionIds(new Set());
        setActiveNodeId(newNodes[0]?.id || null);
        setRunToast({ message: `视频分割完成，已生成 ${outputVideos.length} 个组件`, type: "info" });
        setTimeout(() => setRunToast(null), 2400);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error || "视频分割失败");
        setRunToast({ message: `视频分割失败：${message}`, type: "error" });
        setTimeout(() => setRunToast(null), 2600);
        throw error;
      }
    },
    [apiFetch, pushHistory, storeSetNodes, storeSetSelectedNodeIds, storeSetSelectedConnectionIds, setActiveNodeId, setRunToast],
  );

  // ────────────────────────────────────────────────────────────────────────────
  // runCompactThreeView
  // ────────────────────────────────────────────────────────────────────────────

  const runCompactThreeView = useCallback(
    async (sourceNodeId) => {
      const sourceNode = getNodes().find((node) => node.id === sourceNodeId);
      const sourceImages = Array.isArray(sourceNode?.data?.images) ? sourceNode.data.images : [];
      const retrySources = sourceNode?.data?.compactThreeViewSourceImages && typeof sourceNode.data.compactThreeViewSourceImages === "object" ? sourceNode.data.compactThreeViewSourceImages : {};
      const imageEntries = sourceImages.map((item, index) => ({ item, index })).filter(({ item }) => !!item && !isVideoContent(item));
      if (!imageEntries.length) throw new Error("缺少三视图输入图片");
      const firstSourceImage = String(retrySources?.[imageEntries[0]?.index] || imageEntries[0]?.item || "").trim();

      const modelId = String(threeViewImageModelId || "").trim();
      if (!modelId) throw new Error("图片模型仍在加载，请稍后重试");

      const paramList = await resolveModelParamsForId(modelId);
      const resolvedParamPayload = buildAIChatParamPayload(paramList);
      const matchedSizeId = findAIChatParamValueId(paramList, ["size", "尺寸"], THREE_VIEW_DEFAULT_TEMPLATES.size) || findAIChatParamValueId(paramList, ["size", "尺寸"], "1024x1024");
      const matchedRatioId = findAIChatParamValueId(paramList, ["ratio", "比例", "宽高比", "画幅", "aspect"], THREE_VIEW_DEFAULT_TEMPLATES.aspect_ratio);
      if (!matchedSizeId) throw new Error(`未匹配到size参数ID: ${THREE_VIEW_DEFAULT_TEMPLATES.size}`);
      if (!matchedRatioId) throw new Error(`未匹配到ratio参数ID: ${THREE_VIEW_DEFAULT_TEMPLATES.aspect_ratio}`);
      resolvedParamPayload.ai_image_param_size_id = matchedSizeId;
      resolvedParamPayload.ai_image_param_ratio_id = matchedRatioId;

      const authorizationInfo = resolveMemberAuthorizationInfo();
      const proxyPayload = {
        authorization: authorizationInfo?.value || "",
        history_ai_chat_record_id: aiChatHistoryRecordIdRef.current || "",
        module_enum: WORKBENCH_AI_CHAT_MODULE_ENUM,
        part_enum: String(resolveWorkbenchAIChatPartEnum({ mode: "multi_image_generate" })),
        ai_chat_session_id: aiChatSessionIdRef.current || "",
        ai_chat_model_id: modelId,
        message: THREE_VIEW_PROMPT,
        images: firstSourceImage ? [firstSourceImage] : [],
        ...resolvedParamPayload,
      };
      if (!proxyPayload.authorization) throw new Error("缺少 member authorization，无法调用后端curl代理");

      updateApiDebugStatus?.("aiChatImage", { status: "loading", message: `POST /api/ai_chat_image_via_curl part=${resolveWorkbenchAIChatPartEnum({ mode: "multi_image_generate" })}` });
      pushApiDebugDetail?.("aiChatImage", { type: "start", path: "/api/ai_chat_image_via_curl", payload: { ...proxyPayload, authorization: `${proxyPayload.authorization.slice(0, 18)}...`, images: [`count=${imageEntries.length}`] }, authorizationSource: authorizationInfo?.source || "none" });

      const nextRetrySources = { ...retrySources };
      const resultImages = [];
      for (const { item, index } of imageEntries) {
        const retrySourceImage = String(nextRetrySources?.[index] || "").trim();
        const sourceImage = retrySourceImage || item;
        const proxyData = await submitAIChatImageTask(apiFetch, { ...proxyPayload, history_ai_chat_record_id: aiChatHistoryRecordIdRef.current || "", ai_chat_session_id: aiChatSessionIdRef.current || "", images: [sourceImage] }, { onDebug: (event) => pushApiDebugDetail?.("aiChatImage", event) });
        if (proxyData?.source_session_id) aiChatSessionIdRef.current = String(proxyData.source_session_id);
        if (proxyData?.source_history_record_id) aiChatHistoryRecordIdRef.current = String(proxyData.source_history_record_id);

        const resultUrl = pickFirstImageUrl(proxyData?.image_url) || pickFirstImageUrl(proxyData?.events) || pickFirstImageUrl(proxyData?.text) || "";
        const doneErrMsg = String(proxyData?.done_error || "").trim();
        if (!resultUrl && doneErrMsg) throw new Error(`AI Chat 返回错误：${doneErrMsg}`);
        if (!resultUrl) { const summary = summarizeAIChatResponse(proxyData); throw new Error(`aiChat 三视图未返回可解析图片URL${summary ? ` | 响应摘要: ${summary}` : ""}`); }
        resultImages.push(resultUrl);
      }

      pushHistory();
      createImageOperationResultNode(sourceNodeId, resultImages, "三视图结果");
      updateApiDebugStatus?.("aiChatImage", { status: "success", message: `three-view model=${modelId} params=${Object.keys(resolvedParamPayload).length}` });
      setRunToast({ message: imageEntries.length > 1 ? `批量三视图完成，共 ${imageEntries.length} 张` : "三视图生成完成", type: "info" });
      setTimeout(() => setRunToast(null), 2200);
    },
    [apiFetch, pushHistory, createImageOperationResultNode, resolveModelParamsForId, threeViewImageModelId, setRunToast, pushApiDebugDetail, updateApiDebugStatus, aiChatHistoryRecordIdRef, aiChatSessionIdRef],
  );

  // ─── Return all operations ────────────────────────────────────────────────

  return {
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
  };
}
