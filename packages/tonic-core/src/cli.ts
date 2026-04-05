#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import { currentLines, initialState, mergeStates } from "./core";
import { parseTonicConflictsWithDiagnostics } from "./conflictParser";
import {
  annotatedToConflictFile,
  applyTonicHeuristic,
  heuristicResolvedLines,
  mergeSnapshots,
} from "./mergeUtils";
import { mergeReportDict, type MergeArtifactJson } from "./cliReport";
import { runAstGrepHydrateFromArgv } from "./astGrep/command";
import { gitMain } from "./gitSubcommands";
import { gitRequireOk } from "./gitExec";
import { runHydrationPipelineFromArgv } from "./hydration/hydrateCommand";
import {
  isHelpInvocation,
  isLicenseAccepted,
  LICENSE_GATE_MESSAGE,
  licenseAcceptancePath,
  writeLicenseAcceptance,
} from "./license";

function usage(): void {
  console.error(`Usage:
  merge-tonic help | -h | --help
  merge-tonic accept-license   (record GPL-2.0-only acceptance; see LICENSE in the package)
  merge-tonic merge --left <file> --right <file> [--out <file> | --in-place] [--json-state]
  merge-tonic m -l <file> -r <file> [-o <file> | -i] [-j]
  merge-tonic report <left-file> <right-file> [-p <logicalPath>]   (positional shorthand)
  merge-tonic apply <file>                                          (positional shorthand)
  merge-tonic merge <base-ref> <target-branch> [--repo <dir>]   (branch helper)
  merge-tonic apply --file <path> [--write] [--path <logicalPath>] [--sidecar <json>] [--report <json>]
  merge-tonic conflicts [--file <path>|-]   (default: stdin)
  merge-tonic report --left <file> --right <file> [--out <file>] [--path <logicalPath>]
  merge-tonic git [--repo <dir>] fetch|compare|materialize|from-index|merge|worktree|hydrate-intents ...
  merge-tonic ast-grep-hydrate | agh  [--repo <dir>] [--out <file>] [--run-out <file>] [--rule|--config|...]
  merge-tonic hydrate | h  [--repo <dir>] [--out-dir <dir>] [--phase MILESTONE] [--force-prior] [--source-priority default|ast-first|retrieval-first] [--left-intent ...] [--enable-retrieval] [--retrieval-backend memory|chroma] [--vector-cache-path FILE] [--vector-cache-mode off|read|write|readwrite] [--embedding-backend auto|histogram|openai_compatible] [--retrieval-hybrid-regex PAT] [--enable-code-walk-search-agent] [--question-mode off|improver|subquestions] [--prior-run PATH] [ast-grep flags]
  merge-tonic weave | w  verify|install-hooks|init|doctor|push|pull|replay  [--repo <dir>] ...
  merge-tonic repo [--repo <dir>] init|fetch|compare|compare-three|hydrate|resolve ...
  merge-tonic github ref create --repo owner/name --ref refs/heads/b --sha <sha>  (needs GITHUB_TOKEN)
  Legacy: first argument may be "merge-tonic", "tonic-merge", or "mt" (ignored).`);
}

function cmdAcceptLicense(): number {
  console.error(
    "Merge Tonic (merge-tonic) is licensed under GNU GPL-2.0-only. See LICENSE in the package or https://www.gnu.org/licenses/old-licenses/gpl-2.0.txt",
  );
  writeLicenseAcceptance();
  console.log(`License accepted. Record saved at ${licenseAcceptancePath()}`);
  return 0;
}

function normLines(s: string): string[] {
  const lines = s.split(/\r?\n/);
  if (lines.length && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}

function readFile(p: string): string {
  return fs.readFileSync(p, "utf8");
}

function parseMergeBranchArgs(argv: string[]): { positionals: string[]; repo: string } {
  const positionals: string[] = [];
  let repo = process.cwd();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if ((a === "--repo" || a === "-R") && argv[i + 1]) {
      repo = path.resolve(argv[i + 1]!);
      i++;
      continue;
    }
    if (a.startsWith("-")) {
      if (
        a === "--left" ||
        a === "-l" ||
        a === "--right" ||
        a === "-r" ||
        a === "--out" ||
        a === "-o" ||
        a === "--file" ||
        a === "-f" ||
        a === "--path" ||
        a === "-p" ||
        a === "--sidecar" ||
        a === "-s" ||
        a === "--report" ||
        a === "-t"
        || a === "--left-commit-id"
        || a === "--right-commit-id"
        || a === "--blame-max-commits"
      ) {
        i++;
      }
      continue;
    }
    positionals.push(a);
  }
  return { positionals, repo };
}

