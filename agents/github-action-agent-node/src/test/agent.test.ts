import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { mergeSnapshots, annotatedToConflictFile } from "@mergetonic/core";
import { buildSummaryBody, markerSummary } from "../githubComments";
import { writeActionOutputs } from "../index";

test("mergeSnapshots + conflict file", () => {
  const [merged, ann] = mergeSnapshots(["A"], ["A", "B"]);
  assert.ok(merged.includes("B"));
  assert.ok(Array.isArray(ann));
  const cf = annotatedToConflictFile("t.txt", ann);
  assert.equal(cf.path, "t.txt");
});

test("buildSummaryBody includes marker", () => {
  const body = buildSummaryBody("r1", "Hello", [{ path: "x" }], "medium");
  assert.ok(body.includes(markerSummary("r1")));
});

test("writeActionOutputs writes expected output keys", () => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tonic-node-out-")), "gout.txt");
  const prev = process.env.GITHUB_OUTPUT;
  try {
    process.env.GITHUB_OUTPUT = out;
    writeActionOutputs({
      status: "ok",
      filesAnalyzed: 7,
      conflictedFiles: 3,
      reportPath: "merge-tonic-report.json",
    });
    const body = fs.readFileSync(out, "utf8");
    assert.match(body, /status=ok/);
    assert.match(body, /files_analyzed=7/);
    assert.match(body, /conflicted_files=3/);
    assert.match(body, /report_path=merge-tonic-report\.json/);
  } finally {
    process.env.GITHUB_OUTPUT = prev;
    fs.rmSync(path.dirname(out), { recursive: true, force: true });
  }
});
