import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Download,
  ImagePlus,
  Loader2,
  Play,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Link } from "../router";
import { useAuth } from "../auth/AuthProvider";

const PRESET_OPTIONS = [
  {
    id: "face",
    name: "面部特征提取",
    desc: "仅保留面部关键特征与肤色细节，去除干扰元素。",
    prompt: "提取画面中的面部特征，保留五官与肤色细节，去除背景与多余元素，结果自然清晰。",
  },
  {
    id: "background",
    name: "纯背景提取",
    desc: "移除主体，仅保留干净背景。",
    prompt: "提取画面中的纯背景，移除所有主体与物体，保持背景干净自然，避免残影。",
  },
  {
    id: "outfit",
    name: "服装/首饰提取",
    desc: "聚焦服装与首饰细节，弱化其他元素。",
    prompt: "提取画面中的服装与首饰，保留材质与纹理细节，弱化人物面部与背景，结果清晰自然。",
  },
];

const DEFAULT_PROMPT = PRESET_OPTIONS[0].prompt;

const generateId = () => Math.random().toString(36).slice(2, 11);

const SIZE_OPTIONS = [
  { label: "1K (1024 x 1024)", value: "1024x1024" },
  { label: "2K (2048 x 2048)", value: "2048x2048" },
  { label: "4K (4096 x 4096)", value: "4096x4096" },
];

const RATIO_OPTIONS = [
  { label: "1:1", value: "1:1" },
  { label: "4:3", value: "4:3" },
  { label: "3:4", value: "3:4" },
  { label: "16:9", value: "16:9" },
  { label: "9:16", value: "9:16" },
  { label: "21:9", value: "21:9" },
];

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
  }));

