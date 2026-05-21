import React, { useState } from "react";

export default function AssetGenConfirmCard({ data, onConfirm, onSkip, confirmed = false }) {
  const [loading, setLoading] = useState(null); // "confirm" | "skip" | null

  const characters = (data?.characters || []).filter((c) => c?.name);
  const scenes = (data?.scenes || []).filter((s) => s?.name);

  const handleConfirm = async () => {
    if (loading || confirmed) return;
    setLoading("confirm");
    try {
      await onConfirm?.();
    } finally {
      setLoading(null);
    }
  };

  const handleSkip = async () => {
    if (loading || confirmed) return;
    setLoading("skip");
    try {
      await onSkip?.();
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <p className="text-[12px] text-slate-700 leading-5">
          已确认剧本内容。是否要先在画布上生成角色与场景的参考设定图？这些图像可以在后续出图时作为角色一致性参考。
        </p>
      </div>

      <div className="px-4 py-2.5 space-y-2">
        {characters.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">角色 & 道具</div>
            <div className="flex flex-wrap gap-1.5">
              {characters.map((c, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[11px] text-blue-700"
                >
                  <span className="text-[9px] text-blue-400">{c.type === "prop" ? "道具" : "角色"}</span>
                  {c.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {scenes.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">场景</div>
            <div className="flex flex-wrap gap-1.5">
              {scenes.map((s, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-[11px] text-green-700"
                >
                  {s.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="px-4 py-2.5 border-t border-slate-100 flex items-center gap-2">
        {confirmed ? (
          <span className="text-[11px] text-slate-400">已处理</span>
        ) : (
          <>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!!loading}
              className="rounded-full bg-slate-900 px-4 py-1.5 text-[11px] font-medium text-white hover:bg-slate-700 transition-colors disabled:opacity-60"
            >
              {loading === "confirm" ? "创建中…" : "生成设定参考图"}
            </button>
            <button
              type="button"
              onClick={handleSkip}
              disabled={!!loading}
              className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-[11px] text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-60"
            >
              {loading === "skip" ? "处理中…" : "跳过，直接搭建出图工作流"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
