import React from "react";
import { Box, Clapperboard, FileText, Image, Sparkles, Type, Video } from "lucide-react";
import { NODE_TYPES } from "../../constants/workbench.jsx";

const renderNodeIcon = (node) => {
  const className = "h-3.5 w-3.5";
  if (node.type === NODE_TYPES.TEXT_INPUT) return <Type className={className} />;
  if (node.type === NODE_TYPES.INPUT) return <Image className={className} />;
  if (node.type === NODE_TYPES.OUTPUT) return <Box className={className} />;
  if (node.type === NODE_TYPES.VIDEO_GEN) return <Video className={className} />;
  if (node.type === NODE_TYPES.STORYBOARD_INPUT || node.type === NODE_TYPES.STORYBOARD_PLAN) return <Clapperboard className={className} />;
  if (node.type === NODE_TYPES.PROCESSOR || node.type === NODE_TYPES.POST_PROCESSOR) return <Sparkles className={className} />;
  return <FileText className={className} />;
};

const getStatusView = (status) => {
  if (status === "loading" || status === "running") return { className: "bg-cyan-500 wbn-status-running" };
  if (status === "success") return { className: "bg-emerald-500" };
  if (status === "error") return { className: "bg-rose-500" };
  return { className: "bg-gray-300" };
};

export default function NodeHeader({ node, title }) {
  const statusView = getStatusView(node.data?.status);

  return (
    <div className="wbn-node-header flex h-10 cursor-grab items-center justify-between gap-2 px-4 active:cursor-grabbing">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] bg-white text-slate-600">
          {renderNodeIcon(node)}
        </span>
        <span className="truncate text-[14px] font-medium text-gray-900">{title}</span>
      </div>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusView.className}`} />
    </div>
  );
}
