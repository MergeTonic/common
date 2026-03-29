import { currentLines, initialState, mergeStates } from "./core";
import { parseTonicConflictsWithDiagnostics, type ConflictBlock } from "./conflictParser";
import { formatConflictLabel, normalizeConflictLabel, parseConflictLabel } from "./markerLabel";

export interface ConflictRegion {
  baseContent: string;
  leftContent: string;
  rightContent: string;
  startLine: number;
  endLine: number;
  conflictKind: string;
  conflictBaseKind?: string;
  conflictTags?: Record<string, string>;
  leftCommitIds?: string[];
  rightCommitIds?: string[];
  /** Full text after `<<<<<<< begin ` when it differs from {@link conflictKind}-derived default. */
  markerLabelBegin?: string;
  /** Full text after `======= begin ` when it differs from begin label. */
  markerLabelMid?: string;
}

export interface ConflictFile {
  path: string;
  conflicts: ConflictRegion[];
  content: string;
  /** Author / side label for prompts (default "left"). */
  leftLabel?: string;
  /** Author / side label for prompts (default "right"). */
  rightLabel?: string;
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
    const kindMeta = parseConflictLabel(kind);
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
    let midMarkerLabel = "";
    for (const cl of inner) {
      if (cl.startsWith("======= begin ")) {
        midMarkerLabel = cl.slice("======= begin ".length).trim();
        seenMid = true;
        continue;
      }
      if (!seenMid) {
        leftLines.push(cl);
      } else {
        rightLines.push(cl);
      }
    }
    const sameLabels = !midMarkerLabel || midMarkerLabel === kind;
    conflicts.push({
      baseContent: "",
      leftContent: leftLines.join("\n"),
      rightContent: rightLines.join("\n"),
      startLine,
      endLine,
      conflictKind: kind,
      conflictBaseKind: kindMeta.baseKind,
      conflictTags: { ...kindMeta.tags },
      markerLabelBegin: sameLabels ? undefined : kind,
      markerLabelMid: sameLabels ? undefined : midMarkerLabel || undefined,
    });
    if (i < n && annotatedLines[i]!.startsWith(">>>>>>> end conflict")) {
      i += 1;
    }
  }
  return { path, conflicts, content: text, leftLabel: "left", rightLabel: "right" };
}

/**
 * Reconstruct Tonic marker text from structured regions (inverse of {@link annotatedToConflictFile}).
 * Grammar matches `conflicts.ts` / weave output: begin / mid / end markers per region.
 */
export function conflictRegionsToAnnotatedLines(regions: ConflictRegion[]): string[] {
  const out: string[] = [];
  for (const r of regions) {
    const kind = (r.conflictKind ?? "").trim() || "added both";
    const conflictKind = r.conflictBaseKind || r.conflictTags
      ? formatConflictLabel(r.conflictBaseKind ?? parseConflictLabel(kind).baseKind, r.conflictTags ?? {})
      : normalizeConflictLabel(kind);
    const beginLabel = r.markerLabelBegin ?? conflictKind;
    const midLabel = r.markerLabelMid ?? r.markerLabelBegin ?? conflictKind;
    out.push(`<<<<<<< begin ${beginLabel}`);
    const left = r.leftContent ? r.leftContent.split(/\r?\n/) : [];
    const right = r.rightContent ? r.rightContent.split(/\r?\n/) : [];
    for (const ln of left) {
      out.push(ln);
    }
    out.push(`======= begin ${midLabel}`);
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
    leftLabel: "left",
    rightLabel: "right",
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
        conflictBaseKind: b.baseKind,
        conflictTags: { ...b.tags },
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

export type TonicAuthorIntentHydration = {
  leftAuthor: string;
  rightAuthor: string;
  leftIntent: string;
  rightIntent: string;
};

function blockToHydratedRegion(block: ConflictBlock, opts: TonicAuthorIntentHydration): ConflictRegion {
  if (block.segments.length < 2) {
    const seg0 = block.segments[0];
    const t0 = { ...(seg0?.metadata.tags ?? {}) };
    if (!t0.author) t0.author = opts.leftAuthor;
    if (!t0.intent) t0.intent = opts.leftIntent;
    const base = seg0?.metadata.baseKind ?? block.baseKind;
    return {
      baseContent: "",
      leftContent: seg0?.lines.join("\n") ?? "",
      rightContent: "",
      startLine: block.startLine + 1,
      endLine: block.endLine + 1,
      conflictKind: formatConflictLabel(base, t0),
      conflictBaseKind: base,
      conflictTags: { ...t0 },
    };
  }
  const seg0 = block.segments[0]!;
  const seg1 = block.segments[1]!;
  const t0 = { ...seg0.metadata.tags };
  const t1 = { ...seg1.metadata.tags };
  if (!t0.author) t0.author = opts.leftAuthor;
  if (!t0.intent) t0.intent = opts.leftIntent;
  if (!t1.author) t1.author = opts.rightAuthor;
  if (!t1.intent) t1.intent = opts.rightIntent;
  const mlBegin = formatConflictLabel(seg0.metadata.baseKind, t0);
  const mlMid = formatConflictLabel(seg1.metadata.baseKind, t1);
  const same = mlBegin === mlMid;
  return {
    baseContent: "",
    leftContent: seg0.lines.join("\n"),
    rightContent: seg1.lines.join("\n"),
    startLine: block.startLine + 1,
    endLine: block.endLine + 1,
    conflictKind: block.kind,
    conflictBaseKind: block.baseKind,
    conflictTags: { ...block.tags },
    markerLabelBegin: same ? undefined : mlBegin,
    markerLabelMid: same ? undefined : mlMid,
  };
}

/**
 * Inject `author` / `intent` tags into Tonic conflict markers (e.g. after `mergeSnapshots`) when missing.
 * Preserves lines outside conflict blocks.
 */
export function hydrateTonicAnnotatedAuthorIntent(
  annotatedLines: string[],
  opts: TonicAuthorIntentHydration,
): string[] {
  const text = annotatedLines.join("\n");
  const { blocks } = parseTonicConflictsWithDiagnostics(text);
  if (blocks.length === 0) {
    return annotatedLines;
  }
  const out: string[] = [];
  let lineIdx = 0;
  for (const b of blocks) {
    while (lineIdx < b.startLine) {
      out.push(annotatedLines[lineIdx]!);
      lineIdx++;
    }
    const region = blockToHydratedRegion(b, opts);
    out.push(...conflictRegionsToAnnotatedLines([region]));
    lineIdx = b.endLine + 1;
  }
  while (lineIdx < annotatedLines.length) {
    out.push(annotatedLines[lineIdx]!);
    lineIdx++;
  }
  return out;
}
