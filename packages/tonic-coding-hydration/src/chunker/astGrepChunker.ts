import * as fs from "node:fs";
import * as path from "node:path";

import type { AstGrepChunk } from "./types";

/** Minimal match shape for chunking (matches tonic-ast-hydration matches[]). */
export type ChunkAstMatch = {
  path: string;
  rule_id: string;
  start?: { line?: number; column?: number };
  end?: { line?: number; column?: number };
  meta?: Record<string, unknown>;
};

function lineRange(m: ChunkAstMatch): { lo: number; hi: number } {
  const lo = m.start?.line ?? 1;
  const hi = Math.max(lo, m.end?.line ?? lo);
  return { lo, hi };
}

function mergeRanges(ranges: Array<{ lo: number; hi: number }>, maxSpan: number): Array<{ lo: number; hi: number }> {
  if (ranges.length === 0) {
    return [];
  }
  const sorted = [...ranges].sort((a, b) => a.lo - b.lo || a.hi - b.hi);
  const out: Array<{ lo: number; hi: number }> = [];
  let cur = { ...sorted[0]! };
  for (let i = 1; i < sorted.length; i++) {
    const r = sorted[i]!;
    if (r.lo <= cur.hi + 1) {
      cur.hi = Math.max(cur.hi, r.hi);
    } else {
      out.push(cur);
      cur = { ...r };
    }
  }
  out.push(cur);
  return out.map((r) => {
    const span = r.hi - r.lo + 1;
    if (span <= maxSpan) {
      return r;
    }
    return { lo: r.lo, hi: r.lo + maxSpan - 1 };
  });
}

/**
 * Derive text chunks from ast-grep match line spans for one file.
 */
export function chunkFileAstGrep(repoRoot: string, relPath: string, matches: ChunkAstMatch[]): AstGrepChunk[] {
  const rel = relPath.replace(/\\/g, "/");
  const fileMatches = matches.filter((m) => m.path.replace(/\\/g, "/") === rel);
  if (fileMatches.length === 0) {
    return [];
  }
  const abs = path.join(repoRoot, rel);
  let lines: string[];
  try {
    const raw = fs.readFileSync(abs, "utf8");
    lines = raw.split(/\r?\n/);
  } catch {
    return [];
  }
  const merged = mergeRanges(fileMatches.map((m) => lineRange(m)), 120);
  const out: AstGrepChunk[] = [];
  let idx = 0;
  for (const rng of merged) {
    idx += 1;
    const start_line = rng.lo;
    const end_line = rng.hi;
    const slice = lines.slice(start_line - 1, end_line).join("\n");
    const first = fileMatches.find((m) => {
      const r = lineRange(m);
      return r.lo <= end_line && r.hi >= start_line;
    });
    const metaName = first?.meta && typeof first.meta.name === "string" ? first.meta.name : undefined;
    out.push({
      path: rel,
      start_line,
      end_line,
      text: slice,
      ast_rule_id: first?.rule_id,
      ast_match_id: `${rel}:${start_line}-${end_line}:${idx}`,
      symbol: metaName,
    });
  }
  return out;
}

/** Chunk every file that appears in the ast-grep match list (stable path order). */
export function chunksFromAstArtifact(repoRoot: string, matches: ChunkAstMatch[]): AstGrepChunk[] {
  const byPath = new Map<string, ChunkAstMatch[]>();
  for (const m of matches) {
    const p = m.path.replace(/\\/g, "/");
    const list = byPath.get(p) ?? [];
    list.push(m);
    byPath.set(p, list);
  }
  const chunks: AstGrepChunk[] = [];
  for (const rel of [...byPath.keys()].sort()) {
    chunks.push(...chunkFileAstGrep(repoRoot, rel, byPath.get(rel)!));
  }
  return chunks;
}
