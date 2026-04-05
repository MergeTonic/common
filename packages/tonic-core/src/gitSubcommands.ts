import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { currentLines, mergeStates } from "./core";
import { prefetchHubBlobsToDir } from "./hubPrefetch";
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
  gitMergeFileOutputToTonicAnnotatedLines,
} from "./markerInterop";
import { parseManifestJson } from "./weaveGit/manifest";
import type { PathManifestEntry, TonicGitManifest } from "./weaveGit/types";
import {
  buildCompareThreeTextModeEntry,
  entryEngineVersion,
  loadOrInitManifest,
  mergeThreeWeaveDriver,
  persistCompareThreeWeaveWriteback,
  rootEngineVersion,
} from "./weaveGit/writeback";

function gitHydrateIntentsIsAstMode(argv: string[]): boolean {
  if (process.env.TONIC_AST_GREP?.trim()) {
    return true;
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--ast-grep-")) {
      return true;
    }
    if (
      a === "--rule" ||
      a === "--config" ||
      a === "-c" ||
      a === "--inline-rule" ||
      a === "--ruleset" ||
      a === "--run-out" ||
      a === "--changed-only" ||
      a === "--include" ||
      a === "--exclude" ||
      a === "--languages" ||
      a === "--max-matches-per-file" ||
      a === "--max-matches-per-rule"
    ) {
      return true;
    }
  }
  return false;
}

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

function tailAfterFlag(argv: string[], flag: string): string[] {
  const i = argv.indexOf(flag);
  if (i < 0) {
    return [];
  }
  return argv.slice(i + 1);
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

/** Repeated `--branch` / `--ref` (and `-b` on fetch-only argv) for `git fetch <remote> ref...`. */
function collectFetchRefArgs(argv: string[]): string[] {
  const flags = new Set(["--branch", "--ref", "-b"]);
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (flags.has(argv[i]!)) {
      const v = argv[i + 1];
      if (v && !v.startsWith("-")) {
        out.push(v);
        i++;
      }
    }
  }
  return out;
}

