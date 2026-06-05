import React from "react";
import { Plus } from "lucide-react";
import { NODE_TYPES, VIDEO_GEN_INPUT_HANDLE_LAST_FRAME, VIDEO_GEN_INPUT_HANDLE_MAIN } from "../../constants/workbench.jsx";

export default function NodePorts({
  node,
  isTextInputNode,
  isStoryboardInputNode,
  isStoryboardPlanNode,
  isRoleInputNode,
  isLocalAssetImageNode,
  isMainInputTargetHighlighted,
  isLastFrameTargetHighlighted,
  hasDedicatedLastFrameInput,
  onConnectStart,
  onConnectTargetHover,
  onConnectTargetLeave,
  onQuickCreateFromText,
}) {
  const showInputPort =
    node.type !== NODE_TYPES.INPUT &&
    !isTextInputNode &&
    !isStoryboardInputNode &&
    !isStoryboardPlanNode &&
    !isRoleInputNode &&
    !isLocalAssetImageNode;
  const showOutputPort = !isStoryboardPlanNode && !isLocalAssetImageNode;

  return (
    <>
      <div className="pointer-events-none absolute top-1/2 flex w-full -translate-y-1/2 justify-between px-0">
        {showInputPort ? (
          <div className="pointer-events-auto relative -translate-x-1/2">
            <div
              onMouseEnter={() => onConnectTargetHover?.(VIDEO_GEN_INPUT_HANDLE_MAIN)}
              onMouseLeave={() => onConnectTargetLeave?.(VIDEO_GEN_INPUT_HANDLE_MAIN)}
              className={`z-20 h-3 w-3 cursor-crosshair rounded-full border bg-white shadow-[0_0_0_2px_rgba(255,255,255,0.9)] transition-transform duration-150 hover:scale-[1.55] ${
                isMainInputTargetHighlighted
                  ? "border-cyan-500 bg-cyan-50 ring-4 ring-cyan-200/80 shadow-[0_0_0_6px_rgba(34,211,238,0.14)]"
                  : "border-slate-300 hover:border-cyan-400 hover:bg-cyan-50"
              }`}
            />
            {isMainInputTargetHighlighted ? (
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-cyan-200 bg-white px-2 py-1 text-[10px] font-medium text-cyan-700 shadow-[0_8px_20px_rgba(15,23,42,0.08)]">
                松手连接
              </span>
            ) : null}
          </div>
        ) : null}

        {showOutputPort ? (
          <div
            onMouseDown={onConnectStart}
            className="pointer-events-auto z-20 ml-auto h-3 w-3 translate-x-1/2 cursor-crosshair rounded-full border border-slate-300 bg-white shadow-[0_0_0_2px_rgba(255,255,255,0.9)] transition-transform duration-150 hover:scale-[1.55] hover:border-cyan-400 hover:bg-cyan-50"
          />
        ) : null}

        {isTextInputNode ? (
          <div className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-30 flex w-[92px] -translate-y-1/2 flex-col gap-3 py-8 opacity-0 transition-all duration-150 group-hover/node:pointer-events-auto group-hover/node:opacity-100 hover:opacity-100">
            <div className="nodrag flex flex-col gap-3">
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border border-cyan-200 bg-white px-2.5 text-[11px] font-medium text-cyan-700 shadow-[0_12px_26px_rgba(15,23,42,0.12)] transition hover:-translate-y-0.5 hover:bg-cyan-50"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onQuickCreateFromText?.(node.id, "image");
                }}
              >
                <Plus className="h-3 w-3" />
                <span>生图</span>
              </button>
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border border-rose-200 bg-white px-2.5 text-[11px] font-medium text-rose-700 shadow-[0_12px_26px_rgba(15,23,42,0.12)] transition hover:-translate-y-0.5 hover:bg-rose-50"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onQuickCreateFromText?.(node.id, "video");
                }}
              >
                <Plus className="h-3 w-3" />
                <span>生视频</span>
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {hasDedicatedLastFrameInput ? (
        <div className="pointer-events-none absolute inset-y-0 left-0 flex w-full items-center justify-between px-0">
          <div className="pointer-events-auto relative -translate-x-1/2 translate-y-10">
            <div
              onMouseEnter={() => onConnectTargetHover?.(VIDEO_GEN_INPUT_HANDLE_LAST_FRAME)}
              onMouseLeave={() => onConnectTargetLeave?.(VIDEO_GEN_INPUT_HANDLE_LAST_FRAME)}
              className={`z-20 h-3 w-3 cursor-crosshair rounded-full border bg-white shadow-[0_0_0_2px_rgba(255,255,255,0.9)] transition-transform duration-150 hover:scale-[1.55] ${
                isLastFrameTargetHighlighted
                  ? "border-rose-500 bg-rose-50 ring-4 ring-rose-200/80 shadow-[0_0_0_6px_rgba(251,113,133,0.16)]"
                  : "border-rose-300 hover:border-rose-400 hover:bg-rose-50"
              }`}
              title="连接尾帧"
            />
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 whitespace-nowrap text-[10px] font-medium text-slate-400">
              {isLastFrameTargetHighlighted ? "松手连接尾帧" : "尾帧"}
            </span>
          </div>
        </div>
      ) : null}
    </>
  );
}
