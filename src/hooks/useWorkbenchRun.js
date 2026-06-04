import { useState, useRef, useCallback, useEffect } from "react";
import { useCanvasStore } from "../stores/canvasStore.js";

export function useWorkbenchRun({ apiFetch } = {}) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const [isRunning, setIsRunning] = useState(false);
  const runAbortControllerRef = useRef(null);
  const nodeAbortControllersRef = useRef(new Map());
  const cancelledNodeIdsRef = useRef(new Set());
  const runningNodeIdsRef = useRef(new Set());
  const [apiStatus, setApiStatus] = useState("checking");
  const [_globalError, setGlobalError] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [activeHistoryTab, setActiveHistoryTab] = useState("recent");
  const [apiHistory, setApiHistory] = useState([]);
  const [expandedHistoryIds, setExpandedHistoryIds] = useState(new Set());
  const [apiStats, setApiStats] = useState(null);
  const [runToast, setRunToast] = useState(null);
  const runToastTimerRef = useRef(null);

  const clearRunToast = useCallback(() => {
    if (runToastTimerRef.current) {
      window.clearTimeout(runToastTimerRef.current);
      runToastTimerRef.current = null;
    }
    setRunToast(null);
  }, []);

  const showRunToast = useCallback((toast, duration = 2200) => {
    if (runToastTimerRef.current) {
      window.clearTimeout(runToastTimerRef.current);
      runToastTimerRef.current = null;
    }
    setRunToast(toast);
    if (duration > 0) {
      runToastTimerRef.current = window.setTimeout(() => {
        runToastTimerRef.current = null;
        setRunToast(null);
      }, duration);
    }
  }, []);

  useEffect(() => () => {
    if (runToastTimerRef.current) {
      window.clearTimeout(runToastTimerRef.current);
      runToastTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    apiFetch("/docs")
      .then((r) => (r.ok ? setApiStatus("online") : setApiStatus("offline")))
      .catch(() => setApiStatus("offline"));
  }, [apiFetch]);

  const fetchHistoryAndStats = async () => {
    try {
      const histResp = await apiFetch(`/api/history`);
      if (histResp.ok) setApiHistory(await histResp.json());
      const statsResp = await apiFetch(`/api/stats`);
      if (statsResp.ok) setApiStats(await statsResp.json());
    } catch (e) {
      console.error("Failed to fetch history/stats", e);
    }
  };

  useEffect(() => {
    if (showHistoryPanel) fetchHistoryAndStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHistoryPanel]);

  const normalizeHistoryOutputs = (outputs) => {
    if (!outputs) return [];
    if (Array.isArray(outputs)) return outputs.map((url) => ({ label: "输出", url }));
    const items = [];
    if (Array.isArray(outputs.images)) outputs.images.forEach((url, i) => items.push({ label: `输出图${outputs.images.length > 1 ? ` #${i + 1}` : ""}`, url }));
    if (Array.isArray(outputs.videos)) outputs.videos.forEach((url, i) => items.push({ label: `输出视频${outputs.videos.length > 1 ? ` #${i + 1}` : ""}`, url }));
    if (typeof outputs.image === "string") items.push({ label: "输出图", url: outputs.image });
    if (typeof outputs.video === "string") items.push({ label: "输出视频", url: outputs.video });
    return items;
  };

  const normalizeHistoryInputs = (inputs) => {
    if (!inputs || typeof inputs !== "object") return [];
    const items = [];
    const pushList = (label, list) => {
      if (!Array.isArray(list)) return;
      list.forEach((url, i) => {
        if (url) items.push({ label: `${label}${list.length > 1 ? ` #${i + 1}` : ""}`, url });
      });
    };
    const pushOne = (label, url) => {
      if (url) items.push({ label, url });
    };
    pushList("输入图", inputs.images);
    pushOne("输入图", inputs.image);
    pushOne("参考图", inputs.ref_image);
    pushOne("背景图", inputs.background_image);
    pushOne("尾帧", inputs.last_frame_image);
    pushOne("风格图", inputs.style_image);
    return items;
  };

  const formatHistoryParams = (inputs) => {
    if (!inputs || typeof inputs !== "object") return [];
    const exclude = new Set(["image", "images", "ref_image", "background_image", "last_frame_image", "style_image", "prompt", "text"]);
    return Object.entries(inputs)
      .filter(([key, value]) => !exclude.has(key) && value !== undefined && value !== null && value !== "")
      .map(([key, value]) => ({ key, value }));
  };

  const cancelCurrentGeneration = useCallback(() => {
    const controller = runAbortControllerRef.current;
    if (!controller || controller.signal.aborted) return;
    controller.abort(new DOMException("生成已取消", "AbortError"));
    nodeAbortControllersRef.current.forEach((nodeController) => {
      if (!nodeController.signal.aborted) {
        nodeController.abort(new DOMException("生成已取消", "AbortError"));
      }
    });
    showRunToast({ message: "正在取消当前生成...", type: "info" }, 1800);
  }, [showRunToast]);

  const cancelNodeGeneration = useCallback((nodeId) => {
    const normalizedNodeId = String(nodeId || "").trim();
    if (!normalizedNodeId) return;
    cancelledNodeIdsRef.current.add(normalizedNodeId);
    const controller = nodeAbortControllersRef.current.get(normalizedNodeId);
    if (controller && !controller.signal.aborted) {
      controller.abort(new DOMException("节点生成已取消", "AbortError"));
    }
    // 只在 loading 状态下重置（用 getState 同步读，避免闭包陈旧）
    const node = useCanvasStore.getState().nodes.find((n) => n.id === normalizedNodeId);
    if (node?.data?.status === "loading") {
      updateNodeData(normalizedNodeId, { status: "idle", error: "已取消", progress: 0, total: 0 });
    }
    showRunToast({ message: "已取消该节点生成", type: "info" }, 1800);
  }, [showRunToast, updateNodeData]);

  const safeInvoke = useCallback(
    (action, actionName = "操作") => {
      try {
        action?.();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error || "未知错误");
        console.error(`[Workbench] action:error(${actionName})`, error);
        showRunToast({ type: "error", message: `${actionName}失败：${message}` }, 0);
      }
    },
    [showRunToast],
  );

  return {
    isRunning, setIsRunning,
    runAbortControllerRef, nodeAbortControllersRef,
    cancelledNodeIdsRef, runningNodeIdsRef,
    apiStatus, setApiStatus,
    setGlobalError,
    previewImage, setPreviewImage,
    showHistoryPanel, setShowHistoryPanel,
    activeHistoryTab, setActiveHistoryTab,
    apiHistory, setApiHistory,
    expandedHistoryIds, setExpandedHistoryIds,
    apiStats, setApiStats,
    runToast, setRunToast, showRunToast, clearRunToast,
    fetchHistoryAndStats,
    normalizeHistoryOutputs,
    normalizeHistoryInputs,
    formatHistoryParams,
    cancelCurrentGeneration,
    cancelNodeGeneration,
    safeInvoke,
  };
}
