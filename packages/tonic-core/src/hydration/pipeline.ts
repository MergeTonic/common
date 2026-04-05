import { execSync } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import type { RetrievalHit } from "@mergetonic/coding-hydration";

import { buildAstHydrationJson, buildRunJson, writeUtf8Json } from "../astGrep/artifact";
import { parseAstGrepHydrateArgv } from "../astGrep/command";
import { runAstGrepScan } from "../astGrep/runner";
import type { AstGrepCliOptions } from "../astGrep/types";
import {
  EXIT_AST_GREP_MISSING,
  EXIT_INVALID_ARGS,
  EXIT_OK,
  EXIT_PARTIAL,
  EXIT_SCAN_FAILED,
} from "../astGrep/types";
import { formatAstMatchesExcerptJson } from "./astRefinementExcerpt";
import { buildIntentHydration, writeIntentHydration } from "./buildIntentHydration";
import {
  buildConflictHunkExcerpts,
  conflictHunkExcerptsToPromptJson,
  mergeBranchHintsFromRegions,
  type ConflictHunkExcerptsArtifactV1,
} from "./conflictHunkExcerpt";
import { evaluateConflictGate } from "./conflictGate";
import { scanRepoConflictMarkers, writeConflictContext, type ConflictContextArtifactV1 } from "./conflictScan";
import { HYDRATE_PHASE_ALL, HYDRATE_PHASE_LEVEL } from "./hydrationPhase";
import { resolveHydrationConfig, type ResolvedHydrationConfig } from "./hydrationConfig";
import { resolveIntentBootstrap, writeIntentBootstrap } from "./intentBootstrap";
import { repoStructureExcerpt, summarizeRepoStructure, writeRepoStructure } from "./repoStructure";
import {
  runPostRetrievalQuestionRefinement,
  runQuestionRefinement,
  writePostRetrievalRefinement,
  writeQuestionRefinement,
} from "./questionRefinement";
import type { PostRetrievalRefinementArtifactV1, QuestionRefinementArtifactV1 } from "./questionRefinement";

export type HydrateCliOptions = {
  repoRoot: string;
  outDir: string;
  hydrationConfigPath: string;
  leftIntent: string;
  rightIntent: string;
  intentPair: string;
  intentProfile: string;
  questionModeCli?: "off" | "improver" | "subquestions";
  strictLlm: boolean;
  llmModel: string;
  llmBaseUrl: string;
  openaiApiKeyEnv: string;
  enableRetrieval: boolean;
  retrievalBackend: "memory" | "chroma";
  retrievalHybridRegex: string;
  retrievalSymbolBoost: string;
  enableCodeWalk: boolean;
  enableCodeWalkAgent: boolean;
  /** Multi-turn tool loop over retrieval index (requires retrieval + LLM credentials). */
  enableCodeWalkSearchAgent: boolean;
  /** Natural-language query for @-command / orchestration parity (recorded in run inputs). */
  userQuery: string;
  followUp: string;
  priorRunPath: string;
  /** Inclusive max milestone; `HYDRATE_PHASE_ALL` = full pipeline. */
  hydratePhaseMax: number;
  forcePriorRun: boolean;
  sourcePriority: "default" | "ast-first" | "retrieval-first";
  /** Optional path for tonic-memory-vector-index snapshot (memory retrieval only). */
  vectorCachePath: string;
  /** `off` | `read` | `write` | `readwrite` — empty uses env or default when path set. */
  vectorCacheMode: string;
  astArgv: string[];
  env: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
};

export type PipelineStage = {
  id: string;
  status: "ok" | "skipped" | "partial" | "failed";
  artifact_path?: string | null;
  started_at?: string;
  finished_at?: string;
  errors?: Array<Record<string, unknown>>;
};

function pathsFor(outDir: string) {
  const d = path.resolve(outDir);
  return {
    intentBootstrap: path.join(d, "intent-bootstrap.json"),
    questionRefinement: path.join(d, "question-refinement.json"),
    questionRefinementPass1: path.join(d, "question-refinement.pass1.v1.json"),
    questionRefinementPass2: path.join(d, "question-refinement.pass2.v1.json"),
    questionRefinementPostRetrieval: path.join(d, "question-refinement.post-retrieval.v1.json"),
    repoStructure: path.join(d, "repo-structure.json"),
    conflictContext: path.join(d, "conflict-context.json"),
    conflictHunkExcerpts: path.join(d, "conflict-hunk-excerpts.json"),
    astHydration: path.join(d, "ast-hydration.json"),
    retrieval: path.join(d, "retrieval-hydration.json"),
    codeWalk: path.join(d, "code-walk-trace.json"),
    intentHydration: path.join(d, "intent-hydration.json"),
    run: path.join(d, "hydration-run.json"),
  };
}

async function runRefinementPassRich(
  cfg: ResolvedHydrationConfig,
  mode: "off" | "improver" | "subquestions",
  ctx: {
    left: string;
    right: string;
    conflictJson: string;
    repoExcerpt: string;
    env: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
    priorPhasesDigest?: string;
    priorRefinementPassLabel: string;
    userQuery: string;
    followUp: string;
    conflictHunksExcerptJson: string;
    astMatchesExcerptJson: string;
    retrievalHitsPreR1Json: string;
    retrievalHitsPass2Json?: string;
    repoHeadShort: string;
    mergeBranchHints: string;
  },
): Promise<
  | { ok: true; artifact: QuestionRefinementArtifactV1; skippedLlm: boolean; warning?: string }
  | { ok: false; message: string; code: 11 }
> {
  const r = await runQuestionRefinement({
    mode,
    config: cfg,
    leftIntent: ctx.left,
    rightIntent: ctx.right,
    conflictRegionsJson: ctx.conflictJson,
    repoStructureExcerpt: ctx.repoExcerpt,
    priorPhasesDigest: ctx.priorPhasesDigest ?? "",
    priorRefinementPassLabel: ctx.priorRefinementPassLabel,
    userQuery: ctx.userQuery,
    followUp: ctx.followUp,
    conflictHunksExcerptJson: ctx.conflictHunksExcerptJson,
    astMatchesExcerptJson: ctx.astMatchesExcerptJson,
    retrievalHitsPreR1Json: ctx.retrievalHitsPreR1Json,
    retrievalHitsPass2Json: ctx.retrievalHitsPass2Json ?? "[]",
    repoHeadShort: ctx.repoHeadShort,
    mergeBranchHints: ctx.mergeBranchHints,
    env: ctx.env,
    fetchImpl: ctx.fetchImpl,
  });
  if (r.kind === "fail") {
    return { ok: false, message: r.message, code: r.code };
  }
  return {
    ok: true,
    artifact: r.artifact,
    skippedLlm: r.skippedLlm,
    warning: r.warning,
  };
}

