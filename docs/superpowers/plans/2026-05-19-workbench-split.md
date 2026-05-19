# Workbench.jsx 拆分重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 18,324 行的 `src/pages/Workbench.jsx` 拆分为 10 个独立组件 + 6 个自定义 hook，使每个文件职责单一，目标 Workbench.jsx 降至 6,000 行以下。

**Architecture:** Phase 1 按提取顺序（依赖最少的先提取）将内嵌组件移到 `src/components/workbench/`，首先把多个组件共用的常量/工具函数提取到 `src/constants/workbench.js`；Phase 2 将 Workbench 函数体内的逻辑域 state+handlers 提取为自定义 hook 到 `src/hooks/`。每步独立 commit，可单步 `git revert` 回滚。

**Tech Stack:** React (useState, useEffect, useCallback, useMemo, useRef, forwardRef), Vite/JSX，无新依赖。

---

## 文件结构

**新建文件：**
- `src/constants/workbench.js` — 所有提取组件/hook 共用的常量与工具函数
- `src/components/workbench/DramaMarkdownBlock.jsx`
- `src/components/workbench/PromptPolishPickerModal.jsx`
- `src/components/workbench/PersonaMentionTextarea.jsx`
- `src/components/workbench/VideoPlayer.jsx`
- `src/components/workbench/InlineDropdown.jsx`
- `src/components/workbench/ToolIconBtn.jsx`
- `src/components/workbench/SidebarBtn.jsx`
- `src/components/workbench/AgentResultCardContent.jsx`
- `src/components/workbench/PropertyPanel.jsx`
- `src/components/workbench/NodeComponent.jsx`
- `src/hooks/useMemberInfo.js`
- `src/hooks/useCanvas.js`
- `src/hooks/useAssetLibrary.js`
- `src/hooks/useSidebar.js`
- `src/hooks/useAgentChat.js`
- `src/hooks/useWorkbenchRun.js`

**修改文件：**
- `src/pages/Workbench.jsx` — 每个任务删除提取的定义，添加 import

---

## ⚙️ 背景知识（实施者必读）

每个"提取组件"任务的模式完全相同，共 4 步：

1. **在 Workbench.jsx 中识别组件定义范围**（给出精确行号）
2. **剪切**这些行，粘贴到新文件，加 `import` 头 + `export default`
3. **在 Workbench.jsx 原位置**替换为 `import X from "../components/workbench/X";`
4. `npm run build` 验证无报错

> **循环依赖规则**：组件文件不可 import 自 `../pages/Workbench`。
> 多个提取目标共用的常量/函数统一放入 `src/constants/workbench.js`。

---

## Phase 1: 组件提取

---

### Task 1: 创建 src/constants/workbench.js

提取前，必须先把被多个组件共用的工具函数和常量移出 Workbench.jsx，存入共享常量文件，避免循环依赖。

**Files:**
- Create: `src/constants/workbench.js`
- Modify: `src/pages/Workbench.jsx`

- [ ] **Step 1: 创建 src/constants/workbench.js**

从 Workbench.jsx 把以下代码段**剪切**并写入新文件（这些函数/常量在 Workbench 函数体外定义，行号为当前行号——提取前先核实）：

| 当前行 | 内容 |
|--------|------|
| 219 | `const EMPTY_LIST = Object.freeze([]);` |
| 138–149 | `AGENT_RUN_STEPS`、`DRAMA_RUN_STEPS` |
| 183–185 | `SCRIPT_PLATFORM_OPTIONS`、`SCRIPT_PRICE_BAND_OPTIONS`、`SCRIPT_CONVERSION_GOAL_OPTIONS` |
| 186–193 | `SCRIPT_AUDIENCE_OPTIONS` |
| 318–326 | `normalizeScriptBrief` |
| 328–345 | `buildArtifactSelectionKey`、`isSameArtifactSelection` |
| 347–352 | `isPreviewableArtifact` |
| 354–371 | `normalizeLocationName`、`matchesSceneBinding` |
| 373–378 | `stripStoryboardDisplayIds` |
| 379 | `escapeRegExp` |
| 381–503 | `collectStoryboardMentionTerms` |
| 506–606 | `renderStoryboardMentionText`（依赖 stripStoryboardDisplayIds、escapeRegExp） |
| 608–629 | `extractScriptPlatform`、`buildInitialScriptBrief`（依赖 normalizeScriptBrief） |
| 631–636 | `getAgentResultCardWidth`、`getAgentTurnStepLabel` |

