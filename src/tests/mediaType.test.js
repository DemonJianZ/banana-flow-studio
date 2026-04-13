import test from "node:test";
import assert from "node:assert/strict";

import { isVideoContent } from "../lib/mediaType.js";

test("isVideoContent recognizes data URL mime type without scanning base64 payload", () => {
  assert.equal(isVideoContent("data:video/mp4;base64,AAAA"), true);
  assert.equal(isVideoContent("data:image/png;base64,ZmFrZW0zdTg="), false);
});

test("isVideoContent still detects regular video urls", () => {
  assert.equal(isVideoContent("https://example.com/demo.mp4"), true);
  assert.equal(isVideoContent("/api/output_video?id=1"), true);
  assert.equal(isVideoContent("https://example.com/demo.png"), false);
});
