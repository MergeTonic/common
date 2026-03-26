import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { annotatedToConflictFile, mergeSnapshots, type ConflictRegion } from "@mergetonic/core";
import {
  listPullReviewComments,
  postPullReviewComment,
  upsertIssueComment,
} from "./githubApi";
import {
  buildFileTopComment,
  buildInlineThreadComment,
  buildOrphanInlineComment,
  buildSummaryBody,
  fileUpsertPrefix,
  markerInline,
  markerOrphan,
  summaryUpsertPrefix,
  type CommentMode,
  type ContinuityHints,
  type Verbosity,
} from "./githubComments";
import { conflictRegionToHeadSpanResult } from "./headLineMap";
import { pushTonicMarkerBranch } from "./markerBranch";
import { hydratePrFiles } from "./hydrate";
import { mergeReportDict, type MergeArtifactJson, MERGE_ARTIFACT_VERSION } from "./mergeReport";
import {
  buildGithubSuggestionBody,
  buildUnifiedDiff,
  heuristicResolvedLines,
  parseResolvedLinesFromAi,
  suggestionLineCountOk,
} from "./suggestions";
import { resolveConflictWithOpenAi } from "./aiResolve";
import { postTonicCheck } from "./githubChecks";

function truthyEnv(val: string | undefined): boolean {
  if (!val) {
    return false;
  }
  const v = val.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function loadEvent(): Record<string, unknown> {
  const path = process.env.GITHUB_EVENT_PATH;
  if (!path || !fs.existsSync(path)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(path, "utf8")) as Record<string, unknown>;
}

function parseEnvVerbosity(raw: string): Verbosity {
  if (raw === "low" || raw === "high") {
    return raw;
  }
  return "medium";
}

function parseCommentMode(raw: string): CommentMode {
  const allowed: CommentMode[] = ["summary-only", "file+inline", "inline-only", "all"];
  if (allowed.includes(raw as CommentMode)) {
    return raw as CommentMode;
  }
  return "all";
}

export function writeActionOutputs(params: {
  status: string;
  filesAnalyzed: number;
  conflictedFiles: number;
  reportPath: string | null;
}): void {
  const outPath = (process.env.GITHUB_OUTPUT ?? "").trim();
  if (!outPath) {
    return;
  }
  const body = [
    `status=${params.status}`,
    `files_analyzed=${params.filesAnalyzed}`,
    `conflicted_files=${params.conflictedFiles}`,
    `report_path=${params.reportPath ?? ""}`,
  ].join("\n");
  try {
    fs.appendFileSync(outPath, `${body}\n`, "utf8");
  } catch {
    // best-effort only
  }
}

function annotatedRegionSnippet(annotated: string[], reg: ConflictRegion): string {
  const sl = Math.max(0, reg.startLine - 1);
  const el = Math.min(annotated.length, reg.endLine);
  return annotated.slice(sl, el).join("\n");
}

function conflictToDict(c: ConflictRegion): Record<string, unknown> {
  return {
    base_content: c.baseContent,
    left_content: c.leftContent,
    right_content: c.rightContent,
    start_line: c.startLine,
    end_line: c.endLine,
    conflict_kind: c.conflictKind,
  };
}

async function runDemoLocal(runId: string, verbosity: Verbosity, token: string | undefined): Promise<void> {
  const title = "local-demo";
  const left = (process.env.TONIC_AGENT_DEMO_LEFT ?? "A\nB\n").split(/\r?\n/);
  const right = (process.env.TONIC_AGENT_DEMO_RIGHT ?? "A\nX\nB\n").split(/\r?\n/);
  const norm = (s: string[]) => (s.length && s[s.length - 1] === "" ? s.slice(0, -1) : s);
  const [merged, annotated] = mergeSnapshots(norm(left), norm(right));
  const cf = annotatedToConflictFile("demo.txt", annotated);
  const filesPayload = [
    {
      path: "demo.txt",
      merged_line_count: merged.length,
      conflict_regions: cf.conflicts.length,
      markers_present: annotated.some((l) => l.startsWith("<<<<<<< begin")),
    },
  ];
  const summary = buildSummaryBody(runId, title, filesPayload, verbosity);
  console.log(summary);
  const pr = (loadEvent().pull_request ?? {}) as Record<string, unknown>;
  const number = pr.number as number | undefined;
  const repo = process.env.GITHUB_REPOSITORY ?? "";
  if (token && repo && number != null) {
    const [owner, name] = repo.split("/", 2);
    try {
      await upsertIssueComment(owner!, name!, number, token, summaryUpsertPrefix(), summary);
    } catch (e) {
      console.warn("Warning: could not post comment:", e);
    }
  }
}

export async function main(): Promise<void> {
  const token = process.env.INPUT_TOKEN ?? process.env.GITHUB_TOKEN;
  const commentMode = parseCommentMode(process.env.INPUT_COMMENT_MODE ?? "all");
  const verbosity = parseEnvVerbosity(process.env.INPUT_VERBOSITY ?? "medium");
  const maxInline = parseInt(process.env.INPUT_MAX_INLINE_COMMENTS_PER_FILE ?? "20", 10) || 20;
  const maxSuggestionParsed = parseInt(process.env.INPUT_MAX_SUGGESTION_LINES ?? "200", 10);
  const maxSuggestionLines =
    maxSuggestionParsed === 0
      ? Number.POSITIVE_INFINITY
      : Number.isFinite(maxSuggestionParsed) && maxSuggestionParsed > 0
        ? maxSuggestionParsed
        : 200;
  const hydrateMode = process.env.INPUT_HYDRATE_MODE ?? "pr-diff";
  const maxFiles = parseInt(process.env.TONIC_AGENT_MAX_FILES ?? "200", 10) || 200;
  const reportPath = (process.env.TONIC_AGENT_REPORT_PATH ?? "").trim();
  const enableAi = truthyEnv(process.env.INPUT_ENABLE_AI);
  const enableChecks = truthyEnv(process.env.INPUT_ENABLE_CHECKS);
  const enableBlame = truthyEnv(process.env.INPUT_ENABLE_BLAME);
  const blameMaxParsed = parseInt(process.env.INPUT_BLAME_MAX_COMMITS ?? "3", 10);
  const blameMaxCommits = Number.isFinite(blameMaxParsed) && blameMaxParsed >= 0 ? blameMaxParsed : 3;

  const runId = process.env.GITHUB_RUN_ID ?? randomUUID();
  const event = loadEvent();
  const pr = (event.pull_request ?? {}) as Record<string, unknown>;
  const title = (pr.title as string) ?? "PR";
  const number = pr.number as number | undefined;
  const repo = process.env.GITHUB_REPOSITORY ?? "";

  if (!number || !repo || !token) {
    await runDemoLocal(runId, verbosity, token);
    writeActionOutputs({
      status: "demo",
      filesAnalyzed: 1,
      conflictedFiles: 1,
      reportPath: reportPath || null,
    });
    return;
  }

  const base = (pr.base ?? {}) as Record<string, unknown>;
  const head = (pr.head ?? {}) as Record<string, unknown>;
  const baseSha = (base.sha as string) ?? "";
  const headSha = (head.sha as string) ?? "";
  const baseRef = (base.ref as string) ?? "";
  const headRef = (head.ref as string) ?? "";

  if (!baseSha || !headSha) {
    console.error("Tonic agent: missing base.sha or head.sha on pull_request event");
    await runDemoLocal(runId, verbosity, token);
    writeActionOutputs({
      status: "demo",
      filesAnalyzed: 1,
      conflictedFiles: 1,
      reportPath: reportPath || null,
    });
    return;
  }

  const [owner, name] = repo.split("/", 2);
  let pairs: Record<string, import("./hydrate").HydratePair>;
  try {
    pairs = await hydratePrFiles(owner!, name!, baseSha, headSha, token, hydrateMode, maxFiles);
  } catch (e) {
    console.error("Tonic agent: hydrate failed:", e);
    await runDemoLocal(runId, verbosity, token);
    writeActionOutputs({
      status: "demo",
      filesAnalyzed: 1,
      conflictedFiles: 1,
      reportPath: reportPath || null,
    });
    return;
  }

  const artifacts: MergeArtifactJson[] = [];
  for (const path of Object.keys(pairs).sort()) {
    const { leftLines, rightLines } = pairs[path]!;
    const [merged, annotated] = mergeSnapshots(
      leftLines,
      rightLines,
      enableBlame ? { leftCommitId: baseSha, rightCommitId: headSha } : undefined,
    );
    const cf = annotatedToConflictFile(path, annotated);
    const markers = annotated.some((l) => l.startsWith("<<<<<<< begin"));
    artifacts.push({
      version: MERGE_ARTIFACT_VERSION,
      path,
      base_sha: baseSha,
      head_sha: headSha,
      left_line_count: leftLines.length,
      right_line_count: rightLines.length,
      merged_line_count: merged.length,
      markers_present: markers,
      conflict_region_count: cf.conflicts.length,
      conflict_regions: cf.conflicts.map((c) => {
        const region = conflictToDict(c);
        if (enableBlame) {
          region.left_commit_ids = [baseSha].slice(0, blameMaxCommits);
          region.right_commit_ids = [headSha].slice(0, blameMaxCommits);
        }
        return region;
      }),
      left_commit_id: enableBlame ? baseSha : undefined,
      right_commit_id: enableBlame ? headSha : undefined,
      annotated_lines: annotated,
    });
  }

  const includeAnnotatedSummary = verbosity === "high";

  const pathToAnnotated: Record<string, string> = {};
  for (const a of artifacts) {
    if (a.markers_present && (a.annotated_lines?.length ?? 0) > 0) {
      pathToAnnotated[a.path] = (a.annotated_lines ?? []).join("\n");
    }
  }

  let markerBranchResult: Awaited<ReturnType<typeof pushTonicMarkerBranch>> = null;
  if (Object.keys(pathToAnnotated).length > 0 && token) {
    try {
      markerBranchResult = await pushTonicMarkerBranch(
        owner!,
        name!,
        headSha,
        number,
        runId,
        token,
        pathToAnnotated,
      );
    } catch (e) {
      console.warn("Warning: Tonic marker branch push failed:", e);
    }
  }

  const mergeReportArtifactName = reportPath ? path.basename(reportPath) : null;
  const continuity: ContinuityHints = {
    markerBranch: markerBranchResult?.branch,
    mergeReportArtifact: mergeReportArtifactName ?? undefined,
  };

  const report = mergeReportDict({
    runId,
    prTitle: title,
    baseSha,
    headSha,
    baseRef,
    headRef,
    artifacts,
    includeAnnotated: includeAnnotatedSummary,
    embedAnnotatedForMarkerFiles: true,
    markerBranch: markerBranchResult?.branch ?? null,
    markerBranchCommit: markerBranchResult?.commitSha ?? null,
    markerPaths: markerBranchResult?.paths,
    mergeReportArtifactName,
  });

  if (reportPath) {
    try {
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
    } catch (e) {
      console.warn("Warning: could not write report file:", e);
    }
  }

  const filesPayload: Array<Record<string, unknown>> = [];
  for (const a of artifacts) {
    const row: Record<string, unknown> = {
      path: a.path,
      merged_line_count: a.merged_line_count,
      conflict_regions: a.conflict_region_count,
      markers_present: a.markers_present,
      left_line_count: a.left_line_count,
      right_line_count: a.right_line_count,
    };
    if (includeAnnotatedSummary) {
      row.annotated_lines = a.annotated_lines;
    }
    filesPayload.push(row);
  }

  const summaryBody = buildSummaryBody(runId, title, filesPayload, verbosity);

  if (commentMode !== "inline-only" && token) {
    try {
      await upsertIssueComment(owner!, name!, number, token, summaryUpsertPrefix(), summaryBody);
    } catch (e) {
      console.warn("Warning: could not upsert summary comment:", e);
    }
  }

  let existingReviewBodies: string[] = [];
  if (
    (commentMode === "file+inline" || commentMode === "all" || commentMode === "inline-only") &&
    token
  ) {
    try {
      const rc = await listPullReviewComments(owner!, name!, number, token);
      existingReviewBodies = rc.map((c) => String(c.body ?? ""));
    } catch {
      existingReviewBodies = [];
    }
  }

  const inlinePerPath: Record<string, number> = {};

  for (const a of artifacts) {
    const path = a.path;
    const pair = pairs[path]!;
    const rightLines = pair.rightLines;
    const cf = annotatedToConflictFile(path, a.annotated_lines ?? []);

    if ((commentMode === "file+inline" || commentMode === "all") && token && a.markers_present) {
      const body = buildFileTopComment(
        path,
        pair.leftLines,
        rightLines,
        a.annotated_lines ?? [],
        continuity,
      );
      try {
        await upsertIssueComment(owner!, name!, number, token, fileUpsertPrefix(path), body);
      } catch (e) {
        console.warn(`Warning: file comment failed for ${path}:`, e);
      }
    }

    if (
      (commentMode === "file+inline" || commentMode === "all" || commentMode === "inline-only") &&
      token &&
      a.markers_present
    ) {
      let preferAfterLine0 = 0;
      for (const reg of cf.conflicts) {
        if ((inlinePerPath[path] ?? 0) >= maxInline) {
          break;
        }
        let snippet = annotatedRegionSnippet(a.annotated_lines ?? [], reg);
        if (!snippet.trim()) {
          snippet = [reg.leftContent, reg.rightContent].filter(Boolean).join("\n\n");
        }
        const mapRes = conflictRegionToHeadSpanResult(reg, rightLines, preferAfterLine0);
        const isOrphan = mapRes.kind !== "unique";

        let hStart = 1;
        let hEnd = 1;
        let oldLines: string[] = [];
        if (!isOrphan) {
          [hStart, hEnd] = mapRes.span;
          preferAfterLine0 = hEnd;
          const sl = hStart - 1;
          const sr = hEnd - 1;
          oldLines = rightLines.slice(sl, sr + 1);
        }

        let resolved = heuristicResolvedLines(reg);
        let rat: string | null = null;
        let usedAi = false;
        if (!isOrphan && enableAi) {
          try {
            const content = await resolveConflictWithOpenAi(cf, reg);
            if (content) {
              const parsed = parseResolvedLinesFromAi(content);
              if (parsed.lines.length) {
                resolved = parsed.lines;
                rat = parsed.rationale;
                usedAi = true;
              }
            }
          } catch {
            /* fall back to heuristic */
          }
        }
        if (!isOrphan && !suggestionLineCountOk(resolved, oldLines.length)) {
          resolved = heuristicResolvedLines(reg);
          usedAi = false;
          rat = null;
        }
        const useFence =
          !isOrphan &&
          suggestionLineCountOk(resolved, oldLines.length) &&
          resolved.length <= maxSuggestionLines;
        const diffTxt =
          !isOrphan && (oldLines.length || resolved.length)
            ? buildUnifiedDiff(oldLines, resolved, path)
            : "";
        const suggText = useFence ? resolved.join("\n") : null;
        const summary = `**Proposed resolution** (${usedAi ? "AI" : "heuristic — prefer head hunk"}):`;
        const extra = isOrphan
          ? null
          : buildGithubSuggestionBody({
              summary,
              explanation: rat,
              unifiedDiff: diffTxt || null,
              suggestionBlock: suggText,
              includeSuggestionFence: Boolean(useFence && suggText != null),
            });
        const blameSuffix = enableBlame
          ? `\n\n_Blame: left ${baseSha.slice(0, 12)} · right ${headSha.slice(0, 12)}_`
          : "";

        const ibody = isOrphan
          ? buildOrphanInlineComment(
              path,
              reg.startLine,
              reg.endLine,
              reg.conflictKind,
              mapRes.kind === "ambiguous" ? "ambiguous" : "unmapped",
              snippet || "(empty)",
              blameSuffix.trim() ? blameSuffix : null,
              continuity,
            )
          : buildInlineThreadComment(
              path,
              reg.startLine,
              reg.endLine,
              reg.conflictKind,
              snippet || "(empty)",
              [extra ?? "", blameSuffix].join(""),
              continuity,
            );

        const dupKey = isOrphan
          ? markerOrphan(
              path,
              reg.startLine,
              reg.endLine,
              reg.conflictKind,
              mapRes.kind === "ambiguous" ? "ambiguous" : "unmapped",
            )
          : markerInline(path, reg.startLine, reg.endLine, reg.conflictKind);
        const dup = existingReviewBodies.some((ex) => ex.includes(dupKey));
        if (dup) {
          continue;
        }

        const anchorEnd = isOrphan ? 1 : hEnd;
        const reviewOpts =
          !isOrphan && hEnd > hStart
            ? { startLine: hStart, startSide: "RIGHT" as const }
            : undefined;
        try {
          await postPullReviewComment(
            owner!,
            name!,
            number,
            ibody,
            headSha,
            path,
            anchorEnd,
            "RIGHT",
            token,
            reviewOpts,
          );
          inlinePerPath[path] = (inlinePerPath[path] ?? 0) + 1;
          existingReviewBodies.push(ibody);
        } catch (e) {
          console.warn(`Warning: inline review comment failed for ${path}@${anchorEnd}:`, e);
        }
      }
    }
  }

  if (enableChecks && token) {
    try {
      await postTonicCheck(owner!, name!, headSha, token, artifacts, pairs);
    } catch (e) {
      console.warn("Warning: Tonic GitHub Check run failed:", e);
    }
  }

  const hydrateStats = {
    files_hydrated: Object.keys(pairs).length,
    empty_both_sides: Object.values(pairs).filter((p) => !p.leftLines.length && !p.rightLines.length)
      .length,
  };

  console.log(
    JSON.stringify({
      summary: "ok",
      files_analyzed: artifacts.length,
      report_path: reportPath || null,
      hydrate: hydrateStats,
      marker_branch: markerBranchResult?.branch ?? null,
      marker_branch_commit: markerBranchResult?.commitSha ?? null,
    }),
  );
  writeActionOutputs({
    status: "ok",
    filesAnalyzed: artifacts.length,
    conflictedFiles: artifacts.filter((a) => a.markers_present).length,
    reportPath: reportPath || null,
  });
}

const runningDirectly = require.main === module;
if (runningDirectly) {
  void main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
