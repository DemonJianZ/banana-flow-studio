const PROMPT_MODES = new Set(["text2img", "local_text2img", "multi_image_generate"]);
const USER_PROMPT_MARKER = "补充画面提示词：";

const cleanText = (value) => String(value ?? "").trim();
const stripPromptPrefix = (value) =>
  cleanText(value)
    .replace(/^edit the input image:\s*/i, "")
    .replace(/^refine the image:\s*/i, "")
    .trim();

const joinPromptParts = (parts) => parts.map(cleanText).filter(Boolean).join(", ");

export const extractCanvasSupplementalPrompt = (userPrompt, supplementalPrompt = "") => {
  const direct = cleanText(supplementalPrompt);
  if (direct) return direct;
  const text = cleanText(userPrompt);
  if (!text) return "";
  const idx = text.lastIndexOf(USER_PROMPT_MARKER);
  if (idx < 0) return "";
  return text.slice(idx + USER_PROMPT_MARKER.length).trim();
};

export const buildCanvasNodePrompt = (node, upstreamText = "") => {
  const mode = cleanText(node?.data?.mode);
  const prompt = cleanText(node?.data?.prompt);
  const templates = node?.data?.templates && typeof node.data.templates === "object" ? node.data.templates : {};
  const upstream = cleanText(upstreamText);

  if (upstream) {
    return upstream;
  }

  if (mode === "feature_extract") {
    return prompt || cleanText(templates.note) || "";
  }

  if (mode === "rmbg" || mode === "multi_angleshots" || mode === "video_upscale") {
    return prompt || "";
  }

  if (mode === "img2video" || mode === "local_img2video") {
    return joinPromptParts([prompt, templates.note]) || prompt || "natural motion";
  }

  if (PROMPT_MODES.has(mode)) {
    return joinPromptParts([prompt, templates.style, templates.vibe, templates.direction, templates.note]) || prompt || "";
  }

  if (mode === "relight") {
    return joinPromptParts([prompt, templates.style, templates.vibe, templates.direction, templates.note]) || prompt || "";
  }

  return joinPromptParts([prompt, templates.style, templates.vibe, templates.direction, templates.note]) || prompt || "";
};
