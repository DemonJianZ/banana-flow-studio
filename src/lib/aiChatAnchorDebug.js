export const AI_CHAT_ANCHOR_DEBUG_STORAGE_KEY = "bananaflow_ai_chat_anchor_debug_v1";
export const AI_CHAT_ANCHOR_DEBUG_EVENT = "bananaflow:ai-chat-anchor-debug";
export const AGENT_DEV_MODE_STORAGE_KEY = "agent_dev_mode";
export const AGENT_DEV_MODE_EVENT = "bananaflow:agent-dev-mode";

const DEFAULT_STATE = {
  status: "idle",
  message: "",
  detail: "",
  updatedAt: 0,
};

const normalizeState = (value) => {
  if (!value || typeof value !== "object") return { ...DEFAULT_STATE };
  return {
    status: String(value.status || DEFAULT_STATE.status),
    message: String(value.message || DEFAULT_STATE.message),
    detail: String(value.detail || DEFAULT_STATE.detail),
    updatedAt: Number(value.updatedAt || DEFAULT_STATE.updatedAt) || 0,
  };
};

export const readAiChatAnchorDebugState = () => {
  try {
    const raw = window.localStorage.getItem(AI_CHAT_ANCHOR_DEBUG_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    return normalizeState(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_STATE };
  }
};

export const writeAiChatAnchorDebugState = (value) => {
  try {
    const next = normalizeState(value);
    window.localStorage.setItem(AI_CHAT_ANCHOR_DEBUG_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(AI_CHAT_ANCHOR_DEBUG_EVENT, { detail: next }));
    return next;
  } catch {
    return normalizeState(value);
  }
};

export const readAgentDevMode = () => {
  try {
    return window.localStorage.getItem(AGENT_DEV_MODE_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
};

export const writeAgentDevMode = (value) => {
  const next = !!value;
  try {
    window.localStorage.setItem(AGENT_DEV_MODE_STORAGE_KEY, next ? "true" : "false");
    window.dispatchEvent(new CustomEvent(AGENT_DEV_MODE_EVENT, { detail: next }));
  } catch {
    // ignore localStorage write failure
  }
  return next;
};
