import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { buildHydrationAstCandidates } from "./astCandidates";
import {
  buildFinalHydrationCycleState,
  buildHydrationCycleRecord,
  buildHydrationMetadataConsolidation,
  deriveNextCycleTargets,
} from "./cycleModel";
import { DeterministicFakeEmbedder } from "./embedder";
import { HydrationIndexer } from "./indexer";
import { appendHydrationLlmTranscriptEvent } from "./llmTranscript";
import { createHydrationLlmService } from "./llmService";
import type { HydrationSearchMiddleware } from "./middleware";
import { buildMissingOptionalAiDependencySkipResult, probeHydrationOptionalAiDependency } from "./optionalAi";
import { acquireHydrationPersistLock, buildHydrationCacheKey } from "./persistence";
import { HydrationRepository } from "./repository";
import {
  buildHydrationRetrievalMerge,
  createHydrationBranchIntentCollection,
  createHydrationPipelineRun,
  createHydrationQuestionPlan,
  defaultHydrationRunId,
  finalizeHydrationPipelineRun,
  markStageArtifactWritten,
  saveHydrationPipelineRun,
  updateHydrationPipelineStage,
  writeHydrationArtifact,
} from "./runState";
import { probeHydrationRuntimeReadiness, createHydrationRuntime } from "./runtime";
import { resolveHydrationRuntimeConfig } from "./runtimeConfig";
import {
  buildHydrationFuzzyAlignment,
  planHydrationQuestionSlots,
  synthesizeHydrationMetadata,
} from "./intentHydration";
import { runAgenticCodeSearchSession } from "./agenticCodeSearch";
import { assertHydrationPersistHealth } from "./persistence";
import { HYDRATION_OPTIONAL_AI_EXIT_CODE } from "./types";
import type {
  HydrationBranchIntent,
  HydrationCycleRecord,
  HydrationCycleTarget,
  HydrationQuestionSlot,
  HydrationRetrievalAstCandidate,
  HydrationRetrievalBundle,
  HydrationRunResult,
} from "./types";

export type HydrationHistoricalOptions = {
  max_prs: number;
  since?: string;
  base_ref?: string;
  state?: "merged" | "open" | "all";
};

export type RunHydrateIntentsOptions = {
  intent_text?: string;
  intent_spec?: string;
  scope?: string;
  dry_run?: boolean;
  prompt_profile?: string;
  log_llm?: string;
  max_questions: number;
  query_top_k: number;
  downstream_task: string;
  historical?: HydrationHistoricalOptions;
  vendoring_scaffold?: boolean;
  env?: NodeJS.ProcessEnv;
};

export type RunHydrateIntentsResult = {
  exitCode: number;
  payload: Record<string, unknown>;
};

type HistoricalExpansion = {
  commitIds: string[];
  paths: string[];
};

