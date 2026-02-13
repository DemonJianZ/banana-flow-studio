export const APP_NOTIFY_EVENT = "bananaflow:notify";

export function notifyApp({ type = "info", message = "", duration = 3000 } = {}) {
  if (typeof window === "undefined" || !message) return;
  window.dispatchEvent(
    new CustomEvent(APP_NOTIFY_EVENT, {
      detail: { type, message, duration },
    }),
  );
}
