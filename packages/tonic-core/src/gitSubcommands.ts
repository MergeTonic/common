import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { AuthorMode } from "./authorAliasResolver";
import { createDefaultGitAuthorProbe, resolveAuthorAliasForSide } from "./authorAliasResolver";
import { mergeReportDict, type MergeArtifactJson } from "./cliReport";
import { gitExec, gitRequireOk } from "./gitExec";
import {
  DEFAULT_INTENT_PROFILE_PATH,
  loadIntentProfile,
  parseIntentPair,
  promptIntentPairInteractive,
  saveIntentProfile,
} from "./intentInteractive";
import { annotatedToConflictFile, hydrateTonicAnnotatedAuthorIntent, mergeSnapshots } from "./mergeUtils";
import {
  DEFAULT_GIT_MERGE_LEFT_INTENT,
  DEFAULT_GIT_MERGE_RIGHT_INTENT,
} from "./markerInterop";
import {
  HYDRATION_OPTIONAL_AI_EXIT_CODE,
  buildMissingOptionalAiDependencySkipResult,
  probeHydrationOptionalAiDependency,
  resolveHydrationRuntimeConfig,
  runHydrateIntentsMachineMode,
} from "./hydration";
import type {
  HydrationHistoricalOptions,
} from "./hydration";

function normLines(s: string): string[] {
  const lines = s.split(/\r?\n/);
  if (lines.length && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}

function parseArgs(argv: string[]): Record<string, string> & { flags: Set<string> } {
  const shortToLong: Record<string, string> = {
    "-r": "remote",
    "-b": "base_branch",
    "-m": "merge_branch",
    "-l": "left_ref",
    "-t": "right_ref",
    "-d": "dry_run",
    "-w": "write",
    "-i": "into_branch",
    "-o": "report",
    "-p": "paths",
    "-s": "swap_stages",
    "-k": "backup",
    "-N": "no_atomic",
    "-S": "strategy",
    "-P": "path",
    "-R": "ref",
    "-n": "no_commit",
  };
  const out: Record<string, string> & { flags: Set<string> } = Object.assign(
    {},
    { flags: new Set<string>() },
  ) as Record<string, string> & { flags: Set<string> };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const mapped = a.startsWith("-") && !a.startsWith("--") ? shortToLong[a] : undefined;
    if (a.startsWith("--") || mapped) {
      const key = mapped ?? a.slice(2).replace(/-/g, "_");
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) {
        (out as Record<string, string>)[key] = next;
        i++;
      } else {
        out.flags.add(key);
      }
    }
  }
  return out;
}

function getOpt(m: Record<string, string>, k: string, def: string): string {
  const v = (m as Record<string, string>)[k];
  return v ?? def;
}

function collectMultiOpt(argv: string[], flag: string): string[] {
  const out: string[] = [];
  const aliases = new Set([flag]);
  if (flag === "--paths") {
    aliases.add("-p");
  }
  for (let i = 0; i < argv.length; i++) {
    if (aliases.has(argv[i]!)) {
      const v = argv[i + 1];
      if (v && !v.startsWith("-")) {
        out.push(v);
        i++;
      }
    }
  }
  return out;
}

