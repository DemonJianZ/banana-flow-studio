import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  X,
  Loader2,
} from "lucide-react";
import {
  EMPTY_LIST,
  NODE_TYPES,
  ASPECT_RATIOS,
  VIDEO_HD_TEMPLATE_OPTIONS,
  isSameArtifactSelection,
  normalizePromptPolishVariants,
  listAIChatParamValues,
  isSeedanceOmniReferenceModel,
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
  isAudioFileLike,
  isMediaFileLike,
  normalizeInputMediaKind,
  readFilesAsDataUrls,
  normalizeVideoSplitSecond,
  normalizeVideoSplitSegments,
} from "../../constants/workbench.jsx";
import { polishCanvasPrompt } from "../../api/agentCanvas";
import { downloadMedia } from "../../lib/downloadMedia";
import { isVideoContent } from "../../lib/mediaType.js";
import { buildRoleProfileStructuredOutput } from "../../lib/roleProfileStructurer.js";
import { API_BASE } from "../../config";
import ArtifactThumb from "./ArtifactThumb.jsx";
import BackgroundProcessingOverlay from "./BackgroundProcessingOverlay.jsx";
import NodeErrorPanel from "./NodeErrorPanel.jsx";
import NodeFloatingActions from "./NodeFloatingActions.jsx";
import NodePorts from "./NodePorts.jsx";
import PersonaMentionTextarea from "./PersonaMentionTextarea";
import VideoGenInlinePanel from "./VideoGenInlinePanel.jsx";
import { getNodeShellClass, getNodeShellStyle, getNodeTitle } from "./nodeShell.js";
import { getNodeRenderer, registerDefaultNodeRenderers } from "./node-renderers/NodeRendererRegistry.js";
import AiNodeRenderer from "./node-renderers/AiNodeRenderer.jsx";
import CompactInputNodeRenderer from "./node-renderers/CompactInputNodeRenderer.jsx";
import LocalAssetImageNodeRenderer from "./node-renderers/LocalAssetImageNodeRenderer.jsx";
import OutputNodeRenderer from "./node-renderers/OutputNodeRenderer.jsx";
import RoleInputNodeRenderer from "./node-renderers/RoleInputNodeRenderer.jsx";
import RoleStructurerNodeRenderer from "./node-renderers/RoleStructurerNodeRenderer.jsx";
import SimpleMediaInputControlsRenderer from "./node-renderers/SimpleMediaInputControlsRenderer.jsx";
import SimpleMediaInputNodeRenderer from "./node-renderers/SimpleMediaInputNodeRenderer.jsx";
import StoryboardInputNodeRenderer from "./node-renderers/StoryboardInputNodeRenderer.jsx";
import StoryboardPlanNodeRenderer from "./node-renderers/StoryboardPlanNodeRenderer.jsx";
import TextInputNodeRenderer from "./node-renderers/TextInputNodeRenderer.jsx";

// ---- Private helpers (NodeComponent-only) ----

const DEFAULT_VIDEO_SPLIT_SEGMENT_LENGTH_SEC = 3;
const VIDEO_SPLIT_OUTPUT_RESOLUTION_OPTIONS = ["720p"];

