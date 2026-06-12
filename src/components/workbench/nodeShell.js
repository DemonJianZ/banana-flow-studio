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
  isDragging,
}) {
  return {
    // left/top 始终保留作为静止基准；拖拽时 rAF 在此基础上叠加 style.transform 提供位移。
    // React 的 style diff 从不写 transform 字段，不会覆盖命令式赋值。
    left: node.x,
    top: node.y,
    willChange: isDragging ? "transform" : undefined,
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
    return `absolute wbn-node w-[320px] overflow-hidden border flex flex-col transition-colors duration-200 ${
      node.data.status === "error" ? "border-rose-300" : selected ? "border-cyan-300" : ""
    } ${selectedNodeShellClass}`;
  }
  if (isStoryboardInputNode) {
    return `absolute wbn-node w-[380px] overflow-hidden border flex flex-col transition-colors duration-200 ${
      node.data.status === "error"
        ? "border-rose-300"
        : node.data.status === "running"
        ? "border-cyan-300 ring-1 ring-cyan-100"
        : selected
        ? "border-cyan-300"
        : ""
    } ${selectedNodeShellClass}`;
  }
  if (isRoleInputNode) {
    return `absolute wbn-node h-[76px] w-[76px] overflow-visible rounded-full border shadow-[0_16px_36px_rgba(15,23,42,0.12)] flex items-center justify-center transition-colors duration-200 ${
      selected ? "border-cyan-300" : "border-white"
    } ${selectedNodeShellClass}`;
  }
  if (isRoleStructurerNode) {
    return `absolute wbn-node w-[360px] overflow-hidden border flex flex-col transition-colors duration-200 ${
      node.data.status === "error" ? "border-rose-300" : selected ? "border-cyan-300" : ""
    } ${selectedNodeShellClass}`;
  }
  if (isOutput) {
    return `absolute wbn-node w-[240px] overflow-hidden border flex flex-col transition-colors duration-200 ${
      selected ? "border-cyan-300" : ""
    } ${selectedNodeShellClass}`;
  }
  if (isStoryboardPlanNode) {
    return `absolute wbn-node w-[1280px] max-w-[1280px] overflow-hidden border flex flex-col transition-colors duration-200 ${
      node.data.status === "error" ? "border-rose-300" : selected ? "border-cyan-300" : ""
    } ${selectedNodeShellClass}`;
  }
  if (isLocalAssetImageNode) {
    return `absolute wbn-node w-[200px] overflow-visible border flex flex-col transition-colors duration-200 ${
      selected ? "border-cyan-300" : ""
    } ${selectedNodeShellClass}`;
  }
  if (isInlineImageGenNode || isSimpleMediaInputNode) {
    // frameless：agent 生成图片添加到画布时不显示外框
    if (node.data?.frameless) {
      return `absolute wbn-node w-[280px] overflow-hidden flex flex-col transition-colors duration-200 ${
        selected ? "ring-2 ring-cyan-300" : ""
      } ${selectedNodeShellClass}`;
    }
    return `absolute wbn-node w-[280px] overflow-hidden border flex flex-col transition-colors duration-200 ${
      selected ? "border-cyan-300" : ""
    } ${selectedNodeShellClass}`;
  }
  return `absolute wbn-node ${isCompactInput ? "w-[292px] overflow-visible" : "w-[280px] overflow-hidden"} border flex flex-col transition-colors transition-shadow duration-200 ${statusColor}`;
}

export function isNodeType(type, nodeType) {
  return type === NODE_TYPES[nodeType];
}
