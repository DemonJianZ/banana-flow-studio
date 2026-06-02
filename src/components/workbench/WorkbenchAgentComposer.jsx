/**
 * WorkbenchAgentComposer — 画布底部 Agent 输入组合器
 * 从 Workbench.jsx 抽出（Phase 4）:
 *   • JSX lines 8332–8735（含 agentComposerRef div 及其内部所有内容）
 *   • 模块级常量随之迁移：AGENT_CANVAS_EXAMPLES / CANVAS_PROMPT_EXAMPLES /
 *     AGENT_COMPOSER_FILE_ACCEPT / HITL_FEEDBACK_UI_ENABLED /
 *     getRouteIntentLabel / getFeedbackStatusLabel
 */
import React from "react";
import {
  X, Plus, Loader2, ChevronUp, FolderOpen,
  Sparkles, Layout,
} from "lucide-react";
import PersonaMentionTextarea from "./PersonaMentionTextarea";

// ─── 模块级常量（原 Workbench.jsx 顶部定义）────────────────────────────────────

const AGENT_COMPOSER_FILE_ACCEPT =
  "image/*,.csv,.tsv,.txt,.md,.markdown,.docx,.doc,text/plain,text/csv,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword";

const AGENT_CANVAS_EXAMPLES = [
  "帮我搭一个文生图接图生视频流程",
  "帮我搭一个上传图片后去背景再输出",
  "帮我搭一个本地文生图流程",
  "帮我搭一个上传商品图后做多角度镜头",
  "帮我搭一个上传图片后做特征提取再输出",
];

const CANVAS_PROMPT_EXAMPLES = [
  "一瓶极简风洗面奶产品图，白底，棚拍光，高清细节。",
  "保留主体构图，改成奶油质感电商海报，浅色背景，柔和打光。",
];

const isFlagEnabled = (...values) =>
  values.some((v) => ["1", "true", "yes", "on"].includes(String(v || "0").trim().toLowerCase()));

const HITL_FEEDBACK_UI_ENABLED = isFlagEnabled(
  import.meta.env.VITE_ENABLE_HITL_FEEDBACK,
  import.meta.env.VITE_BANANAFLOW_ENABLE_HITL_FEEDBACK,
);

const getRouteIntentLabel = (intent) => {
  const m = { SCRIPT: "脚本", DRAMA: "短剧", CANVAS: "画布", CHITCHAT: "闲聊", UNKNOWN: "未知" };
  return m[intent] || String(intent || "未知");
};

