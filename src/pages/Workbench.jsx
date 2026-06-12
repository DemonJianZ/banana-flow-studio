import React, { useState, useRef, useCallback, useEffect } from "react";
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
import DramaMarkdownBlock from "../components/workbench/DramaMarkdownBlock";
import VideoPlayer from "../components/workbench/VideoPlayer";
import ToolIconBtn from "../components/workbench/ToolIconBtn";
import SidebarBtn from "../components/workbench/SidebarBtn";
import InlineDropdown from "../components/workbench/InlineDropdown";
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
import WorkbenchHeader from "../components/workbench/WorkbenchHeader.jsx";
import WorkbenchCanvas from "../components/workbench/WorkbenchCanvas.jsx";
import WorkbenchRunBar from "../components/workbench/WorkbenchRunBar.jsx";
import WorkbenchImagePreview from "../components/workbench/WorkbenchImagePreview.jsx";
import WorkbenchStoryboardAssetCard from "../components/workbench/WorkbenchStoryboardAssetCard.jsx";
import WorkbenchSidebar from "../components/workbench/WorkbenchSidebar.jsx";
import { useCanvasNodeOps } from "../hooks/useCanvasNodeOps.js";
import { useCanvasExecutor } from "../hooks/useCanvasExecutor.js";
import WorkbenchStoryboardShotCard from "../components/workbench/WorkbenchStoryboardShotCard.jsx";
import { useWorkbenchRun } from "../hooks/useWorkbenchRun";
import { useWorkbenchPersistence } from "../hooks/useWorkbenchPersistence";
import { useWorkbenchShortcuts } from "../hooks/useWorkbenchShortcuts";
import { useWorkbenchConnections } from "../hooks/useWorkbenchConnections";
import { useWorkbenchAiModels } from "../hooks/useWorkbenchAiModels";
import { useWorkbenchApiDebug } from "../hooks/useWorkbenchApiDebug";
import { useConnectedInputsByNodeId } from "../hooks/useConnectedInputsByNodeId";
import { useWorkbenchConnectionLayer } from "../hooks/useWorkbenchConnectionLayer.jsx";
import { useWorkbenchAssetActions } from "../hooks/useWorkbenchAssetActions";
import { useWorkbenchAnchorActions } from "../hooks/useWorkbenchAnchorActions";
import { useWorkbenchNodeFactory } from "../hooks/useWorkbenchNodeFactory";
import { useWorkbenchHistoryReuse } from "../hooks/useWorkbenchHistoryReuse";
import { useNodeElementRegistry } from "../hooks/useNodeElementRegistry";

const WorkbenchAssetLibrary = React.lazy(() => import("../components/workbench/WorkbenchAssetLibrary.jsx"));
const WorkbenchHistoryPanel = React.lazy(() => import("../components/workbench/WorkbenchHistoryPanel.jsx"));


