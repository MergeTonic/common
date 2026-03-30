import { createHash } from "node:crypto";
import * as nodePath from "node:path";

export type HydrationChunk = {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  document: string;
  estimatedTokens: number;
  symbol?: string;
};

export type ChunkerConfig = {
  maxLinesPerChunk?: number;
  maxEstimatedTokens?: number;
};

function estimateTokens(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }
  return Math.max(1, Math.ceil(trimmed.length / 4));
}

type ChunkSegment = {
  startIndex: number;
  endIndex: number;
  symbol?: string;
};

function chunkId(path: string, startLine: number, endLine: number, document: string): string {
  const digest = createHash("sha256")
    .update(path, "utf8")
    .update("\x1e")
    .update(String(startLine), "utf8")
    .update("\x1e")
    .update(String(endLine), "utf8")
    .update("\x1e")
    .update(document, "utf8")
    .digest("hex")
    .slice(0, 16);
  return `${path}:${startLine}-${endLine}:${digest}`;
}

const SYMBOL_PATTERNS = [
  /\b(?:class|interface|enum|type|function)\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/m,
  /\bdef\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/m,
  /\b(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][A-Za-z0-9_$]*\s*=>)/m,
  /^\s*(?:public|private|protected|static|readonly|async|get|set|\s)*([A-Za-z_$][A-Za-z0-9_$]*)\s*\([^)]*\)\s*\{/m,
];

function extractPrimarySymbol(document: string): string | undefined {
  const source = document.trim();
  if (!source) {
    return undefined;
  }
  for (const pattern of SYMBOL_PATTERNS) {
    const match = source.match(pattern);
    const symbol = match?.[1]?.trim();
    if (symbol) {
      return symbol;
    }
  }
  return undefined;
}

type TsParserNode = {
  type: string;
  startIndex: number;
  endIndex: number;
  text?: string;
  children?: TsParserNode[];
  childForFieldName?: (name: string) => TsParserNode | null;
};

const TS_DECLARATION_TYPES = new Set<string>([
  "class_declaration",
  "interface_declaration",
  "enum_declaration",
  "type_alias_declaration",
  "function_declaration",
  "method_definition",
  "arrow_function",
  "internal_module",
]);

function collectTargetNodes(node: TsParserNode, targetTypes: Set<string>): TsParserNode[] {
  if (targetTypes.has(node.type)) {
    return [node];
  }
  const children = node.children ?? [];
  const out: TsParserNode[] = [];
  for (const child of children) {
    out.push(...collectTargetNodes(child, targetTypes));
  }
  return out;
}

function lineFromOffset(content: string, offset: number): number {
  if (offset <= 0) {
    return 1;
  }
  return content.slice(0, offset).split(/\r?\n/).length;
}

function chunkSpanByEstimate(
  filePath: string,
  source: string,
  startLine: number,
  config: { maxLinesPerChunk: number; maxEstimatedTokens: number },
  forcedSymbol?: string,
): HydrationChunk[] {
  const lines = source.split(/\r?\n/);
  const chunks: HydrationChunk[] = [];
  let start = 0;
  while (start < lines.length) {
    let end = start;
    let currentTokens = 0;
    while (end < lines.length) {
      const candidate = lines.slice(start, end + 1).join("\n");
      const estimated = estimateTokens(candidate);
      const candidateLineCount = end - start + 1;
      if (
        end > start &&
        (candidateLineCount > config.maxLinesPerChunk || estimated > config.maxEstimatedTokens)
      ) {
        break;
      }
      currentTokens = estimated;
      end += 1;
    }
    const document = lines.slice(start, end).join("\n");
    if (document.length > 0) {
      const chunkStartLine = startLine + start;
      const chunkEndLine = chunkStartLine + Math.max(0, end - start - 1);
      chunks.push({
        id: chunkId(filePath, chunkStartLine, chunkEndLine, document),
        path: filePath,
        startLine: chunkStartLine,
        endLine: chunkEndLine,
        document,
        estimatedTokens: currentTokens,
        symbol: forcedSymbol ?? extractPrimarySymbol(document),
      });
    }
    start = end;
  }
  return chunks;
}

