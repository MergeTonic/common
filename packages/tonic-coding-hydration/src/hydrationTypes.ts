export type RetrievalHit = {
  chunk_id: string;
  text: string;
  score: number;
  metadata?: Record<string, unknown>;
};
