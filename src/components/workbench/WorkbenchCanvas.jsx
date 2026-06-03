import React from "react";
import { Loader2, ChevronDown, ChevronUp, Minus } from "lucide-react";
import { MEDIA_UPLOAD_NODE_EMPTY_HEIGHT } from "../../constants/workbench.jsx";

// GRID_SIZE is defined in Workbench.jsx module scope, not exported from constants
const GRID_SIZE = 20;
import NodeComponent from "./NodeComponent";
import WorkbenchRunBar from "./WorkbenchRunBar.jsx";
import WorkbenchAgentComposer from "./WorkbenchAgentComposer.jsx";
import AgentResultCardContent from "./AgentResultCardContent";

/**
 * WorkbenchCanvas
 *
 * Renders the main canvas area of the workbench: grid background, drop overlays,
 * empty-state hint, WorkbenchRunBar, the viewport-transformed layer (SVG connections,
 * upload placeholder, nodes, selection box, agent result cards), and the agent composer.
 *
 * All props are passed from Workbench.jsx — nothing is read from stores internally so
 * that Workbench remains the single source of truth for state.
 */
export default function WorkbenchCanvas({
  // --- ref ---
  canvasRef,
  canvasHoverClientRef,

  // --- viewport / canvas state ---
  viewport,
  nodes,
  connections,
  selectedNodeIds,
  selectedConnectionIds,

  // --- interaction state (from useCanvas) ---
  connectingSource,
  selectionBox,
  canvasDropActive,
  canvasDropUploading,
  hoveredConnectionId,
  hoveredConnectTarget,
  mousePos,
  nodeElementMapRef,

  // --- run state ---
  isRunning,

  // --- agent result cards state ---
  hasAgentResultCards,
  agentResultCards,
  agentTurns,
  selectedAgentCardIds,
  activeAgentCardId,
  setSelectedAgentCardIds,
  setActiveAgentCardId,
  handleAgentCardMouseDown,
  toggleAgentResultCardCollapsed,
  minimizeAgentResultCard,
  handleAgentCardWheelCapture,
  retryAgentTurn,

  // --- canvas event handlers (from useCanvas) ---
  handleCanvasMouseDown,
  handleMouseMove,
  handleMouseUp,
  handleWheel,
  handleCanvasDragEnter,
  handleCanvasDragOver,
  handleCanvasDragLeave,
  handleCanvasDrop,
  getCursor,
  screenToCanvas,
  setHoveredConnectionId,
  handleConnectionClick,
  deleteConnectionById,
  handleNodeMouseDown,

  // --- render helpers (close over canvas state in Workbench) ---
  renderConnections,
  renderTempConnection,

  // --- NodeComponent props ---
  updateNodeData,
  apiFetch,
  openPromptPolishPicker,
  imageModelOptions,
  videoModelOptions,
  resolveModelParamsForId,
  personaMentionOptions,
  connectedInputsByNodeId,
  deleteNode,
  pushHistory,
  startConnection,
  handleConnectionTargetHover,
  handleConnectionTargetLeave,
  setPreviewImage,
  createConnectedVideoNode,
  executeFlow,
  checkNodeReady,
  setActiveArtifact,
  activeArtifact,
  createConnectedImg2ImgBranch,
  runCompactRmbg,
  runCompactRemoveWatermark,
  runCompactThreeView,
  runCompactVideoUpscale,
  runVideoRmbg,
  runVideoLineart,
  runVideoSplit,
  createPromptQuickChain,
  cancelNodeGeneration,
  pendingUploadNodeId,
  setPendingUploadNodeId,
  handleNodeElementChange,
  openStoryboardAssetHoverCard,
  scheduleCloseStoryboardAssetHoverCard,
  openStoryboardShotHoverCard,
  runStoryboardInputFromFiles,
  setRunToast,

  // --- WorkbenchRunBar props (spread via runBarProps) ---
  runBarProps,

  // --- WorkbenchAgentComposer props (spread via composerProps) ---
  composerProps,
}) {
  return (
    <div
      ref={canvasRef}
      className="flex-1 relative overflow-hidden bg-[#fafaf6]"
      style={{ cursor: getCursor() }}
      onMouseDown={handleCanvasMouseDown}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => {
        canvasHoverClientRef.current = null;
      }}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      onDragEnter={handleCanvasDragEnter}
      onDragOver={handleCanvasDragOver}
      onDragLeave={handleCanvasDragLeave}
      onDrop={handleCanvasDrop}
    >
      {/* Grid layer 1 — fine grid */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          opacity: 0.05,
          backgroundImage:
            "linear-gradient(rgba(203,213,225,0.9) 1px, transparent 1px), linear-gradient(90deg, rgba(203,213,225,0.9) 1px, transparent 1px)",
          backgroundSize: `${GRID_SIZE * viewport.zoom}px ${GRID_SIZE * viewport.zoom}px`,
          backgroundPosition: `${viewport.x}px ${viewport.y}px`,
        }}
      />
      {/* Grid layer 2 — coarse grid */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          opacity: 0.08,
          backgroundImage:
            "linear-gradient(rgba(226,232,240,0.96) 1px, transparent 1px), linear-gradient(90deg, rgba(226,232,240,0.96) 1px, transparent 1px)",
          backgroundSize: `${GRID_SIZE * 4 * viewport.zoom}px ${GRID_SIZE * 4 * viewport.zoom}px`,
          backgroundPosition: `${viewport.x}px ${viewport.y}px`,
        }}
      />
      {/* Grid layer 3 — radial vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(255,255,255,0) 44%, rgba(241,245,249,0.22) 84%, rgba(226,232,240,0.42) 100%)",
        }}
      />

      {/* Drop-active overlay */}
      {canvasDropActive ? (
        <div className="pointer-events-none absolute inset-6 z-20 rounded-[32px] border border-cyan-500/40 bg-cyan-500/8 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.18)] backdrop-blur-[1px]" />
      ) : null}

      {/* Empty-state hint */}
      {nodes.length === 0 && !hasAgentResultCards ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className="flex items-center gap-4 text-[11px] tracking-[0.16em] text-slate-400/75">
            <div className="h-px w-14 bg-[linear-gradient(90deg,rgba(148,163,184,0),rgba(148,163,184,0.45),rgba(148,163,184,0))]" />
            <span>拖拽图片或视频到画布</span>
            <div className="h-px w-14 bg-[linear-gradient(90deg,rgba(148,163,184,0),rgba(148,163,184,0.45),rgba(148,163,184,0))]" />
          </div>
        </div>
      ) : null}

      {/* Controls — WorkbenchRunBar */}
      <WorkbenchRunBar {...runBarProps} />

      {/* Viewport transform layer */}
      <div
        className="absolute inset-0 origin-top-left"
        style={{
          transform: `translate(${viewport.x}px,${viewport.y}px) scale(${viewport.zoom})`,
        }}
      >
        {/* SVG connection lines */}
        <svg
          className="absolute inset-0 overflow-visible pointer-events-none"
          style={{ width: 1, height: 1 }}
        >
          {renderConnections()}
          {renderTempConnection()}
        </svg>

        {/* Drop-uploading placeholder node */}
        {canvasDropUploading ? (
          <div
            className="pointer-events-none absolute z-40 w-[280px] overflow-visible border border-cyan-300 bg-white shadow-none"
            style={{ left: canvasDropUploading.x, top: canvasDropUploading.y }}
          >
            <div className="absolute -top-5 left-0 select-none text-[11px] font-medium tracking-[0.08em] text-slate-500">
              图片/视频上传
            </div>
            <div
              className="relative flex min-h-[132px] flex-col items-center justify-center overflow-hidden px-4 py-8 text-center"
              style={{ minHeight: MEDIA_UPLOAD_NODE_EMPTY_HEIGHT }}
            >
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.16),transparent_48%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.92))]" />
              <div className="relative flex h-11 w-11 items-center justify-center border border-cyan-200 bg-cyan-50 text-cyan-700 shadow-[0_12px_26px_rgba(34,211,238,0.12)]">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
              <div className="relative mt-3 text-[13px] font-medium text-slate-800">文件上传中...</div>
              <div className="relative mt-1 text-[11px] leading-5 text-slate-500">
                正在导入 {canvasDropUploading.total} 个文件
                {canvasDropUploading.images ? ` · ${canvasDropUploading.images} 张图片` : ""}
                {canvasDropUploading.videos ? ` · ${canvasDropUploading.videos} 个视频` : ""}
              </div>
              <div className="relative mt-4 h-1.5 w-full overflow-hidden border border-slate-200 bg-slate-100">
                <div className="h-full w-full animate-pulse bg-[linear-gradient(90deg,rgba(34,211,238,0.18),rgba(34,211,238,0.82),rgba(59,130,246,0.72),rgba(34,211,238,0.18))]" />
              </div>
            </div>
          </div>
        ) : null}

        {/* Canvas nodes */}
        {[...nodes]
          .sort((a, b) =>
            a.type === "group_container" ? -1 : b.type === "group_container" ? 1 : 0
          )
          .map((n) => (
            <NodeComponent
              key={n.id}
              node={n}
              selected={selectedNodeIds.has(n.id)}
              onMouseDown={(e) => handleNodeMouseDown(e, n.id)}
              updateData={updateNodeData}
              apiFetch={apiFetch}
              onOpenPromptPolishPicker={openPromptPolishPicker}
              imageModelOptions={imageModelOptions}
              videoModelOptions={videoModelOptions}
              resolveModelParamsForId={resolveModelParamsForId}
              personaMentionOptions={personaMentionOptions}
              connectedInputNodes={connectedInputsByNodeId.get(n.id) || []}
              onDelete={() => deleteNode(n.id)}
              onConnectStart={(e) => {
                e.stopPropagation();
                pushHistory();
                startConnection(e, n.id);
              }}
              onConnectTargetHover={(toHandle) => {
                handleConnectionTargetHover(n.id, toHandle);
              }}
              onConnectTargetLeave={(toHandle) => {
                handleConnectionTargetLeave(n.id, toHandle);
              }}
              connecting={!!connectingSource}
              hoveredConnectTarget={hoveredConnectTarget}
              onPreview={setPreviewImage}
              onContinue={createConnectedVideoNode}
              onRetry={() => executeFlow(new Set([n.id]))}
              isReady={checkNodeReady(n, nodes, connections)}
              onSelectArtifact={setActiveArtifact}
              activeArtifact={activeArtifact}
              onIterateImg2Img={createConnectedImg2ImgBranch}
              onRunCompactRmbg={runCompactRmbg}
              onRunCompactRemoveWatermark={runCompactRemoveWatermark}
              onRunCompactThreeView={runCompactThreeView}
              onRunCompactVideoUpscale={runCompactVideoUpscale}
              onRunVideoRmbg={runVideoRmbg}
              onRunVideoLineart={runVideoLineart}
              onRunVideoSplit={runVideoSplit}
              onQuickCreateFromText={createPromptQuickChain}
              onRunNode={(nodeId) => executeFlow(new Set([nodeId]))}
              onCancelNode={() => cancelNodeGeneration(n.id)}
              shouldAutoOpenUploadPicker={pendingUploadNodeId === n.id}
              onAutoOpenUploadPickerHandled={(nodeId) => {
                setPendingUploadNodeId((prev) => (prev === nodeId ? "" : prev));
              }}
              onNodeElementChange={handleNodeElementChange}
              onStoryboardMentionHover={openStoryboardAssetHoverCard}
              onStoryboardMentionLeave={scheduleCloseStoryboardAssetHoverCard}
              onShotChipClick={openStoryboardShotHoverCard}
              onStoryboardScriptFiles={runStoryboardInputFromFiles}
              setRunToast={setRunToast}
            />
          ))}

        {/* Selection box overlay */}
        {selectionBox && (
          <div
            className="absolute border border-blue-500 bg-blue-500/20 pointer-events-none z-50"
            style={{
              left: Math.min(selectionBox.startX, selectionBox.curX),
              top: Math.min(selectionBox.startY, selectionBox.curY),
              width: Math.abs(selectionBox.curX - selectionBox.startX),
              height: Math.abs(selectionBox.curY - selectionBox.startY),
            }}
          />
        )}

        {/* Floating agent result cards */}
        {agentResultCards.map((card) => {
          const turn = agentTurns.find((item) => item.id === card.turnId);
          if (!turn || card.minimized) return null;
          return (
            <div
              key={card.id}
              data-agent-card-root="true"
              className={`absolute overflow-hidden rounded-xl border bg-white shadow-[0_18px_48px_rgba(15,23,42,0.1)] ${
                selectedAgentCardIds.has(card.id)
                  ? "border-cyan-400/70 ring-1 ring-cyan-400/45"
                  : activeAgentCardId === card.id
                  ? "border-violet-400/70 ring-1 ring-violet-400/50"
                  : "border-slate-200"
              }`}
              style={{
                left: card.x,
                top: card.y,
                width: card.w,
                zIndex: activeAgentCardId === card.id ? 85 : 70,
              }}
              onWheelCapture={handleAgentCardWheelCapture}
              onMouseDown={(e) => {
                e.stopPropagation();
                if (e.shiftKey || e.ctrlKey) {
                  setSelectedAgentCardIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(card.id)) next.delete(card.id);
                    else next.add(card.id);
                    return next;
                  });
                } else if (!selectedAgentCardIds.has(card.id)) {
                  setSelectedAgentCardIds(new Set([card.id]));
                }
                setActiveAgentCardId(card.id);
              }}
            >
              <div className="h-9 px-2.5 flex items-center gap-2 border-b border-slate-200 bg-slate-50">
                <div
                  className="flex-1 min-w-0 flex items-center justify-between cursor-move"
                  onMouseDown={(e) => handleAgentCardMouseDown(e, card.id)}
                >
                  <div className="text-[11px] font-semibold text-slate-700 truncate">
                    {turn?.intent === "DRAMA" ? "短剧" : "脚本"} ·{" "}
                    {turn?.extractedProduct || (turn?.intent === "DRAMA" ? "创作任务" : "未知")}
                  </div>
                </div>
                <button
                  type="button"
                  className="p-1 rounded hover:bg-slate-100 text-slate-500"
                  title={card.collapsed ? "展开" : "折叠"}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleAgentResultCardCollapsed(card.id);
                  }}
                >
                  {card.collapsed ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronUp className="w-3.5 h-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  className="p-1 rounded hover:bg-slate-100 text-slate-500"
                  title="最小化到对话流"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    minimizeAgentResultCard(card.id);
                  }}
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
              </div>
              {!card.collapsed && (
                <div
                  data-agent-card-scroll-body="true"
                  className="p-2.5 max-h-[62vh] overflow-y-auto custom-scrollbar"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <div className="mb-2 text-[11px] text-slate-500 whitespace-pre-wrap break-words">
                    任务：{turn?.userText || "-"}
                  </div>
                  <AgentResultCardContent turn={turn} onRetry={retryAgentTurn} />
                </div>
              )}
              {card.collapsed && (
                <div className="px-2.5 py-2 text-[11px] text-slate-400">
                  已折叠，点击上方按钮可展开。
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Agent composer — WorkbenchAgentComposer */}
      <WorkbenchAgentComposer {...composerProps} />
    </div>
  );
}
