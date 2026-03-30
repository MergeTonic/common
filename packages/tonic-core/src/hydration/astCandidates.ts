import type { CodeSearchRecord } from "./searchTools";
import type { HydrationAstNodeKind, HydrationRetrievalAstCandidate } from "./types";

function clampScore(value: number, floor = 0.05): number {
  return Number(Math.max(floor, Math.min(1, value)).toFixed(6));
}

function normalizeSymbol(symbol: string | undefined): string | undefined {
  const trimmed = symbol?.trim();
  return trimmed ? trimmed : undefined;
}

function inferNodeKind(record: Pick<CodeSearchRecord, "code" | "symbol">): HydrationAstNodeKind {
  const source = record.code.trim();
  if (!record.symbol) {
    return "module";
  }
  if (/^\s*(?:export\s+)?(?:abstract\s+)?(?:class|interface|enum|type)\b/m.test(source)) {
    return "class";
  }
  if (/^\s*(?:export\s+)?(?:async\s+)?function\b/m.test(source) || /^\s*(?:async\s+)?def\b/m.test(source)) {
    return "function";
  }
  if (
    /^\s*(?:public|private|protected|static|readonly|async|get|set|\s)*[A-Za-z_$][A-Za-z0-9_$]*\s*\([^)]*\)\s*\{/m.test(
      source,
    )
  ) {
    return "method";
  }
  return "function";
}

function buildAstNodeId(params: {
  filePath: string;
  nodeKind: HydrationAstNodeKind;
  symbol?: string;
  startLine?: number;
  endLine?: number;
}): string {
  if (params.nodeKind === "module" || !params.symbol) {
    return `module:${params.filePath}`;
  }
  const lineSpan =
    params.startLine != null || params.endLine != null ?
      `:${params.startLine ?? 0}-${params.endLine ?? params.startLine ?? 0}`
    : "";
  return `${params.nodeKind}:${params.symbol}:${params.filePath}${lineSpan}`;
}

function pushCandidate(
  bucket: Map<string, HydrationRetrievalAstCandidate>,
  candidate: HydrationRetrievalAstCandidate,
): void {
  const existing = bucket.get(candidate.ast_node_id);
  if (!existing || candidate.score > existing.score) {
    bucket.set(candidate.ast_node_id, candidate);
  }
}

export function buildHydrationAstCandidates(
  records: CodeSearchRecord[],
  limit = 12,
): HydrationRetrievalAstCandidate[] {
  const candidates = new Map<string, HydrationRetrievalAstCandidate>();

  for (const record of records) {
    pushCandidate(candidates, {
      ast_node_id: buildAstNodeId({
        filePath: record.filePath,
        nodeKind: "module",
      }),
      path: record.filePath,
      score: clampScore(record.score * 0.45, 0.1),
      rule_id: "module-path-v1",
      node_kind: "module",
    });

    const symbol = normalizeSymbol(record.symbol);
    if (!symbol) {
      continue;
    }
    const nodeKind = inferNodeKind(record);
    pushCandidate(candidates, {
      ast_node_id: buildAstNodeId({
        filePath: record.filePath,
        nodeKind,
        symbol,
        startLine: record.startLine,
        endLine: record.endLine,
      }),
      path: record.filePath,
      score: clampScore(record.score * (record.source === "symbol" ? 1.05 : 0.9), 0.2),
      rule_id: record.source === "symbol" ? "symbol-search-v1" : "chunk-symbol-v1",
      node_kind: nodeKind,
      symbol,
      start_line: record.startLine,
      end_line: record.endLine,
    });
  }

  return [...candidates.values()]
    .sort((left, right) => right.score - left.score || left.ast_node_id.localeCompare(right.ast_node_id))
    .slice(0, limit);
}

export function extractHydrationCandidateSymbol(candidate: {
  ast_node_id: string;
  symbol?: string;
}): string {
  if (candidate.symbol?.trim()) {
    return candidate.symbol.trim();
  }
  const parts = candidate.ast_node_id.split(":");
  return parts.length >= 3 ? (parts[1] ?? "") : "";
}

export function inferHydrationCandidateNodeKind(candidate: {
  ast_node_id: string;
  node_kind?: HydrationAstNodeKind;
}): HydrationAstNodeKind {
  if (candidate.node_kind) {
    return candidate.node_kind;
  }
  if (candidate.ast_node_id.startsWith("module:")) {
    return "module";
  }
  if (candidate.ast_node_id.startsWith("class:")) {
    return "class";
  }
  if (candidate.ast_node_id.startsWith("method:")) {
    return "method";
  }
  if (candidate.ast_node_id.startsWith("function:")) {
    return "function";
  }
  return "span";
}