const PipelineFeatureExtract = () => {
  const { apiFetch } = useAuth();
  const [mainImages, setMainImages] = useState([]);
  const [selectedPreset, setSelectedPreset] = useState(PRESET_OPTIONS[0].id);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [size, setSize] = useState("1024x1024");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [results, setResults] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [previewImage, setPreviewImage] = useState(null);
  const resultsSeedRef = useRef([]);
  const mainInputRef = useRef(null);

  const hasReadyInputs = mainImages.length > 0;

  const totalSuccess = useMemo(() => results.filter((item) => item.status === "success").length, [results]);

  const updateResult = useCallback((id, patch) => {
    setResults((prev) => {
      const base = prev.length ? prev : resultsSeedRef.current;
      if (!base.length) return prev;
      const next = base.map((item) => (item.id === id ? { ...item, ...patch } : item));
      resultsSeedRef.current = next;
      return next;
    });
  }, [resultsSeedRef]);

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

  const handleRun = useCallback(async () => {
    if (isRunning) return;
    if (!hasReadyInputs) {
      setError("请先上传主图");
      return;
    }

    setError("");
    setIsRunning(true);
    setProgress({ done: 0, total: mainImages.length });
    const seed = buildResultsSeed(mainImages);
    resultsSeedRef.current = seed;
    setResults(seed);

    for (const item of mainImages) {
      updateResult(item.id, { status: "running", error: null });

      try {
        const resp = await apiFetch(`/api/multi_image_generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: prompt?.trim() || DEFAULT_PROMPT,
            images: [item.url],
            temperature: 0.7,
            size,
            aspect_ratio: aspectRatio,
          }),
        });

        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(extractApiError(data));

        const outputUrl = data.image || data.images?.[0];
        if (!outputUrl) throw new Error("未返回生成结果");

        updateResult(item.id, { status: "success", outputUrl });
      } catch (err) {
        updateResult(item.id, { status: "error", error: err?.message || String(err) });
      }

      setProgress((prev) => ({ done: prev.done + 1, total: prev.total }));
    }

    setIsRunning(false);
  }, [apiFetch, aspectRatio, hasReadyInputs, isRunning, mainImages, prompt, size, updateResult]);

  const handleDropMain = useCallback(
    (event) => {
      event.preventDefault();
      handleMainFiles(event.dataTransfer?.files);
    },
    [handleMainFiles],
  );

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/60">
        <div className="flex items-center gap-3">
          <Link to="/app" className="flex items-center gap-2 text-slate-400 hover:text-white text-sm">
            <ArrowLeft className="w-4 h-4" />
            返回工作台
          </Link>
          <div className="w-px h-5 bg-slate-800" />
          <div>
            <h1 className="text-lg font-bold">特征提取</h1>
            <p className="text-xs text-slate-400">面部/背景/服装首饰特征提取，批量处理</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-xs text-slate-400">
            {progress.total > 0 ? `进度 ${progress.done}/${progress.total}` : "等待任务"}
          </div>
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
            {isRunning ? "处理中" : "开始提取"}
          </button>
        </div>
      </header>

      <div className="flex-1 px-6 py-6 space-y-6">
        {error && (
          <div className="flex items-center gap-2 bg-red-950/60 border border-red-800 text-red-200 px-4 py-2 rounded-lg text-sm">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">功能选择</h2>
              <p className="text-xs text-slate-500">选择一个功能会自动填充预设提示词</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            {PRESET_OPTIONS.map((opt) => {
              const isActive = selectedPreset === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setSelectedPreset(opt.id);
                    setPrompt(opt.prompt);
                  }}
                  className={`text-left p-3 rounded-xl border transition-all ${
                    isActive
                      ? "border-purple-500 bg-purple-500/10"
                      : "border-slate-800 bg-slate-950/40 hover:border-slate-600"
                  }`}
                >
                  <div className="text-sm font-semibold text-slate-100">{opt.name}</div>
                  <div className="text-xs text-slate-500 mt-1">{opt.desc}</div>
                </button>
              );
            })}
          </div>
        </section>

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

        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold">提示词（可选）</h2>
              <p className="text-xs text-slate-500">可根据需求微调预设提示词</p>
            </div>
            <div className="text-xs text-slate-500">已完成 {totalSuccess}/{results.length || 0}</div>
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="text-xs text-slate-400 space-y-2">
              <span className="block">分辨率</span>
              <select
                value={size}
                onChange={(e) => setSize(e.target.value)}
                className="w-full rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-200 px-3 py-2 focus:outline-none focus:border-purple-500"
              >
                {SIZE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value} className="bg-slate-900">
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-400 space-y-2">
              <span className="block">比例</span>
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value)}
                className="w-full rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-200 px-3 py-2 focus:outline-none focus:border-purple-500"
              >
                {RATIO_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value} className="bg-slate-900">
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            className="mt-3 w-full rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-200 p-3 focus:outline-none focus:border-purple-500"
          />
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">输出结果</h2>
            {results.some((item) => item.outputUrl) && (
              <button
                onClick={() => {
                  results.forEach((item) => {
                    if (!item.outputUrl) return;
                    const link = document.createElement("a");
                    link.href = item.outputUrl;
                    link.download = `feature-${item.id}.png`;
                    link.click();
                  });
                }}
                className="text-xs px-3 py-1.5 rounded-md bg-slate-800 border border-slate-700 hover:border-purple-500 hover:text-white transition-colors"
              >
                <Download className="w-3 h-3 inline-block mr-1" />
                下载全部
              </button>
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
                    <span title={item.inputName || "主图"}>任务 {item.id.slice(-4)}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full border ${
                        item.status === "success"
                          ? "text-green-400 border-green-500/40 bg-green-500/10"
                          : item.status === "error"
                          ? "text-red-400 border-red-500/40 bg-red-500/10"
                          : item.status === "running"
                          ? "text-purple-300 border-purple-500/40 bg-purple-500/10"
                          : "text-slate-400 border-slate-700 bg-slate-800"
                      }`}
                    >
                      {item.status === "success"
                        ? "完成"
                        : item.status === "error"
                        ? "失败"
                        : item.status === "running"
                        ? "处理中"
                        : "排队中"}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
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
                        <div className="text-[11px] text-slate-500">提取结果</div>
                        {item.outputUrl && (
                          <button
                            onClick={() => {
                              const link = document.createElement("a");
                              link.href = item.outputUrl;
                              link.download = `feature-${item.id}.png`;
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
                        {item.status === "running" && (
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
                            <img src={item.outputUrl} alt="提取结果" className="w-full h-full object-cover" />
                          </button>
                        ) : (
                          <div className="w-full h-40 rounded-lg border border-dashed border-slate-800 flex items-center justify-center text-xs text-slate-600">
                            {item.status === "error" ? "生成失败" : "等待生成"}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  {item.error && (
                    <div className="text-xs text-red-400 flex items-start gap-2">
                      <AlertCircle className="w-3 h-3 mt-0.5" />
                      {item.error}
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
    </div>
  );
};

export default PipelineFeatureExtract;