```js
// src/constants/workbench.js
import React from "react";
import { extractProductKeyword } from "../api/agentCanvas";

export const EMPTY_LIST = Object.freeze([]);

export const AGENT_RUN_STEPS = [
  "推断受众",
  "生成脚本",
  "合规扫描",
  "素材匹配",
  "生成剪辑计划",
];

export const DRAMA_RUN_STEPS = [
  "理解需求",
  "创作短剧",
  "整理输出",
];

export const AGENT_RESULT_CARD_WIDTH = 460;

export const SCRIPT_PLATFORM_OPTIONS = ["抖音", "小红书", "快手", "微信", "淘宝/天猫", "京东", "拼多多", "1688"];
export const SCRIPT_PRICE_BAND_OPTIONS = ["9-49元", "50-99元", "100-199元", "200-499元", "500元以上"];
export const SCRIPT_CONVERSION_GOAL_OPTIONS = ["点击商品详情", "私信咨询", "加购下单", "收藏种草", "留资获客"];
export const SCRIPT_AUDIENCE_OPTIONS = [
  "通勤白领",
  "学生党",
  "油皮女生",
  "宝妈人群",
  "租房青年",
  "新手买家",
];

export const normalizeScriptBrief = (brief = {}) => ({
  product: String(brief?.product || "").trim(),
  audience: String(brief?.audience || "").trim(),
  priceBand: String(brief?.priceBand || "").trim(),
  conversionGoal: String(brief?.conversionGoal || "").trim(),
  primaryPlatform: String(brief?.primaryPlatform || "").trim(),
  secondaryPlatform: String(brief?.secondaryPlatform || "").trim(),
  selectedAngle: String(brief?.selectedAngle || "").trim(),
});

export const buildArtifactSelectionKey = (artifact) => {
  if (!artifact || typeof artifact !== "object") return "";
  const kind = String(artifact.kind || "").trim();
  const fromNodeId = String(artifact.fromNodeId || "").trim();
  if (kind === "storyboard_selection") {
    const meta = artifact.meta && typeof artifact.meta === "object" ? artifact.meta : {};
    const selectionType = String(meta.selectionType || "").trim();
    const selectionId = String(meta.selectionId || "").trim();
    return `storyboard:${fromNodeId}:${selectionType}:${selectionId}`;
  }
  const url = String(artifact.url || "").trim();
  if (url) return `url:${url}`;
  return `${kind}:${fromNodeId}:${String(artifact.createdAt || "").trim()}`;
};

export const isSameArtifactSelection = (left, right) =>
  !!buildArtifactSelectionKey(left) &&
  buildArtifactSelectionKey(left) === buildArtifactSelectionKey(right);

export const isPreviewableArtifact = (artifact) => {
  if (!artifact || typeof artifact !== "object") return false;
  const kind = String(artifact.kind || "").trim();
  const url = String(artifact.url || "").trim();
  return !!url && (kind === "image" || kind === "video");
};

export const normalizeLocationName = (text) =>
  String(text || "").replace(/(?<=[一-鿿㐀-䶿])的(?=[一-鿿㐀-䶿])/g, "");

export const matchesSceneBinding = (sb, needle) => {
  const fName = String(sb?.folder_name || "").trim();
  const mFrom = String(sb?.matched_from || "").trim();
  const n = String(needle || "").trim();
  if (!n || n.length < 2) return false;
  const nNorm = normalizeLocationName(n);
  const fNorm = normalizeLocationName(fName);
  const mNorm = normalizeLocationName(mFrom);
  return (
    fName === n || mFrom === n ||
    fNorm === nNorm ||
    fName.includes(n) || mFrom.includes(n) || n.includes(fName) ||
    (nNorm.length >= 2 && (fNorm.includes(nNorm) || mNorm.includes(nNorm) || nNorm.includes(fNorm)))
  );
};

export const stripStoryboardDisplayIds = (value) =>
  String(value || "")
    .replace(/[（(]\s*(?:[A-Za-z]{1,16}_\d{1,6}|[A-Z]\d{2,6}|char[_-]?\d{1,6}|scene[_-]?\d{1,6}|shot[_-]?\d{1,6}|loc[_-]?\d{1,6}|subj[_-]?\d{1,6}|entity[_-]?\d{1,6})\s*[)）]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

export const escapeRegExp = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const collectStoryboardMentionTerms = (storyboardPlan = {}) => {
  // [从 Workbench.jsx 381-503 原样复制，含所有内部逻辑]
  // 此处省略函数体以避免本文档过长；实施时从 Workbench.jsx:381-503 剪切粘贴
  const entities = storyboardPlan?.entities || {};
  const scenes = Array.isArray(storyboardPlan?.scenes) ? storyboardPlan.scenes : [];
  const locations = Array.isArray(entities?.locations) ? entities.locations : [];
  const charBindings = Array.isArray(storyboardPlan?.local_asset_bindings?.character_bindings)
    ? storyboardPlan.local_asset_bindings.character_bindings : [];
  const sceneBindings = Array.isArray(storyboardPlan?.local_asset_bindings?.scene_bindings)
    ? storyboardPlan.local_asset_bindings.scene_bindings : [];
  const boundEntityIds = new Set(
    charBindings
      .filter((cb) => String(cb?.three_view_url || cb?.voice_url || "").trim())
      .map((cb) => String(cb?.entity_id || "").trim())
      .filter(Boolean),
  );
  const locationEntityByName = new Map(
    locations
      .map((item) => [stripStoryboardDisplayIds(item?.name || ""), item])
      .filter(([name]) => !!name),
  );
  const sceneByLocation = new Map();
  scenes.forEach((scene, index) => {
    const locationName = stripStoryboardDisplayIds(scene?.location || "");
    if (!locationName || sceneByLocation.has(locationName)) return;
    const matchedLocation = locationEntityByName.get(locationName);
    sceneByLocation.set(locationName, {
      assetType: "locations",
      assetId: String(matchedLocation?.entity_id || locationName).trim(),
      assetName: locationName,
      selectionType: "scene",
      selectionId: String(scene?.scene_id || `scene-${index + 1}`).trim(),
      selectionLabel: `场景 ${scene?.scene_no || index + 1} · ${locationName}`,
      selectionSummary: String(scene?.scene_notes || scene?.summary || "").trim(),
      payload: {
        sceneId: String(scene?.scene_id || `scene-${index + 1}`).trim(),
        sceneNo: scene?.scene_no || index + 1,
        sceneTitle: String(scene?.title || "").trim(),
        sceneLocation: String(scene?.location || "").trim(),
      },
    });
  });
  const seen = new Map();
  const pushEntry = (rawTerm, type, selection = null) => {
    const term = stripStoryboardDisplayIds(rawTerm);
    if (!term) return;
    if (!seen.has(term)) seen.set(term, { term, type, ...(selection || {}) });
  };
  (Array.isArray(entities?.characters) ? entities.characters : []).forEach((item) => {
    const entityId = String(item?.entity_id || "").trim();
    pushEntry(item?.name, "character", {
      assetType: "characters",
      assetId: entityId,
      assetName: stripStoryboardDisplayIds(item?.name || ""),
      hasBinding: boundEntityIds.has(entityId),
      selectionType: "entity",
      selectionId: entityId,
      selectionLabel: `角色 · ${String(item?.name || "").trim()}`,
      selectionSummary: String(item?.core_description || item?.description || "").trim(),
      payload: { entityId, entityName: String(item?.name || "").trim(), entityType: "角色" },
    });
  });
  (Array.isArray(entities?.subjects) ? entities.subjects : []).forEach((item) => {
    const entityId = String(item?.entity_id || "").trim();
    pushEntry(item?.name, "subject", {
      assetType: "subjects",
      assetId: entityId,
      assetName: stripStoryboardDisplayIds(item?.name || ""),
      hasBinding: boundEntityIds.has(entityId),
      selectionType: "entity",
      selectionId: entityId,
      selectionLabel: `主体 · ${String(item?.name || "").trim()}`,
      selectionSummary: String(item?.core_description || item?.description || "").trim(),
      payload: { entityId, entityName: String(item?.name || "").trim(), entityType: "主体" },
    });
  });
  locations.forEach((item) => {
    const locationName = stripStoryboardDisplayIds(item?.name || "");
    const hasSceneBinding = sceneBindings.some((sb) => matchesSceneBinding(sb, locationName));
    pushEntry(item?.name, "scene", {
      ...(sceneByLocation.get(locationName) || {
        assetType: "locations",
        assetId: String(item?.entity_id || "").trim(),
        assetName: locationName,
        selectionType: "scene",
        selectionId: String(item?.entity_id || locationName).trim(),
        selectionLabel: `场景 · ${String(item?.name || "").trim()}`,
        selectionSummary: String(item?.core_description || item?.description || "").trim(),
        payload: {
          sceneId: "",
          sceneNo: null,
          sceneTitle: String(item?.name || "").trim(),
          sceneLocation: String(item?.name || "").trim(),
          locationId: String(item?.entity_id || "").trim(),
        },
      }),
      hasBinding: hasSceneBinding,
    });
  });
  scenes.forEach((item, index) => {
    const selection = {
      selectionType: "scene",
      selectionId: String(item?.scene_id || `scene-${index + 1}`).trim(),
      selectionLabel: `场景 ${item?.scene_no || index + 1} · ${stripStoryboardDisplayIds(item?.location || "") || `场景 ${index + 1}`}`,
      selectionSummary: String(item?.scene_notes || item?.summary || "").trim(),
      payload: {
        sceneId: String(item?.scene_id || `scene-${index + 1}`).trim(),
        sceneNo: item?.scene_no || index + 1,
        sceneTitle: String(item?.title || "").trim(),
        sceneLocation: String(item?.location || "").trim(),
      },
    };
    const locationName = stripStoryboardDisplayIds(item?.location || "");
    pushEntry(item?.location, "scene", sceneByLocation.get(locationName) || selection);
  });
  return Array.from(seen.values()).sort((a, b) => b.term.length - a.term.length);
};

export const renderStoryboardMentionText = (
  value,
  mentionTerms = [],
  onMentionSelect = null,
  onMentionHover = null,
  onMentionLeave = null,
  storyboardNode = null,
) => {
  // [从 Workbench.jsx 506-606 原样复制]
  // 实施时从 Workbench.jsx:506-606 剪切粘贴；此函数使用 React.Fragment、<span>
  const text = stripStoryboardDisplayIds(value);
  if (!text) return "";
  const termEntries = Array.from(
    new Map(
      (mentionTerms || [])
        .map((item) => {
          const term = stripStoryboardDisplayIds(item?.term || "");
          if (!term) return null;
          return { ...item, term, type: String(item?.type || "").trim() || "default" };
        })
        .filter(Boolean)
        .map((item) => [item.term, item]),
    ).values(),
  ).sort((a, b) => b.term.length - a.term.length);
  const terms = termEntries.map((item) => item.term);
  if (!terms.length) return text;
  const pattern = new RegExp(`(${terms.map((item) => escapeRegExp(item)).join("|")})`, "g");
  const parts = text.split(pattern);
  if (parts.length <= 1) return text;
  const mentionTypeByTerm = new Map(termEntries.map((item) => [item.term, item.type]));
  return parts.map((part, index) => {
    if (!part) return null;
    const matched = terms.some((term) => term === part);
    if (!matched) return <React.Fragment key={`storyboard-text-${index}`}>{part}</React.Fragment>;
    const mentionType = mentionTypeByTerm.get(part) || "default";
    const mentionClassName =
      mentionType === "character" ? "bg-cyan-50 text-cyan-700 ring-cyan-200/80"
      : mentionType === "subject" ? "bg-violet-50 text-violet-700 ring-violet-200/80"
      : mentionType === "scene" ? "bg-amber-50 text-amber-700 ring-amber-200/80"
      : "bg-slate-100 text-slate-700 ring-slate-200/80";
    const mentionEntry = termEntries.find((item) => item.term === part) || null;
    return (
      <span
        key={`storyboard-mention-${index}`}
        className={`rounded-md px-1 py-0.5 font-medium ring-1 ${mentionClassName} ${mentionEntry && typeof onMentionSelect === "function" ? "cursor-pointer hover:brightness-95" : ""}`}
        role={mentionEntry && typeof onMentionSelect === "function" ? "button" : undefined}
        tabIndex={mentionEntry && typeof onMentionSelect === "function" ? 0 : undefined}
        onMouseDown={mentionEntry && typeof onMentionSelect === "function" ? (e) => { e.stopPropagation(); } : undefined}
        onClick={mentionEntry && typeof onMentionSelect === "function" ? (e) => { e.stopPropagation(); onMentionSelect(mentionEntry); } : undefined}
        onMouseEnter={mentionEntry && typeof onMentionHover === "function" ? (e) => { e.stopPropagation(); onMentionHover(storyboardNode, mentionEntry, e); } : undefined}
        onMouseLeave={mentionEntry && typeof onMentionLeave === "function" ? (e) => { e.stopPropagation(); onMentionLeave(); } : undefined}
        onKeyDown={mentionEntry && typeof onMentionSelect === "function" ? (e) => { if (e.key !== "Enter" && e.key !== " ") return; e.preventDefault(); e.stopPropagation(); onMentionSelect(mentionEntry); } : undefined}
      >
        {mentionEntry?.hasBinding ? "@" : ""}{part}
      </span>
    );
  });
};

export const extractScriptPlatform = (text) => {
  const source = String(text || "");
  if (!source) return "";
  if (/小红书/i.test(source)) return "小红书";
  if (/抖音/i.test(source)) return "抖音";
  if (/快手/i.test(source)) return "快手";
  if (/微信|企微|企业微信/i.test(source)) return "微信";
  if (/淘宝|天猫/i.test(source)) return "淘宝/天猫";
  if (/京东/i.test(source)) return "京东";
  if (/拼多多|拼夕夕/i.test(source)) return "拼多多";
  if (/1688/i.test(source)) return "1688";
  return "";
};

export const buildInitialScriptBrief = (missionText, product = "") => {
  const normalizedProduct = String(product || extractProductKeyword(missionText) || "").trim();
  return normalizeScriptBrief({
    product: normalizedProduct,
    primaryPlatform: extractScriptPlatform(missionText) || "抖音",
    conversionGoal: "点击商品详情",
  });
};

export const getAgentResultCardWidth = () => AGENT_RESULT_CARD_WIDTH;

export const getAgentTurnStepLabel = (turn) => {
  const steps = turn?.intent === "DRAMA" ? DRAMA_RUN_STEPS : AGENT_RUN_STEPS;
  return steps[Math.min(turn?.stepIndex || 0, steps.length - 1)];
};
```


