import assert from "node:assert/strict";
import test from "node:test";
import { pollTask } from "../services/http/taskPoller.js";

if (!globalThis.window) {
  globalThis.window = {
    setTimeout,
    clearTimeout,
  };
}

test("pollTask resolves when success predicate matches", async () => {
  let attempts = 0;
  const result = await pollTask({
    intervalMs: 0,
    timeoutMs: 100,
    poll: async () => {
      attempts += 1;
      return { status: attempts >= 2 ? "done" : "running" };
    },
    isSuccess: (data) => data.status === "done",
    isFailure: (data) => data.status === "error",
  });

  assert.equal(attempts, 2);
  assert.deepEqual(result, { status: "done" });
});

test("pollTask rejects with unified timeout error", async () => {
  await assert.rejects(
    () =>
      pollTask({
        intervalMs: 0,
        timeoutMs: 1,
        poll: async () => ({ status: "running" }),
        isSuccess: (data) => data.status === "done",
      }),
    (error) => {
      assert.equal(error.code, "TASK_POLL_TIMEOUT");
      assert.equal(error.source, "taskPoller");
      return true;
    },
  );
});
