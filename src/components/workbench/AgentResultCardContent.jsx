import React from "react";
import { Loader2, AlertCircle, RotateCcw } from "lucide-react";
import TopicCards from "../agent-canvas/TopicCards";
import ScriptBriefCard from "../agent-canvas/ScriptBriefCard";
import ScriptExecutionPlan from "../agent-canvas/ScriptExecutionPlan";
import ScriptPlanSummary from "../agent-canvas/ScriptPlanSummary";
import DramaMarkdownBlock from "./DramaMarkdownBlock";
import {
  normalizeScriptBrief,
  getAgentTurnStepLabel,
  SCRIPT_AUDIENCE_OPTIONS,
  SCRIPT_PRICE_BAND_OPTIONS,
  SCRIPT_CONVERSION_GOAL_OPTIONS,
  SCRIPT_PLATFORM_OPTIONS,
} from "../../constants/workbench.jsx";

const AgentResultCardContent = ({
  turn,
  onRetry,
  onBriefChange,
  onBriefSubmit,
  onBriefSubmitDefaults,
  onBriefCancel,
  onSelectAngle,
}) => {
  const response = turn?.response || null;
  const topics = response?.topics || [];
  const brief = normalizeScriptBrief(turn?.scriptBrief || turn?.scriptBriefDraft || {});
  const isDramaTurn = turn?.intent === "DRAMA";

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

  if (turn?.status === "clarify") {
    return (
      <div className="space-y-2">
        <div className="text-xs text-slate-700">{turn?.assistantText || "先确认脚本设定。"}</div>
        {turn?.scriptBriefDraft ? (
          <ScriptBriefCard
            draft={brief}
            audienceOptions={SCRIPT_AUDIENCE_OPTIONS}
            priceBandOptions={SCRIPT_PRICE_BAND_OPTIONS}
            conversionGoalOptions={SCRIPT_CONVERSION_GOAL_OPTIONS}
            platformOptions={SCRIPT_PLATFORM_OPTIONS}
            onChange={(nextBrief) => onBriefChange?.(turn?.id, nextBrief)}
            onSubmit={() => onBriefSubmit?.(turn?.id)}
            onSubmitDefaults={() => onBriefSubmitDefaults?.(turn?.id)}
            onCancel={() => onBriefCancel?.(turn?.id)}
          />
        ) : null}
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

  if (isDramaTurn) {
    return (
      <div className="space-y-2">
        {response?.summary ? (
          <div className="text-[11px] tracking-[0.12em] text-slate-500 text-left">短剧摘要</div>
        ) : null}
        {response?.summary ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-6">
            <DramaMarkdownBlock value={response.summary} className="space-y-1.5" />
          </div>
        ) : null}
        <div className="text-[11px] tracking-[0.12em] text-slate-500 text-left">创作结果</div>
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs leading-6">
          <DramaMarkdownBlock value={response?.text || ""} className="space-y-1.5" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <ScriptPlanSummary brief={brief} />
      <div className="text-[11px] tracking-[0.12em] text-slate-500 text-left">脚本主题</div>
      <TopicCards
        topics={topics}
        selectedAngle={brief?.selectedAngle || ""}
        onSelectAngle={(angle) => onSelectAngle?.(turn?.id, angle)}
      />
      <ScriptExecutionPlan brief={brief} topics={topics} response={response} />
    </div>
  );
};

export default AgentResultCardContent;
