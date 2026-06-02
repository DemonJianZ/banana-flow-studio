/**
 * WorkbenchHistoryPanel — API 任务历史记录弹窗
 * 从 Workbench.jsx 抽出（原 lines 9445–9576，Phase 3）
 */
import React from "react";
import { X, ChevronUp, ChevronDown, RefreshCw } from "lucide-react";
import { isVideoContent } from "../../lib/mediaType.js";
import VideoPlayer from "./VideoPlayer";
import { TOOL_CARDS } from "../../constants/workbench.jsx";

export default function WorkbenchHistoryPanel({
  show,
  onClose,
  activeTab,
  setActiveTab,
  history,           // apiHistory
  expandedIds,       // expandedHistoryIds (Set)
  setExpandedIds,    // setExpandedHistoryIds
  stats,             // apiStats
  normalizeOutputs,  // normalizeHistoryOutputs
  normalizeInputs,   // normalizeHistoryInputs
  formatParams,      // formatHistoryParams
  onPreview,         // setPreviewImage
  onReuse,           // applyHistoryConfig
}) {
  if (!show) return null;

  const renderHistoryMedia = (media, title) => {
    if (!media || media.length === 0) {
      return (
        <div className="w-full h-28 rounded-lg border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center text-[11px] text-slate-500">
          暂无{title}
        </div>
      );
    }
    return (
      <div className="grid grid-cols-2 gap-2">
        {media.map((item, idx) => {
          const isVideo = isVideoContent(item.url);
          return (
            <button
              key={`${title}-${idx}`}
              type="button"
              onClick={() => onPreview(item.url)}
              className="relative block w-full h-28 rounded-lg border border-slate-200 overflow-hidden bg-slate-100"
              title="点击放大预览"
            >
              {isVideo ? (
                <VideoPlayer src={item.url} className="w-full h-full object-cover" controls />
              ) : (
                <img src={item.url} alt={item.label || title} className="w-full h-full object-cover" />
              )}
              {item.label && (
                <span className="absolute left-1 top-1 text-[10px] px-1.5 py-0.5 rounded border border-slate-200 bg-white/90 text-slate-700">
                  {item.label}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-white/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[600px] bg-white border border-slate-200 rounded-2xl shadow-[0_28px_64px_rgba(15,23,42,0.14)] flex flex-col max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <div className="flex gap-4">
            <button
              onClick={() => setActiveTab("recent")}
              className={`text-sm font-bold pb-1 border-b-2 transition-colors ${activeTab === "recent" ? "border-cyan-300 text-cyan-700" : "border-transparent text-slate-500"}`}
            >
              最近任务
            </button>
            <button
              onClick={() => setActiveTab("stats")}
              className={`text-sm font-bold pb-1 border-b-2 transition-colors ${activeTab === "stats" ? "border-cyan-300 text-cyan-700" : "border-transparent text-slate-500"}`}
            >
              数据趋势
            </button>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-[#fbfbf8]">
          {activeTab === "recent" ? (
            <div className="space-y-3">
              {history.length === 0 && (
                <div className="text-center text-slate-500 py-8">暂无历史记录</div>
              )}
              {history.map((item, i) => {
                const inputMedia = normalizeInputs(item.inputs);
                const outputMedia = normalizeOutputs(item.outputs);
                const paramRows = formatParams(item.inputs);
                const itemKey = item.id || String(i);
                const isExpanded = expandedIds.has(itemKey);
                return (
                  <div
                    key={i}
                    className="bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors space-y-3"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded uppercase">
                          {TOOL_CARDS[item.mode]?.short || item.mode}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {new Date(item.time).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setExpandedIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(itemKey)) next.delete(itemKey);
                              else next.add(itemKey);
                              return next;
                            });
                          }}
                          className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded transition-colors flex items-center gap-1"
                        >
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          详情
                        </button>
                        <button
                          onClick={() => onReuse(item)}
                          className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded transition-colors flex items-center gap-1"
                        >
                          <RefreshCw className="w-3 h-3" /> 复用
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <div className="text-[11px] text-slate-500">输入内容</div>
                        {renderHistoryMedia(inputMedia, "输入")}
                        <div className="mt-2 text-[11px] text-slate-400 whitespace-pre-wrap break-words">
                          <span className="text-slate-500">提示词：</span>
                          {item.final_prompt || item.prompt || "(无)"}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="text-[11px] text-slate-500">输出结果</div>
                        {renderHistoryMedia(outputMedia, "输出")}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-slate-200 pt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <div className="text-[11px] text-slate-500 mb-2">输入参数</div>
                          {paramRows.length === 0 ? (
                            <div className="text-[11px] text-slate-600">无可显示参数</div>
                          ) : (
                            <div className="grid grid-cols-1 gap-1 text-[11px] text-slate-600">
                              {paramRows.map((row) => (
                                <div
                                  key={row.key}
                                  className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded px-2 py-1"
                                >
                                  <span className="text-slate-500">{row.key}</span>
                                  <span className="text-slate-700 break-all">{String(row.value)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="text-[11px] text-slate-500 mb-2">输出信息</div>
                          <div className="text-[11px] text-slate-700 bg-slate-50 border border-slate-200 rounded px-2 py-2">
                            {outputMedia.length > 0 ? `输出数量：${outputMedia.length}` : "无输出"}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">热门模式分布</h4>
                <div className="space-y-2">
                  {stats &&
                    Object.entries(stats.modes || {}).map(([mode, count]) => (
                      <div key={mode} className="flex items-center gap-3">
                        <div className="w-24 text-xs text-slate-500 truncate text-right">
                          {TOOL_CARDS[mode]?.short || mode}
                        </div>
                        <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500" style={{ width: `${Math.min((count / 20) * 100, 100)}%` }} />
                        </div>
                        <div className="w-8 text-xs text-slate-500">{count}次</div>
                      </div>
                    ))}
                </div>
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                  高频关键词 (灵感库)
                </h4>
                <div className="flex flex-wrap gap-2">
                  {(stats?.keywords || []).map((word, i) => (
                    <span
                      key={i}
                      className="text-xs bg-white border border-slate-200 px-2 py-1 rounded-full text-slate-600 hover:text-slate-900 hover:border-slate-300 cursor-pointer transition-colors"
                    >
                      #{word}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
