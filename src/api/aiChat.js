import { MEMBER_API_BASE, MEMBER_AUTHORIZATION } from "../config";

const API_ROOT = (MEMBER_API_BASE || "").replace(/\/+$/, "");

const buildUrl = (path) => {
  if (!path) return API_ROOT || "";
  if (path.startsWith("http")) return path;
  if (!API_ROOT) return path.startsWith("/") ? path : `/${path}`;
  return path.startsWith("/") ? `${API_ROOT}${path}` : `${API_ROOT}/${path}`;
};

const extractApiError = (data) => {
  const detail = data?.detail ?? data?.message ?? data?.errMsg ?? data;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => item?.msg || JSON.stringify(item)).join(" ; ");
  }
  if (detail && typeof detail === "object") return JSON.stringify(detail);
  return "请求失败";
};

const normalizePayload = (payload) => {
  if (!payload || typeof payload !== "object") return {};
  if (payload.err_no !== undefined || payload.message !== undefined) {
    return payload;
  }
  if (payload.data && typeof payload.data === "object") {
    return normalizePayload(payload.data);
  }
  return payload;
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

const delayWithSignal = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason || new DOMException("Aborted", "AbortError"));
      return;
    }
    const timerId = window.setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timerId);
      cleanup();
      reject(signal.reason || new DOMException("Aborted", "AbortError"));
    };
    const cleanup = () => {
      if (signal) signal.removeEventListener("abort", onAbort);
    };
    if (signal) signal.addEventListener("abort", onAbort, { once: true });
  });

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
    abort(parentSignal?.reason || new DOMException("aiChat aborted", "AbortError"));
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
  };
};

const callWithLocalTimeout = async (candidate, requestUrl, requestInit, parentSignal) => {
  const scope = createScopedSignal(parentSignal);
  let timeoutId = 0;
  try {
    const targetUrl = candidate?.requestUrl || requestUrl;
    const requestPromise = Promise.resolve(candidate.caller(targetUrl, { ...requestInit, signal: scope.signal }));
    if (!candidate.timeoutMs) return await requestPromise;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = window.setTimeout(() => {
        scope.abort(new DOMException("aiChat local timeout", "AbortError"));
        reject(createApiError("aiChat local timeout", { code: "LOCAL_TIMEOUT", source: candidate.source }));
      }, candidate.timeoutMs);
    });
    return await Promise.race([requestPromise, timeoutPromise]);
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
    scope.cleanup();
  }
};

