/**
 * Optional Chroma HTTP client placeholder. Wire TONIC_CHROMA_URL + collection when deploying;
 * hydrate batch mode uses the memory index by default.
 */
export type ChromaHttpConfig = {
  baseUrl: string;
  collection: string;
  /** When set, create/reuse enforces `tonic:embedding_dim` parity with Python chroma_client. */
  embeddingDim?: number;
};

export function normalizeChromaBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

export function chromaConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ChromaHttpConfig | null {
  const baseUrl = (env.TONIC_CHROMA_URL ?? "").trim();
  const collection = (env.TONIC_CHROMA_COLLECTION ?? "tonic-hydration").trim();
  if (!baseUrl) {
    return null;
  }
  return { baseUrl, collection };
}

export class ChromaHttpIndexUnavailable extends Error {
  constructor(message = "Chroma HTTP index requires TONIC_CHROMA_URL and runtime chromadb client") {
    super(message);
    this.name = "ChromaHttpIndexUnavailable";
  }
}

/** Reserved for Phase-3 HTTP upsert/query; batch hydrate does not call this yet. */
export async function assertChromaConfigured(env?: NodeJS.ProcessEnv): Promise<ChromaHttpConfig> {
  const c = chromaConfigFromEnv(env);
  if (!c) {
    throw new ChromaHttpIndexUnavailable();
  }
  return c;
}

/** Best-effort HTTP heartbeat for wiring checks (v1 REST paths; returns false if unreachable). */
export async function fetchChromaHeartbeat(
  config: ChromaHttpConfig,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<boolean> {
  const base = normalizeChromaBaseUrl(config.baseUrl);
  for (const path of ["/api/v1/heartbeat", "/api/v1/version"]) {
    try {
      const r = await fetchImpl(`${base}${path}`, { method: "GET" });
      if (r.ok) {
        return true;
      }
    } catch {
      /* try next path */
    }
  }
  return false;
}
