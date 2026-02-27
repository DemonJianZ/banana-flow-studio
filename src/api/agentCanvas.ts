import { API_BASE, TOKEN_KEY } from "../config";

const API_ROOT = (API_BASE || "").replace(/\/+$/, "");

const PRODUCT_TERMS = [
  "洗面奶",
  "洁面",
  "眼霜",
  "防晒",
  "防晒霜",
  "面膜",
  "精华",
  "粉底",
  "粉底液",
  "卸妆",
  "卸妆水",
  "卸妆油",
  "身体乳",
  "洗发水",
  "护发素",
  "发膜",
  "沐浴露",
  "牙膏",
  "益生菌",
  "维生素",
  "胶原蛋白",
  "咖啡",
  "燕麦",
  "耳机",
  "吹风机",
  "香水",
  "口红",
  "唇釉",
  "乳液",
  "面霜",
  "精油",
];

const buildUrl = (path) => {
  if (!path) return API_ROOT || "";
  if (path.startsWith("http")) return path;
  if (!API_ROOT) return path.startsWith("/") ? path : `/${path}`;
  return path.startsWith("/") ? `${API_ROOT}${path}` : `${API_ROOT}/${path}`;
};

const extractApiError = (data) => {
  const d = data?.detail ?? data?.message ?? data;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x?.msg || JSON.stringify(x)).join(" ; ");
  if (d && typeof d === "object") return JSON.stringify(d);
  return String(d || "请求失败");
};

const createCaller = (apiFetch) => {
  if (apiFetch) {
    return (path, options) => apiFetch(path, options);
  }
  return async (path, options = {}) => {
    const headers = new Headers(options.headers || {});
    headers.set("Content-Type", "application/json");
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(buildUrl(path), { ...options, headers });
  };
};

export function extractProductKeyword(text) {
  const source = String(text || "").trim();
  if (!source) return "";
  const hits = PRODUCT_TERMS.filter((item) => source.includes(item));
  if (hits.length) {
    hits.sort((a, b) => b.length - a.length);
    return hits[0];
  }
  return "";
}

export async function generateIdeaScriptMission(product, apiFetch) {
  const call = createCaller(apiFetch);
  const resp = await call("/api/agent/idea_script", {
    method: "POST",
    body: JSON.stringify({ product: String(product || "").trim() }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(extractApiError(data));
  }
  return data;
}

export async function exportIdeaScriptFfmpegBundle(payload, apiFetch) {
  const call = createCaller(apiFetch);
  const reqBody = {
    plan_id: payload?.planId || undefined,
    plan: payload?.plan || undefined,
    out_dir: payload?.outDir || "./exports/ffmpeg",
    w: Number(payload?.w || 720),
    h: Number(payload?.h || 1280),
    fps: Number(payload?.fps || 30),
  };

  const send = async (body) => {
    const resp = await call("/api/agent/idea_script/export_ffmpeg", {
      method: "POST",
      body: JSON.stringify(body),
    });
    const data = await resp.json().catch(() => ({}));
    return { resp, data };
  };

  let { resp, data } = await send(reqBody);
  if (!resp.ok && resp.status === 404 && reqBody.plan_id && reqBody.plan) {
    const retryBody = { ...reqBody, plan_id: undefined };
    ({ resp, data } = await send(retryBody));
  }
  if (!resp.ok) {
    throw new Error(extractApiError(data));
  }
  return data;
}
