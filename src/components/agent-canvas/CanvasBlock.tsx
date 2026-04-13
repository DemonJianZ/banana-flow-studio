import React from "react";
import { AlertCircle, Loader2, RotateCcw } from "lucide-react";
import TopicCards from "./TopicCards";

export default function CanvasBlock({
  turn,
  steps = [],
  onRetry,
}) {
  const response = turn?.response || null;
  const topics = response?.topics || [];

  return (
    <div className="space-y-2">
      <div className="flex justify-start">
        <div className="max-w-3xl rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-700 text-left">
          {turn?.userText || ""}
        </div>
      </div>

      <div className="flex justify-start">
        <div className="w-full max-w-5xl rounded-xl border border-slate-200 bg-white px-3 py-3 text-left shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
          {turn?.status === "running" ? (
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 text-sm text-slate-700">
                <Loader2 className="w-4 h-4 animate-spin" />
                Agent 正在处理任务...
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {steps.map((step, idx) => {
                  const active = idx <= (turn?.stepIndex || 0);
                  return (
                    <div
                      key={step}
                      className={`rounded border px-2 py-1.5 text-xs ${
                        active ? "border-violet-200 bg-violet-50 text-violet-700" : "border-slate-200 bg-white text-slate-500"
                      }`}
                    >
                      {step}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {turn?.status === "clarify" ? (
            <div className="text-sm text-slate-700">{turn?.assistantText || "你想做哪个产品/品类？"}</div>
          ) : null}

          {turn?.status === "error" ? (
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 text-sm text-rose-600">
                <AlertCircle className="w-4 h-4" />
                {turn?.error || "请求失败"}
              </div>
              <button
                type="button"
                onClick={() => onRetry?.(turn?.id)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-slate-200 text-xs text-slate-700 hover:bg-slate-100"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                重试
              </button>
            </div>
          ) : null}

          {turn?.status === "done" && response ? (
            <div className="space-y-2">
              <div className="text-[11px] tracking-[0.12em] text-slate-500 text-left">脚本主题</div>
              <TopicCards topics={topics} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
