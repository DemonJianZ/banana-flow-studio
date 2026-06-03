# Phase 7 — Bug Fix + useAgentMission hook

## 目标
Workbench.jsx: 5,103 → ~3,600 行（−1,503 行，−29%）

## 变更

### Bug 修复：恢复 `cloneDeep`（workbenchHelpers.js）
`cloneDeep` 在 Phase 5/6 helper 清理时被意外删除（原定义 `const cloneDeep = (obj) => JSON.parse(JSON.stringify(obj))`）。
当前文件中 6 次调用但无定义，运行时会抛 ReferenceError。
→ 添加到 workbenchHelpers.js 并 export，Workbench.jsx 改为 import。

### 新建 src/hooks/useAgentMission.js（移走 ~1474 行逻辑）

**迁移范围：Workbench.jsx L2433–L3907**

包含的函数（按组）：

| 组 | 函数 | 行数 |
|---|---|---|
| 对话辅助 | `getRecentAgentUploadedDocuments`, `shouldReuseRecentUploadedDocuments` | ~63 |
| 核心对话 | `runAgentConversation` | ~48 |
| 画布规划 | `runCanvasPlanMission` | ~217 |
| 发送任务 | `sendAgentMissionFromText`, `sendAgentMission` | ~368 |
| 画布动作 | `confirmScriptExtraction`, `buildAssetCanvas`, `skipToShotWorkflow`, `buildDirectVideoCanvas` | ~204 |
| 组合器回调 | `polishAgentPromptInput`, `handleAgentComposerUpload`, `removeAgentComposerFile`, `handleAgentQuickAction`, `insertCanvasPromptExample`, `handleCanvasExamplePick` | ~339 |
| 偏好/建议 | `openPreferencesPanelWithSuggestion`, `handlePreferenceSavedFromPanel`, `confirmMemorySuggestion`, `ignoreMemorySuggestion`, `updateSuggestionCallback`, `toValueArray` | ~183 |
| 回归反馈 | `openRegressionFeedbackDialog`, `closeRegressionFeedbackDialog`, `markTurnAsRegressionCase`, `confirmRegressionFeedbackDialog`, `handleTurnMarkRegression`, `handleSuggestionConfirm/Ignore/Edit/MarkRegression` | ~183 |
| 其他 | `retryAgentTurn`, `deleteNode`, `runStoryboardInputFromFiles` | ~164 |

**Hook 接口：**
```js
export function useAgentMission({
  // useAgentChat state (direct pass-through)
  agentTurns, activeAgentSession, updateActiveAgentSession,
  appendAgentTurn, updateAgentTurn, appendAssistantTurn,
  setPendingTaskForActiveSession, clearPendingTaskForActiveSession,
  agentInput, setAgentInput,
  agentComposerFiles, setAgentComposerFiles,
  agentUploadInputRef,
  setActiveComposerActionId, setShowCanvasExamples,
  setAgentPromptPolishLoading, setAgentPromptPolishError,
  openPromptPolishPicker,
  feedbackDialog, setFeedbackDialog,
  feedbackReasonChoice, setFeedbackReasonChoice,
  feedbackReasonNote, setFeedbackReasonNote,
  setSavingFeedbackTargetId,
  refreshMemoryPreferences,
  updateSuggestionStatus, setSavingSuggestionId,
  setPreferenceNotice,
  // canvas & session
  apiFetch,
  activeArtifact,
  aiChatSessionIdRef, aiChatHistoryRecordIdRef, agentDevMode,
  // run/toast
  setRunToast,
  // asset lib
  upsertCanvasDraftSnapshot,
  // preferences panel
  setShowPreferencesPanel, setPreferencesPanelPrefill,
  // debug
  pushApiDebugDetail, updateApiDebugStatus,
  // canvas node ops (for runStoryboardInputFromFiles)
  createText2ImgTemplate, createPersonaInputNodeAt,
}) {
  // canvasStore: applyPatch, pushHistory, canvasId
  // (nodesRef/connectionsRef → getState().nodes/connections)
  return { all ~35 mission/composer/regression callbacks }
}
```

**关键迁移点：**
- `nodesRef.current` → `useCanvasStore.getState().nodes`
- `connectionsRef.current` → `useCanvasStore.getState().connections`
- `_applyPatch(ops)` → `useCanvasStore.getState().applyPatch(ops)` (已实现)
- `pushHistory()` → `useCanvasStore.getState().pushHistory()`
- `canvasId` → `useCanvasStore.getState().canvasId`
- `cloneDeep` → from workbenchHelpers.js

### 更新 Workbench.jsx
1. Import `cloneDeep` from workbenchHelpers.js
2. Import `useAgentMission` 
3. Add `useAgentMission({...})` call after useCanvasExecutor
4. Destructure all ~35 returned callbacks
5. Delete L2433-L3907 original函数定义

---

## 风险评估
| 变更 | 风险 | 原因 |
|---|---|---|
| Bug fix (cloneDeep) | ⭐ 低 | 简单恢复，无逻辑变化 |
| useAgentMission 创建 | ⭐⭐ 中 | 函数多，依赖多，但大部分是直接透传 |
| Workbench.jsx 删除 | ⭐ 低 | 只删已迁移代码 |

## 测试清单
- [ ] Agent 消息发送/接收 — 正常
- [ ] 画布规划（runCanvasPlanMission）— 正常
- [ ] 剧本提取确认（confirmScriptExtraction）— 正常
- [ ] 资产画布构建（buildAssetCanvas）— 正常
- [ ] 组合器文件上传 — 正常
- [ ] AI 润色 — 正常
- [ ] 快速动作（剧本工作流/画布编排）— 正常
- [ ] 回归反馈标记 — 正常
- [ ] 建议确认/忽略 — 正常
- [ ] 节点删除（deleteNode）— 正常
- [ ] 故事板文件导入 — 正常
