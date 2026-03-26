import * as cp from "node:child_process";
import * as path from "node:path";
/**
 * Python ↔ TS parity gate: extend when `annotatedToConflictFile` / marker formats change.
 * CI: `npm run test -w @mergetonic/core` with merge-tonic-lib installed; see `.github/workflows/ci-js-core.yml`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { currentLines, initialState, mergeStates, updateState } from "../core";

function repoRoot(): string {
  const cwd = process.cwd();
  if (path.basename(cwd) === "tonic-core") {
    return path.resolve(cwd, "..", "..");
  }
  return cwd;
}

function pyExe(): { cmd: string; args: string[] } {
  if (process.platform === "win32") {
    return { cmd: "py", args: ["-3"] };
  }
  return { cmd: "python3", args: [] };
}

function runParityGate(payload: object): Record<string, unknown> {
  const script = path.join(repoRoot(), "merge-tonic-lib", "tests", "parity_gate.py");
  const { cmd, args: prefix } = pyExe();
  const proc = cp.spawnSync(cmd, [...prefix, script], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    cwd: repoRoot(),
    env: {
      ...process.env,
      PYTHONPATH: path.join(repoRoot(), "merge-tonic-lib"),
    },
  });
  if (proc.error) {
    throw proc.error;
  }
  if (proc.status !== 0) {
    throw new Error(`parity_gate failed (${proc.status}): ${proc.stderr || proc.stdout}`);
  }
  return JSON.parse(proc.stdout as string) as Record<string, unknown>;
}

test("parity merge_snapshots vs Python merge-tonic-lib", () => {
  const cases: Array<{ left: string[]; right: string[] }> = [
    { left: ["A", "B"], right: ["A", "X", "B"] },
    { left: ["line 1", "line 4"], right: ["line 2", "line 3"] },
    { left: [""], right: ["A", ""] },
    { left: ["A", ""], right: ["", "B"] },
  ];
  for (const { left, right } of cases) {
    const py = runParityGate({ op: "merge_snapshots", left, right });
    const [tsState, tsAnn] = mergeStates(initialState(left), initialState(right));
    assert.equal(tsState, py.state, `state left=${JSON.stringify(left)}`);
    assert.deepEqual(tsAnn, py.annotated, `annotated`);
    assert.deepEqual(currentLines(tsState), py.current, `current`);
  }
});

test("parity update_state round-trip vs Python", () => {
  const raw = initialState(["A", "B"]);
  const lines = ["A", "X", "Y", "B"];
  const py = runParityGate({ op: "update_state", raw_state: raw, lines });
  const ts = updateState(raw, lines);
  assert.equal(ts, py.state);
});

test("parity merge_states on arbitrary serialized states", () => {
  const s1 = initialState(["M"]);
  const s2 = updateState(s1, ["M", "L"]);
  const s3 = updateState(s1, ["R", "M"]);
  const py = runParityGate({ op: "merge_states", state1: s2, state2: s3 });
  const [tsState, tsAnn] = mergeStates(s2, s3);
  assert.equal(tsState, py.state);
  assert.deepEqual(tsAnn, py.annotated);
  assert.deepEqual(currentLines(tsState), py.current);
});
