const VIDEO_EXTENSION_PATTERN = /\.(mp4|webm|mov|m4v|avi|mkv|m3u8)(?:$|[?#])/i;
const BINARY_VIDEO_PATTERN = /\.(bin)(?:$|[?#])/i;
const VIDEO_URL_HINT_PATTERN = /\/video\b|output_video|play_url|m3u8|mime=video|content_type=video|hdai_chat/i;

const getInspectableUrlText = (value) => {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const parsed = new URL(text, "http://localhost");
    return `${parsed.pathname}${parsed.search}`.toLowerCase();
  } catch {
    return text.toLowerCase();
  }
};

export const isVideoContent = (value) => {
  const text = String(value || "").trim();
  if (!text) return false;
  const lower = text.toLowerCase();

  if (lower.startsWith("data:")) {
    const headerEnd = lower.indexOf(",");
    const metadata = lower.slice(0, headerEnd >= 0 ? headerEnd : lower.length);
    if (metadata.startsWith("data:video/")) return true;
    if (metadata.startsWith("data:image/")) return false;
    return false;
  }

  if (VIDEO_EXTENSION_PATTERN.test(text)) return true;
  if (BINARY_VIDEO_PATTERN.test(text)) return true;

  return VIDEO_URL_HINT_PATTERN.test(getInspectableUrlText(text));
};
