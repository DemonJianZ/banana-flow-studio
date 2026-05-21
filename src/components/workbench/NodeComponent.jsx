import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  Upload,
  ImagePlus,
  ImageIcon,
  Wand2,
  Download,
  X,
  Play,
  Plus,
  Loader2,
  Maximize,
  Trash2,
  CheckCircle2,
  Sparkles,
  Layout,
  Film,
  ArrowRight,
  RotateCcw,
  AlertCircle,
  Clipboard,
  Scissors,
  Volume2,
  VolumeX,
  Scan,
  TrendingUp,
} from "lucide-react";
import {
  EMPTY_LIST,
  NODE_TYPES,
  ASPECT_RATIOS,
  VIDEO_HD_TEMPLATE_OPTIONS,
  isSameArtifactSelection,
  collectStoryboardMentionTerms,
  renderStoryboardMentionText,
  stripStoryboardDisplayIds,
  matchesSceneBinding,
  normalizePromptPolishVariants,
  listAIChatParamValues,
  isSeedanceOmniReferenceModel,
  TOOL_CARDS,
  VIDEO_GEN_INPUT_HANDLE_MAIN,
  VIDEO_GEN_INPUT_HANDLE_LAST_FRAME,
  normalizeConnectionTargetHandle,
  MEDIA_UPLOAD_NODE_EMPTY_HEIGHT,
  MAX_RENDERED_MEDIA_ITEMS_PER_NODE,
  DEFAULT_VIDEO_LINEART_STRENGTH,
  DEFAULT_VIDEO_LINEART_COLOR,
  DEFAULT_VIDEO_SPLIT_OUTPUT_RESOLUTION,
  isImageFileLike,
  isVideoFileLike,
  isMediaFileLike,
  normalizeInputMediaKind,
  getReferenceNodeTitle,
  readFilesAsDataUrls,
  normalizeVideoSplitSecond,
  normalizeVideoSplitSegments,
  checkNodeReady,
} from "../../constants/workbench.jsx";
import { polishCanvasPrompt } from "../../api/agentCanvas";
import { downloadMedia } from "../../lib/downloadMedia";
import { isVideoContent } from "../../lib/mediaType.js";
import { buildRoleProfileStructuredOutput } from "../../lib/roleProfileStructurer.js";
import { API_BASE } from "../../config";
import InlineDropdown from "./InlineDropdown";
import PersonaMentionTextarea from "./PersonaMentionTextarea";
import PropertyPanel from "./PropertyPanel";

// ---- Private helpers (NodeComponent-only) ----

const DEFAULT_VIDEO_SPLIT_SEGMENT_LENGTH_SEC = 3;
const VIDEO_SPLIT_OUTPUT_RESOLUTION_OPTIONS = ["720p"];

