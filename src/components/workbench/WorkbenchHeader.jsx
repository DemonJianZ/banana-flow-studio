/**
 * WorkbenchHeader.jsx
 *
 * Extracted from Workbench.jsx (lines 2259-2694).
 * Renders the top <header> bar including:
 *  - "Yu Canvas" branding
 *  - API status badge (admin + devMode only)
 *  - Agent history / conversation-flow dropdown panel
 */

import React from "react";
import {
  Server,
  History,
  ChevronRight,
  GripVertical,
  Plus,
  Trash2,
  Loader2,
} from "lucide-react";

import PreferenceSuggestionCard from "../agent-canvas/PreferenceSuggestionCard";
import DramaMarkdownBlock from "./DramaMarkdownBlock";
import ShotAnnotatedScriptBlock from "./ShotAnnotatedScriptBlock";
import ScriptExtractionCard from "./ScriptExtractionCard";
import AssetGenConfirmCard from "./AssetGenConfirmCard";
import AgentResultCardContent from "./AgentResultCardContent";

import { HITL_FEEDBACK_UI_ENABLED } from "../../lib/agentHelpers.js";
import { AGENT_SHOT_WORKFLOW_QUICK_PROMPT } from "../../lib/agentHelpers.js";
import { getDecisionLabel } from "../../lib/workbenchHelpers.js";
import { HITL_FEEDBACK_REASON_OPTIONS } from "../../hooks/useAgentChat";
import { getAgentTurnStepLabel } from "../../constants/workbench.jsx";

/**
 * Quick-action definitions.  Must stay in sync with useAgentMission.handleAgentQuickAction.
 * The list of action ids and their labels (shown as pill buttons inside turn bubbles).
 */
const AGENT_QUICK_ACTIONS = [
  { id: "shot_workflow", label: "搭建分镜工作流" },
  { id: "canvas", label: "打开画布示例" },
  { id: "cancel_pending", label: "取消" },
];

/**
 * WorkbenchHeader
 *
 * Props
 * ─────
 * Layout / panel
 *   agentHistoryCollapsed          boolean
 *   toggleAgentHistoryPanel        () => void
 *   rightPanelContainerStyle       React.CSSProperties
 *   handleRightPanelResizeStart    (e: MouseEvent) => void
 *
 * Session data
 *   agentSessions                  Session[]
 *   activeAgentSession             Session | null
 *   agentTurns                     Turn[]
 *   activePendingTask              any
 *   isAgentMissionRunning          boolean
 *   hasActiveAgentConversation     boolean
 *   minimizedAgentCards            MinimizedCard[]
 *   agentResultCards               ResultCard[]
 *   selectedAgentCardIds           Set<string>
 *   activeAgentCardId              string | null
 *
 * Session callbacks
 *   setActiveAgentSession          (id: string) => void
 *   createAgentSession             () => void
 *   clearActiveAgentConversation   () => void
 *   focusAgentResultCard           (turnId: string) => void
 *   toggleAgentResultCardCollapsed (cardId: string) => void
 *   minimizeAgentResultCard        (cardId: string) => void
 *   handleAgentCardWheelCapture    (e: WheelEvent) => void
 *   updateAgentTurn                (id: string, patch: object) => void
 *
 * Refs
 *   agentConversationBottomRef     React.Ref
 *
 * Dev / admin
 *   agentDevMode                   boolean
 *   isAdminUser                    boolean
 *   apiStatus                      "online" | "offline" | string
 *   setShowHistoryPanel            (show: boolean) => void
 *
 * Turn-level callbacks
 *   retryAgentTurn                 (turnId: string) => void
 *   handleTurnMarkRegression       (turn: Turn) => void
 *
 * Suggestion callbacks
 *   handleSuggestionConfirm        (turnId, suggestion) => void
 *   handleSuggestionIgnore         (turnId, suggestion) => void
 *   handleSuggestionEdit           (suggestion) => void
 *   handleSuggestionMarkRegression (turnId, suggestion) => void
 *
 * Saving state (passed from useAgentChat)
 *   savingSuggestionId             string | null
 *   savingFeedbackTargetId         string | null
 *
 * Workflow action callbacks
 *   confirmScriptExtraction        (data: any) => void
 *   buildAssetCanvas               (data: any) => void
 *   skipToShotWorkflow             (data: any) => void
 *   buildDirectVideoCanvas         (data: any) => void
 *
 * HITL / dev
 *   hitlFeedbackRows               any[]
 *   devSuggestionLog               any[]
 *   devRegressionLog               any[]
 *
 * Agent composer helpers
 *   sendAgentMissionFromText       (text: string) => void
 *   createText2ImgTemplate         () => void
 *   safeInvoke                     (fn: Function, ...args: any[]) => void
 *   handleAgentCardMouseDown       (e: MouseEvent, cardId: string) => void
 *   handleAgentQuickAction         (actionId: string) => void
 *   focusCanvasNode                (nodeId: string) => void
 */
