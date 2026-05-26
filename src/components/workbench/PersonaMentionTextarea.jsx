import React, { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { EMPTY_LIST } from "../../constants/workbench.jsx";
import { isAudioContent } from "../../lib/mediaType.js";

const getActivePersonaMentionQuery = (text, caretIndex) => {
  const beforeCaret = String(text || "").slice(0, Math.max(0, Number(caretIndex) || 0));
  const match = /(^|[\s，。,.!?;；：:（(【]|\[)@([^\s@，。,.!?;；：:）)】\]]*)$/.exec(beforeCaret);
  if (!match) return null;
  return {
    start: beforeCaret.length - match[2].length - 1,
    query: match[2],
  };
};

const renderPersonaMentionText = (text, personaNames = EMPTY_LIST) => {
  const value = String(text || "");
  if (!value) return null;
  const names = Array.from(new Set((personaNames || []).map((name) => String(name || "").trim()).filter(Boolean)))
    .sort((a, b) => b.length - a.length);
  if (!names.length) return value;

  const parts = [];
  let index = 0;
  while (index < value.length) {
    const matchedName = names.find((name) => value.startsWith(`@${name}`, index));
    if (!matchedName) {
      parts.push(value[index]);
      index += 1;
      continue;
    }
    const mentionText = `@${matchedName}`;
    parts.push(
      <span
        key={`${index}_${matchedName}`}
        className="rounded-[6px] bg-cyan-100 px-1 font-semibold text-cyan-700 ring-1 ring-cyan-200/70"
      >
        {mentionText}
      </span>,
    );
    index += mentionText.length;
  }
  return parts;
};

// ── Icon components ──────────────────────────────────────────────────────────

const AudioIcon = () => (
  <svg className="h-3.5 w-3.5 shrink-0 text-violet-500" viewBox="0 0 16 16" fill="currentColor">
    <path d="M6 2a1 1 0 0 0-1 1v1H2a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h3v1a1 1 0 0 0 2 0V3a1 1 0 0 0-1-1zM9.5 4.5a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V5a.5.5 0 0 1 .5-.5zM12 6a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-1 0v-3A.5.5 0 0 1 12 6z"/>
  </svg>
);

const ImageIcon = () => (
  <svg className="h-3.5 w-3.5 shrink-0 text-cyan-500" viewBox="0 0 16 16" fill="currentColor">
    <path d="M6.002 5.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z"/>
    <path d="M2.002 1a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V3a2 2 0 0 0-2-2h-12zm12 1a1 1 0 0 1 1 1v6.5l-3.777-1.947a.5.5 0 0 0-.577.093l-3.71 3.71-2.66-1.772a.5.5 0 0 0-.63.062L1.002 12V3a1 1 0 0 1 1-1h12z"/>
  </svg>
);

const PersonIcon = () => (
  <svg className="h-3.5 w-3.5 shrink-0 text-slate-400" viewBox="0 0 16 16" fill="currentColor">
    <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm2-3a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm4 8c0 1-1 1-1 1H3s-1 0-1-1 1-4 6-4 6 3 6 4zm-1-.004c-.001-.246-.154-.986-.832-1.664C11.516 10.68 10.289 10 8 10c-2.29 0-3.516.68-4.168 1.332-.678.678-.83 1.418-.832 1.664h10z"/>
  </svg>
);

// ── Main component ────────────────────────────────────────────────────────────

const PersonaMentionTextarea = React.forwardRef(({
  value,
  onChange,
  personas = EMPTY_LIST,
  wrapperClassName = "",
  className = "",
  overlayClassName = "",
  popupClassName = "",
  onKeyDown,
  onScroll,
  ...props
}, forwardedRef) => {
  const innerRef = useRef(null);
  const overlayRef = useRef(null);
  const [mentionState, setMentionState] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [popupPosition, setPopupPosition] = useState(null);

  // Build flat name list for overlay highlighting
  const personaNames = useMemo(
    () => Array.from(new Set((personas || []).map((item) => String(item?.name || item?.title || "").trim()).filter(Boolean))),
    [personas],
  );

  // Full suggestion objects (not just names)
  const suggestions = useMemo(() => {
    if (!mentionState) return EMPTY_LIST;
    const query = String(mentionState.query || "").trim().toLowerCase();
    const filtered = (personas || []).filter((item) => {
      const name = String(item?.name || item?.title || "").trim();
      if (!name) return false;
      return !query || name.toLowerCase().includes(query);
    });
    return filtered.slice(0, 12);
  }, [mentionState, personas]);

  // Group suggestions by kind
  const groupedSuggestions = useMemo(() => {
    const inputs = suggestions.filter((s) => s.kind === "connected_input");
    const people = suggestions.filter((s) => s.kind !== "connected_input");
    const groups = [];
    if (inputs.length) groups.push({ label: "连接的输入", items: inputs, startIndex: 0 });
    if (people.length) groups.push({ label: "人物", items: people, startIndex: inputs.length });
    return groups;
  }, [suggestions]);

  const setTextareaRef = useCallback(
    (element) => {
      innerRef.current = element;
      if (typeof forwardedRef === "function") {
        forwardedRef(element);
      } else if (forwardedRef) {
        forwardedRef.current = element;
      }
    },
    [forwardedRef],
  );

  const refreshMentionState = useCallback(
    (nextValue, caretIndex) => {
      if (!personaNames.length) {
        setMentionState(null);
        return;
      }
      const nextState = getActivePersonaMentionQuery(nextValue, caretIndex);
      setMentionState(nextState);
      setActiveIndex(0);
    },
    [personaNames],
  );

  const emitChange = useCallback(
    (nextValue) => {
      if (typeof onChange !== "function") return;
      onChange({ target: { value: nextValue }, currentTarget: { value: nextValue } });
    },
    [onChange],
  );

  const insertMention = useCallback(
    (item) => {
      const name = String(item?.name || item?.title || item || "").trim();
      const textarea = innerRef.current;
      if (!textarea || !mentionState || !name) return;
      const safeValue = String(value || "");
      const selectionEnd = textarea.selectionEnd ?? safeValue.length;
      const nextText = `${safeValue.slice(0, mentionState.start)}@${name} ${safeValue.slice(selectionEnd)}`;
      const nextCaret = mentionState.start + name.length + 2;
      emitChange(nextText);
      setMentionState(null);
      window.requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(nextCaret, nextCaret);
      });
    },
    [emitChange, mentionState, value],
  );

  const syncOverlayScroll = useCallback((event) => {
    if (overlayRef.current) {
      overlayRef.current.scrollTop = event.currentTarget.scrollTop;
      overlayRef.current.scrollLeft = event.currentTarget.scrollLeft;
    }
    onScroll?.(event);
  }, [onScroll]);

  const updatePopupPosition = useCallback(() => {
    const textarea = innerRef.current;
    if (!textarea || !mentionState || suggestions.length === 0 || typeof window === "undefined") {
      setPopupPosition(null);
      return;
    }
    const rect = textarea.getBoundingClientRect();
    const width = Math.min(300, Math.max(200, rect.width || 220));
    const estimatedHeight = Math.min(400, 34 + suggestions.length * 46 + groupedSuggestions.length * 28);
    const gap = 8;
    const viewportWidth = window.innerWidth || 0;
    const viewportHeight = window.innerHeight || 0;
    const left = Math.min(Math.max(12, rect.left), Math.max(12, viewportWidth - width - 12));
    const bottomTop = rect.bottom + gap;
    const top = bottomTop + estimatedHeight <= viewportHeight - 12
      ? bottomTop
      : Math.max(12, rect.top - estimatedHeight - gap);
    setPopupPosition({ left, top, width });
  }, [mentionState, suggestions.length, groupedSuggestions.length]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => updatePopupPosition());
    return () => window.cancelAnimationFrame(frame);
  }, [updatePopupPosition, value]);

  useEffect(() => {
    if (!mentionState || suggestions.length === 0) return undefined;
    window.addEventListener("resize", updatePopupPosition);
    window.addEventListener("scroll", updatePopupPosition, true);
    return () => {
      window.removeEventListener("resize", updatePopupPosition);
      window.removeEventListener("scroll", updatePopupPosition, true);
    };
  }, [mentionState, suggestions.length, updatePopupPosition]);

  const popup =
    mentionState && suggestions.length > 0 && popupPosition && typeof document !== "undefined"
      ? createPortal(
          <div
            className={`fixed rounded-[16px] border border-slate-200 bg-white p-1.5 shadow-[0_20px_44px_rgba(15,23,42,0.2)] ${popupClassName}`}
            style={{
              left: popupPosition.left,
              top: popupPosition.top,
              width: popupPosition.width,
              zIndex: 9999,
            }}
          >
            {groupedSuggestions.map((group) => (
              <div key={group.label}>
                <div className="px-2 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                  {group.label}
                </div>
                {group.items.map((item, localIdx) => {
                  const globalIdx = group.startIndex + localIdx;
                  const name = String(item?.name || item?.title || "").trim();
                  const isActive = globalIdx === activeIndex;
                  const isInputItem = item.kind === "connected_input";
                  const mediaKind = item.mediaKind || "image";
                  const thumbnail = item.thumbnail || null;
                  const isAudio = mediaKind === "audio" || (thumbnail && isAudioContent(thumbnail));

                  return (
                    <button
                      key={name}
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        insertMention(item);
                      }}
                      className={`flex w-full items-center gap-2.5 rounded-[12px] px-2.5 py-1.5 text-left text-[12px] transition-colors ${
                        isActive ? "bg-cyan-50 text-cyan-700" : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {/* Thumbnail / Icon */}
                      {isInputItem ? (
                        isAudio ? (
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-violet-50 ring-1 ring-violet-100">
                            <AudioIcon />
                          </div>
                        ) : thumbnail ? (
                          <img
                            src={thumbnail}
                            alt=""
                            className="h-8 w-8 shrink-0 rounded-[8px] object-cover ring-1 ring-slate-200"
                          />
                        ) : (
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-cyan-50 ring-1 ring-cyan-100">
                            <ImageIcon />
                          </div>
                        )
                      ) : (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-slate-50 ring-1 ring-slate-100">
                          <PersonIcon />
                        </div>
                      )}

                      {/* Name */}
                      <span className="min-w-0 flex-1 truncate font-medium">@{name}</span>

                      {/* Kind badge */}
                      {isInputItem && (
                        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${isAudio ? "bg-violet-50 text-violet-600" : "bg-cyan-50 text-cyan-600"}`}>
                          {isAudio ? "音频" : "图片"}
                        </span>
                      )}

                      {isActive && <span className="ml-auto shrink-0 text-[10px] text-cyan-500">Enter</span>}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className={`relative ${wrapperClassName}`}>
      <div
        ref={overlayRef}
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words text-slate-700 ${overlayClassName}`}
      >
        {renderPersonaMentionText(value, personaNames)}
      </div>
      <textarea
        {...props}
        ref={setTextareaRef}
        value={value}
        onChange={(event) => {
          onChange?.(event);
          refreshMentionState(event.target.value, event.target.selectionStart);
        }}
        onClick={(event) => refreshMentionState(event.currentTarget.value, event.currentTarget.selectionStart)}
        onKeyUp={(event) => {
          if (["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(event.key)) return;
          refreshMentionState(event.currentTarget.value, event.currentTarget.selectionStart);
        }}
        onScroll={syncOverlayScroll}
        onBlur={() => {
          window.setTimeout(() => setMentionState(null), 120);
        }}
        onKeyDown={(event) => {
          if (mentionState && suggestions.length > 0) {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((current) => (current + 1) % suggestions.length);
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((current) => (current - 1 + suggestions.length) % suggestions.length);
              return;
            }
            if (event.key === "Enter" || event.key === "Tab") {
              event.preventDefault();
              insertMention(suggestions[activeIndex] || suggestions[0]);
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setMentionState(null);
              return;
            }
          }
          onKeyDown?.(event);
        }}
        className={`relative text-transparent caret-slate-800 selection:bg-cyan-100 ${className}`}
      />
      {popup}
    </div>
  );
});
PersonaMentionTextarea.displayName = "PersonaMentionTextarea";

export default PersonaMentionTextarea;
