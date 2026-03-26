import test from "node:test";
import assert from "node:assert/strict";
import { parseTonicConflicts, parseTonicConflictsWithDiagnostics } from "../conflictParser";

test("parseTonicConflicts drops unterminated block (legacy behavior)", () => {
  const src = ["<<<<<<< begin added left", "only left", "no end"].join("\n");
  assert.equal(parseTonicConflicts(src).length, 0);
});

test("parseTonicConflictsWithDiagnostics warns on unterminated block", () => {
  const src = ["<<<<<<< begin added left", "only left", "no end"].join("\n");
  const { blocks, warnings } = parseTonicConflictsWithDiagnostics(src);
  assert.equal(blocks.length, 0);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0]!, /Unterminated Tonic conflict/);
});
