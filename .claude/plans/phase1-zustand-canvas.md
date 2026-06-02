# Phase 1 — Zustand + Immer Canvas State Migration

## Goal
把 `useCanvas()` 里的 `nodes / connections / viewport / selectedNodeIds / selectedConnectionIds / activeNodeId` 从 React `useState` 迁移到 Zustand + Immer store。其他交互逻辑（鼠标事件、拖拽、键盘）保持不变。

## Scope（本次只动这 5 个文件）
1. `package.json` — `npm install zustand immer`
2. **New** `src/stores/canvasStore.js` — Zustand + Immer store
3. `src/hooks/useCanvas.js` — 状态来源改为 store，return shape 不变 + 新增 `updateNodeData`/`applyPatch`
4. `src/hooks/useWorkbenchRun.js` — 去掉 `setNodes` 参数，直接从 store 读
5. `src/pages/Workbench.jsx` — 4 处微调（import + destructure + updateNodeData + _applyPatch + useWorkbenchRun 调用）

---

## 详细变更

### Step 1 — Install
```bash
npm install zustand immer
```

---

### Step 2 — New: `src/stores/canvasStore.js`

```js
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

const CANVAS_KEY = "bananaflow_canvas_id";
const newCanvasId = () => "canvas_" + Math.random().toString(36).slice(2, 12);

export const useCanvasStore = create(
  immer((set, get) => ({
    // ── state ──────────────────────────────────────────────────────────────
    canvasId: localStorage.getItem(CANVAS_KEY) || newCanvasId(),
    nodes: [],
    connections: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    selectedNodeIds: new Set(),
    selectedConnectionIds: new Set(),
    activeNodeId: null,

    // ── generic setters（兼容 useState 的函数式 updater）────────────────────
    setNodes: (updater) =>
      set((s) => { s.nodes = typeof updater === "function" ? updater(s.nodes) : updater; }),

    setConnections: (updater) =>
      set((s) => { s.connections = typeof updater === "function" ? updater(s.connections) : updater; }),

    setViewport: (updater) =>
      set((s) => { s.viewport = typeof updater === "function" ? updater(s.viewport) : updater; }),

    setSelectedNodeIds: (updater) =>
      set((s) => { s.selectedNodeIds = typeof updater === "function" ? updater(s.selectedNodeIds) : updater; }),

    setSelectedConnectionIds: (updater) =>
      set((s) => { s.selectedConnectionIds = typeof updater === "function" ? updater(s.selectedConnectionIds) : updater; }),

    setActiveNodeId: (id) => set((s) => { s.activeNodeId = id; }),

    // ── updateNodeData — O(1) Immer 直接 mutate（替换原 Workbench.jsx 里的 O(n) spread）──
    updateNodeData: (id, patch) =>
      set((s) => {
        const node = s.nodes.find((n) => n.id === id);
        if (node) Object.assign(node.data, patch);
      }),

    // ── applyPatch — 原 _applyPatch 的原子事务版本 ─────────────────────────
    applyPatch: (patchOps) => {
      if (!Array.isArray(patchOps) || patchOps.length === 0) return;
      set((s) => {
        const hasNode = (id) => s.nodes.some((n) => n?.id === id);
        const hasConn = (id) => s.connections.some((c) => c?.id === id);

        let finalSelectedNodeIds = null;
        let finalViewport = null;

        for (const op of patchOps) {
          if (!op?.op) continue;
          switch (op.op) {
            case "add_node":
              if (op.node?.id && !hasNode(op.node.id)) s.nodes.push(op.node);
              break;
            case "add_connection": {
              const c = op.connection;
              if (c?.id && c.from && c.to && !hasConn(c.id)) s.connections.push(c);
              break;
            }
            case "update_node": {
              const node = s.nodes.find((n) => n.id === op.id);
              if (node) {
                if (op.x != null) node.x = op.x;
                if (op.y != null) node.y = op.y;
                if (op.data) Object.assign(node.data, op.data);
              }
              break;
            }
            case "remove_node":
            case "delete_node":
              if (op.id) {
                s.nodes = s.nodes.filter((n) => n.id !== op.id);
                s.connections = s.connections.filter((c) => c.from !== op.id && c.to !== op.id);
              }
              break;
            case "remove_connection":
            case "delete_connection":
              if (op.id) s.connections = s.connections.filter((c) => c.id !== op.id);
              break;
            case "replace_connection":
              if (op.id) s.connections = s.connections.filter((c) => c.id !== op.id);
              if (op.connection?.id && op.connection.from && op.connection.to && !hasConn(op.connection.id))
                s.connections.push(op.connection);
              break;
            case "move_node": {
              const node = s.nodes.find((n) => n.id === op.id);
              if (node) { node.x = op.x ?? node.x; node.y = op.y ?? node.y; }
              break;
            }
            case "select_nodes":
              finalSelectedNodeIds = new Set(op.ids || []);
              break;
            case "set_viewport":
              finalViewport = op.viewport || null;
              break;
            default:
              break;
          }
        }
        if (finalSelectedNodeIds) {
          s.selectedNodeIds = finalSelectedNodeIds;
          s.selectedConnectionIds = new Set();
        }
        if (finalViewport) Object.assign(s.viewport, finalViewport);
      });
      // 返回 patch 后的快照（供 upsertCanvasDraftSnapshot 使用）
      return get();
    },
  }))
);
```

