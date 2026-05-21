/**
 * Renders an annotated storyboard script with color-coded entity highlights.
 *
 * Supported tokens: [[char:名字]] [[scene:名字]] [[prop:名字]]
 */
const TOKEN_RE = /\[\[(char|scene|prop):([^\]]+)\]\]/g;

const TAG_STYLES = {
  char: {
    bg: "#dbeafe",
    text: "#1d4ed8",
    border: "#bfdbfe",
    label: "角色",
  },
  scene: {
    bg: "#dcfce7",
    text: "#15803d",
    border: "#bbf7d0",
    label: "场景",
  },
  prop: {
    bg: "#ffedd5",
    text: "#c2410c",
    border: "#fed7aa",
    label: "道具",
  },
};

function parseAnnotatedScript(script) {
  if (!script) return [];
  const parts = [];
  let lastIndex = 0;
  let match;
  TOKEN_RE.lastIndex = 0;
  while ((match = TOKEN_RE.exec(script)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", content: script.slice(lastIndex, match.index) });
    }
    parts.push({ type: "token", kind: match[1], name: match[2] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < script.length) {
    parts.push({ type: "text", content: script.slice(lastIndex) });
  }
  return parts;
}

export default function ShotAnnotatedScriptBlock({ script, className = "" }) {
  if (!script) return null;
  const parts = parseAnnotatedScript(script);

  return (
    <div
      className={`rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] leading-6 text-slate-700 whitespace-pre-wrap break-words ${className}`}
    >
      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">分镜实体标注</span>
        {Object.entries(TAG_STYLES).map(([kind, style]) => (
          <span
            key={kind}
            style={{ backgroundColor: style.bg, color: style.text, border: `1px solid ${style.border}` }}
            className="rounded px-1 py-0.5 text-[9px] font-medium"
          >
            {style.label}
          </span>
        ))}
      </div>
      <div>
        {parts.map((part, i) => {
          if (part.type === "text") {
            return <span key={i}>{part.content}</span>;
          }
          const style = TAG_STYLES[part.kind] || TAG_STYLES.prop;
          return (
            <span
              key={i}
              title={`${style.label}：${part.name}`}
              style={{
                backgroundColor: style.bg,
                color: style.text,
                border: `1px solid ${style.border}`,
                borderRadius: "4px",
                padding: "0 3px",
                fontWeight: 500,
              }}
            >
              {part.name}
            </span>
          );
        })}
      </div>
    </div>
  );
}
