import test from "node:test";
import assert from "node:assert/strict";

import { buildHitlFeedbackRows } from "../agent/hitlFeedbackHistory.js";

test("buildHitlFeedbackRows keeps feedback explanation and sorts by updatedAt desc", () => {
  const turns = [
    {
      id: "t1",
      createdAt: 100,
      memorySuggestions: [
        {
          id: "s1",
          key: "platform",
          value: "小红书",
          status: "saved",
          reason: "检测到长期偏好表达",
          updatedAt: 200,
        },
      ],
      qualityFeedback: {
        status: "harvested",
        reason: "资产匹配回归:镜头命中偏差",
        caseId: "case_1",
        updatedAt: 240,
      },
    },
    {
      id: "t2",
      createdAt: 300,
      memorySuggestions: [
        {
          id: "s2",
          key: "tone",
          value: ["真实生活感"],
          status: "ignored",
          reason: "用户忽略",
          updatedAt: 310,
        },
      ],
    },
  ];

  const rows = buildHitlFeedbackRows(turns);

  assert.equal(rows.length, 3);
  assert.equal(rows[0].updatedAt, 310);
  assert.equal(rows[1].updatedAt, 240);
  assert.equal(rows[2].updatedAt, 200);
  assert.equal(rows[1].kind, "regression");
  assert.equal(rows[1].reason, "资产匹配回归:镜头命中偏差");
  assert.equal(rows[1].caseId, "case_1");
});

test("buildHitlFeedbackRows ignores non-final suggestion states", () => {
  const rows = buildHitlFeedbackRows([
    {
      id: "t1",
      createdAt: 100,
      memorySuggestions: [
        { id: "s1", status: "pending" },
        { id: "s2", status: "error" },
        { id: "s3", status: "saved", key: "platform", value: "抖音", updatedAt: 120 },
      ],
    },
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "saved");
});
