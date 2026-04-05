import type { RetrievalHit } from "../hydrationTypes";
import { hybridMergeHits } from "../tools/hybridSearch";
import { regexSearchHits } from "../tools/regexSearch";
import { symbolSearchHits } from "../tools/symbolSearch";

export type RetrievalHybridStageParams = {
  denseHits: RetrievalHit[];
  /** If set, RRF-merge dense ranking with regex-filtered subset (same pool). */
  regexPattern?: string;
  /** If set after regex stage, filter/boost via symbol metadata substring match. */
  symbolFilter?: string;
};

/**
 * Optional post-dense stage: regex subset + RRF; then optional symbol filter re-rank
 * (dense order among symbol matches preserved where possible).
 */
export function applyRetrievalHybridStage(params: RetrievalHybridStageParams): RetrievalHit[] {
  let hits = params.denseHits;
  const pattern = params.regexPattern?.trim();
  if (pattern) {
    const sparse = regexSearchHits(hits, pattern);
    hits = hybridMergeHits(hits, sparse);
  }
  const sym = params.symbolFilter?.trim();
  if (sym) {
    const boosted = symbolSearchHits(hits, sym);
    if (boosted.length === 0) {
      return hits;
    }
    const rest = hits.filter((h) => !boosted.some((b) => b.chunk_id === h.chunk_id));
    return [...boosted, ...rest];
  }
  return hits;
}
