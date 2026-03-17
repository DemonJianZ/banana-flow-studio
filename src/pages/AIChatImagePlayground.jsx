import React, { useMemo, useState } from "react";
import { ArrowLeft, Image as ImageIcon, Loader2, Send } from "lucide-react";
import { useNavigate } from "../router";
import { API_BASE, MEMBER_API_BASE, MEMBER_AUTHORIZATION } from "../config";

const API_ROOT = (MEMBER_API_BASE || "").replace(/\/+$/, "");

const buildUrl = (path) => {
  if (!path) return API_ROOT || "";
  if (path.startsWith("http")) return path;
  if (!API_ROOT) return path.startsWith("/") ? path : `/${path}`;
  return path.startsWith("/") ? `${API_ROOT}${path}` : `${API_ROOT}/${path}`;
};

const API_SERVER_ROOT = (API_BASE || "").replace(/\/+$/, "");
const buildApiServerUrl = (path) => {
  if (!path) return API_SERVER_ROOT || "";
  if (path.startsWith("http")) return path;
  if (!API_SERVER_ROOT) return path.startsWith("/") ? path : `/${path}`;
  return path.startsWith("/") ? `${API_SERVER_ROOT}${path}` : `${API_SERVER_ROOT}/${path}`;
};

const resolveAuthorization = () => {
  const microData = (() => {
    try {
      return window.microApp?.getData?.() || {};
    } catch {
      return {};
    }
  })();
  const candidates = [
    microData?.authorization,
    microData?.Authorization,
    microData?.token,
    microData?.access_token,
    microData?.authToken,
    window.__AI_CHAT_AUTHORIZATION__,
    MEMBER_AUTHORIZATION,
  ];
  for (const token of candidates) {
    const text = String(token || "").trim();
    if (text) return text;
  }
  return "";
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

const createScopedSignal = (parentSignal) => {
  const controller = new AbortController();
  const abort = (reason) => {
    if (!controller.signal.aborted) controller.abort(reason);
  };
  const handleParentAbort = () => abort(parentSignal?.reason || new DOMException("playground aborted", "AbortError"));
  if (parentSignal) {
    if (parentSignal.aborted) {
      handleParentAbort();
    } else {
      parentSignal.addEventListener("abort", handleParentAbort, { once: true });
    }
  }
  return {
    signal: controller.signal,
    abort,
    cleanup: () => {
      if (parentSignal) parentSignal.removeEventListener("abort", handleParentAbort);
    },
  };
};

const callWithLocalTimeout = async (candidate, requestUrl, requestInit) => {
  const scope = createScopedSignal();
  let timeoutId = 0;
  try {
    const startedAt = performance.now();
    const requestPromise = Promise.resolve(candidate.caller(requestUrl, { ...requestInit, signal: scope.signal }));
    const timeoutPromise =
      candidate.timeoutMs > 0
        ? new Promise((_, reject) => {
            timeoutId = window.setTimeout(() => {
              scope.abort(new DOMException("playground local timeout", "AbortError"));
              reject(new Error(`local timeout(${candidate.timeoutMs}ms)`));
            }, candidate.timeoutMs);
          })
        : null;
    const resp = await (timeoutPromise ? Promise.race([requestPromise, timeoutPromise]) : requestPromise);
    return { resp, durationMs: Math.round(performance.now() - startedAt) };
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
    scope.cleanup();
  }
};

const snapshotHeaders = (headers) => {
  if (!headers || typeof headers.forEach !== "function") return {};
  const result = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
};

const stringify = (value) => {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value || "");
  }
};

const shellEscape = (value) => String(value || "").replace(/'/g, `'"'"'`);

const pickParamLabel = (item) => String(item?.param_name || item?.name || item?.desc || "").toLowerCase();

const sortParamValues = (values) => {
  const list = Array.isArray(values) ? values.slice() : [];
  list.sort((a, b) => {
    const ai = Number(a?.order_index ?? Number.MAX_SAFE_INTEGER);
    const bi = Number(b?.order_index ?? Number.MAX_SAFE_INTEGER);
    return ai - bi;
  });
  return list;
};

const extractParamList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload.list)) return payload.list;
  if (Array.isArray(payload?.data?.list)) return payload.data.list;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

