import React, { useState } from "react";

function TagBadge({ text, color }) {
  const colors = {
    character: "bg-blue-50 text-blue-700 border-blue-200",
    prop: "bg-orange-50 text-orange-700 border-orange-200",
    scene: "bg-green-50 text-green-700 border-green-200",
  };
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium ${colors[color] || colors.character}`}>
      {text}
    </span>
  );
}

function CharacterSection({ characters }) {
  if (!characters?.length) return null;
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="text-[11px] font-semibold text-slate-700">角色 & 主体</span>
        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{characters.length}</span>
      </div>
      <div className="space-y-1.5">
        {characters.map((c, i) => (
          <div key={i} className="rounded-lg border border-slate-100 bg-white px-3 py-2">
            <div className="flex items-center gap-1.5 mb-0.5">
              <TagBadge text={c.type === "prop" ? "道具" : "角色"} color={c.type === "prop" ? "prop" : "character"} />
              <span className="text-[12px] font-medium text-slate-800">{c.name}</span>
            </div>
            {c.description && (
              <p className="text-[11px] leading-5 text-slate-500 line-clamp-2">{c.description}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SceneSection({ scenes }) {
  if (!scenes?.length) return null;
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="text-[11px] font-semibold text-slate-700">场景</span>
        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{scenes.length}</span>
      </div>
      <div className="space-y-1.5">
        {scenes.map((s, i) => (
          <div key={i} className="rounded-lg border border-slate-100 bg-white px-3 py-2">
            <div className="flex items-center gap-1.5 mb-0.5">
              <TagBadge text="场景" color="scene" />
              <span className="text-[12px] font-medium text-slate-800">{s.name}</span>
            </div>
            {s.atmosphere && (
              <p className="text-[11px] leading-5 text-slate-500 line-clamp-2">{s.atmosphere}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ShotsSection({ shots }) {
  if (!shots?.length) return null;
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="text-[11px] font-semibold text-slate-700">分镜</span>
        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{shots.length} 个</span>
      </div>
      <div className="space-y-1.5">
        {shots.map((sh, i) => (
          <div key={i} className="rounded-lg border border-slate-100 bg-white px-3 py-2">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] font-mono text-slate-400">{sh.shot_id || `${i + 1}`}</span>
              {sh.scene_name && (
                <span className="text-[10px] text-slate-400">@ {sh.scene_name}</span>
              )}
              {sh.duration > 0 && (
                <span className="ml-auto text-[10px] text-slate-400">{sh.duration}s</span>
              )}
            </div>
            {sh.visual_description && (
              <div className="mt-1 rounded-md bg-slate-50 px-2 py-1.5">
                <div className="mb-0.5 text-[10px] font-medium text-slate-400">画面</div>
                <p className="text-[11px] leading-5 text-slate-600 line-clamp-3">{sh.visual_description}</p>
              </div>
            )}
            {sh.audio_description && (
              <div className="mt-1 rounded-md bg-amber-50 px-2 py-1.5">
                <div className="mb-0.5 text-[10px] font-medium text-amber-500">音效</div>
                <p className="text-[11px] leading-5 text-amber-700 line-clamp-2">{sh.audio_description}</p>
              </div>
            )}
            {sh.dialogue && (
              <div className="mt-1 rounded-md bg-indigo-50 px-2 py-1.5">
                <div className="mb-0.5 text-[10px] font-medium text-indigo-500">台词</div>
                <p className="whitespace-pre-wrap text-[11px] leading-5 text-indigo-700 line-clamp-4">{sh.dialogue}</p>
              </div>
            )}
            {(sh.characters || []).length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {sh.characters.map((name, j) => (
                  <span key={j} className="rounded bg-blue-50 px-1 py-0.5 text-[10px] text-blue-600">{name}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ScriptExtractionCard({ data, onConfirm, confirmed = false, superseded = false }) {
  const [loading, setLoading] = useState(false);

  const characters = data?.characters || [];
  const scenes = data?.scenes || [];
  const shots = data?.shots || [];
  const summary = data?.summary || "";

  const handleConfirm = async () => {
    if (loading || confirmed) return;
    setLoading(true);
    try {
      await onConfirm?.();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-200 bg-white flex items-center gap-2">
        <span className="text-[11px] font-semibold text-slate-700">剧本解析结果</span>
        <span className="ml-auto text-[10px] text-slate-400">如满意，点击确认继续</span>
      </div>
      <div className="px-3 py-3 space-y-3">
        {summary && (
          <p className="text-[11px] leading-5 text-slate-600 italic">{summary}</p>
        )}
        <CharacterSection characters={characters} />
        <SceneSection scenes={scenes} />
        <ShotsSection shots={shots} />
      </div>
      <div className="px-3 py-2.5 border-t border-slate-200 bg-white flex items-center justify-between">
        <span className="text-[10px] text-slate-400">
          {characters.length} 个角色 · {scenes.length} 个场景 · {shots.length} 个分镜
        </span>
        {superseded ? (
          <span className="rounded-full bg-slate-100 border border-slate-300 px-3 py-1 text-[11px] text-slate-500 font-medium">
            已更新
          </span>
        ) : confirmed ? (
          <span className="rounded-full bg-green-50 border border-green-200 px-3 py-1 text-[11px] text-green-700 font-medium">
            已确认
          </span>
        ) : (
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className="rounded-full bg-slate-900 px-4 py-1.5 text-[11px] font-medium text-white hover:bg-slate-700 active:bg-slate-800 transition-colors disabled:opacity-60"
          >
            {loading ? "处理中…" : "满意，继续生成主体图及场景图"}
          </button>
        )}
      </div>
    </div>
  );
}