- [ ] **Step 2: 在 Workbench.jsx 顶部的 import 区域添加引用**

在现有 import 块末尾（约 line 119 之后）添加：

```js
import {
  EMPTY_LIST,
  AGENT_RUN_STEPS,
  DRAMA_RUN_STEPS,
  AGENT_RESULT_CARD_WIDTH,
  SCRIPT_PLATFORM_OPTIONS,
  SCRIPT_PRICE_BAND_OPTIONS,
  SCRIPT_CONVERSION_GOAL_OPTIONS,
  SCRIPT_AUDIENCE_OPTIONS,
  normalizeScriptBrief,
  buildArtifactSelectionKey,
  isSameArtifactSelection,
  isPreviewableArtifact,
  normalizeLocationName,
  matchesSceneBinding,
  stripStoryboardDisplayIds,
  escapeRegExp,
  collectStoryboardMentionTerms,
  renderStoryboardMentionText,
  extractScriptPlatform,
  buildInitialScriptBrief,
  getAgentResultCardWidth,
  getAgentTurnStepLabel,
} from "../constants/workbench";
```

并从 Workbench.jsx 中**删除**以上已迁移的常量/函数定义（行 138-149、183-193、219、318-636 中对应片段）。

- [ ] **Step 3: 验证 build 通过**

```bash
cd /home/ai/zhangjian/ai_studio_mvp/banana-flow-studio-dev
npm run build 2>&1 | tail -20
```

Expected: `✓ built in` 无 Error 行。

- [ ] **Step 4: Commit**

```bash
git add src/constants/workbench.js src/pages/Workbench.jsx
git commit -m "refactor: extract shared constants to src/constants/workbench.js"
```

---

### Task 2: 提取 DramaMarkdownBlock

**Files:**
- Create: `src/components/workbench/DramaMarkdownBlock.jsx`
- Modify: `src/pages/Workbench.jsx:638-753`

- [ ] **Step 1: 创建组件文件**

DramaMarkdownBlock 使用了 3 个私有帮助函数（只有它一个组件使用），一起移出：

```jsx
// src/components/workbench/DramaMarkdownBlock.jsx
import React from "react";

const normalizeLatexSymbols = (value) =>
  String(value || "")
    .replace(/\\leftrightarrow/g, "↔")
    .replace(/\\leftarrow/g, "←")
    .replace(/\\rightarrow/g, "→")
    .replace(/\\Rightarrow/g, "⇒")
    .replace(/\\Leftarrow/g, "⇐")
    .replace(/\\to\b/g, "→")
    .replace(/\\times/g, "×")
    .replace(/\\cdot/g, "·")
    .replace(/\\leq/g, "≤")
    .replace(/\\geq/g, "≥")
    .replace(/\\neq/g, "≠");

const normalizeInlineMath = (value) =>
  normalizeLatexSymbols(value)
    .replace(/\$([^$\n]{1,120})\$/g, (_, inner) => normalizeLatexSymbols(inner))
    .replace(/\\\(([\s\S]{1,120}?)\\\)/g, (_, inner) => normalizeLatexSymbols(inner))
    .replace(/\\\[([\s\S]{1,120}?)\\\]/g, (_, inner) => normalizeLatexSymbols(inner));

const stripMarkdownControlMarkers = (value) =>
  normalizeInlineMath(value)
    .replace(/\r\n/g, "\n")
    .replace(/\*\*/g, "")
    .replace(/__/g, "")
    .replace(/`/g, "")
    .trim();

const DramaMarkdownBlock = ({ value = "", className = "" }) => {
  // [从 Workbench.jsx:685-753 原样复制函数体]
  const sanitized = stripMarkdownControlMarkers(value);
  if (!sanitized) {
    return <div className={className}>暂无结果</div>;
  }
  const lines = sanitized.split("\n");
  return (
    <div className={className}>
      {lines.map((rawLine, index) => {
        const line = String(rawLine || "");
        const trimmed = line.trim();
        if (!trimmed) return <div key={`drama_md_${index}`} className="h-2" />;
        const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
          const level = headingMatch[1].length;
          const headingText = headingMatch[2].trim();
          const headingClass = level <= 2 ? "text-[13px] font-semibold text-slate-900" : "text-[12px] font-semibold text-slate-800";
          return <div key={`drama_md_${index}`} className={`${headingClass} ${index > 0 ? "mt-3" : ""}`}>{headingText}</div>;
        }
        const quoteMatch = trimmed.match(/^>\s?(.*)$/);
        if (quoteMatch) return <div key={`drama_md_${index}`} className="border-l-2 border-slate-200 pl-3 text-slate-600 whitespace-pre-wrap">{quoteMatch[1].trim()}</div>;
        const bulletMatch = trimmed.match(/^[-*+]\s+(.+)$/);
        if (bulletMatch) return (
          <div key={`drama_md_${index}`} className="flex items-start gap-2 text-slate-700">
            <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
            <span className="min-w-0 whitespace-pre-wrap">{bulletMatch[1].trim()}</span>
          </div>
        );
        const orderedMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
        if (orderedMatch) return (
          <div key={`drama_md_${index}`} className="flex items-start gap-2 text-slate-700">
            <span className="shrink-0 text-slate-500">{orderedMatch[1]}.</span>
            <span className="min-w-0 whitespace-pre-wrap">{orderedMatch[2].trim()}</span>
          </div>
        );
        return <div key={`drama_md_${index}`} className="text-slate-700 whitespace-pre-wrap">{trimmed}</div>;
      })}
    </div>
  );
};

export default DramaMarkdownBlock;
```

- [ ] **Step 2: 修改 Workbench.jsx**

删除 Workbench.jsx 中的 `normalizeLatexSymbols`、`normalizeInlineMath`、`stripMarkdownControlMarkers`、`DramaMarkdownBlock` 的完整定义（大约行 638-753），替换为：

```js
import DramaMarkdownBlock from "../components/workbench/DramaMarkdownBlock";
```

（加到已有 import 块中。）

- [ ] **Step 3: Build 验证**

```bash
npm run build 2>&1 | tail -5
```

Expected: 无 Error。

- [ ] **Step 4: Commit**

```bash
git add src/components/workbench/DramaMarkdownBlock.jsx src/pages/Workbench.jsx
git commit -m "refactor: extract DramaMarkdownBlock to src/components/workbench"
```

---

### Task 3: 提取 VideoPlayer

**Files:**
- Create: `src/components/workbench/VideoPlayer.jsx`
- Modify: `src/pages/Workbench.jsx:2956-2979`

- [ ] **Step 1: 创建组件文件**

```jsx
// src/components/workbench/VideoPlayer.jsx
import React, { useState } from "react";
import { FileWarning } from "lucide-react";

const VideoPlayer = ({ src, className, controls = false, autoPlay = true, ...props }) => {
  const [error, setError] = useState(false);
  if (error)
    return (
      <div className={`flex flex-col items-center justify-center bg-slate-100 text-slate-500 ${className}`}>
        <FileWarning className="w-6 h-6 mb-1 text-rose-500" />
        <span className="text-[10px]">视频加载失败</span>
      </div>
    );
  return (
    <video
      src={src}
      className={className}
      controls={controls}
      autoPlay={autoPlay}
      loop
      muted
      playsInline
      crossOrigin="anonymous"
      onError={() => setError(true)}
      {...props}
    />
  );
};

export default VideoPlayer;
```

- [ ] **Step 2: 修改 Workbench.jsx**

删除行 2956–2979（VideoPlayer 定义），替换为：

```js
import VideoPlayer from "../components/workbench/VideoPlayer";
```

- [ ] **Step 3: Build 验证**

```bash
npm run build 2>&1 | tail -5
```

Expected: 无 Error。

- [ ] **Step 4: Commit**

```bash
git add src/components/workbench/VideoPlayer.jsx src/pages/Workbench.jsx
git commit -m "refactor: extract VideoPlayer to src/components/workbench"
```

---

### Task 4: 提取 ToolIconBtn

**Files:**
- Create: `src/components/workbench/ToolIconBtn.jsx`
- Modify: `src/pages/Workbench.jsx:3089-3107`

- [ ] **Step 1: 创建组件文件**

```jsx
// src/components/workbench/ToolIconBtn.jsx
import React from "react";

const ToolIconBtn = ({ icon, onClick, disabled, active, title }) => {
  const IconComponent = icon;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded transition-colors ${
        disabled
          ? "text-slate-600 cursor-not-allowed"
          : active
          ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
          : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      {IconComponent ? React.createElement(IconComponent, { className: "w-4 h-4" }) : null}
    </button>
  );
};