const buildDefaultParamPayload = (paramList) => {
  const payload = {};
  for (const item of paramList) {
    const first = sortParamValues(item?.param_values || [])[0];
    const valueId = String(first?.param_value_id || "").trim();
    if (!valueId) continue;
    const label = pickParamLabel(item);
    if (label.includes("任务") || label.includes("task") || label.includes("类型")) {
      payload.ai_image_param_task_type_id = valueId;
      continue;
    }
    if (label.includes("尺寸") || label.includes("size")) {
      payload.ai_image_param_size_id = valueId;
      continue;
    }
    if (label.includes("比例") || label.includes("ratio")) {
      payload.ai_video_param_ratio_id = valueId;
      continue;
    }
    if (label.includes("分辨率") || label.includes("resolution")) {
      payload.ai_video_param_resolution_id = valueId;
      continue;
    }
    if (label.includes("时长") || label.includes("duration")) {
      payload.ai_video_param_duration_id = valueId;
    }
  }
  return payload;
};

const pickFirstImageUrl = (payload) => {
  if (!payload) return "";
  if (typeof payload === "string") {
    const text = payload.trim();
    if (!text) return "";
    const directMatch = text.match(/https?:\/\/[^\s"'<>]+/i);
    return directMatch?.[0] || "";
  }
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = pickFirstImageUrl(item);
      if (found) return found;
    }
    return "";
  }
  if (typeof payload === "object") {
    const directKeys = [
      "url",
      "image",
      "image_url",
      "imageUrl",
      "output_url",
      "outputUrl",
      "result_url",
      "resultUrl",
    ];
    for (const key of directKeys) {
      const found = pickFirstImageUrl(payload[key]);
      if (found) return found;
    }
    for (const value of Object.values(payload)) {
      const found = pickFirstImageUrl(value);
      if (found) return found;
    }
  }
  return "";
};

const extractDoneError = (events) => {
  const list = Array.isArray(events) ? events : [];
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const item = list[index]?.data ?? list[index];
    const msg = item?.errMsg || item?.error || item?.message || item?.detail;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
  }
  return "";
};

const extractImageUrlFromAIChatEvents = (events) => {
  const list = Array.isArray(events) ? events : [];
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const item = list[index];
    const payload = item?.data ?? item;
    const contentList = Array.isArray(payload?.content) ? payload.content : [];
    for (const contentItem of contentList) {
      const directUrl = String(contentItem?.url || contentItem?.image_url || contentItem?.imageUrl || "").trim();
      if (directUrl) return directUrl;
    }
  }
  return "";
};

const parseAiChatResponse = async (resp) => {
  const contentType = String(resp.headers?.get?.("content-type") || "").toLowerCase();
  if (contentType.includes("application/json")) {
    const data = await resp.json().catch(() => ({}));
    return { mode: "json", text: stringify(data), events: [], data };
  }

  const reader = resp.body?.getReader?.();
  if (!reader) {
    const text = await resp.text().catch(() => "");
    return { mode: "text", text, events: [], data: text };
  }

  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let content = "";
  const events = [];
  let pendingEvent = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = String(line || "").trim();
      if (!trimmed) continue;
      if (trimmed.startsWith("event:")) {
        pendingEvent = trimmed.slice(6).trim();
        continue;
      }
      if (trimmed.startsWith("id:")) continue;
      if (trimmed.startsWith("data:")) {
        const payloadText = trimmed.slice(5).trim();
        if (!payloadText || payloadText === "[DONE]") continue;
        let eventPayload = payloadText;
        try {
          eventPayload = JSON.parse(payloadText);
        } catch {
          // keep raw string
        }
        events.push({
          event: pendingEvent || "message",
          data: eventPayload,
        });
        const delta =
          typeof eventPayload === "string"
            ? eventPayload
            : eventPayload?.delta ??
              (Array.isArray(eventPayload?.content) ? eventPayload.content.map((item) => item?.text || item?.url || "").join("") : undefined) ??
              eventPayload?.content ??
              eventPayload?.message ??
              eventPayload?.data?.content ??
              "";
        if (typeof delta === "string") content += delta;
      } else {
        content += trimmed;
      }
    }
  }

  const tail = decoder.decode();
  if (tail) content += tail;
  return { mode: "stream", text: content, events, data: { events, text: content } };
};

