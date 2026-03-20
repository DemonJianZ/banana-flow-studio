import { MEMBER_API_BASE, MEMBER_AUTHORIZATION } from "../config";

const API_ROOT = (MEMBER_API_BASE || "").replace(/\/+$/, "");

const buildUrl = (path) => {
  if (!path) return API_ROOT || "";
  if (path.startsWith("http")) return path;
  if (!API_ROOT) return path.startsWith("/") ? path : `/${path}`;
  return path.startsWith("/") ? `${API_ROOT}${path}` : `${API_ROOT}/${path}`;
};

const extractApiError = (data) => {
  const detail = data?.detail ?? data?.message ?? data;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => item?.msg || JSON.stringify(item)).join(" ; ");
  }
  if (detail && typeof detail === "object") return JSON.stringify(detail);
  return "请求失败";
};

const createApiError = (message, extras = {}) => {
  const error = new Error(message || "请求失败");
  Object.assign(error, extras);
  return error;
};

const shouldBypassFetchFallback = (e) => {
  const ctorName = String(e?.constructor?.name || "").trim();
  return ctorName === "HttpUserNotExistError" || ctorName === "HttpUserTokenExpiredError";
};

const emitDebug = (options, event) => {
  if (typeof options?.onDebug === "function") options.onDebug(event);
};

const normalizeMemberInfoPayload = (payload) => {
  if (!payload || typeof payload !== "object") return {};
  if (payload.err_no !== undefined || payload.message !== undefined) {
    return payload;
  }
  if (payload.data && typeof payload.data === "object") {
    return normalizeMemberInfoPayload(payload.data);
  }
  return payload;
};

const resolveMicroAppFetch = () => {
  try {
    return window.microApp?.getData?.()?.fetch;
  } catch {
    return undefined;
  }
};

const resolveLegacyCompatibleFetch = (apiFetch) => {
  try {
    return window.microApp?.getData?.()?.fetch || apiFetch; // 兼容老版本
  } catch {
    return apiFetch;
  }
};

const createScopedSignal = (parentSignal) => {
  const controller = new AbortController();

  const abort = (reason) => {
    if (!controller.signal.aborted) controller.abort(reason);
  };

  const handleParentAbort = () => {
    abort(parentSignal?.reason || new DOMException("memberInfo aborted", "AbortError"));
  };

  if (parentSignal) {
    if (parentSignal.aborted) {
      handleParentAbort();
    } else {
      parentSignal.addEventListener("abort", handleParentAbort, { once: true });
    }
  }

  return {
    signal: controller.signal,
    abort,
    cleanup: () => {
      if (parentSignal) parentSignal.removeEventListener("abort", handleParentAbort);
    },
    wasParentAborted: () => !!parentSignal?.aborted,
  };
};

const callWithLocalTimeout = async (candidate, requestUrl, requestInit, parentSignal) => {
  const scope = createScopedSignal(parentSignal, 0);
  let timeoutId = 0;
  try {
    const targetUrl = candidate?.requestUrl || requestUrl;
    const requestPromise = Promise.resolve(candidate.caller(targetUrl, { ...requestInit, signal: scope.signal }));
    if (!candidate.timeoutMs) {
      return await requestPromise;
    }
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = window.setTimeout(() => {
        scope.abort(new DOMException("memberInfo local timeout", "AbortError"));
        reject(createApiError("memberInfo local timeout", { code: "LOCAL_TIMEOUT", source: candidate.source }));
      }, candidate.timeoutMs);
    });
    return await Promise.race([requestPromise, timeoutPromise]);
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
    scope.cleanup();
  }
};

const readStorage = (storage, key) => {
  try {
    return storage?.getItem?.(key) || "";
  } catch {
    return "";
  }
};

