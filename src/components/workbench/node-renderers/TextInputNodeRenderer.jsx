import React from "react";
import PersonaMentionTextarea from "../PersonaMentionTextarea";

export default function TextInputNodeRenderer({
  node,
  updateData,
  personas,
}) {
  return (
    <div className="space-y-2 p-4">
      <div className="wbn-input-editor relative rounded-[8px] p-0 transition-colors">
        <PersonaMentionTextarea
          wrapperClassName="nodrag"
          className="nodrag block min-h-[142px] w-full resize-none border-0 bg-transparent px-0 py-0 pb-10 font-mono text-[12px] leading-6 text-slate-800 outline-none placeholder:text-slate-400"
          overlayClassName="px-0 py-0 pb-10 font-mono text-[12px] leading-6"
          personas={personas}
          rows={5}
          placeholder="例如：一只戴宇航头盔的橘猫站在雨夜霓虹街头，电影感打光，低机位，浅景深。"
          value={node.data.text || ""}
          onChange={(event) => {
            updateData(node.id, { text: event.target.value });
          }}
          onMouseDown={(event) => event.stopPropagation()}
        />
      </div>
    </div>
  );
}
