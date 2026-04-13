import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCanvasNodePrompt,
  extractCanvasSupplementalPrompt,
} from "../components/agent-canvas/promptUtils.js";

test("extractCanvasSupplementalPrompt reads inline supplemental prompt", () => {
  assert.equal(
    extractCanvasSupplementalPrompt(
      "帮我搭一个文生图流程\n\n补充画面提示词：一瓶极简风洗面奶产品图，白底，棚拍光，高清细节。",
    ),
    "一瓶极简风洗面奶产品图，白底，棚拍光，高清细节。",
  );
});

test("buildCanvasNodePrompt joins prompt template fields for prompt modes", () => {
  const prompt = buildCanvasNodePrompt({
    data: {
      mode: "text2img",
      prompt: "A clean commercial product photo",
      templates: {
        style: "minimal",
        vibe: "studio light",
        direction: "front view",
        note: "white background",
      },
    },
  });

  assert.equal(
    prompt,
    "A clean commercial product photo, minimal, studio light, front view, white background",
  );
});

test("buildCanvasNodePrompt prefers upstream text when present", () => {
  const prompt = buildCanvasNodePrompt(
    {
      data: {
        mode: "multi_image_generate",
        prompt: "base prompt",
        templates: { note: "extra note" },
      },
    },
    "upstream prompt",
  );

  assert.equal(prompt, "upstream prompt");
});

test("buildCanvasNodePrompt keeps video prompts stable", () => {
  const prompt = buildCanvasNodePrompt({
    data: {
      mode: "img2video",
      prompt: "natural motion",
      templates: { note: "slow camera move" },
    },
  });

  assert.equal(prompt, "natural motion, slow camera move");
});
