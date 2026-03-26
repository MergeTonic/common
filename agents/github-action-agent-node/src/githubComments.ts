import * as crypto from "node:crypto";
import {
  continuityFooter,
  markdownCodeFences,
  markdownTextFences,
  type ContinuityHints,
} from "./commentChunking";

export type CommentMode = "summary-only" | "file+inline" | "inline-only" | "all";
export type Verbosity = "low" | "medium" | "high";

export function markerSummary(runId: string): string {
  return `<!-- tonic-agent:summary:${runId} -->`;
}

export function markerFile(path: string, contentHash: string): string {
  return `<!-- tonic-agent:file:${path}:${contentHash} -->`;
}

export function markerInline(path: string, start: number, end: number, kind: string): string {
  return `<!-- tonic-agent:inline:${path}:${start}:${end}:${kind} -->`;
}

export function markerOrphan(
  path: string,
  start: number,
  end: number,
  kind: string,
  reason: "ambiguous" | "unmapped",
): string {
  return `<!-- tonic-agent:orphan-inline:${path}:${start}:${end}:${kind}:${reason} -->`;
}

export function summaryUpsertPrefix(): string {
  return "<!-- tonic-agent:summary";
}

export function fileUpsertPrefix(path: string): string {
  return `<!-- tonic-agent:file:${path}:`;
}

function digest(...parts: string[]): string {
  const h = crypto.createHash("sha256");
  for (const p of parts) {
    h.update(p, "utf8");
    h.update("|", "utf8");
  }
  return h.digest("hex").slice(0, 16);
}

export function buildSummaryBody(
  runId: string,
  prTitle: string,
  files: Array<Record<string, unknown>>,
  verbosity: Verbosity = "medium",
): string {
  const lines = [
    markerSummary(runId),
    "",
    "## Tonic merge report",
    "",
    `**PR:** ${prTitle}`,
    "",
    "Per-file conflict summaries (Tonic markers) are listed below when present.",
    "",
  ];
  if (verbosity !== "low") {
    lines.push(
      markdownCodeFences("json", "Per-file metadata", JSON.stringify({ files }, null, 2)),
    );
  } else {
    lines.push(`- **Files analyzed:** ${files.length}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function buildFileTopComment(
  filePath: string,
  leftLines: string[],
  rightLines: string[],
  annotated: string[],
  continuity?: ContinuityHints | null,
): string {
  const contentHash = digest(filePath, annotated.join("\n"));
  const body = markdownTextFences(
    "Tonic annotated merge output (left = base, right = head)",
    annotated.join("\n"),
  );
  return [
    markerFile(filePath, contentHash),
    "",
    `### \`${filePath}\``,
    "",
    body,
    "",
    `_Left lines: ${leftLines.length} · Right lines: ${rightLines.length}_`,
    continuityFooter(continuity ?? undefined),
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildOrphanInlineComment(
  path: string,
  startLine: number,
  endLine: number,
  conflictKind: string,
  reason: "ambiguous" | "unmapped",
  snippet: string,
  extraSections?: string | null,
  continuity?: ContinuityHints | null,
): string {
  const hint =
    reason === "ambiguous"
      ? "Head line span is **ambiguous** (duplicate hunks). Anchored at line 1 for thread visibility."
      : "Head line span is **unmapped** (empty side or no match). Anchored at line 1 for thread visibility.";
  const fence = markdownTextFences("Tonic markers for this region", snippet);
  const lines = [
    markerOrphan(path, startLine, endLine, conflictKind, reason),
    "",
    `**Tonic orphan** \`${conflictKind}\` (annotated output lines ${startLine}–${endLine})`,
    "",
    hint,
    "",
    fence,
    continuityFooter(continuity ?? undefined),
  ];
  if (extraSections?.trim()) {
    lines.push("", "---", "", extraSections.trim(), "");
  }
  return lines.join("\n").replace(/\n+$/, "\n") + "\n";
}

export function buildInlineThreadComment(
  path: string,
  startLine: number,
  endLine: number,
  conflictKind: string,
  snippet: string,
  extraSections?: string | null,
  continuity?: ContinuityHints | null,
): string {
  const fence = markdownTextFences("Tonic markers and hunks for this region", snippet);
  const lines = [
    markerInline(path, startLine, endLine, conflictKind),
    "",
    `**Tonic conflict** \`${conflictKind}\` (annotated output lines ${startLine}–${endLine})`,
    "",
    fence,
    continuityFooter(continuity ?? undefined),
  ];
  if (extraSections?.trim()) {
    lines.push("", "---", "", extraSections.trim(), "");
  }
  return lines.join("\n").replace(/\n+$/, "\n") + "\n";
}

export type { ContinuityHints };
