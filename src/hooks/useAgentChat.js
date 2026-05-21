import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { readAgentDevMode, writeAgentDevMode } from "../lib/aiChatAnchorDebug";
import { listPreferences as listMemoryPreferences } from "../api/memoryPreferences";
import {
  normalizePromptPolishVariants,
  getAgentResultCardWidth,
  AGENT_RUN_STEPS,
  STORYBOARD_RUN_STEPS,
  SHOT_WORKFLOW_RUN_STEPS,
  DRAMA_RUN_STEPS,
  normalizeScriptBrief,
  EMPTY_LIST,
} from "../constants/workbench.jsx";

// ==========================================
// Module-level constants (not exported)
// ==========================================
const AGENT_SESSION_STORE_KEY = "bananaflow_agent_canvas_sessions_v1";

// ==========================================
// Module-level exports
// ==========================================
export const makeAgentId = () => Math.random().toString(36).slice(2, 10);

export const shortenSessionTitle = (text, maxLen = 16) => {
  const value = String(text || "").trim();
  if (!value) return "新会话";
  return value.length > maxLen ? `${value.slice(0, maxLen)}...` : value;
};

export const createDefaultAgentSession = () => ({
  id: `session_${makeAgentId()}`,
  title: "新会话",
  createdAt: Date.now(),
  updatedAt: Date.now(),
  turns: [],
  pendingTask: null,
});

export const HITL_FEEDBACK_REASON_OPTIONS = [
  "资产匹配回归",
  "生成脚本失败",
  "导出结果异常",
  "偏好建议误判",
  "其他",
];

// ==========================================
// Internal helpers
// ==========================================
const loadAgentStore = () => {
  try {
    const text = localStorage.getItem(AGENT_SESSION_STORE_KEY);
    if (!text) {
      const session = createDefaultAgentSession();
      return { sessions: [session], activeSessionId: session.id };
    }
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed?.sessions) || parsed.sessions.length === 0) {
      const session = createDefaultAgentSession();
      return { sessions: [session], activeSessionId: session.id };
    }
    const staleRunningError = "任务已中断：页面刷新或上次请求未完成，请重新发起。";
    const sessions = parsed.sessions.map((session) => ({
      ...session,
      turns: Array.isArray(session?.turns)
        ? session.turns
          .map((turn) =>
            turn?.status === "running"
              ? {
                  ...turn,
                  status: "error",
                  error: turn?.error || staleRunningError,
                }
              : turn,
          )
        : [],
      pendingTask: session?.pendingTask || null,
    }));
    return {
      sessions,
      activeSessionId: parsed.activeSessionId || sessions[0].id,
    };
  } catch {
    const session = createDefaultAgentSession();
    return { sessions: [session], activeSessionId: session.id };
  }
};

const saveAgentStore = (store) => {
  localStorage.setItem(AGENT_SESSION_STORE_KEY, JSON.stringify(store));
};

