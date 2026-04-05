import test from "node:test";
import assert from "node:assert/strict";
import {
  attachAstMetadata,
  buildEmptyRetrievalArtifact,
  buildRetrievalArtifact,
  chunkFileAstGrep,
  createMemoryVectorIndex,
} from "../index";

test("buildEmptyRetrievalArtifact", () => {
  const r = buildEmptyRetrievalArtifact();
  assert.equal(r.schema, "tonic-retrieval-hydration");
  assert.equal(r.hits.length, 0);
});

test("buildRetrievalArtifact stub", () => {
  const r = buildRetrievalArtifact({ fallbackQuery: "x" });
  assert.equal(r.hits.length, 1);
});

test("chunkFileAstGrep empty when no matches", () => {
  assert.equal(chunkFileAstGrep(".", "a.ts", []).length, 0);
});

test("memory index + attachAstMetadata", async () => {
  const idx = createMemoryVectorIndex();
  await idx.upsert([
    { id: "1", document: "hello", metadata: { path: "a.ts" }, embedding: [1, 0, 0] },
  ]);
  const q = await idx.query([1, 0, 0], 2);
  assert.equal(q.ids.length, 1);
  const boosted = attachAstMetadata(
    [{ chunk_id: "1", text: "hello", score: 1, metadata: {} }],
    new Map(),
  );
  assert.equal(boosted[0]!.metadata!.ast_boost_applied, 0);
});
