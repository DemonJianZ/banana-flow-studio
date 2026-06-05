import React from "react";
import { CheckCircle2, Download } from "lucide-react";

export default function OutputNodeRenderer({ node, onDownloadAll, renderArtifactThumb }) {
  return (
    <div className="nodrag flex min-h-[140px] flex-col" onMouseDown={(event) => event.stopPropagation()}>
      {node.data.images?.length > 0 ? (
        <div className="flex items-center justify-end gap-2 px-3 py-2.5">
          <div className="flex items-center gap-1">
            <button
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onDownloadAll();
              }}
              className="inline-flex h-7 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 text-[10px] font-medium text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100"
              type="button"
            >
              <Download className="h-3 w-3" /> 下载
            </button>
          </div>
        </div>
      ) : null}

      <div className="custom-scrollbar max-h-[200px] overflow-y-auto p-3">
        {node.data.images?.length > 0 ? (
          <div className="grid grid-cols-2 gap-1.5">
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
