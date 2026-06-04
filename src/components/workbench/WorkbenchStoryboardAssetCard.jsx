/**
 * WorkbenchStoryboardAssetCard — 故事板资产 hover 浮层（portal）
 * 从 Workbench.jsx 抽出（原 lines 9668–9954，Phase 3）
 *
 * 接收 card 对象 + 回调，通过 createPortal 挂在 document.body。
 * 从 canvasStore 直接读取 nodes，无需从 Workbench.jsx 透传。
 */
import React from "react";
import { createPortal } from "react-dom";
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { useCanvasStore } from "../../stores/canvasStore.js";
import { matchesSceneBinding } from "../../constants/workbench.jsx";
import { API_BASE } from "../../config.js";

const normalizeStoryboardAssetCandidates = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value && typeof value === "object") return Object.values(value).filter(Boolean);
  return [];
};

export default function WorkbenchStoryboardAssetCard({
  card,                  // hoveredStoryboardAssetCard
  closeTimerRef,         // storyboardAssetHoverCloseTimerRef
  onScheduleClose,       // scheduleCloseStoryboardAssetHoverCard
  setCard,               // setHoveredStoryboardAssetCard
  onUpdateStatus,        // updateStoryboardAssetStatus
  onGenerate,            // runStoryboardAssetDirectGeneration
  onPreview,             // setPreviewImage
}) {
  const nodes = useCanvasStore((s) => s.nodes);

  if (!card) return null;

  const storyboardNode = nodes.find((item) => item.id === card.nodeId) || null;
  const { assetType, asset } = card;
  const assetId = String(asset?.entity_id || asset?.name || "").trim();
  const assetState = storyboardNode?.data?.storyboard_asset_state?.[assetType]?.[assetId] || {};
  const generatedAt = assetState?.lastGeneratedAt ? new Date(assetState.lastGeneratedAt).toLocaleString() : "";
  const tabLabel = assetType === "characters" ? "角色" : assetType === "subjects" ? "主体" : "场景";
  const generatedImages = Array.isArray(assetState?.images) ? assetState.images.filter(Boolean) : [];
  const candidateItems = normalizeStoryboardAssetCandidates(assetState?.candidates);
  const selectedImageUrl =
    String(assetState?.selectedImageUrl || "").trim() ||
    String(candidateItems[0]?.url || "").trim() ||
    String(generatedImages[0] || "").trim();
  const selectedCandidateId =
    String(assetState?.selectedCandidateId || "").trim() ||
    String(candidateItems.find((item) => String(item?.url || "").trim() === selectedImageUrl)?.id || "").trim();
  const lockedImageUrl = String(assetState?.lockedImageUrl || "").trim();
  const generationStatus = String(assetState?.status || "").trim();
  const tweakText = String(card?.tweakText || "").trim();
  const apiRoot = (API_BASE || "").replace(/\/+$/, "");

  const content = (
    <div
      className="fixed z-[190] w-[360px] pointer-events-auto"
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
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-slate-500">{tabLabel}</div>
              <div className="mt-1 text-[13px] font-semibold text-slate-900 break-words">
                {String(asset?.name || "").trim() || tabLabel}
              </div>
            </div>
          </div>
          {generatedAt ? <div className="mt-2 text-[10px] text-slate-400">最近生成：{generatedAt}</div> : null}
        </div>

        {/* Body */}
        <div className="space-y-3 p-4">
          {/* Description (suppressed if local image exists) */}
          {(() => {
            const lab = storyboardNode?.data?.storyboard_plan?.local_asset_bindings || {};
            let hasLocalImage = false;
            if (assetType === "characters" || assetType === "subjects") {
              const cb = (Array.isArray(lab.character_bindings) ? lab.character_bindings : [])
                .find((b) => String(b?.entity_id || "").trim() === assetId);
              hasLocalImage = !!String(cb?.three_view_url || "").trim();
            } else if (assetType === "locations") {
              const assetName = String(asset?.name || "").trim();
              const sb = (Array.isArray(lab.scene_bindings) ? lab.scene_bindings : [])
                .find((b) => matchesSceneBinding(b, assetId) || matchesSceneBinding(b, assetName));
              hasLocalImage = !!(sb && Array.isArray(sb.preview_urls) && sb.preview_urls.some(Boolean));
            }
            if (hasLocalImage) return null;
            return (
              <div className="text-[11px] leading-5 text-slate-600 break-words">
                {String(asset?.core_description || asset?.description || "暂无描述").trim()}
              </div>
            );
          })()}

          {/* Three-view image (characters/subjects) */}
          {(assetType === "characters" || assetType === "subjects") && (() => {
            const charBindings = Array.isArray(storyboardNode?.data?.storyboard_plan?.local_asset_bindings?.character_bindings)
              ? storyboardNode.data.storyboard_plan.local_asset_bindings.character_bindings : [];
            const binding = charBindings.find((cb) => String(cb?.entity_id || "").trim() === assetId) || null;
            const rawUrl = String(binding?.three_view_url || "").trim();
            if (!rawUrl) return null;
            const fullUrl = `${apiRoot}${rawUrl}`;
            return (
              <div>
                <div className="mb-1.5 text-[11px] font-medium text-slate-500">三视图参考</div>
                <button type="button" onClick={() => onPreview(fullUrl)}
                  className="block w-full overflow-hidden rounded-[14px] border border-slate-200 bg-slate-50">
                  <img src={fullUrl} alt={`${String(asset?.name || "").trim()} 三视图`}
                    className="w-full object-contain" style={{ maxHeight: 160 }} />
                </button>
                {binding?.alias_used && (
                  <div className="mt-1 text-[10px] text-slate-400">
                    别名匹配: <span className="text-slate-600">{binding.alias_used}</span>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Voice preview (characters/subjects) */}
          {(assetType === "characters" || assetType === "subjects") && (() => {
            const charBindings = Array.isArray(storyboardNode?.data?.storyboard_plan?.local_asset_bindings?.character_bindings)
              ? storyboardNode.data.storyboard_plan.local_asset_bindings.character_bindings : [];
            const binding = charBindings.find((cb) => String(cb?.entity_id || "").trim() === assetId) || null;
            const rawVoiceUrl = String(binding?.voice_url || "").trim();
            if (!rawVoiceUrl) return null;
            const fullVoiceUrl = `${apiRoot}${rawVoiceUrl}`;
            const voiceFileName = String(binding?.voice_path || "").split("/").pop() || "音色预览";
            return (
              <div>
                <div className="mb-1.5 text-[11px] font-medium text-slate-500">匹配音色</div>
                <div className="rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <div className="mb-2 text-[10px] text-slate-500 truncate">{voiceFileName}</div>
                  <audio controls src={fullVoiceUrl} className="w-full h-8" style={{ minWidth: 0 }} />
                </div>
              </div>
            );
          })()}

          {/* Scene reference images (locations) */}
          {assetType === "locations" && (() => {
            const sceneBindings = Array.isArray(storyboardNode?.data?.storyboard_plan?.local_asset_bindings?.scene_bindings)
              ? storyboardNode.data.storyboard_plan.local_asset_bindings.scene_bindings : [];
            const assetName = String(asset?.name || "").trim();
            const binding = sceneBindings.find((sb) => matchesSceneBinding(sb, assetId) || matchesSceneBinding(sb, assetName)) || null;
            const previewUrls = Array.isArray(binding?.preview_urls) ? binding.preview_urls.filter(Boolean) : [];
            if (!previewUrls.length) return null;
            return (
              <div>
                <div className="mb-1.5 text-[11px] font-medium text-slate-500">场景参考</div>
                <div className={`grid gap-2 ${previewUrls.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
                  {previewUrls.map((rawUrl, idx) => {
                    const fullUrl = `${apiRoot}${rawUrl}`;
                    return (
                      <button key={idx} type="button" onClick={() => onPreview(fullUrl)}
                        className="overflow-hidden rounded-[14px] border border-slate-200 bg-slate-50">
                        <img src={fullUrl} alt={`${assetName} 场景参考 ${idx + 1}`}
                          className="w-full object-cover" style={{ maxHeight: 120 }} />
                      </button>
                    );
                  })}
                </div>
                {binding?.matched_from && binding.matched_from !== binding.folder_name && (
                  <div className="mt-1 text-[10px] text-slate-400">
                    匹配来源: <span className="text-slate-600">{binding.matched_from}</span>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Generation status */}
          {generationStatus === "running" ? (
            <div className="flex items-center gap-2 rounded-[12px] border border-cyan-200 bg-cyan-50 px-3 py-2 text-[11px] text-cyan-700">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              正在生成中...
            </div>
          ) : null}
          {generationStatus === "error" && String(assetState?.error || "").trim() ? (
            <div className="rounded-[12px] border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] leading-5 text-rose-700">
              {String(assetState.error).trim()}
            </div>
          ) : null}

          {/* Selected image preview */}
          {selectedImageUrl ? (
            <button type="button" onClick={() => onPreview(selectedImageUrl)}
              className="block overflow-hidden rounded-[14px] border border-slate-200 bg-slate-50">
              <img src={selectedImageUrl} alt={`${asset?.name || tabLabel}-selected`}
                className="h-40 w-full object-cover" />
            </button>
          ) : null}

          {/* Candidates grid */}
          {candidateItems.length ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] font-medium text-slate-600">候选版本</div>
                <div className="text-[10px] text-slate-400">{candidateItems.length} 张</div>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {candidateItems.map((item, imageIndex) => {
                  const image = String(item?.url || "").trim();
                  if (!image) return null;
                  const isCurrent = image === selectedImageUrl || String(item?.id || "").trim() === selectedCandidateId;
                  const isLockedImage = !!lockedImageUrl && image === lockedImageUrl;
                  return (
                    <button
                      key={String(item?.id || `${assetId}-img-${imageIndex}`)}
                      type="button"
                      onClick={() => {
                        onUpdateStatus(storyboardNode?.id, assetType, assetId, {
                          selectedCandidateId: String(item?.id || "").trim(),
                          selectedImageUrl: image,
                        });
                        onPreview(image);
                      }}
                      className={`relative overflow-hidden rounded-[12px] border bg-slate-50 ${
                        isCurrent ? "border-cyan-300 ring-2 ring-cyan-200/80" : "border-slate-200"
                      }`}
                    >
                      <img src={image} alt={`${asset?.name || tabLabel}-${imageIndex + 1}`}
                        className="h-20 w-full object-cover" />
                      {isLockedImage ? (
                        <span className="absolute left-1 top-1 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] text-white">定稿</span>
                      ) : isCurrent ? (
                        <span className="absolute left-1 top-1 rounded-full bg-cyan-500 px-1.5 py-0.5 text-[9px] text-white">当前</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Tweak textarea */}
          <div className="space-y-2">
            <div className="text-[11px] font-medium text-slate-600">一句话微调</div>
            <textarea
              value={card?.tweakText || ""}
              onChange={(e) => {
                const nextValue = String(e?.target?.value || "");
                setCard((current) =>
                  current && current.nodeId === storyboardNode?.id &&
                  current.assetType === assetType &&
                  String(current.asset?.entity_id || current.asset?.name || "").trim() === assetId
                    ? { ...current, tweakText: nextValue, sticky: true }
                    : current,
                );
              }}
              onFocus={() => {
                setCard((current) =>
                  current && current.nodeId === storyboardNode?.id &&
                  current.assetType === assetType &&
                  String(current.asset?.entity_id || current.asset?.name || "").trim() === assetId
                    ? { ...current, sticky: true }
                    : current,
                );
              }}
              onBlur={() => {
                setCard((current) =>
                  current && current.nodeId === storyboardNode?.id &&
                  current.assetType === assetType &&
                  String(current.asset?.entity_id || current.asset?.name || "").trim() === assetId
                    ? { ...current, sticky: false }
                    : current,
                );
              }}
              rows={3}
              placeholder={
                assetType === "locations"
                  ? "例如：霓虹减少一些，整体更冷、更潮湿。"
                  : assetType === "subjects"
                  ? "例如：金属质感更强，锁扣细节更复杂。"
                  : "例如：毛色偏灰蓝，眼神更冷酷，更有压迫感。"
              }
              className="w-full resize-none rounded-[12px] border border-slate-200 bg-white px-3 py-2 text-[11px] leading-5 text-slate-700 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
            />
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onGenerate(storyboardNode, assetType, asset)}
              disabled={generationStatus === "running"}
              className="inline-flex items-center gap-1.5 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-[11px] text-cyan-700 transition-colors hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {assetState?.lastGeneratedAt ? "重生成" : "生成"}
            </button>
            <button
              type="button"
              onClick={() => onGenerate(storyboardNode, assetType, asset, { tweakText, referenceImageUrl: selectedImageUrl })}
              disabled={generationStatus === "running" || !tweakText}
              className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-[11px] text-violet-700 transition-colors hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Wand2 className="h-3.5 w-3.5" />
              按要求微调
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
