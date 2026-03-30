import { createHash } from "node:crypto";

import type { Embedder } from "./embedder";
import { HydrationRepository } from "./repository";
import type { VectorFilter, VectorIndex, VectorMetadataValue } from "./vectorIndex";

export type CodeSearchRecord = {
  code: string;
  filePath: string;
  chunkId: string;
  source: "semantic" | "regex" | "symbol" | "lexical" | "hybrid";
  score: number;
  symbol?: string;
  startLine?: number;
  endLine?: number;
};

function metadataToString(value: VectorMetadataValue | undefined): string {
  if (value == null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function metadataToNumber(value: VectorMetadataValue | undefined): number | undefined {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function lineFromOffset(content: string, offset: number): number {
  if (offset <= 0) {
    return 1;
  }
  return content.slice(0, offset).split(/\r?\n/).length;
}

function excerptForLine(content: string, line: number, radius = 2): string {
  const lines = content.split(/\r?\n/);
  const from = Math.max(0, line - 1 - radius);
  const to = Math.min(lines.length, line + radius);
  return lines.slice(from, to).join("\n");
}

function syntheticChunkId(parts: string[]): string {
  const digest = createHash("sha256").update(parts.join("\x1e"), "utf8").digest("hex").slice(0, 16);
  return `synthetic:${digest}`;
}

const SYMBOL_STOPWORDS = new Set([
  "which",
  "files",
  "modules",
  "symbols",
  "implement",
  "affect",
  "intent",
  "this",
  "that",
  "with",
  "from",
  "into",
  "about",
  "what",
  "where",
  "when",
  "does",
  "work",
  "current",
  "branch",
  "context",
  "hydrate",
  "hydration",
]);

export function extractSymbolCandidates(question: string, maxCandidates = 3): string[] {
  const out: string[] = [];
  const add = (raw: string): void => {
    const token = raw.replace(/[()]/g, "").trim();
    if (!token || token.length < 3) {
      return;
    }
    const lower = token.toLowerCase();
    if (SYMBOL_STOPWORDS.has(lower)) {
      return;
    }
    if (out.includes(token)) {
      return;
    }
    out.push(token);
  };

  for (const match of question.matchAll(/`([A-Za-z_$][A-Za-z0-9_$]*)`/g)) {
    add(match[1] ?? "");
  }
  for (const match of question.matchAll(/\b(?:function|class|method|symbol|module)\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/gi)) {
    add(match[1] ?? "");
  }
  for (const match of question.matchAll(/\b[A-Za-z_$][A-Za-z0-9_$]*\b/g)) {
    const token = match[0] ?? "";
    if (/[A-Z_]/.test(token) || /^[a-z]+[A-Z][A-Za-z0-9_$]*$/.test(token)) {
      add(token);
    }
    if (out.length >= maxCandidates) {
      break;
    }
  }
  return out.slice(0, maxCandidates);
}

export function extractRegexCandidates(question: string, maxCandidates = 2): string[] {
  const out: string[] = [];
  for (const match of question.matchAll(/"([^"]{3,})"|'([^']{3,})'/g)) {
    const raw = (match[1] ?? match[2] ?? "").trim();
    if (!raw) {
      continue;
    }
    const escaped = escapeRegExp(raw);
    if (!out.includes(escaped)) {
      out.push(escaped);
    }
    if (out.length >= maxCandidates) {
      break;
    }
  }
  return out.slice(0, maxCandidates);
}

export async function semanticSearchRecords(params: {
  index: VectorIndex;
  embedder: Embedder;
  query: string;
  numResults: number;
  filter?: VectorFilter;
}): Promise<CodeSearchRecord[]> {
  const embedding = await params.embedder.embedQuery(params.query);
  const hits = await params.index.similaritySearch(embedding, params.numResults, params.filter);
  const records: CodeSearchRecord[] = [];
  for (const hit of hits) {
    const metadata = hit.metadata ?? {};
    const filePath = metadataToString(metadata.path);
    if (!filePath) {
      continue;
    }
    records.push({
      code: hit.document,
      filePath,
      chunkId: metadataToString(metadata.chunk_id) || hit.id,
      source: "semantic",
      score: hit.score,
      symbol: metadataToString(metadata.symbol) || undefined,
      startLine: metadataToNumber(metadata.start_line),
      endLine: metadataToNumber(metadata.end_line),
    });
  }
  return records;
}

function tokenizeLexicalQuery(query: string): string[] {
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9_$]+/g)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length >= 2);
  return Array.from(new Set(tokens)).slice(0, 24);
}

