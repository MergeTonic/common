import { indexAstChunks } from "../indexer/indexer";
import { chromaConfigFromEnv } from "../vector/chromaHttpIndex";
import { ChromaVectorIndex } from "../vector/chromaVectorIndex";
import { createMemoryVectorIndex } from "../vector/memoryIndex";
import {
  attachAstMetadata,
  buildAstLineMapFromMatches,
  buildConflictMidLineMap,
} from "./attachAstMetadata";
import { chunksFromAstArtifact } from "../chunker/astGrepChunker";
import type { RetrievalHit } from "../hydrationTypes";
import type { EmbeddingProvider } from "./embeddingProvider";
import { runMemoryRetrievalForHydrate, type MemoryRetrievalParams } from "./buildRetrieval";
import { resolveEmbeddingProvider } from "./resolveEmbeddingProvider";

export type RunRetrievalForHydrateParams = MemoryRetrievalParams & {
  retrievalBackend?: "memory" | "chroma";
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
};

function backendFromEnv(env: NodeJS.ProcessEnv): "memory" | "chroma" {
  const v = (env.TONIC_RETRIEVAL_BACKEND ?? "memory").trim().toLowerCase();
  return v === "chroma" ? "chroma" : "memory";
}

async function runChromaRetrievalForHydrate(
  params: MemoryRetrievalParams,
  embedder: EmbeddingProvider,
  fetchImpl: typeof fetch,
  env: NodeJS.ProcessEnv,
): Promise<RetrievalHit[]> {
  const cfgBase = chromaConfigFromEnv(env);
  if (!cfgBase) {
    throw new Error("TONIC_RETRIEVAL_BACKEND=chroma requires TONIC_CHROMA_URL");
  }
  const chunks = chunksFromAstArtifact(params.repoRoot, params.matches);
  if (chunks.length === 0 || params.queries.length === 0) {
    return [];
  }
  const probe = await embedder.embedBatch([" "]);
  const embeddingDim = probe[0]?.length ?? 0;
  if (!embeddingDim) {
    throw new Error("Chroma retrieval: embedder returned empty vector for dimension probe");
  }
  const cfg = { ...cfgBase, embeddingDim };
  const index = new ChromaVectorIndex(cfg, fetchImpl);
  const ids = chunks.map((c, i) => c.ast_match_id ?? `chunk-${i}`);
  await index.deleteIds(ids);
  await indexAstChunks(params.repoRoot, params.matches, index, embedder, "chroma");

  const astLineMap = buildAstLineMapFromMatches(params.matches);
  const conflictMap =
    params.conflictRegions && params.conflictRegions.length > 0
      ? buildConflictMidLineMap(params.conflictRegions)
      : undefined;

  const queryEmbeddings = await embedder.embedBatch(params.queries);
  const collected: RetrievalHit[] = [];
  for (let qi = 0; qi < params.queries.length; qi++) {
    const qEmb = queryEmbeddings[qi]!;
    const res = await index.query(qEmb, params.topKPerQuery);
    for (let i = 0; i < res.ids.length; i++) {
      collected.push({
        chunk_id: res.ids[i]!,
        text: res.documents[i] ?? "",
        score: 1 - (res.distances?.[i] ?? 0),
        metadata: { ...(res.metadatas[i] ?? {}) },
      });
    }
  }

  const best = new Map<string, RetrievalHit>();
  for (const h of collected) {
    const prev = best.get(h.chunk_id);
    if (!prev || h.score > prev.score) {
      best.set(h.chunk_id, h);
    }
  }
  const merged = [...best.values()].sort((a, b) => b.score - a.score);
  const cap = params.topKPerQuery * Math.max(1, params.queries.length);
  return attachAstMetadata(merged.slice(0, cap), astLineMap, conflictMap);
}

/**
 * Memory (default) or Chroma HTTP index; uses {@link resolveEmbeddingProvider} when embedder omitted.
 */
export async function runRetrievalForHydrate(params: RunRetrievalForHydrateParams): Promise<RetrievalHit[]> {
  const env = params.env ?? (typeof process !== "undefined" ? process.env : {});
  const backend = params.retrievalBackend ?? backendFromEnv(env);
  const embedder = params.embedder ?? resolveEmbeddingProvider(env);
  const fetchImpl = params.fetchImpl ?? globalThis.fetch;
  const { retrievalBackend: _rb, env: _e, fetchImpl: _f, ...memRest } = params;
  if (backend === "chroma") {
    try {
      return await runChromaRetrievalForHydrate(memRest, embedder, fetchImpl, env);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Chroma retrieval failed: ${msg}`);
    }
  }
  return runMemoryRetrievalForHydrate({ ...memRest, embedder, env });
}