function gitMergeFileStdout(left: string, base: string, right: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-mf-"));
  try {
    const pL = path.join(dir, "l");
    const pB = path.join(dir, "b");
    const pR = path.join(dir, "r");
    fs.writeFileSync(pL, left, "utf8");
    fs.writeFileSync(pB, base, "utf8");
    fs.writeFileSync(pR, right, "utf8");
    const r = spawnSync("git", ["merge-file", "-p", pL, pB, pR], { encoding: "utf8" });
    return (r.stdout ?? "").replace(/\r\n/g, "\n");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function threeWayChangedPaths(repoRoot: string, baseRef: string, leftRef: string, rightRef: string): string[] {
  const pairs: [string, string][] = [
    [baseRef, leftRef],
    [baseRef, rightRef],
    [leftRef, rightRef],
  ];
  const names = new Set<string>();
  for (const [a, b] of pairs) {
    const out = gitRequireOk(repoRoot, ["diff", "--name-only", a, b], "diff")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const n of out) {
      names.add(n);
    }
  }
  return [...names].sort();
}

function gitShowText(repoRoot: string, ref: string, rel: string): string | null {
  const cp = gitExec(repoRoot, ["show", `${ref}:${rel}`]);
  if (cp.code !== 0) {
    return null;
  }
  return cp.stdout;
}

function manifestAtRef(repoRoot: string, ref: string): TonicGitManifest | null {
  const raw = gitShowText(repoRoot, ref, ".tonic/weave/manifest.json");
  if (raw === null) {
    return null;
  }
  try {
    return parseManifestJson(raw);
  } catch {
    return null;
  }
}

function readLocalWeaveBlob(repoRoot: string, sha: string): string | null {
  const p = path.join(repoRoot, ".tonic", "weave", "blobs", sha);
  if (!fs.existsSync(p)) {
    return null;
  }
  return fs.readFileSync(p, "utf8");
}

async function ensureWeaveBlobs(
  repoRoot: string,
  keys: string[],
  hubRepoId: string,
  shouldPrefetch: boolean,
): Promise<void> {
  if (!shouldPrefetch || !hubRepoId.trim()) {
    return;
  }
  const dest = path.join(repoRoot, ".tonic", "weave", "blobs");
  await prefetchHubBlobsToDir({ repoId: hubRepoId.trim(), keys, destDir: dest });
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
  const extraRefs = collectFetchRefArgs(argv);
  const args = ["fetch", remote];
  if (prune) {
    args.push("--prune");
  }
  args.push(...extraRefs);
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
  if (gitHydrateIntentsIsAstMode(argv)) {
    const { parseAstGrepHydrateArgv, runAstGrepHydrate } = await import("./astGrep/command");
    const parsed = parseAstGrepHydrateArgv(["--repo", repoRoot, ...argv]);
    if (!parsed.ok) {
      console.error(parsed.message);
      return 11;
    }
    return runAstGrepHydrate(parsed.opts);
  }
  const m = parseArgs(argv);
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

  const weaveMerge = m.flags.has("weave_merge");
  const hubPrefetch = m.flags.has("hub_prefetch");
  const hubRepoId = getOpt(m, "hub_repo_id", "").trim();

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

  const prefetchKeys = new Set<string>();
  if (weaveMerge || hubPrefetch) {
    const ml = manifestAtRef(repoRoot, leftRef);
    const mr = manifestAtRef(repoRoot, rightRef);
    const norm = (r: string) => r.replace(/\\/g, "/");
    for (const rel of names) {
      const k = norm(rel);
      const sl = ml?.paths[k]?.weave_serialized_sha;
      const sr = mr?.paths[k]?.weave_serialized_sha;
      if (sl) {
        prefetchKeys.add(sl);
      }
      if (sr) {
        prefetchKeys.add(sr);
      }
    }
  }
  await ensureWeaveBlobs(repoRoot, [...prefetchKeys], hubRepoId, hubPrefetch || weaveMerge);

  const artifacts: MergeArtifactJson[] = [];
  let weaveDegraded = false;
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
    const cfPath = rel.replace(/\\/g, "/");
    let merged: string[] = [];
    let annotated: string[] = [];
    let usedWeave = false;
    if (weaveMerge) {
      const ml = manifestAtRef(repoRoot, leftRef);
      const mr = manifestAtRef(repoRoot, rightRef);
      const entL = ml?.paths[cfPath];
      const entR = mr?.paths[cfPath];
      const sl = entL?.weave_serialized_sha;
      const sr = entR?.weave_serialized_sha;
      if (sl && sr) {
        const blobL = readLocalWeaveBlob(repoRoot, sl);
        const blobR = readLocalWeaveBlob(repoRoot, sr);
        if (blobL !== null && blobR !== null) {
          const [mergedState, ann] = mergeStates(blobL, blobR);
          merged = currentLines(mergedState);
          annotated = ann;
          usedWeave = true;
        } else {
          weaveDegraded = true;
        }
      } else {
        weaveDegraded = true;
      }
    }
    if (!usedWeave) {
      [merged, annotated] = mergeSnapshots(left, right);
    }
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
      weave_merge: usedWeave || undefined,
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
      compareMode: weaveMerge ? "weave" : "two-way",
    });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  }

  if (weaveDegraded) {
    console.error("TONIC_WEAVE_COMPARE_DEGRADED: missing weave blobs or manifest rows; fell back to text merge");
  }
  console.log(
    JSON.stringify({
      summary: dryRun ? "dry-run" : write ? "written" : "ok",
      left_ref: leftRef,
      right_ref: rightRef,
      expected_write_branch: expectedWriteBranch || undefined,
      files: artifacts.length,
      paths: artifacts.map((a) => a.path),
      weave_degraded: weaveDegraded || undefined,
    }),
  );
  return 0;
}