function getArgAny(argv: string[], names: string[], def: string): string {
  for (const name of names) {
    const i = argv.indexOf(name);
    if (i >= 0 && argv[i + 1]) {
      return argv[i + 1]!;
    }
  }
  return def;
}

function hasAnyFlag(argv: string[], names: string[]): boolean {
  return names.some((n) => argv.includes(n));
}

function positionalArgs(argv: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("-")) {
      if (
        a === "--left" ||
        a === "-l" ||
        a === "--right" ||
        a === "-r" ||
        a === "--out" ||
        a === "-o" ||
        a === "--file" ||
        a === "-f" ||
        a === "--path" ||
        a === "-p" ||
        a === "--sidecar" ||
        a === "-s" ||
        a === "--report" ||
        a === "-t" ||
        a === "--repo" ||
        a === "-R" ||
        a === "--left-commit-id" ||
        a === "--right-commit-id" ||
        a === "--blame-max-commits"
      ) {
        i++;
      }
      continue;
    }
    out.push(a);
  }
  return out;
}

async function cmdMergeBranches(baseRef: string, targetBranch: string, repoRoot: string): Promise<number> {
  const current = gitRequireOk(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"], "branch").trim();
  if (current !== targetBranch) {
    console.error(`merge branch helper: HEAD is "${current}", expected "${targetBranch}"`);
    return 1;
  }
  const mergeRc = await gitMain(repoRoot, ["merge", "--ref", baseRef, "--no-commit"]);
  if (mergeRc !== 0) {
    return mergeRc;
  }
  return await gitMain(repoRoot, ["from-index", "--write"]);
}

function cmdMerge(argv: string[]): number | Promise<number> {
  const hasFileModeFlags = hasAnyFlag(argv, ["--left", "-l", "--right", "-r"]);
  if (!hasFileModeFlags) {
    const { positionals, repo } = parseMergeBranchArgs(argv);
    if (positionals.length === 2) {
      return cmdMergeBranches(positionals[0]!, positionals[1]!, repo);
    }
    if (positionals.length >= 2) {
      const leftPath = positionals[0]!;
      const rightPath = positionals[1]!;
      return cmdMerge(["--left", leftPath, "--right", rightPath, ...argv]);
    }
    usage();
    return 1;
  }
  const leftPath = getArgAny(argv, ["--left", "-l"], "");
  const rightPath = getArgAny(argv, ["--right", "-r"], "");
  const leftCommitId = getArgAny(argv, ["--left-commit-id"], "");
  const rightCommitId = getArgAny(argv, ["--right-commit-id"], "");
  if (!leftPath || !rightPath) {
    usage();
    return 1;
  }
  const jsonState = hasAnyFlag(argv, ["--json-state", "-j"]);
  const inPlace = hasAnyFlag(argv, ["--in-place", "-i"]);
  const outPath = getArgAny(argv, ["--out", "-o"], "");
  if (inPlace && outPath) {
    console.error("merge: use only one of --in-place or --out");
    return 1;
  }
  const left = normLines(readFile(leftPath));
  const right = normLines(readFile(rightPath));
  const [mergedState, annotated] = mergeStates(
    initialState(left),
    initialState(right),
  );
  if (jsonState) {
    console.log(
      JSON.stringify(
        {
          mergedState: mergedState,
          currentLines: currentLines(mergedState),
          annotated,
          left_commit_id: leftCommitId || undefined,
          right_commit_id: rightCommitId || undefined,
        },
        null,
        2,
      ),
    );
    return 0;
  }
  const text = annotated.join("\n");
  const suffix = annotated.length ? "\n" : "";
  const dest = outPath || (inPlace ? leftPath : "");
  if (dest) {
    fs.writeFileSync(dest, text + suffix, "utf8");
  } else {
    console.log(text);
  }
  return 0;
}

function cmdConflicts(argv: string[]): number {
  let file = getArgAny(argv, ["--file", "-f"], "");
  if (!file) {
    const pos = positionalArgs(argv);
    file = pos[0] ?? "-";
  }
  const raw = file === "-" ? fs.readFileSync(0, "utf8") : readFile(file);
  const { blocks, warnings } = parseTonicConflictsWithDiagnostics(raw);
  console.log(JSON.stringify({ blocks, warnings }, null, 2));
  return 0;
}

function cmdReport(argv: string[]): number {
  let leftPath = getArgAny(argv, ["--left", "-l"], "");
  let rightPath = getArgAny(argv, ["--right", "-r"], "");
  if (!leftPath || !rightPath) {
    const pos = positionalArgs(argv);
    if (pos.length >= 2) {
      leftPath = leftPath || pos[0]!;
      rightPath = rightPath || pos[1]!;
    }
  }
  if (!leftPath || !rightPath) {
    usage();
    return 1;
  }
  const left = normLines(readFile(leftPath));
  const right = normLines(readFile(rightPath));
  const [merged, annotated] = mergeSnapshots(left, right);
  const leftCommitId = getArgAny(argv, ["--left-commit-id"], "");
  const rightCommitId = getArgAny(argv, ["--right-commit-id"], "");
  const blame = hasAnyFlag(argv, ["--blame"]);
  const blameMaxRaw = parseInt(getArgAny(argv, ["--blame-max-commits"], "3"), 10);
  const blameMax = Number.isFinite(blameMaxRaw) && blameMaxRaw >= 0 ? blameMaxRaw : 3;
  const logicalPath = getArgAny(argv, ["--path", "-p"], leftPath.split(/[/\\]/).pop() ?? "file.txt");
  const baseSha = getArgAny(argv, ["--base-sha"], "local");
  const headSha = getArgAny(argv, ["--head-sha"], "local");
  const runId = getArgAny(argv, ["--run-id"], "cli");
  const prTitle = getArgAny(argv, ["--pr-title"], "cli");
  const baseRef = getArgAny(argv, ["--base-ref"], "");
  const headRef = getArgAny(argv, ["--head-ref"], "");
  const noAnnotated = hasAnyFlag(argv, ["--no-annotated", "-n"]);
  const cf = annotatedToConflictFile(logicalPath, annotated);
  const markersPresent = annotated.some((l) => l.startsWith("<<<<<<< begin"));
  const artifact: MergeArtifactJson = {
    version: "1",
    path: logicalPath,
    base_sha: baseSha,
    head_sha: headSha,
    left_line_count: left.length,
    right_line_count: right.length,
    merged_line_count: merged.length,
    markers_present: markersPresent,
    conflict_region_count: cf.conflicts.length,
    conflict_regions: cf.conflicts.map((c) => {
      const region: Record<string, unknown> = {
        base_content: c.baseContent,
        left_content: c.leftContent,
        right_content: c.rightContent,
        start_line: c.startLine,
        end_line: c.endLine,
        conflict_kind: c.conflictKind,
      };
      if (blame || leftCommitId || rightCommitId) {
        region.left_commit_ids = leftCommitId ? [leftCommitId].slice(0, blameMax) : [];
        region.right_commit_ids = rightCommitId ? [rightCommitId].slice(0, blameMax) : [];
      }
      return region;
    }),
    left_commit_id: leftCommitId || undefined,
    right_commit_id: rightCommitId || undefined,
    annotated_lines: !noAnnotated && markersPresent ? annotated : undefined,
  };
  const report = mergeReportDict({
    runId,
    prTitle,
    baseSha,
    headSha,
    baseRef,
    headRef,
    artifacts: [artifact],
    includeAnnotated: !noAnnotated && markersPresent,
    embedAnnotatedForMarkerFiles: true,
  });
  const text = JSON.stringify(report, null, 2);
  const outPath = getArgAny(argv, ["--out", "-o"], "");
  if (outPath) {
    fs.writeFileSync(outPath, text + "\n", "utf8");
  } else {
    console.log(text);
  }
  return 0;
}

function cmdApply(argv: string[]): number {
  let file = getArgAny(argv, ["--file", "-f"], "");
  if (!file) {
    file = positionalArgs(argv)[0] ?? "";
  }
  if (!file) {
    console.error("apply: need --file <path>");
    return 1;
  }
  const logicalPath = getArgAny(argv, ["--path", "-p"], path.basename(file));
  const write = hasAnyFlag(argv, ["--write", "-w"]);
  const lines = normLines(readFile(file));
  const clean = applyTonicHeuristic(lines);
  const cf = annotatedToConflictFile(logicalPath, lines);
  const sidecar = getArgAny(argv, ["--sidecar", "-s"], "");
  const reportPath = getArgAny(argv, ["--report", "-t"], "");
  if (sidecar) {
    const sc = {
      path: logicalPath,
      source: "heuristic" as const,
      regions: cf.conflicts.map((r) => ({
        start_line: r.startLine,
        end_line: r.endLine,
        conflict_kind: r.conflictKind,
        resolved_lines: heuristicResolvedLines(r),
      })),
    };
    fs.writeFileSync(sidecar, JSON.stringify(sc, null, 2) + "\n", "utf8");
  }
  if (reportPath) {
    const rep = {
      schema: "merge-tonic-apply-report",
      path: logicalPath,
      region_count: cf.conflicts.length,
      wrote: write,
      clean_line_count: clean.length,
    };
    fs.writeFileSync(reportPath, JSON.stringify(rep, null, 2) + "\n", "utf8");
  }
  const outText = clean.join("\n") + (clean.length ? "\n" : "");
  if (write) {
    fs.writeFileSync(file, outText, "utf8");
  }
  console.log(
    JSON.stringify({
      path: logicalPath,
      region_count: cf.conflicts.length,
      clean_lines: clean,
      wrote: write,
    }),
  );
  return 0;
}

function stripRepo(argv: string[]): { repo: string; rest: string[] } {
  let repo = ".";
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if ((a === "--repo" || a === "-R") && argv[i + 1]) {
      repo = path.resolve(argv[i + 1]!);
      i++;
      continue;
    }
    rest.push(a);
  }
  return { repo, rest };
}

