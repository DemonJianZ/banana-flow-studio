import React from "react";
import { CheckCircle2, Download } from "lucide-react";

export default function OutputNodeRenderer({ node, onDownloadAll, renderArtifactThumb }) {
  return (
    <div className="group/output relative flex min-h-[140px] flex-col">
      {node.data.images?.length > 0 ? (
        <button
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onDownloadAll();
          }}
          className="wbn-glass-button absolute right-2 top-2 z-20 inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-slate-700 opacity-0 transition hover:bg-white group-hover/output:opacity-100"
          type="button"
          title="下载全部"
          aria-label="下载全部"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
      ) : null}

      <div className="custom-scrollbar max-h-[220px] overflow-y-auto p-0">
        {node.data.images?.length > 0 ? (
          <div className="grid grid-cols-2 gap-px bg-white">
            {node.data.images.map((img, index) => (
              <div key={index} className="relative aspect-square">
                {renderArtifactThumb(img, index, {
                  mode: node.data.mode,
                  prompt: node.data.prompt,
                  model: node.data.model,
                })}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex min-h-[140px] flex-col items-center justify-center gap-2 px-4 py-6 text-center text-xs text-slate-500">
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-300">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <div className="text-[13px] font-medium text-slate-700">暂无输出结果</div>
              <div className="leading-5 text-slate-500">运行后将在这里展示内容</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
