import * as crypto from "node:crypto";
import * as path from "node:path";

import {
  buildAstHydrationJson,
  buildRunJson,
  summarizeAstInputs,
  writeUtf8Json,
} from "./artifact";
import { runAstGrepScan } from "./runner";
import type { AstGrepCliOptions } from "./types";
import {
  EXIT_AST_GREP_MISSING,
  EXIT_INVALID_ARGS,
  EXIT_OK,
  EXIT_PARTIAL,
  EXIT_SCAN_FAILED,
} from "./types";

function defaultRulesDir(): string {
  return path.join(__dirname, "..", "..", "rules", "ast-grep");
}

export function resolveDefaultRulePath(): string {
  return path.join(defaultRulesDir(), "typescript.yml");
}

function getArg(argv: string[], names: string[], def: string): string {
  for (const n of names) {
    const i = argv.indexOf(n);
    if (i >= 0 && argv[i + 1] && !argv[i + 1]!.startsWith("-")) {
      return argv[i + 1]!;
    }
  }
  return def;
}

function hasFlag(argv: string[], names: string[]): boolean {
  return names.some((n) => argv.includes(n));
}

function collectMulti(argv: string[], flag: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === flag && argv[i + 1] && !argv[i + 1]!.startsWith("-")) {
      out.push(argv[i + 1]!);
      i++;
    }
  }
  return out;
}

/** Parse argv after subcommand name into AstGrepCliOptions. */
export function parseAstGrepHydrateArgv(argv: string[]): {
  ok: true;
  opts: AstGrepCliOptions;
} | { ok: false; message: string } {
  const repo = path.resolve(getArg(argv, ["--repo", "-R"], "."));
  const outPath = getArg(argv, ["--out", "-o"], path.join(repo, ".tonic", "ast-hydration.json"));
  const runOut = getArg(argv, ["--run-out"], path.join(repo, ".tonic", "hydration-run.json"));
  let ruleset = getArg(argv, ["--ruleset"], "default");
  let configPath = getArg(argv, ["--config", "-c"], "");
  let rulePath = getArg(argv, ["--rule"], "");
  const inlineRule = getArg(argv, ["--inline-rule"], "");
  const languages = getArg(argv, ["--languages"], "auto");
  const includeGlobs = collectMulti(argv, "--include");
  const excludeGlobs = collectMulti(argv, "--exclude");
  const changedOnly = hasFlag(argv, ["--changed-only"]);
  const maxPerFile = parseInt(getArg(argv, ["--max-matches-per-file"], "0"), 10) || 0;
  const maxPerRule = parseInt(getArg(argv, ["--max-matches-per-rule"], "0"), 10) || 0;
  const astGrepBin = getArg(argv, ["--ast-grep-bin"], "");

  const extraArgs: string[] = [];
  const ei = argv.indexOf("--");
  if (ei >= 0) {
    extraArgs.push(...argv.slice(ei + 1));
  }

  if (ruleset === "default" && !configPath && !rulePath && !inlineRule) {
    rulePath = resolveDefaultRulePath();
    ruleset = "default";
  }

  return {
    ok: true,
    opts: {
      repoRoot: repo,
      outPath,
      runOutPath: runOut,
      ruleset,
      configPath,
      rulePath,
      inlineRule,
      languages,
      includeGlobs,
      excludeGlobs,
      changedOnly,
      maxMatchesPerFile: maxPerFile,
      maxMatchesPerRule: maxPerRule,
      astGrepBin,
      extraArgs,
    },
  };
}

export function runAstGrepHydrateFromArgv(argv: string[]): number {
  const parsed = parseAstGrepHydrateArgv(argv);
  if (!parsed.ok) {
    console.error(parsed.message);
    return EXIT_INVALID_ARGS;
  }
  return runAstGrepHydrate(parsed.opts);
}

export function runAstGrepHydrate(opts: AstGrepCliOptions): number {
  const t0 = Date.now();
  const runId = crypto.randomUUID();
  const errors: Array<{ code: string; message: string; detail?: string }> = [];
  const warnings: Array<{ code: string; message: string; detail?: string }> = [];
  const result = runAstGrepScan(opts);

  if (result.kind === "missing_binary") {
    errors.push({ code: "ast_grep_missing", message: result.message });
    writeUtf8Json(
      opts.runOutPath,
      buildRunJson({
        runId,
        status: "failed",
        exitCode: EXIT_AST_GREP_MISSING,
        errors,
        warnings,
        inputs: summarizeAstInputs(opts),
        timingMs: Date.now() - t0,
        astEvidencePath: null,
      }),
    );
    return EXIT_AST_GREP_MISSING;
  }
  if (result.kind === "invalid_args") {
    errors.push({ code: "invalid_args", message: result.message });
    writeUtf8Json(
      opts.runOutPath,
      buildRunJson({
        runId,
        status: "failed",
        exitCode: EXIT_INVALID_ARGS,
        errors,
        warnings,
        inputs: summarizeAstInputs(opts),
        timingMs: Date.now() - t0,
        astEvidencePath: null,
      }),
    );
    return EXIT_INVALID_ARGS;
  }
  if (result.kind === "exec_failed") {
    errors.push({
      code: "scan_failed",
      message: `ast-grep exited ${result.code ?? "?"}`,
      detail: result.stderr,
    });
    writeUtf8Json(
      opts.runOutPath,
      buildRunJson({
        runId,
        status: "failed",
        exitCode: EXIT_SCAN_FAILED,
        errors,
        warnings,
        inputs: summarizeAstInputs(opts),
        timingMs: Date.now() - t0,
        astEvidencePath: null,
      }),
    );
    return EXIT_SCAN_FAILED;
  }
  if (result.kind === "parse_failed") {
    errors.push({ code: "parse_failed", message: result.message });
    writeUtf8Json(
      opts.runOutPath,
      buildRunJson({
        runId,
        status: "failed",
        exitCode: EXIT_SCAN_FAILED,
        errors,
        warnings,
        inputs: summarizeAstInputs(opts),
        timingMs: Date.now() - t0,
        astEvidencePath: null,
      }),
    );
    return EXIT_SCAN_FAILED;
  }

  warnings.push(...result.warnings);
  let status: "ok" | "partial" = "ok";
  let exitCode = EXIT_OK;
  if (result.truncated || warnings.length > 0) {
    status = "partial";
    exitCode = EXIT_PARTIAL;
  }

  const langs =
    opts.languages.trim().toLowerCase() === "auto" || !opts.languages.trim()
      ? ["auto"]
      : opts.languages.split(",").map((s) => s.trim()).filter(Boolean);

  const ast = buildAstHydrationJson({
    repoRoot: opts.repoRoot,
    ruleset: opts.ruleset,
    languages: langs,
    scanScope: opts.changedOnly ? "changed-only" : "full",
    toolVersion: result.toolVersion,
    matches: result.matches,
    truncated: result.truncated,
  });
  writeUtf8Json(opts.outPath, ast);

  writeUtf8Json(
    opts.runOutPath,
    buildRunJson({
      runId,
      status,
      exitCode,
      errors,
      warnings,
      inputs: summarizeAstInputs(opts),
      timingMs: Date.now() - t0,
      astEvidencePath: path.resolve(opts.outPath).replace(/\\/g, "/"),
    }),
  );
  return exitCode;
}