function countTokenHits(haystack: string, token: string): number {
  const pattern = new RegExp(`\\b${escapeRegExp(token)}\\b`, "gi");
  let count = 0;
  while (pattern.exec(haystack) !== null) {
    count += 1;
    if (count > 100) {
      break;
    }
  }
  return count;
}

export function lexicalSearchRecords(params: {
  repository: HydrationRepository;
  query: string;
  numResults: number;
}): CodeSearchRecord[] {
  const tokens = tokenizeLexicalQuery(params.query);
  if (tokens.length === 0) {
    return [];
  }
  const records: CodeSearchRecord[] = [];
  for (const file of params.repository.readIndexableFiles()) {
    const normalized = file.content.toLowerCase();
    let totalHits = 0;
    let firstOffset = -1;
    for (const token of tokens) {
      const hits = countTokenHits(normalized, token);
      totalHits += hits;
      if (firstOffset < 0) {
        const offset = normalized.indexOf(token);
        if (offset >= 0) {
          firstOffset = offset;
        }
      }
    }
    if (totalHits <= 0) {
      continue;
    }
    const startLine = lineFromOffset(file.content, Math.max(0, firstOffset));
    const snippet = excerptForLine(file.content, startLine, 3);
    const normalizedScore = Math.min(1, totalHits / Math.max(tokens.length, 1));
    records.push({
      code: snippet || file.content.slice(0, 400),
      filePath: file.relativePath,
      chunkId: syntheticChunkId([file.relativePath, "lexical", tokens.join(",")]),
      source: "lexical",
      score: normalizedScore,
      startLine,
      endLine: startLine + Math.max(0, (snippet.match(/\n/g)?.length ?? 0)),
    });
  }
  return records.sort((left, right) => right.score - left.score).slice(0, params.numResults);
}

export async function hybridSearchRecords(params: {
  index: VectorIndex;
  embedder: Embedder;
  repository: HydrationRepository;
  denseQuery: string;
  sparseQuery: string;
  numResults: number;
  denseWeight?: number;
  sparseWeight?: number;
  filter?: VectorFilter;
}): Promise<CodeSearchRecord[]> {
  const denseWeight = params.denseWeight ?? 2.0;
  const sparseWeight = params.sparseWeight ?? 1.0;
  const rrfK = 60;
  const dense = await semanticSearchRecords({
    index: params.index,
    embedder: params.embedder,
    query: params.denseQuery,
    numResults: Math.max(params.numResults * 2, params.numResults),
    filter: params.filter,
  });
  const sparse = lexicalSearchRecords({
    repository: params.repository,
    query: params.sparseQuery,
    numResults: Math.max(params.numResults * 2, params.numResults),
  });

  const denseRank = new Map<string, number>();
  dense.forEach((record, index) => denseRank.set(`${record.filePath}\x1e${record.chunkId}`, index + 1));
  const sparseRank = new Map<string, number>();
  sparse.forEach((record, index) => sparseRank.set(`${record.filePath}\x1e${record.chunkId}`, index + 1));

  const all = new Map<string, CodeSearchRecord>();
  for (const record of dense) {
    all.set(`${record.filePath}\x1e${record.chunkId}`, record);
  }
  for (const record of sparse) {
    const key = `${record.filePath}\x1e${record.chunkId}`;
    if (!all.has(key)) {
      all.set(key, record);
    }
  }

  const scored = Array.from(all.entries())
    .map(([key, record]) => {
      const dr = denseRank.get(key);
      const sr = sparseRank.get(key);
      const fused =
        (dr ? denseWeight * (1 / (rrfK + dr)) : 0)
        + (sr ? sparseWeight * (1 / (rrfK + sr)) : 0);
      return {
        ...record,
        source: "hybrid" as const,
        score: fused > 0 ? fused : record.score,
      };
    })
    .sort((left, right) => right.score - left.score);
  return scored.slice(0, params.numResults);
}

