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
  const portTone =
    node.type === NODE_TYPES.TEXT_INPUT
      ? { fill: "bg-blue-500", border: "border-blue-500", hover: "hover:bg-blue-500", ring: "ring-blue-200/80" }
      : node.type === NODE_TYPES.INPUT || node.type === NODE_TYPES.OUTPUT
      ? { fill: "bg-violet-500", border: "border-violet-500", hover: "hover:bg-violet-500", ring: "ring-violet-200/80" }
      : { fill: "bg-cyan-500", border: "border-cyan-500", hover: "hover:bg-cyan-500", ring: "ring-cyan-200/80" };

  return (
    <>
      <div className="pointer-events-none absolute top-1/2 flex w-full -translate-y-1/2 justify-between px-0">
        {showInputPort ? (
          <div className="pointer-events-auto relative -translate-x-[5px]">
            <div
              onMouseEnter={() => onConnectTargetHover?.(VIDEO_GEN_INPUT_HANDLE_MAIN)}
              onMouseLeave={() => onConnectTargetLeave?.(VIDEO_GEN_INPUT_HANDLE_MAIN)}
              className={`wbn-port z-20 h-2.5 w-2.5 cursor-crosshair rounded-full border-2 transition-transform duration-150 hover:scale-[1.28] ${
                isMainInputTargetHighlighted
                  ? `wbn-port-active border-white ${portTone.fill} ring-4 ${portTone.ring}`
                  : `${portTone.border} bg-white ${portTone.hover}`
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
            className={`wbn-port pointer-events-auto z-20 ml-auto h-2.5 w-2.5 translate-x-[5px] cursor-crosshair rounded-full border-2 ${portTone.border} bg-white transition-transform duration-150 hover:scale-[1.28] ${portTone.hover}`}
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
          <div className="pointer-events-auto relative -translate-x-[5px] translate-y-10">
            <div
              onMouseEnter={() => onConnectTargetHover?.(VIDEO_GEN_INPUT_HANDLE_LAST_FRAME)}
              onMouseLeave={() => onConnectTargetLeave?.(VIDEO_GEN_INPUT_HANDLE_LAST_FRAME)}
              className={`wbn-port z-20 h-2.5 w-2.5 cursor-crosshair rounded-full border-2 transition-transform duration-150 hover:scale-[1.28] ${
                isLastFrameTargetHighlighted
                  ? "wbn-port-active border-white bg-rose-500 ring-4 ring-rose-200/80"
                  : "border-rose-500 bg-white hover:bg-rose-500"
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