function readRepoHead(repoRoot: string): string | null {
  try {
    const o = execSync("git rev-parse HEAD", {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return o || null;
  } catch {
    return null;
  }
}

function resolveArtifactPathFromRunFile(runFileAbs: string, rel: string | null | undefined): string | null {
  if (rel == null) {
    return null;
  }
  const t = String(rel).trim();
  if (!t) {
    return null;
  }
  if (path.isAbsolute(t)) {
    return t;
  }
  return path.resolve(path.dirname(runFileAbs), t);
}

function hashRulesetFile(repoRoot: string, ruleset: string): string | null {
  if (!ruleset || ruleset === "default") {
    return null;
  }
  const rp = path.isAbsolute(ruleset) ? ruleset : path.resolve(repoRoot, ruleset);
  try {
    return crypto.createHash("sha256").update(fs.readFileSync(rp)).digest("hex");
  } catch {
    return null;
  }
}

type LoadedPriorRun = {
  fileAbs: string;
  doc: import("../astGrep/types").HydrationRunArtifactV1;
  resolved: {
    ast: string | null;
    retrieval: string | null;
    code_walk: string | null;
  };
};

function pushSkippedHydrateStages(
  pushStage: (s: PipelineStage) => void,
  ids: readonly string[],
): void {
  for (const id of ids) {
    const st = new Date().toISOString();
    pushStage({
      id,
      status: "skipped",
      artifact_path: null,
      started_at: st,
      finished_at: st,
    });
  }
}

function writeHydrationRunEnvelope(
  p: ReturnType<typeof pathsFor>,
  args: {
    runId: string;
    exitCode: number;
    errors: Array<{ code: string; message: string; detail?: string }>;
    warnings: Array<{ code: string; message: string; detail?: string }>;
    stages: PipelineStage[];
    runInputs: () => Record<string, unknown>;
    t0: number;
    astEvidencePath: string | null;
    sourceConfig: Record<string, unknown>;
    pathPatch: Partial<{
      intent_bootstrap_path: string | null;
      question_refinement_path: string | null;
      conflict_context_path: string | null;
      repo_structure_path: string | null;
      retrieval_path: string | null;
      code_walk_trace_path: string | null;
      intent_hydration_path: string | null;
    }>;
    priorRunPath: string | null;
  },
): void {
  const status =
    args.exitCode === EXIT_OK ? "ok" : args.exitCode === EXIT_PARTIAL ? "partial" : "failed";
  writeUtf8Json(
    p.run,
    buildRunJson({
      runId: args.runId,
      status,
      exitCode: args.exitCode,
      errors: args.errors,
      warnings: args.warnings,
      inputs: args.runInputs(),
      timingMs: Date.now() - args.t0,
      astEvidencePath: args.astEvidencePath,
      pipeline: { stages: args.stages, source_config: args.sourceConfig },
    }),
  );
  const runObj = JSON.parse(fs.readFileSync(p.run, "utf8")) as import("../astGrep/types").HydrationRunArtifactV1;
  runObj.intent_bootstrap_path = args.pathPatch.intent_bootstrap_path ?? null;
  runObj.question_refinement_path = args.pathPatch.question_refinement_path ?? null;
  runObj.conflict_context_path = args.pathPatch.conflict_context_path ?? null;
  runObj.repo_structure_path = args.pathPatch.repo_structure_path ?? null;
  runObj.retrieval_path = args.pathPatch.retrieval_path ?? null;
  runObj.code_walk_trace_path = args.pathPatch.code_walk_trace_path ?? null;
  runObj.intent_hydration_path = args.pathPatch.intent_hydration_path ?? null;
  runObj.prior_run_path = args.priorRunPath;
  writeUtf8Json(p.run, runObj);
}

export async function runHydrationPipeline(opts: HydrateCliOptions): Promise<number> {
  const t0 = Date.now();
  const runId = crypto.randomUUID();
  const p = pathsFor(opts.outDir);
  const stages: PipelineStage[] = [];
  const warnings: Array<{ code: string; message: string; detail?: string }> = [];
  const errors: Array<{ code: string; message: string; detail?: string }> = [];

  const cfg = resolveHydrationConfig(opts.hydrationConfigPath || undefined, opts.env, {
    questionMode: opts.questionModeCli,
    strictLlm: opts.strictLlm,
    llmModel: opts.llmModel || undefined,
    llmBaseUrl: opts.llmBaseUrl || undefined,
    openaiApiKeyEnv: opts.openaiApiKeyEnv || undefined,
  });

  const repoHead = readRepoHead(opts.repoRoot);
  let loadedPrior: LoadedPriorRun | null = null;
  const priorTrim = opts.priorRunPath.trim();
  if (priorTrim) {
    const pr = path.isAbsolute(priorTrim) ? priorTrim : path.resolve(opts.repoRoot, priorTrim);
    if (!fs.existsSync(pr)) {
      console.error(`merge-tonic hydrate: --prior-run file not found: ${pr}`);
      return EXIT_INVALID_ARGS;
    }
    try {
      const doc = JSON.parse(fs.readFileSync(pr, "utf8")) as import("../astGrep/types").HydrationRunArtifactV1;
      loadedPrior = {
        fileAbs: pr,
        doc,
        resolved: {
          ast: resolveArtifactPathFromRunFile(pr, doc.ast_evidence_path ?? null),
          retrieval: resolveArtifactPathFromRunFile(pr, doc.retrieval_path ?? null),
          code_walk: resolveArtifactPathFromRunFile(pr, doc.code_walk_trace_path ?? null),
        },
      };
      const prior = doc;
      const pRepo = typeof prior.inputs?.repo === "string" ? prior.inputs.repo.replace(/\\/g, "/") : "";
      const cur = path.resolve(opts.repoRoot).replace(/\\/g, "/");
      if (pRepo && pRepo !== cur) {
        if (!opts.forcePriorRun) {
          console.error(
            "merge-tonic hydrate: prior run repo mismatch; use --force-prior to override.\n  prior:",
            pRepo,
            "\n  current:",
            cur,
          );
          return EXIT_INVALID_ARGS;
        }
        warnings.push({
          code: "prior_run_repo_mismatch",
          message: `prior run repo overridden (${pRepo} vs ${cur})`,
        });
      }
      const pHead = typeof prior.inputs?.repo_head === "string" ? prior.inputs.repo_head.trim() : "";
      if (pHead && repoHead && pHead !== repoHead && !opts.forcePriorRun) {
        console.error(
          "merge-tonic hydrate: prior run repo_head mismatch; use --force-prior.\n  prior:",
          pHead,
          "\n  current:",
          repoHead,
        );
        return EXIT_INVALID_ARGS;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`merge-tonic hydrate: invalid --prior-run JSON: ${msg}`);
      return EXIT_INVALID_ARGS;
    }
  }

  const astParsed = parseAstGrepHydrateArgv(["--repo", opts.repoRoot, ...opts.astArgv]);
  if (!astParsed.ok) {
    console.error(astParsed.message);
    return EXIT_INVALID_ARGS;
  }
  let astOpts: AstGrepCliOptions = astParsed.opts;
  if (!astOpts.outPath || astOpts.outPath === path.join(opts.repoRoot, ".tonic", "ast-hydration.json")) {
    astOpts = { ...astOpts, outPath: p.astHydration, runOutPath: p.run };
  } else {
    astOpts = { ...astOpts, outPath: p.astHydration };
  }

  const rulesetHash = hashRulesetFile(opts.repoRoot, astOpts.ruleset);
  if (loadedPrior && rulesetHash) {
    const ins = loadedPrior.doc.inputs as Record<string, unknown> | undefined;
    const priorRh = typeof ins?.ruleset_hash === "string" ? ins.ruleset_hash.trim() : "";
    if (priorRh && priorRh !== rulesetHash) {
      if (!opts.forcePriorRun) {
        console.error(
          "merge-tonic hydrate: prior run ruleset_hash mismatch; use --force-prior to override.\n  prior:",
          priorRh,
          "\n  current:",
          rulesetHash,
        );
        return EXIT_INVALID_ARGS;
      }
      warnings.push({
        code: "prior_run_ruleset_mismatch",
        message: "ruleset fingerprint differed from prior run; continuing due to --force-prior",
      });
    }
  }

  let exitCode = EXIT_OK;
  const px = opts.hydratePhaseMax;
  const envRb = (opts.env.TONIC_RETRIEVAL_BACKEND ?? "").trim();
  const effBackendStr = (envRb || opts.retrievalBackend || "memory").trim().toLowerCase();
  const effRetrievalBackend: "memory" | "chroma" = effBackendStr === "chroma" ? "chroma" : "memory";
  const mkSourceConfig = (): Record<string, unknown> => ({
    retrieval: opts.enableRetrieval,
    retrieval_backend: effBackendStr,
    code_walk: opts.enableCodeWalk,
    code_walk_agent: opts.enableCodeWalkAgent,
    code_walk_search_agent: opts.enableCodeWalkSearchAgent,
    source_priority: opts.sourcePriority,
  });

  const pushStage = (s: PipelineStage) => {
    stages.push(s);
  };

  let conflictGateExtra: Record<string, unknown> = {};
  let questionRefinementChain: Array<{ pass_id: string; path: string }> = [];
  let postRetrievalArt: PostRetrievalRefinementArtifactV1 | null = null;
  const runInputs = (): Record<string, unknown> => ({
    repo: opts.repoRoot,
    out_dir: opts.outDir,
    prior_run: opts.priorRunPath || null,
    repo_head: repoHead,
    ruleset_hash: rulesetHash,
    user_query: opts.userQuery?.trim() || null,
    follow_up: opts.followUp?.trim() || null,
    ...conflictGateExtra,
  });

  const emptyConflict: ConflictContextArtifactV1 = {
    schema: "tonic-conflict-context",
    version: "1",
    scan_scope: "workspace",
    conflict_regions: [],
  };

  let conflictArt: ConflictContextArtifactV1 = emptyConflict;
  const skipConflictScan = (opts.env.TONIC_SKIP_CONFLICT_SCAN ?? "").trim() === "1";
  let conflictHunkStored: ConflictHunkExcerptsArtifactV1 | null = null;

  if (px >= HYDRATE_PHASE_LEVEL.conflicts) {
    const st = new Date().toISOString();
    if (skipConflictScan) {
      conflictArt = { ...emptyConflict, scan_scope: "skipped" };
      writeConflictContext(p.conflictContext, conflictArt);
      pushStage({
        id: "conflicts",
        status: "skipped",
        artifact_path: p.conflictContext.replace(/\\/g, "/"),
        started_at: st,
        finished_at: new Date().toISOString(),
      });
    } else {
      conflictArt = scanRepoConflictMarkers(opts.repoRoot);
      writeConflictContext(p.conflictContext, conflictArt);
      pushStage({
        id: "conflicts",
        status: "ok",
        artifact_path: p.conflictContext.replace(/\\/g, "/"),
        started_at: st,
        finished_at: new Date().toISOString(),
      });
      const gate = evaluateConflictGate(opts.env, conflictArt.conflict_regions.length);
      conflictGateExtra = { conflict_gate: gate.outcome };
      const hArt0 = buildConflictHunkExcerpts(opts.repoRoot, conflictArt, opts.env);
      conflictHunkStored = hArt0;
      writeUtf8Json(p.conflictHunkExcerpts, hArt0);
      if (gate.shouldStop) {
        warnings.push({
          code: "conflict_gate_stop",
          message: gate.outcome.stop_reason ?? "conflict gate",
        });
        exitCode = gate.exitCode;
        pushSkippedHydrateStages(pushStage, [
          "intent_bootstrap",
          "repo_structure",
          "question_refinement",
          "ast_grep",
          "retrieval",
          "code_walk",
          "intent_bundle",
        ]);
        writeHydrationRunEnvelope(p, {
          runId,
          exitCode,
          errors,
          warnings,
          stages,
          runInputs,
          t0,
          astEvidencePath: null,
          sourceConfig: mkSourceConfig(),
          pathPatch: { conflict_context_path: p.conflictContext.replace(/\\/g, "/") },
          priorRunPath: opts.priorRunPath ? opts.priorRunPath.replace(/\\/g, "/") : null,
        });
        return exitCode;
      }
    }
  }

  if (skipConflictScan) {
    const hArt1 = buildConflictHunkExcerpts(opts.repoRoot, conflictArt, opts.env);
    conflictHunkStored = hArt1;
    writeUtf8Json(p.conflictHunkExcerpts, hArt1);
  }

  if (px < HYDRATE_PHASE_LEVEL.intent_bootstrap) {
    pushSkippedHydrateStages(pushStage, [
      "intent_bootstrap",
      "repo_structure",
      "question_refinement",
      "ast_grep",
      "retrieval",
      "code_walk",
      "intent_bundle",
    ]);
    writeHydrationRunEnvelope(p, {
      runId,
      exitCode,
      errors,
      warnings,
      stages,
      runInputs,
      t0,
      astEvidencePath: null,
      sourceConfig: mkSourceConfig(),
      pathPatch: { conflict_context_path: p.conflictContext.replace(/\\/g, "/") },
      priorRunPath: opts.priorRunPath ? opts.priorRunPath.replace(/\\/g, "/") : null,
    });
    return exitCode;
  }

  // intent_bootstrap
  {
    const st = new Date().toISOString();
    try {
      const boot = resolveIntentBootstrap({
        repoRoot: opts.repoRoot,
        leftIntentFlag: opts.leftIntent || undefined,
        rightIntentFlag: opts.rightIntent || undefined,
        intentPair: opts.intentPair || undefined,
        intentProfilePath: opts.intentProfile || undefined,
        env: opts.env,
        userQuery: opts.userQuery,
        followUp: opts.followUp,
      });
      writeIntentBootstrap(p.intentBootstrap, boot);
      pushStage({
        id: "intent_bootstrap",
        status: "ok",
        artifact_path: p.intentBootstrap.replace(/\\/g, "/"),
        started_at: st,
        finished_at: new Date().toISOString(),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ code: "intent_bootstrap", message: msg });
      pushStage({
        id: "intent_bootstrap",
        status: "failed",
        started_at: st,
        finished_at: new Date().toISOString(),
        errors: [{ message: msg }],
      });
      writeUtf8Json(
        p.run,
        buildRunJson({
          runId,
          status: "failed",
          exitCode: EXIT_INVALID_ARGS,
          errors,
          warnings,
          inputs: runInputs(),
          timingMs: Date.now() - t0,
          astEvidencePath: null,
          pipeline: { stages, source_config: mkSourceConfig() },
        }),
      );
      return EXIT_INVALID_ARGS;
    }
  }

  if (px < HYDRATE_PHASE_LEVEL.repo_structure) {
    pushSkippedHydrateStages(pushStage, [
      "repo_structure",
      "question_refinement",
      "ast_grep",
      "retrieval",
      "code_walk",
      "intent_bundle",
    ]);
    writeHydrationRunEnvelope(p, {
      runId,
      exitCode,
      errors,
      warnings,
      stages,
      runInputs,
      t0,
      astEvidencePath: null,
      sourceConfig: mkSourceConfig(),
      pathPatch: {
        intent_bootstrap_path: p.intentBootstrap.replace(/\\/g, "/"),
        conflict_context_path: p.conflictContext.replace(/\\/g, "/"),
      },
      priorRunPath: opts.priorRunPath ? opts.priorRunPath.replace(/\\/g, "/") : null,
    });
    return exitCode;
  }

  const bootArtifact = JSON.parse(fs.readFileSync(p.intentBootstrap, "utf8")) as import("./intentBootstrap").IntentBootstrapArtifactV1;

  const rsArt = summarizeRepoStructure(opts.repoRoot);
  const repoExcerpt = repoStructureExcerpt(rsArt);

  writeRepoStructure(p.repoStructure, rsArt);
  {
    const st = new Date().toISOString();
    pushStage({
      id: "repo_structure",
      status: "ok",
      artifact_path: p.repoStructure.replace(/\\/g, "/"),
      started_at: st,
      finished_at: new Date().toISOString(),
    });
  }

  if (px < HYDRATE_PHASE_LEVEL.ast_grep) {
    pushSkippedHydrateStages(pushStage, ["question_refinement", "ast_grep", "retrieval", "code_walk", "intent_bundle"]);
    writeHydrationRunEnvelope(p, {
      runId,
      exitCode,
      errors,
      warnings,
      stages,
      runInputs,
      t0,
      astEvidencePath: null,
      sourceConfig: mkSourceConfig(),
      pathPatch: {
        intent_bootstrap_path: p.intentBootstrap.replace(/\\/g, "/"),
        conflict_context_path: p.conflictContext.replace(/\\/g, "/"),
        repo_structure_path: p.repoStructure.replace(/\\/g, "/"),
      },
      priorRunPath: opts.priorRunPath ? opts.priorRunPath.replace(/\\/g, "/") : null,
    });
    return exitCode;
  }

  let astResult = runAstGrepScan(astOpts);
  {
    const st = new Date().toISOString();
    if (astResult.kind === "missing_binary") {
      errors.push({ code: "ast_grep_missing", message: astResult.message });
      pushStage({
        id: "ast_grep",
        status: "failed",
        started_at: st,
        finished_at: new Date().toISOString(),
      });
      writeUtf8Json(
        p.run,
        buildRunJson({
          runId,
          status: "failed",
          exitCode: EXIT_AST_GREP_MISSING,
          errors,
          warnings,
          inputs: runInputs(),
          timingMs: Date.now() - t0,
          astEvidencePath: null,
          pipeline: { stages, source_config: mkSourceConfig() },
        }),
      );
      return EXIT_AST_GREP_MISSING;
    }
    if (astResult.kind === "invalid_args") {
      errors.push({ code: "invalid_args", message: astResult.message });
      pushStage({ id: "ast_grep", status: "failed", started_at: st, finished_at: new Date().toISOString() });
      writeUtf8Json(
        p.run,
        buildRunJson({
          runId,
          status: "failed",
          exitCode: EXIT_INVALID_ARGS,
          errors,
          warnings,
          inputs: runInputs(),
          timingMs: Date.now() - t0,
          astEvidencePath: null,
          pipeline: { stages, source_config: mkSourceConfig() },
        }),
      );
      return EXIT_INVALID_ARGS;
    }
    if (astResult.kind === "exec_failed" || astResult.kind === "parse_failed") {
      const msg =
        astResult.kind === "exec_failed"
          ? `ast-grep exited ${astResult.code ?? "?"}`
          : astResult.message;
      errors.push({
        code: "scan_failed",
        message: msg,
        detail: astResult.kind === "exec_failed" ? astResult.stderr : undefined,
      });
      pushStage({ id: "ast_grep", status: "failed", started_at: st, finished_at: new Date().toISOString() });
      writeUtf8Json(
        p.run,
        buildRunJson({
          runId,
          status: "failed",
          exitCode: EXIT_SCAN_FAILED,
          errors,
          warnings,
          inputs: runInputs(),
          timingMs: Date.now() - t0,
          astEvidencePath: null,
          pipeline: { stages, source_config: mkSourceConfig() },
        }),
      );
      return EXIT_SCAN_FAILED;
    }
    warnings.push(...astResult.warnings);
    if (astResult.truncated || astResult.warnings.length > 0) {
      exitCode = EXIT_PARTIAL;
    }
    const langs =
      astOpts.languages.trim().toLowerCase() === "auto" || !astOpts.languages.trim()
        ? ["auto"]
        : astOpts.languages
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
    const ast = buildAstHydrationJson({
      repoRoot: opts.repoRoot,
      ruleset: astOpts.ruleset,
      languages: langs,
      scanScope: astOpts.changedOnly ? "changed-only" : "full",
      toolVersion: astResult.toolVersion,
      matches: astResult.matches,
      truncated: astResult.truncated,
    });
    writeUtf8Json(p.astHydration, ast);
    pushStage({
      id: "ast_grep",
      status: astResult.truncated || astResult.warnings.length ? "partial" : "ok",
      artifact_path: p.astHydration.replace(/\\/g, "/"),
      started_at: st,
      finished_at: new Date().toISOString(),
    });
  }

  const astRead = JSON.parse(fs.readFileSync(p.astHydration, "utf8")) as import("../astGrep/types").AstHydrationArtifactV1;

  if (px < HYDRATE_PHASE_LEVEL.question_refinement) {
    pushSkippedHydrateStages(pushStage, ["question_refinement", "retrieval", "code_walk", "intent_bundle"]);
    writeHydrationRunEnvelope(p, {
      runId,
      exitCode,
      errors,
      warnings,
      stages,
      runInputs,
      t0,
      astEvidencePath: p.astHydration.replace(/\\/g, "/"),
      sourceConfig: mkSourceConfig(),
      pathPatch: {
        intent_bootstrap_path: p.intentBootstrap.replace(/\\/g, "/"),
        conflict_context_path: p.conflictContext.replace(/\\/g, "/"),
        repo_structure_path: p.repoStructure.replace(/\\/g, "/"),
      },
      priorRunPath: opts.priorRunPath ? opts.priorRunPath.replace(/\\/g, "/") : null,
    });
    return exitCode;
  }

  const hunkArt = conflictHunkStored ?? buildConflictHunkExcerpts(opts.repoRoot, conflictArt, opts.env);
  const hunkJson = conflictHunkExcerptsToPromptJson(hunkArt);
  const astExcerptJson = formatAstMatchesExcerptJson(astRead, opts.env);
  const repoHeadShort = (repoHead ?? "").trim().slice(0, 7);
  const mergeHints = mergeBranchHintsFromRegions(conflictArt.conflict_regions);
  const conflictJson = JSON.stringify(conflictArt.conflict_regions);

  let preR1Hits: RetrievalHit[] = [];
  const skipPreR1 = (opts.env.TONIC_SKIP_PRE_R1_RETRIEVAL ?? "").trim() === "1";
  const preR1TopK =
    Math.max(1, parseInt(opts.env.TONIC_PRE_R1_RETRIEVAL_TOPK ?? "", 10) || 6);
  if (opts.enableRetrieval && !skipPreR1) {
    const ch = await import("@mergetonic/coding-hydration");
    const { runRetrievalForHydrate, applyRetrievalHybridStage } = ch;
    const intentQ = `${bootArtifact.left_intent} ${bootArtifact.right_intent}`;
    const queries: string[] = [intentQ];
    for (const r of conflictArt.conflict_regions.slice(0, 12)) {
      queries.push(`merge conflict ${r.path}`);
    }
    const vectorCacheWarnings: Array<{ code: string; message: string }> = [];
    try {
      preR1Hits = await runRetrievalForHydrate({
        repoRoot: opts.repoRoot,
        matches: astRead.matches,
        queries,
        topKPerQuery: preR1TopK,
        conflictRegions: conflictArt.conflict_regions,
        retrievalBackend: effRetrievalBackend,
        env: opts.env,
        fetchImpl: opts.fetchImpl,
        vectorCachePath: opts.vectorCachePath.trim() || undefined,
        vectorCacheMode: opts.vectorCacheMode.trim() || undefined,
        vectorCacheDiagnostics: {
          ruleset_hash: rulesetHash || undefined,
          repo_head: repoHead || undefined,
        },
        vectorCacheWarningsOut: vectorCacheWarnings,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      warnings.push({ code: "retrieval_pre_r1_failed", message: msg.slice(0, 500) });
      if (exitCode === EXIT_OK) {
        exitCode = EXIT_PARTIAL;
      }
    }
    for (const w of vectorCacheWarnings) {
      warnings.push({ code: w.code, message: w.message });
    }
    const hybridRe =
      (opts.retrievalHybridRegex || opts.env.TONIC_RETRIEVAL_HYBRID_REGEX || "").trim() || undefined;
    const hybridSym =
      (opts.retrievalSymbolBoost || opts.env.TONIC_RETRIEVAL_SYMBOL || "").trim() || undefined;
    if (hybridRe || hybridSym) {
      preR1Hits = applyRetrievalHybridStage({
        denseHits: preR1Hits,
        regexPattern: hybridRe,
        symbolFilter: hybridSym,
      });
    }
  }

  const preR1Slice = preR1Hits.slice(0, 24).map((h) => ({
    chunk_id: h.chunk_id,
    score: h.score,
    text: (h.text ?? "").slice(0, 400),
    metadata: h.metadata,
  }));
  const preR1Json = JSON.stringify(preR1Slice, null, 2);

  let questionArt: QuestionRefinementArtifactV1 | null = null;
  const refinementMode = cfg.questionMode;

  const richCtx = {
    conflictJson,
    repoExcerpt,
    env: opts.env,
    fetchImpl: opts.fetchImpl,
    userQuery: opts.userQuery ?? "",
    followUp: opts.followUp ?? "",
    conflictHunksExcerptJson: hunkJson,
    astMatchesExcerptJson: astExcerptJson,
    retrievalHitsPreR1Json: preR1Json,
    repoHeadShort,
    mergeBranchHints: mergeHints,
    retrievalHitsPass2Json: "[]",
  };

  if (refinementMode !== "off") {
    const st = new Date().toISOString();
    const r1 = await runRefinementPassRich(cfg, refinementMode, {
      left: bootArtifact.left_intent,
      right: bootArtifact.right_intent,
      priorRefinementPassLabel: "pass1",
      priorPhasesDigest: "",
      ...richCtx,
    });
    if (!r1.ok) {
      errors.push({ code: "question_refinement", message: r1.message });
      pushStage({
        id: "question_refinement",
        status: "failed",
        started_at: st,
        finished_at: new Date().toISOString(),
      });
      writeUtf8Json(
        p.run,
        buildRunJson({
          runId,
          status: "failed",
          exitCode: r1.code,
          errors,
          warnings,
          inputs: runInputs(),
          timingMs: Date.now() - t0,
          astEvidencePath: p.astHydration.replace(/\\/g, "/"),
          pipeline: { stages, source_config: mkSourceConfig() },
        }),
      );
      return r1.code;
    }
    if (r1.warning) {
      warnings.push({ code: "llm_skipped", message: r1.warning });
      exitCode = EXIT_PARTIAL;
    }
    questionArt = r1.artifact;
    writeQuestionRefinement(p.questionRefinementPass1, questionArt);
    writeQuestionRefinement(p.questionRefinement, questionArt);
    questionRefinementChain.push({
      pass_id: "pass1",
      path: p.questionRefinementPass1.replace(/\\/g, "/"),
    });
    pushStage({
      id: "question_refinement",
      status: r1.skippedLlm ? "partial" : "ok",
      artifact_path: p.questionRefinement.replace(/\\/g, "/"),
      started_at: st,
      finished_at: new Date().toISOString(),
    });
  } else {
    const st = new Date().toISOString();
    const r0 = await runRefinementPassRich(cfg, "off", {
      left: bootArtifact.left_intent,
      right: bootArtifact.right_intent,
      priorRefinementPassLabel: "off",
      ...richCtx,
    });
    if (r0.ok) {
      questionArt = r0.artifact;
      writeQuestionRefinement(p.questionRefinementPass1, questionArt);
      writeQuestionRefinement(p.questionRefinement, questionArt);
      questionRefinementChain.push({
        pass_id: "pass1",
        path: p.questionRefinementPass1.replace(/\\/g, "/"),
      });
    }
    pushStage({
      id: "question_refinement",
      status: "ok",
      artifact_path: p.questionRefinement.replace(/\\/g, "/"),
      started_at: st,
      finished_at: new Date().toISOString(),
    });
  }

  let pass2RetrievalJson = "[]";
  let wroteQuestionRefinementPass2 = false;
  const skipR2Retrieval = (opts.env.TONIC_SKIP_R2_RETRIEVAL ?? "").trim() === "1";
  const r2TopK = Math.max(1, parseInt(opts.env.TONIC_R2_RETRIEVAL_TOPK ?? "", 10) || 8);
  if (
    cfg.refinementContext === "progressive" &&
    refinementMode !== "off" &&
    questionArt &&
    opts.enableRetrieval &&
    !skipR2Retrieval
  ) {
    const ch = await import("@mergetonic/coding-hydration");
    const { runRetrievalForHydrate, applyRetrievalHybridStage } = ch;
    const leftQ = questionArt.refined_left_intent ?? bootArtifact.left_intent;
    const rightQ = questionArt.refined_right_intent ?? bootArtifact.right_intent;
    const intentQ = `${leftQ} ${rightQ}`;
    const subQs = questionArt.subquestions?.map((s) => s.text) ?? [];
    const queries: string[] = [];
    if (opts.sourcePriority === "retrieval-first") {
      queries.push(intentQ);
      for (const t of subQs) {
        queries.push(t);
      }
    } else {
      for (const t of subQs) {
        queries.push(t);
      }
      queries.push(intentQ);
    }
    const vectorCacheWarningsR2: Array<{ code: string; message: string }> = [];
    try {
      let hits2 = await runRetrievalForHydrate({
        repoRoot: opts.repoRoot,
        matches: astRead.matches,
        queries,
        topKPerQuery: r2TopK,
        conflictRegions: conflictArt.conflict_regions,
        retrievalBackend: effRetrievalBackend,
        env: opts.env,
        fetchImpl: opts.fetchImpl,
        vectorCachePath: opts.vectorCachePath.trim() || undefined,
        vectorCacheMode: opts.vectorCacheMode.trim() || undefined,
        vectorCacheDiagnostics: {
          ruleset_hash: rulesetHash || undefined,
          repo_head: repoHead || undefined,
        },
        vectorCacheWarningsOut: vectorCacheWarningsR2,
      });
      for (const w of vectorCacheWarningsR2) {
        warnings.push({ code: w.code, message: w.message });
      }
      const hybridRe2 =
        (opts.retrievalHybridRegex || opts.env.TONIC_RETRIEVAL_HYBRID_REGEX || "").trim() || undefined;
      const hybridSym2 =
        (opts.retrievalSymbolBoost || opts.env.TONIC_RETRIEVAL_SYMBOL || "").trim() || undefined;
      if (hybridRe2 || hybridSym2) {
        hits2 = applyRetrievalHybridStage({
          denseHits: hits2,
          regexPattern: hybridRe2,
          symbolFilter: hybridSym2,
        });
      }
      const slice2 = hits2.slice(0, 24).map((h) => ({
        chunk_id: h.chunk_id,
        score: h.score,
        text: (h.text ?? "").slice(0, 400),
        metadata: h.metadata,
      }));
      pass2RetrievalJson = JSON.stringify(slice2, null, 2);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      warnings.push({ code: "retrieval_pass2_failed", message: msg.slice(0, 500) });
      if (exitCode === EXIT_OK) {
        exitCode = EXIT_PARTIAL;
      }
    }
  }

  if (cfg.refinementContext === "progressive" && refinementMode !== "off" && questionArt) {
    const st = new Date().toISOString();
    const left = questionArt.refined_left_intent ?? bootArtifact.left_intent;
    const right = questionArt.refined_right_intent ?? bootArtifact.right_intent;
    const priorDigest =
      questionArt.context_digest_sha256 ??
      (fs.existsSync(p.intentBootstrap)
        ? crypto.createHash("sha256").update(fs.readFileSync(p.intentBootstrap, "utf8")).digest("hex")
        : "");
    const r2 = await runRefinementPassRich(cfg, refinementMode, {
      left,
      right,
      priorRefinementPassLabel: "pass2",
      priorPhasesDigest: priorDigest,
      ...richCtx,
      retrievalHitsPass2Json: pass2RetrievalJson,
    });
    if (!r2.ok) {
      warnings.push({ code: "question_refinement_progressive", message: r2.message });
      pushStage({
        id: "question_refinement_pass2",
        status: "failed",
        started_at: st,
        finished_at: new Date().toISOString(),
      });
    } else {
      if (r2.warning) {
        warnings.push({ code: "llm_skipped", message: r2.warning });
        exitCode = EXIT_PARTIAL;
      }
      questionArt = r2.artifact;
      writeQuestionRefinement(p.questionRefinementPass2, questionArt);
      writeQuestionRefinement(p.questionRefinement, questionArt);
      wroteQuestionRefinementPass2 = true;
      questionRefinementChain.push({
        pass_id: "pass2",
        path: p.questionRefinementPass2.replace(/\\/g, "/"),
      });
      pushStage({
        id: "question_refinement_pass2",
        status: r2.skippedLlm ? "partial" : "ok",
        artifact_path: p.questionRefinementPass2.replace(/\\/g, "/"),
        started_at: st,
        finished_at: new Date().toISOString(),
      });
    }
  }

  let intentLeft = questionArt?.refined_left_intent ?? bootArtifact.left_intent;
  let intentRight = questionArt?.refined_right_intent ?? bootArtifact.right_intent;

  let retrievalPath: string | null = null;
  const retrievalHitsForIntent: RetrievalHit[] = [];
  if (px < HYDRATE_PHASE_LEVEL.retrieval) {
    const stSkip = new Date().toISOString();
    pushStage({
      id: "retrieval",
      status: "skipped",
      artifact_path: null,
      started_at: stSkip,
      finished_at: stSkip,
    });
  } else if (opts.enableRetrieval) {
    const st = new Date().toISOString();
    const ch = await import("@mergetonic/coding-hydration");
    const { buildEmptyRetrievalArtifact, runRetrievalForHydrate, applyRetrievalHybridStage } = ch;
    const intentQ = `${intentLeft} ${intentRight}`;
    const queries: string[] = [];
    const subQs = questionArt?.subquestions?.map((s) => s.text) ?? [];
    if (opts.sourcePriority === "retrieval-first") {
      queries.push(intentQ);
      for (const t of subQs) {
        queries.push(t);
      }
    } else {
      for (const t of subQs) {
        queries.push(t);
      }
      queries.push(intentQ);
    }
    let hits: RetrievalHit[] = [];
    const vectorCacheWarnings: Array<{ code: string; message: string }> = [];
    try {
      hits = await runRetrievalForHydrate({
        repoRoot: opts.repoRoot,
        matches: astRead.matches,
        queries,
        topKPerQuery: 8,
        conflictRegions: conflictArt.conflict_regions,
        retrievalBackend: effRetrievalBackend,
        env: opts.env,
        fetchImpl: opts.fetchImpl,
        vectorCachePath: opts.vectorCachePath.trim() || undefined,
        vectorCacheMode: opts.vectorCacheMode.trim() || undefined,
        vectorCacheDiagnostics: {
          ruleset_hash: rulesetHash || undefined,
          repo_head: repoHead || undefined,
        },
        vectorCacheWarningsOut: vectorCacheWarnings,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      warnings.push({
        code: "retrieval_failed",
        message: msg.slice(0, 500),
      });
      if (exitCode === EXIT_OK) {
        exitCode = EXIT_PARTIAL;
      }
    }
    for (const w of vectorCacheWarnings) {
      warnings.push({ code: w.code, message: w.message });
    }
    if (effRetrievalBackend === "chroma" && !(opts.env.TONIC_CHROMA_URL ?? "").trim()) {
      warnings.push({
        code: "retrieval_chroma_misconfigured",
        message: "retrieval_backend chroma but TONIC_CHROMA_URL unset",
      });
    }
    const hybridRe =
      (opts.retrievalHybridRegex || opts.env.TONIC_RETRIEVAL_HYBRID_REGEX || "").trim() || undefined;
    const hybridSym =
      (opts.retrievalSymbolBoost || opts.env.TONIC_RETRIEVAL_SYMBOL || "").trim() || undefined;
    if (hybridRe || hybridSym) {
      hits = applyRetrievalHybridStage({
        denseHits: hits,
        regexPattern: hybridRe,
        symbolFilter: hybridSym,
      });
    }
    retrievalHitsForIntent.push(...hits);
    const retrievalBody =
      hits.length > 0
        ? { schema: "tonic-retrieval-hydration" as const, version: "1" as const, hits }
        : buildEmptyRetrievalArtifact();
    if (hits.length === 0) {
      warnings.push({
        code: "retrieval_empty",
        message: "retrieval enabled but produced no hits (no indexable chunks or matches)",
      });
      if (exitCode === EXIT_OK) {
        exitCode = EXIT_PARTIAL;
      }
    }
    writeUtf8Json(p.retrieval, retrievalBody);
    retrievalPath = p.retrieval.replace(/\\/g, "/");
    pushStage({
      id: "retrieval",
      status: hits.length === 0 ? "partial" : "ok",
      artifact_path: retrievalPath,
      started_at: st,
      finished_at: new Date().toISOString(),
    });
  } else if (loadedPrior?.resolved.retrieval && fs.existsSync(loadedPrior.resolved.retrieval)) {
    const st = new Date().toISOString();
    try {
      const raw = fs.readFileSync(loadedPrior.resolved.retrieval, "utf8");
      const body = JSON.parse(raw) as { hits?: RetrievalHit[] };
      const hits = Array.isArray(body.hits) ? body.hits : [];
      retrievalHitsForIntent.push(...hits);
      fs.writeFileSync(p.retrieval, raw, "utf8");
      retrievalPath = p.retrieval.replace(/\\/g, "/");
      warnings.push({
        code: "prior_run_retrieval_chained",
        message: "Reused retrieval-hydration artifact paths from --prior-run (retrieval not enabled on this run).",
      });
      pushStage({
        id: "retrieval",
        status: hits.length === 0 ? "partial" : "ok",
        artifact_path: retrievalPath,
        started_at: st,
        finished_at: new Date().toISOString(),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      warnings.push({ code: "prior_run_retrieval_chain_failed", message: msg.slice(0, 400) });
      const st2 = new Date().toISOString();
      pushStage({
        id: "retrieval",
        status: "skipped",
        artifact_path: null,
        started_at: st2,
        finished_at: st2,
      });
    }
  } else {
    const stSkip = new Date().toISOString();
    pushStage({
      id: "retrieval",
      status: "skipped",
      artifact_path: null,
      started_at: stSkip,
      finished_at: stSkip,
    });
  }

  if (
    (opts.env.TONIC_POST_RETRIEVAL_REFINEMENT ?? "").trim() === "1" &&
    retrievalHitsForIntent.length > 0 &&
    cfg.questionMode === "improver" &&
    questionArt
  ) {
    const stPr = new Date().toISOString();
    const retrievalJson = JSON.stringify(
      retrievalHitsForIntent.slice(0, 20).map((h) => ({
        chunk_id: h.chunk_id,
        score: h.score,
        metadata: h.metadata,
        text: (h.text ?? "").slice(0, 400),
      })),
      null,
      2,
    );
    const pr = await runPostRetrievalQuestionRefinement({
      config: cfg,
      leftIntent: questionArt.refined_left_intent ?? intentLeft,
      rightIntent: questionArt.refined_right_intent ?? intentRight,
      conflictRegionsJson: conflictJson,
      repoStructureExcerpt: repoExcerpt,
      retrievalHitsJson: retrievalJson,
      userQuery: opts.userQuery,
      followUp: opts.followUp,
      env: opts.env,
      fetchImpl: opts.fetchImpl,
    });
    if (pr.kind === "fail") {
      warnings.push({ code: "post_retrieval_refinement", message: pr.message });
      pushStage({
        id: "question_refinement_post_retrieval",
        status: "failed",
        started_at: stPr,
        finished_at: new Date().toISOString(),
      });
    } else {
      if (pr.warning) {
        warnings.push({ code: "llm_skipped", message: pr.warning });
        exitCode = EXIT_PARTIAL;
      }
      postRetrievalArt = pr.artifact;
      writePostRetrievalRefinement(p.questionRefinementPostRetrieval, postRetrievalArt);
      questionRefinementChain.push({
        pass_id: "post_retrieval",
        path: p.questionRefinementPostRetrieval.replace(/\\/g, "/"),
      });
      if (
        !pr.skippedLlm &&
        postRetrievalArt.refined_left_intent &&
        postRetrievalArt.refined_right_intent &&
        questionArt
      ) {
        questionArt = {
          ...questionArt,
          refined_left_intent: postRetrievalArt.refined_left_intent,
          refined_right_intent: postRetrievalArt.refined_right_intent,
          merge_goals: postRetrievalArt.merge_goals ?? questionArt.merge_goals,
          assumptions: postRetrievalArt.assumptions ?? questionArt.assumptions,
        };
        writeQuestionRefinement(p.questionRefinement, questionArt);
        if (wroteQuestionRefinementPass2) {
          writeQuestionRefinement(p.questionRefinementPass2, questionArt);
        }
      }
      pushStage({
        id: "question_refinement_post_retrieval",
        status: pr.skippedLlm ? "partial" : "ok",
        artifact_path: p.questionRefinementPostRetrieval.replace(/\\/g, "/"),
        started_at: stPr,
        finished_at: new Date().toISOString(),
      });
    }
  }

  intentLeft = questionArt?.refined_left_intent ?? bootArtifact.left_intent;
  intentRight = questionArt?.refined_right_intent ?? bootArtifact.right_intent;

  let codeWalkTracePath: string | null = null;
  if (px < HYDRATE_PHASE_LEVEL.code_walk) {
    const stSkip = new Date().toISOString();
    pushStage({
      id: "code_walk",
      status: "skipped",
      artifact_path: null,
      started_at: stSkip,
      finished_at: stSkip,
    });
  } else if (opts.enableCodeWalk) {
    const st = new Date().toISOString();
    const { buildBatchCodeWalkTrace, enrichCodeWalkTraceWithLlmReflection } = await import(
      "@mergetonic/coding-hydration"
    );
    let trace = buildBatchCodeWalkTrace({
      retrievalHits: retrievalHitsForIntent,
      conflictRegionCount: conflictArt.conflict_regions.length,
      astMatchCount: astRead.matches.length,
    });
    if (opts.enableCodeWalkAgent) {
      trace = await enrichCodeWalkTraceWithLlmReflection(trace, {
        env: opts.env,
        fetchImpl: opts.fetchImpl,
        leftIntent: intentLeft,
        rightIntent: intentRight,
        retrievalHits: retrievalHitsForIntent,
      });
    }
    if (opts.enableCodeWalkSearchAgent && retrievalHitsForIntent.length > 0) {
      const {
        createMemoryVectorIndex,
        indexAstChunks,
        resolveEmbeddingProvider,
        runCodeSearchAgentTurns,
      } = await import("@mergetonic/coding-hydration");
      const apiKey = (opts.env.OPENAI_API_KEY ?? opts.env.TONIC_OPENAI_API_KEY ?? "").trim();
      const baseUrl = (opts.llmBaseUrl || opts.env.TONIC_LLM_BASE_URL || "https://api.openai.com/v1").replace(
        /\/$/,
        "",
      );
      const model = (opts.llmModel || opts.env.TONIC_LLM_MODEL || "gpt-4o-mini").trim();
      const baseLower = baseUrl.toLowerCase();
      const llmLocalhost =
        baseLower.includes("127.0.0.1") ||
        baseLower.includes("localhost") ||
        baseLower.includes("0.0.0.0");
      const allowDummyKey = opts.env.TONIC_LLM_ALLOW_DUMMY_KEY?.trim() === "1";
      const canRunAgentWithKey = Boolean(apiKey) || llmLocalhost || allowDummyKey;
      if (!canRunAgentWithKey) {
        trace = {
          ...trace,
          steps: [
            ...trace.steps,
            {
              tool: "code_search_agent",
              outcome: {
                insights: [
                  "Code-search agent skipped: set OPENAI_API_KEY, or point --llm-base-url at localhost/127.0.0.1, or set TONIC_LLM_ALLOW_DUMMY_KEY=1 for a private OpenAI-compatible server.",
                ],
                mode: "skipped_no_credentials",
              },
            },
          ],
        };
      } else {
        const embedder = resolveEmbeddingProvider(opts.env);
        const index = createMemoryVectorIndex();
        await indexAstChunks(opts.repoRoot, astRead.matches, index, embedder);
        const key = apiKey || "dummy";
        const agentSteps = await runCodeSearchAgentTurns({
          session: {
            repoRoot: opts.repoRoot,
            matches: astRead.matches,
            index,
            embedder,
          },
          maxTurns: Math.min(6, parseInt(opts.env.TONIC_CODE_SEARCH_MAX_TURNS ?? "3", 10) || 3),
          model,
          baseUrl,
          apiKey: key,
          fetchImpl: opts.fetchImpl,
          seedQuery: `${intentLeft} ${intentRight}`.slice(0, 400),
        });
        trace = {
          ...trace,
          steps: [...trace.steps, ...agentSteps.steps],
        };
      }
    }
    writeUtf8Json(p.codeWalk, trace);
    codeWalkTracePath = p.codeWalk.replace(/\\/g, "/");
    pushStage({
      id: "code_walk",
      status: "ok",
      artifact_path: codeWalkTracePath,
      started_at: st,
      finished_at: new Date().toISOString(),
    });
  } else if (loadedPrior?.resolved.code_walk && fs.existsSync(loadedPrior.resolved.code_walk)) {
    const st = new Date().toISOString();
    try {
      const raw = fs.readFileSync(loadedPrior.resolved.code_walk, "utf8");
      fs.writeFileSync(p.codeWalk, raw, "utf8");
      codeWalkTracePath = p.codeWalk.replace(/\\/g, "/");
      warnings.push({
        code: "prior_run_code_walk_chained",
        message: "Reused code-walk trace from --prior-run (code-walk not enabled on this run).",
      });
      pushStage({
        id: "code_walk",
        status: "ok",
        artifact_path: codeWalkTracePath,
        started_at: st,
        finished_at: new Date().toISOString(),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      warnings.push({ code: "prior_run_code_walk_chain_failed", message: msg.slice(0, 400) });
      const st2 = new Date().toISOString();
      pushStage({
        id: "code_walk",
        status: "skipped",
        artifact_path: null,
        started_at: st2,
        finished_at: st2,
      });
    }
  } else {
    const stSkip = new Date().toISOString();
    pushStage({
      id: "code_walk",
      status: "skipped",
      artifact_path: null,
      started_at: stSkip,
      finished_at: stSkip,
    });
  }

  const intent = buildIntentHydration({
    bootstrap: bootArtifact,
    refinement: questionArt,
    conflicts: conflictArt,
    ast: astRead,
    astPath: p.astHydration,
    conflictPath: p.conflictContext,
    retrieval:
      retrievalPath && retrievalHitsForIntent.length > 0
        ? { artifactPath: retrievalPath, hits: retrievalHitsForIntent }
        : undefined,
    codeWalkTracePath: codeWalkTracePath ?? undefined,
  });
  writeIntentHydration(p.intentHydration, intent);
  {
    const st = new Date().toISOString();
    pushStage({
      id: "intent_bundle",
      status: "ok",
      artifact_path: p.intentHydration.replace(/\\/g, "/"),
      started_at: st,
      finished_at: new Date().toISOString(),
    });
  }

  const status =
    exitCode === EXIT_OK ? "ok" : exitCode === EXIT_PARTIAL ? "partial" : "failed";
  writeUtf8Json(
    p.run,
    buildRunJson({
      runId,
      status,
      exitCode,
      errors,
      warnings,
      inputs: runInputs(),
      timingMs: Date.now() - t0,
      astEvidencePath: p.astHydration.replace(/\\/g, "/"),
      pipeline: {
        stages,
        source_config: mkSourceConfig(),
      },
    }),
  );

  const runObj = JSON.parse(fs.readFileSync(p.run, "utf8")) as import("../astGrep/types").HydrationRunArtifactV1;
  runObj.intent_bootstrap_path = p.intentBootstrap.replace(/\\/g, "/");
  runObj.question_refinement_path = p.questionRefinement.replace(/\\/g, "/");
  runObj.conflict_context_path = p.conflictContext.replace(/\\/g, "/");
  runObj.repo_structure_path = p.repoStructure.replace(/\\/g, "/");
  runObj.intent_hydration_path = p.intentHydration.replace(/\\/g, "/");
  runObj.retrieval_path = retrievalPath;
  runObj.code_walk_trace_path = codeWalkTracePath;
  runObj.prior_run_path = opts.priorRunPath ? opts.priorRunPath.replace(/\\/g, "/") : null;
  if (questionRefinementChain.length > 0) {
    runObj.question_refinement_chain = questionRefinementChain;
  }
  if (postRetrievalArt) {
    runObj.question_refinement_post_retrieval_path = p.questionRefinementPostRetrieval.replace(/\\/g, "/");
  }
  writeUtf8Json(p.run, runObj);

  return exitCode;
}
