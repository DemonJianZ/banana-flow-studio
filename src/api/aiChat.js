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

const resolveMicroAppFetch = () => {
  try {
    return window.microApp?.getData?.()?.fetch;
  } catch {
    return undefined;
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

  const globalToken = String(window.__AI_CHAT_AUTHORIZATION__ || "").trim();
  if (globalToken) return { value: globalToken, source: "window.__AI_CHAT_AUTHORIZATION__" };

  const envToken = String(MEMBER_AUTHORIZATION || "").trim();
  if (envToken) return { value: envToken, source: "VITE_MEMBER_AUTHORIZATION" };

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

const isHostedWebOrigin = () => {
  try {
    const host = String(window.location?.hostname || "").toLowerCase();
    return host.includes("dayukeji");
  } catch {
    return false;
  }
};

const isLoginRequiredError = (error) => {
  const message = String(error?.message || error?.data?.message || "").toLowerCase();
  return Number(error?.errNo) === 2 || message.includes("请登录后再操作");
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

const resolveCaller = (apiFetch) => {
  const microAppFetch = resolveMicroAppFetch();
  const apiFetchCaller =
    typeof apiFetch === "function"
      ? { source: "apiFetch", caller: (path, init) => apiFetch(path, init) }
      : null;
  const directCaller = { source: "window.fetch(member-api)", caller: (path, init) => fetch(buildUrl(path), init) };

  if (typeof microAppFetch === "function") {
    return { source: "microApp.fetch", caller: (path, init) => microAppFetch(path, init) };
  }
  if (apiFetchCaller) return apiFetchCaller;
  return directCaller;
};

const resolveStreamCaller = (apiFetch, forceSource = "") => {
  const microAppFetch = resolveMicroAppFetch();
  const apiFetchCaller =
    typeof apiFetch === "function"
      ? { source: "apiFetch", caller: (path, init) => apiFetch(path, init) }
      : null;
  const microCaller =
    typeof microAppFetch === "function"
      ? { source: "microApp.fetch", caller: (path, init) => microAppFetch(path, init) }
      : null;
  const microMemberCaller =
    typeof microAppFetch === "function"
      ? { source: "microApp.fetch(member-api)", caller: (path, init) => microAppFetch(buildUrl(path), init) }
      : null;
  const sameOriginCaller = { source: "window.fetch(same-origin)", caller: (path, init) => fetch(path, init) };
  const directCaller = { source: "window.fetch(member-api)", caller: (path, init) => fetch(buildUrl(path), init) };

  if (forceSource === "microApp.fetch") {
    return microCaller || sameOriginCaller || microMemberCaller || apiFetchCaller || directCaller;
  }
  if (forceSource === "microApp.fetch(member-api)") {
    return microMemberCaller || microCaller || sameOriginCaller || apiFetchCaller || directCaller;
  }
  if (forceSource === "window.fetch(same-origin)") {
    return sameOriginCaller || microCaller || apiFetchCaller || directCaller;
  }
  if (forceSource === "window.fetch(member-api)") {
    return directCaller || microCaller || sameOriginCaller || apiFetchCaller;
  }
  if (forceSource === "apiFetch") {
    return apiFetchCaller || microCaller || sameOriginCaller || microMemberCaller || directCaller;
  }

  // 宿主存在时，强制优先走宿主链路，避免降级到无鉴权分支导致 err_no=2
  if (microCaller) return microCaller;
  return sameOriginCaller || microMemberCaller || apiFetchCaller || directCaller;
};

const postJson = async (apiFetch, path, payload = {}, options = {}) => {
  const { source, caller } = resolveCaller(apiFetch);
  const auth = resolveMemberAuthorization(options);
  console.info("[aiChatApi] request:start", {
    path,
    source,
    payload: payload || {},
    authorization_source: auth.source || "none",
  });
  const headers = new Headers({ "Content-Type": "application/json" });
  if (auth.value) headers.set("authorization", auth.value);
  const resp = await caller(path, {
    method: "POST",
    headers,
    body: JSON.stringify(payload || {}),
    ...(source === "window.fetch(member-api)" ? {} : { credentials: "include" }),
    signal: options.signal,
  });

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
  return data;
};

export async function viewAIChatModelParams(apiFetch, payload = {}, options = {}) {
  return postJson(apiFetch, "/ai/viewAIChatModelParams", payload, options);
}

export async function viewAIChatModels(apiFetch, payload = {}, options = {}) {
  return postJson(apiFetch, "/ai/viewAIChatModels", payload, options);
}

const appendFormValue = (formData, key, value) => {
  if (value === undefined || value === null) return;
  if (typeof value === "string" && !value.trim()) return;
  formData.append(key, String(value));
};

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
  const initialForceSource =
    options.__forceStreamSource || (auth.value && !options.__triedSources?.length ? "window.fetch(member-api)" : "");
  const { source, caller } = resolveStreamCaller(apiFetch, initialForceSource);
  const triedSources = Array.isArray(options.__triedSources) ? options.__triedSources : [];
  const requestMode = options.__requestMode === "axios" ? "axios" : "fetch";
  const axiosWithCredentials = options.__axiosWithCredentials === true;
  const isMicroSource = source.startsWith("microApp.fetch");
  const requestHeaders = auth.value ? { authorization: auth.value } : undefined;
  console.info("[aiChatStream] request:start", {
    path: "/ai/aiChat",
    source,
    request_mode: requestMode,
    with_credentials: requestMode === "axios" ? axiosWithCredentials : isMicroSource ? "fetch(omit)" : "fetch(include)",
    module_enum: payload?.module_enum,
    part_enum: payload?.part_enum,
    part_enum_form_value: toQuotedFormValue(payload?.part_enum),
    ai_chat_model_id: payload?.ai_chat_model_id,
    authorization_source: auth.source || "none",
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
  appendQuotedFormValue(formData, "ai_video_param_ratio_id", payload.ai_video_param_ratio_id);
  appendQuotedFormValue(formData, "ai_video_param_resolution_id", payload.ai_video_param_resolution_id);
  appendQuotedFormValue(formData, "ai_video_param_duration_id", payload.ai_video_param_duration_id);

  const files = Array.isArray(payload.files) ? payload.files : payload.files ? [payload.files] : [];
  files.forEach((file) => {
    if (file) formData.append("files", file);
  });
  const hasFiles = files.some(Boolean);
  const bodyMode = hasFiles ? "multipart(with-files)" : "multipart";

  try {
    const requestInit =
      requestMode === "axios"
        ? {
            method: "POST",
            data: formData,
            ...(requestHeaders ? { headers: requestHeaders } : {}),
            withCredentials: axiosWithCredentials,
            signal: options.signal,
          }
        : {
            method: "POST",
            body: formData,
            ...(requestHeaders ? { headers: requestHeaders } : {}),
            ...(!isMicroSource && source !== "window.fetch(member-api)" ? { credentials: "include" } : {}),
            signal: options.signal,
          };
    console.info("[aiChatStream] request:payload", {
      source,
      request_mode: requestMode,
      body_mode: bodyMode,
      has_files: hasFiles,
    });
    const resp = await caller("/ai/aiChat", {
      ...requestInit,
    });

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
        request_mode: requestMode,
        part_enum: payload?.part_enum,
        ai_chat_model_id: payload?.ai_chat_model_id,
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
        request_mode: requestMode,
        part_enum: payload?.part_enum,
        ai_chat_model_id: payload?.ai_chat_model_id,
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
        request_mode: requestMode,
        part_enum: payload?.part_enum,
        ai_chat_model_id: payload?.ai_chat_model_id,
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
      request_mode: requestMode,
      part_enum: payload?.part_enum,
      ai_chat_model_id: payload?.ai_chat_model_id,
      has_events: eventRecords.length > 0,
      text_length: content.length,
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

    const nextTried = [...triedSources, source];
    const hasTried = (name) => nextTried.includes(name);

    const canRetryAxiosMode =
      requestMode === "fetch" &&
      source.startsWith("microApp.fetch") &&
      !hasTried(`${source}(axios-mode)`) &&
      isLikelyTransportError(error);
    if (canRetryAxiosMode) {
      console.warn("[aiChatStream] request:retry", {
        from: `${source}(fetch-mode)`,
        to: `${source}(axios-mode)`,
        part_enum: payload?.part_enum,
        ai_chat_model_id: payload?.ai_chat_model_id,
        error: error?.message || String(error || ""),
      });
      return aiChatStream(apiFetch, payload, {
        ...options,
        __forceStreamSource: source,
        __requestMode: "axios",
        __axiosWithCredentials: false,
        __triedSources: [...nextTried, `${source}(axios-mode)`],
      });
    }

    const canRetryMicroMemberFetch =
      source === "microApp.fetch" &&
      requestMode === "axios" &&
      !hasTried("microApp.fetch(member-api)") &&
      isLikelyTransportError(error);
    if (canRetryMicroMemberFetch) {
      console.warn("[aiChatStream] request:retry", {
        from: "microApp.fetch(axios-mode)",
        to: "microApp.fetch(member-api)(fetch-mode)",
        part_enum: payload?.part_enum,
        ai_chat_model_id: payload?.ai_chat_model_id,
        error: formatTransportErrorDetail(error),
      });
      return aiChatStream(apiFetch, payload, {
        ...options,
        __forceStreamSource: "microApp.fetch(member-api)",
        __requestMode: "fetch",
        __triedSources: [...nextTried, "microApp.fetch(member-api)"],
      });
    }

    const canRetryMicroFetchFromDirect =
      source === "window.fetch(member-api)" &&
      requestMode === "fetch" &&
      !hasTried("microApp.fetch") &&
      isLikelyTransportError(error);
    if (canRetryMicroFetchFromDirect) {
      console.warn("[aiChatStream] request:retry", {
        from: "window.fetch(member-api)(fetch-mode)",
        to: "microApp.fetch(fetch-mode)",
        part_enum: payload?.part_enum,
        ai_chat_model_id: payload?.ai_chat_model_id,
        error: formatTransportErrorDetail(error),
      });
      return aiChatStream(apiFetch, payload, {
        ...options,
        __forceStreamSource: "microApp.fetch",
        __requestMode: "fetch",
        __triedSources: [...nextTried, "microApp.fetch"],
      });
    }

    const canRetrySameOriginFetch =
      source === "microApp.fetch(member-api)" &&
      requestMode === "axios" &&
      isHostedWebOrigin() &&
      !hasTried("window.fetch(same-origin)") &&
      isLikelyTransportError(error);
    if (canRetrySameOriginFetch) {
      console.warn("[aiChatStream] request:retry", {
        from: "microApp.fetch(member-api)(axios-mode)",
        to: "window.fetch(same-origin)(fetch-mode)",
        part_enum: payload?.part_enum,
        ai_chat_model_id: payload?.ai_chat_model_id,
        error: formatTransportErrorDetail(error),
      });
      return aiChatStream(apiFetch, payload, {
        ...options,
        __forceStreamSource: "window.fetch(same-origin)",
        __requestMode: "fetch",
        __triedSources: [...nextTried, "window.fetch(same-origin)"],
      });
    }

    if (isLikelyTransportError(error)) {
      throw createApiError(
        `AI Chat 网络请求失败: ${formatTransportErrorDetail(error)} | source=${source} | request_mode=${requestMode} | body_mode=${bodyMode}`,
        {
        source,
        path: "/ai/aiChat",
        status: error?.status,
        errNo: error?.errNo,
        data: error,
        },
      );
    }

    if (error?.message || error?.status !== undefined || error?.errNo !== undefined) {
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
    console.error("[aiChatStream] request:error", {
      source,
      path: "/ai/aiChat",
      part_enum: payload?.part_enum,
      ai_chat_model_id: payload?.ai_chat_model_id,
      raw: error,
    });
    throw createApiError(`AI Chat 流式请求异常: ${stringifyUnknown(error) || "unknown"}`, {
      source,
      path: "/ai/aiChat",
      data: error,
    });
  }
}
