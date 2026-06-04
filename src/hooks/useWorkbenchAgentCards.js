import { useCallback, useEffect } from "react";

export function useWorkbenchAgentCards({
  agentResultCards,
  selectedAgentCardIds,
  setSelectedAgentCardIds,
  setActiveAgentCardId,
  setAgentResultCards,
  agentCardDragRef,
  viewportRef,
  setSelectedNodeIds,
  setSelectedConnectionIds,
  clearAgentCardSelectionRef,
  boxSelectCompleteRef,
}) {
  useEffect(() => {
    clearAgentCardSelectionRef.current = () => {
      setSelectedAgentCardIds(new Set());
      setActiveAgentCardId(null);
    };
    return () => {
      clearAgentCardSelectionRef.current = null;
    };
  }, [clearAgentCardSelectionRef, setActiveAgentCardId, setSelectedAgentCardIds]);

  useEffect(() => {
    boxSelectCompleteRef.current = (x1, y1, x2, y2, appendSelection) => {
      const selectedCards = appendSelection ? new Set(selectedAgentCardIds) : new Set();
      agentResultCards.forEach((card) => {
        if (card.minimized) return;
        const cardHeight = card.collapsed ? 70 : 420;
        if (card.x < x2 && card.x + (card.w || 460) > x1 && card.y < y2 && card.y + cardHeight > y1) {
          selectedCards.add(card.id);
        }
      });
      setSelectedAgentCardIds(selectedCards);
      if (selectedCards.size === 1) setActiveAgentCardId(Array.from(selectedCards)[0]);
      if (selectedCards.size === 0) setActiveAgentCardId(null);
    };
    return () => {
      boxSelectCompleteRef.current = null;
    };
  }, [agentResultCards, boxSelectCompleteRef, selectedAgentCardIds, setActiveAgentCardId, setSelectedAgentCardIds]);

  const handleAgentCardMouseDown = useCallback((event, cardId) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.shiftKey || event.ctrlKey) {
      setSelectedAgentCardIds((prev) => {
        const next = new Set(prev);
        if (next.has(cardId)) next.delete(cardId);
        else next.add(cardId);
        return next;
      });
      return;
    }
    const card = agentResultCards.find((item) => item.id === cardId);
    if (!card) return;
    let dragCardIds = selectedAgentCardIds;
    if (!selectedAgentCardIds.has(cardId)) {
      dragCardIds = new Set([cardId]);
      setSelectedAgentCardIds(new Set([cardId]));
    }
    setSelectedNodeIds(new Set());
    setSelectedConnectionIds(new Set());
    setActiveAgentCardId(cardId);
    const startPositions = {};
    agentResultCards.forEach((item) => {
      if (dragCardIds.has(item.id)) {
        startPositions[item.id] = { x: item.x, y: item.y };
      }
    });
    agentCardDragRef.current = {
      cardIds: Array.from(dragCardIds),
      startMouseX: event.clientX,
      startMouseY: event.clientY,
      startPositions,
    };

    const handleMouseMove = (moveEvent) => {
      const dragState = agentCardDragRef.current;
      if (!dragState) return;
      const zoom = viewportRef.current?.zoom || 1;
      const dx = (moveEvent.clientX - dragState.startMouseX) / zoom;
      const dy = (moveEvent.clientY - dragState.startMouseY) / zoom;
      setAgentResultCards((prev) =>
        prev.map((item) =>
          dragState.cardIds.includes(item.id)
            ? {
                ...item,
                x: (dragState.startPositions[item.id]?.x || item.x) + dx,
                y: (dragState.startPositions[item.id]?.y || item.y) + dy,
              }
            : item,
        ),
      );
    };

    const handleMouseUp = () => {
      agentCardDragRef.current = null;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }, [agentCardDragRef, agentResultCards, selectedAgentCardIds, setActiveAgentCardId, setAgentResultCards, setSelectedAgentCardIds, setSelectedConnectionIds, setSelectedNodeIds, viewportRef]);

  return { handleAgentCardMouseDown };
}
