import { useCallback, useEffect, useRef } from "react";
import {
  VIDEO_GEN_INPUT_HANDLE_LAST_FRAME,
  VIDEO_GEN_INPUT_HANDLE_MAIN,
  normalizeConnectionTargetHandle,
} from "../constants/workbench.jsx";
import {
  CONNECTION_OBSTACLE_PADDING,
  getEstimatedNodeSize,
  getNodeBounds,
  lineIntersectsRect,
  rectsIntersect,
} from "../lib/workbenchGeometry.js";

const CONNECTION_PATH_PADDING = 160;
const CONNECTION_PATH_CACHE_LIMIT = 2400;

const getNodeAnchorPosition = (node, nodeElement, direction = "output", handle = VIDEO_GEN_INPUT_HANDLE_MAIN) => {
  const size = getEstimatedNodeSize(node, nodeElement);
  const isLastFrameHandle = normalizeConnectionTargetHandle(handle) === VIDEO_GEN_INPUT_HANDLE_LAST_FRAME;
  const lastFrameHandleY = Math.min(size.height - 24, Math.max(36, size.height / 2 + 40));

  return {
    x: direction === "output" ? node.x + size.width : node.x,
    y: node.y + (isLastFrameHandle ? lastFrameHandleY : size.height / 2),
  };
};

const getPathBounds = (points, padding = 0) => {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs) - padding;
  const right = Math.max(...xs) + padding;
  const top = Math.min(...ys) - padding;
  const bottom = Math.max(...ys) + padding;
  return { left, right, top, bottom, x: left, y: top, width: right - left, height: bottom - top };
};

const routeHitsObstacle = (points, obstacles) => {
  for (let index = 0; index < points.length - 1; index += 1) {
    if (obstacles.some((obstacle) => lineIntersectsRect(points[index], points[index + 1], obstacle))) return true;
  }
  return false;
};

const createSmoothBezierPath = (points) => {
  if (points.length === 2) {
    const [start, end] = points;
    const dx = Math.max(80, Math.abs(end.x - start.x) / 2);
    return `M ${start.x} ${start.y} C ${start.x + dx} ${start.y}, ${end.x - dx} ${end.y}, ${end.x} ${end.y}`;
  }

  const [start, via, end] = points;
  const firstDx = Math.max(72, Math.abs(via.x - start.x) / 2);
  const secondDx = Math.max(72, Math.abs(end.x - via.x) / 2);
  return [
    `M ${start.x} ${start.y}`,
    `C ${start.x + firstDx} ${start.y}, ${via.x - firstDx} ${via.y}, ${via.x} ${via.y}`,
    `C ${via.x + secondDx} ${via.y}, ${end.x - secondDx} ${end.y}, ${end.x} ${end.y}`,
  ].join(" ");
};

const buildAvoidingBezierPath = ({ start, end, obstacles }) => {
  const directPoints = [start, end];
  if (!routeHitsObstacle(directPoints, obstacles)) {
    return { path: createSmoothBezierPath(directPoints), routePoints: directPoints };
  }

  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;
  const blocking = obstacles.filter((obstacle) => lineIntersectsRect(start, end, obstacle));
  const candidateLanes = blocking
    .flatMap((obstacle) => [obstacle.top - CONNECTION_OBSTACLE_PADDING, obstacle.bottom + CONNECTION_OBSTACLE_PADDING])
    .sort((a, b) => Math.abs(a - midY) - Math.abs(b - midY));

  const allTop = Math.min(...obstacles.map((obstacle) => obstacle.top), midY);
  const allBottom = Math.max(...obstacles.map((obstacle) => obstacle.bottom), midY);
  candidateLanes.push(allTop - CONNECTION_OBSTACLE_PADDING * 2, allBottom + CONNECTION_OBSTACLE_PADDING * 2);

  for (const laneY of candidateLanes) {
    const routePoints = [start, { x: midX, y: laneY }, end];
    if (!routeHitsObstacle(routePoints, obstacles)) {
      return { path: createSmoothBezierPath(routePoints), routePoints };
    }
  }

  const fallbackY = Math.abs(allTop - midY) < Math.abs(allBottom - midY)
    ? allTop - CONNECTION_OBSTACLE_PADDING * 3
    : allBottom + CONNECTION_OBSTACLE_PADDING * 3;
  const routePoints = [start, { x: midX, y: fallbackY }, end];
  return { path: createSmoothBezierPath(routePoints), routePoints };
};

