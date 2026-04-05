import { chunksFromAstArtifact, type ChunkAstMatch } from "../chunker/astGrepChunker";
import type { RetrievalHit } from "../hydrationTypes";
import type { EmbeddingProvider } from "./embeddingProvider";
import { HistogramEmbeddingProvider } from "./embeddingProvider";
import type { VectorRecord } from "../vector/types";
import { createMemoryVectorIndex } from "../vector/memoryIndex";
import {
  buildVectorRecordsWithCache,
  resolveVectorCacheOptions,
  type VectorCacheMode,
  type VectorCacheWarning,
} from "../vector/memoryVectorSnapshot";
import {
  attachAstMetadata,
  buildAstLineMapFromMatches,
  buildConflictMidLineMap,
} from "./attachAstMetadata";

/** Compile batch retrieval artifact from optional subquestions and a single fallback query. */
export function buildRetrievalArtifact(params: {
  subquestions?: Array<{ id: string; text: string }>;
  fallbackQuery?: string;
}): { schema: "tonic-retrieval-hydration"; version: "1"; hits: RetrievalHit[] } {
  const hits: RetrievalHit[] = [];
  const qs = params.subquestions?.length
    ? params.subquestions.map((s) => s.text)
    : params.fallbackQuery
      ? [params.fallbackQuery]
      : [];
  qs.forEach((text, i) => {
    hits.push({
      chunk_id: `q-${i}`,
      text,
      score: 1,
      metadata: { source: "memory" },
    });
  });
  return { schema: "tonic-retrieval-hydration", version: "1", hits };
}

/** Deterministic bag-of-char embedding for memory-index cosine similarity (no external deps). */
export function textToEmbedding(text: string, dim = 48): number[] {
  const v = new Array(dim).fill(0);
  const lower = text.toLowerCase().replace(/\s+/g, " ").trim();
  for (let i = 0; i < lower.length; i++) {
    const c = lower.charCodeAt(i);
    v[c % dim] += 1;
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

export type MemoryRetrievalParams = {
  repoRoot: string;
  matches: ChunkAstMatch[];
  queries: string[];
  topKPerQuery: number;
  conflictRegions?: Array<{ path: string; mid_line?: number }>;
  /** Defaults to histogram embedder when omitted. */
  embedder?: EmbeddingProvider;
  env?: NodeJS.ProcessEnv;
  vectorCachePath?: string;
  vectorCacheMode?: VectorCacheMode | string;
  vectorCacheDiagnostics?: { ruleset_hash?: string; repo_head?: string };
  vectorCacheWarningsOut?: VectorCacheWarning[];
};

/**
 * Index ast-derived chunks in the memory vector backend and rank by query embedding similarity.
 */
export async function runMemoryRetrievalForHydrate(params: MemoryRetrievalParams): Promise<RetrievalHit[]> {
  const chunks = chunksFromAstArtifact(params.repoRoot, params.matches);
  if (chunks.length === 0 || params.queries.length === 0) {
    return [];
  }

  const embedder = params.embedder ?? new HistogramEmbeddingProvider();
  const env = params.env ?? (typeof process !== "undefined" ? process.env : ({} as NodeJS.ProcessEnv));
  const { path: cachePath, mode: cacheMode } = resolveVectorCacheOptions({
    vectorCachePath: params.vectorCachePath,
    vectorCacheMode: params.vectorCacheMode,
    env,
  });

  const index = createMemoryVectorIndex();
  let records: VectorRecord[];
  if (cachePath && cacheMode !== "off") {
    records = await buildVectorRecordsWithCache({
      repoRoot: params.repoRoot,
      matches: params.matches,
      embedder,
      env,
      cachePath,
      cacheMode,
      diagnostics: params.vectorCacheDiagnostics,
      warningsOut: params.vectorCacheWarningsOut,
    });
  } else {
    const docTexts = chunks.map((c) => `${c.path}\n${c.text}`);
    const docEmbeddings = await embedder.embedBatch(docTexts);
    records = chunks.map((c, i) => ({
      id: c.ast_match_id ?? `chunk-${i}`,
      document: `${c.path}\n${c.text}`,
      embedding: docEmbeddings[i]!,
      metadata: {
        path: c.path,
        start_line: c.start_line,
        end_line: c.end_line,
        source: "memory",
        ast_rule_id: c.ast_rule_id,
        ast_match_id: c.ast_match_id,
      },
    }));
  }
  await index.upsert(records);

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
