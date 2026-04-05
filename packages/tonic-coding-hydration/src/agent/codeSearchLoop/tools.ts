import type { RetrievalHit } from "../../hydrationTypes";
import { regexSearchHits } from "../../tools/regexSearch";
import { symbolSearchHits } from "../../tools/symbolSearch";
import type { CodeSearchSession } from "./types";

function queryResultToHits(res: {
  ids: string[];
  documents: string[];
  metadatas: Array<Record<string, unknown>>;
  distances?: number[];
}): RetrievalHit[] {
  const hits: RetrievalHit[] = [];
  for (let i = 0; i < res.ids.length; i++) {
    hits.push({
      chunk_id: res.ids[i]!,
      text: res.documents[i] ?? "",
      score: 1 - (res.distances?.[i] ?? 0),
      metadata: { ...(res.metadatas[i] ?? {}) },
    });
  }
  return hits;
}

/** Dense query against the session index. */
export async function toolSemanticQuery(
  session: CodeSearchSession,
  query: string,
  topK: number,
): Promise<RetrievalHit[]> {
  const [emb] = await session.embedder.embedBatch([query]);
  const res = await session.index.query(emb!, topK);
  return queryResultToHits(res);
}

/** Broad pool for regex/symbol tools (single pseudo-query embedding). */
export async function materializeHitPool(session: CodeSearchSession, topK: number): Promise<RetrievalHit[]> {
  const [emb] = await session.embedder.embedBatch(["merge hydration retrieval context"]);
  const res = await session.index.query(emb!, topK);
  return queryResultToHits(res);
}

export function toolRegexHits(pool: RetrievalHit[], pattern: string): RetrievalHit[] {
  return regexSearchHits(pool, pattern);
}

export function toolSymbolHits(pool: RetrievalHit[], symbol: string): RetrievalHit[] {
  return symbolSearchHits(pool, symbol);
}
