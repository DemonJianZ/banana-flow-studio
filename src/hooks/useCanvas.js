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
  VIDEO_GEN_INPUT_HANDLE_LAST_FRAME,
  normalizeConnectionTargetHandle,
} from "../constants/workbench.jsx";
import { getEstimatedNodeSize } from "../lib/workbenchGeometry.js";
import { useCanvasStore } from "../stores/canvasStore.js";

// ── 节点拖拽命令式渲染辅助函数 ─────────────────────────────────────────────────
// 与 useWorkbenchConnectionLayer 中的同名函数保持逻辑一致，供 rAF 循环直接调用，
// 避免跨 Hook 调用，也避免在 rAF 里动态 import。

/** 计算节点端口的画布坐标（output=右侧中心，input=左侧中心，兼容 last-frame handle） */
const computeNodeAnchor = (node, nodeEl, direction, handle) => {
  const size = getEstimatedNodeSize(node, nodeEl);
  const isLastFrame =
    normalizeConnectionTargetHandle(handle) === VIDEO_GEN_INPUT_HANDLE_LAST_FRAME;
  const anchorY = isLastFrame
    ? Math.min(size.height - 24, Math.max(36, size.height / 2 + 40))
    : size.height / 2;
  return {
    x: direction === "output" ? node.x + size.width : node.x,
    y: node.y + anchorY,
  };
};

/** 生成两点之间的三次 Bézier SVG path 字符串（无绕障，用于拖拽实时刷新） */
const computeBezierD = (start, end) => {
  const cx = Math.max(80, Math.abs(end.x - start.x) / 2);
  return `M ${start.x} ${start.y} C ${start.x + cx} ${start.y}, ${end.x - cx} ${end.y}, ${end.x} ${end.y}`;
};

// ==========================================
// Config & Constants
// ==========================================
const generateId = () => Math.random().toString(36).substr(2, 9);
const GRID_SIZE = 20;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3;
const MEDIA_UPLOAD_NODE_WIDTH = 280;
const MEDIA_UPLOAD_NODE_DROP_OFFSET_Y = 96;
const CANVAS_KEY = "bananaflow_canvas_id";
const PERF_NODE_COUNT_LIMIT = 1200;

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

const isNodeDragBlockedElement = (element) => {
  if (!(element instanceof Element)) return false;
  if (element instanceof HTMLElement && isEditableElement(element)) return true;
  if (element.closest("[data-node-drag-allow='true']")) return false;
  return Boolean(
    element.closest([
      ".nodrag",
      "input",
      "textarea",
      "select",
      "button",
      "a",
      "audio",
      "video",
      "[contenteditable='true']",
      "[contenteditable='']",
      "summary",
      "[role='button']",
      "[role='menuitem']",
      "[role='textbox']",
      "[data-nodrag='true']",
      "[data-agent-card-root='true']",
    ].join(", "))
  );
};

export const getMediaUploadNodePosition = (point) => ({
  x: point.x - MEDIA_UPLOAD_NODE_WIDTH / 2,
  y: point.y - MEDIA_UPLOAD_NODE_DROP_OFFSET_Y,
});

const normalizePerfNodeCount = (value) => {
  const count = Math.round(Number(value || 0));
  if (!Number.isFinite(count) || count <= 0) return 0;
  return Math.min(PERF_NODE_COUNT_LIMIT, Math.max(1, count));
};

const buildPerfCanvasGraph = (count) => {
  const safeCount = normalizePerfNodeCount(count);
  const columns = Math.max(1, Math.ceil(Math.sqrt(safeCount)));
  const horizontalGap = 360;
  const verticalGap = 240;
  const nodes = Array.from({ length: safeCount }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const isTextNode = index % 3 === 0;
    return {
      id: `perf_node_${index + 1}`,
      type: isTextNode ? NODE_TYPES.TEXT_INPUT : NODE_TYPES.PROCESSOR,
      x: column * horizontalGap,
      y: row * verticalGap,
      data: isTextNode
        ? { text: `性能压测节点 ${index + 1}` }
        : {
            mode: "text2img",
            prompt: `性能压测节点 ${index + 1}`,
            templates: { size: "1k", aspect_ratio: "1:1" },
            batchSize: 1,
            status: "idle",
            model: "",
          },
    };
  });
  const connections = nodes.slice(1).map((node, index) => ({
    id: `perf_conn_${index + 1}`,
    from: nodes[index].id,
    to: node.id,
  }));
  return { nodes, connections };
};

