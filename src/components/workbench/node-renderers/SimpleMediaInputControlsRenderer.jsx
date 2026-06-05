import React from "react";
import {
  Download,
  Loader2,
  Plus,
  Scan,
  Scissors,
  Sparkles,
  Trash2,
  TrendingUp,
  Upload,
  Volume2,
  VolumeX,
  Wand2,
  X,
} from "lucide-react";
import { DEFAULT_VIDEO_SPLIT_OUTPUT_RESOLUTION, VIDEO_HD_TEMPLATE_OPTIONS } from "../../../constants/workbench.jsx";

export default function SimpleMediaInputControlsRenderer({
  node,
  inputRef,
  accept,
  onInputChange,
  showToolbar,
  hasSelection,
  hasVideoSelection,
  uploadLabel,
  title,
  mediaToolbarClass,
  mediaToolbarRowClass,
  mediaToolbarOptionRowClass,
  mediaToolbarIconClass,
  getMediaToolbarButtonClass,
  openUpload,
  videoSplitPending,
  compactActionBusy,
  showVideoUpscaleOptions,
  compactVideoUpscalePending,
  videoRmbgPending,
  videoLineartPending,
  compactThreeViewPending,
  compactRmbgPending,
  compactRemovePending,
  onVideoEditor,
  onVideoUpscale,
  onVideoRmbg,
  onVideoLineart,
  onImageThreeView,
  onImageRmbg,
  onImageRemove,
  onVideoUpscaleOption,
  showVideoEditor,
  setShowVideoEditor,
  activeItem,
  onVideoMetadata,
  videoDuration,
  formatVideoSplitTime,
  segments,
  onSegmentAdd,
  onSegmentRemove,
  drafts,
  onSegmentChange,
  onCommitDrafts,
  outputResolution,
  setOutputResolution,
  outputResolutionOptions,
  includeAudio,
  setIncludeAudio,
  onRunSplit,
}) {
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept}
        className="hidden"
        onChange={onInputChange}
      />

      {node.data.images?.length > 0 && (showToolbar || hasSelection) ? (
        <>
          <div
            className="absolute bottom-full left-1/2 z-30 mb-8 w-max max-w-[calc(100vw-48px)] -translate-x-1/2"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className={`${mediaToolbarClass} w-max min-w-[252px]`}>
              <div className={mediaToolbarRowClass}>
                {hasVideoSelection ? (
                  <>
                    <button
                      type="button"
                      className={getMediaToolbarButtonClass({ active: !hasSelection })}
                      onClick={openUpload}
                      title={uploadLabel}
                      aria-label={uploadLabel}
                    >
                      <Upload className={mediaToolbarIconClass} />
                      <span>上传</span>
                    </button>
                    <button
                      type="button"
                      disabled={videoSplitPending}
                      className={getMediaToolbarButtonClass()}
                      onClick={onVideoEditor}
                    >
                      <Scissors className={mediaToolbarIconClass} />
                      <span>视频编辑</span>
                    </button>
                    <button
                      type="button"
                      disabled={compactActionBusy}
                      className={getMediaToolbarButtonClass({ active: showVideoUpscaleOptions })}
                      onClick={onVideoUpscale}
                    >
                      {compactVideoUpscalePending ? (
                        <Loader2 className={`${mediaToolbarIconClass} animate-spin`} />
                      ) : (
                        <TrendingUp className={mediaToolbarIconClass} />
                      )}
                      <span>视频超清</span>
                    </button>
                    <button
                      type="button"
                      disabled={videoRmbgPending || videoLineartPending || videoSplitPending}
                      className={getMediaToolbarButtonClass()}
                      onClick={onVideoRmbg}
                    >
                      {videoRmbgPending ? <Loader2 className={`${mediaToolbarIconClass} animate-spin`} /> : <Wand2 className={mediaToolbarIconClass} />}
                      <span>去背景</span>
                    </button>
                    <button
                      type="button"
                      disabled={videoRmbgPending || videoLineartPending || videoSplitPending}
                      className={getMediaToolbarButtonClass()}
                      onClick={onVideoLineart}
                    >
                      <Scan className={mediaToolbarIconClass} />
                      <span>转线稿</span>
                    </button>
                  </>
                ) : null}
                {hasSelection && !hasVideoSelection ? (
                  <>
                    <button
                      type="button"
                      className={getMediaToolbarButtonClass({ active: !hasSelection })}
                      onClick={openUpload}
                      title={uploadLabel}
                      aria-label={uploadLabel}
                    >
                      <Upload className={mediaToolbarIconClass} />
                      <span>上传</span>
                    </button>
                    <button type="button" disabled={compactActionBusy} className={getMediaToolbarButtonClass()} onClick={onImageThreeView}>
                      {compactThreeViewPending ? <Loader2 className={`${mediaToolbarIconClass} animate-spin`} /> : <Scan className={mediaToolbarIconClass} />}
                      <span>三视图</span>
                    </button>
                    <button type="button" disabled={compactActionBusy} className={getMediaToolbarButtonClass()} onClick={onImageRmbg}>
                      {compactRmbgPending ? <Loader2 className={`${mediaToolbarIconClass} animate-spin`} /> : <Scissors className={mediaToolbarIconClass} />}
                      <span>抠图</span>
                    </button>
                    <button type="button" disabled={compactActionBusy} className={getMediaToolbarButtonClass()} onClick={onImageRemove}>
                      {compactRemovePending ? <Loader2 className={`${mediaToolbarIconClass} animate-spin`} /> : <Sparkles className={mediaToolbarIconClass} />}
                      <span>去水印</span>
                    </button>
                  </>
                ) : null}
              </div>
              {hasVideoSelection && showVideoUpscaleOptions ? (
                <div className={mediaToolbarOptionRowClass}>
                  {VIDEO_HD_TEMPLATE_OPTIONS.map((item) => (
                    <button
                      key={`simple-video-hd-${item.value}`}
                      type="button"
                      disabled={compactActionBusy}
                      className={getMediaToolbarButtonClass()}
                      onClick={() => onVideoUpscaleOption(item.value)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          {showVideoEditor && hasVideoSelection ? (
            <div
              className="fixed inset-0 z-[170] flex items-center justify-center bg-white/42 px-4 backdrop-blur-[2px]"
              onMouseDown={(event) => {
                event.stopPropagation();
                setShowVideoEditor(false);
              }}
            >
              <div
                className="relative w-full max-w-3xl border border-slate-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.12)]"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                  <div>
                    <div className="text-sm font-medium text-slate-900">视频编辑</div>
                    <div className="mt-1 text-[11px] text-slate-500">对当前视频做多段分割，导出后会追加回当前上传组件。</div>
                  </div>
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center border border-slate-200 bg-white text-slate-500 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600"
                    onClick={() => setShowVideoEditor(false)}
                    title="关闭编辑器"
                    aria-label="关闭编辑器"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid gap-0 md:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
                  <div className="border-b border-slate-200 bg-slate-50 p-4 md:border-b-0 md:border-r">
                    <div className="overflow-hidden border border-slate-200 bg-black">
                      <video
                        src={activeItem}
                        controls
                        playsInline
                        className="block aspect-video w-full bg-black object-contain"
                        onLoadedMetadata={onVideoMetadata}
                      />
                    </div>
                    <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
                      <span>当前视频</span>
                      <span>{videoDuration > 0 ? `总时长 ${formatVideoSplitTime(videoDuration)}` : "读取时长中..."}</span>
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-[12px] font-medium text-slate-800">分段列表</div>
                      <button
                        type="button"
                        className="inline-flex h-8 items-center justify-center gap-1.5 border border-slate-200 bg-white px-3 text-[11px] font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                        onClick={onSegmentAdd}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        新增分段
                      </button>
                    </div>
                    <div className="mt-3 space-y-2">
                      {segments.length === 0 ? (
                        <div className="border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-[11px] text-slate-500">
                          当前默认不分段，点击“新增分段”后开始编辑片段。
                        </div>
                      ) : null}
                      {segments.map((segment, index) => (
                        <div key={`${node.id}-split-${index}`} className="border border-slate-200 bg-slate-50 p-3">
                          <div className="mb-2 flex items-center justify-between text-[11px] text-slate-500">
                            <span>片段 {index + 1}</span>
                            <button
                              type="button"
                              className="inline-flex h-7 w-7 items-center justify-center border border-slate-200 bg-white text-slate-500 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600"
                              onClick={() => onSegmentRemove(index)}
                              title="删除分段"
                              aria-label="删除分段"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <label className="text-[10px] text-slate-500">
                              <div className="mb-1">开始秒数</div>
                              <input
                                type="number"
                                step="0.1"
                                value={drafts[index]?.startSec ?? ""}
                                disabled={videoSplitPending}
                                className="h-8 w-full border border-slate-200 bg-white px-2 text-[11px] text-slate-700 outline-none disabled:cursor-wait disabled:opacity-60"
                                onChange={(event) => onSegmentChange(index, "startSec", event.target.value)}
                                onBlur={onCommitDrafts}
                              />
                            </label>
                            <label className="text-[10px] text-slate-500">
                              <div className="mb-1">结束秒数</div>
                              <input
                                type="number"
                                step="0.1"
                                value={drafts[index]?.endSec ?? ""}
                                disabled={videoSplitPending}
                                className="h-8 w-full border border-slate-200 bg-white px-2 text-[11px] text-slate-700 outline-none disabled:cursor-wait disabled:opacity-60"
                                onChange={(event) => onSegmentChange(index, "endSec", event.target.value)}
                                onBlur={onCommitDrafts}
                              />
                            </label>
                          </div>
                          <div className="mt-2 text-[10px] text-slate-500">
                            {formatVideoSplitTime(segment.startSec)} - {formatVideoSplitTime(segment.endSec)}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 border border-slate-200 bg-slate-50 p-3">
                      <label className="text-[10px] text-slate-500">
                        <div className="mb-1">导出分辨率</div>
                        <select
                          value={outputResolution}
                          disabled={videoSplitPending}
                          className="h-8 w-full border border-slate-200 bg-white px-2 text-[11px] text-slate-700 outline-none disabled:cursor-wait disabled:opacity-60"
                          onChange={(event) => setOutputResolution(String(event.target.value || DEFAULT_VIDEO_SPLIT_OUTPUT_RESOLUTION).trim().toLowerCase())}
                        >
                          {outputResolutionOptions.map((option) => (
                            <option key={option} value={option}>
                              {option.toUpperCase()}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="mt-3 flex cursor-pointer items-center gap-2 text-[11px] text-slate-600">
                        <input
                          type="checkbox"
                          checked={includeAudio}
                          disabled={videoSplitPending}
                          className="h-3.5 w-3.5 border border-slate-300 text-cyan-600"
                          onChange={(event) => setIncludeAudio(Boolean(event.target.checked))}
                        />
                        <span className="inline-flex items-center gap-1.5">
                          {includeAudio ? <Volume2 className="h-3.5 w-3.5 text-slate-500" /> : <VolumeX className="h-3.5 w-3.5 text-slate-400" />}
                          导出音频
                        </span>
                      </label>
                      <div className="mt-1 text-[10px] text-slate-500">未勾选时默认输出静音视频。</div>
                    </div>
                    <div className="mt-4 flex justify-end border-t border-slate-200 pt-4">
                      <button
                        type="button"
                        disabled={videoSplitPending || (segments.length === 0 && videoDuration <= 0)}
                        className="inline-flex h-9 min-w-[124px] items-center justify-center gap-1.5 border border-slate-200 bg-white px-5 text-[11px] font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-65"
                        onClick={onRunSplit}
                      >
                        {videoSplitPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : segments.length === 0 ? <Download className="h-3.5 w-3.5" /> : <Scissors className="h-3.5 w-3.5" />}
                        {videoSplitPending ? "处理中..." : segments.length === 0 ? "导出原片" : "导出分段"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="absolute -top-5 left-0 cursor-grab select-none text-[11px] font-medium tracking-[0.08em] text-slate-500 active:cursor-grabbing">
            {title}
          </div>
        </>
      ) : null}
    </>
  );
}
