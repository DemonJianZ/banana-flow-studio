import React from "react";

const BADGE_STYLE = {
  persona: "bg-sky-500/15 border-sky-400/40 text-sky-200",
  scene: "bg-emerald-500/15 border-emerald-400/40 text-emerald-200",
  misconception: "bg-amber-500/15 border-amber-400/40 text-amber-200",
};

export default function TopicCards({ topics = [] }) {
  if (!topics.length) {
    return <div className="text-xs text-slate-500">暂无 topics</div>;
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
      {topics.map((topic, idx) => (
        <article key={`${topic?.angle || "topic"}-${idx}`} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <div className="flex items-center justify-between mb-2">
            <span
              className={`px-2 py-0.5 rounded border text-[11px] font-medium ${
                BADGE_STYLE[topic?.angle] || "bg-slate-800 border-slate-700 text-slate-300"
              }`}
            >
              {topic?.angle || "-"}
            </span>
            <span className="text-[11px] text-slate-500">Topic {idx + 1}</span>
          </div>
          <div className="text-sm font-semibold text-slate-100 mb-1">{topic?.title || "-"}</div>
          <div className="text-xs text-slate-300 mb-2">
            <span className="text-slate-500">Hook:</span> {topic?.hook || "-"}
          </div>
          <pre className="text-xs leading-5 whitespace-pre-wrap break-words bg-slate-900 border border-slate-800 rounded-md p-2.5 text-slate-200">
            {topic?.script_60s || "-"}
          </pre>
        </article>
      ))}
    </div>
  );
}
