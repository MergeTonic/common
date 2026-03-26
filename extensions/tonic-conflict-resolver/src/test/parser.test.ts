import test from "node:test";
import assert from "node:assert/strict";
import { parseTonicConflicts } from "@mergetonic/core";

test("parses single block with two segments", () => {
  const src = [
    "<<<<<<< begin added left",
    "L1",
    "======= begin added right",
    "R1",
    ">>>>>>> end conflict",
  ].join("\n");
  const blocks = parseTonicConflicts(src);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].segments.length, 2);
  assert.deepEqual(blocks[0].segments[0].lines, ["L1"]);
  assert.deepEqual(blocks[0].segments[1].lines, ["R1"]);
});

test("unclosed begin without end yields no blocks (current contract)", () => {
  const src = ["<<<<<<< begin added left", "orphan"].join("\n");
  assert.equal(parseTonicConflicts(src).length, 0);
});
