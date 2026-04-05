import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { createMemoryVectorIndex } from "../../../vector/memoryIndex";
import { HistogramEmbeddingProvider } from "../../../retrieval/embeddingProvider";
import { indexAstChunks } from "../../../indexer/indexer";
import { runCodeSearchAgentTurns } from "../../../agent/codeSearchLoop/runCodeSearchAgentTurns";
import type { ChunkAstMatch } from "../../../chunker/astGrepChunker";

test("runCodeSearchAgentTurns uses mock LLM and runs semantic_query step", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-cs-"));
  fs.writeFileSync(path.join(dir, "a.ts"), "const x = 1;\n", "utf8");
  const matches: ChunkAstMatch[] = [
    {
      path: "a.ts",
      rule_id: "r1",
      start: { line: 1 },
      end: { line: 1 },
    },
  ];
  const index = createMemoryVectorIndex();
  const embedder = new HistogramEmbeddingProvider();
  await indexAstChunks(dir, matches, index, embedder);
  let turn = 0;
  const fetchImpl = async (_url: string | URL, _init?: RequestInit) => {
    turn += 1;
    const content =
      turn === 1 ? JSON.stringify({ tool: "semantic_query", query: "const" }) : JSON.stringify({ tool: "done" });
    return new Response(
      JSON.stringify({ choices: [{ message: { role: "assistant", content } }] }),
      { status: 200 },
    );
  };
  const { steps } = await runCodeSearchAgentTurns({
    session: {
      repoRoot: dir,
      matches,
      index,
      embedder,
    },
    maxTurns: 3,
    model: "m",
    baseUrl: "http://127.0.0.1:9/v1",
    apiKey: "k",
    fetchImpl: fetchImpl as typeof fetch,
  });
  assert.ok(steps.some((s) => s.tool === "semantic_query"));
  assert.ok(steps.some((s) => s.tool === "done"));
});