const buildRequestCandidates = (apiFetch, path, options = {}) => {
  const compatApiFetch = resolveLegacyCompatibleFetch(apiFetch);
  const requestPath = path.startsWith("/") ? path : `/${path}`;
  const requestUrl = buildUrl(path);
  const microAppFetch = resolveMicroAppFetch();
  const candidates = [];
  const apiFetchCandidate =
    typeof compatApiFetch === "function" && compatApiFetch !== microAppFetch
      ? {
          source: "apiFetch(member-api-fallback)",
          requestUrl: requestPath,
          timeoutMs: 2500,
          caller: (url, init) => compatApiFetch(url, { ...init, skipAuth: true }),
        }
      : null;
  const microAppCandidate =
    typeof microAppFetch === "function"
      ? {
          source: "microApp.fetch(member-api)",
          requestUrl: requestPath,
          timeoutMs: 2500,
          caller: (url, init) => microAppFetch(url, init),
        }
      : null;
  if (options.preferApiFetchFirst) {
    if (apiFetchCandidate) candidates.push(apiFetchCandidate);
    if (microAppCandidate) candidates.push(microAppCandidate);
    candidates.push({
      source: "window.fetch(member-api)",
      requestUrl,
      timeoutMs: 0,
      caller: (url, init) => fetch(url, init),
    });
  } else {
    if (microAppCandidate) candidates.push(microAppCandidate);
    candidates.push({
      source: "window.fetch(member-api)",
      requestUrl,
      timeoutMs: 0,
      caller: (url, init) => fetch(url, init),
    });
    if (apiFetchCandidate) candidates.push(apiFetchCandidate);
  }
  return { requestUrl, candidates };
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

export const resolveMemberAuthorizationInfo = (options = {}) => resolveMemberAuthorization(options);

export const AI_CHAT_ANCHOR_MODULE_ENUM = 3;
export const AI_CHAT_ANCHOR_OPERATE_ENUM_1 = 1; // 打开新对话
export const AI_CHAT_ANCHOR_OPERATE_ENUM_2 = 2; // 切换模型
export const AI_CHAT_ANCHOR_OPERATE_ENUM_3 = 3; // 切换对话模式
export const AI_CHAT_ANCHOR_OPERATE_ENUM_4 = 4; // 打开页面
export const AI_CHAT_ANCHOR_OPERATE_ENUM_5 = 5; // 刷新页面

export const AI_CHAT_PART_ENUM_6 = 6; // 视频画质增强
export const AI_CHAT_PART_ENUM_203 = 203; // 图片生成
export const AI_CHAT_PART_ENUM_204 = 204; // 视频生成
export const AI_CHAT_PART_ENUM_207 = 207; // 特征提取
export const AI_CHAT_PART_ENUM_209 = 209; // 三合一换图
export const AI_CHAT_PART_ENUM_210 = 210; // 批量动图
export const AI_CHAT_PART_ENUM_211 = 211; // 批量花字

const LOGIN_REQUIRED_MESSAGE_PATTERN = /请登录后[再在]操作/;

export const isLoginRequiredError = (error) => {
  const message = String(error?.message || error?.data?.message || "").toLowerCase();
  return Number(error?.errNo) === 2 || LOGIN_REQUIRED_MESSAGE_PATTERN.test(message);
};

const isLikelyTransportError = (error) => {
  if (!error || typeof error !== "object") return true;
  if (error?.status !== undefined || error?.errNo !== undefined) return false;
  const message = String(error?.message || "").trim().toLowerCase();
  if (!message) return true;
  return (
    message === "error" ||
    message.includes("network error") ||
    message.includes("failed to fetch") ||
    message.includes("err_network") ||
    message.includes("typeerror")
  );
};

const formatTransportErrorDetail = (error) => {
  if (!error || typeof error !== "object") return stringifyUnknown(error) || "unknown";
  const parts = [];
  if (error?.name) parts.push(`name=${error.name}`);
  if (error?.code) parts.push(`code=${error.code}`);
  if (error?.message) parts.push(`message=${error.message}`);
  if (error?.status !== undefined) parts.push(`status=${error.status}`);
  if (error?.response?.status !== undefined) parts.push(`resp_status=${error.response.status}`);
  if (error?.config?.url) parts.push(`url=${error.config.url}`);
  if (error?.request?.responseURL) parts.push(`response_url=${error.request.responseURL}`);
  return parts.join(" | ") || "unknown";
};

const postJson = async (apiFetch, path, payload = {}, options = {}) => {
  const auth = resolveMemberAuthorization(options);
  const { requestUrl, candidates } = buildRequestCandidates(apiFetch, path, options);
  console.info("[aiChatApi] request:start", {
    path,
    url: requestUrl,
    candidates: candidates.map((item) => item.source),
    payload: payload || {},
    authorization_source: auth.source || "none",
  });
  emitDebug(options, {
    type: "start",
    path,
    url: requestUrl,
    candidates: candidates.map((item) => item.source),
    payload: payload || {},
    authorizationSource: auth.source || "none",
  });
  const baseRequestInit = {
    method: "POST",
    body: JSON.stringify(payload || {}),
    signal: options.signal,
  };
  let resp = null;
  let source = candidates[candidates.length - 1].source;
  let lastError = null;

  for (const candidate of candidates) {
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
      console.warn("[aiChatApi] request:fallback", {
        path,
        source: candidate.source,
        message: error instanceof Error ? error.message : String(error),
      });
      emitDebug(options, {
        type: "fallback",
        path,
        source: candidate.source,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (!resp) {
    throw createApiError(lastError?.message || "AI Chat 请求失败", {
      source,
      path,
      data: lastError,
    });
  }

  const isFetchResponse = resp && typeof resp === "object" && typeof resp.json === "function";
  const rawData = isFetchResponse ? await resp.json().catch(() => ({})) : resp || {};
  const data = normalizePayload(rawData);

  if (isFetchResponse && !resp.ok) {
    console.error("[aiChatApi] request:error", { path, source, status: resp.status, data });
    throw createApiError(extractApiError(data), {
      source,
      path,
      status: resp.status,
      data,
      errNo: data?.err_no,
    });
  }
  if (data?.err_no !== undefined && Number(data.err_no) !== 0) {
    console.error("[aiChatApi] request:error", { path, source, status: resp?.status, err_no: data?.err_no, data });
    throw createApiError(extractApiError(data), {
      source,
      path,
      status: resp?.status,
      data,
      errNo: data?.err_no,
    });
  }

  console.info("[aiChatApi] request:success", { path, source, data });
  emitDebug(options, {
    type: "success",
    path,
    source,
    response: data,
  });
  return data;
};

export async function viewAIChatModelParams(apiFetch, payload = {}, options = {}) {
  const rawModelId = payload?.ai_chat_model_id;
  const numericModelId = Number(rawModelId);
  const normalizedPayload = {
    ...payload,
    ai_chat_model_id: Number.isFinite(numericModelId) ? numericModelId : rawModelId,
  };
  return postJson(apiFetch, "/ai/viewAIChatModelParams", normalizedPayload, {
    ...options,
    preferApiFetchFirst: true,
  });
}

export async function viewAIChatModels(apiFetch, payload = {}, options = {}) {
  return postJson(apiFetch, "/ai/viewAIChatModels", payload, options);
}

export async function aiChatAnchor(apiFetch, payload = {}, options = {}) {
  const normalizedPayload = {
    ...payload,
    module_enum: AI_CHAT_ANCHOR_MODULE_ENUM,
  };
  return postJson(apiFetch, "/ai/aiChatAnchor", normalizedPayload, options);
}

export async function submitAIChatImageTask(apiFetch, payload = {}, options = {}) {
  const submitResp = await apiFetch("/api/ai_chat_image_via_curl", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
    signal: options.signal,
  });
  const submitData = await submitResp.json().catch(() => ({}));
  if (!submitResp.ok) {
    throw createApiError(extractApiError(submitData), {
      path: "/api/ai_chat_image_via_curl",
      status: submitResp.status,
      data: submitData,
    });
  }

  const taskId = String(submitData?.task_id || "").trim();
  if (!taskId) {
    throw createApiError("aiChat 任务提交失败：未返回 task_id", {
      path: "/api/ai_chat_image_via_curl",
      data: submitData,
    });
  }

  emitDebug(options, {
    type: "task_submitted",
    path: "/api/ai_chat_image_via_curl",
    response: submitData,
  });

  const pollIntervalMs = Math.max(400, Number(options.pollIntervalMs || 1200));
  const timeoutMs = Math.max(pollIntervalMs, Number(options.timeoutMs || 300000));
  const startedAt = Date.now();
  const pollPath = `/api/ai_chat_image_via_curl/${encodeURIComponent(taskId)}`;

  while (true) {
    if (options.signal?.aborted) {
      throw options.signal.reason || new DOMException("Aborted", "AbortError");
    }
    if (Date.now() - startedAt > timeoutMs) {
      throw createApiError("aiChat 任务轮询超时", {
        path: pollPath,
        taskId,
        code: "TASK_POLL_TIMEOUT",
      });
    }

    const statusResp = await apiFetch(pollPath, {
      method: "GET",
      signal: options.signal,
    });
    const statusData = await statusResp.json().catch(() => ({}));
    if (!statusResp.ok) {
      throw createApiError(extractApiError(statusData), {
        path: pollPath,
        taskId,
        status: statusResp.status,
        data: statusData,
      });
    }

    emitDebug(options, {
      type: "task_status",
      path: pollPath,
      response: statusData,
    });

    const status = String(statusData?.status || "").trim().toUpperCase();
    if (status === "SUCCESS") {
      const result = statusData?.result && typeof statusData.result === "object" ? statusData.result : {};
      return {
        ...result,
        task_id: taskId,
        task_status: status,
        task_meta: statusData,
      };
    }

    if (status === "FAILED" || status === "TIMEOUT") {
      const result = statusData?.result && typeof statusData.result === "object" ? statusData.result : {};
      const errorMessage =
        String(result?.done_error || "").trim() ||
        String(statusData?.error || "").trim() ||
        `aiChat 任务${status === "TIMEOUT" ? "超时" : "失败"}`;
      throw createApiError(errorMessage, {
        path: pollPath,
        taskId,
        status,
        data: statusData,
        result,
      });
    }

    await delayWithSignal(pollIntervalMs, options.signal);
  }
}

const appendQuotedFormValue = (formData, key, value) => {
  if (value === undefined || value === null) return;
  const text = String(value).trim();
  if (!text) return;
  if ((text.startsWith("\"") && text.endsWith("\"")) || (text.startsWith("'") && text.endsWith("'"))) {
    formData.append(key, text);
    return;
  }
  formData.append(key, `"${text}"`);
};

const toQuotedFormValue = (value) => {
  if (value === undefined || value === null) return "";
  const text = String(value).trim();
  if (!text) return "";
  if ((text.startsWith("\"") && text.endsWith("\"")) || (text.startsWith("'") && text.endsWith("'"))) return text;
  return `"${text}"`;
};

const stringifyUnknown = (value) => {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message || value.name || "Error";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value || "");
  }
};

const extractAIChatMeta = (payload) => {
  if (!payload || typeof payload !== "object") return {};
  const queue = [payload];
  const visited = new Set();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== "object" || visited.has(current)) continue;
    visited.add(current);
    const sessionId =
      current.ai_chat_session_id ||
      current.aiChatSessionId ||
      current.session_id ||
      current.sessionId ||
      "";
    const historyId =
      current.history_ai_chat_record_id ||
      current.historyAiChatRecordId ||
      current.aiChatRecordId ||
      current.ai_chat_record_id ||
      current.record_id ||
      current.recordId ||
      "";
    if (sessionId || historyId) {
      return {
        aiChatSessionId: String(sessionId || ""),
        historyAiChatRecordId: String(historyId || ""),
      };
    }
    for (const value of Object.values(current)) {
      if (value && typeof value === "object") queue.push(value);
    }
  }
  return {};
};

