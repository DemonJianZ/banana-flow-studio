import { API_BASE, TOKEN_KEY } from "../config";
import { buildUrl, createApiError, extractApiError } from "../services/http/httpClient.js";
import { pollTask, getLowerStatus } from "../services/http/taskPoller.js";
import { getAuthToken } from "../services/auth/tokenStorage.js";

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

const createCaller = (apiFetch) => {
  if (apiFetch) {
    return (path, options) => apiFetch(path, { ...options, skipAuth: true });
  }
  return async (path, options = {}) => {
    const headers = new Headers(options.headers || {});
    headers.set("Content-Type", "application/json");
    const token = getAuthToken(TOKEN_KEY);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(buildUrl(API_BASE, path), { ...options, headers });
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

const VIDEO_LINEART_POLL_INTERVAL_MS = 1200;
const VIDEO_LINEART_TIMEOUT_MS = 600_000;
const VIDEO_RMBG_POLL_INTERVAL_MS = 1200;
const VIDEO_RMBG_TIMEOUT_MS = 600_000;
const VIDEO_SPLIT_POLL_INTERVAL_MS = 1200;
const VIDEO_SPLIT_TIMEOUT_MS = 600_000;
const STORYBOARD_POLL_INTERVAL_MS = 3000;
const STORYBOARD_TASK_TIMEOUT_MS = 300_000;

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

export async function sendAgentMessage(payload, apiFetch, meta) {
  const call = createCaller(apiFetch);
  const reqBody = {
    message: String(payload?.message || "").trim(),
    force_action: payload?.forceAction || undefined,
    ui_action: payload?.uiAction || undefined,
    // NO recent_messages — context comes from server-side checkpointing
    supplemental_prompt: String(payload?.supplementalPrompt || "").trim() || undefined,
    current_nodes: Array.isArray(payload?.currentNodes) ? payload.currentNodes : [],
    current_connections: Array.isArray(payload?.currentConnections) ? payload.currentConnections : [],
    selected_artifact: payload?.selectedArtifact || undefined,
    canvas_id: String(payload?.canvasId || "").trim() || undefined,
    thread_id: String(payload?.threadId || "").trim() || undefined,
    mode: String(payload?.mode || "").trim() || undefined,
    product: String(payload?.product || "").trim() || undefined,
    audience: String(payload?.audience || "").trim() || undefined,
    price_band: String(payload?.priceBand || "").trim() || undefined,
    conversion_goal: String(payload?.conversionGoal || "").trim() || undefined,
    primary_platform: String(payload?.primaryPlatform || "").trim() || undefined,
    secondary_platform: String(payload?.secondaryPlatform || "").trim() || undefined,
    selected_angle: String(payload?.selectedAngle || "").trim() || undefined,
    task_mode: String(payload?.taskMode || "").trim() || undefined,
    episode_count: Number.isFinite(Number(payload?.episodeCount)) ? Number(payload.episodeCount) : undefined,
    existing_script: String(payload?.existingScript || "").trim() || undefined,
    uploaded_documents: Array.isArray(payload?.uploadedDocuments) ? payload.uploadedDocuments : [],
    canvas_node_hints: payload?.canvasNodeHints && typeof payload.canvasNodeHints === "object" ? payload.canvasNodeHints : undefined,
  };
  const resp = await call("/api/agent/invoke", {
    method: "POST",
    body: JSON.stringify(reqBody),
    headers: buildAgentHeaders(meta),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw createApiError(extractApiError(data), { status: resp.status, data, source: "agentCanvas.sendAgentMessage" });
  }
  return data;
}

export async function pollStoryboardTask(taskId: string, apiFetch, onProgress?: (status: string) => void) {
  const call = createCaller(apiFetch);
  return pollTask({
    taskId,
    source: "agentCanvas.storyboard",
    intervalMs: STORYBOARD_POLL_INTERVAL_MS,
    timeoutMs: STORYBOARD_TASK_TIMEOUT_MS,
    timeoutMessage: "分镜生成超时，请稍后重试",
    poll: async () => {
    const resp = await call(`/api/agent/storyboard/status/${encodeURIComponent(taskId)}`, { method: "GET" });
    const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw createApiError(extractApiError(data), { status: resp.status, data, source: "agentCanvas.storyboard" });
      return data;
    },
    onProgress: (data) => onProgress?.(getLowerStatus(data)),
    isSuccess: (data) => getLowerStatus(data) === "done",
    isFailure: (data) => getLowerStatus(data) === "error",
    getFailureMessage: (data) => String(data?.error_msg || "分镜生成失败"),
  });
}

export async function polishCanvasPrompt(payload, apiFetch, meta) {
  const data = await sendAgentMessage(
    {
      message: String(payload?.prompt || "").trim(),
      uiAction: "prompt_polish",
      mode: String(payload?.mode || "text2img").trim() || "text2img",
    },
    apiFetch,
    meta,
  );
  if (!(data?.intent === "tool_call" && data?.tool_result && typeof data.tool_result === "object")) {
    throw createApiError(String(data?.message || "").trim() || "Agent 未返回提示词润色结果", {
      data,
      source: "agentCanvas.polishCanvasPrompt",
    });
  }
  return data.tool_result;
}

export async function runVideoLineartTask(payload, apiFetch) {
  const call = createCaller(apiFetch);
  const startResp = await call("/api/video_lineart/start", {
    method: "POST",
    body: JSON.stringify({
      video: String(payload?.video || "").trim(),
      line_strength: Number(payload?.lineStrength),
      line_color: String(payload?.lineColor || "").trim() || "black",
    }),
  });
  const startData = await startResp.json().catch(() => ({}));
  if (!startResp.ok) {
    throw createApiError(extractApiError(startData), { status: startResp.status, data: startData, source: "agentCanvas.videoLineart.start" });
  }

  const taskId = String(startData?.task_id || "").trim();
  if (!taskId) {
    throw createApiError("视频转线稿任务创建失败", { data: startData, source: "agentCanvas.videoLineart.start" });
  }

  return pollTask({
    taskId,
    source: "agentCanvas.videoLineart",
    intervalMs: VIDEO_LINEART_POLL_INTERVAL_MS,
    timeoutMs: VIDEO_LINEART_TIMEOUT_MS,
    timeoutMessage: "视频转线稿超时，请稍后重试",
    poll: async () => {
      const statusResp = await call(`/api/video_lineart/status/${encodeURIComponent(taskId)}`, { method: "GET" });
      const statusData = await statusResp.json().catch(() => ({}));
      if (!statusResp.ok) {
        throw createApiError(extractApiError(statusData), { status: statusResp.status, data: statusData, source: "agentCanvas.videoLineart" });
      }
      return statusData;
    },
    isSuccess: (statusData) => {
      if (getLowerStatus(statusData) !== "success") return false;
      const video = String(statusData?.video || "").trim();
      if (!video) {
        throw createApiError("视频转线稿未返回结果", { taskId, data: statusData, source: "agentCanvas.videoLineart" });
      }
      return true;
    },
    isFailure: (statusData) => getLowerStatus(statusData) === "error",
    getFailureMessage: (statusData) => extractApiError(statusData?.error || statusData),
  });
}

export async function runVideoRmbgTask(payload, apiFetch) {
  const call = createCaller(apiFetch);
  const startResp = await call("/api/video_rmbg/start", {
    method: "POST",
    body: JSON.stringify({
      video: String(payload?.video || "").trim(),
    }),
  });
  const startData = await startResp.json().catch(() => ({}));
  if (!startResp.ok) {
    throw createApiError(extractApiError(startData), { status: startResp.status, data: startData, source: "agentCanvas.videoRmbg.start" });
  }

  const taskId = String(startData?.task_id || "").trim();
  if (!taskId) {
    throw createApiError("视频去背景任务创建失败", { data: startData, source: "agentCanvas.videoRmbg.start" });
  }

  return pollTask({
    taskId,
    source: "agentCanvas.videoRmbg",
    intervalMs: VIDEO_RMBG_POLL_INTERVAL_MS,
    timeoutMs: VIDEO_RMBG_TIMEOUT_MS,
    timeoutMessage: "视频去背景超时，请稍后重试",
    poll: async () => {
      const statusResp = await call(`/api/video_rmbg/status/${encodeURIComponent(taskId)}`, { method: "GET" });
      const statusData = await statusResp.json().catch(() => ({}));
      if (!statusResp.ok) {
        throw createApiError(extractApiError(statusData), { status: statusResp.status, data: statusData, source: "agentCanvas.videoRmbg" });
      }
      return statusData;
    },
    isSuccess: (statusData) => {
      if (getLowerStatus(statusData) !== "success") return false;
      const video = String(statusData?.video || "").trim();
      if (!video) {
        throw createApiError("视频去背景未返回结果", { taskId, data: statusData, source: "agentCanvas.videoRmbg" });
      }
      return true;
    },
    isFailure: (statusData) => getLowerStatus(statusData) === "error",
    getFailureMessage: (statusData) => extractApiError(statusData?.error || statusData),
  });
}

export async function runVideoSplitTask(payload, apiFetch) {
  const call = createCaller(apiFetch);
  const rawSegments = Array.isArray(payload?.segments) ? payload.segments : [];
  const outputResolution = String(payload?.outputResolution || payload?.output_resolution || "720p").trim().toLowerCase() || "720p";
  const includeAudio = Boolean(payload?.includeAudio ?? payload?.include_audio);
  const segments = rawSegments
    .map((item) => ({
      start_sec: Number(item?.startSec),
      end_sec: Number(item?.endSec),
    }))
    .filter((item) => Number.isFinite(item.start_sec) && Number.isFinite(item.end_sec) && item.end_sec > item.start_sec);

  if (!segments.length) {
    throw createApiError("至少需要一个有效分段", { source: "agentCanvas.videoSplit" });
  }

  const startResp = await call("/api/video_split/start", {
    method: "POST",
    body: JSON.stringify({
      video: String(payload?.video || "").trim(),
      segments,
      output_resolution: outputResolution,
      include_audio: includeAudio,
    }),
  });
  const startData = await startResp.json().catch(() => ({}));
  if (!startResp.ok) {
    throw createApiError(extractApiError(startData), { status: startResp.status, data: startData, source: "agentCanvas.videoSplit.start" });
  }

  const taskId = String(startData?.task_id || "").trim();
  if (!taskId) {
    throw createApiError("视频分割任务创建失败", { data: startData, source: "agentCanvas.videoSplit.start" });
  }

  return pollTask({
    taskId,
    source: "agentCanvas.videoSplit",
    intervalMs: VIDEO_SPLIT_POLL_INTERVAL_MS,
    timeoutMs: VIDEO_SPLIT_TIMEOUT_MS,
    timeoutMessage: "视频分割超时，请稍后重试",
    poll: async () => {
      const statusResp = await call(`/api/video_split/status/${encodeURIComponent(taskId)}`, { method: "GET" });
      const statusData = await statusResp.json().catch(() => ({}));
      if (!statusResp.ok) {
        throw createApiError(extractApiError(statusData), { status: statusResp.status, data: statusData, source: "agentCanvas.videoSplit" });
      }
      return statusData;
    },
    isSuccess: (statusData) => {
      if (getLowerStatus(statusData) !== "success") return false;
      const videos = Array.isArray(statusData?.videos)
        ? statusData.videos.map((item) => String(item || "").trim()).filter(Boolean)
        : [];
      if (!videos.length) {
        throw createApiError("视频分割未返回结果", { taskId, data: statusData, source: "agentCanvas.videoSplit" });
      }
      return true;
    },
    isFailure: (statusData) => getLowerStatus(statusData) === "error",
    getFailureMessage: (statusData) => extractApiError(statusData?.error || statusData),
  });
}
