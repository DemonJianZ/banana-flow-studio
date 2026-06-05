import React from "react";
import { Maximize, Play, Upload } from "lucide-react";
import {
  MEDIA_UPLOAD_NODE_EMPTY_HEIGHT,
  MAX_RENDERED_MEDIA_ITEMS_PER_NODE,
  isAudioFileLike,
  isImageFileLike,
  isMediaFileLike,
  isVideoFileLike,
} from "../../../constants/workbench.jsx";
import { isSameArtifactSelection } from "../../../constants/workbench.jsx";
import { isAudioContent, isVideoContent } from "../../../lib/mediaType.js";

export default function SimpleMediaInputNodeRenderer({
  node,
  inputMediaKind,
  activeArtifact,
  actionIndex,
  videoUpscalePending,
  videoRmbgPending,
  videoLineartPending,
  imageRmbgPending,
  imageRemovePending,
  imageThreeViewPending,
  uploadDropActive,
  setUploadDropActive,
  setShowToolbar,
  setActionIndex,
  onOpenUpload,
  onPreview,
  resolveAssetUrl,
  renderBackgroundProcessingOverlay,
  readUploadFiles,
  updateData,
  dropTitle,
  supportHint,
}) {
  return (
    <div
      className="relative overflow-hidden rounded-[16px] bg-white"
      onClick={(event) => {
        event.stopPropagation();
        if (!node.data.images?.length) {
          onOpenUpload(event);
          return;
        }
        setShowToolbar(true);
      }}
    >
      {node.data.images?.length > 0 ? (
        <div className="max-h-[520px] overflow-y-auto custom-scrollbar">
          {node.data.images.slice(0, MAX_RENDERED_MEDIA_ITEMS_PER_NODE).map((img, index) => {
            const isAudioItem = inputMediaKind === "audio" || isAudioContent(img);
            const isVideoItem = !isAudioItem && isVideoContent(img);
            const isActive = isSameArtifactSelection(activeArtifact, {
              url: img,
              kind: isVideoItem ? "video" : "image",
              fromNodeId: node.id,
            });
            const showVideoActions = isVideoItem && actionIndex === index;
            const showImageActions = !isVideoItem && !isAudioItem && actionIndex === index;
            const showVideoUpscaleOverlay = isVideoItem && videoUpscalePending && actionIndex === index;
            const showVideoRmbgOverlay = isVideoItem && videoRmbgPending && actionIndex === index;
            const showVideoLineartOverlay = isVideoItem && videoLineartPending && actionIndex === index;
            const showImageRmbgOverlay = !isVideoItem && imageRmbgPending;
            const showImageRemoveOverlay = !isVideoItem && imageRemovePending;
            const showImageThreeViewOverlay = !isVideoItem && imageThreeViewPending;
            return (
              <div
                key={index}
                className={`group/img relative bg-white ${index > 0 ? "border-t border-slate-200" : ""} ${
                  isActive
                    ? "outline outline-1 outline-amber-300 outline-offset-[-1px]"
                    : showVideoActions || showImageActions
                    ? "outline outline-1 outline-slate-300 outline-offset-[-1px]"
                    : ""
                }`}
              >
                {isAudioItem ? (
                  <div className="flex flex-col items-center gap-2 p-3">
                    <audio
                      src={resolveAssetUrl(img)}
                      controls
                      className="w-full"
                      onMouseDown={(event) => event.stopPropagation()}
                    />
                  </div>
                ) : isVideoItem ? (
                  <>
                    <button
                      type="button"
                      className="absolute bottom-3 right-3 z-10 inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white/95 px-3 text-[11px] font-medium text-slate-700 shadow-[0_12px_24px_rgba(15,23,42,0.12)] backdrop-blur-md transition hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700"
                      onMouseDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        onPreview?.(resolveAssetUrl(img));
                      }}
                      title="预览视频"
                      aria-label="预览视频"
                    >
                      <Play className="h-3.5 w-3.5" />
                      <span>预览</span>
                    </button>
                    <video
                      src={resolveAssetUrl(img)}
                      className="block h-auto max-h-[420px] w-full cursor-pointer bg-black object-contain"
                      draggable={false}
                      onDragStart={(event) => event.preventDefault()}
                      onClick={(event) => {
                        event.stopPropagation();
                        setShowToolbar(true);
                        setActionIndex(index);
                      }}
                      title="点击显示操作"
                      muted
                      loop
                      playsInline
                    />
                    {showVideoLineartOverlay
                      ? renderBackgroundProcessingOverlay({
                          title: "正在转线稿",
                          description: "请稍候，正在生成线稿视频",
                        })
                      : null}
                    {showVideoUpscaleOverlay
                      ? renderBackgroundProcessingOverlay({
                          title: "正在视频超清",
                          description: "请稍候，正在生成更清晰的视频版本",
                        })
                      : null}
                    {showVideoRmbgOverlay ? renderBackgroundProcessingOverlay({ title: "正在移除背景" }) : null}
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="absolute bottom-3 right-3 z-10 inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white/95 px-3 text-[11px] font-medium text-slate-700 shadow-[0_12px_24px_rgba(15,23,42,0.12)] backdrop-blur-md transition hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700"
                      onMouseDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        onPreview?.(resolveAssetUrl(img));
                      }}
                      title="预览图片"
                      aria-label="预览图片"
                    >
                      <Maximize className="h-3.5 w-3.5" />
                      <span>预览</span>
                    </button>
                    <img
                      src={resolveAssetUrl(img)}
                      className="block h-auto max-h-[420px] w-full cursor-pointer object-contain"
                      draggable={false}
                      onDragStart={(event) => event.preventDefault()}
                      onClick={(event) => {
                        event.stopPropagation();
                        setShowToolbar(true);
                        setActionIndex(index);
                      }}
                      title="点击显示操作"
                      alt=""
                    />
                    {showImageRmbgOverlay ? renderBackgroundProcessingOverlay({ title: "正在抠图" }) : null}
                    {showImageRemoveOverlay
                      ? renderBackgroundProcessingOverlay({
                          title: "正在去除水印",
                          description: "请稍候，图片正在轻量修复中",
                        })
                      : null}
                    {showImageThreeViewOverlay
                      ? renderBackgroundProcessingOverlay({
                          title: "正在生成三视图",
                          description: "请稍候，正在生成多视角结果",
                        })
                      : null}
                  </>
                )}
              </div>
            );
          })}
          {node.data.images.length > MAX_RENDERED_MEDIA_ITEMS_PER_NODE ? (
            <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-center text-[11px] text-slate-500">
              已加载 {node.data.images.length} 个媒体，当前仅渲染前 {MAX_RENDERED_MEDIA_ITEMS_PER_NODE} 个以保持流畅；全部媒体仍会参与运行。
            </div>
          ) : null}
        </div>
      ) : (
        <div className="p-3">
          <div
            className={`nodrag relative flex w-full cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden rounded-[16px] border px-5 py-5 text-center transition-all duration-150 ${
              uploadDropActive
                ? "border-slate-300 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.06)]"
                : "border-[#E5E7EB] bg-[linear-gradient(180deg,#FCFCFD_0%,#F8FAFC_100%)] hover:border-slate-300 hover:bg-white"
            }`}
            style={{ minHeight: MEDIA_UPLOAD_NODE_EMPTY_HEIGHT }}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={onOpenUpload}
            onDragEnter={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setUploadDropActive(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (!uploadDropActive) setUploadDropActive(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (event.currentTarget.contains(event.relatedTarget)) return;
              setUploadDropActive(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setUploadDropActive(false);
              const files = Array.from(event.dataTransfer?.files || []).filter((file) => {
                if (inputMediaKind === "image") return isImageFileLike(file);
                if (inputMediaKind === "video") return isVideoFileLike(file);
                if (inputMediaKind === "audio") return isAudioFileLike(file);
                return isMediaFileLike(file);
              });
              if (!files.length) return;
              readUploadFiles(files).then((newImages) => {
                updateData(node.id, {
                  images: [...(node.data.images || []), ...newImages],
                });
              });
            }}
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(148,163,184,0.08),transparent_55%)]" />
            <div
              className={`relative flex h-11 w-11 items-center justify-center rounded-[14px] border transition-colors ${
                uploadDropActive ? "border-slate-300 bg-slate-50 text-slate-600" : "border-slate-200 bg-white text-slate-400"
              }`}
            >
              <Upload className="h-[18px] w-[18px]" />
            </div>
            <div className="relative flex max-w-[210px] flex-col items-center gap-2.5">
              <div className="text-[13px] font-medium leading-5 text-slate-800">
                {uploadDropActive ? "松开即可上传" : dropTitle}
              </div>
              <div className="text-[11px] leading-5 text-slate-400">
                {uploadDropActive ? "释放文件后会自动添加到当前节点" : supportHint}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
