import { createApiError, delayWithSignal, extractApiError } from "./httpClient.js";

const DEFAULT_INTERVAL_MS = 1200;
const DEFAULT_TIMEOUT_MS = 600_000;

export async function pollTask({
  poll,
  isSuccess,
  isFailure,
  getFailureMessage,
  intervalMs = DEFAULT_INTERVAL_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  signal,
  timeoutMessage = "任务轮询超时",
  onProgress,
  taskId,
  source = "taskPoller",
}) {
  if (typeof poll !== "function") {
    throw createApiError("缺少任务轮询函数", { code: "TASK_POLLER_MISSING", source });
  }
  const startedAt = Date.now();
  const safeIntervalMs = Math.max(0, Number(intervalMs ?? DEFAULT_INTERVAL_MS));
  const safeTimeoutMs = Math.max(safeIntervalMs || 1, Number(timeoutMs ?? DEFAULT_TIMEOUT_MS));

  while (true) {
    if (signal?.aborted) throw signal.reason || new DOMException("Aborted", "AbortError");
    if (Date.now() - startedAt > safeTimeoutMs) {
      throw createApiError(timeoutMessage, { code: "TASK_POLL_TIMEOUT", taskId, source });
    }

    const data = await poll();
    onProgress?.(data);
    if (isSuccess?.(data)) return data;
    if (isFailure?.(data)) {
      const message = getFailureMessage?.(data) || extractApiError(data);
      throw createApiError(message, { code: "TASK_FAILED", taskId, data, source });
    }

    await delayWithSignal(safeIntervalMs, signal);
  }
}

export const getLowerStatus = (data) => String(data?.status || "").trim().toLowerCase();
export const getUpperStatus = (data) => String(data?.status || "").trim().toUpperCase();
