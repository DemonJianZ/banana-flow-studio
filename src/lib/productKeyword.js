const PRODUCT_TERMS = [
  "洗面奶",
  "洁面",
  "眼霜",
  "防晒",
  "防晒霜",
  "面膜",
  "精华",
  "粉底",
  "粉底液",
  "卸妆",
  "卸妆水",
  "卸妆油",
  "身体乳",
  "洗发水",
  "护发素",
  "发膜",
  "沐浴露",
  "牙膏",
  "益生菌",
  "维生素",
  "胶原蛋白",
  "咖啡",
  "燕麦",
  "耳机",
  "吹风机",
  "香水",
  "口红",
  "唇釉",
  "乳液",
  "面霜",
  "精油",
];

const GENERIC_MISSION_TERMS = new Set([
  "帮我",
  "给我",
  "请",
  "做",
  "做个",
  "做一条",
  "写",
  "写个",
  "写一条",
  "生成",
  "设计",
  "策划",
  "脚本",
  "爆款脚本",
  "文案",
  "方案",
  "视频",
  "短视频",
  "口播",
  "内容",
  "营销",
  "带货",
  "产品",
  "品类",
  "素材",
]);

function normalizeProductCandidate(value) {
  let text = String(value || "").trim();
  if (!text) return "";
  text = text
    .replace(/^(一个|一款|一支|一瓶|一套|这种|这款|这个|那个|那款)/, "")
    .replace(/(脚本|爆款脚本|文案|方案|视频|短视频|口播|内容|营销|带货)+$/g, "")
    .trim();
  if (!text || text.length < 2 || text.length > 24) return "";
  if (GENERIC_MISSION_TERMS.has(text)) return "";
  return text;
}

export function extractProductKeyword(text) {
  const source = String(text || "").trim();
  if (!source) return "";
  const hits = PRODUCT_TERMS.filter((item) => source.includes(item));
  if (hits.length) {
    hits.sort((a, b) => b.length - a.length);
    return hits[0];
  }

  const patterns = [
    /(?:帮我|给我|请)?(?:做|写|生成|设计|策划)?(?:一个|一款|一支|一瓶|一套|条)?([\u4e00-\u9fa5A-Za-z0-9·-]{2,24})(?:的)?(?:爆款)?(?:脚本|文案|方案|视频|短视频|口播|内容)/i,
    /(?:关于|做|写|生成|设计|策划)([\u4e00-\u9fa5A-Za-z0-9·-]{2,24})/i,
    /([\u4e00-\u9fa5A-Za-z0-9·-]{2,24})(?:产品|品类)/i,
  ];
  for (const reg of patterns) {
    const match = source.match(reg);
    if (!match?.[1]) continue;
    const normalized = normalizeProductCandidate(match[1]);
    if (normalized) return normalized;
  }

  const tokens = source.match(/[\u4e00-\u9fa5A-Za-z0-9·-]{2,24}/g) || [];
  for (const token of tokens) {
    const normalized = normalizeProductCandidate(token);
    if (normalized) return normalized;
  }
  return "";
}
