# Phase 4 — useCanvasNodeOps hook + WorkbenchSidebar component

## 目标
继续减少 Workbench.jsx，本次聚焦两个独立抽取点：

| 抽取对象 | 类型 | 行数 | 来源位置 |
|---|---|---|---|
| `useCanvasNodeOps.js` | 逻辑 hook | ~980 行 | Workbench.jsx 组件体 |
| `WorkbenchSidebar.jsx` | JSX 组件 | ~627 行 | Workbench.jsx return JSX |

**Workbench.jsx: 8,911 → ~7,300 行（−18%）**

---

## 1. `src/hooks/useCanvasNodeOps.js`

### 迁移的函数（12 个 useCallback）

| 函数 | 原始行 | 行数 |
|---|---|---|
| `updateStoryboardAssetStatus` | 2875 | 34 |
| `runStoryboardAssetDirectGeneration` | 2909 | 147 |
| `runStoryboardShotGeneration` | 3057 | 203 |
| `createImageOperationResultNode` | 3261 | 28 |
| `runCompactRemoveWatermark` | 3290 | 52 |
| `runCompactRmbg` | 3343 | 52 |
| `createConnectedImg2ImgBranch` | 3397 | 71 |
| `runCompactVideoUpscale` | 3469 | 98 |
| `runVideoLineart` | 3568 | 55 |
| `runVideoRmbg` | 3624 | 51 |
| `runVideoSplit` | 3676 | 62 |
| `runCompactThreeView` | 6349 | 127 |

### Hook 接口

```js
export function useCanvasNodeOps({
  apiFetch,
  defaultImageModelId,
  threeViewImageModelId,
  imageModelRecords,          // for storyboard gen model resolution
  imageModelOptions,          // for createConnectedImg2ImgBranch
  resolveModelParamsForId,
  activeArtifact,             // for createConnectedImg2ImgBranch
  setRunToast,
  setPreviewImage,            // for storyboard shot generation preview
  pushApiDebugDetail,         // runCompactThreeView admin debug
  updateApiDebugStatus,       // runCompactThreeView admin debug
}) {
  // 从 canvasStore 读取
  const { setNodes, updateNodeData, pushHistory,
          setSelectedNodeIds, setSelectedConnectionIds, setActiveNodeId } = useCanvasStore();
  // resolveMemberAuthorizationInfo 从 api/aiChat 直接 import（非 hook）
  
  // ... 12 个函数定义 ...
  
  return {
    updateStoryboardAssetStatus,
    runStoryboardAssetDirectGeneration, runStoryboardShotGeneration,
    createImageOperationResultNode,
    runCompactRemoveWatermark, runCompactRmbg,
    createConnectedImg2ImgBranch,
    runCompactVideoUpscale, runVideoLineart, runVideoRmbg, runVideoSplit,
    runCompactThreeView,
  };
}
```

**关键迁移点：**
- `nodesRef.current` → `useCanvasStore.getState().nodes`（async 闭包安全）
- `connections` → `useCanvasStore.getState().connections`
- `setNodes((prev) => prev.map(...))` 中的简单 status 更新 → 改用 `updateNodeData`（已在 store）
- `setSelectedNodeIds / setSelectedConnectionIds / setActiveNodeId` → 从 store 读取

---

## 2. `src/components/workbench/WorkbenchSidebar.jsx`

### 来源 JSX：lines 7449–8076

包含：
- 媒体上传按钮 + 上传菜单
- 节点类型选择菜单（文本输入/故事板/人物/图像创作/视频创作）
- 工作流选择菜单（三合一/批量动图/批量花字/AI智能体）
- 图像创作子菜单（文生图/图生图/多图生图）
- 视频创作子菜单（文生视频/图生视频/全能生视频）
- 底部折叠按钮 + 竖排文字标题

### Props 分组

**来自 `useSidebar()`（直接透传）：**
```
hoveredSidebarItemKey, setHoveredSidebarItemKey
hoveredSidebarPreview, setHoveredSidebarPreview
sidebarNodeInputMenu, setSidebarNodeInputMenu
sidebarWorkflowMenu, setSidebarWorkflowMenu
sidebarImageCreateMenu, setSidebarImageCreateMenu
activeSidebarItemKey, setActiveSidebarItemKey
showSidebarUploadMenu, setShowSidebarUploadMenu
sidebarVideoCreateMenu, setSidebarVideoCreateMenu
// refs
sidebarUploadMenuRef
sidebarUploadMenuCloseTimerRef, sidebarNodeInputMenuCloseTimerRef
sidebarImageCreateMenuCloseTimerRef, sidebarVideoCreateMenuCloseTimerRef
sidebarWorkflowMenuCloseTimerRef
```

**外部 props：**
```
leftSidebarWidth          — Workbench.jsx local state
isLeftSidebarCollapsed    — Workbench.jsx local state
setIsLeftSidebarCollapsed — Workbench.jsx local state
sidebarImageUploadInputRef  — from useAgentChat()
sidebarVideoUploadInputRef  — from useAgentChat()
personaMentionOptions     — from useAgentChat()
isAdminUser               — from useMemberInfo()
// action callbacks
onUpload                  — handleSidebarMediaUpload(event, kind)
onAddNode                 — addNode(nodeType, modePreset?)
onCreatePersona           — createPersonaInputNodeAt(persona)
onCreateText2Img          — () => createText2ImgTemplate()
onCreateImg2Img           — () => createImg2ImgTemplate()
onCreateMultiImg2Img      — () => createMultiImg2ImgTemplate()
onCreateImg2Video         — () => createImg2VideoTemplate()
onCreateText2Video        — () => createText2VideoTemplate()
onCreateOmniVideo         — () => createOmniReferenceVideoTemplate()
onNavigate                — handleAnchorActionClick(anchor)
safeInvoke                — from useWorkbenchRun()
```

---

## Workbench.jsx 变更

1. `import { useCanvasNodeOps }` 新增
2. `import WorkbenchSidebar` 新增
3. 新增 `useCanvasNodeOps(...)` hook 调用，解构 12 个函数
4. 替换 sidebar JSX（lines 7449–8076）→ `<WorkbenchSidebar .../>`
5. 删除 Workbench.jsx 中已迁移的 12 个 useCallback 定义

---

## 风险评估

| 抽取 | 风险 | 原因 |
|---|---|---|
| `useCanvasNodeOps.js` | ⭐⭐ 中 | 纯逻辑迁移，async 闭包需改 `nodesRef` → `getState()` |
| `WorkbenchSidebar.jsx` | ⭐ 低 | 纯 JSX 抽取，props 清晰 |

## 测试清单
- [ ] 拖拽媒体文件到侧边栏 — 正常
- [ ] 侧边栏各子菜单 hover 展开/收起 — 正常
- [ ] "文生图/图生图" 模板添加到画布 — 正常
- [ ] "视频创作" 子菜单创建节点 — 正常
- [ ] 节点右键 rmbg/去水印/超清 — 正常（useCanvasNodeOps）
- [ ] storyboard 资产/镜头生成 — 正常（useCanvasNodeOps）
- [ ] 视频超清/分割/lineart/rmbg — 正常（useCanvasNodeOps）
- [ ] 三视图生成 — 正常（runCompactThreeView）