function collectTreeSitterSegments(filePath: string, content: string): ChunkSegment[] | null {
  const extension = nodePath.extname(filePath).toLowerCase();
  if (extension !== ".ts" && extension !== ".tsx") {
    return null;
  }
  try {
    const parserModule = require("tree-sitter");
    const tsModule = require("tree-sitter-typescript");
    const ParserCtor = (parserModule as { default?: new () => unknown }).default ?? parserModule;
    const parser = new (ParserCtor as {
      new (): { setLanguage(language: unknown): void; parse(source: string): { rootNode: TsParserNode } };
    })();
    parser.setLanguage(extension === ".tsx" ? tsModule.tsx : tsModule.typescript);
    const tree = parser.parse(content);
    const nodes = collectTargetNodes(tree.rootNode, TS_DECLARATION_TYPES).sort(
      (left, right) => left.startIndex - right.startIndex,
    );
    if (nodes.length === 0) {
      return null;
    }
    const segments: ChunkSegment[] = [];
    let cursor = 0;
    for (const node of nodes) {
      const safeStart = Math.max(0, Math.min(content.length, node.startIndex));
      const safeEnd = Math.max(safeStart, Math.min(content.length, node.endIndex));
      if (cursor < safeStart) {
        segments.push({ startIndex: cursor, endIndex: safeStart });
      }
      const symbol = node.childForFieldName?.("name")?.text?.trim();
      segments.push({
        startIndex: safeStart,
        endIndex: safeEnd,
        symbol: symbol || undefined,
      });
      cursor = safeEnd;
    }
    if (cursor < content.length) {
      segments.push({ startIndex: cursor, endIndex: content.length });
    }
    return segments.filter((segment) => segment.endIndex > segment.startIndex);
  } catch {
    return null;
  }
}

function collectRegexDeclarationSegments(content: string): ChunkSegment[] {
  const markerPattern = /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?(?:function|class|interface|enum|type)\s+([A-Za-z_$][A-Za-z0-9_$]*)\b|(?:^|\n)\s*(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][A-Za-z0-9_$]*\s*=>)|(?:^|\n)\s*(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm;
  const markers: Array<{ index: number; symbol?: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = markerPattern.exec(content)) !== null) {
    const raw = match[0] ?? "";
    const symbol = (match[1] ?? match[2] ?? match[3] ?? "").trim() || undefined;
    const leadingNewline = raw.startsWith("\n") ? 1 : 0;
    const index = match.index + leadingNewline;
    markers.push({ index, symbol });
    if (raw.length === 0) {
      markerPattern.lastIndex += 1;
    }
  }
  if (markers.length === 0) {
    return [{ startIndex: 0, endIndex: content.length }];
  }
  markers.sort((left, right) => left.index - right.index);
  const segments: ChunkSegment[] = [];
  let cursor = 0;
  for (let i = 0; i < markers.length; i++) {
    const marker = markers[i]!;
    const nextStart = markers[i + 1]?.index ?? content.length;
    if (cursor < marker.index) {
      segments.push({ startIndex: cursor, endIndex: marker.index });
    }
    segments.push({
      startIndex: marker.index,
      endIndex: Math.max(marker.index, nextStart),
      symbol: marker.symbol,
    });
    cursor = Math.max(cursor, nextStart);
  }
  if (cursor < content.length) {
    segments.push({ startIndex: cursor, endIndex: content.length });
  }
  return segments.filter((segment) => segment.endIndex > segment.startIndex);
}

export class LineTokenEstimateChunker {
  readonly maxLinesPerChunk: number;
  readonly maxEstimatedTokens: number;
  readonly version = "line-estimate-v1";

  constructor(config: ChunkerConfig = {}) {
    this.maxLinesPerChunk = config.maxLinesPerChunk ?? 80;
    this.maxEstimatedTokens = config.maxEstimatedTokens ?? 600;
  }

  chunkText(path: string, content: string): HydrationChunk[] {
    const segments = collectTreeSitterSegments(path, content) ?? collectRegexDeclarationSegments(content);
    const chunks: HydrationChunk[] = [];
    for (const segment of segments) {
      const source = content.slice(segment.startIndex, segment.endIndex);
      if (!source.trim()) {
        continue;
      }
      const startLine = lineFromOffset(content, segment.startIndex);
      chunks.push(
        ...chunkSpanByEstimate(
          path,
          source,
          startLine,
          {
            maxLinesPerChunk: this.maxLinesPerChunk,
            maxEstimatedTokens: this.maxEstimatedTokens,
          },
          segment.symbol,
        ),
      );
    }
    return chunks.filter((chunk) => chunk.document.length > 0);
  }
}
