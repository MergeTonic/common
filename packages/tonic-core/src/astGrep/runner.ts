import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { readAstGrepVersion, resolveAstGrepBinary } from "./discovery";
import { fileMatchesLanguageFilter, parseLanguagesParam } from "./languageMap";
import {
  applyCaps,
  mapRawMatch,
  pathMatchesGlobs,
  stableSortMatches,
  toRepoRelativePosix,
} from "./normalize";
import type { AstGrepCliOptions, AstGrepRunResult, NormalizedMatch } from "./types";

function parseSgJsonStdout(stdout: string): unknown[] {
  const t = stdout.trim();
  if (!t) {
    return [];
  }
  try {
    const j = JSON.parse(t) as unknown;
    if (Array.isArray(j)) {
      return j;
    }
    if (j && typeof j === "object") {
      return [j];
    }
  } catch {
    /* fall through to NDJSON */
  }
  const lines = stdout.split(/\r?\n/);
  const out: unknown[] = [];
  for (const line of lines) {
    const s = line.trim();
    if (!s) {
      continue;
    }
    try {
      out.push(JSON.parse(s) as unknown);
    } catch {
      /* skip bad line */
    }
  }
  return out;
}

function listRepoFiles(repoRoot: string): string[] {
  const out: string[] = [];
  function walk(dir: string, base: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === ".git" || e.name === "node_modules" || e.name === ".tonic") {
        continue;
      }
      const rel = path.join(base, e.name).replace(/\\/g, "/");
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(full, rel);
      } else if (e.isFile()) {
        out.push(rel);
      }
    }
  }
  walk(repoRoot, "");
  return out.sort();
}

function getGitChangedFiles(repoRoot: string): string[] | null {
  const r = spawnSync("git", ["-C", repoRoot, "diff", "--name-only", "HEAD"], {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });
  if (r.status !== 0) {
    return null;
  }
  return (r.stdout ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim().replace(/\\/g, "/"))
    .filter(Boolean);
}

function buildScanArgv(opts: AstGrepCliOptions, scanPaths: string[]): string[] {
  const args = ["scan", "--json"];
  if (opts.configPath) {
    args.push("--config", opts.configPath);
  } else if (opts.rulePath) {
    args.push("--rule", opts.rulePath);
  } else if (opts.inlineRule) {
    args.push("--inline-rules", opts.inlineRule);
  }
  args.push(...opts.extraArgs);
  if (scanPaths.length === 0) {
    args.push(".");
  } else {
    args.push(...scanPaths);
  }
  return args;
}

export function collectScanPaths(opts: AstGrepCliOptions): {
  paths: string[];
  warnings: Array<{ code: string; message: string; detail?: string }>;
} {
  const warnings: Array<{ code: string; message: string; detail?: string }> = [];
  const langs = parseLanguagesParam(opts.languages);
  let candidates: string[];
  if (opts.changedOnly) {
    const ch = getGitChangedFiles(opts.repoRoot);
    if (ch == null) {
      warnings.push({
        code: "git_diff_failed",
        message: "Could not list changed files; scanning full repo tree",
      });
      candidates = listRepoFiles(opts.repoRoot);
    } else {
      candidates = ch;
    }
  } else {
    candidates = listRepoFiles(opts.repoRoot);
  }
  const include = opts.includeGlobs;
  const exclude = opts.excludeGlobs;
  const out: string[] = [];
  for (const rel of candidates) {
    if (!pathMatchesGlobs(rel, include, exclude)) {
      continue;
    }
    const { ok } = fileMatchesLanguageFilter(rel, langs);
    if (!ok) {
      continue;
    }
    out.push(rel);
  }
  return { paths: out, warnings };
}

export function runAstGrepScan(opts: AstGrepCliOptions): AstGrepRunResult {
  const bin = resolveAstGrepBinary(opts);
  if (!bin) {
    return {
      kind: "missing_binary",
      message:
        "ast-grep (sg) not found. Install from https://ast-grep.github.io/ or set TONIC_AST_GREP_BIN / --ast-grep-bin",
    };
  }
  if (!opts.configPath && !opts.rulePath && !opts.inlineRule) {
    return { kind: "invalid_args", message: "Need one of --config, --rule, or --inline-rule (or --ruleset default)" };
  }

  const { paths: scanPaths, warnings: pathWarnings } = collectScanPaths(opts);
  const absPaths = scanPaths.map((p) => path.join(opts.repoRoot, p));
  const timeoutMs = Number(process.env.TONIC_AST_GREP_TIMEOUT_MS ?? "300000") || 300_000;

  const argv = buildScanArgv(opts, absPaths.length > 0 ? absPaths : [opts.repoRoot]);
  const spawnBin = bin.endsWith(".js") ? process.execPath : bin;
  const spawnArgv = bin.endsWith(".js") ? [bin, ...argv] : argv;
  const r = spawnSync(spawnBin, spawnArgv, {
    cwd: opts.repoRoot,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
    ...(timeoutMs > 0 ? { timeout: timeoutMs } : {}),
  });
  const toolVersion = readAstGrepVersion(bin);
  if (r.error) {
    return {
      kind: "exec_failed",
      code: null,
      stderr: String(r.error.message),
    };
  }
  // ast-grep uses 0 for success; some versions may return non-zero on diagnostics — accept 0–2 if stdout parses
  if (r.status != null && r.status > 2) {
    return {
      kind: "exec_failed",
      code: r.status,
      stderr: (r.stderr || r.stdout || "").trim(),
    };
  }

  let rows: unknown[];
  try {
    rows = parseSgJsonStdout(r.stdout || "");
  } catch (e) {
    return {
      kind: "parse_failed",
      message: e instanceof Error ? e.message : String(e),
    };
  }

  const matches: NormalizedMatch[] = [];
  for (const row of rows) {
    const m = mapRawMatch(row, opts.repoRoot);
    if (m) {
      matches.push(m);
    }
  }
  const sorted = stableSortMatches(matches);
  const capped = applyCaps(sorted, opts.maxMatchesPerFile, opts.maxMatchesPerRule);
  const allWarnings = [...pathWarnings, ...capped.warnings];
  const files = new Set(capped.matches.map((x) => x.path));

  return {
    kind: "ok",
    matches: capped.matches,
    toolVersion,
    warnings: allWarnings,
    truncated: capped.truncated,
  };
}

export { toRepoRelativePosix };