// ==========================================
// Hook
// ==========================================
export function useAgentChat({ apiFetch, onRunToastRef } = {}) {
  // ---- State ----
  const [rightPanelWidth, setRightPanelWidth] = useState(460);
  const [agentStore, setAgentStore] = useState(() => loadAgentStore());
  const [agentInput, setAgentInput] = useState("");
  const [agentInputFocused, setAgentInputFocused] = useState(false);
  const [agentPromptPolishLoading, setAgentPromptPolishLoading] = useState(false);
  const [agentPromptPolishError, setAgentPromptPolishError] = useState("");
  const [promptPolishDialog, setPromptPolishDialog] = useState(null);
  const [activeComposerActionId, setActiveComposerActionId] = useState("");
  const [showScriptExamples, setShowScriptExamples] = useState(false);
  const [showCanvasExamples, setShowCanvasExamples] = useState(false);
  const [agentComposerFiles, setAgentComposerFiles] = useState([]);
  const [agentDevMode, setAgentDevMode] = useState(() => readAgentDevMode());
  const [agentHistoryCollapsed, setAgentHistoryCollapsed] = useState(true);
  const [showPreferencesPanel, setShowPreferencesPanel] = useState(false);
  const [preferencesPanelPrefill, setPreferencesPanelPrefill] = useState(null);
  const [preferenceNotice, setPreferenceNotice] = useState(null);
  const [memoryPreferencesCache, setMemoryPreferencesCache] = useState({ byKey: {}, loaded: false });
  const [savingSuggestionId, setSavingSuggestionId] = useState("");
  const [savingFeedbackTargetId, setSavingFeedbackTargetId] = useState("");
  const [feedbackDialog, setFeedbackDialog] = useState(null);
  const [feedbackReasonChoice, setFeedbackReasonChoice] = useState(HITL_FEEDBACK_REASON_OPTIONS[0]);
  const [feedbackReasonNote, setFeedbackReasonNote] = useState("");
  const [agentResultCards, setAgentResultCards] = useState([]);
  const [selectedAgentCardIds, setSelectedAgentCardIds] = useState(new Set());
  const [activeAgentCardId, setActiveAgentCardId] = useState(null);

  // ---- Refs ----
  const agentInputRef = useRef(null);
  const agentUploadInputRef = useRef(null);
  const agentComposerRef = useRef(null);
  const promptPolishApplyRef = useRef(null);
  const agentCardDragRef = useRef(null);
  const agentConversationBottomRef = useRef(null);
  const rightPanelResizeRef = useRef(null);

  // ---- Derived values ----
  const agentSessions = agentStore.sessions ?? EMPTY_LIST;
  const activeAgentSession = useMemo(
    () => agentSessions.find((session) => session.id === agentStore.activeSessionId) || agentSessions[0] || null,
    [agentSessions, agentStore.activeSessionId],
  );
  const agentTurns = activeAgentSession?.turns ?? EMPTY_LIST;
  const activePendingTask = activeAgentSession?.pendingTask || null;
  const isCanvasPromptPending =
    activePendingTask?.intent === "CANVAS" && (activePendingTask?.missing || []).includes("prompt");
  const isAgentMissionRunning = agentTurns.some((turn) => turn.status === "running");
  const hasActiveAgentConversation = agentTurns.length > 0 || !!activePendingTask;
  const hasAgentResultCards = agentResultCards.length > 0;
  const minimizedAgentCards = agentResultCards.filter((card) => card.minimized);

  // ---- Effects ----

  // Revoke agentComposerFiles object URLs on unmount/change
  useEffect(() => {
    return () => {
      agentComposerFiles.forEach((item) => {
        if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
    };
  }, [agentComposerFiles]);

  // Dismiss agentInputFocused on pointer-down outside
  useEffect(() => {
    if (!agentInputFocused) return undefined;
    const handlePointerDown = (event) => {
      if (agentComposerRef.current?.contains(event.target)) return;
      setAgentInputFocused(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [agentInputFocused]);

  // Persist agentDevMode flag
  useEffect(() => {
    writeAgentDevMode(agentDevMode);
  }, [agentDevMode]);

  // Right-panel resize mousemove/mouseup
  useEffect(() => {
    const onMouseMove = (event) => {
      const drag = rightPanelResizeRef.current;
      if (!drag) return;
      const delta = drag.startX - event.clientX;
      const next = Math.min(620, Math.max(420, drag.startWidth + delta));
      setRightPanelWidth(next);
    };
    const onMouseUp = () => {
      rightPanelResizeRef.current = null;
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  // Persist agentStore to localStorage
  useEffect(() => {
    saveAgentStore(agentStore);
  }, [agentStore]);

  // Step ticker for running turns
  useEffect(() => {
    const timer = window.setInterval(() => {
      setAgentStore((prev) => {
        const sessionsNext = (prev.sessions || []).map((session) => {
          if (session.id !== prev.activeSessionId) return session;
          let hasRunning = false;
          const turnsNext = (session.turns || []).map((turn) => {
            if (turn.status !== "running") return turn;
            hasRunning = true;
            let stepCount = AGENT_RUN_STEPS.length;
            if (turn?.intent === "DRAMA") stepCount = DRAMA_RUN_STEPS.length;
            if (turn?.intent === "STORYBOARD") stepCount = STORYBOARD_RUN_STEPS.length;
            if (turn?.intent === "SHOT_WORKFLOW") stepCount = SHOT_WORKFLOW_RUN_STEPS.length;
            return {
              ...turn,
              stepIndex: ((turn.stepIndex || 0) + 1) % stepCount,
            };
          });
          if (!hasRunning) return session;
          return { ...session, turns: turnsNext, updatedAt: Date.now() };
        });
        return { ...prev, sessions: sessionsNext };
      });
    }, 900);
    return () => window.clearInterval(timer);
  }, []);

  // Scroll to bottom when agentTurns changes
  useEffect(() => {
    agentConversationBottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [agentTurns]);

  // Sync agentResultCards with agentTurns
  useEffect(() => {
    const resultTurns = agentTurns.filter(
      (turn) => ["done", "error"].includes(turn?.status) && turn?.intent !== "STORYBOARD",
    );
    // eslint-disable-next-line react-hooks/set-state-in-effect -- result cards are derived session state kept for drag/minimize UI state.
    setAgentResultCards((prev) => {
      const prevByTurnId = new Map(prev.map((item) => [item.turnId, item]));
      return resultTurns.map((turn, idx) => {
        const existing = prevByTurnId.get(turn.id);
        if (existing) {
          const targetWidth = getAgentResultCardWidth(turn);
          if (existing.w === targetWidth) return existing;
          return { ...existing, w: targetWidth };
        }
        return {
          id: `agent_card_${makeAgentId()}`,
          turnId: turn.id,
          x: 120 + (idx % 2) * 500,
          y: 120 + Math.floor(idx / 2) * 360,
          w: getAgentResultCardWidth(turn),
          collapsed: false,
          minimized: false,
        };
      });
    });
    setActiveAgentCardId(null);
    setSelectedAgentCardIds(new Set());
  }, [activeAgentSession?.id, agentTurns]);

  // Cleanup agentCardDragRef on unmount
  useEffect(() => () => {
    agentCardDragRef.current = null;
  }, []);

  // ---- Handlers ----

  const openPromptPolishPicker = useCallback(({ title = "AI 润色", sourcePrompt = "", variants = [], onUse }) => {
    const normalizedVariants = normalizePromptPolishVariants({ variants });
    if (!normalizedVariants.length) return;
    promptPolishApplyRef.current = typeof onUse === "function" ? onUse : null;
    setPromptPolishDialog({
      title,
      sourcePrompt: String(sourcePrompt || "").trim(),
      variants: normalizedVariants,
    });
  }, []);

  const closePromptPolishPicker = useCallback(() => {
    setPromptPolishDialog(null);
    promptPolishApplyRef.current = null;
  }, []);

  const usePromptPolishVariant = useCallback(
    (variant) => {
      const text = String(variant?.text || "").trim();
      if (!text) return;
      const apply = promptPolishApplyRef.current;
      closePromptPolishPicker();
      if (typeof apply === "function") {
        apply(text);
      }
    },
    [closePromptPolishPicker],
  );

  const handleRightPanelResizeStart = useCallback(
    (e) => {
      if (agentHistoryCollapsed) return;
      e.preventDefault();
      rightPanelResizeRef.current = {
        startX: e.clientX,
        startWidth: rightPanelWidth,
      };
    },
    [agentHistoryCollapsed, rightPanelWidth],
  );

  const toggleAgentHistoryPanel = useCallback(() => {
    setAgentHistoryCollapsed((prev) => !prev);
  }, []);

  const rightPanelContainerStyle = useMemo(
    () => ({
      width: rightPanelWidth,
      height: "min(70vh, calc(100vh - 180px))",
      maxHeight: "calc(100vh - 180px)",
      transition: "width 280ms cubic-bezier(0.22,1,0.36,1)",
    }),
    [rightPanelWidth],
  );

  const updateActiveAgentSession = useCallback((updater) => {
    setAgentStore((prev) => {
      const sessionsNext = (prev.sessions || []).map((session) => {
        if (session.id !== prev.activeSessionId) return session;
        const next = updater(session);
        return { ...next, updatedAt: Date.now() };
      });
      return { ...prev, sessions: sessionsNext };
    });
  }, []);

  const appendAgentTurn = useCallback((turnInput = {}) => {
    const turnId = turnInput?.id || `turn_${makeAgentId()}`;
    const nextTurn = {
      id: turnId,
      userText: String(turnInput?.userText || "").trim(),
      extractedProduct: String(turnInput?.extractedProduct || "").trim(),
      status: turnInput?.status || "assistant",
      assistantText: String(turnInput?.assistantText || ""),
      quickActions: Array.isArray(turnInput?.quickActions) ? turnInput.quickActions : [],
      productChips: Array.isArray(turnInput?.productChips) ? turnInput.productChips : [],
      memorySuggestions: Array.isArray(turnInput?.memorySuggestions)
        ? turnInput.memorySuggestions.map((item, idx) => ({
            ...item,
            id: item?.id || `suggest_${turnId}_${idx}`,
            status: item?.status || "pending",
          }))
        : [],
      showCancelPending: !!turnInput?.showCancelPending,
      routeDebug: turnInput?.routeDebug || null,
      scriptBriefDraft: turnInput?.scriptBriefDraft ? normalizeScriptBrief(turnInput.scriptBriefDraft) : null,
      scriptBrief: turnInput?.scriptBrief ? normalizeScriptBrief(turnInput.scriptBrief) : null,
      dramaPayload: turnInput?.dramaPayload || null,
      response: turnInput?.response || null,
      intent: turnInput?.intent || "",
      intentReason: turnInput?.intentReason || "",
      exports: turnInput?.exports || {},
      uploadedDocuments: Array.isArray(turnInput?.uploadedDocuments) ? turnInput.uploadedDocuments : [],
      stepIndex: Number(turnInput?.stepIndex || 0),
      error: String(turnInput?.error || ""),
      createdAt: Number(turnInput?.createdAt || Date.now()) || Date.now(),
    };
    updateActiveAgentSession((session) => ({
      ...session,
      title:
        session.title === "新会话" && nextTurn.userText
          ? shortenSessionTitle(nextTurn.userText)
          : session.title,
      turns: [...(session.turns || []), nextTurn],
    }));
    return turnId;
  }, [updateActiveAgentSession]);

  const updateAgentTurn = useCallback((turnId, updater) => {
    if (!turnId) return;
    updateActiveAgentSession((session) => ({
      ...session,
      turns: (session.turns || []).map((turn) => {
        if (turn.id !== turnId) return turn;
        const patch =
          typeof updater === "function"
            ? updater(turn)
            : (updater && typeof updater === "object" ? updater : {});
        return {
          ...turn,
          ...(patch || {}),
          routeDebug: patch && Object.prototype.hasOwnProperty.call(patch, "routeDebug")
            ? patch.routeDebug
            : turn.routeDebug,
        };
      }),
    }));
  }, [updateActiveAgentSession]);

  const createAgentSession = () => {
    const nextSession = createDefaultAgentSession();
    setAgentStore((prev) => ({
      sessions: [nextSession, ...(prev.sessions || [])],
      activeSessionId: nextSession.id,
    }));
    setAgentInput("");
  };

  const setActiveAgentSession = (sessionId) => {
    setAgentStore((prev) => ({ ...prev, activeSessionId: sessionId }));
  };

  const clearActiveAgentConversation = useCallback(() => {
    if (isAgentMissionRunning) {
      onRunToastRef?.current?.({ message: "Agent 正在执行任务，请稍后再清除对话记录", type: "error" });
      return;
    }
    if (!hasActiveAgentConversation) {
      onRunToastRef?.current?.({ message: "当前会话暂无可清除的对话记录", type: "info" });
      return;
    }
    const turnCount = activeAgentSession?.turns?.length || 0;
    if (!window.confirm(`确认清除当前会话的对话记录吗？${turnCount > 0 ? `（共 ${turnCount} 条）` : ""}`)) {
      return;
    }
    updateActiveAgentSession((session) => ({
      ...session,
      title: "新会话",
      turns: [],
      pendingTask: null,
    }));
    setAgentInput("");
    setAgentResultCards([]);
    setSelectedAgentCardIds(new Set());
    setActiveAgentCardId(null);
    onRunToastRef?.current?.({ message: "已清除当前会话对话记录", type: "info" });
  }, [
    activeAgentSession?.turns?.length,
    hasActiveAgentConversation,
    isAgentMissionRunning,
    onRunToastRef,
    updateActiveAgentSession,
  ]);

  const setPendingTaskForActiveSession = useCallback(
    (task) => {
      updateActiveAgentSession((session) => ({ ...session, pendingTask: task || null }));
    },
    [updateActiveAgentSession],
  );

  const clearPendingTaskForActiveSession = useCallback(() => {
    setPendingTaskForActiveSession(null);
  }, [setPendingTaskForActiveSession]);

  const mapPreferenceListToKey = useCallback((preferences) => {
    const byKey = {};
    for (const item of preferences || []) {
      const key = String(item?.key || "").trim();
      if (!key) continue;
      byKey[key] = item;
    }
    return byKey;
  }, []);

  const refreshMemoryPreferences = useCallback(
    async (force = false) => {
      if (!force && memoryPreferencesCache.loaded) {
        return memoryPreferencesCache.byKey || {};
      }
      try {
        const data = await listMemoryPreferences(apiFetch);
        const byKey = mapPreferenceListToKey(data?.preferences || []);
        setMemoryPreferencesCache({ byKey, loaded: true });
        return byKey;
      } catch (error) {
        onRunToastRef?.current?.({
          message: error?.message || "加载用户偏好失败",
          type: "error",
        });
        return memoryPreferencesCache.byKey || {};
      }
    },
    [apiFetch, mapPreferenceListToKey, memoryPreferencesCache.byKey, memoryPreferencesCache.loaded, onRunToastRef],
  );

  const updateSuggestionStatus = useCallback(
    (turnId, suggestionId, status, errorText = "") => {
      updateActiveAgentSession((session) => ({
        ...session,
        turns: (session.turns || []).map((turn) => {
          if (turn.id !== turnId) return turn;
          const memorySuggestions = (turn.memorySuggestions || []).map((item) =>
            item.id === suggestionId
              ? {
                  ...item,
                  status,
                  errorText: errorText || "",
                  updatedAt: Date.now(),
                }
              : item,
          );
          return { ...turn, memorySuggestions };
        }),
      }));
    },
    [updateActiveAgentSession],
  );

  const ensureAgentResultCard = useCallback((turnId) => {
    setAgentResultCards((prev) => {
      const existing = prev.find((card) => card.turnId === turnId);
      const turn = (activeAgentSession?.turns || []).find((item) => item.id === turnId);
      const targetWidth = getAgentResultCardWidth(turn);
      if (existing) {
        if (existing.w === targetWidth) return prev;
        return prev.map((card) => (card.turnId === turnId ? { ...card, w: targetWidth } : card));
      }
      const idx = prev.length;
      return [
        ...prev,
        {
          id: `agent_card_${makeAgentId()}`,
          turnId,
          x: 120 + (idx % 2) * 500,
          y: 120 + Math.floor(idx / 2) * 360,
          w: targetWidth,
          collapsed: false,
          minimized: false,
        },
      ];
    });
  }, [activeAgentSession?.turns]);

  const focusAgentResultCard = useCallback((turnId) => {
    const card = agentResultCards.find((item) => item.turnId === turnId);
    if (card) {
      setAgentResultCards((prev) =>
        prev.map((item) =>
          item.turnId === turnId ? { ...item, minimized: false, collapsed: false } : item,
        ),
      );
      setSelectedAgentCardIds(new Set([card.id]));
      setActiveAgentCardId(card.id);
      return;
    }
    ensureAgentResultCard(turnId);
  }, [agentResultCards, ensureAgentResultCard]);

  const toggleAgentResultCardCollapsed = (cardId) => {
    setAgentResultCards((prev) =>
      prev.map((item) =>
        item.id === cardId ? { ...item, collapsed: !item.collapsed } : item,
      ),
    );
  };

  const minimizeAgentResultCard = (cardId) => {
    setAgentResultCards((prev) =>
      prev.map((item) =>
        item.id === cardId ? { ...item, minimized: true, collapsed: true } : item,
      ),
    );
    setSelectedAgentCardIds((prev) => {
      const next = new Set(prev);
      next.delete(cardId);
      return next;
    });
    if (activeAgentCardId === cardId) setActiveAgentCardId(null);
  };

  const handleAgentCardWheelCapture = useCallback((e) => {
    e.stopPropagation();
    const cardEl = e.currentTarget;
    const AGENT_CARD_SCROLL_BODY_SELECTOR = '[data-agent-card-scroll-body="true"]';
    const scrollBody = cardEl.querySelector(AGENT_CARD_SCROLL_BODY_SELECTOR);
    if (!(scrollBody instanceof HTMLElement)) {
      e.preventDefault();
      return;
    }

    if (e.target instanceof Node && scrollBody.contains(e.target)) {
      return;
    }

    const maxScrollTop = Math.max(0, scrollBody.scrollHeight - scrollBody.clientHeight);
    if (maxScrollTop <= 0) {
      e.preventDefault();
      return;
    }

    const nextScrollTop = Math.max(0, Math.min(scrollBody.scrollTop + e.deltaY, maxScrollTop));
    if (nextScrollTop !== scrollBody.scrollTop) {
      scrollBody.scrollTop = nextScrollTop;
    }
    e.preventDefault();
  }, []);

  const appendAssistantTurn = useCallback(
    (userText, assistantText, options = {}) => {
      const {
        status = "assistant",
        quickActions = [],
        productChips = [],
        routeDebug = null,
        memorySuggestions = [],
        showCancelPending = false,
        userTextOverride,
        scriptBriefDraft = null,
      } = options || {};
      const finalUserText = userTextOverride !== undefined ? String(userTextOverride || "") : String(userText || "");
      appendAgentTurn({
        userText: finalUserText,
        extractedProduct: "",
        status,
        assistantText,
        quickActions,
        productChips,
        memorySuggestions,
        showCancelPending,
        routeDebug,
        scriptBriefDraft,
      });
    },
    [appendAgentTurn],
  );

  return {
    // State
    rightPanelWidth,
    setRightPanelWidth,
    agentStore,
    setAgentStore,
    agentInput,
    setAgentInput,
    agentInputFocused,
    setAgentInputFocused,
    agentPromptPolishLoading,
    setAgentPromptPolishLoading,
    agentPromptPolishError,
    setAgentPromptPolishError,
    promptPolishDialog,
    setPromptPolishDialog,
    activeComposerActionId,
    setActiveComposerActionId,
    showScriptExamples,
    setShowScriptExamples,
    showCanvasExamples,
    setShowCanvasExamples,
    agentComposerFiles,
    setAgentComposerFiles,
    agentDevMode,
    setAgentDevMode,
    agentHistoryCollapsed,
    setAgentHistoryCollapsed,
    showPreferencesPanel,
    setShowPreferencesPanel,
    preferencesPanelPrefill,
    setPreferencesPanelPrefill,
    preferenceNotice,
    setPreferenceNotice,
    memoryPreferencesCache,
    setMemoryPreferencesCache,
    savingSuggestionId,
    setSavingSuggestionId,
    savingFeedbackTargetId,
    setSavingFeedbackTargetId,
    feedbackDialog,
    setFeedbackDialog,
    feedbackReasonChoice,
    setFeedbackReasonChoice,
    feedbackReasonNote,
    setFeedbackReasonNote,
    agentResultCards,
    setAgentResultCards,
    selectedAgentCardIds,
    setSelectedAgentCardIds,
    activeAgentCardId,
    setActiveAgentCardId,
    // Refs
    agentInputRef,
    agentUploadInputRef,
    agentComposerRef,
    promptPolishApplyRef,
    agentCardDragRef,
    agentConversationBottomRef,
    rightPanelResizeRef,
    // Derived values
    agentSessions,
    activeAgentSession,
    agentTurns,
    activePendingTask,
    isCanvasPromptPending,
    isAgentMissionRunning,
    hasActiveAgentConversation,
    hasAgentResultCards,
    minimizedAgentCards,
    // Computed styles
    rightPanelContainerStyle,
    // Handlers
    openPromptPolishPicker,
    closePromptPolishPicker,
    usePromptPolishVariant,
    handleRightPanelResizeStart,
    toggleAgentHistoryPanel,
    updateActiveAgentSession,
    appendAgentTurn,
    updateAgentTurn,
    createAgentSession,
    setActiveAgentSession,
    clearActiveAgentConversation,
    setPendingTaskForActiveSession,
    clearPendingTaskForActiveSession,
    mapPreferenceListToKey,
    refreshMemoryPreferences,
    updateSuggestionStatus,
    ensureAgentResultCard,
    focusAgentResultCard,
    toggleAgentResultCardCollapsed,
    minimizeAgentResultCard,
    handleAgentCardWheelCapture,
    appendAssistantTurn,
  };
}
