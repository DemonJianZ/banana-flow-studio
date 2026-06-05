import React from "react";
import { CheckCircle2 } from "lucide-react";
import { isSameArtifactSelection } from "../../constants/workbench.jsx";
import { isVideoContent } from "../../lib/mediaType.js";

export default function ArtifactThumb({ image, index, meta, nodeId, activeArtifact, onPreview, onSelectArtifact }) {
  const selection = {
    url: image,
    kind: isVideoContent(image) ? "video" : "image",
    fromNodeId: nodeId,
    meta,
  };
  const isActive = isSameArtifactSelection(activeArtifact, selection);

  return (
    <div
      key={index}
      className={`relative aspect-square cursor-pointer overflow-hidden rounded-[18px] border bg-white shadow-[0_12px_28px_rgba(15,23,42,0.08)] group ${
        isActive ? "border-amber-300 ring-1 ring-amber-200" : "border-slate-200"
      }`}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onPreview?.(image);
      }}
      title="点击预览"
    >
      {isVideoContent(image) ? (
        <video src={image} className="h-full w-full object-cover" muted loop playsInline />
      ) : (
        <img src={image} className="h-full w-full object-cover" alt="" />
      )}

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

      <button
        type="button"
        className="nodrag absolute bottom-1.5 left-1.5 rounded-full border border-slate-200 bg-white/95 px-2 py-1 text-[9px] text-slate-700 opacity-0 backdrop-blur-sm transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 group-hover:opacity-100"
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onSelectArtifact?.(isActive ? null : { ...selection, createdAt: Date.now() });
        }}
        title="选中为 Agent 上下文"
      >
        选中产物
      </button>

      {isActive ? (
        <div className="absolute left-1 top-1">
          <CheckCircle2 className="h-4 w-4 text-yellow-300 drop-shadow" />
        </div>
      ) : null}
    </div>
  );
}
