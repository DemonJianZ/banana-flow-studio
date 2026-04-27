import { isVideoContent } from "./mediaType.js";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "bmp", "avif"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "m4v", "avi", "mkv", "m3u8"]);
const PRIORITY_KEYS = [
  "image_url",
  "imageUrl",
  "image",
  "url",
  "src",
  "output_url",
  "outputUrl",
  "result_url",
  "resultUrl",
  "file_url",
  "fileUrl",
  "download_url",
  "downloadUrl",
  "remote_url",
  "remoteUrl",
  "origin_url",
  "originUrl",
  "oss_url",
  "ossUrl",
];
const IMAGE_HINT_URL_KEYS = [
  "url",
  "src",
  "file_url",
  "fileUrl",
  "download_url",
  "downloadUrl",
  "image_url",
  "imageUrl",
  "output_url",
  "outputUrl",
  "result_url",
  "resultUrl",
  "remote_url",
  "remoteUrl",
  "origin_url",
  "originUrl",
  "oss_url",
  "ossUrl",
];
const MIME_KEYS = ["content_type", "contentType", "mime_type", "mimeType", "type"];
const EXT_KEYS = ["ext", "extension"];
const URLISH_KEYS = new Set([...PRIORITY_KEYS, "video_url", "videoUrl", "output_video", "play_url"]);
const TRAILING_PUNCTUATION = new Set([",", "，", "。", ";", "；"]);
const MARKDOWN_IMAGE_PATTERN = /!\[[^\]]*]\(([^)]+)\)/gi;
const URL_CANDIDATE_PATTERN =
  /(?:^|[\s"'`([{:,])((?:data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+|blob:[^\s"'`<>]+|https?:\/\/[^\s"'`<>]+|\/\/[^\s"'`<>]+|\/(?!\/)[^\s"'`<>]+))/gi;

const isObjectLike = (value) => Boolean(value) && typeof value === "object";

const getProtocolPrefix = () => {
  try {
    return window?.location?.protocol || "https:";
  } catch {
    return "https:";
  }
};

const countChar = (value, pattern) => value.match(pattern)?.length || 0;

const cleanupEdgeQuotes = (value) => {
  let next = String(value || "").trim();
  while (next.length >= 2) {
    const first = next[0];
    const last = next[next.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'") || (first === "`" && last === "`")) {
      next = next.slice(1, -1).trim();
      continue;
    }
    break;
  }
  return next;
};

const stripTrailingNoise = (value) => {
  let next = value;
  while (next) {
    const last = next[next.length - 1];
    if (last === '"' || last === "'" || last === "`") {
      next = next.slice(0, -1).trimEnd();
      continue;
    }
    if (TRAILING_PUNCTUATION.has(last)) {
      next = next.slice(0, -1).trimEnd();
      continue;
    }
    if (last === ")" && countChar(next, /\(/g) < countChar(next, /\)/g)) {
      next = next.slice(0, -1).trimEnd();
      continue;
    }
    if (last === "]" && countChar(next, /\[/g) < countChar(next, /]/g)) {
      next = next.slice(0, -1).trimEnd();
      continue;
    }
    if (last === "}" && countChar(next, /{/g) < countChar(next, /}/g)) {
      next = next.slice(0, -1).trimEnd();
      continue;
    }
    break;
  }
  return next;
};

const getPathnameLike = (value) => {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^data:/i.test(text) || /^blob:/i.test(text)) return text.toLowerCase();
  try {
    return new URL(text, "https://example.com").pathname.toLowerCase();
  } catch {
    return text.toLowerCase();
  }
};

const getExtension = (value) => {
  const pathname = getPathnameLike(value);
  const matched = pathname.match(/\.([a-z0-9]+)(?:$|[?#])/i) || pathname.match(/\.([a-z0-9]+)$/i);
  return String(matched?.[1] || "").toLowerCase();
};

const isUrlLike = (value) => {
  const text = String(value || "").trim();
  if (!text) return false;
  if (/^data:image\//i.test(text)) return true;
  if (/^blob:/i.test(text)) return true;
  if (/^https?:\/\//i.test(text)) return true;
  if (/^\/\//.test(text)) return true;
  if (text.startsWith("/")) return true;
  return false;
};

const getObjectMediaHint = (payload) => {
  for (const key of MIME_KEYS) {
    const value = String(payload?.[key] || "").trim().toLowerCase();
    if (value.startsWith("image/")) return "image";
    if (value.startsWith("video/")) return "video";
  }
  for (const key of EXT_KEYS) {
    const ext = String(payload?.[key] || "")
      .trim()
      .toLowerCase()
      .replace(/^\./, "");
    if (IMAGE_EXTENSIONS.has(ext)) return "image";
    if (VIDEO_EXTENSIONS.has(ext)) return "video";
  }
  return "";
};

const appendCandidate = (target, raw, forceImage = false) => {
  const normalized = normalizeImageUrl(raw);
  if (!normalized) return;
  if (forceImage) {
    if (isUrlLike(normalized) && !isVideoContent(normalized) && !/^data:video\//i.test(normalized)) {
      if (!target.includes(normalized)) target.push(normalized);
    }
    return;
  }
  if (isLikelyImageUrl(normalized) && !target.includes(normalized)) {
    target.push(normalized);
  }
};

const collectImageUrlCandidates = (payload, seen, candidates, options = {}) => {
  if (!payload) return;
  const { forceImage = false } = options;

  if (typeof payload === "string") {
    const text = cleanupEdgeQuotes(String(payload || ""));
    if (!text) return;
    const maybeJsonText = stripTrailingNoise(text);

    if (
      (maybeJsonText.startsWith("{") && maybeJsonText.endsWith("}")) ||
      (maybeJsonText.startsWith("[") && maybeJsonText.endsWith("]"))
    ) {
      try {
        collectImageUrlCandidates(JSON.parse(maybeJsonText), seen, candidates, { forceImage });
      } catch {
        // Ignore malformed JSON-ish strings and continue with text extraction.
      }
    }

    appendCandidate(candidates, text, forceImage);

    for (const match of text.matchAll(MARKDOWN_IMAGE_PATTERN)) {
      appendCandidate(candidates, match[1], forceImage);
    }
    for (const match of text.matchAll(URL_CANDIDATE_PATTERN)) {
      appendCandidate(candidates, match[1], forceImage);
    }
    return;
  }

  if (Array.isArray(payload)) {
    for (const item of payload) {
      collectImageUrlCandidates(item, seen, candidates, { forceImage });
      if (candidates.length > 0) return;
    }
    return;
  }

  if (!isObjectLike(payload)) return;
  if (seen?.has?.(payload)) return;
  seen?.add?.(payload);

  const mediaHint = getObjectMediaHint(payload);

  if (mediaHint === "image") {
    for (const key of IMAGE_HINT_URL_KEYS) {
      collectImageUrlCandidates(payload[key], seen, candidates, { forceImage: true });
      if (candidates.length > 0) return;
    }
  }

  if (mediaHint !== "video") {
    for (const key of PRIORITY_KEYS) {
      collectImageUrlCandidates(payload[key], seen, candidates, { forceImage: mediaHint === "image" });
      if (candidates.length > 0) return;
    }
  }

  for (const [key, value] of Object.entries(payload)) {
    if (mediaHint === "video" && URLISH_KEYS.has(key)) continue;
    collectImageUrlCandidates(value, seen, candidates);
    if (candidates.length > 0) return;
  }
};

export const normalizeImageUrl = (raw) => {
  let text = cleanupEdgeQuotes(String(raw || ""));
  if (!text) return "";

  text = text.replace(/\\\//g, "/").replace(/&amp;/gi, "&").trim();

  const markdownMatch = text.match(/^!\[[^\]]*]\((.+)\)$/i);
  if (markdownMatch?.[1]) {
    text = markdownMatch[1].trim();
  }

  text = cleanupEdgeQuotes(text);
  text = stripTrailingNoise(text);

  if (text.startsWith("//")) {
    text = `${getProtocolPrefix()}${text}`;
  }

  return text.trim();
};

export const isLikelyImageUrl = (raw) => {
  const text = normalizeImageUrl(raw);
  if (!text) return false;
  if (/^data:video\//i.test(text) || isVideoContent(text)) return false;
  if (/^data:image\//i.test(text)) return true;
  if (/^blob:/i.test(text)) return true;
  if (!isUrlLike(text)) return false;
  const ext = getExtension(text);
  return IMAGE_EXTENSIONS.has(ext);
};

export const extractImageUrlCandidatesFromText = (value) => {
  const candidates = [];
  collectImageUrlCandidates(value, new WeakSet(), candidates);
  return candidates;
};

export const pickFirstImageUrl = (payload, seen = new WeakSet()) => {
  const candidates = [];
  collectImageUrlCandidates(payload, seen, candidates);
  return candidates[0] || "";
};