export default function AIChatImagePlayground() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("赛博朋克风格的未来城市街道，霓虹灯光");
  const [moduleEnum, setModuleEnum] = useState("1");
  const [partEnum, setPartEnum] = useState("2");
  const [sessionId, setSessionId] = useState("63");
  const [modelId, setModelId] = useState("4");
  const [historyRecordId, setHistoryRecordId] = useState("");
  const [imageTaskTypeId, setImageTaskTypeId] = useState("");
  const [imageSizeId, setImageSizeId] = useState("");
  const [videoRatioId, setVideoRatioId] = useState("");
  const [videoResolutionId, setVideoResolutionId] = useState("");
  const [videoDurationId, setVideoDurationId] = useState("");
  const [tusdRemoteIdsText, setTusdRemoteIdsText] = useState("");
  const [files, setFiles] = useState([]);
  const [authorization, setAuthorization] = useState(() => resolveAuthorization());
  const [useBackendCurlProxy, setUseBackendCurlProxy] = useState(true);
  const [loading, setLoading] = useState(false);
  const [requestDump, setRequestDump] = useState("");
  const [responseDump, setResponseDump] = useState("");
  const [debugDump, setDebugDump] = useState("");
  const [modelParamsDump, setModelParamsDump] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [error, setError] = useState("");
  const [paramHint, setParamHint] = useState("");

  const endpoint = useMemo(() => buildUrl("/ai/aiChat"), []);
  const backendCurlEndpoint = useMemo(() => buildApiServerUrl("/api/ai_chat_image_via_curl"), []);
  const modelParamsEndpoint = useMemo(() => buildUrl("/ai/viewAIChatModelParams"), []);
  const tusdRemoteIds = useMemo(
    () =>
      String(tusdRemoteIdsText || "")
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean),
    [tusdRemoteIdsText],
  );

  const buildFormPreview = (values = {}) => {
    const entries = [
      ["history_ai_chat_record_id", `"${String(historyRecordId).trim()}"`],
      ["module_enum", `"${String(moduleEnum).trim()}"`],
      ["part_enum", `"${String(partEnum).trim()}"`],
      ["message", `"${String(message).trim()}"`],
      ["ai_chat_session_id", `"${String(sessionId).trim()}"`],
      ["ai_chat_model_id", `"${String(modelId).trim()}"`],
      ["ai_image_param_task_type_id", `"${String(values.imageTaskTypeId ?? imageTaskTypeId).trim()}"`],
      ["ai_image_param_size_id", `"${String(values.imageSizeId ?? imageSizeId).trim()}"`],
      ["ai_video_param_ratio_id", `"${String(values.videoRatioId ?? videoRatioId).trim()}"`],
      ["ai_video_param_resolution_id", `"${String(values.videoResolutionId ?? videoResolutionId).trim()}"`],
      ["ai_video_param_duration_id", `"${String(values.videoDurationId ?? videoDurationId).trim()}"`],
    ];
    const filteredEntries = entries.filter(([, value]) => value !== '""');
    const remoteIdEntries = tusdRemoteIds.map((item) => `tusd_file_remote_ids[]="${item}"`);
    const fileEntries = files.map((file) => `files=@${file.name}`);
    return [...filteredEntries.map(([key, value]) => `${key}=${value}`), ...remoteIdEntries, ...fileEntries].join("\n");
  };

  const buildCurlPreview = (values = {}) => {
    const authLine = authorization ? `--header 'authorization: ${shellEscape(authorization)}'` : "";
    const formLines = [
      historyRecordId ? `--form 'history_ai_chat_record_id=${shellEscape(`"${String(historyRecordId).trim()}"`)}'` : "",
      `--form 'module_enum=${shellEscape(`"${String(moduleEnum).trim()}"`)}'`,
      `--form 'part_enum=${shellEscape(`"${String(partEnum).trim()}"`)}'`,
      `--form 'message=${shellEscape(`"${String(message).trim()}"`)}'`,
      `--form 'ai_chat_session_id=${shellEscape(`"${String(sessionId).trim()}"`)}'`,
      `--form 'ai_chat_model_id=${shellEscape(`"${String(modelId).trim()}"`)}'`,
      (values.imageTaskTypeId ?? imageTaskTypeId)
        ? `--form 'ai_image_param_task_type_id=${shellEscape(`"${String(values.imageTaskTypeId ?? imageTaskTypeId).trim()}"`)}'`
        : "",
      (values.imageSizeId ?? imageSizeId)
        ? `--form 'ai_image_param_size_id=${shellEscape(`"${String(values.imageSizeId ?? imageSizeId).trim()}"`)}'`
        : "",
      (values.videoRatioId ?? videoRatioId)
        ? `--form 'ai_video_param_ratio_id=${shellEscape(`"${String(values.videoRatioId ?? videoRatioId).trim()}"`)}'`
        : "",
      (values.videoResolutionId ?? videoResolutionId)
        ? `--form 'ai_video_param_resolution_id=${shellEscape(`"${String(values.videoResolutionId ?? videoResolutionId).trim()}"`)}'`
        : "",
      (values.videoDurationId ?? videoDurationId)
        ? `--form 'ai_video_param_duration_id=${shellEscape(`"${String(values.videoDurationId ?? videoDurationId).trim()}"`)}'`
        : "",
      ...tusdRemoteIds.map((item) => `--form 'tusd_file_remote_ids[]=${shellEscape(`"${item}"`)}'`),
      ...files.map((file) => `--form 'files=@${shellEscape(file.name)}'`),
    ].filter(Boolean);
    return [
      `curl --location '${endpoint}' \\`,
      authLine ? `${authLine} \\` : "",
      ...formLines.map((line, index) => (index === formLines.length - 1 ? line : `${line} \\`)),
    ]
      .filter(Boolean)
      .join("\n");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setImageUrl("");
    setResponseDump("");
    setDebugDump("");
    setModelParamsDump("");
    setParamHint("");

    let nextImageTaskTypeId = imageTaskTypeId;
    let nextImageSizeId = imageSizeId;
    let nextVideoRatioId = videoRatioId;
    let nextVideoResolutionId = videoResolutionId;
    let nextVideoDurationId = videoDurationId;

    if (String(partEnum).trim() === "2" && (!nextImageTaskTypeId || !nextImageSizeId)) {
      try {
        const numericModelId = Number(modelId);
        const paramsResp = await fetch(modelParamsEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(authorization ? { authorization } : {}),
          },
          body: JSON.stringify({
            ai_chat_model_id: Number.isFinite(numericModelId) ? numericModelId : modelId,
          }),
        });
        const paramsData = await paramsResp.json().catch(() => ({}));
        setModelParamsDump(stringify(paramsData));
        const defaultParams = buildDefaultParamPayload(extractParamList(paramsData?.data || paramsData));
        nextImageTaskTypeId = nextImageTaskTypeId || defaultParams.ai_image_param_task_type_id || "";
        nextImageSizeId = nextImageSizeId || defaultParams.ai_image_param_size_id || "";
        nextVideoRatioId = nextVideoRatioId || defaultParams.ai_video_param_ratio_id || "";
        nextVideoResolutionId = nextVideoResolutionId || defaultParams.ai_video_param_resolution_id || "";
        nextVideoDurationId = nextVideoDurationId || defaultParams.ai_video_param_duration_id || "";
        setParamHint(`已自动补默认参数: task=${nextImageTaskTypeId || "-"}, size=${nextImageSizeId || "-"}, ratio=${nextVideoRatioId || "-"}`);
      } catch (paramError) {
        setParamHint(`模型参数自动补全失败: ${paramError?.message || String(paramError)}`);
      }
    }

    const formData = new FormData();
    appendQuotedFormValue(formData, "history_ai_chat_record_id", historyRecordId);
    appendQuotedFormValue(formData, "module_enum", moduleEnum);
    appendQuotedFormValue(formData, "part_enum", partEnum);
    appendQuotedFormValue(formData, "message", message);
    appendQuotedFormValue(formData, "ai_chat_session_id", sessionId);
    appendQuotedFormValue(formData, "ai_chat_model_id", modelId);
    appendQuotedFormValue(formData, "ai_image_param_task_type_id", nextImageTaskTypeId);
    appendQuotedFormValue(formData, "ai_image_param_size_id", nextImageSizeId);
    appendQuotedFormValue(formData, "ai_video_param_ratio_id", nextVideoRatioId);
    appendQuotedFormValue(formData, "ai_video_param_resolution_id", nextVideoResolutionId);
    appendQuotedFormValue(formData, "ai_video_param_duration_id", nextVideoDurationId);
    tusdRemoteIds.forEach((item) => appendQuotedFormValue(formData, "tusd_file_remote_ids[]", item));
    files.forEach((file) => formData.append("files", file));

    setRequestDump(
      [
        `url: ${endpoint}`,
        `authorization: ${authorization ? `${authorization.slice(0, 18)}...` : "(empty)"}`,
        "",
        "form-data:",
        buildFormPreview({
          imageTaskTypeId: nextImageTaskTypeId,
          imageSizeId: nextImageSizeId,
          videoRatioId: nextVideoRatioId,
          videoResolutionId: nextVideoResolutionId,
          videoDurationId: nextVideoDurationId,
        }),
        "",
        `param-hint: task=${nextImageTaskTypeId || "-"}, size=${nextImageSizeId || "-"}, ratio=${nextVideoRatioId || "-"}`,
        "",
        "curl:",
        buildCurlPreview({
          imageTaskTypeId: nextImageTaskTypeId,
          imageSizeId: nextImageSizeId,
          videoRatioId: nextVideoRatioId,
          videoResolutionId: nextVideoResolutionId,
          videoDurationId: nextVideoDurationId,
        }),
      ].join("\n"),
    );

    try {
      const requestInit = {
        method: "POST",
        headers: authorization ? { authorization } : undefined,
        body: formData,
      };
      const candidates = useBackendCurlProxy
        ? [
            {
              source: "window.fetch(api-server-curl-proxy)",
              timeoutMs: 0,
              caller: (_url) =>
                fetch(backendCurlEndpoint, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    endpoint,
                    authorization,
                    history_ai_chat_record_id: historyRecordId,
                    module_enum: moduleEnum,
                    part_enum: partEnum,
                    message,
                    ai_chat_session_id: sessionId,
                    ai_chat_model_id: modelId,
                    ai_image_param_task_type_id: nextImageTaskTypeId,
                    ai_image_param_size_id: nextImageSizeId,
                    ai_video_param_ratio_id: nextVideoRatioId,
                    ai_video_param_resolution_id: nextVideoResolutionId,
                    ai_video_param_duration_id: nextVideoDurationId,
                    tusd_file_remote_ids: tusdRemoteIds,
                  }),
                }),
            },
          ]
        : [
            {
              source: "window.fetch(member-api)",
              timeoutMs: 0,
              caller: (url, init) => fetch(url, init),
            },
          ];
      

      const debugTimeline = {
        endpoint,
        candidates: candidates.map((item) => ({ source: item.source, timeoutMs: item.timeoutMs })),
        attempts: [],
      };

      let resp = null;
      let usedSource = "";
      for (const candidate of candidates) {
        const attempt = {
          source: candidate.source,
          timeoutMs: candidate.timeoutMs,
          request: {
            url: endpoint,
            form: {
              history_ai_chat_record_id: historyRecordId ? `"${String(historyRecordId).trim()}"` : "",
              module_enum: `"${String(moduleEnum).trim()}"`,
              part_enum: `"${String(partEnum).trim()}"`,
              message: `"${String(message).trim()}"`,
              ai_chat_session_id: `"${String(sessionId).trim()}"`,
              ai_chat_model_id: `"${String(modelId).trim()}"`,
              ai_image_param_task_type_id: nextImageTaskTypeId ? `"${String(nextImageTaskTypeId).trim()}"` : "",
              ai_image_param_size_id: nextImageSizeId ? `"${String(nextImageSizeId).trim()}"` : "",
              ai_video_param_ratio_id: nextVideoRatioId ? `"${String(nextVideoRatioId).trim()}"` : "",
              ai_video_param_resolution_id: nextVideoResolutionId ? `"${String(nextVideoResolutionId).trim()}"` : "",
              ai_video_param_duration_id: nextVideoDurationId ? `"${String(nextVideoDurationId).trim()}"` : "",
              tusd_file_remote_ids: tusdRemoteIds,
              files: files.map((file) => file.name),
            },
          },
        };
        try {
          const result = await callWithLocalTimeout(candidate, endpoint, requestInit);
          resp = result.resp;
          usedSource = candidate.source;
          attempt.durationMs = result.durationMs;
          attempt.ok = !!resp?.ok;
          attempt.status = resp?.status;
          attempt.headers = snapshotHeaders(resp?.headers);
          debugTimeline.attempts.push(attempt);
          break;
        } catch (attemptError) {
          attempt.error = attemptError?.message || String(attemptError);
          debugTimeline.attempts.push(attempt);
        }
      }

      setDebugDump(stringify(debugTimeline));

      if (!resp) {
        throw new Error("所有候选请求源都失败了");
      }

      if (!resp?.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data?.message || data?.detail || `HTTP ${resp?.status || 500}`);
      }

      let parsed = null;
      let doneError = "";
      let resolvedImageUrl = "";
      if (useBackendCurlProxy) {
        const proxyData = await resp.json().catch(() => ({}));
        parsed = {
          mode: "proxy-json",
          text: typeof proxyData?.text === "string" ? proxyData.text : stringify(proxyData),
          events: Array.isArray(proxyData?.events) ? proxyData.events : [],
          data: proxyData,
        };
        doneError = String(proxyData?.done_error || "").trim();
        resolvedImageUrl = String(proxyData?.image_url || "").trim();
      } else {
        parsed = await parseAiChatResponse(resp);
        doneError = extractDoneError(parsed.events);
        resolvedImageUrl =
          extractImageUrlFromAIChatEvents(parsed.events) ||
          pickFirstImageUrl(parsed.data) ||
          pickFirstImageUrl(parsed.events) ||
          pickFirstImageUrl(parsed.text);
      }

      setResponseDump(
        stringify({
          source: usedSource,
          status: resp.status,
          headers: snapshotHeaders(resp.headers),
          mode: parsed.mode,
          image_url: resolvedImageUrl || "",
          done_error: doneError || "",
          text: parsed.text || "",
          events: parsed.events,
        }),
      );

      if (doneError && !resolvedImageUrl) {
        throw new Error(doneError);
      }
      if (!resolvedImageUrl) {
        throw new Error("未从 AI Chat 响应中解析到图片 URL");
      }
      setImageUrl(resolvedImageUrl);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">AI Chat 文生图调试页</h1>
            <p className="mt-1 text-sm text-slate-400">{endpoint}</p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/app")}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:border-slate-500"
          >
            <ArrowLeft className="h-4 w-4" />
            返回工作台
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
          <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1 block text-xs text-slate-400">authorization</span>
                <textarea
                  value={authorization}
                  onChange={(e) => setAuthorization(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs outline-none focus:border-cyan-500"
                />
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200">
                <input
                  type="checkbox"
                  checked={useBackendCurlProxy}
                  onChange={(e) => setUseBackendCurlProxy(e.target.checked)}
                />
                通过后端 curl 代理获取文生图结果
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-400">history_ai_chat_record_id</span>
                  <input
                    value={historyRecordId}
                    onChange={(e) => setHistoryRecordId(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-cyan-500"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-400">module_enum</span>
                  <input
                    value={moduleEnum}
                    onChange={(e) => setModuleEnum(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-cyan-500"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-400">part_enum</span>
                  <input
                    value={partEnum}
                    onChange={(e) => setPartEnum(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-cyan-500"
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-400">ai_chat_session_id</span>
                  <input
                    value={sessionId}
                    onChange={(e) => setSessionId(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-cyan-500"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-400">ai_chat_model_id</span>
                  <input
                    value={modelId}
                    onChange={(e) => setModelId(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-cyan-500"
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-400">ai_image_param_task_type_id</span>
                  <input
                    value={imageTaskTypeId}
                    onChange={(e) => setImageTaskTypeId(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-cyan-500"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-400">ai_image_param_size_id</span>
                  <input
                    value={imageSizeId}
                    onChange={(e) => setImageSizeId(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-cyan-500"
                  />
                </label>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-400">ai_video_param_ratio_id</span>
                  <input
                    value={videoRatioId}
                    onChange={(e) => setVideoRatioId(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-cyan-500"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-400">ai_video_param_resolution_id</span>
                  <input
                    value={videoResolutionId}
                    onChange={(e) => setVideoResolutionId(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-cyan-500"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-400">ai_video_param_duration_id</span>
                  <input
                    value={videoDurationId}
                    onChange={(e) => setVideoDurationId(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-cyan-500"
                  />
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block text-xs text-slate-400">message</span>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={5}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-cyan-500"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-slate-400">tusd_file_remote_ids[]</span>
                <textarea
                  value={tusdRemoteIdsText}
                  onChange={(e) => setTusdRemoteIdsText(e.target.value)}
                  rows={3}
                  placeholder="每行一个 id，或逗号分隔"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-cyan-500"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-slate-400">files</span>
                <input
                  type="file"
                  multiple
                  onChange={(e) => setFiles(Array.from(e.target.files || []))}
                  className="block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-cyan-600 file:px-3 file:py-1.5 file:text-white"
                />
                {files.length ? <div className="mt-2 text-xs text-slate-400">{files.map((file) => file.name).join(", ")}</div> : null}
              </label>
              <button
                type="submit"
                disabled={loading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:bg-slate-700"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                发送文生图请求
              </button>
              {error ? <div className="rounded-lg border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-200">{error}</div> : null}
              {paramHint ? <div className="rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs text-slate-300">{paramHint}</div> : null}
            </div>
          </form>

          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-200">
                <ImageIcon className="h-4 w-4 text-cyan-400" />
                生成结果
              </div>
              {imageUrl ? (
                <div className="space-y-3">
                  <img src={imageUrl} alt="AI Chat result" className="max-h-[520px] w-full rounded-xl border border-slate-800 object-contain bg-slate-950" />
                  <a href={imageUrl} target="_blank" rel="noreferrer" className="text-sm text-cyan-300 hover:text-cyan-200">
                    {imageUrl}
                  </a>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/70 px-4 py-10 text-center text-sm text-slate-500">
                  结果图片会显示在这里
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
              <div className="mb-2 text-sm font-medium text-slate-200">请求体</div>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-slate-950 px-3 py-3 text-xs text-slate-200">
                {requestDump || "--"}
              </pre>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
              <div className="mb-2 text-sm font-medium text-slate-200">响应体</div>
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-slate-950 px-3 py-3 text-xs text-slate-200">
                {responseDump || "--"}
              </pre>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
              <div className="mb-2 text-sm font-medium text-slate-200">模型参数原始返回</div>
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-slate-950 px-3 py-3 text-xs text-slate-200">
                {modelParamsDump || "--"}
              </pre>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
              <div className="mb-2 text-sm font-medium text-slate-200">完整调试信息</div>
              <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-all rounded-xl bg-slate-950 px-3 py-3 text-xs text-slate-200">
                {debugDump || "--"}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
