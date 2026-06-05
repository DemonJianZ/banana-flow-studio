import React from "react";
import { Scan } from "lucide-react";
import { checkNodeReady } from "../../../constants/workbench.jsx";

export default function RoleStructurerNodeRenderer({ node, updateData, onRun }) {
  return (
    <div className="nodrag space-y-3" onMouseDown={(event) => event.stopPropagation()}>
      <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-2.5">
        <div className="text-[12px] font-semibold text-slate-800">短剧角色画像结构化</div>
        <div className="mt-1 text-[10px] leading-4 text-slate-500">
          仅做结构化抽取、有限推断和一致性校验，不生成剧情。
        </div>
      </div>

      <label className="block">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">角色名称</span>
        <input
          type="text"
          value={node.data.roleName || ""}
          onChange={(event) => updateData(node.id, { roleName: event.target.value })}
          placeholder="例如：林晚"
          className="mt-1.5 w-full rounded-[12px] border border-slate-200 bg-white px-3 py-2 text-[12px] text-slate-800 outline-none focus:border-cyan-200 focus:ring-2 focus:ring-cyan-100"
        />
      </label>

      <label className="block">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">人物设定</span>
        <textarea
          value={node.data.characterSetting || ""}
          onChange={(event) => updateData(node.id, { characterSetting: event.target.value })}
          placeholder="输入身份、表面状态、真实欲望、恐惧、创伤、价值观等。"
          rows={3}
          className="mt-1.5 w-full resize-none rounded-[12px] border border-slate-200 bg-white px-3 py-2 text-[12px] leading-5 text-slate-700 outline-none focus:border-cyan-200 focus:ring-2 focus:ring-cyan-100"
        />
      </label>

      <label className="block">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">关系网络</span>
        <textarea
          value={node.data.relationshipNetwork || ""}
          onChange={(event) => updateData(node.id, { relationshipNetwork: event.target.value })}
          placeholder="输入与其他人物的关系、依赖、敌对、隐瞒、控制、交易等。"
          rows={3}
          className="mt-1.5 w-full resize-none rounded-[12px] border border-slate-200 bg-white px-3 py-2 text-[12px] leading-5 text-slate-700 outline-none focus:border-cyan-200 focus:ring-2 focus:ring-cyan-100"
        />
      </label>

      <label className="block">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">世界观背景</span>
        <textarea
          value={node.data.worldviewBackground || ""}
          onChange={(event) => updateData(node.id, { worldviewBackground: event.target.value })}
          placeholder="输入阶层规则、行业规则、禁忌、社会压力或故事世界约束。"
          rows={3}
          className="mt-1.5 w-full resize-none rounded-[12px] border border-slate-200 bg-white px-3 py-2 text-[12px] leading-5 text-slate-700 outline-none focus:border-cyan-200 focus:ring-2 focus:ring-cyan-100"
        />
      </label>

      <button
        type="button"
        onClick={onRun}
        disabled={!checkNodeReady(node, [], [])}
        className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-[12px] bg-slate-900 px-4 text-[12px] font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        <Scan className="h-3.5 w-3.5" />
        结构化角色画像
      </button>

      {node.data.structuredProfile ? (
        <div className="rounded-[14px] border border-slate-200 bg-slate-950 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-cyan-200">JSON Schema v1</span>
            <span className="text-[10px] text-slate-400">可接后续选题链路</span>
          </div>
          <pre className="custom-scrollbar max-h-52 overflow-auto whitespace-pre-wrap break-all text-[10px] leading-4 text-slate-100">
            {node.data.text || JSON.stringify(node.data.structuredProfile, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
