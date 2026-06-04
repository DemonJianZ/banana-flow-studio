import { useCallback, useState } from "react";
import { readAiChatAnchorDebugState, writeAiChatAnchorDebugState } from "../lib/aiChatAnchorDebug";

const API_DEBUG_DETAIL_KEYS = new Set(["aiChatLang", "aiChatImage", "userAuths", "aiChatAnchor", "agentPlanner"]);

const API_DEBUG_STATUS_LABEL = {
  idle: "待执行",
  loading: "请求中",
  success: "成功",
  warning: "警告",
  error: "失败",
  timeout: "超时",
  login_required: "需登录",
};

const API_DEBUG_ITEMS = [
  { key: "memberInfo", label: "memberInfo" },
  { key: "userAuths", label: "userAuths" },
  { key: "modelParams", label: "modelParams(id=4)" },
  { key: "modelsLang", label: "models(part=1)" },
  { key: "modelsImage", label: "models(part=2)" },
  { key: "modelsVideo", label: "models(part=3)" },
  { key: "modelsVideoEnhance", label: "models(part=6)" },
  { key: "aiChatAnchor", label: "aiChatAnchor(module=3)" },
  { key: "aiChatLang", label: "aiChat(part=1 语言)" },
  { key: "aiChatImage", label: "aiChat(module=3 图片/视频)" },
  { key: "agentPlanner", label: "Agent Planner(LangGraph)" },
];

const DEFAULT_API_DEBUG_STATUS = {
  memberInfo: { status: "idle", message: "", detail: "", updatedAt: 0 },
  userAuths: { status: "idle", message: "", detail: "", updatedAt: 0 },
  modelParams: { status: "idle", message: "", detail: "", updatedAt: 0 },
  modelsLang: { status: "idle", message: "", detail: "", updatedAt: 0 },
  modelsImage: { status: "idle", message: "", detail: "", updatedAt: 0 },
  modelsVideo: { status: "idle", message: "", detail: "", updatedAt: 0 },
  modelsVideoEnhance: { status: "idle", message: "", detail: "", updatedAt: 0 },
  aiChatAnchor: { status: "idle", message: "", detail: "", updatedAt: 0 },
  aiChatLang: { status: "idle", message: "", detail: "", updatedAt: 0 },
  aiChatImage: { status: "idle", message: "", detail: "", updatedAt: 0 },
  agentPlanner: { status: "idle", message: "", detail: "", updatedAt: 0 },
};

function formatDebugTime(timestamp) {
  if (!timestamp) return "--";
  try {
    return new Date(timestamp).toLocaleTimeString("zh-CN", { hour12: false });
  } catch {
    return "--";
  }
}

function stringifyDebugValue(value) {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value || "");
  }
}

function buildApiDebugDetailText(event) {
  if (!event || typeof event !== "object") return "";
  const lines = [];
  if (event.url) lines.push(`url: ${event.url}`);
  if (event.path) lines.push(`path: ${event.path}`);
  if (event.source) lines.push(`source: ${event.source}`);
  if (Array.isArray(event.candidates) && event.candidates.length) lines.push(`candidates: ${event.candidates.join(" -> ")}`);
  if (event.authorizationSource) lines.push(`auth: ${event.authorizationSource}`);
  if (event.message) lines.push(`message: ${event.message}`);
  if (event.payload !== undefined) {
    lines.push("payload:");
    lines.push(stringifyDebugValue(event.payload));
  }
  if (event.response !== undefined) {
    lines.push("response:");
    lines.push(stringifyDebugValue(event.response));
  }
  return lines.join("\n").trim();
}

function getApiDebugStatusClass(status) {
  if (status === "success") return "text-emerald-700 border-emerald-200 bg-emerald-50";
  if (status === "loading") return "text-cyan-700 border-cyan-200 bg-cyan-50";
  if (status === "warning") return "text-amber-700 border-amber-200 bg-amber-50";
  if (status === "timeout" || status === "error" || status === "login_required") {
    return "text-rose-700 border-rose-200 bg-rose-50";
  }
  return "text-slate-600 border-slate-200 bg-white";
}

export function useWorkbenchApiDebug() {
  const [apiDebugOpen, setApiDebugOpen] = useState(true);
  const [apiDebugStatus, setApiDebugStatus] = useState(() => DEFAULT_API_DEBUG_STATUS);

  const updateApiDebugStatus = useCallback((key, next) => {
    if (key === "aiChatAnchor") {
      const current = readAiChatAnchorDebugState();
      writeAiChatAnchorDebugState({
        ...current,
        ...next,
        updatedAt: Date.now(),
      });
    }
    setApiDebugStatus((prev) => {
      const merged = {
        ...(prev[key] || { status: "idle", message: "", detail: "", updatedAt: 0 }),
        ...next,
        updatedAt: Date.now(),
      };
      return {
        ...prev,
        [key]: merged,
      };
    });
  }, []);

  const pushApiDebugDetail = useCallback((key, event) => {
    const nextDetail = buildApiDebugDetailText(event);
    if (!nextDetail) return;
    if (key === "aiChatAnchor") {
      const current = readAiChatAnchorDebugState();
      const detail =
        event?.type === "start" || !current.detail
          ? nextDetail
          : `${current.detail}\n\n[${event.type || "event"}]\n${nextDetail}`;
      writeAiChatAnchorDebugState({
        ...current,
        detail,
        updatedAt: Date.now(),
      });
    }
    setApiDebugStatus((prev) => {
      const current = prev[key] || { status: "idle", message: "", detail: "", updatedAt: 0 };
      const detail =
        event?.type === "start" || !current.detail
          ? nextDetail
          : `${current.detail}\n\n[${event.type || "event"}]\n${nextDetail}`;
      const merged = {
        ...current,
        detail,
        updatedAt: Date.now(),
      };
      return {
        ...prev,
        [key]: merged,
      };
    });
  }, []);

  return {
    apiDebugOpen,
    setApiDebugOpen,
    apiDebugStatus,
    apiDebugItems: API_DEBUG_ITEMS,
    apiDebugDetailKeys: API_DEBUG_DETAIL_KEYS,
    apiDebugStatusLabel: API_DEBUG_STATUS_LABEL,
    formatDebugTime,
    getApiDebugStatusClass,
    pushApiDebugDetail,
    updateApiDebugStatus,
  };
}
