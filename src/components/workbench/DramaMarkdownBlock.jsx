// src/components/workbench/DramaMarkdownBlock.jsx
import React from "react";

const normalizeLatexSymbols = (value) =>
  String(value || "")
    .replace(/\\leftrightarrow/g, "↔")
    .replace(/\\leftarrow/g, "←")
    .replace(/\\rightarrow/g, "→")
    .replace(/\\Rightarrow/g, "⇒")
    .replace(/\\Leftarrow/g, "⇐")
    .replace(/\\to\b/g, "→")
    .replace(/\\times/g, "×")
    .replace(/\\cdot/g, "·")
    .replace(/\\leq/g, "≤")
    .replace(/\\geq/g, "≥")
    .replace(/\\neq/g, "≠");

const normalizeInlineMath = (value) =>
  normalizeLatexSymbols(value)
    .replace(/\$([^$\n]{1,120})\$/g, (_, inner) => normalizeLatexSymbols(inner))
    .replace(/\\\(([\s\S]{1,120}?)\\\)/g, (_, inner) => normalizeLatexSymbols(inner))
    .replace(/\\\[([\s\S]{1,120}?)\\\]/g, (_, inner) => normalizeLatexSymbols(inner));

const stripMarkdownControlMarkers = (value) =>
  normalizeInlineMath(value)
    .replace(/\r\n/g, "\n")
    .replace(/\*\*/g, "")
    .replace(/__/g, "")
    .replace(/`/g, "")
    .trim();

const DramaMarkdownBlock = ({ value = "", className = "" }) => {
  const sanitized = stripMarkdownControlMarkers(value);
  if (!sanitized) {
    return <div className={className}>暂无结果</div>;
  }

  const lines = sanitized.split("\n");
  return (
    <div className={className}>
      {lines.map((rawLine, index) => {
        const line = String(rawLine || "");
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={`drama_md_${index}`} className="h-2" />;
        }

        const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
          const level = headingMatch[1].length;
          const headingText = headingMatch[2].trim();
          const headingClass =
            level <= 2
              ? "text-[13px] font-semibold text-slate-900"
              : "text-[12px] font-semibold text-slate-800";
          return (
            <div key={`drama_md_${index}`} className={`${headingClass} ${index > 0 ? "mt-3" : ""}`}>
              {headingText}
            </div>
          );
        }

        const quoteMatch = trimmed.match(/^>\s?(.*)$/);
        if (quoteMatch) {
          return (
            <div key={`drama_md_${index}`} className="border-l-2 border-slate-200 pl-3 text-slate-600 whitespace-pre-wrap">
              {quoteMatch[1].trim()}
            </div>
          );
        }

        const bulletMatch = trimmed.match(/^[-*+]\s+(.+)$/);
        if (bulletMatch) {
          return (
            <div key={`drama_md_${index}`} className="flex items-start gap-2 text-slate-700">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
              <span className="min-w-0 whitespace-pre-wrap">{bulletMatch[1].trim()}</span>
            </div>
          );
        }

        const orderedMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
        if (orderedMatch) {
          return (
            <div key={`drama_md_${index}`} className="flex items-start gap-2 text-slate-700">
              <span className="shrink-0 text-slate-500">{orderedMatch[1]}.</span>
              <span className="min-w-0 whitespace-pre-wrap">{orderedMatch[2].trim()}</span>
            </div>
          );
        }

        return (
          <div key={`drama_md_${index}`} className="text-slate-700 whitespace-pre-wrap">
            {trimmed}
          </div>
        );
      })}
    </div>
  );
};

export default DramaMarkdownBlock;
