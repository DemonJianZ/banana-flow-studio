import React from "react";
import {
  Layout,
  Loader2,
  Maximize,
  Scan,
  Scissors,
  Sparkles,
  TrendingUp,
  Wand2,
} from "lucide-react";
import { VIDEO_HD_TEMPLATE_OPTIONS } from "../../../constants/workbench.jsx";
import { isVideoContent } from "../../../lib/mediaType.js";

export default function CompactInputNodeRenderer({
  node,
  activeImage,
  activeIndex,
  activeIsVideo,
  images,
  showActions,
  setShowActions,
  showVideoUpscaleOptions,
  setShowVideoUpscaleOptions,
  setActiveIndex,
  actionBusy,
  rmbgPending,
  removePending,
  threeViewPending,
  videoUpscalePending,
  videoLineartPending,
  videoRmbgPending,
  hasThreeViewResult,
  mediaToolbarClass,
  mediaToolbarRowClass,
  mediaToolbarOptionRowClass,
  mediaToolbarIconClass,
  getMediaToolbarButtonClass,
  renderBackgroundProcessingOverlay,
  onPreview,
  onCompactVideoRmbg,
  onCompactVideoLineart,
  onCompactVideoUpscale,
  onCompactVideoUpscaleOption,
  onCompactThreeView,
  onCompactRmbg,
  onCompactRemove,
}) {
  return (
    <div className="space-y-2">
      <div className="relative overflow-visible">
        <div className="overflow-hidden rounded-[18px] border border-slate-200 bg-slate-50 shadow-[0_12px_28px_rgba(15,23,42,0.08)]">
          <button
            type="button"
            className={`nodrag relative block h-[286px] w-full overflow-hidden bg-slate-100 transition-[transform,filter,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              showActions
                ? "scale-[0.985] shadow-[0_18px_45px_rgba(8,15,34,0.5)]"
                : "hover:scale-[1.01] hover:brightness-105"
            }`}
            onMouseDown={(event) => {
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.stopPropagation();
              setShowVideoUpscaleOptions(false);
              setShowActions((prev) => !prev);
            }}
          >
            {activeImage ? (
              activeIsVideo ? (
                <video
                  src={activeImage}
                  className={`h-full w-full object-contain transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    showActions ? "scale-[1.015]" : "scale-100"
                  }`}
                  muted
                  loop
                  playsInline
                />
              ) : (
                <img
                  src={activeImage}
                  className={`h-full w-full object-contain transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    showActions ? "scale-[1.015]" : "scale-100"
                  }`}
                  alt=""
                />
              )
            ) : null}
            {rmbgPending ? renderBackgroundProcessingOverlay({ title: "正在抠图" }) : null}
            {removePending
              ? renderBackgroundProcessingOverlay({
                  title: "正在去除水印",
                  description: "请稍候，图片正在轻量修复中",
                })
              : null}
            {threeViewPending && !activeIsVideo
              ? renderBackgroundProcessingOverlay({
                  title: "正在生成三视图",
                  description: "请稍候，正在生成多视角结果",
                })
              : null}
            {videoUpscalePending ? (
              <div className="pointer-events-none absolute inset-0 z-[2] overflow-hidden">
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.24),rgba(2,6,23,0.62))] backdrop-blur-[2px]" />
                <div className="absolute inset-y-0 left-1/2 w-[46%] -translate-x-1/2 bg-[linear-gradient(90deg,rgba(255,255,255,0),rgba(251,113,133,0.16),rgba(244,63,94,0.22),rgba(255,255,255,0))] opacity-85 blur-xl animate-pulse" />
                <div className="absolute inset-x-0 top-[22%] h-px bg-[linear-gradient(90deg,rgba(244,63,94,0),rgba(251,113,133,0.7),rgba(244,63,94,0))] shadow-[0_0_18px_rgba(244,63,94,0.3)] animate-pulse" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-center text-slate-700 shadow-[0_16px_40px_rgba(15,23,42,0.12)] backdrop-blur-xl">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-rose-600" />
                      <span className="text-[12px] font-medium tracking-[0.04em] text-slate-800">正在视频超清</span>
                    </div>
                    <div className="mt-1 text-[10px] text-slate-600">请稍候，正在直接生成清晰版本</div>
                  </div>
                </div>
              </div>
            ) : null}
            {videoLineartPending
              ? renderBackgroundProcessingOverlay({
                  title: "正在转线稿",
                  description: "请稍候，正在生成线稿视频",
                })
              : null}
            {videoRmbgPending ? renderBackgroundProcessingOverlay({ title: "正在移除背景" }) : null}
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_35%,rgba(34,211,238,0.12),transparent_42%)] opacity-80 transition-opacity duration-300" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
          </button>
          {activeImage ? (
            <button
              type="button"
              className="nodrag absolute bottom-3 right-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-700 shadow-[0_12px_24px_rgba(15,23,42,0.12)] backdrop-blur-md transition duration-200 hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onPreview?.(activeImage);
              }}
              title="放大预览"
            >
              <Maximize className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        {activeImage ? (
          <div
            className={`nodrag absolute bottom-full left-0 z-30 mb-3 w-max min-w-[252px] max-w-[calc(100vw-48px)] ${mediaToolbarClass} transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              showActions ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
            }`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {activeIsVideo ? (
              <>
                <div className={mediaToolbarRowClass}>
                  <button type="button" disabled={actionBusy} className={getMediaToolbarButtonClass()} onClick={onCompactVideoRmbg}>
                    {videoRmbgPending ? <Loader2 className={`${mediaToolbarIconClass} animate-spin`} /> : <Wand2 className={mediaToolbarIconClass} />}
                    <span>去背景</span>
                  </button>
                  <button type="button" disabled={actionBusy} className={getMediaToolbarButtonClass()} onClick={onCompactVideoLineart}>
                    <Scan className={mediaToolbarIconClass} />
                    <span>转线稿</span>
                  </button>
                  <button
                    type="button"
                    disabled={actionBusy}
                    className={getMediaToolbarButtonClass({ active: showVideoUpscaleOptions })}
                    onClick={onCompactVideoUpscale}
                  >
                    <TrendingUp className={mediaToolbarIconClass} />
                    <span>视频超清</span>
                  </button>
                </div>
                {showVideoUpscaleOptions ? (
                  <div className={mediaToolbarOptionRowClass}>
                    {VIDEO_HD_TEMPLATE_OPTIONS.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        disabled={actionBusy}
                        className={getMediaToolbarButtonClass()}
                        onClick={() => onCompactVideoUpscaleOption(item.value)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <div className={mediaToolbarRowClass}>
                <button type="button" disabled={actionBusy} className={getMediaToolbarButtonClass()} onClick={onCompactThreeView}>
                  {threeViewPending ? <Loader2 className={`${mediaToolbarIconClass} animate-spin`} /> : <Layout className={mediaToolbarIconClass} />}
                  {threeViewPending ? "生成中..." : hasThreeViewResult ? "重试三视图" : "三视图"}
                </button>
                <button type="button" disabled={actionBusy} className={getMediaToolbarButtonClass()} onClick={onCompactRmbg}>
                  {rmbgPending ? <Loader2 className={`${mediaToolbarIconClass} animate-spin`} /> : <Scissors className={mediaToolbarIconClass} />}
                  抠图
                </button>
                <button type="button" disabled={actionBusy} className={getMediaToolbarButtonClass()} onClick={onCompactRemove}>
                  {removePending ? <Loader2 className={`${mediaToolbarIconClass} animate-spin`} /> : <Sparkles className={mediaToolbarIconClass} />}
                  <span>{removePending ? "处理中..." : "去水印"}</span>
                </button>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {images.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
          {images.map((img, index) => {
            const isThumbActive = index === activeIndex;
            return (
              <button
                key={`${node.id}-${index}`}
                type="button"
                className={`nodrag relative h-16 w-16 shrink-0 overflow-hidden rounded-[16px] border transition duration-200 ${
                  isThumbActive
                    ? "border-cyan-500/60 ring-1 ring-cyan-400/25 shadow-[0_10px_24px_rgba(6,182,212,0.16)]"
                    : "border-slate-200 hover:border-slate-300 hover:-translate-y-0.5"
                }`}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  setActiveIndex(index);
                  setShowActions(false);
                }}
              >
                {isVideoContent(img) ? (
                  <video src={img} className="h-full w-full object-cover" muted loop playsInline />
                ) : (
                  <img src={img} className="h-full w-full object-cover" alt="" />
                )}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
