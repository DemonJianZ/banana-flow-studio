import { useCallback } from "react";
import {
  NODE_TYPES,
  getProcessorModeDefaults,
  getReferenceNodeTitle,
  isSeedanceOmniReferenceModel,
} from "../constants/workbench.jsx";

const generateId = () => Math.random().toString(36).substr(2, 9);

export function useWorkbenchNodeFactory({
  appendTemplateGraph,
  canvasRef,
  connectionsRef,
  defaultImageModelId,
  defaultVideoModelId,
  nodes,
  nodesRef,
  pushHistory,
  screenToCanvas,
  selectedNodeIds,
  setConnections,
  setNodes,
  setSelectedConnectionIds,
  setSelectedNodeIds,
  videoModelOptions,
}) {
  const addNode = useCallback((type, modePreset = null) => {
    if (type === NODE_TYPES.POST_PROCESSOR) return undefined;
    pushHistory();
    const id = generateId();

    const rect = canvasRef.current?.getBoundingClientRect();
    const centerX = rect ? rect.width / 2 : window.innerWidth / 2;
    const centerY = rect ? rect.height / 2 : window.innerHeight / 2;
    const canvasPoint = screenToCanvas(centerX, centerY);
    const processorModePreset = modePreset === "image_creation" ? "text2img" : (modePreset || "multi_image_generate");
    const processorDefaults = getProcessorModeDefaults(processorModePreset);

    const dataByType = {
      [NODE_TYPES.INPUT]: { images: [], mediaKind: "image", title: getReferenceNodeTitle("image") },
      [NODE_TYPES.TEXT_INPUT]: { text: "" },
      [NODE_TYPES.STORYBOARD_INPUT]: {
        title: "故事板输入",
        status: "idle",
        error: "",
        scriptFileName: "",
        summary: "",
        generatedStoryboardNodeIds: [],
        progressLabel: "",
      },
      [NODE_TYPES.ROLE_INPUT]: { personaId: "", name: "", referenceImage: "", images: [], text: "" },
      [NODE_TYPES.ROLE_STRUCTURER]: {
        title: "角色结构化",
        roleName: "",
        characterSetting: "",
        relationshipNetwork: "",
        worldviewBackground: "",
        structuredProfile: null,
        text: "",
        status: "idle",
        error: "",
      },
      [NODE_TYPES.PROCESSOR]: {
        ...processorDefaults,
        title: modePreset === "image_creation" ? "图像创作" : "",
        batchSize: 1,
        uploadedImages: [],
        status: "idle",
        refImage: null,
        model: processorDefaults.model || defaultImageModelId,
      },
      [NODE_TYPES.POST_PROCESSOR]: {
        mode: "relight",
        prompt: "",
        templates: { style: "", vibe: "", direction: "", note: "" },
        batchSize: 1,
        status: "idle",
        refImage: null,
        model: defaultImageModelId,
      },
      [NODE_TYPES.VIDEO_GEN]: {
        title: modePreset === "first_last_reference" ? "视频创作" : modePreset === "omni_reference" ? "全能生视频" : "",
        mode: modePreset === "text2video" ? "text2video" : modePreset === "local_img2video" ? "local_img2video" : "img2video",
        prompt: "",
        templates:
          modePreset === "local_img2video"
            ? { duration: 5, resolution: "480p", ratio: "1:1", note: "" }
            : {
                motion: "",
                camera: modePreset === "first_last_reference" ? "固定镜头(Fixed)" : "",
                duration: 5,
                resolution: "1080p",
                ratio: "",
                note: "",
                imageType: modePreset === "omni_reference" ? "4" : modePreset === "first_last_reference" ? "2" : "",
                generate_audio_new: true,
              },
        batchSize: 1,
        status: "idle",
        refImage: null,
        lastFrameImage: "",
        firstLastFrameOnly: modePreset === "first_last_reference",
        omniReferenceOnly: modePreset === "omni_reference",
        model: modePreset === "local_img2video"
          ? "comfyui-qwen-i2v"
          : modePreset === "omni_reference"
          ? (
              videoModelOptions.find((item) => isSeedanceOmniReferenceModel(item?.id, item?.name, item?.label, item?.remark))?.id ||
              defaultVideoModelId
            )
          : defaultVideoModelId,
      },
      [NODE_TYPES.OUTPUT]: { images: [] },
    };

    const newNode = { id, type, x: canvasPoint.x - 140, y: canvasPoint.y - 100, data: dataByType[type] };

    let newConnection = null;
    if (selectedNodeIds.size === 1) {
      const sourceId = Array.from(selectedNodeIds)[0];
      const sourceNode = nodes.find((node) => node.id === sourceId);
      const canInput = type !== NODE_TYPES.INPUT && type !== NODE_TYPES.TEXT_INPUT && type !== NODE_TYPES.STORYBOARD_INPUT && type !== NODE_TYPES.ROLE_INPUT;
      if (sourceNode && canInput) {
        newConnection = { id: generateId(), from: sourceId, to: id };
        newNode.x = sourceNode.x + 350;
        newNode.y = sourceNode.y;
      }
    }

    setNodes((prev) => [...prev, newNode]);
    if (newConnection) setConnections((prev) => [...prev, newConnection]);
    setSelectedNodeIds(new Set([id]));
    return id;
  }, [canvasRef, defaultImageModelId, defaultVideoModelId, nodes, pushHistory, screenToCanvas, selectedNodeIds, setConnections, setNodes, setSelectedNodeIds, videoModelOptions]);

  const createText2ImgTemplate = useCallback(() => {
    const n1 = { id: generateId(), type: NODE_TYPES.TEXT_INPUT, x: 100, y: 200, data: { text: "赛博朋克风格的未来城市街道，霓虹灯光" } };
    const n2 = { id: generateId(), type: NODE_TYPES.PROCESSOR, x: 500, y: 200, data: { mode: "text2img", prompt: "", templates: { size: "1k", aspect_ratio: "1:1" }, batchSize: 1, status: "idle", model: defaultImageModelId } };
    const n3 = { id: generateId(), type: NODE_TYPES.OUTPUT, x: 900, y: 200, data: { images: [] } };
    appendTemplateGraph([n1, n2, n3], [
      { id: generateId(), from: n1.id, to: n2.id },
      { id: generateId(), from: n2.id, to: n3.id },
    ], { alignToViewportCenter: true });
  }, [appendTemplateGraph, defaultImageModelId]);

  const createImg2ImgTemplate = useCallback(() => {
    const n0 = { id: generateId(), type: NODE_TYPES.TEXT_INPUT, x: 100, y: 100, data: { text: "保持原图构图，转为水彩风格" } };
    const n1 = { id: generateId(), type: NODE_TYPES.INPUT, x: 100, y: 350, data: { images: [], mediaKind: "image", title: getReferenceNodeTitle("image") } };
    const n2 = { id: generateId(), type: NODE_TYPES.PROCESSOR, x: 500, y: 200, data: { mode: "multi_image_generate", prompt: "", templates: { size: "1k", note: "" }, batchSize: 1, uploadedImages: [], status: "idle", model: defaultImageModelId } };
    const n3 = { id: generateId(), type: NODE_TYPES.OUTPUT, x: 900, y: 200, data: { images: [] } };
    appendTemplateGraph([n0, n1, n2, n3], [
      { id: generateId(), from: n0.id, to: n2.id },
      { id: generateId(), from: n1.id, to: n2.id },
      { id: generateId(), from: n2.id, to: n3.id },
    ], { alignToViewportCenter: true });
  }, [appendTemplateGraph, defaultImageModelId]);

  const createMultiImg2ImgTemplate = useCallback(() => {
    const n0 = { id: generateId(), type: NODE_TYPES.TEXT_INPUT, x: 100, y: 710, data: { text: "融合三张参考图的主体特征与风格，生成统一新画面" } };
    const n1 = { id: generateId(), type: NODE_TYPES.INPUT, x: 100, y: 20, data: { images: [], mediaKind: "image", title: `${getReferenceNodeTitle("image")} 1` } };
    const n2 = { id: generateId(), type: NODE_TYPES.INPUT, x: 100, y: 250, data: { images: [], mediaKind: "image", title: `${getReferenceNodeTitle("image")} 2` } };
    const n3 = { id: generateId(), type: NODE_TYPES.INPUT, x: 100, y: 480, data: { images: [], mediaKind: "image", title: `${getReferenceNodeTitle("image")} 3` } };
    const n4 = { id: generateId(), type: NODE_TYPES.PROCESSOR, x: 500, y: 360, data: { mode: "multi_image_generate", prompt: "", templates: { size: "1k", note: "" }, batchSize: 1, uploadedImages: [], status: "idle", model: defaultImageModelId } };
    const n5 = { id: generateId(), type: NODE_TYPES.OUTPUT, x: 900, y: 360, data: { images: [] } };
    appendTemplateGraph([n0, n1, n2, n3, n4, n5], [
      { id: generateId(), from: n0.id, to: n4.id },
      { id: generateId(), from: n1.id, to: n4.id },
      { id: generateId(), from: n2.id, to: n4.id },
      { id: generateId(), from: n3.id, to: n4.id },
      { id: generateId(), from: n4.id, to: n5.id },
    ], { alignToViewportCenter: true });
  }, [appendTemplateGraph, defaultImageModelId]);

  const createImg2VideoTemplate = useCallback(() => {
    const n0 = { id: generateId(), type: NODE_TYPES.TEXT_INPUT, x: 100, y: 80, data: { text: "让参考图中的主体自然运动，镜头平稳推进，动作连贯" } };
    const n1 = { id: generateId(), type: NODE_TYPES.INPUT, x: 100, y: 320, data: { images: [], mediaKind: "image", title: getReferenceNodeTitle("image") } };
    const n2 = { id: generateId(), type: NODE_TYPES.VIDEO_GEN, x: 500, y: 200, data: { mode: "img2video", model: defaultVideoModelId, prompt: "", templates: { motion: "标准(Standard)", camera: "推近(Zoom In)", duration: 5, resolution: "1080p", ratio: "", note: "", generate_audio_new: true }, batchSize: 1, status: "idle", refImage: null } };
    const n3 = { id: generateId(), type: NODE_TYPES.OUTPUT, x: 900, y: 200, data: { images: [] } };
    appendTemplateGraph([n0, n1, n2, n3], [
      { id: generateId(), from: n0.id, to: n2.id },
      { id: generateId(), from: n1.id, to: n2.id },
      { id: generateId(), from: n2.id, to: n3.id },
    ], { alignToViewportCenter: true });
  }, [appendTemplateGraph, defaultVideoModelId]);

  const createText2VideoTemplate = useCallback(() => {
    const n0 = { id: generateId(), type: NODE_TYPES.TEXT_INPUT, x: 100, y: 120, data: { text: "未来城市街头，镜头缓慢推进，霓虹灯闪烁，人物自然行走" } };
    const n1 = { id: generateId(), type: NODE_TYPES.VIDEO_GEN, x: 500, y: 120, data: { mode: "text2video", model: defaultVideoModelId, prompt: "", templates: { motion: "标准(Standard)", camera: "推近(Zoom In)", duration: 5, resolution: "1080p", ratio: "", note: "", generate_audio_new: true }, batchSize: 1, status: "idle", refImage: null } };
    const n2 = { id: generateId(), type: NODE_TYPES.OUTPUT, x: 900, y: 120, data: { images: [] } };
    appendTemplateGraph([n0, n1, n2], [
      { id: generateId(), from: n0.id, to: n1.id },
      { id: generateId(), from: n1.id, to: n2.id },
    ], { alignToViewportCenter: true });
  }, [appendTemplateGraph, defaultVideoModelId]);

  const createOmniReferenceVideoTemplate = useCallback(() => {
    const n0 = { id: generateId(), type: NODE_TYPES.TEXT_INPUT, x: 100, y: 200, data: { text: "综合参考图中的主体、风格和镜头语言，生成自然视频" } };
    const n1 = { id: generateId(), type: NODE_TYPES.INPUT, x: 100, y: 20, data: { images: [], mediaKind: "image", title: getReferenceNodeTitle("image") } };
    const n2 = { id: generateId(), type: NODE_TYPES.INPUT, x: 100, y: 380, data: { images: [], mediaKind: "video", title: getReferenceNodeTitle("video") } };
    const omniModelId =
      videoModelOptions.find((item) => isSeedanceOmniReferenceModel(item?.id, item?.name, item?.label, item?.remark))?.id ||
      defaultVideoModelId;
    const n3 = { id: generateId(), type: NODE_TYPES.VIDEO_GEN, x: 500, y: 200, data: { title: "全能生视频", mode: "img2video", model: omniModelId, prompt: "", templates: { motion: "标准(Standard)", camera: "推近(Zoom In)", duration: 5, resolution: "1080p", ratio: "", note: "", imageType: "4", generate_audio_new: true }, batchSize: 1, status: "idle", refImage: null, omniReferenceOnly: true } };
    const n4 = { id: generateId(), type: NODE_TYPES.OUTPUT, x: 900, y: 200, data: { images: [] } };
    appendTemplateGraph([n0, n1, n2, n3, n4], [
      { id: generateId(), from: n0.id, to: n3.id },
      { id: generateId(), from: n1.id, to: n3.id },
      { id: generateId(), from: n2.id, to: n3.id },
      { id: generateId(), from: n3.id, to: n4.id },
    ], { alignToViewportCenter: true });
  }, [appendTemplateGraph, defaultVideoModelId, videoModelOptions]);

  const createConnectedVideoNode = useCallback((sourceNodeId) => {
    pushHistory();
    const sourceNode = nodes.find((node) => node.id === sourceNodeId);
    if (!sourceNode) return;
    const newNodeId = generateId();
    const newNode = {
      id: newNodeId,
      type: NODE_TYPES.VIDEO_GEN,
      x: sourceNode.x + 350,
      y: sourceNode.y,
      data: {
        mode: "img2video",
        model: defaultVideoModelId,
        prompt: sourceNode.data.prompt || "",
        templates: { motion: "标准(Standard)", camera: "固定镜头(Fixed)", duration: 5, resolution: "1080p", ratio: "", note: "", generate_audio_new: true },
        batchSize: 1,
        status: "idle",
        refImage: null,
      },
    };
    setNodes((prev) => [...prev, newNode]);
    setConnections((prev) => [...prev, { id: generateId(), from: sourceNodeId, to: newNodeId }]);
    setSelectedNodeIds(new Set([newNodeId]));
  }, [defaultVideoModelId, nodes, pushHistory, setConnections, setNodes, setSelectedNodeIds]);

  const createPromptQuickChain = useCallback((sourceNodeId, kind) => {
    const sourceNode = nodesRef.current.find((node) => node.id === sourceNodeId && node.type === NODE_TYPES.TEXT_INPUT);
    if (!sourceNode) return;

    pushHistory();

    const isVideo = kind === "video";
    const creativeNodeId = generateId();
    const outputNodeId = generateId();
    const outgoingCount = (connectionsRef.current || []).filter((connection) => connection.from === sourceNodeId).length;
    const creativeX = sourceNode.x + 390;
    const creativeY = sourceNode.y + (isVideo ? 220 : 0) + Math.min(outgoingCount, 4) * 18;
    const outputX = creativeX + 360;
    const outputY = creativeY;
    const imageDefaults = getProcessorModeDefaults("text2img");

    const creativeNode = isVideo
      ? {
          id: creativeNodeId,
          type: NODE_TYPES.VIDEO_GEN,
          x: creativeX,
          y: creativeY,
          data: {
            title: "视频创作",
            mode: "text2video",
            model: defaultVideoModelId,
            prompt: "",
            templates: {
              motion: "标准(Standard)",
              camera: "推近(Zoom In)",
              duration: 5,
              resolution: "1080p",
              ratio: "",
              note: "",
              generate_audio_new: true,
            },
            batchSize: 1,
            status: "idle",
            refImage: null,
          },
        }
      : {
          id: creativeNodeId,
          type: NODE_TYPES.PROCESSOR,
          x: creativeX,
          y: creativeY,
          data: {
            ...imageDefaults,
            title: "图像创作",
            batchSize: 1,
            uploadedImages: [],
            status: "idle",
            refImage: null,
            model: imageDefaults.model || defaultImageModelId,
          },
        };

    const outputNode = {
      id: outputNodeId,
      type: NODE_TYPES.OUTPUT,
      x: outputX,
      y: outputY,
      data: { images: [] },
    };

    setNodes((prev) => [...prev, creativeNode, outputNode]);
    setConnections((prev) => [
      ...prev,
      { id: generateId(), from: sourceNodeId, to: creativeNodeId },
      { id: generateId(), from: creativeNodeId, to: outputNodeId },
    ]);
    setSelectedNodeIds(new Set([creativeNodeId]));
    setSelectedConnectionIds(new Set());
  }, [connectionsRef, defaultImageModelId, defaultVideoModelId, nodesRef, pushHistory, setConnections, setNodes, setSelectedConnectionIds, setSelectedNodeIds]);

  return {
    addNode,
    createConnectedVideoNode,
    createImg2ImgTemplate,
    createImg2VideoTemplate,
    createMultiImg2ImgTemplate,
    createOmniReferenceVideoTemplate,
    createPromptQuickChain,
    createText2ImgTemplate,
    createText2VideoTemplate,
  };
}
