/**
 * WorkbenchStoryboardShotCard — 故事板镜头 hover 浮层（portal）
 * 从 Workbench.jsx 抽出（原 lines 9956–10112，Phase 3）
 *
 * 从 canvasStore 直接读取 nodes，无需从 Workbench.jsx 透传。
 */
import React from "react";
import { createPortal } from "react-dom";
import { Loader2, Sparkles, RotateCcw } from "lucide-react";
import { useCanvasStore } from "../../stores/canvasStore.js";
import { stripStoryboardDisplayIds } from "../../constants/workbench.jsx";

const normalizeStoryboardAssetCandidates = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value && typeof value === "object") return Object.values(value).filter(Boolean);
  return [];
};

export default function WorkbenchStoryboardShotCard({
  card,               // hoveredStoryboardShotCard
  closeTimerRef,      // storyboardShotHoverCloseTimerRef
  onScheduleClose,    // scheduleCloseStoryboardShotHoverCard
  onUpdateStatus,     // updateStoryboardAssetStatus
  onGenerate,         // runStoryboardShotGeneration
  onPreview,          // setPreviewImage
}) {
  const nodes = useCanvasStore((s) => s.nodes);

  if (!card) return null;

  const storyboardNode = nodes.find((n) => n.id === card.nodeId) || null;
  const shot = card.shot || null;
  const scene = card.scene || null;
  const shotId = String(shot?.shot_id || "").trim();
  const shotAssetState = storyboardNode?.data?.storyboard_asset_state?.shots?.[shotId] || {};
  const generationStatus = String(shotAssetState?.status || "").trim();
  const isRunning = generationStatus === "running";
  const selectedImageUrl = String(shotAssetState?.selectedImageUrl || "").trim();
  const candidateItems = normalizeStoryboardAssetCandidates(shotAssetState?.candidates);
  const generatedAt = shotAssetState?.lastGeneratedAt ? new Date(shotAssetState.lastGeneratedAt).toLocaleString() : "";
  const errorMsg = String(shotAssetState?.error || "").trim();
  const sceneDisplayName =
    stripStoryboardDisplayIds(String(scene?.location || scene?.title || "").trim()) || `场景 ${scene?.scene_no || ""}`;

  const content = (
    <div
      className="fixed z-[191] w-[360px] pointer-events-auto"
      style={{ left: card.x, top: card.y }}
      onMouseEnter={() => {
        if (closeTimerRef.current) {
          window.clearTimeout(closeTimerRef.current);
          closeTimerRef.current = null;
        }
      }}
      onMouseLeave={onScheduleClose}
      onMouseDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-[0_24px_64px_rgba(15,23,42,0.16)]">
        {/* Header */}
        <div className="border-b border-slate-200 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="rounded-md bg-orange-50 px-1.5 py-0.5 text-[11px] font-semibold text-orange-700 ring-1 ring-orange-200">
                @镜头{shot?.shot_no}
              </span>
              <span className="truncate text-[12px] font-medium text-slate-700">{sceneDisplayName}</span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-slate-500 shrink-0">
              {String(shot?.camera || "").trim() ? <span>{String(shot.camera).trim()}</span> : null}
              {shot?.duration_sec ? <span>{shot.duration_sec}s</span> : null}
            </div>
          </div>
          {generatedAt ? <div className="mt-1.5 text-[10px] text-slate-400">最近生成：{generatedAt}</div> : null}
        </div>

        {/* Body */}
        <div className="space-y-3 p-4">
          {/* Generated image */}
          {selectedImageUrl ? (
            <div>
              <button type="button" onClick={() => onPreview(selectedImageUrl)}
                className="block w-full overflow-hidden rounded-[14px] border border-slate-200 bg-slate-50">
                <img src={selectedImageUrl} alt={`镜头${shot?.shot_no} 分镜图`}
                  className="w-full object-contain" style={{ maxHeight: 200 }} />
              </button>
              {candidateItems.length > 1 ? (
                <div className="mt-2 flex gap-1.5 overflow-x-auto">
                  {candidateItems.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        if (!shotId) return;
                        onUpdateStatus(storyboardNode?.id, "shots", shotId, {
                          selectedImageUrl: c.url,
                          selectedCandidateId: c.id,
                        });
                      }}
                      className={`h-14 w-14 shrink-0 overflow-hidden rounded-[8px] border-2 transition-colors ${
                        c.url === selectedImageUrl ? "border-orange-400" : "border-slate-200 hover:border-slate-400"
                      }`}
                    >
                      <img src={c.url} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Visual description */}
          {String(shot?.visual_description || "").trim() ? (
            <div className="text-[11px] leading-5 text-slate-600 break-words">
              {String(shot.visual_description).trim()}
            </div>
          ) : null}

          {/* Dialogues */}
          {Array.isArray(shot?.dialogues) && shot.dialogues.length > 0 ? (
            <div className="space-y-0.5">
              {shot.dialogues.map((d, di) => {
                const speaker = String(d?.speaker || "").trim();
                const line = String(d?.text || "").trim();
                if (!line) return null;
                return (
                  <div key={di} className="text-[10px] leading-5 text-slate-500 break-words">
                    {speaker ? (
                      <>
                        <span className="font-medium text-slate-700">{speaker}：</span>
                        <span>{line}</span>
                      </>
                    ) : (
                      <span>"{line}"</span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : null}

          {/* Error */}
          {errorMsg ? (
            <div className="rounded-[10px] bg-rose-50 px-3 py-2 text-[11px] text-rose-600">{errorMsg}</div>
          ) : null}

          {/* Generate button */}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isRunning}
              onClick={() => {
                if (storyboardNode) onGenerate(storyboardNode, scene, shot);
              }}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-[12px] py-2.5 text-[12px] font-medium transition-colors ${
                isRunning
                  ? "cursor-not-allowed bg-slate-100 text-slate-400"
                  : "bg-orange-500 text-white hover:bg-orange-600"
              }`}
            >
              {isRunning ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" />生成中…</>
              ) : selectedImageUrl ? (
                <><RotateCcw className="h-3.5 w-3.5" />重生成</>
              ) : (
                <><Sparkles className="h-3.5 w-3.5" />生成分镜图</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
