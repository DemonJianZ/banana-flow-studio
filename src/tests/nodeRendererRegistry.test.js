import assert from "node:assert/strict";
import test from "node:test";
import {
  clearNodeRendererRegistryForTest,
  getNodeRenderer,
  hasNodeRenderer,
  listNodeRendererTypes,
  registerDefaultNodeRenderers,
  registerNodeRenderer,
} from "../components/workbench/node-renderers/NodeRendererRegistry.js";

const NODE_TYPES = {
  INPUT: "input",
  TEXT_INPUT: "text_input",
  OUTPUT: "output",
  PROCESSOR: "processor",
  POST_PROCESSOR: "post_processor",
  VIDEO_GEN: "video_gen",
  STORYBOARD_PLAN: "storyboard_plan",
  LOCAL_ASSET_IMAGE: "local_asset_image",
};

test("NodeRendererRegistry registers and resolves renderers", () => {
  clearNodeRendererRegistryForTest();
  const renderer = () => null;

  registerNodeRenderer(NODE_TYPES.INPUT, renderer);

  assert.equal(hasNodeRenderer(NODE_TYPES.INPUT), true);
  assert.equal(getNodeRenderer(NODE_TYPES.INPUT), renderer);
  assert.deepEqual(listNodeRendererTypes(), [NODE_TYPES.INPUT]);
});

test("registerDefaultNodeRenderers only registers provided renderer functions", () => {
  clearNodeRendererRegistryForTest();
  const inputRenderer = () => null;
  const textRenderer = () => null;

  registerDefaultNodeRenderers({
    [NODE_TYPES.INPUT]: inputRenderer,
    [NODE_TYPES.TEXT_INPUT]: textRenderer,
    [NODE_TYPES.OUTPUT]: null,
  });

  assert.equal(getNodeRenderer(NODE_TYPES.INPUT), inputRenderer);
  assert.equal(getNodeRenderer(NODE_TYPES.TEXT_INPUT), textRenderer);
  assert.equal(hasNodeRenderer(NODE_TYPES.OUTPUT), false);
});

test("registerDefaultNodeRenderers covers specialized node types", () => {
  clearNodeRendererRegistryForTest();
  const renderer = () => null;

  registerDefaultNodeRenderers({
    [NODE_TYPES.PROCESSOR]: renderer,
    [NODE_TYPES.POST_PROCESSOR]: renderer,
    [NODE_TYPES.VIDEO_GEN]: renderer,
    [NODE_TYPES.STORYBOARD_PLAN]: renderer,
    [NODE_TYPES.LOCAL_ASSET_IMAGE]: renderer,
  });

  assert.equal(getNodeRenderer(NODE_TYPES.PROCESSOR), renderer);
  assert.equal(getNodeRenderer(NODE_TYPES.POST_PROCESSOR), renderer);
  assert.equal(getNodeRenderer(NODE_TYPES.VIDEO_GEN), renderer);
  assert.equal(getNodeRenderer(NODE_TYPES.STORYBOARD_PLAN), renderer);
  assert.equal(getNodeRenderer(NODE_TYPES.LOCAL_ASSET_IMAGE), renderer);
});
