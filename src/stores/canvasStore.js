/**
 * canvasStore.js — Zustand + Immer canvas state store
 *
 * 替代原 useCanvas.js 里的 nodes / connections / viewport /
 * selectedNodeIds / selectedConnectionIds / activeNodeId 这六块 useState，
 * 以及原 history / historyStep / pushHistory / undo / redo 手写快照系统。
 *
 * 核心收益：
 *   • updateNodeData  — O(1) Immer 直接 mutate（原 O(n) spread）
 *   • applyPatch      — 单次 set() 事务，不会撕裂中间状态
 *   • pushHistory     — O(1) 结构共享快照（Immer 冻结对象，无需 deep clone）
 *   • 跨组件订阅      — useCanvasStore(selector) 按需订阅，无 prop-drilling
 */
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

// ─── Constants ───────────────────────────────────────────────────────────────

const CANVAS_KEY = "bananaflow_canvas_id";
const newCanvasId = () => "canvas_" + Math.random().toString(36).slice(2, 12);

// ─── Store ────────────────────────────────────────────────────────────────────

export const useCanvasStore = create(
  immer((set, get) => ({

    // ── State ────────────────────────────────────────────────────────────────

    canvasId: (() => {
      const saved = localStorage.getItem(CANVAS_KEY);
      if (!saved) {
        const id = newCanvasId();
        localStorage.setItem(CANVAS_KEY, id);
        return id;
      }
      return saved;
    })(),
    nodes: [],
    connections: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    selectedNodeIds: new Set(),
    selectedConnectionIds: new Set(),
    activeNodeId: null,

    // ── History（Phase 2：替代 useCanvas.js 的手写 useState 快照系统）────────────
    // 快照只保存 nodes + connections（不含 viewport / selection），与原逻辑一致。
    // Immer 产生冻结对象，pushHistory 直接引用当前 state，无需 deep clone — O(1)。
    _history: [],
    _historyStep: -1,

    // ── Generic setters（兼容 React setState 的函数式 updater）─────────────────
    // 保持与原 useCanvas 完全相同的调用签名：setNodes(fn) 或 setNodes(value)

    setNodes: (updater) =>
      set((s) => {
        s.nodes = typeof updater === "function" ? updater(s.nodes) : updater;
      }),

    setConnections: (updater) =>
      set((s) => {
        s.connections = typeof updater === "function" ? updater(s.connections) : updater;
      }),

    setViewport: (updater) =>
      set((s) => {
        s.viewport = typeof updater === "function" ? updater(s.viewport) : updater;
      }),

    setSelectedNodeIds: (updater) =>
      set((s) => {
        s.selectedNodeIds =
          typeof updater === "function" ? updater(s.selectedNodeIds) : updater;
      }),

    setSelectedConnectionIds: (updater) =>
      set((s) => {
        s.selectedConnectionIds =
          typeof updater === "function" ? updater(s.selectedConnectionIds) : updater;
      }),

    setActiveNodeId: (id) =>
      set((s) => {
        s.activeNodeId = id;
      }),

    // ── History actions ──────────────────────────────────────────────────────────

    // 在每次破坏性操作（删除/拖拽结束/排版/Agent patch）前调用，保存当前快照。
    // get() 返回 Immer 已冻结的 state，直接引用即可（结构共享，O(1)）。
    pushHistory: () => {
      const { nodes, connections, _history, _historyStep } = get();
      const snapshot = { nodes, connections };
      // 截断 redo 分支，追加当前快照，限制 50 步
      const trimmed = _history.slice(0, _historyStep + 1);
      trimmed.push(snapshot);
      if (trimmed.length > 50) trimmed.shift();
      set((s) => {
        s._history = trimmed;
        s._historyStep = trimmed.length - 1;
      });
    },

    undo: () => {
      const { _history, _historyStep } = get();
      if (_historyStep <= 0) return;
      const prev = _history[_historyStep - 1];
      set((s) => {
        // Immer 接受冻结对象直接赋值（结构共享，不再分配新内存）
        s.nodes = prev.nodes;
        s.connections = prev.connections;
        s._historyStep--;
      });
    },

    redo: () => {
      const { _history, _historyStep } = get();
      if (_historyStep >= _history.length - 1) return;
      const next = _history[_historyStep + 1];
      set((s) => {
        s.nodes = next.nodes;
        s.connections = next.connections;
        s._historyStep++;
      });
    },

    // ── updateNodeData — O(1) Immer 直接 mutate ───────────────────────────────
    // 原：setNodes(p => p.map(n => n.id === id ? {...n, data: {...n.data, ...d}} : n))
    // 现：直接找到节点 Object.assign，不遍历不重建数组

    updateNodeData: (id, patch) =>
      set((s) => {
        const node = s.nodes.find((n) => n.id === id);
        if (node) Object.assign(node.data, patch);
      }),

    // ── applyPatch — 原 _applyPatch 的 Immer 事务版 ───────────────────────────
    // 单次 set() 保证原子性；Immer draft 始终是最新状态，无闭包陈旧问题。
    // 返回 patch 后的完整快照 { nodes, connections, viewport }，
    // 供 upsertCanvasDraftSnapshot 使用（与原 _applyPatch 返回值兼容）。

    applyPatch: (patchOps) => {
      if (!Array.isArray(patchOps) || patchOps.length === 0) return undefined;

      set((s) => {
        const hasNode = (id) => s.nodes.some((n) => n?.id === id);
        const hasConn = (id) => s.connections.some((c) => c?.id === id);

        let finalSelectedNodeIds = null;
        let finalViewport = null;

        for (const op of patchOps) {
          if (!op?.op) continue;

          switch (op.op) {
            case "add_node": {
              if (op.node?.id && !hasNode(op.node.id)) s.nodes.push(op.node);
              break;
            }

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
            case "delete_node": {
              if (!op.id) break;
              s.nodes = s.nodes.filter((n) => n.id !== op.id);
              s.connections = s.connections.filter(
                (c) => c.from !== op.id && c.to !== op.id,
              );
              break;
            }

            case "remove_connection":
            case "delete_connection": {
              if (op.id) s.connections = s.connections.filter((c) => c.id !== op.id);
              break;
            }

            case "replace_connection": {
              if (op.id) s.connections = s.connections.filter((c) => c.id !== op.id);
              const rc = op.connection;
              if (rc?.id && rc.from && rc.to && !hasConn(rc.id)) s.connections.push(rc);
              break;
            }

            case "move_node": {
              const node = s.nodes.find((n) => n.id === op.id);
              if (node) {
                node.x = op.x ?? node.x;
                node.y = op.y ?? node.y;
              }
              break;
            }

            case "select_nodes": {
              finalSelectedNodeIds = new Set(op.ids || []);
              break;
            }

            case "set_viewport": {
              finalViewport = op.viewport || null;
              break;
            }

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

      // 返回 patch 后快照（同步读，Immer 已提交）
      const { nodes, connections, viewport } = get();
      return { nodes, connections, viewport };
    },
  }))
);
