import type { RetrievalHit } from "../hydrationTypes";

/** Reciprocal rank fusion for two ordered hit lists (dense vs sparse ranks). */
export function reciprocalRankFusion(a: RetrievalHit[], b: RetrievalHit[], k = 60): RetrievalHit[] {
  const scores = new Map<string, number>();
  const byId = new Map<string, RetrievalHit>();

  const add = (list: RetrievalHit[], weight: number) => {
    list.forEach((hit, i) => {
      const id = hit.chunk_id;
      byId.set(id, hit);
      const rrf = weight / (k + i + 1);
      scores.set(id, (scores.get(id) ?? 0) + rrf);
    });
  };

  add(a, 2);
  add(b, 1);

  return [...scores.entries()]
    .sort((x, y) => y[1] - x[1])
    .map(([id, s]) => {
      const hit = byId.get(id)!;
      return { ...hit, score: s };
    });
}

export function hybridMergeHits(denseRanked: RetrievalHit[], sparseRanked: RetrievalHit[]): RetrievalHit[] {
  return reciprocalRankFusion(denseRanked, sparseRanked);
}
