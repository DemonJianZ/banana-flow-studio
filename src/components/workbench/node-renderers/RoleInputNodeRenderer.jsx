import React from "react";
import { ImageIcon } from "lucide-react";

export default function RoleInputNodeRenderer({ node }) {
  return (
    <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100">
      {node.data.referenceImage ? (
        <img
          src={node.data.referenceImage}
          alt={node.data.name || "角色头像"}
          className="h-full w-full object-cover"
        />
      ) : (
        <ImageIcon className="h-6 w-6 text-slate-400" />
      )}
    </div>
  );
}
