const registry = new Map();

export const DEFAULT_NODE_RENDERER_TYPES = Object.freeze([
  "input",
  "text_input",
  "output",
  "storyboard_input",
  "local_asset_image",
  "role_input",
  "role_structurer",
  "processor",
  "post_processor",
  "video_gen",
  "storyboard_plan",
]);

export function registerNodeRenderer(type, renderer) {
  const normalizedType = String(type || "").trim();
  if (!normalizedType) throw new Error("Node renderer type is required");
  if (typeof renderer !== "function") throw new Error(`Node renderer for ${normalizedType} must be a function`);
  registry.set(normalizedType, renderer);
}

export function getNodeRenderer(type) {
  return registry.get(String(type || "").trim()) || null;
}

export function hasNodeRenderer(type) {
  return registry.has(String(type || "").trim());
}

export function clearNodeRendererRegistryForTest() {
  registry.clear();
}

export function listNodeRendererTypes() {
  return Array.from(registry.keys());
}

export function registerDefaultNodeRenderers(renderers = {}) {
  DEFAULT_NODE_RENDERER_TYPES.forEach((type) => {
    const renderer = renderers[type];
    if (typeof renderer === "function") registerNodeRenderer(type, renderer);
  });
}
