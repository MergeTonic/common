import test from "node:test";
import assert from "node:assert/strict";
import { parseAgentResult } from "../agentContract";

test("parseAgentResult accepts valid JSON payload", () => {
  const payload = JSON.stringify({
    resolved_lines: ["line 1", "line 2"],
    rationale: "picked right-side logic",
  });
  const res = parseAgentResult(payload);
  assert.deepEqual(res.resolved_lines, ["line 1", "line 2"]);
  assert.equal(res.rationale, "picked right-side logic");
});

test("parseAgentResult rejects non-array resolved_lines", () => {
  assert.throws(() => parseAgentResult('{"resolved_lines":"oops"}'));
});

test("parseAgentResult rejects multiline entries", () => {
  assert.throws(() =>
    parseAgentResult(
      JSON.stringify({
        resolved_lines: ["line1\nline2"],
      }),
    ),
  );
});
