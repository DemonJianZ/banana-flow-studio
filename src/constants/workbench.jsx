import React from "react";
import { extractProductKeyword } from "../api/agentCanvas";

// ==========================================
// Run Steps
// ==========================================
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

// ==========================================
// Script Brief Options
// ==========================================
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

// ==========================================
// Misc Constants
// ==========================================
export const AGENT_RESULT_CARD_WIDTH = 460;
export const EMPTY_LIST = Object.freeze([]);

// ==========================================
// Script Brief Utilities
// ==========================================
export const normalizeScriptBrief = (brief = {}) => ({
  product: String(brief?.product || "").trim(),
  audience: String(brief?.audience || "").trim(),
  priceBand: String(brief?.priceBand || "").trim(),
  conversionGoal: String(brief?.conversionGoal || "").trim(),
  primaryPlatform: String(brief?.primaryPlatform || "").trim(),
  secondaryPlatform: String(brief?.secondaryPlatform || "").trim(),
  selectedAngle: String(brief?.selectedAngle || "").trim(),
});

// ==========================================
// Artifact Selection Utilities
// ==========================================
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

// ==========================================
// Location / Scene Binding Utilities
// ==========================================
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

// ==========================================
// Storyboard Text Utilities
// ==========================================
export const stripStoryboardDisplayIds = (value) =>
  String(value || "")
    .replace(/[（(]\s*(?:[A-Za-z]{1,16}_\d{1,6}|[A-Z]\d{2,6}|char[_-]?\d{1,6}|scene[_-]?\d{1,6}|shot[_-]?\d{1,6}|loc[_-]?\d{1,6}|subj[_-]?\d{1,6}|entity[_-]?\d{1,6})\s*[)）]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

export const escapeRegExp = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const collectStoryboardMentionTerms = (storyboardPlan = {}) => {
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
      payload: {
        entityId,
        entityName: String(item?.name || "").trim(),
        entityType: "角色",
      },
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
      payload: {
        entityId,
        entityName: String(item?.name || "").trim(),
        entityType: "主体",
      },
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
  return Array.from(seen.values())
    .sort((a, b) => b.term.length - a.term.length);
};

export const renderStoryboardMentionText = (
  value,
  mentionTerms = [],
  onMentionSelect = null,
  onMentionHover = null,
  onMentionLeave = null,
  storyboardNode = null,
) => {
  const text = stripStoryboardDisplayIds(value);
  if (!text) return "";
  const termEntries = Array.from(
    new Map(
      (mentionTerms || [])
        .map((item) => {
          const term = stripStoryboardDisplayIds(item?.term || "");
          if (!term) return null;
          return {
            ...item,
            term,
            type: String(item?.type || "").trim() || "default",
          };
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
    if (!matched) {
      return <React.Fragment key={`storyboard-text-${index}`}>{part}</React.Fragment>;
    }
    const mentionType = mentionTypeByTerm.get(part) || "default";
    const mentionClassName =
      mentionType === "character"
        ? "bg-cyan-50 text-cyan-700 ring-cyan-200/80"
        : mentionType === "subject"
        ? "bg-violet-50 text-violet-700 ring-violet-200/80"
        : mentionType === "scene"
        ? "bg-amber-50 text-amber-700 ring-amber-200/80"
        : "bg-slate-100 text-slate-700 ring-slate-200/80";
    const mentionEntry = termEntries.find((item) => item.term === part) || null;
    return (
      <span
        key={`storyboard-mention-${index}`}
        className={`rounded-md px-1 py-0.5 font-medium ring-1 ${mentionClassName} ${mentionEntry && typeof onMentionSelect === "function" ? "cursor-pointer hover:brightness-95" : ""}`}
        role={mentionEntry && typeof onMentionSelect === "function" ? "button" : undefined}
        tabIndex={mentionEntry && typeof onMentionSelect === "function" ? 0 : undefined}
        onMouseDown={
          mentionEntry && typeof onMentionSelect === "function"
            ? (event) => {
                event.stopPropagation();
              }
            : undefined
        }
        onClick={
          mentionEntry && typeof onMentionSelect === "function"
            ? (event) => {
                event.stopPropagation();
                onMentionSelect(mentionEntry);
              }
            : undefined
        }
        onMouseEnter={
          mentionEntry && typeof onMentionHover === "function"
            ? (event) => {
                event.stopPropagation();
                onMentionHover(storyboardNode, mentionEntry, event);
              }
            : undefined
        }
        onMouseLeave={
          mentionEntry && typeof onMentionLeave === "function"
            ? (event) => {
                event.stopPropagation();
                onMentionLeave();
              }
            : undefined
        }
        onKeyDown={
          mentionEntry && typeof onMentionSelect === "function"
            ? (event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                event.stopPropagation();
                onMentionSelect(mentionEntry);
              }
            : undefined
        }
      >
        {mentionEntry?.hasBinding ? "@" : ""}{part}
      </span>
    );
  });
};

// ==========================================
// Script Platform / Brief Builders
// ==========================================
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

// ==========================================
// Agent Result Card Utilities
// ==========================================
export const getAgentResultCardWidth = () => AGENT_RESULT_CARD_WIDTH;

export const getAgentTurnStepLabel = (turn) => {
  const steps = turn?.intent === "DRAMA" ? DRAMA_RUN_STEPS : AGENT_RUN_STEPS;
  return steps[Math.min(turn?.stepIndex || 0, steps.length - 1)];
};
