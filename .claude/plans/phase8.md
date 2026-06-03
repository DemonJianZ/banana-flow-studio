# Phase 8 — WorkbenchHeader + Model Helpers Cleanup

## 目标
Workbench.jsx: 3,505 → ~2,800 行（−705 行，−20%）

## 变更

### Step 1 — 新建 src/lib/modelHelpers.js（移走 ~157 行模块顶部定义）
把 AI Chat 模型选项处理函数从 Workbench.jsx 模块顶部迁出，
供 Workbench.jsx 中的 useMemo 使用。

**迁移范围：** L301–L457（`DEFAULT_AI_MODELS` 到 `getDefaultVideoModelId`）

包含：
- `DEFAULT_AI_MODELS`, `DEPRECATED_IMAGE_MODEL_IDS`, `DEPRECATED_IMAGE_MODEL_NAMES`
- `DEFAULT_VIDEO_MODELS`, `DEPRECATED_VIDEO_MODEL_IDS`
- `DEFAULT_IMAGE_MODEL_ID`, `DEFAULT_VIDEO_MODEL_ID`
- `pickModelField`, `resolveAIChatModelVendor`, `resolveAIChatModelIcon`
- `normalizeAIChatModelOption`, `extractAIChatModelRecords`, `buildAIChatModelOptions`
- `getDefaultImageModelId`, `isDeprecatedImageModel`, `filterDeprecatedImageModels`
- `getDefaultVideoModelId`

---

### Step 2 — 新建 src/components/workbench/WorkbenchHeader.jsx（移走 435 行 JSX）
**来源：** Workbench.jsx L2407–L2842（`<header>` 到 `</header>`）

内容：header bar（logo + API 状态 + 对话流 toggle）+ 完整对话流面板
（会话选择器 / 消息列表 / intent 专属卡片 / 建议卡片 / 回归反馈 / admin debug）

**Props 分组：**

来自 useAgentChat（直接透传）：
```
agentHistoryCollapsed, toggleAgentHistoryPanel
rightPanelContainerStyle, handleRightPanelResizeStart
agentSessions, activeAgentSession, agentTurns
activePendingTask, isAgentMissionRunning, hasActiveAgentConversation
minimizedAgentCards, agentResultCards
selectedAgentCardIds, activeAgentCardId, setActiveAgentSessionID
createAgentSession, clearActiveAgentConversation
focusAgentResultCard, toggleAgentResultCardCollapsed
minimizeAgentResultCard, handleAgentCardWheelCapture
agentConversationBottomRef, agentDevMode
```

来自其他 hook：
```
isAdminUser         — useMemberInfo
apiStatus           — useWorkbenchRun
setShowHistoryPanel — useWorkbenchRun
```

来自 useAgentMission（callbacks + memos）：
```
retryAgentTurn, handleTurnMarkRegression
handleSuggestionConfirm, handleSuggestionIgnore, handleSuggestionEdit
handleSuggestionMarkRegression
confirmScriptExtraction, buildAssetCanvas
skipToShotWorkflow, buildDirectVideoCanvas
hitlFeedbackRows, devSuggestionLog, devRegressionLog
```

来自 Workbench.jsx body：
```
sendAgentMissionFromText  — 用于 "发送示例" 按钮
createText2ImgTemplate    — 用于 "打开模板" 按钮
safeInvoke
handleAgentCardMouseDown  — 浮层拖拽 handler（还在 Workbench.jsx body）
```

**组件内 import（无需从 props 传入）：**
- `HITL_FEEDBACK_UI_ENABLED` from `../../lib/agentHelpers.js`
- `getDecisionLabel` from `../../lib/workbenchHelpers.js`
- `HITL_FEEDBACK_REASON_OPTIONS` from `../../hooks/useAgentChat`
- 所有 turn-card 子组件（ScriptExtractionCard, AssetGenConfirmCard, 等）

---

### Step 3 — 更新 Workbench.jsx
1. 删除 `DEFAULT_AI_MODELS` 到 `getDefaultVideoModelId` 定义（L301-L457）
   改为 from `../lib/modelHelpers.js`
2. Import `WorkbenchHeader`
3. 替换 `<header>...</header>` JSX（L2407-L2842）→ `<WorkbenchHeader .../>`

---

## 风险评估
| 变更 | 风险 | 原因 |
|---|---|---|
| modelHelpers.js | ⭐ 低 | 纯模块函数，接口不变 |
| WorkbenchHeader.jsx | ⭐ 低 | 纯 JSX，props 清晰 |

## 测试清单
- [ ] 对话流 header 展开/收起 — 正常
- [ ] 会话选择 + 新建 + 清除 — 正常
- [ ] 对话 turn 列表渲染（running/assistant/clarify/error/done）— 正常
- [ ] 建议卡片确认/忽略/编辑 — 正常
- [ ] script extraction / asset canvas / shot workflow 卡片 — 正常
- [ ] 回归标记弹窗 — 正常
- [ ] 图像/视频模型选项加载 — 正常（modelHelpers）
