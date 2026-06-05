import React from "react";
import { AlertCircle, CheckCircle2, Sparkles, Upload } from "lucide-react";

export default function StoryboardInputNodeRenderer({
  node,
  inputRef,
  dropActive,
  setDropActive,
  onInputChange,
  onDrop,
}) {
  return (
    <div
      className="nodrag p-3"
      onMouseDown={(event) => event.stopPropagation()}
      onDragEnter={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (node.data.status !== "running") setDropActive(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (node.data.status !== "running") setDropActive(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!event.currentTarget.contains(event.relatedTarget)) setDropActive(false);
      }}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".csv,.tsv,.txt,.md,.markdown,.docx,.doc,text/csv,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
        className="hidden"
        onChange={onInputChange}
      />

      {node.data.status === "running" ? (
        <div className="relative min-h-[238px] overflow-hidden rounded-[16px] border border-cyan-200 bg-slate-950 px-4 py-4 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
          <div className="pointer-events-none absolute inset-0 opacity-45 [background-image:linear-gradient(rgba(34,211,238,0.13)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.13)_1px,transparent_1px)] [background-size:22px_22px]" />
          <div className="pointer-events-none absolute left-0 top-0 h-full w-full animate-pulse bg-[linear-gradient(110deg,transparent_0%,rgba(34,211,238,0.10)_38%,rgba(16,185,129,0.16)_50%,rgba(251,191,36,0.10)_62%,transparent_100%)]" />
          <div className="relative flex items-start gap-4">
            <div className="relative mt-1 h-16 w-16 shrink-0">
              <div className="absolute inset-0 animate-[spin_1.4s_linear_infinite] rounded-full bg-[conic-gradient(from_180deg,rgba(34,211,238,0.05),rgba(34,211,238,0.95),rgba(16,185,129,0.88),rgba(251,191,36,0.72),rgba(34,211,238,0.05))]" />
              <div className="absolute inset-[5px] rounded-full bg-slate-950" />
              <div className="absolute inset-[17px] rounded-full border border-cyan-300/60 bg-cyan-300/10" />
              <Sparkles className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 text-cyan-100" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-cyan-50">故事板生成中</div>
              <div className="mt-1 text-[11px] leading-5 text-cyan-100/75">
                {node.data.progressLabel || "正在拆解剧本结构、场景节奏和镜头顺序"}
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-full animate-pulse rounded-full bg-[linear-gradient(90deg,#22d3ee,#10b981,#fbbf24,#22d3ee)]" />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-1.5 text-[10px] text-cyan-100/70">
                <div className="rounded-[8px] border border-white/10 bg-white/[0.06] px-2 py-1.5">剧本解析</div>
                <div className="rounded-[8px] border border-white/10 bg-white/[0.06] px-2 py-1.5">场景规划</div>
                <div className="rounded-[8px] border border-white/10 bg-white/[0.06] px-2 py-1.5">镜头设计</div>
              </div>
            </div>
          </div>
          <div className="relative mt-4 rounded-[12px] border border-white/10 bg-white/[0.06] px-3 py-2 text-[10px] leading-5 text-cyan-50/75">
            {node.data.scriptFileName ? `输入文件：${node.data.scriptFileName}` : "等待剧本文件读取完成"}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={node.data.status === "running"}
          className={`flex min-h-[238px] w-full flex-col items-center justify-center rounded-[16px] border border-dashed px-5 py-5 text-center transition-colors ${
            dropActive
              ? "border-cyan-300 bg-cyan-50 text-cyan-700"
              : node.data.status === "error"
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : node.data.status === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-slate-200 bg-slate-50 text-slate-600 hover:border-cyan-200 hover:bg-cyan-50/60"
          }`}
        >
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-full border bg-white ${
              node.data.status === "error"
                ? "border-rose-200 text-rose-500"
                : node.data.status === "success"
                ? "border-emerald-200 text-emerald-600"
                : "border-slate-200 text-cyan-600"
            }`}
          >
            {node.data.status === "error" ? (
              <AlertCircle className="h-5 w-5" />
            ) : node.data.status === "success" ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <Upload className="h-5 w-5" />
            )}
          </div>
          <div className="mt-3 text-[13px] font-semibold text-slate-800">
            {node.data.status === "success" ? "故事板已生成" : node.data.status === "error" ? "生成失败，点击重试上传" : "拖拽剧本文件到这里"}
          </div>
          <div className="mt-1.5 max-w-[280px] text-[11px] leading-5 text-slate-500">
            {node.data.status === "success"
              ? node.data.summary || "已接入故事板制作流程，可在画布中继续编辑。"
              : node.data.status === "error"
              ? node.data.error || "请检查文件内容后重新拖入。"
              : "支持 csv / tsv / txt / md / docx；拖入后自动解析剧本并生成可编辑故事板。"}
          </div>
          {node.data.scriptFileName ? (
            <div className="mt-3 max-w-full truncate rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] text-slate-500">
              {node.data.scriptFileName}
            </div>
          ) : null}
        </button>
      )}
    </div>
  );
}
