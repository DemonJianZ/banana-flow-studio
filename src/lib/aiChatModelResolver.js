const DEFAULT_NANO_BANANA2_KEYWORDS = [
  "nano banana2",
  "nano banana 2",
  "nanobanana2",
  "nanobanana 2",
  "banana2",
  "banana 2",
];

const pickModelField = (record, keys = []) => {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
};

const extractAIChatModelRecords = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  const queue = [payload];
  const visited = new Set();
  const preferredKeys = ["list", "records", "items", "rows", "models", "model_list", "data", "result"];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== "object" || visited.has(current)) continue;
    visited.add(current);

    for (const key of preferredKeys) {
      if (Array.isArray(current[key])) return current[key];
    }

    for (const value of Object.values(current)) {
      if (Array.isArray(value)) return value;
      if (value && typeof value === "object") queue.push(value);
    }
  }

  return [];
};

const normalizeAIChatModelOption = (record) => {
  if (typeof record === "string") {
    const value = record.trim();
    return value ? { id: value, name: value, vendor: "" } : null;
  }
  if (!record || typeof record !== "object") return null;

  const id = pickModelField(record, [
    "model",
    "model_id",
    "ai_chat_model",
    "ai_chat_model_id",
    "id",
    "value",
    "code",
  ]);
  const name = pickModelField(record, [
    "ai_model_name",
    "model_name",
    "ai_chat_model_name",
    "name",
    "label",
    "title",
    "text",
    "desc",
  ]);
  const vendor = pickModelField(record, [
    "vendor",
    "vendor_name",
    "provider",
    "provider_name",
    "company",
    "company_name",
    "platform",
    "platform_name",
    "source",
  ]);

  if (!id && !name) return null;
  return { id: id || name, name: name || id, vendor };
};

export const findAIChatModelIdByKeywords = (payload, keywords = DEFAULT_NANO_BANANA2_KEYWORDS) => {
  const normalizedKeywords = keywords.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean);
  if (!normalizedKeywords.length) return "";

  const options = extractAIChatModelRecords(payload)
    .map((item) => normalizeAIChatModelOption(item))
    .filter(Boolean);

  for (const option of options) {
    const haystack = [option.id, option.name, option.vendor].join(" ").toLowerCase();
    if (normalizedKeywords.some((keyword) => haystack.includes(keyword))) {
      return String(option.id || "").trim();
    }
  }

  return "";
};