const resolveMemberAuthorization = (options = {}) => {
  const direct = String(options?.authorization || "").trim();
  if (direct) return { value: direct, source: "options.authorization" };

  const globalToken = String(window.__AI_CHAT_AUTHORIZATION__ || "").trim();
  if (globalToken) return { value: globalToken, source: "window.__AI_CHAT_AUTHORIZATION__" };

  const envToken = String(MEMBER_AUTHORIZATION || "").trim();
  if (envToken) return { value: envToken, source: "VITE_MEMBER_AUTHORIZATION" };

  const microData = (() => {
    try {
      return window.microApp?.getData?.() || {};
    } catch {
      return {};
    }
  })();
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

export async function viewMemberInfo(apiFetch, payload = {}, options = {}) {
  apiFetch = resolveLegacyCompatibleFetch(apiFetch); // 兼容老版本
  const injectedFetch = resolveMicroAppFetch();
  const auth = resolveMemberAuthorization(options);
  const requestPath = "/ai/viewMemberInfo";
  const requestUrl = buildUrl(requestPath);
  const requestCandidates = [];
  const windowFetchCandidate = {
    source: "window.fetch(member-api)",
    requestUrl,
    timeoutMs: 0,
    caller: (url, init) => fetch(url, init),
  };
  if (typeof injectedFetch === "function") {
    requestCandidates.push({
      source: "microApp.fetch(member-api)",
      requestUrl: requestPath,
      timeoutMs: 2500,
      caller: (url, init) => injectedFetch(url, init),
    });
  }
  requestCandidates.push(windowFetchCandidate);
  if (typeof apiFetch === "function" && apiFetch !== injectedFetch) {
    requestCandidates.push({
      source: "apiFetch(member-api-fallback)",
      requestUrl: requestPath,
      timeoutMs: 2500,
      caller: (url, init) => apiFetch(url, { ...init, skipAuth: true }),
    });
  }

  console.info("[memberInfo] request:start", {
    path: "/ai/viewMemberInfo",
    url: requestUrl,
    candidates: requestCandidates.map((item) => item.source),
    payload: payload || {},
    authorization_source: auth.source || "none",
  });
  emitDebug(options, {
    type: "start",
    path: "/ai/viewMemberInfo",
    url: requestUrl,
    candidates: requestCandidates.map((item) => item.source),
    payload: payload || {},
    authorizationSource: auth.source || "none",
  });
  const baseRequestInit = {
    method: "POST",
    body: JSON.stringify(payload || {}),
    signal: options.signal,
  };
  let resp = null;
  let source = requestCandidates[requestCandidates.length - 1].source;
  let lastError = null;

  for (let index = 0; index < requestCandidates.length; index += 1) {
    const candidate = requestCandidates[index];
    try {
      const headers = new Headers({ "Content-Type": "application/json" });
      if (auth.value) {
        headers.set("authorization", auth.value);
      }
      resp = await callWithLocalTimeout(
        candidate,
        requestUrl,
        { ...baseRequestInit, headers },
        options.signal,
      );
      source = candidate.source;
      break;
    } catch (error) {
      if (options.signal?.aborted) throw error;
      if (shouldBypassFetchFallback(error)) throw error;
      lastError = error;
      console.warn("[memberInfo] request:fallback", {
        source: candidate.source,
        message: error instanceof Error ? error.message : String(error),
      });
      emitDebug(options, {
        type: "fallback",
        source: candidate.source,
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
  }

  if (!resp) {
    throw createApiError(lastError?.message || "viewMemberInfo 请求失败", {
      source,
      data: lastError,
    });
  }

  const isFetchResponse = resp && typeof resp === "object" && typeof resp.json === "function";
  const rawData = isFetchResponse ? await resp.json().catch(() => ({})) : resp || {};
  const data = normalizeMemberInfoPayload(rawData);

  if (isFetchResponse && !resp.ok) {
    console.error("[memberInfo] request:error", {
      source,
      status: resp.status,
      data,
    });
    throw createApiError(extractApiError(data), {
      source,
      status: resp.status,
      data,
      errNo: data?.err_no,
      ssoUrl: data?.data?.sso_url || data?.sso_url || "",
    });
  }
  if (data?.err_no !== undefined && Number(data.err_no) !== 0) {
    console.error("[memberInfo] request:error", {
      source,
      err_no: data?.err_no,
      data,
    });
    throw createApiError(extractApiError(data), {
      source,
      status: resp?.status,
      data,
      errNo: data?.err_no,
      ssoUrl: data?.data?.sso_url || data?.sso_url || "",
    });
  }

  console.info("[memberInfo] request:success", {
    source,
    data,
  });
  emitDebug(options, {
    type: "success",
    source,
    response: data,
  });
  return data;
}
