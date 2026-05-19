import { useState, useRef, useCallback, useEffect } from "react";
import { isVideoContent } from "../lib/mediaType.js";
import {
  NODE_TYPES,
  getReferenceNodeTitle,
  normalizeInputMediaKind,
  isImageFileLike,
  isVideoFileLike,
  isMediaFileLike,
  readFilesAsDataUrls,
} from "../constants/workbench.jsx";

// ==========================================
// Config & Constants
// ==========================================
const generateId = () => Math.random().toString(36).substr(2, 9);
const GRID_SIZE = 20; // eslint-disable-line no-unused-vars
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3;
const MEDIA_UPLOAD_NODE_WIDTH = 280;
const MEDIA_UPLOAD_NODE_DROP_OFFSET_Y = 96;
const CANVAS_KEY = "bananaflow_canvas_id";

// ==========================================
// Module-level utilities
// ==========================================
const cloneCanvasNodeForHistory = (node) => ({
  ...node,
  data: { ...(node?.data || {}) },
});

export const cloneCanvasNodeLight = cloneCanvasNodeForHistory;

const inferMediaKindFromMediaItems = (items = []) => {
  const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!safeItems.length) return "mixed";
  if (safeItems.every((item) => isVideoContent(item))) return "video";
  if (safeItems.every((item) => !isVideoContent(item))) return "image";
  return "mixed";
};

export const isEditableElement = (element) => {
  if (!(element instanceof HTMLElement)) return false;
  if (element.isContentEditable) return true;
  const tagName = String(element.tagName || "").toLowerCase();
  if (["input", "textarea", "select"].includes(tagName)) return true;
  return Boolean(element.closest("input, textarea, select, [contenteditable='true'], [contenteditable=''], [role='textbox']"));
};

export const getMediaUploadNodePosition = (point) => ({
  x: point.x - MEDIA_UPLOAD_NODE_WIDTH / 2,
  y: point.y - MEDIA_UPLOAD_NODE_DROP_OFFSET_Y,
});

const newCanvasId = () => "canvas_" + Math.random().toString(36).slice(2, 12);

