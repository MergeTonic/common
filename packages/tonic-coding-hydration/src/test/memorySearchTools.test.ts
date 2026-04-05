import test from "node:test";
import assert from "node:assert/strict";

import type { RetrievalHit } from "../hydrationTypes";
import { hybridMergeHits, reciprocalRankFusion } from "../tools/hybridSearch";
import { regexSearchHits } from "../tools/regexSearch";
import { symbolSearchHits } from "../tools/symbolSearch";

const hit = (id: string, overrides: Partial<RetrievalHit> = {}): RetrievalHit => ({
  chunk_id: id,
  text: "x",
  score: 0.5,
  metadata: {},
  ...overrides,
});

test("symbolSearchHits filters by ast_rule_id or symbol metadata", () => {
  const hits: RetrievalHit[] = [
    hit("1", { metadata: { ast_rule_id: "todo-comment", symbol: "" } }),
    hit("2", { metadata: { ast_rule_id: "other", symbol: "MyFn" } }),
  ];
  const out = symbolSearchHits(hits, "todo");
  assert.equal(out.length, 1);
  assert.equal(out[0]!.chunk_id, "1");
});

test("regexSearchHits matches document text", () => {
  const hits: RetrievalHit[] = [hit("1", { text: "const foo = 1" }), hit("2", { text: "nope" })];
  const out = regexSearchHits(hits, "foo");
  assert.equal(out.length, 1);
});

test("reciprocalRankFusion merges two ranked lists", () => {
  const a = [hit("a", { score: 0.9 }), hit("b", { score: 0.8 })];
  const b = [hit("b", { score: 0.7 }), hit("c", { score: 0.6 })];
  const out = reciprocalRankFusion(a, b);
  assert.ok(out.length >= 2);
  assert.ok(out.every((h) => h.chunk_id === "a" || h.chunk_id === "b" || h.chunk_id === "c"));
});

test("hybridMergeHits is RRF alias", () => {
  const merged = hybridMergeHits([hit("x")], [hit("y")]);
  assert.equal(merged.length, 2);
});
