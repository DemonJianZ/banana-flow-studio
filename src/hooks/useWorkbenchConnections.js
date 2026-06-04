import { useCallback, useEffect } from "react";
import {
  VIDEO_GEN_INPUT_HANDLE_MAIN,
  normalizeConnectionTargetHandle,
} from "../constants/workbench.jsx";

const generateId = () => Math.random().toString(36).slice(2, 11);

export function useWorkbenchConnections({
  connectingSource,
  setConnectingSource,
  connectionsRef,
  setConnections,
  connectionDragSelectionRef,
  connectionHoverTargetRef,
  setHoveredConnectTarget,
}) {
  const startConnection = useCallback((event, nodeId) => {
    event.preventDefault();
    event.stopPropagation();
    connectionHoverTargetRef.current = null;
    setHoveredConnectTarget(null);
    const rect = event.currentTarget.getBoundingClientRect();
    setConnectingSource({ nodeId, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
  }, [connectionHoverTargetRef, setConnectingSource, setHoveredConnectTarget]);

  const completeConnection = useCallback((targetNodeId, toHandle = VIDEO_GEN_INPUT_HANDLE_MAIN) => {
    const normalizedToHandle = normalizeConnectionTargetHandle(toHandle);
    if (
      connectingSource &&
      connectingSource.nodeId !== targetNodeId &&
      !connectionsRef.current.find(
        (connection) =>
          connection.from === connectingSource.nodeId &&
          connection.to === targetNodeId &&
          normalizeConnectionTargetHandle(connection.toHandle) === normalizedToHandle,
      )
    ) {
      setConnections((prev) => [
        ...prev,
        { id: generateId(), from: connectingSource.nodeId, to: targetNodeId, toHandle: normalizedToHandle },
      ]);
    }
    connectionHoverTargetRef.current = null;
    setHoveredConnectTarget(null);
    setConnectingSource(null);
  }, [connectingSource, connectionHoverTargetRef, connectionsRef, setConnectingSource, setConnections, setHoveredConnectTarget]);

  const handleConnectionTargetHover = useCallback((targetNodeId, toHandle = VIDEO_GEN_INPUT_HANDLE_MAIN) => {
    if (!connectingSource) return;
    const nextTarget = {
      nodeId: targetNodeId,
      toHandle: normalizeConnectionTargetHandle(toHandle),
    };
    connectionHoverTargetRef.current = nextTarget;
    setHoveredConnectTarget(nextTarget);
  }, [connectingSource, connectionHoverTargetRef, setHoveredConnectTarget]);

  const handleConnectionTargetLeave = useCallback((targetNodeId, toHandle = VIDEO_GEN_INPUT_HANDLE_MAIN) => {
    const normalizedToHandle = normalizeConnectionTargetHandle(toHandle);
    if (
      connectionHoverTargetRef.current?.nodeId === targetNodeId &&
      normalizeConnectionTargetHandle(connectionHoverTargetRef.current?.toHandle) === normalizedToHandle
    ) {
      connectionHoverTargetRef.current = null;
      setHoveredConnectTarget(null);
    }
  }, [connectionHoverTargetRef, setHoveredConnectTarget]);

  useEffect(() => {
    if (!connectingSource) {
      const bodyStyle = document.body?.style;
      if (bodyStyle) {
        bodyStyle.userSelect = connectionDragSelectionRef.current.userSelect;
        bodyStyle.webkitUserSelect = connectionDragSelectionRef.current.webkitUserSelect;
      }
      return undefined;
    }

    const bodyStyle = document.body?.style;
    if (bodyStyle) {
      connectionDragSelectionRef.current = {
        userSelect: bodyStyle.userSelect,
        webkitUserSelect: bodyStyle.webkitUserSelect,
      };
      bodyStyle.userSelect = "none";
      bodyStyle.webkitUserSelect = "none";
    }

    const cleanupConnectionDrag = () => {
      const hoverTarget = connectionHoverTargetRef.current;
      if (hoverTarget?.nodeId) {
        completeConnection(hoverTarget.nodeId, hoverTarget.toHandle);
        return;
      }
      connectionHoverTargetRef.current = null;
      setHoveredConnectTarget(null);
      setConnectingSource(null);
    };

    window.addEventListener("mouseup", cleanupConnectionDrag);
    window.addEventListener("pointerup", cleanupConnectionDrag);
    window.addEventListener("blur", cleanupConnectionDrag);

    return () => {
      window.removeEventListener("mouseup", cleanupConnectionDrag);
      window.removeEventListener("pointerup", cleanupConnectionDrag);
      window.removeEventListener("blur", cleanupConnectionDrag);
      if (bodyStyle) {
        bodyStyle.userSelect = connectionDragSelectionRef.current.userSelect;
        bodyStyle.webkitUserSelect = connectionDragSelectionRef.current.webkitUserSelect;
      }
    };
  }, [completeConnection, connectingSource, connectionDragSelectionRef, connectionHoverTargetRef, setConnectingSource, setHoveredConnectTarget]);

  return {
    startConnection,
    handleConnectionTargetHover,
    handleConnectionTargetLeave,
  };
}
