import type { ChunkAstMatch } from "../../chunker/astGrepChunker";
import type { EmbeddingProvider } from "../../retrieval/embeddingProvider";
import type { VectorIndex } from "../../vector/types";

/** Tool session for optional multi-turn code search (retrieval index + embedder). */
export type CodeSearchSession = {
  repoRoot: string;
  matches: ChunkAstMatch[];
  index: VectorIndex;
  embedder: EmbeddingProvider;
};