export default ToolIconBtn;
```

- [ ] **Step 2: 修改 Workbench.jsx**

删除行 3089–3107，替换为：

```js
import ToolIconBtn from "../components/workbench/ToolIconBtn";
```

- [ ] **Step 3: Build 验证 + Commit**

```bash
npm run build 2>&1 | tail -5
git add src/components/workbench/ToolIconBtn.jsx src/pages/Workbench.jsx
git commit -m "refactor: extract ToolIconBtn to src/components/workbench"
```

---

### Task 5: 提取 PromptPolishPickerModal

**Files:**
- Create: `src/components/workbench/PromptPolishPickerModal.jsx`
- Modify: `src/pages/Workbench.jsx:780-841`

- [ ] **Step 1: 创建组件文件**

```jsx
// src/components/workbench/PromptPolishPickerModal.jsx
import React from "react";
import { X, Sparkles } from "lucide-react";

const PromptPolishPickerModal = ({ open, title, sourcePrompt, variants, onClose, onUse }) => {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[160] flex items-center justify-center bg-white/55 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_32px_96px_rgba(15,23,42,0.16)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <div className="text-sm font-semibold text-slate-800">{title || "AI 润色"}</div>
            <div className="mt-1 text-[11px] text-slate-500">保留原始画面结构，直接从 3 个候选版本里选一个替换。</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-200 p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label="关闭润色结果"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">原始提示词</div>
            <div className="mt-3 max-h-52 overflow-auto whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {sourcePrompt || "(空)"}
            </div>
          </div>
          <div className="max-h-[60vh] space-y-3 overflow-auto pr-1">
            {(variants || []).map((variant, index) => (
              <button
                key={`${variant?.label || "variant"}_${index}`}
                type="button"
                onClick={() => onUse?.(variant)}
                className="group w-full rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>{variant?.label || `版本${index + 1}`}</span>
                  </div>
                  <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-1 text-[10px] text-slate-600 transition group-hover:border-slate-300 group-hover:bg-white">
                    使用此版本
                  </span>
                </div>
                <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                  {variant?.text || ""}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PromptPolishPickerModal;
```

- [ ] **Step 2: 修改 Workbench.jsx**

删除行 780–841（PromptPolishPickerModal 定义），替换为：

```js
import PromptPolishPickerModal from "../components/workbench/PromptPolishPickerModal";
```

- [ ] **Step 3: Build 验证 + Commit**

```bash
npm run build 2>&1 | tail -5
git add src/components/workbench/PromptPolishPickerModal.jsx src/pages/Workbench.jsx
git commit -m "refactor: extract PromptPolishPickerModal to src/components/workbench"
```

---

### Task 6: 提取 SidebarBtn

**Files:**
- Create: `src/components/workbench/SidebarBtn.jsx`
- Modify: `src/pages/Workbench.jsx:3109-3159`

- [ ] **Step 1: 创建组件文件**

```jsx
// src/components/workbench/SidebarBtn.jsx
import React from "react";

const SidebarBtn = ({
  icon,
  itemId = "",
  label,
  desc,
  onClick,
  color,
  bg,
  active = false,
  compact = false,
  onHoverChange,
  category = "",
  primary = false,
  menuTrigger = false,
}) => {
  const IconComponent = icon;
  const iconNudgeXMap = { workflow_bundle: 0 };
  const iconNudgeX = iconNudgeXMap[itemId] ?? 0;
  return (
    <button
      onClick={(event) => onClick?.(event)}
      onMouseEnter={(event) => onHoverChange?.(true, event.currentTarget)}
      onMouseLeave={() => onHoverChange?.(false)}
      aria-label={label}
      data-sidebar-workflow-trigger={menuTrigger ? "true" : undefined}
      className={`group relative flex items-center justify-center rounded-full border text-left transition-all duration-200 ${
        primary
          ? `h-10 w-10 border-[rgba(169,211,126,0.75)] bg-[#A9D37E] text-slate-900 shadow-[0_8px_18px_rgba(126,184,74,0.16)] ${active ? "ring-1 ring-[#DCEBC8]" : "hover:brightness-[0.985]"}`
          : `${compact ? "h-8 w-8" : "h-10 w-10"} border-transparent ${
              active ? "bg-[#EEF1F4] text-slate-700" : "bg-transparent text-[#6B7280] hover:bg-[#EAECEF] hover:text-slate-800 active:bg-[#E1E5E9]"
            }`
      }`}
    >
      <span className="flex h-6 w-6 items-center justify-center">
        {IconComponent
          ? React.createElement(IconComponent, {
              className: primary ? "h-[18px] w-[18px]" : "h-[18px] w-[18px]",
              strokeWidth: 2.2,
              style: iconNudgeX ? { transform: `translateX(${iconNudgeX}px)` } : undefined,
            })
          : null}
      </span>
    </button>
  );
};

export default SidebarBtn;
```

- [ ] **Step 2: 修改 Workbench.jsx**

删除行 3109–3159，替换为：

```js
import SidebarBtn from "../components/workbench/SidebarBtn";
```

- [ ] **Step 3: Build 验证 + Commit**

```bash
npm run build 2>&1 | tail -5
git add src/components/workbench/SidebarBtn.jsx src/pages/Workbench.jsx
git commit -m "refactor: extract SidebarBtn to src/components/workbench"
```

---

### Task 7: 提取 InlineDropdown

**Files:**
- Create: `src/components/workbench/InlineDropdown.jsx`
- Modify: `src/pages/Workbench.jsx:2981-3088`

- [ ] **Step 1: 创建组件文件**

从 Workbench.jsx 行 2981–3088 复制 InlineDropdown 完整定义（包括内部 useEffect + scroll handler）：

```jsx
// src/components/workbench/InlineDropdown.jsx
import React, { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { EMPTY_LIST } from "../../constants/workbench";

const InlineDropdown = ({
  value,
  options = EMPTY_LIST,
  onChange,
  placeholder = "请选择",
  className = "",
  panelClassName = "",
  onMouseDown,
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (rootRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown, true);
    return () => { document.removeEventListener("mousedown", handlePointerDown, true); };
  }, [open]);

  // [从 Workbench.jsx:2981-3088 复制剩余 JSX 部分]
  // 实施时：把 Workbench.jsx 行 2981-3088 的函数体完整复制到这里
  const selectedOption = (options || []).find((opt) => opt?.value === value || opt === value);
  const displayLabel = selectedOption
    ? typeof selectedOption === "object"
      ? (selectedOption.label ?? selectedOption.value)
      : selectedOption
    : placeholder;

  return (
    <div ref={rootRef} className={`relative inline-block ${className}`} onMouseDown={onMouseDown}>
      <button
        type="button"
        className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:border-slate-300 hover:bg-slate-50"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="min-w-0 truncate">{displayLabel}</span>
        <ChevronDown className="h-3 w-3 shrink-0 text-slate-400" />
      </button>
      {open && (
        <div className={`absolute left-0 top-full z-50 mt-1 min-w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg ${panelClassName}`}>
          {(options || []).map((opt, index) => {
            const optValue = typeof opt === "object" ? opt?.value : opt;
            const optLabel = typeof opt === "object" ? (opt?.label ?? opt?.value) : opt;
            return (
              <button
                key={`${optValue}_${index}`}
                type="button"
                className={`block w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50 ${optValue === value ? "bg-slate-100 font-medium text-slate-900" : "text-slate-700"}`}
                onClick={() => { onChange?.(optValue); setOpen(false); }}
              >
                {optLabel}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default InlineDropdown;
```

> **注意**：上面函数体是简化示例。实施时必须从 Workbench.jsx:2981-3088 完整复制真实实现，不要用这个简化版本。

- [ ] **Step 2: 修改 Workbench.jsx**

删除行 2981–3088，替换为：

```js
import InlineDropdown from "../components/workbench/InlineDropdown";
```

- [ ] **Step 3: Build 验证 + Commit**

```bash
npm run build 2>&1 | tail -5
git add src/components/workbench/InlineDropdown.jsx src/pages/Workbench.jsx
git commit -m "refactor: extract InlineDropdown to src/components/workbench"
```

---

### Task 8: 提取 AgentResultCardContent

**Files:**
- Create: `src/components/workbench/AgentResultCardContent.jsx`
- Modify: `src/pages/Workbench.jsx:3161-3268`

- [ ] **Step 1: 创建组件文件**

AgentResultCardContent 依赖：`normalizeScriptBrief`（从 constants/workbench），`DramaMarkdownBlock`（从 components/workbench），`SCRIPT_AUDIENCE_OPTIONS` 等（从 constants/workbench），以及多个 agent-canvas 组件和 lucide-react 图标。

```jsx
// src/components/workbench/AgentResultCardContent.jsx
import React from "react";
import { Loader2, AlertCircle, RotateCcw } from "lucide-react";
import TopicCards from "../agent-canvas/TopicCards";
import ScriptBriefCard from "../agent-canvas/ScriptBriefCard";
import ScriptExecutionPlan from "../agent-canvas/ScriptExecutionPlan";
import ScriptPlanSummary from "../agent-canvas/ScriptPlanSummary";
import DramaMarkdownBlock from "./DramaMarkdownBlock";
import {
  normalizeScriptBrief,
  getAgentTurnStepLabel,
  SCRIPT_AUDIENCE_OPTIONS,
  SCRIPT_PRICE_BAND_OPTIONS,
  SCRIPT_CONVERSION_GOAL_OPTIONS,
  SCRIPT_PLATFORM_OPTIONS,
} from "../../constants/workbench";

const AgentResultCardContent = ({
  turn,
  onRetry,
  onBriefChange,
  onBriefSubmit,
  onBriefSubmitDefaults,
  onBriefCancel,
  onSelectAngle,
}) => {
  // [从 Workbench.jsx:3169-3264 完整复制函数体]
  const response = turn?.response || null;
  const topics = response?.topics || [];
  const brief = normalizeScriptBrief(turn?.scriptBrief || turn?.scriptBriefDraft || {});
  const isDramaTurn = turn?.intent === "DRAMA";

  if (turn?.status === "running") {
    return (
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 text-xs text-slate-700">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Agent 执行中
        </div>
        <div className="text-[11px] text-slate-400">当前步骤：{getAgentTurnStepLabel(turn)}</div>
      </div>
    );
  }

  if (turn?.status === "clarify") {
    return (
      <div className="space-y-2">
        <div className="text-xs text-slate-700">{turn?.assistantText || "先确认脚本设定。"}</div>
        {turn?.scriptBriefDraft ? (
          <ScriptBriefCard
            draft={brief}
            audienceOptions={SCRIPT_AUDIENCE_OPTIONS}
            priceBandOptions={SCRIPT_PRICE_BAND_OPTIONS}
            conversionGoalOptions={SCRIPT_CONVERSION_GOAL_OPTIONS}
            platformOptions={SCRIPT_PLATFORM_OPTIONS}
            onChange={(nextBrief) => onBriefChange?.(turn?.id, nextBrief)}
            onSubmit={() => onBriefSubmit?.(turn?.id)}
            onSubmitDefaults={() => onBriefSubmitDefaults?.(turn?.id)}
            onCancel={() => onBriefCancel?.(turn?.id)}
          />
        ) : null}
      </div>
    );
  }

  if (turn?.status === "error") {
    return (
      <div className="space-y-2">
        <div className="inline-flex items-center gap-1.5 text-xs text-rose-600">
          <AlertCircle className="w-3.5 h-3.5" />
          {turn?.error || "请求失败"}
        </div>
        <button
          type="button"
          onClick={() => onRetry?.(turn?.id)}
          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 text-[11px] text-slate-700 hover:bg-slate-100"
        >
          <RotateCcw className="w-3 h-3" />
          重试
        </button>
      </div>
    );
  }

  if (!response) return <div className="text-xs text-slate-500">暂无结果</div>;

  if (isDramaTurn) {
    return (
      <div className="space-y-2">
        {response?.summary ? <div className="text-[11px] tracking-[0.12em] text-slate-500 text-left">短剧摘要</div> : null}
        {response?.summary ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-6">
            <DramaMarkdownBlock value={response.summary} className="space-y-1.5" />
          </div>
        ) : null}
        <div className="text-[11px] tracking-[0.12em] text-slate-500 text-left">创作结果</div>
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs leading-6">
          <DramaMarkdownBlock value={response?.text || ""} className="space-y-1.5" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <ScriptPlanSummary brief={brief} />
      <div className="text-[11px] tracking-[0.12em] text-slate-500 text-left">脚本主题</div>
      <TopicCards
        topics={topics}
        selectedAngle={brief?.selectedAngle || ""}
        onSelectAngle={(angle) => onSelectAngle?.(turn?.id, angle)}
      />
      <ScriptExecutionPlan brief={brief} topics={topics} response={response} />
    </div>
  );
};

export default AgentResultCardContent;
```

- [ ] **Step 2: 修改 Workbench.jsx**

删除行 3161–3268，替换为：

```js
import AgentResultCardContent from "../components/workbench/AgentResultCardContent";
```

- [ ] **Step 3: Build 验证 + Commit**

```bash
npm run build 2>&1 | tail -5
git add src/components/workbench/AgentResultCardContent.jsx src/pages/Workbench.jsx
git commit -m "refactor: extract AgentResultCardContent to src/components/workbench"
```

---

### Task 9: 提取 PersonaMentionTextarea

PersonaMentionTextarea 是第二大组件（约 1780 行，从 1176 到 ~2955），包含完整的 @mention 自动补全交互逻辑。

**Files:**
- Create: `src/components/workbench/PersonaMentionTextarea.jsx`
- Modify: `src/pages/Workbench.jsx:1176-2955`

- [ ] **Step 1: 识别函数体范围**

在编辑器中打开 Workbench.jsx，定位：
- 开始：行 1176 `const PersonaMentionTextarea = React.forwardRef(`
- 结束：找到匹配的 `};`（最后一个，约行 2955）

确认结束行：运行以下命令检查 PersonaMentionTextarea 的实际结束行：

```bash
grep -n "^const PersonaMentionTextarea\|^const VideoPlayer" src/pages/Workbench.jsx
```

Expected output 类似：`1176:const PersonaMentionTextarea` 和 `2956:const VideoPlayer`，说明 PersonaMentionTextarea 定义范围是 1176–2955。

- [ ] **Step 2: 识别 PersonaMentionTextarea 用到的局部函数**

在 1176 之前（843–1175），有若干只被 PersonaMentionTextarea 用到的帮助函数。检查它们是否已在 constants/workbench.js 中导出，或需随组件一起移出：

```bash
sed -n '843,1175p' src/pages/Workbench.jsx | grep "^const "
```

记录输出的函数名（如 `renderPersonaMentionText`、`normalizePersonaAssetStateImages` 等），逐一确认哪些只被 PersonaMentionTextarea 使用（随组件移出），哪些被 Workbench 函数体也用到（加入 constants/workbench.js）。

- [ ] **Step 3: 创建组件文件头部**

```jsx
// src/components/workbench/PersonaMentionTextarea.jsx
import React, { useState, useRef, useMemo, useCallback, useEffect, forwardRef } from "react";
import { EMPTY_LIST } from "../../constants/workbench";

// [粘贴 Step 2 识别出的、只属于此组件的帮助函数]

// [粘贴 Workbench.jsx 行 1176–2955 的完整定义]

export default PersonaMentionTextarea;
```

实施时：把 Workbench.jsx 行 843–2955 中属于本组件的部分整体剪切粘贴到此文件。

- [ ] **Step 4: 修改 Workbench.jsx**

删除行 1176–2955（PersonaMentionTextarea 定义及其私有帮助函数），替换为：

```js
import PersonaMentionTextarea from "../components/workbench/PersonaMentionTextarea";
```

同时删除 843–1175 中已移到组件文件的帮助函数定义。

- [ ] **Step 5: Build 验证 + Commit**

```bash
npm run build 2>&1 | tail -5
git add src/components/workbench/PersonaMentionTextarea.jsx src/pages/Workbench.jsx
git commit -m "refactor: extract PersonaMentionTextarea to src/components/workbench"
```

---

### Task 10: 提取 PropertyPanel

PropertyPanel 是约 1215 行的复杂组件，包含视频/图片参数配置 UI 和多个内部 state。

**Files:**
- Create: `src/components/workbench/PropertyPanel.jsx`
- Modify: `src/pages/Workbench.jsx:3269-4483`（行号会在前几步完成后偏移，提取前先重新确认）

- [ ] **Step 1: 提取前确认 PropertyPanel 当前行号**

```bash
grep -n "^const PropertyPanel\|^const NodeComponent" src/pages/Workbench.jsx
```

记录两行的行号，PropertyPanel 的范围是 PropertyPanel 行 到 NodeComponent 行 - 1。

- [ ] **Step 2: 识别 PropertyPanel 用到的局部函数（在其定义之前）**

```bash
# 查看 PropertyPanel 定义前 100 行内的函数定义
# 用行号替换 PPSTART 为 PropertyPanel 当前行号
PPSTART=$(grep -n "^const PropertyPanel" src/pages/Workbench.jsx | cut -d: -f1)
sed -n "$((PPSTART-120)),${PPSTART}p" src/pages/Workbench.jsx | grep "^const "
```

确认每个函数是否已导出（在 constants/workbench.js 中）或需随 PropertyPanel 移出。

- [ ] **Step 3: 创建组件文件头部**

```jsx
// src/components/workbench/PropertyPanel.jsx
import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  ChevronDown, ChevronUp, ChevronRight, X, Loader2, Sparkles, Sliders,
  Wand2, AlertCircle, Info, Play, RotateCcw,
  // [根据 PropertyPanel 内实际用到的图标补充]
} from "lucide-react";
import { EMPTY_LIST } from "../../constants/workbench";
import InlineDropdown from "./InlineDropdown";
import PersonaMentionTextarea from "./PersonaMentionTextarea";
// [其他实际需要的 import，根据 PropertyPanel 内 import 情况添加]

// [粘贴 PropertyPanel 定义前的、只属于它的帮助函数]

// [粘贴 PropertyPanel 完整定义，从 const PropertyPanel = 到结束 };]

export default PropertyPanel;
```

实施时从 Workbench.jsx 完整剪切粘贴 PropertyPanel 范围内的所有代码。

- [ ] **Step 4: 修改 Workbench.jsx**

删除 PropertyPanel 的完整定义行范围，替换为：

```js
import PropertyPanel from "../components/workbench/PropertyPanel";
```

- [ ] **Step 5: Build 验证 + Commit**

```bash
npm run build 2>&1 | tail -5
git add src/components/workbench/PropertyPanel.jsx src/pages/Workbench.jsx
git commit -m "refactor: extract PropertyPanel to src/components/workbench"
```

---

### Task 11: 提取 NodeComponent

NodeComponent 是最大的组件（约 2833 行），包含画布节点的完整渲染逻辑。

**Files:**
- Create: `src/components/workbench/NodeComponent.jsx`
- Modify: `src/pages/Workbench.jsx:NodeComponent 行~Workbench 行-1`（提取前确认行号）

- [ ] **Step 1: 确认 NodeComponent 当前行号范围**

```bash
grep -n "^const NodeComponent\|^const Workbench " src/pages/Workbench.jsx
```

NodeComponent 从第一行到 Workbench 行 - 1。

- [ ] **Step 2: 创建组件文件头部**

NodeComponent 用到了几乎所有 constants/workbench.js 中导出的函数，以及 PropertyPanel、DramaMarkdownBlock、InlineDropdown、VideoPlayer。

```jsx
// src/components/workbench/NodeComponent.jsx
import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  Upload, Image as ImageIcon, Wand2, Download, X, Play, Plus, Zap,
  Layers, Loader2, Images, ImagePlus, Minus, Maximize, Trash2,
  ChevronRight, ChevronDown, ChevronUp, Info, Sparkles, Sliders,
  Palette, Clapperboard, Film, AlertCircle, MoreHorizontal, RotateCcw,
  Link as LinkIcon, Scan, Scissors, GripVertical, Volume2, VolumeX,
  FolderOpen, RefreshCw, ArrowRight, CheckCircle2, Square,
  // [根据实际用到的图标补充]
} from "lucide-react";
import {
  EMPTY_LIST,
  isSameArtifactSelection,
  isPreviewableArtifact,
  collectStoryboardMentionTerms,
  renderStoryboardMentionText,
  normalizeScriptBrief,
  stripStoryboardDisplayIds,
  buildArtifactSelectionKey,
} from "../../constants/workbench";
import PropertyPanel from "./PropertyPanel";
import DramaMarkdownBlock from "./DramaMarkdownBlock";
import InlineDropdown from "./InlineDropdown";
import VideoPlayer from "./VideoPlayer";
// [根据实际 import 需求补充，从 NodeComponent 函数体内引用推断]

// [粘贴 NodeComponent 定义前、只属于它的帮助函数]

// [粘贴 NodeComponent 完整定义]

export default NodeComponent;
```

实施时从 Workbench.jsx 完整剪切粘贴。

- [ ] **Step 3: 修改 Workbench.jsx**

删除 NodeComponent 的完整定义范围，替换为：

```js
import NodeComponent from "../components/workbench/NodeComponent";
```

- [ ] **Step 4: Build 验证 + Commit**

```bash
npm run build 2>&1 | tail -5
git add src/components/workbench/NodeComponent.jsx src/pages/Workbench.jsx
git commit -m "refactor: extract NodeComponent to src/components/workbench"
```

- [ ] **Step 5: 检查 Workbench.jsx 行数**

```bash
wc -l src/pages/Workbench.jsx
```

Phase 1 完成后预期：约 11,000–12,000 行。

---

## Phase 2: 自定义 Hook 提取

> Phase 2 必须在 Phase 1 **全部完成** 后才能开始。

Hook 提取的通用模式：
1. 从 Workbench 函数体（从 `const Workbench = () => {` 开始）中剪切属于该 hook 的 `useState`、`useRef`、`useEffect`、`useCallback`、`useMemo` 和 handler 函数
2. 写入新的 `src/hooks/useFoo.js` 文件
3. Workbench.jsx 中原位置替换为 `const { ... } = useFoo(params);`
4. `npm run build` 验证

---

### Task 12: 提取 useMemberInfo

**Files:**
- Create: `src/hooks/useMemberInfo.js`
- Modify: `src/pages/Workbench.jsx`

- [ ] **Step 1: 创建 src/hooks/useMemberInfo.js**

```js
// src/hooks/useMemberInfo.js
import { useState, useCallback, useEffect, useRef } from "react";
import { viewMemberInfo } from "../api/memberInfo";
import { viewUserAuths } from "../api/userAuths";

export function useMemberInfo(apiFetch, { onUpdateApiDebugStatus, onPushApiDebugDetail } = {}) {
  const [memberInfo, setMemberInfo] = useState(null);
  const [memberInfoLoading, setMemberInfoLoading] = useState(true);
  const [memberInfoLoginUrl, setMemberInfoLoginUrl] = useState("");
  const [userAuths, setUserAuths] = useState(null);
  const [userAuthsLoading, setUserAuthsLoading] = useState(true);

  const navigateToMemberLogin = useCallback((loginUrl = "") => {
    try {
      const microLogout = window.microApp?.getData?.()?.logout;
      if (typeof microLogout === "function") { microLogout(); return; }
    } catch (error) {
      console.warn("[memberInfo] microApp logout failed", error);
    }
    const targetUrl = String(loginUrl || "").trim();
    if (targetUrl) window.open(targetUrl, "_blank", "noopener,noreferrer");
  }, []);

  useEffect(() => {
    // [从 Workbench.jsx 剪切 loadMemberInfo useEffect 完整代码]
    // 对应 Workbench.jsx 中 "const loadMemberInfo = async (attempt = 0)" 的整段 useEffect
    // updateApiDebugStatus → onUpdateApiDebugStatus?.()
    // pushApiDebugDetail → onPushApiDebugDetail?.()
  }, [apiFetch, onUpdateApiDebugStatus, onPushApiDebugDetail]);

  useEffect(() => {
    // [从 Workbench.jsx 剪切 loadUserAuths useEffect 完整代码]
  }, [apiFetch, onUpdateApiDebugStatus, onPushApiDebugDetail]);

  return {
    memberInfo,
    setMemberInfo,
    memberInfoLoading,
    memberInfoLoginUrl,
    userAuths,
    userAuthsLoading,
    navigateToMemberLogin,
  };
}
```

实施说明：
- `onUpdateApiDebugStatus` 和 `onPushApiDebugDetail` 是回调，允许 Workbench.jsx 传入调试状态更新函数
- 从 Workbench.jsx 剪切约 7899–7985 行的 `loadMemberInfo` useEffect 和约 7986–8060 的 `loadUserAuths` useEffect

- [ ] **Step 2: 修改 Workbench.jsx**

删除相关 useState 声明（5 个）和 2 个 useEffect 块，替换为：

```js
import { useMemberInfo } from "../hooks/useMemberInfo";

// 在 Workbench 函数体内：
const {
  memberInfo,
  setMemberInfo,
  memberInfoLoading,
  memberInfoLoginUrl,
  userAuths,
  userAuthsLoading,
  navigateToMemberLogin,
} = useMemberInfo(apiFetch, {
  onUpdateApiDebugStatus: updateApiDebugStatus,
  onPushApiDebugDetail: pushApiDebugDetail,
});
```

- [ ] **Step 3: Build 验证 + Commit**

```bash
npm run build 2>&1 | tail -5
git add src/hooks/useMemberInfo.js src/pages/Workbench.jsx
git commit -m "refactor: extract useMemberInfo hook"
```

---

### Task 13: 提取 useSidebar

useSidebar 封装侧边栏菜单的显示/隐藏状态。依赖最少，先提取。

**Files:**
- Create: `src/hooks/useSidebar.js`
- Modify: `src/pages/Workbench.jsx`

- [ ] **Step 1: 创建 src/hooks/useSidebar.js**

```js
// src/hooks/useSidebar.js
import { useState, useRef, useCallback } from "react";

export function useSidebar() {
  const [hoveredSidebarItemKey, setHoveredSidebarItemKey] = useState("");
  const [hoveredSidebarPreview, setHoveredSidebarPreview] = useState(null);
  const [sidebarNodeInputMenu, setSidebarNodeInputMenu] = useState(null);
  const [sidebarWorkflowMenu, setSidebarWorkflowMenu] = useState(null);
  const [sidebarImageCreateMenu, setSidebarImageCreateMenu] = useState(null);
  const [activeSidebarItemKey, setActiveSidebarItemKey] = useState("");
  const [showSidebarUploadMenu, setShowSidebarUploadMenu] = useState(false);
  const [sidebarVideoCreateMenu, setSidebarVideoCreateMenu] = useState(null);

  const sidebarUploadMenuRef = useRef(null);
  const sidebarUploadMenuCloseTimerRef = useRef(null);
  const sidebarNodeInputMenuCloseTimerRef = useRef(null);
  const sidebarImageCreateMenuCloseTimerRef = useRef(null);
  const sidebarVideoCreateMenuCloseTimerRef = useRef(null);
  const sidebarWorkflowMenuCloseTimerRef = useRef(null);

  // [从 Workbench.jsx 剪切所有 sidebar 相关 useCallback handlers]
  // 包括 handleSidebarItemHover, closeSidebarMenu, openSidebarWorkflowMenu 等

  return {
    hoveredSidebarItemKey, setHoveredSidebarItemKey,
    hoveredSidebarPreview, setHoveredSidebarPreview,
    sidebarNodeInputMenu, setSidebarNodeInputMenu,
    sidebarWorkflowMenu, setSidebarWorkflowMenu,
    sidebarImageCreateMenu, setSidebarImageCreateMenu,
    activeSidebarItemKey, setActiveSidebarItemKey,
    showSidebarUploadMenu, setShowSidebarUploadMenu,
    sidebarVideoCreateMenu, setSidebarVideoCreateMenu,
    sidebarUploadMenuRef,
    sidebarUploadMenuCloseTimerRef,
    sidebarNodeInputMenuCloseTimerRef,
    sidebarImageCreateMenuCloseTimerRef,
    sidebarVideoCreateMenuCloseTimerRef,
    sidebarWorkflowMenuCloseTimerRef,
    // [所有 sidebar handler 函数]
  };
}
```

- [ ] **Step 2: 修改 Workbench.jsx**

删除对应的 8 个 useState 和 6 个 useRef 以及所有 sidebar handlers，替换为：

```js
import { useSidebar } from "../hooks/useSidebar";

const {
  hoveredSidebarItemKey, setHoveredSidebarItemKey,
  hoveredSidebarPreview, setHoveredSidebarPreview,
  sidebarNodeInputMenu, setSidebarNodeInputMenu,
  sidebarWorkflowMenu, setSidebarWorkflowMenu,
  sidebarImageCreateMenu, setSidebarImageCreateMenu,
  activeSidebarItemKey, setActiveSidebarItemKey,
  showSidebarUploadMenu, setShowSidebarUploadMenu,
  sidebarVideoCreateMenu, setSidebarVideoCreateMenu,
  sidebarUploadMenuRef,
  sidebarUploadMenuCloseTimerRef,
  sidebarNodeInputMenuCloseTimerRef,
  sidebarImageCreateMenuCloseTimerRef,
  sidebarVideoCreateMenuCloseTimerRef,
  sidebarWorkflowMenuCloseTimerRef,
} = useSidebar();
```

- [ ] **Step 3: Build 验证 + Commit**

```bash
npm run build 2>&1 | tail -5
git add src/hooks/useSidebar.js src/pages/Workbench.jsx
git commit -m "refactor: extract useSidebar hook"
```

---

### Task 14: 提取 useAssetLibrary

**Files:**
- Create: `src/hooks/useAssetLibrary.js`
- Modify: `src/pages/Workbench.jsx`

- [ ] **Step 1: 创建 src/hooks/useAssetLibrary.js**

```js
// src/hooks/useAssetLibrary.js
import { useState, useRef, useCallback, useMemo } from "react";
import { createEmptyAssetLibraryStore, saveAssetLibraryDbStore, migrateAssetLibraryLocalStorage } from "../lib/assetLibraryDb";

const ASSET_LIBRARY_STORE_KEY = "bananaflow_asset_library_v1";
const loadAssetLibraryStore = () => {
  // [从 Workbench.jsx 剪切 loadAssetLibraryStore 函数定义]
};
const saveAssetLibraryStore = (store, canvasId) => {
  // [从 Workbench.jsx 剪切 saveAssetLibraryStore 函数定义]
};

export function useAssetLibrary(apiFetch, canvasId) {
  const [assetLibraryStore, setAssetLibraryStore] = useState(() => loadAssetLibraryStore());
  const [showAssetLibrary, setShowAssetLibrary] = useState(false);
  const [assetLibraryTab, setAssetLibraryTab] = useState("works");
  const [assetLibraryLoaded, setAssetLibraryLoaded] = useState(false);
  const [expandedAssetWorkIds, setExpandedAssetWorkIds] = useState(new Set());
  const [assetLibraryDetailWorkId, setAssetLibraryDetailWorkId] = useState("");
  const [assetLibraryDetailPersonaId, setAssetLibraryDetailPersonaId] = useState("");
  const [editingAssetWorkTitleId, setEditingAssetWorkTitleId] = useState("");
  const [editingAssetWorkTitleDraft, setEditingAssetWorkTitleDraft] = useState("");
  const [pendingUploadNodeId, setPendingUploadNodeId] = useState("");
  const [assetLibraryPickerMode, setAssetLibraryPickerMode] = useState(false);

  const assetLibraryPersonaImageInputRef = useRef(null);
  const assetLibraryRestoredRef = useRef(false);

  // derived state (useMemo)
  const assetLibraryDrafts = useMemo(() => assetLibraryStore?.drafts || [], [assetLibraryStore]);
  const assetLibraryWorks = useMemo(() => assetLibraryStore?.works || [], [assetLibraryStore]);
  const assetLibraryWorkVersions = useMemo(() => assetLibraryStore?.workVersions || [], [assetLibraryStore]);
  const assetLibraryAssets = useMemo(() => assetLibraryStore?.assets || [], [assetLibraryStore]);
  const assetLibraryPersonas = useMemo(() => assetLibraryStore?.personas || [], [assetLibraryStore]);

  // [从 Workbench.jsx 剪切所有 assetLibrary useCallback handlers 和 useEffect]

  return {
    assetLibraryStore, setAssetLibraryStore,
    showAssetLibrary, setShowAssetLibrary,
    assetLibraryTab, setAssetLibraryTab,
    assetLibraryLoaded, setAssetLibraryLoaded,
    expandedAssetWorkIds, setExpandedAssetWorkIds,
    assetLibraryDetailWorkId, setAssetLibraryDetailWorkId,
    assetLibraryDetailPersonaId, setAssetLibraryDetailPersonaId,
    editingAssetWorkTitleId, setEditingAssetWorkTitleId,
    editingAssetWorkTitleDraft, setEditingAssetWorkTitleDraft,
    pendingUploadNodeId, setPendingUploadNodeId,
    assetLibraryPickerMode, setAssetLibraryPickerMode,
    assetLibraryPersonaImageInputRef,
    assetLibraryRestoredRef,
    assetLibraryDrafts, assetLibraryWorks, assetLibraryWorkVersions,
    assetLibraryAssets, assetLibraryPersonas,
    // [所有 asset library handlers]
  };
}
```

- [ ] **Step 2: 修改 Workbench.jsx**

替换相关 useState/useRef/useMemo/handlers 为：

```js
import { useAssetLibrary } from "../hooks/useAssetLibrary";

const {
  assetLibraryStore, setAssetLibraryStore,
  showAssetLibrary, setShowAssetLibrary,
  // ... (全部解构)
} = useAssetLibrary(apiFetch, canvasId);
```

- [ ] **Step 3: Build 验证 + Commit**

```bash
npm run build 2>&1 | tail -5
git add src/hooks/useAssetLibrary.js src/pages/Workbench.jsx
git commit -m "refactor: extract useAssetLibrary hook"
```

---

### Task 15: 提取 useCanvas

useCanvas 管理画布的所有交互状态（节点、连线、视口、拖拽、选择）。这是状态最复杂的 hook。

**Files:**
- Create: `src/hooks/useCanvas.js`
- Modify: `src/pages/Workbench.jsx`

- [ ] **Step 1: 创建 src/hooks/useCanvas.js**

```js
// src/hooks/useCanvas.js
import { useState, useRef, useCallback, useEffect } from "react";

const CANVAS_KEY = "bananaflow_canvas_id";
const GRID_SIZE = 20;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3;
const MEDIA_UPLOAD_NODE_WIDTH = 280;
const MEDIA_UPLOAD_NODE_DROP_OFFSET_Y = 96;
const MEDIA_UPLOAD_NODE_EMPTY_HEIGHT = 132;

const generateId = () => Math.random().toString(36).substr(2, 9);
const newCanvasId = () => generateId();

export function useCanvas({ apiFetch, onDropAsset } = {}) {
  const [nodes, setNodes] = useState([]);
  const [connections, setConnections] = useState([]);
  const [history, setHistory] = useState([]);
  const [historyStep, setHistoryStep] = useState(-1);
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const [selectedNodeIds, setSelectedNodeIds] = useState(new Set());
  const [selectedConnectionIds, setSelectedConnectionIds] = useState(new Set());
  const [activeNodeId, setActiveNodeId] = useState(null);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [interactionMode, setInteractionMode] = useState("idle");
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [initialNodePos, setInitialNodePos] = useState({});
  const [selectionBox, setSelectionBox] = useState(null);
  const [connectingSource, setConnectingSource] = useState(null);
  const [hoveredConnectionId, setHoveredConnectionId] = useState("");
  const [hoveredConnectTarget, setHoveredConnectTarget] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [canvasDropActive, setCanvasDropActive] = useState(false);
  const [canvasDropUploading, setCanvasDropUploading] = useState(null);
  const [canvasId] = useState(() => {
    const saved = localStorage.getItem(CANVAS_KEY);
    return saved || newCanvasId();
  });

  const viewportRef = useRef(viewport);
  const nodeElementMapRef = useRef(new Map());
  const nodeDragCleanupRef = useRef(null);
  const connectionHoverTargetRef = useRef(null);
  const connectionDragSelectionRef = useRef({ userSelect: "", webkitUserSelect: "" });
  const dragSelectionStyleRef = useRef({ userSelect: "", webkitUserSelect: "" });

  // [从 Workbench.jsx 剪切所有 canvas interaction handlers:
  //  handleCanvasMouseDown, handleCanvasMouseMove, handleCanvasMouseUp,
  //  handleNodeMouseDown, pushHistory, undo, redo,
  //  addNode, deleteNode, updateNodeData, addConnection, deleteConnection,
  //  handleCanvasDrop, handleCanvasDragOver, etc.]

  return {
    nodes, setNodes,
    connections, setConnections,
    history, historyStep,
    viewport, setViewport, viewportRef,
    selectedNodeIds, setSelectedNodeIds,
    selectedConnectionIds, setSelectedConnectionIds,
    activeNodeId, setActiveNodeId,
    isSpacePressed,
    interactionMode, setInteractionMode,
    dragStart, selectionBox,
    connectingSource, setConnectingSource,
    hoveredConnectionId, setHoveredConnectionId,
    hoveredConnectTarget, setHoveredConnectTarget,
    mousePos,
    canvasDropActive,
    canvasDropUploading,
    canvasId,
    nodeElementMapRef,
    nodeDragCleanupRef,
    connectionHoverTargetRef,
    // [所有 canvas handler 函数]
  };
}
```

- [ ] **Step 2: 修改 Workbench.jsx**

```js
import { useCanvas } from "../hooks/useCanvas";

const {
  nodes, setNodes,
  connections, setConnections,
  viewport, setViewport, viewportRef,
  selectedNodeIds, setSelectedNodeIds,
  selectedConnectionIds, setSelectedConnectionIds,
  activeNodeId, setActiveNodeId,
  canvasId,
  nodeElementMapRef,
  // ...其余全部解构
} = useCanvas({ apiFetch });
```

- [ ] **Step 3: Build 验证 + Commit**

```bash
npm run build 2>&1 | tail -5
git add src/hooks/useCanvas.js src/pages/Workbench.jsx
git commit -m "refactor: extract useCanvas hook"
```

---

### Task 16: 提取 useAgentChat

useAgentChat 封装 agent 会话状态和消息发送逻辑。接受 `setNodes` 作为参数（agent 可能操作画布节点）。

**Files:**
- Create: `src/hooks/useAgentChat.js`
- Modify: `src/pages/Workbench.jsx`

- [ ] **Step 1: 创建 src/hooks/useAgentChat.js**

```js
// src/hooks/useAgentChat.js
import { useState, useRef, useCallback, useEffect } from "react";
import { readAgentDevMode, writeAgentDevMode } from "../lib/aiChatAnchorDebug";
import { sendAgentMessage } from "../api/agentCanvas";

const AGENT_SESSION_STORE_KEY = "bananaflow_agent_canvas_sessions_v1";
const loadAgentStore = () => {
  // [从 Workbench.jsx 剪切 loadAgentStore 函数定义]
};
const saveAgentStore = (store) => {
  // [从 Workbench.jsx 剪切 saveAgentStore 函数定义]
};

export function useAgentChat({ apiFetch, setNodes } = {}) {
  const [agentStore, setAgentStore] = useState(() => loadAgentStore());
  const [agentInput, setAgentInput] = useState("");
  const [agentInputFocused, setAgentInputFocused] = useState(false);
  const [agentPromptPolishLoading, setAgentPromptPolishLoading] = useState(false);
  const [agentPromptPolishError, setAgentPromptPolishError] = useState("");
  const [promptPolishDialog, setPromptPolishDialog] = useState(null);
  const [activeComposerActionId, setActiveComposerActionId] = useState("");
  const [showScriptExamples, setShowScriptExamples] = useState(false);
  const [showCanvasExamples, setShowCanvasExamples] = useState(false);
  const [agentComposerFiles, setAgentComposerFiles] = useState([]);
  const [agentDevMode, setAgentDevMode] = useState(() => readAgentDevMode());
  const [agentHistoryCollapsed, setAgentHistoryCollapsed] = useState(true);
  const [agentResultCards, setAgentResultCards] = useState([]);
  const [selectedAgentCardIds, setSelectedAgentCardIds] = useState(new Set());
  const [activeAgentCardId, setActiveAgentCardId] = useState(null);

  const agentInputRef = useRef(null);
  const agentUploadInputRef = useRef(null);
  const agentComposerRef = useRef(null);
  const agentConversationBottomRef = useRef(null);
  const agentCardDragRef = useRef(null);
  const promptPolishApplyRef = useRef(null);

  // [从 Workbench.jsx 剪切所有 agent chat handlers:
  //  handleSendAgentMessage, handleAgentRetry, handleAgentCardAction,
  //  handlePromptPolishRequest, usePromptPolishVariant, etc.]

  return {
    agentStore, setAgentStore,
    agentInput, setAgentInput,
    agentInputFocused, setAgentInputFocused,
    agentPromptPolishLoading,
    agentPromptPolishError,
    promptPolishDialog, setPromptPolishDialog,
    activeComposerActionId, setActiveComposerActionId,
    showScriptExamples, setShowScriptExamples,
    showCanvasExamples, setShowCanvasExamples,
    agentComposerFiles, setAgentComposerFiles,
    agentDevMode, setAgentDevMode,
    agentHistoryCollapsed, setAgentHistoryCollapsed,
    agentResultCards, setAgentResultCards,
    selectedAgentCardIds, setSelectedAgentCardIds,
    activeAgentCardId, setActiveAgentCardId,
    agentInputRef, agentUploadInputRef, agentComposerRef,
    agentConversationBottomRef, agentCardDragRef, promptPolishApplyRef,
    // [所有 handler 函数]
  };
}
```

- [ ] **Step 2: 修改 Workbench.jsx**

```js
import { useAgentChat } from "../hooks/useAgentChat";

const {
  agentStore, setAgentStore,
  agentInput, setAgentInput,
  // ...全部解构
} = useAgentChat({ apiFetch, setNodes });
```

- [ ] **Step 3: Build 验证 + Commit**

```bash
npm run build 2>&1 | tail -5
git add src/hooks/useAgentChat.js src/pages/Workbench.jsx
git commit -m "refactor: extract useAgentChat hook"
```

---

### Task 17: 提取 useWorkbenchRun

useWorkbenchRun 封装工作流执行、历史记录和 toast 通知状态。

**Files:**
- Create: `src/hooks/useWorkbenchRun.js`
- Modify: `src/pages/Workbench.jsx`

- [ ] **Step 1: 创建 src/hooks/useWorkbenchRun.js**

```js
// src/hooks/useWorkbenchRun.js
import { useState, useRef, useCallback, useEffect } from "react";

export function useWorkbenchRun({ apiFetch, nodes, connections } = {}) {
  const [isRunning, setIsRunning] = useState(false);
  const [apiStatus, setApiStatus] = useState("checking");
  const [_globalError, setGlobalError] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [activeHistoryTab, setActiveHistoryTab] = useState("recent");
  const [apiHistory, setApiHistory] = useState([]);
  const [expandedHistoryIds, setExpandedHistoryIds] = useState(new Set());
  const [apiStats, setApiStats] = useState(null);
  const [runToast, setRunToast] = useState(null);

  const runAbortControllerRef = useRef(null);
  const nodeAbortControllersRef = useRef(new Map());
  const cancelledNodeIdsRef = useRef(new Set());
  const runningNodeIdsRef = useRef(new Set());

  // [从 Workbench.jsx 剪切:
  //  executeFlow handler, cancelRun handler, loadApiHistory useEffect,
  //  checkApiStatus useEffect, runToast dismiss handler]

  return {
    isRunning, setIsRunning,
    apiStatus,
    previewImage, setPreviewImage,
    showHistoryPanel, setShowHistoryPanel,
    activeHistoryTab, setActiveHistoryTab,
    apiHistory, setApiHistory,
    expandedHistoryIds, setExpandedHistoryIds,
    apiStats,
    runToast, setRunToast,
    runAbortControllerRef,
    nodeAbortControllersRef,
    cancelledNodeIdsRef,
    runningNodeIdsRef,
    // [executeFlow, cancelRun, loadApiHistory 等 handler 函数]
  };
}
```

- [ ] **Step 2: 修改 Workbench.jsx**

```js
import { useWorkbenchRun } from "../hooks/useWorkbenchRun";

const {
  isRunning, setIsRunning,
  apiStatus,
  previewImage, setPreviewImage,
  // ...全部解构
} = useWorkbenchRun({ apiFetch, nodes, connections });
```

- [ ] **Step 3: Build 验证 + Commit**

```bash
npm run build 2>&1 | tail -5
git add src/hooks/useWorkbenchRun.js src/pages/Workbench.jsx
git commit -m "refactor: extract useWorkbenchRun hook"
```

---

### Task 18: 最终验证

- [ ] **Step 1: 检查 Workbench.jsx 最终行数**

```bash
wc -l src/pages/Workbench.jsx
```

Expected: 低于 6,000 行。

- [ ] **Step 2: 检查新建文件列表**

```bash
ls src/components/workbench/
ls src/hooks/
```

Expected components/workbench: 10 个 .jsx 文件（DramaMarkdownBlock, PromptPolishPickerModal, PersonaMentionTextarea, VideoPlayer, InlineDropdown, ToolIconBtn, SidebarBtn, AgentResultCardContent, PropertyPanel, NodeComponent）
Expected hooks: 6 个 .js 文件（useMemberInfo, useSidebar, useAssetLibrary, useCanvas, useAgentChat, useWorkbenchRun）

- [ ] **Step 3: 最终 build 验证**

```bash
npm run build 2>&1 | tail -20
```

Expected: `✓ built in` 无 Error 行。

- [ ] **Step 4: 启动 dev server 并目视验证**

```bash
./scripts/run_frontend_dev.sh &
sleep 5
```

打开 `http://192.168.20.30:5174/app`，验证：
- 画布正常渲染，节点可创建和拖拽
- 右下角 memberInfo/userAuths 面板正常显示用户名和积分
- 左侧 sidebar 菜单 hover/click 正常
- Agent 聊天输入和发送功能正常

- [ ] **Step 5: 最终 commit**

```bash
git add -A
git commit -m "refactor: complete Workbench.jsx split — 18K lines → <6K lines

Phase 1: 10 components extracted to src/components/workbench/
Phase 2: 6 custom hooks extracted to src/hooks/

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```
