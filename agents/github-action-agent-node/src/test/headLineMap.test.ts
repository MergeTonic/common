import test from "node:test";
import assert from "node:assert/strict";
import type { ConflictRegion } from "@mergetonic/core";
import { conflictRegionToHeadSpan, conflictRegionToHeadSpanResult } from "../headLineMap";

test("conflictRegionToHeadSpan single match", () => {
  const right = ["keep", "one", "two", "three"];
  const reg: ConflictRegion = {
    baseContent: "",
    leftContent: "old",
    rightContent: "two\nthree",
    startLine: 1,
    endLine: 5,
    conflictKind: "added left",
  };
  assert.deepEqual(conflictRegionToHeadSpan(reg, right), [3, 4]);
});

test("conflictRegionToHeadSpan ambiguous", () => {
  const right = ["dup", "mid", "dup"];
  const reg: ConflictRegion = {
    baseContent: "",
    leftContent: "x",
    rightContent: "dup",
    startLine: 1,
    endLine: 3,
    conflictKind: "added left",
  };
  assert.equal(conflictRegionToHeadSpan(reg, right), null);
});

test("conflictRegionToHeadSpan sequential duplicate with preferAfter", () => {
  const right = ["dup", "mid", "dup", "end"];
  const reg: ConflictRegion = {
    baseContent: "",
    leftContent: "mid",
    rightContent: "dup",
    startLine: 1,
    endLine: 2,
    conflictKind: "added left",
  };
  assert.deepEqual(conflictRegionToHeadSpan(reg, right, 1), [3, 3]);
});

test("whole head file equals right hunk yields unique span", () => {
  const right = ["a", "b", "c"];
  const reg: ConflictRegion = {
    baseContent: "",
    leftContent: "old",
    rightContent: "a\nb\nc",
    startLine: 1,
    endLine: 9,
    conflictKind: "added right",
  };
  assert.deepEqual(conflictRegionToHeadSpan(reg, right), [1, 3]);
});

test("conflictRegionToHeadSpanResult ambiguous exposes candidates", () => {
  const right = ["x", "dup", "y", "x", "dup", "y"];
  const reg: ConflictRegion = {
    baseContent: "",
    leftContent: "foo\nx",
    rightContent: "dup\ny",
    startLine: 1,
    endLine: 3,
    conflictKind: "added left",
  };
  const r = conflictRegionToHeadSpanResult(reg, right);
  assert.equal(r.kind, "ambiguous");
  if (r.kind === "ambiguous") {
    assert.deepEqual(r.candidates.sort((a, b) => a - b), [1, 4]);
  }
});
