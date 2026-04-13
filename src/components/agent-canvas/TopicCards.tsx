import React from "react";

export default function TopicCards({ topics = [], selectedAngle = "", onSelectAngle = null }) {
  if (!topics.length) {
    return <div className="text-xs text-slate-500">暂无内容</div>;
  }

  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
      {topics.map((topic, idx) => (
        <article
          key={`${topic?.angle || "topic"}-${idx}`}
          className={`w-full px-2.5 py-2.5 text-left ${
            selectedAngle && selectedAngle === topic?.angle ? "bg-cyan-50/70" : ""
          } ${
            idx > 0 ? "border-t border-slate-200" : ""
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="text-[11px] tracking-[0.12em] text-slate-500">
              {topic?.angle || "主题"} / {idx + 1}
            </div>
            {onSelectAngle ? (
              <button
                type="button"
                onClick={() => onSelectAngle(topic?.angle || "")}
                className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                  selectedAngle === topic?.angle
                    ? "border-cyan-300 bg-cyan-50 text-cyan-700"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
                }`}
              >
                {selectedAngle === topic?.angle ? "已设为主打" : "设为主打"}
              </button>
            ) : null}
          </div>
          <div className="mt-1 text-sm font-medium text-slate-800 text-left">
            标题：{topic?.title || "-"}
          </div>
          <div className="mt-1 text-xs text-slate-400 text-left">
            开头：{topic?.hook || "-"}
          </div>
          <div className="mt-2 whitespace-pre-wrap break-words text-xs leading-6 text-slate-700 text-left">
            正文：{topic?.script_60s || "-"}
          </div>
        </article>
      ))}
    </div>
  );
}