const formatVideoSplitTime = (value) => {
  const totalSec = Math.max(0, Math.round(Number(value || 0)));
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours > 0) {
    return [hours, minutes, seconds].map((item) => String(item).padStart(2, "0")).join(":");
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const buildVideoSplitDrafts = (segments) =>
  (Array.isArray(segments) ? segments : []).map((item) => ({
    startSec: String(item?.startSec ?? ""),
    endSec: String(item?.endSec ?? ""),
  }));

const NodeComponent = ({
  node,
  selected,
  onMouseDown,
  updateData,
  apiFetch,
  onOpenPromptPolishPicker,
  imageModelOptions = EMPTY_LIST,
  videoModelOptions = EMPTY_LIST,
  resolveModelParamsForId,
  personaMentionOptions = EMPTY_LIST,
  onDelete,
  onConnectStart,
  onConnectTargetHover,
  onConnectTargetLeave,
  connecting = false,
  hoveredConnectTarget = null,
  onPreview,
  onContinue,
  isReady,
  onRetry,
  onSelectArtifact,
  activeArtifact,
  onIterateImg2Img,
  onRunCompactRmbg,
  onRunCompactRemoveWatermark,
  onRunCompactThreeView,
  onRunCompactVideoUpscale,
  onRunVideoRmbg,
  onRunVideoLineart,
  onRunVideoSplit,
  onQuickCreateFromText,
  onRunNode,
  onCancelNode,
  shouldAutoOpenUploadPicker = false,
  onAutoOpenUploadPickerHandled,
  onNodeElementChange,
  onStoryboardMentionHover,
  onStoryboardMentionLeave,
  onShotChipClick,
  onStoryboardScriptFiles,
  setRunToast,
}) => {
  const [showCopied, setShowCopied] = useState(false);
  const [compactActiveIndex, setCompactActiveIndex] = useState(0);
  const [simpleMediaActionIndex, setSimpleMediaActionIndex] = useState(-1);
  const [showSimpleMediaToolbar, setShowSimpleMediaToolbar] = useState(false);
  const [showCompactInputActions, setShowCompactInputActions] = useState(false);
  const [showCompactVideoUpscaleOptions, setShowCompactVideoUpscaleOptions] = useState(false);
  const [showSimpleVideoUpscaleOptions, setShowSimpleVideoUpscaleOptions] = useState(false);
  const [showSimpleVideoEditor, setShowSimpleVideoEditor] = useState(false);
  const [compactRmbgPending, setCompactRmbgPending] = useState(false);
  const [compactRemovePending, setCompactRemovePending] = useState(false);
  const [compactThreeViewPending, setCompactThreeViewPending] = useState(false);
  const [compactVideoUpscalePending, setCompactVideoUpscalePending] = useState(false);
  const [videoRmbgPending, setVideoRmbgPending] = useState(false);
  const [videoLineartPending, setVideoLineartPending] = useState(false);
  const [videoSplitPending, setVideoSplitPending] = useState(false);
  const [videoSplitDuration, setVideoSplitDuration] = useState(0);
  const [videoSplitSegments, setVideoSplitSegments] = useState(() => normalizeVideoSplitSegments([]));
  const [videoSplitDrafts, setVideoSplitDrafts] = useState(() => buildVideoSplitDrafts(normalizeVideoSplitSegments([])));
  const [videoSplitOutputResolution, setVideoSplitOutputResolution] = useState(DEFAULT_VIDEO_SPLIT_OUTPUT_RESOLUTION);
  const [videoSplitIncludeAudio, setVideoSplitIncludeAudio] = useState(false);
  const [promptPolishLoading, setPromptPolishLoading] = useState(false);
  const [promptPolishError, setPromptPolishError] = useState("");
  const [inlineImageParamOptions, setInlineImageParamOptions] = useState(() => ({
    size: EMPTY_LIST,
    ratio: EMPTY_LIST,
  }));
  const [inlineImageParamLoading, setInlineImageParamLoading] = useState(false);
  const [inlineImageParamError, setInlineImageParamError] = useState("");
  const [isUploadDropActive, setIsUploadDropActive] = useState(false);
  const [storyboardDropActive, setStoryboardDropActive] = useState(false);
  const nodeRootRef = useRef(null);
  const simpleMediaUploadInputRef = useRef(null);
  const storyboardScriptInputRef = useRef(null);
  const videoLastFrameInputRef = useRef(null);

  useEffect(() => {
    onNodeElementChange?.(node.id, nodeRootRef.current);
    return () => {
      onNodeElementChange?.(node.id, null);
    };
  }, [node.id, onNodeElementChange]);
  const inputMediaKind = normalizeInputMediaKind(node.data.mediaKind);
  const simpleMediaInputAccept = inputMediaKind === "image" ? "image/*" : inputMediaKind === "video" ? "video/*" : "image/*,video/*";
  const simpleMediaUploadLabel = inputMediaKind === "image" ? "上传图片" : inputMediaKind === "video" ? "上传视频" : "上传图片/视频";
  const simpleMediaDropTitle = inputMediaKind === "image" ? "拖拽图片到此，或点击上传" : inputMediaKind === "video" ? "拖拽视频到此，或点击上传" : "拖拽媒体到此，或点击上传";
  const simpleMediaSupportHint = inputMediaKind === "image" ? "支持 JPG / PNG / WebP / GIF" : inputMediaKind === "video" ? "支持 MP4 / MOV / WebM" : "支持常见图片与视频格式";
  const readSimpleMediaUploadFiles = readFilesAsDataUrls;

  const submitStoryboardScriptFiles = useCallback(
    (files) => {
      const list = Array.from(files || []).filter(Boolean);
      if (!list.length || node.data.status === "running") return;
      onStoryboardScriptFiles?.(node.id, list);
    },
    [node.data.status, node.id, onStoryboardScriptFiles],
  );

  const handleStoryboardScriptInputChange = useCallback(
    (event) => {
      submitStoryboardScriptFiles(event.target.files);
      event.target.value = "";
    },
    [submitStoryboardScriptFiles],
  );

  const handleStoryboardScriptDrop = useCallback(
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      setStoryboardDropActive(false);
      submitStoryboardScriptFiles(event.dataTransfer?.files);
    },
    [submitStoryboardScriptFiles],
  );

  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files || []).filter((file) => {
      if (inputMediaKind === "image") return isImageFileLike(file);
      if (inputMediaKind === "video") return isVideoFileLike(file);
      return isMediaFileLike(file);
    });
    if (!files.length) return;

    readSimpleMediaUploadFiles(files).then((newImages) => {
      const currentImages = node.data.images || [];
      updateData(node.id, { images: [...currentImages, ...newImages] });
    });

    e.target.value = "";
  };

  const openSimpleMediaUploadPicker = useCallback(
    (event = null) => {
      event?.stopPropagation?.();
      setShowSimpleMediaToolbar(true);
      simpleMediaUploadInputRef.current?.click();
    },
    [],
  );

  const downloadAll = () => {
    (node.data.images || []).forEach((img, i) => {
      const filename = `batch_result_${i}.${isVideoContent(img) ? "mp4" : "png"}`;
      if (isVideoContent(img)) {
        void downloadMedia(img, filename);
        return;
      }
      const link = document.createElement("a");
      link.href = img;
      link.download = filename;
      link.click();
    });
  };

  const copyDebugInfo = () => {
    const info = JSON.stringify(
      {
        id: node.id,
        type: node.type,
        mode: node.data.mode,
        status: node.data.status,
        error: node.data.error,
        time: new Date().toISOString(),
      },
      null,
      2
    );
    navigator.clipboard.writeText(info);
    setShowCopied(true);
    setTimeout(() => setShowCopied(false), 2000);
  };

  const handlePolishTextInputPrompt = async () => {
    const sourcePrompt = String(node.data.text || "").trim();
    if (!sourcePrompt) {
      setPromptPolishError("请先输入提示词");
      return;
    }
    if (!apiFetch) {
      setPromptPolishError("缺少 API 连接");
      return;
    }
    setPromptPolishLoading(true);
    setPromptPolishError("");
    try {
      const result = await polishCanvasPrompt({ prompt: sourcePrompt, mode: "text2img" }, apiFetch);
      const variants = normalizePromptPolishVariants(result);
      if (!variants.length) {
        throw new Error("润色结果为空");
      }
      onOpenPromptPolishPicker?.({
        title: "提示词润色",
        sourcePrompt,
        variants,
        onUse: (text) => updateData(node.id, { text }),
      });
    } catch (error) {
      setPromptPolishError(error instanceof Error ? error.message : String(error));
    } finally {
      setPromptPolishLoading(false);
    }
  };

  const isProcessor = node.type === NODE_TYPES.PROCESSOR;
  const isPostProcessor = node.type === NODE_TYPES.POST_PROCESSOR;
  const isVideoGen = node.type === NODE_TYPES.VIDEO_GEN;
  const isAI = isProcessor || isPostProcessor || isVideoGen;
  const isInput = node.type === NODE_TYPES.INPUT;
  const isOutput = node.type === NODE_TYPES.OUTPUT;
  const isTextInputNode = node.type === NODE_TYPES.TEXT_INPUT;
  const isStoryboardInputNode = node.type === NODE_TYPES.STORYBOARD_INPUT;
  const isStoryboardPlanNode = node.type === NODE_TYPES.STORYBOARD_PLAN;
  const isLocalAssetImageNode = node.type === NODE_TYPES.LOCAL_ASSET_IMAGE;
  const isRoleInputNode = node.type === NODE_TYPES.ROLE_INPUT;
  const isRoleStructurerNode = node.type === NODE_TYPES.ROLE_STRUCTURER;
  const isGroupContainer = node.type === NODE_TYPES.GROUP_CONTAINER;
  const isCompactInput = isInput && !!node.data.compact;
  const isSimpleMediaInputNode = isInput && !isCompactInput;
  const isInlineText2ImgNode = isProcessor && node.data.mode === "text2img";
  const isInlineImg2ImgNode = isProcessor && node.data.mode === "multi_image_generate";
  const isInlineImageGenNode = isInlineText2ImgNode || isInlineImg2ImgNode;
  const isImageCreationNode = isProcessor && node.data.title === "图像创作";
  const hideInlineAiResults =
    isInlineText2ImgNode || (isVideoGen && (node.data.mode === "img2video" || node.data.mode === "text2video"));
  const hasDedicatedLastFrameInput = false;
  const preferredReferenceVideoModelId =
    videoModelOptions.find((item) => isSeedanceOmniReferenceModel(item?.id, item?.name, item?.label, item?.remark))?.id ||
    node.data.model ||
    "";
  const fallbackVideoModelId = videoModelOptions[0]?.id || "";
  const resolveAssetUrl = (url) => {
    if (url && url.startsWith("/main_assets/")) {
      return `${(API_BASE || "").replace(/\/+$/, "")}${url}`;
    }
    return url;
  };
  const normalizedHoveredConnectHandle = normalizeConnectionTargetHandle(hoveredConnectTarget?.toHandle);
  const isMainInputTargetHighlighted =
    connecting &&
    hoveredConnectTarget?.nodeId === node.id &&
    normalizedHoveredConnectHandle === VIDEO_GEN_INPUT_HANDLE_MAIN;
  const isLastFrameTargetHighlighted =
    connecting &&
    hoveredConnectTarget?.nodeId === node.id &&
    normalizedHoveredConnectHandle === VIDEO_GEN_INPUT_HANDLE_LAST_FRAME;
  const compactImages = isCompactInput ? (node.data.images || []) : EMPTY_LIST;
  const compactActiveImage = compactImages[compactActiveIndex] || compactImages[0] || "";
  const compactActiveIsVideo = isVideoContent(compactActiveImage);
  const compactThreeViewSources =
    isCompactInput && node.data.compactThreeViewSourceImages && typeof node.data.compactThreeViewSourceImages === "object"
      ? node.data.compactThreeViewSourceImages
      : {};
  const hasCompactThreeViewResult =
    isCompactInput &&
    !!String(compactThreeViewSources?.[compactActiveIndex] || node.data.compactThreeViewSourceImage || "").trim();
  const compactActionBusy =
    compactRmbgPending ||
    compactRemovePending ||
    compactThreeViewPending ||
    compactVideoUpscalePending ||
    videoRmbgPending ||
    videoLineartPending;
  const simpleMediaImages = isSimpleMediaInputNode ? (node.data.images || []) : EMPTY_LIST;
  const simpleMediaActiveItem = simpleMediaActionIndex >= 0 ? simpleMediaImages[simpleMediaActionIndex] || "" : "";
  const simpleMediaActiveIsVideo = isVideoContent(simpleMediaActiveItem);
  const hasSimpleMediaSelection = isSimpleMediaInputNode && simpleMediaActionIndex >= 0 && !!simpleMediaActiveItem;
  const hasSimpleMediaVideoSelection = hasSimpleMediaSelection && simpleMediaActiveIsVideo;
  const inlineImageSizeOptions = inlineImageParamOptions.size.length ? inlineImageParamOptions.size : ["1k", "2k", "4k"];
  const inlineImageRatioOptions = inlineImageParamOptions.ratio.length ? inlineImageParamOptions.ratio : ASPECT_RATIOS.map((item) => item.label);

  const setVideoReferenceMode = useCallback(
    (mode) => {
      if (!isVideoGen) return;
      const isFirstLast = mode === "first_last";
      updateData(node.id, {
        mode: "img2video",
        title: isFirstLast ? "视频创作" : "全能生视频",
        model: isFirstLast
          ? (node.data.model || fallbackVideoModelId)
          : (preferredReferenceVideoModelId || node.data.model || fallbackVideoModelId),
        templates: {
          ...(node.data.templates || {}),
          imageType: isFirstLast ? "2" : "4",
          camera: isFirstLast ? "固定镜头(Fixed)" : (node.data.templates?.camera || "推近(Zoom In)"),
          generate_audio_new: node.data.templates?.generate_audio_new ?? true,
        },
        firstLastFrameOnly: isFirstLast,
        omniReferenceOnly: !isFirstLast,
      });
    },
    [fallbackVideoModelId, isVideoGen, node.data.model, node.data.templates, node.id, preferredReferenceVideoModelId, updateData],
  );

  const handleVideoLastFrameUpload = useCallback(
    async (event) => {
      const files = Array.from(event.target.files || []).filter((file) => isImageFileLike(file));
      if (!files.length) {
        event.target.value = "";
        return;
      }
      try {
        const [lastFrameImage] = await readFilesAsDataUrls(files.slice(0, 1));
        if (lastFrameImage) {
          updateData(node.id, { lastFrameImage });
        }
      } finally {
        event.target.value = "";
      }
    },
    [node.id, updateData],
  );

  useEffect(() => {
    if (!shouldAutoOpenUploadPicker || !isSimpleMediaInputNode) return;
    setShowSimpleMediaToolbar(true);
  }, [isSimpleMediaInputNode, shouldAutoOpenUploadPicker]);

  useEffect(() => {
    let cancelled = false;
    if (!isInlineImageGenNode || typeof resolveModelParamsForId !== "function" || !String(node.data.model || "").trim()) {
      setInlineImageParamOptions({ size: EMPTY_LIST, ratio: EMPTY_LIST });
      setInlineImageParamLoading(false);
      setInlineImageParamError("");
      return () => {
        cancelled = true;
      };
    }
    setInlineImageParamLoading(true);
    setInlineImageParamError("");
    resolveModelParamsForId(String(node.data.model || "").trim())
      .then((paramList) => {
        if (cancelled) return;
        setInlineImageParamOptions({
          size: listAIChatParamValues(paramList, ["size", "尺寸"]),
          ratio: listAIChatParamValues(paramList, ["ratio", "比例", "宽高比"]),
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setInlineImageParamError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (cancelled) return;
        setInlineImageParamLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isInlineImageGenNode, node.data.model, resolveModelParamsForId]);

  useEffect(() => {
    if (!shouldAutoOpenUploadPicker || !isSimpleMediaInputNode || !showSimpleMediaToolbar) return;
    const timer = window.setTimeout(() => {
      simpleMediaUploadInputRef.current?.click();
      onAutoOpenUploadPickerHandled?.(node.id);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [
    isSimpleMediaInputNode,
    node.id,
    onAutoOpenUploadPickerHandled,
    shouldAutoOpenUploadPicker,
    showSimpleMediaToolbar,
  ]);

  useEffect(() => {
    setCompactActiveIndex((prev) => {
      const maxIndex = Math.max(0, compactImages.length - 1);
      return Math.min(prev, maxIndex);
    });
  }, [compactImages.length]);

  useEffect(() => {
    setSimpleMediaActionIndex((prev) => {
      const mediaCount = Array.isArray(node.data?.images) ? node.data.images.length : 0;
      if (mediaCount <= 0) return -1;
      return Math.min(prev, mediaCount - 1);
    });
  }, [node.data?.images?.length]);

  useEffect(() => {
    if (simpleMediaActionIndex < 0) {
      setShowSimpleVideoEditor(false);
    }
  }, [simpleMediaActionIndex]);

  useEffect(() => {
    setShowCompactInputActions(false);
    setShowCompactVideoUpscaleOptions(false);
    setShowSimpleVideoUpscaleOptions(false);
    setShowSimpleVideoEditor(false);
    setShowSimpleMediaToolbar(false);
    setCompactActiveIndex(0);
    setSimpleMediaActionIndex(-1);
    setVideoSplitDuration(0);
    setVideoSplitOutputResolution(DEFAULT_VIDEO_SPLIT_OUTPUT_RESOLUTION);
    setVideoSplitIncludeAudio(false);
    setIsUploadDropActive(false);
    const nextSegments = normalizeVideoSplitSegments([]);
    setVideoSplitSegments(nextSegments);
    setVideoSplitDrafts(buildVideoSplitDrafts(nextSegments));
  }, [node.id]);

  useEffect(() => {
    if (!showCompactInputActions) {
      setShowCompactVideoUpscaleOptions(false);
    }
  }, [showCompactInputActions]);

  useEffect(() => {
    if (!showSimpleMediaToolbar) {
      setShowSimpleVideoUpscaleOptions(false);
    }
  }, [showSimpleMediaToolbar]);

  useEffect(() => {
    if (!showCompactInputActions && simpleMediaActionIndex < 0 && !showSimpleMediaToolbar) return undefined;

    const handleOutsideMouseDown = (event) => {
      if (nodeRootRef.current?.contains(event.target)) return;
      setShowCompactInputActions(false);
      setShowCompactVideoUpscaleOptions(false);
      setShowSimpleVideoUpscaleOptions(false);
      setShowSimpleMediaToolbar(false);
      setSimpleMediaActionIndex(-1);
      setShowSimpleVideoEditor(false);
    };

    document.addEventListener("mousedown", handleOutsideMouseDown, true);
    return () => {
      document.removeEventListener("mousedown", handleOutsideMouseDown, true);
    };
  }, [showCompactInputActions, showSimpleMediaToolbar, simpleMediaActionIndex]);

  useEffect(() => {
    if (!showSimpleVideoEditor) return;
    setShowSimpleVideoUpscaleOptions(false);
    setVideoSplitDuration(0);
    setVideoSplitOutputResolution(DEFAULT_VIDEO_SPLIT_OUTPUT_RESOLUTION);
    setVideoSplitIncludeAudio(false);
    const nextSegments = normalizeVideoSplitSegments([]);
    setVideoSplitSegments(nextSegments);
    setVideoSplitDrafts(buildVideoSplitDrafts(nextSegments));
  }, [showSimpleVideoEditor, simpleMediaActiveItem]);

  useEffect(() => {
    if (!isSimpleMediaInputNode) {
      setIsUploadDropActive(false);
    }
  }, [isSimpleMediaInputNode]);

  const handleCompactThreeViewClick = async () => {
    if (compactActionBusy) return;
    try {
      setCompactThreeViewPending(true);
      await onRunCompactThreeView?.(node.id, compactActiveIndex);
      setShowCompactInputActions(false);
    } catch (error) {
      console.error("[Workbench] three_view_direct:error", error);
      const message = error instanceof Error ? error.message : String(error || "三视图生成失败");
      setRunToast({ message: `三视图失败：${message}`, type: "error" });
      setTimeout(() => setRunToast(null), 2600);
    } finally {
      setCompactThreeViewPending(false);
    }
  };

  const handleCompactRmbgClick = async () => {
    if (compactActionBusy) return;
    try {
      setCompactRmbgPending(true);
      await onRunCompactRmbg?.(node.id, compactActiveIndex);
      setShowCompactInputActions(false);
    } catch (error) {
      console.error("[Workbench] rmbg_direct:error", error);
    } finally {
      setCompactRmbgPending(false);
    }
  };

  const handleCompactRemoveClick = async () => {
    if (compactActionBusy) return;
    try {
      setCompactRemovePending(true);
      await onRunCompactRemoveWatermark?.(node.id, compactActiveIndex);
      setShowCompactInputActions(false);
    } catch (error) {
      console.error("[Workbench] remove_watermark_direct:error", error);
    } finally {
      setCompactRemovePending(false);
    }
  };

  const handleCompactVideoUpscaleClick = async () => {
    if (compactActionBusy) return;
    setShowCompactVideoUpscaleOptions((prev) => !prev);
  };

  const handleCompactVideoUpscaleOptionClick = async (templateEnum) => {
    if (compactActionBusy) return;
    try {
      setCompactVideoUpscalePending(true);
      await onRunCompactVideoUpscale?.(node.id, compactActiveIndex, templateEnum);
      setShowCompactVideoUpscaleOptions(false);
      setShowCompactInputActions(false);
    } catch (error) {
      console.error("[Workbench] video_upscale_direct:error", error);
    } finally {
      setCompactVideoUpscalePending(false);
    }
  };

  const handleSimpleVideoUpscaleClick = async () => {
    if (compactActionBusy) return;
    setShowSimpleVideoEditor(false);
    setShowSimpleVideoUpscaleOptions((prev) => !prev);
  };

  const handleSimpleVideoUpscaleOptionClick = async (templateEnum) => {
    if (compactActionBusy || simpleMediaActionIndex < 0) return;
    try {
      setCompactVideoUpscalePending(true);
      await onRunCompactVideoUpscale?.(node.id, simpleMediaActionIndex, templateEnum);
      setShowSimpleVideoUpscaleOptions(false);
      setShowSimpleMediaToolbar(false);
    } catch (error) {
      console.error("[Workbench] simple_video_upscale_direct:error", error);
    } finally {
      setCompactVideoUpscalePending(false);
    }
  };

  const handleVideoLineartRun = async (mediaIndex = 0) => {
    if (compactActionBusy) return;
    try {
      setVideoLineartPending(true);
      await onRunVideoLineart?.(node.id, mediaIndex, {
        lineStrength: DEFAULT_VIDEO_LINEART_STRENGTH,
        lineColor: DEFAULT_VIDEO_LINEART_COLOR,
      });
      setShowCompactInputActions(false);
      setShowCompactVideoUpscaleOptions(false);
    } catch (error) {
      console.error("[Workbench] video_lineart_direct:error", error);
    } finally {
      setVideoLineartPending(false);
    }
  };

  const handleVideoRmbgRun = async (mediaIndex = 0) => {
    if (compactActionBusy) return;
    try {
      setVideoRmbgPending(true);
      await onRunVideoRmbg?.(node.id, mediaIndex);
      setShowCompactInputActions(false);
      setShowCompactVideoUpscaleOptions(false);
    } catch (error) {
      console.error("[Workbench] video_rmbg_direct:error", error);
    } finally {
      setVideoRmbgPending(false);
    }
  };

  const handleCompactVideoRmbgClick = async () => {
    if (compactActionBusy) return;
    setShowCompactVideoUpscaleOptions(false);
    await handleVideoRmbgRun(compactActiveIndex);
  };

  const handleCompactVideoLineartClick = async () => {
    if (compactActionBusy) return;
    setShowCompactVideoUpscaleOptions(false);
    await handleVideoLineartRun(compactActiveIndex);
  };

  const handleSimpleVideoRmbgClick = async () => {
    if (videoRmbgPending) return;
    setShowSimpleVideoEditor(false);
    await handleVideoRmbgRun(simpleMediaActionIndex);
  };

  const handleSimpleVideoLineartClick = async () => {
    if (videoLineartPending) return;
    setShowSimpleVideoEditor(false);
    await handleVideoLineartRun(simpleMediaActionIndex);
  };

  const handleSimpleImageThreeViewClick = async () => {
    if (compactActionBusy || simpleMediaActionIndex < 0) return;
    try {
      setCompactThreeViewPending(true);
      await onRunCompactThreeView?.(node.id, simpleMediaActionIndex);
      setSimpleMediaActionIndex(-1);
    } catch (error) {
      console.error("[Workbench] simple_three_view_direct:error", error);
      const message = error instanceof Error ? error.message : String(error || "三视图生成失败");
      setRunToast({ message: `三视图失败：${message}`, type: "error" });
      setTimeout(() => setRunToast(null), 2600);
    } finally {
      setCompactThreeViewPending(false);
    }
  };

  const handleSimpleImageRmbgClick = async () => {
    if (compactActionBusy || simpleMediaActionIndex < 0) return;
    try {
      setCompactRmbgPending(true);
      await onRunCompactRmbg?.(node.id, simpleMediaActionIndex);
      setSimpleMediaActionIndex(-1);
    } catch (error) {
      console.error("[Workbench] simple_rmbg_direct:error", error);
    } finally {
      setCompactRmbgPending(false);
    }
  };

  const handleSimpleImageRemoveClick = async () => {
    if (compactActionBusy || simpleMediaActionIndex < 0) return;
    try {
      setCompactRemovePending(true);
      await onRunCompactRemoveWatermark?.(node.id, simpleMediaActionIndex);
      setSimpleMediaActionIndex(-1);
    } catch (error) {
      console.error("[Workbench] simple_remove_watermark_direct:error", error);
    } finally {
      setCompactRemovePending(false);
    }
  };

  const handleSimpleVideoEditorClick = () => {
    if (videoSplitPending) return;
    setShowSimpleVideoEditor(true);
  };

  const handleVideoSplitMetadataLoaded = (event) => {
    const nextDuration = Number(event.currentTarget?.duration || 0);
    if (!Number.isFinite(nextDuration) || nextDuration <= 0) return;
    setVideoSplitDuration(nextDuration);
    setVideoSplitSegments((prev) => {
      const normalized = normalizeVideoSplitSegments(prev, nextDuration);
      setVideoSplitDrafts(buildVideoSplitDrafts(normalized));
      return normalized;
    });
  };

  const commitVideoSplitDrafts = useCallback(
    (drafts = videoSplitDrafts) => {
      const next = drafts.map((item, index) => {
        const base = videoSplitSegments[index] || { startSec: 0, endSec: DEFAULT_VIDEO_SPLIT_SEGMENT_LENGTH_SEC };
        const startSec =
          String(item?.startSec ?? "").trim() === ""
            ? base.startSec
            : normalizeVideoSplitSecond(item?.startSec, base.startSec);
        const endSec =
          String(item?.endSec ?? "").trim() === ""
            ? base.endSec
            : normalizeVideoSplitSecond(item?.endSec, base.endSec);
        return {
          startSec,
          endSec,
        };
      });
      const normalized = normalizeVideoSplitSegments(next, videoSplitDuration);
      setVideoSplitSegments(normalized);
      setVideoSplitDrafts(buildVideoSplitDrafts(normalized));
      return normalized;
    },
    [videoSplitDrafts, videoSplitSegments, videoSplitDuration],
  );

  const handleVideoSplitSegmentChange = (index, key, value) => {
    setVideoSplitDrafts((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              [key]: value,
            }
          : item,
      ),
    );
  };

  const handleVideoSplitSegmentAdd = () => {
    setVideoSplitSegments((prev) => {
      const normalizedPrev = normalizeVideoSplitSegments(prev, videoSplitDuration);
      const last = normalizedPrev[normalizedPrev.length - 1] || { startSec: 0, endSec: 0 };
      let startSec = normalizeVideoSplitSecond(last.endSec, 0);
      let endSec = startSec + DEFAULT_VIDEO_SPLIT_SEGMENT_LENGTH_SEC;
      if (videoSplitDuration > 0) {
        if (startSec >= videoSplitDuration) {
          startSec = Math.max(0, videoSplitDuration - 1);
        }
        endSec = Math.min(videoSplitDuration, Math.max(startSec + 0.5, endSec));
      }
      const normalized = normalizeVideoSplitSegments(
        [
          ...normalizedPrev,
          {
            startSec,
            endSec,
          },
        ],
        videoSplitDuration,
      );
      setVideoSplitDrafts(buildVideoSplitDrafts(normalized));
      return normalized;
    });
  };

  const handleVideoSplitSegmentRemove = (index) => {
    setVideoSplitSegments((prev) => {
      const normalized = normalizeVideoSplitSegments(prev.filter((_, itemIndex) => itemIndex !== index), videoSplitDuration);
      setVideoSplitDrafts(buildVideoSplitDrafts(normalized));
      return normalized;
    });
  };

  const handleVideoSplitRun = async () => {
    if (videoSplitPending || simpleMediaActionIndex < 0) return;
    try {
      const normalized = commitVideoSplitDrafts();
      const effectiveSegments = normalized.length
        ? normalized
        : videoSplitDuration > 0
        ? [{ startSec: 0, endSec: videoSplitDuration }]
        : [];
      if (!effectiveSegments.length) return;
      setVideoSplitPending(true);
      await onRunVideoSplit?.(node.id, simpleMediaActionIndex, effectiveSegments, {
        outputResolution: videoSplitOutputResolution,
        includeAudio: videoSplitIncludeAudio,
      });
      setShowSimpleVideoEditor(false);
    } catch (error) {
      console.error("[Workbench] video_split_direct:error", error);
    } finally {
      setVideoSplitPending(false);
    }
  };

  let statusColor =
    "border-slate-200 shadow-[0_24px_56px_rgba(15,23,42,0.08)] hover:border-slate-300";
  if (node.data.status === "error") {
    statusColor =
      "border-rose-200 shadow-[0_24px_60px_rgba(244,63,94,0.08)] ring-1 ring-rose-100";
  } else if (node.data.status === "success") {
    statusColor =
      "border-emerald-200 shadow-[0_24px_60px_rgba(16,185,129,0.08)]";
  }
  if (selected) {
    statusColor = `${statusColor} ring-1 ring-cyan-200/90 shadow-[0_28px_64px_rgba(6,182,212,0.12)] ${
      node.data.status === "error" || node.data.status === "success" ? "" : "border-cyan-300"
    }`;
  }

  let title = "Node";
  if (isInput) {
    const mediaKind = normalizeInputMediaKind(node.data.mediaKind);
    const defaultInputTitle = isCompactInput
      ? "图片编辑区"
      : mediaKind === "image"
      ? getReferenceNodeTitle("image")
      : mediaKind === "video"
      ? getReferenceNodeTitle("video")
      : getReferenceNodeTitle("mixed");
    title = node.data.title || defaultInputTitle;
  }
  if (isOutput) title = node.data.title || (node.data.angleLabel ? `${node.data.angleLabel} 输出` : "输出");
  if (isProcessor) title = node.data.title || TOOL_CARDS[node.data.mode]?.name || "图片生成";
  if (isPostProcessor) title = node.data.title || TOOL_CARDS[node.data.mode]?.name || "后期增强";
  if (isVideoGen) title = node.data.title || TOOL_CARDS[node.data.mode]?.name || "视频生成";
  if (isTextInputNode) title = "提示词";
  if (isStoryboardInputNode) title = "故事板输入";
  if (isRoleStructurerNode) title = "角色结构化";
  if (isLocalAssetImageNode) title = String(node.data?.title || node.data?.character_name || "本地素材").trim();

  const safeProgressWidth = (() => {
    const total = node.data.total || 0;
    const prog = node.data.progress || 0;
    if (!total) return "0%";
    return `${Math.min(100, (prog / total) * 100)}%`;
  })();

  const mediaToolbarClass = "rounded-[12px] bg-[#F3F4F6] px-3 py-2 shadow-[0_2px_8px_rgba(0,0,0,0.05)]";
  const mediaToolbarRowClass = "flex items-center gap-4 overflow-x-auto whitespace-nowrap pr-1 custom-scrollbar";
  const mediaToolbarOptionRowClass = "mt-2 flex items-center gap-4 overflow-x-auto whitespace-nowrap rounded-[10px] bg-[#EAECF0] px-2 py-1.5 pr-1 custom-scrollbar";
  const mediaToolbarIconClass = "h-[17px] w-[17px] shrink-0";
  const getMediaToolbarButtonClass = ({ active = false, tone = "default" } = {}) => {
    const base =
      "inline-flex h-9 items-center gap-2 rounded-[8px] bg-transparent px-3 text-[13px] font-medium text-[#374151] transition-colors disabled:cursor-wait disabled:opacity-60";
    if (tone === "danger") {
      return `${base} hover:bg-rose-100/80 hover:text-rose-700 active:bg-rose-200/80`;
    }
    if (active) {
      return `${base} bg-[#DBEAFE] text-[#2563EB] hover:bg-[#DBEAFE] active:bg-[#BFDBFE]`;
    }
    return `${base} hover:bg-[#E5E7EB] active:bg-[#D1D5DB]`;
  };
  const renderBackgroundProcessingOverlay = ({
    title: overlayTitle = "正在抠图",
    description = "请稍候，正在智能识别主体与背景",
  } = {}) => (
    <div className="pointer-events-none absolute inset-0 z-[3] flex items-center justify-center bg-[rgba(15,23,42,0.22)] px-4 backdrop-blur-[4px]">
      <div className="w-full max-w-[280px] rounded-[16px] border border-white/70 bg-white/88 px-6 py-6 text-left shadow-[0_8px_30px_rgba(0,0,0,0.12)] backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="relative h-11 w-11 shrink-0">
            <div className="absolute -inset-1 rounded-full bg-[radial-gradient(circle,rgba(96,165,250,0.18),rgba(16,185,129,0.08),transparent_70%)] blur-md" />
            <div className="absolute inset-0 animate-[spin_1.15s_linear_infinite] rounded-full bg-[conic-gradient(from_220deg,rgba(59,130,246,0.08),rgba(59,130,246,0.92),rgba(16,185,129,0.82),rgba(59,130,246,0.08))]" />
            <div className="absolute inset-[4px] rounded-full bg-white/92" />
            <div className="absolute inset-[11px] rounded-full bg-[radial-gradient(circle_at_30%_30%,rgba(191,219,254,0.95),rgba(219,234,254,0.35))]" />
          </div>
          <div className="min-w-0">
            <div className="text-[15px] font-semibold text-slate-900">{overlayTitle}</div>
            <div className="mt-1 text-[12px] leading-5 text-slate-500">{description}</div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderArtifactThumb = (img, i, meta = {}) => {
    const next = {
      url: img,
      kind: isVideoContent(img) ? "video" : "image",
      fromNodeId: node.id,
      createdAt: Date.now(),
      meta,
    };
    const isActive = isSameArtifactSelection(activeArtifact, next);

    return (
      <div
        key={i}
        className={`aspect-square relative group overflow-hidden rounded-[18px] border bg-white shadow-[0_12px_28px_rgba(15,23,42,0.08)] cursor-pointer ${
          isActive ? "border-amber-300 ring-1 ring-amber-200" : "border-slate-200"
        }`}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          // ✅ 点缩略图：只预览
          onPreview?.(img);
        }}
        title="点击预览"
      >
        {isVideoContent(img) ? (
          <video src={img} className="w-full h-full object-cover" muted loop playsInline />
        ) : (
          <img src={img} className="w-full h-full object-cover" alt="" />
        )}

        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />

        {/* ✅ 真正可点的“选中产物”按钮：只选中，不预览 */}
        <button
          type="button"
          className="nodrag absolute bottom-1.5 left-1.5 text-[9px] px-2 py-1 rounded-full border border-slate-200 bg-white/95 text-slate-700 opacity-0 backdrop-blur-sm group-hover:opacity-100 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 transition"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();

            // ✅ 再点一次同一个：取消选中
            onSelectArtifact?.(isActive ? null : next);
          }}

          title="选中为 Agent 上下文"
        >
          选中产物
        </button>

        {isActive && (
          <div className="absolute top-1 left-1">
            <CheckCircle2 className="w-4 h-4 text-yellow-300 drop-shadow" />
          </div>
        )}
      </div>
    );
  };

  const runRoleStructurer = () => {
    const profile = buildRoleProfileStructuredOutput({
      roleName: node.data.roleName,
      characterSetting: node.data.characterSetting,
      relationshipNetwork: node.data.relationshipNetwork,
      worldviewBackground: node.data.worldviewBackground,
    });
    const outputText = JSON.stringify(profile, null, 2);
    updateData(node.id, {
      structuredProfile: profile,
      text: outputText,
      status: "success",
      error: "",
    });
  };

  const selectedNodeShellClass = selected
    ? "ring-1 ring-cyan-200/90 shadow-[0_28px_64px_rgba(6,182,212,0.12)]"
    : "";
  const showFloatingDeleteButton = Boolean(onDelete);
  const showFloatingRetryButton = !isCompactInput && !isTextInputNode && !isStoryboardInputNode && !isRoleInputNode && !isRoleStructurerNode && !isSimpleMediaInputNode && !isInlineImageGenNode && !isOutput && node.data.status === "error";
  const nodeZIndex = isVideoGen ? 120 : selected ? 20 : undefined;
  const nodeShellStyle = {
    left: node.x,
    top: node.y,
    zIndex: nodeZIndex,
    ...(isStoryboardPlanNode ? { width: 1280, maxWidth: 1280 } : isStoryboardInputNode ? { width: 380, maxWidth: 380 } : isLocalAssetImageNode ? { width: 200, maxWidth: 200 } : {}),
  };
  const handleStoryboardWheelCapture = isStoryboardPlanNode
    ? (event) => {
        event.stopPropagation();
      }
    : undefined;
  const nodeShellClass = isTextInputNode
    ? `absolute w-[320px] overflow-visible rounded-[16px] border bg-white shadow-[0_18px_42px_rgba(15,23,42,0.08)] flex flex-col transition-colors duration-200 ${
        node.data.status === "error" ? "border-rose-300" : selected ? "border-cyan-300" : "border-slate-200"
      } ${selectedNodeShellClass}`
    : isStoryboardInputNode
    ? `absolute w-[380px] overflow-visible rounded-[20px] border bg-white shadow-[0_20px_46px_rgba(15,23,42,0.10)] flex flex-col transition-colors duration-200 ${
        node.data.status === "error" ? "border-rose-300" : node.data.status === "running" ? "border-cyan-300 ring-1 ring-cyan-100" : selected ? "border-cyan-300" : "border-slate-200"
      } ${selectedNodeShellClass}`
    : isRoleInputNode
    ? `absolute h-[76px] w-[76px] overflow-visible rounded-full border bg-white shadow-[0_16px_36px_rgba(15,23,42,0.12)] flex items-center justify-center transition-colors duration-200 ${
        selected ? "border-cyan-300" : "border-white"
      } ${selectedNodeShellClass}`
    : isRoleStructurerNode
    ? `absolute w-[360px] overflow-visible rounded-[22px] border bg-white shadow-[0_18px_42px_rgba(15,23,42,0.08)] flex flex-col transition-colors duration-200 ${
        node.data.status === "error" ? "border-rose-300" : selected ? "border-cyan-300" : "border-slate-200"
      } ${selectedNodeShellClass}`
    : isOutput
    ? `absolute w-[280px] overflow-visible rounded-[16px] border bg-white shadow-[0_14px_30px_rgba(15,23,42,0.06)] flex flex-col transition-colors duration-200 ${
        selected ? "border-cyan-300" : "border-[#E5E7EB]"
      } ${selectedNodeShellClass}`
    : isStoryboardPlanNode
    ? `absolute w-[1280px] max-w-[1280px] overflow-visible rounded-[18px] border bg-white shadow-[0_24px_56px_rgba(15,23,42,0.10)] flex flex-col transition-colors duration-200 ${
        node.data.status === "error" ? "border-rose-300" : selected ? "border-cyan-300" : "border-slate-200"
      } ${selectedNodeShellClass}`
    : isLocalAssetImageNode
    ? `absolute w-[200px] overflow-visible rounded-[14px] border bg-white shadow-[0_8px_24px_rgba(15,23,42,0.08)] flex flex-col transition-colors duration-200 ${
        selected ? "border-cyan-300" : "border-slate-200"
      } ${selectedNodeShellClass}`
    : isInlineImageGenNode
    ? `absolute w-[280px] overflow-visible rounded-[16px] border bg-white shadow-[0_14px_30px_rgba(15,23,42,0.06)] flex flex-col transition-colors duration-200 ${
        selected ? "border-cyan-300" : "border-[#E5E7EB]"
      } ${selectedNodeShellClass}`
    : isSimpleMediaInputNode
    ? `absolute w-[280px] overflow-visible rounded-[16px] border bg-white shadow-[0_14px_30px_rgba(15,23,42,0.06)] flex flex-col transition-colors duration-200 ${
        selected ? "border-cyan-300" : "border-[#E5E7EB]"
      } ${selectedNodeShellClass}`
    : `absolute ${isCompactInput ? "w-[292px] overflow-visible rounded-[16px] border-slate-200" : "w-[280px] overflow-visible rounded-[16px]"} border bg-white backdrop-blur-xl shadow-[0_24px_56px_rgba(15,23,42,0.12)] flex flex-col transition-colors transition-shadow duration-200 ${statusColor}`;

  if (isGroupContainer) {
    const gw = Number(node.data.width) || 800;
    const gh = Number(node.data.height) || 400;
    return (
      <div
        ref={nodeRootRef}
        className="absolute"
        style={{ left: node.x, top: node.y, width: gw, height: gh, zIndex: 0, userSelect: "none" }}
        onMouseDown={onMouseDown}
      >
        <div
          className="w-full h-full rounded-2xl"
          style={{
            background: "rgba(15, 23, 42, 0.72)",
            border: selected ? "1.5px solid rgba(6,182,212,0.45)" : "1px solid rgba(51,65,85,0.55)",
            boxShadow: selected ? "0 0 0 2px rgba(6,182,212,0.1)" : "inset 0 1px 0 rgba(255,255,255,0.03)",
          }}
        >
          {node.data.title && (
            <div
              className="px-4 pt-3.5 text-[11px] font-semibold tracking-widest uppercase"
              style={{ color: "rgba(148,163,184,0.9)", letterSpacing: "0.1em" }}
            >
              {node.data.title}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={nodeRootRef}
      className={`${nodeShellClass} group/node`}
      style={nodeShellStyle}
      onMouseDown={onMouseDown}
      onWheelCapture={handleStoryboardWheelCapture}
    >
      {!isCompactInput && !isRoleInputNode && (
        <div className="absolute -top-5 left-0 cursor-grab select-none text-[11px] font-medium tracking-[0.08em] text-slate-500 active:cursor-grabbing">
          {title}
        </div>
      )}

      {showFloatingRetryButton || showFloatingDeleteButton ? (
        <div className="pointer-events-none absolute right-3 top-3 z-20 flex gap-1">
          {showFloatingRetryButton ? (
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onRetry?.();
              }}
              className="pointer-events-auto rounded-full border border-rose-200 bg-rose-50 p-1.5 text-rose-600 transition hover:border-rose-300 hover:bg-rose-100"
              title="重试"
              type="button"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          ) : null}

          {showFloatingDeleteButton ? (
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onDelete?.();
              }}
              className="pointer-events-none rounded-full border border-slate-200 bg-white p-1.5 text-slate-500 opacity-0 shadow-[0_8px_20px_rgba(15,23,42,0.12)] transition-all duration-150 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600 group-hover/node:pointer-events-auto group-hover/node:opacity-100"
              type="button"
              aria-label="删除节点"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : null}
        </div>
      ) : null}

      {isVideoGen && (node.data.mode === "img2video" || node.data.mode === "text2video") && (
        <>
          {node.data.mode === "img2video" ? (
            <div className="nodrag space-y-2 px-4 pt-3" onMouseDown={(e) => e.stopPropagation()}>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setVideoReferenceMode("first_last")}
                  className={`rounded-[10px] border px-3 py-2 text-[11px] font-medium transition-colors ${
                    node.data.firstLastFrameOnly
                      ? "border-cyan-200 bg-cyan-50 text-cyan-700"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  }`}
                >
                  首尾帧参考
                </button>
                <button
                  type="button"
                  onClick={() => setVideoReferenceMode("omni")}
                  className={`rounded-[10px] border px-3 py-2 text-[11px] font-medium transition-colors ${
                    node.data.omniReferenceOnly
                      ? "border-cyan-200 bg-cyan-50 text-cyan-700"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  }`}
                >
                  全能参考
                </button>
              </div>
              {node.data.firstLastFrameOnly ? (
                <div className="rounded-[12px] border border-slate-200 bg-white p-2">
                  <input
                    ref={videoLastFrameInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      void handleVideoLastFrameUpload(event);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => videoLastFrameInputRef.current?.click()}
                    className="flex min-h-[72px] w-full items-center gap-3 rounded-[10px] border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-left transition-colors hover:border-cyan-200 hover:bg-cyan-50/60"
                  >
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-slate-200 bg-white">
                      {node.data.lastFrameImage ? (
                        <img src={node.data.lastFrameImage} alt="尾帧参考" className="h-full w-full object-cover" />
                      ) : (
                        <ImagePlus className="h-5 w-5 text-slate-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold text-slate-700">
                        {node.data.lastFrameImage ? "更换尾帧参考" : "上传尾帧参考"}
                      </div>
                      <div className="mt-1 text-[10px] leading-4 text-slate-400">尾帧已嵌入当前视频节点内部</div>
                    </div>
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
          <PropertyPanel
            embedded
            node={node}
            updateData={updateData}
            onClose={() => {}}
            apiFetch={apiFetch}
            onOpenPromptPolishPicker={onOpenPromptPolishPicker}
            imageModelOptions={imageModelOptions}
            videoModelOptions={videoModelOptions}
            resolveModelParamsForId={resolveModelParamsForId}
            personaMentionOptions={personaMentionOptions}
            onRunNode={onRunNode}
            onCancelNode={onCancelNode}
            isReady={isReady}
          />
        </>
      )}

      {isSimpleMediaInputNode ? (
        <input
          ref={simpleMediaUploadInputRef}
          type="file"
          multiple
          accept={simpleMediaInputAccept}
          className="hidden"
          onChange={handleFileUpload}
        />
      ) : null}

      {isSimpleMediaInputNode && (node.data.images?.length > 0) && (showSimpleMediaToolbar || hasSimpleMediaSelection) && (
	        <>
	          <div
	            className="absolute bottom-full left-1/2 z-30 mb-8 w-max max-w-[calc(100vw-48px)] -translate-x-1/2"
	            onMouseDown={(e) => e.stopPropagation()}
	          >
            <div className={`${mediaToolbarClass} w-max min-w-[252px]`}>
              <div className={mediaToolbarRowClass}>
              {hasSimpleMediaVideoSelection ? (
                <>
                  <button
                    type="button"
                    className={getMediaToolbarButtonClass({ active: !hasSimpleMediaSelection })}
                    onClick={openSimpleMediaUploadPicker}
                    title={simpleMediaUploadLabel}
                    aria-label={simpleMediaUploadLabel}
                  >
                    <Upload className={mediaToolbarIconClass} />
                    <span>上传</span>
                  </button>
                  <button
                    type="button"
                    disabled={videoSplitPending}
	                    className={getMediaToolbarButtonClass()}
	                    onClick={handleSimpleVideoEditorClick}
	                  >
	                    <Scissors className={mediaToolbarIconClass} />
	                    <span>视频编辑</span>
	                  </button>
	                  <button
	                    type="button"
	                    disabled={compactActionBusy}
	                    className={getMediaToolbarButtonClass({ active: showSimpleVideoUpscaleOptions })}
	                    onClick={handleSimpleVideoUpscaleClick}
	                  >
	                    {compactVideoUpscalePending ? <Loader2 className={`${mediaToolbarIconClass} animate-spin`} /> : <TrendingUp className={mediaToolbarIconClass} />}
	                    <span>视频超清</span>
	                  </button>
	                  <button
	                    type="button"
	                    disabled={videoRmbgPending || videoLineartPending || videoSplitPending}
	                    className={getMediaToolbarButtonClass()}
	                    onClick={handleSimpleVideoRmbgClick}
	                  >
	                    {videoRmbgPending ? <Loader2 className={`${mediaToolbarIconClass} animate-spin`} /> : <Wand2 className={mediaToolbarIconClass} />}
	                    <span>去背景</span>
	                  </button>
	                  <button
	                    type="button"
	                    disabled={videoRmbgPending || videoLineartPending || videoSplitPending}
	                    className={getMediaToolbarButtonClass()}
	                    onClick={handleSimpleVideoLineartClick}
	                  >
	                    <Scan className={mediaToolbarIconClass} />
	                    <span>转线稿</span>
	                  </button>
	                </>
	              ) : null}
	              {hasSimpleMediaSelection && !hasSimpleMediaVideoSelection ? (
	                <>
	                  <button
	                    type="button"
	                    className={getMediaToolbarButtonClass({ active: !hasSimpleMediaSelection })}
	                    onClick={openSimpleMediaUploadPicker}
	                    title={simpleMediaUploadLabel}
	                    aria-label={simpleMediaUploadLabel}
	                  >
	                    <Upload className={mediaToolbarIconClass} />
	                    <span>上传</span>
	                  </button>
	                  <button
	                    type="button"
	                    disabled={compactActionBusy}
	                    className={getMediaToolbarButtonClass()}
	                    onClick={handleSimpleImageThreeViewClick}
	                  >
	                    {compactThreeViewPending ? <Loader2 className={`${mediaToolbarIconClass} animate-spin`} /> : <Layout className={mediaToolbarIconClass} />}
	                    <span>三视图</span>
	                  </button>
	                  <button
	                    type="button"
	                    disabled={compactActionBusy}
	                    className={getMediaToolbarButtonClass()}
	                    onClick={handleSimpleImageRmbgClick}
	                  >
	                    {compactRmbgPending ? <Loader2 className={`${mediaToolbarIconClass} animate-spin`} /> : <Scissors className={mediaToolbarIconClass} />}
	                    <span>抠图</span>
	                  </button>
	                  <button
	                    type="button"
	                    disabled={compactActionBusy}
	                    className={getMediaToolbarButtonClass()}
	                    onClick={handleSimpleImageRemoveClick}
	                  >
	                    {compactRemovePending ? <Loader2 className={`${mediaToolbarIconClass} animate-spin`} /> : <Sparkles className={mediaToolbarIconClass} />}
	                    <span>去水印</span>
	                  </button>
	                </>
	              ) : null}
	              </div>
	            {hasSimpleMediaVideoSelection && showSimpleVideoUpscaleOptions ? (
	              <div className={mediaToolbarOptionRowClass}>
	                {VIDEO_HD_TEMPLATE_OPTIONS.map((item) => (
	                  <button
	                    key={`simple-video-hd-${item.value}`}
	                    type="button"
	                    disabled={compactActionBusy}
	                    className={getMediaToolbarButtonClass()}
	                    onClick={() => handleSimpleVideoUpscaleOptionClick(item.value)}
	                  >
	                    {item.label}
	                  </button>
	                ))}
	              </div>
	            ) : null}
	            </div>
	          </div>
	          {showSimpleVideoEditor && hasSimpleMediaVideoSelection ? (
	            <div
	              className="fixed inset-0 z-[170] flex items-center justify-center bg-white/42 px-4 backdrop-blur-[2px]"
	              onMouseDown={(e) => {
	                e.stopPropagation();
	                setShowSimpleVideoEditor(false);
	              }}
	            >
	              <div
	                className="relative w-full max-w-3xl border border-slate-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.12)]"
	                onMouseDown={(e) => e.stopPropagation()}
	              >
	                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
	                  <div>
	                    <div className="text-sm font-medium text-slate-900">视频编辑</div>
	                    <div className="mt-1 text-[11px] text-slate-500">对当前视频做多段分割，导出后会追加回当前上传组件。</div>
	                  </div>
	                  <button
	                    type="button"
	                    className="inline-flex h-8 w-8 items-center justify-center border border-slate-200 bg-white text-slate-500 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600"
	                    onClick={() => setShowSimpleVideoEditor(false)}
	                    title="关闭编辑器"
	                    aria-label="关闭编辑器"
	                  >
	                    <X className="h-4 w-4" />
	                  </button>
	                </div>
	                <div className="grid gap-0 md:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
	                  <div className="border-b border-slate-200 bg-slate-50 p-4 md:border-b-0 md:border-r">
	                    <div className="overflow-hidden border border-slate-200 bg-black">
	                      <video
	                        src={simpleMediaActiveItem}
	                        controls
	                        playsInline
	                        className="block aspect-video w-full bg-black object-contain"
	                        onLoadedMetadata={handleVideoSplitMetadataLoaded}
	                      />
	                    </div>
	                    <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
	                      <span>当前视频</span>
	                      <span>{videoSplitDuration > 0 ? `总时长 ${formatVideoSplitTime(videoSplitDuration)}` : "读取时长中..."}</span>
	                    </div>
	                  </div>
	                  <div className="p-4">
	                    <div className="flex items-center justify-between">
	                      <div className="text-[12px] font-medium text-slate-800">分段列表</div>
	                      <button
	                        type="button"
	                        className="inline-flex h-8 items-center justify-center gap-1.5 border border-slate-200 bg-white px-3 text-[11px] font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
	                        onClick={handleVideoSplitSegmentAdd}
	                      >
	                        <Plus className="h-3.5 w-3.5" />
	                        新增分段
	                      </button>
	                    </div>
	                    <div className="mt-3 space-y-2">
                        {videoSplitSegments.length === 0 ? (
                          <div className="border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-[11px] text-slate-500">
                            当前默认不分段，点击“新增分段”后开始编辑片段。
                          </div>
                        ) : null}
	                      {videoSplitSegments.map((segment, index) => (
	                        <div key={`${node.id}-split-${index}`} className="border border-slate-200 bg-slate-50 p-3">
	                          <div className="mb-2 flex items-center justify-between text-[11px] text-slate-500">
	                            <span>片段 {index + 1}</span>
	                            <button
	                              type="button"
	                              className="inline-flex h-7 w-7 items-center justify-center border border-slate-200 bg-white text-slate-500 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600"
	                              onClick={() => handleVideoSplitSegmentRemove(index)}
	                              title="删除分段"
	                              aria-label="删除分段"
	                            >
	                              <Trash2 className="h-3.5 w-3.5" />
	                            </button>
	                          </div>
	                          <div className="grid grid-cols-2 gap-2">
	                            <label className="text-[10px] text-slate-500">
	                              <div className="mb-1">开始秒数</div>
	                              <input
	                                type="number"
	                                step="0.1"
	                                value={videoSplitDrafts[index]?.startSec ?? ""}
	                                disabled={videoSplitPending}
	                                className="h-8 w-full border border-slate-200 bg-white px-2 text-[11px] text-slate-700 outline-none disabled:cursor-wait disabled:opacity-60"
	                                onChange={(e) => handleVideoSplitSegmentChange(index, "startSec", e.target.value)}
	                                onBlur={() => commitVideoSplitDrafts()}
	                              />
	                            </label>
	                            <label className="text-[10px] text-slate-500">
	                              <div className="mb-1">结束秒数</div>
	                              <input
	                                type="number"
	                                step="0.1"
	                                value={videoSplitDrafts[index]?.endSec ?? ""}
	                                disabled={videoSplitPending}
	                                className="h-8 w-full border border-slate-200 bg-white px-2 text-[11px] text-slate-700 outline-none disabled:cursor-wait disabled:opacity-60"
	                                onChange={(e) => handleVideoSplitSegmentChange(index, "endSec", e.target.value)}
	                                onBlur={() => commitVideoSplitDrafts()}
	                              />
	                            </label>
	                          </div>
	                          <div className="mt-2 text-[10px] text-slate-500">
	                            {formatVideoSplitTime(segment.startSec)} - {formatVideoSplitTime(segment.endSec)}
	                          </div>
	                        </div>
	                      ))}
	                    </div>
	                    <div className="mt-4 border border-slate-200 bg-slate-50 p-3">
	                      <label className="text-[10px] text-slate-500">
	                        <div className="mb-1">导出分辨率</div>
	                        <select
	                          value={videoSplitOutputResolution}
	                          disabled={videoSplitPending}
	                          className="h-8 w-full border border-slate-200 bg-white px-2 text-[11px] text-slate-700 outline-none disabled:cursor-wait disabled:opacity-60"
	                          onChange={(e) => setVideoSplitOutputResolution(String(e.target.value || DEFAULT_VIDEO_SPLIT_OUTPUT_RESOLUTION).trim().toLowerCase())}
	                        >
	                          {VIDEO_SPLIT_OUTPUT_RESOLUTION_OPTIONS.map((option) => (
	                            <option key={option} value={option}>
	                              {option.toUpperCase()}
	                            </option>
	                          ))}
	                        </select>
	                      </label>
                        <label className="mt-3 flex cursor-pointer items-center gap-2 text-[11px] text-slate-600">
                          <input
                            type="checkbox"
                            checked={videoSplitIncludeAudio}
                            disabled={videoSplitPending}
                            className="h-3.5 w-3.5 border border-slate-300 text-cyan-600"
                            onChange={(e) => setVideoSplitIncludeAudio(Boolean(e.target.checked))}
                          />
                          <span className="inline-flex items-center gap-1.5">
                            {videoSplitIncludeAudio ? <Volume2 className="h-3.5 w-3.5 text-slate-500" /> : <VolumeX className="h-3.5 w-3.5 text-slate-400" />}
                            导出音频
                          </span>
                        </label>
                        <div className="mt-1 text-[10px] text-slate-500">
                          未勾选时默认输出静音视频。
                        </div>
	                    </div>
		                    <div className="mt-4 flex justify-end border-t border-slate-200 pt-4">
	                      <button
	                        type="button"
	                        disabled={videoSplitPending || (videoSplitSegments.length === 0 && videoSplitDuration <= 0)}
	                        className="inline-flex h-9 min-w-[124px] items-center justify-center gap-1.5 border border-slate-200 bg-white px-5 text-[11px] font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-65"
	                        onClick={handleVideoSplitRun}
	                      >
	                        {videoSplitPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : videoSplitSegments.length === 0 ? <Download className="h-3.5 w-3.5" /> : <Scissors className="h-3.5 w-3.5" />}
	                        {videoSplitPending ? "处理中..." : videoSplitSegments.length === 0 ? "导出原片" : "导出分段"}
	                      </button>
	                    </div>
	                  </div>
	                </div>
	              </div>
	            </div>
	          ) : null}
	          <div className="absolute -top-5 left-0 cursor-grab select-none text-[11px] font-medium tracking-[0.08em] text-slate-500 active:cursor-grabbing">
	            {title}
	          </div>
        </>
      )}

      {isCompactInput && !showFloatingDeleteButton && (
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onDelete?.();
          }}
          className="nodrag absolute right-2.5 top-2.5 z-20 rounded-full border border-slate-200 bg-white/95 p-1.5 text-slate-500 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600"
          type="button"
          title="删除"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      <div className={`${isRoleInputNode ? "p-1.5" : isCompactInput ? "nodrag space-y-2 p-1.5" : isTextInputNode || isStoryboardInputNode || isSimpleMediaInputNode ? "p-0" : isInlineImageGenNode ? "space-y-3 p-3" : "space-y-3 p-4"}`}>
        {isRoleInputNode ? (
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100">
            {node.data.referenceImage ? (
              <img
                src={node.data.referenceImage}
                alt={node.data.name || "角色头像"}
                className="h-full w-full object-cover"
              />
            ) : (
              <ImageIcon className="h-6 w-6 text-slate-400" />
            )}
          </div>
        ) : null}
        {isRoleStructurerNode ? (
          <div className="nodrag space-y-3" onMouseDown={(e) => e.stopPropagation()}>
            <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-2.5">
              <div className="text-[12px] font-semibold text-slate-800">短剧角色画像结构化</div>
              <div className="mt-1 text-[10px] leading-4 text-slate-500">
                仅做结构化抽取、有限推断和一致性校验，不生成剧情。
              </div>
            </div>

            <label className="block">
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">角色名称</span>
              <input
                type="text"
                value={node.data.roleName || ""}
                onChange={(event) => updateData(node.id, { roleName: event.target.value })}
                placeholder="例如：林晚"
                className="mt-1.5 w-full rounded-[12px] border border-slate-200 bg-white px-3 py-2 text-[12px] text-slate-800 outline-none focus:border-cyan-200 focus:ring-2 focus:ring-cyan-100"
              />
            </label>

            <label className="block">
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">人物设定</span>
              <textarea
                value={node.data.characterSetting || ""}
                onChange={(event) => updateData(node.id, { characterSetting: event.target.value })}
                placeholder="输入身份、表面状态、真实欲望、恐惧、创伤、价值观等。"
                rows={3}
                className="mt-1.5 w-full resize-none rounded-[12px] border border-slate-200 bg-white px-3 py-2 text-[12px] leading-5 text-slate-700 outline-none focus:border-cyan-200 focus:ring-2 focus:ring-cyan-100"
              />
            </label>

            <label className="block">
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">关系网络</span>
              <textarea
                value={node.data.relationshipNetwork || ""}
                onChange={(event) => updateData(node.id, { relationshipNetwork: event.target.value })}
                placeholder="输入与其他人物的关系、依赖、敌对、隐瞒、控制、交易等。"
                rows={3}
                className="mt-1.5 w-full resize-none rounded-[12px] border border-slate-200 bg-white px-3 py-2 text-[12px] leading-5 text-slate-700 outline-none focus:border-cyan-200 focus:ring-2 focus:ring-cyan-100"
              />
            </label>

            <label className="block">
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">世界观背景</span>
              <textarea
                value={node.data.worldviewBackground || ""}
                onChange={(event) => updateData(node.id, { worldviewBackground: event.target.value })}
                placeholder="输入阶层规则、行业规则、禁忌、社会压力或故事世界约束。"
                rows={3}
                className="mt-1.5 w-full resize-none rounded-[12px] border border-slate-200 bg-white px-3 py-2 text-[12px] leading-5 text-slate-700 outline-none focus:border-cyan-200 focus:ring-2 focus:ring-cyan-100"
              />
            </label>

            <button
              type="button"
              onClick={runRoleStructurer}
              disabled={!checkNodeReady(node, [], [])}
              className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-[12px] bg-slate-900 px-4 text-[12px] font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <Scan className="h-3.5 w-3.5" />
              结构化角色画像
            </button>

            {node.data.structuredProfile ? (
              <div className="rounded-[14px] border border-slate-200 bg-slate-950 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-cyan-200">JSON Schema v1</span>
                  <span className="text-[10px] text-slate-400">可接后续选题链路</span>
                </div>
                <pre className="custom-scrollbar max-h-52 overflow-auto whitespace-pre-wrap break-all text-[10px] leading-4 text-slate-100">
                  {node.data.text || JSON.stringify(node.data.structuredProfile, null, 2)}
                </pre>
              </div>
            ) : null}
          </div>
        ) : null}
        {/* Error */}
        {node.data.status === "error" && !isTextInputNode && !isStoryboardInputNode && !isRoleInputNode && !isRoleStructurerNode && !isSimpleMediaInputNode && (
          <div className="rounded-[22px] border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700 flex flex-col gap-2 animate-in fade-in zoom-in-95">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
              <span className="break-all font-mono">{node.data.error || "Unknown Error"}</span>
            </div>
            <div className="mt-1 flex justify-end gap-2 border-t border-rose-200 pt-1">
              <button
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  copyDebugInfo();
                }}
                className="flex items-center gap-1 text-[9px] opacity-75 transition hover:opacity-100"
                type="button"
              >
                <Clipboard className="w-3 h-3" /> {showCopied ? "已复制!" : "复制调试信息"}
              </button>
            </div>
          </div>
        )}

        {/* AI nodes */}
        {isAI && (
          <div className="space-y-2">
            {isInlineImageGenNode ? (
              <div className="pointer-events-none absolute -top-5 left-0 cursor-grab select-none text-[11px] font-medium tracking-[0.08em] text-slate-500 active:cursor-grabbing">
                {title}
              </div>
            ) : null}
            {isInlineImageGenNode ? (
              <>
                <div className="pointer-events-none absolute right-3 top-3 z-20 flex gap-1">
                  {node.data.status === "error" ? (
                    <button
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        onRetry?.();
                      }}
                      className="pointer-events-auto rounded-full border border-rose-200 bg-rose-50 p-1.5 text-rose-600 transition hover:border-rose-300 hover:bg-rose-100"
                      title="重试"
                      type="button"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  ) : null}
                </div>
                <div className="space-y-3">
                  <div>
                    <div className="mb-1.5 px-1 text-[10px] font-medium uppercase tracking-[0.08em] text-slate-400">模型</div>
                    <InlineDropdown
                      value={String(node.data.model || "")}
                      options={imageModelOptions.map((item) => ({ value: item.id, label: item.name }))}
                      onChange={(nextValue) => updateData(node.id, { model: String(nextValue || "").trim() })}
                      placeholder="选择模型"
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <div className="mb-1.5 px-1 text-[10px] font-medium uppercase tracking-[0.08em] text-slate-400">尺寸</div>
                      <InlineDropdown
                        value={String(node.data.templates?.size || "1k")}
                        options={inlineImageSizeOptions.map((item) => ({ value: item, label: item }))}
                        onChange={(nextValue) =>
                          updateData(node.id, {
                            templates: { ...(node.data.templates || {}), size: String(nextValue || "").trim() },
                          })
                        }
                        placeholder="选择尺寸"
                      />
                    </div>

                    <div>
                      <div className="mb-1.5 px-1 text-[10px] font-medium uppercase tracking-[0.08em] text-slate-400">比例</div>
                      <InlineDropdown
                        value={String(node.data.templates?.aspect_ratio || (isInlineImg2ImgNode ? "" : (inlineImageRatioOptions[0] || "1:1")))}
                        options={[
                          ...(isInlineImg2ImgNode ? [{ value: "", label: "跟随输入图尺寸" }] : []),
                          ...inlineImageRatioOptions.map((item) => ({ value: item, label: item })),
                        ]}
                        onChange={(nextValue) =>
                          updateData(node.id, {
                            templates: (() => {
                              const nextTemplates = { ...(node.data.templates || {}) };
                              const resolvedValue = String(nextValue || "").trim();
                              if (isInlineImg2ImgNode && !resolvedValue) {
                                delete nextTemplates.aspect_ratio;
                              } else {
                                nextTemplates.aspect_ratio = resolvedValue;
                              }
                              return nextTemplates;
                            })(),
                          })
                        }
                        placeholder="选择比例"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between px-1 text-[10px] font-medium uppercase tracking-[0.08em] text-slate-400">
                      <span>生成数量</span>
                      <span className="rounded-[10px] border border-[#E5E7EB] bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                        {node.data.batchSize || 1}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="4"
                      step="1"
                      value={node.data.batchSize || 1}
                      onMouseDown={(e) => e.stopPropagation()}
                      onChange={(e) => updateData(node.id, { batchSize: parseInt(e.target.value, 10) || 1 })}
                      className="h-3 w-full cursor-pointer appearance-none rounded-full bg-[linear-gradient(90deg,#cbd5e1,#e2e8f0)] accent-cyan-500"
                    />
                  </div>

                  {inlineImageParamLoading ? <div className="text-[10px] text-slate-500">参数加载中...</div> : null}
                  {inlineImageParamError ? <div className="text-[10px] text-amber-500">{inlineImageParamError}</div> : null}

                  <button
                    type="button"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRunNode?.(node.id);
                    }}
                    disabled={!isReady || node.data.status === "loading"}
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-cyan-500 bg-cyan-500 px-4 text-[12px] font-semibold text-white shadow-[0_12px_28px_rgba(6,182,212,0.22)] transition hover:bg-cyan-600 hover:border-cyan-600 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-300 disabled:shadow-none"
                  >
                    {node.data.status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    {node.data.status === "loading" ? "运行中..." : "运行"}
                  </button>
                  {node.data.status === "loading" && onCancelNode ? (
                    <button
                      type="button"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        onCancelNode?.();
                      }}
                      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-rose-200 bg-rose-50 px-4 text-[12px] font-semibold text-rose-600 transition hover:border-rose-300 hover:bg-rose-100 hover:text-rose-700"
                      title="取消该节点生成"
                    >
                      <X className="h-4 w-4" />
                      取消
                    </button>
                  ) : null}
                </div>
              </>
            ) : null}

            {node.data.status === "loading" && (
              <div className="space-y-1.5 rounded-[22px] border border-slate-200 bg-slate-50 px-3 py-2.5">
                <div className="flex justify-between text-[10px] text-slate-600">
                  <span className="flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> 处理中...
                  </span>
                  <span>
                    {node.data.progress || 0}/{node.data.total || 0}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full bg-[linear-gradient(90deg,rgba(34,211,238,0.88),rgba(59,130,246,0.92))] transition-all duration-300" style={{ width: safeProgressWidth }} />
                </div>
              </div>
            )}

            {/* Results */}
            {!hideInlineAiResults && node.data.status === "success" && node.data.images && node.data.images.length > 0 ? (
              <div className="grid grid-cols-2 gap-1.5">
                {node.data.images.map((img, i) =>
                  renderArtifactThumb(img, i, { mode: node.data.mode, prompt: node.data.prompt, model: node.data.model })
                )}
              </div>
            ) : null}

            {node.data.status === "success" && (isProcessor || isPostProcessor) && !isImageCreationNode && (
              <button
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onContinue?.(node.id);
                }}
                className="flex w-full items-center justify-center gap-1 rounded-full border border-slate-200 bg-white py-2 text-[10px] text-slate-700 transition-colors hover:border-cyan-300 hover:bg-cyan-50"
                type="button"
              >
                <Film className="w-3 h-3" /> 生成视频 <ArrowRight className="w-3 h-3" />
              </button>
            )}
            {/* ✅ 文生图后：一键续上图生图分支 */}
            {node.data.status === "success" && isProcessor && !isImageCreationNode && (node.data.mode === "text2img" || node.data.mode === "local_text2img") && (
              <button
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onIterateImg2Img?.(node.id);
                }}
                className="flex w-full items-center justify-center gap-1 rounded-full border border-slate-200 bg-white py-2 text-[10px] text-slate-700 transition-colors hover:border-cyan-300 hover:bg-cyan-50"
              >
                <ImageIcon className="w-3 h-3" /> 继续图生图 <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
        )}

        {/* Input */}
        {isInput && isCompactInput && (
          <div className="space-y-2">
            <div className="relative overflow-visible">
              <div className="overflow-hidden rounded-[18px] border border-slate-200 bg-slate-50 shadow-[0_12px_28px_rgba(15,23,42,0.08)]">
                <button
                  type="button"
                  className={`nodrag relative block h-[286px] w-full overflow-hidden bg-slate-100 transition-[transform,filter,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    showCompactInputActions
                      ? "scale-[0.985] shadow-[0_18px_45px_rgba(8,15,34,0.5)]"
                      : "hover:scale-[1.01] hover:brightness-105"
                  }`}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                  }}
	                  onClick={(e) => {
	                    e.stopPropagation();
	                    setShowCompactVideoUpscaleOptions(false);
	                    setShowCompactInputActions((prev) => !prev);
	                  }}
                >
                  {compactActiveImage ? (
                    compactActiveIsVideo ? (
                      <video
                        src={compactActiveImage}
                        className={`h-full w-full object-contain transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                          showCompactInputActions ? "scale-[1.015]" : "scale-100"
                        }`}
                        muted
                        loop
                        playsInline
                      />
                    ) : (
                      <img
                        src={compactActiveImage}
                        className={`h-full w-full object-contain transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                          showCompactInputActions ? "scale-[1.015]" : "scale-100"
                        }`}
                        alt=""
                      />
                    )
                  ) : null}
                  {compactRmbgPending ? (
                    renderBackgroundProcessingOverlay({ title: "正在抠图" })
                  ) : null}
                  {compactRemovePending ? (
                    renderBackgroundProcessingOverlay({
                      title: "正在去除水印",
                      description: "请稍候，图片正在轻量修复中",
                    })
                  ) : null}
                  {compactThreeViewPending && !compactActiveIsVideo ? (
                    renderBackgroundProcessingOverlay({
                      title: "正在生成三视图",
                      description: "请稍候，正在生成多视角结果",
                    })
                  ) : null}
                  {compactVideoUpscalePending ? (
                    <div className="pointer-events-none absolute inset-0 z-[2] overflow-hidden">
                      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.24),rgba(2,6,23,0.62))] backdrop-blur-[2px]" />
                      <div className="absolute inset-y-0 left-1/2 w-[46%] -translate-x-1/2 bg-[linear-gradient(90deg,rgba(255,255,255,0),rgba(251,113,133,0.16),rgba(244,63,94,0.22),rgba(255,255,255,0))] opacity-85 blur-xl animate-pulse" />
                      <div className="absolute inset-x-0 top-[22%] h-px bg-[linear-gradient(90deg,rgba(244,63,94,0),rgba(251,113,133,0.7),rgba(244,63,94,0))] shadow-[0_0_18px_rgba(244,63,94,0.3)] animate-pulse" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-center text-slate-700 shadow-[0_16px_40px_rgba(15,23,42,0.12)] backdrop-blur-xl">
                          <div className="flex items-center justify-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin text-rose-600" />
                            <span className="text-[12px] font-medium tracking-[0.04em] text-slate-800">正在视频超清</span>
                          </div>
                          <div className="mt-1 text-[10px] text-slate-600">请稍候，正在直接生成清晰版本</div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  {videoLineartPending ? (
                    renderBackgroundProcessingOverlay({
                      title: "正在转线稿",
                      description: "请稍候，正在生成线稿视频",
                    })
                  ) : null}
                  {videoRmbgPending ? (
                    renderBackgroundProcessingOverlay({ title: "正在移除背景" })
                  ) : null}
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_35%,rgba(34,211,238,0.12),transparent_42%)] opacity-80 transition-opacity duration-300" />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                </button>
                {compactActiveImage ? (
                  <button
                    type="button"
                    className="nodrag absolute bottom-3 right-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-700 shadow-[0_12px_24px_rgba(15,23,42,0.12)] backdrop-blur-md transition duration-200 hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onPreview?.(compactActiveImage);
                    }}
                    title="放大预览"
                  >
                    <Maximize className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>

              {compactActiveImage ? (
	                <div
	                  className={`nodrag absolute bottom-full left-0 z-30 mb-3 w-max min-w-[252px] max-w-[calc(100vw-48px)] ${mediaToolbarClass} transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
	                    showCompactInputActions
	                      ? "pointer-events-auto translate-y-0 opacity-100"
                      : "pointer-events-none translate-y-2 opacity-0"
                  }`}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  {compactActiveIsVideo ? (
                    <>
                      <div className={mediaToolbarRowClass}>
                        <button
                          type="button"
                          disabled={compactActionBusy}
                          className={getMediaToolbarButtonClass()}
                          onClick={handleCompactVideoRmbgClick}
                        >
                          {videoRmbgPending ? <Loader2 className={`${mediaToolbarIconClass} animate-spin`} /> : <Wand2 className={mediaToolbarIconClass} />}
                          <span>去背景</span>
                        </button>
                        <button
                          type="button"
                          disabled={compactActionBusy}
                          className={getMediaToolbarButtonClass()}
                          onClick={handleCompactVideoLineartClick}
                        >
                          <Scan className={mediaToolbarIconClass} />
                          <span>转线稿</span>
                        </button>
                        <button
                          type="button"
                          disabled={compactActionBusy}
                          className={getMediaToolbarButtonClass({ active: showCompactVideoUpscaleOptions })}
                          onClick={handleCompactVideoUpscaleClick}
                        >
                          <TrendingUp className={mediaToolbarIconClass} />
                          <span>视频超清</span>
                        </button>
                      </div>
	                    {showCompactVideoUpscaleOptions ? (
                        <div className={mediaToolbarOptionRowClass}>
                          {VIDEO_HD_TEMPLATE_OPTIONS.map((item) => (
                            <button
                              key={item.value}
                              type="button"
                              disabled={compactActionBusy}
                              className={getMediaToolbarButtonClass()}
                              onClick={() => handleCompactVideoUpscaleOptionClick(item.value)}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className={mediaToolbarRowClass}>
                      <button
                        type="button"
                        disabled={compactActionBusy}
                        className={getMediaToolbarButtonClass()}
                        onClick={handleCompactThreeViewClick}
                      >
                        {compactThreeViewPending ? <Loader2 className={`${mediaToolbarIconClass} animate-spin`} /> : <Layout className={mediaToolbarIconClass} />}
                        {compactThreeViewPending ? "生成中..." : hasCompactThreeViewResult ? "重试三视图" : "三视图"}
                      </button>
                      <button
                        type="button"
                        disabled={compactActionBusy}
                        className={getMediaToolbarButtonClass()}
                        onClick={handleCompactRmbgClick}
                      >
                        {compactRmbgPending ? <Loader2 className={`${mediaToolbarIconClass} animate-spin`} /> : <Scissors className={mediaToolbarIconClass} />}
                        抠图
                      </button>
                      <button
                        type="button"
                        disabled={compactActionBusy}
                        className={getMediaToolbarButtonClass()}
                        onClick={handleCompactRemoveClick}
                      >
                        {compactRemovePending ? <Loader2 className={`${mediaToolbarIconClass} animate-spin`} /> : <Sparkles className={mediaToolbarIconClass} />}
                        <span>{compactRemovePending ? "处理中..." : "去水印"}</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {compactImages.length > 1 ? (
              <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                {compactImages.map((img, index) => {
                  const isThumbActive = index === compactActiveIndex;
                  return (
                    <button
                      key={`${node.id}-${index}`}
                      type="button"
                      className={`nodrag relative h-16 w-16 shrink-0 overflow-hidden rounded-[16px] border transition duration-200 ${
                        isThumbActive
                          ? "border-cyan-500/60 ring-1 ring-cyan-400/25 shadow-[0_10px_24px_rgba(6,182,212,0.16)]"
                          : "border-slate-200 hover:border-slate-300 hover:-translate-y-0.5"
                      }`}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setCompactActiveIndex(index);
                        setShowCompactInputActions(false);
                      }}
                    >
                      {isVideoContent(img) ? (
                        <video src={img} className="h-full w-full object-cover" muted loop playsInline />
                      ) : (
                        <img src={img} className="h-full w-full object-cover" alt="" />
                      )}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        )}

        {isInput && !isCompactInput && (
          <div
            className="relative overflow-hidden rounded-[16px] bg-white"
            onClick={(e) => {
              e.stopPropagation();
              if (!node.data.images?.length) {
                openSimpleMediaUploadPicker(e);
                return;
              }
              setShowSimpleMediaToolbar(true);
            }}
          >
            {node.data.images?.length > 0 ? (
              <div className="max-h-[520px] overflow-y-auto custom-scrollbar">
	                {node.data.images.slice(0, MAX_RENDERED_MEDIA_ITEMS_PER_NODE).map((img, i) => {
	                  const isActive = isSameArtifactSelection(activeArtifact, {
                      url: img,
                      kind: isVideoContent(img) ? "video" : "image",
                      fromNodeId: node.id,
                    });
	                  const isVideoItem = isVideoContent(img);
	                  const showVideoActions = isVideoItem && simpleMediaActionIndex === i;
	                  const showImageActions = !isVideoItem && simpleMediaActionIndex === i;
	                  const showVideoUpscaleOverlay = isVideoItem && compactVideoUpscalePending && simpleMediaActionIndex === i;
	                  const showVideoRmbgOverlay = isVideoItem && videoRmbgPending && simpleMediaActionIndex === i;
	                  const showVideoLineartOverlay = isVideoItem && videoLineartPending && simpleMediaActionIndex === i;
	                  const showImageRmbgOverlay = !isVideoItem && compactRmbgPending;
	                  const showImageRemoveOverlay = !isVideoItem && compactRemovePending;
	                  const showImageThreeViewOverlay = !isVideoItem && compactThreeViewPending;
	                  return (
	                    <div
	                      key={i}
	                      className={`group/img relative bg-white ${i > 0 ? "border-t border-slate-200" : ""} ${
                        isActive
                          ? "outline outline-1 outline-amber-300 outline-offset-[-1px]"
                          : showVideoActions || showImageActions
                          ? "outline outline-1 outline-slate-300 outline-offset-[-1px]"
                          : ""
	                      }`}
	                    >
	                      {isVideoItem ? (
	                        <>
                            <button
                              type="button"
                              className="absolute bottom-3 right-3 z-10 inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white/95 px-3 text-[11px] font-medium text-slate-700 shadow-[0_12px_24px_rgba(15,23,42,0.12)] backdrop-blur-md transition hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                onPreview?.(resolveAssetUrl(img));
                              }}
                              title="预览视频"
                              aria-label="预览视频"
                            >
                              <Play className="h-3.5 w-3.5" />
                              <span>预览</span>
                            </button>
	                          <video
	                            src={resolveAssetUrl(img)}
	                            className="block h-auto max-h-[420px] w-full cursor-pointer bg-black object-contain"
                              draggable={false}
                              onDragStart={(e) => e.preventDefault()}
	                            onClick={(e) => {
	                              e.stopPropagation();
	                              setShowSimpleMediaToolbar(true);
	                              setSimpleMediaActionIndex(i);
	                            }}
	                            title="点击显示操作"
	                            muted
	                            loop
	                            playsInline
	                          />
	                          {showVideoLineartOverlay ? (
	                            renderBackgroundProcessingOverlay({
	                              title: "正在转线稿",
	                              description: "请稍候，正在生成线稿视频",
	                            })
	                          ) : null}
	                          {showVideoUpscaleOverlay ? (
	                            renderBackgroundProcessingOverlay({
	                              title: "正在视频超清",
	                              description: "请稍候，正在生成更清晰的视频版本",
	                            })
	                          ) : null}
	                          {showVideoRmbgOverlay ? (
	                            renderBackgroundProcessingOverlay({ title: "正在移除背景" })
	                          ) : null}
	                        </>
	                      ) : (
	                        <>
                          <button
                            type="button"
                            className="absolute bottom-3 right-3 z-10 inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white/95 px-3 text-[11px] font-medium text-slate-700 shadow-[0_12px_24px_rgba(15,23,42,0.12)] backdrop-blur-md transition hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              onPreview?.(resolveAssetUrl(img));
                            }}
                            title="预览图片"
                            aria-label="预览图片"
                          >
                            <Maximize className="h-3.5 w-3.5" />
                            <span>预览</span>
                          </button>
                          <img
                            src={resolveAssetUrl(img)}
                            className="block h-auto max-h-[420px] w-full cursor-pointer object-contain"
                            draggable={false}
                            onDragStart={(e) => e.preventDefault()}
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowSimpleMediaToolbar(true);
                              setSimpleMediaActionIndex(i);
                            }}
                            title="点击显示操作"
                            alt=""
                          />
                          {showImageRmbgOverlay ? (
                            renderBackgroundProcessingOverlay({ title: "正在抠图" })
                          ) : null}
                          {showImageRemoveOverlay ? (
                            renderBackgroundProcessingOverlay({
                              title: "正在去除水印",
                              description: "请稍候，图片正在轻量修复中",
                            })
                          ) : null}
                          {showImageThreeViewOverlay ? (
                            renderBackgroundProcessingOverlay({
                              title: "正在生成三视图",
                              description: "请稍候，正在生成多视角结果",
                            })
                          ) : null}
	                        </>
                      )}

	                    </div>
                  );
                })}
                {node.data.images.length > MAX_RENDERED_MEDIA_ITEMS_PER_NODE ? (
                  <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-center text-[11px] text-slate-500">
                    已加载 {node.data.images.length} 个媒体，当前仅渲染前 {MAX_RENDERED_MEDIA_ITEMS_PER_NODE} 个以保持流畅；全部媒体仍会参与运行。
                  </div>
                ) : null}

              </div>
            ) : (
              <div className="p-3">
                <div
                  className={`nodrag relative flex w-full cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden rounded-[16px] border px-5 py-5 text-center transition-all duration-150 ${
                    isUploadDropActive
                      ? "border-slate-300 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.06)]"
                      : "border-[#E5E7EB] bg-[linear-gradient(180deg,#FCFCFD_0%,#F8FAFC_100%)] hover:border-slate-300 hover:bg-white"
                  }`}
                  style={{ minHeight: MEDIA_UPLOAD_NODE_EMPTY_HEIGHT }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={openSimpleMediaUploadPicker}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsUploadDropActive(true);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!isUploadDropActive) setIsUploadDropActive(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.currentTarget.contains(e.relatedTarget)) return;
                    setIsUploadDropActive(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsUploadDropActive(false);
                    const files = Array.from(e.dataTransfer?.files || []).filter((file) => {
                      if (inputMediaKind === "image") return isImageFileLike(file);
                      if (inputMediaKind === "video") return isVideoFileLike(file);
                      return isMediaFileLike(file);
                    });
                    if (!files.length) return;
                    readSimpleMediaUploadFiles(files).then((newImages) => {
                      updateData(node.id, {
                        images: [...(node.data.images || []), ...newImages],
                      });
                    });
                  }}
                >
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(148,163,184,0.08),transparent_55%)]" />
                  <div
                    className={`relative flex h-11 w-11 items-center justify-center rounded-[14px] border transition-colors ${
                      isUploadDropActive
                        ? "border-slate-300 bg-slate-50 text-slate-600"
                        : "border-slate-200 bg-white text-slate-400"
                    }`}
                  >
                    <Upload className="h-[18px] w-[18px]" />
                  </div>
                  <div className="relative flex max-w-[210px] flex-col items-center gap-2.5">
                    <div className="text-[13px] font-medium leading-5 text-slate-800">
                      {isUploadDropActive ? "松开即可上传" : simpleMediaDropTitle}
                    </div>
                    <div className="text-[11px] leading-5 text-slate-400">
                      {isUploadDropActive ? "释放文件后会自动添加到当前节点" : simpleMediaSupportHint}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}



        {/* Output */}
        {isOutput && (
          <div className="nodrag flex min-h-[140px] flex-col" onMouseDown={(e) => e.stopPropagation()}>
            {node.data.images?.length > 0 ? (
              <div className="flex items-center justify-end gap-2 px-3 py-2.5">
                <div className="flex items-center gap-1">
                  <button
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      downloadAll();
                    }}
                    className="inline-flex h-7 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 text-[10px] font-medium text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100"
                    type="button"
                  >
                    <Download className="h-3 w-3" /> 下载
                  </button>
                </div>
              </div>
            ) : null}

            <div className="custom-scrollbar max-h-[200px] overflow-y-auto p-3">
              {node.data.images?.length > 0 ? (
                <div className="grid grid-cols-2 gap-1.5">
                  {node.data.images.map((img, i) => (
                    <div key={i} className="relative aspect-square">
                      {renderArtifactThumb(img, i, {
                        mode: node.data.mode,
                        prompt: node.data.prompt,
                        model: node.data.model,
                      })}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex min-h-[140px] flex-col items-center justify-center gap-2 px-4 py-6 text-center text-xs text-slate-500">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-300">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <div className="text-[13px] font-medium text-slate-700">暂无输出结果</div>
                    <div className="leading-5 text-slate-500">运行后将在这里展示内容</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {isStoryboardInputNode && (
          <div
            className="nodrag p-3"
            onMouseDown={(e) => e.stopPropagation()}
            onDragEnter={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (node.data.status !== "running") setStoryboardDropActive(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (node.data.status !== "running") setStoryboardDropActive(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (!event.currentTarget.contains(event.relatedTarget)) setStoryboardDropActive(false);
            }}
            onDrop={handleStoryboardScriptDrop}
          >
            <input
              ref={storyboardScriptInputRef}
              type="file"
              multiple
              accept=".csv,.tsv,.txt,.md,.markdown,.docx,.doc,text/csv,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
              className="hidden"
              onChange={handleStoryboardScriptInputChange}
            />

            {node.data.status === "running" ? (
              <div className="relative min-h-[238px] overflow-hidden rounded-[16px] border border-cyan-200 bg-slate-950 px-4 py-4 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
                <div className="pointer-events-none absolute inset-0 opacity-45 [background-image:linear-gradient(rgba(34,211,238,0.13)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.13)_1px,transparent_1px)] [background-size:22px_22px]" />
                <div className="pointer-events-none absolute left-0 top-0 h-full w-full animate-pulse bg-[linear-gradient(110deg,transparent_0%,rgba(34,211,238,0.10)_38%,rgba(16,185,129,0.16)_50%,rgba(251,191,36,0.10)_62%,transparent_100%)]" />
                <div className="relative flex items-start gap-4">
                  <div className="relative mt-1 h-16 w-16 shrink-0">
                    <div className="absolute inset-0 animate-[spin_1.4s_linear_infinite] rounded-full bg-[conic-gradient(from_180deg,rgba(34,211,238,0.05),rgba(34,211,238,0.95),rgba(16,185,129,0.88),rgba(251,191,36,0.72),rgba(34,211,238,0.05))]" />
                    <div className="absolute inset-[5px] rounded-full bg-slate-950" />
                    <div className="absolute inset-[17px] rounded-full border border-cyan-300/60 bg-cyan-300/10" />
                    <Sparkles className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 text-cyan-100" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-cyan-50">故事板生成中</div>
                    <div className="mt-1 text-[11px] leading-5 text-cyan-100/75">
                      {node.data.progressLabel || "正在拆解剧本结构、场景节奏和镜头顺序"}
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full w-full animate-pulse rounded-full bg-[linear-gradient(90deg,#22d3ee,#10b981,#fbbf24,#22d3ee)]" />
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-1.5 text-[10px] text-cyan-100/70">
                      <div className="rounded-[8px] border border-white/10 bg-white/[0.06] px-2 py-1.5">剧本解析</div>
                      <div className="rounded-[8px] border border-white/10 bg-white/[0.06] px-2 py-1.5">场景规划</div>
                      <div className="rounded-[8px] border border-white/10 bg-white/[0.06] px-2 py-1.5">镜头设计</div>
                    </div>
                  </div>
                </div>
                <div className="relative mt-4 rounded-[12px] border border-white/10 bg-white/[0.06] px-3 py-2 text-[10px] leading-5 text-cyan-50/75">
                  {node.data.scriptFileName ? `输入文件：${node.data.scriptFileName}` : "等待剧本文件读取完成"}
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => storyboardScriptInputRef.current?.click()}
                disabled={node.data.status === "running"}
                className={`flex min-h-[238px] w-full flex-col items-center justify-center rounded-[16px] border border-dashed px-5 py-5 text-center transition-colors ${
                  storyboardDropActive
                    ? "border-cyan-300 bg-cyan-50 text-cyan-700"
                    : node.data.status === "error"
                    ? "border-rose-200 bg-rose-50 text-rose-700"
                    : node.data.status === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-slate-50 text-slate-600 hover:border-cyan-200 hover:bg-cyan-50/60"
                }`}
              >
                <div className={`flex h-12 w-12 items-center justify-center rounded-full border bg-white ${
                  node.data.status === "error" ? "border-rose-200 text-rose-500" : node.data.status === "success" ? "border-emerald-200 text-emerald-600" : "border-slate-200 text-cyan-600"
                }`}>
                  {node.data.status === "error" ? <AlertCircle className="h-5 w-5" /> : node.data.status === "success" ? <CheckCircle2 className="h-5 w-5" /> : <Upload className="h-5 w-5" />}
                </div>
                <div className="mt-3 text-[13px] font-semibold text-slate-800">
                  {node.data.status === "success" ? "故事板已生成" : node.data.status === "error" ? "生成失败，点击重试上传" : "拖拽剧本文件到这里"}
                </div>
                <div className="mt-1.5 max-w-[280px] text-[11px] leading-5 text-slate-500">
                  {node.data.status === "success"
                    ? (node.data.summary || "已接入故事板制作流程，可在画布中继续编辑。")
                    : node.data.status === "error"
                    ? (node.data.error || "请检查文件内容后重新拖入。")
                    : "支持 csv / tsv / txt / md / docx；拖入后自动解析剧本并生成可编辑故事板。"}
                </div>
                {node.data.scriptFileName ? (
                  <div className="mt-3 max-w-full truncate rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] text-slate-500">
                    {node.data.scriptFileName}
                  </div>
                ) : null}
              </button>
            )}
          </div>
        )}

        {/* Text input */}
        {isTextInputNode && (
          <div className="nodrag space-y-3 p-3">
            <div className="relative rounded-[12px] border border-[#E5E7EB] bg-[#F9FAFB] p-3 transition-all focus-within:border-cyan-300 focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(34,211,238,0.12)]">
              <PersonaMentionTextarea
                wrapperClassName="nodrag"
                className="block min-h-[132px] w-full resize-none border-0 bg-transparent px-0 py-0 pb-12 text-[13px] leading-6 outline-none nodrag placeholder:text-slate-400"
                overlayClassName="px-0 py-0 pb-12 text-[13px] leading-6"
                personas={personaMentionOptions}
                rows={5}
                placeholder="例如：一只戴宇航头盔的橘猫站在雨夜霓虹街头，电影感打光，低机位，浅景深。"
                value={node.data.text || ""}
                onChange={(e) => {
                  setPromptPolishError("");
                  updateData(node.id, { text: e.target.value });
                }}
                onMouseDown={(e) => e.stopPropagation()}
              />
              <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={handlePolishTextInputPrompt}
                disabled={promptPolishLoading || !String(node.data.text || "").trim() || !apiFetch}
                className={`nodrag absolute bottom-3 right-3 inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[11px] font-medium shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  promptPolishLoading
                    ? "bg-cyan-50 text-cyan-700"
                    : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-cyan-50 hover:text-cyan-700 hover:ring-cyan-200"
                }`}
                title="提示词润色"
                aria-label="提示词润色"
              >
                {promptPolishLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                <span>优化提示词</span>
              </button>
            </div>

            {promptPolishError ? <div className="px-1 text-[10px] text-rose-500">{promptPolishError}</div> : null}
          </div>
        )}

        {isStoryboardPlanNode && (
          <div className="nodrag space-y-3 p-3">
            <div className="rounded-[14px] border border-violet-200 bg-[linear-gradient(180deg,#fcfaff,#f4f1ff)] p-3 shadow-[0_12px_28px_rgba(76,29,149,0.08)]">
              {(() => {
                const storyboardPlan = node.data?.storyboard_plan || {};
                const storyboardMentionTerms = collectStoryboardMentionTerms(storyboardPlan);
                const locationList = Array.isArray(storyboardPlan?.entities?.locations) ? storyboardPlan.entities.locations : [];
                const locationByName = new Map(
                  locationList
                    .map((item) => [String(item?.name || "").trim(), item])
                    .filter(([name]) => !!name)
                );
                const selectStoryboardTarget = (selectionType, selectionId, selectionLabel, selectionSummary, payload = {}) => {
                  const next = {
                    kind: "storyboard_selection",
                    fromNodeId: node.id,
                    createdAt: Date.now(),
                    meta: {
                      nodeKind: "storyboard_plan",
                      selectionType,
                      selectionId,
                      selectionLabel,
                      selectionSummary,
                      storyboardTitle: String(storyboardPlan?.title || node.data?.title || "").trim(),
                      sceneTitle: String(payload?.sceneTitle || "").trim() || null,
                      sceneLocation: String(payload?.sceneLocation || "").trim() || null,
                      payload,
                    },
                  };
                  onSelectArtifact?.(isSameArtifactSelection(activeArtifact, next) ? null : next);
                };
                const selectStoryboardMention = (mentionEntry) => {
                  if (!mentionEntry?.selectionType || !mentionEntry?.selectionId) return;
                  selectStoryboardTarget(
                    mentionEntry.selectionType,
                    mentionEntry.selectionId,
                    mentionEntry.selectionLabel || mentionEntry.term || "故事板片段",
                    mentionEntry.selectionSummary || "",
                    mentionEntry.payload || {},
                  );
                };
                const removeStoryboardEntity = (assetType, entityId) => {
                  const plan = node.data?.storyboard_plan || {};
                  const key = assetType === "characters" ? "characters" : "subjects";
                  updateData(node.id, {
                    storyboard_plan: {
                      ...plan,
                      entities: {
                        ...(plan.entities || {}),
                        [key]: ((plan.entities?.[key]) || []).filter((e) => String(e?.entity_id || "") !== entityId),
                      },
                    },
                  });
                };
                const removeStoryboardScene = (sceneId) => {
                  const plan = node.data?.storyboard_plan || {};
                  const sceneToRemove = (Array.isArray(plan.scenes) ? plan.scenes : []).find((s) => String(s?.scene_id || "") === sceneId);
                  const removedLocationName = stripStoryboardDisplayIds(String(sceneToRemove?.location || "").trim());
                  updateData(node.id, {
                    storyboard_plan: {
                      ...plan,
                      scenes: (Array.isArray(plan.scenes) ? plan.scenes : []).filter((s) => String(s?.scene_id || "") !== sceneId),
                      entities: {
                        ...(plan.entities || {}),
                        locations: ((plan.entities?.locations) || []).filter(
                          (loc) => !removedLocationName || stripStoryboardDisplayIds(String(loc?.name || "")) !== removedLocationName,
                        ),
                      },
                    },
                  });
                };
                const removeStoryboardShot = (sceneId, shotId) => {
                  const plan = node.data?.storyboard_plan || {};
                  updateData(node.id, {
                    storyboard_plan: {
                      ...plan,
                      scenes: (Array.isArray(plan.scenes) ? plan.scenes : []).map((s) =>
                        String(s?.scene_id || "") !== sceneId
                          ? s
                          : { ...s, shots: (Array.isArray(s.shots) ? s.shots : []).filter((sh) => String(sh?.shot_id || "") !== shotId) },
                      ),
                    },
                  });
                };
                const isStoryboardTargetActive = (selectionType, selectionId) =>
                  isSameArtifactSelection(activeArtifact, {
                    kind: "storyboard_selection",
                    fromNodeId: node.id,
                    meta: { selectionType, selectionId },
                  });
                return (
                  <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="text-[13px] font-semibold text-slate-900 break-words">
                    {String(node.data?.storyboard_plan?.title || node.data?.title || "Storyboard Plan").trim() || "Storyboard Plan"}
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-[10px] text-slate-700">
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5">
                      比例 {String(node.data?.storyboard_plan?.aspect_ratio || "16:9").trim() || "16:9"}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5">
                      风格 {String(node.data?.storyboard_plan?.style || "-").trim() || "-"}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5">
                      时长 {String(node.data?.storyboard_plan?.estimated_duration_sec || node.data?.storyboard_plan?.target_duration_sec || "-")}
                    </span>
                  </div>
                </div>
                <div className="rounded-full border border-violet-200 bg-white px-2 py-1 text-[10px] font-medium text-violet-700">
                  故事板
                </div>
              </div>

              {Array.isArray(node.data?.storyboard_plan?.warnings) && node.data.storyboard_plan.warnings.length > 0 ? (
                <div className="mt-3 rounded-[10px] border border-amber-200 bg-amber-50 px-2.5 py-2 text-[10px] text-amber-800">
                  {node.data.storyboard_plan.warnings.join(" | ")}
                </div>
              ) : null}

              {node.data?.workflow_mode === "storyboard_image_production" ? (
                <div className="mt-3 rounded-[12px] border border-cyan-200 bg-cyan-50/80 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-cyan-800">
                      <Sparkles className="h-3.5 w-3.5" />
                      分镜图生产工作流
                    </div>
                    <span className="rounded-full border border-cyan-200 bg-white px-2 py-0.5 text-[10px] text-cyan-700">已就绪</span>
                  </div>
                  <div className="mt-2 grid grid-cols-4 gap-1.5">
                    {(Array.isArray(node.data?.workflow_steps) ? node.data.workflow_steps : []).map((step, index) => {
                      const status = String(step?.status || "ready").trim();
                      const isDone = status === "success";
                      return (
                        <div key={step?.id || index} className="rounded-[9px] border border-white/70 bg-white px-2 py-1.5">
                          <div className="flex items-center gap-1 text-[10px] font-medium text-slate-700">
                            {isDone ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : <ArrowRight className="h-3 w-3 text-cyan-500" />}
                            <span className="truncate">{String(step?.label || `步骤 ${index + 1}`).trim()}</span>
                          </div>
                          {step?.count ? <div className="mt-0.5 text-[9px] text-slate-400">{step.count} 项</div> : null}
                        </div>
                      );
                    })}
                  </div>
                  {String(node.data?.workflow_summary || "").trim() ? (
                    <div className="mt-2 text-[10px] leading-5 text-cyan-800/80">{String(node.data.workflow_summary).trim()}</div>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-3 grid grid-cols-[240px_240px_minmax(0,1fr)] gap-3 items-start">
                <div className="min-h-0 rounded-[12px] border border-slate-200 bg-white p-2.5">
                  <div className="text-[11px] font-semibold text-slate-700">角色与主体设定</div>
                  <div className="custom-scrollbar mt-2 max-h-[520px] space-y-2 overflow-y-auto pr-1">
                    {(() => {
                      const characters = Array.isArray(node.data?.storyboard_plan?.entities?.characters)
                        ? node.data.storyboard_plan.entities.characters
                        : [];
                      const subjects = Array.isArray(node.data?.storyboard_plan?.entities?.subjects)
                        ? node.data.storyboard_plan.entities.subjects
                        : [];
                      const items = [
                        ...characters.map((item) => ({ ...item, _sectionLabel: "角色" })),
                        ...subjects.map((item) => ({ ...item, _sectionLabel: "主体" })),
                      ];
                      const charBindings = Array.isArray(node.data?.storyboard_plan?.local_asset_bindings?.character_bindings)
                        ? node.data.storyboard_plan.local_asset_bindings.character_bindings
                        : [];
                      const bindingByEntityId = Object.fromEntries(
                        charBindings.map((cb) => [String(cb?.entity_id || ""), cb]).filter(([k]) => k),
                      );
                      if (!items.length) {
                        return (
                          <div className="rounded-[10px] border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-[11px] text-slate-500">
                            暂无角色与主体设定
                          </div>
                        );
                      }
                      return items.map((item, index) => {
                        const selectionId = String(item?.entity_id || `${item?._sectionLabel || "entity"}-${index}`).trim();
                        const isActive = isStoryboardTargetActive("entity", selectionId);
                        const binding = bindingByEntityId[selectionId] || null;
                        const threeViewUrl = String(binding?.three_view_url || "").trim();
                        const assetTypeKey = item?._sectionLabel === "角色" ? "characters" : "subjects";
                        return (
                          <div key={selectionId} className="group relative">
                            <button
                              type="button"
                              onClick={() =>
                                selectStoryboardTarget(
                                  "entity",
                                  selectionId,
                                  `${item?._sectionLabel || "设定"} · ${String(item?.name || "").trim() || `项目 ${index + 1}`}`,
                                  String(item?.core_description || item?.description || item?.story_function || "").trim(),
                                  {
                                    entityId: selectionId,
                                    entityName: String(item?.name || "").trim(),
                                    entityType: item?._sectionLabel || "设定",
                                    coreDescription: String(item?.core_description || item?.description || "").trim(),
                                    storyFunction: String(item?.story_function || "").trim(),
                                  },
                                )
                              }
                              className={`w-full rounded-[10px] border px-2.5 py-2 pr-7 text-left transition-colors ${
                                isActive
                                  ? "border-cyan-300 bg-cyan-50 shadow-[0_0_0_1px_rgba(34,211,238,0.18)]"
                                  : "border-slate-100 bg-slate-50 hover:border-slate-200 hover:bg-white"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="text-[12px] font-semibold text-slate-800 break-words">
                                    {renderStoryboardMentionText(
                                      String(item?.name || "").trim() || `${item?._sectionLabel || "设定"} ${index + 1}`,
                                      storyboardMentionTerms,
                                      selectStoryboardMention,
                                      onStoryboardMentionHover,
                                      onStoryboardMentionLeave,
                                      node,
                                    )}
                                  </div>
                                </div>
                                {isActive ? <span className="shrink-0 text-[10px] text-cyan-700">已选中</span> : null}
                              </div>
                              {!threeViewUrl && String(item?.core_description || item?.description || "").trim() ? (
                                <div className="mt-1 text-[11px] leading-5 text-slate-700 break-words">
                                  {renderStoryboardMentionText(
                                    String(item.core_description || item.description).trim(),
                                    storyboardMentionTerms,
                                    selectStoryboardMention,
                                    onStoryboardMentionHover,
                                    onStoryboardMentionLeave,
                                    node,
                                  )}
                                </div>
                              ) : null}
                              {String(item?.story_function || "").trim() ? (
                                <div className="mt-1 text-[10px] leading-5 text-slate-500 break-words">
                                  作用: {String(item.story_function).trim()}
                                </div>
                              ) : null}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); removeStoryboardEntity(assetTypeKey, selectionId); }}
                              className="absolute right-1.5 top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm ring-1 ring-slate-200 hover:bg-rose-50 hover:text-rose-500 group-hover:flex"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>

                <div className="min-h-0 rounded-[12px] border border-slate-200 bg-white p-2.5">
                  <div className="text-[11px] font-semibold text-slate-700">场景设定</div>
                  <div className="custom-scrollbar mt-2 max-h-[520px] space-y-2 overflow-y-auto pr-1">
                    {(() => {
                      const scenes = Array.isArray(node.data?.storyboard_plan?.scenes)
                        ? node.data.storyboard_plan.scenes
                        : [];
                      if (!scenes.length) {
                        return (
                          <div className="rounded-[10px] border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-[11px] text-slate-500">
                            暂无场景设定
                          </div>
                        );
                      }
                      const sceneBindings = Array.isArray(node.data?.storyboard_plan?.local_asset_bindings?.scene_bindings)
                        ? node.data.storyboard_plan.local_asset_bindings.scene_bindings : [];
                      return scenes.map((scene, index) => {
                        const selectionId = String(scene?.scene_id || `scene-setting-${index}`).trim();
                        const isActive = isStoryboardTargetActive("scene", selectionId);
                        const sceneDisplayName = stripStoryboardDisplayIds(scene?.location || scene?.title || "") || `场景 ${index + 1}`;
                        const matchedLocation = locationByName.get(String(scene?.location || "").trim());
                        const locationName = String(scene?.location || "").trim();
                        const sceneBinding = sceneBindings.find((sb) => matchesSceneBinding(sb, locationName)) || null;
                        const hasScenePreview = !!(sceneBinding && Array.isArray(sceneBinding.preview_urls) && sceneBinding.preview_urls.some(Boolean));
                        return (
                          <div key={selectionId} className="group relative">
                            <button
                              type="button"
                              onClick={() =>
                                selectStoryboardTarget(
                                  "scene",
                                  selectionId,
                                  `场景 ${scene?.scene_no || index + 1} · ${sceneDisplayName}`,
                                  String(scene?.scene_notes || scene?.summary || matchedLocation?.core_description || matchedLocation?.description || "").trim(),
                                  {
                                    sceneId: selectionId,
                                    sceneNo: scene?.scene_no || index + 1,
                                    sceneTitle: String(scene?.title || "").trim(),
                                    sceneLocation: String(scene?.location || "").trim(),
                                    sceneSummary: String(scene?.summary || "").trim(),
                                    sceneNotes: String(scene?.scene_notes || "").trim(),
                                    locationDescription: String(matchedLocation?.core_description || matchedLocation?.description || "").trim(),
                                  },
                                )
                              }
                              className={`w-full rounded-[10px] border px-2.5 py-2 pr-7 text-left transition-colors ${
                                isActive
                                  ? "border-cyan-300 bg-cyan-50 shadow-[0_0_0_1px_rgba(34,211,238,0.18)]"
                                  : "border-slate-100 bg-slate-50 hover:border-slate-200 hover:bg-white"
                              }`}
                            >
                              <div className="min-w-0">
                                <div className="text-[12px] font-semibold text-slate-800 break-words">
                                  <span>场景 {scene?.scene_no || index + 1} </span>
                                  {renderStoryboardMentionText(
                                    sceneDisplayName,
                                    storyboardMentionTerms,
                                    selectStoryboardMention,
                                    onStoryboardMentionHover,
                                    onStoryboardMentionLeave,
                                    node,
                                  )}
                                </div>
                              </div>
                              {!hasScenePreview && String(matchedLocation?.core_description || matchedLocation?.description || scene?.scene_notes || scene?.summary || "").trim() ? (
                                <div className="mt-2 rounded-[10px] border border-violet-100 bg-violet-50/70 px-2.5 py-2 text-[11px] leading-5 text-slate-700 break-words">
                                  {renderStoryboardMentionText(
                                    String(matchedLocation?.core_description || matchedLocation?.description || scene?.scene_notes || scene?.summary).trim(),
                                    storyboardMentionTerms,
                                    selectStoryboardMention,
                                    onStoryboardMentionHover,
                                    onStoryboardMentionLeave,
                                    node,
                                  )}
                                </div>
                              ) : null}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); removeStoryboardScene(selectionId); }}
                              className="absolute right-1.5 top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm ring-1 ring-slate-200 hover:bg-rose-50 hover:text-rose-500 group-hover:flex"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>

              <div className="min-h-0 rounded-[12px] border border-slate-200 bg-white p-2.5">
                  <div className="text-[11px] font-semibold text-slate-700">镜头列表</div>
                <div className="custom-scrollbar mt-2 grid max-h-[520px] grid-cols-2 gap-2 overflow-y-auto pr-1">
                {Array.isArray(node.data?.storyboard_plan?.scenes) && node.data.storyboard_plan.scenes.length > 0 ? (
                  node.data.storyboard_plan.scenes.map((scene, sceneIndex) => (
                    <div key={scene?.scene_id || sceneIndex} className="rounded-[12px] border border-slate-200 bg-slate-50/60 p-2.5 shadow-[0_6px_18px_rgba(15,23,42,0.04)]">
                      {(() => {
                        const sceneDisplayName = stripStoryboardDisplayIds(scene?.location || scene?.title || "") || `场景 ${sceneIndex + 1}`;
                        return (
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[12px] font-semibold text-slate-800 break-words">
                            <span>场景 {scene?.scene_no || sceneIndex + 1} </span>
                            {renderStoryboardMentionText(
                              sceneDisplayName,
                              storyboardMentionTerms,
                              selectStoryboardMention,
                              onStoryboardMentionHover,
                              onStoryboardMentionLeave,
                              node,
                            )}
                          </div>
                        </div>
                      </div>
                        );
                      })()}

                      <div className="mt-2 space-y-2">
                        {(Array.isArray(scene?.shots) ? scene.shots : []).map((shot, shotIndex) => {
                          const selectionId = String(shot?.shot_id || `${scene?.scene_id || sceneIndex}-shot-${shotIndex}`).trim();
                          const isActive = isStoryboardTargetActive("shot", selectionId);
                          return (
                          <div key={selectionId} className="group relative">
                          <button
                            type="button"
                            onClick={() =>
                              selectStoryboardTarget(
                                "shot",
                                selectionId,
                                `镜头 ${shot?.shot_no || shotIndex + 1} · ${String(scene?.title || "").trim() || `场景 ${sceneIndex + 1}`}`,
                                String(shot?.visual_description || "").trim(),
                                {
                                  shotId: selectionId,
                                  shotNo: shot?.shot_no || shotIndex + 1,
                                  sceneId: String(scene?.scene_id || "").trim(),
                                  sceneTitle: String(scene?.title || "").trim(),
                                  sceneLocation: String(scene?.location || "").trim(),
                                  camera: String(shot?.camera || "").trim(),
                                  durationSec: shot?.duration_sec ?? null,
                                  visualDescription: String(shot?.visual_description || "").trim(),
                                  dialogues: Array.isArray(shot?.dialogues) ? shot.dialogues : [],
                                  voiceover: String(shot?.voiceover || "").trim(),
                                },
                              )
                            }
                            className={`w-full rounded-[10px] border px-2.5 py-2 pr-7 text-left transition-colors ${
                              isActive
                                ? "border-cyan-300 bg-cyan-50 shadow-[0_0_0_1px_rgba(34,211,238,0.18)]"
                                : "border-slate-100 bg-slate-50 hover:border-slate-200 hover:bg-white"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5">
                                <span
                                  role="button"
                                  tabIndex={0}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (onShotChipClick) onShotChipClick(node, scene, shot, e.currentTarget);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.stopPropagation();
                                      if (onShotChipClick) onShotChipClick(node, scene, shot, e.currentTarget);
                                    }
                                  }}
                                  className="inline-flex cursor-pointer items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 transition-colors bg-orange-50 text-orange-700 ring-orange-200 hover:bg-orange-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
                                >
                                  @镜头{shot?.shot_no || shotIndex + 1}
                                  {(() => {
                                    const shotId = String(shot?.shot_id || `${scene?.scene_id || sceneIndex}-shot-${shotIndex}`).trim();
                                    const shotAssetState = node?.data?.storyboard_asset_state?.shots?.[shotId] || {};
                                    const shotStatus = String(shotAssetState?.status || "").trim();
                                    if (shotStatus === "running") {
                                      return <Loader2 className="ml-0.5 h-2.5 w-2.5 animate-spin text-orange-500" />;
                                    }
                                    if (shotStatus === "success" && String(shotAssetState?.selectedImageUrl || "").trim()) {
                                      return <span className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-green-500" />;
                                    }
                                    return null;
                                  })()}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                                {String(shot?.camera || "").trim() ? <span>{String(shot.camera).trim()}</span> : null}
                                {shot?.duration_sec ? <span>{shot.duration_sec}s</span> : null}
                                {isActive ? <span className="text-cyan-700">已选中</span> : null}
                              </div>
                            </div>
                            <div className="mt-1 text-[11px] leading-5 text-slate-700 break-words">
                              {renderStoryboardMentionText(
                                String(shot?.visual_description || "").trim() || "暂无镜头描述",
                                storyboardMentionTerms,
                                selectStoryboardMention,
                                onStoryboardMentionHover,
                                onStoryboardMentionLeave,
                                node,
                              )}
                            </div>
                            {Array.isArray(shot?.dialogues) && shot.dialogues.length > 0 ? (
                              <div className="mt-1.5 space-y-0.5">
                                {shot.dialogues.map((d, di) => {
                                  const speaker = String(d?.speaker || "").trim();
                                  const line = String(d?.text || "").trim();
                                  if (!line) return null;
                                  return (
                                    <div key={di} className="text-[10px] leading-5 break-words">
                                      {speaker ? (
                                        <>
                                          <span className="font-medium text-slate-700">{speaker}：</span>
                                          <span className="text-slate-500">{line}</span>
                                        </>
                                      ) : (
                                        <span className="text-slate-500">"{line}"</span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : null}
                            {String(shot?.voiceover || "").trim() ? (
                              <div className="mt-1 text-[10px] leading-5 text-slate-500 break-words">
                                <span>旁白: </span>
                                {renderStoryboardMentionText(
                                  String(shot.voiceover).trim(),
                                  storyboardMentionTerms,
                                  selectStoryboardMention,
                                  onStoryboardMentionHover,
                                  onStoryboardMentionLeave,
                                  node,
                                )}
                              </div>
                            ) : null}
                          </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); removeStoryboardShot(String(scene?.scene_id || ""), selectionId); }}
                              className="absolute right-1.5 top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm ring-1 ring-slate-200 hover:bg-rose-50 hover:text-rose-500 group-hover:flex"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        )})}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="col-span-2 rounded-[12px] border border-dashed border-slate-200 bg-white px-3 py-6 text-center text-[11px] text-slate-500">
                    暂无分镜场景
                  </div>
                )}
                </div>
              </div>
              </div>

              {(() => {
                const lab = node.data?.storyboard_plan?.local_asset_bindings;
                if (!lab) return null;
                const chars = Array.isArray(lab.character_bindings) ? lab.character_bindings : [];
                const scenes = Array.isArray(lab.scene_bindings) ? lab.scene_bindings : [];
                const missingChars = Array.isArray(lab.missing_characters) ? lab.missing_characters : [];
                const missingScenes = Array.isArray(lab.missing_scenes) ? lab.missing_scenes : [];
                const warnings = Array.isArray(lab.warnings) ? lab.warnings : [];
                if (!chars.length && !scenes.length && !missingChars.length && !missingScenes.length && !warnings.length) return null;
                return (
                  <div className="mt-3 rounded-[10px] border border-emerald-200 bg-emerald-50/60 px-2.5 py-2">
                    <div className="mb-1.5 text-[10px] font-semibold text-emerald-800">素材绑定</div>
                    {chars.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {chars.map((cb, i) => (
                          <span key={cb?.entity_id || i} className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-white px-2 py-0.5 text-[10px] text-slate-700">
                            <span className="font-medium">{String(cb?.character_name || "").trim()}</span>
                            <span title={cb?.three_view_url || undefined} className={cb?.three_view_url ? "text-emerald-600" : "text-slate-400"}>
                              三视图{cb?.three_view_url ? "✓" : "✗"}
                            </span>
                            <span title={cb?.voice_url || undefined} className={cb?.voice_url ? "text-emerald-600" : "text-slate-400"}>
                              音色{cb?.voice_url ? "✓" : "✗"}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                    {scenes.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {scenes.map((sb, i) => (
                          <span key={sb?.folder_name || i} title={sb?.folder_path || undefined} className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-white px-2 py-0.5 text-[10px] text-slate-700">
                            <span>{String(sb?.folder_name || "").trim()}</span>
                            <span className="text-blue-500">✓</span>
                          </span>
                        ))}
                      </div>
                    )}
                    {(missingChars.length > 0 || missingScenes.length > 0) && (
                      <div className="mt-1.5 text-[10px] text-slate-500">
                        {missingChars.length > 0 && (
                          <span className="mr-2">角色缺失: {missingChars.join("、")}</span>
                        )}
                        {missingScenes.length > 0 && (
                          <span>场景缺失: {missingScenes.length} 项</span>
                        )}
                      </div>
                    )}
                    {warnings.length > 0 && (
                      <div className="mt-1.5 text-[10px] text-amber-700">⚠ {warnings.length} 项警告</div>
                    )}
                  </div>
                );
              })()}
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {isLocalAssetImageNode && (() => {
          const assetUrl = String(node.data?.url || "").trim();
          const fullUrl = assetUrl ? `${(API_BASE || "").replace(/\/+$/, "")}${assetUrl}` : "";
          const charName = String(node.data?.character_name || "").trim();
          const assetName = String(node.data?.asset_name || "").trim();
          return (
            <div className="nodrag p-2">
              <div className="overflow-hidden rounded-[10px] border border-slate-100 bg-slate-50">
                {fullUrl ? (
                  <img
                    src={fullUrl}
                    alt={charName || assetName || "三视图"}
                    title={assetName || fullUrl}
                    className="w-full object-contain"
                    style={{ maxHeight: 240 }}
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                ) : (
                  <div className="flex h-32 items-center justify-center text-[11px] text-slate-400">无图片</div>
                )}
              </div>
              {charName && (
                <div className="mt-1.5 text-center text-[11px] text-slate-600">{charName}</div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Ports */}
      <div className="pointer-events-none absolute top-1/2 w-full -translate-y-1/2 flex justify-between px-0">
        {node.type !== NODE_TYPES.INPUT && !isTextInputNode && !isStoryboardInputNode && !isStoryboardPlanNode && !isRoleInputNode && !isLocalAssetImageNode && (
          <div className="pointer-events-auto relative -translate-x-1/2">
            <div
              onMouseEnter={() => onConnectTargetHover?.(VIDEO_GEN_INPUT_HANDLE_MAIN)}
              onMouseLeave={() => onConnectTargetLeave?.(VIDEO_GEN_INPUT_HANDLE_MAIN)}
              className={`h-3 w-3 cursor-crosshair rounded-full border bg-white shadow-[0_0_0_2px_rgba(255,255,255,0.9)] transition-transform duration-150 z-20 hover:scale-[1.55] ${
                isMainInputTargetHighlighted
                  ? "border-cyan-500 bg-cyan-50 ring-4 ring-cyan-200/80 shadow-[0_0_0_6px_rgba(34,211,238,0.14)]"
                  : "border-slate-300 hover:border-cyan-400 hover:bg-cyan-50"
              }`}
            />
            {isMainInputTargetHighlighted ? (
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-cyan-200 bg-white px-2 py-1 text-[10px] font-medium text-cyan-700 shadow-[0_8px_20px_rgba(15,23,42,0.08)]">
                松手连接
              </span>
            ) : null}
          </div>
        )}
        {!isStoryboardPlanNode && !isLocalAssetImageNode ? (
          <div
            onMouseDown={onConnectStart}
            className="pointer-events-auto ml-auto translate-x-1/2 h-3 w-3 cursor-crosshair rounded-full border border-slate-300 bg-white shadow-[0_0_0_2px_rgba(255,255,255,0.9)] transition-transform duration-150 hover:scale-[1.55] hover:border-cyan-400 hover:bg-cyan-50 z-20"
          />
        ) : null}
        {isTextInputNode ? (
          <div className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-30 flex w-[92px] -translate-y-1/2 flex-col gap-3 py-8 opacity-0 transition-all duration-150 group-hover/node:pointer-events-auto group-hover/node:opacity-100 hover:opacity-100">
            <div className="nodrag flex flex-col gap-3">
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border border-cyan-200 bg-white px-2.5 text-[11px] font-medium text-cyan-700 shadow-[0_12px_26px_rgba(15,23,42,0.12)] transition hover:-translate-y-0.5 hover:bg-cyan-50"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onQuickCreateFromText?.(node.id, "image");
                }}
              >
                <Plus className="h-3 w-3" />
                <span>生图</span>
              </button>
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border border-rose-200 bg-white px-2.5 text-[11px] font-medium text-rose-700 shadow-[0_12px_26px_rgba(15,23,42,0.12)] transition hover:-translate-y-0.5 hover:bg-rose-50"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onQuickCreateFromText?.(node.id, "video");
                }}
              >
                <Plus className="h-3 w-3" />
                <span>生视频</span>
              </button>
            </div>
          </div>
        ) : null}
      </div>
      {hasDedicatedLastFrameInput ? (
        <div className="pointer-events-none absolute inset-y-0 left-0 flex w-full items-center justify-between px-0">
          <div className="pointer-events-auto relative -translate-x-1/2 translate-y-10">
            <div
              onMouseEnter={() => onConnectTargetHover?.(VIDEO_GEN_INPUT_HANDLE_LAST_FRAME)}
              onMouseLeave={() => onConnectTargetLeave?.(VIDEO_GEN_INPUT_HANDLE_LAST_FRAME)}
              className={`h-3 w-3 cursor-crosshair rounded-full border bg-white shadow-[0_0_0_2px_rgba(255,255,255,0.9)] transition-transform duration-150 z-20 hover:scale-[1.55] ${
                isLastFrameTargetHighlighted
                  ? "border-rose-500 bg-rose-50 ring-4 ring-rose-200/80 shadow-[0_0_0_6px_rgba(251,113,133,0.16)]"
                  : "border-rose-300 hover:border-rose-400 hover:bg-rose-50"
              }`}
              title="连接尾帧"
            />
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 whitespace-nowrap text-[10px] font-medium text-slate-400">
              {isLastFrameTargetHighlighted ? "松手连接尾帧" : "尾帧"}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default NodeComponent;
