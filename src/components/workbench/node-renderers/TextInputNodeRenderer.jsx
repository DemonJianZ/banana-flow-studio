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
    <div className="space-y-2 p-4">
      <div className="wbn-input-editor relative rounded-[8px] p-0 transition-colors">
        <PersonaMentionTextarea
          wrapperClassName="nodrag"
          className="nodrag block min-h-[142px] w-full resize-none border-0 bg-transparent px-0 py-0 pb-10 font-mono text-[12px] leading-6 text-slate-800 outline-none placeholder:text-slate-400"
          overlayClassName="px-0 py-0 pb-10 font-mono text-[12px] leading-6"
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
          className={`nodrag absolute bottom-0 right-0 inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            promptPolishLoading
              ? "bg-cyan-50 text-cyan-700"
              : "bg-transparent text-slate-400 hover:bg-slate-100 hover:text-cyan-700"
          }`}
          title="提示词润色"
          aria-label="提示词润色"
        >
          {promptPolishLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
        </button>
      </div>

      {promptPolishError ? <div className="px-1 text-[10px] text-rose-500">{promptPolishError}</div> : null}
    </div>
  );
}
