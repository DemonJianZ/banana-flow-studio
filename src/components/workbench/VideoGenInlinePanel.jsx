import React from "react";
import { ImagePlus } from "lucide-react";
import PropertyPanel from "./PropertyPanel";

export default function VideoGenInlinePanel({
  node,
  updateData,
  apiFetch,
  onOpenPromptPolishPicker,
  imageModelOptions,
  videoModelOptions,
  resolveModelParamsForId,
  personaMentionOptions,
  onRunNode,
  onCancelNode,
  isReady,
  videoLastFrameInputRef,
  onLastFrameUpload,
  onReferenceModeChange,
}) {
  if (!(node.data.mode === "img2video" || node.data.mode === "text2video")) return null;

  return (
    <>
      {node.data.mode === "img2video" ? (
        <div className="space-y-2 px-4 pt-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onReferenceModeChange("first_last")}
              className={`rounded-[10px] border px-3 py-2 text-[11px] font-medium transition-colors ${
                node.data.firstLastFrameOnly
                  ? "border-cyan-200 bg-cyan-50 text-cyan-700"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              }`}
            >
              首尾帧参考
            </button>
            <button
              type="button"
              onClick={() => onReferenceModeChange("omni")}
              className={`rounded-[10px] border px-3 py-2 text-[11px] font-medium transition-colors ${
                node.data.omniReferenceOnly
                  ? "border-cyan-200 bg-cyan-50 text-cyan-700"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              }`}
            >
              全能参考
            </button>
          </div>
          {node.data.firstLastFrameOnly ? (
            <div className="rounded-[12px] border border-slate-200 bg-white p-2">
              <input
                ref={videoLastFrameInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  void onLastFrameUpload(event);
                }}
              />
              <button
                type="button"
                onClick={() => videoLastFrameInputRef.current?.click()}
                className="flex min-h-[72px] w-full items-center gap-3 rounded-[10px] border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-left transition-colors hover:border-cyan-200 hover:bg-cyan-50/60"
              >
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-slate-200 bg-white">
                  {node.data.lastFrameImage ? (
                    <img src={node.data.lastFrameImage} alt="尾帧参考" className="h-full w-full object-cover" />
                  ) : (
                    <ImagePlus className="h-5 w-5 text-slate-400" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-slate-700">
                    {node.data.lastFrameImage ? "更换尾帧参考" : "上传尾帧参考"}
                  </div>
                  <div className="mt-1 text-[10px] leading-4 text-slate-400">尾帧已嵌入当前视频节点内部</div>
                </div>
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <PropertyPanel
        embedded
        node={node}
        updateData={updateData}
        onClose={() => {}}
        apiFetch={apiFetch}
        onOpenPromptPolishPicker={onOpenPromptPolishPicker}
        imageModelOptions={imageModelOptions}
        videoModelOptions={videoModelOptions}
        resolveModelParamsForId={resolveModelParamsForId}
        personaMentionOptions={personaMentionOptions}
        onRunNode={onRunNode}
        onCancelNode={onCancelNode}
        isReady={isReady}
      />
    </>
  );
}
