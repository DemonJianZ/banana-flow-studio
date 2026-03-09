import React from "react";

const BUCKET_STYLE = {
  best_match: "bg-emerald-500/15 border-emerald-400/40 text-emerald-200",
  partial_match: "bg-amber-500/15 border-amber-400/40 text-amber-200",
  fallback: "bg-slate-700/60 border-slate-600 text-slate-300",
};

export default function AssetMatchView({ topics = [], matchedAssets = {}, onSelectPrimary }) {
  const topicList = topics || [];
  if (!topicList.length) {
    return <div className="text-xs text-slate-500">暂无素材匹配结果</div>;
  }

  return (
    <div className="space-y-3">
      {topicList.map((topic, idx) => (
        <details key={`${topic?.angle || "topic"}-${idx}`} className="rounded-lg border border-slate-800 bg-slate-950/60" open={idx === 0}>
          <summary className="cursor-pointer px-3 py-2.5 text-sm text-slate-200">
            {topic?.angle || "topic"} / {topic?.title || `Topic ${idx + 1}`}
          </summary>
          <div className="px-3 pb-3 space-y-2">
            {(topic?.shots || []).map((shot, shotIdx) => {
              const shotId = shot?.shot_id || `${idx}-${shotIdx}`;
              const candidates = matchedAssets?.[shotId] || [];
              return (
                <div key={shotId} className="rounded-md border border-slate-800 bg-slate-900/60 p-2.5">
                  <div className="text-xs text-slate-300 mb-2">
                    <span className="text-slate-500">#{shotId}</span> / {shot?.segment || "-"}
                  </div>
                  {!candidates.length ? (
                    <div className="text-xs text-slate-500">无候选素材</div>
                  ) : (
                    <div className="space-y-1.5">
                      {candidates.map((candidate, candIdx) => (
                        <div key={`${shotId}-${candidate?.asset_id || candIdx}`} className="rounded border border-slate-800 bg-slate-950/70 p-2 text-xs text-slate-300">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`px-1.5 py-0.5 rounded border text-[11px] ${
                                BUCKET_STYLE[candidate?.bucket] || BUCKET_STYLE.fallback
                              }`}
                            >
                              {candidate?.bucket || "fallback"}
                            </span>
                            <span className="text-slate-400">{candidate?.asset_id || "-"}</span>
                            <span>score: {candidate?.score ?? "-"}</span>
                            <button
                              type="button"
                              onClick={() => onSelectPrimary?.(shotId, candidate)}
                              className="ml-auto px-2 py-0.5 rounded border border-violet-500/50 text-violet-200 hover:bg-violet-500/20"
                            >
                              设为主素材
                            </button>
                          </div>
                          <div className="mt-1 text-slate-400 break-all">{candidate?.uri || "-"}</div>
                          <div className="mt-1 text-slate-500 break-words">{candidate?.reason || "-"}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      ))}
    </div>
  );
}
