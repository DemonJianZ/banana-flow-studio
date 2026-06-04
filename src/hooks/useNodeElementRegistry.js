import { useCallback } from "react";

export function useNodeElementRegistry(nodeElementMapRef) {
  const handleNodeElementChange = useCallback((nodeId, element) => {
    if (!nodeId) return;
    if (element) {
      nodeElementMapRef.current.set(nodeId, element);
    } else {
      nodeElementMapRef.current.delete(nodeId);
    }
  }, [nodeElementMapRef]);

  return { handleNodeElementChange };
}
