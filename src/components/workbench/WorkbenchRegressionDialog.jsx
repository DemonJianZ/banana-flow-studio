/**
 * WorkbenchRegressionDialog — 回归用例标记弹窗
 * 从 Workbench.jsx 抽出（原 lines 9603–9667，Phase 3）
 * 仅管理员 + HITL_FEEDBACK_UI_ENABLED 时可见
 */
import React from "react";
import { X } from "lucide-react";

export default function WorkbenchRegressionDialog({
  show,             // HITL_FEEDBACK_UI_ENABLED && !!feedbackDialog
  dialog,           // feedbackDialog object
  reasonChoice,     // feedbackReasonChoice
  setReasonChoice,  // setFeedbackReasonChoice
  reasonNote,       // feedbackReasonNote
  setReasonNote,    // setFeedbackReasonNote
  saving,           // !!savingFeedbackTargetId
  onClose,          // closeRegressionFeedbackDialog
  onConfirm,        // confirmRegressionFeedbackDialog
  reasonOptions,    // HITL_FEEDBACK_REASON_OPTIONS
}) {
  if (!show || !dialog) return null;
  return (
    <div className="fixed inset-0 z-[130] bg-white/40 backdrop-blur-[1px] flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-[0_28px_64px_rgba(15,23,42,0.14)]">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-800">标记为回归用例</div>
            <div className="text-[11px] text-slate-400 mt-0.5">可补充失败原因，便于后续回归修复</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded border border-slate-200 text-slate-500 hover:bg-slate-100"
            aria-label="关闭回归反馈弹窗"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <label className="block text-[11px] text-slate-600 space-y-1">
            <span>选择失败原因</span>
            <select
              value={reasonChoice}
              onChange={(e) => setReasonChoice(e.target.value)}
              className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none"
            >
              {(reasonOptions || []).map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="block text-[11px] text-slate-600 space-y-1">
            <span>补充说明（可选）</span>
            <textarea
              rows={3}
              value={reasonNote}
              onChange={(e) => setReasonNote(e.target.value)}
              placeholder="例如：素材主镜头经常命中错误资产"
              className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none resize-y"
            />
          </label>
        </div>
        <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded border border-slate-200 text-xs text-slate-700 hover:bg-slate-100"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={saving}
            className="px-3 py-1.5 rounded border border-fuchsia-200 bg-fuchsia-50 text-xs text-fuchsia-700 hover:bg-fuchsia-100 disabled:opacity-50"
          >
            确认标记
          </button>
        </div>
      </div>
    </div>
  );
}
