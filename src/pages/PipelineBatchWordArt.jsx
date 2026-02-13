import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Download,
  ImagePlus,
  Loader2,
  Play,
  RotateCcw,
  Square,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Link } from "../router";
import { useAuth } from "../auth/AuthProvider";

const DEFAULT_COPY_TEXT = "YSL!!!\n你真的让我感觉陌生\n900多到手\n3个气垫3支口红\n错过真没有了";
// Keep defaults in sync with bananaflow/workflows/textoverlay.json.
const DEFAULT_FONT_NAME = "DouyinSansBold.ttf";
const DEFAULT_FONT_SIZE = 50;
const DEFAULT_BOLD_STRENGTH = 2;
const DEFAULT_BOLD_TEXTS = ["YSL!!!", "你真的让我感觉陌生", "", "", ""];
const DEFAULT_TEXT_BG_OPACITY = 1;
const DEFAULT_TEXT_BG_PADDING = 10;
const DEFAULT_HIGHLIGHT_TEXTS = ["YSL!!!", "", "", "", ""];
const DEFAULT_HIGHLIGHT_OPACITY = 1;
const DEFAULT_HIGHLIGHT_PADDING = 1;
const DEFAULT_COLOR_MODE = "custom";
const DEFAULT_ALIGN = "top";
const DEFAULT_JUSTIFY = "center";
const DEFAULT_MARGINS = 5;
const DEFAULT_LINE_SPACING = 10;
const DEFAULT_POSITION_X = 0;
const DEFAULT_POSITION_Y = 0;
const DEFAULT_ROTATION_ANGLE = 0;
const DEFAULT_ROTATION_OPTIONS = "text center";
const DEFAULT_FONT_COLOR_HEX = "#000000";
const DEFAULT_TEXT_BG_COLOR_HEX = "#000000";
const DEFAULT_HIGHLIGHT_COLOR_HEXES = ["#FFFF00", "#FFFF00", "#FFFF00", "#FFFF00", "#FFFF00"];
const DEFAULT_VIDEO_PROMPT =
  "画面轻微晃动，镜头产生呼吸感；画面中不出现任何额外元素，商品保持静止。";
const DEFAULT_VIDEO_DURATION = 3;
const DEFAULT_VIDEO_RESOLUTION = "1080p";
const DEFAULT_VIDEO_RATIO = "adaptive";
const MOTION_RESOLUTION_OPTIONS = [
  { label: "480P", value: "480p" },
  { label: "720P", value: "720p" },
  { label: "1080P", value: "1080p" },
];

const normalizeHexColor = (value, fallback) => {
  const v = (value || "").trim();
  if (/^#?[0-9a-fA-F]{6}$/.test(v)) {
    return v.startsWith("#") ? v : `#${v}`;
  }
  return fallback;
};

const generateId = () => Math.random().toString(36).slice(2, 11);

const extractApiError = (data) => {
  const d = data?.detail ?? data?.message ?? data;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x?.msg || JSON.stringify(x)).join(" ; ");
  if (d && typeof d === "object") return JSON.stringify(d);
  return String(d);
};

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });

const buildResultsSeed = (items) =>
  items.map((item) => ({
    id: item.id,
    inputUrl: item.url,
    inputName: item.name,
    outputUrl: null,
    status: "pending",
    error: null,
    videoUrl: null,
    videoStatus: "idle",
    videoError: null,
  }));
const MAX_CONCURRENT = 2;
const COMPACT_INPUT_CLASS =
  "w-full rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 px-2.5 py-1.5 focus:outline-none focus:border-purple-500";
const COMPACT_COLOR_INPUT_CLASS =
  "h-8 w-11 rounded border border-slate-700 bg-slate-950";

