import { currentLines, initialState, mergeStates } from "./core";
import type { ConflictBlock } from "./conflictParser";

export interface ConflictRegion {
  baseContent: string;
  leftContent: string;
  rightContent: string;
  startLine: number;
  endLine: number;
  conflictKind: string;
  leftCommitIds?: string[];
  rightCommitIds?: string[];
}

export interface ConflictFile {
  path: string;
  conflicts: ConflictRegion[];
  content: string;
}

/** Merge two file snapshots using Tonic weave states (no shared history). */
export function mergeSnapshots(
  leftLines: string[],
  rightLines: string[],
  opts?: { leftCommitId?: string; rightCommitId?: string },
): [string[], string[]] {
  const [mergedState, annotated] = mergeStates(
    initialState(leftLines, opts?.leftCommitId),
    initialState(rightLines, opts?.rightCommitId),
  );
  return [currentLines(mergedState), annotated];
}

/** Each `<<<<<<< begin` … `>>>>>>> end` block becomes one region (1-based line numbers for start/end like Python). */
export function annotatedToConflictFile(path: string, annotatedLines: string[]): ConflictFile {
  const text = annotatedLines.join("\n");
  const conflicts: ConflictRegion[] = [];
  let i = 0;
  const n = annotatedLines.length;
  while (i < n) {
    const line = annotatedLines[i]!;
    if (!line.startsWith("<<<<<<< begin ")) {
      i += 1;
      continue;
    }
    const kind = line.slice("<<<<<<< begin ".length).trim();
    const startLine = i + 1;
    i += 1;
    const inner: string[] = [];
    while (i < n && !annotatedLines[i]!.startsWith(">>>>>>> end conflict")) {
      inner.push(annotatedLines[i]!);
      i += 1;
    }
    const endLine = i < n ? i + 1 : n;
    const leftLines: string[] = [];
    const rightLines: string[] = [];
    let seenMid = false;
    for (const cl of inner) {
      if (cl.startsWith("======= begin ")) {
        seenMid = true;
        continue;
      }
      if (!seenMid) {
        leftLines.push(cl);
      } else {
        rightLines.push(cl);
      }
    }
    conflicts.push({
      baseContent: "",
      leftContent: leftLines.join("\n"),
      rightContent: rightLines.join("\n"),
      startLine,
      endLine,
      conflictKind: kind,
    });
    if (i < n && annotatedLines[i]!.startsWith(">>>>>>> end conflict")) {
      i += 1;
    }
  }
  return { path, conflicts, content: text };
}

/**
 * Reconstruct Tonic marker text from structured regions (inverse of {@link annotatedToConflictFile}).
 * Grammar matches `conflicts.ts` / weave output: begin / mid / end markers per region.
 */
export function conflictRegionsToAnnotatedLines(regions: ConflictRegion[]): string[] {
  const out: string[] = [];
  for (const r of regions) {
    const kind = r.conflictKind.trim() || "added both";
    out.push(`<<<<<<< begin ${kind}`);
    const left = r.leftContent ? r.leftContent.split(/\r?\n/) : [];
    const right = r.rightContent ? r.rightContent.split(/\r?\n/) : [];
    for (const ln of left) {
      out.push(ln);
    }
    out.push(`======= begin ${kind}`);
    for (const ln of right) {
      out.push(ln);
    }
    out.push(">>>>>>> end conflict");
  }
  return out;
}

export function conflictFileFromBlocks(path: string, text: string, blocks: ConflictBlock[]): ConflictFile {
  return {
    path,
    content: text,
    conflicts: blocks.map((b) => {
      const leftLines = b.segments[0]?.lines ?? [];
      const rightLines = b.segments[1]?.lines ?? [];
      return {
        baseContent: "",
        leftContent: leftLines.join("\n"),
        rightContent: rightLines.join("\n"),
        startLine: b.startLine + 1,
        endLine: b.endLine + 1,
        conflictKind: b.kind,
      };
    }),
  };
}

/** Prefer right (head) hunk when non-empty; else left — matches GitHub agent semantics. */
export function heuristicResolvedLines(region: ConflictRegion): string[] {
  const rc = region.rightContent ? region.rightContent.split(/\r?\n/) : [];
  if (rc.length) {
    return rc;
  }
  return region.leftContent ? region.leftContent.split(/\r?\n/) : [];
}

export function suggestionLineCountOk(resolved: string[], spanLen: number): boolean {
  return resolved.length === spanLen;
}

/**
 * Replace each Tonic conflict region (markers + left/right bodies) with the corresponding
 * resolved line block. Regions are applied from bottom to top so indices stay valid.
 */
export function applyTonicResolutions(
  annotatedLines: string[],
  resolvedPerRegion: string[][],
): string[] {
  const cf = annotatedToConflictFile("_", annotatedLines);
  if (resolvedPerRegion.length !== cf.conflicts.length) {
    throw new Error(
      `applyTonicResolutions: expected ${cf.conflicts.length} region resolutions, got ${resolvedPerRegion.length}`,
    );
  }
  const order = cf.conflicts.map((r, i) => ({ r, i })).sort((a, b) => b.r.startLine - a.r.startLine);
  const lines = [...annotatedLines];
  for (const { r, i } of order) {
    const start = r.startLine - 1;
    const deleteCount = r.endLine - r.startLine + 1;
    lines.splice(start, deleteCount, ...resolvedPerRegion[i]!);
  }
  return lines;
}

/** Heuristic resolution for every region: clean file lines (no Tonic markers). */
export function applyTonicHeuristic(annotatedLines: string[]): string[] {
  const cf = annotatedToConflictFile("_", annotatedLines);
  const resolved = cf.conflicts.map((c) => heuristicResolvedLines(c));
  return applyTonicResolutions(annotatedLines, resolved);
}
