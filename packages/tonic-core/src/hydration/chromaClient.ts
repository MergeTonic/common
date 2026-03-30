import { HydrationRuntimeError, OptionalAiDependencyError } from "./errors";
import type { HydrationRuntimeConfig } from "./runtimeConfig";

export type ChromaCollection = {
  upsert(payload: {
    ids: string[];
    documents: string[];
    embeddings: number[][];
    metadatas: Array<Record<string, unknown>>;
  }): Promise<void>;
  query(payload: {
    queryEmbeddings: number[][];
    nResults: number;
    where?: Record<string, unknown>;
    include?: string[];
  }): Promise<{
    ids?: string[][];
    documents?: string[][];
    metadatas?: Array<Array<Record<string, unknown>>>;
    distances?: number[][];
    embeddings?: number[][][];
  }>;
  get(payload: {
    ids: string[];
    include?: string[];
  }): Promise<{
    ids?: string[];
    documents?: string[];
    metadatas?: Array<Record<string, unknown>>;
    embeddings?: number[][];
  }>;
  delete(payload: { ids?: string[]; where?: Record<string, unknown> }): Promise<void>;
};

export type ChromaClientLike = {
  getOrCreateCollection(payload: {
    name: string;
    metadata?: Record<string, unknown>;
  }): Promise<ChromaCollection>;
};

export type HydrationChromaUrl = {
  raw: string;
  origin: string;
  host: string;
  port: number;
  ssl: boolean;
  pathname: string;
};

export type HydrationChromaHeartbeat = {
  ok: boolean;
  status?: number;
  heartbeatUrl: string;
  error?: string;
};

export async function loadHydrationChromaModule(): Promise<any> {
  try {
    const req = Function("return require")() as (name: string) => any;
    return req("chromadb");
  } catch {
    throw new OptionalAiDependencyError(
      "Optional AI dependency 'chromadb' is required for Chroma-backed hydration. Install the repo AI extras before using TONIC_CHROMA_MODE=http.",
    );
  }
}

export function parseHydrationChromaUrl(rawUrl: string): HydrationChromaUrl {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new HydrationRuntimeError(`Invalid TONIC_CHROMA_URL: ${rawUrl}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new HydrationRuntimeError(
      `TONIC_CHROMA_URL must use http or https. Received: ${rawUrl}`,
    );
  }
  return {
    raw: rawUrl,
    origin: parsed.origin,
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : parsed.protocol === "https:" ? 443 : 80,
    ssl: parsed.protocol === "https:",
    pathname: parsed.pathname || "/",
  };
}

export async function probeHydrationChromaHeartbeat(
  config: Pick<HydrationRuntimeConfig, "url" | "heartbeatPath">,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<HydrationChromaHeartbeat> {
  const parsed = parseHydrationChromaUrl(config.url);
  const heartbeatUrl = new URL(config.heartbeatPath, `${parsed.origin}/`).toString();
  const fetchImpl = opts.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(heartbeatUrl, {
      method: "GET",
      signal: AbortSignal.timeout(opts.timeoutMs ?? 3000),
    });
    return {
      ok: response.ok,
      status: response.status,
      heartbeatUrl,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      heartbeatUrl,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function createHydrationChromaClient(
  config: HydrationRuntimeConfig,
): Promise<ChromaClientLike> {
  if (config.mode !== "http") {
    throw new HydrationRuntimeError(
      `TypeScript hydration Chroma vendoring supports only HTTP mode. Received TONIC_CHROMA_MODE=${config.mode}. Use TONIC_CHROMA_MODE=http or TONIC_CHROMA_MODE=memory in TS.`,
    );
  }
  const mod = await loadHydrationChromaModule();
  return new mod.ChromaClient({ path: config.url }) as ChromaClientLike;
}

export async function getHydrationChromaCollection(
  config: HydrationRuntimeConfig,
): Promise<ChromaCollection> {
  const client = await createHydrationChromaClient(config);
  return client.getOrCreateCollection({
    name: config.collectionName,
    metadata: {
      "tonic.collection": config.collectionName,
      "tonic.persist_path": config.persistPath,
    },
  });
}
