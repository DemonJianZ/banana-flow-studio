import { NODE_TYPES } from "../constants/workbench.jsx";

export const NODE_CULLING_OVERSCAN = 520;
export const CONNECTION_OBSTACLE_PADDING = 28;

export function getEstimatedNodeSize(node, element = null) {
  const measuredWidth = element?.offsetWidth;
  const measuredHeight = element?.offsetHeight;
  const width =
    measuredWidth ||
    (node?.type === NODE_TYPES.STORYBOARD_PLAN
      ? 1280
      : node?.type === NODE_TYPES.STORYBOARD_INPUT
      ? 380
      : node?.type === NODE_TYPES.TEXT_INPUT
      ? 320
      : node?.type === NODE_TYPES.ROLE_INPUT
      ? 76
      : node?.type === "group_container"
      ? Number(node?.data?.width) || 800
      : 280);
  const height =
    measuredHeight ||
    (node?.type === NODE_TYPES.STORYBOARD_PLAN
      ? 620
      : node?.type === NODE_TYPES.STORYBOARD_INPUT
      ? 260
      : node?.type === NODE_TYPES.ROLE_INPUT
      ? 76
      : node?.type === "group_container"
      ? Number(node?.data?.height) || 400
      : 200);
  return { width, height };
}

export function getNodeBounds(node, element = null, padding = 0) {
  const size = getEstimatedNodeSize(node, element);
  const x = Number(node?.x || 0);
  const y = Number(node?.y || 0);
  return {
    id: node?.id,
    x: x - padding,
    y: y - padding,
    width: size.width + padding * 2,
    height: size.height + padding * 2,
    left: x - padding,
    top: y - padding,
    right: x + size.width + padding,
    bottom: y + size.height + padding,
    centerX: x + size.width / 2,
    centerY: y + size.height / 2,
  };
}

export function getViewportCanvasBounds(viewport, canvasSize, overscan = 0) {
  const zoom = Math.max(0.0001, Number(viewport?.zoom || 1));
  const width = Number(canvasSize?.width || 0);
  const height = Number(canvasSize?.height || 0);
  const left = (-Number(viewport?.x || 0)) / zoom - overscan;
  const top = (-Number(viewport?.y || 0)) / zoom - overscan;
  const right = (width - Number(viewport?.x || 0)) / zoom + overscan;
  const bottom = (height - Number(viewport?.y || 0)) / zoom + overscan;
  return { left, top, right, bottom, x: left, y: top, width: right - left, height: bottom - top };
}

export function rectsIntersect(a, b) {
  if (!a || !b) return false;
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

export function lineIntersectsRect(a, b, rect) {
  if (!rect) return false;
  if (pointInRect(a, rect) || pointInRect(b, rect)) return true;
  const corners = [
    { x: rect.left, y: rect.top },
    { x: rect.right, y: rect.top },
    { x: rect.right, y: rect.bottom },
    { x: rect.left, y: rect.bottom },
  ];
  for (let index = 0; index < corners.length; index += 1) {
    const next = (index + 1) % corners.length;
    if (segmentsIntersect(a, b, corners[index], corners[next])) return true;
  }
  return false;
}

function pointInRect(point, rect) {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
}

function orientation(a, b, c) {
  const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  if (Math.abs(value) < 0.0001) return 0;
  return value > 0 ? 1 : 2;
}

function onSegment(a, b, c) {
  return b.x <= Math.max(a.x, c.x) && b.x >= Math.min(a.x, c.x) && b.y <= Math.max(a.y, c.y) && b.y >= Math.min(a.y, c.y);
}

function segmentsIntersect(p1, q1, p2, q2) {
  const o1 = orientation(p1, q1, p2);
  const o2 = orientation(p1, q1, q2);
  const o3 = orientation(p2, q2, p1);
  const o4 = orientation(p2, q2, q1);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, q2, q1)) return true;
  if (o3 === 0 && onSegment(p2, p1, q2)) return true;
  if (o4 === 0 && onSegment(p2, q1, q2)) return true;
  return false;
}
