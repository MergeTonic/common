import { textToEmbedding } from "./buildRetrieval";

export type EmbeddingProvider = {
  embedBatch(texts: string[]): Promise<number[][]>;
};

/** Deterministic 48-dim histogram vectors (default offline path). */
export class HistogramEmbeddingProvider implements EmbeddingProvider {
  async embedBatch(texts: string[]): Promise<number[][]> {
    return texts.map((t) => textToEmbedding(t));
  }
}

export type OpenAiCompatibleEmbeddingProviderOptions = {
  baseUrl: string;
  model: string;
  apiKey?: string;
  batchSize?: number;
  fetchImpl?: typeof fetch;
};

/**
 * POST {baseUrl}/embeddings (baseUrl should include /v1, e.g. http://127.0.0.1:8080/v1).
 */
export class OpenAiCompatibleEmbeddingProvider implements EmbeddingProvider {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly apiKey: string;
  private readonly batchSize: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: OpenAiCompatibleEmbeddingProviderOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.model = opts.model;
    this.apiKey = (opts.apiKey ?? "").trim();
    this.batchSize = Math.max(1, opts.batchSize ?? 32);
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      const url = `${this.baseUrl}/embeddings`;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (this.apiKey) {
        headers.Authorization = `Bearer ${this.apiKey}`;
      }
      const res = await this.fetchImpl(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ model: this.model, input: batch }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`embeddings HTTP ${res.status}: ${errText.slice(0, 400)}`);
      }
      const data = (await res.json()) as {
        data?: Array<{ embedding?: number[] }>;
      };
      const rows = data.data ?? [];
      if (rows.length !== batch.length) {
        throw new Error(`embeddings: expected ${batch.length} vectors, got ${rows.length}`);
      }
      const dim = rows[0]?.embedding?.length ?? 0;
      for (const row of rows) {
        const emb = row.embedding;
        if (!emb || emb.length !== dim) {
          throw new Error("embeddings: inconsistent vector lengths in batch");
        }
        out.push(emb);
      }
    }
    return out;
  }
}
