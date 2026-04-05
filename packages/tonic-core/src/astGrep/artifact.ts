import * as fs from "node:fs";
import * as path from "node:path";

import type {
  AstHydrationArtifactV1,
  AstGrepCliOptions,
  HydrationRunArtifactV1,
  NormalizedMatch,
  RunStatus,
} from "./types";

function stableStringify(obj: unknown): string {
  return JSON.stringify(obj, null, 2) + "\n";
}

export function buildAstHydrationJson(params: {
  repoRoot: string;
  ruleset: string;
  languages: string[];
  scanScope: string;
  toolVersion: string;
  matches: NormalizedMatch[];
  truncated: boolean;
}): AstHydrationArtifactV1 {
  const files = new Set(params.matches.map((m) => m.path));
  return {
    schema: "tonic-ast-hydration",
    version: "1",
    tool: "ast-grep",
    tool_version: params.toolVersion,
    repo_root: params.repoRoot.replace(/\\/g, "/"),
    scan_scope: params.scanScope,
    ruleset: params.ruleset,
    languages: params.languages,
    summary: {
      match_count: params.matches.length,
      files_with_matches: files.size,
      truncated: params.truncated,
    },
    matches: params.matches,
  };
}

export function buildRunJson(params: {
  runId: string;
  status: RunStatus;
  exitCode: number;
  errors: HydrationRunArtifactV1["errors"];
  warnings: HydrationRunArtifactV1["warnings"];
  inputs: Record<string, unknown>;
  timingMs: number;
  astEvidencePath: string | null;
  pipeline?: HydrationRunArtifactV1["pipeline"];
}): HydrationRunArtifactV1 {
  return {
    schema: "tonic-hydration-run",
    version: "1",
    run_id: params.runId,
    status: params.status,
    exit_code: params.exitCode,
    errors: params.errors,
    warnings: params.warnings,
    inputs: params.inputs,
    timing_ms: params.timingMs,
    ast_evidence_path: params.astEvidencePath,
    retrieval_path: null,
    tags_patch_path: null,
    code_walk_trace_path: null,
    intent_hydration_path: null,
    intent_bootstrap_path: null,
    question_refinement_path: null,
    conflict_context_path: null,
    repo_structure_path: null,
    prior_run_path: null,
    pipeline: params.pipeline,
  };
}

export function writeUtf8Json(filePath: string, obj: unknown): void {
  const abs = path.resolve(filePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, stableStringify(obj), "utf8");
}

export function summarizeAstInputs(opts: AstGrepCliOptions): Record<string, unknown> {
  return {
    repo: opts.repoRoot,
    ruleset: opts.ruleset,
    config: opts.configPath || null,
    rule: opts.rulePath || null,
    languages: opts.languages,
    changed_only: opts.changedOnly,
    max_matches_per_file: opts.maxMatchesPerFile,
    max_matches_per_rule: opts.maxMatchesPerRule,
  };
}
