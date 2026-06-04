import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { stripStoryboardDisplayIds } from "../constants/workbench.jsx";

export function useWorkbenchStoryboardHover({ activeArtifact }) {
  const [hoveredStoryboardAssetCard, setHoveredStoryboardAssetCard] = useState(null);
  const [hoveredStoryboardShotCard, setHoveredStoryboardShotCard] = useState(null);
  const storyboardAssetHoverCloseTimerRef = useRef(null);
  const storyboardShotHoverCloseTimerRef = useRef(null);

  useEffect(() => () => {
    if (storyboardAssetHoverCloseTimerRef.current) {
      window.clearTimeout(storyboardAssetHoverCloseTimerRef.current);
      storyboardAssetHoverCloseTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => {
    if (storyboardShotHoverCloseTimerRef.current) {
      window.clearTimeout(storyboardShotHoverCloseTimerRef.current);
      storyboardShotHoverCloseTimerRef.current = null;
    }
  }, []);

  const selectedStoryboardTarget = useMemo(() => {
    if (String(activeArtifact?.kind || "").trim() !== "storyboard_selection") return null;
    const meta = activeArtifact?.meta && typeof activeArtifact.meta === "object" ? activeArtifact.meta : {};
    const typeLabelMap = {
      entity: "角色/主体",
      scene: "场景",
      shot: "镜头",
    };
    return {
      type: String(meta.selectionType || "").trim(),
      typeLabel: typeLabelMap[String(meta.selectionType || "").trim()] || "故事板片段",
      label: String(meta.selectionLabel || "").trim() || "故事板片段",
      summary: String(meta.selectionSummary || "").trim(),
      fromNodeId: String(activeArtifact?.fromNodeId || "").trim(),
    };
  }, [activeArtifact]);

  const resolveStoryboardAssetForMention = useCallback((storyboardNode, mentionEntry) => {
    if (!storyboardNode || !mentionEntry?.assetType) return null;
    const plan = storyboardNode.data?.storyboard_plan || {};
    const entities = plan?.entities || {};
    const collection = Array.isArray(entities?.[mentionEntry.assetType]) ? entities[mentionEntry.assetType] : [];
    const assetId = String(mentionEntry.assetId || "").trim();
    const assetName = stripStoryboardDisplayIds(mentionEntry.assetName || mentionEntry.term || "");
    return (
      collection.find((item) => String(item?.entity_id || "").trim() === assetId) ||
      collection.find((item) => stripStoryboardDisplayIds(item?.name || "") === assetName) ||
      null
    );
  }, []);

  const scheduleCloseStoryboardAssetHoverCard = useCallback(() => {
    if (storyboardAssetHoverCloseTimerRef.current) {
      window.clearTimeout(storyboardAssetHoverCloseTimerRef.current);
    }
    storyboardAssetHoverCloseTimerRef.current = window.setTimeout(() => {
      setHoveredStoryboardAssetCard((current) => (current?.sticky ? current : null));
      storyboardAssetHoverCloseTimerRef.current = null;
    }, 120);
  }, []);

  const scheduleCloseStoryboardShotHoverCard = useCallback(() => {
    if (storyboardShotHoverCloseTimerRef.current) {
      window.clearTimeout(storyboardShotHoverCloseTimerRef.current);
    }
    storyboardShotHoverCloseTimerRef.current = window.setTimeout(() => {
      setHoveredStoryboardShotCard((current) => (current?.sticky ? current : null));
      storyboardShotHoverCloseTimerRef.current = null;
    }, 300);
  }, []);

  const openStoryboardShotHoverCard = useCallback((storyboardNode, scene, shot, chipElement) => {
    if (!storyboardNode || !shot) return;
    if (storyboardShotHoverCloseTimerRef.current) {
      window.clearTimeout(storyboardShotHoverCloseTimerRef.current);
      storyboardShotHoverCloseTimerRef.current = null;
    }
    const rect = chipElement?.getBoundingClientRect?.() || { left: 0, bottom: 0 };
    const x = Math.min(rect.left, Math.max(window.innerWidth - 380, 24));
    const y = Math.min(rect.bottom + 6, Math.max(window.innerHeight - 480, 24));
    setHoveredStoryboardShotCard({ nodeId: storyboardNode.id, scene, shot, x, y, sticky: false });
  }, []);

  const openStoryboardAssetHoverCard = useCallback(
    (storyboardNode, mentionEntry, event) => {
      if (!storyboardNode || !mentionEntry?.assetType) return;
      const asset = resolveStoryboardAssetForMention(storyboardNode, mentionEntry);
      if (!asset) return;
      if (storyboardAssetHoverCloseTimerRef.current) {
        window.clearTimeout(storyboardAssetHoverCloseTimerRef.current);
        storyboardAssetHoverCloseTimerRef.current = null;
      }
      const x = Math.min((event?.clientX || 0) + 14, Math.max(window.innerWidth - 380, 24));
      const y = Math.min((event?.clientY || 0) + 14, Math.max(window.innerHeight - 420, 24));
      setHoveredStoryboardAssetCard({
        nodeId: storyboardNode.id,
        assetType: mentionEntry.assetType,
        asset,
        x,
        y,
        sticky: false,
        tweakText: "",
        customPrompt: "",
      });
    },
    [resolveStoryboardAssetForMention],
  );

  return {
    hoveredStoryboardAssetCard,
    setHoveredStoryboardAssetCard,
    hoveredStoryboardShotCard,
    setHoveredStoryboardShotCard,
    storyboardAssetHoverCloseTimerRef,
    storyboardShotHoverCloseTimerRef,
    selectedStoryboardTarget,
    scheduleCloseStoryboardAssetHoverCard,
    scheduleCloseStoryboardShotHoverCard,
    openStoryboardShotHoverCard,
    openStoryboardAssetHoverCard,
  };
}
