import { parseConflictLabel, type ConflictLabelMetadata } from "./markerLabel";

/**
 * Parse Tonic annotated conflict markers.
 */

export interface ConflictSegment {
  label: string;
  lines: string[];
  metadata: ConflictLabelMetadata;
}

export interface ConflictBlock {
  startLine: number;
  endLine: number;
  kind: string;
  baseKind: string;
  tags: Record<string, string>;
  segments: ConflictSegment[];
}

const BEGIN = /^<<<<<<< begin (.+)$/;
const MID = /^======= begin (.+)$/;
const END = /^>>>>>>> end conflict$/;

export function parseTonicConflicts(text: string): ConflictBlock[] {
  return parseTonicConflictsWithDiagnostics(text).blocks;
}

/** Same as {@link parseTonicConflicts} but emits `warnings` for unterminated blocks (EOF before end marker). */
export function parseTonicConflictsWithDiagnostics(text: string): {
  blocks: ConflictBlock[];
  warnings: string[];
} {
  const lines = text.split(/\r?\n/);
  const blocks: ConflictBlock[] = [];
  const warnings: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const bm = BEGIN.exec(lines[i]!);
    if (!bm) {
      i += 1;
      continue;
    }
    const startLine = i;
    const kind = bm[1]!.trim();
    const parsedKind = parseConflictLabel(kind);
    i += 1;
    const segments: ConflictSegment[] = [];
    let currentLabel = kind;
    let current: string[] = [];
    let closed = false;
    while (i < lines.length) {
      const line = lines[i]!;
      if (END.test(line)) {
        segments.push({
          label: currentLabel,
          lines: current,
          metadata: parseConflictLabel(currentLabel),
        });
        blocks.push({
          startLine,
          endLine: i,
          kind,
          baseKind: parsedKind.baseKind,
          tags: { ...parsedKind.tags },
          segments,
        });
        i += 1;
        closed = true;
        break;
      }
      const mm = MID.exec(line);
      if (mm) {
        segments.push({
          label: currentLabel,
          lines: current,
          metadata: parseConflictLabel(currentLabel),
        });
        currentLabel = mm[1]!.trim();
        current = [];
        i += 1;
        continue;
      }
      current.push(line);
      i += 1;
    }
    if (!closed) {
      warnings.push(
        `Unterminated Tonic conflict block (kind "${kind}") starting at line ${startLine + 1}`,
      );
    }
  }
  return { blocks, warnings };
}

export function conflictSummary(block: ConflictBlock): string {
  return `${block.kind} @ ${block.startLine + 1}-${block.endLine + 1}`;
}