export default function WorkbenchHeader({
  // Layout / panel
  agentHistoryCollapsed,
  toggleAgentHistoryPanel,
  rightPanelContainerStyle,
  handleRightPanelResizeStart,

  // Session data
  agentSessions,
  activeAgentSession,
  agentTurns,
  isAgentMissionRunning,
  hasActiveAgentConversation,
  minimizedAgentCards,
  agentResultCards,

  // Session callbacks
  setActiveAgentSession,
  createAgentSession,
  clearActiveAgentConversation,
  focusAgentResultCard,
  minimizeAgentResultCard,
  updateAgentTurn,

  // Refs
  agentConversationBottomRef,

  // Dev / admin
  agentDevMode,
  isAdminUser,
  apiStatus,

  // Turn-level callbacks
  retryAgentTurn,
  handleTurnMarkRegression,

  // Suggestion callbacks
  handleSuggestionConfirm,
  handleSuggestionIgnore,
  handleSuggestionEdit,
  handleSuggestionMarkRegression,

  // Saving state
  savingSuggestionId,
  savingFeedbackTargetId,

  // Workflow action callbacks
  confirmScriptExtraction,
  buildAssetCanvas,
  skipToShotWorkflow,
  buildDirectVideoCanvas,

  // HITL / dev

  // Agent composer helpers
  sendAgentMissionFromText,
  createText2ImgTemplate,
  safeInvoke,
  handleAgentQuickAction,
  focusCanvasNode,
}) {
  return (
    <header className="relative h-[68px] bg-[var(--bf-panel-strong)] border-b border-[var(--bf-border)] flex items-center justify-between px-4 z-50 select-none shadow-[var(--bf-shadow-md)] backdrop-blur-xl">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(255,255,255,0.72)_68%,rgba(255,255,255,0.38))]" />
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="flex flex-col min-w-0">
          <span className="truncate bg-[linear-gradient(135deg,#0f172a_0%,#334155_54%,#64748b_100%)] bg-clip-text text-[25px] font-normal leading-tight tracking-[0.10em] text-transparent [font-family:'STXingkai','Xingkai_SC','STKaiti','KaiTi','Georgia',serif]">
            Yu Canvas
          </span>
          <span className="text-[10px] font-normal text-slate-500 tracking-[0.18em] truncate">AI小禹无限画布</span>
        </div>
      </div>

      <div className="relative flex items-center gap-2">
        {isAdminUser && agentDevMode && (
          <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[10px] transition-colors ${
            apiStatus === "online"
              ? "text-emerald-200 border-emerald-500/20 bg-emerald-500/10"
              : "text-rose-200 border-rose-500/20 bg-rose-500/10"
          }`}>
            <Server className="w-3 h-3" /> {apiStatus === "online" ? "API Online" : "API Offline"}
          </div>
        )}

        <div className="relative">
          <button
            type="button"
            onClick={toggleAgentHistoryPanel}
            title={agentHistoryCollapsed ? "展开对话（Ctrl+Shift+E）" : "收起对话（Ctrl+Shift+E）"}
            aria-label={agentHistoryCollapsed ? "展开对话（Ctrl+Shift+E）" : "收起对话（Ctrl+Shift+E）"}
            className={`inline-flex h-10 items-center gap-2 rounded-[18px] border px-3.5 text-[11px] transition-colors ${
              agentHistoryCollapsed
                ? "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                : "border-cyan-200 bg-cyan-50 text-cyan-700 shadow-[0_12px_24px_rgba(15,23,42,0.08)]"
            }`}
          >
            <History className="w-3.5 h-3.5 text-slate-500" />
            <span className="font-medium">对话流</span>
            <ChevronRight
              className={`w-3.5 h-3.5 transition-transform duration-300 ${
                agentHistoryCollapsed ? "rotate-0" : "rotate-90"
              }`}
            />
          </button>

          {!agentHistoryCollapsed && (
            <div
              className="absolute right-0 top-full mt-3 z-[95] pointer-events-auto"
              style={rightPanelContainerStyle}
              onMouseDown={(e) => e.stopPropagation()}
              onWheel={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onMouseDown={handleRightPanelResizeStart}
                className="absolute -left-2 top-0 bottom-0 w-2 rounded-md cursor-col-resize text-slate-500 hover:text-cyan-600"
                title="拖拽调整对话栏宽度"
                aria-label="拖拽调整对话栏宽度"
              >
                <GripVertical className="w-3.5 h-3.5 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
              </button>
              <div
                className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white"
                style={{ boxShadow: "0 24px 60px rgba(15,23,42,0.12)" }}
              >
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,250,252,0.78)_42%,rgba(255,255,255,0.62))]" />
            <div className="relative flex h-[54px] shrink-0 items-center justify-between border-b border-slate-200 bg-white/70 px-4">
              <div className="inline-flex min-w-0 items-center gap-1.5 text-xs">
                <History className="w-3.5 h-3.5 text-slate-500" />
                <span className="font-medium truncate text-slate-700">对话流</span>
              </div>
              <div className="ml-auto flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={createAgentSession}
                  className="h-8 inline-flex items-center gap-1 px-2.5 rounded-full border border-slate-200 bg-white text-[11px] text-slate-700 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 transition-colors"
                  title="新建会话"
                >
                  <Plus className="w-3 h-3" />
                  新建
                </button>
                <button
                  type="button"
                  onClick={clearActiveAgentConversation}
                  disabled={!hasActiveAgentConversation || isAgentMissionRunning}
                  className={`h-8 inline-flex items-center gap-1 px-2.5 rounded-full border text-[11px] transition-colors ${
                    !hasActiveAgentConversation || isAgentMissionRunning
                      ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-700"
                  }`}
                  title="清除当前会话对话记录"
                >
                  <Trash2 className="w-3 h-3" />
                  清除
                </button>
                <button
                  type="button"
                  onClick={toggleAgentHistoryPanel}
                  title="收起对话（Ctrl+Shift+E）"
                  aria-label="收起对话（Ctrl+Shift+E）"
                  className="p-2 rounded-full border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 transition-colors"
                >
                  <ChevronRight className="w-3.5 h-3.5 rotate-90" />
                </button>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="relative shrink-0 border-b border-slate-200 bg-white/70 p-3">
                <select
                  value={activeAgentSession?.id || ""}
                  onChange={(e) => setActiveAgentSession(e.target.value)}
                  className="w-full rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-700 outline-none focus:border-slate-400"
                >
                  {agentSessions.map((session) => (
                    <option key={session.id} value={session.id}>
                      {session.title || "新会话"} ({(session.turns || []).length})
                    </option>
                  ))}
                </select>
              </div>
              {minimizedAgentCards.length > 0 && (
                <div className="relative shrink-0 space-y-2 border-b border-slate-200 bg-white/70 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">已最小化结果</div>
                  {minimizedAgentCards.map((card) => {
                    const turn = agentTurns.find((item) => item.id === card.turnId);
                    if (!turn) return null;
                    return (
                      <button
                        key={card.id}
                        type="button"
                        onClick={() => focusAgentResultCard(turn.id)}
                        className="w-full rounded-[16px] border border-slate-200 bg-white px-3 py-2 text-left text-[11px] text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
                      >
                        恢复 · {turn.extractedProduct || "结果"}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="relative min-h-0 flex-1 overflow-y-auto bg-[#fbfbf8] p-3 space-y-3 custom-scrollbar">
                {agentTurns.length === 0 && (
                  <div className="space-y-2 rounded-[20px] border border-slate-200 bg-white px-3 py-3">
                    <div className="text-[11px] text-slate-400">暂无对话，先试一个任务示例或快速打开模板。</div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => void sendAgentMissionFromText(AGENT_SHOT_WORKFLOW_QUICK_PROMPT)}
                        className="rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] text-slate-600 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 transition-colors"
                      >
                        发送剧本工作流示例
                      </button>
                      <button
                        type="button"
                        onClick={() => safeInvoke(createText2ImgTemplate, "打开文生图模板")}
                        className="rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] text-slate-600 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 transition-colors"
                      >
                        打开模板
                      </button>
                    </div>
                  </div>
                )}
                {agentTurns.map((turn) => {
                  const relatedCard = agentResultCards.find((item) => item.turnId === turn.id);
                  const quickActions = Array.isArray(turn.quickActions) ? turn.quickActions : [];
                  const memorySuggestions = Array.isArray(turn.memorySuggestions) ? turn.memorySuggestions : [];
                  const routeDebug = turn.routeDebug || null;
                  return (
                  <div key={turn.id} className="space-y-1.5">
                    {turn.userText ? (
                      <div className="flex justify-end">
                        <div className="max-w-[92%] space-y-1">
                          <div className="rounded-[20px] border border-cyan-400/20 bg-[linear-gradient(180deg,rgba(14,116,144,0.24),rgba(21,94,117,0.18))] px-3 py-2.5 text-[11px] text-slate-50 whitespace-pre-wrap break-words shadow-[0_10px_24px_rgba(8,145,178,0.12)]">
                            {turn.userText}
                          </div>
                          {isAdminUser && agentDevMode && routeDebug && (
                            <div className="rounded-[16px] border border-slate-300 bg-slate-100 px-2.5 py-1.5 text-[10px] text-slate-800">
                              后端决策={getDecisionLabel(routeDebug.backendAction)} | 产品={routeDebug.product || "-"} | 规则={routeDebug.backendRule || routeDebug.reason || "-"} | 能力={(routeDebug.backendCapabilities || []).join(", ") || "-"} | 后端调用={routeDebug.backendCalled ? "是" : "否"}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : null}
                    <div className="flex justify-start">
                      <div className="max-w-[92%] rounded-[22px] border border-slate-200 bg-white px-3 py-2.5 text-[11px] text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
                        {turn.status === "running" && (
                          <div className="inline-flex items-center gap-1.5 text-slate-500">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            {getAgentTurnStepLabel(turn)}
                          </div>
                        )}
                        {(turn.status === "assistant" || turn.status === "clarify") && (
                          <div className="space-y-1.5">
                            <div>{turn.assistantText || "你想做哪个产品/品类？"}</div>
                            {memorySuggestions.length > 0 && (
                              <div className="space-y-1.5">
                                {memorySuggestions.map((suggestion) => (
                                  <PreferenceSuggestionCard
                                    key={`${turn.id}_${suggestion.id}`}
                                    suggestion={suggestion}
                                    disabled={
                                      savingSuggestionId === suggestion.id ||
                                      savingFeedbackTargetId === `suggest_${suggestion.id}`
                                    }
                                    onConfirm={() => handleSuggestionConfirm(turn.id, suggestion)}
                                    onIgnore={() => handleSuggestionIgnore(turn.id, suggestion)}
                                    onEdit={() => handleSuggestionEdit(suggestion)}
                                    showRegressionAction={HITL_FEEDBACK_UI_ENABLED}
                                    regressionTooltip="将该建议对应会话加入回归评估集，帮助后续质量修复"
                                    onMarkRegression={() => handleSuggestionMarkRegression(turn.id, suggestion)}
                                  />
                                ))}
                              </div>
                            )}
                            {quickActions.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {quickActions.map((actionId) => {
                                  const action = AGENT_QUICK_ACTIONS.find((item) => item.id === actionId);
                                  if (!action) return null;
                                  return (
                                  <button
                                    key={`${turn.id}_${actionId}`}
                                    type="button"
                                    onClick={() => handleAgentQuickAction(actionId)}
                                      className="rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] text-slate-600 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 transition-colors"
                                    >
                                      {action.label}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                            {turn.showCancelPending && (
                              <button
                                type="button"
                                onClick={() => handleAgentQuickAction("cancel_pending")}
                                className="rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] text-slate-600 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 transition-colors"
                              >
                                取消
                              </button>
                            )}
                          </div>
                        )}
                        {turn.status === "error" && (
                          <div className="space-y-1.5">
                            <div className="text-rose-600">{turn.error || "请求失败"}</div>
                            <div className="flex flex-wrap gap-1.5">
                              <button
                                type="button"
                                onClick={() => retryAgentTurn(turn.id)}
                                className="rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] text-slate-600 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 transition-colors"
                              >
                                重试
                              </button>
                              {HITL_FEEDBACK_UI_ENABLED && (
                                <button
                                  type="button"
                                  onClick={() => handleTurnMarkRegression(turn)}
                                  disabled={savingFeedbackTargetId === `turn_${turn.id}`}
                                  title="将当前会话标记为回归用例，进入评估集用于后续改进"
                                  className={`rounded-full border px-2.5 py-1.5 text-[10px] ${
                                    savingFeedbackTargetId === `turn_${turn.id}`
                                      ? "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed"
                                      : "bg-fuchsia-50 border-fuchsia-200 text-fuchsia-700 hover:bg-fuchsia-100"
                                  }`}
                                >
                                  标记为回归用例
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                        {turn.status === "done" && (
                          <div className="space-y-1.5">
                            {turn?.intent === "STORYBOARD" ? (
                              <div className="space-y-2">
                                <div className="text-slate-600">{turn.assistantText || turn.response?.summary || "已生成故事板"}</div>
                                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] leading-6 text-slate-600">
                                  已将故事板节点加入当前画布，并写入当前会话记录。
                                </div>
                              </div>
                            ) : turn?.intent === "DRAMA" ? (
                              <div className="space-y-2">
                                <div className="text-slate-600">{turn.response?.summary || "短剧内容已生成"}</div>
                                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[11px] leading-6 max-h-52 overflow-y-auto">
                                  <DramaMarkdownBlock value={turn.response?.text || ""} className="space-y-1.5" />
                                </div>
                              </div>
                            ) : turn?.intent === "SCRIPT_EXTRACTION" ? (
                              <div className="space-y-2">
                                <div className="text-slate-600">{turn.assistantText || "已从剧本中提取分镜信息，请确认后继续。"}</div>
                                <ScriptExtractionCard
                                  data={turn.response}
                                  confirmed={Boolean(turn.extractionConfirmed)}
                                  superseded={Boolean(turn.superseded)}
                                  onConfirm={() => {
                                    updateAgentTurn(turn.id, { extractionConfirmed: true });
                                    confirmScriptExtraction(turn.response);
                                  }}
                                />
                              </div>
                            ) : turn?.intent === "ASSET_GEN_CONFIRM" ? (
                              <div className="space-y-2">
                                <div className="text-slate-600">{turn.assistantText || "是否要生成角色与场景参考设定图？"}</div>
                                <AssetGenConfirmCard
                                  data={turn.response}
                                  confirmed={Boolean(turn.assetGenConfirmed)}
                                  onConfirm={() => {
                                    updateAgentTurn(turn.id, { assetGenConfirmed: true });
                                    buildAssetCanvas(turn.response);
                                  }}
                                  onSkip={() => {
                                    updateAgentTurn(turn.id, { assetGenConfirmed: true });
                                    skipToShotWorkflow(turn.response);
                                  }}
                                />
                              </div>
                            ) : turn?.intent === "ASSET_CANVAS_BUILT" ? (
                              <div className="space-y-2">
                                <div className="text-slate-600">{turn.assistantText || turn.response?.summary || "已在画布上创建参考设定图组。"}</div>
                                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] text-slate-500">
                                  已创建 {turn.response?.char_count || 0} 个角色/道具组和 {turn.response?.scene_count || 0} 个场景组，点击运行即可生成参考图。
                                </div>
                                {Array.isArray(turn.response?.next_choices) && turn.response.next_choices.length > 0 && (
                                  <div className="space-y-1.5 pt-1">
                                    <div className="text-[11px] text-slate-500">接下来以哪种方式生成？</div>
                                    <div className="flex flex-wrap gap-2">
                                      {turn.response.next_choices.map((choice) => (
                                        <button
                                          key={choice.id}
                                          type="button"
                                          disabled={Boolean(turn.workflowChoiceSelected)}
                                          onClick={() => {
                                            updateAgentTurn(turn.id, { workflowChoiceSelected: choice.id });
                                            if (choice.id === "direct_video") {
                                              buildDirectVideoCanvas(turn.extractionData || turn.response);
                                            }
                                            // storyboard_first: TODO
                                          }}
                                          className={`rounded-full border px-3 py-1.5 text-[11px] transition-colors ${
                                            turn.workflowChoiceSelected === choice.id
                                              ? "border-blue-400 bg-blue-50 text-blue-700"
                                              : turn.workflowChoiceSelected
                                              ? "border-slate-200 bg-white text-slate-400 cursor-not-allowed opacity-50"
                                              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 cursor-pointer"
                                          }`}
                                        >
                                          {choice.label}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : turn?.intent === "VIDEO_CANVAS_BUILT" ? (
                              <div className="space-y-2">
                                <div className="text-slate-600">{turn.assistantText || turn.response?.summary || "已搭建图生视频工作流。"}</div>
                                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] text-slate-500">
                                  已为 {(turn.response?.shots || []).length} 个镜头搭建图生视频节点，点击运行即可生成视频。
                                </div>
                              </div>
                            ) : turn?.intent === "SHOT_WORKFLOW" ? (
                              <div className="space-y-2">
                                <div className="text-slate-600">{turn.assistantText || turn.response?.summary || "已搭建分镜出图工作流。"}</div>
                                {turn.response?.annotated_script ? (
                                  <ShotAnnotatedScriptBlock script={turn.response.annotated_script} />
                                ) : null}
                                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] text-slate-500">
                                  已为 {(turn.response?.shots || []).length} 个分镜搭建出图节点，资产已自动绑定。
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <div className="text-slate-600">{turn.assistantText || turn.response?.summary || "任务已处理。"}</div>
                              </div>
                            )}
                            <div className="flex gap-1.5">
                              {turn?.intent === "STORYBOARD" ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nodeId = Array.isArray(turn?.response?.storyboardNodeIds)
                                      ? turn.response.storyboardNodeIds.find(Boolean)
                                      : "";
                                    if (nodeId) focusCanvasNode(nodeId);
                                  }}
                                  className="rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] text-slate-600 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 transition-colors"
                                >
                                  定位故事板
                                </button>
                              ) : turn?.intent !== "SCRIPT_EXTRACTION" && turn?.intent !== "ASSET_GEN_CONFIRM" && turn?.intent !== "ASSET_CANVAS_BUILT" && turn?.intent !== "VIDEO_CANVAS_BUILT" && turn?.intent !== "SHOT_WORKFLOW" ? (
                                <button
                                  type="button"
                                  onClick={() => focusAgentResultCard(turn.id)}
                                  className="rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] text-slate-600 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 transition-colors"
                                >
                                  {relatedCard?.minimized ? "恢复结果卡片" : "定位结果卡片"}
                                </button>
                              ) : null}
                              {turn?.intent !== "STORYBOARD" && turn?.intent !== "SCRIPT_EXTRACTION" && turn?.intent !== "ASSET_GEN_CONFIRM" && turn?.intent !== "ASSET_CANVAS_BUILT" && turn?.intent !== "VIDEO_CANVAS_BUILT" && turn?.intent !== "SHOT_WORKFLOW" && relatedCard && !relatedCard.minimized && (
                                <button
                                  type="button"
                                  onClick={() => minimizeAgentResultCard(relatedCard.id)}
                                  className="rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] text-slate-600 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 transition-colors"
                                >
                                  最小化到对话流
                                </button>
                              )}
                              {HITL_FEEDBACK_UI_ENABLED && (
                                <button
                                  type="button"
                                  onClick={() => handleTurnMarkRegression(turn)}
                                  disabled={savingFeedbackTargetId === `turn_${turn.id}`}
                                  title="将当前会话标记为回归用例，进入评估集用于后续改进"
                                  className={`rounded-full border px-2.5 py-1.5 text-[10px] ${
                                    savingFeedbackTargetId === `turn_${turn.id}`
                                      ? "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed"
                                      : "bg-fuchsia-50 border-fuchsia-200 text-fuchsia-700 hover:bg-fuchsia-100"
                                  }`}
                                >
                                  标记为回归用例
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )})}
                <div ref={agentConversationBottomRef} />
              </div>
            </div>
          </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