function normalizeScopePatterns(rawScope: string | undefined): string[] {
  if (!rawScope) {
    return [];
  }
  return rawScope
    .split(/[,\n;]+/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeQuestionKey(question: string): string {
  return question.toLowerCase().replace(/\s+/g, " ").trim();
}

function parseIntentSpec(repoRoot: string, specPath: string): HydrationBranchIntent[] {
  const resolved = path.resolve(repoRoot, specPath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(resolved, "utf8"));
  } catch (error) {
    throw new Error(`Failed to parse --intent-spec '${specPath}': ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Invalid --intent-spec '${specPath}': expected a JSON object.`);
  }
  const record = parsed as Record<string, unknown>;
  if (record.schema === "tonic-branch-intents" && Array.isArray(record.branch_intents)) {
    const intents: HydrationBranchIntent[] = [];
    record.branch_intents.forEach((entry, index) => {
      if (!entry || typeof entry !== "object") {
        return;
      }
      const intent = entry as Record<string, unknown>;
      const intentId = typeof intent.intent_id === "string" && intent.intent_id.trim() ? intent.intent_id.trim() : `intent-${index + 1}`;
      const description = typeof intent.description === "string" ? intent.description.trim() : "";
      if (!description) {
        return;
      }
      intents.push({
        branch_id: typeof intent.branch_id === "string" && intent.branch_id.trim() ? intent.branch_id.trim() : "primary",
        intent_id: intentId,
        description,
        source_kind: "file",
        source_value: resolved,
        priority:
          intent.priority === "high" || intent.priority === "medium" || intent.priority === "low" ?
            intent.priority
          : undefined,
        scope: typeof intent.scope === "string" ? intent.scope : undefined,
      });
    });
    return intents;
  }
  if (record.schema === "tonic-intent-spec" && Array.isArray(record.intents)) {
    const intents: HydrationBranchIntent[] = [];
    record.intents.forEach((entry, index) => {
      if (!entry || typeof entry !== "object") {
        return;
      }
      const intent = entry as Record<string, unknown>;
      const intentId = typeof intent.id === "string" && intent.id.trim() ? intent.id.trim() : `intent-${index + 1}`;
      const description = typeof intent.description === "string" ? intent.description.trim() : "";
      if (!description) {
        return;
      }
      intents.push({
        branch_id: "primary",
        intent_id: intentId,
        description,
        source_kind: "file",
        source_value: resolved,
        priority:
          intent.priority === "high" || intent.priority === "medium" || intent.priority === "low" ?
            intent.priority
          : undefined,
      });
    });
    return intents;
  }
  throw new Error(
    `Invalid --intent-spec '${specPath}': expected schema 'tonic-branch-intents' or 'tonic-intent-spec'.`,
  );
}

function buildBranchIntents(params: {
  repoRoot: string;
  intentText: string;
  intentSpecPath?: string;
}): HydrationBranchIntent[] {
  const fromSpec = params.intentSpecPath ? parseIntentSpec(params.repoRoot, params.intentSpecPath) : [];
  const fromText = params.intentText
    .split(/\r?\n|;/g)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((description, index) => ({
      branch_id: "primary",
      intent_id: `text-intent-${index + 1}`,
      description,
      source_kind: "text" as const,
      source_value: description,
    }));
  const combined = [...fromSpec, ...fromText];
  if (combined.length > 0) {
    return combined;
  }
  return [
    {
      branch_id: "primary",
      intent_id: "intent-1",
      description: "hydrate repository context for current branch intents",
      source_kind: "text",
      source_value: "hydrate repository context for current branch intents",
    },
  ];
}

function collectHistoricalExpansion(repoRoot: string, historical: HydrationHistoricalOptions | undefined): HistoricalExpansion {
  if (!historical || historical.max_prs <= 0 || historical.state === "open") {
    return { commitIds: [], paths: [] };
  }
  const maxCommits = Math.max(0, Math.min(50, historical.max_prs));
  if (maxCommits === 0) {
    return { commitIds: [], paths: [] };
  }
  const range = historical.base_ref?.trim() ? `${historical.base_ref.trim()}..HEAD` : "HEAD";
  const commitArgs = ["-C", repoRoot, "rev-list", "--max-count", String(maxCommits)];
  if (historical.since?.trim()) {
    commitArgs.push(`--since=${historical.since.trim()}`);
  }
  commitArgs.push(range);
  let commitIds: string[] = [];
  try {
    commitIds = execFileSync("git", commitArgs, { encoding: "utf8" })
      .split(/\r?\n/g)
      .map((entry) => entry.trim())
      .filter(Boolean);
  } catch {
    return { commitIds: [], paths: [] };
  }
  const paths = new Set<string>();
  for (const commitId of commitIds) {
    try {
      const output = execFileSync("git", ["-C", repoRoot, "show", "--pretty=format:", "--name-only", commitId], { encoding: "utf8" });
      for (const filePath of output.split(/\r?\n/g).map((entry) => entry.trim()).filter(Boolean)) {
        if (filePath.includes("..") || path.isAbsolute(filePath)) {
          continue;
        }
        paths.add(filePath.replace(/\\/g, "/"));
        if (paths.size >= 500) {
          break;
        }
      }
    } catch {
      continue;
    }
    if (paths.size >= 500) {
      break;
    }
  }
  return {
    commitIds,
    paths: [...paths].sort(),
  };
}

function resolveTranscriptPath(repoRoot: string, explicitPath?: string): string | undefined {
  const candidate = explicitPath?.trim();
  if (!candidate) {
    return undefined;
  }
  return path.isAbsolute(candidate) ? candidate : path.resolve(repoRoot, candidate);
}

function summarizeTargets(targets: HydrationCycleTarget[]): string {
  if (targets.length === 0) {
    return "(none)";
  }
  return targets
    .slice(0, 8)
    .map((target) => `${target.level}:${target.path || target.symbol || target.label}`)
    .join("\n");
}

function buildTargetedQuestionSlots(params: {
  targets: HydrationCycleTarget[];
  cycleNumber: number;
  maxQuestions: number;
}): HydrationQuestionSlot[] {
  const out: HydrationQuestionSlot[] = [];
  for (const target of params.targets) {
    if (out.length >= params.maxQuestions) {
      break;
    }
    if (target.symbol) {
      out.push({
        id: `c${params.cycleNumber}-q${out.length + 1}`,
        question: `How does ${target.symbol} in ${target.path || "this module"} implement current branch intents?`,
        strategy: "template",
      });
      continue;
    }
    if (target.path) {
      out.push({
        id: `c${params.cycleNumber}-q${out.length + 1}`,
        question: `Which declarations in ${target.path} are most relevant to current branch intents?`,
        strategy: "template",
      });
    }
  }
  return out;
}

export async function runHydrateIntentsMachineMode(
  repoRoot: string,
  options: RunHydrateIntentsOptions,
): Promise<RunHydrateIntentsResult> {
  const env = options.env ?? process.env;
  const runtime = resolveHydrationRuntimeConfig(repoRoot, env);
  if (runtime.mode !== "memory") {
    const probe = probeHydrationOptionalAiDependency();
    if (!probe.available) {
      return {
        exitCode: HYDRATION_OPTIONAL_AI_EXIT_CODE,
        payload: buildMissingOptionalAiDependencySkipResult(repoRoot, probe.installHint) as unknown as Record<string, unknown>,
      };
    }
  }
  assertHydrationPersistHealth(runtime.persistPath);
  if (runtime.mode === "http") {
    const readiness = await probeHydrationRuntimeReadiness(repoRoot, env);
    if (!readiness?.ok) {
      return {
        exitCode: 1,
        payload: {
          ok: false,
          hydration_skipped: true,
          skip_reason: "missing_configuration",
          runtime_mode: runtime.mode,
          heartbeat_url: readiness?.heartbeatUrl,
          error: readiness?.error ?? "Chroma heartbeat probe failed.",
        },
      };
    }
  }

  const runId = defaultHydrationRunId();
  const dryRun = Boolean(options.dry_run);
  const runtimeOverrides =
    dryRun && runtime.mode !== "memory" ?
      { collectionName: `${runtime.collectionName}-dryrun-${runId.slice(0, 8)}` }
    : {};
  const runtimeBundle = await createHydrationRuntime(repoRoot, env, runtimeOverrides);
  const run = createHydrationPipelineRun({
    repoRoot,
    vectorBackend: runtimeBundle.backend,
    runId,
  });
  const transcriptPath = resolveTranscriptPath(repoRoot, options.log_llm);
  if (transcriptPath) {
    run.artifacts.llm_transcript_path = transcriptPath;
  }
  const lock =
    runtime.mode === "memory" ?
      null
    : acquireHydrationPersistLock(runtime.persistPath, `merge-tonic:${run.run_id}`);
  try {
    const maxQuestions = Math.max(1, options.max_questions);
    const queryTopK = Math.max(1, options.query_top_k);
    const downstreamTask = options.downstream_task.trim() || "hydrate intent tags for current repository context";
    const promptProfile = (options.prompt_profile ?? "").trim();
    const scopePatterns = normalizeScopePatterns(options.scope);
    const scopeLabel = scopePatterns.length > 0 ? scopePatterns.join(",") : ".";
    const branchIntents = buildBranchIntents({
      repoRoot,
      intentText: options.intent_text ?? "",
      intentSpecPath: options.intent_spec,
    });
    const historical = collectHistoricalExpansion(repoRoot, options.historical);
    const embedder = new DeterministicFakeEmbedder();
    const hydrationLlmService = createHydrationLlmService();
    const cacheKey = buildHydrationCacheKey({
      strategyId: "incremental-content-hash",
      embedderModel: embedder.modelId,
      chunkerVersion: "line-estimate-v1",
      prIdentifiers: historical.commitIds,
      scope: scopeLabel,
      promptProfile,
      dryRun,
      historicalSince: options.historical?.since ?? "",
      historicalBaseRef: options.historical?.base_ref ?? "",
      historicalState: options.historical?.state ?? "merged",
    });

    updateHydrationPipelineStage(run, "config.resolve", { status: "running" });
    saveHydrationPipelineRun(run);
    const resolvedConfig = {
      schema: "tonic-hydration-resolved-config",
      pipeline_version: run.pipeline_version,
      runtime_mode: runtime.mode,
      vector_backend: runtimeBundle.backend,
      collection_name: runtimeBundle.config.collectionName,
      persist_path: runtime.persistPath,
      chroma_url: runtime.url,
      heartbeat_path: runtime.heartbeatPath,
      max_questions: maxQuestions,
      query_top_k: queryTopK,
      scope: scopeLabel,
      prompt_profile: promptProfile || "default",
      dry_run: dryRun,
      historical: options.historical ?? null,
    };
    markStageArtifactWritten(run, "config.resolve", resolvedConfig);
    saveHydrationPipelineRun(run);

    if (options.vendoring_scaffold) {
      writeHydrationArtifact(run, "retrieval", {
        schema: "tonic-hydration-retrieval-merge",
        pipeline_version: run.pipeline_version,
        retrieval_bundles: [],
        evidence_by_path: [],
        note: "P0 vendoring scaffold placeholder",
      });
      appendHydrationLlmTranscriptEvent(run, {
        stage_id: "hydrate_intents.cli",
        event: "scaffold",
        note: "Vendoring-first hydration CLI scaffold executed before full P1 pipeline wiring.",
      });
      finalizeHydrationPipelineRun(run, "skipped");
      saveHydrationPipelineRun(run);
      const payload: HydrationRunResult = {
        schema: "tonic-intent-hydration",
        pipeline_version: run.pipeline_version,
        run_id: run.run_id,
        repo_root: repoRoot,
        persist_root: run.persist_root,
        run_root: path.dirname(run.artifacts.run_state_path),
        vector_backend: run.vector_backend,
        hydration_skipped: true,
        skip_reason: "not_implemented",
        tags_added: [],
        rationale: "Vendoring-first CLI scaffold is ready; full hydration orchestration remains blocked behind remaining P0/P1 tasks.",
        pipeline_run: run,
        metadata: {
          cache_key: cacheKey.cacheKey,
          pr_scope_hash: cacheKey.prListHash,
          runtime_mode: runtime.mode,
        },
      };
      writeHydrationArtifact(run, "hydration_result", payload);
      saveHydrationPipelineRun(run);
      return { exitCode: 0, payload: payload as unknown as Record<string, unknown> };
    }

    const branchIntentCollection = createHydrationBranchIntentCollection(branchIntents);
    writeHydrationArtifact(run, "branch_intents", branchIntentCollection);
    markStageArtifactWritten(run, "branch_intents.collect", branchIntentCollection);
    saveHydrationPipelineRun(run);

    const initialQuestionSlots = await planHydrationQuestionSlots({
      repoRoot,
      branchIntents,
      downstreamTask,
      maxQuestions: Math.min(maxQuestions, 3),
      scope: scopeLabel,
      promptProfile,
      llmService: hydrationLlmService,
      onLlmEvent(event): void {
        appendHydrationLlmTranscriptEvent(run, {
          stage_id: "question_plan.compose",
          event: event.event,
          provider: event.provider,
          model: event.model,
          prompt_template: event.schemaName,
          request_json: event.requestJson,
          response_json: event.responseJson,
          note: event.note,
        });
      },
    });
    const questionPlan = createHydrationQuestionPlan({
      downstreamTask,
      maxQuestions,
      branchIntentCount: branchIntents.length,
      questionSlots: initialQuestionSlots,
    });
    writeHydrationArtifact(run, "question_plan", questionPlan);
    markStageArtifactWritten(run, "question_plan.compose", questionPlan);
    saveHydrationPipelineRun(run);

    updateHydrationPipelineStage(run, "index.sync", { status: "running" });
    saveHydrationPipelineRun(run);
    const repository = new HydrationRepository(repoRoot, {
      scopePatterns,
      includePaths: historical.paths,
    });
    const indexer = new HydrationIndexer(repoRoot, runtimeBundle.index, embedder, { repository });
    const syncResult = await indexer.sync({
      vectorBackend: runtimeBundle.backend,
      cacheKey: cacheKey.cacheKey,
      prScopeHash: cacheKey.prListHash,
      normativeCommit: env.GITHUB_SHA ?? "",
      scope: scopeLabel,
      promptProfile,
      dryRun,
      historicalSince: options.historical?.since ?? "",
      historicalBaseRef: options.historical?.base_ref ?? "",
      historicalState: options.historical?.state ?? "merged",
      reuseState: !dryRun,
      persistState: !dryRun,
    });
    markStageArtifactWritten(run, "index.sync", syncResult);
    saveHydrationPipelineRun(run);

    updateHydrationPipelineStage(run, "hydrate.cycle", { status: "running" });
    saveHydrationPipelineRun(run);

    const searchMiddleware: HydrationSearchMiddleware = {
      beforeToolCall(context): void {
        appendHydrationLlmTranscriptEvent(run, {
          stage_id: "hydrate.cycle",
          event: "tool_call",
          provider: "vendored-search-tools",
          model: embedder.modelId,
          request_json: {
            slot_id: context.slotId,
            question: context.question,
            tool_id: context.toolId,
            params: context.params ?? {},
          },
        });
      },
      afterToolCall(context, result): void {
        appendHydrationLlmTranscriptEvent(run, {
          stage_id: "hydrate.cycle",
          event: "tool_result",
          provider: "vendored-search-tools",
          model: embedder.modelId,
          response_json: {
            slot_id: context.slotId,
            tool_id: context.toolId,
            record_count: result.recordCount,
            payload: result.payload ?? {},
          },
        });
      },
      onToolError(context, error): void {
        appendHydrationLlmTranscriptEvent(run, {
          stage_id: "hydrate.cycle",
          event: "tool_error",
          provider: "vendored-search-tools",
          model: embedder.modelId,
          note: `${context.toolId}: ${error instanceof Error ? error.message : String(error)}`,
        });
      },
    };

    const maxCycles = 3;
    const maxTotalChunks = Math.max(queryTopK * maxQuestions * 2, queryTopK);
    const seenQuestionKeys = new Set<string>();
    const seenTargetIds = new Set<string>();
    const seenEvidencePaths = new Set<string>();
    const pathVisitCounts = new Map<string, number>();
    const allQuestionSlots: HydrationQuestionSlot[] = [];
    const allRetrievalBundles: HydrationRetrievalBundle[] = [];
    const allFuzzyAlignment = [] as ReturnType<typeof buildHydrationFuzzyAlignment>;
    const cycles: HydrationCycleRecord[] = [];
    let totalRetrievedChunks = 0;
    let stopReason: NonNullable<HydrationRunResult["hydration_cycle"]>["stop_reason"] = "max_cycles";

    let currentTargets: HydrationCycleTarget[] = branchIntents.map((intent) => ({
      target_id: `branch:${intent.intent_id}`,
      level: "branch",
      label: intent.description,
      source_node_ids: [],
    }));

    for (let cycleNumber = 1; cycleNumber <= maxCycles; cycleNumber++) {
      const remainingQuestions = maxQuestions - allQuestionSlots.length;
      if (remainingQuestions <= 0) {
        stopReason = "max_total_questions";
        break;
      }
      if (cycleNumber > 1 && currentTargets.length === 0) {
        stopReason = "no_new_targets";
        break;
      }
      appendHydrationLlmTranscriptEvent(run, {
        stage_id: "hydrate.cycle",
        event: "cycle_boundary",
        note: `cycle=${cycleNumber};targets=${currentTargets.length}`,
        request_json: { cycle_number: cycleNumber, targets: currentTargets },
      });

      const plannedSlots =
        cycleNumber === 1 ?
          initialQuestionSlots
        : await planHydrationQuestionSlots({
            repoRoot,
            branchIntents,
            downstreamTask,
            maxQuestions: Math.min(remainingQuestions, 3),
            scope: scopeLabel,
            promptProfile,
            llmService: hydrationLlmService,
            hydratedContext: summarizeTargets(currentTargets),
            priorQuestions: allQuestionSlots,
            onLlmEvent(event): void {
              appendHydrationLlmTranscriptEvent(run, {
                stage_id: "hydrate.cycle",
                event: event.event,
                provider: event.provider,
                model: event.model,
                prompt_template: event.schemaName,
                request_json: event.requestJson,
                response_json: event.responseJson,
                note: event.note,
              });
            },
          });
      const targetedSlots = buildTargetedQuestionSlots({
        targets: currentTargets,
        cycleNumber,
        maxQuestions: Math.min(remainingQuestions, 3),
      });
      const cycleQuestionSlots: HydrationQuestionSlot[] = [];
      const addQuestion = (slot: HydrationQuestionSlot): void => {
        if (cycleQuestionSlots.length >= remainingQuestions) {
          return;
        }
        const questionKey = normalizeQuestionKey(slot.question);
        if (!questionKey || seenQuestionKeys.has(questionKey)) {
          return;
        }
        seenQuestionKeys.add(questionKey);
        cycleQuestionSlots.push({
          ...slot,
          id: `c${cycleNumber}-${slot.id}`,
        });
      };
      targetedSlots.forEach(addQuestion);
      plannedSlots.forEach(addQuestion);
      if (cycleQuestionSlots.length === 0) {
        stopReason = "no_new_targets";
        break;
      }

      const cycleRetrievalBundles: HydrationRetrievalBundle[] = [];
      for (const slot of cycleQuestionSlots) {
        const session = await runAgenticCodeSearchSession({
          query: slot.question,
          repository,
          index: runtimeBundle.index,
          embedder,
          llmService: hydrationLlmService,
          onLlmEvent(event): void {
            appendHydrationLlmTranscriptEvent(run, {
              stage_id: "hydrate.cycle",
              event: event.event,
              provider: event.provider,
              model: event.model,
              prompt_template: event.schemaName,
              request_json: event.requestJson,
              response_json: event.responseJson,
              note: event.note,
            });
          },
          middleware: searchMiddleware,
          topK: queryTopK,
          maxPlanSize: 5,
          maxStepIterations: 6,
        });
        appendHydrationLlmTranscriptEvent(run, {
          stage_id: "hydrate.cycle",
          event: "agentic_session",
          provider: "vendored-agentic-code-search",
          model: embedder.modelId,
          response_json: {
            cycle_number: cycleNumber,
            slot_id: slot.id,
            answer: session.answer,
            answer_reason: session.answerReason,
            record_count: session.records.length,
          },
        });
        const mergedHits = session.records.slice(0, queryTopK);
        const astCandidates: HydrationRetrievalAstCandidate[] = buildHydrationAstCandidates(
          session.records.slice(0, Math.max(queryTopK * 2, queryTopK)),
        );
        cycleRetrievalBundles.push({
          slot_id: slot.id,
          question: slot.question,
          vector_hits: mergedHits.map((record) => ({
            path: record.filePath,
            chunk_id: record.chunkId,
            score: record.score,
            content: record.code,
            start_line: record.startLine,
            end_line: record.endLine,
            symbol: record.symbol,
          })),
          ast_candidates: astCandidates,
        });
      }

      const cycleRetrievalMerge = buildHydrationRetrievalMerge(cycleRetrievalBundles);
      const cycleFuzzyAlignment = buildHydrationFuzzyAlignment({
        retrievalBundles: cycleRetrievalBundles,
        retrievalMerge: cycleRetrievalMerge,
      });
      const newEvidenceCount = cycleRetrievalMerge.evidence_by_path.filter((entry) => !seenEvidencePaths.has(entry.path)).length;
      for (const evidence of cycleRetrievalMerge.evidence_by_path) {
        seenEvidencePaths.add(evidence.path);
        pathVisitCounts.set(evidence.path, (pathVisitCounts.get(evidence.path) ?? 0) + 1);
      }
      totalRetrievedChunks += cycleRetrievalBundles.reduce((sum, bundle) => sum + bundle.vector_hits.length, 0);
      const nextTargets = deriveNextCycleTargets({
        retrievalMerge: cycleRetrievalMerge,
        fuzzyAlignment: cycleFuzzyAlignment,
        pathVisitCounts,
        seenTargetIds,
        maxTargets: 8,
      });
      const cycleStopReason =
        totalRetrievedChunks >= maxTotalChunks ? "max_total_chunks"
        : cycleNumber >= maxCycles ? "max_cycles"
        : allQuestionSlots.length + cycleQuestionSlots.length >= maxQuestions ? "max_total_questions"
        : nextTargets.length === 0 ? "no_new_targets"
        : newEvidenceCount === 0 ? "no_new_evidence"
        : undefined;

      const cycleRecord = buildHydrationCycleRecord({
        cycleNumber,
        targets: currentTargets,
        questionSlots: cycleQuestionSlots,
        retrievalBundles: cycleRetrievalBundles,
        retrievalMerge: cycleRetrievalMerge,
        fuzzyAlignment: cycleFuzzyAlignment,
        stopReason: cycleStopReason,
      });
      cycles.push(cycleRecord);
      currentTargets.forEach((target) => seenTargetIds.add(target.target_id));
      allQuestionSlots.push(...cycleQuestionSlots);
      allRetrievalBundles.push(...cycleRetrievalBundles);
      allFuzzyAlignment.push(...cycleFuzzyAlignment);

      appendHydrationLlmTranscriptEvent(run, {
        stage_id: "hydrate.cycle",
        event: "target_derivation",
        response_json: {
          cycle_number: cycleNumber,
          stop_reason: cycleStopReason ?? null,
          next_targets: nextTargets,
        },
      });

      if (cycleStopReason) {
        stopReason = cycleStopReason;
        break;
      }
      currentTargets = nextTargets;
    }

    const hydrationCycle = buildFinalHydrationCycleState({
      cycles,
      stopReason,
    });
    markStageArtifactWritten(run, "code_walk.run", {
      schema: "tonic-hydration-code-walk",
      pipeline_version: run.pipeline_version,
      cycle_count: cycles.length,
      slot_count: allQuestionSlots.length,
    });
    writeHydrationArtifact(run, "hydration_cycle", hydrationCycle);
    writeHydrationArtifact(run, "retrieval", {
      schema: "tonic-hydration-retrieval-stage",
      pipeline_version: run.pipeline_version,
      retrieval_bundles: allRetrievalBundles,
    });
    const retrievalMerge = buildHydrationRetrievalMerge(allRetrievalBundles);
    writeHydrationArtifact(run, "retrieval_merge", retrievalMerge);
    markStageArtifactWritten(run, "hydrate.cycle", hydrationCycle);
    markStageArtifactWritten(run, "retrieval.merge", retrievalMerge);
    saveHydrationPipelineRun(run);

    const consolidation = buildHydrationMetadataConsolidation({
      branchIntents,
      cycles,
    });
    writeHydrationArtifact(run, "metadata_consolidation", consolidation);
    saveHydrationPipelineRun(run);

    const metadataSynthesis = await synthesizeHydrationMetadata({
      repoRoot,
      branchIntents,
      questionSlots: allQuestionSlots,
      metadataConsolidation: consolidation,
      retrievalBundles: allRetrievalBundles,
      fuzzyAlignment: allFuzzyAlignment,
      promptProfile,
      llmService: hydrationLlmService,
      onLlmEvent(event): void {
        appendHydrationLlmTranscriptEvent(run, {
          stage_id: "metadata.hydrate",
          event: event.event,
          provider: event.provider,
          model: event.model,
          prompt_template: event.schemaName,
          request_json: event.requestJson,
          response_json: event.responseJson,
          note: event.note,
        });
      },
    });
    markStageArtifactWritten(run, "metadata.hydrate", {
      tags_added: metadataSynthesis.tagsAdded,
      rationale: metadataSynthesis.rationale,
    });
    updateHydrationPipelineStage(run, "llm.transcript", { status: "completed" });
    finalizeHydrationPipelineRun(run, "completed");
    saveHydrationPipelineRun(run);

    const payload: HydrationRunResult = {
      schema: "tonic-intent-hydration",
      pipeline_version: run.pipeline_version,
      run_id: run.run_id,
      repo_root: repoRoot,
      persist_root: run.persist_root,
      run_root: path.dirname(run.artifacts.run_state_path),
      vector_backend: run.vector_backend,
      hydration_skipped: false,
      tags_added: metadataSynthesis.tagsAdded,
      rationale: metadataSynthesis.rationale,
      branch_intents: branchIntentCollection,
      question_plan: questionPlan,
      question_slots: allQuestionSlots,
      hydration_cycle: hydrationCycle,
      retrieval_bundles: allRetrievalBundles,
      retrieval_merge: retrievalMerge,
      metadata_consolidation: consolidation,
      fuzzy_alignment: allFuzzyAlignment,
      pipeline_run: run,
      metadata: {
        cache_key: cacheKey.cacheKey,
        pr_scope_hash: cacheKey.prListHash,
        runtime_mode: runtime.mode,
        added_files: syncResult.addedFiles,
        updated_files: syncResult.updatedFiles,
        removed_files: syncResult.removedFiles,
        indexed_chunks: syncResult.indexedChunks,
        scope: scopeLabel,
        prompt_profile: promptProfile || "default",
        dry_run: dryRun,
        historical_max_prs: options.historical?.max_prs ?? 0,
        historical_since: options.historical?.since ?? "",
        historical_base_ref: options.historical?.base_ref ?? "",
        historical_state: options.historical?.state ?? "merged",
      },
    };
    writeHydrationArtifact(run, "hydration_result", payload);
    markStageArtifactWritten(run, "emit", payload);
    saveHydrationPipelineRun(run);
    return {
      exitCode: 0,
      payload: payload as unknown as Record<string, unknown>,
    };
  } catch (error) {
    updateHydrationPipelineStage(run, "emit", {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
    finalizeHydrationPipelineRun(run, "failed");
    saveHydrationPipelineRun(run);
    return {
      exitCode: 1,
      payload: {
        ok: false,
        hydration_skipped: true,
        skip_reason: "missing_configuration",
        error: error instanceof Error ? error.message : String(error),
        runtime_mode: runtime.mode,
      },
    };
  } finally {
    lock?.release();
  }
}
