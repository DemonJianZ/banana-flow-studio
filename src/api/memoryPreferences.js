const extractApiError = (data) => {
  const detail = data?.detail ?? data?.message ?? data;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => item?.msg || JSON.stringify(item)).join(" ; ");
  }
  if (detail && typeof detail === "object") return JSON.stringify(detail);
  return "请求失败";
};

async function requestJson(apiFetch, path, options = {}) {
  apiFetch = window.microApp.getData().fetch || apiFetch; // 兼容老版本
  if (typeof apiFetch !== "function") {
    throw new Error("apiFetch is required");
  }
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  const resp = await apiFetch(path, { ...options, headers });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(extractApiError(data));
  }
  return data;
}

export async function listPreferences(apiFetch) {
  const data = await requestJson(apiFetch, "/api/memory/preferences", { method: "GET" });
  return {
    preferences: Array.isArray(data?.preferences) ? data.preferences : [],
    meta: data && typeof data === "object" ? data : {},
  };
}

export async function setPreference(apiFetch, payload) {
  const body = {
    key: payload?.key,
    value: payload?.value,
  };
  if (payload?.confidence !== undefined && payload?.confidence !== null && payload?.confidence !== "") {
    const parsedConfidence = Number(payload.confidence);
    if (Number.isFinite(parsedConfidence)) {
      body.confidence = parsedConfidence;
    }
  }
  if (payload?.ttl_days !== undefined && payload?.ttl_days !== null && payload?.ttl_days !== "") {
    const parsedTtl = Number(payload.ttl_days);
    if (Number.isFinite(parsedTtl)) {
      body.ttl_days = parsedTtl;
    }
  }
  const data = await requestJson(apiFetch, "/api/memory/preferences/set", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return data?.memory || null;
}

export async function deactivatePreference(apiFetch, key) {
  return requestJson(apiFetch, "/api/memory/preferences/deactivate", {
    method: "POST",
    body: JSON.stringify({ key }),
  });
}

export async function expirePreferences(apiFetch) {
  return requestJson(apiFetch, "/api/memory/preferences/expire", {
    method: "POST",
    body: JSON.stringify({}),
  });
}
