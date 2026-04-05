import type { QueryResult, VectorIndex, VectorRecord } from "./types";

/** In-memory stub index (dot product on raw vectors when present; else lexical rank 1). */
export function createMemoryVectorIndex(): VectorIndex {
  const store = new Map<string, VectorRecord>();

  return {
    async upsert(records: VectorRecord[]): Promise<void> {
      for (const r of records) {
        store.set(r.id, r);
      }
    },
    async query(queryEmbedding: number[], topK: number): Promise<QueryResult> {
      const entries = [...store.values()];
      const scored = entries.map((r) => {
        if (r.embedding && r.embedding.length === queryEmbedding.length) {
          let s = 0;
          for (let i = 0; i < queryEmbedding.length; i++) {
            s += queryEmbedding[i]! * r.embedding[i]!;
          }
          return { r, score: s };
        }
        return { r, score: 0 };
      });
      scored.sort((a, b) => b.score - a.score);
      const take = scored.slice(0, topK);
      return {
        ids: take.map((x) => x.r.id),
        documents: take.map((x) => x.r.document),
        metadatas: take.map((x) => x.r.metadata),
        distances: take.map((x) => 1 - x.score),
      };
    },
    async deleteIds(ids: string[]): Promise<void> {
      for (const id of ids) {
        store.delete(id);
      }
    },
  };
}