---

### Step 3 — `src/hooks/useCanvas.js`

**Remove** 这 6 行 `useState` 调用：
```js
const [nodes, setNodes] = useState([]);
const [connections, setConnections] = useState([]);
const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
const [selectedNodeIds, setSelectedNodeIds] = useState(new Set());
const [selectedConnectionIds, setSelectedConnectionIds] = useState(new Set());
const [activeNodeId, setActiveNodeId] = useState(null);
```
以及 `canvasId` 的 useState：
```js
const [canvasId] = useState(() => {
  const saved = localStorage.getItem(CANVAS_KEY);
  return saved || newCanvasId();
});
```
以及 canvasId 写 localStorage 的 effect：
```js
useEffect(() => {
  localStorage.setItem(CANVAS_KEY, canvasId);
}, [canvasId]);
```

**Add** 在文件顶部 import 后面：
```js
import { useCanvasStore } from "../stores/canvasStore.js";
```

**Add** 在 hook 函数体最前面（替换 useState 们）：
```js
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
} = useCanvasStore();
```

**Update** `return { ... }` — 在末尾加上 `updateNodeData, applyPatch`（其余保持不变）。

---

### Step 4 — `src/hooks/useWorkbenchRun.js`

**Before:**
```js
export function useWorkbenchRun({ apiFetch, setNodes } = {}) {
  ...
  setNodes((prev) =>
    prev.map((node) =>
      node.id === normalizedNodeId && node.data?.status === "loading"
        ? { ...node, data: { ...node.data, status: "idle", error: "已取消", progress: 0, total: 0 } }
        : node,
    ),
  );
  ...
}, [setNodes]);
```

**After:**
```js
import { useCanvasStore } from "../stores/canvasStore.js";

export function useWorkbenchRun({ apiFetch } = {}) {       // ← 去掉 setNodes 参数
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  ...
  updateNodeData(normalizedNodeId, { status: "idle", error: "已取消", progress: 0, total: 0 });
  ...
}, [updateNodeData]);
```

注意：原来的逻辑只在 `status === "loading"` 时才更新，用 `updateNodeData` 时需要加上防护：
```js
const { nodes } = useCanvasStore.getState();
const node = nodes.find((n) => n.id === normalizedNodeId);
if (node?.data?.status === "loading") {
  updateNodeData(normalizedNodeId, { status: "idle", error: "已取消", progress: 0, total: 0 });
}
```

---

### Step 5 — `src/pages/Workbench.jsx`

**5a — Add import** after line 165 (`import { useCanvas, cloneCanvasNodeLight }`):
```js
import { useCanvasStore } from "../stores/canvasStore.js";
```

**5b — Add `updateNodeData` and `applyPatch` to useCanvas destructuring** (lines 1333-1374):
```js
const {
  nodes, setNodes,
  connections, setConnections,
  ...
  updateNodeData,    // ← ADD
  applyPatch: storeApplyPatch,  // ← ADD (alias to avoid conflict with local _applyPatch)
  ...
} = useCanvas({...});
```

**5c — Remove manual `updateNodeData` definition** (lines 5126-5129):
```js
// DELETE this entire block:
const updateNodeData = useCallback(
  (id, d) => setNodes((p) => p.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...d } } : n))),
  [setNodes],
);
```

**5d — Replace `_applyPatch` implementation** (lines 2149-2268):
```js
const _applyPatch = useCallback((patchOps) => {
  if (!Array.isArray(patchOps) || patchOps.length === 0) return undefined;
  return storeApplyPatch(patchOps);   // store.applyPatch returns get() snapshot
}, [storeApplyPatch]);
```

**5e — Remove `setNodes` from `useWorkbenchRun` call** (line 1479):
```js
// Before:
} = useWorkbenchRun({ apiFetch, setNodes });
// After:
} = useWorkbenchRun({ apiFetch });
```

---

## Risk & Rollback
- `useCanvas.js` 的 ref 同步（`nodesRef`, `connectionsRef`, `viewportRef`）保持不变，继续由 `useEffect` 同步 store 值到 ref — 无风险。
- `history`/`historyStep`/`pushHistory`/`undo`/`redo` 保持 `useState` 不动 — undo/redo 功能无变化。
- 所有 `setNodes(fn)` / `setConnections(fn)` 调用兼容 — store action 同样支持函数式 updater。
- 如需回滚：`git checkout src/hooks/useCanvas.js src/pages/Workbench.jsx src/hooks/useWorkbenchRun.js && rm src/stores/canvasStore.js`

## Test checklist after migration
- [ ] 拖拽节点 — 位置更新正常
- [ ] 连线创建/删除 — 正常
- [ ] Ctrl+Z / Ctrl+Y — undo/redo 正常
- [ ] `updateNodeData` 调用（处理器节点状态更新）— 正常
- [ ] Agent patch（add_node, add_connection）— 正常
- [ ] 画布快照保存/恢复 — 正常
- [ ] useWorkbenchRun cancelNodeGeneration — 正常
