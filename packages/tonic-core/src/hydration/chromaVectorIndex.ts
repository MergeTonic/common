import { getHydrationChromaCollection } from "./chromaClient";
import type { HydrationRuntimeConfig } from "./runtimeConfig";
import type { VectorFilter, VectorIndex, VectorRecord, VectorSearchResult } from "./vectorIndex";
import type { ChromaCollection } from "./chromaClient";

function toScore(distance: number | undefined): number {
  if (distance == null) {
    return 0;
  }
  return 1 / (1 + distance);
}

export class ChromaVectorIndex implements VectorIndex {
  readonly backend: string;
  readonly collectionName: string;
  private readonly config: HydrationRuntimeConfig;
  private collectionPromise: Promise<ChromaCollection> | null = null;

  constructor(config: HydrationRuntimeConfig) {
    this.config = config;
    this.collectionName = config.collectionName;
    this.backend = "chroma-http";
  }

  private async collection(): Promise<ChromaCollection> {
    if (!this.collectionPromise) {
      this.collectionPromise = getHydrationChromaCollection(this.config);
    }
    return this.collectionPromise;
  }

  async upsert(records: VectorRecord[]): Promise<void> {
    if (records.length === 0) {
      return;
    }
    const collection = await this.collection();
    await collection.upsert({
      ids: records.map((record) => record.id),
      documents: records.map((record) => record.document),
      embeddings: records.map((record) => record.embedding),
      metadatas: records.map((record) => record.metadata ?? {}),
    });
  }

  async similaritySearch(
    queryEmbedding: number[],
    limit: number,
    filter?: VectorFilter,
  ): Promise<VectorSearchResult[]> {
    const collection = await this.collection();
    const result = await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: limit,
      where: filter as Record<string, unknown> | undefined,
      include: ["documents", "metadatas", "distances", "embeddings"],
    });
    const ids = result.ids?.[0] ?? [];
    const documents = result.documents?.[0] ?? [];
    const metadatas = result.metadatas?.[0] ?? [];
    const distances = result.distances?.[0] ?? [];
    const embeddings = result.embeddings?.[0] ?? [];
    return ids.map((id, index) => ({
      id,
      document: documents[index] ?? "",
      metadata: (metadatas[index] ?? {}) as Record<string, string | number | boolean | null>,
      embedding: embeddings[index],
      score: toScore(distances[index]),
    }));
  }

  async getByIds(ids: string[]): Promise<VectorSearchResult[]> {
    if (ids.length === 0) {
      return [];
    }
    const collection = await this.collection();
    const result = await collection.get({
      ids,
      include: ["documents", "metadatas", "embeddings"],
    });
    return (result.ids ?? []).map((id, index) => ({
      id,
      document: result.documents?.[index] ?? "",
      metadata: (result.metadatas?.[index] ?? {}) as Record<string, string | number | boolean | null>,
      embedding: result.embeddings?.[index],
      score: 1,
    }));
  }

  async delete(params: { ids?: string[]; filter?: VectorFilter }): Promise<void> {
    const collection = await this.collection();
    await collection.delete({
      ids: params.ids,
      where: params.filter as Record<string, unknown> | undefined,
    });
  }
}
