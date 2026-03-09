import React from "react";
import { AlertCircle, Loader2, RotateCcw } from "lucide-react";
import TopicCards from "./TopicCards";
import StoryboardView from "./StoryboardView";
import AssetMatchView from "./AssetMatchView";
import EditPlanView from "./EditPlanView";
import ExportPanel from "./ExportPanel";

const WARNING_KEYS = [
  { key: "inference_warning", label: "Inference" },
  { key: "compliance_warning", label: "Compliance" },
  { key: "edit_plan_warning", label: "EditPlan" },
  { key: "budget_exhausted", label: "Budget" },
];

export default function CanvasBlock({
  turn,
  steps = [],
  onRetry,
  onSelectPrimary,
  onExport,
  onCopyPath,
}) {
  const response = turn?.response || null;
  const topics = response?.topics || [];
  const matchedAssets = response?.matched_assets || {};
  const plans = turn?.localEditPlans || response?.edit_plans || [];
  const exportMap = turn?.exports || {};

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <div className="max-w-3xl rounded-xl border border-violet-400/30 bg-violet-500/10 px-3 py-2 text-sm text-violet-100">
          {turn?.userText || ""}
        </div>
      </div>

      <div className="flex justify-start">
        <div className="w-full max-w-5xl rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-3">
          {turn?.status === "running" ? (
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 text-sm text-slate-200">
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
                        active ? "border-violet-500/40 bg-violet-500/10 text-violet-200" : "border-slate-800 bg-slate-950 text-slate-500"
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
            <div className="text-sm text-slate-200">{turn?.assistantText || "你想做哪个产品/品类？"}</div>
          ) : null}

          {turn?.status === "error" ? (
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 text-sm text-red-300">
                <AlertCircle className="w-4 h-4" />
                {turn?.error || "请求失败"}
              </div>
              <button
                type="button"
                onClick={() => onRetry?.(turn?.id)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-slate-700 text-xs text-slate-200 hover:bg-slate-800"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                重试
              </button>
            </div>
          ) : null}

          {turn?.status === "done" && response ? (
            <div className="space-y-3">
              <section className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                <div className="text-sm font-semibold text-slate-100 mb-2">Summary</div>
                <div className="text-xs text-slate-300 grid grid-cols-1 md:grid-cols-2 gap-1">
                  <div>product: {turn?.extractedProduct || response?.audience_context?.product || "-"}</div>
                  <div>persona: {response?.audience_context?.persona || "-"}</div>
                  <div>confidence: {response?.audience_context?.confidence ?? "-"}</div>
                  <div>unsafe_claim_risk: {response?.audience_context?.unsafe_claim_risk || "-"}</div>
                  <div>prompt_version: {response?.prompt_version || "-"}</div>
                  <div>policy_version: {response?.policy_version || "-"}</div>
                  <div className="md:col-span-2 break-all">config_hash: {response?.config_hash || "-"}</div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {WARNING_KEYS.map((item) => {
                    const active = !!response?.[item.key];
                    return (
                      <span
                        key={item.key}
                        className={`px-1.5 py-0.5 rounded border text-[11px] ${
                          active ? "bg-amber-500/15 border-amber-400/40 text-amber-200" : "bg-slate-800 border-slate-700 text-slate-400"
                        }`}
                      >
                        {item.label}: {active ? "true" : "false"}
                      </span>
                    );
                  })}
                </div>
              </section>

              <details className="rounded-lg border border-slate-800 bg-slate-950/60" open>
                <summary className="cursor-pointer px-3 py-2.5 text-sm text-slate-200">Topics</summary>
                <div className="px-3 pb-3">
                  <TopicCards topics={topics} />
                </div>
              </details>

              <details className="rounded-lg border border-slate-800 bg-slate-950/60">
                <summary className="cursor-pointer px-3 py-2.5 text-sm text-slate-200">Storyboard</summary>
                <div className="px-3 pb-3">
                  <StoryboardView topics={topics} />
                </div>
              </details>

              <details className="rounded-lg border border-slate-800 bg-slate-950/60">
                <summary className="cursor-pointer px-3 py-2.5 text-sm text-slate-200">Asset Match</summary>
                <div className="px-3 pb-3">
                  <AssetMatchView topics={topics} matchedAssets={matchedAssets} onSelectPrimary={(shotId, candidate) => onSelectPrimary?.(turn?.id, shotId, candidate)} />
                </div>
              </details>

              <details className="rounded-lg border border-slate-800 bg-slate-950/60">
                <summary className="cursor-pointer px-3 py-2.5 text-sm text-slate-200">EditPlan</summary>
                <div className="px-3 pb-3">
                  <EditPlanView plans={plans} />
                </div>
              </details>

              <details className="rounded-lg border border-slate-800 bg-slate-950/60">
                <summary className="cursor-pointer px-3 py-2.5 text-sm text-slate-200">Export</summary>
                <div className="px-3 pb-3">
                  <ExportPanel
                    plans={plans}
                    exportMap={exportMap}
                    onExport={(plan) => onExport?.(turn?.id, plan)}
                    onCopyPath={onCopyPath}
                  />
                </div>
              </details>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
