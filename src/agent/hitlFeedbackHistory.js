export function buildHitlFeedbackRows(turns = []) {
  const rows = [];
  for (const turn of turns || []) {
    for (const suggestion of turn?.memorySuggestions || []) {
      if (!["saved", "ignored", "regression_marked"].includes(String(suggestion?.status || ""))) {
        continue;
      }
      rows.push({
        id: `${turn.id}_${suggestion.id}`,
        kind: "suggestion",
        status: suggestion.status,
        key: suggestion.key,
        value: suggestion.value,
        reason: suggestion.reason || "",
        updatedAt: suggestion.updatedAt || turn.createdAt || Date.now(),
        message:
          suggestion.status === "saved"
            ? "当前偏好已保存"
            : suggestion.status === "ignored"
            ? "当前偏好已忽略"
            : "已标记为回归用例",
      });
    }

    if (turn?.qualityFeedback) {
      rows.push({
        id: `${turn.id}_quality_feedback`,
        kind: "regression",
        status: turn.qualityFeedback.status || "unknown",
        reason: turn.qualityFeedback.reason || "",
        caseId: turn.qualityFeedback.caseId || "",
        updatedAt: turn.qualityFeedback.updatedAt || turn.createdAt || Date.now(),
        message:
          turn.qualityFeedback.status === "harvested"
            ? "已标记为回归用例"
            : turn.qualityFeedback.status === "failed"
            ? "回归标记失败"
            : "已提交反馈",
      });
    }
  }

  return rows
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
    .slice(0, 12);
}