// ==========================================
// useCanvas hook
// ==========================================
export function useCanvas({
  onClearAgentCardSelectionRef,   // React.MutableRefObject<(() => void) | null>
  onBoxSelectCompleteRef,         // React.MutableRefObject<((x1, y1, x2, y2, appendSelection) => void) | null>
  onPasteToastRef,                // React.MutableRefObject<((toast) => void) | null>
} = {}) {
  // ── 核心画布状态 + 历史记录：来自 Zustand store（Phase 1+2 迁移）───────────────
  const {
    nodes, setNodes,
    connections, setConnections,
    viewport, setViewport,
    selectedNodeIds, setSelectedNodeIds,
    selectedConnectionIds, setSelectedConnectionIds,
    activeNodeId, setActiveNodeId,
    canvasId,
    updateNodeData,
    applyPatch,
    // Phase 2: history（原 useState 快照系统）
    _history: history,
    _historyStep: historyStep,
    pushHistory,
    undo,
    redo,
  } = useCanvasStore();

  const canUndo = historyStep > 0;
  const canRedo = historyStep < history.length - 1;

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

  // Refs
  const nodeElementMapRef = useRef(new Map());
  const viewportRef = useRef(viewport);
  const nodeDragCleanupRef = useRef(null);
  const nodeDragFrameRef = useRef(0);
  const nodeDragLatestEventRef = useRef(null);
  const connectionDragSelectionRef = useRef({ userSelect: "", webkitUserSelect: "" });
  const dragSelectionStyleRef = useRef({ userSelect: "", webkitUserSelect: "" });
  const connectionHoverTargetRef = useRef(null);
  const canvasRef = useRef(null);
  const canvasDragDepthRef = useRef(0);
  const canvasHoverClientRef = useRef(null);
  const nodesRef = useRef(nodes);
  const connectionsRef = useRef(connections);
  // 节点拖拽命令式渲染所需的两个共享 ref：
  // connPathMapRef  — 由 useWorkbenchConnectionLayer 填充（每条连线的 DOM path 元素）
  // isDraggingNodeIdsRef — 拖拽期间持有参与拖拽的节点 ID 集合，NodeComponent 据此跳过 left/top
  const connPathMapRef = useRef(new Map());
  const isDraggingNodeIdsRef = useRef(new Set());
  // pan 命令式渲染所需的三个 DOM refs（由 WorkbenchCanvas 挂到对应元素）
  const panViewportLayerRef = useRef(null);
  const panGridFineRef = useRef(null);
  const panGridCoarseRef = useRef(null);
  // zoom 命令式化：rAF 节流 + debounce 收口，整个缩放手势只触发一次 setViewport
  const zoomRafIdRef = useRef(0);
  const zoomCommitTimerRef = useRef(0);
  const zoomPendingViewportRef = useRef(null); // 手势过程中累积的 viewport，尚未写入 state
  // canvasBoundsRef: 缓存 canvasRef 的 DOMRect，由 ResizeObserver 维护，
  // 供 screenToCanvas 高频调用时免于每次触发 forced layout。
  const canvasBoundsRef = useRef({ left: 0, top: 0 });

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return undefined;
    const update = () => {
      const r = el.getBoundingClientRect();
      canvasBoundsRef.current = { left: r.left, top: r.top };
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    // 父容器滚动时 canvas 的屏幕坐标会变，同步更新缓存
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", update);
    };
  // canvasRef.current 在挂载后稳定，effect 只需运行一次
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // selectedNodeIdsRef：供 handleNodeMouseDown (useCallback []) 读取最新选中集合
  const selectedNodeIdsRef = useRef(selectedNodeIds);

  // Sync refs
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { connectionsRef.current = connections; }, [connections]);
  useEffect(() => { viewportRef.current = viewport; }, [viewport]);
  useEffect(() => { selectedNodeIdsRef.current = selectedNodeIds; }, [selectedNodeIds]);
  // History
  // pushHistory / undo / redo / canUndo / canRedo 均由 useCanvasStore 提供（Phase 2 迁移）

  const installPerfCanvasGraph = useCallback((count = 500) => {
    const safeCount = normalizePerfNodeCount(count);
    if (!safeCount) return null;
    const nextGraph = buildPerfCanvasGraph(safeCount);
    pushHistory();
    setNodes(nextGraph.nodes);
    setConnections(nextGraph.connections);
    setSelectedNodeIds(new Set(nextGraph.nodes.slice(0, 1).map((node) => node.id)));
    setSelectedConnectionIds(new Set());
    setActiveNodeId(nextGraph.nodes[0]?.id || null);
    setViewport({ x: 96, y: 96, zoom: 0.8 });
    return nextGraph;
  }, [pushHistory, setActiveNodeId, setConnections, setNodes, setSelectedConnectionIds, setSelectedNodeIds, setViewport]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const api = {
      generateCanvas: installPerfCanvasGraph,
      generate500: () => installPerfCanvasGraph(500),
      generate1000: () => installPerfCanvasGraph(1000),
    };
    window.__bananaFlowPerf = api;

    const params = new URLSearchParams(window.location.search);
    const count = normalizePerfNodeCount(params.get("perfNodes"));
    if (count) {
      window.requestAnimationFrame(() => {
        installPerfCanvasGraph(count);
      });
    }

    return () => {
      if (window.__bananaFlowPerf === api) delete window.__bananaFlowPerf;
    };
  }, [installPerfCanvasGraph]);

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
  }, [pushHistory, setConnections, setSelectedConnectionIds]);

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
  }, [setSelectedConnectionIds, setSelectedNodeIds]);

  const screenToCanvas = useCallback((sx, sy) => {
    const { left, top } = canvasBoundsRef.current;
    return {
      x: (sx - left - viewport.x) / viewport.zoom,
      y: (sy - top - viewport.y) / viewport.zoom,
    };
  }, [viewport]);

  const zoomCanvas = (d, c = { x: window.innerWidth / 2, y: window.innerHeight / 2 }) => {
    // 若滚轮手势正在进行（pending 未提交），以最新累积值为基准，避免跳跃
    const base = zoomPendingViewportRef.current ?? viewport;
    const z = Math.min(Math.max(base.zoom + d, MIN_ZOOM), MAX_ZOOM);
    const { left, top } = canvasBoundsRef.current;
    const wx = (c.x - left - base.x) / base.zoom;
    const wy = (c.y - top  - base.y) / base.zoom;
    // 工具栏点击直接提交，同时清掉可能残留的滚轮 pending
    if (zoomCommitTimerRef.current) {
      clearTimeout(zoomCommitTimerRef.current);
      zoomCommitTimerRef.current = 0;
    }
    zoomPendingViewportRef.current = null;
    setViewport({ x: c.x - left - wx * z, y: c.y - top - wy * z, zoom: z });
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
          : node.type === NODE_TYPES.STORYBOARD_INPUT
          ? 380
          : node.type === NODE_TYPES.ROLE_INPUT
          ? 76
          : 280);
      const height = element?.offsetHeight || (node.type === NODE_TYPES.STORYBOARD_PLAN ? 620 : node.type === NODE_TYPES.STORYBOARD_INPUT ? 260 : node.type === NODE_TYPES.ROLE_INPUT ? 76 : 180);
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
  }, [pushHistory, onPasteToastRef, setNodes, setSelectedConnectionIds, setSelectedNodeIds, setViewport]);

  const handleWheel = (e) => {
    if (isEditableElement(e.target)) return;
    if (e.target instanceof Element && e.target.closest('[data-agent-card-root="true"]')) return;
    if (e.ctrlKey || e.metaKey) e.preventDefault();

    // 从"待提交的累积值"或当前 React state 取基准 viewport，避免手势中读到过时的 state
    const base = zoomPendingViewportRef.current ?? { x: viewport.x, y: viewport.y, zoom: viewport.zoom };

    const newZoom = Math.min(Math.max(base.zoom + (-e.deltaY * 0.001), MIN_ZOOM), MAX_ZOOM);
    const { left, top } = canvasBoundsRef.current;
    const cx = e.clientX;
    const cy = e.clientY;
    // 鼠标在画布坐标系中的位置（zoom 到此点保持不动）
    const wx = (cx - left - base.x) / base.zoom;
    const wy = (cy - top  - base.y) / base.zoom;

    const newVp = {
      x: cx - left - wx * newZoom,
      y: cy - top  - wy * newZoom,
      zoom: newZoom,
    };
    zoomPendingViewportRef.current = newVp;

    // ── rAF：每帧最多刷新一次 DOM ──────────────────────────────────────────
    if (!zoomRafIdRef.current) {
      zoomRafIdRef.current = window.requestAnimationFrame(() => {
        zoomRafIdRef.current = 0;
        const vp = zoomPendingViewportRef.current;
        if (!vp) return;
        const pos   = `${vp.x}px ${vp.y}px`;
        const fineS = `${GRID_SIZE * vp.zoom}px ${GRID_SIZE * vp.zoom}px`;
        const coarS = `${GRID_SIZE * 4 * vp.zoom}px ${GRID_SIZE * 4 * vp.zoom}px`;
        if (panViewportLayerRef.current)
          panViewportLayerRef.current.style.transform = `translate(${vp.x}px,${vp.y}px) scale(${vp.zoom})`;
        if (panGridFineRef.current) {
          panGridFineRef.current.style.backgroundPosition = pos;
          panGridFineRef.current.style.backgroundSize = fineS;
        }
        if (panGridCoarseRef.current) {
          panGridCoarseRef.current.style.backgroundPosition = pos;
          panGridCoarseRef.current.style.backgroundSize = coarS;
        }
      });
    }

    // ── debounce 收口：手势停止 150ms 后一次性写入 React state ────────────
    if (zoomCommitTimerRef.current) clearTimeout(zoomCommitTimerRef.current);
    zoomCommitTimerRef.current = setTimeout(() => {
      zoomCommitTimerRef.current = 0;
      const vp = zoomPendingViewportRef.current;
      if (!vp) return;
      zoomPendingViewportRef.current = null;
      setViewport(vp);
    }, 150);
  };

  const handleCanvasMouseDown = (e) => {
    if (e.button === 1 || (e.button === 0 && (isSpacePressed || e.altKey || e.metaKey))) {
      setInteractionMode("panning");
      // pan 期间用 rAF 直接写三个 DOM 元素，完全绕过 setViewport / React re-render
      const startClientX = e.clientX;
      const startClientY = e.clientY;
      const startVpX = viewport.x;
      const startVpY = viewport.y;
      const zoom = viewport.zoom;
      let lastPanX = startVpX;
      let lastPanY = startVpY;
      let panRafId = 0;
      let latestPanEvent = null;

      const flushPanFrame = () => {
        panRafId = 0;
        const ev = latestPanEvent;
        if (!ev) return;
        const x = startVpX + (ev.clientX - startClientX);
        const y = startVpY + (ev.clientY - startClientY);
        lastPanX = x;
        lastPanY = y;
        const pos = `${x}px ${y}px`;
        if (panViewportLayerRef.current)
          panViewportLayerRef.current.style.transform = `translate(${x}px,${y}px) scale(${zoom})`;
        if (panGridFineRef.current) {
          panGridFineRef.current.style.backgroundPosition = pos;
        }
        if (panGridCoarseRef.current) {
          panGridCoarseRef.current.style.backgroundPosition = pos;
        }
      };

      const onPanMouseMove = (event) => {
        latestPanEvent = event;
        if (panRafId) return;
        panRafId = window.requestAnimationFrame(flushPanFrame);
      };

      const cleanupPan = () => {
        if (panRafId) {
          window.cancelAnimationFrame(panRafId);
          panRafId = 0;
        }
        flushPanFrame();
        latestPanEvent = null;
        window.removeEventListener("mousemove", onPanMouseMove);
        window.removeEventListener("mouseup", cleanupPan, true);
        window.removeEventListener("blur", cleanupPan);
        setViewport((prev) => ({ ...prev, x: lastPanX, y: lastPanY }));
        setInteractionMode("idle");
      };

      window.addEventListener("mousemove", onPanMouseMove);
      window.addEventListener("mouseup", cleanupPan, true);
      window.addEventListener("blur", cleanupPan);
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

  // useCallback([])：所有可变值通过 ref 读取，函数引用永久稳定，是 NodeComponent React.memo 的前提
  const handleNodeMouseDown = useCallback((e, nid) => {
    e.stopPropagation();

    const shouldBlockDrag = isNodeDragBlockedElement(e.target);

    // 从 ref 读取最新选中集合，避免 stale closure
    const s = new Set(selectedNodeIdsRef.current);
    if (e.shiftKey || e.ctrlKey) s.has(nid) ? s.delete(nid) : s.add(nid);
    else if (!s.has(nid)) { s.clear(); s.add(nid); }

    setSelectedNodeIds(s);
    setSelectedConnectionIds(new Set());

    if (shouldBlockDrag || e.button !== 0) {
      setInteractionMode("idle");
      return;
    }

    e.preventDefault();
    setInteractionMode("dragging_node");
    setDragStart({ x: e.clientX, y: e.clientY });

    // p: 从 ref 读取最新节点列表，构建初始坐标快照
    const p = {};
    nodesRef.current.forEach(n => {
      if (s.has(n.id) || n.id === nid) p[n.id] = { x: n.x, y: n.y };
    });
    setInitialNodePos(p);

    // 标记拖拽节点集合：NodeComponent 会在 re-render 时跳过这些节点的 left/top 写入，
    // 把位置控制权完全交给下面的 CSS transform，防止 React 意外覆盖。
    isDraggingNodeIdsRef.current = new Set(Object.keys(p));

    if (nodeDragCleanupRef.current) {
      nodeDragCleanupRef.current();
    }

    const startX = e.clientX;
    const startY = e.clientY;
    // 拖拽开始时从 ref 快照 zoom，确保 delta 计算在整个拖拽过程中使用一致的缩放比例
    const dragStartZoom = viewportRef.current.zoom;
    // 记录最后一帧实际应用的 delta，供 cleanupDrag 收口时提交最终坐标
    let lastAppliedDx = 0;
    let lastAppliedDy = 0;

    const flushNodeDragFrame = () => {
      nodeDragFrameRef.current = 0;
      const ev = nodeDragLatestEventRef.current;
      if (!ev) return;

      const dx = (ev.clientX - startX) / dragStartZoom;
      const dy = (ev.clientY - startY) / dragStartZoom;
      lastAppliedDx = dx;
      lastAppliedDy = dy;

      // ── 1. 移动所有拖拽节点（CSS transform，走 compositor，零 layout） ───────
      for (const nodeId of Object.keys(p)) {
        const el = nodeElementMapRef.current.get(nodeId);
        if (el) el.style.transform = `translate(${dx}px, ${dy}px)`;
      }

      // ── 2. 命令式刷新"至少一端在拖拽集合中"的连线路径 ──────────────────────
      // 拖拽期间传空障碍物列表（跳过绕障路由），松手后 React 重算恢复精确路径。
      const draggingIds = isDraggingNodeIdsRef.current;
      const currentConns = connectionsRef.current;
      const currentNodes = nodesRef.current;
      const connPathMap   = connPathMapRef.current;

      for (const conn of currentConns) {
        if (!draggingIds.has(conn.from) && !draggingIds.has(conn.to)) continue;

        const fromNode = currentNodes.find(n => n.id === conn.from);
        const toNode   = currentNodes.find(n => n.id === conn.to);
        if (!fromNode || !toNode) continue;

        // 拖拽中的节点加上当前 delta，静止节点用 nodesRef 里的真实坐标
        const fromAdj = p[fromNode.id]
          ? { ...fromNode, x: p[fromNode.id].x + dx, y: p[fromNode.id].y + dy }
          : fromNode;
        const toAdj = p[toNode.id]
          ? { ...toNode, x: p[toNode.id].x + dx, y: p[toNode.id].y + dy }
          : toNode;

        const fromAnchor = computeNodeAnchor(fromAdj, nodeElementMapRef.current.get(fromNode.id), "output");
        const toAnchor   = computeNodeAnchor(toAdj,   nodeElementMapRef.current.get(toNode.id),   "input", conn.toHandle);
        const d = computeBezierD(fromAnchor, toAnchor);

        const els = connPathMap.get(conn.id);
        if (els) {
          if (els.hit)     els.hit.setAttribute("d", d);
          if (els.visible) els.visible.setAttribute("d", d);
        }
      }
    };

    const onWindowMouseMove = (event) => {
      nodeDragLatestEventRef.current = { clientX: event.clientX, clientY: event.clientY };
      if (nodeDragFrameRef.current) return;
      nodeDragFrameRef.current = window.requestAnimationFrame(flushNodeDragFrame);
    };

    const cleanupDrag = () => {
      if (nodeDragFrameRef.current) {
        window.cancelAnimationFrame(nodeDragFrameRef.current);
        nodeDragFrameRef.current = 0;
      }
      // 先刷新最后一帧（更新 lastAppliedDx/Dy 到最终位置）
      flushNodeDragFrame();
      nodeDragLatestEventRef.current = null;
      window.removeEventListener("mousemove", onWindowMouseMove);
      window.removeEventListener("mouseup", cleanupDrag, true);
      window.removeEventListener("blur", cleanupDrag);
      nodeDragCleanupRef.current = null;

      // 收口顺序很重要，防止 React re-render 时 left/top 与 transform 产生冲突：
      // 1. 清掉所有拖拽节点的 CSS transform
      for (const nodeId of Object.keys(p)) {
        const el = nodeElementMapRef.current.get(nodeId);
        if (el) el.style.transform = "";
      }
      // 2. 清空 isDraggingNodeIdsRef（此后 NodeComponent re-render 会恢复 left/top）
      isDraggingNodeIdsRef.current = new Set();
      // 3. 将最终坐标写入 Zustand，触发 React re-render（节点回到 left/top 定位）
      const dx = lastAppliedDx;
      const dy = lastAppliedDy;
      setNodes((prev) =>
        prev.map((n) => (p[n.id] ? { ...n, x: p[n.id].x + dx, y: p[n.id].y + dy } : n))
      );

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 所有可变值均通过 ref 读取，deps 为空，引用永久稳定

  const handleMouseMove = useCallback(
    (e) => {
      if (canvasRef.current?.contains(e.target)) {
        canvasHoverClientRef.current = { x: e.clientX, y: e.clientY };
      }
      // pan 已由 handleCanvasMouseDown 内的命令式 rAF 循环接管，此处只处理选区框
      if (interactionMode === "selecting") {
        const c = screenToCanvas(e.clientX, e.clientY);
        setSelectionBox((p) => ({ ...p, curX: c.x, curY: c.y }));
      }
    },
    [interactionMode, screenToCanvas]
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
  }, [interactionMode, selectionBox, selectedNodeIds, nodes, onBoxSelectCompleteRef, pushHistory, setSelectedNodeIds, setConnectingSource]);

  useEffect(() => {
    // pan 已由 handleCanvasMouseDown 内的闭包自持 window 事件，此处只处理 selecting
    if (interactionMode !== "selecting") return undefined;

    const handleWindowMouseMove = (event) => { handleMouseMove(event); };
    const handleWindowMouseUp   = ()      => { handleMouseUp(); };

    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("mouseup",   handleWindowMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup",   handleWindowMouseUp);
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
  }, [pushHistory, setActiveNodeId, setNodes, setSelectedConnectionIds, setSelectedNodeIds]);

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
    [getCanvasViewportCenterPoint, pushHistory, setActiveNodeId, setConnections, setNodes, setSelectedConnectionIds, setSelectedNodeIds],
  );

  return {
    nodes, setNodes,
    connections, setConnections,
    history,            // 只读引用（来自 store），Workbench.jsx 用于 dep array
    historyStep,        // 只读（来自 store），Workbench.jsx 用于 dep array
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
    connPathMapRef, isDraggingNodeIdsRef,
    panViewportLayerRef, panGridFineRef, panGridCoarseRef,
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
    // store actions（Phase 1 新增，供 Workbench.jsx 直接使用）
    updateNodeData,
    applyPatch,
  };
}
