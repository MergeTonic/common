import { chunksFromAstArtifact, type ChunkAstMatch } from "../chunker/astGrepChunker";
import type { EmbeddingProvider } from "../retrieval/embeddingProvider";
import { HistogramEmbeddingProvider } from "../retrieval/embeddingProvider";
import type { VectorIndex, VectorRecord } from "../vector/types";

/**
 * Upsert ast-derived chunks into a vector index (memory or future Chroma).
 * Chunk boundaries come from ast-grep matches, not tree-sitter.
 */
export async function indexAstChunks(
  repoRoot: string,
  matches: ChunkAstMatch[],
  index: VectorIndex,
  embedder?: EmbeddingProvider,
  metadataSource: "memory" | "chroma" = "memory",
): Promise<{ chunkCount: number; rulepackNote: string }> {
  const chunks = chunksFromAstArtifact(repoRoot, matches);
  const provider = embedder ?? new HistogramEmbeddingProvider();
  const texts = chunks.map((c) => `${c.path}\n${c.text}`);
  const embeddings = await provider.embedBatch(texts);
  const records: VectorRecord[] = chunks.map((c, i) => ({
    id: c.ast_match_id ?? `chunk-${i}`,
    document: `${c.path}\n${c.text}`,
    embedding: embeddings[i]!,
    metadata: {
      path: c.path,
      start_line: c.start_line,
      end_line: c.end_line,
      source: metadataSource,
      ast_rule_id: c.ast_rule_id,
      ast_match_id: c.ast_match_id,
    },
  }));
  await index.upsert(records);
  return { chunkCount: records.length, rulepackNote: "ast-grep-v1" };
}
