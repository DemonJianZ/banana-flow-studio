import React from "react";
import { Loader2, Wand2 } from "lucide-react";
import PersonaMentionTextarea from "../PersonaMentionTextarea";

export default function TextInputNodeRenderer({
  node,
  updateData,
  apiFetch,
  personas,
  promptPolishLoading,
  promptPolishError,
  setPromptPolishError,
  onPolish,
}) {
  return (
    <div className="nodrag space-y-3 p-3">
      <div className="relative rounded-[12px] border border-[#E5E7EB] bg-[#F9FAFB] p-3 transition-all focus-within:border-cyan-300 focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(34,211,238,0.12)]">
        <PersonaMentionTextarea
          wrapperClassName="nodrag"
          className="block min-h-[132px] w-full resize-none border-0 bg-transparent px-0 py-0 pb-12 text-[13px] leading-6 outline-none nodrag placeholder:text-slate-400"
          overlayClassName="px-0 py-0 pb-12 text-[13px] leading-6"
          personas={personas}
          rows={5}
          placeholder="例如：一只戴宇航头盔的橘猫站在雨夜霓虹街头，电影感打光，低机位，浅景深。"
          value={node.data.text || ""}
          onChange={(event) => {
            setPromptPolishError("");
            updateData(node.id, { text: event.target.value });
          }}
          onMouseDown={(event) => event.stopPropagation()}
        />
        <button
          type="button"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={onPolish}
          disabled={promptPolishLoading || !String(node.data.text || "").trim() || !apiFetch}
          className={`nodrag absolute bottom-3 right-3 inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[11px] font-medium shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            promptPolishLoading
              ? "bg-cyan-50 text-cyan-700"
              : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-cyan-50 hover:text-cyan-700 hover:ring-cyan-200"
          }`}
          title="提示词润色"
          aria-label="提示词润色"
        >
          {promptPolishLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
          <span>优化提示词</span>
        </button>
      </div>

      {promptPolishError ? <div className="px-1 text-[10px] text-rose-500">{promptPolishError}</div> : null}
    </div>
  );
}
