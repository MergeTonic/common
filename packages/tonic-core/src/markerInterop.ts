/**
 * Convert parsed Git conflict blocks into {@link ConflictRegion} rows for tooling / comments.
 * This is not a weave merge — it only interprets existing Git conflict text.
 */

import type { ConflictBlock } from "./conflictParser";
import { conflictRegionsToAnnotatedLines, type ConflictRegion } from "./mergeUtils";

const GIT_MERGE_KIND = "git merge";

/**
 * Map Git-style {@link ConflictBlock}s (from {@link parseGitConflicts}) to conflict regions.
 * Line numbers are 1-based inclusive start/end in the source text (same convention as {@link conflictFileFromBlocks}).
 */
export function gitConflictBlocksToConflictRegions(blocks: ConflictBlock[]): ConflictRegion[] {
  return blocks.map((b) => {
    const leftLines = b.segments[0]?.lines ?? [];
    const rightLines = b.segments[1]?.lines ?? [];
    return {
      baseContent: "",
      leftContent: leftLines.join("\n"),
      rightContent: rightLines.join("\n"),
      startLine: b.startLine + 1,
      endLine: b.endLine + 1,
      conflictKind: b.kind === GIT_MERGE_KIND ? GIT_MERGE_KIND : b.kind,
    };
  });
}

/**
 * Build a read-only Tonic-style preview (markers) from Git blocks — for extension / comments only.
 * Not written to marker branches by default (product uses weave output there).
 */
export function gitConflictBlocksToTonicAnnotatedPreview(blocks: ConflictBlock[]): string[] {
  const regions = gitConflictBlocksToConflictRegions(blocks);
  return conflictRegionsToAnnotatedLines(
    regions.map((r) => ({ ...r, conflictKind: GIT_MERGE_KIND })),
  );
}
