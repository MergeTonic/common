/**
 * Coding hydration: retrieval backends, vector stubs, ast-grep chunking, ast-aware ranking.
 * See docs/retrieval-hydration.md and schemas/tonic-retrieval-hydration.v1.json.
 */

export type { RetrievalHit } from "./hydrationTypes";
export type { AstGrepChunk } from "./chunker/types";
export { chunkFileAstGrep, chunksFromAstArtifact, type ChunkAstMatch } from "./chunker/astGrepChunker";
export type { QueryResult, VectorIndex, VectorRecord } from "./vector/types";
export { createMemoryVectorIndex } from "./vector/memoryIndex";
export {
  chromaConfigFromEnv,
  assertChromaConfigured,
  fetchChromaHeartbeat,
  ChromaHttpIndexUnavailable,
  normalizeChromaBaseUrl,
} from "./vector/chromaHttpIndex";
export { ChromaVectorIndex } from "./vector/chromaVectorIndex";
export {
  buildRetrievalArtifact,
  textToEmbedding,
  runMemoryRetrievalForHydrate,
  type MemoryRetrievalParams,
} from "./retrieval/buildRetrieval";
export {
  HistogramEmbeddingProvider,
  OpenAiCompatibleEmbeddingProvider,
  type EmbeddingProvider,
} from "./retrieval/embeddingProvider";
export {
  HfInferenceEmbeddingProvider,
  hfEmbedInferenceRequestUrl,
  type HfInferenceEmbeddingProviderOptions,
} from "./retrieval/hfInferenceEmbeddingProvider";
export { resolveEmbeddingProvider } from "./retrieval/resolveEmbeddingProvider";
export { embeddingFingerprintFromEnv } from "./retrieval/embeddingFingerprint";
export {
  buildVectorRecordsWithCache,
  contentDigestUtf8,
  loadMemoryVectorIndexFromPath,
  parseMemoryVectorIndexArtifact,
  resolveVectorCacheOptions,
  saveMemoryVectorIndexToPath,
  type MemoryVectorIndexArtifactV1,
  type MemoryVectorSnapshotRecordV1,
  type VectorCacheMode,
  type VectorCacheWarning,
} from "./vector/memoryVectorSnapshot";
export { runRetrievalForHydrate, type RunRetrievalForHydrateParams } from "./retrieval/retrievalBackend";
export { applyRetrievalHybridStage, type RetrievalHybridStageParams } from "./retrieval/retrievalHybridStage";
export {
  attachAstMetadata,
  buildAstLineMapFromMatches,
  buildConflictMidLineMap,
  type AstLineMap,
} from "./retrieval/attachAstMetadata";
export { indexAstChunks } from "./indexer/indexer";
export { buildBatchCodeWalkTrace } from "./agent/codeWalkAgent";
export { enrichCodeWalkTraceWithLlmReflection } from "./agent/interactiveCodeWalk";
export type { CodeSearchSession } from "./agent/codeSearchLoop/types";
export { runCodeSearchAgentTurns, type CodeSearchAgentParams } from "./agent/codeSearchLoop/runCodeSearchAgentTurns";
export { symbolSearchHits } from "./tools/symbolSearch";
export { regexSearchHits } from "./tools/regexSearch";
export { hybridMergeHits, reciprocalRankFusion } from "./tools/hybridSearch";
export { describeAstGrepScanTool, type AstGrepScanToolRequest } from "./tools/astGrepScanTool";

import type { RetrievalHit } from "./hydrationTypes";

export function buildEmptyRetrievalArtifact(): {
  schema: "tonic-retrieval-hydration";
  version: "1";
  hits: RetrievalHit[];
} {
  return { schema: "tonic-retrieval-hydration", version: "1", hits: [] };
}