const PipelineBatchWordArt = () => {
  const { apiFetch } = useAuth();
  const [mainImages, setMainImages] = useState([]);
  const [copyText, setCopyText] = useState(DEFAULT_COPY_TEXT);
  const [fontName, setFontName] = useState(DEFAULT_FONT_NAME);
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);
  const [boldStrength, setBoldStrength] = useState(DEFAULT_BOLD_STRENGTH);
  const [boldTexts, setBoldTexts] = useState(DEFAULT_BOLD_TEXTS);
  const [fontColorHex, setFontColorHex] = useState(DEFAULT_FONT_COLOR_HEX);
  const [textBgColorHex, setTextBgColorHex] = useState(DEFAULT_TEXT_BG_COLOR_HEX);
  const [textBgOpacity, setTextBgOpacity] = useState(DEFAULT_TEXT_BG_OPACITY);
  const [textBgPadding, setTextBgPadding] = useState(DEFAULT_TEXT_BG_PADDING);
  const [highlightTexts, setHighlightTexts] = useState(DEFAULT_HIGHLIGHT_TEXTS);
  const [highlightColorHexes, setHighlightColorHexes] = useState(DEFAULT_HIGHLIGHT_COLOR_HEXES);
  const [highlightOpacity, setHighlightOpacity] = useState(DEFAULT_HIGHLIGHT_OPACITY);
  const [highlightPadding, setHighlightPadding] = useState(DEFAULT_HIGHLIGHT_PADDING);
  const [align, setAlign] = useState(DEFAULT_ALIGN);
  const [justify, setJustify] = useState(DEFAULT_JUSTIFY);
  const [margins, setMargins] = useState(DEFAULT_MARGINS);
  const [lineSpacing, setLineSpacing] = useState(DEFAULT_LINE_SPACING);
  const [positionX, setPositionX] = useState(DEFAULT_POSITION_X);
  const [positionY, setPositionY] = useState(DEFAULT_POSITION_Y);
  const [rotationAngle, setRotationAngle] = useState(DEFAULT_ROTATION_ANGLE);
  const [rotationOptions, setRotationOptions] = useState(DEFAULT_ROTATION_OPTIONS);
  const [videoResolution, setVideoResolution] = useState(DEFAULT_VIDEO_RESOLUTION);
  const [results, setResults] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [previewImage, setPreviewImage] = useState(null);
  const [previewVideo, setPreviewVideo] = useState(null);
  const resultsSeedRef = useRef([]);
  const abortControllerRef = useRef(null);
  const mainInputRef = useRef(null);

  const effectiveCopy = useMemo(() => {
    if (copyText && copyText.trim()) return copyText;
    return DEFAULT_COPY_TEXT;
  }, [copyText]);

  const normalizedFontColorHex = useMemo(
    () => normalizeHexColor(fontColorHex, DEFAULT_FONT_COLOR_HEX),
    [fontColorHex],
  );
  const normalizedTextBgColorHex = useMemo(
    () => normalizeHexColor(textBgColorHex, DEFAULT_TEXT_BG_COLOR_HEX),
    [textBgColorHex],
  );
  const normalizedHighlightColorHexes = useMemo(
    () =>
      highlightColorHexes.map((item, idx) =>
        normalizeHexColor(item, DEFAULT_HIGHLIGHT_COLOR_HEXES[idx] || DEFAULT_TEXT_BG_COLOR_HEX),
      ),
    [highlightColorHexes],
  );

  const hasReadyInputs = mainImages.length > 0;

  const totalSuccess = useMemo(() => results.filter((item) => item.status === "success").length, [results]);
  const totalFailed = useMemo(
    () => results.filter((item) => item.status === "error" || item.status === "cancelled").length,
    [results],
  );
  const retryableCount = useMemo(
    () => results.filter((item) => item.status === "error" || item.status === "cancelled" || item.status === "pending").length,
    [results],
  );
  const motionTargets = useMemo(
    () => results.filter((item) => item.outputUrl && item.videoStatus !== "running"),
    [results],
  );
  const hasMotionRunning = useMemo(
    () => results.some((item) => item.videoStatus === "running"),
    [results],
  );
  const progressPct = useMemo(() => {
    if (!progress.total) return 0;
    return Math.min(100, Math.round((progress.done / progress.total) * 100));
  }, [progress.done, progress.total]);

  const updateResult = useCallback((id, patch) => {
    setResults((prev) => {
      const base = prev.length ? prev : resultsSeedRef.current;
      if (!base.length) return prev;
      const next = base.map((item) => (item.id === id ? { ...item, ...patch } : item));
      resultsSeedRef.current = next;
      return next;
    });
  }, [resultsSeedRef]);

  const updateBoldText = useCallback((index, value) => {
    setBoldTexts((prev) => {
      const next = [...prev];
      while (next.length < 5) next.push("");
      next[index] = value;
      return next;
    });
  }, []);

  const updateHighlightText = useCallback((index, value) => {
    setHighlightTexts((prev) => {
      const next = [...prev];
      while (next.length < 5) next.push("");
      next[index] = value;
      return next;
    });
  }, []);

  const updateHighlightColorHex = useCallback((index, value) => {
    setHighlightColorHexes((prev) => {
      const next = [...prev];
      while (next.length < 5) next.push("");
      next[index] = value;
      return next;
    });
  }, []);

  const handleMainFiles = useCallback(async (files) => {
    const fileList = Array.from(files || []).filter((file) => file.type.startsWith("image/"));
    if (fileList.length === 0) return;

    const newItems = [];
    for (const file of fileList) {
      const url = await readFileAsDataUrl(file);
      newItems.push({ id: generateId(), name: file.name, url, file });
    }

    setMainImages((prev) => [...prev, ...newItems]);
    setResults([]);
  }, []);

  const removeMainImage = useCallback((id) => {
    setMainImages((prev) => prev.filter((item) => item.id !== id));
    setResults((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearMainImages = useCallback(() => {
    setMainImages([]);
    setResults([]);
  }, []);

  const runTasks = useCallback(async (tasks) => {
    if (!tasks.length || isRunning) return;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsRunning(true);
    setError("");
    setProgress({ done: 0, total: tasks.length });

    let cursor = 0;
    const nextTask = () => {
      if (controller.signal.aborted) return null;
      const task = tasks[cursor];
      cursor += 1;
      return task || null;
    };

    const workers = Array.from({ length: Math.min(MAX_CONCURRENT, tasks.length) }, () =>
      (async () => {
        while (true) {
          const task = nextTask();
          if (!task) break;
          updateResult(task.id, { status: "running", error: null, videoUrl: null, videoStatus: "idle", videoError: null });

          try {
            const boldTextValues = boldTexts.map((val) => (val || "").trim());
            const highlightTextValues = highlightTexts.map((val) => (val || "").trim());
            const overlayResp = await apiFetch(`/api/overlaytext`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: controller.signal,
              body: JSON.stringify({
                image: task.inputUrl,
                text: effectiveCopy,
                font_name: fontName,
                font_size: fontSize,
                bold_strength: boldStrength,
                bold_text_1: boldTextValues[0] || "",
                bold_text_2: boldTextValues[1] || "",
                bold_text_3: boldTextValues[2] || "",
                bold_text_4: boldTextValues[3] || "",
                bold_text_5: boldTextValues[4] || "",
                font_color: DEFAULT_COLOR_MODE,
                text_bg_color: DEFAULT_COLOR_MODE,
                text_bg_opacity: textBgOpacity,
                text_bg_padding: textBgPadding,
                highlight_text_1: highlightTextValues[0] || "",
                highlight_text_2: highlightTextValues[1] || "",
                highlight_text_3: highlightTextValues[2] || "",
                highlight_text_4: highlightTextValues[3] || "",
                highlight_text_5: highlightTextValues[4] || "",
                highlight_color_1: DEFAULT_COLOR_MODE,
                highlight_color_2: DEFAULT_COLOR_MODE,
                highlight_color_3: DEFAULT_COLOR_MODE,
                highlight_color_4: DEFAULT_COLOR_MODE,
                highlight_color_5: DEFAULT_COLOR_MODE,
                highlight_opacity: highlightOpacity,
                highlight_padding: highlightPadding,
                align,
                justify,
                margins,
                line_spacing: lineSpacing,
                position_x: positionX,
                position_y: positionY,
                rotation_angle: rotationAngle,
                rotation_options: rotationOptions,
                font_color_hex: normalizedFontColorHex,
                text_bg_color_hex: normalizedTextBgColorHex,
                highlight_color_hex_1: normalizedHighlightColorHexes[0] || DEFAULT_HIGHLIGHT_COLOR_HEXES[0],
                highlight_color_hex_2: normalizedHighlightColorHexes[1] || DEFAULT_HIGHLIGHT_COLOR_HEXES[1],
                highlight_color_hex_3: normalizedHighlightColorHexes[2] || DEFAULT_HIGHLIGHT_COLOR_HEXES[2],
                highlight_color_hex_4: normalizedHighlightColorHexes[3] || DEFAULT_HIGHLIGHT_COLOR_HEXES[3],
                highlight_color_hex_5: normalizedHighlightColorHexes[4] || DEFAULT_HIGHLIGHT_COLOR_HEXES[4],
              }),
            });

            const overlayData = await overlayResp.json().catch(() => ({}));
            if (!overlayResp.ok) throw new Error(`生成失败：${extractApiError(overlayData)}`);

            const outputUrl = overlayData.image || overlayData.images?.[0];
            if (!outputUrl) throw new Error("未返回生成结果");

            updateResult(task.id, {
              status: "success",
              outputUrl,
              error: null,
              videoUrl: null,
              videoStatus: "idle",
              videoError: null,
            });
          } catch (err) {
            if (controller.signal.aborted) {
              updateResult(task.id, { status: "cancelled", error: "任务已取消" });
            } else {
              updateResult(task.id, { status: "error", error: err?.message || String(err) });
            }
          } finally {
            setProgress((prev) => ({ done: prev.done + 1, total: prev.total }));
          }
        }
      })(),
    );

    await Promise.all(workers);
    abortControllerRef.current = null;
    setIsRunning(false);
  }, [
    apiFetch,
    effectiveCopy,
    isRunning,
    fontName,
    fontSize,
    boldStrength,
    boldTexts,
    textBgOpacity,
    textBgPadding,
    highlightTexts,
    highlightOpacity,
    highlightPadding,
    align,
    justify,
    margins,
    lineSpacing,
    positionX,
    positionY,
    rotationAngle,
    rotationOptions,
    normalizedFontColorHex,
    normalizedTextBgColorHex,
    normalizedHighlightColorHexes,
    updateResult,
  ]);

  const handleRun = useCallback(async () => {
    if (isRunning) return;
    if (mainImages.length === 0) {
      setError("请先上传主图");
      return;
    }

    const seed = buildResultsSeed(mainImages);
    resultsSeedRef.current = seed;
    setResults(seed);
    await runTasks(seed);
  }, [isRunning, mainImages, runTasks]);

  const handleRetryFailed = useCallback(async () => {
    if (isRunning) return;
    const failed = (resultsSeedRef.current.length ? resultsSeedRef.current : results).filter(
      (item) => item.status === "error" || item.status === "cancelled" || item.status === "pending",
    );
    if (!failed.length) {
      setError("当前没有可重试的失败任务");
      return;
    }
    failed.forEach((item) => updateResult(item.id, { status: "pending", error: null }));
    await runTasks(failed.map((item) => ({ ...item, outputUrl: null })));
  }, [isRunning, results, runTasks, updateResult]);

  const handleCancel = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const handleDropMain = useCallback(
    (event) => {
      event.preventDefault();
      handleMainFiles(event.dataTransfer?.files);
    },
    [handleMainFiles],
  );

  const handleGenerateMotion = useCallback(async (item) => {
    if (!item?.outputUrl) return;
    if (item.videoStatus === "running") return;

    updateResult(item.id, { videoStatus: "running", videoError: null });
    try {
      const resp = await apiFetch(`/api/img2video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "Doubao-Seedance-1.0-pro",
          image: item.outputUrl,
          last_frame_image: null,
          prompt: DEFAULT_VIDEO_PROMPT,
          duration: DEFAULT_VIDEO_DURATION,
          fps: 24,
          camera_fixed: false,
          resolution: videoResolution,
          ratio: DEFAULT_VIDEO_RATIO,
          seed: 21,
        }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(extractApiError(data));

      const outputUrl = data.video || data.image || data.images?.[0];
      if (!outputUrl) throw new Error("未返回动图结果");
      updateResult(item.id, { videoStatus: "success", videoUrl: outputUrl, videoError: null });
    } catch (err) {
      updateResult(item.id, { videoStatus: "error", videoError: err?.message || String(err) });
    }
  }, [apiFetch, updateResult, videoResolution]);

  const handleGenerateAllMotion = useCallback(async () => {
    if (motionTargets.length === 0) return;
    await Promise.allSettled(motionTargets.map((item) => handleGenerateMotion(item)));
  }, [handleGenerateMotion, motionTargets]);

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      <header className="px-4 sm:px-6 py-4 border-b border-slate-800 bg-slate-900/60">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Link to="/app" className="flex items-center gap-2 text-slate-400 hover:text-white text-sm">
            <ArrowLeft className="w-4 h-4" />
            返回工作台
          </Link>
          <div className="w-px h-5 bg-slate-800" />
          <div>
            <h1 className="text-lg font-bold">批量花字</h1>
            <p className="text-xs text-slate-400">批量给主图添加花字文案与样式</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <div className="text-xs text-slate-400">
            {progress.total > 0 ? `进度 ${progress.done}/${progress.total} (${progressPct}%)` : "等待任务"}
          </div>
          {isRunning && (
            <button
              onClick={handleCancel}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-amber-500/50 text-amber-200 bg-amber-500/10 hover:bg-amber-500/15 transition-colors"
            >
              <Square className="w-3.5 h-3.5" />
              取消
            </button>
          )}
          <button
            onClick={handleRetryFailed}
            disabled={isRunning || retryableCount === 0}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
              !isRunning && retryableCount > 0
                ? "bg-slate-800 border-slate-700 hover:border-purple-500 hover:text-white"
                : "bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed"
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            重试失败
          </button>
          <button
            onClick={handleRun}
            disabled={!hasReadyInputs || isRunning}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
              hasReadyInputs && !isRunning
                ? "bg-purple-600 border-purple-500 hover:bg-purple-500"
                : "bg-slate-800 border-slate-700 text-slate-500 cursor-not-allowed"
            }`}
          >
            {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {isRunning ? "处理中" : "开始生成"}
          </button>
        </div>
        </div>
      </header>

      <div className="flex-1 px-4 sm:px-6 py-4 space-y-4">
        {progress.total > 0 && (
          <div className="space-y-1.5" aria-live="polite">
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-purple-500 transition-all duration-300" style={{ width: `${progressPct}%` }} />
            </div>
            <div className="text-[11px] text-slate-400">
              成功 {totalSuccess} · 失败 {totalFailed} · 总计 {progress.total}
            </div>
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 bg-red-950/60 border border-red-800 text-red-200 px-4 py-2 rounded-lg text-sm">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-6">
          <section
            className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col gap-4"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDropMain}
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">主图添加区域</h2>
                <p className="text-xs text-slate-500">支持批量上传，多图将自动依次处理</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => mainInputRef.current?.click()}
                  className="text-xs px-3 py-1.5 rounded-md bg-slate-800 border border-slate-700 hover:border-purple-500 hover:text-white transition-colors"
                >
                  <Upload className="w-3 h-3 inline-block mr-1" />
                  添加图片
                </button>
                <button
                  onClick={clearMainImages}
                  disabled={mainImages.length === 0}
                  className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                    mainImages.length
                      ? "bg-slate-800 border-slate-700 hover:border-red-500 hover:text-white"
                      : "bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed"
                  }`}
                >
                  <Trash2 className="w-3 h-3 inline-block mr-1" />
                  清空
                </button>
              </div>
            </div>

            <input
              ref={mainInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleMainFiles(e.target.files)}
            />

            {mainImages.length === 0 ? (
              <div className="flex flex-col items-center justify-center border border-dashed border-slate-700 rounded-xl py-10 text-slate-500">
                <ImagePlus className="w-8 h-8 mb-2" />
                <div className="text-sm">拖拽或点击上传主图</div>
                <div className="text-xs text-slate-600 mt-1">支持 JPG/PNG，多张批量导入</div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {mainImages.map((item) => (
                  <div key={item.id} className="relative group rounded-lg overflow-hidden border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setPreviewImage(item.url)}
                      className="block w-full h-28"
                      title="点击放大预览"
                    >
                      <img src={item.url} alt={item.name} className="w-full h-full object-cover" />
                    </button>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        removeMainImage(item.id);
                      }}
                      className="absolute top-1 right-1 bg-black/60 p-1 rounded-full opacity-0 group-hover:opacity-100 transition"
                      title="移除"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

        </div>

        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold">文案内容</h2>
              <p className="text-xs text-slate-500">参数与 workflow/textoverlay.json 中节点一一对应</p>
            </div>
            <div className="text-xs text-slate-500">已完成 {totalSuccess}/{results.length || 0}</div>
          </div>

          <div className="mt-3 grid grid-cols-1 xl:grid-cols-3 gap-3">
            <div className="space-y-3">
              <label className="text-xs text-slate-400 space-y-2">
                <span className="block">文案内容（可编辑）</span>
                <textarea
                  value={copyText}
                  onChange={(e) => setCopyText(e.target.value)}
                  rows={4}
                  className={COMPACT_INPUT_CLASS}
                />
                <div className="text-[11px] text-slate-500">留空将自动使用默认文案。</div>
              </label>

              <div className="text-xs text-slate-400 space-y-2">
                <span className="block">加粗内容（bold_text_1 ~ 5）</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2 gap-2">
                  {Array.from({ length: 5 }).map((_, idx) => (
                    <input
                      key={`bold-text-${idx}`}
                      value={boldTexts[idx] || ""}
                      onChange={(e) => updateBoldText(idx, e.target.value)}
                      placeholder={`加粗内容 ${idx + 1}`}
                      className={COMPACT_INPUT_CLASS}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="text-xs text-slate-400 space-y-2">
              <span className="block">高亮设置（highlight_text / color_hex）</span>
              {Array.from({ length: 5 }).map((_, idx) => (
                <div key={`highlight-${idx}`} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr),44px,112px] gap-2 items-center">
                  <input
                    value={highlightTexts[idx] || ""}
                    onChange={(e) => updateHighlightText(idx, e.target.value)}
                    placeholder={`高亮内容 ${idx + 1}`}
                    className={COMPACT_INPUT_CLASS}
                  />
                  <input
                    type="color"
                    value={normalizedHighlightColorHexes[idx] || DEFAULT_HIGHLIGHT_COLOR_HEXES[idx]}
                    onChange={(e) => updateHighlightColorHex(idx, e.target.value)}
                    className={COMPACT_COLOR_INPUT_CLASS}
                  />
                  <input
                    value={highlightColorHexes[idx] || ""}
                    onChange={(e) => updateHighlightColorHex(idx, e.target.value)}
                    placeholder={DEFAULT_HIGHLIGHT_COLOR_HEXES[idx]}
                    className={COMPACT_INPUT_CLASS}
                  />
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <div className="text-xs text-slate-400 space-y-2">
                <span className="block">字体设置</span>
                <label className="space-y-2">
                  <span className="block">字体文件名（font_name）</span>
                  <input
                    value={fontName}
                    onChange={(e) => setFontName(e.target.value)}
                    placeholder={DEFAULT_FONT_NAME}
                    className={COMPACT_INPUT_CLASS}
                  />
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label className="space-y-2">
                    <span className="block">字号（font_size）</span>
                    <input
                      type="number"
                      step={1}
                      value={fontSize}
                      onChange={(e) => {
                        const next = Number(e.target.value);
                        setFontSize(Number.isNaN(next) ? DEFAULT_FONT_SIZE : next);
                      }}
                      className={COMPACT_INPUT_CLASS}
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="block">加粗强度（bold_strength）</span>
                    <input
                      type="number"
                      step={1}
                      value={boldStrength}
                      onChange={(e) => {
                        const next = Number(e.target.value);
                        setBoldStrength(Number.isNaN(next) ? DEFAULT_BOLD_STRENGTH : next);
                      }}
                      className={COMPACT_INPUT_CLASS}
                    />
                  </label>
                </div>
              </div>

              <div className="text-xs text-slate-400 space-y-2">
                <span className="block">颜色与底色</span>
                <label className="space-y-2">
                  <span className="block">文字颜色（font_color_hex）</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={normalizedFontColorHex}
                      onChange={(e) => setFontColorHex(e.target.value)}
                      className={COMPACT_COLOR_INPUT_CLASS}
                    />
                    <input
                      value={fontColorHex}
                      onChange={(e) => setFontColorHex(e.target.value)}
                      placeholder={DEFAULT_FONT_COLOR_HEX}
                      className={COMPACT_INPUT_CLASS}
                    />
                  </div>
                </label>
                <label className="space-y-2">
                  <span className="block">底色颜色（text_bg_color_hex）</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={normalizedTextBgColorHex}
                      onChange={(e) => setTextBgColorHex(e.target.value)}
                      className={COMPACT_COLOR_INPUT_CLASS}
                    />
                    <input
                      value={textBgColorHex}
                      onChange={(e) => setTextBgColorHex(e.target.value)}
                      placeholder={DEFAULT_TEXT_BG_COLOR_HEX}
                      className={COMPACT_INPUT_CLASS}
                    />
                  </div>
                </label>
              </div>

              <details className="text-xs text-slate-400 rounded-lg border border-slate-800 bg-slate-950/40">
                <summary className="cursor-pointer px-3 py-2 text-sm text-slate-300 hover:text-white">
                  高级参数（透明度 / 内边距 / 排版与位置）
                </summary>
                <div className="px-3 pb-3 pt-1">
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                    <label className="space-y-1.5">
                      <span className="block">底色透明度（text_bg_opacity）</span>
                      <input
                        type="number"
                        step={0.1}
                        value={textBgOpacity}
                        onChange={(e) => {
                          const next = Number(e.target.value);
                          setTextBgOpacity(Number.isNaN(next) ? DEFAULT_TEXT_BG_OPACITY : next);
                        }}
                        className={COMPACT_INPUT_CLASS}
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="block">底色内边距（text_bg_padding）</span>
                      <input
                        type="number"
                        step={1}
                        value={textBgPadding}
                        onChange={(e) => {
                          const next = Number(e.target.value);
                          setTextBgPadding(Number.isNaN(next) ? DEFAULT_TEXT_BG_PADDING : next);
                        }}
                        className={COMPACT_INPUT_CLASS}
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="block">高亮透明度（highlight_opacity）</span>
                      <input
                        type="number"
                        step={0.1}
                        value={highlightOpacity}
                        onChange={(e) => {
                          const next = Number(e.target.value);
                          setHighlightOpacity(Number.isNaN(next) ? DEFAULT_HIGHLIGHT_OPACITY : next);
                        }}
                        className={COMPACT_INPUT_CLASS}
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="block">高亮内边距（highlight_padding）</span>
                      <input
                        type="number"
                        step={1}
                        value={highlightPadding}
                        onChange={(e) => {
                          const next = Number(e.target.value);
                          setHighlightPadding(Number.isNaN(next) ? DEFAULT_HIGHLIGHT_PADDING : next);
                        }}
                        className={COMPACT_INPUT_CLASS}
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="block">对齐（align）</span>
                      <input
                        value={align}
                        onChange={(e) => setAlign(e.target.value)}
                        placeholder={DEFAULT_ALIGN}
                        className={COMPACT_INPUT_CLASS}
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="block">对齐方式（justify）</span>
                      <input
                        value={justify}
                        onChange={(e) => setJustify(e.target.value)}
                        placeholder={DEFAULT_JUSTIFY}
                        className={COMPACT_INPUT_CLASS}
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="block">边距（margins）</span>
                      <input
                        type="number"
                        step={1}
                        value={margins}
                        onChange={(e) => {
                          const next = Number(e.target.value);
                          setMargins(Number.isNaN(next) ? DEFAULT_MARGINS : next);
                        }}
                        className={COMPACT_INPUT_CLASS}
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="block">行距（line_spacing）</span>
                      <input
                        type="number"
                        step={1}
                        value={lineSpacing}
                        onChange={(e) => {
                          const next = Number(e.target.value);
                          setLineSpacing(Number.isNaN(next) ? DEFAULT_LINE_SPACING : next);
                        }}
                        className={COMPACT_INPUT_CLASS}
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="block">位置 X（position_x）</span>
                      <input
                        type="number"
                        step={1}
                        value={positionX}
                        onChange={(e) => {
                          const next = Number(e.target.value);
                          setPositionX(Number.isNaN(next) ? DEFAULT_POSITION_X : next);
                        }}
                        className={COMPACT_INPUT_CLASS}
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="block">位置 Y（position_y）</span>
                      <input
                        type="number"
                        step={1}
                        value={positionY}
                        onChange={(e) => {
                          const next = Number(e.target.value);
                          setPositionY(Number.isNaN(next) ? DEFAULT_POSITION_Y : next);
                        }}
                        className={COMPACT_INPUT_CLASS}
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="block">旋转角度（rotation_angle）</span>
                      <input
                        type="number"
                        step={1}
                        value={rotationAngle}
                        onChange={(e) => {
                          const next = Number(e.target.value);
                          setRotationAngle(Number.isNaN(next) ? DEFAULT_ROTATION_ANGLE : next);
                        }}
                        className={COMPACT_INPUT_CLASS}
                      />
                    </label>
                    <label className="space-y-1.5 sm:col-span-2 xl:col-span-3">
                      <span className="block">旋转参考（rotation_options）</span>
                      <input
                        value={rotationOptions}
                        onChange={(e) => setRotationOptions(e.target.value)}
                        placeholder={DEFAULT_ROTATION_OPTIONS}
                        className={COMPACT_INPUT_CLASS}
                      />
                    </label>
                  </div>
                </div>
              </details>
            </div>
          </div>

        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">输出结果</h2>
            {results.some((item) => item.outputUrl) && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-400 flex items-center gap-2">
                  <span>动图分辨率</span>
                  <select
                    value={videoResolution}
                    onChange={(e) => setVideoResolution(e.target.value)}
                    className="rounded-md bg-slate-950 border border-slate-800 text-xs text-slate-200 px-2 py-1 focus:outline-none focus:border-purple-500"
                  >
                    {MOTION_RESOLUTION_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value} className="bg-slate-900">
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  onClick={handleGenerateAllMotion}
                  disabled={isRunning || hasMotionRunning || motionTargets.length === 0}
                  className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                    !isRunning && !hasMotionRunning && motionTargets.length > 0
                      ? "bg-slate-800 border-slate-700 hover:border-purple-500 hover:text-white"
                      : "bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed"
                  }`}
                >
                  {hasMotionRunning ? <Loader2 className="w-3 h-3 inline-block mr-1 animate-spin" /> : <Play className="w-3 h-3 inline-block mr-1" />}
                  全部转动图
                </button>
                <button
                  onClick={() => {
                    results.forEach((item) => {
                      if (!item.outputUrl) return;
                      const link = document.createElement("a");
                      link.href = item.outputUrl;
                      link.download = `word-art-${item.id}.png`;
                      link.click();
                    });
                  }}
                  className="text-xs px-3 py-1.5 rounded-md bg-slate-800 border border-slate-700 hover:border-purple-500 hover:text-white transition-colors"
                >
                  <Download className="w-3 h-3 inline-block mr-1" />
                  下载全部
                </button>
              </div>
            )}
          </div>

          {results.length === 0 ? (
            <div className="border border-dashed border-slate-800 rounded-xl py-12 text-center text-slate-500">
              结果将在这里展示
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {results.map((item) => (
                <div key={item.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span title={item.inputName || "主图"}>任务 {item.id?.slice(-4)}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full border ${
                        item.status === "success"
                          ? "text-green-400 border-green-500/40 bg-green-500/10"
                          : item.status === "error"
                          ? "text-red-400 border-red-500/40 bg-red-500/10"
                          : item.status === "cancelled"
                          ? "text-amber-300 border-amber-500/40 bg-amber-500/10"
                          : item.status === "running"
                          ? "text-purple-300 border-purple-500/40 bg-purple-500/10"
                          : "text-slate-400 border-slate-700 bg-slate-800"
                      }`}
                    >
                      {item.status === "success"
                        ? "完成"
                        : item.status === "error"
                        ? "失败"
                        : item.status === "cancelled"
                        ? "已取消"
                        : item.status === "running"
                        ? "处理中"
                        : "排队中"}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <div className="text-[11px] text-slate-500">主图</div>
                      <button
                        type="button"
                        onClick={() => setPreviewImage(item.inputUrl)}
                        className="block w-full h-40 rounded-lg border border-slate-800 overflow-hidden"
                        title="点击放大预览"
                      >
                        <img src={item.inputUrl} alt="主图" className="w-full h-full object-cover" />
                      </button>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="text-[11px] text-slate-500">花字结果</div>
                        <div className="flex items-center gap-1.5">
                          {item.outputUrl && (
                            <button
                              onClick={() => handleGenerateMotion(item)}
                              disabled={item.videoStatus === "running"}
                              className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                                item.videoStatus === "running"
                                  ? "border-slate-800 text-slate-600 cursor-not-allowed"
                                  : "border-slate-700 text-slate-400 hover:text-white hover:border-purple-500"
                              }`}
                            >
                              {item.videoStatus === "running" ? (
                                <Loader2 className="w-3 h-3 inline-block mr-1 animate-spin" />
                              ) : (
                                <Play className="w-3 h-3 inline-block mr-1" />
                              )}
                              一键转动图
                            </button>
                          )}
                          {item.outputUrl && (
                            <button
                              onClick={() => {
                                const link = document.createElement("a");
                                link.href = item.outputUrl;
                                link.download = `word-art-${item.id}.png`;
                                link.click();
                              }}
                              className="text-[11px] px-2 py-0.5 rounded border border-slate-700 text-slate-400 hover:text-white hover:border-purple-500 transition-colors"
                            >
                              <Download className="w-3 h-3 inline-block mr-1" />
                              下载
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="relative">
                        {item.status === "running" && !item.outputUrl && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg z-10">
                            <Loader2 className="w-5 h-5 animate-spin" />
                          </div>
                        )}
                        {item.outputUrl ? (
                          <button
                            type="button"
                            onClick={() => setPreviewImage(item.outputUrl)}
                            className="block w-full h-40 rounded-lg border border-slate-800 overflow-hidden"
                            title="点击放大预览"
                          >
                            <img src={item.outputUrl} alt="花字结果" className="w-full h-full object-cover" />
                          </button>
                        ) : (
                          <div className="w-full h-40 rounded-lg border border-dashed border-slate-800 flex items-center justify-center text-xs text-slate-600">
                            {item.status === "error" ? "生成失败" : "等待生成"}
                          </div>
                        )}
                      </div>
                      {(item.videoUrl || item.videoStatus === "running" || item.videoError) && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="text-[11px] text-slate-500">动图结果</div>
                            {item.videoUrl && (
                              <button
                                onClick={() => {
                                  const link = document.createElement("a");
                                  link.href = item.videoUrl;
                                  link.download = `motion-${item.id}.mp4`;
                                  link.click();
                                }}
                                className="text-[11px] px-2 py-0.5 rounded border border-slate-700 text-slate-400 hover:text-white hover:border-purple-500 transition-colors"
                              >
                                <Download className="w-3 h-3 inline-block mr-1" />
                                下载
                              </button>
                            )}
                          </div>
                          <div className="relative">
                            {item.videoStatus === "running" && (
                              <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg z-10">
                                <Loader2 className="w-5 h-5 animate-spin" />
                              </div>
                            )}
                            {item.videoUrl ? (
                              <button
                                type="button"
                                onClick={() => setPreviewVideo(item.videoUrl)}
                                className="block w-full h-40 rounded-lg border border-slate-800 overflow-hidden"
                                title="点击放大预览"
                              >
                                <video src={item.videoUrl} className="w-full h-full object-cover" muted loop playsInline />
                              </button>
                            ) : (
                              <div className="w-full h-40 rounded-lg border border-dashed border-slate-800 flex items-center justify-center text-xs text-slate-600">
                                {item.videoError ? "生成失败" : "等待生成"}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  {item.error && (
                    <div className="text-xs text-red-400 flex items-start gap-2">
                      <AlertCircle className="w-3 h-3 mt-0.5" />
                      {item.error}
                    </div>
                  )}
                  {item.videoError && (
                    <div className="text-xs text-red-400 flex items-start gap-2">
                      <AlertCircle className="w-3 h-3 mt-0.5" />
                      动图生成失败：{item.videoError}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {previewImage && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <img src={previewImage} alt="预览" className="max-w-full max-h-[90vh] rounded-lg border border-slate-700 object-contain" />
            <button
              className="absolute -top-10 right-0 text-white/70 hover:text-white transition-colors bg-slate-800/70 p-2 rounded-full hover:bg-slate-700/80"
              onClick={() => setPreviewImage(null)}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      {previewVideo && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6"
          onClick={() => setPreviewVideo(null)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <video
              src={previewVideo}
              controls
              autoPlay
              className="max-w-full max-h-[90vh] rounded-lg border border-slate-700 object-contain"
            />
            <button
              className="absolute -top-10 right-0 text-white/70 hover:text-white transition-colors bg-slate-800/70 p-2 rounded-full hover:bg-slate-700/80"
              onClick={() => setPreviewVideo(null)}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PipelineBatchWordArt;
