import type { RetrievalHit } from "../hydrationTypes";

/**
 * Batch "code walk" summary: structured trace without an LLM tool loop.
 * Full CodeSearchAgent-style loops stay optional (Chroma + API keys).
 */
export function buildBatchCodeWalkTrace(params: {
  retrievalHits: RetrievalHit[];
  conflictRegionCount: number;
  astMatchCount: number;
}): {
  schema: "tonic-code-walk-trace";
  version: "1";
  plan: Array<Record<string, unknown>>;
  steps: Array<Record<string, unknown>>;
} {
  const insights: string[] = [];
  insights.push(
    `Ast structural matches available: ${params.astMatchCount}; conflict regions: ${params.conflictRegionCount}.`,
  );
  for (const h of params.retrievalHits.slice(0, 8)) {
    const p = h.metadata?.path ?? "";
    const sl = h.metadata?.start_line ?? "";
    const el = h.metadata?.end_line ?? "";
    insights.push(`Chunk ${h.chunk_id} @ ${p} L${sl}-${el} score=${h.score.toFixed(4)}`);
  }
  return {
    schema: "tonic-code-walk-trace",
    version: "1",
    plan: [
      {
        id: "batch-1",
        goal: "Summarize retrieval + structural context for downstream LLM",
        mode: "deterministic",
      },
    ],
    steps: [
      {
        tool: "batch_context",
        outcome: {
          chunks: params.retrievalHits.slice(0, 12).map((h) => ({
            filePath: String(h.metadata?.path ?? ""),
            snippet: h.text.slice(0, 600),
            symbol: h.metadata?.ast_rule_id ? String(h.metadata.ast_rule_id) : undefined,
            relevance: h.score,
          })),
          insights,
        },
      },
    ],
  };
}
