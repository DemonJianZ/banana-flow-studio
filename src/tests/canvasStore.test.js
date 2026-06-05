import assert from "node:assert/strict";
import test from "node:test";

const createStorage = () => {
  const data = new Map();
  return {
    getItem: (key) => data.get(key) || null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    clear: () => data.clear(),
  };
};

if (!globalThis.localStorage) {
  globalThis.localStorage = createStorage();
}

const { useCanvasStore } = await import("../stores/canvasStore.js");

test("canvasStore.applyPatch updates nodes and connections atomically", () => {
  const store = useCanvasStore;
  store.setState({
    nodes: [],
    connections: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    selectedNodeIds: new Set(),
    selectedConnectionIds: new Set(),
    activeNodeId: null,
  });

  const result = store.getState().applyPatch([
    { op: "add_node", node: { id: "a", type: "text_input", x: 0, y: 0, data: { text: "A" } } },
    { op: "add_node", node: { id: "b", type: "output", x: 320, y: 0, data: { images: [] } } },
    { op: "add_connection", connection: { id: "c1", from: "a", to: "b" } },
    { op: "update_node", id: "a", x: 12, y: 24, data: { text: "next" } },
  ]);

  const state = store.getState();
  assert.equal(state.nodes.length, 2);
  assert.equal(state.connections.length, 1);
  assert.equal(state.nodes.find((node) => node.id === "a").x, 12);
  assert.equal(state.nodes.find((node) => node.id === "a").data.text, "next");
  assert.equal(result.nodes.length, 2);
  assert.equal(result.connections.length, 1);
});
