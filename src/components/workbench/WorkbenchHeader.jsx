import React from "react";
import { Server } from "lucide-react";

export default function WorkbenchHeader({ isAdminUser = false, agentDevMode = false, apiStatus = "offline" }) {
  return (
    <header className="relative z-50 flex h-[56px] select-none items-center justify-between border-b border-[rgba(15,23,42,0.06)] bg-white px-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex min-w-0 flex-col">
          <span className="truncate bg-[linear-gradient(135deg,#0f172a_0%,#1e293b_58%,#475569_100%)] bg-clip-text text-[18px] font-semibold leading-tight text-transparent [font-family:Inter,Roboto,'Helvetica_Neue',Arial,sans-serif]">
            Yu Canvas
          </span>
          <span className="truncate text-[10px] font-medium tracking-[0.08em] text-slate-500">
            AI小禹无限画布
          </span>
        </div>
      </div>

      {isAdminUser && agentDevMode ? (
        <div
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[10px] ${
            apiStatus === "online"
              ? "border-emerald-200 bg-emerald-50 text-emerald-600"
              : "border-rose-200 bg-rose-50 text-rose-600"
          }`}
        >
          <Server className="h-3 w-3" />
          {apiStatus === "online" ? "API Online" : "API Offline"}
        </div>
      ) : null}
    </header>
  );
}
