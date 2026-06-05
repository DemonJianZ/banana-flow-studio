import React from "react";

export default function BackgroundProcessingOverlay({
  title = "正在抠图",
  description = "请稍候，正在智能识别主体与背景",
} = {}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[3] flex items-center justify-center bg-[rgba(15,23,42,0.22)] px-4 backdrop-blur-[4px]">
      <div className="w-full max-w-[280px] rounded-[16px] border border-white/70 bg-white/88 px-6 py-6 text-left shadow-[0_8px_30px_rgba(0,0,0,0.12)] backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="relative h-11 w-11 shrink-0">
            <div className="absolute -inset-1 rounded-full bg-[radial-gradient(circle,rgba(96,165,250,0.18),rgba(16,185,129,0.08),transparent_70%)] blur-md" />
            <div className="absolute inset-0 animate-[spin_1.15s_linear_infinite] rounded-full bg-[conic-gradient(from_220deg,rgba(59,130,246,0.08),rgba(59,130,246,0.92),rgba(16,185,129,0.82),rgba(59,130,246,0.08))]" />
            <div className="absolute inset-[4px] rounded-full bg-white/92" />
            <div className="absolute inset-[11px] rounded-full bg-[radial-gradient(circle_at_30%_30%,rgba(191,219,254,0.95),rgba(219,234,254,0.35))]" />
          </div>
          <div className="min-w-0">
            <div className="text-[15px] font-semibold text-slate-900">{title}</div>
            <div className="mt-1 text-[12px] leading-5 text-slate-500">{description}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
