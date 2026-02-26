import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Clapperboard,
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

const DEFAULT_NEGATIVE_PROMPT =
  "色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走";
const DEFAULT_WIDTH = 480;
const DEFAULT_HEIGHT = 720;
const DEFAULT_LENGTH = 49;
const DEFAULT_FPS = 16;

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

const PipelinePoseControlVideo = () => {
  const { apiFetch } = useAuth();
  const [referenceImage, setReferenceImage] = useState(null);
  const [poseVideo, setPoseVideo] = useState(null);
  const [positivePrompt, setPositivePrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState(DEFAULT_NEGATIVE_PROMPT);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [length, setLength] = useState(DEFAULT_LENGTH);
  const [fps, setFps] = useState(DEFAULT_FPS);
  const [seedText, setSeedText] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState("");
  const [resultVideo, setResultVideo] = useState("");
  const [previewImage, setPreviewImage] = useState("");
  const [previewVideo, setPreviewVideo] = useState("");

  const imageInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const abortControllerRef = useRef(null);

  const canRun = useMemo(() => !!referenceImage?.url && !!poseVideo?.url && !isRunning, [referenceImage, poseVideo, isRunning]);

  const handleImageFiles = useCallback(async (files) => {
    const file = Array.from(files || []).find((item) => item.type.startsWith("image/"));
    if (!file) return;
    const url = await readFileAsDataUrl(file);
    setReferenceImage({ name: file.name, url });
    setResultVideo("");
    setError("");
  }, []);

  const handleVideoFiles = useCallback(async (files) => {
    const file = Array.from(files || []).find((item) => item.type.startsWith("video/"));
    if (!file) return;
    const url = await readFileAsDataUrl(file);
    setPoseVideo({ name: file.name, url });
    setResultVideo("");
    setError("");
  }, []);

  const handleRun = useCallback(async () => {
    if (isRunning) return;
    if (!referenceImage?.url) {
      setError("请先上传参考图");
      return;
    }
    if (!poseVideo?.url) {
      setError("请先上传姿态视频");
      return;
    }

    const parsedSeed = seedText.trim() === "" ? null : Number(seedText);
    if (parsedSeed !== null && Number.isNaN(parsedSeed)) {
      setError("Seed 必须为数字");
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsRunning(true);
    setError("");
    setResultVideo("");

    try {
      const resp = await apiFetch(`/api/controlnet_pose_video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          image: referenceImage.url,
          control_video: poseVideo.url,
          positive_prompt: positivePrompt.trim() ? positivePrompt : null,
          negative_prompt: negativePrompt,
          width,
          height,
          length,
          fps,
          seed: parsedSeed,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(extractApiError(data));

      const outputUrl = data.video || data.image || data.videos?.[0];
      if (!outputUrl) throw new Error("未返回视频结果");
      setResultVideo(outputUrl);
    } catch (err) {
      if (controller.signal.aborted) {
        setError("任务已取消");
      } else {
        setError(err?.message || String(err));
      }
    } finally {
      abortControllerRef.current = null;
      setIsRunning(false);
    }
  }, [apiFetch, fps, height, isRunning, length, negativePrompt, poseVideo, positivePrompt, referenceImage, seedText, width]);

  const handleCancel = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const handleReset = useCallback(() => {
    if (isRunning) return;
    setReferenceImage(null);
    setPoseVideo(null);
    setPositivePrompt("");
    setNegativePrompt(DEFAULT_NEGATIVE_PROMPT);
    setWidth(DEFAULT_WIDTH);
    setHeight(DEFAULT_HEIGHT);
    setLength(DEFAULT_LENGTH);
    setFps(DEFAULT_FPS);
    setSeedText("");
    setResultVideo("");
    setError("");
  }, [isRunning]);

  const handleDownload = useCallback(() => {
    if (!resultVideo) return;
    const link = document.createElement("a");
    link.href = resultVideo;
    link.download = "controlnet-pose-video.mp4";
    link.click();
  }, [resultVideo]);

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
              <h1 className="text-lg font-bold">视频：姿态控制</h1>
              <p className="text-xs text-slate-400">参考图 + 姿态视频驱动，后端调用 Controlnet 工作流</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
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
              onClick={handleReset}
              disabled={isRunning}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                !isRunning
                  ? "bg-slate-800 border-slate-700 hover:border-purple-500 hover:text-white"
                  : "bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed"
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              重置
            </button>
            <button
              onClick={handleRun}
              disabled={!canRun}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                canRun
                  ? "bg-purple-600 border-purple-500 hover:bg-purple-500"
                  : "bg-slate-800 border-slate-700 text-slate-500 cursor-not-allowed"
              }`}
            >
              {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {isRunning ? "生成中" : "开始生成"}
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 px-6 py-6 space-y-6">
        {error && (
          <div className="flex items-center gap-2 bg-red-950/60 border border-red-800 text-red-200 px-4 py-2 rounded-lg text-sm">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div
            className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleImageFiles(e.dataTransfer?.files);
            }}
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">参考图</h2>
                <p className="text-xs text-slate-500">用于控制主体外观 / 商品图</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => imageInputRef.current?.click()}
                  className="text-xs px-3 py-1.5 rounded-md bg-slate-800 border border-slate-700 hover:border-purple-500 hover:text-white transition-colors"
                >
                  <Upload className="w-3 h-3 inline-block mr-1" />
                  上传图片
                </button>
                <button
                  onClick={() => setReferenceImage(null)}
                  disabled={!referenceImage}
                  className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                    referenceImage
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
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleImageFiles(e.target.files)}
            />

            {referenceImage ? (
              <div className="space-y-2">
                <div className="text-xs text-slate-400 truncate">{referenceImage.name}</div>
                <button
                  type="button"
                  onClick={() => setPreviewImage(referenceImage.url)}
                  className="block w-full h-64 rounded-xl border border-slate-800 overflow-hidden"
                >
                  <img src={referenceImage.url} alt="参考图" className="w-full h-full object-contain bg-slate-950" />
                </button>
              </div>
            ) : (
              <div className="h-64 rounded-xl border border-dashed border-slate-800 bg-slate-950/50 flex flex-col items-center justify-center text-slate-500 text-sm">
                <ImagePlus className="w-8 h-8 mb-2 opacity-70" />
                拖拽图片到此处或点击上传
              </div>
            )}
          </div>

          <div
            className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleVideoFiles(e.dataTransfer?.files);
            }}
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">姿态视频</h2>
                <p className="text-xs text-slate-500">从视频中提取姿态轨迹驱动生成</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => videoInputRef.current?.click()}
                  className="text-xs px-3 py-1.5 rounded-md bg-slate-800 border border-slate-700 hover:border-purple-500 hover:text-white transition-colors"
                >
                  <Upload className="w-3 h-3 inline-block mr-1" />
                  上传视频
                </button>
                <button
                  onClick={() => setPoseVideo(null)}
                  disabled={!poseVideo}
                  className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                    poseVideo
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
              ref={videoInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => handleVideoFiles(e.target.files)}
            />

            {poseVideo ? (
              <div className="space-y-2">
                <div className="text-xs text-slate-400 truncate">{poseVideo.name}</div>
                <button
                  type="button"
                  onClick={() => setPreviewVideo(poseVideo.url)}
                  className="block w-full h-64 rounded-xl border border-slate-800 overflow-hidden"
                >
                  <video src={poseVideo.url} className="w-full h-full object-contain bg-black" muted loop playsInline />
                </button>
              </div>
            ) : (
              <div className="h-64 rounded-xl border border-dashed border-slate-800 bg-slate-950/50 flex flex-col items-center justify-center text-slate-500 text-sm">
                <Clapperboard className="w-8 h-8 mb-2 opacity-70" />
                拖拽视频到此处或点击上传
              </div>
            )}
          </div>
        </section>

        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold">生成参数</h2>
              <p className="text-xs text-slate-500">对应 `workflows/Controlnet.json` 的常用输入参数</p>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <label className="text-xs text-slate-400 space-y-2">
              <span className="block">正向提示词（positive_prompt）</span>
              <textarea
                value={positivePrompt}
                onChange={(e) => setPositivePrompt(e.target.value)}
                rows={3}
                className="w-full rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 px-2.5 py-2 focus:outline-none focus:border-purple-500"
                placeholder="可留空，使用工作流默认值"
              />
            </label>

            <label className="text-xs text-slate-400 space-y-2">
              <span className="block">负向提示词（negative_prompt）</span>
              <textarea
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                rows={3}
                className="w-full rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 px-2.5 py-2 focus:outline-none focus:border-purple-500"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <label className="text-xs text-slate-400 space-y-1.5">
              <span className="block">宽度（width）</span>
              <input
                type="number"
                step={1}
                value={width}
                onChange={(e) => setWidth(Number.isNaN(Number(e.target.value)) ? DEFAULT_WIDTH : Number(e.target.value))}
                className="w-full rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 px-2.5 py-2 focus:outline-none focus:border-purple-500"
              />
            </label>
            <label className="text-xs text-slate-400 space-y-1.5">
              <span className="block">高度（height）</span>
              <input
                type="number"
                step={1}
                value={height}
                onChange={(e) => setHeight(Number.isNaN(Number(e.target.value)) ? DEFAULT_HEIGHT : Number(e.target.value))}
                className="w-full rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 px-2.5 py-2 focus:outline-none focus:border-purple-500"
              />
            </label>
            <label className="text-xs text-slate-400 space-y-1.5">
              <span className="block">帧长（length）</span>
              <input
                type="number"
                step={1}
                value={length}
                onChange={(e) => setLength(Number.isNaN(Number(e.target.value)) ? DEFAULT_LENGTH : Number(e.target.value))}
                className="w-full rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 px-2.5 py-2 focus:outline-none focus:border-purple-500"
              />
            </label>
            <label className="text-xs text-slate-400 space-y-1.5">
              <span className="block">帧率（fps）</span>
              <input
                type="number"
                step={1}
                value={fps}
                onChange={(e) => setFps(Number.isNaN(Number(e.target.value)) ? DEFAULT_FPS : Number(e.target.value))}
                className="w-full rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 px-2.5 py-2 focus:outline-none focus:border-purple-500"
              />
            </label>
            <label className="text-xs text-slate-400 space-y-1.5">
              <span className="block">随机种子（seed）</span>
              <input
                value={seedText}
                onChange={(e) => setSeedText(e.target.value)}
                placeholder="留空使用工作流默认"
                className="w-full rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 px-2.5 py-2 focus:outline-none focus:border-purple-500"
              />
            </label>
          </div>
        </section>

        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold">生成结果</h2>
              <p className="text-xs text-slate-500">{resultVideo ? "点击预览或下载" : "结果视频将在这里展示"}</p>
            </div>
            {resultVideo && (
              <button
                onClick={handleDownload}
                className="text-xs px-3 py-1.5 rounded-md bg-slate-800 border border-slate-700 hover:border-purple-500 hover:text-white transition-colors"
              >
                <Download className="w-3 h-3 inline-block mr-1" />
                下载视频
              </button>
            )}
          </div>

          {resultVideo ? (
            <button
              type="button"
              onClick={() => setPreviewVideo(resultVideo)}
              className="block w-full rounded-xl border border-slate-800 overflow-hidden"
            >
              <video src={resultVideo} className="w-full max-h-[520px] object-contain bg-black" muted loop playsInline />
            </button>
          ) : (
            <div className="h-64 rounded-xl border border-dashed border-slate-800 bg-slate-950/40 flex items-center justify-center text-slate-500 text-sm">
              {isRunning ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  正在生成姿态控制视频...
                </span>
              ) : (
                "等待生成"
              )}
            </div>
          )}
        </section>
      </div>

      {(previewImage || previewVideo) && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6"
          onClick={() => {
            setPreviewImage("");
            setPreviewVideo("");
          }}
        >
          <div className="relative max-w-[95vw] max-h-[95vh]" onClick={(e) => e.stopPropagation()}>
            {previewImage ? (
              <img src={previewImage} alt="预览" className="max-w-full max-h-[90vh] rounded-lg border border-slate-700 bg-black object-contain" />
            ) : (
              <video src={previewVideo} className="max-w-full max-h-[90vh] rounded-lg border border-slate-700 bg-black" controls autoPlay />
            )}
            <button
              onClick={() => {
                setPreviewImage("");
                setPreviewVideo("");
              }}
              className="absolute -top-3 -right-3 h-9 w-9 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center hover:border-purple-500"
              title="关闭"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PipelinePoseControlVideo;