async function runCli(argv: string[]): Promise<number> {
  const sub = argv[0];
  if (sub === "help" || sub === "-h" || sub === "--help") {
    usage();
    return 0;
  }
  if (sub === "merge" || sub === "m") {
    return await Promise.resolve(cmdMerge(argv.slice(1)));
  }
  if (sub === "apply" || sub === "a") {
    return cmdApply(argv.slice(1));
  }
  if (sub === "conflicts" || sub === "c") {
    return cmdConflicts(argv.slice(1));
  }
  if (sub === "report" || sub === "r") {
    return cmdReport(argv.slice(1));
  }
  if (sub === "git" || sub === "g") {
    const { repo, rest } = stripRepo(argv.slice(1));
    return await gitMain(repo, rest);
  }
  if (sub === "ast-grep-hydrate" || sub === "agh") {
    return runAstGrepHydrateFromArgv(argv.slice(1));
  }
  if (sub === "hydrate" || sub === "h") {
    return await runHydrationPipelineFromArgv(argv.slice(1));
  }
  if (sub === "weave" || sub === "w") {
    const { runWeaveFromArgv } = await import("./weaveCli");
    return await runWeaveFromArgv(argv.slice(1));
  }
  if (sub === "repo") {
    const { runRepoFromArgv } = await import("./repoSubcommands");
    return runRepoFromArgv(argv.slice(1));
  }
  usage();
  return 1;
}

void (async () => {
  let argv = process.argv.slice(2);
  if (argv[0] === "merge-tonic" || argv[0] === "tonic-merge" || argv[0] === "mt") {
    argv = argv.slice(1);
  }
  if (!isLicenseAccepted()) {
    if (isHelpInvocation(argv)) {
      usage();
      process.exit(0);
    }
    if (argv[0] === "accept-license") {
      process.exit(cmdAcceptLicense());
    }
    console.error(LICENSE_GATE_MESSAGE);
    process.exit(1);
  }
  if (argv[0] === "accept-license") {
    process.exit(cmdAcceptLicense());
  }
  if (argv[0] === "github") {
    const { githubMainAsync } = await import("./githubCli");
    process.exit(await githubMainAsync(argv.slice(1)));
    return;
  }
  process.exit(await runCli(argv));
})();
