/**
 * useAgentMission.js — Agent 任务执行 hook
 * (Phase 7 迁移，原 Workbench.jsx 组件体内 L2433–L3804，约 1372 行)
 *
 * 包含：runAgentConversation / runCanvasPlanMission / sendAgentMissionFromText /
 * confirmScriptExtraction / buildAssetCanvas / skipToShotWorkflow /
 * buildDirectVideoCanvas / sendAgentMission / polishAgentPromptInput /
 * handleAgentComposerUpload / removeAgentComposerFile / handleAgentQuickAction /
 * insertCanvasPromptExample / handleCanvasExamplePick / 偏好建议回调 /
 * 回归反馈回调 / retryAgentTurn / deleteNode / runStoryboardInputFromFiles
 * + devSuggestionLog / hitlFeedbackRows / devRegressionLog (useMemo)
 */
import { useCallback, useMemo } from "react";
import { useCanvasStore } from "../stores/canvasStore.js";
import {
  cloneDeep,
  buildRouteDebug,
  parseCanvasClarification,
} from "../lib/workbenchHelpers.js";
import {
  AGENT_DOCUMENT_MAX_BYTES,
  AGENT_SHOT_WORKFLOW_QUICK_PROMPT,
  HITL_FEEDBACK_UI_ENABLED,
  looksLikeShotWorkflowScriptText,
  enhanceStoryboardPatchWithProductionWorkflow,
  isAgentComposerDocumentFile,
  looksLikeStoryboardScriptTableFile,
  readAgentDocumentText,
  getAgentDocumentMimeType,
} from "../lib/agentHelpers.js";
import {
  sendAgentMessage,
  pollStoryboardTask,
  polishCanvasPrompt,
} from "../api/agentCanvas";
import { setPreference as setMemoryPreference } from "../api/memoryPreferences";
import { harvestEvalCase } from "../api/qualityFeedback";
import { makeAgentId, HITL_FEEDBACK_REASON_OPTIONS } from "../hooks/useAgentChat";
import { buildHitlFeedbackRows } from "../agent/hitlFeedbackHistory";
import { detectPreferenceSuggestions } from "../agent/preferenceSuggestion";
import {
  NODE_TYPES,
  SHOT_WORKFLOW_RUN_STEPS,
  STORYBOARD_RUN_STEPS,
  normalizePromptPolishVariants,
} from "../constants/workbench.jsx";
import { extractCanvasSupplementalPrompt } from "../components/agent-canvas/promptUtils.js";

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAgentMission({
  // useAgentChat state
  agentTurns,
  activeAgentSession,
  updateActiveAgentSession,
  appendAgentTurn,
  updateAgentTurn,
  appendAssistantTurn,
  setPendingTaskForActiveSession,
  clearPendingTaskForActiveSession,
  agentInput, setAgentInput,
  agentInputFocused, setAgentInputFocused,
  agentComposerFiles, setAgentComposerFiles,
  agentInputRef,
  agentUploadInputRef,
  setActiveComposerActionId,
  activeComposerActionId,
  showCanvasExamples, setShowCanvasExamples,
  setAgentPromptPolishLoading,
  setAgentPromptPolishError,
  openPromptPolishPicker,
  feedbackDialog, setFeedbackDialog,
  feedbackReasonChoice, setFeedbackReasonChoice,
  feedbackReasonNote, setFeedbackReasonNote,
  setSavingFeedbackTargetId,
  refreshMemoryPreferences,
  updateSuggestionStatus,
  setSavingSuggestionId,
  setPreferenceNotice,
  // other state
  activeArtifact,
  apiFetch,
  aiChatSessionIdRef,
  aiChatHistoryRecordIdRef,
  agentDevMode,
  setRunToast,
  upsertCanvasDraftSnapshot,
  setShowPreferencesPanel,
  setPreferencesPanelPrefill,
  pushApiDebugDetail,
  updateApiDebugStatus,
  // canvas node ops
  updateNodeData,
  // focusCanvasNode removed: implemented inline via canvasStore to avoid TDZ
  viewportRef,
}) {
  // ── canvas store ────────────────────────────────────────────────────────────
  const storeApplyPatch = useCanvasStore((s) => s.applyPatch);
  const storePushHistory = useCanvasStore((s) => s.pushHistory);
  const storeSetNodes = useCanvasStore((s) => s.setNodes);
  const storeSetConnections = useCanvasStore((s) => s.setConnections);
  const storeSetSelectedNodeIds = useCanvasStore((s) => s.setSelectedNodeIds);
  const canvasId = useCanvasStore((s) => s.canvasId);
  const getNodes = () => useCanvasStore.getState().nodes;
  const getConnections = () => useCanvasStore.getState().connections;
  const getViewport = () => useCanvasStore.getState().viewport;

  // ── _applyPatch wrapper (returns snapshot for upsertCanvasDraftSnapshot) ───
  const _applyPatch = useCallback((ops) => {
    if (!Array.isArray(ops) || ops.length === 0) return undefined;
    return storeApplyPatch(ops);
  }, [storeApplyPatch]);

  // ── Computed (memos stay here — they depend on agentTurns) ────────────────

  const devSuggestionLog = useMemo(() => {
    const rows = [];
    for (const turn of agentTurns) {
      for (const suggestion of turn?.memorySuggestions || []) {
        rows.push({ turnId: turn.id, key: suggestion.key, value: suggestion.value, status: suggestion.status || "pending", reason: suggestion.reason || "" });
      }
    }
    return rows.slice(-10).reverse();
  }, [agentTurns]);

  const hitlFeedbackRows = useMemo(() => buildHitlFeedbackRows(agentTurns), [agentTurns]);

  const devRegressionLog = useMemo(() => {
    const rows = [];
    for (const turn of agentTurns) {
      if (!turn?.qualityFeedback) continue;
      rows.push({ turnId: turn.id, status: turn.qualityFeedback.status || "unknown", reason: turn.qualityFeedback.reason || "", caseId: turn.qualityFeedback.caseId || "", error: turn.qualityFeedback.error || "" });
    }
    return rows.slice(-10).reverse();
  }, [agentTurns]);

  // ── Agent document helpers ──────────────────────────────────────────────────

  const getRecentAgentUploadedDocuments = useCallback(() => {
    const turns = activeAgentSession?.turns || [];
    for (const turn of [...turns].reverse()) {
      const docs = Array.isArray(turn?.uploadedDocuments) ? turn.uploadedDocuments : [];
      if (docs.length) return docs;
    }
    return [];
  }, [activeAgentSession?.turns]);

  const shouldReuseRecentUploadedDocuments = useCallback((message) => {
    const text = String(message || "").trim();
    if (!text) return false;
    return /(这份|这个|上面|刚才|上传|脚本|表格|csv|整理成故事板|导入故事板|按这份)/i.test(text);
  }, []);

  // ── Core conversation ───────────────────────────────────────────────────────

  const runAgentConversation = useCallback(
    async (userText, route = null, extraPayload = null) => {
      const message = String(userText || "").trim();
      if (!message) return null;
      const explicitUploadedDocuments = Array.isArray(extraPayload?.uploadedDocuments) ? extraPayload.uploadedDocuments : [];
      const uploadedDocuments =
        explicitUploadedDocuments.length > 0 ? explicitUploadedDocuments
        : shouldReuseRecentUploadedDocuments(message) ? getRecentAgentUploadedDocuments()
        : [];
      const meta = { intent: route?.intent || "", product: route?.product || "", sessionId: activeAgentSession?.id || "" };
      const currentNodes = getNodes();
      const storyboardCount = currentNodes.filter((n) => n?.type === "storyboard_plan").length;
      return sendAgentMessage(
        {
          message,
          currentNodes: cloneDeep(currentNodes),
          currentConnections: cloneDeep(getConnections()),
          selectedArtifact: activeArtifact ? { url: activeArtifact.url, kind: activeArtifact.kind || "image", fromNodeId: activeArtifact.fromNodeId || null, createdAt: activeArtifact.createdAt || Date.now(), meta: activeArtifact.meta || {} } : null,
          canvasId,
          threadId: canvasId,
          uploadedDocuments,
          canvasNodeHints: { storyboard_count: storyboardCount },
          ...(extraPayload && typeof extraPayload === "object" ? extraPayload : {}),
        },
        apiFetch,
        meta,
      );
    },
    [activeAgentSession?.id, activeArtifact, apiFetch, canvasId, getRecentAgentUploadedDocuments, shouldReuseRecentUploadedDocuments],
  );

  // ── Canvas plan mission ─────────────────────────────────────────────────────

  const runCanvasPlanMission = useCallback(
    async (userText, routeMeta = {}, requestOptions = {}) => {
      updateApiDebugStatus("agentPlanner", { status: "loading", message: "POST /api/agent/invoke -> canvas_plan", detail: "" });
      try {
        const requestPayload = {
          prompt: userText,
          supplementalPrompt: String(requestOptions?.supplementalPrompt || "").trim(),
          currentNodes: cloneDeep(getNodes()),
          currentConnections: cloneDeep(getConnections()),
          selectedArtifact: activeArtifact ? { url: activeArtifact.url, kind: activeArtifact.kind || "image", fromNodeId: activeArtifact.fromNodeId || null, createdAt: activeArtifact.createdAt || Date.now(), meta: activeArtifact.meta || {} } : null,
          canvasId,
          threadId: canvasId,
        };
        const agentResponse = await runAgentConversation(userText, routeMeta, { supplementalPrompt: requestPayload.supplementalPrompt || "" });
        if (!(agentResponse?.intent === "canvas_plan")) throw new Error("Agent 未返回画布规划结果");
        const toolResult = agentResponse.tool_result || {};
        const plannerDebug = toolResult?.debug?.planner || {};
        const plannerPath = String(plannerDebug?.planner_path || "unknown");
        updateApiDebugStatus("agentPlanner", {
          status: plannerPath.includes("fallback") || plannerPath === "legacy" ? "warning" : "success",
          message: `agent_v2 · thread=${plannerDebug?.thread_id || canvasId || "--"}`,
        });
        pushApiDebugDetail("agentPlanner", {
          type: "response", path: "/api/agent/invoke",
          payload: { prompt: requestPayload.prompt, supplementalPrompt: requestPayload.supplementalPrompt || "", currentNodes: requestPayload.currentNodes.length, currentConnections: requestPayload.currentConnections.length, canvasId: requestPayload.canvasId || "" },
          response: { debug: plannerDebug, patch_count: Array.isArray(agentResponse?.patches) ? agentResponse.patches.length : 0, summary: agentResponse?.message || toolResult?.summary || "", thought: agentResponse?.thought || toolResult?.thought || "" },
        });
        const patch = Array.isArray(agentResponse?.patches) ? agentResponse.patches : [];
        if (!patch.length && !parseCanvasClarification(agentResponse)) throw new Error("Agent 未返回可执行的画布补丁");
        if (patch.length) { storePushHistory(); _applyPatch(patch); }
        return agentResponse;
      } catch (error) {
        updateApiDebugStatus("agentPlanner", { status: "error", message: error?.message || "POST /api/agent/invoke failed" });
        pushApiDebugDetail("agentPlanner", { type: "error", path: "/api/agent/invoke", message: error?.message || String(error || "") });
        throw error;
      }
    },
    [activeArtifact, canvasId, _applyPatch, pushApiDebugDetail, storePushHistory, runAgentConversation, updateApiDebugStatus],
  );

  // ── Preference helpers ──────────────────────────────────────────────────────

  const toValueArray = useCallback((value) => {
    if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
    const text = String(value || "").trim();
    return text ? [text] : [];
  }, []);

  const openPreferencesPanelWithSuggestion = useCallback((suggestion) => {
    if (!suggestion) return;
    setPreferencesPanelPrefill({ key: suggestion.key, value: suggestion.value, confidence: 0.9, source: "hitl_memory_suggestion", ts: Date.now() });
    setShowPreferencesPanel(true);
  }, [setPreferencesPanelPrefill, setShowPreferencesPanel]);

  const handlePreferenceSavedFromPanel = useCallback((payload) => {
    const key = String(payload?.key || "").trim();
    if (!key) return;
    setPreferenceNotice({ key, value: payload?.value, ts: Date.now() });
    setRunToast({ message: `偏好已更新：${key}`, type: "info" });
  }, [setPreferenceNotice, setRunToast]);

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
        await setMemoryPreference(apiFetch, { key: suggestion.key, value: nextValue, confidence: 0.9 });
        await refreshMemoryPreferences(true);
        updateSuggestionStatus(turnId, suggestion.id, "saved");
        setPreferenceNotice({ key: suggestion.key, value: nextValue, ts: Date.now() });
        setRunToast({ message: `偏好已保存：${suggestion.key}`, type: "info" });
      } catch (error) {
        updateSuggestionStatus(turnId, suggestion.id, "error", error?.message || "保存失败");
        setRunToast({ message: error?.message || "偏好保存失败", type: "error" });
      } finally {
        setSavingSuggestionId("");
      }
    },
    [apiFetch, refreshMemoryPreferences, toValueArray, updateSuggestionStatus, setSavingSuggestionId, setPreferenceNotice, setRunToast],
  );

  const ignoreMemorySuggestion = useCallback(
    (turnId, suggestion) => {
      if (!suggestion?.id) return;
      updateSuggestionStatus(turnId, suggestion.id, "ignored");
      setRunToast({ message: `已忽略建议：${suggestion.key}`, type: "info" });
    },
    [updateSuggestionStatus, setRunToast],
  );

  // ── Send mission ────────────────────────────────────────────────────────────

  const sendAgentMissionFromText = useCallback(
    async (text, options = {}) => {
      const missionText = String(text || "").trim();
      const uploadedDocuments = Array.isArray(options?.uploadedDocuments) ? options.uploadedDocuments : [];
      if (!missionText) return;
      const sessionId = activeAgentSession?.id || "";
      const pendingTask = activeAgentSession?.pendingTask || null;
      const memorySuggestions = detectPreferenceSuggestions(missionText);
      if (memorySuggestions.length > 0) {
        appendAssistantTurn(missionText, "检测到可保存的长期偏好，是否写入你的偏好记忆？", {
          userTextOverride: "",
          memorySuggestions,
          routeDebug: buildRouteDebug({ intent: "HELP", reason: "memory_suggestion_hitl", product: "" }, false),
        });
      }

      if (missionText === "取消" && pendingTask) {
        clearPendingTaskForActiveSession();
        appendAssistantTurn(missionText, "已取消待处理任务。", { userTextOverride: "", routeDebug: buildRouteDebug({ intent: pendingTask.intent, reason: "pending_task_cancelled", product: pendingTask.extractedProduct || "" }, false) });
        return;
      }

      if (pendingTask?.intent === "CANVAS" && (pendingTask?.missing || []).includes("prompt")) {
        const supplementedPrompt = String(missionText || "").trim();
        if (supplementedPrompt) {
          clearPendingTaskForActiveSession();
          try {
            const response = await runCanvasPlanMission(pendingTask.rawText || "", { intent: "CANVAS", product: "", sessionId }, { supplementalPrompt: supplementedPrompt });
            const clarification = parseCanvasClarification(response);
            if (clarification) {
              setPendingTaskForActiveSession({ intent: "CANVAS", rawText: pendingTask.rawText || "", extractedProduct: "", missing: ["prompt"], clarifyMode: clarification.mode, createdAt: Date.now() });
            }
            appendAssistantTurn(missionText, String(response?.message || response?.summary || response?.thought || "").trim(), {
              status: clarification ? "clarify" : "assistant",
              userTextOverride: "",
              showCancelPending: !!clarification,
              routeDebug: buildRouteDebug({ intent: "CANVAS", reason: clarification ? "canvas_prompt_clarification_pending" : "canvas_prompt_clarification_filled", product: "" }, true),
            });
            if (clarification) setRunToast({ message: String(response?.message || response?.summary || response?.thought || "").trim(), type: "info" });
          } catch (error) {
            appendAssistantTurn(missionText, error?.message || "画布自动搭建失败，请稍后重试。", { userTextOverride: "", routeDebug: buildRouteDebug({ intent: "CANVAS", reason: "canvas_prompt_clarification_failed", product: "" }, true) });
            setRunToast({ message: error?.message || "画布自动搭建失败", type: "error" });
          }
          return;
        }
      }

      const pendingExtractionTurn = agentTurns.filter((t) => t?.intent === "SCRIPT_EXTRACTION" && t?.status === "done" && !t?.extractionConfirmed && !t?.superseded).at(-1);
      if (pendingExtractionTurn) {
        updateAgentTurn(pendingExtractionTurn.id, { superseded: true });
        const editTurnId = appendAgentTurn({ userText: missionText, status: "running", assistantText: "", routeDebug: buildRouteDebug({ intent: "SCRIPT_EXTRACTION", reason: "script_edit_from_message", product: "" }, true), uploadedDocuments });
        try {
          const editResponse = await runAgentConversation(missionText, { intent: "SCRIPT_EXTRACTION", reason: "script_edit_from_message", product: "" }, { forceAction: "shot_workflow.extract", canvasNodeHints: { existing_extraction: { ...pendingExtractionTurn.response, source_text: pendingExtractionTurn.response?.source_text || "" }, edit_instruction: missionText } });
          const editResponseText = String(editResponse?.message || "").trim();
          const editRouteDebug = buildRouteDebug({ intent: "SCRIPT_EXTRACTION", reason: "script_edit_from_message", product: "" }, true, editResponse);
          if (editResponse?.intent === "tool_call" && editResponse?.tool_result?.kind === "script_extraction") {
            updateAgentTurn(editTurnId, { status: "done", assistantText: editResponseText || "已根据您的要求更新了剧本解析结果，如有调整需求可以随时告诉我，如满意，将继续为您生成主体图及场景图。", routeDebug: editRouteDebug, response: editResponse.tool_result, intent: "SCRIPT_EXTRACTION", intentReason: editRouteDebug.reason });
          } else {
            updateAgentTurn(editTurnId, { status: "assistant", assistantText: editResponseText || "已处理您的修改请求。", routeDebug: editRouteDebug });
          }
        } catch (editError) {
          updateAgentTurn(editTurnId, { status: "error", assistantText: editError?.message || "修改失败，请稍后重试。" });
        }
        return;
      }

      const isShotWorkflowMission = looksLikeShotWorkflowScriptText(missionText, uploadedDocuments);
      const route = isShotWorkflowMission
        ? { intent: "SHOT_WORKFLOW", reason: "frontend_shot_workflow_script_detected", product: "" }
        : { intent: "UNKNOWN", reason: "frontend_router_removed", product: "" };
      const extractedSupplementalPrompt = extractCanvasSupplementalPrompt(missionText);
      const pendingTurnId = appendAgentTurn({ userText: missionText, status: "running", assistantText: "", routeDebug: buildRouteDebug(route, true), uploadedDocuments });
      try {
        const response = await runAgentConversation(missionText, route, { supplementalPrompt: extractedSupplementalPrompt || "", uploadedDocuments, ...(isShotWorkflowMission ? { forceAction: "shot_workflow_design" } : {}) });
        const responseText = String(response?.message || "").trim();
        const routeDebug = buildRouteDebug({ ...route, reason: `agent_v2:${route.reason || "message"}` }, true, response);

        if (response?.intent === "canvas_plan") {
          const plannerResult = response.tool_result || {};
          const patch = Array.isArray(response?.patches) ? response.patches : [];
          const clarification = parseCanvasClarification(response);
          if (patch.length) {
            storePushHistory();
            const patchResult = _applyPatch(patch);
            if (patchResult?.nodes && patchResult?.connections) {
              upsertCanvasDraftSnapshot({ nodes: patchResult.nodes, connections: patchResult.connections, viewport: patchResult.viewport || getViewport() });
            }
          }
          if (clarification) setPendingTaskForActiveSession({ intent: "CANVAS", rawText: missionText, extractedProduct: "", missing: ["prompt"], clarifyMode: clarification.mode, createdAt: Date.now() });
          updateAgentTurn(pendingTurnId, { status: clarification ? "clarify" : "assistant", assistantText: String(response?.message || plannerResult?.summary || plannerResult?.thought || responseText).trim(), showCancelPending: !!clarification, routeDebug, response: plannerResult, intent: "CANVAS", intentReason: routeDebug.reason });
          if (clarification) setRunToast({ message: String(response?.message || plannerResult?.summary || plannerResult?.thought || responseText).trim(), type: "info" });
          return;
        }

        if (response?.intent === "tool_call" && response?.tool_result?.kind === "script_extraction") {
          updateAgentTurn(pendingTurnId, { status: "done", assistantText: responseText || String(response?.tool_result?.summary || "已从剧本中提取分镜信息，请确认后继续搭建工作流。").trim(), routeDebug, response: response.tool_result, intent: "SCRIPT_EXTRACTION", intentReason: routeDebug.reason });
          return;
        }

        if (response?.intent === "tool_call" && response?.tool_result?.kind === "shot_workflow" && Array.isArray(response?.patches)) {
          const patch = response.patches;
          if (patch.length) {
            storePushHistory();
            const patchResult = _applyPatch(patch);
            if (patchResult?.nodes && patchResult?.connections) {
              upsertCanvasDraftSnapshot({ nodes: patchResult.nodes, connections: patchResult.connections, viewport: patchResult.viewport || getViewport() });
            }
          }
          updateAgentTurn(pendingTurnId, { status: "done", assistantText: responseText || String(response?.tool_result?.summary || "已搭建分镜出图工作流。").trim(), routeDebug, response: response.tool_result, intent: "SHOT_WORKFLOW", intentReason: routeDebug.reason, stepIndex: SHOT_WORKFLOW_RUN_STEPS.length - 1 });
          return;
        }

        if (response?.intent === "tool_call" && response?.async_task?.task_id) {
          const storyboardTaskId = String(response.async_task.task_id);
          updateAgentTurn(pendingTurnId, { status: "running", assistantText: responseText || "分镜方案生成中，请稍候...", routeDebug, intent: "STORYBOARD", intentReason: routeDebug.reason });
          try {
            const taskResult = await pollStoryboardTask(storyboardTaskId, apiFetch, (s) => {
              if (s === "running") updateAgentTurn(pendingTurnId, { assistantText: "分镜方案生成中（AI 正在思考）..." });
            });
            const rawPatch = Array.isArray(taskResult?.patch) ? taskResult.patch : [];
            const patch = enhanceStoryboardPatchWithProductionWorkflow(rawPatch, { sourceText: missionText, sourceTitle: uploadedDocuments.length ? uploadedDocuments.map((item) => item.name).filter(Boolean).join("，") : "对话输入剧本", createSourceNode: true });
            const storyboardNodeIds = patch.filter((op) => op?.op === "add_node" && op?.node?.type === "storyboard_plan").map((op) => String(op?.node?.id || "").trim()).filter(Boolean);
            if (patch.length) {
              storePushHistory();
              const patchResult = _applyPatch(patch);
              if (patchResult?.nodes && patchResult?.connections) {
                upsertCanvasDraftSnapshot({ nodes: patchResult.nodes, connections: patchResult.connections, viewport: patchResult.viewport || getViewport() });
              }
            }
            updateAgentTurn(pendingTurnId, { status: "done", assistantText: String(taskResult?.summary || "已生成可编辑分镜方案。").trim(), routeDebug, response: { storyboardNodeIds, summary: String(taskResult?.summary || "").trim() }, intent: "STORYBOARD", intentReason: routeDebug.reason, stepIndex: STORYBOARD_RUN_STEPS.length - 1 });
          } catch (storyboardErr) {
            updateAgentTurn(pendingTurnId, { status: "error", error: storyboardErr?.message || "分镜生成失败，请稍后重试。", routeDebug });
          }
          return;
        }

        const genericToolText = String(response?.tool_result?.summary || response?.tool_result?.text || response?.tool_result?.answer || response?.summary || "").trim();
        updateAgentTurn(pendingTurnId, { status: response?.intent === "clarify" ? "clarify" : "assistant", assistantText: responseText || genericToolText || "任务已处理。", routeDebug });
      } catch (error) {
        updateAgentTurn(pendingTurnId, { status: "error", error: error?.message || "请求失败，请稍后重试。", routeDebug: buildRouteDebug({ ...route, reason: "agent_v2_error" }, true) });
      }
    },
    [activeAgentSession?.id, activeAgentSession?.pendingTask, agentTurns, appendAssistantTurn, appendAgentTurn, clearPendingTaskForActiveSession, runAgentConversation, apiFetch, runCanvasPlanMission, setPendingTaskForActiveSession, updateAgentTurn, upsertCanvasDraftSnapshot, storePushHistory, _applyPatch, setRunToast],
  );

  // ── Canvas action callbacks ─────────────────────────────────────────────────

  const confirmScriptExtraction = useCallback((extractionData) => {
    appendAgentTurn({ userText: "", assistantText: "已确认剧本提取内容，接下来是否要生成角色与场景的参考设定图？", status: "done", intent: "ASSET_GEN_CONFIRM", response: extractionData, routeDebug: buildRouteDebug({ intent: "ASSET_GEN_CONFIRM", reason: "script_extraction_confirmed", product: "" }, false) });
  }, [appendAgentTurn]);

  const buildAssetCanvas = useCallback(async (extractionData) => {
    const pendingTurnId = appendAgentTurn({ userText: "生成角色与场景参考设定图", status: "running", assistantText: "", routeDebug: buildRouteDebug({ intent: "ASSET_CANVAS_BUILT", reason: "asset_gen_confirmed", product: "" }, true), uploadedDocuments: [] });
    try {
      const response = await runAgentConversation("生成角色与场景参考设定图", { intent: "ASSET_CANVAS_BUILT", reason: "asset_gen_confirmed", product: "" }, { forceAction: "shot_workflow.build_asset_canvas", canvasNodeHints: { confirmed_extraction: extractionData } });
      const responseText = String(response?.message || "").trim();
      const routeDebug = buildRouteDebug({ intent: "ASSET_CANVAS_BUILT", reason: "asset_gen_confirmed" }, true, response);
      const patch = Array.isArray(response?.patches) ? response.patches : [];
      if (patch.length) {
        storePushHistory();
        const patchResult = _applyPatch(patch);
        if (patchResult?.nodes && patchResult?.connections) upsertCanvasDraftSnapshot({ nodes: patchResult.nodes, connections: patchResult.connections, viewport: patchResult.viewport || getViewport() });
      }
      updateAgentTurn(pendingTurnId, { status: "done", assistantText: responseText || String(response?.tool_result?.summary || "已在画布上创建参考设定图组。").trim(), routeDebug, response: response?.tool_result || {}, intent: "ASSET_CANVAS_BUILT", intentReason: routeDebug.reason, extractionData });
    } catch (error) {
      updateAgentTurn(pendingTurnId, { status: "error", error: error?.message || "请求失败，请稍后重试。", routeDebug: buildRouteDebug({ intent: "ASSET_CANVAS_BUILT", reason: "asset_canvas_error" }, true) });
    }
  }, [appendAgentTurn, runAgentConversation, updateAgentTurn, upsertCanvasDraftSnapshot, _applyPatch, storePushHistory]);

  const skipToShotWorkflow = useCallback(async (extractionData) => {
    const sourceText = String(extractionData?.source_text || "").trim();
    const pendingTurnId = appendAgentTurn({ userText: "跳过设定图，直接搭建出图工作流", status: "running", assistantText: "", routeDebug: buildRouteDebug({ intent: "SHOT_WORKFLOW", reason: "asset_gen_skipped", product: "" }, true), uploadedDocuments: [] });
    try {
      const response = await runAgentConversation(sourceText, { intent: "SHOT_WORKFLOW", reason: "asset_gen_skipped", product: "" }, { forceAction: "shot_workflow.compose", canvasNodeHints: { confirmed_extraction: extractionData } });
      const responseText = String(response?.message || "").trim();
      const routeDebug = buildRouteDebug({ intent: "SHOT_WORKFLOW", reason: "asset_gen_skipped" }, true, response);
      if (response?.intent === "tool_call" && response?.tool_result?.kind === "shot_workflow" && Array.isArray(response?.patches)) {
        const patch = response.patches;
        if (patch.length) {
          storePushHistory();
          const patchResult = _applyPatch(patch);
          if (patchResult?.nodes && patchResult?.connections) upsertCanvasDraftSnapshot({ nodes: patchResult.nodes, connections: patchResult.connections, viewport: patchResult.viewport || getViewport() });
        }
        updateAgentTurn(pendingTurnId, { status: "done", assistantText: responseText || String(response?.tool_result?.summary || "已搭建分镜出图工作流。").trim(), routeDebug, response: response.tool_result, intent: "SHOT_WORKFLOW", intentReason: routeDebug.reason, stepIndex: SHOT_WORKFLOW_RUN_STEPS.length - 1 });
      } else {
        updateAgentTurn(pendingTurnId, { status: "done", assistantText: responseText || "已处理。", routeDebug });
      }
    } catch (error) {
      updateAgentTurn(pendingTurnId, { status: "error", error: error?.message || "请求失败，请稍后重试。", routeDebug: buildRouteDebug({ intent: "SHOT_WORKFLOW", reason: "skip_asset_gen_error" }, true) });
    }
  }, [appendAgentTurn, runAgentConversation, updateAgentTurn, upsertCanvasDraftSnapshot, _applyPatch, storePushHistory]);

  const buildDirectVideoCanvas = useCallback(async (extractionData) => {
    const sourceText = String(extractionData?.source_text || "").trim();
    const pendingTurnId = appendAgentTurn({ userText: "直接参考主体和场景生成视频", status: "running", assistantText: "", routeDebug: buildRouteDebug({ intent: "VIDEO_CANVAS_BUILT", reason: "direct_video_chosen", product: "" }, true), uploadedDocuments: [] });
    try {
      const response = await runAgentConversation(sourceText, { intent: "VIDEO_CANVAS_BUILT", reason: "direct_video_chosen", product: "" }, { forceAction: "shot_workflow.build_video_canvas", canvasNodeHints: { confirmed_extraction: extractionData } });
      const responseText = String(response?.message || "").trim();
      const routeDebug = buildRouteDebug({ intent: "VIDEO_CANVAS_BUILT", reason: "direct_video_chosen" }, true, response);
      const patch = Array.isArray(response?.patches) ? response.patches : [];
      if (patch.length) {
        storePushHistory();
        const patchResult = _applyPatch(patch);
        if (patchResult?.nodes && patchResult?.connections) upsertCanvasDraftSnapshot({ nodes: patchResult.nodes, connections: patchResult.connections, viewport: patchResult.viewport || getViewport() });
      }
      updateAgentTurn(pendingTurnId, { status: "done", assistantText: responseText || String(response?.tool_result?.summary || "已搭建图生视频工作流。").trim(), routeDebug, response: response?.tool_result || {}, intent: "VIDEO_CANVAS_BUILT", intentReason: routeDebug.reason });
    } catch (error) {
      updateAgentTurn(pendingTurnId, { status: "error", error: error?.message || "请求失败，请稍后重试。", routeDebug: buildRouteDebug({ intent: "VIDEO_CANVAS_BUILT", reason: "direct_video_error" }, true) });
    }
  }, [appendAgentTurn, runAgentConversation, updateAgentTurn, upsertCanvasDraftSnapshot, _applyPatch, storePushHistory]);

  // ── Composer send ───────────────────────────────────────────────────────────

  const sendAgentMission = () => {
    const text = String(agentInput || "").trim();
    const documentAttachments = agentComposerFiles.filter((item) => item.kind === "document").map((item) => ({ name: item.name, mime_type: item.mimeType || "", kind: item.documentKind || "document", text_content: item.textContent || "" })).filter((item) => String(item.text_content || "").trim());
    const imageAttachments = agentComposerFiles.filter((item) => item.kind === "image");
    const fallbackText = documentAttachments.some((item) => item.kind === "storyboard_script_table" || /\.(csv|tsv)$/i.test(String(item.name || "")))
      ? "请为这份分镜头脚本搭建每个镜头的出图工作流"
      : documentAttachments.length ? "请处理我上传的文件" : "";
    const effectiveText = text || fallbackText;
    if (!effectiveText) {
      if (agentComposerFiles.length > 0) setRunToast({ message: "请补充一句需求描述，或上传可解析的脚本表文件", type: "info" });
      return;
    }
    const attachmentNote = imageAttachments.length ? `\n\n[已附参考图片: ${imageAttachments.map((item) => item.name).join("，")}]` : "";
    setAgentInput("");
    setActiveComposerActionId("");
    setShowCanvasExamples(false);
    setAgentComposerFiles((prev) => { prev.forEach((item) => { if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl); }); return []; });
    if (agentUploadInputRef.current) agentUploadInputRef.current.value = "";
    void sendAgentMissionFromText(`${effectiveText}${attachmentNote}`, { uploadedDocuments: documentAttachments });
  };

  // ── Composer callbacks ──────────────────────────────────────────────────────

  const polishAgentPromptInput = async () => {
    const sourcePrompt = String(agentInput || "").trim();
    if (!sourcePrompt) { setAgentPromptPolishError("请先输入提示词"); return; }
    if (!apiFetch) { setAgentPromptPolishError("缺少 API 连接"); return; }
    setAgentPromptPolishLoading(true);
    setAgentPromptPolishError("");
    try {
      const result = await polishCanvasPrompt({ prompt: sourcePrompt, mode: "text2img" }, apiFetch);
      const variants = normalizePromptPolishVariants(result);
      if (!variants.length) throw new Error("润色结果为空");
      openPromptPolishPicker({
        title: "提示词润色",
        sourcePrompt,
        variants,
        onUse: (text) => {
          setAgentInput(text);
          setAgentInputFocused(true);
          agentInputRef.current?.focus();
        },
      });
    } catch (error) {
      setAgentPromptPolishError(error instanceof Error ? error.message : String(error));
    } finally {
      setAgentPromptPolishLoading(false);
    }
  };

  const handleAgentComposerUpload = useCallback(async (event) => {
    const files = Array.from(event.target?.files || []);
    if (!files.length) return;
    const preparedItems = [];
    for (const file of files) {
      const duplicate = agentComposerFiles.some((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified);
      if (duplicate) continue;
      if (String(file.type || "").startsWith("image/")) {
        preparedItems.push({ id: `agent_file_${makeAgentId()}`, kind: "image", name: file.name, size: file.size, lastModified: file.lastModified, previewUrl: URL.createObjectURL(file) });
        continue;
      }
      if (!isAgentComposerDocumentFile(file)) {
        setRunToast({ message: `暂不支持上传 ${file.name}，请使用 csv/tsv/txt/md/docx 或图片`, type: "error" });
        continue;
      }
      if (Number(file.size || 0) > AGENT_DOCUMENT_MAX_BYTES) {
        setRunToast({ message: `${file.name} 超过 5MB，先精简脚本表再上传`, type: "error" });
        continue;
      }
      try {
        const textContent = await readAgentDocumentText(file);
        if (!textContent) { setRunToast({ message: `${file.name} 内容为空`, type: "error" }); continue; }
        preparedItems.push({ id: `agent_file_${makeAgentId()}`, kind: "document", documentKind: looksLikeStoryboardScriptTableFile(file.name, textContent) ? "storyboard_script_table" : "document", name: file.name, size: file.size, lastModified: file.lastModified, mimeType: getAgentDocumentMimeType(file), textContent });
      } catch (error) {
        setRunToast({ message: error?.message || `${file.name} 读取失败`, type: "error" });
      }
    }
    if (preparedItems.length) {
      setAgentComposerFiles((prev) => [...prev, ...preparedItems].slice(0, 4));
      setAgentInputFocused(true);
      agentInputRef.current?.focus();
    }
    event.target.value = "";
  }, [agentComposerFiles, setRunToast, setAgentComposerFiles, setAgentInputFocused, agentInputRef]);

  const removeAgentComposerFile = useCallback((fileId) => {
    setAgentComposerFiles((prev) => {
      const target = prev.find((item) => item.id === fileId);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((item) => item.id !== fileId);
    });
  }, [setAgentComposerFiles]);

  const handleAgentQuickAction = useCallback((actionId) => {
    if (actionId === "shot_workflow") {
      setActiveComposerActionId((prev) => (prev === "shot_workflow" ? "" : "shot_workflow"));
      setShowCanvasExamples(false);
      setAgentInput((prev) => (String(prev || "").trim() ? prev : AGENT_SHOT_WORKFLOW_QUICK_PROMPT));
      setAgentInputFocused(true);
      agentInputRef.current?.focus();
      return;
    }
    if (actionId === "canvas") {
      const shouldClose = activeComposerActionId === "canvas" || showCanvasExamples;
      setActiveComposerActionId((prev) => (prev === "canvas" ? "" : "canvas"));
      setShowCanvasExamples(!shouldClose);
      setAgentInputFocused(true);
      agentInputRef.current?.focus();
      return;
    }
    if (actionId === "cancel_pending") {
      clearPendingTaskForActiveSession();
      appendAssistantTurn("", "已取消待处理任务。", { userTextOverride: "", routeDebug: buildRouteDebug({ intent: "UNKNOWN", reason: "pending_task_cancelled_by_quick_action", product: "" }, false) });
    }
  }, [activeComposerActionId, appendAssistantTurn, clearPendingTaskForActiveSession, showCanvasExamples, setActiveComposerActionId, setShowCanvasExamples, setAgentInput, setAgentInputFocused, agentInputRef]);

  const insertCanvasPromptExample = useCallback((text) => {
    const nextText = String(text || "").trim();
    if (!nextText) return;
    setAgentInput(nextText);
    setAgentInputFocused(true);
    agentInputRef.current?.focus();
  }, [setAgentInput, setAgentInputFocused, agentInputRef]);

  const handleCanvasExamplePick = useCallback((text) => {
    const nextText = String(text || "").trim();
    if (!nextText) return;
    setActiveComposerActionId("canvas");
    setShowCanvasExamples(false);
    setAgentInput(nextText);
    setAgentInputFocused(true);
    agentInputRef.current?.focus();
  }, [setActiveComposerActionId, setShowCanvasExamples, setAgentInput, setAgentInputFocused, agentInputRef]);

  // ── Suggestion handlers ─────────────────────────────────────────────────────

  const handleSuggestionConfirm = useCallback((turnId, suggestion) => { void confirmMemorySuggestion(turnId, suggestion); }, [confirmMemorySuggestion]);
  const handleSuggestionIgnore = useCallback((turnId, suggestion) => { ignoreMemorySuggestion(turnId, suggestion); }, [ignoreMemorySuggestion]);
  const handleSuggestionEdit = useCallback((suggestion) => { openPreferencesPanelWithSuggestion(suggestion); }, [openPreferencesPanelWithSuggestion]);

  // ── Regression feedback ─────────────────────────────────────────────────────

  const openRegressionFeedbackDialog = useCallback((payload = {}) => {
    if (!HITL_FEEDBACK_UI_ENABLED) return;
    const baseReason = String(payload?.defaultReason || HITL_FEEDBACK_REASON_OPTIONS[0]).trim();
    const isMatched = HITL_FEEDBACK_REASON_OPTIONS.includes(baseReason);
    setFeedbackReasonChoice(isMatched ? baseReason : HITL_FEEDBACK_REASON_OPTIONS[HITL_FEEDBACK_REASON_OPTIONS.length - 1]);
    setFeedbackReasonNote(isMatched ? "" : baseReason);
    setFeedbackDialog({ turnId: payload?.turnId || "", suggestionId: payload?.suggestionId || "", intent: payload?.intent || "SCRIPT", product: payload?.product || "", fallbackReason: baseReason });
  }, [setFeedbackDialog, setFeedbackReasonChoice, setFeedbackReasonNote]);

  const closeRegressionFeedbackDialog = useCallback(() => {
    setFeedbackDialog(null);
    setFeedbackReasonChoice(HITL_FEEDBACK_REASON_OPTIONS[0]);
    setFeedbackReasonNote("");
  }, [setFeedbackDialog, setFeedbackReasonChoice, setFeedbackReasonNote]);

  const markTurnAsRegressionCase = useCallback(async (turnId, options = {}) => {
    if (!HITL_FEEDBACK_UI_ENABLED) return;
    const turn = (activeAgentSession?.turns || []).find((item) => item.id === turnId);
    const sessionId = activeAgentSession?.id || "";
    if (!turn || !sessionId) { setRunToast({ message: "缺少会话信息，无法标记回归用例", type: "error" }); return; }
    const suggestionId = String(options?.suggestionId || "").trim();
    const reason = String(options?.reason || "").trim() || "人工标记回归";
    const targetId = suggestionId ? `suggest_${suggestionId}` : `turn_${turnId}`;
    const intent = String(options?.intent || turn?.routeDebug?.intent || turn?.intent || "SCRIPT");
    const product = String(options?.product || turn?.routeDebug?.product || turn?.extractedProduct || turn?.response?.audience_context?.product || "");
    setSavingFeedbackTargetId(targetId);
    try {
      const out = await harvestEvalCase(apiFetch, { session_id: sessionId, reason, include_trajectory: true }, { intent, product, sessionId });
      updateActiveAgentSession((session) => ({
        ...session,
        turns: (session.turns || []).map((item) => {
          if (item.id !== turnId) return item;
          const nextTurn = { ...item, qualityFeedback: { status: "harvested", reason, caseId: out?.case_id || "", outputPath: out?.output_path || "", updatedAt: Date.now() } };
          if (!suggestionId) return nextTurn;
          return { ...nextTurn, memorySuggestions: (item.memorySuggestions || []).map((s) => s.id === suggestionId ? { ...s, status: "regression_marked", updatedAt: Date.now() } : s) };
        }),
      }));
      setRunToast({ message: "已标记为回归用例", type: "info" });
    } catch (error) {
      updateActiveAgentSession((session) => ({ ...session, turns: (session.turns || []).map((item) => item.id === turnId ? { ...item, qualityFeedback: { status: "failed", reason, error: error?.message || "回归标记失败", updatedAt: Date.now() } } : item) }));
      setRunToast({ message: error?.message || "标记回归失败", type: "error" });
    } finally {
      setSavingFeedbackTargetId("");
    }
  }, [activeAgentSession?.id, activeAgentSession?.turns, apiFetch, updateActiveAgentSession, setSavingFeedbackTargetId, setRunToast]);

  const confirmRegressionFeedbackDialog = useCallback(() => {
    if (!feedbackDialog?.turnId) return;
    const note = String(feedbackReasonNote || "").trim();
    const choice = String(feedbackReasonChoice || "").trim() || feedbackDialog.fallbackReason || "人工标记回归";
    void markTurnAsRegressionCase(feedbackDialog.turnId, { suggestionId: feedbackDialog.suggestionId || "", reason: note ? `${choice}:${note}` : choice, intent: feedbackDialog.intent || "SCRIPT", product: feedbackDialog.product || "" });
    closeRegressionFeedbackDialog();
  }, [closeRegressionFeedbackDialog, feedbackDialog, feedbackReasonChoice, feedbackReasonNote, markTurnAsRegressionCase]);

  const handleSuggestionMarkRegression = useCallback((turnId, suggestion) => {
    if (!suggestion?.id) return;
    openRegressionFeedbackDialog({ turnId, suggestionId: suggestion.id, defaultReason: suggestion?.key ? `偏好建议回归:${suggestion.key}` : "偏好建议误判", intent: "SCRIPT" });
  }, [openRegressionFeedbackDialog]);

  const handleTurnMarkRegression = useCallback((turn) => {
    if (!turn?.id) return;
    const response = turn?.response || {};
    const reason = (turn?.status === "error" || response?.generation_warning || response?.inference_warning)
      ? (turn?.intent === "DRAMA" ? "短剧创作失败" : "生成脚本失败")
      : (turn?.intent === "DRAMA" ? "短剧结果需要复核" : "脚本结果需要复核");
    openRegressionFeedbackDialog({ turnId: turn.id, defaultReason: reason, intent: turn?.routeDebug?.intent || turn?.intent || "SCRIPT", product: turn?.routeDebug?.product || turn?.extractedProduct || "" });
  }, [openRegressionFeedbackDialog]);

  // ── Simple canvas callbacks ─────────────────────────────────────────────────

  const retryAgentTurn = (turnId) => {
    const turn = (activeAgentSession?.turns || []).find((item) => item.id === turnId);
    if (!turn) return;
    updateActiveAgentSession((session) => ({ ...session, turns: (session.turns || []).map((item) => item.id === turnId ? { ...item, status: "running", error: "", stepIndex: 0 } : item) }));
    void sendAgentMissionFromText(turn.userText || "", { uploadedDocuments: Array.isArray(turn.uploadedDocuments) ? turn.uploadedDocuments : [] });
  };

  const deleteNode = (id) => {
    storePushHistory();
    storeSetNodes((p) => p.filter((n) => n.id !== id));
    storeSetConnections((p) => p.filter((c) => c.from !== id && c.to !== id));
    storeSetSelectedNodeIds((p) => { const s = new Set(p); s.delete(id); return s; });
  };

  const runStoryboardInputFromFiles = useCallback(
    async (nodeId, files) => {
      const sourceNode = getNodes().find((node) => node.id === nodeId);
      const fileList = Array.from(files || []).filter(Boolean);
      if (!sourceNode || !fileList.length) return;

      const documents = [];
      const rejectedNames = [];
      updateNodeData(nodeId, { status: "running", error: "", summary: "", progressLabel: "正在读取剧本文件", scriptFileName: fileList.map((file) => file.name).filter(Boolean).join("，") });

      try {
        for (const file of fileList) {
          if (!isAgentComposerDocumentFile(file)) { rejectedNames.push(file.name || "未知文件"); continue; }
          if (Number(file.size || 0) > AGENT_DOCUMENT_MAX_BYTES) throw new Error(`${file.name} 超过 5MB，先精简剧本文件再上传`);
          const textContent = await readAgentDocumentText(file);
          if (!textContent) { rejectedNames.push(file.name || "空文件"); continue; }
          documents.push({ name: file.name || "storyboard-script.txt", mime_type: getAgentDocumentMimeType(file), kind: "storyboard_script_table", text_content: textContent });
        }
        if (!documents.length) throw new Error(rejectedNames.length ? `未读取到可用剧本文件：${rejectedNames.join("，")}` : "未读取到可用剧本文件");

        updateNodeData(nodeId, { progressLabel: "正在提交故事板设计任务" });
        const currentNodes = getNodes();
        const storyboardCount = currentNodes.filter((node) => node?.type === NODE_TYPES.STORYBOARD_PLAN).length;
        const response = await sendAgentMessage(
          { message: `请将拖入的剧本文件生成可编辑故事板：${documents.map((item) => item.name).join("，")}`, currentNodes: cloneDeep(currentNodes), currentConnections: cloneDeep(getConnections()), canvasId, threadId: canvasId, uploadedDocuments: documents, canvasNodeHints: { storyboard_count: storyboardCount } },
          apiFetch,
          { intent: "STORYBOARD", product: "", sessionId: activeAgentSession?.id || "" },
        );
        if (!(response?.intent === "tool_call" && response?.async_task?.task_id)) throw new Error(String(response?.message || response?.error || "Agent 未返回故事板任务"));

        updateNodeData(nodeId, { progressLabel: "AI 正在拆解场景和镜头" });
        const taskResult = await pollStoryboardTask(String(response.async_task.task_id), apiFetch, (status) => {
          if (status === "running") updateNodeData(nodeId, { progressLabel: "故事板设计中，正在组织镜头节奏" });
        });

        const rawPatch = Array.isArray(taskResult?.patch) ? taskResult.patch : [];
        if (!rawPatch.length) throw new Error("故事板任务完成但没有返回画布节点");

        const storyboardOp = rawPatch.find((op) => op?.op === "add_node" && op?.node?.type === NODE_TYPES.STORYBOARD_PLAN);
        const targetX = Number(sourceNode.x || 0) + 440;
        const targetY = Number(sourceNode.y || 0);
        const dx = storyboardOp?.node ? targetX - Number(storyboardOp.node.x || 0) : 0;
        const dy = storyboardOp?.node ? targetY - Number(storyboardOp.node.y || 0) : 0;
        const storyboardNodeIds = [];
        const positionedPatch = rawPatch.map((op) => {
          if (op?.op !== "add_node" || !op?.node) return op;
          const nextNode = { ...op.node, x: Number(op.node.x || 0) + dx, y: Number(op.node.y || 0) + dy };
          if (nextNode.type === NODE_TYPES.STORYBOARD_PLAN) {
            storyboardNodeIds.push(String(nextNode.id || "").trim());
            nextNode.data = { ...(nextNode.data || {}), source_storyboard_input_node_id: nodeId };
          }
          return { ...op, node: nextNode };
        });

        const firstStoryboardNodeId = storyboardNodeIds.find(Boolean) || "";
        const workflowPatch = enhanceStoryboardPatchWithProductionWorkflow(positionedPatch, { sourceNodeId: nodeId, createSourceNode: false });

        storePushHistory();
        const patchResult = _applyPatch(workflowPatch);
        if (patchResult?.nodes && patchResult?.connections) {
          upsertCanvasDraftSnapshot({ nodes: patchResult.nodes, connections: patchResult.connections, viewport: patchResult.viewport || getViewport() });
        }

        updateNodeData(nodeId, { status: "success", error: "", progressLabel: "", summary: String(taskResult?.summary || "已生成可编辑故事板").trim(), generatedStoryboardNodeIds: storyboardNodeIds });
        setRunToast({ message: String(taskResult?.summary || "故事板已生成").trim(), type: "info" });
        window.setTimeout(() => setRunToast(null), 2200);
        if (firstStoryboardNodeId) window.setTimeout(() => {
          // Inline focus: scroll canvas to the storyboard node via store
          const { nodes, viewport, setViewport } = useCanvasStore.getState();
          const targetNode = nodes.find((n) => n.id === firstStoryboardNodeId);
          if (targetNode) {
            const w = targetNode.type === NODE_TYPES.STORYBOARD_PLAN ? 1280 : 280;
            const h = targetNode.type === NODE_TYPES.STORYBOARD_PLAN ? 620 : 200;
            const zoom = viewport.zoom || 1;
            setViewport({
              x: window.innerWidth / 2 - (Number(targetNode.x || 0) + w / 2) * zoom,
              y: window.innerHeight / 2 - (Number(targetNode.y || 0) + h / 2) * zoom,
              zoom,
            });
          }
        }, 80);
      } catch (error) {
        updateNodeData(nodeId, { status: "error", error: error?.message || String(error || "故事板生成失败"), progressLabel: "" });
        setRunToast({ message: error?.message || "故事板生成失败", type: "error" });
      }
    },
    [_applyPatch, activeAgentSession?.id, apiFetch, canvasId, storePushHistory, setRunToast, updateNodeData, upsertCanvasDraftSnapshot],
  );

  // ─── Return all mission callbacks ──────────────────────────────────────────

  return {
    // memos
    devSuggestionLog,
    hitlFeedbackRows,
    devRegressionLog,
    // core
    runAgentConversation,
    runCanvasPlanMission,
    sendAgentMissionFromText,
    sendAgentMission,
    // canvas actions
    confirmScriptExtraction,
    buildAssetCanvas,
    skipToShotWorkflow,
    buildDirectVideoCanvas,
    // composer
    polishAgentPromptInput,
    handleAgentComposerUpload,
    removeAgentComposerFile,
    handleAgentQuickAction,
    insertCanvasPromptExample,
    handleCanvasExamplePick,
    // preference
    openPreferencesPanelWithSuggestion,
    handlePreferenceSavedFromPanel,
    confirmMemorySuggestion,
    ignoreMemorySuggestion,
    // suggestion handlers
    handleSuggestionConfirm,
    handleSuggestionIgnore,
    handleSuggestionEdit,
    handleSuggestionMarkRegression,
    // regression feedback
    openRegressionFeedbackDialog,
    closeRegressionFeedbackDialog,
    markTurnAsRegressionCase,
    confirmRegressionFeedbackDialog,
    handleTurnMarkRegression,
    // canvas ops
    retryAgentTurn,
    deleteNode,
    runStoryboardInputFromFiles,
  };
}
