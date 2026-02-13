import React, { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { APP_NOTIFY_EVENT } from "../lib/notify";

const TYPE_STYLES = {
  info: {
    icon: Info,
    className: "border-sky-500/40 bg-sky-500/10 text-sky-100",
  },
  success: {
    icon: CheckCircle2,
    className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-100",
  },
  warning: {
    icon: TriangleAlert,
    className: "border-amber-500/40 bg-amber-500/10 text-amber-100",
  },
  error: {
    icon: AlertCircle,
    className: "border-red-500/40 bg-red-500/10 text-red-100",
  },
};

export default function GlobalToast() {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const handler = (event) => {
      const payload = event.detail || {};
      if (!payload?.message) return;
      clearTimer();
      const next = {
        type: payload.type || "info",
        message: payload.message,
        duration: Number(payload.duration) > 0 ? Number(payload.duration) : 3000,
      };
      setToast(next);
      timerRef.current = window.setTimeout(() => {
        setToast(null);
        timerRef.current = null;
      }, next.duration);
    };

    window.addEventListener(APP_NOTIFY_EVENT, handler);
    return () => {
      window.removeEventListener(APP_NOTIFY_EVENT, handler);
      clearTimer();
    };
  }, []);

  if (!toast) return null;
  const style = TYPE_STYLES[toast.type] || TYPE_STYLES.info;
  const Icon = style.icon;

  return (
    <div className="fixed top-4 right-4 z-[120] max-w-sm w-[calc(100vw-2rem)]">
      <div className={`rounded-xl border px-3 py-2.5 shadow-2xl backdrop-blur-sm ${style.className}`}>
        <div className="flex items-start gap-2">
          <Icon className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="text-sm leading-5 flex-1">{toast.message}</div>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="p-0.5 rounded hover:bg-black/20 transition-colors"
            aria-label="关闭提示"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
