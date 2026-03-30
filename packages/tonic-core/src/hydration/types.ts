export const HYDRATION_INTENT_RESULT_SCHEMA = "tonic-intent-hydration";
export const HYDRATION_PIPELINE_SCHEMA = "tonic-hydration-pipeline";
export const HYDRATION_PIPELINE_VERSION = "1";
export const HYDRATION_OPTIONAL_AI_EXIT_CODE = 5;

export type VectorBackendKind =
  | "chroma-http"
  | "chroma-persistent"
  | "ephemeral"
  | "memory";

export type HydrationSkipReason =
  | "disabled"
  | "missing_optional_ai_dependencies"
  | "missing_configuration"
  | "unsupported_runtime"
  | "not_implemented";

export type HydrationIntentTag = {
  key: string;
  value: string;
  display?: string;
};

export type HydrationQuestionSlot = {
  id: string;
  question: string;
  strategy: "guided-llm-meta" | "template";
};

export type HydrationBranchIntent = {
  branch_id: string;
  intent_id: string;
  description: string;
  source_kind: "text" | "file";
  source_value: string;
  priority?: "high" | "medium" | "low";
  scope?: string;
};

export type HydrationBranchIntentCollection = {
  schema: "tonic-branch-intents";
  pipeline_version: string;
  branch_intents: HydrationBranchIntent[];
};

export type HydrationQuestionPlan = {
  schema: "tonic-hydration-question-plan";
  pipeline_version: string;
  downstream_task: string;
  max_questions: number;
  branch_intent_count: number;
  question_slots: HydrationQuestionSlot[];
};

export type HydrationRetrievalHit = {
  path: string;
  chunk_id: string;
  score: number;
  content: string;
  start_line?: number;
  end_line?: number;
  symbol?: string;
};

export type HydrationAstNodeKind =
  | "module"
  | "class"
  | "function"
  | "method"
  | "span";

export type HydrationRetrievalAstCandidate = {
  ast_node_id: string;
  path: string;
  score: number;
  rule_id?: string;
  node_kind?: HydrationAstNodeKind;
  symbol?: string;
  start_line?: number;
  end_line?: number;
};

export type HydrationRetrievalBundle = {
  slot_id: string;
  question: string;
  vector_hits: HydrationRetrievalHit[];
  ast_candidates: HydrationRetrievalAstCandidate[];
};

export type HydrationFuzzyAlignmentCandidate = {
  ast_node_id: string;
  path: string;
  score: number;
  overlap_score?: number;
  token_score?: number;
  path_distance_score?: number;
};

export type HydrationCycleNode = {
  node_id: string;
  level: "branch" | "dependency" | "module" | "class" | "function" | "method" | "span";
  label: string;
  path?: string;
  symbol?: string;
  source_slot_ids: string[];
  status: "planned" | "hydrated" | "skipped";
};

export type HydrationCycleTarget = {
  target_id: string;
  level: HydrationCycleNode["level"];
  label: string;
  path?: string;
  symbol?: string;
  source_node_ids: string[];
};

export type HydrationCycleRecord = {
  cycle_number: number;
  targets: HydrationCycleTarget[];
  question_slots: HydrationQuestionSlot[];
  retrieval_bundles: HydrationRetrievalBundle[];
  retrieval_merge: HydrationRetrievalMerge;
  fuzzy_alignment: HydrationFuzzyAlignmentCandidate[];
  nodes_added: HydrationCycleNode[];
  stop_reason?: string;
};

export type HydrationCycleState = {
  schema: "tonic-hydration-cycle";
  pipeline_version: string;
  total_cycles: number;
  stop_reason: "no_new_targets" | "no_new_evidence" | "max_cycles" | "max_total_questions" | "max_total_chunks";
  nodes: HydrationCycleNode[];
  cycles: HydrationCycleRecord[];
};

export type HydrationMergedEvidence = {
  path: string;
  slot_ids: string[];
  chunk_ids: string[];
  ast_node_ids: string[];
};

export type HydrationRetrievalMerge = {
  schema: "tonic-hydration-retrieval-merge";
  pipeline_version: string;
  retrieval_bundles: HydrationRetrievalBundle[];
  evidence_by_path: HydrationMergedEvidence[];
};

export type HydrationConsolidatedPath = {
  path: string;
  support: number;
  slot_support: number;
  chunk_support: number;
  cycle_support: number;
  novelty_score: number;
};

export type HydrationConsolidatedSymbol = {
  symbol: string;
  path: string;
  support: number;
  avg_score: number;
};

export type HydrationIntentSupport = {
  intent_id: string;
  description: string;
  support_paths: string[];
  support_symbols: string[];
  support_score: number;
};

export type HydrationCycleDelta = {
  cycle_number: number;
  new_paths: string[];
  repeated_paths: string[];
  new_symbols: string[];
  repeated_symbols: string[];
  novelty_ratio: number;
};

export type HydrationCandidateTag = {
  key: string;
  value: string;
  support: number;
  confidence: "high" | "medium" | "low";
};

export type HydrationMetadataConsolidation = {
  schema: "tonic-hydration-metadata-consolidation";
  pipeline_version: string;
  paths_ranked: HydrationConsolidatedPath[];
  symbols_ranked: HydrationConsolidatedSymbol[];
  intent_support: HydrationIntentSupport[];
  cycle_deltas: HydrationCycleDelta[];
  candidate_tags: HydrationCandidateTag[];
};

export type HydrationArtifactPaths = {
  persistRoot: string;
  runRoot: string;
  indexStatePath: string;
};

export type HydrationStageStatus = "pending" | "running" | "completed" | "skipped" | "failed";

export type HydrationPipelineStageState = {
  stage_id: string;
  status: HydrationStageStatus;
  content_hash?: string;
  started_at?: string;
  finished_at?: string;
  error?: string;
};

export type HydrationPipelineArtifacts = {
  index_state_path: string;
  run_state_path: string;
  branch_intents_path?: string;
  question_plan_path?: string;
  hydration_cycle_path?: string;
  retrieval_path?: string;
  retrieval_merge_path?: string;
  metadata_consolidation_path?: string;
  hydration_result_path?: string;
  llm_transcript_path?: string;
};

export type HydrationPipelineRun = {
  schema: typeof HYDRATION_PIPELINE_SCHEMA;
  pipeline_version: string;
  run_id: string;
  repo_root: string;
  persist_root: string;
  vector_backend: VectorBackendKind;
  run_status: "planned" | "running" | "completed" | "skipped" | "failed";
  stages: HydrationPipelineStageState[];
  artifacts: HydrationPipelineArtifacts;
};

export type HydrationRunResult = {
  schema: typeof HYDRATION_INTENT_RESULT_SCHEMA;
  pipeline_version: string;
  run_id: string;
  repo_root: string;
  persist_root: string;
  run_root: string;
  vector_backend: VectorBackendKind;
  hydration_skipped: boolean;
  skip_reason?: HydrationSkipReason;
  tags_added: HydrationIntentTag[];
  rationale?: string;
  branch_intents?: HydrationBranchIntentCollection;
  question_plan?: HydrationQuestionPlan;
  question_slots?: HydrationQuestionSlot[];
  hydration_cycle?: HydrationCycleState;
  retrieval_bundles?: HydrationRetrievalBundle[];
  retrieval_merge?: HydrationRetrievalMerge;
  metadata_consolidation?: HydrationMetadataConsolidation;
  fuzzy_alignment?: HydrationFuzzyAlignmentCandidate[];
  pipeline_run?: HydrationPipelineRun;
  metadata?: Record<string, string | number | boolean | null>;
};
