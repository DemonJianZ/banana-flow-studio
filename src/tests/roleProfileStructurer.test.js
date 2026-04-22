import test from "node:test";
import assert from "node:assert/strict";

import {
  ROLE_PROFILE_SCHEMA_VERSION,
  buildRoleProfileStructuredOutput,
} from "../lib/roleProfileStructurer.js";

test("buildRoleProfileStructuredOutput returns stable role profile schema", () => {
  const profile = buildRoleProfileStructuredOutput({
    roleName: "林晚",
    characterSetting: "表面上是豪门养女，内心缺爱。她想要证明自己，害怕再次被抛弃。",
    relationshipNetwork: "与顾沉是前任恋人，存在误会；和许安是盟友；与继母是敌人。",
    worldviewBackground: "豪门家族以继承权为核心规则，舆论会影响婚约。",
  });

  assert.equal(profile.schema_version, ROLE_PROFILE_SCHEMA_VERSION);
  assert.equal(profile.role_identity_layer.role_name.value, "林晚");
  assert.equal(profile.role_identity_layer.role_name.source, "explicit");
  assert.equal(profile.drive_layer.core_desire.source, "inferred");
  assert.equal(profile.drive_layer.core_fear.source, "inferred");
  assert.ok(Array.isArray(profile.relationship_hint_layer.relationship_edges));
  assert.ok(profile.relationship_hint_layer.relationship_edges.length >= 2);
  assert.ok(profile.drama_leverage_layer.conflict_vectors.values.includes("desire_vs_fear"));
});

test("buildRoleProfileStructuredOutput marks missing fields for downstream weighting", () => {
  const profile = buildRoleProfileStructuredOutput({ roleName: "阿青" });

  assert.equal(profile.role_identity_layer.role_name.value, "阿青");
  assert.ok(profile.consistency_checks.missing_fields.includes("character_setting"));
  assert.ok(profile.consistency_checks.risk_notes.length > 0);
});
