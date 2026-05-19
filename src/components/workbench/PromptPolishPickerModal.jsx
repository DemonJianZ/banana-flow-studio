import React from "react";
import { X, Sparkles } from "lucide-react";

const PromptPolishPickerModal = ({ open, title, sourcePrompt, variants, onClose, onUse }) => {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[160] flex items-center justify-center bg-white/55 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_32px_96px_rgba(15,23,42,0.16)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <div className="text-sm font-semibold text-slate-800">{title || "AI 润色"}</div>
            <div className="mt-1 text-[11px] text-slate-500">保留原始画面结构，直接从 3 个候选版本里选一个替换。</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-200 p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label="关闭润色结果"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">原始提示词</div>
            <div className="mt-3 max-h-52 overflow-auto whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {sourcePrompt || "(空)"}
            </div>
          </div>

          <div className="max-h-[60vh] space-y-3 overflow-auto pr-1">
            {(variants || []).map((variant, index) => (
              <button
                key={`${variant?.label || "variant"}_${index}`}
                type="button"
                onClick={() => onUse?.(variant)}
                className="group w-full rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>{variant?.label || `版本${index + 1}`}</span>
                  </div>
                  <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-1 text-[10px] text-slate-600 transition group-hover:border-slate-300 group-hover:bg-white">
                    使用此版本
                  </span>
                </div>
                <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                  {variant?.text || ""}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PromptPolishPickerModal;
