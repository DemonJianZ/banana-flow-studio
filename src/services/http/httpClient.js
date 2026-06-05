export const buildUrl = (baseUrl, path, { requireBase = false, missingBaseMessage = "API 服务未配置" } = {}) => {
  const apiRoot = String(baseUrl || "").replace(/\/+$/, "");
  if (requireBase && !apiRoot) throw createApiError(missingBaseMessage, { code: "API_BASE_MISSING" });
  if (!path) return apiRoot || "";
  if (String(path).startsWith("http")) return path;
  if (!apiRoot) return String(path).startsWith("/") ? path : `/${path}`;
  return String(path).startsWith("/") ? `${apiRoot}${path}` : `${apiRoot}/${path}`;
};

export const extractApiError = (data, fallback = "请求失败") => {
  const detail = data?.detail ?? data?.message ?? data?.errMsg ?? data?.error_msg ?? data?.error ?? data;
  if (typeof detail === "string") return detail || fallback;
  if (Array.isArray(detail)) {
    return detail.map((item) => item?.msg || item?.message || JSON.stringify(item)).join(" ; ") || fallback;
  }
  if (detail && typeof detail === "object") {
    try {
      return JSON.stringify(detail);
    } catch {
      return fallback;
    }
  }
  return String(detail || fallback);
};

export const createApiError = (message, extras = {}) => {
  const error = new Error(message || "请求失败");
  const code = extras.code ?? extras.errNo ?? extras.err_no ?? undefined;
  Object.assign(error, {
    status: extras.status,
    code,
    data: extras.data,
    source: extras.source,
    ...extras,
  });
  if (code !== undefined && error.errNo === undefined) error.errNo = code;
  return error;
};

export const normalizeApiError = (error, fallback = "请求失败") => ({
  message: String(error?.message || fallback),
  status: error?.status,
  code: error?.code ?? error?.errNo ?? error?.err_no,
  data: error?.data,
  source: error?.source,
});

export const emitDebug = (options, event) => {
  if (typeof options?.onDebug === "function") options.onDebug(event);
};

export const createScopedSignal = (parentSignal, label = "request") => {
  const controller = new AbortController();

  const abort = (reason) => {
    if (!controller.signal.aborted) controller.abort(reason);
  };

  const handleParentAbort = () => {
    abort(parentSignal?.reason || new DOMException(`${label} aborted`, "AbortError"));
  };

  if (parentSignal) {
    if (parentSignal.aborted) handleParentAbort();
    else parentSignal.addEventListener("abort", handleParentAbort, { once: true });
  }

  return {
    signal: controller.signal,
    abort,
    cleanup: () => {
      if (parentSignal) parentSignal.removeEventListener("abort", handleParentAbort);
    },
  };
};

export const delayWithSignal = (ms, signal) =>
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

export const callWithLocalTimeout = async (candidate, requestUrl, requestInit, parentSignal, label = "request") => {
  const scope = createScopedSignal(parentSignal, label);
  let timeoutId = 0;
  try {
    const targetUrl = candidate?.requestUrl || requestUrl;
    const requestPromise = Promise.resolve(candidate.caller(targetUrl, { ...requestInit, signal: scope.signal }));
    if (!candidate.timeoutMs) return await requestPromise;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = window.setTimeout(() => {
        scope.abort(new DOMException(`${label} local timeout`, "AbortError"));
        reject(createApiError(`${label} local timeout`, { code: "LOCAL_TIMEOUT", source: candidate.source }));
      }, candidate.timeoutMs);
    });
    return await Promise.race([requestPromise, timeoutPromise]);
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
    scope.cleanup();
  }
};

export const readJsonResponse = async (resp) => {
  if (!resp || typeof resp !== "object" || typeof resp.json !== "function") return resp || {};
  return resp.json().catch(() => ({}));
};

export const assertOkResponse = async (resp, { source, path, normalizePayload = (value) => value } = {}) => {
  const rawData = await readJsonResponse(resp);
  const data = normalizePayload(rawData);
  if (resp && typeof resp === "object" && typeof resp.json === "function" && !resp.ok) {
    throw createApiError(extractApiError(data), { source, path, status: resp.status, data });
  }
  if (data?.err_no !== undefined && Number(data.err_no) !== 0) {
    throw createApiError(extractApiError(data), { source, path, status: resp?.status, data, errNo: data.err_no });
  }
  return data;
};
