# Workbench.jsx 拆分重构设计文档

## 目标

将 18,324 行的 `Workbench.jsx` 单文件拆分为：9 个独立组件 + 6 个自定义 hook，使每个文件职责单一、可独立理解和修改。

## 架构概述

采用**自下而上增量提取**策略，分两阶段：
1. Phase 1：将内嵌在文件顶部（Workbench 函数体外）的 9 个组件定义移出至 `src/components/workbench/`
2. Phase 2：将 Workbench 函数体内按逻辑域聚合的 state + handler 提取为 6 个自定义 hook 到 `src/hooks/`

每次提取都是独立 commit，出问题可单步 `git revert`。

**技术栈**：React 18 / Vite，JSX，不引入新依赖。

---

## 目标目录结构

```
src/
  components/
    workbench/              ← Phase 1：从 Workbench.jsx 顶部提取
      DramaMarkdownBlock.jsx
      PromptPolishPickerModal.jsx
      VideoPlayer.jsx
      InlineDropdown.jsx
      ToolIconBtn.jsx
      SidebarBtn.jsx
      AgentResultCardContent.jsx
      PropertyPanel.jsx
      NodeComponent.jsx
  hooks/                    ← Phase 2：从 Workbench 函数体提取
    useMemberInfo.js
    useCanvas.js
    useAssetLibrary.js
    useSidebar.js
    useAgentChat.js
    useWorkbenchRun.js
  pages/
    Workbench.jsx           ← 重构后：仅保留组合逻辑 + JSX 骨架，预计 4-6K 行
```

---

## Phase 1：组件提取

每个组件文件格式：`import` → 组件定义 → `export default`。  
Workbench.jsx 顶部原定义处替换为 `import XxxComponent from "../components/workbench/XxxComponent";`。

### 提取列表

| 文件 | 当前行 | Props 签名 | 是否含内部 useState |
|------|--------|------------|---------------------|
| `DramaMarkdownBlock.jsx` | 685 | `{ value="", className="" }` | 否 |
| `PromptPolishPickerModal.jsx` | 780 | `{ open, title, sourcePrompt, variants, onClose, onUse }` | 否 |
| `VideoPlayer.jsx` | 2956 | `{ src, className, controls=false, autoPlay=true, ...props }` | 否 |
| `InlineDropdown.jsx` | 2981 | `{ value, options=[], onChange, placeholder, className, panelClassName, onMouseDown }` | 是（open, rootRef） |
| `ToolIconBtn.jsx` | 3089 | `{ icon, onClick, disabled, active, title }` | 否 |
| `SidebarBtn.jsx` | 3109 | `{ icon, itemId, label, desc, onClick, color, bg, active, compact, onHoverChange, category, primary, menuTrigger }` | 否 |
| `AgentResultCardContent.jsx` | 3161 | `{ turn, onRetry, onBriefChange, onBriefSubmit, onBriefSubmitDefaults, onBriefCancel, onSelectAngle }` | 否 |
| `PropertyPanel.jsx` | 3269 | `{ node, updateData, onClose, apiFetch, onOpenPromptPolishPicker, imageModelOptions, videoModelOptions, resolveModelParamsForId, personaMentionOptions, embedded, onRunNode, onCancelNode, isReady }` | 是（showAdvanced 等） |
| `NodeComponent.jsx` | 4484 | `{ node, selected, onMouseDown, updateData, apiFetch, onOpenPromptPolishPicker, imageModelOptions, videoModelOptions, resolveModelParamsForId, personaMentionOptions, onDelete, onConnectStart, onConnectTargetHover, onConnectTargetLeave, connecting, hoveredConnectTarget, onPreview, onContinue, isReady, onRetry, onSelectArtifact, activeArtifact, onIterateImg2Img, onRunCompactRmbg, onRunCompactRemoveWatermark, onRunCompactThreeView, ...其余 props }` | 是（多个内部状态） |

**提取顺序**（依赖最少的先提取）：DramaMarkdownBlock → VideoPlayer → ToolIconBtn → SidebarBtn → PromptPolishPickerModal → InlineDropdown → AgentResultCardContent → PropertyPanel → NodeComponent

**注意**：组件内部引用的模块级常量（如 `EMPTY_LIST`、`normalizeScriptBrief` 等）需一并处理，**不能** 从 `../pages/Workbench` import（会产生循环依赖）：
- 若常量/函数只被该组件用到 → 随组件一起移出
- 若被多个提取目标共用 → 在提取第一个使用者时，将该常量移至 `src/lib/workbenchUtils.js`（已存在）或 `src/constants/workbench.js`（Phase 1 时创建），其余引用处改为从该共享文件 import

