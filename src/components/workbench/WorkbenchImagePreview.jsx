/**
 * WorkbenchImagePreview — 全屏图片/视频预览 lightbox
 * 从 Workbench.jsx 抽出（原 lines 10114–10135，Phase 3）
 */
import React from "react";
import { X } from "lucide-react";
import { isVideoContent } from "../../lib/mediaType.js";
import VideoPlayer from "./VideoPlayer";

export default function WorkbenchImagePreview({ url, onClose }) {
  if (!url) return null;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-white/60 backdrop-blur-sm p-10"
      onClick={onClose}
    >
      <div
        className="relative max-w-full max-h-full flex items-center justify-center"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {isVideoContent(url) ? (
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <VideoPlayer
              src={url}
              className="max-w-full max-h-[90vh] rounded-lg shadow-2xl border border-slate-200 bg-white"
              controls
              autoPlay
            />
            <button
              className="absolute -top-12 right-0 text-slate-500 hover:text-slate-900 transition-colors bg-white/90 border border-slate-200 p-2 rounded-full hover:bg-slate-50"
              onClick={onClose}
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        ) : (
          <>
            <img
              src={url}
              className="max-w-full max-h-[90vh] rounded-lg shadow-2xl border border-slate-200 object-contain"
              alt="Preview"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              className="absolute -top-12 right-0 text-slate-500 hover:text-slate-900 transition-colors bg-white/90 border border-slate-200 p-2 rounded-full hover:bg-slate-50"
              onClick={onClose}
            >
              <X className="w-6 h-6" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
