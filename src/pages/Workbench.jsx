import React, { useState, useRef, useCallback } from "react";
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
  AI_CHAT_PART_ENUM_203,
  AI_CHAT_PART_ENUM_204,
  AI_CHAT_PART_ENUM_207,
  AI_CHAT_PART_ENUM_209,
  AI_CHAT_PART_ENUM_210,
  AI_CHAT_PART_ENUM_211,
} from "../api/aiChat";
import { useMemberInfo } from "../hooks/useMemberInfo";
import { useSidebar } from "../hooks/useSidebar";
import { API_BASE } from "../config";
import {
  EMPTY_LIST,
  STORYBOARD_RUN_STEPS,
  SHOT_WORKFLOW_RUN_STEPS,
  AGENT_RESULT_CARD_WIDTH,
  NODE_TYPES,
  HIDDEN_IMAGE_CONFIG_MODES,
  VOLC_VIDEO_HD_TEMPLATE_ENUM_1,
  VOLC_VIDEO_HD_TEMPLATE_ENUM_2,
  DEFAULT_VIDEO_HD_MODEL_ID,
  FEATURE_EXTRACT_PRESET_PROMPTS,
  VIDEO_HD_TEMPLATE_OPTIONS,
  PROMPT_TEMPLATES,
  ASPECT_RATIOS,
  MEDIA_UPLOAD_NODE_EMPTY_HEIGHT,
  MAX_RENDERED_MEDIA_ITEMS_PER_NODE,
  DEFAULT_VIDEO_LINEART_STRENGTH,
  DEFAULT_VIDEO_LINEART_COLOR,
  DEFAULT_VIDEO_SPLIT_OUTPUT_RESOLUTION,
  checkNodeReady,
} from "../constants/workbench.jsx";
import { useAssetLibrary } from "../hooks/useAssetLibrary";
import { useCanvas } from "../hooks/useCanvas";
import {
  WORKBENCH_AI_CHAT_MODULE_ENUM,
  THREE_VIEW_PROMPT,
  THREE_VIEW_DEFAULT_TEMPLATES,
  MULTI_ANGLE_VARIANTS,
  MODES_WITHOUT_APP_AUTH,
} from "../lib/workbenchHelpers.js";
import {
  HITL_FEEDBACK_UI_ENABLED,
} from "../lib/agentHelpers.js";
import WorkbenchHeader from "../components/workbench/WorkbenchHeader.jsx";
import WorkbenchCanvas from "../components/workbench/WorkbenchCanvas.jsx";
import WorkbenchRunBar from "../components/workbench/WorkbenchRunBar.jsx";
import WorkbenchImagePreview from "../components/workbench/WorkbenchImagePreview.jsx";
import WorkbenchStoryboardAssetCard from "../components/workbench/WorkbenchStoryboardAssetCard.jsx";
import WorkbenchSidebar from "../components/workbench/WorkbenchSidebar.jsx";
import WorkbenchAgentComposer from "../components/workbench/WorkbenchAgentComposer.jsx";
import { useCanvasNodeOps } from "../hooks/useCanvasNodeOps.js";
import { useCanvasExecutor } from "../hooks/useCanvasExecutor.js";
import { useAgentMission } from "../hooks/useAgentMission.js";
import WorkbenchStoryboardShotCard from "../components/workbench/WorkbenchStoryboardShotCard.jsx";
import { useAgentChat, HITL_FEEDBACK_REASON_OPTIONS } from "../hooks/useAgentChat";
import { useWorkbenchRun } from "../hooks/useWorkbenchRun";
import { useWorkbenchPersistence } from "../hooks/useWorkbenchPersistence";
import { useWorkbenchShortcuts } from "../hooks/useWorkbenchShortcuts";
import { useWorkbenchConnections } from "../hooks/useWorkbenchConnections";
import { useWorkbenchAgentCards } from "../hooks/useWorkbenchAgentCards";
import { useWorkbenchToastBridge } from "../hooks/useWorkbenchToastBridge";
import { useWorkbenchAiModels } from "../hooks/useWorkbenchAiModels";
import { useWorkbenchApiDebug } from "../hooks/useWorkbenchApiDebug";
import { useWorkbenchStoryboardHover } from "../hooks/useWorkbenchStoryboardHover";
import { useConnectedInputsByNodeId } from "../hooks/useConnectedInputsByNodeId";
import { useWorkbenchConnectionLayer } from "../hooks/useWorkbenchConnectionLayer.jsx";
import { useWorkbenchCanvasFocus } from "../hooks/useWorkbenchCanvasFocus";
import { useWorkbenchAssetActions } from "../hooks/useWorkbenchAssetActions";
import { useWorkbenchAnchorActions } from "../hooks/useWorkbenchAnchorActions";
import { useWorkbenchNodeFactory } from "../hooks/useWorkbenchNodeFactory";
import { useWorkbenchHistoryReuse } from "../hooks/useWorkbenchHistoryReuse";
import { useNodeElementRegistry } from "../hooks/useNodeElementRegistry";

