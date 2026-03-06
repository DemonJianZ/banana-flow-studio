import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_PREFS,
  QUICK_TEMPLATES,
  asArray,
  buildClearablePreferenceKeys,
  countActivePreferences,
  normalizeImportedProfile,
} from "../components/agent-canvas/preferencesPanelUtils.js";

test("asArray normalizes scalar and array values", () => {
  assert.deepEqual(asArray(" 小红书 "), ["小红书"]);
  assert.deepEqual(asArray([" 抖音 ", "", null, "快手"]), ["抖音", "快手"]);
  assert.deepEqual(asArray(""), []);
});

test("normalizeImportedProfile keeps supported keys and formats multi values", () => {
  const profile = normalizeImportedProfile({
    name: "我的档案",
    values: {
      platform: "小红书",
      tone: "真实生活感",
      camera_style: ["特写多", "POV"],
      risk_posture: "平衡",
      unknown_key: "x",
    },
  });

  assert.ok(profile);
  assert.equal(profile.name, "我的档案");
  assert.equal(profile.values.platform, "小红书");
  assert.deepEqual(profile.values.tone, ["真实生活感"]);
  assert.deepEqual(profile.values.camera_style, ["特写多", "POV"]);
  assert.equal(profile.values.risk_posture, "平衡");
  assert.equal(profile.values.unknown_key, undefined);
});

test("countActivePreferences and buildClearablePreferenceKeys only include active records", () => {
  const byKey = {
    platform: { is_active: true },
    tone: { is_active: 1 },
    camera_style: { is_active: false },
    risk_posture: { is_active: true },
  };
  assert.equal(countActivePreferences(byKey), 3);
  assert.deepEqual(buildClearablePreferenceKeys(byKey).sort(), ["platform", "risk_posture", "tone"]);
});

test("default and quick templates are available for quick actions", () => {
  assert.equal(DEFAULT_PREFS.platform, "抖音");
  assert.equal(DEFAULT_PREFS.risk_posture, "平衡");
  assert.ok(Array.isArray(QUICK_TEMPLATES));
  assert.ok(QUICK_TEMPLATES.length >= 2);
  assert.ok(QUICK_TEMPLATES.some((tpl) => tpl.values && tpl.values.platform));
});
