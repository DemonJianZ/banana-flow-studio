import { useMemo } from "react";

export function useConnectedInputsByNodeId(nodes, connections) {
  return useMemo(() => {
    const map = new Map();
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const downstreamOf = new Map();
    const upstreamOf = new Map();

    connections.forEach((connection) => {
      if (!connection.from || !connection.to) return;
      if (!downstreamOf.has(connection.from)) downstreamOf.set(connection.from, new Set());
      downstreamOf.get(connection.from).add(connection.to);
      if (!upstreamOf.has(connection.to)) upstreamOf.set(connection.to, new Set());
      upstreamOf.get(connection.to).add(connection.from);
    });

    nodes.forEach((node) => {
      if (node.type !== "text_input") return;
      const downstreamIds = downstreamOf.get(node.id) || new Set();
      const siblingInputNodes = [];
      const seen = new Set();
      downstreamIds.forEach((downstreamId) => {
        const upstreamIds = upstreamOf.get(downstreamId) || new Set();
        upstreamIds.forEach((siblingId) => {
          if (siblingId === node.id || seen.has(siblingId)) return;
          const sibling = nodeById.get(siblingId);
          if (sibling && sibling.type === "input") {
            seen.add(siblingId);
            siblingInputNodes.push(sibling);
          }
        });
      });
      map.set(node.id, siblingInputNodes);
    });

    return map;
  }, [connections, nodes]);
}
