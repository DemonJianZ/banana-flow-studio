import { useCallback } from "react";
import { NODE_TYPES, TOOL_CARDS } from "../constants/workbench.jsx";

export function useWorkbenchHistoryReuse({
  nodes,
  selectedNodeIds,
  pushHistory,
  updateNodeData,
  setShowHistoryPanel,
}) {
  const applyHistoryConfig = useCallback((item) => {
    const targetCategory = TOOL_CARDS[item.mode]?.category;
    const targetType = targetCategory === "enhance" ? NODE_TYPES.POST_PROCESSOR : targetCategory === "video" ? NODE_TYPES.VIDEO_GEN : NODE_TYPES.PROCESSOR;
    const targetNodeId = Array.from(selectedNodeIds).find((id) => nodes.find((node) => node.id === id)?.type === targetType);
    if (!targetNodeId) {
      alert("请先在画布上选中一个匹配的节点，再点击复用。");
      return;
    }
    const targetNode = nodes.find((node) => node.id === targetNodeId);
    const nextTemplates = {
      ...(targetNode?.data?.templates || {}),
      ...(item.templates || {}),
      note: item.prompt || "",
    };
    pushHistory();
    updateNodeData(targetNodeId, {
      mode: item.mode,
      prompt: item.prompt,
      templates: nextTemplates,
      model: item.model || targetNode?.data?.model,
    });
    setShowHistoryPanel(false);
  }, [nodes, pushHistory, selectedNodeIds, setShowHistoryPanel, updateNodeData]);

  return { applyHistoryConfig };
}