const buildObstacleSignature = (obstacles) =>
  obstacles
    .map((obstacle) => `${obstacle.id}:${Math.round(obstacle.left)},${Math.round(obstacle.top)},${Math.round(obstacle.right)},${Math.round(obstacle.bottom)}`)
    .join("|");

const buildConnectionPathCacheKey = ({ connection, start, end, obstacles }) =>
  [
    connection.id,
    connection.from,
    connection.to,
    normalizeConnectionTargetHandle(connection.toHandle),
    Math.round(start.x),
    Math.round(start.y),
    Math.round(end.x),
    Math.round(end.y),
    buildObstacleSignature(obstacles),
  ].join(";");

export function useWorkbenchConnectionLayer({
  connections,
  nodes,
  nodeElementMapRef,
  selectedConnectionIds,
  hoveredConnectionId,
  setHoveredConnectionId,
  handleConnectionClick,
  deleteConnectionById,
  isRunning,
  connectingSource,
  hoveredConnectTarget,
  screenToCanvas,
  mousePos, // 保留入参兼容性，不再读取（临时连线已改为命令式 DOM 驱动）
  viewport,
  connPathMapRef, // 由 useCanvas 传入；本 hook 负责注册各连线的 path DOM 元素
}) {
  const pathCacheRef = useRef(new Map());

  // ── 临时连线 DOM refs（命令式刷新，绕过 React reconciler） ──────────────────
  const tempPathRef = useRef(null);
  const tempCircleRef = useRef(null);

  // 始终持有最新的 hoveredConnectTarget，避免 useEffect 闭包读到过期值
  const hoveredConnectTargetRef = useRef(hoveredConnectTarget);
  useEffect(() => { hoveredConnectTargetRef.current = hoveredConnectTarget; }, [hoveredConnectTarget]);

  // 始终持有最新的 nodes，避免 mousemove 闭包读到过期值
  const nodesLocalRef = useRef(nodes);
  useEffect(() => { nodesLocalRef.current = nodes; }, [nodes]);

  // 命令式 mousemove：connectingSource 激活时注册，消失时清理
  useEffect(() => {
    const pathEl = tempPathRef.current;
    const circleEl = tempCircleRef.current;
    if (!connectingSource || !pathEl) return undefined;

    // 源节点锚点在拖拽开始时计算一次即可（拖线期间不会移动源节点）
    const sourceNode = nodesLocalRef.current.find((n) => n.id === connectingSource.nodeId);
    if (!sourceNode) return undefined;
    const sourceAnchor = getNodeAnchorPosition(sourceNode, nodeElementMapRef.current.get(sourceNode.id), "output");

    // rAF 节流：每帧最多刷新一次，减少 getBoundingClientRect + bezier 的计算频率
    let rafId = 0;
    let latestClientX = 0;
    let latestClientY = 0;

    const flush = () => {
      rafId = 0;
      const currentNodes = nodesLocalRef.current;
      const hoverTarget = hoveredConnectTargetRef.current;

      let end;
      if (hoverTarget?.nodeId) {
        const targetNode = currentNodes.find((n) => n.id === hoverTarget.nodeId);
        end = targetNode
          ? getNodeAnchorPosition(targetNode, nodeElementMapRef.current.get(targetNode.id), "input", hoverTarget.toHandle)
          : screenToCanvas(latestClientX, latestClientY);
      } else {
        end = screenToCanvas(latestClientX, latestClientY);
      }

      // 障碍物只取当前可见节点，排除端点节点
      const obstacles = currentNodes
        .filter((n) => n.type !== "group_container" && n.id !== sourceNode.id)
        .map((n) => getNodeBounds(n, nodeElementMapRef.current.get(n.id), CONNECTION_OBSTACLE_PADDING));

      const { path } = buildAvoidingBezierPath({ start: sourceAnchor, end, obstacles });
      pathEl.setAttribute("d", path);
      pathEl.setAttribute("stroke-width", String(2 / viewport.zoom));
      pathEl.style.display = "block";

      if (hoverTarget?.nodeId && circleEl) {
        const targetNode = currentNodes.find((n) => n.id === hoverTarget.nodeId);
        if (targetNode) {
          const anchor = getNodeAnchorPosition(
            targetNode,
            nodeElementMapRef.current.get(targetNode.id),
            "input",
            hoverTarget.toHandle,
          );
          circleEl.setAttribute("cx", String(anchor.x));
          circleEl.setAttribute("cy", String(anchor.y));
          circleEl.setAttribute("r", String(8 / viewport.zoom));
          circleEl.setAttribute("stroke-width", String(1.6 / viewport.zoom));
          circleEl.style.display = "block";
        }
      } else if (circleEl) {
        circleEl.style.display = "none";
      }
    };

    const onMouseMove = (e) => {
      latestClientX = e.clientX;
      latestClientY = e.clientY;
      if (rafId) return;
      rafId = window.requestAnimationFrame(flush);
    };

    window.addEventListener("mousemove", onMouseMove);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      if (rafId) window.cancelAnimationFrame(rafId);
      if (pathEl) pathEl.style.display = "none";
      if (circleEl) circleEl.style.display = "none";
    };
  // viewport.zoom 变化时重新注册，确保 strokeWidth 计算正确
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectingSource, nodeElementMapRef, screenToCanvas, viewport.zoom]);

  const renderConnections = useCallback(
    ({ visibleCanvasBounds = null, visibleNodes = nodesLocalRef.current } = {}) => {
      // nodesLocalRef.current 始终持有最新节点列表，但不作为 deps 触发重建。
      // 节点 status/data 更新不再导致所有连线重渲；位置变更已由命令式 setAttribute 处理。
      const currentNodes = nodesLocalRef.current;
      const nodesById = new Map(currentNodes.map((node) => [node.id, node]));
      const visibleNodeIds = new Set((visibleNodes || []).map((node) => node.id));
      const obstacleBounds = (visibleNodes || [])
        .filter((node) => node.type !== "group_container")
        .map((node) => getNodeBounds(node, nodeElementMapRef.current.get(node.id), CONNECTION_OBSTACLE_PADDING));

      return connections.map((connection) => {
        const fromNode = nodesById.get(connection.from);
        const toNode = nodesById.get(connection.to);
        if (!fromNode || !toNode) return null;
        const fromAnchor = getNodeAnchorPosition(fromNode, nodeElementMapRef.current.get(fromNode.id), "output");
        const toAnchor = getNodeAnchorPosition(toNode, nodeElementMapRef.current.get(toNode.id), "input", connection.toHandle);
        const start = { x: fromAnchor.x, y: fromAnchor.y };
        const end = { x: toAnchor.x, y: toAnchor.y };
        const routeObstacles = obstacleBounds.filter((obstacle) => obstacle.id !== fromNode.id && obstacle.id !== toNode.id);
        const cacheKey = buildConnectionPathCacheKey({ connection, start, end, obstacles: routeObstacles });
        let cachedPath = pathCacheRef.current.get(cacheKey);
        if (!cachedPath) {
          cachedPath = buildAvoidingBezierPath({ start, end, obstacles: routeObstacles });
          pathCacheRef.current.set(cacheKey, cachedPath);
          if (pathCacheRef.current.size > CONNECTION_PATH_CACHE_LIMIT) {
            const firstKey = pathCacheRef.current.keys().next().value;
            pathCacheRef.current.delete(firstKey);
          }
        }
        const { path, routePoints } = cachedPath;

        if (visibleCanvasBounds && !visibleNodeIds.has(fromNode.id) && !visibleNodeIds.has(toNode.id)) {
          const pathBounds = getPathBounds(routePoints, CONNECTION_PATH_PADDING);
          if (!rectsIntersect(pathBounds, visibleCanvasBounds)) return null;
        }

        const isSelected = selectedConnectionIds.has(connection.id);
        const isHovered = hoveredConnectionId === connection.id;
        const isInteractive = isSelected || isHovered;
        const gradientId = `connection_flow_${String(connection.id).replace(/[^a-zA-Z0-9_-]/g, "_")}`;
        const glowId = `connection_glow_${String(connection.id).replace(/[^a-zA-Z0-9_-]/g, "_")}`;
        const deleteX = routePoints.length === 3 ? routePoints[1].x : (start.x + end.x) / 2;
        const deleteY = routePoints.length === 3 ? routePoints[1].y : (start.y + end.y) / 2;
        return (
          <g
            key={connection.id}
            onMouseEnter={() => setHoveredConnectionId(connection.id)}
            onMouseLeave={() => setHoveredConnectionId((prev) => (prev === connection.id ? "" : prev))}
            >
            {isRunning ? (
              <defs>
                <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="var(--wbn-edge-flow-a)" />
                  <stop offset="45%" stopColor="var(--wbn-edge-flow-b)" />
                  <stop offset="100%" stopColor="var(--wbn-edge-flow-c)" />
                </linearGradient>
                <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
            ) : null}
            <path
              ref={connPathMapRef
                ? (el) => {
                    const entry = connPathMapRef.current.get(connection.id) || {};
                    entry.hit = el || undefined;
                    if (el) connPathMapRef.current.set(connection.id, entry);
                  }
                : undefined}
              d={path}
              stroke="transparent"
              strokeWidth="16"
              fill="none"
              className="cursor-pointer pointer-events-auto"
              pointerEvents="stroke"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => handleConnectionClick(event, connection.id)}
              onDoubleClick={(event) => {
                event.stopPropagation();
                deleteConnectionById(connection.id);
              }}
            />
            <path
              ref={connPathMapRef
                ? (el) => {
                    const entry = connPathMapRef.current.get(connection.id) || {};
                    entry.visible = el || undefined;
                    if (el) connPathMapRef.current.set(connection.id, entry);
                    // 两个 path 都已卸载时清理 Map 条目，避免内存泄漏
                    else if (!entry.hit && !entry.visible) connPathMapRef.current.delete(connection.id);
                  }
                : undefined}
              d={path}
              stroke={isRunning ? `url(#${gradientId})` : isInteractive ? "var(--wbn-edge-active)" : "var(--wbn-edge-idle)"}
              strokeWidth={isInteractive || isRunning ? "3" : "2"}
              fill="none"
              strokeLinecap="round"
              className={`pointer-events-none transition-colors duration-200 ${isRunning ? "wbn-edge-flow" : ""}`}
              strokeDasharray={isRunning ? "10 8" : undefined}
              filter={isRunning ? `url(#${glowId})` : undefined}
            >
              {isRunning ? <animate attributeName="stroke-dashoffset" from="18" to="0" dur="0.9s" repeatCount="indefinite" /> : null}
            </path>
            {isInteractive ? (
              <g
                className="cursor-pointer pointer-events-auto"
                pointerEvents="all"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  deleteConnectionById(connection.id);
                }}
              >
                <title>删除连接</title>
                <circle cx={deleteX} cy={deleteY} r="18" fill="rgba(255,255,255,0.001)" pointerEvents="all" />
                <circle cx={deleteX} cy={deleteY} r="11" fill="white" stroke="#fb7185" strokeWidth="1.5" pointerEvents="all" />
                <path
                  d={`M ${deleteX - 3.5} ${deleteY - 3.5} L ${deleteX + 3.5} ${deleteY + 3.5} M ${deleteX + 3.5} ${deleteY - 3.5} L ${deleteX - 3.5} ${deleteY + 3.5}`}
                  stroke="#e11d48"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  pointerEvents="none"
                />
              </g>
            ) : null}
            {isRunning ? (
              <circle r="3.5" fill="#67e8f9">
                <animateMotion dur="1.5s" repeatCount="indefinite" path={path} />
              </circle>
            ) : null}
          </g>
        );
      });
    },
    // nodes 已改为读 nodesLocalRef.current（ref 不触发重建），从 deps 中移除。
    // 连线重算只在 connections / 选中状态 / 运行状态变化时触发，与节点数据更新解耦。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [connections, deleteConnectionById, handleConnectionClick, hoveredConnectionId, isRunning, nodeElementMapRef, selectedConnectionIds, setHoveredConnectionId],
  );

  // renderTempConnection：只负责渲染静态占位 DOM 节点，路径值由上方 useEffect 命令式写入。
  // 不再依赖 mousePos / connectingSource / hoveredConnectTarget，deps 为空，函数引用永久稳定。
  const renderTempConnection = useCallback(() => (
    <>
      <path
        ref={tempPathRef}
        style={{ display: "none" }}
        stroke="#fbbf24"
        strokeDasharray="5,5"
        fill="none"
      />
      <circle
        ref={tempCircleRef}
        style={{ display: "none" }}
        fill="rgba(34,211,238,0.14)"
        stroke="#22d3ee"
      />
    </>
  ), []);

  return { renderConnections, renderTempConnection };
}
