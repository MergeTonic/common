import { randomUUID, createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { resolveHydrationArtifactPaths } from "./paths";
import { HYDRATION_PIPELINE_SCHEMA, HYDRATION_PIPELINE_VERSION, type HydrationBranchIntent, type HydrationBranchIntentCollection, type HydrationCycleNode, type HydrationCycleState, type HydrationPipelineRun, type HydrationQuestionPlan, type HydrationQuestionSlot, type HydrationRetrievalBundle, type HydrationRetrievalMerge, type VectorBackendKind } from "./types";
import { createDefaultHydrationPipelineStages, type HydrationPipelineStageId } from "./pipelineGraph";

type WritableArtifactKey =
  | "branch_intents"
  | "question_plan"
  | "hydration_cycle"
  | "retrieval"
  | "retrieval_merge"
  | "metadata_consolidation"
  | "hydration_result";

const ARTIFACT_FILE_NAMES: Record<WritableArtifactKey, string> = {
  branch_intents: "branch-intents.json",
  question_plan: "question-plan.json",
  hydration_cycle: "hydration-cycle.json",
  retrieval: "retrieval.json",
  retrieval_merge: "retrieval-merge.json",
  metadata_consolidation: "metadata-consolidation.json",
  hydration_result: "hydration-result.json",
};

function nowIso(): string {
  return new Date().toISOString();
}

function contentHashFor(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

export function defaultHydrationRunId(): string {
  return randomUUID();
}

export function resolveHydrationRunDirectory(repoRoot: string, runId: string): string {
  return path.join(resolveHydrationArtifactPaths(repoRoot).runRoot, runId);
}

export function createHydrationPipelineRun(params: {
  repoRoot: string;
  vectorBackend: VectorBackendKind;
  runId?: string;
}): HydrationPipelineRun {
  const artifactPaths = resolveHydrationArtifactPaths(params.repoRoot);
  const runId = params.runId ?? defaultHydrationRunId();
  const runDir = resolveHydrationRunDirectory(params.repoRoot, runId);
  return {
    schema: HYDRATION_PIPELINE_SCHEMA,
    pipeline_version: HYDRATION_PIPELINE_VERSION,
    run_id: runId,
    repo_root: params.repoRoot,
    persist_root: artifactPaths.persistRoot,
    vector_backend: params.vectorBackend,
    run_status: "planned",
    stages: createDefaultHydrationPipelineStages(),
    artifacts: {
      index_state_path: artifactPaths.indexStatePath,
      run_state_path: path.join(runDir, "run-state.json"),
    },
  };
}

export function saveHydrationPipelineRun(run: HydrationPipelineRun): void {
  fs.mkdirSync(path.dirname(run.artifacts.run_state_path), { recursive: true });
  fs.writeFileSync(run.artifacts.run_state_path, JSON.stringify(run, null, 2) + "\n", "utf8");
}

export function loadHydrationPipelineRun(filePath: string): HydrationPipelineRun | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as HydrationPipelineRun;
}

export function updateHydrationPipelineStage(
  run: HydrationPipelineRun,
  stageId: HydrationPipelineStageId,
  params: {
    status: HydrationPipelineRun["stages"][number]["status"];
    contentHash?: string;
    error?: string;
  },
): HydrationPipelineRun {
  run.stages = run.stages.map((stage) => {
    if (stage.stage_id !== stageId) {
      return stage;
    }
    const started = stage.started_at || (params.status === "running" ? nowIso() : undefined);
    const finished = params.status !== "running" ? nowIso() : undefined;
    return {
      ...stage,
      status: params.status,
      content_hash: params.contentHash ?? stage.content_hash,
      error: params.error ?? stage.error,
      started_at: started ?? stage.started_at,
      finished_at: finished ?? stage.finished_at,
    };
  });
  if (params.status === "running") {
    run.run_status = "running";
  } else if (params.status === "failed") {
    run.run_status = "failed";
  }
  return run;
}

export function finalizeHydrationPipelineRun(
  run: HydrationPipelineRun,
  status: HydrationPipelineRun["run_status"],
): HydrationPipelineRun {
  run.run_status = status;
  return run;
}

export function createHydrationBranchIntentCollection(
  branchIntents: HydrationBranchIntent[],
): HydrationBranchIntentCollection {
  return {
    schema: "tonic-branch-intents",
    pipeline_version: HYDRATION_PIPELINE_VERSION,
    branch_intents: branchIntents,
  };
}

export function createHydrationQuestionPlan(params: {
  downstreamTask: string;
  maxQuestions: number;
  branchIntentCount: number;
  questionSlots: HydrationQuestionSlot[];
}): HydrationQuestionPlan {
  return {
    schema: "tonic-hydration-question-plan",
    pipeline_version: HYDRATION_PIPELINE_VERSION,
    downstream_task: params.downstreamTask,
    max_questions: params.maxQuestions,
    branch_intent_count: params.branchIntentCount,
    question_slots: params.questionSlots,
  };
}

export function createHydrationCycleState(
  cycleNumber: number,
  nodes: HydrationCycleNode[],
): HydrationCycleState {
  return {
    schema: "tonic-hydration-cycle",
    pipeline_version: HYDRATION_PIPELINE_VERSION,
    total_cycles: 1,
    stop_reason: "max_cycles",
    nodes,
    cycles: [
      {
        cycle_number: cycleNumber,
        targets: [],
        question_slots: [],
        retrieval_bundles: [],
        retrieval_merge: {
          schema: "tonic-hydration-retrieval-merge",
          pipeline_version: HYDRATION_PIPELINE_VERSION,
          retrieval_bundles: [],
          evidence_by_path: [],
        },
        fuzzy_alignment: [],
        nodes_added: nodes,
      },
    ],
  };
}

export function buildHydrationRetrievalMerge(
  retrievalBundles: HydrationRetrievalBundle[],
): HydrationRetrievalMerge {
  const evidenceByPath = new Map<string, { slot_ids: Set<string>; chunk_ids: Set<string>; ast_node_ids: Set<string> }>();
  for (const bundle of retrievalBundles) {
    for (const hit of bundle.vector_hits) {
      const entry = evidenceByPath.get(hit.path) ?? {
        slot_ids: new Set<string>(),
        chunk_ids: new Set<string>(),
        ast_node_ids: new Set<string>(),
      };
      entry.slot_ids.add(bundle.slot_id);
      entry.chunk_ids.add(hit.chunk_id);
      evidenceByPath.set(hit.path, entry);
    }
    for (const candidate of bundle.ast_candidates) {
      const entry = evidenceByPath.get(candidate.path) ?? {
        slot_ids: new Set<string>(),
        chunk_ids: new Set<string>(),
        ast_node_ids: new Set<string>(),
      };
      entry.slot_ids.add(bundle.slot_id);
      entry.ast_node_ids.add(candidate.ast_node_id);
      evidenceByPath.set(candidate.path, entry);
    }
  }
  return {
    schema: "tonic-hydration-retrieval-merge",
    pipeline_version: HYDRATION_PIPELINE_VERSION,
    retrieval_bundles: retrievalBundles,
    evidence_by_path: [...evidenceByPath.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([filePath, entry]) => ({
        path: filePath,
        slot_ids: [...entry.slot_ids].sort(),
        chunk_ids: [...entry.chunk_ids].sort(),
        ast_node_ids: [...entry.ast_node_ids].sort(),
      })),
  };
}

export function writeHydrationArtifact(
  run: HydrationPipelineRun,
  key: WritableArtifactKey,
  value: unknown,
): string {
  const runDir = path.dirname(run.artifacts.run_state_path);
  fs.mkdirSync(runDir, { recursive: true });
  const targetPath = path.join(runDir, ARTIFACT_FILE_NAMES[key]);
  fs.writeFileSync(targetPath, JSON.stringify(value, null, 2) + "\n", "utf8");
  run.artifacts[`${key}_path` as keyof typeof run.artifacts] = targetPath as never;
  return targetPath;
}

export function markStageArtifactWritten(
  run: HydrationPipelineRun,
  stageId: HydrationPipelineStageId,
  value: unknown,
): HydrationPipelineRun {
  return updateHydrationPipelineStage(run, stageId, {
    status: "completed",
    contentHash: contentHashFor(value),
  });
}
