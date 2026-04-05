import type { ChromaHttpConfig } from "./chromaHttpIndex";
import { normalizeChromaBaseUrl } from "./chromaHttpIndex";
import type { QueryResult, VectorIndex, VectorRecord } from "./types";

type CollectionsListResponse = {
  data?: Array<{ id?: string; name?: string }>;
};

type CollectionCreateResponse = {
  id?: string;
};

type CollectionDetailResponse = {
  id?: string;
  metadata?: Record<string, unknown> | null;
};

function embeddingDimMismatchMessage(collection: string, stored: unknown, current: number): string {
  return (
    `Chroma collection ${JSON.stringify(collection)}: embedding dimension mismatch ` +
    `(stored ${stored}, current embedder ${current}). ` +
    `Set TONIC_CHROMA_COLLECTION to a new name or delete the collection.`
  );
}

function unwrapListPayload(raw: unknown): Array<{ id?: string; name?: string }> {
  if (!raw || typeof raw !== "object") {
    return [];
  }
  const o = raw as Record<string, unknown>;
  if (Array.isArray(o.data)) {
    return o.data as Array<{ id?: string; name?: string }>;
  }
  if (Array.isArray(o.collections)) {
    return o.collections as Array<{ id?: string; name?: string }>;
  }
  if (Array.isArray(o)) {
    return o as Array<{ id?: string; name?: string }>;
  }
  return [];
}

/**
 * Chroma HTTP VectorIndex with client-supplied embeddings (REST v1).
 */
export class ChromaVectorIndex implements VectorIndex {
  private collectionId: string | null = null;
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly config: ChromaHttpConfig,
    fetchImpl: typeof fetch = globalThis.fetch,
  ) {
    this.base = normalizeChromaBaseUrl(config.baseUrl);
    this.fetchImpl = fetchImpl;
  }

  private async fetchCollectionDetail(collectionId: string): Promise<CollectionDetailResponse | null> {
    const url = `${this.base}/api/v1/collections/${collectionId}`;
    const r = await this.fetchImpl(url, { method: "GET" });
    if (!r.ok) {
      return null;
    }
    const j = (await r.json()) as CollectionDetailResponse | unknown;
    return j && typeof j === "object" ? (j as CollectionDetailResponse) : null;
  }

  private assertVectorDim(label: string, vec: number[], dim: number): void {
    if (vec.length !== dim) {
      throw new Error(
        `ChromaVectorIndex.${label}: expected embedding length ${dim}, got ${vec.length}`,
      );
    }
  }

  private async resolveCollectionId(): Promise<string> {
    if (this.collectionId) {
      return this.collectionId;
    }
    const embeddingDim = this.config.embeddingDim;
    const listUrl = `${this.base}/api/v1/collections`;
    const lr = await this.fetchImpl(listUrl, { method: "GET" });
    if (lr.ok) {
      const lj = (await lr.json()) as CollectionsListResponse | unknown;
      const rows = unwrapListPayload(lj);
      const found = rows.find((r) => r.name === this.config.collection);
      if (found?.id) {
        if (embeddingDim !== undefined && embeddingDim > 0) {
          const detail = await this.fetchCollectionDetail(found.id);
          const md = detail?.metadata;
          if (md && typeof md === "object") {
            const raw = md["tonic:embedding_dim"];
            if (raw !== undefined && raw !== null) {
              const prev = typeof raw === "number" ? raw : parseInt(String(raw), 10);
              if (Number.isFinite(prev) && prev !== embeddingDim) {
                throw new Error(embeddingDimMismatchMessage(this.config.collection, raw, embeddingDim));
              }
            }
          }
        }
        this.collectionId = found.id;
        return found.id;
      }
    }
    const meta: Record<string, unknown> = { "hnsw:space": "cosine" };
    if (embeddingDim !== undefined && embeddingDim > 0) {
      meta["tonic:embedding_dim"] = embeddingDim;
    }
    const cr = await this.fetchImpl(listUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: this.config.collection,
        metadata: meta,
      }),
    });
    if (!cr.ok) {
      const t = await cr.text();
      throw new Error(`Chroma create collection failed: ${cr.status} ${t.slice(0, 300)}`);
    }
    const cj = (await cr.json()) as CollectionCreateResponse;
    const id = cj.id;
    if (!id) {
      throw new Error("Chroma create collection: missing id");
    }
    this.collectionId = id;
    return id;
  }

  async upsert(records: VectorRecord[]): Promise<void> {
    if (records.length === 0) {
      return;
    }
    const id = await this.resolveCollectionId();
    const dim = this.config.embeddingDim;
    const url = `${this.base}/api/v1/collections/${id}/add`;
    const embeddings = records.map((r) => {
      if (!r.embedding?.length) {
        throw new Error("ChromaVectorIndex.upsert requires embedding on each record");
      }
      if (dim !== undefined && dim > 0) {
        this.assertVectorDim("upsert", r.embedding, dim);
      }
      return r.embedding;
    });
    const body = {
      ids: records.map((r) => r.id),
      embeddings,
      documents: records.map((r) => r.document),
      metadatas: records.map((r) => ({ ...r.metadata, source: "chroma" })),
    };
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Chroma add failed: ${res.status} ${t.slice(0, 400)}`);
    }
  }

  async query(queryEmbedding: number[], topK: number): Promise<QueryResult> {
    const dim = this.config.embeddingDim;
    if (dim !== undefined && dim > 0) {
      this.assertVectorDim("query", queryEmbedding, dim);
    }
    const id = await this.resolveCollectionId();
    const url = `${this.base}/api/v1/collections/${id}/query`;
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query_embeddings: [queryEmbedding],
        n_results: topK,
        include: ["documents", "metadatas", "distances"],
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Chroma query failed: ${res.status} ${t.slice(0, 400)}`);
    }
    const j = (await res.json()) as {
      ids?: string[][];
      documents?: (string | null)[][];
      metadatas?: (Record<string, unknown> | null)[][];
      distances?: number[][];
    };
    const ids0 = j.ids?.[0] ?? [];
    const docs0 = j.documents?.[0] ?? [];
    const meta0 = j.metadatas?.[0] ?? [];
    const dist0 = j.distances?.[0] ?? [];
    return {
      ids: ids0.map(String),
      documents: docs0.map((d) => d ?? ""),
      metadatas: meta0.map((m) => (m && typeof m === "object" ? m : {})),
      distances: dist0,
    };
  }

  async deleteIds(ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    const id = await this.resolveCollectionId();
    const url = `${this.base}/api/v1/collections/${id}/delete`;
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Chroma delete failed: ${res.status} ${t.slice(0, 300)}`);
    }
  }
}