registerDefaultNodeRenderers({
  [NODE_TYPES.INPUT]: CompactInputNodeRenderer,
  [NODE_TYPES.PROCESSOR]: AiNodeRenderer,
  [NODE_TYPES.POST_PROCESSOR]: AiNodeRenderer,
  [NODE_TYPES.VIDEO_GEN]: AiNodeRenderer,
  [NODE_TYPES.ROLE_INPUT]: RoleInputNodeRenderer,
  [NODE_TYPES.ROLE_STRUCTURER]: RoleStructurerNodeRenderer,
  [NODE_TYPES.LOCAL_ASSET_IMAGE]: LocalAssetImageNodeRenderer,
  [NODE_TYPES.STORYBOARD_INPUT]: StoryboardInputNodeRenderer,
  [NODE_TYPES.STORYBOARD_PLAN]: StoryboardPlanNodeRenderer,
  [NODE_TYPES.TEXT_INPUT]: TextInputNodeRenderer,
  [NODE_TYPES.OUTPUT]: OutputNodeRenderer,
});

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
  connectedInputNodes = EMPTY_LIST,
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
  const simpleMediaInputAccept = inputMediaKind === "image" ? "image/*" : inputMediaKind === "video" ? "video/*" : inputMediaKind === "audio" ? "audio/*" : "image/*,video/*";
  const simpleMediaUploadLabel = inputMediaKind === "image" ? "上传图片" : inputMediaKind === "video" ? "上传视频" : inputMediaKind === "audio" ? "上传音频" : "上传图片/视频";
  const simpleMediaDropTitle = inputMediaKind === "image" ? "拖拽图片到此，或点击上传" : inputMediaKind === "video" ? "拖拽视频到此，或点击上传" : inputMediaKind === "audio" ? "拖拽音频到此，或点击上传" : "拖拽媒体到此，或点击上传";
  const simpleMediaSupportHint = inputMediaKind === "image" ? "支持 JPG / PNG / WebP / GIF" : inputMediaKind === "video" ? "支持 MP4 / MOV / WebM" : inputMediaKind === "audio" ? "支持 MP3 / WAV / AAC / OGG" : "支持常见图片与视频格式";
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
      if (inputMediaKind === "audio") return isAudioFileLike(file);
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
  const NodeRenderer = getNodeRenderer(node.type);
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

  // Build @mention options from connected sibling input nodes (for text_input node)
  const connectedInputMentionOptions = useMemo(() => {
    if (!isTextInputNode || !connectedInputNodes.length) return EMPTY_LIST;
    const seen = new Set();
    const result = [];
    let imageCount = 0;
    let audioCount = 0;
    connectedInputNodes.forEach((inputNode) => {
      const id = inputNode.id;
      if (seen.has(id)) return;
      seen.add(id);
      const title = String(inputNode.data?.title || "").trim();
      const mediaKind = inputNode.data?.mediaKind || "image";
      const images = Array.isArray(inputNode.data?.images) ? inputNode.data.images : [];
      const thumbnail = images[0] || null;
      const isAudio = mediaKind === "audio";
      if (isAudio) {
        audioCount += 1;
      } else {
        imageCount += 1;
      }
      const defaultName = isAudio ? `音频${audioCount}` : `图片${imageCount}`;
      result.push({
        name: title || defaultName,
        mediaKind,
        thumbnail,
        kind: "connected_input",
        nodeId: id,
      });
    });
    return result;
  }, [isTextInputNode, connectedInputNodes]);

  // Merge connected input mentions (first) with library persona mentions
  const mergedMentionOptions = useMemo(() => {
    if (!isTextInputNode) return personaMentionOptions;
    if (!connectedInputMentionOptions.length) return personaMentionOptions;
    return [...connectedInputMentionOptions, ...personaMentionOptions];
  }, [isTextInputNode, connectedInputMentionOptions, personaMentionOptions]);

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
  }, [node.data?.images, node.data?.images?.length]);

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

  const title = getNodeTitle({
    node,
    isInput,
    isCompactInput,
    isOutput,
    isProcessor,
    isPostProcessor,
    isVideoGen,
    isTextInputNode,
    isStoryboardInputNode,
    isRoleStructurerNode,
    isLocalAssetImageNode,
  });

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
  } = {}) => <BackgroundProcessingOverlay title={overlayTitle} description={description} />;

  const renderArtifactThumb = (img, i, meta = {}) => (
    <ArtifactThumb
      key={i}
      image={img}
      index={i}
      meta={meta}
      nodeId={node.id}
      activeArtifact={activeArtifact}
      onPreview={onPreview}
      onSelectArtifact={onSelectArtifact}
    />
  );

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
  const nodeShellStyle = getNodeShellStyle({
    node,
    isVideoGen,
    selected,
    isStoryboardPlanNode,
    isStoryboardInputNode,
    isLocalAssetImageNode,
  });
  const handleStoryboardWheelCapture = isStoryboardPlanNode
    ? (event) => {
        event.stopPropagation();
      }
    : undefined;
  const nodeShellClass = getNodeShellClass({
    node,
    selected,
    selectedNodeShellClass,
    statusColor,
    isTextInputNode,
    isStoryboardInputNode,
    isRoleInputNode,
    isRoleStructurerNode,
    isOutput,
    isStoryboardPlanNode,
    isLocalAssetImageNode,
    isInlineImageGenNode,
    isSimpleMediaInputNode,
    isCompactInput,
  });

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

      <NodeFloatingActions
        showRetry={showFloatingRetryButton}
        showDelete={showFloatingDeleteButton}
        onRetry={onRetry}
        onDelete={onDelete}
      />

      {isVideoGen && (node.data.mode === "img2video" || node.data.mode === "text2video") && (
        <VideoGenInlinePanel
          node={node}
          updateData={updateData}
          apiFetch={apiFetch}
          onOpenPromptPolishPicker={onOpenPromptPolishPicker}
          imageModelOptions={imageModelOptions}
          videoModelOptions={videoModelOptions}
          resolveModelParamsForId={resolveModelParamsForId}
          personaMentionOptions={personaMentionOptions}
          onRunNode={onRunNode}
          onCancelNode={onCancelNode}
          isReady={isReady}
          videoLastFrameInputRef={videoLastFrameInputRef}
          onLastFrameUpload={handleVideoLastFrameUpload}
          onReferenceModeChange={setVideoReferenceMode}
        />
      )}

      {isSimpleMediaInputNode ? (
        <SimpleMediaInputControlsRenderer
          node={node}
          inputRef={simpleMediaUploadInputRef}
          accept={simpleMediaInputAccept}
          onInputChange={handleFileUpload}
          showToolbar={showSimpleMediaToolbar}
          hasSelection={hasSimpleMediaSelection}
          hasVideoSelection={hasSimpleMediaVideoSelection}
          uploadLabel={simpleMediaUploadLabel}
          title={title}
          mediaToolbarClass={mediaToolbarClass}
          mediaToolbarRowClass={mediaToolbarRowClass}
          mediaToolbarOptionRowClass={mediaToolbarOptionRowClass}
          mediaToolbarIconClass={mediaToolbarIconClass}
          getMediaToolbarButtonClass={getMediaToolbarButtonClass}
          openUpload={openSimpleMediaUploadPicker}
          videoSplitPending={videoSplitPending}
          compactActionBusy={compactActionBusy}
          showVideoUpscaleOptions={showSimpleVideoUpscaleOptions}
          compactVideoUpscalePending={compactVideoUpscalePending}
          videoRmbgPending={videoRmbgPending}
          videoLineartPending={videoLineartPending}
          compactThreeViewPending={compactThreeViewPending}
          compactRmbgPending={compactRmbgPending}
          compactRemovePending={compactRemovePending}
          onVideoEditor={handleSimpleVideoEditorClick}
          onVideoUpscale={handleSimpleVideoUpscaleClick}
          onVideoRmbg={handleSimpleVideoRmbgClick}
          onVideoLineart={handleSimpleVideoLineartClick}
          onImageThreeView={handleSimpleImageThreeViewClick}
          onImageRmbg={handleSimpleImageRmbgClick}
          onImageRemove={handleSimpleImageRemoveClick}
          onVideoUpscaleOption={handleSimpleVideoUpscaleOptionClick}
          showVideoEditor={showSimpleVideoEditor}
          setShowVideoEditor={setShowSimpleVideoEditor}
          activeItem={simpleMediaActiveItem}
          onVideoMetadata={handleVideoSplitMetadataLoaded}
          videoDuration={videoSplitDuration}
          formatVideoSplitTime={formatVideoSplitTime}
          segments={videoSplitSegments}
          onSegmentAdd={handleVideoSplitSegmentAdd}
          onSegmentRemove={handleVideoSplitSegmentRemove}
          drafts={videoSplitDrafts}
          onSegmentChange={handleVideoSplitSegmentChange}
          onCommitDrafts={commitVideoSplitDrafts}
          outputResolution={videoSplitOutputResolution}
          setOutputResolution={setVideoSplitOutputResolution}
          outputResolutionOptions={VIDEO_SPLIT_OUTPUT_RESOLUTION_OPTIONS}
          includeAudio={videoSplitIncludeAudio}
          setIncludeAudio={setVideoSplitIncludeAudio}
          onRunSplit={handleVideoSplitRun}
        />
      ) : null}

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
        {isRoleInputNode && NodeRenderer ? <NodeRenderer node={node} /> : null}
        {isRoleStructurerNode && NodeRenderer ? (
          <NodeRenderer node={node} updateData={updateData} onRun={runRoleStructurer} />
        ) : null}
        {node.data.status === "error" && !isTextInputNode && !isStoryboardInputNode && !isRoleInputNode && !isRoleStructurerNode && !isSimpleMediaInputNode && (
          <NodeErrorPanel error={node.data.error} copied={showCopied} onCopy={copyDebugInfo} />
        )}

        {isAI && NodeRenderer ? (
          <NodeRenderer
            node={node}
            title={title}
            isInlineImageGenNode={isInlineImageGenNode}
            isInlineImg2ImgNode={isInlineImg2ImgNode}
            imageModelOptions={imageModelOptions}
            inlineImageSizeOptions={inlineImageSizeOptions}
            inlineImageRatioOptions={inlineImageRatioOptions}
            inlineImageParamLoading={inlineImageParamLoading}
            inlineImageParamError={inlineImageParamError}
            isReady={isReady}
            onRetry={onRetry}
            onRunNode={onRunNode}
            onCancelNode={onCancelNode}
            updateData={updateData}
            safeProgressWidth={safeProgressWidth}
            hideInlineAiResults={hideInlineAiResults}
            renderArtifactThumb={renderArtifactThumb}
            isProcessor={isProcessor}
            isPostProcessor={isPostProcessor}
            isImageCreationNode={isImageCreationNode}
            onContinue={onContinue}
            onIterateImg2Img={onIterateImg2Img}
          />
        ) : null}

        {/* Input */}
        {isInput && isCompactInput && NodeRenderer && (
          <NodeRenderer
            node={node}
            activeImage={compactActiveImage}
            activeIndex={compactActiveIndex}
            activeIsVideo={compactActiveIsVideo}
            images={compactImages}
            showActions={showCompactInputActions}
            setShowActions={setShowCompactInputActions}
            showVideoUpscaleOptions={showCompactVideoUpscaleOptions}
            setShowVideoUpscaleOptions={setShowCompactVideoUpscaleOptions}
            setActiveIndex={setCompactActiveIndex}
            actionBusy={compactActionBusy}
            rmbgPending={compactRmbgPending}
            removePending={compactRemovePending}
            threeViewPending={compactThreeViewPending}
            videoUpscalePending={compactVideoUpscalePending}
            videoLineartPending={videoLineartPending}
            videoRmbgPending={videoRmbgPending}
            hasThreeViewResult={hasCompactThreeViewResult}
            mediaToolbarClass={mediaToolbarClass}
            mediaToolbarRowClass={mediaToolbarRowClass}
            mediaToolbarOptionRowClass={mediaToolbarOptionRowClass}
            mediaToolbarIconClass={mediaToolbarIconClass}
            getMediaToolbarButtonClass={getMediaToolbarButtonClass}
            renderBackgroundProcessingOverlay={renderBackgroundProcessingOverlay}
            onPreview={onPreview}
            onCompactVideoRmbg={handleCompactVideoRmbgClick}
            onCompactVideoLineart={handleCompactVideoLineartClick}
            onCompactVideoUpscale={handleCompactVideoUpscaleClick}
            onCompactVideoUpscaleOption={handleCompactVideoUpscaleOptionClick}
            onCompactThreeView={handleCompactThreeViewClick}
            onCompactRmbg={handleCompactRmbgClick}
            onCompactRemove={handleCompactRemoveClick}
          />
        )}

        {isInput && !isCompactInput && (
          <SimpleMediaInputNodeRenderer
            node={node}
            inputMediaKind={inputMediaKind}
            activeArtifact={activeArtifact}
            actionIndex={simpleMediaActionIndex}
            videoUpscalePending={compactVideoUpscalePending}
            videoRmbgPending={videoRmbgPending}
            videoLineartPending={videoLineartPending}
            imageRmbgPending={compactRmbgPending}
            imageRemovePending={compactRemovePending}
            imageThreeViewPending={compactThreeViewPending}
            uploadDropActive={isUploadDropActive}
            setUploadDropActive={setIsUploadDropActive}
            setShowToolbar={setShowSimpleMediaToolbar}
            setActionIndex={setSimpleMediaActionIndex}
            onOpenUpload={openSimpleMediaUploadPicker}
            onPreview={onPreview}
            resolveAssetUrl={resolveAssetUrl}
            renderBackgroundProcessingOverlay={renderBackgroundProcessingOverlay}
            readUploadFiles={readSimpleMediaUploadFiles}
            updateData={updateData}
            dropTitle={simpleMediaDropTitle}
            supportHint={simpleMediaSupportHint}
          />
        )}

        {/* Output */}
        {isOutput && NodeRenderer && (
          <NodeRenderer
            node={node}
            onDownloadAll={downloadAll}
            renderArtifactThumb={renderArtifactThumb}
          />
        )}

        {isStoryboardInputNode && NodeRenderer && (
          <NodeRenderer
            node={node}
            inputRef={storyboardScriptInputRef}
            dropActive={storyboardDropActive}
            setDropActive={setStoryboardDropActive}
            onInputChange={handleStoryboardScriptInputChange}
            onDrop={handleStoryboardScriptDrop}
          />
        )}

        {/* Text input */}
        {isTextInputNode && NodeRenderer && (
          <NodeRenderer
            node={node}
            updateData={updateData}
            apiFetch={apiFetch}
            personas={mergedMentionOptions}
            promptPolishLoading={promptPolishLoading}
            promptPolishError={promptPolishError}
            setPromptPolishError={setPromptPolishError}
            onPolish={handlePolishTextInputPrompt}
          />
        )}

        {isStoryboardPlanNode && NodeRenderer ? (
          <NodeRenderer
            node={node}
            updateData={updateData}
            activeArtifact={activeArtifact}
            onSelectArtifact={onSelectArtifact}
            onStoryboardMentionHover={onStoryboardMentionHover}
            onStoryboardMentionLeave={onStoryboardMentionLeave}
            onShotChipClick={onShotChipClick}
          />
        ) : null}

        {isLocalAssetImageNode && NodeRenderer ? <NodeRenderer node={node} /> : null}
      </div>

      <NodePorts
        node={node}
        isTextInputNode={isTextInputNode}
        isStoryboardInputNode={isStoryboardInputNode}
        isStoryboardPlanNode={isStoryboardPlanNode}
        isRoleInputNode={isRoleInputNode}
        isLocalAssetImageNode={isLocalAssetImageNode}
        isMainInputTargetHighlighted={isMainInputTargetHighlighted}
        isLastFrameTargetHighlighted={isLastFrameTargetHighlighted}
        hasDedicatedLastFrameInput={hasDedicatedLastFrameInput}
        onConnectStart={onConnectStart}
        onConnectTargetHover={onConnectTargetHover}
        onConnectTargetLeave={onConnectTargetLeave}
        onQuickCreateFromText={onQuickCreateFromText}
      />
    </div>
  );
};

const getNodeConnectHighlightKey = (props) => {
  if (!props.connecting || props.hoveredConnectTarget?.nodeId !== props.node?.id) return "";
  return normalizeConnectionTargetHandle(props.hoveredConnectTarget?.toHandle);
};

const areNodeComponentPropsEqual = (prev, next) =>
  prev.node === next.node &&
  prev.selected === next.selected &&
  prev.isReady === next.isReady &&
  prev.shouldAutoOpenUploadPicker === next.shouldAutoOpenUploadPicker &&
  prev.imageModelOptions === next.imageModelOptions &&
  prev.videoModelOptions === next.videoModelOptions &&
  prev.personaMentionOptions === next.personaMentionOptions &&
  prev.connectedInputNodes === next.connectedInputNodes &&
  isSameArtifactSelection(prev.activeArtifact, next.activeArtifact) &&
  getNodeConnectHighlightKey(prev) === getNodeConnectHighlightKey(next);

export default React.memo(NodeComponent, areNodeComponentPropsEqual);
