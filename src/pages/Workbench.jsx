import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  Upload,
  Image as ImageIcon,
  Wand2,
  Download,
  X,
  Play,
  Plus,
  Zap,
  Layers,
  Loader2,
  Images,
  ImagePlus,
  Minus,
  Maximize,
  Trash2,
  Undo,
  Redo,
  Copy,
  Clipboard,
  Hand,
  ShoppingBag,
  AlertCircle,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Info,
  History,
  TrendingUp,
  RefreshCw,
  LayoutGrid,
  Square,
  CheckCircle2,
  Sun,
  Sparkles,
  Sliders,
  Palette,
  Clapperboard,
  Film,
  WifiOff,
  ArrowRight,
  Cpu,
  MoreHorizontal,
  RotateCcw,
  Link as LinkIcon,
  Server,
  Activity,
  Layout,
  Send,
  Scan,
  Scissors,
  GripVertical,
  Volume2,
  VolumeX,
  FolderOpen,
  Save,
} from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { useNavigate } from "../router";
import PreferenceSuggestionCard from "../components/agent-canvas/PreferenceSuggestionCard";
import DramaMarkdownBlock from "../components/workbench/DramaMarkdownBlock";
import ShotAnnotatedScriptBlock from "../components/workbench/ShotAnnotatedScriptBlock";
import ScriptExtractionCard from "../components/workbench/ScriptExtractionCard";
import AssetGenConfirmCard from "../components/workbench/AssetGenConfirmCard";
import VideoPlayer from "../components/workbench/VideoPlayer";
import ToolIconBtn from "../components/workbench/ToolIconBtn";
import PromptPolishPickerModal from "../components/workbench/PromptPolishPickerModal";
import SidebarBtn from "../components/workbench/SidebarBtn";
import InlineDropdown from "../components/workbench/InlineDropdown";
import AgentResultCardContent from "../components/workbench/AgentResultCardContent";
import PersonaMentionTextarea from "../components/workbench/PersonaMentionTextarea";
import PropertyPanel from "../components/workbench/PropertyPanel";
import NodeComponent from "../components/workbench/NodeComponent";
import {
  buildCanvasNodePrompt,
  extractCanvasSupplementalPrompt,
} from "../components/agent-canvas/promptUtils";
import {
  readAiChatAnchorDebugState,
  writeAiChatAnchorDebugState,
} from "../lib/aiChatAnchorDebug";
import {
  polishCanvasPrompt,
  runVideoSplitTask,
  runVideoLineartTask,
  runVideoRmbgTask,
  sendAgentMessage,
  pollStoryboardTask,
} from "../api/agentCanvas";
import {
  setPreference as setMemoryPreference,
} from "../api/memoryPreferences";
import { harvestEvalCase } from "../api/qualityFeedback";
import {
  aiChatAnchor,
  aiChatStream,
  AI_CHAT_ANCHOR_OPERATE_ENUM_1,
  AI_CHAT_PART_ENUM_6,
  AI_CHAT_PART_ENUM_203,
  AI_CHAT_PART_ENUM_204,
  AI_CHAT_PART_ENUM_207,
  AI_CHAT_PART_ENUM_209,
  AI_CHAT_PART_ENUM_210,
  AI_CHAT_PART_ENUM_211,
  isLoginRequiredError,
  resolveMemberAuthorizationInfo,
  submitAIChatImageTask,
  viewAIChatModelParams,
  viewAIChatModels,
} from "../api/aiChat";
import { useMemberInfo, formatMemberPoints } from "../hooks/useMemberInfo";
import { useSidebar } from "../hooks/useSidebar";
import { detectPreferenceSuggestions } from "../agent/preferenceSuggestion";
import { buildHitlFeedbackRows } from "../agent/hitlFeedbackHistory";
import { AI_CHAT_IMAGE_MODEL_ID_NANO_BANANA2, API_BASE } from "../config";
import { findAIChatModelIdByKeywords } from "../lib/aiChatModelResolver";
import { isVideoContent } from "../lib/mediaType.js";
import { buildRoleProfileStructuredOutput } from "../lib/roleProfileStructurer.js";
import {
  EMPTY_LIST,
  STORYBOARD_RUN_STEPS,
  SHOT_WORKFLOW_RUN_STEPS,
  AGENT_RESULT_CARD_WIDTH,
  isPreviewableArtifact,
  matchesSceneBinding,
  stripStoryboardDisplayIds,
  getAgentTurnStepLabel,
  NODE_TYPES,
  HIDDEN_IMAGE_CONFIG_MODES,
  VOLC_VIDEO_HD_TEMPLATE_ENUM_1,
  VOLC_VIDEO_HD_TEMPLATE_ENUM_2,
  DEFAULT_VIDEO_HD_MODEL_ID,
  isSeedanceOmniReferenceModel,
  sortParamValues,
  findAIChatParamItem,
  getAIChatParamDisplayValue,
  listAIChatParamChoiceOptions,
  normalizePromptPolishVariants,
  TOOL_CARDS,
  FEATURE_EXTRACT_PRESET_PROMPTS,
  getProcessorModeDefaults,
  VIDEO_HD_TEMPLATE_OPTIONS,
  PROMPT_TEMPLATES,
  ASPECT_RATIOS,
  VIDEO_GEN_INPUT_HANDLE_MAIN,
  VIDEO_GEN_INPUT_HANDLE_LAST_FRAME,
  normalizeConnectionTargetHandle,
  MEDIA_UPLOAD_NODE_EMPTY_HEIGHT,
  MAX_RENDERED_MEDIA_ITEMS_PER_NODE,
  DEFAULT_VIDEO_LINEART_STRENGTH,
  DEFAULT_VIDEO_LINEART_COLOR,
  DEFAULT_VIDEO_SPLIT_OUTPUT_RESOLUTION,
  isImageFileLike,
  isVideoFileLike,
  isMediaFileLike,
  normalizeInputMediaKind,
  getReferenceNodeTitle,
  readFilesAsDataUrls,
  normalizeVideoSplitSegments,
  checkNodeReady,
} from "../constants/workbench.jsx";
import { useAssetLibrary, cloneAssetLibrarySnapshot, buildSnapshotDigest, normalizeAssetLibraryStore, buildAssetLibraryAssetsFromSnapshot, mergeAssetLibraryAssets, normalizeAssetLibraryPersona } from "../hooks/useAssetLibrary";
import { useCanvas, cloneCanvasNodeLight } from "../hooks/useCanvas";
import { useCanvasStore } from "../stores/canvasStore.js";
import {
  normalizeVideoLineartConfig,
  buildStoryboardStylePrefix,
  buildStoryboardAssetGenerationPrompt,
  normalizeStoryboardAssetCandidates,
  resolveStoryboardAssetPrimaryImage,
  buildStoryboardAssetEditPrompt,
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
  isAbortLikeError,
  MULTI_ANGLE_VARIANTS,
  MODES_WITHOUT_APP_AUTH,
  formatAIChatErrorMessage,
  isFirstLastFrameReferenceSelection,
  extractModelParamList,
  cloneDeep,
  buildRouteDebug,
  parseCanvasClarification,
  getDecisionLabel,
} from "../lib/workbenchHelpers.js";
import {
  HITL_FEEDBACK_UI_ENABLED,
  countStoryboardShots,
  buildStoryboardWorkflowStepState,
  enhanceStoryboardPatchWithProductionWorkflow,
} from "../lib/agentHelpers.js";
import {
  DEFAULT_AI_MODELS,
  DEFAULT_VIDEO_MODELS,
  DEPRECATED_VIDEO_MODEL_IDS,
  buildAIChatModelOptions,
  filterDeprecatedImageModels,
  isDeprecatedImageModel,
  getDefaultImageModelId,
  getDefaultVideoModelId,
} from "../lib/modelHelpers.js";
import WorkbenchHeader from "../components/workbench/WorkbenchHeader.jsx";
import WorkbenchCanvas from "../components/workbench/WorkbenchCanvas.jsx";
import WorkbenchRunBar from "../components/workbench/WorkbenchRunBar.jsx";
import WorkbenchAssetLibrary from "../components/workbench/WorkbenchAssetLibrary.jsx";
import WorkbenchImagePreview from "../components/workbench/WorkbenchImagePreview.jsx";
import WorkbenchHistoryPanel from "../components/workbench/WorkbenchHistoryPanel.jsx";
import WorkbenchRegressionDialog from "../components/workbench/WorkbenchRegressionDialog.jsx";
import WorkbenchStoryboardAssetCard from "../components/workbench/WorkbenchStoryboardAssetCard.jsx";
import WorkbenchSidebar from "../components/workbench/WorkbenchSidebar.jsx";
import WorkbenchAgentComposer from "../components/workbench/WorkbenchAgentComposer.jsx";
import { useCanvasNodeOps } from "../hooks/useCanvasNodeOps.js";
import { useCanvasExecutor } from "../hooks/useCanvasExecutor.js";
import { useAgentMission } from "../hooks/useAgentMission.js";
import WorkbenchStoryboardShotCard from "../components/workbench/WorkbenchStoryboardShotCard.jsx";
import { useAgentChat, makeAgentId, HITL_FEEDBACK_REASON_OPTIONS } from "../hooks/useAgentChat";
import { useWorkbenchRun } from "../hooks/useWorkbenchRun";

const PreferencesPanel = React.lazy(() => import("../components/agent-canvas/PreferencesPanel"));


// ==========================================
// Config & Constants
// ==========================================
const generateId = () => Math.random().toString(36).substr(2, 9);
const GRID_SIZE = 20;
const ASSET_LIBRARY_STORE_KEY = "bananaflow_asset_library_v1";
const AGENT_COMPOSER_FILE_ACCEPT = "image/*,.csv,.tsv,.txt,.md,.markdown,.docx,.doc,text/plain,text/csv,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword";
const formatDebugTime = (timestamp) => {
  if (!timestamp) return "--";
  try {
    return new Date(timestamp).toLocaleTimeString("zh-CN", { hour12: false });
  } catch {
    return "--";
  }
};

const formatAssetLibraryTime = (timestamp) => {
  if (!timestamp) return "--";
  try {
    return new Date(timestamp).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "--";
  }
};

const stringifyDebugValue = (value) => {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value || "");
  }
};

const buildApiDebugDetailText = (event) => {
  if (!event || typeof event !== "object") return "";
  const lines = [];
  if (event.url) lines.push(`url: ${event.url}`);
  if (event.path) lines.push(`path: ${event.path}`);
  if (event.source) lines.push(`source: ${event.source}`);
  if (Array.isArray(event.candidates) && event.candidates.length) lines.push(`candidates: ${event.candidates.join(" -> ")}`);
  if (event.authorizationSource) lines.push(`auth: ${event.authorizationSource}`);
  if (event.message) lines.push(`message: ${event.message}`);
  if (event.payload !== undefined) {
    lines.push("payload:");
    lines.push(stringifyDebugValue(event.payload));
  }
  if (event.response !== undefined) {
    lines.push("response:");
    lines.push(stringifyDebugValue(event.response));
  }
  return lines.join("\n").trim();
};

const API_DEBUG_DETAIL_KEYS = new Set(["aiChatLang", "aiChatImage", "userAuths", "aiChatAnchor", "agentPlanner"]);

const API_DEBUG_STATUS_LABEL = {
  idle: "待执行",
  loading: "请求中",
  success: "成功",
  warning: "警告",
  error: "失败",
  timeout: "超时",
  login_required: "需登录",
};




const AI_CHAT_PART_ENUM_1 = 1;
const AI_CHAT_PART_ENUM_2 = 2;
const AI_CHAT_PART_ENUM_3 = 3;
const AI_CHAT_PART_ENUM_4 = 4;
const AI_CHAT_PART_ENUM_5 = 5;

const getNodeAnchorPosition = (node, nodeElement, direction = "output", handle = VIDEO_GEN_INPUT_HANDLE_MAIN) => {
  const width =
    nodeElement?.offsetWidth ||
    (node?.type === NODE_TYPES.STORYBOARD_PLAN ? 1280 : node?.type === NODE_TYPES.TEXT_INPUT ? 320 : 280);
  const height = nodeElement?.offsetHeight || 160;
  const isLastFrameHandle = normalizeConnectionTargetHandle(handle) === VIDEO_GEN_INPUT_HANDLE_LAST_FRAME;
  const lastFrameHandleY = Math.min(height - 24, Math.max(36, height / 2 + 40));

  return {
    x: direction === "output" ? node.x + width : node.x,
    y: node.y + (isLastFrameHandle ? lastFrameHandleY : height / 2),
  };
};



