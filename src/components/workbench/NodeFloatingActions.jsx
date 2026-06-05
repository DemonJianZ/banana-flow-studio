import React from "react";
import { RotateCcw, X } from "lucide-react";

export default function NodeFloatingActions({ showRetry, showDelete, onRetry, onDelete }) {
  if (!showRetry && !showDelete) return null;

  return (
    <div className="pointer-events-none absolute right-3 top-3 z-20 flex gap-1">
      {showRetry ? (
        <button
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onRetry?.();
          }}
          className="pointer-events-auto rounded-full border border-rose-200 bg-rose-50 p-1.5 text-rose-600 transition hover:border-rose-300 hover:bg-rose-100"
          title="重试"
          type="button"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      ) : null}

      {showDelete ? (
        <button
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onDelete?.();
          }}
          className="pointer-events-none rounded-full border border-slate-200 bg-white p-1.5 text-slate-500 opacity-0 shadow-[0_8px_20px_rgba(15,23,42,0.12)] transition-all duration-150 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600 group-hover/node:pointer-events-auto group-hover/node:opacity-100"
          type="button"
          aria-label="删除节点"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      ) : null}
    </div>
  );
}
