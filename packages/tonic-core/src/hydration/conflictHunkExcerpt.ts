import * as fs from "node:fs";
import * as path from "node:path";

import { parseGitConflictsWithDiagnostics } from "../gitConflictParser";
import type { ConflictContextArtifactV1, ConflictRegionV1 } from "./conflictScan";

export const CONFLICT_HUNK_MAX_LINES_PER_SIDE = 40;
export const CONFLICT_HUNK_MAX_TOTAL_CHARS = 32000;

export type ConflictHunkExcerptRegionV1 = {
  region_id?: string;
  path: string;
  ours_excerpt: string;
  theirs_excerpt: string;
  truncated?: boolean;
};

export type ConflictHunkExcerptsArtifactV1 = {
  schema: "tonic-conflict-hunk-excerpts";
  version: "1";
  regions: ConflictHunkExcerptRegionV1[];
};

function truncateLines(lines: string[], maxLines: number): { text: string; truncated: boolean } {
  if (lines.length <= maxLines) {
    return { text: lines.join("\n"), truncated: false };
  }
  const slice = lines.slice(0, maxLines);
  return {
    text: slice.join("\n") + "\n[… truncated …]",
    truncated: true,
  };
}

/**
 * Build bounded ours/theirs text per conflict region for LLM context.
 * Respects `TONIC_CONFLICT_EXCERPT=0` to disable (returns empty regions array).
 */
export function buildConflictHunkExcerpts(
  repoRoot: string,
  conflictArt: ConflictContextArtifactV1,
  env: NodeJS.ProcessEnv,
): ConflictHunkExcerptsArtifactV1 {
  const disabled = (env.TONIC_CONFLICT_EXCERPT ?? "").trim() === "0";
  if (disabled || conflictArt.conflict_regions.length === 0) {
    return { schema: "tonic-conflict-hunk-excerpts", version: "1", regions: [] };
  }

  const maxLines = Math.max(
    1,
    parseInt(env.TONIC_CONFLICT_EXCERPT_MAX_LINES_PER_SIDE ?? "", 10) || CONFLICT_HUNK_MAX_LINES_PER_SIDE,
  );
  const maxTotal = Math.max(
    1024,
    parseInt(env.TONIC_CONFLICT_EXCERPT_MAX_TOTAL_CHARS ?? "", 10) || CONFLICT_HUNK_MAX_TOTAL_CHARS,
  );

  const regions: ConflictHunkExcerptRegionV1[] = [];
  let totalChars = 0;

  for (const r of conflictArt.conflict_regions) {
    if (totalChars >= maxTotal) {
      break;
    }
    const abs = path.join(repoRoot, r.path.replace(/\//g, path.sep));
    let text: string;
    try {
      text = fs.readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    const { blocks } = parseGitConflictsWithDiagnostics(text);
    const start0 = r.start_line - 1;
    const end0 = r.end_line - 1;
    let matched = false;
    for (const b of blocks) {
      if (b.startLine !== start0 || b.endLine !== end0) {
        continue;
      }
      matched = true;
      const oursLines = b.segments[0]?.lines ?? [];
      const theirsLines = b.segments[1]?.lines ?? [];
      const o = truncateLines(oursLines, maxLines);
      const t = truncateLines(theirsLines, maxLines);
      const row: ConflictHunkExcerptRegionV1 = {
        region_id: r.region_id,
        path: r.path,
        ours_excerpt: o.text,
        theirs_excerpt: t.text,
        truncated: o.truncated || t.truncated,
      };
      const rowChars = row.ours_excerpt.length + row.theirs_excerpt.length + 64;
      if (totalChars + rowChars > maxTotal) {
        row.ours_excerpt = row.ours_excerpt.slice(0, Math.max(0, maxTotal - totalChars - 200)) + "\n[… truncated …]";
        row.theirs_excerpt = "";
        row.truncated = true;
      }
      totalChars += row.ours_excerpt.length + row.theirs_excerpt.length + 64;
      regions.push(row);
      break;
    }
    if (!matched) {
      regions.push({
        region_id: r.region_id,
        path: r.path,
        ours_excerpt: "",
        theirs_excerpt: "",
        truncated: false,
      });
    }
  }

  return { schema: "tonic-conflict-hunk-excerpts", version: "1", regions };
}

export function conflictHunkExcerptsToPromptJson(art: ConflictHunkExcerptsArtifactV1): string {
  return JSON.stringify(art.regions, null, 2);
}

export function mergeBranchHintsFromRegions(regions: ConflictRegionV1[]): string {
  const labels: string[] = [];
  for (const r of regions) {
    if (r.ours_label) {
      labels.push(`ours=${r.ours_label}`);
    }
    if (r.theirs_label) {
      labels.push(`theirs=${r.theirs_label}`);
    }
  }
  if (labels.length === 0) {
    return "";
  }
  return [...new Set(labels)].join("; ");
}