---

## Phase 2：自定义 Hook 提取

每个 hook 文件格式：`import { useState, useEffect, ... } from "react"` + 相关 API/util imports → `export function useFoo(deps) { ... return { ... }; }`

### Hook 设计

#### `useMemberInfo.js`

```js
export function useMemberInfo(apiFetch) {
  // state
  const [memberInfo, setMemberInfo] = useState(null);
  const [memberInfoLoading, setMemberInfoLoading] = useState(true);
  const [memberInfoLoginUrl, setMemberInfoLoginUrl] = useState("");
  const [userAuths, setUserAuths] = useState(null);
  const [userAuthsLoading, setUserAuthsLoading] = useState(true);
  // 加载逻辑：viewMemberInfo, viewUserAuths on mount
  return { memberInfo, memberInfoLoading, memberInfoLoginUrl, userAuths, userAuthsLoading };
}
```

#### `useCanvas.js`

管理画布的所有交互状态。接受 `{ apiFetch, onDropAsset }` 等回调。

```js
// state 包含：
// nodes, setNodes, connections, history, historyStep, viewport,
// selectedNodeIds, selectedConnectionIds, activeNodeId,
// isSpacePressed, interactionMode, dragStart, initialNodePos,
// selectionBox, connectingSource, hoveredConnectionId,
// hoveredConnectTarget, mousePos, canvasDropActive, canvasDropUploading
// handlers: handleCanvasMouseDown, handleCanvasMouseMove, handleNodeDrag, etc.
export function useCanvas(deps) { ... }
```

#### `useAssetLibrary.js`

```js
// state: assetLibraryStore, showAssetLibrary, assetLibraryTab,
//        assetLibraryLoaded, expandedAssetWorkIds,
//        assetLibraryDetailWorkId, assetLibraryDetailPersonaId,
//        editingAssetWorkTitleId, editingAssetWorkTitleDraft,
//        pendingUploadNodeId, showSidebarUploadMenu, assetLibraryPickerMode
export function useAssetLibrary(apiFetch) { ... }
```

#### `useSidebar.js`

```js
// state: hoveredSidebarItemKey, hoveredSidebarPreview,
//        sidebarNodeInputMenu, sidebarWorkflowMenu, sidebarImageCreateMenu,
//        activeSidebarItemKey, sidebarVideoCreateMenu
export function useSidebar() { ... }
```

#### `useAgentChat.js`

接受 `{ setNodes }` 以便 agent 可以操作画布节点（跨域依赖显式传参）。

```js
// state: agentStore, agentInput, agentInputFocused,
//        agentPromptPolishLoading, agentPromptPolishError, promptPolishDialog
// handlers: sendAgentMessage, handlePromptPolish, etc.
export function useAgentChat({ apiFetch, setNodes }) { ... }
```

#### `useWorkbenchRun.js`

```js
// state: isRunning, apiStatus, _globalError, previewImage,
//        showHistoryPanel, activeHistoryTab, apiHistory,
//        expandedHistoryIds, apiStats, runToast
// handlers: executeFlow, cancelRun, loadApiHistory
export function useWorkbenchRun({ apiFetch, nodes, connections }) { ... }
```

### 跨 Hook 依赖原则

hooks 之间的依赖通过参数显式传入，不使用全局 context：

```js
// Workbench.jsx 中组合方式
const canvas = useCanvas({ apiFetch });
const chat = useAgentChat({ apiFetch, setNodes: canvas.setNodes });
const run = useWorkbenchRun({ apiFetch, nodes: canvas.nodes, connections: canvas.connections });
```

---

## 验证方法

每个提取步骤完成后执行：

1. `npm run build` — 确认无 TypeScript/ESLint 编译错误
2. 启动 dev server，打开 `/app`，目视确认：
   - 画布正常渲染、节点可拖拽
   - 右下角 memberInfo/userAuths 面板正常加载
   - agent 聊天输入/发送正常
   - 左侧 sidebar 菜单正常
3. `npm test`（如有前端测试）

---

## 不在本次范围内

- TypeScript 迁移（保留 JSX 不改后缀）
- react-router-dom 替换手写 router
- 状态管理库（Redux/Zustand）引入
- Pipeline 页面（PipelineBatchVideo 等）拆分
- 新功能开发

---

## 成功标准

- `Workbench.jsx` 行数降至 6,000 行以下
- `src/components/workbench/` 包含 9 个独立组件文件
- `src/hooks/` 包含 6 个自定义 hook 文件
- 所有现有功能保持正常（dev server 目视验证）
- 每个提取步骤有独立 git commit，可单步回滚
