/** Vector / embedding record shapes for hydration retrieval backends. */

export type VectorRecord = {
  id: string;
  document: string;
  metadata: Record<string, unknown>;
  embedding?: number[];
};

export type QueryResult = {
  ids: string[];
  documents: string[];
  metadatas: Array<Record<string, unknown>>;
  distances?: number[];
};

export type VectorIndex = {
  upsert(records: VectorRecord[]): Promise<void>;
  query(queryEmbedding: number[], topK: number): Promise<QueryResult>;
  deleteIds(ids: string[]): Promise<void>;
};
