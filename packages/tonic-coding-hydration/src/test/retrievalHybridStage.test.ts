import test from "node:test";
import assert from "node:assert/strict";

import type { RetrievalHit } from "../hydrationTypes";
import { applyRetrievalHybridStage } from "../retrieval/retrievalHybridStage";

test("applyRetrievalHybridStage RRF with regex narrows to matching chunk", () => {
  const dense: RetrievalHit[] = [
    { chunk_id: "1", text: "alpha beta", score: 0.9, metadata: {} },
    { chunk_id: "2", text: "gamma only", score: 0.5, metadata: {} },
  ];
  const out = applyRetrievalHybridStage({ denseHits: dense, regexPattern: "gamma" });
  assert.ok(out.length >= 1);
  assert.ok(out.some((h) => h.chunk_id === "2"));
});

test("symbol filter reorders symbol matches first", () => {
  const dense: RetrievalHit[] = [
    { chunk_id: "1", text: "x", score: 0.9, metadata: { ast_rule_id: "other" } },
    { chunk_id: "2", text: "y", score: 0.5, metadata: { ast_rule_id: "my-rule" } },
  ];
  const out = applyRetrievalHybridStage({ denseHits: dense, symbolFilter: "my-rule" });
  assert.equal(out[0]!.chunk_id, "2");
});
