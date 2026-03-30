export type VectorMetadataValue = string | number | boolean | null;
export type VectorMetadata = Record<string, VectorMetadataValue>;
export type VectorFilter = Record<string, unknown>;

export type VectorRecord = {
  id: string;
  document: string;
  embedding: number[];
  metadata?: VectorMetadata;
};

export type VectorSearchResult = {
  id: string;
  document: string;
  metadata?: VectorMetadata;
  score: number;
  embedding?: number[];
};

export interface VectorIndex {
  readonly backend: string;
  readonly collectionName: string;
  upsert(records: VectorRecord[]): Promise<void>;
  similaritySearch(queryEmbedding: number[], limit: number, filter?: VectorFilter): Promise<VectorSearchResult[]>;
  getByIds(ids: string[]): Promise<VectorSearchResult[]>;
  delete(params: { ids?: string[]; filter?: VectorFilter }): Promise<void>;
}
