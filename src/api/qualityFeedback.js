const extractApiError = (data) => {
  const detail = data?.detail ?? data?.message ?? data;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => item?.msg || JSON.stringify(item)).join(" ; ");
  }
  if (detail && typeof detail === "object") return JSON.stringify(detail);
  return "请求失败";
};

const toHeaderValue = (value) => {
  const raw = String(value ?? "")
    .replace(/[\r\n]+/g, " ")
    .trim();
  if (!raw) return "";
  try {
    // eslint-disable-next-line no-new
    new Headers({ "x-check": raw });
    return raw;
  } catch {
    return encodeURIComponent(raw);
  }
};

const buildAgentHeaders = (meta = {}) => {
  const headers = new Headers();
  headers.set("X-Agent-Intent", toHeaderValue(meta.intent || ""));
  headers.set("X-Agent-Product", toHeaderValue(meta.product || ""));
  headers.set("X-Agent-Session-Id", toHeaderValue(meta.sessionId || ""));
  return headers;
};

async function requestJson(apiFetch, path, options = {}) {
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

export async function harvestEvalCase(apiFetch, payload, meta = {}) {
  const body = {
    session_id: String(payload?.session_id || "").trim(),
    reason: String(payload?.reason || "").trim() || undefined,
    include_trajectory: payload?.include_trajectory !== false,
  };
  if (!body.session_id) {
    throw new Error("session_id is required");
  }
  return requestJson(apiFetch, "/api/quality/harvest_eval_case", {
    method: "POST",
    headers: buildAgentHeaders(meta),
    body: JSON.stringify(body),
  });
}