// ==========================================
// Config & Constants
// ==========================================
const GRID_SIZE = 20;
const generateWorkbenchId = () => Math.random().toString(36).slice(2, 11);
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
    viewport, setViewport,
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
    connPathMapRef,
    isDraggingNodeIdsRef,
    panViewportLayerRef, panGridFineRef, panGridCoarseRef,
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
    activeCanvasDraft,
    assetLibraryDetailWork, assetLibraryDetailPersona,
    assetLibraryDetailSnapshot, assetLibraryDetailDigest, assetLibraryDetailAssets,
    beginEditAssetWorkTitle, cancelEditAssetWorkTitle, commitEditAssetWorkTitle,
    createAssetLibraryPersona, updateAssetLibraryPersona, removeAssetLibraryPersona,
    handleAssetLibraryPersonaReferenceUpload, removeAssetLibraryItem,
  } = useAssetLibrary(canvasId);

  const agentDevMode = false;
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
  const [hoveredStoryboardAssetCard, setHoveredStoryboardAssetCard] = useState(null);
  const [hoveredStoryboardShotCard, setHoveredStoryboardShotCard] = useState(null);
  const storyboardAssetHoverCloseTimerRef = useRef(null);
  const storyboardShotHoverCloseTimerRef = useRef(null);
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

  const deleteNode = useCallback((id) => {
    if (!id) return;
    pushHistory();
    setNodes((prev) => prev.filter((node) => node.id !== id));
    setConnections((prev) => prev.filter((conn) => conn.from !== id && conn.to !== id));
    setSelectedNodeIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, [pushHistory, setConnections, setNodes, setSelectedNodeIds]);

  useEffect(() => {
    pasteToastRef.current = (toast) => {
      showRunToast(toast);
    };
    return () => {
      pasteToastRef.current = null;
    };
  }, [pasteToastRef, showRunToast]);

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

  useWorkbenchShortcuts({
    activeArtifact,
    previewImage,
    nodes,
    toggleAgentHistoryPanel: () => {},
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
    connPathMapRef,
  });

  const { handleNodeElementChange } = useNodeElementRegistry(nodeElementMapRef);

  // Agent 画布动作处理（canvas_action SSE 事件）
  const handleCanvasAction = useCallback((event) => {
    const { action } = event;

    if (action === "add_node") {
      const node = event.node;
      if (!node) return;
      setNodes((prev) => {
        if (prev.some((n) => n.id === node.id)) return prev; // 去重
        return [...prev, node];
      });
    } else if (action === "connect") {
      const conn = event.connection;
      if (!conn) return;
      setConnections((prev) => {
        const dup = prev.some(
          (c) => c.from === conn.from && c.to === conn.to &&
                 (c.toHandle || "") === (conn.toHandle || "")
        );
        if (dup) return prev;
        return [...prev, conn];
      });
    } else if (action === "select_nodes") {
      const ids = event.ids;
      if (!Array.isArray(ids)) return;
      setSelectedNodeIds(new Set(ids));
      setSelectedConnectionIds(new Set());
      if (ids.length > 0) setActiveNodeId(ids[ids.length - 1]);
    }
  }, [setActiveNodeId, setConnections, setNodes, setSelectedConnectionIds, setSelectedNodeIds]);

  // 在 Agent 发起画布规划前调用（保存撤销点）
  const handleCanvasPlanStart = useCallback(() => {
    pushHistory();
  }, [pushHistory]);

  // Agent 对话框「添加到画布」快捷操作
  const handleAddToCanvas = useCallback((url, mediaType = "image") => {
    if (!url) return;
    pushHistory();
    const center = getCanvasViewportCenterPoint();
    const nodeId = generateWorkbenchId();
    const isVideo = mediaType === "video" || /\.(mp4|mov|webm|avi|mkv)(\?|$)/i.test(url);
    const newNode = {
      id: nodeId,
      type: NODE_TYPES.INPUT,
      x: center.x - 140,
      y: center.y - 110,
      data: {
        images: [url],
        mediaKind: isVideo ? "video" : "image",
        title: isVideo ? "AI 生成视频" : "AI 生成图片",
        frameless: true,
      },
    };
    setNodes((prev) => [...prev, newNode]);
    setSelectedNodeIds(new Set([nodeId]));
    setSelectedConnectionIds(new Set());
    setActiveNodeId(nodeId);
    showRunToast({ message: isVideo ? "视频已添加到画布" : "图片已添加到画布", type: "info" });
  }, [getCanvasViewportCenterPoint, pushHistory, setActiveNodeId, setNodes, setSelectedConnectionIds, setSelectedNodeIds, showRunToast]);

  const handleAgentComposerSubmit = useCallback((value) => {
    const text = String(value || "").trim();
    if (!text) return false;

    pushHistory();
    const center = getCanvasViewportCenterPoint();
    const nodeId = generateWorkbenchId();
    const nextNode = {
      id: nodeId,
      type: NODE_TYPES.TEXT_INPUT,
      x: center.x - 160,
      y: center.y - 110,
      data: { text },
    };

    setNodes((prev) => [...prev, nextNode]);
    setSelectedNodeIds(new Set([nodeId]));
    setSelectedConnectionIds(new Set());
    setActiveNodeId(nodeId);
    showRunToast({ message: "已添加到画布", type: "info" });
    return true;
  }, [getCanvasViewportCenterPoint, pushHistory, setActiveNodeId, setNodes, setSelectedConnectionIds, setSelectedNodeIds, showRunToast]);

  return (
    <div
      className="h-screen w-screen bg-[var(--bf-bg)] text-[var(--bf-text)] overflow-hidden flex flex-col font-sans"
      style={WORKBENCH_LIGHT_VARS}
    >
      {/* Header — Phase 8: extracted to WorkbenchHeader */}
      <WorkbenchHeader
        agentDevMode={agentDevMode}
        isAdminUser={isAdminUser}
        apiStatus={apiStatus}
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
          canvasRuntime={{
            canvasRef, canvasHoverClientRef,
            viewport, nodes, connections, selectedNodeIds,
            connectingSource, selectionBox, canvasDropActive, canvasDropUploading, hoveredConnectTarget,
            renderConnections, renderTempConnection,
            handleCanvasMouseDown, handleMouseMove, handleMouseUp, handleWheel,
            handleCanvasDragEnter, handleCanvasDragOver, handleCanvasDragLeave, handleCanvasDrop,
            getCursor, handleNodeMouseDown,
            isDraggingNodeIdsRef,
            panViewportLayerRef, panGridFineRef, panGridCoarseRef,
          }}
          nodeRuntime={{
            updateNodeData, apiFetch,
            imageModelOptions, videoModelOptions, resolveModelParamsForId, personaMentionOptions,
            connectedInputsByNodeId, deleteNode, pushHistory, startConnection,
            handleConnectionTargetHover, handleConnectionTargetLeave,
            setPreviewImage, createConnectedVideoNode, executeFlow, checkNodeReady,
            setActiveArtifact, activeArtifact, createConnectedImg2ImgBranch,
            runCompactRmbg, runCompactRemoveWatermark, runCompactThreeView, runCompactVideoUpscale,
            runVideoRmbg, runVideoLineart, runVideoSplit, createPromptQuickChain,
            cancelNodeGeneration, pendingUploadNodeId, setPendingUploadNodeId,
            handleNodeElementChange, setRunToast,
          }}
          runBarProps={{
            onSave: saveCurrentCanvasAsWork,
            onSaveNew: saveCurrentCanvasAsNewWork,
            onShowAssets: () => setShowAssetLibrary(true),
            onArrange: arrangeCanvasNodes,
            zoomCanvas,
          }}
          composerProps={{
            availableImageModels: imageModelOptions,
            onAddToCanvas: handleAddToCanvas,
            onCanvasAction: handleCanvasAction,
            onCanvasPlanStart: handleCanvasPlanStart,
            getViewportCenter: getCanvasViewportCenterPoint,
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
          imageModelOptions={imageModelOptions}
          videoModelOptions={videoModelOptions}
          resolveModelParamsForId={resolveModelParamsForId}
          personaMentionOptions={personaMentionOptions}
        />
      </div>

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
