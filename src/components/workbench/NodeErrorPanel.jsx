import React from "react";
import { AlertCircle, Clipboard } from "lucide-react";

export default function NodeErrorPanel({ error, copied, onCopy }) {
  return (
    <div className="flex flex-col gap-2 rounded-[22px] border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700 animate-in fade-in zoom-in-95">
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
        <span className="break-all font-mono">{error || "Unknown Error"}</span>
      </div>
      <div className="mt-1 flex justify-end gap-2 border-t border-rose-200 pt-1">
        <button
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onCopy?.();
          }}
          className="flex items-center gap-1 text-[9px] opacity-75 transition hover:opacity-100"
          type="button"
        >
          <Clipboard className="h-3 w-3" /> {copied ? "已复制!" : "复制调试信息"}
        </button>
      </div>
    </div>
  );
}
