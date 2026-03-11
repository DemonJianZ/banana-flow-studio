import { MEMBER_API_BASE } from "../config";

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

const resolveCaller = (apiFetch) => {
  const microAppFetch = window.microApp?.getData?.().fetch;
  if (typeof microAppFetch === "function") {
    return {
      source: "microApp.fetch",
      caller: (path, init) => microAppFetch(path, init),
    };
  }
  if (typeof apiFetch === "function") {
    return {
      source: "apiFetch",
      caller: (path, init) => apiFetch(path, init),
    };
  }
  return {
    source: "window.fetch(member-api)",
    caller: (path, init) => fetch(buildUrl(path), init),
  };
};

export async function viewMemberInfo(apiFetch, payload = {}, options = {}) {
  const { source, caller } = resolveCaller(apiFetch);
  console.info("[memberInfo] request:start", {
    path: "/ai/viewMemberInfo",
    source,
    payload: payload || {},
  });
  const resp = await caller("/ai/viewMemberInfo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
    credentials: "include",
    signal: options.signal,
  });

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
  return data;
}
