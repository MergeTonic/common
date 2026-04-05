import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { indexAstChunks } from "../indexer/indexer";
import { HistogramEmbeddingProvider } from "../retrieval/embeddingProvider";
import { createMemoryVectorIndex } from "../vector/memoryIndex";
import type { ChunkAstMatch } from "../chunker/astGrepChunker";

test("indexAstChunks E2E: fixture file → query → line spans in metadata", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-idx-e2e-"));
  const rel = "src/widget.ts";
  const full = path.join(dir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(
    full,
    ["line1 // noise", "export function widget() { return 42; }", "line3"].join("\n") + "\n",
    "utf8",
  );
  const matches: ChunkAstMatch[] = [
    {
      path: rel,
      rule_id: "demo",
      start: { line: 2 },
      end: { line: 2 },
    },
  ];
  const index = createMemoryVectorIndex();
  const embedder = new HistogramEmbeddingProvider();
  const { chunkCount } = await indexAstChunks(dir, matches, index, embedder);
  assert.equal(chunkCount, 1);
  const q = await embedder.embedBatch(["widget return"]);
  const res = await index.query(q[0]!, 3);
  assert.ok(res.metadatas.length >= 1);
  const m0 = res.metadatas[0] as Record<string, unknown>;
  assert.equal(m0.path, rel);
  assert.equal(m0.start_line, 2);
  assert.equal(m0.end_line, 2);
});
