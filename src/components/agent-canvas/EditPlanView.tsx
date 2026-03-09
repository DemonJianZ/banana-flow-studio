import React from "react";

const BUCKET_STYLE = {
  best_match: "text-emerald-300",
  partial_match: "text-amber-300",
  fallback: "text-slate-300",
};

function renderPick(pick) {
  if (!pick) return <span className="text-slate-500">None</span>;
  return (
    <span className={BUCKET_STYLE[pick?.bucket] || BUCKET_STYLE.fallback}>
      {pick?.asset_id || "-"} ({pick?.bucket || "fallback"}, {pick?.score ?? "-"})
    </span>
  );
}

export default function EditPlanView({ plans = [] }) {
  if (!plans.length) {
    return <div className="text-xs text-slate-500">暂无 EditPlan</div>;
  }

  return (
    <div className="space-y-3">
      {plans.map((plan, planIdx) => {
        const track = (plan?.tracks || [])[0] || { clips: [] };
        const clips = track?.clips || [];
        return (
          <details key={plan?.plan_id || `plan-${planIdx}`} className="rounded-lg border border-slate-800 bg-slate-950/60" open={planIdx === 0}>
            <summary className="cursor-pointer px-3 py-2.5 text-sm text-slate-200 flex items-center justify-between">
              <span>
                {plan?.plan_id || `plan-${planIdx}`} / {plan?.angle || "-"}
              </span>
              <span className="text-xs text-slate-500">
                clips: {clips.length} / duration: {plan?.total_duration_sec || 0}s
              </span>
            </summary>
            <div className="px-3 pb-3 space-y-2">
              {clips.map((clip, clipIdx) => (
                <div key={clip?.clip_id || `${planIdx}-${clipIdx}`} className="rounded-md border border-slate-800 bg-slate-900/60 p-2.5 text-xs text-slate-300">
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mb-1">
                    <span className="text-slate-400">{clip?.clip_id || "-"}</span>
                    <span>shot: {clip?.shot_id || "-"}</span>
                    <span>segment: {clip?.segment || "-"}</span>
                    <span>duration: {clip?.duration_sec || 0}s</span>
                  </div>
                  <div className="mb-1">primary_asset: {renderPick(clip?.primary_asset)}</div>
                  <div>
                    alternates:
                    <span className="ml-1 text-slate-400">
                      {(clip?.alternates || []).length
                        ? (clip.alternates || [])
                            .map((item) => `${item?.asset_id || "-"}(${item?.bucket || "fallback"})`)
                            .join(", ")
                        : "None"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}
