import { useEffect, useRef } from "react";
import { isPreviewableArtifact } from "../constants/workbench.jsx";

export function useWorkbenchShortcuts({
  activeArtifact,
  previewImage,
  nodes,
  toggleAgentHistoryPanel,
  setPreviewImage,
  setIsSpacePressed,
  undo,
  redo,
  setSelectedNodeIds,
  deleteSelection,
  zoomCanvas,
  setViewport,
}) {
  const previewOpenedBySpaceRef = useRef(false);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const lowerKey = event.key.toLowerCase();
      if (lowerKey === "e" && event.ctrlKey && event.shiftKey) {
        event.preventDefault();
        toggleAgentHistoryPanel();
        return;
      }
      if (["INPUT", "TEXTAREA"].includes(event.target.tagName)) return;
      switch (lowerKey) {
        case " ":
          if (
            !event.repeat &&
            isPreviewableArtifact(activeArtifact) &&
            activeArtifact?.kind === "image" &&
            !previewImage
          ) {
            event.preventDefault();
            previewOpenedBySpaceRef.current = true;
            setPreviewImage(activeArtifact.url);
            return;
          }
          if (!event.repeat) setIsSpacePressed(true);
          break;
        case "z":
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            event.shiftKey ? redo() : undo();
          }
          break;
        case "y":
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            redo();
          }
          break;
        case "a":
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            setSelectedNodeIds(new Set(nodes.map((node) => node.id)));
          }
          break;
        case "delete":
        case "backspace":
          deleteSelection();
          break;
        case "=":
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            zoomCanvas(0.2);
          }
          break;
        case "-":
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            zoomCanvas(-0.2);
          }
          break;
        case "0":
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            setViewport({ x: 0, y: 0, zoom: 1 });
          }
          break;
        default:
          break;
      }
    };

    const handleKeyUp = (event) => {
      if (event.key !== " ") return;
      if (previewOpenedBySpaceRef.current) {
        previewOpenedBySpaceRef.current = false;
        setPreviewImage((current) => (current === activeArtifact?.url ? null : current));
        return;
      }
      setIsSpacePressed(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [activeArtifact, deleteSelection, nodes, previewImage, redo, setIsSpacePressed, setPreviewImage, setSelectedNodeIds, setViewport, toggleAgentHistoryPanel, undo, zoomCanvas]);
}
