import { MEMBER_AUTHORIZATION, TOKEN_KEY } from "../../config";

const readStorage = (storage, key) => {
  try {
    return storage?.getItem?.(key) || "";
  } catch {
    return "";
  }
};

const readMicroAppData = () => {
  try {
    return window.microApp?.getData?.() || {};
  } catch {
    return {};
  }
};

export const getAuthToken = (key = TOKEN_KEY) => readStorage(window.localStorage, key);

export const setAuthToken = (token, key = TOKEN_KEY) => {
  try {
    if (token) window.localStorage?.setItem?.(key, token);
    else window.localStorage?.removeItem?.(key);
  } catch {
    // Storage can be unavailable in private mode or tests.
  }
};

export const clearAuthToken = (key = TOKEN_KEY) => {
  setAuthToken("", key);
};

export const resolveMemberAuthorization = (options = {}) => {
  const direct = String(options?.authorization || "").trim();
  if (direct) return { value: direct, source: "options.authorization" };

  const globalToken = String(window.__AI_CHAT_AUTHORIZATION__ || "").trim();
  if (globalToken) return { value: globalToken, source: "window.__AI_CHAT_AUTHORIZATION__" };

  const envToken = String(MEMBER_AUTHORIZATION || "").trim();
  if (envToken) return { value: envToken, source: "VITE_MEMBER_AUTHORIZATION" };

  const microData = readMicroAppData();
  const microCandidates = [
    ["microApp.authorization", microData?.authorization],
    ["microApp.Authorization", microData?.Authorization],
    ["microApp.token", microData?.token],
    ["microApp.access_token", microData?.access_token],
    ["microApp.authToken", microData?.authToken],
  ];
  for (const [source, token] of microCandidates) {
    const text = String(token || "").trim();
    if (text) return { value: text, source };
  }

  const storageCandidates = [
    ["localStorage.ai_chat_authorization", readStorage(window.localStorage, "ai_chat_authorization")],
    ["localStorage.member_authorization", readStorage(window.localStorage, "member_authorization")],
    ["localStorage.authorization", readStorage(window.localStorage, "authorization")],
    ["localStorage.access_token", readStorage(window.localStorage, "access_token")],
    ["sessionStorage.ai_chat_authorization", readStorage(window.sessionStorage, "ai_chat_authorization")],
    ["sessionStorage.member_authorization", readStorage(window.sessionStorage, "member_authorization")],
    ["sessionStorage.authorization", readStorage(window.sessionStorage, "authorization")],
    ["sessionStorage.access_token", readStorage(window.sessionStorage, "access_token")],
  ];
  for (const [source, token] of storageCandidates) {
    const text = String(token || "").trim();
    if (text) return { value: text, source };
  }

  return { value: "", source: "" };
};