function matchPathFilter(rel: string, filter: string): boolean {
  const r = rel.replace(/\\/g, "/");
  const f = filter.replace(/\\/g, "/");
  if (!f.includes("*") && !f.includes("?")) {
    return r === f;
  }
  const escaped = f.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`).test(r);
}

function filterPaths(names: string[], filters: string[]): string[] {
  if (filters.length === 0) {
    return names;
  }
  return names.filter((rel) => filters.some((f) => matchPathFilter(rel, f)));
}

function writeAnnotatedToWorkingFile(
  absPath: string,
  annotated: string[],
  opts: { backup: boolean; atomic: boolean },
): void {
  const dir = path.dirname(absPath);
  fs.mkdirSync(dir, { recursive: true });
  const body = annotated.join("\n") + (annotated.length ? "\n" : "");
  if (opts.backup && fs.existsSync(absPath)) {
    fs.copyFileSync(absPath, absPath + ".tonic.bak");
  }
  if (opts.atomic && os.platform() !== "win32") {
    const tmp = path.join(dir, `.tonic-w.${process.pid}.${Date.now()}.tmp`);
    try {
      fs.writeFileSync(tmp, body, "utf8");
      fs.renameSync(tmp, absPath);
    } catch (e) {
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* ignore */
      }
      throw e;
    }
  } else {
    fs.writeFileSync(absPath, body, "utf8");
  }
}

export function gitCmdFetch(repoRoot: string, argv: string[]): number {
  const m = parseArgs(argv);
  const remote = getOpt(m, "remote", "origin");
  const prune = m.flags.has("prune");
  const args = ["fetch", remote];
  if (prune) {
    args.push("--prune");
  }
  const { code, stderr } = gitExec(repoRoot, args);
  if (code !== 0) {
    console.error(stderr.trim());
    return 1;
  }
  return 0;
}

function currentBranch(repoRoot: string): string {
  const b = gitRequireOk(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"], "branch").trim();
  return b;
}

function parseAuthorMode(raw: string): AuthorMode {
  if (raw === "human" || raw === "ref") {
    return raw;
  }
  return "base-head";
}

async function resolveCompareMaterializeHydration(
  repoRoot: string,
  m: ReturnType<typeof parseArgs>,
  leftRef: string,
  rightRef: string,
): Promise<{ leftAuthor: string; rightAuthor: string; leftIntent: string; rightIntent: string }> {
  const authorMode = parseAuthorMode(getOpt(m, "author_mode", "base-head"));
  const explicitL = getOpt(m, "author_alias_left", "");
  const explicitR = getOpt(m, "author_alias_right", "");
  const gitProbe = authorMode === "human" ? createDefaultGitAuthorProbe(repoRoot) : undefined;

  const leftAuthor = resolveAuthorAliasForSide("left", {
    repoRoot,
    mode: authorMode,
    leftRef,
    rightRef,
    explicitLeft: explicitL || undefined,
    explicitRight: explicitR || undefined,
    gitProbe,
  });
  const rightAuthor = resolveAuthorAliasForSide("right", {
    repoRoot,
    mode: authorMode,
    leftRef,
    rightRef,
    explicitLeft: explicitL || undefined,
    explicitRight: explicitR || undefined,
    gitProbe,
  });

  let leftIntent = DEFAULT_GIT_MERGE_LEFT_INTENT;
  let rightIntent = DEFAULT_GIT_MERGE_RIGHT_INTENT;

  const profilePath =
    getOpt(m, "intent_profile", "").trim() || path.join(repoRoot, DEFAULT_INTENT_PROFILE_PATH);
  const prof = loadIntentProfile(profilePath);
  if (prof?.leftIntent?.trim()) {
    leftIntent = prof.leftIntent.trim();
  }
  if (prof?.rightIntent?.trim()) {
    rightIntent = prof.rightIntent.trim();
  }

  const ip = parseIntentPair(getOpt(m, "intent_pair", ""));
  if (ip) {
    leftIntent = ip.left;
    rightIntent = ip.right;
  }

  const interactive = m.flags.has("interactive_intents") && !m.flags.has("no_interactive");
  if (interactive) {
    const ans = await promptIntentPairInteractive({
      defaultLeft: leftIntent,
      defaultRight: rightIntent,
    });
    leftIntent = ans.leftIntent;
    rightIntent = ans.rightIntent;
  }
  if (m.flags.has("save_intent_profile")) {
    saveIntentProfile(profilePath, { version: 1, leftIntent, rightIntent });
  }

  return { leftAuthor, rightAuthor, leftIntent, rightIntent };
}

export async function gitCmdHydrateIntents(repoRoot: string, argv: string[]): Promise<number> {
  const m = parseArgs(argv);
  const checkOptionalAi = m.flags.has("check_optional_ai");
  const outJsonPath = getOpt(m, "out_json", "").trim();
  const machineMode = true;
  const writeOut = (text: string): void => {
    if (outJsonPath) {
      fs.mkdirSync(path.dirname(outJsonPath), { recursive: true });
      fs.writeFileSync(outJsonPath, text + "\n", "utf8");
    } else {
      console.log(text);
    }
  };
  if (checkOptionalAi) {
    const runtime = resolveHydrationRuntimeConfig(repoRoot);
    if (runtime.mode !== "memory") {
      const probe = probeHydrationOptionalAiDependency();
      if (!probe.available) {
        const skip = buildMissingOptionalAiDependencySkipResult(repoRoot, probe.installHint);
        const text = JSON.stringify(skip, null, 2);
        writeOut(text);
        return HYDRATION_OPTIONAL_AI_EXIT_CODE;
      }
    }
    const okPayload = {
      ok: true,
      optional_dependency_group: "ai",
      runtime_mode: runtime.mode,
      hydration_skipped: false,
    };
    const text = JSON.stringify(okPayload, null, 2);
    writeOut(text);
    return 0;
  }
  if (machineMode) {
    const maxQuestionsRaw = parseInt(getOpt(m, "max_questions", "3"), 10);
    const maxQuestions = Number.isFinite(maxQuestionsRaw) && maxQuestionsRaw > 0 ? maxQuestionsRaw : 3;
    const topKRaw = parseInt(getOpt(m, "query_top_k", "5"), 10);
    const queryTopK = Number.isFinite(topKRaw) && topKRaw > 0 ? topKRaw : 5;
    const downstreamTask = getOpt(m, "downstream_task", "").trim() || "hydrate intent tags for current repository context";
    const historicalMaxPrsRaw = parseInt(getOpt(m, "historical_max_prs", "0"), 10);
    const historicalStateRaw = getOpt(m, "historical_state", "merged").trim();
    const historicalState: HydrationHistoricalOptions["state"] =
      historicalStateRaw === "open" || historicalStateRaw === "all" ? historicalStateRaw : "merged";
    const historical: HydrationHistoricalOptions = {
      max_prs: Number.isFinite(historicalMaxPrsRaw) && historicalMaxPrsRaw > 0 ? historicalMaxPrsRaw : 0,
      since: getOpt(m, "historical_since", "").trim() || undefined,
      base_ref: getOpt(m, "historical_base_ref", "").trim() || undefined,
      state: historicalState,
    };
    const result = await runHydrateIntentsMachineMode(repoRoot, {
      intent_text: getOpt(m, "intent_text", "").trim(),
      intent_spec: getOpt(m, "intent_spec", "").trim() || undefined,
      scope: getOpt(m, "scope", "").trim() || undefined,
      dry_run: m.flags.has("dry_run"),
      prompt_profile: getOpt(m, "prompt_profile", "").trim() || undefined,
      log_llm: getOpt(m, "log_llm", "").trim() || undefined,
      max_questions: maxQuestions,
      query_top_k: queryTopK,
      downstream_task: downstreamTask,
      historical,
      vendoring_scaffold: m.flags.has("vendoring_scaffold"),
    });
    const payload = result.payload;
    writeOut(JSON.stringify(payload, null, 2));
    return result.exitCode;
  }
  const profilePath =
    getOpt(m, "intent_profile", "").trim() || path.join(repoRoot, DEFAULT_INTENT_PROFILE_PATH);
  const defaults = loadIntentProfile(profilePath);
  const pair = await promptIntentPairInteractive({
    defaultLeft: defaults?.leftIntent ?? DEFAULT_GIT_MERGE_LEFT_INTENT,
    defaultRight: defaults?.rightIntent ?? DEFAULT_GIT_MERGE_RIGHT_INTENT,
  });
  saveIntentProfile(profilePath, { version: 1, leftIntent: pair.leftIntent, rightIntent: pair.rightIntent });
  console.log(
    JSON.stringify(
      { ok: true, profile_path: profilePath, left_intent: pair.leftIntent, right_intent: pair.rightIntent },
      null,
      2,
    ),
  );
  return 0;
}

export async function gitCmdCompare(repoRoot: string, argv: string[]): Promise<number> {
  const m = parseArgs(argv);
  const remote = getOpt(m, "remote", "origin");
  const baseBranch = getOpt(m, "base_branch", "main");
  const mergeBranch = getOpt(m, "merge_branch", "");
  let leftRef = getOpt(m, "left_ref", "");
  let rightRef = getOpt(m, "right_ref", "");
  if (!leftRef || !rightRef) {
    if (!mergeBranch) {
      console.error("git compare: need --merge-branch or both --left-ref and --right-ref");
      return 1;
    }
    leftRef = leftRef || `${remote}/${baseBranch}`;
    rightRef = rightRef || `${remote}/${mergeBranch}`;
  }
  const dryRun = m.flags.has("dry_run");
  const write = m.flags.has("write");
  const intoBranch = getOpt(m, "into_branch", "");
  const expectedWriteBranch = intoBranch || (mergeBranch ? mergeBranch : "");
  const reportPath = getOpt(m, "report", "");
  const pathFilters = collectMultiOpt(argv, "--paths");
  if (m.flags.has("swap_stages")) {
    const t = leftRef;
    leftRef = rightRef;
    rightRef = t;
  }
  const backup = m.flags.has("backup");
  const atomic = !m.flags.has("no_atomic");
  const blame = m.flags.has("blame");
  const blameMaxRaw = parseInt(getOpt(m, "blame_max_commits", "3"), 10);
  const blameMaxCommits = Number.isFinite(blameMaxRaw) && blameMaxRaw >= 0 ? blameMaxRaw : 3;
  const leftSha = gitRequireOk(repoRoot, ["rev-parse", leftRef], "rev-parse").trim();
  const rightSha = gitRequireOk(repoRoot, ["rev-parse", rightRef], "rev-parse").trim();

  const needFetch =
    Boolean(mergeBranch) ||
    leftRef.startsWith(`${remote}/`) ||
    rightRef.startsWith(`${remote}/`);
  if (needFetch) {
    gitRequireOk(repoRoot, ["fetch", remote], "fetch");
  }

  if (expectedWriteBranch && write && !dryRun) {
    const cur = currentBranch(repoRoot);
    if (cur !== expectedWriteBranch) {
      console.error(
        `Refusing --write: HEAD is "${cur}", expected "${expectedWriteBranch}"`,
      );
      return 1;
    }
  }

  const names = filterPaths(
    gitRequireOk(repoRoot, ["diff", "--name-only", leftRef, rightRef], "diff")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean),
    pathFilters,
  );

  const artifacts: MergeArtifactJson[] = [];
  for (const rel of names) {
    if (rel.includes("..") || path.isAbsolute(rel)) {
      continue;
    }
    const ls = gitExec(repoRoot, ["show", `${leftRef}:${rel}`]);
    const rs = gitExec(repoRoot, ["show", `${rightRef}:${rel}`]);
    if (ls.code !== 0 || rs.code !== 0) {
      continue;
    }
    const left = normLines(ls.stdout);
    const right = normLines(rs.stdout);
    const [merged, annotated] = mergeSnapshots(left, right);
    const cfPath = rel.replace(/\\/g, "/");
    const markersPresent = annotated.some((l) => l.startsWith("<<<<<<< begin"));
    let annotatedForReport = annotated;
    if (markersPresent) {
      const h = await resolveCompareMaterializeHydration(repoRoot, m, leftRef, rightRef);
      annotatedForReport = hydrateTonicAnnotatedAuthorIntent(annotated, h);
    }
    const cf = annotatedToConflictFile(cfPath, annotatedForReport);
    artifacts.push({
      version: "1",
      path: cfPath,
      base_sha: leftRef,
      head_sha: rightRef,
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
        if (blame) {
          region.left_commit_ids = [leftSha].slice(0, blameMaxCommits);
          region.right_commit_ids = [rightSha].slice(0, blameMaxCommits);
        }
        return region;
      }),
      left_commit_id: blame ? leftSha : undefined,
      right_commit_id: blame ? rightSha : undefined,
      annotated_lines: markersPresent ? annotatedForReport : undefined,
    });
    if (write && !dryRun) {
      const abs = path.join(repoRoot, rel);
      writeAnnotatedToWorkingFile(abs, annotatedForReport, { backup, atomic });
    }
  }

  if (reportPath) {
    const report = mergeReportDict({
      runId: "git-compare",
      prTitle: "git compare",
      baseSha: leftRef,
      headSha: rightRef,
      baseRef: leftRef,
      headRef: rightRef,
      artifacts,
      includeAnnotated: true,
      embedAnnotatedForMarkerFiles: true,
    });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  }

  console.log(
    JSON.stringify({
      summary: dryRun ? "dry-run" : write ? "written" : "ok",
      left_ref: leftRef,
      right_ref: rightRef,
      expected_write_branch: expectedWriteBranch || undefined,
      files: artifacts.length,
      paths: artifacts.map((a) => a.path),
    }),
  );
  return 0;
}

export async function gitCmdMaterialize(repoRoot: string, argv: string[]): Promise<number> {
  const m = parseArgs(argv);
  const dryRun = m.flags.has("dry_run");
  const write = m.flags.has("write");
  const strategy = getOpt(m, "strategy", "ours-theirs");
  if (strategy !== "ours-theirs") {
    console.error('Only --strategy ours-theirs is supported (stage :2 / :3)');
    return 1;
  }
  const pathFilters = collectMultiOpt(argv, "--paths");
  const swapStages = m.flags.has("swap_stages");
  const backup = m.flags.has("backup");
  const atomic = !m.flags.has("no_atomic");
  const blame = m.flags.has("blame");

  const names = filterPaths(
    gitRequireOk(repoRoot, ["diff", "--name-only", "--diff-filter", "U"], "unmerged")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean),
    pathFilters,
  );

  for (const rel of names) {
    const stageOurs = swapStages ? `:3:${rel}` : `:2:${rel}`;
    const stageTheirs = swapStages ? `:2:${rel}` : `:3:${rel}`;
    const ls = gitExec(repoRoot, ["show", stageOurs]);
    const rs = gitExec(repoRoot, ["show", stageTheirs]);
    if (ls.code !== 0 || rs.code !== 0) {
      continue;
    }
    const left = normLines(ls.stdout);
    const right = normLines(rs.stdout);
    const [, annotated] = mergeSnapshots(left, right);
    void blame;
    const markersPresent = annotated.some((l) => l.startsWith("<<<<<<< begin"));
    let outAnnotated = annotated;
    if (markersPresent) {
      const h = await resolveCompareMaterializeHydration(repoRoot, m, "", "");
      outAnnotated = hydrateTonicAnnotatedAuthorIntent(annotated, h);
    }
    if (write && !dryRun) {
      const abs = path.join(repoRoot, rel);
      writeAnnotatedToWorkingFile(abs, outAnnotated, { backup, atomic });
    }
  }

  console.log(
    JSON.stringify({
      summary: dryRun ? "dry-run" : write ? "written" : "ok",
      unmerged: names.length,
    }),
  );
  return 0;
}

/** Run `git merge --no-ff` (optional `--no-commit`). Exit 0 when merge stops with unmerged paths. */
export function gitCmdMerge(repoRoot: string, argv: string[]): number {
  const m = parseArgs(argv);
  const positionals = argv.filter((a) => !a.startsWith("-"));
  const ref = getOpt(m, "ref", "") || positionals[0] || "";
  if (!ref) {
    console.error("git merge: need --ref <branch-or-commit>");
    return 1;
  }
  const mergeArgs = ["merge", "--no-ff"];
  if (m.flags.has("no_commit")) {
    mergeArgs.push("--no-commit");
  }
  mergeArgs.push(ref);
  const { code, stderr, stdout } = gitExec(repoRoot, mergeArgs);
  if (code === 0) {
    console.log(
      JSON.stringify({
        status: "merged",
        message: (stdout + stderr).trim(),
      }),
    );
    return 0;
  }
  const unmerged = gitExec(repoRoot, ["diff", "--name-only", "--diff-filter", "U"]);
  const paths = unmerged.stdout
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (paths.length > 0) {
    console.log(
      JSON.stringify({
        status: "conflicts",
        paths,
        stderr: stderr.trim(),
      }),
    );
    return 0;
  }
  console.error(stderr.trim() || stdout || "git merge failed");
  return code ?? 1;
}

export function gitCmdWorktree(repoRoot: string, argv: string[]): number {
  const sub = argv[0];
  const rest = argv.slice(1);
  if (sub === "add") {
    const m = parseArgs(rest);
    const positionals = rest.filter((a) => !a.startsWith("-"));
    const p = getOpt(m, "path", "") || positionals[0] || "";
    const ref = getOpt(m, "ref", "") || positionals[1] || "";
    if (!p || !ref) {
      console.error("git worktree add: need --path and --ref");
      return 1;
    }
    const { code, stderr } = gitExec(repoRoot, ["worktree", "add", "--detach", p, ref]);
    if (code !== 0) {
      console.error(stderr.trim());
      return 1;
    }
    return 0;
  }
  if (sub === "list") {
    const out = gitRequireOk(repoRoot, ["worktree", "list", "--porcelain"], "worktree list");
    console.log(out);
    return 0;
  }
  if (sub === "remove") {
    const m = parseArgs(rest);
    const positionals = rest.filter((a) => !a.startsWith("-"));
    const p = getOpt(m, "path", "") || positionals[0] || "";
    if (!p) {
      console.error("git worktree remove: need --path");
      return 1;
    }
    const { code, stderr } = gitExec(repoRoot, ["worktree", "remove", "--force", p]);
    if (code !== 0) {
      console.error(stderr.trim());
      return 1;
    }
    return 0;
  }
  console.error("Usage: merge-tonic git worktree add|list|remove ...");
  return 1;
}

export async function gitMain(repoRoot: string, argv: string[]): Promise<number> {
  const sub = argv[0];
  const rest = argv.slice(1);
  if (sub === "fetch" || sub === "f") {
    return gitCmdFetch(repoRoot, rest);
  }
  if (sub === "compare" || sub === "c") {
    return await gitCmdCompare(repoRoot, rest);
  }
  if (sub === "materialize" || sub === "from-index" || sub === "mat" || sub === "fi") {
    return await gitCmdMaterialize(repoRoot, rest);
  }
  if (sub === "hydrate-intents" || sub === "hi") {
    return await gitCmdHydrateIntents(repoRoot, rest);
  }
  if (sub === "merge" || sub === "m") {
    return gitCmdMerge(repoRoot, rest);
  }
  if (sub === "worktree" || sub === "wt") {
    return gitCmdWorktree(repoRoot, rest);
  }
  console.error(
    "Usage: merge-tonic git fetch|compare|materialize|from-index|hydrate-intents|merge|worktree ... (use --repo for root)",
  );
  return 1;
}
