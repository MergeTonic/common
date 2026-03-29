import test from "node:test";
import assert from "node:assert/strict";
import {
  addTagToConflictLabel,
  normalizeConflictLabel,
  parseConflictLabel,
  removeTagFromConflictLabel,
} from "../markerLabel";

test("parseConflictLabel extracts base kind and tags", () => {
  const parsed = parseConflictLabel("added right | author=alice | intent=security");
  assert.equal(parsed.baseKind, "added right");
  assert.equal(parsed.tags.author, "alice");
  assert.equal(parsed.tags.intent, "security");
});

test("normalizeConflictLabel keeps stable key ordering", () => {
  const normalized = normalizeConflictLabel("added right | z=2 | a=1");
  assert.equal(normalized, "added right | a=1 | z=2");
});

test("add/remove tag helpers", () => {
  const withTag = addTagToConflictLabel("added left", "author", "bob");
  assert.equal(withTag, "added left | author=bob");
  const withoutTag = removeTagFromConflictLabel(withTag, "author");
  assert.equal(withoutTag, "added left");
});