const Workbench = () => {
  const { user, apiFetch } = useAuth();
  const navigate = useNavigate();
  const {
    setHoveredSidebarItemKey,
    hoveredSidebarPreview, setHoveredSidebarPreview,
    sidebarNodeInputMenu, setSidebarNodeInputMenu,
    sidebarWorkflowMenu, setSidebarWorkflowMenu,
    sidebarImageCreateMenu, setSidebarImageCreateMenu,
    activeSidebarItemKey, setActiveSidebarItemKey,
    showSidebarUploadMenu, setShowSidebarUploadMenu,
    sidebarVideoCreateMenu, setSidebarVideoCreateMenu,
    sidebarUploadMenuRef,
    sidebarImageUploadInputRef,
    sidebarVideoUploadInputRef,
    sidebarUploadMenuCloseTimerRef,
    sidebarNodeInputMenuCloseTimerRef,
    sidebarImageCreateMenuCloseTimerRef,
    sidebarVideoCreateMenuCloseTimerRef,
    sidebarWorkflowMenuCloseTimerRef,
  } = useSidebar();

  const clearAgentCardSelectionRef = useRef(null);
  const boxSelectCompleteRef = useRef(null);
  const pasteToastRef = useRef(null);

  const {
    nodes, setNodes,
    connections, setConnections,
    history,        // Phase 2: 来自 store（只读引用，用于 dep array）
    historyStep,    // Phase 2: 来自 store（只读，用于 dep array）
    viewport, setViewport, viewportRef,
    selectedNodeIds, setSelectedNodeIds,
    selectedConnectionIds, setSelectedConnectionIds,
    activeNodeId, setActiveNodeId,
    setIsSpacePressed,
    selectionBox,
    connectingSource, setConnectingSource,
    hoveredConnectionId, setHoveredConnectionId,
    hoveredConnectTarget, setHoveredConnectTarget,
    mousePos,
    canvasDropActive,
    canvasDropUploading,
    canvasId,
    nodeElementMapRef, nodesRef, connectionsRef,
    canvasRef, canvasHoverClientRef,
    connectionDragSelectionRef,
    connectionHoverTargetRef,
    canUndo, canRedo,
    pushHistory, undo, redo,
    deleteSelection,
    deleteConnectionById,
    handleConnectionClick,
    screenToCanvas, zoomCanvas,
    arrangeCanvasNodes,
    handleWheel,
    handleCanvasMouseDown, handleNodeMouseDown,
    handleMouseMove, handleMouseUp,
    getCursor,
    createMediaUploadNodeAt,
    getCanvasViewportCenterPoint,
    handleCanvasDragEnter, handleCanvasDragOver, handleCanvasDragLeave, handleCanvasDrop,
    appendTemplateGraph,
    updateNodeData,
    applyPatch: storeApplyPatch,
  } = useCanvas({
    onClearAgentCardSelectionRef: clearAgentCardSelectionRef,
    onBoxSelectCompleteRef: boxSelectCompleteRef,
    onPasteToastRef: pasteToastRef,
  });

  const {
    assetLibraryStore, setAssetLibraryStore,
    showAssetLibrary, setShowAssetLibrary,
    assetLibraryTab, setAssetLibraryTab,
    assetLibraryLoaded,
    expandedAssetWorkIds, setExpandedAssetWorkIds,
    setAssetLibraryDetailWorkId,
    setAssetLibraryDetailPersonaId,
    editingAssetWorkTitleId,
    editingAssetWorkTitleDraft, setEditingAssetWorkTitleDraft,
    pendingUploadNodeId, setPendingUploadNodeId,
    assetLibraryPickerMode, setAssetLibraryPickerMode,
    assetLibraryPersonaImageInputRef,
    assetLibraryRestoredRef,
    assetLibraryDrafts, assetLibraryWorks,
    assetLibraryAssets, assetLibraryPersonas, personaMentionOptions,
    assetLibraryVersionsByWorkId,
    activeCanvasDraft, upsertCanvasDraftSnapshot,
    assetLibraryDetailWork, assetLibraryDetailPersona,
    assetLibraryDetailSnapshot, assetLibraryDetailDigest, assetLibraryDetailAssets,
    beginEditAssetWorkTitle, cancelEditAssetWorkTitle, commitEditAssetWorkTitle,
    createAssetLibraryPersona, updateAssetLibraryPersona, removeAssetLibraryPersona,
    handleAssetLibraryPersonaReferenceUpload, removeAssetLibraryItem,
  } = useAssetLibrary(canvasId);

  const onRunToastForAgentRef = useRef(null);
  const {
    agentInput, setAgentInput,
    agentInputFocused, setAgentInputFocused,
    agentPromptPolishLoading, setAgentPromptPolishLoading,
    agentPromptPolishError, setAgentPromptPolishError,
    promptPolishDialog,
    activeComposerActionId, setActiveComposerActionId,
    showCanvasExamples, setShowCanvasExamples,
    agentComposerFiles, setAgentComposerFiles,
    agentDevMode, setAgentDevMode,
    agentHistoryCollapsed,
    showPreferencesPanel, setShowPreferencesPanel,
    preferencesPanelPrefill, setPreferencesPanelPrefill,
    preferenceNotice, setPreferenceNotice,
    savingSuggestionId, setSavingSuggestionId,
    savingFeedbackTargetId, setSavingFeedbackTargetId,
    feedbackDialog, setFeedbackDialog,
    feedbackReasonChoice, setFeedbackReasonChoice,
    feedbackReasonNote, setFeedbackReasonNote,
    agentResultCards, setAgentResultCards,
    selectedAgentCardIds, setSelectedAgentCardIds,
    activeAgentCardId, setActiveAgentCardId,
    agentInputRef,
    agentUploadInputRef,
    agentComposerRef,
    agentCardDragRef,
    agentConversationBottomRef,
    agentSessions,
    activeAgentSession,
    agentTurns,
    activePendingTask,
    isCanvasPromptPending,
    isAgentMissionRunning,
    hasActiveAgentConversation,
    hasAgentResultCards,
    minimizedAgentCards,
    rightPanelContainerStyle,
    openPromptPolishPicker,
    closePromptPolishPicker,
    usePromptPolishVariant,
    handleRightPanelResizeStart,
    toggleAgentHistoryPanel,
    updateActiveAgentSession,
    appendAgentTurn,
    updateAgentTurn,
    createAgentSession,
    setActiveAgentSession,
    clearActiveAgentConversation,
    setPendingTaskForActiveSession,
    clearPendingTaskForActiveSession,
    refreshMemoryPreferences,
    updateSuggestionStatus,
    focusAgentResultCard,
    toggleAgentResultCardCollapsed,
    minimizeAgentResultCard,
    handleAgentCardWheelCapture,
    appendAssistantTurn,
  } = useAgentChat({ apiFetch, onRunToastRef: onRunToastForAgentRef });

  const {
    isRunning, setIsRunning,
    runAbortControllerRef, nodeAbortControllersRef,
    cancelledNodeIdsRef, runningNodeIdsRef,
    apiStatus,
    setGlobalError,
    previewImage, setPreviewImage,
    showHistoryPanel, setShowHistoryPanel,
    activeHistoryTab, setActiveHistoryTab,
    apiHistory,
    expandedHistoryIds, setExpandedHistoryIds,
    apiStats,
    runToast, setRunToast,
    normalizeHistoryOutputs,
    normalizeHistoryInputs,
    formatHistoryParams,
    cancelNodeGeneration,
    safeInvoke,
  } = useWorkbenchRun({ apiFetch });

  const [aiChatModels, setAiChatModels] = useState(() => ({
    language: EMPTY_LIST,
    image: EMPTY_LIST,
    video: DEFAULT_VIDEO_MODELS,
  }));

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

  const aiChatSessionIdRef = useRef("");
  const aiChatHistoryRecordIdRef = useRef("");
  const defaultVideoModelId = useMemo(() => getDefaultVideoModelId(videoModelOptions), [videoModelOptions]);
  const updateApiDebugStatus = useCallback((key, next) => {
    if (key === "aiChatAnchor") {
      const current = readAiChatAnchorDebugState();
      writeAiChatAnchorDebugState({
        ...current,
        ...next,
        updatedAt: Date.now(),
      });
    }
    setApiDebugStatus((prev) => {
      const merged = {
        ...(prev[key] || { status: "idle", message: "", detail: "", updatedAt: 0 }),
        ...next,
        updatedAt: Date.now(),
      };
      return {
        ...prev,
        [key]: merged,
      };
    });
  }, []);
  const pushApiDebugDetail = useCallback((key, event) => {
    const nextDetail = buildApiDebugDetailText(event);
    if (!nextDetail) return;
    if (key === "aiChatAnchor") {
      const current = readAiChatAnchorDebugState();
      const detail =
        event?.type === "start" || !current.detail
          ? nextDetail
          : `${current.detail}\n\n[${event.type || "event"}]\n${nextDetail}`;
      writeAiChatAnchorDebugState({
        ...current,
        detail,
        updatedAt: Date.now(),
      });
    }
    setApiDebugStatus((prev) => {
      const current = prev[key] || { status: "idle", message: "", detail: "", updatedAt: 0 };
      const detail =
        event?.type === "start" || !current.detail
          ? nextDetail
          : `${current.detail}\n\n[${event.type || "event"}]\n${nextDetail}`;
      const merged = {
        ...current,
        detail,
        updatedAt: Date.now(),
      };
      return {
        ...prev,
        [key]: merged,
      };
    });
  }, []);
  const resolveModelParamsForId = useCallback(
    async (modelId) => {
      const normalizedModelId = String(modelId || "").trim();
      if (!normalizedModelId) return EMPTY_LIST;
      const cached = aiChatModelParamsCacheRef.current.get(normalizedModelId);
      if (cached) return cached;
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
      updateApiDebugStatus("modelParams", {
        status: "success",
        message: `id=${normalizedModelId}, params=${list.length}`,
      });
      return list;
    },
    [apiFetch, pushApiDebugDetail, updateApiDebugStatus],
  );
  const [activeArtifact, setActiveArtifact] = useState(null);

  const [hoveredStoryboardAssetCard, setHoveredStoryboardAssetCard] = useState(null);
  const [hoveredStoryboardShotCard, setHoveredStoryboardShotCard] = useState(null);
  // ── Phase 5: canvas node operations hook (compact ops + storyboard gen) ────
  const {
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
  } = useCanvasNodeOps({
    apiFetch,
    defaultImageModelId,
    threeViewImageModelId,
    imageModelRecords,
    imageModelOptions,
    resolveModelParamsForId,
    activeArtifact,
    setRunToast,
    pushApiDebugDetail,
    updateApiDebugStatus,
    aiChatSessionIdRef,
    aiChatHistoryRecordIdRef,
    setHoveredStoryboardAssetCard,
    setHoveredStoryboardShotCard,
  });

  // ── Phase 6: canvas execution engine (executeFlow) ─────────────────────────
  const { executeFlow } = useCanvasExecutor({
    apiFetch,
    defaultImageModelId,
    defaultVideoModelId,
    imageModelOptions,
    resolveModelParamsForId,
    agentDevMode,
    aiChatSessionIdRef,
    aiChatHistoryRecordIdRef,
    pushApiDebugDetail,
    updateApiDebugStatus,
    runAbortControllerRef,
    nodeAbortControllersRef,
    cancelledNodeIdsRef,
    runningNodeIdsRef,
    setIsRunning,
    setRunToast,
    setGlobalError,
  });

  // ── Phase 7: agent mission hook ────────────────────────────────────────────
  const {
    devSuggestionLog, hitlFeedbackRows, devRegressionLog,
    runAgentConversation, runCanvasPlanMission,
    sendAgentMissionFromText, sendAgentMission,
    confirmScriptExtraction, buildAssetCanvas,
    skipToShotWorkflow, buildDirectVideoCanvas,
    polishAgentPromptInput, handleAgentComposerUpload,
    removeAgentComposerFile, handleAgentQuickAction,
    insertCanvasPromptExample, handleCanvasExamplePick,
    openPreferencesPanelWithSuggestion, handlePreferenceSavedFromPanel,
    confirmMemorySuggestion, ignoreMemorySuggestion,
    handleSuggestionConfirm, handleSuggestionIgnore,
    handleSuggestionEdit, handleSuggestionMarkRegression,
    openRegressionFeedbackDialog, closeRegressionFeedbackDialog,
    markTurnAsRegressionCase, confirmRegressionFeedbackDialog,
    handleTurnMarkRegression,
    retryAgentTurn, deleteNode, runStoryboardInputFromFiles,
  } = useAgentMission({
    agentTurns, activeAgentSession, updateActiveAgentSession,
    appendAgentTurn, updateAgentTurn, appendAssistantTurn,
    setPendingTaskForActiveSession, clearPendingTaskForActiveSession,
    agentInput, setAgentInput,
    agentInputFocused, setAgentInputFocused,
    agentComposerFiles, setAgentComposerFiles,
    agentInputRef, agentUploadInputRef,
    setActiveComposerActionId, activeComposerActionId,
    showCanvasExamples, setShowCanvasExamples,
    setAgentPromptPolishLoading, setAgentPromptPolishError,
    openPromptPolishPicker,
    feedbackDialog, setFeedbackDialog,
    feedbackReasonChoice, setFeedbackReasonChoice,
    feedbackReasonNote, setFeedbackReasonNote,
    setSavingFeedbackTargetId,
    refreshMemoryPreferences,
    updateSuggestionStatus, setSavingSuggestionId,
    setPreferenceNotice,
    activeArtifact,
    apiFetch,
    aiChatSessionIdRef, aiChatHistoryRecordIdRef, agentDevMode,
    setRunToast,
    upsertCanvasDraftSnapshot,
    setShowPreferencesPanel, setPreferencesPanelPrefill,
    pushApiDebugDetail, updateApiDebugStatus,
    updateNodeData, viewportRef,
  });

  // Callback refs for useCanvas cross-cutting concerns
  clearAgentCardSelectionRef.current = () => {
    setSelectedAgentCardIds(new Set());
    setActiveAgentCardId(null);
  };
  boxSelectCompleteRef.current = (x1, y1, x2, y2, appendSelection) => {
    const selectedCards = appendSelection ? new Set(selectedAgentCardIds) : new Set();
    agentResultCards.forEach((card) => {
      if (card.minimized) return;
      const cardHeight = card.collapsed ? 70 : 420;
      if (card.x < x2 && card.x + (card.w || 460) > x1 && card.y < y2 && card.y + cardHeight > y1) {
        selectedCards.add(card.id);
      }
    });
    setSelectedAgentCardIds(selectedCards);
    if (selectedCards.size === 1) setActiveAgentCardId(Array.from(selectedCards)[0]);
    if (selectedCards.size === 0) setActiveAgentCardId(null);
  };
  pasteToastRef.current = (toast) => {
    setRunToast(toast);
    setTimeout(() => setRunToast(null), 2200);
  };
  onRunToastForAgentRef.current = setRunToast;

  const [apiDebugOpen, setApiDebugOpen] = useState(true);
  const [apiDebugStatus, setApiDebugStatus] = useState(() => ({
    memberInfo: { status: "idle", message: "", detail: "", updatedAt: 0 },
    userAuths: { status: "idle", message: "", detail: "", updatedAt: 0 },
    modelParams: { status: "idle", message: "", detail: "", updatedAt: 0 },
    modelsLang: { status: "idle", message: "", detail: "", updatedAt: 0 },
    modelsImage: { status: "idle", message: "", detail: "", updatedAt: 0 },
    modelsVideo: { status: "idle", message: "", detail: "", updatedAt: 0 },
    modelsVideoEnhance: { status: "idle", message: "", detail: "", updatedAt: 0 },
    aiChatAnchor: { status: "idle", message: "", detail: "", updatedAt: 0 },
    aiChatLang: { status: "idle", message: "", detail: "", updatedAt: 0 },
    aiChatImage: { status: "idle", message: "", detail: "", updatedAt: 0 },
    agentPlanner: { status: "idle", message: "", detail: "", updatedAt: 0 },
  }));
  const aiChatModelParamsCacheRef = useRef(new Map());
  const workspaceShellRef = useRef(null);
  const previewOpenedBySpaceRef = useRef(false);

  const isLeftSidebarCollapsed = true;
  const leftSidebarWidth = isLeftSidebarCollapsed ? 62 : 140;

  useEffect(() => {
    if (!pendingUploadNodeId) return;
    const exists = nodes.some((item) => item.id === pendingUploadNodeId);
    if (!exists) {
      setPendingUploadNodeId("");
    }
  }, [nodes, pendingUploadNodeId]);

  useEffect(() => {
    if (!showSidebarUploadMenu) return undefined;
    const handlePointerDown = (event) => {
      if (sidebarUploadMenuRef.current?.contains(event.target)) return;
      setShowSidebarUploadMenu(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [showSidebarUploadMenu]);

  useEffect(() => () => {
    if (sidebarUploadMenuCloseTimerRef.current) {
      window.clearTimeout(sidebarUploadMenuCloseTimerRef.current);
    }
    if (sidebarNodeInputMenuCloseTimerRef.current) {
      window.clearTimeout(sidebarNodeInputMenuCloseTimerRef.current);
    }
    if (sidebarImageCreateMenuCloseTimerRef.current) {
      window.clearTimeout(sidebarImageCreateMenuCloseTimerRef.current);
    }
    if (sidebarVideoCreateMenuCloseTimerRef.current) {
      window.clearTimeout(sidebarVideoCreateMenuCloseTimerRef.current);
    }
    if (sidebarWorkflowMenuCloseTimerRef.current) {
      window.clearTimeout(sidebarWorkflowMenuCloseTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!sidebarNodeInputMenu) return undefined;
    const handlePointerDown = (event) => {
      if (event.target.closest("[data-sidebar-node-input-menu='true']")) return;
      setSidebarNodeInputMenu(null);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [sidebarNodeInputMenu]);

  useEffect(() => {
    if (!sidebarImageCreateMenu) return undefined;
    const handlePointerDown = (event) => {
      if (event.target.closest("[data-sidebar-image-create-menu='true']")) return;
      setSidebarImageCreateMenu(null);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [sidebarImageCreateMenu]);

  useEffect(() => {
    if (!sidebarVideoCreateMenu) return undefined;
    const handlePointerDown = (event) => {
      if (event.target.closest("[data-sidebar-video-create-menu='true']")) return;
      setSidebarVideoCreateMenu(null);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [sidebarVideoCreateMenu]);


  // For each text_input node: find sibling input nodes connected to the same downstream node
  const connectedInputsByNodeId = useMemo(() => {
    const map = new Map();
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    // Build downstream map: nodeId → Set of downstream nodeIds
    const downstreamOf = new Map();
    connections.forEach((c) => {
      if (!c.from || !c.to) return;
      if (!downstreamOf.has(c.from)) downstreamOf.set(c.from, new Set());
      downstreamOf.get(c.from).add(c.to);
    });
    // Build upstream map: nodeId → Set of upstream nodeIds
    const upstreamOf = new Map();
    connections.forEach((c) => {
      if (!c.from || !c.to) return;
      if (!upstreamOf.has(c.to)) upstreamOf.set(c.to, new Set());
      upstreamOf.get(c.to).add(c.from);
    });
    nodes.forEach((n) => {
      if (n.type !== "text_input") return;
      const downstreamIds = downstreamOf.get(n.id) || new Set();
      const siblingInputNodes = [];
      const seen = new Set();
      downstreamIds.forEach((downId) => {
        const upstreamIds = upstreamOf.get(downId) || new Set();
        upstreamIds.forEach((sibId) => {
          if (sibId === n.id || seen.has(sibId)) return;
          const sib = nodeById.get(sibId);
          if (sib && sib.type === "input") {
            seen.add(sibId);
            siblingInputNodes.push(sib);
          }
        });
      });
      map.set(n.id, siblingInputNodes);
    });
    return map;
  }, [nodes, connections]);


  const {
    memberInfoLoginUrl,
    userAuthsLoading,
    navigateToMemberLogin,
    memberLabel,
    memberAvatar,
    memberPoint,
    memberTotalPoint,
    isAdminUser,
  } = useMemberInfo(apiFetch, user?.email, {
    updateApiDebugStatus,
    pushApiDebugDetail,
    setRunToast,
  });

  const triggerAIChatAnchor = useCallback(
    async ({ partEnum, modelId = 1, from, to, debugLabel }) => {
      const rawModelId = String(modelId ?? "").trim();
      const numericModelId = Number(rawModelId);
      const resolvedModelId = Number.isFinite(numericModelId) && numericModelId > 0 ? numericModelId : 1;
      const payload = {
        part_enum: Number(partEnum),
        operate_enum: AI_CHAT_ANCHOR_OPERATE_ENUM_1,
        ai_chat_model_id: resolvedModelId,
        from: String(from || window.location.pathname || "/app"),
        to: String(to || ""),
      };

      updateApiDebugStatus("aiChatAnchor", {
        status: "loading",
        message: `POST /ai/aiChatAnchor part=${payload.part_enum}`,
      });

      try {
        const data = await aiChatAnchor(apiFetch, payload, {
          onDebug: (event) => pushApiDebugDetail("aiChatAnchor", event),
        });
        updateApiDebugStatus("aiChatAnchor", {
          status: "success",
          message: `${debugLabel || payload.to || payload.part_enum} 已上报`,
        });
        return data;
      } catch (error) {
        updateApiDebugStatus("aiChatAnchor", {
          status: isLoginRequiredError(error) ? "login_required" : "error",
          message: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    },
    [apiFetch, pushApiDebugDetail, updateApiDebugStatus],
  );

  const handleAnchorActionClick = useCallback(
    ({ partEnum, modelId, to, debugLabel, action }) => {
      void triggerAIChatAnchor({
        partEnum,
        modelId,
        to,
        debugLabel,
      });
      action?.();
    },
    [triggerAIChatAnchor],
  );



  useEffect(() => {
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
        AI_CHAT_PART_ENUM_1,
        EMPTY_LIST,
        "modelsLang",
        "语言",
      );
      if (cancelled || controller.signal.aborted) return;
      const image = await requestModelsWithTimeout(
        AI_CHAT_PART_ENUM_2,
        EMPTY_LIST,
        "modelsImage",
        "图片",
      );
      if (cancelled || controller.signal.aborted) return;
      const video = await requestModelsWithTimeout(
        AI_CHAT_PART_ENUM_3,
        DEFAULT_VIDEO_MODELS,
        "modelsVideo",
        "视频",
      );
      if (cancelled || controller.signal.aborted) return;
      await requestModelsWithTimeout(
        AI_CHAT_PART_ENUM_6,
        EMPTY_LIST,
        "modelsVideoEnhance",
        "视频超清",
      );
      if (cancelled || controller.signal.aborted) return;

      setAiChatModels({ language, image, video });
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

    updateApiDebugStatus("modelParams", {
      status: "loading",
      message: `POST /ai/viewAIChatModelParams id=${modelId}`,
    });
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
  }, [defaultVideoModelId, nodes]);

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
  }, [defaultImageModelId, nodes]);

  useEffect(() => {
    if (assetLibraryRestoredRef.current) return;
    const draft = (assetLibraryStore?.drafts || []).find((item) => item.canvasId === canvasId);
    const hasDraftContent =
      (Array.isArray(draft?.snapshot?.nodes) && draft.snapshot.nodes.length > 0) ||
      (Array.isArray(draft?.snapshot?.connections) && draft.snapshot.connections.length > 0);
    if (hasDraftContent) {
      const nextSnapshot = cloneAssetLibrarySnapshot(draft.snapshot);
      setNodes(Array.isArray(nextSnapshot.nodes) ? nextSnapshot.nodes : []);
      setConnections(Array.isArray(nextSnapshot.connections) ? nextSnapshot.connections : []);
      if (nextSnapshot.viewport && typeof nextSnapshot.viewport === "object") {
        setViewport({
          x: Number(nextSnapshot.viewport.x || 0),
          y: Number(nextSnapshot.viewport.y || 0),
          zoom: Number(nextSnapshot.viewport.zoom || 1) || 1,
        });
      }
      setRunToast({ message: "已恢复上次未完成的画布草稿", type: "info" });
      setTimeout(() => setRunToast(null), 2200);
    }
    assetLibraryRestoredRef.current = true;
  }, [assetLibraryStore, canvasId]);
  useEffect(() => {
    if (!assetLibraryRestoredRef.current || !assetLibraryLoaded) return undefined;
    const timer = window.setTimeout(() => {
      const snapshot = cloneAssetLibrarySnapshot({
        nodes,
        connections,
        viewport,
      });
      const digest = buildSnapshotDigest(snapshot);
      const draftRecord = {
        id: `draft_${canvasId}`,
        canvasId,
        title: digest.title,
        summary: digest.summary,
        coverUrl: digest.coverUrl,
        assetCount: digest.assetCount,
        nodeCount: digest.nodeCount,
        connectionCount: digest.connectionCount,
        updatedAt: Date.now(),
        snapshot,
      };
      setAssetLibraryStore((prev) => {
        const current = normalizeAssetLibraryStore(prev);
        const draftsNext = [draftRecord, ...((current.drafts || []).filter((item) => item.canvasId !== canvasId))].slice(0, 12);
        const nonDraftAssets = (current.assets || []).filter(
          (item) => !(item.sourceKind === "draft" && item.canvasId === canvasId),
        );
        const draftAssets = buildAssetLibraryAssetsFromSnapshot(snapshot, {
          sourceKind: "draft",
          canvasId,
          createdAt: Date.now(),
        });
        return {
          ...current,
          drafts: draftsNext,
          assets: mergeAssetLibraryAssets(nonDraftAssets, draftAssets),
        };
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [assetLibraryLoaded, canvasId, connections, nodes, viewport]);
  useEffect(() => () => {
    if (storyboardAssetHoverCloseTimerRef.current) {
      window.clearTimeout(storyboardAssetHoverCloseTimerRef.current);
      storyboardAssetHoverCloseTimerRef.current = null;
    }
  }, []);
  useEffect(() => {
    return () => {
      if (storyboardShotHoverCloseTimerRef.current) {
        window.clearTimeout(storyboardShotHoverCloseTimerRef.current);
        storyboardShotHoverCloseTimerRef.current = null;
      }
    };
  }, []);
  const storyboardAssetHoverCloseTimerRef = useRef(null);
  const storyboardShotHoverCloseTimerRef = useRef(null);
  const selectedStoryboardTarget = useMemo(() => {
    if (String(activeArtifact?.kind || "").trim() !== "storyboard_selection") return null;
    const meta = activeArtifact?.meta && typeof activeArtifact.meta === "object" ? activeArtifact.meta : {};
    const typeLabelMap = {
      entity: "角色/主体",
      scene: "场景",
      shot: "镜头",
    };
    return {
      type: String(meta.selectionType || "").trim(),
      typeLabel: typeLabelMap[String(meta.selectionType || "").trim()] || "故事板片段",
      label: String(meta.selectionLabel || "").trim() || "故事板片段",
      summary: String(meta.selectionSummary || "").trim(),
      fromNodeId: String(activeArtifact?.fromNodeId || "").trim(),
    };
  }, [activeArtifact]);

  const resolveStoryboardAssetForMention = useCallback((storyboardNode, mentionEntry) => {
    if (!storyboardNode || !mentionEntry?.assetType) return null;
    const plan = storyboardNode.data?.storyboard_plan || {};
    const entities = plan?.entities || {};
    const collection = Array.isArray(entities?.[mentionEntry.assetType]) ? entities[mentionEntry.assetType] : [];
    const assetId = String(mentionEntry.assetId || "").trim();
    const assetName = stripStoryboardDisplayIds(mentionEntry.assetName || mentionEntry.term || "");
    return (
      collection.find((item) => String(item?.entity_id || "").trim() === assetId) ||
      collection.find((item) => stripStoryboardDisplayIds(item?.name || "") === assetName) ||
      null
    );
  }, []);

  const scheduleCloseStoryboardAssetHoverCard = useCallback(() => {
    if (storyboardAssetHoverCloseTimerRef.current) {
      window.clearTimeout(storyboardAssetHoverCloseTimerRef.current);
    }
    storyboardAssetHoverCloseTimerRef.current = window.setTimeout(() => {
      setHoveredStoryboardAssetCard((current) => (current?.sticky ? current : null));
      storyboardAssetHoverCloseTimerRef.current = null;
    }, 120);
  }, []);

  const scheduleCloseStoryboardShotHoverCard = useCallback(() => {
    if (storyboardShotHoverCloseTimerRef.current) {
      window.clearTimeout(storyboardShotHoverCloseTimerRef.current);
    }
    storyboardShotHoverCloseTimerRef.current = window.setTimeout(() => {
      setHoveredStoryboardShotCard((current) => (current?.sticky ? current : null));
      storyboardShotHoverCloseTimerRef.current = null;
    }, 300);
  }, []);

  const openStoryboardShotHoverCard = useCallback((storyboardNode, scene, shot, chipElement) => {
    if (!storyboardNode || !shot) return;
    if (storyboardShotHoverCloseTimerRef.current) {
      window.clearTimeout(storyboardShotHoverCloseTimerRef.current);
      storyboardShotHoverCloseTimerRef.current = null;
    }
    const rect = chipElement?.getBoundingClientRect?.() || { left: 0, bottom: 0 };
    const x = Math.min(rect.left, Math.max(window.innerWidth - 380, 24));
    const y = Math.min(rect.bottom + 6, Math.max(window.innerHeight - 480, 24));
    setHoveredStoryboardShotCard({ nodeId: storyboardNode.id, scene, shot, x, y, sticky: false });
  }, []);

  const openStoryboardAssetHoverCard = useCallback(
    (storyboardNode, mentionEntry, event) => {
      if (!storyboardNode || !mentionEntry?.assetType) return;
      const asset = resolveStoryboardAssetForMention(storyboardNode, mentionEntry);
      if (!asset) return;
      if (storyboardAssetHoverCloseTimerRef.current) {
        window.clearTimeout(storyboardAssetHoverCloseTimerRef.current);
        storyboardAssetHoverCloseTimerRef.current = null;
      }
      const x = Math.min((event?.clientX || 0) + 14, Math.max(window.innerWidth - 380, 24));
      const y = Math.min((event?.clientY || 0) + 14, Math.max(window.innerHeight - 420, 24));
      setHoveredStoryboardAssetCard({
        nodeId: storyboardNode.id,
        assetType: mentionEntry.assetType,
        asset,
        x,
        y,
        sticky: false,
        tweakText: "",
        customPrompt: "",
      });
    },
    [resolveStoryboardAssetForMention],
  );

  // _applyPatch — 委托给 canvasStore.applyPatch（Immer 事务，无闭包陈旧问题）
  // 返回值 { nodes, connections, viewport } 与原实现兼容，供 upsertCanvasDraftSnapshot 使用。
  const _applyPatch = useCallback((patchOps) => {
    if (!Array.isArray(patchOps) || patchOps.length === 0) return undefined;
    return storeApplyPatch(patchOps);
  }, [storeApplyPatch]);

  // Initialize — Phase 2: 改用 store.pushHistory() 推入初始快照
  // 执行时机：首次渲染后，canvas restore effect (line ~1982) 可能已恢复 localStorage 数据；
  // 若历史为空则推入当前状态作为第一个快照，确保 Ctrl+Z 不会越过初始状态。
  useEffect(() => {
    if (useCanvasStore.getState()._history.length === 0) {
      pushHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync active node
  useEffect(() => {
    if (selectedNodeIds.size === 1) setActiveNodeId(Array.from(selectedNodeIds)[0]);
    else setActiveNodeId(null);
  }, [selectedNodeIds]);

  useEffect(() => {
    if (!sidebarWorkflowMenu) return undefined;
    const handlePointerDown = (event) => {
      if (workspaceShellRef.current?.contains(event.target)) {
        const target = event.target;
        if (target?.closest?.("[data-sidebar-workflow-menu='true']") || target?.closest?.("[data-sidebar-workflow-trigger='true']")) {
          return;
        }
      }
      setSidebarWorkflowMenu(null);
    };
    document.addEventListener("mousedown", handlePointerDown, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown, true);
    };
  }, [sidebarWorkflowMenu]);

  const restoreSnapshotToCanvas = useCallback(
    (snapshot, successMessage = "已恢复到画布") => {
      if (!snapshot || typeof snapshot !== "object") return;
      pushHistory();
      const nextSnapshot = cloneAssetLibrarySnapshot(snapshot);
      setNodes(Array.isArray(nextSnapshot.nodes) ? nextSnapshot.nodes : []);
      setConnections(Array.isArray(nextSnapshot.connections) ? nextSnapshot.connections : []);
      if (nextSnapshot.viewport && typeof nextSnapshot.viewport === "object") {
        setViewport({
          x: Number(nextSnapshot.viewport.x || 0),
          y: Number(nextSnapshot.viewport.y || 0),
          zoom: Number(nextSnapshot.viewport.zoom || 1) || 1,
        });
      }
      setSelectedNodeIds(new Set());
      setSelectedConnectionIds(new Set());
      setActiveNodeId(null);
      setShowAssetLibrary(false);
      setAssetLibraryDetailWorkId("");
      setAssetLibraryDetailPersonaId("");
      setRunToast({ message: successMessage, type: "info" });
      setTimeout(() => setRunToast(null), 2200);
    },
    [pushHistory],
  );

  const focusCanvasNode = useCallback((nodeId) => {
    const focusNode = (targetNode) => {
      if (!targetNode) return;

      const width =
        targetNode.type === NODE_TYPES.STORYBOARD_PLAN
          ? 1280
          : targetNode.type === NODE_TYPES.TEXT_INPUT
          ? 320
          : targetNode.type === NODE_TYPES.STORYBOARD_INPUT
          ? 380
          : targetNode.type === NODE_TYPES.ROLE_INPUT
          ? 76
          : 280;
      const height =
        targetNode.type === NODE_TYPES.STORYBOARD_PLAN
          ? 620
          : targetNode.type === NODE_TYPES.STORYBOARD_INPUT
          ? 260
          : targetNode.type === NODE_TYPES.ROLE_INPUT
          ? 76
          : 200;

      setSelectedNodeIds(new Set([targetNode.id]));
      setSelectedConnectionIds(new Set());
      setActiveNodeId(targetNode.id);

      const canvasEl = canvasRef.current;
      if (!canvasEl) return;
      const zoom = viewportRef.current?.zoom || 1;
      const centerX = Number(targetNode.x || 0) + width / 2;
      const centerY = Number(targetNode.y || 0) + height / 2;
      setViewport((prev) => ({
        ...prev,
        x: canvasEl.clientWidth / 2 - centerX * zoom,
        y: canvasEl.clientHeight / 2 - centerY * zoom,
      }));
    };

    const normalizedNodeId = String(nodeId || "").trim();
    const currentNodes = nodesRef.current || [];
    const directTarget = normalizedNodeId
      ? currentNodes.find((node) => node.id === normalizedNodeId)
      : null;
    if (directTarget) {
      focusNode(directTarget);
      return;
    }

    const latestStoryboardNode = [...currentNodes].reverse().find((node) => node.type === NODE_TYPES.STORYBOARD_PLAN);
    if (latestStoryboardNode) {
      focusNode(latestStoryboardNode);
      return;
    }

    const draftNodes = Array.isArray(activeCanvasDraft?.snapshot?.nodes) ? activeCanvasDraft.snapshot.nodes : [];
    const draftTarget = normalizedNodeId
      ? draftNodes.find((node) => node.id === normalizedNodeId)
      : [...draftNodes].reverse().find((node) => node.type === NODE_TYPES.STORYBOARD_PLAN);
    if (!draftTarget || !activeCanvasDraft?.snapshot) return;

    restoreSnapshotToCanvas(activeCanvasDraft.snapshot, "已恢复故事板到画布");
    window.setTimeout(() => {
      const restoredNodes = nodesRef.current || [];
      const restoredTarget = normalizedNodeId
        ? restoredNodes.find((node) => node.id === normalizedNodeId)
        : [...restoredNodes].reverse().find((node) => node.type === NODE_TYPES.STORYBOARD_PLAN);
      if (restoredTarget) focusNode(restoredTarget);
    }, 80);
  }, [activeCanvasDraft, restoreSnapshotToCanvas]);



  const saveCanvasToAssetLibrary = useCallback((forceNewWork = false) => {
    if (nodes.length === 0 && connections.length === 0) {
      setRunToast({ message: "当前画布为空，先添加素材或工作流再保存", type: "error" });
      setTimeout(() => setRunToast(null), 2200);
      return;
    }
    const snapshot = cloneAssetLibrarySnapshot({
      nodes,
      connections,
      viewport,
    });
    const digest = buildSnapshotDigest(snapshot);
    const now = Date.now();
    setAssetLibraryStore((prev) => {
      const current = normalizeAssetLibraryStore(prev);
      const existingWork = forceNewWork ? null : (current.works || []).find((item) => item.canvasId === canvasId) || null;
      const workId = existingWork?.id || `work_${generateId()}`;
      const existingVersions = (current.workVersions || []).filter((item) => item.workId === workId);
      const versionRecord = {
        id: `work_version_${generateId()}`,
        workId,
        canvasId,
        title: digest.title,
        summary: digest.summary,
        coverUrl: digest.coverUrl,
        assetCount: digest.assetCount,
        nodeCount: digest.nodeCount,
        connectionCount: digest.connectionCount,
        versionIndex: existingVersions.length + 1,
        snapshot,
        createdAt: now,
      };
      const workRecord = {
        ...(existingWork || {}),
        id: workId,
        kind: "work",
        canvasId,
        title: digest.title,
        summary: digest.summary,
        coverUrl: digest.coverUrl,
        assetCount: digest.assetCount,
        nodeCount: digest.nodeCount,
        connectionCount: digest.connectionCount,
        latestVersionId: versionRecord.id,
        versionCount: existingVersions.length + 1,
        createdAt: existingWork?.createdAt || now,
        updatedAt: now,
        snapshot,
      };
      const nextWorks = existingWork
        ? [workRecord, ...(current.works || []).filter((item) => item.id !== workId)]
        : [workRecord, ...(current.works || [])];
      const nextAssets = mergeAssetLibraryAssets(
        current.assets,
        buildAssetLibraryAssetsFromSnapshot(snapshot, {
          sourceKind: "work_version",
          workId,
          versionId: versionRecord.id,
          canvasId,
          createdAt: now,
        }),
      );
      return {
        ...current,
        works: nextWorks.slice(0, 30),
        workVersions: [versionRecord, ...(current.workVersions || [])].slice(0, 200),
        assets: nextAssets,
        drafts: (current.drafts || []).map((item) =>
          item.canvasId === canvasId
            ? {
                ...item,
                title: workRecord.title,
                summary: workRecord.summary,
                coverUrl: workRecord.coverUrl,
                assetCount: workRecord.assetCount,
                nodeCount: workRecord.nodeCount,
                connectionCount: workRecord.connectionCount,
                snapshot,
                updatedAt: now,
              }
            : item,
        ),
      };
    });
    setShowAssetLibrary(true);
    setAssetLibraryTab("works");
    setAssetLibraryDetailWorkId("");
    setAssetLibraryDetailPersonaId("");
    setRunToast({ message: forceNewWork ? "已另存为新作品" : "已保存到作品库，并追加一个新版本", type: "info" });
    setTimeout(() => setRunToast(null), 2200);
  }, [canvasId, connections, nodes, viewport]);

  const saveCurrentCanvasAsWork = useCallback(() => {
    saveCanvasToAssetLibrary(false);
  }, [saveCanvasToAssetLibrary]);

  const saveCurrentCanvasAsNewWork = useCallback(() => {
    saveCanvasToAssetLibrary(true);
  }, [saveCanvasToAssetLibrary]);

  useEffect(() => {
    const kd = (e) => {
      const lowerKey = e.key.toLowerCase();
      if (lowerKey === "e" && e.ctrlKey && e.shiftKey) {
        e.preventDefault();
        toggleAgentHistoryPanel();
        return;
      }
      if (["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
      switch (lowerKey) {
        case " ":
          if (
            !e.repeat &&
            isPreviewableArtifact(activeArtifact) &&
            activeArtifact?.kind === "image" &&
            !previewImage
          ) {
            e.preventDefault();
            previewOpenedBySpaceRef.current = true;
            setPreviewImage(activeArtifact.url);
            return;
          }
          if (!e.repeat) setIsSpacePressed(true);
          break;
        case "z":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            e.shiftKey ? redo() : undo();
          }
          break;
        case "y":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            redo();
          }
          break;
        case "a":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            setSelectedNodeIds(new Set(nodes.map((n) => n.id)));
          }
          break;
        case "delete":
        case "backspace":
          deleteSelection();
          break;
        case "=":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            zoomCanvas(0.2);
          }
          break;
        case "-":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            zoomCanvas(-0.2);
          }
          break;
        case "0":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            setViewport({ x: 0, y: 0, zoom: 1 });
          }
          break;
      }
    };
    const ku = (e) => {
      if (e.key === " ") {
        if (previewOpenedBySpaceRef.current) {
          previewOpenedBySpaceRef.current = false;
          setPreviewImage((current) => (current === activeArtifact?.url ? null : current));
          return;
        }
        setIsSpacePressed(false);
      }
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // Phase 2: undo/redo 现在是 store actions（读 get()，无需捕获 history/historyStep）
  }, [nodes, selectedNodeIds, selectedConnectionIds, toggleAgentHistoryPanel, activeArtifact, previewImage]);

  const createPersonaInputNodeAt = useCallback((persona, point = null) => {
    const normalizedPersona = normalizeAssetLibraryPersona(persona);
    if (!normalizedPersona.id) return;
    const targetPoint = point || getCanvasViewportCenterPoint();
    const nodeId = generateId();
    const referenceImage = String(normalizedPersona.referenceImage || "").trim();
    const structuredProfile = buildRoleProfileStructuredOutput({
      roleName: normalizedPersona.name,
      characterSetting: normalizedPersona.description,
      relationshipNetwork: normalizedPersona.relationshipNetwork,
      worldviewBackground: "",
    });
    const structuredText = JSON.stringify(structuredProfile, null, 2);

    pushHistory();
    setNodes((prev) => [
      ...prev,
      {
        id: nodeId,
        type: NODE_TYPES.ROLE_INPUT,
        x: targetPoint.x - 38,
        y: targetPoint.y - 38,
        data: {
          personaId: normalizedPersona.id,
          name: normalizedPersona.name || "未命名人物",
          description: normalizedPersona.description,
          referenceImage,
          voiceDescription: normalizedPersona.voiceDescription,
          relationshipNetwork: normalizedPersona.relationshipNetwork,
          images: referenceImage ? [referenceImage] : [],
          structuredProfile,
          text: structuredText,
        },
      },
    ]);
    setSelectedNodeIds(new Set([nodeId]));
    setSelectedConnectionIds(new Set());
    setActiveNodeId(nodeId);
    setShowAssetLibrary(false);
    setAssetLibraryDetailWorkId("");
    setAssetLibraryDetailPersonaId("");
    setAssetLibraryPickerMode(false);
    setRunToast({ message: "已添加角色到画布，并完成结构化", type: "info" });
    setTimeout(() => setRunToast(null), 2200);
  }, [getCanvasViewportCenterPoint, pushHistory]);

  const handleSidebarMediaUpload = useCallback(
    async (event, mediaKind = "mixed") => {
      const normalizedMediaKind = normalizeInputMediaKind(mediaKind);
      const files = Array.from(event.target.files || []).filter((file) => {
        if (normalizedMediaKind === "image") return isImageFileLike(file);
        if (normalizedMediaKind === "video") return isVideoFileLike(file);
        return isMediaFileLike(file);
      });
      if (!files.length) {
        event.target.value = "";
        return;
      }
      try {
        const mediaItems = await readFilesAsDataUrls(files);
        createMediaUploadNodeAt(getCanvasViewportCenterPoint(), mediaItems, normalizedMediaKind);
        const imageCount = files.filter((file) => isImageFileLike(file)).length;
        const videoCount = files.length - imageCount;
        setRunToast({
          message: `已添加到画布：${files.length} 个文件${imageCount ? ` · ${imageCount} 张图片` : ""}${videoCount ? ` · ${videoCount} 个视频` : ""}`,
          type: "info",
        });
        setTimeout(() => setRunToast(null), 2200);
      } finally {
        event.target.value = "";
      }
    },
    [createMediaUploadNodeAt, getCanvasViewportCenterPoint],
  );

  const restoreAssetToCanvas = useCallback(
    (asset) => {
      const url = String(asset?.url || "").trim();
      if (!url) return;
      createMediaUploadNodeAt(getCanvasViewportCenterPoint(), [url], isVideoContent(url) ? "video" : "image");
      setShowAssetLibrary(false);
      setAssetLibraryDetailWorkId("");
      setAssetLibraryDetailPersonaId("");
      setAssetLibraryPickerMode(false);
      setRunToast({ message: "已将素材放回画布", type: "info" });
      setTimeout(() => setRunToast(null), 2200);
      setAssetLibraryStore((prev) => {
        const current = normalizeAssetLibraryStore(prev);
        return {
          ...current,
          assets: (current.assets || []).map((item) =>
            item.id === asset.id
              ? {
                  ...item,
                  lastUsedAt: Date.now(),
                  usageCount: (Number(item.usageCount || 0) || 0) + 1,
                }
              : item,
          ),
        };
      });
    },
    [createMediaUploadNodeAt, getCanvasViewportCenterPoint],
  );

  const addNode = (t, modePreset = null) => {
    if (t === NODE_TYPES.POST_PROCESSOR) return;
    pushHistory();
    const id = generateId();

    const r = canvasRef.current?.getBoundingClientRect();
    const cx = r ? r.width / 2 : window.innerWidth / 2;
    const cy = r ? r.height / 2 : window.innerHeight / 2;
    const c = screenToCanvas(cx, cy);
    const processorModePreset = modePreset === "image_creation" ? "text2img" : (modePreset || "multi_image_generate");
    const processorDefaults = getProcessorModeDefaults(processorModePreset);

    const d = {
      [NODE_TYPES.INPUT]: { images: [], mediaKind: "image", title: getReferenceNodeTitle("image") },
      [NODE_TYPES.TEXT_INPUT]: { text: "" },
      [NODE_TYPES.STORYBOARD_INPUT]: {
        title: "故事板输入",
        status: "idle",
        error: "",
        scriptFileName: "",
        summary: "",
        generatedStoryboardNodeIds: [],
        progressLabel: "",
      },
      [NODE_TYPES.ROLE_INPUT]: { personaId: "", name: "", referenceImage: "", images: [], text: "" },
      [NODE_TYPES.ROLE_STRUCTURER]: {
        title: "角色结构化",
        roleName: "",
        characterSetting: "",
        relationshipNetwork: "",
        worldviewBackground: "",
        structuredProfile: null,
        text: "",
        status: "idle",
        error: "",
      },
      [NODE_TYPES.PROCESSOR]: {
        ...processorDefaults,
        title: modePreset === "image_creation" ? "图像创作" : "",
        batchSize: 1,
        uploadedImages: [],
        status: "idle",
        refImage: null,
        model: processorDefaults.model || defaultImageModelId,
      },
      [NODE_TYPES.POST_PROCESSOR]: {
        mode: "relight",
        prompt: "",
        templates: { style: "", vibe: "", direction: "", note: "" },
        batchSize: 1,
        status: "idle",
        refImage: null,
        model: defaultImageModelId,
      },
      [NODE_TYPES.VIDEO_GEN]: {
        title: modePreset === "first_last_reference" ? "视频创作" : modePreset === "omni_reference" ? "全能生视频" : "",
        mode: modePreset === "text2video" ? "text2video" : modePreset === "local_img2video" ? "local_img2video" : "img2video",
        prompt: "",
        templates:
          modePreset === "local_img2video"
            ? { duration: 5, resolution: "480p", ratio: "1:1", note: "" }
            : {
                motion: "",
                camera: modePreset === "first_last_reference" ? "固定镜头(Fixed)" : "",
                duration: 5,
                resolution: "1080p",
                ratio: "",
                note: "",
                imageType: modePreset === "omni_reference" ? "4" : modePreset === "first_last_reference" ? "2" : "",
                generate_audio_new: true,
              },
        batchSize: 1,
        status: "idle",
        refImage: null,
        lastFrameImage: "",
        firstLastFrameOnly: modePreset === "first_last_reference",
        omniReferenceOnly: modePreset === "omni_reference",
        model: modePreset === "local_img2video"
          ? "comfyui-qwen-i2v"
          : modePreset === "omni_reference"
          ? (
              videoModelOptions.find((item) => isSeedanceOmniReferenceModel(item?.id, item?.name, item?.label, item?.remark))?.id ||
              defaultVideoModelId
            )
          : defaultVideoModelId,
      },
      [NODE_TYPES.OUTPUT]: { images: [] },
    };

    const newNode = { id, type: t, x: c.x - 140, y: c.y - 100, data: d[t] };

    let newConnection = null;
    if (selectedNodeIds.size === 1) {
      const sourceId = Array.from(selectedNodeIds)[0];
      const sourceNode = nodes.find((n) => n.id === sourceId);
      const canInput = t !== NODE_TYPES.INPUT && t !== NODE_TYPES.TEXT_INPUT && t !== NODE_TYPES.STORYBOARD_INPUT && t !== NODE_TYPES.ROLE_INPUT;
      if (sourceNode && canInput) {
        newConnection = { id: generateId(), from: sourceId, to: id };
        newNode.x = sourceNode.x + 350;
        newNode.y = sourceNode.y;
      }
    }

    setNodes((p) => [...p, newNode]);
    if (newConnection) setConnections((p) => [...p, newConnection]);
    setSelectedNodeIds(new Set([id]));
    return id;
  };

  const createText2ImgTemplate = () => {
    const n1 = { id: generateId(), type: NODE_TYPES.TEXT_INPUT, x: 100, y: 200, data: { text: "赛博朋克风格的未来城市街道，霓虹灯光" } };
    const n2 = { id: generateId(), type: NODE_TYPES.PROCESSOR, x: 500, y: 200, data: { mode: "text2img", prompt: "", templates: { size: "1k", aspect_ratio: "1:1" }, batchSize: 1, status: "idle", model: defaultImageModelId } };
    const n3 = { id: generateId(), type: NODE_TYPES.OUTPUT, x: 900, y: 200, data: { images: [] } };
    appendTemplateGraph([n1, n2, n3], [
      { id: generateId(), from: n1.id, to: n2.id },
      { id: generateId(), from: n2.id, to: n3.id },
    ], { alignToViewportCenter: true });
  };

  const createImg2ImgTemplate = () => {
    const n0 = { id: generateId(), type: NODE_TYPES.TEXT_INPUT, x: 100, y: 100, data: { text: "保持原图构图，转为水彩风格" } };
    const n1 = { id: generateId(), type: NODE_TYPES.INPUT, x: 100, y: 350, data: { images: [], mediaKind: "image", title: getReferenceNodeTitle("image") } };
    const n2 = { id: generateId(), type: NODE_TYPES.PROCESSOR, x: 500, y: 200, data: { mode: "multi_image_generate", prompt: "", templates: { size: "1k", note: "" }, batchSize: 1, uploadedImages: [], status: "idle", model: defaultImageModelId } };
    const n3 = { id: generateId(), type: NODE_TYPES.OUTPUT, x: 900, y: 200, data: { images: [] } };
    appendTemplateGraph([n0, n1, n2, n3], [
      { id: generateId(), from: n0.id, to: n2.id },
      { id: generateId(), from: n1.id, to: n2.id },
      { id: generateId(), from: n2.id, to: n3.id },
    ], { alignToViewportCenter: true });
  };

  const createMultiImg2ImgTemplate = () => {
    const n0 = { id: generateId(), type: NODE_TYPES.TEXT_INPUT, x: 100, y: 710, data: { text: "融合三张参考图的主体特征与风格，生成统一新画面" } };
    const n1 = { id: generateId(), type: NODE_TYPES.INPUT, x: 100, y: 20, data: { images: [], mediaKind: "image", title: `${getReferenceNodeTitle("image")} 1` } };
    const n2 = { id: generateId(), type: NODE_TYPES.INPUT, x: 100, y: 250, data: { images: [], mediaKind: "image", title: `${getReferenceNodeTitle("image")} 2` } };
    const n3 = { id: generateId(), type: NODE_TYPES.INPUT, x: 100, y: 480, data: { images: [], mediaKind: "image", title: `${getReferenceNodeTitle("image")} 3` } };
    const n4 = { id: generateId(), type: NODE_TYPES.PROCESSOR, x: 500, y: 360, data: { mode: "multi_image_generate", prompt: "", templates: { size: "1k", note: "" }, batchSize: 1, uploadedImages: [], status: "idle", model: defaultImageModelId } };
    const n5 = { id: generateId(), type: NODE_TYPES.OUTPUT, x: 900, y: 360, data: { images: [] } };
    appendTemplateGraph([n0, n1, n2, n3, n4, n5], [
      { id: generateId(), from: n0.id, to: n4.id },
      { id: generateId(), from: n1.id, to: n4.id },
      { id: generateId(), from: n2.id, to: n4.id },
      { id: generateId(), from: n3.id, to: n4.id },
      { id: generateId(), from: n4.id, to: n5.id },
    ], { alignToViewportCenter: true });
  };



  const createImg2VideoTemplate = () => {
    const n0 = { id: generateId(), type: NODE_TYPES.TEXT_INPUT, x: 100, y: 80, data: { text: "让参考图中的主体自然运动，镜头平稳推进，动作连贯" } };
    const n1 = { id: generateId(), type: NODE_TYPES.INPUT, x: 100, y: 320, data: { images: [], mediaKind: "image", title: getReferenceNodeTitle("image") } };
    const n2 = { id: generateId(), type: NODE_TYPES.VIDEO_GEN, x: 500, y: 200, data: { mode: "img2video",model: defaultVideoModelId, prompt: "", templates: { motion: "标准(Standard)", camera: "推近(Zoom In)", duration: 5, resolution: "1080p", ratio: "", note: "" ,generate_audio_new: true,}, batchSize: 1, status: "idle", refImage: null } };
    const n3 = { id: generateId(), type: NODE_TYPES.OUTPUT, x: 900, y: 200, data: { images: [] } };
    appendTemplateGraph([n0, n1, n2, n3], [
      { id: generateId(), from: n0.id, to: n2.id },
      { id: generateId(), from: n1.id, to: n2.id },
      { id: generateId(), from: n2.id, to: n3.id },
    ], { alignToViewportCenter: true });
  };

  const createText2VideoTemplate = () => {
    const n0 = { id: generateId(), type: NODE_TYPES.TEXT_INPUT, x: 100, y: 120, data: { text: "未来城市街头，镜头缓慢推进，霓虹灯闪烁，人物自然行走" } };
    const n1 = { id: generateId(), type: NODE_TYPES.VIDEO_GEN, x: 500, y: 120, data: { mode: "text2video", model: defaultVideoModelId, prompt: "", templates: { motion: "标准(Standard)", camera: "推近(Zoom In)", duration: 5, resolution: "1080p", ratio: "", note: "", generate_audio_new: true }, batchSize: 1, status: "idle", refImage: null } };
    const n2 = { id: generateId(), type: NODE_TYPES.OUTPUT, x: 900, y: 120, data: { images: [] } };
    appendTemplateGraph([n0, n1, n2], [
      { id: generateId(), from: n0.id, to: n1.id },
      { id: generateId(), from: n1.id, to: n2.id },
    ], { alignToViewportCenter: true });
  };

  const createOmniReferenceVideoTemplate = () => {
    const n0 = { id: generateId(), type: NODE_TYPES.TEXT_INPUT, x: 100, y: 200, data: { text: "综合参考图中的主体、风格和镜头语言，生成自然视频" } };
    const n1 = { id: generateId(), type: NODE_TYPES.INPUT, x: 100, y: 20, data: { images: [], mediaKind: "image", title: getReferenceNodeTitle("image") } };
    const n2 = { id: generateId(), type: NODE_TYPES.INPUT, x: 100, y: 380, data: { images: [], mediaKind: "video", title: getReferenceNodeTitle("video") } };
    const omniModelId =
      videoModelOptions.find((item) => isSeedanceOmniReferenceModel(item?.id, item?.name, item?.label, item?.remark))?.id ||
      defaultVideoModelId;
    const n3 = { id: generateId(), type: NODE_TYPES.VIDEO_GEN, x: 500, y: 200, data: { title: "全能生视频", mode: "img2video", model: omniModelId, prompt: "", templates: { motion: "标准(Standard)", camera: "推近(Zoom In)", duration: 5, resolution: "1080p", ratio: "", note: "", imageType: "4", generate_audio_new: true }, batchSize: 1, status: "idle", refImage: null, omniReferenceOnly: true } };
    const n4 = { id: generateId(), type: NODE_TYPES.OUTPUT, x: 900, y: 200, data: { images: [] } };
    appendTemplateGraph([n0, n1, n2, n3, n4], [
      { id: generateId(), from: n0.id, to: n3.id },
      { id: generateId(), from: n1.id, to: n3.id },
      { id: generateId(), from: n2.id, to: n3.id },
      { id: generateId(), from: n3.id, to: n4.id },
    ], { alignToViewportCenter: true });
  };

  const createConnectedVideoNode = (sourceNodeId) => {
    pushHistory();
    const sourceNode = nodes.find((n) => n.id === sourceNodeId);
    if (!sourceNode) return;
    const newNodeId = generateId();
    const newNode = {
      id: newNodeId,
      type: NODE_TYPES.VIDEO_GEN,
      x: sourceNode.x + 350,
      y: sourceNode.y,
      data: {
        mode: "img2video",
        model: defaultVideoModelId,
        prompt: sourceNode.data.prompt || "",
        templates: { motion: "标准(Standard)", camera: "固定镜头(Fixed)", duration: 5,  resolution: "1080p", ratio: "", note: "",generate_audio_new: true, },
        batchSize: 1,
        status: "idle",
        refImage: null,
      },
    };
    setNodes((prev) => [...prev, newNode]);
    setConnections((prev) => [...prev, { id: generateId(), from: sourceNodeId, to: newNodeId }]);
    setSelectedNodeIds(new Set([newNodeId]));
  };

  const createPromptQuickChain = useCallback((sourceNodeId, kind) => {
    const sourceNode = nodesRef.current.find((n) => n.id === sourceNodeId && n.type === NODE_TYPES.TEXT_INPUT);
    if (!sourceNode) return;

    pushHistory();

    const isVideo = kind === "video";
    const creativeNodeId = generateId();
    const outputNodeId = generateId();
    const outgoingCount = (connectionsRef.current || []).filter((conn) => conn.from === sourceNodeId).length;
    const creativeX = sourceNode.x + 390;
    const creativeY = sourceNode.y + (isVideo ? 220 : 0) + Math.min(outgoingCount, 4) * 18;
    const outputX = creativeX + 360;
    const outputY = creativeY;
    const imageDefaults = getProcessorModeDefaults("text2img");

    const creativeNode = isVideo
      ? {
          id: creativeNodeId,
          type: NODE_TYPES.VIDEO_GEN,
          x: creativeX,
          y: creativeY,
          data: {
            title: "视频创作",
            mode: "text2video",
            model: defaultVideoModelId,
            prompt: "",
            templates: {
              motion: "标准(Standard)",
              camera: "推近(Zoom In)",
              duration: 5,
              resolution: "1080p",
              ratio: "",
              note: "",
              generate_audio_new: true,
            },
            batchSize: 1,
            status: "idle",
            refImage: null,
          },
        }
      : {
          id: creativeNodeId,
          type: NODE_TYPES.PROCESSOR,
          x: creativeX,
          y: creativeY,
          data: {
            ...imageDefaults,
            title: "图像创作",
            batchSize: 1,
            uploadedImages: [],
            status: "idle",
            refImage: null,
            model: imageDefaults.model || defaultImageModelId,
          },
        };

    const outputNode = {
      id: outputNodeId,
      type: NODE_TYPES.OUTPUT,
      x: outputX,
      y: outputY,
      data: { images: [] },
    };

    setNodes((prev) => [...prev, creativeNode, outputNode]);
    setConnections((prev) => [
      ...prev,
      { id: generateId(), from: sourceNodeId, to: creativeNodeId },
      { id: generateId(), from: creativeNodeId, to: outputNodeId },
    ]);
    setSelectedNodeIds(new Set([creativeNodeId]));
    setSelectedConnectionIds(new Set());
  }, [defaultImageModelId, defaultVideoModelId, pushHistory]);











  const handleAgentCardMouseDown = (e, cardId) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.shiftKey || e.ctrlKey) {
      setSelectedAgentCardIds((prev) => {
        const next = new Set(prev);
        if (next.has(cardId)) next.delete(cardId);
        else next.add(cardId);
        return next;
      });
      return;
    }
    const card = agentResultCards.find((item) => item.id === cardId);
    if (!card) return;
    let dragCardIds = selectedAgentCardIds;
    if (!selectedAgentCardIds.has(cardId)) {
      dragCardIds = new Set([cardId]);
      setSelectedAgentCardIds(new Set([cardId]));
    }
    setSelectedNodeIds(new Set());
    setSelectedConnectionIds(new Set());
    setActiveAgentCardId(cardId);
    const startPositions = {};
    agentResultCards.forEach((item) => {
      if (dragCardIds.has(item.id)) {
        startPositions[item.id] = { x: item.x, y: item.y };
      }
    });
    agentCardDragRef.current = {
      cardIds: Array.from(dragCardIds),
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startPositions,
    };

    const onMouseMove = (event) => {
      const dragState = agentCardDragRef.current;
      if (!dragState) return;
      const zoom = viewportRef.current?.zoom || 1;
      const dx = (event.clientX - dragState.startMouseX) / zoom;
      const dy = (event.clientY - dragState.startMouseY) / zoom;
      setAgentResultCards((prev) =>
        prev.map((item) =>
          dragState.cardIds.includes(item.id)
            ? {
                ...item,
                x: (dragState.startPositions[item.id]?.x || item.x) + dx,
                y: (dragState.startPositions[item.id]?.y || item.y) + dy,
              }
            : item,
        ),
      );
    };

    const onMouseUp = () => {
      agentCardDragRef.current = null;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const startConnection = (e, nid) => {
    e.preventDefault();
    e.stopPropagation();
    connectionHoverTargetRef.current = null;
    setHoveredConnectTarget(null);
    const r = e.currentTarget.getBoundingClientRect();
    setConnectingSource({ nodeId: nid, x: r.left + r.width / 2, y: r.top + r.height / 2 });
  };

  const completeConnection = useCallback((tid, toHandle = VIDEO_GEN_INPUT_HANDLE_MAIN) => {
    const normalizedToHandle = normalizeConnectionTargetHandle(toHandle);
    if (
      connectingSource &&
      connectingSource.nodeId !== tid &&
      !connectionsRef.current.find(
        (c) =>
          c.from === connectingSource.nodeId &&
          c.to === tid &&
          normalizeConnectionTargetHandle(c.toHandle) === normalizedToHandle,
      )
    ) {
      setConnections((prev) => [
        ...prev,
        { id: generateId(), from: connectingSource.nodeId, to: tid, toHandle: normalizedToHandle },
      ]);
    }
    connectionHoverTargetRef.current = null;
    setHoveredConnectTarget(null);
    setConnectingSource(null);
  }, [connectingSource]);

  const handleConnectionTargetHover = useCallback((tid, toHandle = VIDEO_GEN_INPUT_HANDLE_MAIN) => {
    if (!connectingSource) return;
    const nextTarget = {
      nodeId: tid,
      toHandle: normalizeConnectionTargetHandle(toHandle),
    };
    connectionHoverTargetRef.current = nextTarget;
    setHoveredConnectTarget(nextTarget);
  }, [connectingSource]);

  const handleConnectionTargetLeave = useCallback((tid, toHandle = VIDEO_GEN_INPUT_HANDLE_MAIN) => {
    const normalizedToHandle = normalizeConnectionTargetHandle(toHandle);
    if (
      connectionHoverTargetRef.current?.nodeId === tid &&
      normalizeConnectionTargetHandle(connectionHoverTargetRef.current?.toHandle) === normalizedToHandle
    ) {
      connectionHoverTargetRef.current = null;
      setHoveredConnectTarget(null);
    }
  }, []);

  useEffect(() => {
    if (!connectingSource) {
      const bodyStyle = document.body?.style;
      if (bodyStyle) {
        bodyStyle.userSelect = connectionDragSelectionRef.current.userSelect;
        bodyStyle.webkitUserSelect = connectionDragSelectionRef.current.webkitUserSelect;
      }
      return undefined;
    }

    const bodyStyle = document.body?.style;
    if (bodyStyle) {
      connectionDragSelectionRef.current = {
        userSelect: bodyStyle.userSelect,
        webkitUserSelect: bodyStyle.webkitUserSelect,
      };
      bodyStyle.userSelect = "none";
      bodyStyle.webkitUserSelect = "none";
    }

    const cleanupConnectionDrag = () => {
      const hoverTarget = connectionHoverTargetRef.current;
      if (hoverTarget?.nodeId) {
        completeConnection(hoverTarget.nodeId, hoverTarget.toHandle);
        return;
      }
      connectionHoverTargetRef.current = null;
      setHoveredConnectTarget(null);
      setConnectingSource(null);
    };

    window.addEventListener("mouseup", cleanupConnectionDrag);
    window.addEventListener("pointerup", cleanupConnectionDrag);
    window.addEventListener("blur", cleanupConnectionDrag);

    return () => {
      window.removeEventListener("mouseup", cleanupConnectionDrag);
      window.removeEventListener("pointerup", cleanupConnectionDrag);
      window.removeEventListener("blur", cleanupConnectionDrag);
      if (bodyStyle) {
        bodyStyle.userSelect = connectionDragSelectionRef.current.userSelect;
        bodyStyle.webkitUserSelect = connectionDragSelectionRef.current.webkitUserSelect;
      }
    };
  }, [completeConnection, connectingSource]);

  const applyHistoryConfig = (item) => {
    const targetCategory = TOOL_CARDS[item.mode]?.category;
    const targetType = targetCategory === "enhance" ? NODE_TYPES.POST_PROCESSOR : targetCategory === "video" ? NODE_TYPES.VIDEO_GEN : NODE_TYPES.PROCESSOR;
    const targetNodeId = Array.from(selectedNodeIds).find((id) => nodes.find((n) => n.id === id)?.type === targetType);
    if (!targetNodeId) {
      alert(`请先在画布上选中一个匹配的节点，再点击复用。`);
      return;
    }
    const targetNode = nodes.find((n) => n.id === targetNodeId);
    const nextTemplates = {
      ...(targetNode?.data?.templates || {}),
      ...(item.templates || {}),
      note: item.prompt || "",
    };
    pushHistory();
    updateNodeData(targetNodeId, {
      mode: item.mode,
      prompt: item.prompt,
      templates: nextTemplates,
      model: item.model || targetNode?.data?.model,
    });
    setShowHistoryPanel(false);
  };

  const renderHistoryMedia = (media, title) => {
    if (!media || media.length === 0) {
      return <div className="w-full h-28 rounded-lg border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center text-[11px] text-slate-500">暂无{title}</div>;
    }
    return (
      <div className="grid grid-cols-2 gap-2">
        {media.map((item, idx) => {
          const isVideo = isVideoContent(item.url);
          return (
            <button
              key={`${title}-${idx}`}
              type="button"
              onClick={() => setPreviewImage(item.url)}
              className="relative block w-full h-28 rounded-lg border border-slate-200 overflow-hidden bg-slate-100"
              title="点击放大预览"
            >
              {isVideo ? (
                <VideoPlayer src={item.url} className="w-full h-full object-cover" controls />
              ) : (
                <img src={item.url} alt={item.label || title} className="w-full h-full object-cover" />
              )}
              {item.label && (
                <span className="absolute left-1 top-1 text-[10px] px-1.5 py-0.5 rounded border border-slate-200 bg-white/90 text-slate-700">
                  {item.label}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  };



  // ── handleNodeElementChange — restored (same Phase 5 deletion) ──────────────
  const handleNodeElementChange = useCallback((nodeId, element) => {
    if (!nodeId) return;
    if (element) {
      nodeElementMapRef.current.set(nodeId, element);
    } else {
      nodeElementMapRef.current.delete(nodeId);
    }
  }, []);

  // ── renderConnections / renderTempConnection — restored Phase 9 bug-fix ──────
  // These were accidentally deleted in Phase 5 Step 3 when runCompactThreeView
  // block deletion range was too wide (swallowed L5962-L6138 in post-Phase5 numbering).
  const renderConnections = () =>
    connections.map((conn) => {
      const fromNode = nodes.find((n) => n.id === conn.from);
      const toNode = nodes.find((n) => n.id === conn.to);
      if (!fromNode || !toNode) return null;
      const fromAnchor = getNodeAnchorPosition(fromNode, nodeElementMapRef.current.get(fromNode.id), "output");
      const toAnchor = getNodeAnchorPosition(toNode, nodeElementMapRef.current.get(toNode.id), "input", conn.toHandle);
      const x1 = fromAnchor.x, y1 = fromAnchor.y, x2 = toAnchor.x, y2 = toAnchor.y;
      const cp1x = x1 + (x2 - x1) / 2;
      const cp2x = x2 - (x2 - x1) / 2;
      const path = `M ${x1} ${y1} C ${cp1x} ${y1}, ${cp2x} ${y2}, ${x2} ${y2}`;
      const isSelected = selectedConnectionIds.has(conn.id);
      const isHovered = hoveredConnectionId === conn.id;
      const isInteractive = isSelected || isHovered;
      const t = 0.5, invT = 1 - t;
      const midX = invT*invT*invT*x1 + 3*invT*invT*t*cp1x + 3*invT*t*t*cp2x + t*t*t*x2;
      const midY = invT*invT*invT*y1 + 3*invT*invT*t*y1 + 3*invT*t*t*y2 + t*t*t*y2;
      return (
        <g key={conn.id} onMouseEnter={() => setHoveredConnectionId(conn.id)} onMouseLeave={() => setHoveredConnectionId((prev) => (prev === conn.id ? "" : prev))}>
          <path d={path} stroke="transparent" strokeWidth="16" fill="none" className="cursor-pointer pointer-events-auto" pointerEvents="stroke" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => handleConnectionClick(e, conn.id)} onDoubleClick={(e) => { e.stopPropagation(); deleteConnectionById(conn.id); }} />
          <path d={path} stroke={isInteractive ? "#22d3ee" : "rgba(100,116,139,0.72)"} strokeWidth={isInteractive ? "3" : "2.2"} fill="none" className="pointer-events-none transition-colors duration-200" />
          {isInteractive ? (
            <g className="cursor-pointer pointer-events-auto" pointerEvents="all" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); deleteConnectionById(conn.id); }}>
              <title>删除连接</title>
              <circle cx={midX} cy={midY} r="18" fill="rgba(255,255,255,0.001)" pointerEvents="all" />
              <circle cx={midX} cy={midY} r="11" fill="white" stroke="#fb7185" strokeWidth="1.5" pointerEvents="all" />
              <path d={`M ${midX-3.5} ${midY-3.5} L ${midX+3.5} ${midY+3.5} M ${midX+3.5} ${midY-3.5} L ${midX-3.5} ${midY+3.5}`} stroke="#e11d48" strokeWidth="1.5" strokeLinecap="round" pointerEvents="none" />
            </g>
          ) : null}
          {isRunning && (<circle r="3.5" fill="#67e8f9"><animateMotion dur="1.5s" repeatCount="indefinite" path={path} /></circle>)}
        </g>
      );
    });

  const renderTempConnection = () => {
    if (!connectingSource) return null;
    const n = nodes.find((nn) => nn.id === connectingSource.nodeId);
    if (!n) return null;
    const sourceAnchor = getNodeAnchorPosition(n, nodeElementMapRef.current.get(n.id), "output");
    const x1 = sourceAnchor.x, y1 = sourceAnchor.y;
    const hoverTargetNode = hoveredConnectTarget?.nodeId ? nodes.find((nn) => nn.id === hoveredConnectTarget.nodeId) : null;
    const hoverTargetAnchor = hoverTargetNode ? getNodeAnchorPosition(hoverTargetNode, nodeElementMapRef.current.get(hoverTargetNode.id), "input", hoveredConnectTarget?.toHandle) : null;
    const target = hoverTargetAnchor || screenToCanvas(mousePos.x, mousePos.y);
    const path = `M ${x1} ${y1} C ${x1+(target.x-x1)/2} ${y1}, ${target.x-(target.x-x1)/2} ${target.y}, ${target.x} ${target.y}`;
    return (
      <>
        <path d={path} stroke="#fbbf24" strokeWidth={2/viewport.zoom} strokeDasharray="5,5" fill="none" />
        {hoverTargetAnchor ? (<circle cx={hoverTargetAnchor.x} cy={hoverTargetAnchor.y} r={8/viewport.zoom} fill="rgba(34,211,238,0.14)" stroke="#22d3ee" strokeWidth={1.6/viewport.zoom} />) : null}
      </>
    );
  };

  const apiDebugItems = [
    { key: "memberInfo", label: "memberInfo" },
    { key: "userAuths", label: "userAuths" },
    { key: "modelParams", label: "modelParams(id=4)" },
    { key: "modelsLang", label: "models(part=1)" },
    { key: "modelsImage", label: "models(part=2)" },
    { key: "modelsVideo", label: "models(part=3)" },
    { key: "modelsVideoEnhance", label: "models(part=6)" },
    { key: "aiChatAnchor", label: "aiChatAnchor(module=3)" },
    { key: "aiChatLang", label: "aiChat(part=1 语言)" },
    { key: "aiChatImage", label: "aiChat(module=3 图片/视频)" },
    { key: "agentPlanner", label: "Agent Planner(LangGraph)" },
  ];

  const getApiDebugStatusClass = (status) => {
    if (status === "success") return "text-emerald-700 border-emerald-200 bg-emerald-50";
    if (status === "loading") return "text-cyan-700 border-cyan-200 bg-cyan-50";
    if (status === "warning") return "text-amber-700 border-amber-200 bg-amber-50";
    if (status === "timeout" || status === "error" || status === "login_required") {
      return "text-rose-700 border-rose-200 bg-rose-50";
    }
    return "text-slate-600 border-slate-200 bg-white";
  };

  const workbenchLightVars = {
    "--bf-bg": "#f7f7f2",
    "--bf-panel": "rgba(255,255,255,0.88)",
    "--bf-panel-strong": "rgba(255,255,255,0.96)",
    "--bf-panel-soft": "rgba(255,255,255,0.72)",
    "--bf-border": "rgba(15,23,42,0.08)",
    "--bf-border-strong": "rgba(15,23,42,0.14)",
    "--bf-text": "rgba(15,23,42,0.92)",
    "--bf-text-muted": "rgba(71,85,105,0.92)",
    "--bf-text-subtle": "rgba(100,116,139,0.92)",
    "--bf-shadow-lg": "0 28px 60px -30px rgba(15,23,42,0.16)",
    "--bf-shadow-md": "0 18px 40px -28px rgba(15,23,42,0.14)",
  };

  return (
    <div
      className="h-screen w-screen bg-[var(--bf-bg)] text-[var(--bf-text)] overflow-hidden flex flex-col font-sans"
      style={workbenchLightVars}
    >
      {/* Header — Phase 8: extracted to WorkbenchHeader */}
      <WorkbenchHeader
        agentHistoryCollapsed={agentHistoryCollapsed}
        toggleAgentHistoryPanel={toggleAgentHistoryPanel}
        rightPanelContainerStyle={rightPanelContainerStyle}
        handleRightPanelResizeStart={handleRightPanelResizeStart}
        agentSessions={agentSessions}
        activeAgentSession={activeAgentSession}
        agentTurns={agentTurns}
        activePendingTask={activePendingTask}
        isAgentMissionRunning={isAgentMissionRunning}
        hasActiveAgentConversation={hasActiveAgentConversation}
        minimizedAgentCards={minimizedAgentCards}
        agentResultCards={agentResultCards}
        selectedAgentCardIds={selectedAgentCardIds}
        activeAgentCardId={activeAgentCardId}
        setActiveAgentSession={setActiveAgentSession}
        createAgentSession={createAgentSession}
        clearActiveAgentConversation={clearActiveAgentConversation}
        focusAgentResultCard={focusAgentResultCard}
        toggleAgentResultCardCollapsed={toggleAgentResultCardCollapsed}
        minimizeAgentResultCard={minimizeAgentResultCard}
        handleAgentCardWheelCapture={handleAgentCardWheelCapture}
        agentConversationBottomRef={agentConversationBottomRef}
        agentDevMode={agentDevMode}
        isAdminUser={isAdminUser}
        apiStatus={apiStatus}
        setShowHistoryPanel={setShowHistoryPanel}
        retryAgentTurn={retryAgentTurn}
        handleTurnMarkRegression={handleTurnMarkRegression}
        handleSuggestionConfirm={handleSuggestionConfirm}
        handleSuggestionIgnore={handleSuggestionIgnore}
        handleSuggestionEdit={handleSuggestionEdit}
        handleSuggestionMarkRegression={handleSuggestionMarkRegression}
        confirmScriptExtraction={confirmScriptExtraction}
        buildAssetCanvas={buildAssetCanvas}
        skipToShotWorkflow={skipToShotWorkflow}
        buildDirectVideoCanvas={buildDirectVideoCanvas}
        hitlFeedbackRows={hitlFeedbackRows}
        devSuggestionLog={devSuggestionLog}
        devRegressionLog={devRegressionLog}
        sendAgentMissionFromText={sendAgentMissionFromText}
        createText2ImgTemplate={createText2ImgTemplate}
        safeInvoke={safeInvoke}
        handleAgentCardMouseDown={handleAgentCardMouseDown}
        savingSuggestionId={savingSuggestionId}
        savingFeedbackTargetId={savingFeedbackTargetId}
      />

      {/* Toast */}
      {runToast && (
        <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-lg shadow-[0_18px_36px_rgba(15,23,42,0.14)] border flex items-center gap-2 animate-in slide-in-from-top-5 duration-300 ${runToast.type === "error" ? "bg-rose-50 border-rose-200 text-rose-700" : "bg-white border-slate-200 text-slate-700"}`}>
          {runToast.type === "error" ? <AlertCircle className="w-4 h-4" /> : <Activity className="w-4 h-4 text-purple-400" />}
          <span className="text-xs font-medium">{runToast.message}</span>
          {typeof runToast.onAction === "function" && runToast.actionLabel && (
            <button
              type="button"
              onClick={() => {
                runToast.onAction();
                setRunToast(null);
              }}
              className="ml-1 px-1.5 py-0.5 rounded border border-cyan-200 bg-cyan-50 text-cyan-700 text-[10px] hover:bg-cyan-100"
            >
              {runToast.actionLabel}
            </button>
          )}
          <button
            type="button"
            onClick={() => setRunToast(null)}
            className="ml-1 text-slate-400 hover:text-slate-900"
            aria-label="关闭通知"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Asset Library — Phase 3: extracted to WorkbenchAssetLibrary */}
      {showAssetLibrary ? (
        <WorkbenchAssetLibrary
          show={showAssetLibrary}
          onClose={() => setShowAssetLibrary(false)}
          tab={assetLibraryTab}
          setTab={setAssetLibraryTab}
          drafts={assetLibraryDrafts}
          works={assetLibraryWorks}
          assets={assetLibraryAssets}
          personas={assetLibraryPersonas}
          versionsByWorkId={assetLibraryVersionsByWorkId}
          activeCanvasDraft={activeCanvasDraft}
          detailWork={assetLibraryDetailWork}
          detailPersona={assetLibraryDetailPersona}
          detailSnapshot={assetLibraryDetailSnapshot}
          detailDigest={assetLibraryDetailDigest}
          detailAssets={assetLibraryDetailAssets}
          setDetailWorkId={setAssetLibraryDetailWorkId}
          setDetailPersonaId={setAssetLibraryDetailPersonaId}
          editingTitleId={editingAssetWorkTitleId}
          editingTitleDraft={editingAssetWorkTitleDraft}
          setEditingTitleDraft={setEditingAssetWorkTitleDraft}
          beginEditTitle={beginEditAssetWorkTitle}
          cancelEditTitle={cancelEditAssetWorkTitle}
          commitEditTitle={commitEditAssetWorkTitle}
          expandedWorkIds={expandedAssetWorkIds}
          setExpandedWorkIds={setExpandedAssetWorkIds}
          pickerMode={assetLibraryPickerMode}
          setPickerMode={setAssetLibraryPickerMode}
          personaImageInputRef={assetLibraryPersonaImageInputRef}
          onRestoreSnapshot={restoreSnapshotToCanvas}
          onRestoreAsset={restoreAssetToCanvas}
          onSave={saveCurrentCanvasAsWork}
          onSaveNew={saveCurrentCanvasAsNewWork}
          createPersona={createAssetLibraryPersona}
          updatePersona={updateAssetLibraryPersona}
          removePersona={removeAssetLibraryPersona}
          onPersonaReferenceUpload={handleAssetLibraryPersonaReferenceUpload}
          removeItem={removeAssetLibraryItem}
          onAddPersonaToCanvas={createPersonaInputNodeAt}
        />
      ) : null}

      {isAdminUser && agentDevMode ? (
        <div className="fixed right-4 bottom-4 z-[92] w-[320px] max-w-[calc(100vw-1rem)] overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.12)]">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.82)_48%,rgba(255,255,255,0.72))]" />
          <button
            type="button"
            onClick={() => setApiDebugOpen((prev) => !prev)}
            className="relative flex w-full items-center justify-between border-b border-slate-200 px-4 py-3 text-left"
          >
            <span className="text-xs font-semibold text-slate-800">新接口状态</span>
            <span className="text-[10px] text-slate-500">{apiDebugOpen ? "收起" : "展开"}</span>
          </button>
          {apiDebugOpen ? (
            <div className="relative space-y-2 p-3">
              {apiDebugItems.map((item) => {
                const state = apiDebugStatus[item.key] || { status: "idle", message: "", detail: "", updatedAt: 0 };
                return (
                  <div key={item.key} className={`rounded-[18px] border px-3 py-2 ${getApiDebugStatusClass(state.status)}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold truncate">{item.label}</span>
                      <span className="text-[10px] opacity-90">{API_DEBUG_STATUS_LABEL[state.status] || state.status}</span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="text-[10px] opacity-85 truncate">{state.message || "--"}</span>
                      <span className="text-[10px] opacity-70 shrink-0">{formatDebugTime(state.updatedAt)}</span>
                    </div>
                    {API_DEBUG_DETAIL_KEYS.has(item.key) && state.detail ? (
                      <details className="mt-1.5 rounded-[14px] border border-slate-200 bg-slate-50">
                        <summary className="cursor-pointer list-none px-2 py-1.5 text-[9px] text-slate-700 [&::-webkit-details-marker]:hidden">
                          查看详细信息
                        </summary>
                        <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all border-t border-slate-200 px-2 py-1.5 text-[9px] leading-4 text-slate-700">
                          {state.detail}
                        </pre>
                      </details>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      <div ref={workspaceShellRef} className="flex-1 flex relative min-h-0 overflow-hidden">
        <input
          ref={sidebarImageUploadInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            void handleSidebarMediaUpload(event, "image");
          }}
        />
        <input
          ref={sidebarVideoUploadInputRef}
          type="file"
          accept="video/*"
          multiple
          className="hidden"
          onChange={(event) => {
            void handleSidebarMediaUpload(event, "video");
          }}
        />
        {/* Sidebar — Phase 4: extracted to WorkbenchSidebar */}
        <WorkbenchSidebar
          hoveredSidebarPreview={hoveredSidebarPreview}
          setHoveredSidebarPreview={setHoveredSidebarPreview}
          setHoveredSidebarItemKey={setHoveredSidebarItemKey}
          sidebarNodeInputMenu={sidebarNodeInputMenu}
          setSidebarNodeInputMenu={setSidebarNodeInputMenu}
          sidebarWorkflowMenu={sidebarWorkflowMenu}
          setSidebarWorkflowMenu={setSidebarWorkflowMenu}
          sidebarImageCreateMenu={sidebarImageCreateMenu}
          setSidebarImageCreateMenu={setSidebarImageCreateMenu}
          activeSidebarItemKey={activeSidebarItemKey}
          setActiveSidebarItemKey={setActiveSidebarItemKey}
          showSidebarUploadMenu={showSidebarUploadMenu}
          setShowSidebarUploadMenu={setShowSidebarUploadMenu}
          sidebarVideoCreateMenu={sidebarVideoCreateMenu}
          setSidebarVideoCreateMenu={setSidebarVideoCreateMenu}
          sidebarUploadMenuRef={sidebarUploadMenuRef}
          sidebarUploadMenuCloseTimerRef={sidebarUploadMenuCloseTimerRef}
          sidebarNodeInputMenuCloseTimerRef={sidebarNodeInputMenuCloseTimerRef}
          sidebarImageCreateMenuCloseTimerRef={sidebarImageCreateMenuCloseTimerRef}
          sidebarVideoCreateMenuCloseTimerRef={sidebarVideoCreateMenuCloseTimerRef}
          sidebarWorkflowMenuCloseTimerRef={sidebarWorkflowMenuCloseTimerRef}
          sidebarImageUploadInputRef={sidebarImageUploadInputRef}
          sidebarVideoUploadInputRef={sidebarVideoUploadInputRef}
          leftSidebarWidth={leftSidebarWidth}
          workspaceShellRef={workspaceShellRef}
          memberLabel={memberLabel}
          memberAvatar={memberAvatar}
          memberPoint={memberPoint}
          memberTotalPoint={memberTotalPoint}
          memberInfoLoginUrl={memberInfoLoginUrl}
          userAuthsLoading={userAuthsLoading}
          isAdminUser={isAdminUser}
          navigateToMemberLogin={navigateToMemberLogin}
          setShowAssetLibrary={setShowAssetLibrary}
          setAssetLibraryPickerMode={setAssetLibraryPickerMode}
          setAssetLibraryTab={setAssetLibraryTab}
          setAssetLibraryDetailWorkId={setAssetLibraryDetailWorkId}
          navigate={navigate}
          defaultVideoModelId={defaultVideoModelId}
          onAddNode={addNode}
          onNavigate={handleAnchorActionClick}
          safeInvoke={safeInvoke}
          createText2ImgTemplate={createText2ImgTemplate}
          createImg2ImgTemplate={createImg2ImgTemplate}
          createMultiImg2ImgTemplate={createMultiImg2ImgTemplate}
          createImg2VideoTemplate={createImg2VideoTemplate}
          createText2VideoTemplate={createText2VideoTemplate}
          createOmniReferenceVideoTemplate={createOmniReferenceVideoTemplate}
        />

        {/* Canvas — Phase 9: extracted to WorkbenchCanvas */}
        <WorkbenchCanvas
          canvasRef={canvasRef}
          viewport={viewport}
          nodes={nodes}
          connections={connections}
          selectedNodeIds={selectedNodeIds}
          selectedConnectionIds={selectedConnectionIds}
          connectingSource={connectingSource}
          selectionBox={selectionBox}
          canvasDropActive={canvasDropActive}
          canvasDropUploading={canvasDropUploading}
          hoveredConnectionId={hoveredConnectionId}
          setHoveredConnectionId={setHoveredConnectionId}
          hoveredConnectTarget={hoveredConnectTarget}
          mousePos={mousePos}
          isRunning={isRunning}
          hasAgentResultCards={hasAgentResultCards}
          nodeElementMapRef={nodeElementMapRef}
          canvasHoverClientRef={canvasHoverClientRef}
          renderConnections={renderConnections}
          renderTempConnection={renderTempConnection}
          handleCanvasMouseDown={handleCanvasMouseDown}
          handleMouseMove={handleMouseMove}
          handleMouseUp={handleMouseUp}
          handleWheel={handleWheel}
          handleCanvasDragEnter={handleCanvasDragEnter}
          handleCanvasDragOver={handleCanvasDragOver}
          handleCanvasDragLeave={handleCanvasDragLeave}
          handleCanvasDrop={handleCanvasDrop}
          handleConnectionClick={handleConnectionClick}
          deleteConnectionById={deleteConnectionById}
          getCursor={getCursor}
          screenToCanvas={screenToCanvas}
          handleNodeMouseDown={handleNodeMouseDown}
          updateNodeData={updateNodeData}
          apiFetch={apiFetch}
          openPromptPolishPicker={openPromptPolishPicker}
          imageModelOptions={imageModelOptions}
          videoModelOptions={videoModelOptions}
          resolveModelParamsForId={resolveModelParamsForId}
          personaMentionOptions={personaMentionOptions}
          connectedInputsByNodeId={connectedInputsByNodeId}
          deleteNode={deleteNode}
          pushHistory={pushHistory}
          startConnection={startConnection}
          handleConnectionTargetHover={handleConnectionTargetHover}
          handleConnectionTargetLeave={handleConnectionTargetLeave}
          setPreviewImage={setPreviewImage}
          createConnectedVideoNode={createConnectedVideoNode}
          executeFlow={executeFlow}
          checkNodeReady={checkNodeReady}
          setActiveArtifact={setActiveArtifact}
          activeArtifact={activeArtifact}
          createConnectedImg2ImgBranch={createConnectedImg2ImgBranch}
          runCompactRmbg={runCompactRmbg}
          runCompactRemoveWatermark={runCompactRemoveWatermark}
          runCompactThreeView={runCompactThreeView}
          runCompactVideoUpscale={runCompactVideoUpscale}
          runVideoRmbg={runVideoRmbg}
          runVideoLineart={runVideoLineart}
          runVideoSplit={runVideoSplit}
          createPromptQuickChain={createPromptQuickChain}
          cancelNodeGeneration={cancelNodeGeneration}
          pendingUploadNodeId={pendingUploadNodeId}
          setPendingUploadNodeId={setPendingUploadNodeId}
          handleNodeElementChange={handleNodeElementChange}
          openStoryboardAssetHoverCard={openStoryboardAssetHoverCard}
          scheduleCloseStoryboardAssetHoverCard={scheduleCloseStoryboardAssetHoverCard}
          openStoryboardShotHoverCard={openStoryboardShotHoverCard}
          runStoryboardInputFromFiles={runStoryboardInputFromFiles}
          setRunToast={setRunToast}
          agentResultCards={agentResultCards}
          agentTurns={agentTurns}
          selectedAgentCardIds={selectedAgentCardIds}
          activeAgentCardId={activeAgentCardId}
          setSelectedAgentCardIds={setSelectedAgentCardIds}
          setActiveAgentCardId={setActiveAgentCardId}
          handleAgentCardMouseDown={handleAgentCardMouseDown}
          toggleAgentResultCardCollapsed={toggleAgentResultCardCollapsed}
          minimizeAgentResultCard={minimizeAgentResultCard}
          handleAgentCardWheelCapture={handleAgentCardWheelCapture}
          retryAgentTurn={retryAgentTurn}
          runBarProps={{
            onSave: saveCurrentCanvasAsWork,
            onSaveNew: saveCurrentCanvasAsNewWork,
            onShowAssets: () => setShowAssetLibrary(true),
            onArrange: arrangeCanvasNodes,
            zoomCanvas,
          }}
          composerProps={{
            agentComposerRef, agentInputRef, agentUploadInputRef,
            agentInput, setAgentInput, agentInputFocused, setAgentInputFocused,
            agentPromptPolishLoading, agentPromptPolishError, setAgentPromptPolishError,
            agentComposerFiles, activeComposerActionId,
            showCanvasExamples, setShowCanvasExamples,
            isAgentMissionRunning, isCanvasPromptPending,
            preferenceNotice, setPreferenceNotice,
            agentDevMode, setAgentDevMode, activePendingTask,
            selectedStoryboardTarget, hitlFeedbackRows, devSuggestionLog, devRegressionLog,
            personaMentionOptions, isAdminUser, setActiveArtifact,
            sendAgentMission, polishAgentPromptInput,
            handleAgentComposerUpload, removeAgentComposerFile, handleAgentQuickAction,
            insertCanvasPromptExample, handleCanvasExamplePick,
            handleSuggestionEdit, openPreferencesPanelWithSuggestion,
          }}
        />

        {/* ✅ 属性栏（保留并确保存在） */}
	        <PropertyPanel
	          node={(() => {
	            const activeNode = activeNodeId ? nodes.find((n) => n.id === activeNodeId) : null;
	            if (activeNode?.type === NODE_TYPES.VIDEO_GEN && (activeNode?.data?.mode === "img2video" || activeNode?.data?.mode === "text2video")) return null;
	            if (activeNode?.type === NODE_TYPES.PROCESSOR && (activeNode?.data?.mode === "text2img" || activeNode?.data?.mode === "multi_image_generate")) return null;
	            return activeNode;
	          })()}
	          updateData={updateNodeData}
	          onClose={() => setActiveNodeId(null)}
          apiFetch={apiFetch}
          onOpenPromptPolishPicker={openPromptPolishPicker}
          imageModelOptions={imageModelOptions}
          videoModelOptions={videoModelOptions}
          resolveModelParamsForId={resolveModelParamsForId}
          personaMentionOptions={personaMentionOptions}
        />
      </div>

      <PromptPolishPickerModal
        open={Boolean(promptPolishDialog)}
        title={promptPolishDialog?.title || "AI 润色"}
        sourcePrompt={promptPolishDialog?.sourcePrompt || ""}
        variants={promptPolishDialog?.variants || EMPTY_LIST}
        onClose={closePromptPolishPicker}
        onUse={usePromptPolishVariant}
      />

      {/* History Panel — Phase 3: extracted to WorkbenchHistoryPanel */}
      <WorkbenchHistoryPanel
        show={showHistoryPanel}
        onClose={() => setShowHistoryPanel(false)}
        activeTab={activeHistoryTab}
        setActiveTab={setActiveHistoryTab}
        history={apiHistory}
        expandedIds={expandedHistoryIds}
        setExpandedIds={setExpandedHistoryIds}
        stats={apiStats}
        normalizeOutputs={normalizeHistoryOutputs}
        normalizeInputs={normalizeHistoryInputs}
        formatParams={formatHistoryParams}
        onPreview={setPreviewImage}
        onReuse={applyHistoryConfig}
      />

      {showPreferencesPanel && (
        <React.Suspense
          fallback={
            <div className="fixed right-0 top-0 z-[120] h-full w-[min(94vw,560px)] border-l border-slate-200 bg-white text-slate-700 p-4">
              <div className="inline-flex items-center gap-2 text-xs">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                正在加载偏好面板...
              </div>
            </div>
          }
        >
          <PreferencesPanel
            open={showPreferencesPanel}
            onClose={() => {
              setShowPreferencesPanel(false);
              setPreferencesPanelPrefill(null);
            }}
            apiFetch={apiFetch}
            onQuickExample={insertCanvasPromptExample}
            onPreferenceSaved={handlePreferenceSavedFromPanel}
            prefill={preferencesPanelPrefill}
          />
        </React.Suspense>
      )}

      {/* RegressionDialog — Phase 3: extracted to WorkbenchRegressionDialog */}
      <WorkbenchRegressionDialog
        show={HITL_FEEDBACK_UI_ENABLED && !!feedbackDialog}
        dialog={feedbackDialog}
        reasonChoice={feedbackReasonChoice}
        setReasonChoice={setFeedbackReasonChoice}
        reasonNote={feedbackReasonNote}
        setReasonNote={setFeedbackReasonNote}
        saving={!!savingFeedbackTargetId}
        onClose={closeRegressionFeedbackDialog}
        onConfirm={confirmRegressionFeedbackDialog}
        reasonOptions={HITL_FEEDBACK_REASON_OPTIONS}
      />



      {/* StoryboardAssetCard — Phase 3: extracted to WorkbenchStoryboardAssetCard */}
      <WorkbenchStoryboardAssetCard
        card={hoveredStoryboardAssetCard}
        closeTimerRef={storyboardAssetHoverCloseTimerRef}
        onScheduleClose={scheduleCloseStoryboardAssetHoverCard}
        setCard={setHoveredStoryboardAssetCard}
        onUpdateStatus={updateStoryboardAssetStatus}
        onGenerate={runStoryboardAssetDirectGeneration}
        onPreview={setPreviewImage}
      />

      {/* StoryboardShotCard — Phase 3: extracted to WorkbenchStoryboardShotCard */}
      <WorkbenchStoryboardShotCard
        card={hoveredStoryboardShotCard}
        closeTimerRef={storyboardShotHoverCloseTimerRef}
        onScheduleClose={scheduleCloseStoryboardShotHoverCard}
        onUpdateStatus={updateStoryboardAssetStatus}
        onGenerate={runStoryboardShotGeneration}
        onPreview={setPreviewImage}
      />

      {/* ImagePreview — Phase 3: extracted to WorkbenchImagePreview */}
      <WorkbenchImagePreview url={previewImage} onClose={() => setPreviewImage(null)} />
    </div>
  );
};

class WorkbenchErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error?.message || "未知页面错误",
    };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[Workbench] runtime:error", {
      message: error?.message || String(error),
      stack: error?.stack || "",
      componentStack: errorInfo?.componentStack || "",
    });
  }

  handleRecover = () => {
    this.setState({ hasError: false, message: "" });
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="h-screen w-screen bg-[#f7f7f2] text-slate-800 flex items-center justify-center p-6">
        <div className="w-[min(92vw,640px)] rounded-xl border border-rose-200 bg-white p-5 shadow-[0_24px_56px_rgba(15,23,42,0.12)]">
          <div className="text-sm font-semibold text-rose-600">页面运行异常</div>
          <div className="mt-2 text-xs text-slate-600 break-all">{this.state.message || "未知错误"}</div>
          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={this.handleRecover}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
            >
              尝试恢复
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs text-cyan-700 hover:bg-cyan-100"
            >
              刷新页面
            </button>
          </div>
        </div>
      </div>
    );
  }
}

const WorkbenchWithBoundary = () => (
  <WorkbenchErrorBoundary>
    <Workbench />
  </WorkbenchErrorBoundary>
);

export default WorkbenchWithBoundary;
