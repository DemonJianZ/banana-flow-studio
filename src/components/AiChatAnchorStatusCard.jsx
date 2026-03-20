import React, { useEffect, useState } from "react";
import {
  AGENT_DEV_MODE_EVENT,
  AGENT_DEV_MODE_STORAGE_KEY,
  AI_CHAT_ANCHOR_DEBUG_EVENT,
  readAgentDevMode,
  readAiChatAnchorDebugState,
} from "../lib/aiChatAnchorDebug";

const STATUS_LABELS = {
  idle: "待执行",
  loading: "请求中",
  success: "成功",
  error: "失败",
  timeout: "超时",
  login_required: "需登录",
};

const getStatusClass = (status) => {
  if (status === "success") return "text-emerald-200 border-emerald-700/60 bg-emerald-950/30";
  if (status === "loading") return "text-cyan-200 border-cyan-700/60 bg-cyan-950/30";
  if (status === "timeout" || status === "error" || status === "login_required") {
    return "text-rose-200 border-rose-700/60 bg-rose-950/30";
  }
  return "text-slate-300 border-slate-700/70 bg-slate-900/60";
};

const formatUpdatedAt = (updatedAt) => {
  if (!updatedAt) return "";
  try {
    return new Date(updatedAt).toLocaleTimeString("zh-CN", { hour12: false });
  } catch {
    return "";
  }
};

export default function AiChatAnchorStatusCard() {
  const [state, setState] = useState(() => readAiChatAnchorDebugState());
  const [visible, setVisible] = useState(() => readAgentDevMode());

  useEffect(() => {
    setState(readAiChatAnchorDebugState());
    setVisible(readAgentDevMode());
    const handleStorage = (event) => {
      if (!event.key || event.key === "bananaflow_ai_chat_anchor_debug_v1") {
        setState(readAiChatAnchorDebugState());
      }
      if (!event.key || event.key === AGENT_DEV_MODE_STORAGE_KEY) {
        setVisible(readAgentDevMode());
      }
    };
    const handleLocalUpdate = (event) => {
      if (event?.detail) {
        setState(event.detail);
        return;
      }
      setState(readAiChatAnchorDebugState());
    };
    const handleDevModeUpdate = (event) => {
      if (typeof event?.detail === "boolean") {
        setVisible(event.detail);
        return;
      }
      setVisible(readAgentDevMode());
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener(AI_CHAT_ANCHOR_DEBUG_EVENT, handleLocalUpdate);
    window.addEventListener(AGENT_DEV_MODE_EVENT, handleDevModeUpdate);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(AI_CHAT_ANCHOR_DEBUG_EVENT, handleLocalUpdate);
      window.removeEventListener(AGENT_DEV_MODE_EVENT, handleDevModeUpdate);
    };
  }, []);

  if (!visible) return null;

  const statusLabel = STATUS_LABELS[state.status] || STATUS_LABELS.idle;
  const updatedAtText = formatUpdatedAt(state.updatedAt);

  return (
    <div className="fixed right-4 bottom-4 z-[92] w-[320px] max-w-[calc(100vw-1rem)] overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(145deg,rgba(9,15,28,0.96),rgba(14,25,45,0.90)_55%,rgba(10,18,34,0.94))] shadow-[0_24px_60px_rgba(2,6,23,0.45),inset_0_1px_0_rgba(255,255,255,0.14)]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-slate-100">aiChatAnchor(module=3)</div>
          <div className="text-[10px] text-slate-400">{updatedAtText ? `最近更新 ${updatedAtText}` : "暂无记录"}</div>
        </div>
        <span className={`rounded-full border px-2 py-1 text-[10px] ${getStatusClass(state.status)}`}>{statusLabel}</span>
      </div>
      <div className="px-4 py-3">
        <div className="text-[11px] text-slate-200">{state.message || "尚未触发锚点请求"}</div>
        {state.detail ? (
          <details className="mt-2">
            <summary className="cursor-pointer text-[10px] text-slate-400">查看详情</summary>
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-[14px] bg-black/20 px-2 py-1.5 text-[9px] leading-4 text-slate-100/90">
              {state.detail}
            </pre>
          </details>
        ) : null}
      </div>
    </div>
  );
}