// ==========================================
// useCanvas hook
// ==========================================
export function useCanvas({
  onClearAgentCardSelectionRef,   // React.MutableRefObject<(() => void) | null>
  onBoxSelectCompleteRef,         // React.MutableRefObject<((x1, y1, x2, y2, appendSelection) => void) | null>
  onPasteToastRef,                // React.MutableRefObject<((toast) => void) | null>
} = {}) {
  const [nodes, setNodes] = useState([]);
  const [connections, setConnections] = useState([]);
  const [history, setHistory] = useState([]);
  const [historyStep, setHistoryStep] = useState(-1);
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });

  const [selectedNodeIds, setSelectedNodeIds] = useState(new Set());
  const [selectedConnectionIds, setSelectedConnectionIds] = useState(new Set());
  const [activeNodeId, setActiveNodeId] = useState(null);

  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [interactionMode, setInteractionMode] = useState("idle");
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [initialNodePos, setInitialNodePos] = useState({});
  const [selectionBox, setSelectionBox] = useState(null);
  const [connectingSource, setConnectingSource] = useState(null);
  const [hoveredConnectionId, setHoveredConnectionId] = useState("");
  const [hoveredConnectTarget, setHoveredConnectTarget] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [canvasDropActive, setCanvasDropActive] = useState(false);
  const [canvasDropUploading, setCanvasDropUploading] = useState(null);

  const [canvasId] = useState(() => {
    const saved = localStorage.getItem(CANVAS_KEY);
    return saved || newCanvasId();
  });

  // Refs
  const nodeElementMapRef = useRef(new Map());
  const viewportRef = useRef(viewport);
  const nodeDragCleanupRef = useRef(null);
  const connectionDragSelectionRef = useRef({ userSelect: "", webkitUserSelect: "" });
  const dragSelectionStyleRef = useRef({ userSelect: "", webkitUserSelect: "" });
  const connectionHoverTargetRef = useRef(null);
  const canvasRef = useRef(null);
  const canvasDragDepthRef = useRef(0);
  const canvasHoverClientRef = useRef(null);
  const nodesRef = useRef(nodes);
  const connectionsRef = useRef(connections);

  // Sync refs
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { connectionsRef.current = connections; }, [connections]);
  useEffect(() => { viewportRef.current = viewport; }, [viewport]);
  useEffect(() => {
    localStorage.setItem(CANVAS_KEY, canvasId);
  }, [canvasId]);

  // History
  const pushHistory = useCallback(() => {
    const s = {
      nodes: nodes.map(cloneCanvasNodeForHistory),
      connections: connections.map((connection) => ({ ...connection })),
    };
    setHistory((p) => {
      const n = p.slice(0, historyStep + 1);
      n.push(s);
      if (n.length > 50) n.shift();
      return n;
    });
    setHistoryStep((p) => Math.min(p + 1, 49));
  }, [nodes, connections, historyStep]);

  const undo = () => {
    if (historyStep > 0) {
      const p = history[historyStep - 1];
      setNodes(p.nodes);
      setConnections(p.connections);
      setHistoryStep(historyStep - 1);
    }
  };

  const redo = () => {
    if (historyStep < history.length - 1) {
      const n = history[historyStep + 1];
      setNodes(n.nodes);
      setConnections(n.connections);
      setHistoryStep(historyStep + 1);
    }
  };

  const canUndo = historyStep > 0;
  const canRedo = historyStep < history.length - 1;

  const deleteSelection = () => {
    if (selectedNodeIds.size === 0 && selectedConnectionIds.size === 0) return;
    pushHistory();
    setNodes((p) => p.filter((n) => !selectedNodeIds.has(n.id)));
    setConnections((p) =>
      p.filter((c) => !selectedConnectionIds.has(c.id) && !selectedNodeIds.has(c.from) && !selectedNodeIds.has(c.to))
    );
    setSelectedNodeIds(new Set());
    setSelectedConnectionIds(new Set());
  };

  const deleteConnectionById = useCallback((connectionId) => {
    if (!connectionId) return;
    pushHistory();
    setConnections((prev) => prev.filter((conn) => conn.id !== connectionId));
    setHoveredConnectionId((prev) => (prev === connectionId ? "" : prev));
    setSelectedConnectionIds((prev) => {
      const next = new Set(prev);
      next.delete(connectionId);
      return next;
    });
  }, [pushHistory]);

  const handleConnectionClick = useCallback((event, connectionId) => {
    event.stopPropagation();
    const shouldAppend = event.shiftKey || event.ctrlKey || event.metaKey;
    setSelectedNodeIds(new Set());
    setSelectedConnectionIds((prev) => {
      if (!shouldAppend) return new Set([connectionId]);
      const next = new Set(prev);
      if (next.has(connectionId)) next.delete(connectionId);
      else next.add(connectionId);
      return next;
    });
  }, []);

  const screenToCanvas = useCallback((sx, sy) => {
    const r = canvasRef.current?.getBoundingClientRect();
    return {
      x: (sx - (r ? r.left : 0) - viewport.x) / viewport.zoom,
      y: (sy - (r ? r.top : 0) - viewport.y) / viewport.zoom,
    };
  }, [viewport]);

  const zoomCanvas = (d, c = { x: window.innerWidth / 2, y: window.innerHeight / 2 }) => {
    const z = Math.min(Math.max(viewport.zoom + d, MIN_ZOOM), MAX_ZOOM);
    const w = screenToCanvas(c.x, c.y);
    const r = canvasRef.current?.getBoundingClientRect();
    setViewport({
      x: c.x - (r ? r.left : 0) - w.x * z,
      y: c.y - (r ? r.top : 0) - w.y * z,
      zoom: z,
    });
  };

  const arrangeCanvasNodes = useCallback(() => {
    const currentNodes = Array.isArray(nodesRef.current) ? nodesRef.current : [];
    if (currentNodes.length === 0) return;

    pushHistory();

    const currentConnections = Array.isArray(connectionsRef.current) ? connectionsRef.current : [];
    const nodeIds = new Set(currentNodes.map((node) => node.id));
    const validConnections = currentConnections.filter((conn) => nodeIds.has(conn.from) && nodeIds.has(conn.to));
    const outgoing = new Map(currentNodes.map((node) => [node.id, []]));
    const incomingCount = new Map(currentNodes.map((node) => [node.id, 0]));

    validConnections.forEach((conn) => {
      outgoing.get(conn.from)?.push(conn.to);
      incomingCount.set(conn.to, (incomingCount.get(conn.to) || 0) + 1);
    });

    const rankById = new Map();
    const queue = currentNodes
      .filter((node) => (incomingCount.get(node.id) || 0) === 0)
      .sort((a, b) => (a.x - b.x) || (a.y - b.y));
    const indegree = new Map(incomingCount);

    queue.forEach((node) => rankById.set(node.id, 0));
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const node = queue[cursor];
      const currentRank = rankById.get(node.id) || 0;
      (outgoing.get(node.id) || []).forEach((targetId) => {
        rankById.set(targetId, Math.max(rankById.get(targetId) || 0, currentRank + 1));
        indegree.set(targetId, Math.max(0, (indegree.get(targetId) || 0) - 1));
        if ((indegree.get(targetId) || 0) === 0) {
          const targetNode = currentNodes.find((item) => item.id === targetId);
          if (targetNode) queue.push(targetNode);
        }
      });
    }

    currentNodes.forEach((node) => {
      if (!rankById.has(node.id)) {
        const predecessorRanks = validConnections
          .filter((conn) => conn.to === node.id && rankById.has(conn.from))
          .map((conn) => rankById.get(conn.from) + 1);
        rankById.set(node.id, predecessorRanks.length ? Math.max(...predecessorRanks) : 0);
      }
    });

    const getNodeSize = (node) => {
      const element = nodeElementMapRef.current.get(node.id);
      const width =
        element?.offsetWidth ||
        (node.type === NODE_TYPES.STORYBOARD_PLAN
          ? 1280
          : node.type === NODE_TYPES.TEXT_INPUT
          ? 320
          : node.type === NODE_TYPES.ROLE_INPUT
          ? 76
          : 280);
      const height = element?.offsetHeight || (node.type === NODE_TYPES.STORYBOARD_PLAN ? 620 : node.type === NODE_TYPES.ROLE_INPUT ? 76 : 180);
      return { width, height };
    };

    const layers = new Map();
    currentNodes.forEach((node) => {
      const rank = rankById.get(node.id) || 0;
      if (!layers.has(rank)) layers.set(rank, []);
      layers.get(rank).push(node);
    });

    const sortedRanks = Array.from(layers.keys()).sort((a, b) => a - b);
    const layerOrderByRank = new Map();
    sortedRanks.forEach((rank) => {
      layerOrderByRank.set(
        rank,
        layers.get(rank).slice().sort((a, b) => (a.y - b.y) || (a.x - b.x)),
      );
    });

    const getNeighborAverageOrder = (nodeId, neighborDirection, orderById) => {
      const neighborIds = validConnections
        .filter((conn) => (neighborDirection === "incoming" ? conn.to === nodeId : conn.from === nodeId))
        .map((conn) => (neighborDirection === "incoming" ? conn.from : conn.to))
        .filter((id) => orderById.has(id));
      if (!neighborIds.length) return null;
      return neighborIds.reduce((sum, id) => sum + orderById.get(id), 0) / neighborIds.length;
    };

    for (let pass = 0; pass < 4; pass += 1) {
      const forwardRanks = sortedRanks.slice(1);
      forwardRanks.forEach((rank) => {
        const orderById = new Map();
        sortedRanks.forEach((rankForOrder) => {
          (layerOrderByRank.get(rankForOrder) || []).forEach((node, index) => {
            orderById.set(node.id, index);
          });
        });
        layerOrderByRank.set(
          rank,
          (layerOrderByRank.get(rank) || []).slice().sort((a, b) => {
            const aScore = getNeighborAverageOrder(a.id, "incoming", orderById);
            const bScore = getNeighborAverageOrder(b.id, "incoming", orderById);
            if (aScore !== null || bScore !== null) return (aScore ?? Number.MAX_SAFE_INTEGER) - (bScore ?? Number.MAX_SAFE_INTEGER);
            return (a.y - b.y) || (a.x - b.x);
          }),
        );
      });

      const backwardRanks = sortedRanks.slice(0, -1).reverse();
      backwardRanks.forEach((rank) => {
        const orderById = new Map();
        sortedRanks.forEach((rankForOrder) => {
          (layerOrderByRank.get(rankForOrder) || []).forEach((node, index) => {
            orderById.set(node.id, index);
          });
        });
        layerOrderByRank.set(
          rank,
          (layerOrderByRank.get(rank) || []).slice().sort((a, b) => {
            const aScore = getNeighborAverageOrder(a.id, "outgoing", orderById);
            const bScore = getNeighborAverageOrder(b.id, "outgoing", orderById);
            if (aScore !== null || bScore !== null) return (aScore ?? Number.MAX_SAFE_INTEGER) - (bScore ?? Number.MAX_SAFE_INTEGER);
            return (a.y - b.y) || (a.x - b.x);
          }),
        );
      });
    }

    const baseX = Math.min(...currentNodes.map((node) => Number(node.x) || 0));
    const baseY = Math.min(...currentNodes.map((node) => Number(node.y) || 0));
    const gapX = 300;
    const gapY = 84;
    const layerMetrics = sortedRanks.map((rank) => {
      const layerNodes = layerOrderByRank.get(rank) || [];
      const sizes = layerNodes.map(getNodeSize);
      const width = Math.max(...sizes.map((size) => size.width), 0);
      const height = sizes.reduce((sum, size) => sum + size.height, 0) + Math.max(0, sizes.length - 1) * gapY;
      return { rank, nodes: layerNodes, sizes, width, height };
    });
    const maxLayerHeight = Math.max(...layerMetrics.map((layer) => layer.height), 0);
    const xByRank = new Map();
    let xCursor = baseX;
    layerMetrics.forEach((layer) => {
      xByRank.set(layer.rank, xCursor);
      xCursor += layer.width + gapX;
    });

    const arrangedPositions = new Map();
    layerMetrics.forEach((layer) => {
      let yCursor = baseY + Math.max(0, (maxLayerHeight - layer.height) / 2);
      layer.nodes.forEach((node, index) => {
        const size = layer.sizes[index] || getNodeSize(node);
        arrangedPositions.set(node.id, {
          x: xByRank.get(layer.rank) || baseX,
          y: yCursor,
        });
        yCursor += size.height + gapY;
      });
    });

    const nextNodes = currentNodes.map((node) => ({
      ...node,
      ...(arrangedPositions.get(node.id) || {}),
    }));
    setNodes(nextNodes);
    setSelectedNodeIds(new Set());
    setSelectedConnectionIds(new Set());

    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (canvasRect && nextNodes.length > 0) {
      const padding = 120;
      const bounds = nextNodes.reduce(
        (acc, node) => {
          const size = getNodeSize(node);
          return {
            minX: Math.min(acc.minX, node.x),
            minY: Math.min(acc.minY, node.y),
            maxX: Math.max(acc.maxX, node.x + size.width),
            maxY: Math.max(acc.maxY, node.y + size.height),
          };
        },
        { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
      );
      const contentWidth = Math.max(1, bounds.maxX - bounds.minX + padding * 2);
      const contentHeight = Math.max(1, bounds.maxY - bounds.minY + padding * 2);
      const nextZoom = Math.min(1, Math.max(MIN_ZOOM, Math.min(canvasRect.width / contentWidth, canvasRect.height / contentHeight)));
      setViewport({
        x: (canvasRect.width - (bounds.maxX - bounds.minX) * nextZoom) / 2 - bounds.minX * nextZoom,
        y: (canvasRect.height - (bounds.maxY - bounds.minY) * nextZoom) / 2 - bounds.minY * nextZoom,
        zoom: nextZoom,
      });
    }

    onPasteToastRef?.current?.({ message: "已辅助整理画布节点", type: "info" });
  }, [pushHistory, onPasteToastRef]);

  const handleWheel = (e) => {
    if (isEditableElement(e.target)) {
      return;
    }
    if (e.target instanceof Element && e.target.closest('[data-agent-card-root="true"]')) {
      return;
    }
    if (e.ctrlKey || e.metaKey) e.preventDefault();
    zoomCanvas(-e.deltaY * 0.001, { x: e.clientX, y: e.clientY });
  };

  const handleCanvasMouseDown = (e) => {
    if (e.button === 1 || (e.button === 0 && (isSpacePressed || e.altKey || e.metaKey))) {
      setInteractionMode("panning");
      setDragStart({ x: e.clientX - viewport.x, y: e.clientY - viewport.y });
      return;
    }
    if (e.button === 0 && !isSpacePressed && !e.altKey && !e.metaKey) {
      e.preventDefault();
      const appendSelection = e.shiftKey || e.ctrlKey;
      if (!appendSelection) {
        setSelectedNodeIds(new Set());
        setSelectedConnectionIds(new Set());
        onClearAgentCardSelectionRef?.current?.();
      }
      const s = screenToCanvas(e.clientX, e.clientY);
      setSelectionBox({ startX: s.x, startY: s.y, curX: s.x, curY: s.y, appendSelection });
      setInteractionMode("selecting");
    }
  };

  const handleNodeMouseDown = (e, nid) => {
    e.stopPropagation();

    // ✅ 如果点在 nodrag 区域：只做"选中"，不要进入拖拽
    const isNoDragZone = !!e.target.closest(".nodrag");

    const s = new Set(selectedNodeIds);
    if (e.shiftKey || e.ctrlKey) s.has(nid) ? s.delete(nid) : s.add(nid);
    else if (!s.has(nid)) { s.clear(); s.add(nid); }

    setSelectedNodeIds(s);
    setSelectedConnectionIds(new Set());

    if (isNoDragZone) {
      setInteractionMode("idle");
      return;
    }

    e.preventDefault();
    setInteractionMode("dragging_node");
    setDragStart({ x: e.clientX, y: e.clientY });

    const p = {};
    nodes.forEach(n => {
      if (s.has(n.id) || n.id === nid) p[n.id] = { x: n.x, y: n.y };
    });
    setInitialNodePos(p);

    if (nodeDragCleanupRef.current) {
      nodeDragCleanupRef.current();
    }

    const startX = e.clientX;
    const startY = e.clientY;

    const onWindowMouseMove = (event) => {
      const dx = (event.clientX - startX) / viewport.zoom;
      const dy = (event.clientY - startY) / viewport.zoom;
      setNodes((prev) =>
        prev.map((n) => (p[n.id] ? { ...n, x: p[n.id].x + dx, y: p[n.id].y + dy } : n))
      );
    };

    const cleanupDrag = () => {
      window.removeEventListener("mousemove", onWindowMouseMove);
      window.removeEventListener("mouseup", cleanupDrag, true);
      window.removeEventListener("blur", cleanupDrag);
      nodeDragCleanupRef.current = null;
      setInteractionMode((prev) => {
        if (prev === "dragging_node") pushHistory();
        return "idle";
      });
      setSelectionBox(null);
      setConnectingSource(null);
    };

    nodeDragCleanupRef.current = cleanupDrag;
    window.addEventListener("mousemove", onWindowMouseMove);
    window.addEventListener("mouseup", cleanupDrag, true);
    window.addEventListener("blur", cleanupDrag);
  };

  const handleMouseMove = useCallback(
    (e) => {
      setMousePos({ x: e.clientX, y: e.clientY });
      if (canvasRef.current?.contains(e.target)) {
        canvasHoverClientRef.current = { x: e.clientX, y: e.clientY };
      }
      if (interactionMode === "panning") setViewport({ ...viewport, x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
      else if (interactionMode === "dragging_node") {
        const dx = (e.clientX - dragStart.x) / viewport.zoom;
        const dy = (e.clientY - dragStart.y) / viewport.zoom;
        setNodes((p) =>
          p.map((n) => (initialNodePos[n.id] ? { ...n, x: initialNodePos[n.id].x + dx, y: initialNodePos[n.id].y + dy } : n))
        );
      } else if (interactionMode === "selecting") {
        const c = screenToCanvas(e.clientX, e.clientY);
        setSelectionBox((p) => ({ ...p, curX: c.x, curY: c.y }));
      }
    },
    [interactionMode, dragStart, viewport, initialNodePos, screenToCanvas]
  );

  const handleMouseUp = useCallback(() => {
    if (interactionMode === "dragging_node") {
      nodeDragCleanupRef.current?.();
      return;
    }
    if (interactionMode === "dragging_node") pushHistory();
    if (interactionMode === "selecting" && selectionBox) {
      const x1 = Math.min(selectionBox.startX, selectionBox.curX);
      const x2 = Math.max(selectionBox.startX, selectionBox.curX);
      const y1 = Math.min(selectionBox.startY, selectionBox.curY);
      const y2 = Math.max(selectionBox.startY, selectionBox.curY);
      const appendSelection = !!selectionBox.appendSelection;
      const s = appendSelection ? new Set(selectedNodeIds) : new Set();
      nodes.forEach((n) => {
        if (n.x < x2 && n.x + 280 > x1 && n.y < y2 && n.y + 200 > y1) s.add(n.id);
      });
      setSelectedNodeIds(s);
      onBoxSelectCompleteRef?.current?.(x1, y1, x2, y2, appendSelection);
    }
    setInteractionMode("idle");
    setSelectionBox(null);
    setConnectingSource(null);
  }, [interactionMode, selectionBox, selectedNodeIds, nodes, onBoxSelectCompleteRef, pushHistory]);

  useEffect(() => {
    if (!["panning", "selecting"].includes(interactionMode)) return undefined;

    const handleWindowMouseMove = (event) => {
      handleMouseMove(event);
    };
    const handleWindowMouseUp = () => {
      handleMouseUp();
    };

    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("mouseup", handleWindowMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup", handleWindowMouseUp);
    };
  }, [interactionMode, handleMouseMove, handleMouseUp]);

  useEffect(() => {
    const shouldDisableSelection = interactionMode === "selecting" || interactionMode === "dragging_node";
    const bodyStyle = document.body?.style;

    if (!shouldDisableSelection) {
      if (bodyStyle) {
        bodyStyle.userSelect = dragSelectionStyleRef.current.userSelect;
        bodyStyle.webkitUserSelect = dragSelectionStyleRef.current.webkitUserSelect;
      }
      return undefined;
    }

    if (bodyStyle) {
      dragSelectionStyleRef.current = {
        userSelect: bodyStyle.userSelect,
        webkitUserSelect: bodyStyle.webkitUserSelect,
      };
      bodyStyle.userSelect = "none";
      bodyStyle.webkitUserSelect = "none";
    }

    return () => {
      if (bodyStyle) {
        bodyStyle.userSelect = dragSelectionStyleRef.current.userSelect;
        bodyStyle.webkitUserSelect = dragSelectionStyleRef.current.webkitUserSelect;
      }
    };
  }, [interactionMode]);

  const getCursor = () => (interactionMode === "panning" || isSpacePressed ? "grab" : interactionMode === "dragging_node" ? "grabbing" : "default");

  const createMediaUploadNodeAt = useCallback((point, mediaItems, mediaKind = "mixed") => {
    const safeMediaItems = Array.isArray(mediaItems) ? mediaItems.filter(Boolean) : [];
    if (!safeMediaItems.length) return;
    const position = getMediaUploadNodePosition(point);
    const normalizedMediaKind =
      normalizeInputMediaKind(mediaKind) === "mixed"
        ? inferMediaKindFromMediaItems(safeMediaItems)
        : normalizeInputMediaKind(mediaKind);

    pushHistory();
    const nodeId = generateId();
    const nextNode = {
      id: nodeId,
      type: NODE_TYPES.INPUT,
      x: position.x,
      y: position.y,
      data: {
        images: safeMediaItems,
        mediaKind: normalizedMediaKind,
        title: getReferenceNodeTitle(normalizedMediaKind),
      },
    };

    setNodes((prev) => [...prev, nextNode]);
    setSelectedNodeIds(new Set([nodeId]));
    setSelectedConnectionIds(new Set());
    setActiveNodeId(nodeId);
  }, [pushHistory]);

  const getCanvasViewportCenterPoint = useCallback(() => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const centerX = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const centerY = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
    return screenToCanvas(centerX, centerY);
  }, [screenToCanvas]);

  const getCanvasPastePoint = useCallback(() => {
    const hoverPoint = canvasHoverClientRef.current;
    if (hoverPoint) {
      return screenToCanvas(hoverPoint.x, hoverPoint.y);
    }
    return getCanvasViewportCenterPoint();
  }, [getCanvasViewportCenterPoint, screenToCanvas]);

  const handleCanvasDragEnter = useCallback((e) => {
    const hasMediaFiles = Array.from(e.dataTransfer?.items || []).some(
      (item) =>
        item.kind === "file" &&
        (String(item.type || "").startsWith("image/") ||
          String(item.type || "").startsWith("video/") ||
          Array.from(e.dataTransfer?.types || []).includes("Files")),
    );
    if (!hasMediaFiles) return;
    canvasDragDepthRef.current += 1;
    setCanvasDropActive(true);
  }, []);

  const handleCanvasDragOver = useCallback((e) => {
    const hasMediaFiles = Array.from(e.dataTransfer?.items || []).some(
      (item) =>
        item.kind === "file" &&
        (String(item.type || "").startsWith("image/") ||
          String(item.type || "").startsWith("video/") ||
          Array.from(e.dataTransfer?.types || []).includes("Files")),
    );
    if (!hasMediaFiles) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (!canvasDropActive) setCanvasDropActive(true);
  }, [canvasDropActive]);

  const handleCanvasDragLeave = useCallback((e) => {
    const nextTarget = e.relatedTarget;
    if (nextTarget && canvasRef.current?.contains(nextTarget)) return;
    canvasDragDepthRef.current = Math.max(0, canvasDragDepthRef.current - 1);
    if (canvasDragDepthRef.current === 0) setCanvasDropActive(false);
  }, []);

  const handleCanvasDrop = useCallback(async (e) => {
    const files = Array.from(e.dataTransfer?.files || []).filter((file) => isMediaFileLike(file));
    canvasDragDepthRef.current = 0;
    setCanvasDropActive(false);
    e.preventDefault();
    if (!files.length) return;

    const point = screenToCanvas(e.clientX, e.clientY);
    const position = getMediaUploadNodePosition(point);
    const imageCount = files.filter((file) => isImageFileLike(file)).length;
    const videoCount = files.length - imageCount;
    setCanvasDropUploading({
      x: position.x,
      y: position.y,
      total: files.length,
      images: imageCount,
      videos: videoCount,
    });
    try {
      const droppedMediaItems = await readFilesAsDataUrls(files);
      createMediaUploadNodeAt(
        point,
        droppedMediaItems,
        imageCount === files.length ? "image" : videoCount === files.length ? "video" : "mixed",
      );
    } finally {
      setCanvasDropUploading(null);
    }
  }, [createMediaUploadNodeAt, screenToCanvas]);

  // Paste effect
  useEffect(() => {
    const handleWindowPaste = async (event) => {
      if (isEditableElement(event.target) || isEditableElement(document.activeElement)) return;

      const clipboardItems = Array.from(event.clipboardData?.items || []);
      const mediaFiles = clipboardItems
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile())
        .filter((file) => file && isMediaFileLike(file));

      if (!mediaFiles.length) return;

      event.preventDefault();
      const point = getCanvasPastePoint();
      const position = getMediaUploadNodePosition(point);
      const imageCount = mediaFiles.filter((file) => isImageFileLike(file)).length;
      const videoCount = mediaFiles.length - imageCount;
      setCanvasDropUploading({
        x: position.x,
        y: position.y,
        total: mediaFiles.length,
        images: imageCount,
        videos: videoCount,
      });

      try {
        const pastedMediaItems = await readFilesAsDataUrls(mediaFiles);
        createMediaUploadNodeAt(point, pastedMediaItems, mediaFiles.every((file) => isImageFileLike(file)) ? "image" : mediaFiles.every((file) => isVideoFileLike(file)) ? "video" : "mixed");
        onPasteToastRef?.current?.({
          message: `已粘贴到画布：${mediaFiles.length} 个文件${imageCount ? ` · ${imageCount} 张图片` : ""}${videoCount ? ` · ${videoCount} 个视频` : ""}`,
          type: "info",
        });
      } finally {
        setCanvasDropUploading(null);
      }
    };

    window.addEventListener("paste", handleWindowPaste);
    return () => {
      window.removeEventListener("paste", handleWindowPaste);
    };
  }, [createMediaUploadNodeAt, getCanvasPastePoint, onPasteToastRef]);

  const appendTemplateGraph = useCallback(
    (templateNodes, templateConnections, options = {}) => {
      const safeTemplateNodes = Array.isArray(templateNodes) ? templateNodes.filter(Boolean) : [];
      const safeTemplateConnections = Array.isArray(templateConnections) ? templateConnections.filter(Boolean) : [];
      if (!safeTemplateNodes.length) return;

      pushHistory();

      const baseNodes = Array.isArray(nodesRef.current) ? nodesRef.current : [];
      const baseConnections = Array.isArray(connectionsRef.current) ? connectionsRef.current : [];
      const templateMinX = Math.min(...safeTemplateNodes.map((node) => Number(node.x) || 0));
      const templateMaxX = Math.max(...safeTemplateNodes.map((node) => Number(node.x) || 0));
      const templateMinY = Math.min(...safeTemplateNodes.map((node) => Number(node.y) || 0));
      const templateMaxY = Math.max(...safeTemplateNodes.map((node) => Number(node.y) || 0));
      const templateWidth = Math.max(0, templateMaxX - templateMinX);
      const templateHeight = Math.max(0, templateMaxY - templateMinY);

      let offsetX = 0;
      let offsetY = 0;

      if (baseNodes.length > 0) {
        const baseMaxX = Math.max(...baseNodes.map((node) => Number(node.x) || 0));
        const baseMinY = Math.min(...baseNodes.map((node) => Number(node.y) || 0));
        const baseMaxY = Math.max(...baseNodes.map((node) => Number(node.y) || 0));
        const targetLeft = baseMaxX + 360;
        const availableHeight = Math.max(0, baseMaxY - baseMinY);
        const targetTop = baseMinY + Math.max(0, (availableHeight - templateHeight) / 2);
        offsetX = targetLeft - templateMinX;
        offsetY = targetTop - templateMinY;
      } else if (options.alignToViewportCenter) {
        const center = getCanvasViewportCenterPoint();
        offsetX = center.x - (templateMinX + templateWidth / 2);
        offsetY = center.y - (templateMinY + templateHeight / 2);
      }

      const nextNodes = safeTemplateNodes.map((node) => ({
        ...node,
        x: (Number(node.x) || 0) + offsetX,
        y: (Number(node.y) || 0) + offsetY,
      }));

      setNodes([...baseNodes, ...nextNodes]);
      setConnections([...baseConnections, ...safeTemplateConnections]);
      setSelectedNodeIds(new Set(nextNodes.map((node) => node.id)));
      setSelectedConnectionIds(new Set());
      setActiveNodeId(nextNodes[0]?.id || null);
    },
    [getCanvasViewportCenterPoint, pushHistory],
  );

  return {
    nodes, setNodes,
    connections, setConnections,
    history, setHistory,
    historyStep, setHistoryStep,
    viewport, setViewport, viewportRef,
    selectedNodeIds, setSelectedNodeIds,
    selectedConnectionIds, setSelectedConnectionIds,
    activeNodeId, setActiveNodeId,
    isSpacePressed, setIsSpacePressed,
    interactionMode, setInteractionMode,
    dragStart, setDragStart,
    initialNodePos, setInitialNodePos,
    selectionBox, setSelectionBox,
    connectingSource, setConnectingSource,
    hoveredConnectionId, setHoveredConnectionId,
    hoveredConnectTarget, setHoveredConnectTarget,
    mousePos, setMousePos,
    canvasDropActive, setCanvasDropActive,
    canvasDropUploading, setCanvasDropUploading,
    canvasId,
    // refs
    nodeElementMapRef, nodesRef, connectionsRef,
    canvasRef, canvasDragDepthRef, canvasHoverClientRef,
    nodeDragCleanupRef, connectionDragSelectionRef, dragSelectionStyleRef,
    connectionHoverTargetRef,
    // computed
    canUndo, canRedo,
    // handlers
    pushHistory,
    undo, redo,
    deleteSelection,
    deleteConnectionById,
    handleConnectionClick,
    screenToCanvas, zoomCanvas,
    arrangeCanvasNodes,
    handleWheel,
    handleCanvasMouseDown, handleNodeMouseDown,
    handleMouseMove, handleMouseUp,
    getCursor,
    createMediaUploadNodeAt,
    getCanvasViewportCenterPoint, getCanvasPastePoint,
    handleCanvasDragEnter, handleCanvasDragOver, handleCanvasDragLeave, handleCanvasDrop,
    appendTemplateGraph,
  };
}
