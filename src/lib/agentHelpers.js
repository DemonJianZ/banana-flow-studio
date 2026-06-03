/**
 * agentHelpers.js — Agent 任务相关的纯工具函数与常量
 * (Phase 7 从 Workbench.jsx 模块顶部迁移)
 *
 * 供 Workbench.jsx 和 useAgentMission.js 共同 import。
 */
import { NODE_TYPES } from "../constants/workbench.jsx";

// ─── 生成随机 ID（非 React，不 export hooks）────────────────────────────────
const generateId = () => Math.random().toString(36).slice(2, 11);

// ─── Document processing constants ───────────────────────────────────────────

export const AGENT_DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;
export const WORD_DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const WORD_LEGACY_DOC_MIME_TYPE = "application/msword";

export const AGENT_SHOT_WORKFLOW_QUICK_PROMPT = "请为我上传或粘贴的剧本搭建每个镜头的文生图/图生图工作流";

// ─── HITL / Feature flag ──────────────────────────────────────────────────────

const isFlagEnabled = (...values) =>
  values.some((v) => ["1", "true", "yes", "on"].includes(String(v || "0").trim().toLowerCase()));

export const HITL_FEEDBACK_UI_ENABLED = isFlagEnabled(
  import.meta.env.VITE_ENABLE_HITL_FEEDBACK,
  import.meta.env.VITE_BANANAFLOW_ENABLE_HITL_FEEDBACK,
);

// ─── Storyboard script detection ─────────────────────────────────────────────

const STORYBOARD_SCRIPT_TEXT_MARKERS = [
  "人物：", "人物:", "角色：", "角色:", "场景：", "场景:",
  "时间：", "时间:", "画外音", "旁白", "△", "▲",
];

export const looksLikeShotWorkflowScriptText = (text, uploadedDocuments = []) => {
  const docs = Array.isArray(uploadedDocuments) ? uploadedDocuments : [];
  if (docs.some((item) => String(item?.kind || "").trim() === "storyboard_script_table")) return true;
  const source = String(text || "").trim();
  if (source.length < 80) return false;
  if (/分镜|故事板|storyboard|shot list|镜头脚本|镜头设计/i.test(source)) return true;
  const markerHits = STORYBOARD_SCRIPT_TEXT_MARKERS.filter((m) => source.includes(m)).length;
  const dialogueHits = (source.match(/^\s*[一-龥A-Za-z·]{1,12}\s*[:：]/gm) || []).length;
  const sceneHits = (source.match(/^\s*[△▲]/gm) || []).length;
  return markerHits >= 2 && (dialogueHits >= 2 || sceneHits >= 2);
};

// ─── Storyboard patch enhancement ─────────────────────────────────────────────

export const countStoryboardShots = (plan) =>
  (Array.isArray(plan?.scenes) ? plan.scenes : []).reduce(
    (sum, scene) => sum + (Array.isArray(scene?.shots) ? scene.shots.length : 0),
    0,
  );

export const buildStoryboardWorkflowStepState = (plan) => {
  const lab = plan?.local_asset_bindings || {};
  const boundCharacters = Array.isArray(lab.character_bindings) ? lab.character_bindings.length : 0;
  const boundScenes = Array.isArray(lab.scene_bindings) ? lab.scene_bindings.length : 0;
  const shotCount = countStoryboardShots(plan);
  return [
    { id: "script", label: "剧本输入", status: "success" },
    { id: "plan", label: "分镜设计", status: shotCount > 0 ? "success" : "ready", count: shotCount },
    { id: "assets", label: "资产绑定", status: boundCharacters || boundScenes ? "success" : "ready", count: boundCharacters + boundScenes },
    { id: "shots", label: "镜头图生产", status: "ready", count: shotCount },
  ];
};

