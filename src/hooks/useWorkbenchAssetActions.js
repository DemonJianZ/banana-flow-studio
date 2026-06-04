import { useCallback, useEffect } from "react";
import { buildRoleProfileStructuredOutput } from "../lib/roleProfileStructurer.js";
import { isVideoContent } from "../lib/mediaType.js";
import { normalizeAssetLibraryPersona, normalizeAssetLibraryStore } from "./useAssetLibrary";
import {
  NODE_TYPES,
  isImageFileLike,
  isMediaFileLike,
  isVideoFileLike,
  normalizeInputMediaKind,
  readFilesAsDataUrls,
} from "../constants/workbench.jsx";

const generateId = () => Math.random().toString(36).substr(2, 9);

export function useWorkbenchAssetActions({
  nodes,
  pendingUploadNodeId,
  setPendingUploadNodeId,
  createMediaUploadNodeAt,
  getCanvasViewportCenterPoint,
  pushHistory,
  setActiveNodeId,
  setAssetLibraryDetailPersonaId,
  setAssetLibraryDetailWorkId,
  setAssetLibraryPickerMode,
  setAssetLibraryStore,
  setNodes,
  setSelectedConnectionIds,
  setSelectedNodeIds,
  setShowAssetLibrary,
  showRunToast,
}) {
  useEffect(() => {
    if (!pendingUploadNodeId) return;
    const exists = nodes.some((item) => item.id === pendingUploadNodeId);
    if (!exists) {
      setPendingUploadNodeId("");
    }
  }, [nodes, pendingUploadNodeId, setPendingUploadNodeId]);

  const createPersonaInputNodeAt = useCallback((persona, point = null) => {
    const normalizedPersona = normalizeAssetLibraryPersona(persona);
    if (!normalizedPersona.id) return;
    const targetPoint = point || getCanvasViewportCenterPoint();
    const nodeId = generateId();
    const referenceImage = String(normalizedPersona.referenceImage || "").trim();
    const structuredProfile = buildRoleProfileStructuredOutput({
      roleName: normalizedPersona.name,
      characterSetting: normalizedPersona.description,
      relationshipNetwork: normalizedPersona.relationshipNetwork,
      worldviewBackground: "",
    });
    const structuredText = JSON.stringify(structuredProfile, null, 2);

    pushHistory();
    setNodes((prev) => [
      ...prev,
      {
        id: nodeId,
        type: NODE_TYPES.ROLE_INPUT,
        x: targetPoint.x - 38,
        y: targetPoint.y - 38,
        data: {
          personaId: normalizedPersona.id,
          name: normalizedPersona.name || "未命名人物",
          description: normalizedPersona.description,
          referenceImage,
          voiceDescription: normalizedPersona.voiceDescription,
          relationshipNetwork: normalizedPersona.relationshipNetwork,
          images: referenceImage ? [referenceImage] : [],
          structuredProfile,
          text: structuredText,
        },
      },
    ]);
    setSelectedNodeIds(new Set([nodeId]));
    setSelectedConnectionIds(new Set());
    setActiveNodeId(nodeId);
    setShowAssetLibrary(false);
    setAssetLibraryDetailWorkId("");
    setAssetLibraryDetailPersonaId("");
    setAssetLibraryPickerMode(false);
    showRunToast({ message: "已添加角色到画布，并完成结构化", type: "info" });
  }, [getCanvasViewportCenterPoint, pushHistory, setActiveNodeId, setAssetLibraryDetailPersonaId, setAssetLibraryDetailWorkId, setAssetLibraryPickerMode, setNodes, setSelectedConnectionIds, setSelectedNodeIds, setShowAssetLibrary, showRunToast]);

  const handleSidebarMediaUpload = useCallback(
    async (event, mediaKind = "mixed") => {
      const normalizedMediaKind = normalizeInputMediaKind(mediaKind);
      const files = Array.from(event.target.files || []).filter((file) => {
        if (normalizedMediaKind === "image") return isImageFileLike(file);
        if (normalizedMediaKind === "video") return isVideoFileLike(file);
        return isMediaFileLike(file);
      });
      if (!files.length) {
        event.target.value = "";
        return;
      }
      try {
        const mediaItems = await readFilesAsDataUrls(files);
        createMediaUploadNodeAt(getCanvasViewportCenterPoint(), mediaItems, normalizedMediaKind);
        const imageCount = files.filter((file) => isImageFileLike(file)).length;
        const videoCount = files.length - imageCount;
        showRunToast({
          message: `已添加到画布：${files.length} 个文件${imageCount ? ` · ${imageCount} 张图片` : ""}${videoCount ? ` · ${videoCount} 个视频` : ""}`,
          type: "info",
        });
      } finally {
        event.target.value = "";
      }
    },
    [createMediaUploadNodeAt, getCanvasViewportCenterPoint, showRunToast],
  );

  const restoreAssetToCanvas = useCallback(
    (asset) => {
      const url = String(asset?.url || "").trim();
      if (!url) return;
      createMediaUploadNodeAt(getCanvasViewportCenterPoint(), [url], isVideoContent(url) ? "video" : "image");
      setShowAssetLibrary(false);
      setAssetLibraryDetailWorkId("");
      setAssetLibraryDetailPersonaId("");
      setAssetLibraryPickerMode(false);
      showRunToast({ message: "已将素材放回画布", type: "info" });
      setAssetLibraryStore((prev) => {
        const current = normalizeAssetLibraryStore(prev);
        return {
          ...current,
          assets: (current.assets || []).map((item) =>
            item.id === asset.id
              ? {
                  ...item,
                  lastUsedAt: Date.now(),
                  usageCount: (Number(item.usageCount || 0) || 0) + 1,
                }
              : item,
          ),
        };
      });
    },
    [createMediaUploadNodeAt, getCanvasViewportCenterPoint, setAssetLibraryDetailPersonaId, setAssetLibraryDetailWorkId, setAssetLibraryPickerMode, setAssetLibraryStore, setShowAssetLibrary, showRunToast],
  );

  return {
    createPersonaInputNodeAt,
    handleSidebarMediaUpload,
    restoreAssetToCanvas,
  };
}
