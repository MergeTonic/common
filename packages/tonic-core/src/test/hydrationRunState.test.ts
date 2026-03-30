import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  HYDRATION_PIPELINE_STAGE_IDS,
  appendHydrationLlmTranscriptEvent,
  buildHydrationRetrievalMerge,
  createHydrationBranchIntentCollection,
  createHydrationPipelineRun,
  createHydrationQuestionPlan,
  loadHydrationPipelineRun,
  markStageArtifactWritten,
  saveHydrationPipelineRun,
  writeHydrationArtifact,
} from "../hydration";

test("hydration run state uses canonical stage order and scoped artifact paths", () => {
  const repoRoot = path.join(os.tmpdir(), "tonic-hydration-run-state");
  fs.rmSync(repoRoot, { recursive: true, force: true });
  fs.mkdirSync(repoRoot, { recursive: true });

  const run = createHydrationPipelineRun({
    repoRoot,
    vectorBackend: "memory",
    runId: "run-state-test",
  });

  assert.deepEqual(run.stages.map((stage) => stage.stage_id), [...HYDRATION_PIPELINE_STAGE_IDS]);
  assert.match(run.artifacts.run_state_path, /run-state-test[\\/]run-state\.json$/);

  const branchIntents = createHydrationBranchIntentCollection([
    {
      branch_id: "left",
      intent_id: "auth-preserve",
      description: "Preserve auth flow",
      source_kind: "text",
      source_value: "keep auth stable",
    },
  ]);
  const questionPlan = createHydrationQuestionPlan({
    downstreamTask: "map auth intent",
    maxQuestions: 3,
    branchIntentCount: 1,
    questionSlots: [
      {
        id: "q.auth",
        question: "Which auth modules are involved?",
        strategy: "guided-llm-meta",
      },
    ],
  });
  const retrievalMerge = buildHydrationRetrievalMerge([
    {
      slot_id: "q.auth",
      question: "Which auth modules are involved?",
      vector_hits: [{ path: "src/auth.ts", chunk_id: "chunk-1", score: 0.9, content: "auth" }],
      ast_candidates: [{ ast_node_id: "node-1", path: "src/auth.ts", score: 0.8 }],
    },
  ]);

  writeHydrationArtifact(run, "branch_intents", branchIntents);
  writeHydrationArtifact(run, "question_plan", questionPlan);
  writeHydrationArtifact(run, "retrieval", retrievalMerge);
  writeHydrationArtifact(run, "retrieval_merge", retrievalMerge);
  writeHydrationArtifact(run, "metadata_consolidation", {
    schema: "tonic-hydration-metadata-consolidation",
    pipeline_version: "1",
    paths_ranked: [],
    symbols_ranked: [],
    intent_support: [],
    cycle_deltas: [],
    candidate_tags: [],
  });
  appendHydrationLlmTranscriptEvent(run, {
    stage_id: "question_plan.compose",
    event: "stub",
    note: "run-state test",
  });
  markStageArtifactWritten(run, "question_plan.compose", questionPlan);
  saveHydrationPipelineRun(run);

  const loaded = loadHydrationPipelineRun(run.artifacts.run_state_path);
  assert.ok(loaded);
  assert.ok(fs.existsSync(run.artifacts.branch_intents_path ?? ""));
  assert.ok(fs.existsSync(run.artifacts.retrieval_path ?? ""));
  assert.ok(fs.existsSync(run.artifacts.metadata_consolidation_path ?? ""));
  assert.ok(fs.existsSync(run.artifacts.llm_transcript_path ?? ""));
  assert.equal(
    loaded?.stages.find((stage) => stage.stage_id === "question_plan.compose")?.status,
    "completed",
  );
});
