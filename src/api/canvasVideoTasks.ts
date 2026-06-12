import { API_BASE, TOKEN_KEY } from "../config";
import { buildUrl, createApiError, extractApiError } from "../services/http/httpClient.js";
import { pollTask, getLowerStatus } from "../services/http/taskPoller.js";
import { getAuthToken } from "../services/auth/tokenStorage.js";

const VIDEO_LINEART_POLL_INTERVAL_MS = 1200;
const VIDEO_LINEART_TIMEOUT_MS = 600_000;
const VIDEO_RMBG_POLL_INTERVAL_MS = 1200;
const VIDEO_RMBG_TIMEOUT_MS = 600_000;
const VIDEO_SPLIT_POLL_INTERVAL_MS = 1200;
const VIDEO_SPLIT_TIMEOUT_MS = 600_000;

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
    throw createApiError(extractApiError(startData), { status: startResp.status, data: startData, source: "canvasVideoTasks.videoLineart.start" });
  }

  const taskId = String(startData?.task_id || "").trim();
  if (!taskId) {
    throw createApiError("视频转线稿任务创建失败", { data: startData, source: "canvasVideoTasks.videoLineart.start" });
  }

  return pollTask({
    taskId,
    source: "canvasVideoTasks.videoLineart",
    intervalMs: VIDEO_LINEART_POLL_INTERVAL_MS,
    timeoutMs: VIDEO_LINEART_TIMEOUT_MS,
    timeoutMessage: "视频转线稿超时，请稍后重试",
    poll: async () => {
      const statusResp = await call(`/api/video_lineart/status/${encodeURIComponent(taskId)}`, { method: "GET" });
      const statusData = await statusResp.json().catch(() => ({}));
      if (!statusResp.ok) {
        throw createApiError(extractApiError(statusData), { status: statusResp.status, data: statusData, source: "canvasVideoTasks.videoLineart" });
      }
      return statusData;
    },
    isSuccess: (statusData) => {
      if (getLowerStatus(statusData) !== "success") return false;
      const video = String(statusData?.video || "").trim();
      if (!video) {
        throw createApiError("视频转线稿未返回结果", { taskId, data: statusData, source: "canvasVideoTasks.videoLineart" });
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
    throw createApiError(extractApiError(startData), { status: startResp.status, data: startData, source: "canvasVideoTasks.videoRmbg.start" });
  }

  const taskId = String(startData?.task_id || "").trim();
  if (!taskId) {
    throw createApiError("视频去背景任务创建失败", { data: startData, source: "canvasVideoTasks.videoRmbg.start" });
  }

  return pollTask({
    taskId,
    source: "canvasVideoTasks.videoRmbg",
    intervalMs: VIDEO_RMBG_POLL_INTERVAL_MS,
    timeoutMs: VIDEO_RMBG_TIMEOUT_MS,
    timeoutMessage: "视频去背景超时，请稍后重试",
    poll: async () => {
      const statusResp = await call(`/api/video_rmbg/status/${encodeURIComponent(taskId)}`, { method: "GET" });
      const statusData = await statusResp.json().catch(() => ({}));
      if (!statusResp.ok) {
        throw createApiError(extractApiError(statusData), { status: statusResp.status, data: statusData, source: "canvasVideoTasks.videoRmbg" });
      }
      return statusData;
    },
    isSuccess: (statusData) => {
      if (getLowerStatus(statusData) !== "success") return false;
      const video = String(statusData?.video || "").trim();
      if (!video) {
        throw createApiError("视频去背景未返回结果", { taskId, data: statusData, source: "canvasVideoTasks.videoRmbg" });
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
    throw createApiError("至少需要一个有效分段", { source: "canvasVideoTasks.videoSplit" });
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
    throw createApiError(extractApiError(startData), { status: startResp.status, data: startData, source: "canvasVideoTasks.videoSplit.start" });
  }

  const taskId = String(startData?.task_id || "").trim();
  if (!taskId) {
    throw createApiError("视频分割任务创建失败", { data: startData, source: "canvasVideoTasks.videoSplit.start" });
  }

  return pollTask({
    taskId,
    source: "canvasVideoTasks.videoSplit",
    intervalMs: VIDEO_SPLIT_POLL_INTERVAL_MS,
    timeoutMs: VIDEO_SPLIT_TIMEOUT_MS,
    timeoutMessage: "视频分割超时，请稍后重试",
    poll: async () => {
      const statusResp = await call(`/api/video_split/status/${encodeURIComponent(taskId)}`, { method: "GET" });
      const statusData = await statusResp.json().catch(() => ({}));
      if (!statusResp.ok) {
        throw createApiError(extractApiError(statusData), { status: statusResp.status, data: statusData, source: "canvasVideoTasks.videoSplit" });
      }
      return statusData;
    },
    isSuccess: (statusData) => {
      if (getLowerStatus(statusData) !== "success") return false;
      const videos = Array.isArray(statusData?.videos)
        ? statusData.videos.map((item) => String(item || "").trim()).filter(Boolean)
        : [];
      if (!videos.length) {
        throw createApiError("视频分割未返回结果", { taskId, data: statusData, source: "canvasVideoTasks.videoSplit" });
      }
      return true;
    },
    isFailure: (statusData) => getLowerStatus(statusData) === "error",
    getFailureMessage: (statusData) => extractApiError(statusData?.error || statusData),
  });
}
