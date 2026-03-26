import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { gitExec, gitRequireOk } from "./gitExec";
import { annotatedToConflictFile, mergeSnapshots } from "./mergeUtils";
import { mergeReportDict, type MergeArtifactJson } from "./cliReport";

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

export function gitCmdCompare(repoRoot: string, argv: string[]): number {
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
    const cf = annotatedToConflictFile(cfPath, annotated);
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
      annotated_lines: markersPresent ? annotated : undefined,
    });
    if (write && !dryRun) {
      const abs = path.join(repoRoot, rel);
      writeAnnotatedToWorkingFile(abs, annotated, { backup, atomic });
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

export function gitCmdMaterialize(repoRoot: string, argv: string[]): number {
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
    if (write && !dryRun) {
      const abs = path.join(repoRoot, rel);
      writeAnnotatedToWorkingFile(abs, annotated, { backup, atomic });
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

export function gitMain(repoRoot: string, argv: string[]): number {
  const sub = argv[0];
  const rest = argv.slice(1);
  if (sub === "fetch" || sub === "f") {
    return gitCmdFetch(repoRoot, rest);
  }
  if (sub === "compare" || sub === "c") {
    return gitCmdCompare(repoRoot, rest);
  }
  if (sub === "materialize" || sub === "from-index" || sub === "mat" || sub === "fi") {
    return gitCmdMaterialize(repoRoot, rest);
  }
  if (sub === "merge" || sub === "m") {
    return gitCmdMerge(repoRoot, rest);
  }
  if (sub === "worktree" || sub === "wt") {
    return gitCmdWorktree(repoRoot, rest);
  }
  console.error(
    "Usage: merge-tonic git fetch|compare|materialize|from-index|merge|worktree ... (use --repo for root)",
  );
  return 1;
}