const getFeedbackStatusLabel = (status) => {
  const m = { pending: "待处理", ignored: "已忽略", accepted: "已采纳", resolved: "已解决", rejected: "已拒绝", done: "完成", error: "失败" };
  return m[status] || String(status || "-");
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function WorkbenchAgentComposer({
  // ── refs ──────────────────────────────────────────────────────────────────
  agentComposerRef,
  agentInputRef,
  agentUploadInputRef,

  // ── state from useAgentChat() ──────────────────────────────────────────────
  agentInput, setAgentInput,
  agentInputFocused, setAgentInputFocused,
  agentPromptPolishLoading,
  agentPromptPolishError, setAgentPromptPolishError,
  agentComposerFiles,
  activeComposerActionId,
  showCanvasExamples, setShowCanvasExamples,
  isAgentMissionRunning,
  isCanvasPromptPending,
  preferenceNotice, setPreferenceNotice,
  agentDevMode, setAgentDevMode,
  activePendingTask,

  // ── memos computed in Workbench.jsx ────────────────────────────────────────
  selectedStoryboardTarget,
  hitlFeedbackRows,
  devSuggestionLog,
  devRegressionLog,

  // ── other state ───────────────────────────────────────────────────────────
  personaMentionOptions,
  isAdminUser,
  setActiveArtifact,    // to clear storyboard selection

  // ── callbacks ─────────────────────────────────────────────────────────────
  sendAgentMission,
  polishAgentPromptInput,
  handleAgentComposerUpload,
  removeAgentComposerFile,
  handleAgentQuickAction,
  insertCanvasPromptExample,
  handleCanvasExamplePick,
  handleSuggestionEdit,
  openPreferencesPanelWithSuggestion,
}) {
  return (
    <div
      ref={agentComposerRef}
      className={`absolute left-1/2 -translate-x-1/2 bottom-10 z-40 pointer-events-auto transition-all duration-200 ${
        agentInputFocused || agentInput.trim()
          ? "w-[min(100%-2rem,860px)]"
          : "w-[min(100%-2rem,680px)]"
      }`}
      onMouseDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      {/* Canvas examples popup */}
      {showCanvasExamples ? (
        <div className="absolute bottom-[calc(100%+1rem)] left-1/2 z-30 w-[min(92vw,760px)] -translate-x-1/2">
          <div className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_64px_rgba(15,23,42,0.1)]">
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.84)_52%,rgba(255,255,255,0.72))]" />
            <div className="relative border-b border-slate-200 px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[15px] font-semibold text-slate-800">画布编排案例</div>
                  <div className="mt-1 text-[12px] leading-5 text-slate-500">
                    选择一条常用案例，直接填入 Agent 输入框继续生成画布。
                  </div>
                </div>
                <button type="button" onClick={() => setShowCanvasExamples(false)}
                  className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900" aria-label="关闭画布编排案例">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="relative grid gap-3 p-4 md:grid-cols-2">
              {AGENT_CANVAS_EXAMPLES.map((example, index) => (
                <button key={example} type="button" onClick={() => handleCanvasExamplePick(example)}
                  className="flex min-h-[84px] items-start gap-3 rounded-[22px] border border-slate-200 bg-white px-4 py-3 text-left transition-colors hover:border-slate-300 hover:bg-slate-50">
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-700">
                    {index + 1}
                  </span>
                  <span className="text-[13px] leading-6 text-slate-700 whitespace-normal break-words">{example}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {/* Main composer box */}
      <div
        className={`relative overflow-hidden border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.08)] transition-all duration-200 ${
          agentInputFocused || agentInput.trim() ? "rounded-[32px] px-5 py-5" : "rounded-[40px] px-4 py-3"
        }`}
      >
        <input ref={agentUploadInputRef} type="file" accept={AGENT_COMPOSER_FILE_ACCEPT} multiple className="hidden" onChange={handleAgentComposerUpload} />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.72)_54%,rgba(255,255,255,0.84))]" />

        {/* Canvas prompt pending hint */}
        {isCanvasPromptPending ? (
          <div className="relative mb-4 rounded-[22px] border border-cyan-200 bg-cyan-50 px-4 py-3 text-[12px] text-cyan-700">
            <div className="font-medium">当前在等你补充画面提示词</div>
            <div className="mt-1 text-cyan-600">直接在下方输入框补一句你想生成的画面，再按回车发送即可。</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {CANVAS_PROMPT_EXAMPLES.map((example) => (
                <button key={example} type="button" onClick={() => insertCanvasPromptExample(example)}
                  className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1.5 text-[11px] text-cyan-50 hover:bg-cyan-400/15">
                  {example}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* Storyboard target badge */}
        {selectedStoryboardTarget ? (
          <div className="relative mb-3 flex flex-wrap items-start gap-2 rounded-[18px] border border-cyan-200 bg-cyan-50 px-3.5 py-3 text-[12px] text-cyan-800">
            <span className="rounded-full border border-cyan-200 bg-white px-2.5 py-1 text-[10px] font-medium text-cyan-700">
              正在编辑 {selectedStoryboardTarget.typeLabel}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-medium text-slate-800 break-words">{selectedStoryboardTarget.label}</div>
              {selectedStoryboardTarget.summary ? (
                <div className="mt-1 text-[11px] leading-5 text-slate-600 break-words">{selectedStoryboardTarget.summary}</div>
              ) : null}
            </div>
            <button type="button"
              onClick={() => setActiveArtifact((current) => (current?.kind === "storyboard_selection" ? null : current))}
              className="rounded-full border border-cyan-200 bg-white px-2.5 py-1 text-[10px] text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900">
              清除选择
            </button>
          </div>
        ) : null}

        {/* Input row */}
        <div className="relative flex gap-4">
          <button type="button" title="上传参考图片或分镜脚本表"
            onClick={() => agentUploadInputRef.current?.click()}
            className={`mt-1 flex shrink-0 items-center justify-center rounded-[20px] border border-slate-200 bg-slate-50 text-slate-700 transition-all disabled:cursor-not-allowed disabled:opacity-90 ${
              agentInputFocused || agentInput.trim() ? "h-[84px] w-[68px] -rotate-6" : "h-8 w-8 -rotate-[8deg] rounded-[12px]"
            }`}>
            <Plus className={`${agentInputFocused || agentInput.trim() ? "h-5 w-5" : "h-4 w-4"}`} />
          </button>
          <div className={`relative min-w-0 flex-1 ${isCanvasPromptPending ? "pr-28" : "pr-14"}`}>
            <PersonaMentionTextarea
              ref={agentInputRef}
              value={agentInput}
              onChange={(e) => { setAgentPromptPolishError(""); setAgentInput(e.target.value); }}
              personas={personaMentionOptions}
              wrapperClassName="relative"
              overlayClassName={`text-[15px] leading-7 ${agentInputFocused || agentInput.trim() ? "min-h-[120px]" : "h-9 min-h-9 pt-[2px] text-[14px] leading-8"}`}
              onFocus={() => setAgentInputFocused(true)}
              onMouseDown={() => setAgentInputFocused(true)}
              rows={1}
              placeholder={
                isCanvasPromptPending
                  ? "请在这里补一句画面提示词，例如：一瓶极简风洗面奶产品图，白底，棚拍光，高清细节。"
                  : activeComposerActionId === "shot_workflow"
                  ? "粘贴剧本，或点击左侧 + 上传 txt/md/docx/csv 分镜脚本。"
                  : "输入需求，Agent 会先理解目标，再决定是直接回答、调用工具还是规划画布。"
              }
              className={`w-full resize-none overflow-y-auto bg-transparent text-[15px] leading-7 outline-none placeholder:text-slate-400 ${
                agentInputFocused || agentInput.trim() ? "min-h-[120px]" : "h-9 min-h-9 pt-[2px] text-[14px] leading-8"
              }`}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendAgentMission(); } }}
            />
            {isCanvasPromptPending && (
              <button type="button" onMouseDown={(e) => e.preventDefault()}
                onClick={polishAgentPromptInput}
                disabled={agentPromptPolishLoading || !agentInput.trim()}
                className={`absolute bottom-0 right-14 flex h-9 items-center justify-center gap-1.5 rounded-full border px-3 text-[10px] font-medium transition-all ${
                  agentPromptPolishLoading
                    ? "border-cyan-300 bg-cyan-50 text-cyan-700"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
                } ${agentInputFocused || agentInput.trim() ? "" : "bottom-0.5 h-8"}`}
                title="提示词润色">
                {agentPromptPolishLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                <span>AI润色</span>
              </button>
            )}
            <button type="button" onMouseDown={(e) => e.preventDefault()}
              onClick={sendAgentMission}
              disabled={(!agentInput.trim() && agentComposerFiles.length === 0) || isAgentMissionRunning}
              className={`absolute bottom-0 right-0 flex h-12 w-12 items-center justify-center rounded-full border transition-all ${
                ((!agentInput.trim() && agentComposerFiles.length === 0) || isAgentMissionRunning)
                  ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                  : "border-cyan-200 bg-cyan-50 text-cyan-700 shadow-[0_10px_24px_rgba(15,23,42,0.08)] hover:translate-y-[-1px] hover:bg-cyan-100"
              } ${agentInputFocused || agentInput.trim() ? "" : "h-9 w-9 bottom-0.5"}`}>
              {isAgentMissionRunning
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <ChevronUp className={`${agentInputFocused || agentInput.trim() ? "h-4 w-4" : "h-3.5 w-3.5"}`} />}
            </button>
          </div>
        </div>

        {/* Polish error */}
        {agentPromptPolishError && (
          <div className="mt-2 text-[10px] text-amber-400">{agentPromptPolishError}</div>
        )}

        {/* Attached files */}
        <div className={`relative flex flex-wrap gap-2 transition-all duration-200 ${agentComposerFiles.length > 0 ? "mt-3 max-h-24 opacity-100" : "max-h-0 overflow-hidden opacity-0"}`}>
          {agentComposerFiles.map((file) => (
            <div key={file.id} className="group flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-2 py-1.5">
              {file.kind === "image"
                ? <img src={file.previewUrl} alt={file.name} className="h-10 w-10 rounded-xl object-cover" />
                : <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500"><FolderOpen className="h-4 w-4" /></div>}
              <div className="max-w-32 truncate text-[11px] text-slate-600">{file.name}</div>
              <button type="button" onClick={() => removeAgentComposerFile(file.id)}
                className="rounded-full p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
                title={file.kind === "image" ? "移除图片" : "移除文件"}>
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        {/* Quick action chips */}
        <div className={`relative flex flex-wrap items-center gap-2 pr-16 transition-all duration-200 ${agentInputFocused || agentInput.trim() ? "mt-4 max-h-32 opacity-100" : "mt-0 max-h-0 overflow-hidden opacity-0"}`}>
          <button type="button" onClick={() => handleAgentQuickAction("shot_workflow")}
            className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[12px] transition-all ${
              activeComposerActionId === "shot_workflow"
                ? "border-cyan-200 bg-cyan-50 text-cyan-700 shadow-[0_8px_20px_rgba(15,23,42,0.06)]"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}>
            <Sparkles className="h-3.5 w-3.5" />剧本工作流
          </button>
          <button type="button" onClick={() => handleAgentQuickAction("canvas")}
            className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[12px] transition-all ${
              activeComposerActionId === "canvas" || showCanvasExamples
                ? "border-cyan-200 bg-cyan-50 text-cyan-700 shadow-[0_8px_20px_rgba(15,23,42,0.06)]"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}>
            <Layout className="h-3.5 w-3.5" />画布编排
          </button>
          {isAdminUser ? (
            <label className="ml-auto inline-flex cursor-pointer select-none items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-[12px] text-slate-600">
              <input type="checkbox" checked={agentDevMode} onChange={(e) => setAgentDevMode(e.target.checked)} className="h-3.5 w-3.5 accent-slate-300" />
              开发模式
            </label>
          ) : null}
        </div>

        {/* Hint text */}
        <div className={`text-[11px] text-slate-500 transition-all duration-200 ${agentInputFocused || agentInput.trim() ? "mt-3 max-h-8 opacity-100" : "max-h-0 overflow-hidden opacity-0"}`}>
          回车发送，Shift+回车换行
        </div>

        {/* Preference notice */}
        {preferenceNotice && (
          <div className="mt-2 rounded border border-yellow-200 bg-yellow-50 p-2 text-[10px] text-yellow-800 flex items-center justify-between gap-2">
            <div className="truncate">
              已更新偏好：{preferenceNotice.key}
              {preferenceNotice.value ? ` = ${Array.isArray(preferenceNotice.value) ? preferenceNotice.value.join("/") : String(preferenceNotice.value)}` : ""}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button type="button"
                onClick={() => { openPreferencesPanelWithSuggestion(preferenceNotice); setPreferenceNotice(null); }}
                className="px-1.5 py-0.5 rounded border border-yellow-200 hover:bg-yellow-100">
                快速查看
              </button>
              <button type="button" onClick={() => setPreferenceNotice(null)}
                className="text-yellow-700 hover:text-yellow-900" aria-label="关闭偏好通知">
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {/* HITL feedback history (admin only, when enabled) */}
        {HITL_FEEDBACK_UI_ENABLED && (
          <div className="mt-2 rounded border border-fuchsia-200 bg-fuchsia-50 p-2 text-[10px] space-y-1">
            <div className="text-fuchsia-700">反馈历史</div>
            {hitlFeedbackRows.length === 0
              ? <div className="text-slate-500">暂无反馈记录</div>
              : (
                <div className="space-y-1 max-h-24 overflow-y-auto custom-scrollbar">
                  {hitlFeedbackRows.map((row) => (
                    <div key={row.id} className="rounded border border-slate-200 bg-white px-1.5 py-1">
                      <div className="text-slate-700">
                        {row.message}{row.key ? ` · ${row.key}` : ""}{row.reason ? ` · ${row.reason}` : ""}
                      </div>
                      <div className="text-slate-500">
                        {new Date(Number(row.updatedAt || Date.now())).toLocaleString()}{row.caseId ? ` · 用例ID=${row.caseId}` : ""}
                      </div>
                      {row.kind === "suggestion" && row.status === "ignored" && (
                        <button type="button"
                          onClick={() => handleSuggestionEdit({ key: row.key, value: row.value })}
                          className="mt-1 px-1.5 py-0.5 rounded border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100">
                          快速编辑
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
          </div>
        )}

        {/* Dev suggestion/regression log (admin + devMode) */}
        {isAdminUser && agentDevMode && (
          <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-2 text-[10px] text-slate-500 space-y-1.5">
            <div className="text-slate-700">开发：记忆建议</div>
            <div>
              待处理任务：{" "}
              {activePendingTask
                ? `${getRouteIntentLabel(activePendingTask.intent)} 缺失=${(activePendingTask.missing || []).join(",") || "-"}`
                : "无"}
            </div>
            {devSuggestionLog.length === 0
              ? <div className="text-slate-400">暂无建议</div>
              : (
                <div className="space-y-1 max-h-24 overflow-y-auto custom-scrollbar">
                  {devSuggestionLog.map((row, idx) => (
                    <div key={`${row.turnId}_${row.key}_${idx}`} className="border border-slate-200 rounded px-1.5 py-1">
                      <div>[{getFeedbackStatusLabel(row.status)}] {row.key}</div>
                      <div className="text-slate-400">{Array.isArray(row.value) ? row.value.join("/") : String(row.value || "")}</div>
                    </div>
                  ))}
                </div>
              )}
            {HITL_FEEDBACK_UI_ENABLED && (
              <div className="pt-1 border-t border-slate-200 space-y-1">
                <div className="text-slate-700">开发：失败回归</div>
                {devRegressionLog.length === 0
                  ? <div className="text-slate-400">暂无回归反馈</div>
                  : (
                    <div className="space-y-1 max-h-24 overflow-y-auto custom-scrollbar">
                      {devRegressionLog.map((row, idx) => (
                        <div key={`${row.turnId}_${idx}`} className="border border-slate-200 rounded px-1.5 py-1">
                          <div>[{getFeedbackStatusLabel(row.status)}] 原因={row.reason || "-"}</div>
                          <div className="text-slate-400">用例ID={row.caseId || "-"} {row.error ? `错误=${row.error}` : ""}</div>
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
