# Phase 6 — useCanvasExecutor (executeFlow hook)

## 目标
Workbench.jsx: 6,165 → ~5,100 行（−1,065 行，−17%）

## 变更

### Step 1 — workbenchHelpers.js 追加导出
- `export const MULTI_ANGLE_VARIANTS` (当前在 Workbench.jsx L784，只被 executeFlow 使用)
- `export const isAbortLikeError` (当前在 Workbench.jsx L481，只被 executeFlow 使用)
- Workbench.jsx 删除这两个定义，改为从 workbenchHelpers.js import

### Step 2 — 删除 LOADING_TIPS 死代码 (~10 行)
`LOADING_TIPS` 在 Workbench.jsx L487 定义但从未被引用（grep 确认只出现 1 次）。

### Step 3 — 新建 src/hooks/useCanvasExecutor.js
把 executeFlow（L4006–L5021，~1016 行）迁入 hook。

**Hook 接口：**
```js
export function useCanvasExecutor({
  apiFetch,
  defaultImageModelId,
  defaultVideoModelId,
  imageModelOptions,
  resolveModelParamsForId,
  agentDevMode,
  aiChatSessionIdRef,
  aiChatHistoryRecordIdRef,
  pushApiDebugDetail,
  updateApiDebugStatus,
  // from useWorkbenchRun (run state refs)
  runAbortControllerRef,
  nodeAbortControllersRef,
  cancelledNodeIdsRef,
  runningNodeIdsRef,
  setIsRunning,
  setRunToast,
  setGlobalError,
}) { return { executeFlow } }
```

**关键迁移点：**
- `nodesRef.current` → `useCanvasStore.getState().nodes`
- `connectionsRef.current` → `useCanvasStore.getState().connections`
- `applyNodeUpdate` 内的 `setNodes((prev) => prev.map(...))` → `updateNodeData(id, patch)` (O(1) Immer)
- `MULTI_ANGLE_VARIANTS`, `isAbortLikeError` 从 workbenchHelpers.js import
- `generateId`, `NODE_TYPES`, `checkNodeReady`, `cloneCanvasNodeLight` 从各自模块 import
- `resolveMemberAuthorizationInfo`, `submitAIChatImageTask` 从 api/aiChat import
- 所有 workbenchHelpers 函数直接 import

**从 canvasStore 读取（useCanvasExecutor 内部）：**
- `updateNodeData` — applyNodeUpdate 改用 O(1) Immer
- `setNodes` — 节点批量写入（output 节点、多角度输出）
- `setConnections` — 创建 output→input 连线

### Step 4 — 更新 Workbench.jsx
1. 删除 `isAbortLikeError` 和 `MULTI_ANGLE_VARIANTS` 定义，改为 import
2. 删除 `LOADING_TIPS` 死代码
3. 新增 `useCanvasExecutor` import
4. 在 `useWorkbenchRun` 之后添加 `useCanvasExecutor({...})` 调用
5. 删除 executeFlow 定义（L4006–L5021）

---

## 风险评估
| 变更 | 风险 | 原因 |
|---|---|---|
| MULTI_ANGLE_VARIANTS 移动 | ⭐ 低 | 只被 executeFlow 用，整体迁移 |
| isAbortLikeError 移动 | ⭐ 低 | 只被 executeFlow 用 |
| LOADING_TIPS 删除 | ⭐ 无 | grep 确认零引用 |
| useCanvasExecutor 创建 | ⭐⭐ 中 | async 流程复杂，nodesRef 替换需验证 |

## 测试清单
- [ ] 节点 Run 按钮触发 executeFlow — 正常
- [ ] 文生图、图生图、图生视频 — 正常完成
- [ ] Cancel 按钮中止正在运行的节点 — 正常
- [ ] 多角度输出模式（MULTI_ANGLE_VARIANTS）— 正常
- [ ] Ctrl+Z 在执行后能撤销 — 正常
