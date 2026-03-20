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

const GENERIC_MISSION_TERMS = new Set([
  "帮我",
  "给我",
  "请",
  "做",
  "做个",
  "做一条",
  "写",
  "写个",
  "写一条",
  "生成",
  "设计",
  "策划",
  "脚本",
  "爆款脚本",
  "文案",
  "方案",
  "视频",
  "短视频",
  "口播",
  "内容",
  "营销",
  "带货",
  "产品",
  "品类",
  "素材",
]);

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
    return (path, options) => apiFetch(path, { ...options, skipAuth: true });
  }
  return async (path, options = {}) => {
    const headers = new Headers(options.headers || {});
    headers.set("Content-Type", "application/json");
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(buildUrl(path), { ...options, headers });
  };
};

const toHeaderValue = (value) => {
  const raw = String(value ?? "")
    .replace(/[\r\n]+/g, " ")
    .trim();
  if (!raw) return "";
  try {
    // 浏览器 Headers 仅接受 ISO-8859-1；中文等字符需要编码
    // 用试写校验避免直接 set 抛错
    // eslint-disable-next-line no-new
    new Headers({ "x-check": raw });
    return raw;
  } catch {
    return encodeURIComponent(raw);
  }
};

const buildAgentHeaders = (meta) => {
  if (!meta) return undefined;
  const headers = new Headers();
  headers.set("X-Agent-Intent", toHeaderValue(meta.intent || ""));
  headers.set("X-Agent-Product", toHeaderValue(meta.product || ""));
  headers.set("X-Agent-Session-Id", toHeaderValue(meta.sessionId || ""));
  return headers;
};

const AGENT_IDEA_SCRIPT_TIMEOUT_MS = 90_000;

const withAbortTimeout = async (task, timeoutMs, timeoutMessage) => {
  const controller = new AbortController();
  const timerId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await task(controller.signal);
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(timeoutMessage);
    }
    throw error;
  } finally {
    window.clearTimeout(timerId);
  }
};

export function extractProductKeyword(text) {
  const source = String(text || "").trim();
  if (!source) return "";
  const hits = PRODUCT_TERMS.filter((item) => source.includes(item));
  if (hits.length) {
    hits.sort((a, b) => b.length - a.length);
    return hits[0];
  }

  const patterns = [
    /(?:帮我|给我|请)?(?:做|写|生成|设计|策划)?(?:一个|一款|一支|一瓶|一套|条)?([\u4e00-\u9fa5A-Za-z0-9·-]{2,24})(?:的)?(?:爆款)?(?:脚本|文案|方案|视频|短视频|口播|内容)/i,
    /(?:关于|做|写|生成|设计|策划)([\u4e00-\u9fa5A-Za-z0-9·-]{2,24})/i,
    /([\u4e00-\u9fa5A-Za-z0-9·-]{2,24})(?:产品|品类)/i,
  ];
  for (const reg of patterns) {
    const m = source.match(reg);
    if (!m || !m[1]) continue;
    const normalized = normalizeProductCandidate(m[1]);
    if (normalized) return normalized;
  }

  const tokens = source.match(/[\u4e00-\u9fa5A-Za-z0-9·-]{2,24}/g) || [];
  for (const token of tokens) {
    const normalized = normalizeProductCandidate(token);
    if (normalized) return normalized;
  }
  return "";
}

function normalizeProductCandidate(value) {
  let text = String(value || "").trim();
  if (!text) return "";
  text = text
    .replace(/^(一个|一款|一支|一瓶|一套|这种|这款|这个|那个|那款)/, "")
    .replace(/(脚本|爆款脚本|文案|方案|视频|短视频|口播|内容|营销|带货)+$/g, "")
    .trim();
  if (!text || text.length < 2 || text.length > 24) return "";
  if (GENERIC_MISSION_TERMS.has(text)) return "";
  return text;
}

export async function generateIdeaScriptMission(product, apiFetch, meta) {
  const call = createCaller(apiFetch);
  const resp = await withAbortTimeout((signal) => call("/api/agent/idea_script", {
    method: "POST",
    body: JSON.stringify({ product: String(product || "").trim() }),
    headers: buildAgentHeaders(meta),
    signal,
  }), AGENT_IDEA_SCRIPT_TIMEOUT_MS, "生成脚本超时，请稍后重试。");
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(extractApiError(data));
  }
  return data;
}

export async function generateAgentChitchat(message, apiFetch, meta) {
  const call = createCaller(apiFetch);
  const resp = await call("/api/agent/chitchat", {
    method: "POST",
    body: JSON.stringify({ message: String(message || "").trim() }),
    headers: buildAgentHeaders(meta),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(extractApiError(data));
  }
  return data;
}

export async function planAgentCanvas(payload, apiFetch, meta) {
  const call = createCaller(apiFetch);
  const reqBody = {
    prompt: String(payload?.prompt || "").trim(),
    current_nodes: Array.isArray(payload?.currentNodes) ? payload.currentNodes : [],
    current_connections: Array.isArray(payload?.currentConnections) ? payload.currentConnections : [],
    selected_artifact: payload?.selectedArtifact || null,
    canvas_id: String(payload?.canvasId || "").trim() || undefined,
    thread_id: String(payload?.threadId || "").trim() || undefined,
  };

  const resp = await call("/api/agent/plan", {
    method: "POST",
    body: JSON.stringify(reqBody),
    headers: buildAgentHeaders(meta),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(extractApiError(data));
  }
  return data;
}

export async function exportIdeaScriptFfmpegBundle(payload, apiFetch, meta) {
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
      headers: buildAgentHeaders(meta),
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

export async function generateIdeaScriptVideo(payload, apiFetch, meta) {
  const call = createCaller(apiFetch);
  const reqBody = {
    product: String(payload?.product || "").trim(),
    out_dir: payload?.outDir || "./exports/video_generation",
    image_width: Number(payload?.imageWidth || 1024),
    image_height: Number(payload?.imageHeight || 1024),
    output_width: Number(payload?.outputWidth || 720),
    output_height: Number(payload?.outputHeight || 1280),
    fps: Number(payload?.fps || 24),
    clip_length: Number(payload?.clipLength || 81),
    retries_per_step: Number(payload?.retriesPerStep || 1),
    max_shots: Number(payload?.maxShots || 0),
    motion_hint: String(payload?.motionHint || ""),
    bgm_path: payload?.bgmPath || null,
  };

  const resp = await call("/api/agent/idea_script/generate_video", {
    method: "POST",
    body: JSON.stringify(reqBody),
    headers: buildAgentHeaders(meta),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(extractApiError(data));
  }
  return data;
}