const PreferencesPanel = React.lazy(() => import("../components/agent-canvas/PreferencesPanel"));
const WorkbenchAssetLibrary = React.lazy(() => import("../components/workbench/WorkbenchAssetLibrary.jsx"));
const WorkbenchHistoryPanel = React.lazy(() => import("../components/workbench/WorkbenchHistoryPanel.jsx"));
const WorkbenchRegressionDialog = React.lazy(() => import("../components/workbench/WorkbenchRegressionDialog.jsx"));


// ==========================================
// Config & Constants
// ==========================================
const GRID_SIZE = 20;
const AGENT_COMPOSER_FILE_ACCEPT = "image/*,.csv,.tsv,.txt,.md,.markdown,.docx,.doc,text/plain,text/csv,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword";
const WORKBENCH_LIGHT_VARS = {
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
    workspaceShellRef,
    leftSidebarWidth,
  } = useSidebar();

  const clearAgentCardSelectionRef = useRef(null);
  const boxSelectCompleteRef = useRef(null);
  const pasteToastRef = useRef(null);

  const {
    nodes, setNodes,
    connections, setConnections,
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
    runToast, setRunToast, showRunToast, clearRunToast,
    normalizeHistoryOutputs,
    normalizeHistoryInputs,
    formatHistoryParams,
    cancelNodeGeneration,
    safeInvoke,
  } = useWorkbenchRun({ apiFetch });

  const {
    restoreSnapshotToCanvas,
    saveCurrentCanvasAsWork,
    saveCurrentCanvasAsNewWork,
  } = useWorkbenchPersistence({
    canvasId,
    nodes,
    connections,
    viewport,
    assetLibraryStore,
    assetLibraryLoaded,
    assetLibraryRestoredRef,
    setAssetLibraryStore,
    setShowAssetLibrary,
    setAssetLibraryTab,
    setAssetLibraryDetailWorkId,
    setAssetLibraryDetailPersonaId,
    setNodes,
    setConnections,
    setViewport,
    setSelectedNodeIds,
    setSelectedConnectionIds,
    setActiveNodeId,
    pushHistory,
    setRunToast,
  });

  const aiChatSessionIdRef = useRef("");
  const aiChatHistoryRecordIdRef = useRef("");
  const {
    apiDebugOpen,
    setApiDebugOpen,
    apiDebugStatus,
    apiDebugItems,
    apiDebugDetailKeys,
    apiDebugStatusLabel,
    formatDebugTime,
    getApiDebugStatusClass,
    pushApiDebugDetail,
    updateApiDebugStatus,
  } = useWorkbenchApiDebug();
  const {
    imageModelRecords,
    imageModelOptions,
    videoModelOptions,
    defaultImageModelId,
    threeViewImageModelId,
    defaultVideoModelId,
    resolveModelParamsForId,
  } = useWorkbenchAiModels({
    apiFetch,
    nodes,
    setNodes,
    pushApiDebugDetail,
    updateApiDebugStatus,
  });

  const [activeArtifact, setActiveArtifact] = useState(null);
  const {
    hoveredStoryboardAssetCard,
    setHoveredStoryboardAssetCard,
    hoveredStoryboardShotCard,
    setHoveredStoryboardShotCard,
    storyboardAssetHoverCloseTimerRef,
    storyboardShotHoverCloseTimerRef,
    selectedStoryboardTarget,
    scheduleCloseStoryboardAssetHoverCard,
    scheduleCloseStoryboardShotHoverCard,
    openStoryboardShotHoverCard,
    openStoryboardAssetHoverCard,
  } = useWorkbenchStoryboardHover({ activeArtifact });
  // ── Phase 5: canvas node operations hook (compact ops + storyboard gen) ────
  const {
    updateStoryboardAssetStatus,
    runStoryboardAssetDirectGeneration,
    runStoryboardShotGeneration,
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
    sendAgentMissionFromText, sendAgentMission,
    confirmScriptExtraction, buildAssetCanvas,
    skipToShotWorkflow, buildDirectVideoCanvas,
    polishAgentPromptInput, handleAgentComposerUpload,
    removeAgentComposerFile, handleAgentQuickAction,
    insertCanvasPromptExample, handleCanvasExamplePick,
    openPreferencesPanelWithSuggestion, handlePreferenceSavedFromPanel,
    handleSuggestionConfirm, handleSuggestionIgnore,
    handleSuggestionEdit, handleSuggestionMarkRegression,
    closeRegressionFeedbackDialog, confirmRegressionFeedbackDialog,
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

  const { handleAgentCardMouseDown } = useWorkbenchAgentCards({
    agentResultCards,
    selectedAgentCardIds,
    setSelectedAgentCardIds,
    setActiveAgentCardId,
    setAgentResultCards,
    agentCardDragRef,
    viewportRef,
    setSelectedNodeIds,
    setSelectedConnectionIds,
    clearAgentCardSelectionRef,
    boxSelectCompleteRef,
  });

  useWorkbenchToastBridge({
    pasteToastRef,
    onRunToastForAgentRef,
    showRunToast,
    setRunToast,
  });

  const connectedInputsByNodeId = useConnectedInputsByNodeId(nodes, connections);

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

  const { handleAnchorActionClick } = useWorkbenchAnchorActions({
    apiFetch,
    pushApiDebugDetail,
    updateApiDebugStatus,
  });

  // _applyPatch — 委托给 canvasStore.applyPatch（Immer 事务，无闭包陈旧问题）
  // 返回值 { nodes, connections, viewport } 与原实现兼容，供 upsertCanvasDraftSnapshot 使用。
  const _applyPatch = useCallback((patchOps) => {
    if (!Array.isArray(patchOps) || patchOps.length === 0) return undefined;
    return storeApplyPatch(patchOps);
  }, [storeApplyPatch]);

  const { focusCanvasNode } = useWorkbenchCanvasFocus({
    canvasRef,
    nodesRef,
    selectedNodeIds,
    setActiveNodeId,
    setSelectedConnectionIds,
    setSelectedNodeIds,
    setViewport,
    showRunToast,
    viewportRef,
    pushHistory,
  });

  useWorkbenchShortcuts({
    activeArtifact,
    previewImage,
    nodes,
    toggleAgentHistoryPanel,
    setPreviewImage,
    setIsSpacePressed,
    undo,
    redo,
    setSelectedNodeIds,
    deleteSelection,
    zoomCanvas,
    setViewport,
  });

  const {
    startConnection,
    handleConnectionTargetHover,
    handleConnectionTargetLeave,
  } = useWorkbenchConnections({
    connectingSource,
    setConnectingSource,
    connectionsRef,
    setConnections,
    connectionDragSelectionRef,
    connectionHoverTargetRef,
    setHoveredConnectTarget,
  });

  const {
    createPersonaInputNodeAt,
    handleSidebarMediaUpload,
    restoreAssetToCanvas,
  } = useWorkbenchAssetActions({
    nodes,
    pendingUploadNodeId,
    setPendingUploadNodeId,
    createMediaUploadNodeAt,
    getCanvasViewportCenterPoint,
    pushHistory,
    setActiveNodeId,
    setAssetLibraryDetailPersonaId,
    setAssetLibraryDetailWorkId,
    setAssetLibraryPickerMode,
    setAssetLibraryStore,
    setNodes,
    setSelectedConnectionIds,
    setSelectedNodeIds,
    setShowAssetLibrary,
    showRunToast,
  });

  const {
    addNode,
    createConnectedVideoNode,
    createImg2ImgTemplate,
    createImg2VideoTemplate,
    createMultiImg2ImgTemplate,
    createOmniReferenceVideoTemplate,
    createPromptQuickChain,
    createText2ImgTemplate,
    createText2VideoTemplate,
  } = useWorkbenchNodeFactory({
    appendTemplateGraph,
    canvasRef,
    connectionsRef,
    defaultImageModelId,
    defaultVideoModelId,
    nodes,
    nodesRef,
    pushHistory,
    screenToCanvas,
    selectedNodeIds,
    setConnections,
    setNodes,
    setSelectedConnectionIds,
    setSelectedNodeIds,
    videoModelOptions,
  });

  const { applyHistoryConfig } = useWorkbenchHistoryReuse({
    nodes,
    selectedNodeIds,
    pushHistory,
    updateNodeData,
    setShowHistoryPanel,
  });

  const { renderConnections, renderTempConnection } = useWorkbenchConnectionLayer({
    connections,
    nodes,
    nodeElementMapRef,
    selectedConnectionIds,
    hoveredConnectionId,
    setHoveredConnectionId,
    handleConnectionClick,
    deleteConnectionById,
    isRunning,
    connectingSource,
    hoveredConnectTarget,
    screenToCanvas,
    mousePos,
    viewport,
  });

  const { handleNodeElementChange } = useNodeElementRegistry(nodeElementMapRef);

  return (
    <div
      className="h-screen w-screen bg-[var(--bf-bg)] text-[var(--bf-text)] overflow-hidden flex flex-col font-sans"
      style={WORKBENCH_LIGHT_VARS}
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
        setActiveAgentSession={setActiveAgentSession}
        createAgentSession={createAgentSession}
        clearActiveAgentConversation={clearActiveAgentConversation}
        focusAgentResultCard={focusAgentResultCard}
        minimizeAgentResultCard={minimizeAgentResultCard}
        agentConversationBottomRef={agentConversationBottomRef}
        agentDevMode={agentDevMode}
        isAdminUser={isAdminUser}
        apiStatus={apiStatus}
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
        sendAgentMissionFromText={sendAgentMissionFromText}
        createText2ImgTemplate={createText2ImgTemplate}
        safeInvoke={safeInvoke}
        savingSuggestionId={savingSuggestionId}
        savingFeedbackTargetId={savingFeedbackTargetId}
        focusCanvasNode={focusCanvasNode}
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
                clearRunToast();
              }}
              className="ml-1 px-1.5 py-0.5 rounded border border-cyan-200 bg-cyan-50 text-cyan-700 text-[10px] hover:bg-cyan-100"
            >
              {runToast.actionLabel}
            </button>
          )}
          <button
            type="button"
            onClick={clearRunToast}
            className="ml-1 text-slate-400 hover:text-slate-900"
            aria-label="关闭通知"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Asset Library — Phase 3: extracted to WorkbenchAssetLibrary */}
      {showAssetLibrary ? (
        <React.Suspense fallback={null}>
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
        </React.Suspense>
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
                      <span className="text-[10px] opacity-90">{apiDebugStatusLabel[state.status] || state.status}</span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="text-[10px] opacity-85 truncate">{state.message || "--"}</span>
                      <span className="text-[10px] opacity-70 shrink-0">{formatDebugTime(state.updatedAt)}</span>
                    </div>
                    {apiDebugDetailKeys.has(item.key) && state.detail ? (
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
          connectingSource={connectingSource}
          selectionBox={selectionBox}
          canvasDropActive={canvasDropActive}
          canvasDropUploading={canvasDropUploading}
          hoveredConnectTarget={hoveredConnectTarget}
          hasAgentResultCards={hasAgentResultCards}
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
          getCursor={getCursor}
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
      {showHistoryPanel ? (
        <React.Suspense fallback={null}>
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
        </React.Suspense>
      ) : null}

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
      {HITL_FEEDBACK_UI_ENABLED && feedbackDialog ? (
        <React.Suspense fallback={null}>
          <WorkbenchRegressionDialog
            show
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
        </React.Suspense>
      ) : null}



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
