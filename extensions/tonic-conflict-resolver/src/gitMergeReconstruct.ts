import * as vscode from "vscode";
import {
  formatConflictLabel,
  parseConflictLabel,
  type ConflictRegion,
} from "@mergetonic/core";
import type { ConflictRegionJson } from "./mergeReport";

/** Map report JSON regions to @mergetonic/core ConflictRegion rows. */
export function reportRegionsToCore(
  regions: ConflictRegionJson[] | undefined,
): ConflictRegion[] {
  return (regions ?? []).map((r) => ({
    baseContent: r.base_content ?? "",
    leftContent: r.left_content ?? "",
    rightContent: r.right_content ?? "",
    startLine: r.start_line,
    endLine: r.end_line,
    conflictKind: r.conflict_kind,
    conflictBaseKind: r.conflict_base_kind,
    conflictTags: r.conflict_tags,
    markerLabelBegin: r.marker_label_begin,
    markerLabelMid: r.marker_label_mid,
  }));
}

export type GitMergeReconstructDefaults = {
  leftIntent: string;
  rightIntent: string;
  leftAuthor: string;
  rightAuthor: string;
};

export function readGitMergeDefaultsFromConfig(): GitMergeReconstructDefaults {
  const c = vscode.workspace.getConfiguration("tonic");
  return {
    leftIntent: c.get<string>("gitMergeIntent.leftDefault", "preserve_base") ?? "preserve_base",
    rightIntent: c.get<string>("gitMergeIntent.rightDefault", "prefer_head") ?? "prefer_head",
    leftAuthor: c.get<string>("gitMergeAuthor.leftDefault", "") ?? "",
    rightAuthor: c.get<string>("gitMergeAuthor.rightDefault", "") ?? "",
  };
}

/**
 * Legacy reports may have `conflict_kind: "git merge"` without author/intent tags.
 * Fill defaults so reconstructed markers match hydrated git-merge output.
 * Preserves explicit `marker_label_begin` / `marker_label_mid` from JSON.
 */
export function applyGitMergeReconstructDefaults(
  regions: ConflictRegion[],
  d: GitMergeReconstructDefaults,
): ConflictRegion[] {
  return regions.map((r) => {
    if (r.markerLabelBegin || r.markerLabelMid) {
      return r;
    }
    const meta = parseConflictLabel(r.conflictKind ?? "");
    if (meta.baseKind.trim().toLowerCase() !== "git merge") {
      return r;
    }
    const tags = { ...meta.tags, ...(r.conflictTags ?? {}) };
    if (!tags.intent) {
      tags.intent = d.leftIntent;
    }
    if (!tags.author) {
      tags.author = d.leftAuthor.trim() || "base";
    }
    if (!tags.intent_right) {
      tags.intent_right = d.rightIntent;
    }
    if (!tags.author_right) {
      tags.author_right = d.rightAuthor.trim() || "head";
    }
    return {
      ...r,
      conflictBaseKind: "git merge",
      conflictTags: tags,
      conflictKind: formatConflictLabel("git merge", tags),
    };
  });
}
