import { useCallback, useEffect } from "react";
import { NODE_TYPES } from "../constants/workbench.jsx";
import { useCanvasStore } from "../stores/canvasStore.js";

export function useWorkbenchCanvasFocus({
  canvasRef,
  nodesRef,
  selectedNodeIds,
  setActiveNodeId,
  setSelectedConnectionIds,
  setSelectedNodeIds,
  setViewport,
  showRunToast,
  viewportRef,
  pushHistory,
}) {
  useEffect(() => {
    if (useCanvasStore.getState()._history.length === 0) {
      pushHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedNodeIds.size === 1) setActiveNodeId(Array.from(selectedNodeIds)[0]);
    else setActiveNodeId(null);
  }, [selectedNodeIds, setActiveNodeId]);

  const focusCanvasNode = useCallback((nodeId) => {
    const focusNode = (targetNode) => {
      if (!targetNode) return;

      const width =
        targetNode.type === NODE_TYPES.STORYBOARD_PLAN
          ? 1280
          : targetNode.type === NODE_TYPES.TEXT_INPUT
          ? 320
          : targetNode.type === NODE_TYPES.STORYBOARD_INPUT
          ? 380
          : targetNode.type === NODE_TYPES.ROLE_INPUT
          ? 76
          : 280;
      const height =
        targetNode.type === NODE_TYPES.STORYBOARD_PLAN
          ? 620
          : targetNode.type === NODE_TYPES.STORYBOARD_INPUT
          ? 260
          : targetNode.type === NODE_TYPES.ROLE_INPUT
          ? 76
          : 200;

      setSelectedNodeIds(new Set([targetNode.id]));
      setSelectedConnectionIds(new Set());
      setActiveNodeId(targetNode.id);

      const canvasEl = canvasRef.current;
      if (!canvasEl) return;
      const zoom = viewportRef.current?.zoom || 1;
      const centerX = Number(targetNode.x || 0) + width / 2;
      const centerY = Number(targetNode.y || 0) + height / 2;
      setViewport((prev) => ({
        ...prev,
        x: canvasEl.clientWidth / 2 - centerX * zoom,
        y: canvasEl.clientHeight / 2 - centerY * zoom,
      }));
    };

    const normalizedNodeId = String(nodeId || "").trim();
    const currentNodes = nodesRef.current || [];
    const directTarget = normalizedNodeId
      ? currentNodes.find((node) => node.id === normalizedNodeId)
      : null;
    if (directTarget) {
      focusNode(directTarget);
      return;
    }

    const latestStoryboardNode = [...currentNodes].reverse().find((node) => node.type === NODE_TYPES.STORYBOARD_PLAN);
    if (latestStoryboardNode) {
      focusNode(latestStoryboardNode);
      return;
    }

    showRunToast({ message: "未找到可定位的分镜节点", type: "info" });
  }, [canvasRef, nodesRef, setActiveNodeId, setSelectedConnectionIds, setSelectedNodeIds, setViewport, showRunToast, viewportRef]);

  return { focusCanvasNode };
}
