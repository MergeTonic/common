import type { HydrationPipelineStageState } from "./types";

export const HYDRATION_PIPELINE_STAGE_IDS = [
  "config.resolve",
  "branch_intents.collect",
  "index.sync",
  "question_plan.compose",
  "hydrate.cycle",
  "code_walk.run",
  "retrieval.merge",
  "llm.transcript",
  "metadata.hydrate",
  "emit",
] as const;

export type HydrationPipelineStageId = (typeof HYDRATION_PIPELINE_STAGE_IDS)[number];

export function createDefaultHydrationPipelineStages(): HydrationPipelineStageState[] {
  return HYDRATION_PIPELINE_STAGE_IDS.map((stageId) => ({
    stage_id: stageId,
    status: "pending",
  }));
}
