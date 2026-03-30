import type { VectorFilter, VectorIndex, VectorMetadata, VectorRecord, VectorSearchResult } from "./vectorIndex";

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function matchesFilter(metadata: VectorMetadata | undefined, filter: VectorFilter | undefined): boolean {
  if (!filter) {
    return true;
  }
  const md = metadata ?? {};
  return Object.entries(filter).every(([key, value]) => md[key] === value);
}

export class MemoryVectorIndex implements VectorIndex {
  readonly backend = "memory";
  readonly collectionName: string;
  private readonly records = new Map<string, VectorRecord>();

  constructor(collectionName: string) {
    this.collectionName = collectionName;
  }

  async upsert(records: VectorRecord[]): Promise<void> {
    for (const record of records) {
      this.records.set(record.id, record);
    }
  }

  async similaritySearch(
    queryEmbedding: number[],
    limit: number,
    filter?: VectorFilter,
  ): Promise<VectorSearchResult[]> {
    return [...this.records.values()]
      .filter((record) => matchesFilter(record.metadata, filter))
      .map((record) => ({
        id: record.id,
        document: record.document,
        metadata: record.metadata,
        embedding: record.embedding,
        score: cosineSimilarity(queryEmbedding, record.embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(0, limit));
  }

  async getByIds(ids: string[]): Promise<VectorSearchResult[]> {
    return ids
      .map((id) => this.records.get(id))
      .filter((record): record is VectorRecord => Boolean(record))
      .map((record) => ({
        id: record.id,
        document: record.document,
        metadata: record.metadata,
        embedding: record.embedding,
        score: 1,
      }));
  }

  async delete(params: { ids?: string[]; filter?: VectorFilter }): Promise<void> {
    if (params.ids?.length) {
      for (const id of params.ids) {
        this.records.delete(id);
      }
      return;
    }
    if (params.filter) {
      for (const [id, record] of this.records.entries()) {
        if (matchesFilter(record.metadata, params.filter)) {
          this.records.delete(id);
        }
      }
    }
  }
}
