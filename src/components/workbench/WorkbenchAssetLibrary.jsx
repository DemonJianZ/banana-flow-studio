/**
 * WorkbenchAssetLibrary — 用户资产库侧边覆盖面板
 * 从 Workbench.jsx 抽出（原 lines 7333–7997，Phase 3）
 *
 * 纯 JSX 抽取：所有 state 和 callbacks 以 props 透传，
 * nodes.length / connections.length 直接从 canvasStore 读取。
 */
import React from "react";
import {
  X, ChevronRight, Save, FolderOpen, Plus, Trash2,
  Upload, History, ChevronUp, ChevronDown,
  ImagePlus, ImageIcon,
} from "lucide-react";
import { isVideoContent } from "../../lib/mediaType.js";
import { buildSnapshotDigest } from "../../hooks/useAssetLibrary.js";
import { EMPTY_LIST } from "../../constants/workbench.jsx";
import { useCanvasStore } from "../../stores/canvasStore.js";

// ─── Pure utility (was defined at Workbench.jsx:677) ─────────────────────────
const formatAssetLibraryTime = (timestamp) => {
  if (!timestamp) return "--";
  try {
    return new Date(timestamp).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "--";
  }
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function WorkbenchAssetLibrary({
  // visibility
  show,
  onClose,                    // () => { setShowAssetLibrary(false); clearDetail(); }

  // tab
  tab,                        // assetLibraryTab
  setTab,                     // setAssetLibraryTab

  // data
  drafts,                     // assetLibraryDrafts
  works,                      // assetLibraryWorks
  assets,                     // assetLibraryAssets
  personas,                   // assetLibraryPersonas
  versionsByWorkId,           // assetLibraryVersionsByWorkId (Map)
  activeCanvasDraft,

  // detail views
  detailWork,                 // assetLibraryDetailWork
  detailPersona,              // assetLibraryDetailPersona
  detailSnapshot,             // assetLibraryDetailSnapshot
  detailDigest,               // assetLibraryDetailDigest
  detailAssets,               // assetLibraryDetailAssets
  setDetailWorkId,            // setAssetLibraryDetailWorkId
  setDetailPersonaId,         // setAssetLibraryDetailPersonaId

  // title editing
  editingTitleId,             // editingAssetWorkTitleId
  editingTitleDraft,          // editingAssetWorkTitleDraft
  setEditingTitleDraft,       // setEditingAssetWorkTitleDraft
  beginEditTitle,             // beginEditAssetWorkTitle
  cancelEditTitle,            // cancelEditAssetWorkTitle
  commitEditTitle,            // commitEditAssetWorkTitle

  // expanded works
  expandedWorkIds,            // expandedAssetWorkIds (Set)
  setExpandedWorkIds,         // setExpandedAssetWorkIds

  // picker mode
  pickerMode,                 // assetLibraryPickerMode
  setPickerMode,              // setAssetLibraryPickerMode

  // persona image input ref
  personaImageInputRef,       // assetLibraryPersonaImageInputRef

  // callbacks
  onRestoreSnapshot,          // restoreSnapshotToCanvas
  onRestoreAsset,             // restoreAssetToCanvas
  onSave,                     // saveCurrentCanvasAsWork
  onSaveNew,                  // saveCurrentCanvasAsNewWork
  createPersona,              // createAssetLibraryPersona
  updatePersona,              // updateAssetLibraryPersona
  removePersona,              // removeAssetLibraryPersona
  onPersonaReferenceUpload,   // handleAssetLibraryPersonaReferenceUpload
  removeItem,                 // removeAssetLibraryItem
  onAddPersonaToCanvas,       // createPersonaInputNodeAt
}) {
  const nodeCount = useCanvasStore((s) => s.nodes.length);
  const connectionCount = useCanvasStore((s) => s.connections.length);
  const hasContent = nodeCount > 0 || connectionCount > 0;

  if (!show) return null;

  const clearDetail = () => {
    setDetailWorkId("");
    setDetailPersonaId("");
  };

  const handleClose = () => {
    onClose();
    clearDetail();
    setPickerMode(false);
  };

  return (
    <div
      className="fixed inset-0 z-[88] bg-[rgba(15,23,42,0.14)] backdrop-blur-[2px]"
      onMouseDown={handleClose}
    >
      <div
        className="absolute right-4 top-24 bottom-4 z-[89] flex w-[420px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_28px_60px_rgba(15,23,42,0.16)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.8)_46%,rgba(255,255,255,0.7))]" />

        {/* Header */}
        <div className="relative flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <div className="text-[15px] font-semibold text-slate-800">用户资产库</div>
            <div className="mt-1 text-[12px] leading-5 text-slate-500">
              {detailPersona
                ? "编辑人物设定、参考图、音色描述和关系网络，用于后续创作复用。"
                : detailWork
                ? "查看作品封面、摘要与素材，并继续创作。"
                : "自动保存当前草稿，手动沉淀作品，并随时恢复到画布继续创作。"}
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900"
            aria-label="关闭资产库"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab bar */}
        <div className="relative flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50/80 px-5 py-3">
          {(detailWork || detailPersona) ? (
            <button
              type="button"
              onClick={clearDetail}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
            >
              <ChevronRight className="h-3.5 w-3.5 rotate-180" />
              返回列表
            </button>
          ) : null}
          {(["works", "personas", "drafts", "assets"]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => { setTab(t); clearDetail(); }}
              className={`rounded-full px-3 py-1.5 text-[11px] transition-colors ${
                tab === t
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
              }`}
            >
              {t === "works" ? `作品 ${works.length}`
               : t === "personas" ? `人物 ${personas.length}`
               : t === "drafts" ? `草稿 ${drafts.length}`
               : `素材 ${assets.length}`}
            </button>
          ))}
          <div className="group relative ml-auto">
            <button
              type="button"
              onClick={onSave}
              disabled={!hasContent}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[10px] transition-colors ${
                !hasContent
                  ? "cursor-not-allowed border border-slate-200 bg-white text-slate-300"
                  : "border border-cyan-200 bg-cyan-50 text-cyan-700 hover:bg-cyan-100 hover:text-cyan-800"
              }`}
            >
              <Save className="h-3.5 w-3.5" />
              保存作品
            </button>
            {hasContent && (
              <button
                type="button"
                className="pointer-events-none absolute right-0 top-[calc(100%-1px)] z-20 w-max rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] text-slate-600 opacity-0 shadow-[0_16px_32px_rgba(15,23,42,0.12)] transition-all hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-700 group-hover:pointer-events-auto group-hover:opacity-100"
                onClick={onSaveNew}
              >
                另存作品
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="relative min-h-0 flex-1 overflow-y-auto bg-slate-50/70 p-4 custom-scrollbar">
          {/* ── Persona detail ── */}
          {detailPersona ? (
            <div className="space-y-4">
              <input
                ref={personaImageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void onPersonaReferenceUpload(e)}
              />
              <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_22px_44px_rgba(15,23,42,0.08)]">
                <div className="p-5">
                  <button
                    type="button"
                    onClick={() => personaImageInputRef.current?.click()}
                    className="group flex h-48 w-full items-center justify-center overflow-hidden rounded-[24px] border border-dashed border-slate-200 bg-slate-100 transition-colors hover:border-cyan-200 hover:bg-cyan-50/60"
                  >
                    {detailPersona.referenceImage ? (
                      <img src={detailPersona.referenceImage} alt={detailPersona.name || "人物参考图"}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-slate-400">
                        <ImagePlus className="h-7 w-7" />
                        <span className="text-[12px]">上传人物参考图</span>
                      </div>
                    )}
                  </button>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => personaImageInputRef.current?.click()}
                      className="inline-flex items-center justify-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-[11px] font-medium text-white transition-colors hover:bg-slate-800"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      {detailPersona.referenceImage ? "更换参考图" : "上传参考图"}
                    </button>
                    {detailPersona.referenceImage ? (
                      <button
                        type="button"
                        onClick={() => updatePersona(detailPersona.id, { referenceImage: "" })}
                        className="inline-flex items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-[11px] text-slate-500 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        移除参考图
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="space-y-4 rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                {[
                  { key: "name", label: "形象名称", placeholder: "例如：冷感银发女主", type: "input", rows: undefined },
                  { key: "description", label: "人物设定", placeholder: "描述人物背景、性格、外貌、气质、服装、常用场景等。", type: "textarea", rows: 5 },
                  { key: "voiceDescription", label: "音色描述", placeholder: "描述声音年龄感、语速、情绪、口音或旁白风格。", type: "textarea", rows: 4 },
                  { key: "relationshipNetwork", label: "关系网络", placeholder: "记录与其他人物、品牌、组织或故事线的关系，例如：导师、竞争者、搭档、家人。", type: "textarea", rows: 5 },
                ].map(({ key, label, placeholder, type, rows }) => (
                  <label key={key} className="block">
                    <span className="text-[11px] font-semibold text-slate-500">{label}</span>
                    {type === "input" ? (
                      <input
                        type="text"
                        value={detailPersona[key] || ""}
                        onChange={(e) => updatePersona(detailPersona.id, { [key]: e.target.value })}
                        placeholder={placeholder}
                        className="mt-2 w-full rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-2.5 text-[14px] font-semibold text-slate-900 outline-none transition-colors focus:border-cyan-200 focus:bg-white focus:ring-2 focus:ring-cyan-100"
                      />
                    ) : (
                      <textarea
                        value={detailPersona[key] || ""}
                        onChange={(e) => updatePersona(detailPersona.id, { [key]: e.target.value })}
                        placeholder={placeholder}
                        rows={rows}
                        className="mt-2 w-full resize-none rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-2.5 text-[12px] leading-6 text-slate-700 outline-none transition-colors focus:border-cyan-200 focus:bg-white focus:ring-2 focus:ring-cyan-100"
                      />
                    )}
                  </label>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!window.confirm("确认删除这个人物形象吗？")) return;
                  removePersona(detailPersona.id);
                }}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-[12px] text-slate-500 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
              >
                <Trash2 className="h-4 w-4" />
                删除人物形象
              </button>
            </div>

          /* ── Work detail ── */
          ) : detailWork ? (
            <div className="space-y-6">
              <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_22px_44px_rgba(15,23,42,0.08)]">
                <div className="flex gap-5 p-5">
                  <div className="flex h-36 w-36 shrink-0 items-center justify-center overflow-hidden rounded-[22px] border border-slate-200 bg-slate-100 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
                    {detailWork.coverUrl ? (
                      isVideoContent(detailWork.coverUrl) ? (
                        <video src={detailWork.coverUrl} className="h-full w-full object-cover" muted loop playsInline />
                      ) : (
                        <img src={detailWork.coverUrl} alt={detailWork.title} className="h-full w-full object-cover" />
                      )
                    ) : (
                      <FolderOpen className="h-6 w-6 text-slate-400" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[22px] font-semibold tracking-[-0.02em] text-slate-950">
                      {detailWork.title || "未命名作品"}
                    </div>
                    <div className="mt-3 text-[12px] leading-6 text-slate-500">
                      {detailWork.summary || detailDigest?.summary || "暂无摘要"}
                    </div>
                    <div className="mt-5 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => onRestoreSnapshot(detailSnapshot, "已恢复作品到画布")}
                        className="inline-flex min-w-[112px] items-center justify-center gap-1.5 rounded-full bg-slate-900 px-5 py-2 text-[11px] font-medium text-white transition-colors hover:bg-slate-800"
                      >
                        <FolderOpen className="h-3.5 w-3.5" />
                        继续创作
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!window.confirm("确认删除这份作品吗？")) return;
                          removeItem("works", detailWork.id);
                          setDetailWorkId("");
                        }}
                        className="inline-flex min-w-[112px] items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-5 py-2 text-[11px] text-slate-500 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        删除作品
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                <div className="border-b border-slate-200 px-4 py-3">
                  <div className="text-[13px] font-semibold text-slate-800">关联素材</div>
                  <div className="mt-1 text-[11px] text-slate-500">从这个作品沉淀出来的图片和视频，可随时放回画布复用。</div>
                </div>
                <div className="grid grid-cols-2 gap-3 p-3">
                  {detailAssets.length === 0 ? (
                    <div className="col-span-2 rounded-[18px] border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-[11px] text-slate-500">
                      这份作品还没有沉淀出独立素材。
                    </div>
                  ) : null}
                  {detailAssets.map((item) => (
                    <div key={item.id} className="group overflow-hidden rounded-[18px] border border-slate-200 bg-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_28px_rgba(15,23,42,0.08)]">
                      <div className="flex h-32 items-center justify-center overflow-hidden bg-slate-100">
                        {item.url ? (
                          item.kind === "video" ? (
                            <video src={item.url} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" muted loop playsInline />
                          ) : (
                            <img src={item.url} alt={item.title || "素材"} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                          )
                        ) : (
                          <FolderOpen className="h-5 w-5 text-slate-400" />
                        )}
                      </div>
                      <div className="space-y-2 p-3">
                        <div className="truncate text-[11px] font-medium text-slate-800">
                          {item.title || (item.kind === "video" ? "视频素材" : "图片素材")}
                        </div>
                        <div className="text-[10px] leading-5 text-slate-400">
                          {item.nodeTitle || "来自画布节点"} · {item.kind === "video" ? "视频" : "图片"}
                        </div>
                        <button
                          type="button"
                          onClick={() => onRestoreAsset(item)}
                          className="inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
                        >
                          <FolderOpen className="h-3 w-3" />
                          {pickerMode ? "选择素材" : "放回画布"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          /* ── Drafts tab ── */
          ) : tab === "drafts" ? (
            <div className="space-y-3">
              {activeCanvasDraft ? (
                <div className="rounded-[20px] border border-cyan-200 bg-cyan-50 px-4 py-3 text-[12px] text-cyan-700">
                  当前画布草稿已自动保存：{formatAssetLibraryTime(activeCanvasDraft.updatedAt)}
                </div>
              ) : null}
              {drafts.length === 0 ? (
                <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-[12px] text-slate-500">
                  还没有草稿。开始拖素材、搭工作流后会自动出现在这里。
                </div>
              ) : null}
              {drafts.map((item) => {
                const digest = buildSnapshotDigest(item.snapshot);
                const imageCount = digest.mediaItems.filter((m) => m.kind === "image").length;
                const videoCount = digest.mediaItems.filter((m) => m.kind === "video").length;
                return (
                  <div
                    key={item.id}
                    className="cursor-pointer overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.05)] transition-all hover:border-slate-300 hover:shadow-[0_16px_32px_rgba(15,23,42,0.08)]"
                    onClick={() => setDetailWorkId(item.id)}
                  >
                    <div className="flex gap-3 p-3">
                      <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[18px] border border-slate-200 bg-slate-100">
                        {item.coverUrl ? (
                          isVideoContent(item.coverUrl) ? (
                            <video src={item.coverUrl} className="h-full w-full object-cover" muted loop playsInline />
                          ) : (
                            <img src={item.coverUrl} alt={item.title} className="h-full w-full object-cover" />
                          )
                        ) : <FolderOpen className="h-5 w-5 text-slate-400" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] font-semibold tracking-[-0.01em] text-slate-950">{item.title || "未命名草稿"}</div>
                        <div className="mt-1 text-[11px] leading-5 text-slate-500">{item.summary || digest.summary}</div>
                        <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-slate-400">
                          <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5">{formatAssetLibraryTime(item.updatedAt)}</span>
                          <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5">{item.nodeCount || digest.nodeCount} 节点</span>
                          {imageCount > 0 ? <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5">{imageCount} 图</span> : null}
                          {videoCount > 0 ? <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5">{videoCount} 视频</span> : null}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 border-t border-slate-200 px-3 py-2.5">
                      <button type="button"
                        onClick={(e) => { e.stopPropagation(); onRestoreSnapshot(item.snapshot, "已恢复草稿到画布"); }}
                        className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3.5 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-slate-800">
                        <FolderOpen className="h-3.5 w-3.5" />恢复到画布
                      </button>
                      <button type="button"
                        onClick={(e) => { e.stopPropagation(); if (!window.confirm("确认删除这份草稿吗？")) return; removeItem("drafts", item.id); }}
                        className="inline-flex items-center gap-1.5 rounded-full px-1 py-1.5 text-[11px] text-slate-500 transition-colors hover:text-rose-600">
                        <Trash2 className="h-3.5 w-3.5" />删除
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

          /* ── Personas tab ── */
          ) : tab === "personas" ? (
            <div className="space-y-3">
              <button type="button" onClick={createPersona}
                className="inline-flex w-full items-center justify-center gap-2 rounded-[20px] border border-cyan-200 bg-cyan-50 px-4 py-3 text-[12px] font-medium text-cyan-700 transition-colors hover:bg-cyan-100 hover:text-cyan-800">
                <Plus className="h-4 w-4" />新建人物形象
              </button>
              {personas.length === 0 ? (
                <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-[12px] text-slate-500">
                  还没有人物形象。新建后可维护名称、介绍、参考图、音色描述和关系网络。
                </div>
              ) : null}
              {personas.map((item) => (
                <div key={item.id}
                  onClick={() => { setDetailWorkId(""); setDetailPersonaId(item.id); }}
                  className="flex w-full cursor-pointer gap-3 overflow-hidden rounded-[24px] border border-slate-200 bg-white p-3 text-left shadow-[0_10px_24px_rgba(15,23,42,0.05)] transition-all hover:border-slate-300 hover:shadow-[0_16px_32px_rgba(15,23,42,0.08)]"
                  role="button" tabIndex={0}
                  onKeyDown={(e) => { if (e.key !== "Enter" && e.key !== " ") return; e.preventDefault(); setDetailWorkId(""); setDetailPersonaId(item.id); }}
                >
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[18px] border border-slate-200 bg-slate-100">
                    {item.referenceImage
                      ? <img src={item.referenceImage} alt={item.name || "人物参考图"} className="h-full w-full object-cover" />
                      : <ImageIcon className="h-5 w-5 text-slate-400" />}
                  </div>
                  <div className="min-w-0 flex-1 py-0.5">
                    <div className="truncate text-[15px] font-semibold tracking-[-0.01em] text-slate-950">{item.name || "未命名人物"}</div>
                    <div className="mt-1 line-clamp-2 text-[11px] leading-5 text-slate-500">{item.description || "暂无人物介绍"}</div>
                    <button type="button"
                      onClick={(e) => { e.stopPropagation(); onAddPersonaToCanvas(item); }}
                      className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-[11px] font-medium text-cyan-700 transition-colors hover:bg-cyan-100 hover:text-cyan-800">
                      <Plus className="h-3.5 w-3.5" />添加并结构化
                    </button>
                  </div>
                </div>
              ))}
            </div>

          /* ── Works tab ── */
          ) : tab === "works" ? (
            <div className="space-y-3">
              {works.length === 0 ? (
                <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-[12px] text-slate-500">
                  还没有保存作品。先把当前画布保存为作品，后续就能反复复现和继续编辑。
                </div>
              ) : null}
              {works.map((item) => {
                const versions = versionsByWorkId.get(item.id) || EMPTY_LIST;
                const latestVersion = versions[0] || null;
                const latestSnapshot = latestVersion?.snapshot || item.snapshot;
                const digest = buildSnapshotDigest(latestSnapshot);
                const isExpanded = expandedWorkIds.has(item.id);
                return (
                  <div key={item.id}
                    className="cursor-pointer overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.05)] transition-all hover:border-slate-300 hover:shadow-[0_16px_32px_rgba(15,23,42,0.08)]"
                    onClick={() => setDetailWorkId(item.id)}
                  >
                    <div className="flex gap-3 p-3">
                      <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[18px] border border-slate-200 bg-slate-100">
                        {item.coverUrl ? (
                          isVideoContent(item.coverUrl) ? (
                            <video src={item.coverUrl} className="h-full w-full object-cover" muted loop playsInline />
                          ) : (
                            <img src={item.coverUrl} alt={item.title} className="h-full w-full object-cover" />
                          )
                        ) : <FolderOpen className="h-5 w-5 text-slate-400" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        {editingTitleId === item.id ? (
                          <input type="text" value={editingTitleDraft} autoFocus
                            className="block w-full rounded-[10px] border border-cyan-200 bg-cyan-50/70 px-2 py-1 text-[15px] font-semibold tracking-[-0.01em] text-slate-950 outline-none ring-2 ring-cyan-100"
                            onChange={(e) => setEditingTitleDraft(e.target.value)}
                            onBlur={(e) => { if (e.currentTarget.dataset.cancelled === "true") return; commitEditTitle(item.id); }}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { e.preventDefault(); commitEditTitle(item.id); }
                              if (e.key === "Escape") { e.preventDefault(); e.currentTarget.dataset.cancelled = "true"; cancelEditTitle(); }
                            }}
                          />
                        ) : (
                          <button type="button"
                            onClick={(e) => { e.stopPropagation(); beginEditTitle(item); }}
                            className="block max-w-full truncate rounded-[10px] px-1 py-0.5 text-left text-[15px] font-semibold tracking-[-0.01em] text-slate-950 transition-colors hover:bg-cyan-50 hover:text-cyan-700"
                            title="点击编辑标题">
                            {item.title || "未命名作品"}
                          </button>
                        )}
                        <div className="mt-1 text-[11px] leading-5 text-slate-500">{item.summary || digest.summary}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 border-t border-slate-200 px-3 py-2.5">
                      <button type="button"
                        onClick={(e) => { e.stopPropagation(); onRestoreSnapshot(latestSnapshot, "已恢复作品到画布"); }}
                        className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3.5 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-slate-800">
                        <FolderOpen className="h-3.5 w-3.5" />继续创作
                      </button>
                      <button type="button"
                        onClick={(e) => { e.stopPropagation(); setExpandedWorkIds((p) => { const n = new Set(p); n.has(item.id) ? n.delete(item.id) : n.add(item.id); return n; }); }}
                        className="inline-flex items-center gap-1.5 rounded-full px-1 py-1.5 text-[11px] text-slate-500 transition-colors hover:text-slate-700">
                        <History className="h-3.5 w-3.5" />版本 {versions.length || 1}
                        {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </button>
                      <button type="button"
                        onClick={(e) => { e.stopPropagation(); if (!window.confirm("确认删除这份作品吗？")) return; removeItem("works", item.id); }}
                        className="inline-flex items-center gap-1.5 rounded-full px-1 py-1.5 text-[11px] text-slate-500 transition-colors hover:text-rose-600">
                        <Trash2 className="h-3.5 w-3.5" />删除
                      </button>
                    </div>
                    {isExpanded ? (
                      <div className="border-t border-slate-200 bg-slate-50/80 px-3 py-3">
                        <div className="mb-2 text-[11px] font-medium text-slate-600">版本历史</div>
                        <div className="space-y-2">
                          {versions.map((version) => (
                            <div key={version.id} className="flex items-center gap-2 rounded-[18px] border border-slate-200 bg-white px-3 py-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 text-[11px] text-slate-700">
                                  <span className="font-medium">版本 {version.versionIndex || 1}</span>
                                  <span className="text-slate-400">{formatAssetLibraryTime(version.createdAt)}</span>
                                </div>
                                <div className="mt-1 truncate text-[10px] text-slate-400">
                                  {version.summary || buildSnapshotDigest(version.snapshot).summary}
                                </div>
                              </div>
                              <button type="button"
                                onClick={(e) => { e.stopPropagation(); onRestoreSnapshot(version.snapshot, `已恢复版本 ${version.versionIndex || 1} 到画布`); }}
                                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700">
                                恢复
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

          /* ── Assets tab ── */
          ) : (
            <div className="space-y-3">
              {assets.length === 0 ? (
                <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-[12px] text-slate-500">
                  还没有沉淀素材。上传图片/视频或保存作品后，这里的素材会持续累积。
                </div>
              ) : null}
              {assets.map((item) => (
                <div key={item.id} className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                  <div className="flex gap-3 p-3">
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[18px] border border-slate-200 bg-slate-100">
                      {item.url ? (
                        item.kind === "video"
                          ? <video src={item.url} className="h-full w-full object-cover" muted loop playsInline />
                          : <img src={item.url} alt={item.title || "素材"} className="h-full w-full object-cover" />
                      ) : <FolderOpen className="h-5 w-5 text-slate-400" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-semibold tracking-[-0.01em] text-slate-950">
                        {item.title || (item.kind === "video" ? "视频素材" : "图片素材")}
                      </div>
                      <div className="mt-1 text-[11px] leading-5 text-slate-400">
                        {item.nodeTitle || "来自画布节点"} · {item.kind === "video" ? "视频" : "图片"} · {item.sourceKind === "work_version" ? "作品版本" : "草稿"}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-slate-400">
                        <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5">{formatAssetLibraryTime(item.updatedAt || item.createdAt)}</span>
                        <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5">已复用 {item.usageCount || 1} 次</span>
                        {item.workId ? <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5">关联作品</span> : null}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 border-t border-slate-200 px-3 py-2.5">
                    <button type="button" onClick={() => onRestoreAsset(item)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3.5 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-slate-800">
                      <FolderOpen className="h-3.5 w-3.5" />
                      {pickerMode ? "选择素材" : "放回画布"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