export const enhanceStoryboardPatchWithProductionWorkflow = (rawPatch, options = {}) => {
  const patch = Array.isArray(rawPatch) ? rawPatch : [];
  if (!patch.length) return [];
  const storyboardOpIndex = patch.findIndex((op) => op?.op === "add_node" && op?.node?.type === NODE_TYPES.STORYBOARD_PLAN);
  if (storyboardOpIndex < 0) return patch;

  const originalStoryboard = patch[storyboardOpIndex].node || {};
  const shouldCreateSourceNode = !options.sourceNodeId && options.createSourceNode !== false;
  const dx = shouldCreateSourceNode ? 440 : 0;
  const storyboardNodeIds = [];
  let firstStoryboardNodeId = "";
  let sourceNodeId = String(options.sourceNodeId || "").trim();
  let sourceNode = null;

  if (shouldCreateSourceNode) {
    sourceNodeId = `storyboard_input_${generateId()}`;
    const sourceText = String(options.sourceText || "").trim();
    const baseX = Number(originalStoryboard.x || 120);
    const baseY = Number(originalStoryboard.y || 120);
    sourceNode = {
      id: sourceNodeId,
      type: NODE_TYPES.STORYBOARD_INPUT,
      x: baseX,
      y: baseY,
      data: {
        title: "剧本输入",
        status: "success",
        error: "",
        scriptFileName: String(options.sourceTitle || "对话输入剧本").trim() || "对话输入剧本",
        summary: "已读取剧本，并接入故事板制作流程。",
        generatedStoryboardNodeIds: [],
        progressLabel: "",
        textPreview: sourceText.slice(0, 1200),
        source: "agent_chat_storyboard",
      },
    };
  }

  const enhancedPatch = patch.map((op) => {
    if (op?.op !== "add_node" || !op?.node) return op;
    const nextNode = {
      ...op.node,
      x: Number(op.node.x || 0) + dx,
      y: Number(op.node.y || 0),
      data: { ...(op.node.data || {}) },
    };
    if (nextNode.type === NODE_TYPES.STORYBOARD_PLAN) {
      const plan = nextNode.data.storyboard_plan || {};
      const shotCount = countStoryboardShots(plan);
      storyboardNodeIds.push(String(nextNode.id || "").trim());
      if (!firstStoryboardNodeId) firstStoryboardNodeId = String(nextNode.id || "").trim();
      nextNode.data = {
        ...nextNode.data,
        source_storyboard_input_node_id: sourceNodeId || nextNode.data.source_storyboard_input_node_id || "",
        workflow_mode: "storyboard_image_production",
        workflow_status: "ready",
        workflow_summary: shotCount > 0 ? `已拆分 ${shotCount} 个镜头，可继续批量生成分镜图。` : "分镜生产工作流已就绪。",
        workflow_steps: buildStoryboardWorkflowStepState(plan),
      };
    }
    return { ...op, node: nextNode };
  });

  if (sourceNode) {
    sourceNode.data.generatedStoryboardNodeIds = storyboardNodeIds.filter(Boolean);
    enhancedPatch.unshift({ op: "add_node", node: sourceNode });
  }
  if (sourceNodeId && firstStoryboardNodeId) {
    enhancedPatch.push({ op: "add_connection", connection: { id: generateId(), from: sourceNodeId, to: firstStoryboardNodeId } });
  }
  if (firstStoryboardNodeId) {
    enhancedPatch.push({ op: "select_nodes", ids: [firstStoryboardNodeId] });
  }
  return enhancedPatch;
};

// ─── Document file type helpers ───────────────────────────────────────────────

const isDocxDocumentFile = (file) => {
  const name = String(file?.name || "").trim().toLowerCase();
  const type = String(file?.type || "").trim().toLowerCase();
  return name.endsWith(".docx") || type === WORD_DOCX_MIME_TYPE;
};

const isLegacyWordDocumentFile = (file) => {
  const name = String(file?.name || "").trim().toLowerCase();
  const type = String(file?.type || "").trim().toLowerCase();
  return name.endsWith(".doc") || type === WORD_LEGACY_DOC_MIME_TYPE;
};

