import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUp, ChevronLeft, ChevronRight, Clock, FileSpreadsheet,
  FileText, Film, Image as ImageIcon, MessageSquare, Paperclip,
  Plus, RefreshCw, RotateCcw, Square, Trash2, X,
} from "lucide-react";
import { API_BASE } from "../../config";
import { resolveMemberAuthorization } from "../../services/auth/tokenStorage.js";

// ── 常量 ──────────────────────────────────────────────────────────────────────

const STORAGE_KEY = "bf_agent_sessions";
const MAX_SESSIONS = 30;

const ACCEPT_IMAGE = "image/jpeg,image/png,image/gif,image/webp,image/bmp";
const ACCEPT_VIDEO = "video/mp4,video/quicktime,video/x-msvideo,video/webm,video/x-matroska";
const ACCEPT_DOC   = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx";
const ACCEPT_ALL   = `${ACCEPT_IMAGE},${ACCEPT_VIDEO},${ACCEPT_DOC}`;

// ── 工具函数 ──────────────────────────────────────────────────────────────────

function generateId(prefix = "id") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderMarkdown(text) {
  if (!text) return "";
  return text
    .replace(/```[\w]*\n([\s\S]*?)```/g, (_, c) => `<pre><code>${escapeHtml(c.trimEnd())}</code></pre>`)
    .replace(/`([^`]+)`/g, (_, c) => `<code>${escapeHtml(c)}</code>`)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^#{1,3} (.+)$/gm, (_, t) => `<p><strong>${t}</strong></p>`)
    .replace(/^[-*] (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>[\s\S]*?<\/li>\n?)+/g, s => `<ul>${s}</ul>`)
    .replace(/\n\n+/g, "</p><p>")
    .replace(/\n/g, "<br>");
}

async function* parseSSE(reader) {
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try { yield JSON.parse(line.slice(6)); } catch { /* skip */ }
    }
  }
}

function timeAgo(ts) {
  const d = Math.floor((Date.now() - ts) / 1000);
  if (d < 60) return "刚刚";
  if (d < 3600) return `${Math.floor(d / 60)} 分钟前`;
  if (d < 86400) return `${Math.floor(d / 3600)} 小时前`;
  if (d < 86400 * 30) return `${Math.floor(d / 86400)} 天前`;
  return new Date(ts).toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// 根据文件名/MIME 返回 file_type
function guessFileType(name, mime = "") {
  const ext = (name.match(/\.(\w+)$/) || [])[1]?.toLowerCase() ?? "";
  if (mime.startsWith("image/") || ["jpg","jpeg","png","gif","webp","bmp"].includes(ext)) return "image";
  if (mime.startsWith("video/") || ["mp4","mov","avi","webm","mkv"].includes(ext)) return "video";
  if (["pdf","doc","docx","xls","xlsx","ppt","pptx"].includes(ext)) return "doc";
  return "unknown";
}

// ── 本地会话存储 ───────────────────────────────────────────────────────────────

function loadSessions() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { return []; }
}
function saveSessions(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s.slice(0, MAX_SESSIONS))); }
  catch { /* quota */ }
}
function upsertSession(sess) {
  const all = loadSessions();
  const i = all.findIndex(s => s.id === sess.id);
  if (i >= 0) all[i] = sess; else all.unshift(sess);
  all.sort((a, b) => b.updatedAt - a.updatedAt);
  saveSessions(all);
}
function deleteSession(id) { saveSessions(loadSessions().filter(s => s.id !== id)); }

// ── 灵感卡片 ──────────────────────────────────────────────────────────────────

const CARDS = [
  { title: "商品主图精修", desc: "棚拍光、干净背景、细节锐化",
    prompt: "一张高端护肤品商业主图，白色棚拍背景，柔和轮廓光，产品细节清晰，电商海报质感。",
    image: "https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=760&q=80" },
  { title: "短视频分镜", desc: "从脚本拆镜头并组织画布流程",
    prompt: "帮我把一条产品短视频脚本拆成分镜流程，包含开场钩子、卖点展示、使用场景和结尾转化。",
    image: "https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&w=760&q=80" },
  { title: "三视图资产", desc: "角色或产品统一角度出图",
    prompt: "生成一个角色三视图资产，正面、侧面、背面保持服装、比例和色彩一致，适合后续视频生成。",
    image: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=760&q=80" },
  { title: "口红场景广告", desc: "质感场景、色彩统一、强商品焦点",
    prompt: "一支高级口红的场景广告图，浅色梳妆台，柔和自然光，质感金属外壳，画面精致干净。",
    image: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=760&q=80" },
];

// ── 附件图标 ──────────────────────────────────────────────────────────────────

function AttachIcon({ type, className = "h-4 w-4" }) {
  if (type === "image") return <ImageIcon className={className} />;
  if (type === "video") return <Film className={className} />;
  if (type === "doc")   return <FileText className={className} />;
  return <FileSpreadsheet className={className} />;
}

// 附件状态 chip（输入框上方）
function AttachChip({ att, onRemove }) {
  const isImage = att.file_type === "image";
  const isError = att.status === "error";
  const isLoading = att.status === "uploading";

  return (
    <div className={[
      "group relative flex items-center gap-1.5 rounded-[8px] border pr-1.5 pl-1 py-1 text-[11px] max-w-[140px]",
      isError   ? "border-rose-200 bg-rose-50 text-rose-600" :
      isLoading ? "border-slate-200 bg-slate-50 text-slate-400" :
                  "border-slate-200 bg-white text-slate-700 shadow-sm",
    ].join(" ")}>
      {/* 缩略图 or 图标 */}
      {isImage && att.data_url && !isError ? (
        <img src={att.data_url} alt="" className="h-7 w-7 rounded-[5px] object-cover shrink-0" />
      ) : (
        <div className={[
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-[5px]",
          isError ? "bg-rose-100" : "bg-slate-100",
        ].join(" ")}>
          {isLoading
            ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-cyan-500" />
            : <AttachIcon type={att.file_type} className="h-3.5 w-3.5" />}
        </div>
      )}
      {/* 文件名 */}
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium leading-4">{att.name}</div>
        {isError && <div className="truncate text-[10px] text-rose-400">{att.error}</div>}
        {isLoading && <div className="text-[10px] text-slate-400">上传中…</div>}
        {!isError && !isLoading && att.size && (
          <div className="text-[10px] text-slate-400">{fmtBytes(att.size)}</div>
        )}
      </div>
      {/* 删除 */}
      <button
        type="button"
        onClick={() => onRemove(att.id)}
        className="ml-0.5 shrink-0 rounded p-0.5 text-slate-300 hover:bg-slate-100 hover:text-slate-500 transition"
        aria-label="移除附件"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

// ── 消息气泡 ──────────────────────────────────────────────────────────────────

function UserBubble({ content, attachments }) {
  return (
    <div className="flex justify-end mb-3">
      <div className="max-w-[92%] space-y-1.5">
        {/* 附件预览 */}
        {attachments?.length > 0 && (
          <div className="flex flex-wrap justify-end gap-1.5">
            {attachments.map((att, i) =>
              att.file_type === "image" && att.data_url ? (
                <img
                  key={i} src={att.data_url} alt={att.name}
                  className="max-h-36 max-w-[200px] rounded-[8px] object-cover shadow-sm ring-1 ring-slate-200"
                />
              ) : (
                <div key={i} className="flex items-center gap-1.5 rounded-[8px] bg-cyan-50 px-2.5 py-1.5 ring-1 ring-cyan-100">
                  <AttachIcon type={att.file_type} className="h-3.5 w-3.5 text-cyan-600" />
                  <span className="max-w-[120px] truncate text-[11px] text-cyan-700">{att.name}</span>
                </div>
              )
            )}
          </div>
        )}
        {/* 文字 */}
        {content && (
          <div className="rounded-[12px] rounded-tr-[4px] bg-cyan-500 px-3 py-2 text-[12.5px] leading-5 text-white shadow-[0_2px_8px_rgba(6,182,212,0.18)]">
            {content}
          </div>
        )}
      </div>
    </div>
  );
}

/** 参数选择表单卡片 */
function ParamFormCard({ event, onSubmit }) {
  const [selected, setSelected] = useState(() => {
    const defaults = {};
    (event.groups || []).forEach(g => { if (g.default) defaults[g.key] = g.default; });
    return defaults;
  });

  const allRequired = (event.groups || [])
    .filter(g => g.required)
    .every(g => selected[g.key]);

  return (
    <div className="rounded-[10px] bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
      <div className="bg-slate-50 px-3 py-2 border-b border-slate-100">
        <div className="text-[11px] font-semibold text-slate-600">选择生成参数</div>
        {event.prompt && (
          <div className="mt-0.5 truncate text-[10px] text-slate-400">提示词：{event.prompt}</div>
        )}
      </div>
      <div className="px-3 py-2.5 space-y-3">
        {(event.groups || []).map(group => (
          <div key={group.key}>
            <div className="mb-1.5 text-[10px] font-medium text-slate-500 uppercase tracking-wide">
              {group.label}{group.required && <span className="ml-1 text-rose-400">*</span>}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {group.options.map(opt => {
                const active = selected[group.key] === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSelected(p => ({ ...p, [group.key]: opt.value }))}
                    className={[
                      "rounded-[7px] border px-2.5 py-1 text-[11px] transition",
                      active
                        ? "border-cyan-400 bg-cyan-50 text-cyan-700 font-medium shadow-sm"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50",
                    ].join(" ")}
                  >
                    <span>{opt.label}</span>
                    {opt.desc && <span className="ml-1 text-[9px] opacity-60">{opt.desc}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-slate-100 px-3 py-2">
        <button
          type="button"
          disabled={!allRequired}
          onClick={() => onSubmit(event.tool, event.prompt, selected)}
          className="flex items-center gap-1.5 rounded-[8px] bg-cyan-500 px-3 py-1.5 text-[12px] font-medium text-white shadow-sm transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          <ArrowUp className="h-3.5 w-3.5" />
          开始生成
        </button>
      </div>
    </div>
  );
}

/** 工具执行结果卡片 */
function ToolCallCard({ tc, onAddToCanvas }) {
  const running = tc.status === "running";
  const result = tc.result || {};
  const mediaUrl = result.url || result.data_url;
  const isVideo = result.media_type === "video";
  const canAdd = !running && result.ok && mediaUrl;

  return (
    <div className={["mb-1.5 overflow-hidden rounded-[10px] ring-1",
      running ? "bg-slate-50 ring-slate-100" : result.ok ? "bg-white ring-slate-200 shadow-sm" : "bg-rose-50 ring-rose-100",
    ].join(" ")}>
      {/* 状态行 */}
      <div className="flex items-center gap-2 px-3 py-1.5">
        {running ? (
          <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-[1.5px] border-slate-200 border-t-cyan-500" />
        ) : result.ok ? (
          <span className="text-[10px] text-emerald-500">✓</span>
        ) : (
          <span className="text-[10px] text-rose-400">✕</span>
        )}
        <span className="text-[11px] text-slate-500 truncate flex-1">
          {running ? tc.label : result.ok ? "生成完成" : result.error || "失败"}
        </span>
        {/* 添加到画布按钮 */}
        {canAdd && onAddToCanvas && (
          <button
            type="button"
            onClick={() => onAddToCanvas(mediaUrl, isVideo ? "video" : "image")}
            className="shrink-0 rounded-[6px] border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[10px] font-medium text-cyan-700 transition hover:bg-cyan-100"
          >
            + 添加到画布
          </button>
        )}
      </div>
      {/* 图片预览 */}
      {canAdd && !isVideo && (
        <img src={mediaUrl} alt="生成结果"
          className="w-full max-h-64 object-contain bg-slate-100 border-t border-slate-100" />
      )}
      {/* 视频预览 */}
      {canAdd && isVideo && (
        <video src={mediaUrl} controls
          className="w-full max-h-64 bg-black border-t border-slate-100"
          style={{ maxHeight: "16rem" }} />
      )}
    </div>
  );
}

function AssistantBubble({ content, isStreaming, error, toolCalls, clarifyOptions, progressMsg, paramForm, isLast, onRetry, onSelectOption, onParamSubmit, onAddToCanvas }) {
  const [hovered, setHovered] = useState(false);
  const thinking = isStreaming && !content && !error && !(toolCalls?.length);
  const showRegenerate = isLast && !isStreaming && !error && (content || toolCalls?.length > 0);
  const showRetry = !isStreaming && !!error;

  return (
    <div
      className="flex items-start gap-2 mb-3 group"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-violet-500 text-[9px] font-bold text-white shadow-sm">
        AI
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        {/* 工具执行卡片 */}
        {toolCalls?.map((tc, i) => <ToolCallCard key={i} tc={tc} onAddToCanvas={onAddToCanvas} />)}
        {/* 进度提示 */}
        {progressMsg && (
          <div className="text-[11px] italic text-slate-400">{progressMsg}</div>
        )}
        {/* 思考中 */}
        {thinking && (
          <div className="flex items-center gap-1 rounded-[12px] rounded-tl-[4px] bg-slate-100 px-3 py-2.5">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:0ms]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:300ms]" />
          </div>
        )}
        {/* 错误 + 重试按钮 */}
        {error && (
          <div className="rounded-[12px] rounded-tl-[4px] bg-rose-50 px-3 py-2 ring-1 ring-rose-200">
            <div className="text-[12px] text-rose-600">{error}</div>
            {showRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="mt-2 flex items-center gap-1.5 rounded-[7px] bg-rose-100 px-2.5 py-1 text-[11px] font-medium text-rose-600 transition hover:bg-rose-200"
              >
                <RefreshCw className="h-3 w-3" />
                重试
              </button>
            )}
          </div>
        )}
        {/* 文字内容 */}
        {content && (
          <div
            className="agent-msg-bubble rounded-[12px] rounded-tl-[4px] bg-slate-50 px-3 py-2 text-[12.5px] leading-[1.6] text-slate-800 ring-1 ring-slate-100"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
          />
        )}
        {/* 参数表单 */}
        {!isStreaming && paramForm && (
          <ParamFormCard event={paramForm} onSubmit={onParamSubmit} />
        )}
        {/* 快捷回复选项 */}
        {!isStreaming && clarifyOptions?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {clarifyOptions.map((opt, i) => (
              <button key={i} type="button"
                onClick={() => onSelectOption?.(opt)}
                className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-0.5 text-[11px] text-cyan-700 transition hover:bg-cyan-100">
                {opt}
              </button>
            ))}
          </div>
        )}
        {isStreaming && content && (
          <span className="ml-1 inline-block h-3 w-0.5 animate-pulse bg-cyan-400 align-middle" />
        )}
        {/* 重新生成按钮（悬停时显示在最后一条完整回复下方） */}
        {showRegenerate && (
          <div className={["flex items-center gap-1 transition-opacity duration-150",
            hovered ? "opacity-100" : "opacity-0"].join(" ")}>
            <button
              type="button"
              onClick={onRetry}
              className="flex items-center gap-1 text-[10px] text-slate-400 transition hover:text-cyan-600"
            >
              <RefreshCw className="h-3 w-3" />
              重新生成
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 历史面板 ──────────────────────────────────────────────────────────────────

function HistoryPanel({ currentSessionId, onRestore, onDelete, onClose }) {
  const [sessions, setSessions] = useState(() => loadSessions());
  useEffect(() => { setSessions(loadSessions()); }, []);

  const handleDelete = useCallback((e, id) => {
    e.stopPropagation();
    deleteSession(id);
    setSessions(p => p.filter(s => s.id !== id));
    if (id === currentSessionId) onDelete(id);
  }, [currentSessionId, onDelete]);

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-white">
      <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-slate-100 px-4">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-slate-400" />
          <span className="text-[13px] font-semibold text-slate-900">历史会话</span>
          {sessions.length > 0 && (
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{sessions.length}</span>
          )}
        </div>
        <button type="button" onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-[8px] text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 pt-16 text-slate-400">
            <MessageSquare className="h-8 w-8 opacity-30" />
            <span className="text-[12px]">暂无历史会话</span>
          </div>
        ) : sessions.map(sess => {
          const isCurrent = sess.id === currentSessionId;
          const first = sess.messages?.find(m => m.role === "user");
          const title = first
            ? String(first.content).slice(0, 48) + (first.content.length > 48 ? "…" : "")
            : "空会话";
          const count = sess.messages?.filter(m => m.role === "user").length ?? 0;
          return (
            <div key={sess.id} role="button" tabIndex={0}
              onClick={() => { onRestore(sess); onClose(); }}
              onKeyDown={e => e.key === "Enter" && (onRestore(sess), onClose())}
              className={[
                "group mx-2 mb-1 flex cursor-pointer items-start gap-3 rounded-[8px] px-3 py-2.5 transition",
                isCurrent ? "bg-cyan-50 ring-1 ring-cyan-200" : "hover:bg-slate-50",
              ].join(" ")}
            >
              <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-violet-500 text-[8px] font-bold text-white">AI</div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-medium text-slate-800">{title}</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-400">
                  <span>{timeAgo(sess.updatedAt)}</span>
                  <span>·</span>
                  <span>{count} 条消息</span>
                  {isCurrent && <span className="rounded-sm bg-cyan-100 px-1 text-[9px] text-cyan-600">当前</span>}
                </div>
              </div>
              <button type="button" onClick={e => handleDelete(e, sess.id)}
                className="ml-1 mt-0.5 hidden h-6 w-6 shrink-0 items-center justify-center rounded-[6px] text-slate-300 transition hover:bg-rose-50 hover:text-rose-400 group-hover:flex"
                title="删除" aria-label="删除会话">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 主组件 ────────────────────────────────────────────────────────────────────

export default function WorkbenchAgentComposer({
  disabled = false,
  availableImageModels = [],
  onAddToCanvas,
  onCanvasAction,
  onCanvasPlanStart,
  getViewportCenter,
}) {
  // 会话
  const [threadId, setThreadId]       = useState(() => generateId("wk"));
  const [messages, setMessages]       = useState([]);
  const [busy, setBusy]               = useState(false);
  const [draft, setDraft]             = useState("");
  // 附件
  const [attachments, setAttachments] = useState([]); // [{id,name,size,file_type,status,data_url?,text_content?,error?}]
  // UI
  const [collapsed, setCollapsed]     = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const activeSessionId    = useRef(generateId("sess"));
  const textareaRef        = useRef(null);
  const scrollRef          = useRef(null);
  const abortRef           = useRef(null);
  const fileInputRef       = useRef(null);

  const hasMessages  = messages.length > 0;
  const hasReady     = attachments.some(a => a.status === "ready");
  const hasUploading = attachments.some(a => a.status === "uploading");
  const canSubmit    = (Boolean(String(draft || "").trim()) || hasReady) && !disabled && !busy && !hasUploading;

  // 自动滚底
  useEffect(() => {
    scrollRef.current?.scrollTop && (scrollRef.current.scrollTop = scrollRef.current.scrollHeight);
  }, [messages]);

  // 持久化
  useEffect(() => {
    if (!messages.length) return;
    const stable = messages.filter(m => !m.isStreaming);
    if (!stable.length) return;
    upsertSession({
      id: activeSessionId.current, threadId,
      messages: stable,
      createdAt: stable[0]?.ts ?? Date.now(),
      updatedAt: Date.now(),
    });
  }, [messages, threadId]);

  // ── 上传附件 ────────────────────────────────────────────────────────────────

  const handleFileChange = useCallback(async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;

    const newAtts = files.map(f => ({
      id: generateId("att"),
      name: f.name,
      size: f.size,
      file_type: guessFileType(f.name, f.type),
      status: "uploading",
    }));
    setAttachments(prev => [...prev, ...newAtts]);

    // 并发上传
    await Promise.all(newAtts.map(async (att, i) => {
      const file = files[i];
      const form = new FormData();
      form.append("file", file);
      try {
        const resp = await fetch(`${API_BASE}/api/gemini-chat/upload`, {
          method: "POST",
          body: form,
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        setAttachments(prev => prev.map(a =>
          a.id !== att.id ? a : {
            ...a,
            status: data.error ? "error" : "ready",
            file_type: data.file_type ?? att.file_type,
            data_url: data.data_url ?? null,
            text_content: data.text_content ?? null,
            error: data.error ?? null,
          }
        ));
      } catch (err) {
        setAttachments(prev => prev.map(a =>
          a.id !== att.id ? a : { ...a, status: "error", error: String(err?.message || "上传失败") }
        ));
      }
    }));
  }, []);

  const removeAttachment = useCallback((id) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  }, []);

  // submitDraft ref（供 handleSelectOption 在闭包外调用）
  const submitDraftRef = useRef(null);

  // ── 发送消息 ─────────────────────────────────────────────────────────────────

  const submitDraft = useCallback(async () => {
    const text = String(draft || "").trim();
    const readyAtts = attachments.filter(a => a.status === "ready");
    if (!text && !readyAtts.length) return;
    if (busy || disabled) return;

    setDraft("");
    setAttachments([]);
    requestAnimationFrame(() => textareaRef.current?.focus());

    const uId = generateId("u");
    const aId = generateId("a");

    setMessages(prev => [
      ...prev,
      { id: uId, role: "user", content: text, attachments: readyAtts, ts: Date.now() },
      { id: aId, role: "assistant", content: "", isStreaming: true, toolCalls: [] },
    ]);
    setBusy(true);

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    // 更新 thread_id（done 事件可能带回新的）
    let nextThreadId = threadId;

    try {
      const resp = await fetch(`${API_BASE}/api/agent/invoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          thread_id: threadId,
          member_authorization: resolveMemberAuthorization().value || "",
          available_image_models: availableImageModels || [],
          canvas_node_hints: (() => { try { const c = getViewportCenter?.(); return c ? { viewport_cx: c.x, viewport_cy: c.y } : {}; } catch { return {}; } })(),
          uploaded_documents: readyAtts.map(a => ({
            file_type: a.file_type,
            name: a.name,
            mime: a.mime ?? "",
            data_url: a.data_url ?? null,
            text_content: a.text_content ?? null,
          })),
        }),
        signal: ctrl.signal,
      });
      if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);

      const reader = resp.body.getReader();
      for await (const event of parseSSE(reader)) {
        switch (event.type) {
          case "token":
            if (event.content) {
              setMessages(prev => prev.map(m =>
                m.id === aId ? { ...m, content: m.content + event.content } : m
              ));
            }
            break;

          case "tool_start":
            // Show a loading chip for the running tool
            setMessages(prev => prev.map(m =>
              m.id === aId ? {
                ...m,
                toolCalls: [...(m.toolCalls || []), {
                  id: event.tool, tool: event.tool, label: event.label, status: "running",
                }],
              } : m
            ));
            break;

          case "tool_result":
            // Mark tool done and store result
            setMessages(prev => prev.map(m =>
              m.id === aId ? {
                ...m,
                toolCalls: (m.toolCalls || []).map(tc =>
                  tc.tool === event.tool ? { ...tc, status: "done", result: event.result } : tc
                ),
              } : m
            ));
            break;

          case "param_form":
            // 参数选择表单
            setMessages(prev => prev.map(m =>
              m.id === aId ? { ...m, paramForm: event } : m
            ));
            break;

          case "clarify":
            // Inject quick-reply options into the message
            if (event.options?.length) {
              setMessages(prev => prev.map(m =>
                m.id === aId ? { ...m, clarifyOptions: event.options } : m
              ));
            }
            break;

          case "canvas_action":
            // 第一个画布动作到来前，先保存撤销点
            if (event.action === "add_node") {
              onCanvasPlanStart?.();
            }
            onCanvasAction?.(event);
            break;

          case "progress":
            setMessages(prev => prev.map(m =>
              m.id === aId ? { ...m, progressMsg: event.message } : m
            ));
            break;

          case "done":
            if (event.thread_id) nextThreadId = event.thread_id;
            break;

          case "error":
            throw new Error(event.content || "未知错误");

          default:
            break;
        }
      }
      setMessages(prev => prev.map(m =>
        m.id === aId ? { ...m, isStreaming: false, progressMsg: null } : m
      ));
      // Persist server-assigned thread_id for multi-turn continuity
      if (nextThreadId !== threadId) setThreadId(nextThreadId);
    } catch (err) {
      if (err.name === "AbortError") return;
      setMessages(prev => prev.map(m =>
        m.id === aId ? { ...m, isStreaming: false, error: String(err?.message || "网络错误") } : m
      ));
    } finally {
      setBusy(false);
    }
  }, [draft, attachments, busy, disabled, threadId]);

  // 同步 ref 以供 handleSelectOption 调用（避免闭包过期）
  useEffect(() => { submitDraftRef.current = submitDraft; }, [submitDraft]);

  // ── 重试 ─────────────────────────────────────────────────────────────────────

  const retryMessage = useCallback((assistantMsgId) => {
    if (busy) return;

    // 找到这条 assistant 消息前面紧邻的那条 user 消息
    setMessages(prev => {
      const idx = prev.findIndex(m => m.id === assistantMsgId);
      if (idx < 0) return prev;
      // 找最近的 user 消息
      let userMsg = null;
      for (let i = idx - 1; i >= 0; i--) {
        if (prev[i].role === "user") { userMsg = prev[i]; break; }
      }
      if (!userMsg) return prev;
      // 删除本条 assistant 消息（保留 user 消息，让用户看到上下文）
      return prev.filter(m => m.id !== assistantMsgId);
    });

    // 找到用户消息并重新发送（使用 setState 回调后的值，需要在下一帧读）
    requestAnimationFrame(() => {
      setMessages(prev => {
        // 找最后一条 user 消息
        const userMsgs = prev.filter(m => m.role === "user");
        const lastUser = userMsgs[userMsgs.length - 1];
        if (!lastUser) return prev;

        const aId = generateId("a");
        const newAssistant = { id: aId, role: "assistant", content: "", isStreaming: true, toolCalls: [] };

        // 开始流式请求
        setBusy(true);
        abortRef.current?.abort();
        const ctrl = new AbortController();
        abortRef.current = ctrl;

        const text = String(lastUser.content || "").trim();
        const docs = (lastUser.attachments || []).filter(a => a.status === "ready");
        let nextThreadId = threadId;

        fetch(`${API_BASE}/api/agent/invoke`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            thread_id: threadId,
            member_authorization: resolveMemberAuthorization().value || "",
          available_image_models: availableImageModels || [],
          canvas_node_hints: (() => { try { const c = getViewportCenter?.(); return c ? { viewport_cx: c.x, viewport_cy: c.y } : {}; } catch { return {}; } })(),
            uploaded_documents: docs.map(a => ({
              file_type: a.file_type, name: a.name, mime: a.mime ?? "",
              data_url: a.data_url ?? null, text_content: a.text_content ?? null,
            })),
          }),
          signal: ctrl.signal,
        }).then(async resp => {
          if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);
          const reader = resp.body.getReader();
          for await (const event of parseSSE(reader)) {
            switch (event.type) {
              case "token":
                if (event.content) setMessages(p => p.map(m => m.id === aId ? { ...m, content: m.content + event.content } : m));
                break;
              case "tool_start":
                setMessages(p => p.map(m => m.id === aId ? { ...m, toolCalls: [...(m.toolCalls||[]), { id: event.tool, tool: event.tool, label: event.label, status: "running" }] } : m));
                break;
              case "tool_result":
                setMessages(p => p.map(m => m.id === aId ? { ...m, toolCalls: (m.toolCalls||[]).map(tc => tc.tool === event.tool ? { ...tc, status: "done", result: event.result } : tc) } : m));
                break;
              case "canvas_action":
                if (event.action === "add_node") onCanvasPlanStart?.();
                onCanvasAction?.(event);
                break;
              case "done":
                if (event.thread_id) nextThreadId = event.thread_id;
                break;
              case "error":
                throw new Error(event.content || "未知错误");
              default: break;
            }
          }
          setMessages(p => p.map(m => m.id === aId ? { ...m, isStreaming: false, progressMsg: null } : m));
          if (nextThreadId !== threadId) setThreadId(nextThreadId);
        }).catch(err => {
          if (err.name === "AbortError") return;
          setMessages(p => p.map(m => m.id === aId ? { ...m, isStreaming: false, error: String(err?.message || "网络错误") } : m));
        }).finally(() => setBusy(false));

        return [...prev, newAssistant];
      });
    });
  }, [busy, threadId]);

  // 快捷回复选项被选中：填入输入框（用户可编辑后再发送，或直接聚焦）
  const handleSelectOption = useCallback((opt) => {
    setDraft(opt);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  // 参数表单"开始生成"提交
  const handleParamSubmit = useCallback(async (tool, prompt, selectedParams) => {
    if (busy) return;

    const aId = generateId("a");
    setMessages(prev => [
      ...prev,
      { id: aId, role: "assistant", content: "", isStreaming: true, toolCalls: [] },
    ]);
    setBusy(true);

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let nextThreadId = threadId;

    try {
      const resp = await fetch(`${API_BASE}/api/agent/invoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: prompt,
          thread_id: threadId,
          force_action: tool,              // e.g. "generate_image"
          initial_tool_args: { ...selectedParams, prompt },
          member_authorization: resolveMemberAuthorization().value || "",
          available_image_models: availableImageModels || [],
          canvas_node_hints: (() => { try { const c = getViewportCenter?.(); return c ? { viewport_cx: c.x, viewport_cy: c.y } : {}; } catch { return {}; } })(),
          uploaded_documents: [],
        }),
        signal: ctrl.signal,
      });
      if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);

      const reader = resp.body.getReader();
      for await (const event of parseSSE(reader)) {
        switch (event.type) {
          case "token":
            if (event.content) setMessages(p => p.map(m => m.id === aId ? { ...m, content: m.content + event.content } : m));
            break;
          case "tool_start":
            setMessages(p => p.map(m => m.id === aId ? { ...m, toolCalls: [...(m.toolCalls||[]), { id: event.tool, tool: event.tool, label: event.label, status: "running" }] } : m));
            break;
          case "tool_result":
            setMessages(p => p.map(m => m.id === aId ? { ...m, toolCalls: (m.toolCalls||[]).map(tc => tc.tool === event.tool ? { ...tc, status: "done", result: event.result } : tc) } : m));
            break;
          case "progress":
            setMessages(p => p.map(m => m.id === aId ? { ...m, progressMsg: event.message } : m));
            break;
          case "done":
            if (event.thread_id) nextThreadId = event.thread_id;
            break;
          case "error":
            throw new Error(event.content || "未知错误");
          default: break;
        }
      }
      setMessages(p => p.map(m => m.id === aId ? { ...m, isStreaming: false, progressMsg: null } : m));
      if (nextThreadId !== threadId) setThreadId(nextThreadId);
    } catch (err) {
      if (err.name === "AbortError") return;
      setMessages(p => p.map(m => m.id === aId ? { ...m, isStreaming: false, error: String(err?.message || "网络错误") } : m));
    } finally {
      setBusy(false);
    }
  }, [busy, threadId]);

  // ── 停止 / 新建 / 恢复 ───────────────────────────────────────────────────────

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages(prev => prev.map(m => m.isStreaming ? { ...m, isStreaming: false } : m));
    setBusy(false);
  }, []);

  const newSession = useCallback(() => {
    stopGeneration();
    activeSessionId.current = generateId("sess");
    setThreadId(generateId("wk"));
    setMessages([]);
    setDraft("");
    setAttachments([]);
    setShowHistory(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [stopGeneration]);

  const restoreSession = useCallback((sess) => {
    stopGeneration();
    activeSessionId.current = sess.id;
    setThreadId(sess.threadId);
    setMessages(sess.messages || []);
    setDraft("");
    setAttachments([]);
  }, [stopGeneration]);

  const handleHistoryDelete = useCallback((id) => {
    if (id === activeSessionId.current) newSession();
  }, [newSession]);

  // ── 折叠态 ────────────────────────────────────────────────────────────────────
  if (collapsed) {
    return (
      <div className="pointer-events-none absolute bottom-0 right-0 top-0 z-[58] flex items-stretch justify-end"
        onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} onWheel={e => e.stopPropagation()}>
        <button type="button" onClick={() => setCollapsed(false)}
          className="pointer-events-auto flex w-9 flex-col items-center justify-center gap-1.5 border-l border-slate-200 bg-white shadow-[-4px_0_16px_rgba(0,0,0,0.04)] transition hover:bg-slate-50"
          title="展开 AI 对话" aria-label="展开 AI 对话">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-violet-500 text-[8px] font-bold text-white shadow-sm">AI</div>
          <ChevronLeft className="h-3.5 w-3.5 text-slate-400" />
          {hasMessages && <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />}
        </button>
      </div>
    );
  }

  // ── 展开态 ────────────────────────────────────────────────────────────────────
  return (
    <div className="pointer-events-none absolute bottom-0 right-0 top-0 z-[58] flex w-[404px] max-w-[calc(100vw-88px)] justify-end"
      onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} onWheel={e => e.stopPropagation()}>
      <div className="pointer-events-auto relative flex h-full w-full flex-col bg-white shadow-[-4px_0_24px_rgba(0,0,0,0.03)]" data-nodrag="true">

        {/* 历史面板 */}
        {showHistory && (
          <HistoryPanel
            currentSessionId={activeSessionId.current}
            onRestore={restoreSession}
            onDelete={handleHistoryDelete}
            onClose={() => setShowHistory(false)}
          />
        )}

        {/* ── 顶栏 ── */}
        <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-slate-100 px-4">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-violet-500 text-[9px] font-bold text-white">AI</div>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold text-slate-900">AI 创作伙伴</div>
              <div className="truncate text-[10px] text-slate-400">
                {busy ? "正在回复…" : hasMessages ? `${messages.filter(m => m.role === "user").length} 条对话` : "准备就绪"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-0.5">
            <button type="button" title="历史会话" onClick={() => setShowHistory(v => !v)}
              className={["flex h-8 w-8 items-center justify-center rounded-[8px] transition",
                showHistory ? "bg-cyan-50 text-cyan-600" : "text-slate-500 hover:bg-slate-100 hover:text-cyan-700"].join(" ")}>
              <Clock className="h-4 w-4" />
            </button>
            <button type="button" title="新建会话" onClick={newSession}
              className="flex h-8 w-8 items-center justify-center rounded-[8px] text-slate-500 transition hover:bg-slate-100 hover:text-cyan-700">
              <Plus className="h-4 w-4" />
            </button>
            <button type="button" title="折叠对话框" onClick={() => setCollapsed(true)}
              className="flex h-8 w-8 items-center justify-center rounded-[8px] text-slate-500 transition hover:bg-slate-100 hover:text-cyan-700">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── 消息区 ── */}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 pb-2 pt-3">
          {!hasMessages ? (
            <>
              <div className="mb-4">
                <div className="text-[15px] font-semibold text-slate-900">你好，我是你的 AI 创作伙伴</div>
                <div className="mt-1 text-[12px] leading-5 text-slate-500">选择灵感卡片，或上传图片/文件开始对话。</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {CARDS.map(card => (
                  <button key={card.title} type="button"
                    className="group overflow-hidden rounded-[8px] bg-white text-left shadow-[0_0_0_1px_rgba(15,23,42,0.07),0_12px_28px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_0_0_1px_rgba(6,182,212,0.18),0_16px_36px_rgba(15,23,42,0.1)]"
                    onClick={() => { setDraft(card.prompt); requestAnimationFrame(() => textareaRef.current?.focus()); }}>
                    <div className="h-[118px] overflow-hidden rounded-t-[8px] bg-slate-100">
                      <img src={card.image} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />
                    </div>
                    <div className="min-h-[56px] bg-white px-3 py-2">
                      <div className="truncate text-[12px] font-semibold text-[#374151]">{card.title}</div>
                      <div className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-slate-500">{card.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col">
              {messages.map((msg, idx) => {
                const isLastMsg = idx === messages.length - 1;
                return msg.role === "user"
                  ? <UserBubble key={msg.id} content={msg.content} attachments={msg.attachments} />
                  : <AssistantBubble
                      key={msg.id}
                      content={msg.content}
                      isStreaming={msg.isStreaming}
                      error={msg.error}
                      toolCalls={msg.toolCalls}
                      clarifyOptions={msg.clarifyOptions}
                      progressMsg={msg.progressMsg}
                      paramForm={msg.paramForm}
                      isLast={isLastMsg}
                      onRetry={() => retryMessage(msg.id)}
                      onSelectOption={handleSelectOption}
                      onParamSubmit={handleParamSubmit}
                      onAddToCanvas={onAddToCanvas}
                    />;
              })}
            </div>
          )}
        </div>

        {/* ── 输入区 ── */}
        <div className="shrink-0 border-t border-slate-100 bg-white px-3 pb-3 pt-2.5">

          {/* 附件 chips */}
          {attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {attachments.map(att => (
                <AttachChip key={att.id} att={att} onRemove={removeAttachment} />
              ))}
            </div>
          )}

          {/* 输入框 + 按钮 */}
          <div className="rounded-[12px] bg-[#F3F4F6] px-3 py-2.5">
            <textarea
              ref={textareaRef}
              rows={4}
              value={draft}
              disabled={disabled}
              placeholder="描述你想创建的画面或流程，或上传图片/文件…"
              className="min-h-[80px] max-h-48 w-full resize-none bg-transparent py-1 text-[13px] leading-[1.6] text-slate-800 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed"
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key !== "Enter" || e.shiftKey || e.nativeEvent?.isComposing) return;
                e.preventDefault();
                submitDraft();
              }}
            />
            {/* 底部工具行 */}
            <div className="mt-1.5 flex items-center justify-between">
              {/* 上传按钮 */}
              <div className="flex items-center gap-0.5">
                <input ref={fileInputRef} type="file" accept={ACCEPT_ALL} multiple hidden onChange={handleFileChange} />
                <button type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={disabled || busy}
                  title="上传图片、视频或文件"
                  className="flex h-7 w-7 items-center justify-center rounded-[7px] text-slate-400 transition hover:bg-white hover:text-cyan-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                {/* 快捷类型按钮 */}
                <button type="button"
                  onClick={() => { if (fileInputRef.current) { fileInputRef.current.accept = ACCEPT_IMAGE; fileInputRef.current.click(); fileInputRef.current.accept = ACCEPT_ALL; } }}
                  disabled={disabled || busy}
                  title="上传图片"
                  className="flex h-7 w-7 items-center justify-center rounded-[7px] text-slate-400 transition hover:bg-white hover:text-cyan-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                </button>
                <button type="button"
                  onClick={() => { if (fileInputRef.current) { fileInputRef.current.accept = ACCEPT_VIDEO; fileInputRef.current.click(); fileInputRef.current.accept = ACCEPT_ALL; } }}
                  disabled={disabled || busy}
                  title="上传视频"
                  className="flex h-7 w-7 items-center justify-center rounded-[7px] text-slate-400 transition hover:bg-white hover:text-cyan-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Film className="h-3.5 w-3.5" />
                </button>
                <button type="button"
                  onClick={() => { if (fileInputRef.current) { fileInputRef.current.accept = ACCEPT_DOC; fileInputRef.current.click(); fileInputRef.current.accept = ACCEPT_ALL; } }}
                  disabled={disabled || busy}
                  title="上传文档（PDF / Word / Excel / PPT）"
                  className="flex h-7 w-7 items-center justify-center rounded-[7px] text-slate-400 transition hover:bg-white hover:text-cyan-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <FileText className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* 发送 / 停止 */}
              <button type="button"
                onClick={busy ? stopGeneration : submitDraft}
                disabled={!busy && !canSubmit}
                className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-cyan-500 text-white shadow-[0_8px_20px_rgba(6,182,212,0.22)] transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                title={busy ? "停止生成" : "发送"} aria-label={busy ? "停止生成" : "发送"}>
                {busy ? <Square className="h-3.5 w-3.5 fill-current" /> : <ArrowUp className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {hasMessages && !busy && (
            <button type="button" onClick={newSession}
              className="mt-1.5 flex items-center gap-1 text-[11px] text-slate-400 transition hover:text-cyan-600">
              <RotateCcw className="h-3 w-3" />
              新建会话
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
