import React from "react";
import { Clipboard } from "lucide-react";

export default function ExportPanel({ plans = [], exportMap = {}, onExport, onCopyPath }) {
  if (!plans.length) {
    return <div className="text-xs text-slate-500">暂无可导出的 EditPlan</div>;
  }

  return (
    <div className="space-y-3">
      {plans.map((plan, idx) => {
        const planId = plan?.plan_id || `plan-${idx}`;
        const state = exportMap?.[planId] || {};
        return (
          <div key={planId} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-sm text-slate-200">{planId}</span>
              <button
                type="button"
                disabled={!!state.loading}
                onClick={() => onExport?.(plan)}
                className={`px-2.5 py-1 rounded border text-xs ${
                  state.loading
                    ? "border-slate-700 text-slate-500 bg-slate-800 cursor-not-allowed"
                    : "border-violet-500/50 text-violet-200 hover:bg-violet-500/20"
                }`}
              >
                {state.loading ? "导出中..." : "导出 FFmpeg 渲染包"}
              </button>
            </div>
            {state.error ? <div className="text-xs text-red-300 mb-2">{state.error}</div> : null}
            {state.result ? (
              <div className="space-y-1.5 text-xs text-slate-300">
                <div className="break-all">bundle: {state.result?.bundle_dir || "-"}</div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="break-all">render.sh: {state.result?.render_script_path || "-"}</span>
                  {state.result?.render_script_path ? (
                    <button
                      type="button"
                      onClick={() => onCopyPath?.(state.result?.render_script_path)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-slate-700 hover:bg-slate-800 text-slate-300"
                    >
                      <Clipboard className="w-3 h-3" />
                      复制路径
                    </button>
                  ) : null}
                </div>
                <div>
                  files:
                  <ul className="mt-1 space-y-1 text-slate-400">
                    {(state.result?.files || []).map((file, fileIdx) => (
                      <li key={fileIdx} className="break-all">
                        - {file}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
