import React from "react";

function renderReq(req) {
  if (!req) return "-";
  if (typeof req === "string") return req;
  return [req.type, req.must_have, req.avoid].filter(Boolean).join(" | ");
}

export default function StoryboardView({ topics = [] }) {
  if (!topics.length) {
    return <div className="text-xs text-slate-500">暂无 storyboard 数据</div>;
  }

  return (
    <div className="space-y-3">
      {topics.map((topic, idx) => {
        const shots = topic?.shots || [];
        return (
          <details key={`${topic?.angle || "topic"}-${idx}`} className="rounded-lg border border-slate-800 bg-slate-950/60" open={idx === 0}>
            <summary className="cursor-pointer px-3 py-2.5 text-sm text-slate-200 flex items-center justify-between">
              <span>
                {topic?.angle || "topic"} / {topic?.title || `Topic ${idx + 1}`}
              </span>
              <span className="text-xs text-slate-500">{shots.length} shots</span>
            </summary>
            <div className="px-3 pb-3 space-y-2">
              {shots.map((shot, shotIdx) => (
                <div key={shot?.shot_id || `${idx}-${shotIdx}`} className="rounded-md border border-slate-800 bg-slate-900/60 p-2.5 text-xs text-slate-300">
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mb-1">
                    <span className="text-slate-400">#{shot?.shot_id || "-"}</span>
                    <span>segment: {shot?.segment || "-"}</span>
                    <span>duration: {shot?.duration_sec || 0}s</span>
                    <span>camera: {shot?.camera || "-"}</span>
                  </div>
                  <div className="mb-1">scene: {shot?.scene || "-"}</div>
                  <div className="mb-1">action: {shot?.action || "-"}</div>
                  {shot?.overlay_text ? <div className="mb-1">overlay: {shot.overlay_text}</div> : null}
                  <div className="mb-1">
                    keyword_tags: {(shot?.keyword_tags || []).length ? (shot.keyword_tags || []).join(", ") : "-"}
                  </div>
                  <div>
                    asset_requirements:
                    <ul className="mt-1 space-y-1">
                      {(shot?.asset_requirements || []).length ? (
                        (shot.asset_requirements || []).map((req, reqIdx) => (
                          <li key={reqIdx} className="text-slate-400">
                            - {renderReq(req)}
                          </li>
                        ))
                      ) : (
                        <li className="text-slate-500">- 无</li>
                      )}
                    </ul>
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
