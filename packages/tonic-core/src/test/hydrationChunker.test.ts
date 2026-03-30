import test from "node:test";
import assert from "node:assert/strict";

import { LineTokenEstimateChunker } from "../hydration";

test("LineTokenEstimateChunker splits long content into stable line-based chunks", () => {
  const chunker = new LineTokenEstimateChunker({ maxLinesPerChunk: 2, maxEstimatedTokens: 20 });
  const chunks = chunker.chunkText("src/app.ts", "one\ntwo\nthree\nfour");
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0]?.startLine, 1);
  assert.equal(chunks[0]?.endLine, 2);
  assert.equal(chunks[1]?.startLine, 3);
  assert.equal(chunks[1]?.endLine, 4);
});

test("LineTokenEstimateChunker extracts symbol hints from code chunks", () => {
  const chunker = new LineTokenEstimateChunker({ maxLinesPerChunk: 40, maxEstimatedTokens: 1000 });
  const chunks = chunker.chunkText("src/auth.ts", "export function resolveAuth(user: string) {\n  return user;\n}\n");
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0]?.symbol, "resolveAuth");
});
