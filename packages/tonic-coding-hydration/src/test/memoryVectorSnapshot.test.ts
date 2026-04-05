import * as assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";

import { textToEmbedding } from "../retrieval/buildRetrieval";
import type { EmbeddingProvider } from "../retrieval/embeddingProvider";
import { embeddingFingerprintFromEnv } from "../retrieval/embeddingFingerprint";
import {
  buildVectorRecordsWithCache,
  contentDigestUtf8,
  loadMemoryVectorIndexFromPath,
  parseMemoryVectorIndexArtifact,
  resolveVectorCacheOptions,
  saveMemoryVectorIndexToPath,
} from "../vector/memoryVectorSnapshot";

test("contentDigestUtf8 is stable", () => {
  const d = contentDigestUtf8("a\nb");
  assert.equal(d.length, 64);
  assert.equal(d, contentDigestUtf8("a\nb"));
});

test("parseMemoryVectorIndexArtifact rejects bad input", () => {
  assert.equal(parseMemoryVectorIndexArtifact(null), null);
  assert.equal(parseMemoryVectorIndexArtifact({}), null);
});

test("resolveVectorCacheOptions defaults readwrite when path set", () => {
  assert.deepStrictEqual(resolveVectorCacheOptions({ vectorCachePath: "/tmp/x", env: {} }), {
    path: "/tmp/x",
    mode: "readwrite",
  });
  assert.deepStrictEqual(resolveVectorCacheOptions({ env: { TONIC_VECTOR_CACHE_PATH: "/p" } }), {
    path: "/p",
    mode: "readwrite",
  });
  assert.deepStrictEqual(resolveVectorCacheOptions({ env: { TONIC_VECTOR_CACHE_PATH: "/p", TONIC_VECTOR_CACHE_MODE: "read" } }), {
    path: "/p",
    mode: "read",
  });
});

test("embeddingFingerprintFromEnv histogram", () => {
  const fp = embeddingFingerprintFromEnv({});
  assert.match(fp, /^histogram:dim=48$/);
});

test("buildVectorRecordsWithCache write then read reuses embeddings", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mvc-"));
  const snap = path.join(dir, "idx.json");
  const env = {} as NodeJS.ProcessEnv;
  const matches = [{ path: "f.ts", rule_id: "r", start: { line: 1 }, end: { line: 1 } }];
  const root = dir;
  fs.writeFileSync(path.join(root, "f.ts"), "export const x = 1;\n", "utf8");

  let batchCalls = 0;
  const embedder: EmbeddingProvider = {
    async embedBatch(texts: string[]) {
      batchCalls += 1;
      return texts.map((t) => textToEmbedding(t));
    },
  };

  await buildVectorRecordsWithCache({
    repoRoot: root,
    matches,
    embedder,
    env,
    cachePath: snap,
    cacheMode: "write",
  });
  const afterWrite = batchCalls;

  batchCalls = 0;
  const again = await buildVectorRecordsWithCache({
    repoRoot: root,
    matches,
    embedder,
    env,
    cachePath: snap,
    cacheMode: "readwrite",
  });
  assert.equal(again.length, 1);
  assert.ok(batchCalls < afterWrite, "second run should call embedBatch fewer times than cold write");
  const loaded = loadMemoryVectorIndexFromPath(snap);
  assert.ok(loaded && loaded.records.length === 1);
});

test("buildVectorRecordsWithCache invalidates on content change", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mvc2-"));
  const snap = path.join(dir, "idx.json");
  const env = {} as NodeJS.ProcessEnv;
  const matches = [{ path: "f.ts", rule_id: "r", start: { line: 1 }, end: { line: 1 } }];
  const root = dir;
  fs.writeFileSync(path.join(root, "f.ts"), "v1\n", "utf8");

  const embedder: EmbeddingProvider = {
    async embedBatch(texts: string[]) {
      return texts.map((t) => textToEmbedding(t));
    },
  };

  await buildVectorRecordsWithCache({
    repoRoot: root,
    matches,
    embedder,
    env,
    cachePath: snap,
    cacheMode: "readwrite",
  });
  fs.writeFileSync(path.join(root, "f.ts"), "v2\n", "utf8");
  let embedBatches = 0;
  const counting: EmbeddingProvider = {
    async embedBatch(texts: string[]) {
      embedBatches += 1;
      return embedder.embedBatch(texts);
    },
  };
  await buildVectorRecordsWithCache({
    repoRoot: root,
    matches,
    embedder: counting,
    env,
    cachePath: snap,
    cacheMode: "readwrite",
  });
  assert.ok(embedBatches >= 1);
});

test("round-trip save and load snapshot", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mvc3-"));
  const snap = path.join(dir, "idx.json");
  const art = {
    schema: "tonic-memory-vector-index" as const,
    version: "1" as const,
    embedding_fingerprint: "histogram:dim=48",
    embedding_dim: 48,
    digest_algorithm: "sha256" as const,
    records: [
      {
        id: "a",
        document: "x",
        embedding: textToEmbedding("x"),
        metadata: { path: "p" },
        content_digest: contentDigestUtf8("x"),
      },
    ],
  };
  saveMemoryVectorIndexToPath(snap, art);
  const got = loadMemoryVectorIndexFromPath(snap);
  assert.ok(got);
  assert.equal(got!.records[0]!.id, "a");
});