export function regexSearchRecords(params: {
  repository: HydrationRepository;
  pattern: string;
  numResults: number;
}): CodeSearchRecord[] {
  const out: CodeSearchRecord[] = [];
  const regex = new RegExp(params.pattern, "gm");
  for (const file of params.repository.readIndexableFiles()) {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(file.content)) !== null) {
      const matched = match[0] ?? "";
      const startLine = lineFromOffset(file.content, match.index);
      const snippet = excerptForLine(file.content, startLine);
      out.push({
        code: snippet || matched,
        filePath: file.relativePath,
        chunkId: syntheticChunkId([file.relativePath, String(startLine), params.pattern, "regex"]),
        source: "regex",
        score: 0.7,
        startLine,
        endLine: startLine + Math.max(0, (snippet.match(/\n/g)?.length ?? 0)),
      });
      if (out.length >= params.numResults) {
        return out;
      }
      if (matched.length === 0) {
        regex.lastIndex += 1;
      }
    }
  }
  return out;
}

export function symbolSearchRecords(params: {
  repository: HydrationRepository;
  symbolName: string;
  numResults: number;
}): CodeSearchRecord[] {
  const escaped = escapeRegExp(params.symbolName);
  const declaration = new RegExp(
    [
      String.raw`\b(?:class|interface|enum|type|function)\s+${escaped}\b`,
      String.raw`\b(?:const|let|var)\s+${escaped}\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][A-Za-z0-9_$]*\s*=>)`,
      String.raw`^\s*(?:public|private|protected|static|readonly|async|get|set|\s)*${escaped}\s*\([^)]*\)\s*\{`,
    ].join("|"),
    "gm",
  );
  const out: CodeSearchRecord[] = [];
  for (const file of params.repository.readIndexableFiles()) {
    declaration.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = declaration.exec(file.content)) !== null) {
      const startLine = lineFromOffset(file.content, match.index);
      const snippet = excerptForLine(file.content, startLine);
      out.push({
        code: snippet || (match[0] ?? ""),
        filePath: file.relativePath,
        chunkId: syntheticChunkId([file.relativePath, String(startLine), params.symbolName, "symbol"]),
        source: "symbol",
        score: 0.9,
        symbol: params.symbolName,
        startLine,
        endLine: startLine + Math.max(0, (snippet.match(/\n/g)?.length ?? 0)),
      });
      if (out.length >= params.numResults) {
        return out;
      }
      if ((match[0] ?? "").length === 0) {
        declaration.lastIndex += 1;
      }
    }
  }
  return out;
}

export function listFiles(params: { repository: HydrationRepository; maxFiles?: number }): string[] {
  const maxFiles = params.maxFiles ?? 2000;
  return params.repository.listIndexablePaths().slice(0, maxFiles);
}

export function getFileContent(params: { repository: HydrationRepository; filePath: string }): string | null {
  const normalized = params.filePath.replace(/\\/g, "/").replace(/^\/+/, "");
  for (const file of params.repository.readIndexableFiles()) {
    if (file.relativePath === normalized) {
      return file.content;
    }
  }
  return null;
}

export function mergeSearchRecords(records: CodeSearchRecord[], limit: number): CodeSearchRecord[] {
  const seen = new Set<string>();
  const ordered = [...records].sort((left, right) => right.score - left.score);
  const out: CodeSearchRecord[] = [];
  for (const record of ordered) {
    const key = `${record.filePath}\x1e${record.chunkId}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(record);
    if (out.length >= limit) {
      break;
    }
  }
  return out;
}
