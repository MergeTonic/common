import * as fs from "node:fs";
import * as path from "node:path";

import { runAstGrepHydrateFromArgv, runHydrationPipelineFromArgv } from "@mergetonic/core";

function truthyEnv(val: string | undefined): boolean {
  if (!val) {
    return false;
  }
  const v = val.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export type AstHydrationStepResult = {
  exitCode: number;
  mode: "skipped" | "ast-grep-hydrate" | "hydrate";
  runPath?: string;
  astEvidencePath?: string;
  intentHydrationPath?: string;
  retrievalPath?: string | null;
  codeWalkTracePath?: string | null;
  promptExcerpt?: string;
};

/**
 * Maps GitHub Action env INPUT_HYDRATION_* to hydrate CLI tokens (before INPUT_AST_HYDRATION_EXTRA_ARGS).
 * Multi-line text: pass via `ast_hydration_extra_args` or encode newlines; argv elements are not shell-expanded.
 */
export function hydrationOrchestrationArgvFromEnv(): string[] {
  const out: string[] = [];
  const uq = (process.env.INPUT_HYDRATION_USER_QUERY ?? "").trim();
  if (uq) {
    out.push("--user-query", uq);
  }
  const fu = (process.env.INPUT_HYDRATION_FOLLOW_UP ?? "").trim();
  if (fu) {
    out.push("--follow-up", fu);
  }
  const pr = (process.env.INPUT_HYDRATION_PRIOR_RUN ?? "").trim();
  if (pr) {
    out.push("--prior-run", pr);
  }
  return out;
}

function parseIntentPair(): { left: string; right: string } {
  const raw = (process.env.INPUT_INTENT_PAIR ?? "").trim();
  if (!raw) {
    return { left: "preserve intent from both sides", right: "preserve intent from both sides" };
  }
  const parts = raw.split(",").map((s) => s.trim());
  return {
    left: parts[0] || "preserve intent from both sides",
    right: parts[1] || parts[0] || "preserve intent from both sides",
  };
}

function hydrationQuestionModeFromEnv(): string {
  const raw = (process.env.INPUT_HYDRATION_QUESTION_MODE ?? "off").trim().toLowerCase();
  if (raw === "on" || raw === "auto") {
    return raw;
  }
  return "off";
}

type HydrationRunFile = {
  ast_evidence_path?: string | null;
  retrieval_path?: string | null;
  code_walk_trace_path?: string | null;
  intent_hydration_path?: string | null;
};

function readIntentExcerpt(intentPath: string): string | undefined {
  try {
    const j = JSON.parse(fs.readFileSync(intentPath, "utf8")) as { prompt_excerpt?: string };
    return typeof j.prompt_excerpt === "string" ? j.prompt_excerpt : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Optional ast hydration subprocess when INPUT_ENABLE_AST_HYDRATION is set.
 * Default: ast-grep-hydrate only. Set INPUT_AST_HYDRATION_SUBCOMMAND=hydrate for full multi-phase pipeline.
 */
export async function runAstHydrationStep(repoRoot: string): Promise<AstHydrationStepResult> {
  if (!truthyEnv(process.env.INPUT_ENABLE_AST_HYDRATION)) {
    return { exitCode: 0, mode: "skipped" };
  }
  const root = path.resolve(repoRoot);
  const subRaw = (
    process.env.INPUT_AST_HYDRATION_SUBCOMMAND ??
    process.env.INPUT_AST_HYDRATION_MODE ??
    "ast-grep-hydrate"
  )
    .trim()
    .toLowerCase();
  const extraRaw = (process.env.INPUT_AST_HYDRATION_EXTRA_ARGS ?? "").trim();
  const extra = extraRaw ? extraRaw.split(/\s+/).filter(Boolean) : [];

  if (subRaw === "hydrate" || subRaw === "full" || subRaw === "pipeline") {
    const outDir = path.join(root, ".tonic", "hydrate-out");
    fs.mkdirSync(outDir, { recursive: true });
    const { left, right } = parseIntentPair();
    const argv = [
      "--repo",
      root,
      "--out-dir",
      outDir,
      "--left-intent",
      left,
      "--right-intent",
      right,
      "--question-mode",
      hydrationQuestionModeFromEnv(),
      ...hydrationOrchestrationArgvFromEnv(),
      ...extra,
    ];
    const exitCode = await runHydrationPipelineFromArgv(argv);
    const runPath = path.join(outDir, "hydration-run.json");
    let run: HydrationRunFile | null = null;
    try {
      run = JSON.parse(fs.readFileSync(runPath, "utf8")) as HydrationRunFile;
    } catch {
      run = null;
    }
    const intentPath =
      run?.intent_hydration_path != null
        ? path.isAbsolute(run.intent_hydration_path)
          ? run.intent_hydration_path
          : path.join(root, run.intent_hydration_path)
        : path.join(outDir, "intent-hydration.json");
    const excerpt = fs.existsSync(intentPath) ? readIntentExcerpt(intentPath) : undefined;
    if (exitCode !== 0 && exitCode !== 13) {
      console.warn(`merge-tonic hydrate exited with code ${exitCode}`);
      if (truthyEnv(process.env.INPUT_AST_HYDRATION_STRICT)) {
        throw new Error(`merge-tonic hydrate failed with exit ${exitCode}`);
      }
    }
    return {
      exitCode,
      mode: "hydrate",
      runPath: runPath.replace(/\\/g, "/"),
      astEvidencePath: run?.ast_evidence_path?.replace(/\\/g, "/") ?? undefined,
      intentHydrationPath: run?.intent_hydration_path?.replace(/\\/g, "/") ?? intentPath.replace(/\\/g, "/"),
      retrievalPath: run?.retrieval_path ?? null,
      codeWalkTracePath: run?.code_walk_trace_path ?? null,
      promptExcerpt: excerpt,
    };
  }

  const out = path.join(root, ".tonic", "ast-hydration.json");
  const runOut = path.join(root, ".tonic", "hydration-run.json");
  const argv = ["--repo", root, "--out", out, "--run-out", runOut, ...extra];
  const exitCode = runAstGrepHydrateFromArgv(argv);
  if (exitCode !== 0 && exitCode !== 13) {
    console.warn(`ast-grep-hydrate exited with code ${exitCode}`);
    if (truthyEnv(process.env.INPUT_AST_HYDRATION_STRICT)) {
      throw new Error(`ast-grep-hydrate failed with exit ${exitCode}`);
    }
  }
  return {
    exitCode,
    mode: "ast-grep-hydrate",
    runPath: runOut.replace(/\\/g, "/"),
    astEvidencePath: out.replace(/\\/g, "/"),
  };
}
