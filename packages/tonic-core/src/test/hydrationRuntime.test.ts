import test from "node:test";
import assert from "node:assert/strict";

import {
  DeterministicFakeEmbedder,
  MemoryVectorIndex,
  createHydrationIndexState,
  defaultHydrationCollectionName,
  resolveHydrationRuntimeConfig,
} from "../hydration";

test("defaultHydrationCollectionName sanitizes repo root", () => {
  assert.equal(defaultHydrationCollectionName("C:\\repo\\My App"), "my-app-hydration");
});

test("resolveHydrationRuntimeConfig defaults to http mode and tonic persist path", () => {
  const cfg = resolveHydrationRuntimeConfig("C:\\repo\\demo", {});
  assert.equal(cfg.mode, "http");
  assert.ok(
    cfg.persistPath.endsWith("\\.tonic\\chroma_db")
      || cfg.persistPath.endsWith("/.tonic/chroma_db"),
  );
  assert.equal(cfg.url, "http://127.0.0.1:8000");
});

test("resolveHydrationRuntimeConfig preserves explicit Chroma modes", () => {
  const cfg = resolveHydrationRuntimeConfig("C:\\repo\\demo", {
    TONIC_CHROMA_MODE: "persistent",
  });
  assert.equal(cfg.mode, "persistent");
});

test("MemoryVectorIndex returns filtered semantic matches with deterministic embeddings", async () => {
  const embedder = new DeterministicFakeEmbedder({ dimensions: 8 });
  const docs = ["alpha auth flow", "database migrations", "auth token refresh"];
  const embeddings = await embedder.embedDocuments(docs);
  const index = new MemoryVectorIndex("demo-hydration");
  await index.upsert(
    docs.map((document, i) => ({
      id: `doc-${i}`,
      document,
      embedding: embeddings[i]!,
      metadata: { bucket: i === 1 ? "db" : "auth" },
    })),
  );
  const result = await index.similaritySearch(await embedder.embedQuery("auth flow"), 2, {
    bucket: "auth",
  });
  assert.equal(result.length, 2);
  assert.equal(result[0]?.metadata?.bucket, "auth");
});

test("createHydrationIndexState records versioned substrate metadata", () => {
  const state = createHydrationIndexState({
    collectionName: "demo-hydration",
    vectorBackend: "chroma-http",
    embedderModel: "fake-v1",
    chunkerVersion: "line-estimate-v1",
    strategyId: "incremental-content-hash",
    repoRoot: "C:\\repo\\demo",
    normativeCommit: "abc123",
  });
  assert.equal(state.schema, "tonic-hydration-index-state");
  assert.equal(state.collection_name, "demo-hydration");
  assert.equal(state.normative_commit, "abc123");
});