export async function aiChatStream(apiFetch, payload = {}, options = {}) {
  const auth = resolveMemberAuthorization(options);
  const useBackendCurlProxy = Boolean(options?.useBackendCurlProxy);
  const memberRequest = buildRequestCandidates(apiFetch, "/ai/aiChat");
  const requestUrl = useBackendCurlProxy ? "/api/ai_chat_stream_via_curl" : memberRequest.requestUrl;
  const candidates = useBackendCurlProxy
    ? [
        {
          source: "apiFetch(api-server-curl-proxy)",
          timeoutMs: 0,
          caller: (_url, init) =>
            apiFetch("/api/ai_chat_stream_via_curl", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ...payload,
                authorization: auth.value || payload?.authorization || "",
              }),
              signal: init?.signal,
            }),
        },
      ]
    : memberRequest.candidates;
  const files = Array.isArray(payload.files) ? payload.files : payload.files ? [payload.files] : [];
  console.info("[aiChatStream] request:start", {
    path: "/ai/aiChat",
    url: requestUrl,
    candidates: candidates.map((item) => item.source),
    request_mode: "fetch",
    module_enum: payload?.module_enum,
    part_enum: payload?.part_enum,
    part_enum_form_value: toQuotedFormValue(payload?.part_enum),
    ai_chat_model_id: payload?.ai_chat_model_id,
    authorization_source: auth.source || "none",
  });
  emitDebug(options, {
    type: "start",
    path: "/ai/aiChat",
    url: requestUrl,
    candidates: candidates.map((item) => item.source),
    payload: {
      history_ai_chat_record_id: toQuotedFormValue(payload.history_ai_chat_record_id),
      module_enum: toQuotedFormValue(payload.module_enum),
      part_enum: toQuotedFormValue(payload.part_enum),
      ai_chat_session_id: toQuotedFormValue(payload.ai_chat_session_id),
      ai_chat_model_id: toQuotedFormValue(payload.ai_chat_model_id),
      message: toQuotedFormValue(payload.message),
      ai_image_param_task_type_id: toQuotedFormValue(payload.ai_image_param_task_type_id),
      ai_image_param_size_id: toQuotedFormValue(payload.ai_image_param_size_id),
      ai_image_param_ratio_id: toQuotedFormValue(payload.ai_image_param_ratio_id),
      ai_video_param_ratio_id: toQuotedFormValue(payload.ai_video_param_ratio_id),
      ai_video_param_resolution_id: toQuotedFormValue(payload.ai_video_param_resolution_id),
      ai_video_param_duration_id: toQuotedFormValue(payload.ai_video_param_duration_id),
      template_enum: toQuotedFormValue(payload.template_enum),
      async: toQuotedFormValue(payload.async),
      files_count: files.length,
    },
    authorizationSource: auth.source || "none",
  });
  const formData = new FormData();
  appendQuotedFormValue(formData, "history_ai_chat_record_id", payload.history_ai_chat_record_id);
  appendQuotedFormValue(formData, "module_enum", payload.module_enum);
  appendQuotedFormValue(formData, "part_enum", payload.part_enum);
  appendQuotedFormValue(formData, "ai_chat_session_id", payload.ai_chat_session_id);
  appendQuotedFormValue(formData, "ai_chat_model_id", payload.ai_chat_model_id);
  appendQuotedFormValue(formData, "message", payload.message);
  appendQuotedFormValue(formData, "ai_image_param_task_type_id", payload.ai_image_param_task_type_id);
  appendQuotedFormValue(formData, "ai_image_param_size_id", payload.ai_image_param_size_id);
  appendQuotedFormValue(formData, "ai_image_param_ratio_id", payload.ai_image_param_ratio_id);
  appendQuotedFormValue(formData, "ai_video_param_ratio_id", payload.ai_video_param_ratio_id);
  appendQuotedFormValue(formData, "ai_video_param_resolution_id", payload.ai_video_param_resolution_id);
  appendQuotedFormValue(formData, "ai_video_param_duration_id", payload.ai_video_param_duration_id);
  appendQuotedFormValue(formData, "template_enum", payload.template_enum);
  appendQuotedFormValue(formData, "async", payload.async);

  files.forEach((file) => {
    if (file) formData.append("files", file);
  });
  const hasFiles = files.some(Boolean);
  const bodyMode = hasFiles ? "multipart(with-files)" : "multipart";

  const baseRequestInit = {
    method: "POST",
    body: formData,
    signal: options.signal,
  };
  let lastError = null;

  for (const candidate of candidates) {
    const source = candidate.source;
    try {
      const requestInit = {
        ...baseRequestInit,
        ...(auth.value ? { headers: { authorization: auth.value } } : {}),
      };
      console.info("[aiChatStream] request:payload", {
        source,
        request_mode: "fetch",
        body_mode: bodyMode,
        has_files: hasFiles,
      });
      const resp = await callWithLocalTimeout(candidate, requestUrl, requestInit, options.signal);

      const isFetchResponse = resp && typeof resp === "object" && typeof resp.json === "function";
      if (!isFetchResponse) {
        const data = normalizePayload(resp || {});
        if (data?.err_no !== undefined && Number(data.err_no) !== 0) {
          throw createApiError(extractApiError(data), {
            source,
            path: "/ai/aiChat",
            status: data?.status,
            data,
            errNo: data?.err_no,
          });
        }
        const text = String(data?.message || data?.data?.message || data?.content || "");
        const meta = extractAIChatMeta(data);
        if (typeof options.onMeta === "function" && (meta.aiChatSessionId || meta.historyAiChatRecordId)) {
          options.onMeta(meta);
        }
        if (text && typeof options.onChunk === "function") options.onChunk(text);
        console.info("[aiChatStream] request:success", {
          source,
          mode: "non_fetch_response",
          request_mode: "fetch",
          part_enum: payload?.part_enum,
          ai_chat_model_id: payload?.ai_chat_model_id,
        });
        emitDebug(options, {
          type: "success",
          path: "/ai/aiChat",
          source,
          mode: "non_fetch_response",
          response: data,
        });
        return { text, meta, data };
      }

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw createApiError(extractApiError(data), {
          source,
          path: "/ai/aiChat",
          status: resp?.status,
          data,
          errNo: data?.err_no,
        });
      }

      const contentType = String(resp.headers?.get?.("content-type") || "").toLowerCase();
      if (contentType.includes("application/json")) {
        const data = await resp.json().catch(() => ({}));
        if (data?.err_no !== undefined && Number(data.err_no) !== 0) {
          throw createApiError(extractApiError(data), {
            source,
            path: "/ai/aiChat",
            status: resp?.status,
            data,
            errNo: data?.err_no,
          });
        }
        const text = String(
          data?.message ||
            data?.data?.message ||
            data?.text ||
            data?.content ||
            data?.data?.text ||
            data?.data?.content ||
            "",
        );
        const meta = extractAIChatMeta(data);
        if (typeof options.onMeta === "function" && (meta.aiChatSessionId || meta.historyAiChatRecordId)) {
          options.onMeta(meta);
        }
        if (text && typeof options.onChunk === "function") options.onChunk(text);
        console.info("[aiChatStream] request:success", {
          source,
          mode: "json",
          request_mode: "fetch",
          part_enum: payload?.part_enum,
          ai_chat_model_id: payload?.ai_chat_model_id,
        });
        emitDebug(options, {
          type: "success",
          path: "/ai/aiChat",
          source,
          mode: "json",
          response: data,
        });
        return { text, meta, data };
      }

      const reader = resp.body?.getReader?.();
      if (!reader) {
        const data = await resp.json().catch(() => ({}));
        const text = String(data?.message || data?.data?.message || "");
        const meta = extractAIChatMeta(data);
        if (typeof options.onMeta === "function" && (meta.aiChatSessionId || meta.historyAiChatRecordId)) {
          options.onMeta(meta);
        }
        if (text && typeof options.onChunk === "function") options.onChunk(text);
        console.info("[aiChatStream] request:success", {
          source,
          mode: "reader_fallback_json",
          request_mode: "fetch",
          part_enum: payload?.part_enum,
          ai_chat_model_id: payload?.ai_chat_model_id,
        });
        emitDebug(options, {
          type: "success",
          path: "/ai/aiChat",
          source,
          mode: "reader_fallback_json",
          response: data,
        });
        return { text, meta, data };
      }

      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let content = "";
      let sawSSE = false;
      let metaState = {};
      const eventRecords = [];

      const emitMeta = (meta) => {
        const next = {
          aiChatSessionId: meta?.aiChatSessionId || metaState.aiChatSessionId || "",
          historyAiChatRecordId: meta?.historyAiChatRecordId || metaState.historyAiChatRecordId || "",
        };
        metaState = next;
        if (typeof options.onMeta === "function" && (next.aiChatSessionId || next.historyAiChatRecordId)) {
          options.onMeta(next);
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (!chunk) continue;
        buffer += chunk;
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = String(line || "").trim();
          if (!trimmed) continue;
          if (trimmed.startsWith("event:") || trimmed.startsWith("id:")) {
            sawSSE = true;
            continue;
          }
          if (trimmed.startsWith("data:")) {
            sawSSE = true;
            const payloadText = trimmed.slice(5).trim();
            if (!payloadText || payloadText === "[DONE]") continue;
            let eventPayload = payloadText;
            try {
              eventPayload = JSON.parse(payloadText);
            } catch {
              // keep raw string
            }
            if (typeof options.onEvent === "function") options.onEvent(eventPayload);
            eventRecords.push(eventPayload);
            const meta = extractAIChatMeta(eventPayload);
            if (meta.aiChatSessionId || meta.historyAiChatRecordId) emitMeta(meta);

            const delta =
              typeof eventPayload === "string"
                ? eventPayload
                : eventPayload?.delta ??
                  (Array.isArray(eventPayload?.content)
                    ? eventPayload.content
                        .map((item) => item?.text ?? item?.content ?? item?.message ?? "")
                        .filter(Boolean)
                        .join("")
                    : undefined) ??
                  eventPayload?.content ??
                  eventPayload?.text ??
                  eventPayload?.message ??
                  eventPayload?.data?.delta ??
                  (Array.isArray(eventPayload?.data?.content)
                    ? eventPayload.data.content
                        .map((item) => item?.text ?? item?.content ?? item?.message ?? "")
                        .filter(Boolean)
                        .join("")
                    : undefined) ??
                  eventPayload?.data?.content ??
                  "";
            if (typeof delta === "string" && delta && typeof options.onChunk === "function") {
              const text = String(delta);
              content += text;
              options.onChunk(text);
            }
            continue;
          }
          if (!sawSSE) {
            content += trimmed;
            if (typeof options.onChunk === "function") options.onChunk(trimmed);
          }
        }
      }

      const tail = decoder.decode();
      if (tail) {
        content += tail;
        if (typeof options.onChunk === "function") options.onChunk(tail);
      }

      if (!content && eventRecords.length === 0) {
        throw createApiError("AI Chat 返回空流响应", {
          source,
          path: "/ai/aiChat",
          status: resp?.status,
          data: {
            content_type: contentType || "",
            empty_stream: true,
          },
        });
      }

      console.info("[aiChatStream] request:success", {
        source,
        mode: "stream",
        request_mode: "fetch",
        part_enum: payload?.part_enum,
        ai_chat_model_id: payload?.ai_chat_model_id,
        has_events: eventRecords.length > 0,
        text_length: content.length,
      });
      emitDebug(options, {
        type: "success",
        path: "/ai/aiChat",
        source,
        mode: "stream",
        response: {
          text_length: content.length,
          event_count: eventRecords.length,
          last_events: eventRecords.slice(-3),
        },
      });
      return { text: content, meta: metaState, events: eventRecords };
    } catch (error) {
      if (isLoginRequiredError(error)) {
        console.error("[aiChatStream] request:error", {
          source,
          path: "/ai/aiChat",
          part_enum: payload?.part_enum,
          ai_chat_model_id: payload?.ai_chat_model_id,
          status: error?.status,
          err_no: error?.errNo,
          message: error?.message,
          data: error?.data,
        });
        throw error;
      }
      if (options.signal?.aborted) throw error;
      lastError = error;
      console.warn("[aiChatStream] request:fallback", {
        from: source,
        to: "next-candidate",
        part_enum: payload?.part_enum,
        ai_chat_model_id: payload?.ai_chat_model_id,
        error: formatTransportErrorDetail(error),
      });
      emitDebug(options, {
        type: "fallback",
        path: "/ai/aiChat",
        source,
        message: formatTransportErrorDetail(error),
      });
    }
  }

  const finalError =
    lastError && (lastError?.message || lastError?.status !== undefined || lastError?.errNo !== undefined)
      ? lastError
      : createApiError(`AI Chat 流式请求异常: ${stringifyUnknown(lastError) || "unknown"}`, {
          path: "/ai/aiChat",
          data: lastError,
        });
  console.error("[aiChatStream] request:error", {
    path: "/ai/aiChat",
    part_enum: payload?.part_enum,
    ai_chat_model_id: payload?.ai_chat_model_id,
    status: finalError?.status,
    err_no: finalError?.errNo,
    message: finalError?.message,
    data: finalError?.data,
  });
  emitDebug(options, {
    type: "error",
    path: "/ai/aiChat",
    message: finalError?.message || "请求失败",
    response: finalError?.data,
  });
  if (isLikelyTransportError(finalError)) {
    throw createApiError(
      `AI Chat 网络请求失败: ${formatTransportErrorDetail(finalError)} | request_mode=fetch | body_mode=${bodyMode}`,
      {
        path: "/ai/aiChat",
        status: finalError?.status,
        errNo: finalError?.errNo,
        data: finalError,
      },
    );
  }
  throw finalError;
}
