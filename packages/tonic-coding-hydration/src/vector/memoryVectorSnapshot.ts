import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import type { ChunkAstMatch } from "../chunker/astGrepChunker";
import { chunksFromAstArtifact } from "../chunker/astGrepChunker";
import type { EmbeddingProvider } from "../retrieval/embeddingProvider";
import { embeddingFingerprintFromEnv } from "../retrieval/embeddingFingerprint";
import type { VectorRecord } from "./types";

export type MemoryVectorIndexArtifactV1 = {
  schema: "tonic-memory-vector-index";
  version: "1";
  embedding_fingerprint: string;
  embedding_dim?: number;
  digest_algorithm?: "sha256";
  ruleset_hash?: string;
  repo_head?: string;
  records: MemoryVectorSnapshotRecordV1[];
};

export type MemoryVectorSnapshotRecordV1 = {
  id: string;
  document: string;
  embedding: number[];
  metadata: Record<string, unknown>;
  content_digest: string;
};

export type VectorCacheMode = "off" | "read" | "write" | "readwrite";

export type VectorCacheWarning = { code: string; message: string };

export function contentDigestUtf8(document: string): string {
  return crypto.createHash("sha256").update(document, "utf8").digest("hex");
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

export function parseMemoryVectorIndexArtifact(raw: unknown): MemoryVectorIndexArtifactV1 | null {
  if (!isRecord(raw)) {
    return null;
  }
  if (raw.schema !== "tonic-memory-vector-index" || raw.version !== "1") {
    return null;
  }
  const fp = raw.embedding_fingerprint;
  if (typeof fp !== "string" || !fp.trim()) {
    return null;
  }
  const recs = raw.records;
  if (!Array.isArray(recs)) {
    return null;
  }
  const records: MemoryVectorSnapshotRecordV1[] = [];
  for (const r of recs) {
    if (!isRecord(r)) {
      continue;
    }
    const id = r.id;
    const document = r.document;
    const embedding = r.embedding;
    const metadata = r.metadata;
    const content_digest = r.content_digest;
    if (typeof id !== "string" || typeof document !== "string" || typeof content_digest !== "string") {
      continue;
    }
    if (!Array.isArray(embedding) || !embedding.every((x) => typeof x === "number" && Number.isFinite(x))) {
      continue;
    }
    records.push({
      id,
      document,
      embedding: embedding.map((x) => Number(x)),
      metadata: isRecord(metadata) ? { ...metadata } : {},
      content_digest,
    });
  }
  const out: MemoryVectorIndexArtifactV1 = {
    schema: "tonic-memory-vector-index",
    version: "1",
    embedding_fingerprint: fp.trim(),
    records,
  };
  if (typeof raw.embedding_dim === "number" && Number.isFinite(raw.embedding_dim) && raw.embedding_dim > 0) {
    out.embedding_dim = Math.floor(raw.embedding_dim);
  }
  if (raw.digest_algorithm === "sha256") {
    out.digest_algorithm = "sha256";
  }
  if (typeof raw.ruleset_hash === "string") {
    out.ruleset_hash = raw.ruleset_hash;
  }
  if (typeof raw.repo_head === "string") {
    out.repo_head = raw.repo_head;
  }
  return out;
}

export function loadMemoryVectorIndexFromPath(filePath: string): MemoryVectorIndexArtifactV1 | null {
  const p = path.resolve(filePath);
  if (!fs.existsSync(p)) {
    return null;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8")) as unknown;
    return parseMemoryVectorIndexArtifact(raw);
  } catch {
    return null;
  }
}

export function saveMemoryVectorIndexToPath(
  filePath: string,
  artifact: MemoryVectorIndexArtifactV1,
): void {
  const p = path.resolve(filePath);
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const body = {
    ...artifact,
    digest_algorithm: artifact.digest_algorithm ?? ("sha256" as const),
  };
  fs.writeFileSync(p, `${JSON.stringify(body)}\n`, "utf8");
}

/**
 * Resolve cache path and mode from explicit params and env.
 * Empty path ⇒ mode `off`. When path is set and mode omitted in env/params, default `readwrite`.
 */
export function resolveVectorCacheOptions(params: {
  vectorCachePath?: string;
  vectorCacheMode?: VectorCacheMode | string;
  env?: NodeJS.ProcessEnv;
}): { path: string; mode: VectorCacheMode } {
  const env = params.env ?? (typeof process !== "undefined" ? process.env : {});
  const p = (params.vectorCachePath ?? env.TONIC_VECTOR_CACHE_PATH ?? "").trim();
  const raw = (params.vectorCacheMode ?? env.TONIC_VECTOR_CACHE_MODE ?? "").trim().toLowerCase();
  if (!p) {
    return { path: "", mode: "off" };
  }
  if (raw === "off") {
    return { path: p, mode: "off" };
  }
  if (raw === "read") {
    return { path: p, mode: "read" };
  }
  if (raw === "write") {
    return { path: p, mode: "write" };
  }
  if (raw === "readwrite" || raw === "read-write") {
    return { path: p, mode: "readwrite" };
  }
  return { path: p, mode: "readwrite" };
}

export type BuildVectorRecordsWithCacheParams = {
  repoRoot: string;
  matches: ChunkAstMatch[];
  embedder: EmbeddingProvider;
  env: NodeJS.ProcessEnv;
  cachePath: string;
  cacheMode: VectorCacheMode;
  diagnostics?: { ruleset_hash?: string; repo_head?: string };
  warningsOut?: VectorCacheWarning[];
};

/**
 * Build {@link VectorRecord} list for current AST chunks, reusing embeddings from snapshot when
 * fingerprint and per-chunk content digest match. Returns records in chunk order.
 */
export async function buildVectorRecordsWithCache(
  params: BuildVectorRecordsWithCacheParams,
): Promise<VectorRecord[]> {
  const chunks = chunksFromAstArtifact(params.repoRoot, params.matches);
  if (chunks.length === 0) {
    return [];
  }

  const fp = embeddingFingerprintFromEnv(params.env);
  const probe = await params.embedder.embedBatch([" "]);
  const expectedDim = probe[0]?.length ?? 0;
  if (expectedDim <= 0) {
    throw new Error("Vector cache: embedder returned empty dimension probe");
  }

  let snapshot: MemoryVectorIndexArtifactV1 | null = null;

  if (params.cacheMode === "read" || params.cacheMode === "readwrite") {
    snapshot = loadMemoryVectorIndexFromPath(params.cachePath);
    if (!snapshot && (params.cacheMode === "read" || params.cacheMode === "readwrite")) {
      params.warningsOut?.push({
        code: "vector_cache_missing",
        message: `No valid snapshot at ${params.cachePath}; embedded all chunks.`,
      });
    } else if (snapshot && snapshot.embedding_fingerprint !== fp) {
      params.warningsOut?.push({
        code: "vector_cache_fingerprint_mismatch",
        message: "Snapshot embedding_fingerprint does not match current embedder; re-embedded all chunks.",
      });
      snapshot = null;
    } else if (
      snapshot?.embedding_dim !== undefined &&
      snapshot.embedding_dim > 0 &&
      snapshot.embedding_dim !== expectedDim
    ) {
      params.warningsOut?.push({
        code: "vector_cache_dim_mismatch",
        message: `Snapshot embedding_dim ${snapshot.embedding_dim} != current ${expectedDim}; re-embedded all chunks.`,
      });
      snapshot = null;
    }
  }

  const byId = new Map<string, MemoryVectorSnapshotRecordV1>();
  if (snapshot) {
    for (const r of snapshot.records) {
      byId.set(r.id, r);
    }
  }

  const docTexts = chunks.map((c) => `${c.path}\n${c.text}`);
  const needIndex: number[] = [];
  const embeddings: Array<number[] | undefined> = new Array(chunks.length);

  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i]!;
    const id = c.ast_match_id ?? `chunk-${i}`;
    const doc = docTexts[i]!;
    const digest = contentDigestUtf8(doc);
    const prev = byId.get(id);
    if (
      prev &&
      prev.content_digest === digest &&
      Array.isArray(prev.embedding) &&
      prev.embedding.length === expectedDim
    ) {
      embeddings[i] = prev.embedding;
    } else {
      needIndex.push(i);
    }
  }

  if (params.cacheMode === "write") {
    needIndex.length = 0;
    for (let i = 0; i < chunks.length; i++) {
      needIndex.push(i);
    }
    embeddings.fill(undefined);
  }

  if (needIndex.length > 0) {
    const toEmbed = needIndex.map((i) => docTexts[i]!);
    const fresh = await params.embedder.embedBatch(toEmbed);
    for (let j = 0; j < needIndex.length; j++) {
      embeddings[needIndex[j]!] = fresh[j]!;
    }
  }

  const records: VectorRecord[] = chunks.map((c, i) => {
    const id = c.ast_match_id ?? `chunk-${i}`;
    const emb = embeddings[i]!;
    return {
      id,
      document: docTexts[i]!,
      embedding: emb,
      metadata: {
        path: c.path,
        start_line: c.start_line,
        end_line: c.end_line,
        source: "memory" as const,
        ast_rule_id: c.ast_rule_id,
        ast_match_id: c.ast_match_id,
      },
    };
  });

  const dim = records[0]?.embedding?.length ?? 0;
  if (dim > 0) {
    for (const r of records) {
      if (!r.embedding || r.embedding.length !== dim) {
        throw new Error("Embedding dimension mismatch after cache merge");
      }
    }
  }

  if (params.cacheMode === "write" || params.cacheMode === "readwrite") {
    try {
      const snap: MemoryVectorIndexArtifactV1 = {
        schema: "tonic-memory-vector-index",
        version: "1",
        embedding_fingerprint: fp,
        embedding_dim: dim > 0 ? dim : undefined,
        digest_algorithm: "sha256",
        ruleset_hash: params.diagnostics?.ruleset_hash,
        repo_head: params.diagnostics?.repo_head,
        records: records.map((r) => ({
          id: r.id,
          document: r.document,
          embedding: r.embedding!,
          metadata: { ...r.metadata },
          content_digest: contentDigestUtf8(r.document),
        })),
      };
      saveMemoryVectorIndexToPath(params.cachePath, snap);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      params.warningsOut?.push({
        code: "vector_cache_write_failed",
        message: `Failed to write vector snapshot: ${msg.slice(0, 400)}`,
      });
    }
  }

  return records;
}
