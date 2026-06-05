import { NODE_TYPES, TOOL_CARDS, getReferenceNodeTitle, normalizeInputMediaKind } from "../../constants/workbench.jsx";

export function getNodeTitle({
  node,
  isInput,
  isCompactInput,
  isOutput,
  isProcessor,
  isPostProcessor,
  isVideoGen,
  isTextInputNode,
  isStoryboardInputNode,
  isRoleStructurerNode,
  isLocalAssetImageNode,
}) {
  if (isInput) {
    const mediaKind = normalizeInputMediaKind(node.data.mediaKind);
    const defaultInputTitle = isCompactInput
      ? "图片编辑区"
      : mediaKind === "image"
      ? getReferenceNodeTitle("image")
      : mediaKind === "video"
      ? getReferenceNodeTitle("video")
      : getReferenceNodeTitle("mixed");
    return node.data.title || defaultInputTitle;
  }
  if (isOutput) return node.data.title || (node.data.angleLabel ? `${node.data.angleLabel} 输出` : "输出");
  if (isProcessor) return node.data.title || TOOL_CARDS[node.data.mode]?.name || "图片生成";
  if (isPostProcessor) return node.data.title || TOOL_CARDS[node.data.mode]?.name || "后期增强";
  if (isVideoGen) return node.data.title || TOOL_CARDS[node.data.mode]?.name || "视频生成";
  if (isTextInputNode) return "提示词";
  if (isStoryboardInputNode) return "故事板输入";
  if (isRoleStructurerNode) return "角色结构化";
  if (isLocalAssetImageNode) return String(node.data?.title || node.data?.character_name || "本地素材").trim();
  return "Node";
}

export function getNodeShellStyle({
  node,
  isVideoGen,
  selected,
  isStoryboardPlanNode,
  isStoryboardInputNode,
  isLocalAssetImageNode,
}) {
  return {
    left: node.x,
    top: node.y,
    zIndex: isVideoGen ? 120 : selected ? 20 : undefined,
    ...(isStoryboardPlanNode
      ? { width: 1280, maxWidth: 1280 }
      : isStoryboardInputNode
      ? { width: 380, maxWidth: 380 }
      : isLocalAssetImageNode
      ? { width: 200, maxWidth: 200 }
      : {}),
  };
}

export function getNodeShellClass({
  node,
  selected,
  selectedNodeShellClass,
  statusColor,
  isTextInputNode,
  isStoryboardInputNode,
  isRoleInputNode,
  isRoleStructurerNode,
  isOutput,
  isStoryboardPlanNode,
  isLocalAssetImageNode,
  isInlineImageGenNode,
  isSimpleMediaInputNode,
  isCompactInput,
}) {
  if (isTextInputNode) {
    return `absolute w-[320px] overflow-visible rounded-[16px] border bg-white shadow-[0_18px_42px_rgba(15,23,42,0.08)] flex flex-col transition-colors duration-200 ${
      node.data.status === "error" ? "border-rose-300" : selected ? "border-cyan-300" : "border-slate-200"
    } ${selectedNodeShellClass}`;
  }
  if (isStoryboardInputNode) {
    return `absolute w-[380px] overflow-visible rounded-[20px] border bg-white shadow-[0_20px_46px_rgba(15,23,42,0.10)] flex flex-col transition-colors duration-200 ${
      node.data.status === "error"
        ? "border-rose-300"
        : node.data.status === "running"
        ? "border-cyan-300 ring-1 ring-cyan-100"
        : selected
        ? "border-cyan-300"
        : "border-slate-200"
    } ${selectedNodeShellClass}`;
  }
  if (isRoleInputNode) {
    return `absolute h-[76px] w-[76px] overflow-visible rounded-full border bg-white shadow-[0_16px_36px_rgba(15,23,42,0.12)] flex items-center justify-center transition-colors duration-200 ${
      selected ? "border-cyan-300" : "border-white"
    } ${selectedNodeShellClass}`;
  }
  if (isRoleStructurerNode) {
    return `absolute w-[360px] overflow-visible rounded-[22px] border bg-white shadow-[0_18px_42px_rgba(15,23,42,0.08)] flex flex-col transition-colors duration-200 ${
      node.data.status === "error" ? "border-rose-300" : selected ? "border-cyan-300" : "border-slate-200"
    } ${selectedNodeShellClass}`;
  }
  if (isOutput) {
    return `absolute w-[280px] overflow-visible rounded-[16px] border bg-white shadow-[0_14px_30px_rgba(15,23,42,0.06)] flex flex-col transition-colors duration-200 ${
      selected ? "border-cyan-300" : "border-[#E5E7EB]"
    } ${selectedNodeShellClass}`;
  }
  if (isStoryboardPlanNode) {
    return `absolute w-[1280px] max-w-[1280px] overflow-visible rounded-[18px] border bg-white shadow-[0_24px_56px_rgba(15,23,42,0.10)] flex flex-col transition-colors duration-200 ${
      node.data.status === "error" ? "border-rose-300" : selected ? "border-cyan-300" : "border-slate-200"
    } ${selectedNodeShellClass}`;
  }
  if (isLocalAssetImageNode) {
    return `absolute w-[200px] overflow-visible rounded-[14px] border bg-white shadow-[0_8px_24px_rgba(15,23,42,0.08)] flex flex-col transition-colors duration-200 ${
      selected ? "border-cyan-300" : "border-slate-200"
    } ${selectedNodeShellClass}`;
  }
  if (isInlineImageGenNode || isSimpleMediaInputNode) {
    return `absolute w-[280px] overflow-visible rounded-[16px] border bg-white shadow-[0_14px_30px_rgba(15,23,42,0.06)] flex flex-col transition-colors duration-200 ${
      selected ? "border-cyan-300" : "border-[#E5E7EB]"
    } ${selectedNodeShellClass}`;
  }
  return `absolute ${isCompactInput ? "w-[292px] overflow-visible rounded-[16px] border-slate-200" : "w-[280px] overflow-visible rounded-[16px]"} border bg-white backdrop-blur-xl shadow-[0_24px_56px_rgba(15,23,42,0.12)] flex flex-col transition-colors transition-shadow duration-200 ${statusColor}`;
}

export function isNodeType(type, nodeType) {
  return type === NODE_TYPES[nodeType];
}