export const isAgentComposerDocumentFile = (file) => {
  const name = String(file?.name || "").trim().toLowerCase();
  const type = String(file?.type || "").trim().toLowerCase();
  return Boolean(
    name.endsWith(".csv") || name.endsWith(".tsv") || name.endsWith(".txt") ||
    name.endsWith(".md") || name.endsWith(".markdown") ||
    isDocxDocumentFile(file) || isLegacyWordDocumentFile(file) ||
    type.startsWith("text/") || type === "application/csv" || type === "text/csv"
  );
};

const looksLikeStoryboardScriptTableText = (text) => {
  const n = String(text || "").trim();
  if (!n) return false;
  const l = n.toLowerCase();
  return (
    (n.includes("镜号") && n.includes("画面内容")) ||
    (l.includes("shot") && l.includes("visual")) ||
    (l.includes("shot_no") && l.includes("dialogue")) ||
    (l.includes("shot number") && l.includes("duration"))
  );
};

export const looksLikeStoryboardScriptTableFile = (fileName, text) => {
  const name = String(fileName || "").trim().toLowerCase();
  if ((name.endsWith(".csv") || name.endsWith(".tsv")) &&
    (name.includes("storyboard") || name.includes("shot") || name.includes("scene") ||
     name.includes("分镜") || name.includes("镜头"))) return true;
  return looksLikeStoryboardScriptTableText(text);
};

// ─── Document text reading ────────────────────────────────────────────────────

const scoreDecodedStoryboardText = (text) => {
  const source = String(text || "");
  if (!source) return -1_000_000;
  let score = 0;
  score -= (source.match(/�/g) || []).length * 50;
  score += (source.match(/[一-鿿]/g) || []).length * 2;
  if (looksLikeStoryboardScriptTableText(source)) score += 500;
  if (source.includes("镜号")) score += 200;
  if (source.includes("画面内容")) score += 200;
  if (source.includes("台词")) score += 80;
  if (source.includes("音效")) score += 80;
  if (source.includes("时长")) score += 80;
  return score;
};

const decodeStoryboardDocumentBuffer = (buffer) => {
  const bytes = buffer instanceof ArrayBuffer ? buffer : new ArrayBuffer(0);
  let bestText = "", bestScore = -Infinity;
  for (const encoding of ["utf-8", "gb18030", "gbk"]) {
    try {
      const decoded = new TextDecoder(encoding, { fatal: false }).decode(bytes);
      const score = scoreDecodedStoryboardText(decoded);
      if (score > bestScore) { bestScore = score; bestText = decoded; }
    } catch { /* ignore */ }
  }
  return String(bestText || "").trim();
};

const extractDocxTextContent = async (arrayBuffer) => {
  const mammothModule = await import("mammoth/mammoth.browser.js");
  const mammothClient = mammothModule.default || mammothModule;
  if (typeof mammothClient.extractRawText !== "function") throw new Error("Word 文档解析器加载失败");
  const result = await mammothClient.extractRawText({ arrayBuffer });
  return String(result?.value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
};

export const readAgentDocumentText = async (file) => {
  if (isLegacyWordDocumentFile(file)) {
    throw new Error(`${file.name || "Word 文档"} 是旧版 .doc 格式，请另存为 .docx 后上传`);
  }
  const buffer = await file.arrayBuffer();
  if (isDocxDocumentFile(file)) return extractDocxTextContent(buffer);
  return decodeStoryboardDocumentBuffer(buffer);
};

export const getAgentDocumentMimeType = (file) => {
  const type = String(file?.type || "").trim();
  if (type) return type;
  if (isDocxDocumentFile(file)) return WORD_DOCX_MIME_TYPE;
  if (isLegacyWordDocumentFile(file)) return WORD_LEGACY_DOC_MIME_TYPE;
  return "text/plain";
};
