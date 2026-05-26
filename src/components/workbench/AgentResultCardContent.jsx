import React from "react";
import { Loader2, AlertCircle, RotateCcw } from "lucide-react";
import DramaMarkdownBlock from "./DramaMarkdownBlock";
import { getAgentTurnStepLabel } from "../../constants/workbench.jsx";

const AgentResultCardContent = ({ turn, onRetry }) => {
  const response = turn?.response || null;

  if (turn?.status === "running") {
    return (
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 text-xs text-slate-700">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Agent 执行中
        </div>
        <div className="text-[11px] text-slate-400">
          当前步骤：{getAgentTurnStepLabel(turn)}
        </div>
      </div>
    );
  }

  if (turn?.status === "error") {
    return (
      <div className="space-y-2">
        <div className="inline-flex items-center gap-1.5 text-xs text-rose-600">
          <AlertCircle className="w-3.5 h-3.5" />
          {turn?.error || "请求失败"}
        </div>
        <button
          type="button"
          onClick={() => onRetry?.(turn?.id)}
          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 text-[11px] text-slate-700 hover:bg-slate-100"
        >
          <RotateCcw className="w-3 h-3" />
          重试
        </button>
      </div>
    );
  }

  if (!response) {
    return <div className="text-xs text-slate-500">暂无结果</div>;
  }

  if (turn?.intent === "DRAMA") {
    return (
      <div className="space-y-2">
        {response?.summary ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-6">
            <DramaMarkdownBlock value={response.summary} className="space-y-1.5" />
          </div>
        ) : null}
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs leading-6">
          <DramaMarkdownBlock value={response?.text || ""} className="space-y-1.5" />
        </div>
      </div>
    );
  }

  const topics = Array.isArray(response?.topics) ? response.topics : [];
  return (
    <div className="space-y-2 text-xs text-slate-600">
      <div>{turn?.assistantText || response?.summary || "旧脚本结果已归档。"}</div>
      {topics.length ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-500">
          旧脚本主题：{topics.map((item) => item?.title || item?.angle).filter(Boolean).slice(0, 5).join(" / ")}
        </div>
      ) : null}
    </div>
  );
};

export default AgentResultCardContent;
