import test from "node:test";
import assert from "node:assert/strict";
import {
  parseGitConflicts,
  parseGitConflictsWithDiagnostics,
  hasGitConflictMarkers,
} from "../gitConflictParser";
import { gitConflictBlocksToTonicAnnotatedPreview } from "../markerInterop";

test("parseGitConflicts parses standard three-way markers", () => {
  const src = ["<<<<<<< HEAD", "ours", "=======", "theirs", ">>>>>>> branch"].join("\n");
  const blocks = parseGitConflicts(src);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]!.kind, "git merge");
  assert.equal(blocks[0]!.segments[0]!.label, "HEAD");
  assert.deepEqual(blocks[0]!.segments[0]!.lines, ["ours"]);
  assert.equal(blocks[0]!.segments[1]!.label, "branch");
  assert.deepEqual(blocks[0]!.segments[1]!.lines, ["theirs"]);
});

test("parseGitConflictsWithDiagnostics warns on missing end", () => {
  const src = ["<<<<<<< HEAD", "only ours", "======="].join("\n");
  const { blocks, warnings } = parseGitConflictsWithDiagnostics(src);
  assert.equal(blocks.length, 0);
  assert.ok(warnings.some((w) => /Unterminated Git conflict/.test(w)));
});

test("hasGitConflictMarkers", () => {
  assert.equal(hasGitConflictMarkers("ok\n<<<<<<< X\n"), true);
  assert.equal(hasGitConflictMarkers("no markers"), false);
});

test("gitConflictBlocksToTonicAnnotatedPreview emits Tonic begin markers", () => {
  const src = ["<<<<<<< HEAD", "a", "=======", "b", ">>>>>>> topic"].join("\n");
  const blocks = parseGitConflicts(src);
  const ann = gitConflictBlocksToTonicAnnotatedPreview(blocks);
  assert.ok(ann.some((l) => l.startsWith("<<<<<<< begin git merge")));
});
