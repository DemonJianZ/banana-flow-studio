import React, { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { EMPTY_LIST } from "../../constants/workbench.jsx";

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
  const personaNames = useMemo(
    () => Array.from(new Set((personas || []).map((item) => String(item?.name || item?.title || "").trim()).filter(Boolean))),
    [personas],
  );
  const suggestions = useMemo(() => {
    if (!mentionState) return EMPTY_LIST;
    const query = String(mentionState.query || "").trim().toLowerCase();
    const filtered = personaNames.filter((name) => !query || name.toLowerCase().includes(query));
    return filtered.slice(0, 8);
  }, [mentionState, personaNames]);

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
    (name) => {
      const textarea = innerRef.current;
      if (!textarea || !mentionState) return;
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
    const width = Math.min(280, Math.max(180, rect.width || 220));
    const estimatedHeight = Math.min(340, 34 + suggestions.length * 38);
    const gap = 8;
    const viewportWidth = window.innerWidth || 0;
    const viewportHeight = window.innerHeight || 0;
    const left = Math.min(Math.max(12, rect.left), Math.max(12, viewportWidth - width - 12));
    const bottomTop = rect.bottom + gap;
    const top = bottomTop + estimatedHeight <= viewportHeight - 12
      ? bottomTop
      : Math.max(12, rect.top - estimatedHeight - gap);
    setPopupPosition({ left, top, width });
  }, [mentionState, suggestions.length]);

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
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">选择人物</div>
            {suggestions.map((name, index) => (
              <button
                key={name}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  insertMention(name);
                }}
                className={`flex w-full items-center justify-between rounded-[12px] px-3 py-2 text-left text-[12px] transition-colors ${
                  index === activeIndex ? "bg-cyan-50 text-cyan-700" : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span className="truncate">@{name}</span>
                {index === activeIndex ? <span className="text-[10px] text-cyan-500">Enter</span> : null}
              </button>
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
