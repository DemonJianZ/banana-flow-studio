import React from "react";

const STATUS_MAP = {
  pending: { label: "待处理", className: "text-amber-700 bg-amber-50 border-amber-200" },
  saved: { label: "已保存", className: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  ignored: { label: "已忽略", className: "text-slate-600 bg-slate-100 border-slate-200" },
  regression_marked: { label: "已标记回归", className: "text-fuchsia-700 bg-fuchsia-50 border-fuchsia-200" },
  error: { label: "保存失败", className: "text-rose-700 bg-rose-50 border-rose-200" },
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
    <div className="rounded border border-cyan-200 bg-cyan-50 p-2 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] text-cyan-700">偏好建议 · {suggestion?.key || "-"}</div>
        <span className={`px-1.5 py-0.5 rounded border text-[10px] ${status.className}`}>{status.label}</span>
      </div>
      <div className="text-[11px] text-slate-700">建议值：{valueText(suggestion?.value)}</div>
      <div className="text-[10px] text-slate-500">{suggestion?.reason || ""}</div>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          disabled={disabled || suggestion?.status === "saved"}
          onClick={onConfirm}
          className={`px-2 py-1 rounded border text-[10px] ${
            disabled || suggestion?.status === "saved"
              ? "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed"
              : "bg-cyan-50 border-cyan-200 text-cyan-700 hover:bg-cyan-100"
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
              ? "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed"
              : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
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
              ? "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed"
              : "bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100"
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
                ? "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed"
                : "bg-fuchsia-50 border-fuchsia-200 text-fuchsia-700 hover:bg-fuchsia-100"
            }`}
          >
            标记为回归用例
          </button>
        )}
      </div>
    </div>
  );
}
