# Phase 3 — JSX 组件抽取（稳妥版）

## 目标
把 Workbench.jsx 末尾的 **纯 JSX 块** 抽成独立组件。
零业务逻辑迁移，只动 JSX + props interface。
Workbench.jsx: 10,200 → ~8,800 行（−14%）

---

## 新增 7 个文件

### 1. `src/components/workbench/WorkbenchRunBar.jsx`
**来源：** Workbench.jsx lines 8742–8814（画布右下角控制条）
**读 store：** `viewport`（zoom%）、`nodes.length`（disabled 判断）、`connections.length`、`setViewport`（reset view）
**Props（5 个回调）：**
```
onSave        — saveCurrentCanvasAsWork
onSaveNew     — saveCurrentCanvasAsNewWork
onShowAssets  — () => setShowAssetLibrary(true)
onArrange     — arrangeCanvasNodes
zoomCanvas    — zoomCanvas（来自 useCanvas，含 DOM 计算）
```

---

### 2. `src/components/workbench/WorkbenchAssetLibrary.jsx`
**来源：** Workbench.jsx lines 7333–7999（资产库覆盖面板）
**Props：两组（state + callbacks）**

State props（来自 useAssetLibrary 解构，直接透传）：
```
show / onClose
tab / setTab
drafts / works / assets / personas
versionsByWorkId
expandedWorkIds / setExpandedWorkIds
detailWork / detailPersona / detailSnapshot / detailDigest / detailAssets
setDetailWorkId / setDetailPersonaId
editingTitleId / editingTitleDraft / setEditingTitleDraft
pendingUploadNodeId / setPendingUploadNodeId
pickerMode / setPickerMode
personaImageInputRef
personaMentionOptions
```
Callback props（来自 Workbench.jsx body）：
```
onRestoreSnapshot   — restoreSnapshotToCanvas
onRestoreAsset      — restoreAssetToCanvas
onSave              — saveCurrentCanvasAsWork
onSaveNew           — saveCurrentCanvasAsNewWork
beginEditTitle / cancelEditTitle / commitEditTitle
createPersona / updatePersona / removePersona
onPersonaReferenceUpload / removeItem
```

---

### 3. `src/components/workbench/WorkbenchImagePreview.jsx`
**来源：** Workbench.jsx lines 10114–10137（全屏预览 lightbox）
**Props：** `url: string | null`, `onClose: () => void`

---

### 4. `src/components/workbench/WorkbenchHistoryPanel.jsx`
**来源：** Workbench.jsx lines 9445–9579（API 历史记录弹窗）
**Props：**
```
show / onClose
activeTab / setActiveTab
history / expandedIds / setExpandedIds
stats
normalizeOutputs / normalizeInputs / formatParams
onReuse   — applyHistoryConfig
```

---

### 5. `src/components/workbench/WorkbenchRegressionDialog.jsx`
**来源：** Workbench.jsx lines 9603–9667（回归用例标记弹窗）
**Props：**
```
show          — HITL_FEEDBACK_UI_ENABLED && !!feedbackDialog
dialog        — feedbackDialog
reasonChoice / setReasonChoice
reasonNote / setReasonNote
saving        — !!savingFeedbackTargetId
onClose       — closeRegressionFeedbackDialog
onConfirm     — confirmRegressionFeedbackDialog
reasonOptions — HITL_FEEDBACK_REASON_OPTIONS
```

---

### 6. `src/components/workbench/WorkbenchStoryboardAssetCard.jsx`
**来源：** Workbench.jsx lines 9668–9955（storyboard 资产 hover portal）
**Props：**
```
card                 — hoveredStoryboardAssetCard
onScheduleClose      — scheduleCloseStoryboardAssetHoverCard
onUpdateStatus       — updateStoryboardAssetStatus
onGenerate           — runStoryboardAssetDirectGeneration
imageModelOptions
threeViewImageModelId
previewImage / setPreviewImage
```

---

### 7. `src/components/workbench/WorkbenchStoryboardShotCard.jsx`
**来源：** Workbench.jsx lines 9956–10113（storyboard 镜头 hover portal）
**Props：**
```
card                 — hoveredStoryboardShotCard
onScheduleClose      — scheduleCloseStoryboardShotHoverCard
onUpdateStatus       — updateStoryboardAssetStatus
onGenerate           — runStoryboardShotGeneration
imageModelOptions
previewImage / setPreviewImage
```

---

## 修改 Workbench.jsx（7 处替换）

每处都是：删掉对应 JSX 块 → 替换为组件调用 + props 透传。

---

## 风险评估
- 无逻辑迁移 → 零回归风险
- `WorkbenchRunBar` 直接读 store，独立性最强
- `WorkbenchAssetLibrary` props 数量多（~30个），但都是透传，无转换
- 所有 Portal 组件用 `createPortal(content, document.body)` 保持不变

## 测试清单
- [ ] 画布右下角保存/整理/缩放 — 正常
- [ ] 资产库打开/关闭/恢复到画布 — 正常
- [ ] Ctrl+Z 历史面板打开/复用 — 正常
- [ ] 回归标记弹窗（管理员） — 正常
- [ ] storyboard hover 资产卡片 — 正常
- [ ] storyboard hover 镜头卡片 — 正常
- [ ] 图片/视频全屏预览 — 正常
