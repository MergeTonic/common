import test from "node:test";
import assert from "node:assert/strict";

import { EXIT_OK, EXIT_PARTIAL } from "../astGrep/types";
import { evaluateConflictGate } from "../hydration/conflictGate";

test("evaluateConflictGate default continues with any region count", () => {
  const r0 = evaluateConflictGate({}, 0);
  assert.equal(r0.shouldStop, false);
  assert.equal(r0.exitCode, EXIT_OK);
  assert.equal(r0.outcome.action, "continue");

  const r3 = evaluateConflictGate({}, 3);
  assert.equal(r3.shouldStop, false);
  assert.equal(r3.exitCode, EXIT_OK);
});

test("evaluateConflictGate zero_stop stops when zero regions", () => {
  const r = evaluateConflictGate({ TONIC_CONFLICT_GATE: "zero_stop" }, 0);
  assert.equal(r.shouldStop, true);
  assert.equal(r.exitCode, EXIT_PARTIAL);
  assert.equal(r.outcome.policy, "zero_stop");
  assert.equal(r.outcome.action, "stop");
  assert.ok(r.outcome.stop_reason?.includes("zero"));
});

test("evaluateConflictGate zero_stop continues when regions present", () => {
  const r = evaluateConflictGate({ TONIC_CONFLICT_GATE: "zero_stop" }, 1);
  assert.equal(r.shouldStop, false);
  assert.equal(r.exitCode, EXIT_OK);
});

test("evaluateConflictGate TONIC_SKIP_CONFLICT_GATE=1 always continues", () => {
  const r = evaluateConflictGate(
    { TONIC_CONFLICT_GATE: "zero_stop", TONIC_SKIP_CONFLICT_GATE: "1" },
    0,
  );
  assert.equal(r.shouldStop, false);
  assert.equal(r.exitCode, EXIT_OK);
  assert.equal(r.outcome.policy, "skipped");
});
