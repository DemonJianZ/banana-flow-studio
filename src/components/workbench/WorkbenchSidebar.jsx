/**
 * WorkbenchSidebar — 左侧浮动工具栏 + 所有 hover 子菜单
 * 从 Workbench.jsx 抽出（Phase 4）:
 *   • JSX lines 7449–8074 (侧边栏本体 + 5 个子菜单)
 *   • renderSidebarContent() 函数（lines 6643–6830）整体内联
 *
 * undo/redo/canUndo/canRedo 直接从 canvasStore 读取，无需透传。
 */
import React from "react";
import {
  Upload, FolderOpen, Plus, Download, Film, Layers,
  ImagePlus, Clapperboard, Palette, Sparkles, Images,
  Undo, Redo, Clipboard,
} from "lucide-react";
// lucide-react v0.554+: ImageIcon
import { ImageIcon } from "lucide-react";
import { useCanvasStore } from "../../stores/canvasStore.js";
import SidebarBtn from "./SidebarBtn";
import {
  AI_CHAT_PART_ENUM_203,
  AI_CHAT_PART_ENUM_209,
  AI_CHAT_PART_ENUM_210,
  AI_CHAT_PART_ENUM_211,
} from "../../api/aiChat";
import { formatMemberPoints } from "../../hooks/useMemberInfo";
import { NODE_TYPES } from "../../constants/workbench.jsx";

