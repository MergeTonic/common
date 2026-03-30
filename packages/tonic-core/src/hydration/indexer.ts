import {
  createHydrationIndexState,
  isHydrationIndexStateCompatible,
  loadHydrationIndexState,
  saveHydrationIndexState,
  type HydrationIndexState,
} from "./indexState";
import { resolveHydrationArtifactPaths } from "./paths";
import { assertHydrationPersistHealth, writeHydrationPersistManifest } from "./persistence";
import { HydrationRepository, type HydrationRepositoryFile } from "./repository";
import type { Embedder } from "./embedder";
import { LineTokenEstimateChunker, type HydrationChunk } from "./chunker";
import type { VectorIndex, VectorRecord } from "./vectorIndex";

export type HydrationIndexerOptions = {
  strategyId?: string;
  chunker?: LineTokenEstimateChunker;
  repository?: HydrationRepository;
};

export type HydrationIndexSyncResult = {
  addedFiles: number;
  updatedFiles: number;
  removedFiles: number;
  unchangedFiles: number;
  indexedChunks: number;
  deletedChunks: number;
  state: HydrationIndexState;
};

function allChunkIds(state: HydrationIndexState | null): string[] {
  return Object.values(state?.indexed_files ?? {}).flatMap((entry) => entry.chunk_ids);
}

export class HydrationIndexer {
  readonly repoRoot: string;
  readonly index: VectorIndex;
  readonly embedder: Embedder;
  readonly chunker: LineTokenEstimateChunker;
  readonly strategyId: string;
  readonly repository: HydrationRepository;

  constructor(
    repoRoot: string,
    index: VectorIndex,
    embedder: Embedder,
    options: HydrationIndexerOptions = {},
  ) {
    this.repoRoot = repoRoot;
    this.index = index;
    this.embedder = embedder;
    this.chunker = options.chunker ?? new LineTokenEstimateChunker();
    this.strategyId = options.strategyId ?? "incremental-content-hash";
    this.repository = options.repository ?? new HydrationRepository(repoRoot);
  }

  async sync(params: {
    vectorBackend: string;
    normativeCommit?: string;
    prScopeHash?: string;
    cacheKey?: string;
    scope?: string;
    promptProfile?: string;
    dryRun?: boolean;
    historicalSince?: string;
    historicalBaseRef?: string;
    historicalState?: "merged" | "open" | "all";
    reuseState?: boolean;
    persistState?: boolean;
  }): Promise<HydrationIndexSyncResult> {
    const artifactPaths = resolveHydrationArtifactPaths(this.repoRoot);
    assertHydrationPersistHealth(artifactPaths.persistRoot);
    const reuseState = params.reuseState ?? true;
    const persistState = params.persistState ?? true;
    const previousState = reuseState ? loadHydrationIndexState(artifactPaths.indexStatePath) : null;
    const compatible = isHydrationIndexStateCompatible(previousState, {
      collectionName: this.index.collectionName,
      vectorBackend: params.vectorBackend,
      embedderModel: this.embedder.modelId,
      chunkerVersion: this.chunker.version,
      strategyId: this.strategyId,
      repoRoot: this.repoRoot,
      cacheKey: params.cacheKey,
      scope: params.scope,
      promptProfile: params.promptProfile,
      dryRun: params.dryRun,
      historicalSince: params.historicalSince,
      historicalBaseRef: params.historicalBaseRef,
      historicalState: params.historicalState,
    });
    if (!compatible) {
      const staleIds = allChunkIds(previousState);
      if (staleIds.length > 0) {
        await this.index.delete({ ids: staleIds });
      }
    }

    const previousFiles = compatible ? previousState?.indexed_files ?? {} : {};
    const nextFiles: HydrationIndexState["indexed_files"] = {};
    const repoFiles = this.repository.readIndexableFiles();
    const currentPaths = new Set(repoFiles.map((file) => file.relativePath));
    let addedFiles = 0;
    let updatedFiles = 0;
    let unchangedFiles = 0;
    let indexedChunks = 0;
    let deletedChunks = compatible ? 0 : allChunkIds(previousState).length;

    for (const [relativePath, entry] of Object.entries(previousFiles)) {
      if (!currentPaths.has(relativePath) && entry.chunk_ids.length > 0) {
        await this.index.delete({ ids: entry.chunk_ids });
        deletedChunks += entry.chunk_ids.length;
      }
    }

    for (const file of repoFiles) {
      const previousEntry = previousFiles[file.relativePath];
      if (previousEntry && previousEntry.content_hash === file.contentHash) {
        nextFiles[file.relativePath] = previousEntry;
        unchangedFiles += 1;
        continue;
      }
      if (previousEntry?.chunk_ids.length) {
        await this.index.delete({ ids: previousEntry.chunk_ids });
        deletedChunks += previousEntry.chunk_ids.length;
      }
      const records = await this.buildVectorRecords(file);
      if (records.length > 0) {
        await this.index.upsert(records);
      }
      nextFiles[file.relativePath] = {
        content_hash: file.contentHash,
        chunk_ids: records.map((record) => record.id),
        chunk_count: records.length,
        size_bytes: file.sizeBytes,
      };
      indexedChunks += records.length;
      if (previousEntry) {
        updatedFiles += 1;
      } else {
        addedFiles += 1;
      }
    }

    const state = createHydrationIndexState({
      collectionName: this.index.collectionName,
      vectorBackend: params.vectorBackend,
      embedderModel: this.embedder.modelId,
      chunkerVersion: this.chunker.version,
      strategyId: this.strategyId,
      repoRoot: this.repoRoot,
      cacheKey: params.cacheKey,
      prScopeHash: params.prScopeHash,
      scope: params.scope,
      promptProfile: params.promptProfile,
      dryRun: params.dryRun,
      historicalSince: params.historicalSince,
      historicalBaseRef: params.historicalBaseRef,
      historicalState: params.historicalState,
      normativeCommit: params.normativeCommit,
      indexedFiles: nextFiles,
    });
    if (persistState) {
      saveHydrationIndexState(artifactPaths.indexStatePath, state);
      writeHydrationPersistManifest({
        persistRoot: artifactPaths.persistRoot,
        writerKind: params.vectorBackend,
        cacheKey: params.cacheKey,
      });
    }

    return {
      addedFiles,
      updatedFiles,
      removedFiles: Object.keys(previousFiles).filter((entry) => !currentPaths.has(entry)).length,
      unchangedFiles,
      indexedChunks,
      deletedChunks,
      state,
    };
  }

  private async buildVectorRecords(file: HydrationRepositoryFile): Promise<VectorRecord[]> {
    const chunks = this.chunker.chunkText(file.relativePath, file.content);
    if (chunks.length === 0) {
      return [];
    }
    const embeddings = await this.embedder.embedDocuments(chunks.map((chunk) => chunk.document));
    return chunks.map((chunk, index) =>
      this.toVectorRecord(chunk, file.contentHash, file.sizeBytes, embeddings[index] ?? []),
    );
  }

  private toVectorRecord(
    chunk: HydrationChunk,
    contentHash: string,
    sizeBytes: number,
    embedding: number[],
  ): VectorRecord {
    return {
      id: chunk.id,
      document: chunk.document,
      embedding,
      metadata: {
        path: chunk.path,
        start_line: chunk.startLine,
        end_line: chunk.endLine,
        content_hash: contentHash,
        chunk_id: chunk.id,
        size_bytes: sizeBytes,
        ...(chunk.symbol ? { symbol: chunk.symbol } : {}),
      },
    };
  }
}