/** Merge-base-aware three-way text merge via `git merge-file`, optional Hub weave blob prefetch. */
export async function gitCmdCompareThree(repoRoot: string, argv: string[]): Promise<number> {
  const m = parseArgs(argv);
  const weaveWritebackMode = getOpt(m, "weave_writeback_mode", "text").trim().toLowerCase();
  const writeWeave = m.flags.has("write_weave");
  const weaveDriverStrict = !m.flags.has("weave_driver_non_strict");
  if (writeWeave && weaveWritebackMode !== "text" && weaveWritebackMode !== "weave") {
    console.error("git compare-three: --weave-writeback-mode must be text or weave");
    return 1;
  }
  const remote = getOpt(m, "remote", "origin");
  const baseBranch = getOpt(m, "base_branch", "main");
  const mergeBranch = getOpt(m, "merge_branch", "");
  let leftRef = getOpt(m, "left_ref", "");
  let rightRef = getOpt(m, "right_ref", "");
  if (!leftRef || !rightRef) {
    if (!mergeBranch) {
      console.error("git compare-three: need --merge-branch or both --left-ref and --right-ref");
      return 1;
    }
    leftRef = leftRef || `${remote}/${baseBranch}`;
    rightRef = rightRef || `${remote}/${mergeBranch}`;
  }
  let baseRef = getOpt(m, "base_ref", "").trim();
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
  const hubPrefetch = m.flags.has("hub_prefetch");
  const hubRepoId = getOpt(m, "hub_repo_id", "").trim();

  const needFetch =
    Boolean(mergeBranch) ||
    leftRef.startsWith(`${remote}/`) ||
    rightRef.startsWith(`${remote}/`);
  if (needFetch) {
    gitRequireOk(repoRoot, ["fetch", remote], "fetch");
  }

  if (!baseRef) {
    baseRef = gitRequireOk(repoRoot, ["merge-base", leftRef, rightRef], "merge-base").trim();
  }

  const leftSha = gitRequireOk(repoRoot, ["rev-parse", leftRef], "rev-parse").trim();
  const rightSha = gitRequireOk(repoRoot, ["rev-parse", rightRef], "rev-parse").trim();
  const baseSha = gitRequireOk(repoRoot, ["rev-parse", baseRef], "rev-parse").trim();

  if (expectedWriteBranch && (write || writeWeave) && !dryRun) {
    const cur = currentBranch(repoRoot);
    if (cur !== expectedWriteBranch) {
      console.error(
        `Refusing --write/--write-weave: HEAD is "${cur}", expected "${expectedWriteBranch}"`,
      );
      return 1;
    }
  }

  const names = filterPaths(threeWayChangedPaths(repoRoot, baseRef, leftRef, rightRef), pathFilters);

  const mb = manifestAtRef(repoRoot, baseRef);
  const ml = manifestAtRef(repoRoot, leftRef);
  const mr = manifestAtRef(repoRoot, rightRef);

  const shouldPrefetchWeave =
    hubPrefetch || (writeWeave && weaveWritebackMode === "weave");
  const prefetchKeys = new Set<string>();
  if (shouldPrefetchWeave) {
    const norm = (r: string) => r.replace(/\\/g, "/");
    for (const rel of names) {
      const k = norm(rel);
      for (const ent of [mb?.paths[k], ml?.paths[k], mr?.paths[k]]) {
        const sha = ent?.weave_serialized_sha;
        if (sha) {
          prefetchKeys.add(sha);
        }
      }
    }
  }
  await ensureWeaveBlobs(repoRoot, [...prefetchKeys], hubRepoId, shouldPrefetchWeave);

  const manPath = path.join(repoRoot, ".tonic", "weave", "manifest.json");
  const head = gitRequireOk(repoRoot, ["rev-parse", "HEAD"], "rev-parse").trim();
  const diskManifest = writeWeave ? loadOrInitManifest(manPath, head) : null;

  const hydrationBase = await resolveCompareMaterializeHydration(repoRoot, m, leftRef, rightRef);
  const gitHydration = {
    repoRoot,
    leftRef,
    rightRef,
    leftIntent: hydrationBase.leftIntent,
    rightIntent: hydrationBase.rightIntent,
    explicitLeftAuthor: hydrationBase.leftAuthor,
    explicitRightAuthor: hydrationBase.rightAuthor,
  };

  const artifacts: MergeArtifactJson[] = [];
  const pathUpdates: Record<string, PathManifestEntry> = {};
  const serializedByPath: Record<string, string> = {};

  for (const rel of names) {
    if (rel.includes("..") || path.isAbsolute(rel)) {
      continue;
    }
    const cfPath = rel.replace(/\\/g, "/");
    const baseText = gitShowText(repoRoot, baseRef, rel) ?? "";
    const leftText = gitShowText(repoRoot, leftRef, rel) ?? "";
    const rightText = gitShowText(repoRoot, rightRef, rel) ?? "";
    const mergedGit = gitMergeFileStdout(
      leftText.endsWith("\n") || !leftText ? leftText : `${leftText}\n`,
      baseText.endsWith("\n") || !baseText ? baseText : `${baseText}\n`,
      rightText.endsWith("\n") || !rightText ? rightText : `${rightText}\n`,
    );
    const annotatedRaw = gitMergeFileOutputToTonicAnnotatedLines(mergedGit, gitHydration);
    const useWeaveDriver = Boolean(writeWeave && weaveWritebackMode === "weave");
    let annotatedWorking = annotatedRaw;
    let weaveDriverEntry: PathManifestEntry | null = null;
    let weaveDriverSerialized: string | null = null;
    if (useWeaveDriver) {
      if (!diskManifest) {
        console.error("git compare-three: internal error: disk manifest missing for weave write-back");
        return 1;
      }
      const entB = mb?.paths[cfPath];
      const entL = ml?.paths[cfPath];
      const entR = mr?.paths[cfPath];
      let [wfv, did] = rootEngineVersion(diskManifest);
      [wfv, did] = entryEngineVersion(entL, wfv, did);
      [wfv, did] = entryEngineVersion(entR, wfv, did);
      [wfv, did] = entryEngineVersion(entB, wfv, did);
      const [dLines, dEntry, dSer, driverStderr] = mergeThreeWeaveDriver({
        repoRoot,
        relPath: cfPath,
        textBase: baseText,
        textLeft: leftText,
        textRight: rightText,
        entBase: entB,
        entLeft: entL,
        entRight: entR,
        weaveFormatVersion: wfv,
        diffEngineId: did,
        strict: weaveDriverStrict,
      });
      if (dEntry === null || dSer === null) {
        for (const line of driverStderr) {
          console.error(line);
        }
        console.error(
          "git compare-three: weave write-back mode failed (missing blobs or compatibility); " +
            "use --weave-writeback-mode text for Mode A (degraded) or ensure .tonic/weave/blobs",
        );
        return 1;
      }
      annotatedWorking = dLines;
      weaveDriverEntry = dEntry;
      weaveDriverSerialized = dSer;
    }

    const markersPresent = annotatedWorking.some((l) => l.startsWith("<<<<<<< begin"));
    let annotatedForReport = annotatedWorking;
    if (markersPresent) {
      annotatedForReport = hydrateTonicAnnotatedAuthorIntent(annotatedWorking, hydrationBase);
    }
    const merged = useWeaveDriver
      ? normLines(annotatedForReport.join("\n"))
      : normLines(mergedGit);
    const left = normLines(leftText);
    const right = normLines(rightText);
    const cf = annotatedToConflictFile(cfPath, annotatedForReport);
    artifacts.push({
      version: "1",
      path: cfPath,
      base_sha: leftRef,
      head_sha: rightRef,
      merge_base_sha: baseSha,
      compare_three: true,
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
      weave_writeback: useWeaveDriver ? "weave" : undefined,
    });
    if (write && !dryRun) {
      const abs = path.join(repoRoot, rel);
      writeAnnotatedToWorkingFile(abs, annotatedForReport, { backup, atomic });
    }
    if (writeWeave && diskManifest) {
      const wfv0 = diskManifest.weave_format_version?.trim() || "1";
      const did0 = diskManifest.diff_engine_id?.trim() || "tonic-v1";
      const entL2 = ml?.paths[cfPath];
      const entR2 = mr?.paths[cfPath];
      const parents: string[] = [];
      if (entL2?.weave_serialized_sha) {
        parents.push(entL2.weave_serialized_sha);
      }
      if (entR2?.weave_serialized_sha) {
        parents.push(entR2.weave_serialized_sha);
      }
      if (useWeaveDriver && weaveDriverEntry && weaveDriverSerialized) {
        pathUpdates[cfPath] = weaveDriverEntry;
        serializedByPath[cfPath] = weaveDriverSerialized;
      } else {
        const { entry, serialized } = buildCompareThreeTextModeEntry({
          relPath: cfPath,
          annotatedLines: annotatedForReport,
          weaveFormatVersion: wfv0,
          diffEngineId: did0,
          parentWeaveShas: parents.length ? parents : undefined,
        });
        pathUpdates[cfPath] = entry;
        serializedByPath[cfPath] = serialized;
      }
    }
  }

  if (writeWeave && !dryRun && diskManifest) {
    persistCompareThreeWeaveWriteback({
      repoRoot,
      manifest: diskManifest,
      pathUpdates,
      serializedByPath,
      headCommit: head,
    });
  }

  if (reportPath) {
    const report = mergeReportDict({
      runId: "git-compare-three",
      prTitle: "git compare-three",
      baseSha: baseSha,
      headSha: rightSha,
      baseRef: baseRef,
      headRef: rightRef,
      mergeBaseSha: baseSha,
      leftRef,
      rightRef,
      compareMode: "three-way",
      artifacts,
      includeAnnotated: true,
      embedAnnotatedForMarkerFiles: true,
    });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  }

  const outPayload: Record<string, unknown> = {
    summary: dryRun ? "dry-run" : write || writeWeave ? "written" : "ok",
    merge_base_ref: baseRef,
    merge_base_sha: baseSha,
    left_ref: leftRef,
    right_ref: rightRef,
    expected_write_branch: expectedWriteBranch || undefined,
    files: artifacts.length,
    paths: artifacts.map((a) => a.path),
  };
  if (writeWeave) {
    outPayload.write_weave = true;
    outPayload.weave_writeback_mode = weaveWritebackMode;
  }
  console.log(JSON.stringify(outPayload));

  const hydrateAfter = tailAfterFlag(argv, "--hydrate-after");
  if (hydrateAfter.length > 0 && !dryRun) {
    const tryHydrate = (cmd: string, args: string[]): number => {
      const r = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
      return r.status ?? 1;
    };
    let hc = tryHydrate("merge-tonic", ["hydrate", "--repo", repoRoot, ...hydrateAfter]);
    if (hc !== 0) {
      hc = tryHydrate("python", ["-m", "tonic.cli", "hydrate", "--repo", repoRoot, ...hydrateAfter]);
    }
    return hc;
  }
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
  if (sub === "compare-three" || sub === "c3") {
    return await gitCmdCompareThree(repoRoot, rest);
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
    "Usage: merge-tonic git fetch|compare|compare-three|materialize|from-index|hydrate-intents|merge|worktree ... (use --repo for root)",
  );
  return 1;
}
