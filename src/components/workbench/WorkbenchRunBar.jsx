/**
 * WorkbenchRunBar — 画布右下角控制条
 * 从 Workbench.jsx 抽出（原 lines 8742–8812，Phase 3）
 *
 * viewport / nodes.length / connections.length / setViewport 直接从 canvasStore 读取，
 * 无需经过 Workbench.jsx prop-drilling。
 */
import React from "react";
import { Save, Plus, Minus, Maximize, FolderOpen, Layout } from "lucide-react";
import { useCanvasStore } from "../../stores/canvasStore.js";

export default function WorkbenchRunBar({
  onSave,         // saveCurrentCanvasAsWork
  onSaveNew,      // saveCurrentCanvasAsNewWork
  onShowAssets,   // () => setShowAssetLibrary(true)
  onArrange,      // arrangeCanvasNodes
  zoomCanvas,     // (delta) => void — 来自 useCanvas（含 DOM 坐标计算）
}) {
  const viewport = useCanvasStore((s) => s.viewport);
  const setViewport = useCanvasStore((s) => s.setViewport);
  const nodeCount = useCanvasStore((s) => s.nodes.length);
  const connectionCount = useCanvasStore((s) => s.connections.length);

  const hasContent = nodeCount > 0 || connectionCount > 0;

  return (
    <div className="absolute bottom-6 right-6 z-50 flex gap-2 select-none">
      {/* 保存 */}
      <div className="group relative">
        <button
          type="button"
          disabled={!hasContent}
          className={`relative inline-flex h-9 w-9 items-center justify-center rounded-[16px] transition-colors ${
            !hasContent
              ? "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400"
              : "wbn-icon-button-neutral hover:translate-y-[-1px]"
          }`}
          title="保存作品"
        >
          <Save className="h-3.5 w-3.5" />
        </button>
        {hasContent && (
          <div className="wbn-floating-strong pointer-events-none absolute bottom-[calc(100%-1px)] right-0 z-50 flex w-max gap-1 rounded-[18px] p-1 opacity-0 transition-all group-hover:pointer-events-auto group-hover:opacity-100">
            <button
              type="button"
              onClick={onSave}
              className="inline-flex items-center gap-1.5 rounded-[14px] px-3 py-2 text-[11px] text-slate-700 transition-colors hover:bg-cyan-50 hover:text-cyan-700"
              title="保存为当前作品的新版本"
            >
              <Save className="h-3.5 w-3.5" />
              保存作品
            </button>
            <button
              type="button"
              onClick={onSaveNew}
              className="inline-flex items-center gap-1.5 rounded-[14px] px-3 py-2 text-[11px] text-slate-700 transition-colors hover:bg-cyan-50 hover:text-cyan-700"
              title="另存为新作品"
            >
              <Plus className="h-3.5 w-3.5" />
              另存作品
            </button>
          </div>
        )}
      </div>

      {/* 资产库 */}
      <button
        type="button"
        onClick={onShowAssets}
        className="wbn-icon-button-neutral relative inline-flex items-center gap-1.5 rounded-[16px] px-3 py-2 text-[11px] transition-colors"
        title="打开资产库"
      >
        <FolderOpen className="h-3.5 w-3.5" />
        资产库
      </button>

      {/* 整理 */}
      <button
        type="button"
        onClick={onArrange}
        disabled={nodeCount === 0}
        className={`relative inline-flex items-center gap-1.5 rounded-[16px] px-3 py-2 text-[11px] transition-colors ${
          nodeCount === 0
            ? "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400"
            : "wbn-icon-button-neutral"
        }`}
        title="一键辅助整理排序"
      >
        <Layout className="h-3.5 w-3.5" />
        整理
      </button>

      {/* 缩放 */}
      <div className="wbn-floating relative flex items-center rounded-[16px] p-0.5 text-slate-500">
        <button
          onClick={() => zoomCanvas(-0.2)}
          className="relative rounded-[12px] p-1.5 transition-colors hover:bg-slate-100 hover:text-slate-900"
        >
          <Minus className="w-3 h-3" />
        </button>
        <span className="relative w-9 text-center text-[10px] font-mono text-slate-700">
          {Math.round(viewport.zoom * 100)}%
        </span>
        <button
          onClick={() => zoomCanvas(0.2)}
          className="relative rounded-[12px] p-1.5 transition-colors hover:bg-slate-100 hover:text-slate-900"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>

      {/* Reset view */}
      <button
        onClick={() => setViewport({ x: 0, y: 0, zoom: 1 })}
        className="wbn-icon-button-neutral relative rounded-[16px] p-2 transition-colors"
        title="Reset View"
      >
        <Maximize className="w-3 h-3" />
      </button>
    </div>
  );
}
