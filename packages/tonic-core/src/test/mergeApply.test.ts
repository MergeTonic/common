import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  annotatedToConflictFile,
  applyTonicHeuristic,
  applyTonicResolutions,
  heuristicResolvedLines,
  mergeSnapshots,
  suggestionLineCountOk,
  type ConflictRegion,
} from "../mergeUtils";

describe("heuristicResolvedLines + suggestionLineCountOk", () => {
  it("prefers right when non-empty", () => {
    const r: ConflictRegion = {
      baseContent: "",
      leftContent: "a",
      rightContent: "b",
      startLine: 1,
      endLine: 1,
      conflictKind: "added both",
    };
    assert.deepEqual(heuristicResolvedLines(r), ["b"]);
  });

  it("falls back to left when right empty", () => {
    const r: ConflictRegion = {
      baseContent: "",
      leftContent: "x\ny",
      rightContent: "",
      startLine: 1,
      endLine: 1,
      conflictKind: "deleted right",
    };
    assert.deepEqual(heuristicResolvedLines(r), ["x", "y"]);
  });

  it("suggestionLineCountOk", () => {
    assert.equal(suggestionLineCountOk(["a"], 1), true);
    assert.equal(suggestionLineCountOk(["a", "b"], 1), false);
  });
});

describe("applyTonicResolutions", () => {
  it("replaces one region with resolved lines", () => {
    const ann = [
      "before",
      "<<<<<<< begin added both",
      "L",
      "======= begin added both",
      "R",
      ">>>>>>> end conflict",
      "after",
    ];
    const out = applyTonicResolutions(ann, [["Z"]]);
    assert.deepEqual(out, ["before", "Z", "after"]);
  });

  it("handles two regions bottom-up", () => {
    const ann = [
      "<<<<<<< begin added both",
      "a",
      "======= begin added both",
      "b",
      ">>>>>>> end conflict",
      "mid",
      "<<<<<<< begin added both",
      "c",
      "======= begin added both",
      "d",
      ">>>>>>> end conflict",
    ];
    const cf = annotatedToConflictFile("_", ann);
    assert.equal(cf.conflicts.length, 2);
    const out = applyTonicResolutions(ann, [["1"], ["2"]]);
    assert.deepEqual(out, ["1", "mid", "2"]);
  });
});

describe("applyTonicHeuristic", () => {
  it("produces clean lines from weave conflict", () => {
    const left = ["line"];
    const right = ["other"];
    const [, ann] = mergeSnapshots(left, right);
    const clean = applyTonicHeuristic(ann);
    assert.ok(clean.length > 0);
    assert.ok(!clean.some((l) => l.startsWith("<<<<<<<")));
  });
});
