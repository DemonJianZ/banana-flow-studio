# Phase 5 — Dead Code + Helpers Lib + NodeOps Hook + WorkbenchHeader

## 目标
Workbench.jsx: 7,975 → ~6,100 行（−1,875 行，−24%）

## 4 个步骤

### Step 1 — 删除死代码 `renderSidebarContent`（零风险，−188 行）
`renderSidebarContent` 函数（lines 6645–6832）在 Phase 4 已迁入 WorkbenchSidebar.jsx，
Workbench.jsx 中已无任何调用，直接删除。

---

### Step 2 — 新建 `src/lib/workbenchHelpers.js`（移走 ~350 行模块级定义）
把所有模块级工具函数/常量从 Workbench.jsx 移到独立文件，供 Workbench.jsx 和
useCanvasNodeOps.js 共同 import。

**迁移清单（含行号）：**
| 名称 | 行 | 大小 |
|---|---|---|
| `normalizeVideoLineartStrength/Color/Config` | 476 | 19 |
| `buildStoryboardAssetGenerationPrompt` | 591 | 17 |
| `normalizeStoryboardAssetCandidates` | 610 | 8 |
| `resolveStoryboardAssetPrimaryImage` | 640 | 9 |
| `buildStoryboardAssetEditPrompt` | 651 | 30 |
| `pickFirstImageUrl` | 783 | 78 |
| `pickFirstVideoUrl` | 862 | 74 |
| `summarizeAIChatResponse` | 937 | 9 |
| `extractAIChatDoneError` | 948 | 5 |
| `WORKBENCH_AI_CHAT_MODULE_ENUM` | 1119 | 1 |
| `resolveWorkbenchAIChatPartEnum` | 1121 | 35 |
| `buildAIChatParamPayload` | 1158 | 42 |
| `findAIChatParamValueId` | 1201 | 39 |
| `THREE_VIEW_PROMPT` | 1273 | 3 |
| `THREE_VIEW_DEFAULT_TEMPLATES` | 1276 | 17 |
| `extractApiError` | 1293 | 8 |

Workbench.jsx 顶部增加一行 import，函数体定义全部删除。

---

### Step 3 — 新建 `src/hooks/useCanvasNodeOps.js`（移走 ~862 行逻辑）
把 12 个紧凑操作 useCallback 从 Workbench.jsx 迁入 hook。

**迁移函数：**
- `updateStoryboardAssetStatus` (2875, 34 lines)
- `runStoryboardAssetDirectGeneration` (2909, 147 lines)
- `runStoryboardShotGeneration` (3057, 203 lines)
- `createImageOperationResultNode` (3261, 28 lines)
- `runCompactRemoveWatermark` (3290, 52 lines)
- `runCompactRmbg` (3343, 52 lines)
- `createConnectedImg2ImgBranch` (3397, 71 lines)
- `runCompactVideoUpscale` (3469, 98 lines)
- `runVideoLineart` (3568, 55 lines)
- `runVideoRmbg` (3624, 51 lines)
- `runVideoSplit` (3676, 62 lines)
- `runCompactThreeView` (6351, 125 lines)

**Hook 接口：**
```js
export function useCanvasNodeOps({
  apiFetch,
  defaultImageModelId, threeViewImageModelId,
  imageModelRecords, imageModelOptions,
  resolveModelParamsForId,
  activeArtifact,
  setRunToast, setPreviewImage,
  pushApiDebugDetail, updateApiDebugStatus,
  aiChatSessionIdRef, aiChatHistoryRecordIdRef,
  setHoveredStoryboardAssetCard, setHoveredStoryboardShotCard,
}) {
  // useCanvasStore() for setNodes/setConnections/updateNodeData/pushHistory/selection
  // Imports from workbenchHelpers.js
  // Imports from api/aiChat, api/agentCanvas
  return { updateStoryboardAssetStatus, run*, create* };
}
```

**关键迁移点：**
- `nodesRef.current` → `useCanvasStore.getState().nodes`
- `connectionsRef.current` → `useCanvasStore.getState().connections`
- `resolveMemberAuthorizationInfo` 从 `../api/aiChat` 直接 import

---

### Step 4 — 新建 `src/components/workbench/WorkbenchHeader.jsx`（移走 ~436 行 JSX）
来源：Workbench.jsx lines 6877–7313（`<header>` 到 `</div>` 对话流面板）

**Props（分组）：**

来自 `useAgentChat()`（直接透传）：
```
agentHistoryCollapsed, toggleAgentHistoryPanel
rightPanelContainerStyle, handleRightPanelResizeStart
agentSessions, activeAgentSession, agentTurns
activePendingTask, isAgentMissionRunning, hasActiveAgentConversation
minimizedAgentCards, agentResultCards
selectedAgentCardIds, activeAgentCardId
createAgentSession, clearActiveAgentConversation, setActiveAgentSession
focusAgentResultCard, toggleAgentResultCardCollapsed
minimizeAgentResultCard, handleAgentCardWheelCapture
agentConversationBottomRef, agentDevMode
```

来自其他 hook：
```
apiStatus           — useWorkbenchRun
setShowHistoryPanel — useWorkbenchRun
isAdminUser         — useMemberInfo
```

来自 Workbench.jsx 组件体（callbacks，需 prop 透传）：
```
retryAgentTurn
handleTurnMarkRegression
handleSuggestionConfirm / Ignore / Edit / MarkRegression
confirmScriptExtraction, buildAssetCanvas
skipToShotWorkflow, buildDirectVideoCanvas
```

---

## 修改 Workbench.jsx

1. 删除 `renderSidebarContent`（lines 6645–6832）
2. 删除已迁入 `workbenchHelpers.js` 的函数定义，替换为 1 行 import
3. 新增 `useCanvasNodeOps(...)` hook 调用，解构 12 个函数
4. 删除已迁入 hook 的 12 个 useCallback 定义
5. 新增 `WorkbenchHeader` import 并替换 header JSX block

---

## 风险评估
| 步骤 | 风险 | 原因 |
|---|---|---|
| Step 1 (删除死代码) | ⭐ 无 | grep 确认无调用 |
| Step 2 (helpers lib) | ⭐ 低 | 纯移动，接口不变 |
| Step 3 (useCanvasNodeOps) | ⭐⭐ 中 | `nodesRef` 替换为 `getState()`，async 闭包 |
| Step 4 (WorkbenchHeader) | ⭐ 低 | 纯 JSX，props 清晰 |
