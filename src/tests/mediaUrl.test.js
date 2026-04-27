import test from "node:test";
import assert from "node:assert/strict";

import {
  extractImageUrlCandidatesFromText,
  isLikelyImageUrl,
  normalizeImageUrl,
  pickFirstImageUrl,
} from "../lib/mediaUrl.js";

test("pickFirstImageUrl extracts a regular https image url", () => {
  assert.equal(pickFirstImageUrl("https://example.com/a.png"), "https://example.com/a.png");
});

test("extractImageUrlCandidatesFromText handles markdown image syntax without trailing parenthesis", () => {
  assert.deepEqual(extractImageUrlCandidatesFromText("![](https://example.com/a.png)"), ["https://example.com/a.png"]);
});

test("pickFirstImageUrl cleans trailing punctuation and escaped characters from json text", () => {
  const payload = '{"result":{"download_url":"https:\\/\\/cdn.example.com\\/a.png?x=1&amp;y=2"}}, ]}，。；';
  assert.equal(pickFirstImageUrl(payload), "https://cdn.example.com/a.png?x=1&y=2");
});

test("pickFirstImageUrl supports data image urls", () => {
  const value = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA";
  assert.equal(pickFirstImageUrl(value), value);
});

test("pickFirstImageUrl supports blob urls", () => {
  const value = "blob:https://example.com/1234";
  assert.equal(pickFirstImageUrl(value), value);
});

test("normalizeImageUrl resolves protocol-relative urls with current protocol", () => {
  const previousWindow = globalThis.window;
  globalThis.window = { location: { protocol: "https:" } };
  try {
    assert.equal(normalizeImageUrl("//cdn.example.com/a.png"), "https://cdn.example.com/a.png");
  } finally {
    globalThis.window = previousWindow;
  }
});

test("pickFirstImageUrl supports relative image paths", () => {
  assert.equal(pickFirstImageUrl("/uploads/a.png"), "/uploads/a.png");
});

test("pickFirstImageUrl finds nested urls in objects", () => {
  assert.equal(
    pickFirstImageUrl({ data: { list: [{ url: "https://example.com/a.webp" }] } }),
    "https://example.com/a.webp",
  );
});

test("pickFirstImageUrl uses file and download style keys", () => {
  assert.equal(pickFirstImageUrl({ file_url: "https://example.com/a.jpg" }), "https://example.com/a.jpg");
  assert.equal(pickFirstImageUrl({ download_url: "https://example.com/a.gif" }), "https://example.com/a.gif");
  assert.equal(pickFirstImageUrl({ oss_url: "https://example.com/a.avif" }), "https://example.com/a.avif");
});

test("pickFirstImageUrl uses image mime hints for extensionless urls", () => {
  assert.equal(
    pickFirstImageUrl({ content_type: "image/png", url: "https://example.com/download?id=1" }),
    "https://example.com/download?id=1",
  );
});

test("pickFirstImageUrl ignores common video urls", () => {
  assert.equal(pickFirstImageUrl("https://example.com/demo.mp4"), "");
  assert.equal(pickFirstImageUrl({ url: "https://example.com/demo.webm" }), "");
  assert.equal(pickFirstImageUrl({ type: "video/mp4", url: "blob:https://example.com/video" }), "");
  assert.equal(isLikelyImageUrl("https://example.com/live.m3u8"), false);
});

test("pickFirstImageUrl does not loop forever on circular references", () => {
  const payload = { data: { list: [{ url: "https://example.com/a.webp" }] } };
  payload.self = payload;
  assert.equal(pickFirstImageUrl(payload), "https://example.com/a.webp");
});
