import React from "react";

const STATUS_MAP = {
  pending: { label: "待处理", className: "text-amber-100 bg-amber-900/35 border-amber-700/60" },
  saved: { label: "已保存", className: "text-emerald-100 bg-emerald-900/35 border-emerald-700/60" },
  ignored: { label: "已忽略", className: "text-slate-200 bg-slate-800 border-slate-700" },
  regression_marked: { label: "已标记回归", className: "text-fuchsia-100 bg-fuchsia-900/35 border-fuchsia-700/60" },
  error: { label: "保存失败", className: "text-red-100 bg-red-900/35 border-red-700/60" },
};

const valueText = (value) => {
  if (Array.isArray(value)) return value.join(" / ");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value || "");
};

export default function PreferenceSuggestionCard({
  suggestion,
  disabled,
  onConfirm,
  onIgnore,
  onEdit,
  onMarkRegression,
  showRegressionAction = false,
  regressionTooltip = "将当前会话标记为回归用例，进入评估集用于后续改进",
}) {
  const status = STATUS_MAP[suggestion?.status] || STATUS_MAP.pending;
  return (
    <div className="rounded border border-cyan-700/50 bg-cyan-900/10 p-2 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] text-cyan-100">偏好建议 · {suggestion?.key || "-"}</div>
        <span className={`px-1.5 py-0.5 rounded border text-[10px] ${status.className}`}>{status.label}</span>
      </div>
      <div className="text-[11px] text-slate-200">建议值：{valueText(suggestion?.value)}</div>
      <div className="text-[10px] text-slate-400">{suggestion?.reason || ""}</div>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          disabled={disabled || suggestion?.status === "saved"}
          onClick={onConfirm}
          className={`px-2 py-1 rounded border text-[10px] ${
            disabled || suggestion?.status === "saved"
              ? "bg-slate-800 border-slate-700 text-slate-500 cursor-not-allowed"
              : "bg-cyan-600/20 border-cyan-500/60 text-cyan-100 hover:bg-cyan-600/30"
          }`}
        >
          确认保存
        </button>
        <button
          type="button"
          disabled={disabled || suggestion?.status === "ignored"}
          onClick={onIgnore}
          className={`px-2 py-1 rounded border text-[10px] ${
            disabled || suggestion?.status === "ignored"
              ? "bg-slate-800 border-slate-700 text-slate-500 cursor-not-allowed"
              : "bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800"
          }`}
        >
          忽略
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onEdit}
          className={`px-2 py-1 rounded border text-[10px] ${
            disabled
              ? "bg-slate-800 border-slate-700 text-slate-500 cursor-not-allowed"
              : "bg-indigo-600/20 border-indigo-500/60 text-indigo-100 hover:bg-indigo-600/30"
          }`}
        >
          {suggestion?.status === "ignored" ? "重新编辑" : "编辑后保存"}
        </button>
        {showRegressionAction && (
          <button
            type="button"
            disabled={disabled}
            onClick={onMarkRegression}
            title={regressionTooltip}
            className={`px-2 py-1 rounded border text-[10px] ${
              disabled
                ? "bg-slate-800 border-slate-700 text-slate-500 cursor-not-allowed"
                : "bg-fuchsia-600/20 border-fuchsia-500/60 text-fuchsia-100 hover:bg-fuchsia-600/30"
            }`}
          >
            标记为回归用例
          </button>
        )}
      </div>
    </div>
  );
}
