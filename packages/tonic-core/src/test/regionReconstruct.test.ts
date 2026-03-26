import test from "node:test";
import assert from "node:assert/strict";
import { annotatedToConflictFile, conflictRegionsToAnnotatedLines, mergeSnapshots } from "../mergeUtils";

test("conflictRegionsToAnnotatedLines round-trips regions from mergeSnapshots", () => {
  const left = ["a", "b", "c"];
  const right = ["a", "x", "c"];
  const [, annotated] = mergeSnapshots(left, right);
  const cf = annotatedToConflictFile("t.txt", annotated);
  const rebuilt = conflictRegionsToAnnotatedLines(cf.conflicts);
  const cf2 = annotatedToConflictFile("t.txt", rebuilt);
  assert.equal(cf2.conflicts.length, cf.conflicts.length);
  for (let i = 0; i < cf.conflicts.length; i++) {
    assert.equal(cf2.conflicts[i]!.conflictKind, cf.conflicts[i]!.conflictKind);
    assert.equal(cf2.conflicts[i]!.leftContent, cf.conflicts[i]!.leftContent);
    assert.equal(cf2.conflicts[i]!.rightContent, cf.conflicts[i]!.rightContent);
  }
});
