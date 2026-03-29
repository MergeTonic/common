import test from "node:test";
import assert from "node:assert/strict";
import {
  parseGitConflicts,
  parseGitConflictsWithDiagnostics,
  hasGitConflictMarkers,
} from "../gitConflictParser";
import {
  gitConflictBlocksToConflictRegions,
  gitConflictBlocksToTonicAnnotatedPreview,
} from "../markerInterop";

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

test("parseGitConflicts parses adjacent conflict blocks", () => {
  const src = [
    "<<<<<<< HEAD",
    "l1",
    "=======",
    "r1",
    ">>>>>>> topic",
    "<<<<<<< HEAD",
    "l2",
    "=======",
    "r2",
    ">>>>>>> topic",
  ].join("\n");
  const blocks = parseGitConflicts(src);
  assert.equal(blocks.length, 2);
  const ann = gitConflictBlocksToTonicAnnotatedPreview(blocks);
  assert.equal(ann.filter((l) => l.startsWith("<<<<<<< begin git merge")).length, 2);
});

test("gitConflictBlocksToConflictRegions maps line spans and payloads", () => {
  const src = ["before", "<<<<<<< HEAD", "ours", "=======", "theirs", ">>>>>>> topic", "after"].join("\n");
  const blocks = parseGitConflicts(src);
  const regions = gitConflictBlocksToConflictRegions(blocks);
  assert.equal(regions.length, 1);
  assert.equal(regions[0]!.conflictKind, "git merge");
  assert.equal(regions[0]!.startLine, 2);
  assert.equal(regions[0]!.endLine, 6);
  assert.equal(regions[0]!.leftContent, "ours");
  assert.equal(regions[0]!.rightContent, "theirs");
});

test("parseGitConflicts keeps diff3 base marker text in ours segment", () => {
  const src = [
    "<<<<<<< HEAD",
    "ours-a",
    "||||||| base",
    "base-a",
    "=======",
    "theirs-a",
    ">>>>>>> topic",
  ].join("\n");
  const blocks = parseGitConflicts(src);
  assert.equal(blocks.length, 1);
  assert.deepEqual(blocks[0]!.segments[0]!.lines, ["ours-a", "||||||| base", "base-a"]);
  assert.deepEqual(blocks[0]!.segments[1]!.lines, ["theirs-a"]);
});
