import React from "react";
import { API_BASE } from "../../../config";

export default function LocalAssetImageNodeRenderer({ node }) {
  const assetUrl = String(node.data?.url || "").trim();
  const fullUrl = assetUrl ? `${(API_BASE || "").replace(/\/+$/, "")}${assetUrl}` : "";
  const charName = String(node.data?.character_name || "").trim();
  const assetName = String(node.data?.asset_name || "").trim();

  return (
    <div className="nodrag p-2">
      <div className="overflow-hidden rounded-[10px] border border-slate-100 bg-slate-50">
        {fullUrl ? (
          <img
            src={fullUrl}
            alt={charName || assetName || "三视图"}
            title={assetName || fullUrl}
            className="w-full object-contain"
            style={{ maxHeight: 240 }}
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <div className="flex h-32 items-center justify-center text-[11px] text-slate-400">无图片</div>
        )}
      </div>
      {charName ? <div className="mt-1.5 text-center text-[11px] text-slate-600">{charName}</div> : null}
    </div>
  );
}
