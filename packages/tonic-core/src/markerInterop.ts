/**
 * Convert parsed Git conflict blocks into {@link ConflictRegion} rows for tooling / comments.
 * This is not a weave merge — it only interprets existing Git conflict text.
 */

import type { AuthorMode } from "./authorAliasResolver";
import { createDefaultGitAuthorProbe, resolveAuthorAliasForSide } from "./authorAliasResolver";
import type { ConflictBlock } from "./conflictParser";
import { formatConflictLabel } from "./markerLabel";
import { conflictRegionsToAnnotatedLines, type ConflictRegion } from "./mergeUtils";

const GIT_MERGE_KIND = "git merge";

export const DEFAULT_GIT_MERGE_LEFT_INTENT = "preserve_base";
export const DEFAULT_GIT_MERGE_RIGHT_INTENT = "prefer_head";

export type GitMergeHydrationOptions = {
  authorMode?: AuthorMode;
  /** Repository root (required for `human` author mode). */
  repoRoot?: string;
  /** Refs or SHAs for left/right (used for `human` / `ref` modes). */
  leftRef?: string;
  rightRef?: string;
  explicitLeftAuthor?: string;
  explicitRightAuthor?: string;
  githubLoginLeft?: string;
  githubLoginRight?: string;
  leftIntent?: string;
  rightIntent?: string;
};

function mergeHydrationDefaults(opts?: GitMergeHydrationOptions): GitMergeHydrationOptions {
  return {
    authorMode: opts?.authorMode ?? "base-head",
    leftIntent: opts?.leftIntent ?? DEFAULT_GIT_MERGE_LEFT_INTENT,
    rightIntent: opts?.rightIntent ?? DEFAULT_GIT_MERGE_RIGHT_INTENT,
    ...opts,
  };
}

/**
 * Map Git-style {@link ConflictBlock}s (from {@link parseGitConflicts}) to conflict regions.
 * Line numbers are 1-based inclusive start/end in the source text (same convention as {@link conflictFileFromBlocks}).
 */
export function gitConflictBlocksToConflictRegions(
  blocks: ConflictBlock[],
  opts?: GitMergeHydrationOptions,
): ConflictRegion[] {
  const o = mergeHydrationDefaults(opts);
  const repoRoot = o.repoRoot ?? process.cwd();
  const leftRef = o.leftRef ?? "";
  const rightRef = o.rightRef ?? "";
  const mode = o.authorMode ?? "base-head";
  const gitProbe =
    mode === "human" && o.repoRoot !== undefined ? createDefaultGitAuthorProbe(repoRoot) : undefined;

  return blocks.map((b) => {
    const leftLines = b.segments[0]?.lines ?? [];
    const rightLines = b.segments[1]?.lines ?? [];
    const leftAuth = resolveAuthorAliasForSide("left", {
      repoRoot,
      mode,
      leftRef,
      rightRef,
      explicitLeft: o.explicitLeftAuthor,
      explicitRight: o.explicitRightAuthor,
      githubLoginLeft: o.githubLoginLeft,
      githubLoginRight: o.githubLoginRight,
      gitProbe,
    });
    const rightAuth = resolveAuthorAliasForSide("right", {
      repoRoot,
      mode,
      leftRef,
      rightRef,
      explicitLeft: o.explicitLeftAuthor,
      explicitRight: o.explicitRightAuthor,
      githubLoginLeft: o.githubLoginLeft,
      githubLoginRight: o.githubLoginRight,
      gitProbe,
    });
    const leftIntent = (o.leftIntent ?? DEFAULT_GIT_MERGE_LEFT_INTENT).trim() || DEFAULT_GIT_MERGE_LEFT_INTENT;
    const rightIntent =
      (o.rightIntent ?? DEFAULT_GIT_MERGE_RIGHT_INTENT).trim() || DEFAULT_GIT_MERGE_RIGHT_INTENT;

    const mlBegin = formatConflictLabel(GIT_MERGE_KIND, { author: leftAuth, intent: leftIntent });
    const mlMid = formatConflictLabel(GIT_MERGE_KIND, { author: rightAuth, intent: rightIntent });

    return {
      baseContent: "",
      leftContent: leftLines.join("\n"),
      rightContent: rightLines.join("\n"),
      startLine: b.startLine + 1,
      endLine: b.endLine + 1,
      conflictKind: GIT_MERGE_KIND,
      conflictBaseKind: GIT_MERGE_KIND,
      conflictTags: {
        author: leftAuth,
        intent: leftIntent,
        author_right: rightAuth,
        intent_right: rightIntent,
      },
      markerLabelBegin: mlBegin,
      markerLabelMid: mlMid,
    };
  });
}

/**
 * Build a read-only Tonic-style preview (markers) from Git blocks — for extension / comments only.
 * In git-merge agent mode this output can also be used for marker-branch continuity.
 */
export function gitConflictBlocksToTonicAnnotatedPreview(
  blocks: ConflictBlock[],
  opts?: GitMergeHydrationOptions,
): string[] {
  const regions = gitConflictBlocksToConflictRegions(blocks, opts);
  return conflictRegionsToAnnotatedLines(
    regions.map((r) => ({ ...r, conflictKind: GIT_MERGE_KIND })),
  );
}
