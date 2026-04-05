import test from "node:test";
import assert from "node:assert/strict";

import { attachAstMetadata, buildAstLineMapFromMatches, buildConflictMidLineMap } from "../retrieval/attachAstMetadata";

test("attachAstMetadata boosts overlapping hit lines", () => {
  const hits = [
    {
      chunk_id: "c1",
      text: "x",
      score: 1,
      metadata: { path: "f.ts", start_line: 2, end_line: 3, source: "memory" },
    },
  ];
  const astMap = buildAstLineMapFromMatches([{ path: "f.ts", start: { line: 2 }, end: { line: 2 } }]);
  const out = attachAstMetadata(hits, astMap);
  assert.ok(out[0]!.score > 1);
  assert.ok(Number(out[0]!.metadata!.ast_boost_applied) > 0);
});

test("conflict mid-line proximity increases boost", () => {
  const hits = [
    {
      chunk_id: "c1",
      text: "x",
      score: 1,
      metadata: { path: "f.ts", start_line: 4, end_line: 4, source: "memory" },
    },
  ];
  const astMap = buildAstLineMapFromMatches([]);
  const cm = buildConflictMidLineMap([{ path: "f.ts", mid_line: 5 }]);
  const out = attachAstMetadata(hits, astMap, cm);
  assert.ok(out[0]!.score > 1);
});
