import React from "react";
import { ArrowRight, Film, ImageIcon, Loader2, Play, RotateCcw, X } from "lucide-react";
import InlineDropdown from "../InlineDropdown";

export default function AiNodeRenderer({
  node,
  title,
  isInlineImageGenNode,
  isInlineImg2ImgNode,
  imageModelOptions,
  inlineImageSizeOptions,
  inlineImageRatioOptions,
  inlineImageParamLoading,
  inlineImageParamError,
  isReady,
  onRetry,
  onRunNode,
  onCancelNode,
  updateData,
  safeProgressWidth,
  hideInlineAiResults,
  renderArtifactThumb,
  isProcessor,
  isPostProcessor,
  isImageCreationNode,
  onContinue,
  onIterateImg2Img,
}) {
  return (
    <div className="space-y-2">
      {isInlineImageGenNode ? (
        <div className="pointer-events-none absolute -top-5 left-0 cursor-grab select-none text-[11px] font-medium tracking-[0.08em] text-slate-500 active:cursor-grabbing">
          {title}
        </div>
      ) : null}

      {isInlineImageGenNode ? (
        <>
          <div className="pointer-events-none absolute right-3 top-3 z-20 flex gap-1">
            {node.data.status === "error" ? (
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
          </div>

          <div className="space-y-3">
            <div>
              <div className="mb-1.5 px-1 text-[10px] font-medium uppercase tracking-[0.08em] text-slate-400">模型</div>
              <InlineDropdown
                value={String(node.data.model || "")}
                options={imageModelOptions.map((item) => ({ value: item.id, label: item.name }))}
                onChange={(nextValue) => updateData(node.id, { model: String(nextValue || "").trim() })}
                placeholder="选择模型"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="mb-1.5 px-1 text-[10px] font-medium uppercase tracking-[0.08em] text-slate-400">尺寸</div>
                <InlineDropdown
                  value={String(node.data.templates?.size || "1k")}
                  options={inlineImageSizeOptions.map((item) => ({ value: item, label: item }))}
                  onChange={(nextValue) =>
                    updateData(node.id, {
                      templates: { ...(node.data.templates || {}), size: String(nextValue || "").trim() },
                    })
                  }
                  placeholder="选择尺寸"
                />
              </div>

              <div>
                <div className="mb-1.5 px-1 text-[10px] font-medium uppercase tracking-[0.08em] text-slate-400">比例</div>
                <InlineDropdown
                  value={String(node.data.templates?.aspect_ratio || (isInlineImg2ImgNode ? "" : inlineImageRatioOptions[0] || "1:1"))}
                  options={[
                    ...(isInlineImg2ImgNode ? [{ value: "", label: "跟随输入图尺寸" }] : []),
                    ...inlineImageRatioOptions.map((item) => ({ value: item, label: item })),
                  ]}
                  onChange={(nextValue) =>
                    updateData(node.id, {
                      templates: (() => {
                        const nextTemplates = { ...(node.data.templates || {}) };
                        const resolvedValue = String(nextValue || "").trim();
                        if (isInlineImg2ImgNode && !resolvedValue) {
                          delete nextTemplates.aspect_ratio;
                        } else {
                          nextTemplates.aspect_ratio = resolvedValue;
                        }
                        return nextTemplates;
                      })(),
                    })
                  }
                  placeholder="选择比例"
                />
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between px-1 text-[10px] font-medium uppercase tracking-[0.08em] text-slate-400">
                <span>生成数量</span>
                <span className="rounded-[10px] border border-[#E5E7EB] bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                  {node.data.batchSize || 1}
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="4"
                step="1"
                value={node.data.batchSize || 1}
                onMouseDown={(event) => event.stopPropagation()}
                onChange={(event) => updateData(node.id, { batchSize: parseInt(event.target.value, 10) || 1 })}
                className="h-3 w-full cursor-pointer appearance-none rounded-full bg-[linear-gradient(90deg,#cbd5e1,#e2e8f0)] accent-cyan-500"
              />
            </div>

            {inlineImageParamLoading ? <div className="text-[10px] text-slate-500">参数加载中...</div> : null}
            {inlineImageParamError ? <div className="text-[10px] text-amber-500">{inlineImageParamError}</div> : null}

            <button
              type="button"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onRunNode?.(node.id);
              }}
              disabled={!isReady || node.data.status === "loading"}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-cyan-500 bg-cyan-500 px-4 text-[12px] font-semibold text-white shadow-[0_12px_28px_rgba(6,182,212,0.22)] transition hover:border-cyan-600 hover:bg-cyan-600 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-300 disabled:shadow-none"
            >
              {node.data.status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {node.data.status === "loading" ? "运行中..." : "运行"}
            </button>

            {node.data.status === "loading" && onCancelNode ? (
              <button
                type="button"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onCancelNode?.();
                }}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-rose-200 bg-rose-50 px-4 text-[12px] font-semibold text-rose-600 transition hover:border-rose-300 hover:bg-rose-100 hover:text-rose-700"
                title="取消该节点生成"
              >
                <X className="h-4 w-4" />
                取消
              </button>
            ) : null}
          </div>
        </>
      ) : null}

      {node.data.status === "loading" ? (
        <div className="space-y-1.5 rounded-[22px] border border-slate-200 bg-slate-50 px-3 py-2.5">
          <div className="flex justify-between text-[10px] text-slate-600">
            <span className="flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> 处理中...
            </span>
            <span>
              {node.data.progress || 0}/{node.data.total || 0}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
            <div className="h-full bg-[linear-gradient(90deg,rgba(34,211,238,0.88),rgba(59,130,246,0.92))] transition-all duration-300" style={{ width: safeProgressWidth }} />
          </div>
        </div>
      ) : null}

      {!hideInlineAiResults && node.data.status === "success" && node.data.images && node.data.images.length > 0 ? (
        <div className="grid grid-cols-2 gap-1.5">
          {node.data.images.map((img, index) =>
            renderArtifactThumb(img, index, { mode: node.data.mode, prompt: node.data.prompt, model: node.data.model })
          )}
        </div>
      ) : null}

      {node.data.status === "success" && (isProcessor || isPostProcessor) && !isImageCreationNode ? (
        <button
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onContinue?.(node.id);
          }}
          className="flex w-full items-center justify-center gap-1 rounded-full border border-slate-200 bg-white py-2 text-[10px] text-slate-700 transition-colors hover:border-cyan-300 hover:bg-cyan-50"
          type="button"
        >
          <Film className="w-3 h-3" /> 生成视频 <ArrowRight className="w-3 h-3" />
        </button>
      ) : null}

      {node.data.status === "success" && isProcessor && !isImageCreationNode && (node.data.mode === "text2img" || node.data.mode === "local_text2img") ? (
        <button
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onIterateImg2Img?.(node.id);
          }}
          className="flex w-full items-center justify-center gap-1 rounded-full border border-slate-200 bg-white py-2 text-[10px] text-slate-700 transition-colors hover:border-cyan-300 hover:bg-cyan-50"
        >
          <ImageIcon className="w-3 h-3" /> 继续图生图 <ArrowRight className="w-3 h-3" />
        </button>
      ) : null}
    </div>
  );
}
