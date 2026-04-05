/** Exit codes shared by TS and Python ast-grep / hydrate CLIs. */
export const EXIT_OK = 0;
export const EXIT_AST_GREP_MISSING = 10;
export const EXIT_INVALID_ARGS = 11;
export const EXIT_SCAN_FAILED = 12;
export const EXIT_PARTIAL = 13;

export type RunStatus = "ok" | "partial" | "failed";

export type Position = { line: number; column: number };

export type NormalizedMatch = {
  rule_id: string;
  severity: "info" | "warning" | "error";
  language: string;
  path: string;
  start?: Position;
  end?: Position;
  message: string;
  meta: Record<string, unknown>;
};

export type AstGrepCliOptions = {
  repoRoot: string;
  /** Output path for tonic-ast-hydration JSON */
  outPath: string;
  /** Output path for tonic-hydration-run JSON */
  runOutPath: string;
  ruleset: string;
  configPath: string;
  rulePath: string;
  inlineRule: string;
  languages: string;
  includeGlobs: string[];
  excludeGlobs: string[];
  changedOnly: boolean;
  maxMatchesPerFile: number;
  maxMatchesPerRule: number;
  astGrepBin: string;
  extraArgs: string[];
};

export type AstGrepRunResult =
  | { kind: "missing_binary"; message: string }
  | { kind: "invalid_args"; message: string }
  | { kind: "exec_failed"; code: number | null; stderr: string }
  | { kind: "parse_failed"; message: string }
  | {
      kind: "ok";
      matches: NormalizedMatch[];
      toolVersion: string;
      warnings: Array<{ code: string; message: string; detail?: string }>;
      truncated: boolean;
    };

export type AstHydrationArtifactV1 = {
  schema: "tonic-ast-hydration";
  version: "1";
  tool: string;
  tool_version: string;
  repo_root: string;
  scan_scope: string;
  ruleset: string;
  languages: string[];
  summary: {
    match_count: number;
    files_with_matches: number;
    truncated: boolean;
  };
  matches: NormalizedMatch[];
};

export type HydrationRunArtifactV1 = {
  schema: "tonic-hydration-run";
  version: "1";
  run_id: string;
  status: RunStatus;
  exit_code: number;
  errors: Array<{ code: string; message: string; detail?: string }>;
  warnings: Array<{ code: string; message: string; detail?: string }>;
  inputs: Record<string, unknown>;
  timing_ms: number;
  ast_evidence_path: string | null;
  retrieval_path: string | null;
  tags_patch_path: string | null;
  code_walk_trace_path: string | null;
  intent_hydration_path: string | null;
  intent_bootstrap_path: string | null;
  question_refinement_path: string | null;
  conflict_context_path: string | null;
  repo_structure_path: string | null;
  prior_run_path: string | null;
  question_refinement_chain?: Array<{ pass_id: string; path: string }>;
  question_refinement_post_retrieval_path?: string | null;
  pipeline?: {
    stages: Array<{
      id: string;
      status: "ok" | "skipped" | "partial" | "failed";
      artifact_path?: string | null;
      started_at?: string;
      finished_at?: string;
      errors?: Array<Record<string, unknown>>;
    }>;
    source_config?: Record<string, unknown>;
  };
};
