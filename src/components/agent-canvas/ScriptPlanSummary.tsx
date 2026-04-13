import React from "react";

function SummaryItem({ label, value }) {
  if (!value) return null;
  return (
    <div className="space-y-1">
      <div className="text-[11px] tracking-[0.12em] text-slate-500">{label}</div>
      <div className="text-sm text-slate-700">{value}</div>
    </div>
  );
}

export default function ScriptPlanSummary({ brief = {} }) {
  const selectedAngleLabel = String(brief?.selectedAngle || "").trim();
  const hasContent = [
    brief?.product,
    brief?.audience,
    brief?.priceBand,
    brief?.conversionGoal,
    brief?.primaryPlatform,
    brief?.secondaryPlatform,
    selectedAngleLabel,
  ].some(Boolean);

  if (!hasContent) return null;

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-left shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
      <div className="text-[11px] tracking-[0.12em] text-slate-500">脚本设定摘要</div>
      <div className="grid gap-3 md:grid-cols-2">
        <SummaryItem label="产品" value={brief?.product} />
        <SummaryItem label="目标人群" value={brief?.audience} />
        <SummaryItem label="价格带" value={brief?.priceBand} />
        <SummaryItem label="转化目标" value={brief?.conversionGoal} />
        <SummaryItem label="主平台" value={brief?.primaryPlatform} />
        <SummaryItem label="次平台" value={brief?.secondaryPlatform} />
        <SummaryItem label="主打角度" value={selectedAngleLabel} />
      </div>
    </div>
  );
}