export default function WorkbenchSidebar({
  // ── useSidebar() state ───────────────────────────────────────────────────
  hoveredSidebarPreview, setHoveredSidebarPreview,
  setHoveredSidebarItemKey,
  sidebarNodeInputMenu, setSidebarNodeInputMenu,
  sidebarWorkflowMenu, setSidebarWorkflowMenu,
  sidebarImageCreateMenu, setSidebarImageCreateMenu,
  activeSidebarItemKey, setActiveSidebarItemKey,
  showSidebarUploadMenu, setShowSidebarUploadMenu,
  sidebarVideoCreateMenu, setSidebarVideoCreateMenu,
  // refs from useSidebar
  sidebarUploadMenuRef,
  sidebarUploadMenuCloseTimerRef,
  sidebarNodeInputMenuCloseTimerRef,
  sidebarImageCreateMenuCloseTimerRef,
  sidebarVideoCreateMenuCloseTimerRef,
  sidebarWorkflowMenuCloseTimerRef,

  // ── Upload refs (from useAgentChat) ──────────────────────────────────────
  sidebarImageUploadInputRef,
  sidebarVideoUploadInputRef,

  // ── Layout ───────────────────────────────────────────────────────────────
  leftSidebarWidth,
  workspaceShellRef,    // for hover card positioning

  // ── Member info (from useMemberInfo) ─────────────────────────────────────
  memberLabel,
  memberAvatar,
  memberPoint,
  memberTotalPoint,
  memberInfoLoginUrl,
  userAuthsLoading,
  isAdminUser,
  navigateToMemberLogin,

  // ── Asset library setters ────────────────────────────────────────────────
  setShowAssetLibrary,
  setAssetLibraryPickerMode,
  setAssetLibraryTab,
  setAssetLibraryDetailWorkId,

  // ── Routing ──────────────────────────────────────────────────────────────
  navigate,
  defaultVideoModelId,

  // ── Action callbacks ─────────────────────────────────────────────────────
  onAddNode,              // addNode(nodeType, modePreset?)
  onNavigate,             // handleAnchorActionClick(anchor)
  safeInvoke,
  createText2ImgTemplate,
  createImg2ImgTemplate,
  createMultiImg2ImgTemplate,
  createImg2VideoTemplate,
  createText2VideoTemplate,
  createOmniReferenceVideoTemplate,
}) {
  // ── undo/redo 直接从 store 读（Phase 2 迁移后 store 持有历史）───────────────
  const undo = useCanvasStore((s) => s.undo);
  const redo = useCanvasStore((s) => s.redo);
  const canUndo = useCanvasStore((s) => s._historyStep > 0);
  const canRedo = useCanvasStore((s) => s._historyStep < s._history.length - 1);

  // ── renderSidebarContent (inlined from Workbench.jsx:6643) ────────────────
  const renderSidebarContent = () => {
    const sections = [
      {
        key: "nodes",
        title: "节点",
        items: [
          {
            id: "node_input",
            icon: Plus,
            label: "输入",
            desc: "提示词 / 故事板 / 图像创作 / 视频创作",
            color: "text-yellow-400",
            bg: "bg-yellow-500/10",
            onClick: () => {},
          },
          {
            id: "node_output",
            icon: Download,
            label: "结果输出",
            desc: "预览与下载",
            color: "text-green-400",
            bg: "bg-green-500/10",
            onClick: () => onAddNode(NODE_TYPES.OUTPUT),
          },
        ],
      },
      {
        key: "skills",
        title: "技能",
        items: [],
      },
      {
        key: "workflows",
        title: "工作流",
        items: [
          {
            id: "node_image_generate",
            icon: ImagePlus,
            label: "图片工作流",
            desc: "文生图 / 图生图 / 全景浏览",
            color: "text-purple-400",
            bg: "bg-purple-500/10",
            onClick: () => {},
          },
          {
            id: "node_video_generate",
            icon: Film,
            label: "视频工作流",
            desc: "文生视频 / 图生视频 / 首尾帧 / 全能参考",
            color: "text-rose-400",
            bg: "bg-rose-500/10",
            onClick: () => {},
          },
          {
            id: "workflow_bundle",
            icon: Layers,
            label: "工作流组件",
            desc: "三合一换图 / 批量动图 / 批量花字",
            color: "text-purple-300",
            bg: "bg-purple-500/10",
            onClick: () => {},
          },
        ],
      },
    ];

    const visibleItems = sections.flatMap((section) =>
      section.items.map((item) => ({ ...item, sectionTitle: section.title })),
    );

    const isMenuTrigger = (id) =>
      id === "node_input" || id === "node_image_generate" ||
      id === "node_video_generate" || id === "workflow_bundle";

    return (
      <>
        <div className="flex flex-col items-center gap-1.5">
          {visibleItems.map((item) => (
            <SidebarBtn
              key={item.id}
              icon={item.icon}
              itemId={item.id}
              label={item.label}
              desc={item.desc}
              color={item.color}
              bg={item.bg}
              active={activeSidebarItemKey === item.id}
              compact
              category={item.sectionTitle}
              primary={false}
              menuTrigger={isMenuTrigger(item.id)}
              onHoverChange={(isHovering, target) => {
                setHoveredSidebarItemKey(isHovering ? item.id : "");
                if (isHovering && target && workspaceShellRef.current) {
                  const itemRect = target.getBoundingClientRect();
                  const shellRect = workspaceShellRef.current.getBoundingClientRect();
                  const top = itemRect.top - shellRect.top + itemRect.height / 2;

                  if (item.id === "node_input") {
                    if (sidebarNodeInputMenuCloseTimerRef.current) {
                      window.clearTimeout(sidebarNodeInputMenuCloseTimerRef.current);
                      sidebarNodeInputMenuCloseTimerRef.current = null;
                    }
                    setSidebarNodeInputMenu({ top });
                  }
                  if (item.id === "node_image_generate") {
                    if (sidebarImageCreateMenuCloseTimerRef.current) {
                      window.clearTimeout(sidebarImageCreateMenuCloseTimerRef.current);
                      sidebarImageCreateMenuCloseTimerRef.current = null;
                    }
                    setSidebarImageCreateMenu({ top });
                  }
                  if (item.id === "node_video_generate") {
                    if (sidebarVideoCreateMenuCloseTimerRef.current) {
                      window.clearTimeout(sidebarVideoCreateMenuCloseTimerRef.current);
                      sidebarVideoCreateMenuCloseTimerRef.current = null;
                    }
                    setSidebarVideoCreateMenu({ top });
                  }
                  if (item.id === "workflow_bundle") {
                    if (sidebarWorkflowMenuCloseTimerRef.current) {
                      window.clearTimeout(sidebarWorkflowMenuCloseTimerRef.current);
                      sidebarWorkflowMenuCloseTimerRef.current = null;
                    }
                    setSidebarWorkflowMenu({ top });
                  }
                  setHoveredSidebarPreview({
                    ...item,
                    active: activeSidebarItemKey === item.id,
                    top,
                  });
                  return;
                }
                // on leave
                const clearMenu = (timerRef, setter) => {
                  if (timerRef.current) window.clearTimeout(timerRef.current);
                  timerRef.current = window.setTimeout(() => {
                    setter(null);
                    timerRef.current = null;
                  }, 140);
                };
                if (item.id === "node_input") clearMenu(sidebarNodeInputMenuCloseTimerRef, setSidebarNodeInputMenu);
                if (item.id === "node_image_generate") clearMenu(sidebarImageCreateMenuCloseTimerRef, setSidebarImageCreateMenu);
                if (item.id === "node_video_generate") clearMenu(sidebarVideoCreateMenuCloseTimerRef, setSidebarVideoCreateMenu);
                if (item.id === "workflow_bundle") clearMenu(sidebarWorkflowMenuCloseTimerRef, setSidebarWorkflowMenu);
                setHoveredSidebarPreview(null);
              }}
              onClick={(event) => {
                setActiveSidebarItemKey(item.id);
                if (isMenuTrigger(item.id)) return;
                safeInvoke(() => item.onClick?.(event), item.label || "侧栏操作");
              }}
            />
          ))}
        </div>
      </>
    );
  };

  // ── Hover menu helpers ────────────────────────────────────────────────────
  const clearHoverMenuTimer = (timerRef) => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const scheduleHoverMenuClose = (timerRef, setter) => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setter(null);
      timerRef.current = null;
    }, 140);
  };

  return (
    <>
      {/* ── Main sidebar strip ─────────────────────────────────────────────── */}
      <div className="absolute left-4 top-1/2 z-40 flex -translate-y-1/2 shrink-0 flex-col items-center gap-2">

        {/* Upload button */}
        <div
          ref={sidebarUploadMenuRef}
          className="relative shrink-0"
          style={{ width: leftSidebarWidth }}
          onMouseEnter={() => {
            if (sidebarUploadMenuCloseTimerRef.current) {
              window.clearTimeout(sidebarUploadMenuCloseTimerRef.current);
              sidebarUploadMenuCloseTimerRef.current = null;
            }
            setActiveSidebarItemKey("node_upload");
            setShowSidebarUploadMenu(true);
          }}
          onMouseLeave={() => {
            if (sidebarUploadMenuCloseTimerRef.current) window.clearTimeout(sidebarUploadMenuCloseTimerRef.current);
            sidebarUploadMenuCloseTimerRef.current = window.setTimeout(() => {
              setShowSidebarUploadMenu(false);
              sidebarUploadMenuCloseTimerRef.current = null;
            }, 140);
          }}
        >
          <div className="mx-auto flex w-full rounded-[32px] border border-[#E5E7EB] bg-[rgba(255,255,255,0.96)] p-1.5 shadow-[0_4px_16px_rgba(0,0,0,0.06)] backdrop-blur-xl">
            <button
              type="button"
              onClick={() => {}}
              className="animate-bf-breathe flex h-11 w-full scale-[1.05] items-center justify-center rounded-[24px] border border-[#B9E975] bg-[linear-gradient(135deg,#A7E163_0%,#8FD14F_100%)] text-[#1F2937] transition-all duration-200 ease-in-out hover:scale-[1.075] hover:brightness-[1.02]"
              style={{ boxShadow: "0 0 0 4px rgba(163,230,53,0.15), 0 8px 20px rgba(0,0,0,0.12)" }}
              title="图片/视频上传"
              aria-label="图片/视频上传"
            >
              <Upload className="h-[18px] w-[18px]" strokeWidth={2.2} />
            </button>
          </div>
          {showSidebarUploadMenu ? (
            <div
              className="absolute left-[calc(100%+14px)] top-1/2 z-[58] w-48 -translate-y-1/2 rounded-[24px] border border-slate-200 bg-[rgba(255,255,255,0.98)] p-2 shadow-[0_20px_44px_rgba(15,23,42,0.12)] backdrop-blur-xl"
              onMouseEnter={() => {
                if (sidebarUploadMenuCloseTimerRef.current) { window.clearTimeout(sidebarUploadMenuCloseTimerRef.current); sidebarUploadMenuCloseTimerRef.current = null; }
                setShowSidebarUploadMenu(true);
              }}
              onMouseLeave={() => {
                if (sidebarUploadMenuCloseTimerRef.current) window.clearTimeout(sidebarUploadMenuCloseTimerRef.current);
                sidebarUploadMenuCloseTimerRef.current = window.setTimeout(() => { setShowSidebarUploadMenu(false); sidebarUploadMenuCloseTimerRef.current = null; }, 140);
              }}
            >
              <button type="button"
                className="flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left text-[12px] text-slate-700 transition-colors hover:bg-slate-50"
                onClick={() => { setShowSidebarUploadMenu(false); sidebarImageUploadInputRef.current?.click(); }}>
                <ImageIcon className="h-4 w-4 text-slate-500" />
                <span>上传图片</span>
              </button>
              <button type="button"
                className="flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left text-[12px] text-slate-700 transition-colors hover:bg-slate-50"
                onClick={() => { setShowSidebarUploadMenu(false); sidebarVideoUploadInputRef.current?.click(); }}>
                <Film className="h-4 w-4 text-slate-500" />
                <span>上传视频</span>
              </button>
              <button type="button"
                className="flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left text-[12px] text-slate-700 transition-colors hover:bg-slate-50"
                onClick={() => {
                  setShowSidebarUploadMenu(false);
                  setAssetLibraryPickerMode(true);
                  setAssetLibraryTab("assets");
                  setAssetLibraryDetailWorkId("");
                  setShowAssetLibrary(true);
                }}>
                <FolderOpen className="h-4 w-4 text-slate-500" />
                <span>从资产库选择</span>
              </button>
            </div>
          ) : null}
        </div>

        {/* Sidebar item list */}
        <div
          className="flex h-auto flex-col items-center rounded-[32px] border border-[#E5E7EB] bg-[rgba(255,255,255,0.9)] px-2 py-2.5 shadow-[0_4px_16px_rgba(0,0,0,0.06)] backdrop-blur-xl select-none"
          style={{ WebkitOverflowScrolling: "touch", width: leftSidebarWidth }}
        >
          <div className="w-full overflow-visible">
            {renderSidebarContent()}
          </div>
        </div>

        {/* Undo / Redo */}
        <div className="shrink-0" style={{ width: leftSidebarWidth }}>
          <div className="mx-auto flex w-full flex-col items-center gap-1.5 rounded-[32px] border border-[#E5E7EB] bg-[rgba(255,255,255,0.9)] px-2 py-1.5 shadow-[0_4px_16px_rgba(0,0,0,0.06)] backdrop-blur-xl">
            {[
              { action: undo, can: canUndo, icon: Undo, label: "撤销" },
              { action: redo, can: canRedo, icon: Redo, label: "重做" },
            ].map((item) => (
              <button key={item.label} type="button" onClick={item.action} disabled={!item.can} title={item.label} aria-label={item.label}
                className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                  item.can ? "text-[#6B7280] hover:bg-[#EAECEF] hover:text-slate-800 active:bg-[#E1E5E9]" : "cursor-not-allowed text-slate-300"
                }`}>
                <span className="flex h-7 w-7 items-center justify-center">
                  {React.createElement(item.icon, { className: "h-[18px] w-[18px]", strokeWidth: 2.2 })}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Member avatar + dropdown ──────────────────────────────────────────── */}
      <div className="absolute bottom-4 left-4 z-40 shrink-0" style={{ width: leftSidebarWidth }}>
        <details className="relative group">
          <summary
            className="list-none mx-auto flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-[#E5E7EB] bg-[rgba(255,255,255,0.9)] text-slate-700 shadow-[0_4px_16px_rgba(0,0,0,0.06)] backdrop-blur-xl hover:bg-[#F8FAFC] hover:text-slate-900 [&::-webkit-details-marker]:hidden"
            title={memberLabel}
          >
            {memberAvatar ? (
              <img src={memberAvatar} alt={memberLabel} className="h-full w-full rounded-full object-cover" />
            ) : (
              <span className="text-xs font-semibold">{String(memberLabel || "G").slice(0, 1).toUpperCase()}</span>
            )}
          </summary>
          <div className="absolute bottom-full left-0 z-[70] mb-2 w-56 rounded-[24px] border border-[#E5E7EB] bg-[rgba(255,255,255,0.96)] p-3 shadow-[0_20px_44px_rgba(15,23,42,0.1)] backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                {memberAvatar
                  ? <img src={memberAvatar} alt={memberLabel} className="h-full w-full object-cover" />
                  : <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-slate-700">{String(memberLabel || "G").slice(0, 1).toUpperCase()}</div>}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-slate-800">{memberLabel}</div>
                <div className="text-[10px] text-slate-400">{memberInfoLoginUrl ? "会员未登录" : "会员信息"}</div>
                <div className="mt-1">
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[9px] ${
                    userAuthsLoading ? "border-slate-200 bg-slate-50 text-slate-500"
                    : isAdminUser ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-100"
                    : "border-slate-200 bg-slate-50 text-slate-500"
                  }`}>
                    {userAuthsLoading ? "权限加载中" : isAdminUser ? "管理员" : "普通成员"}
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[
                { label: "当前积分", value: memberPoint, color: "text-yellow-700" },
                { label: "累计积分", value: memberTotalPoint, color: "text-emerald-700" },
              ].map(({ label, value, color }) => (
                <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                  <div className="text-[10px] text-slate-500">{label}</div>
                  <div className={`mt-0.5 text-xs font-semibold ${color}`}>{formatMemberPoints(value)}</div>
                </div>
              ))}
            </div>
            {memberInfoLoginUrl ? (
              <button type="button" onClick={() => navigateToMemberLogin(memberInfoLoginUrl)}
                className="mt-2 w-full rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-left text-[11px] text-cyan-700 hover:border-cyan-300 hover:bg-cyan-100">
                前往会员登录
              </button>
            ) : null}
          </div>
        </details>
      </div>

      {/* ── Hover preview tooltip ─────────────────────────────────────────────── */}
      {hoveredSidebarPreview ? (
        <div
          className="pointer-events-none absolute z-[55] w-72 -translate-y-1/2 rounded-[24px] border border-[#E5E7EB] bg-[rgba(255,255,255,0.96)] px-4 py-4 text-left shadow-[0_20px_44px_rgba(15,23,42,0.1)] backdrop-blur-xl"
          style={{ left: leftSidebarWidth + 18, top: hoveredSidebarPreview.top }}
        >
          <div className="absolute left-[-6px] top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 border-l border-t border-[#E5E7EB] bg-[rgba(255,255,255,0.96)]" />
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F3F4F6] text-[#6B7280] ring-1 ${hoveredSidebarPreview.active ? "ring-slate-400/35" : "ring-slate-200"}`}>
              {hoveredSidebarPreview.icon ? React.createElement(hoveredSidebarPreview.icon, { className: "w-4 h-4" }) : null}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium leading-5 text-slate-800">{hoveredSidebarPreview.label}</div>
              <div className="mt-1.5 text-[11px] leading-5 text-slate-400 whitespace-normal break-words">{hoveredSidebarPreview.desc}</div>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Node input submenu ────────────────────────────────────────────────── */}
      {sidebarNodeInputMenu ? (
        <div
          data-sidebar-node-input-menu="true"
          className="absolute z-[58] w-72 -translate-y-1/2 rounded-[24px] border border-[#E5E7EB] bg-[rgba(255,255,255,0.98)] p-3 shadow-[0_20px_44px_rgba(15,23,42,0.12)] backdrop-blur-xl"
          style={{ left: leftSidebarWidth + 18, top: sidebarNodeInputMenu.top }}
          onMouseEnter={() => clearHoverMenuTimer(sidebarNodeInputMenuCloseTimerRef)}
          onMouseLeave={() => scheduleHoverMenuClose(sidebarNodeInputMenuCloseTimerRef, setSidebarNodeInputMenu)}
        >
          <div className="mb-2 px-1 text-[11px] font-medium text-slate-500">选择输入</div>
          <div className="space-y-1.5">
            {[
              { key: "node_text_prompt", icon: Clipboard, bg: "bg-[#F3F4F6]", color: "text-[#6B7280]", label: "提示词输入", desc: "纯文本提示词输入，可连接到创作节点", type: NODE_TYPES.TEXT_INPUT },
              { key: "node_storyboard_input", icon: Clapperboard, bg: "bg-[#EEF7F6]", color: "text-[#0F766E]", label: "故事板输入", desc: "拖入剧本文件，自动生成可编辑故事板", type: NODE_TYPES.STORYBOARD_INPUT },
              { key: "node_image_generate", icon: ImagePlus, bg: "bg-[#F3F4F6]", color: "text-[#6B7280]", label: "图像创作", desc: "与现有生图节点一致，支持模型、尺寸和比例", type: NODE_TYPES.PROCESSOR, mode: "image_creation" },
              { key: "node_video_generate", icon: Film, bg: "bg-[#F3F4F6]", color: "text-[#6B7280]", label: "视频创作", desc: "内置首尾帧参考 / 全能参考模式切换", type: NODE_TYPES.VIDEO_GEN, mode: "first_last_reference" },
            ].map((item) => (
              <button key={item.key} type="button"
                className="flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left transition-colors hover:bg-[#F3F4F6]"
                onClick={() => {
                  setActiveSidebarItemKey(item.key);
                  setSidebarNodeInputMenu(null);
                  safeInvoke(() => onAddNode(item.type, item.mode || null), item.label);
                }}>
                <div className={`flex h-10 w-10 items-center justify-center rounded-full ${item.bg} ${item.color}`}>{React.createElement(item.icon, { className: "h-[18px] w-[18px]" })}</div>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-slate-800">{item.label}</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">{item.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Workflow submenu ──────────────────────────────────────────────────── */}
      {sidebarWorkflowMenu ? (
        <div
          data-sidebar-workflow-menu="true"
          className="absolute z-[58] w-72 -translate-y-1/2 rounded-[24px] border border-[#E5E7EB] bg-[rgba(255,255,255,0.98)] p-3 shadow-[0_20px_44px_rgba(15,23,42,0.12)] backdrop-blur-xl"
          style={{ left: leftSidebarWidth + 18, top: sidebarWorkflowMenu.top }}
          onMouseEnter={() => clearHoverMenuTimer(sidebarWorkflowMenuCloseTimerRef)}
          onMouseLeave={() => scheduleHoverMenuClose(sidebarWorkflowMenuCloseTimerRef, setSidebarWorkflowMenu)}
        >
          <div className="mb-2 px-1 text-[11px] font-medium text-slate-500">选择工作流</div>
          <div className="space-y-1.5">
            <button type="button" className="flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left transition-colors hover:bg-[#F3F4F6]"
              onClick={() => { setActiveSidebarItemKey("workflow_swap"); setSidebarWorkflowMenu(null);
                safeInvoke(() => onNavigate({ partEnum: AI_CHAT_PART_ENUM_209, modelId: 4, to: "workflow_swap", debugLabel: "三合一换图", action: () => navigate("/app/swap") }), "三合一换图"); }}>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F3F4F6] text-[#6B7280]"><Layers className="h-[18px] w-[18px]" /></div>
              <div className="min-w-0"><div className="text-[13px] font-medium text-slate-800">三合一换图</div><div className="mt-0.5 text-[11px] text-slate-500">换脸 / 换背景 / 换装 / 视频超清</div></div>
            </button>
            <button type="button" className="flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left transition-colors hover:bg-[#F3F4F6]"
              onClick={() => { setActiveSidebarItemKey("workflow_batch_video"); setSidebarWorkflowMenu(null);
                safeInvoke(() => onNavigate({ partEnum: AI_CHAT_PART_ENUM_210, modelId: 4, to: "workflow_batch_video", debugLabel: "批量动图", action: () => navigate("/app/batch-video") }), "批量动图"); }}>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F3F4F6] text-[#6B7280]"><Film className="h-[18px] w-[18px]" /></div>
              <div className="min-w-0"><div className="text-[13px] font-medium text-slate-800">批量动图</div><div className="mt-0.5 text-[11px] text-slate-500">单图生成短视频 / 视频超清</div></div>
            </button>
            <button type="button" className="flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left transition-colors hover:bg-[#F3F4F6]"
              onClick={() => { setActiveSidebarItemKey("workflow_batch_wordart"); setSidebarWorkflowMenu(null);
                safeInvoke(() => onNavigate({ partEnum: AI_CHAT_PART_ENUM_211, modelId: defaultVideoModelId, to: "workflow_batch_wordart", debugLabel: "批量花字", action: () => navigate("/app/batch-wordart") }), "批量花字"); }}>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F3F4F6] text-[#6B7280]"><Palette className="h-[18px] w-[18px]" /></div>
              <div className="min-w-0"><div className="text-[13px] font-medium text-slate-800">批量花字</div><div className="mt-0.5 text-[11px] text-slate-500">批量添加花字文案</div></div>
            </button>
            <button type="button" className="flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left transition-colors hover:bg-[#F3F4F6]"
              onClick={() => { setSidebarWorkflowMenu(null); navigate("/app/gemini"); }}>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#EEF2FF] text-[#6366F1]"><Sparkles className="h-[18px] w-[18px]" /></div>
              <div className="min-w-0"><div className="text-[13px] font-medium text-slate-800">AI 小禹智能体</div><div className="mt-0.5 text-[11px] text-slate-500">图片 / 视频 / 分镜创作助手</div></div>
            </button>
          </div>
        </div>
      ) : null}

      {/* ── Image create submenu ──────────────────────────────────────────────── */}
      {sidebarImageCreateMenu ? (
        <div
          data-sidebar-image-create-menu="true"
          className="absolute z-[58] w-72 -translate-y-1/2 rounded-[24px] border border-[#E5E7EB] bg-[rgba(255,255,255,0.98)] p-3 shadow-[0_20px_44px_rgba(15,23,42,0.12)] backdrop-blur-xl"
          style={{ left: leftSidebarWidth + 18, top: sidebarImageCreateMenu.top }}
          onMouseEnter={() => clearHoverMenuTimer(sidebarImageCreateMenuCloseTimerRef)}
          onMouseLeave={() => scheduleHoverMenuClose(sidebarImageCreateMenuCloseTimerRef, setSidebarImageCreateMenu)}
        >
          <div className="mb-2 px-1 text-[11px] font-medium text-slate-500">选择创作方式</div>
          <div className="space-y-1.5">
            <button type="button" className="flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left transition-colors hover:bg-[#F3F4F6]"
              onClick={() => { setSidebarImageCreateMenu(null);
                safeInvoke(() => onNavigate({ partEnum: AI_CHAT_PART_ENUM_203, modelId: null, to: "node_image_generate_text2img", debugLabel: "文生图", action: createText2ImgTemplate }), "文生图"); }}>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F3F4F6] text-[#6B7280]"><ImagePlus className="h-[18px] w-[18px]" /></div>
              <div className="min-w-0"><div className="text-[13px] font-medium text-slate-800">文生图</div><div className="mt-0.5 text-[11px] text-slate-500">从提示词直接生成图片</div></div>
            </button>
            <button type="button" className="flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left transition-colors hover:bg-[#F3F4F6]"
              onClick={() => { setSidebarImageCreateMenu(null);
                safeInvoke(() => onNavigate({ partEnum: AI_CHAT_PART_ENUM_203, modelId: null, to: "node_image_generate_img2img", debugLabel: "图生图", action: createImg2ImgTemplate }), "图生图"); }}>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F3F4F6] text-[#6B7280]"><Images className="h-[18px] w-[18px]" /></div>
              <div className="min-w-0"><div className="text-[13px] font-medium text-slate-800">图生图</div><div className="mt-0.5 text-[11px] text-slate-500">基于单张参考图继续创作</div></div>
            </button>
            <button type="button" className="flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left transition-colors hover:bg-[#F3F4F6]"
              onClick={() => { setSidebarImageCreateMenu(null); safeInvoke(createMultiImg2ImgTemplate, "多图生图"); }}>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F3F4F6] text-[#6B7280]"><Layers className="h-[18px] w-[18px]" /></div>
              <div className="min-w-0"><div className="text-[13px] font-medium text-slate-800">多图生图</div><div className="mt-0.5 text-[11px] text-slate-500">多参考图联合生成与重绘</div></div>
            </button>
          </div>
        </div>
      ) : null}

      {/* ── Video create submenu ──────────────────────────────────────────────── */}
      {sidebarVideoCreateMenu ? (
        <div
          data-sidebar-video-create-menu="true"
          className="absolute z-[58] w-72 -translate-y-1/2 rounded-[24px] border border-[#E5E7EB] bg-[rgba(255,255,255,0.98)] p-3 shadow-[0_20px_44px_rgba(15,23,42,0.12)] backdrop-blur-xl"
          style={{ left: leftSidebarWidth + 18, top: sidebarVideoCreateMenu.top }}
          onMouseEnter={() => clearHoverMenuTimer(sidebarVideoCreateMenuCloseTimerRef)}
          onMouseLeave={() => scheduleHoverMenuClose(sidebarVideoCreateMenuCloseTimerRef, setSidebarVideoCreateMenu)}
        >
          <div className="mb-2 px-1 text-[11px] font-medium text-slate-500">选择创作方式</div>
          <div className="space-y-1.5">
            {[
              { icon: Clapperboard, label: "文生视频", desc: "直接用提示词生成视频", action: createText2VideoTemplate },
              { icon: ImagePlus, label: "图生视频", desc: "单张图片生成视频", action: createImg2VideoTemplate },
              { icon: Sparkles, label: "全能生视频", desc: "多参考图联合驱动视频生成", action: createOmniReferenceVideoTemplate },
            ].map((item) => (
              <button key={item.label} type="button" className="flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left transition-colors hover:bg-[#F3F4F6]"
                onClick={() => { setSidebarVideoCreateMenu(null); safeInvoke(item.action, item.label); }}>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F3F4F6] text-[#6B7280]">{React.createElement(item.icon, { className: "h-[18px] w-[18px]" })}</div>
                <div className="min-w-0"><div className="text-[13px] font-medium text-slate-800">{item.label}</div><div className="mt-0.5 text-[11px] text-slate-500">{item.desc}</div></div>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
