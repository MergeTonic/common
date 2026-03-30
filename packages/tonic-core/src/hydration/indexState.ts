import * as fs from "node:fs";
import * as path from "node:path";

import { HYDRATION_PIPELINE_VERSION } from "./types";

export const HYDRATION_INDEX_STATE_SCHEMA = "tonic-hydration-index-state";
export const HYDRATION_INDEX_STATE_COMPATIBILITY_VERSION = "1";

export type HydrationIndexState = {
  schema: typeof HYDRATION_INDEX_STATE_SCHEMA;
  pipeline_version: string;
  compatibility_version: string;
  collection_name: string;
  vector_backend: string;
  embedder_model: string;
  chunker_version: string;
  strategy_id: string;
  repo_root: string;
  cache_key?: string;
  pr_scope_hash?: string;
  scope?: string;
  prompt_profile?: string;
  dry_run?: boolean;
  historical_since?: string;
  historical_base_ref?: string;
  historical_state?: "merged" | "open" | "all";
  normative_commit?: string;
  updated_at: string;
  indexed_files: Record<
    string,
    {
      content_hash: string;
      chunk_ids: string[];
      chunk_count: number;
      size_bytes: number;
    }
  >;
};

export function createHydrationIndexState(params: {
  collectionName: string;
  vectorBackend: string;
  embedderModel: string;
  chunkerVersion: string;
  strategyId: string;
  repoRoot: string;
  cacheKey?: string;
  prScopeHash?: string;
  scope?: string;
  promptProfile?: string;
  dryRun?: boolean;
  historicalSince?: string;
  historicalBaseRef?: string;
  historicalState?: "merged" | "open" | "all";
  normativeCommit?: string;
  indexedFiles?: HydrationIndexState["indexed_files"];
}): HydrationIndexState {
  return {
    schema: HYDRATION_INDEX_STATE_SCHEMA,
    pipeline_version: HYDRATION_PIPELINE_VERSION,
    compatibility_version: HYDRATION_INDEX_STATE_COMPATIBILITY_VERSION,
    collection_name: params.collectionName,
    vector_backend: params.vectorBackend,
    embedder_model: params.embedderModel,
    chunker_version: params.chunkerVersion,
    strategy_id: params.strategyId,
    repo_root: params.repoRoot,
    cache_key: params.cacheKey,
    pr_scope_hash: params.prScopeHash,
    scope: params.scope,
    prompt_profile: params.promptProfile,
    dry_run: params.dryRun,
    historical_since: params.historicalSince,
    historical_base_ref: params.historicalBaseRef,
    historical_state: params.historicalState,
    normative_commit: params.normativeCommit,
    updated_at: new Date().toISOString(),
    indexed_files: params.indexedFiles ?? {},
  };
}

export function loadHydrationIndexState(filePath: string): HydrationIndexState | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as Partial<HydrationIndexState>;
  return {
    schema: HYDRATION_INDEX_STATE_SCHEMA,
    pipeline_version: parsed.pipeline_version ?? HYDRATION_PIPELINE_VERSION,
    compatibility_version:
      parsed.compatibility_version ?? HYDRATION_INDEX_STATE_COMPATIBILITY_VERSION,
    collection_name: parsed.collection_name ?? "",
    vector_backend: parsed.vector_backend ?? "",
    embedder_model: parsed.embedder_model ?? "",
    chunker_version: parsed.chunker_version ?? "",
    strategy_id: parsed.strategy_id ?? "",
    repo_root: parsed.repo_root ?? "",
    cache_key: parsed.cache_key,
    pr_scope_hash: parsed.pr_scope_hash,
    scope: parsed.scope,
    prompt_profile: parsed.prompt_profile,
    dry_run: parsed.dry_run,
    historical_since: parsed.historical_since,
    historical_base_ref: parsed.historical_base_ref,
    historical_state: parsed.historical_state,
    normative_commit: parsed.normative_commit,
    updated_at: parsed.updated_at ?? "",
    indexed_files: parsed.indexed_files ?? {},
  };
}

export function saveHydrationIndexState(filePath: string, state: HydrationIndexState): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2) + "\n", "utf8");
}

export function isHydrationIndexStateCompatible(
  state: HydrationIndexState | null,
  params: {
    collectionName: string;
    vectorBackend: string;
    embedderModel: string;
    chunkerVersion: string;
    strategyId: string;
    repoRoot: string;
    cacheKey?: string;
    scope?: string;
    promptProfile?: string;
    dryRun?: boolean;
    historicalSince?: string;
    historicalBaseRef?: string;
    historicalState?: "merged" | "open" | "all";
  },
): boolean {
  if (!state) {
    return false;
  }
  return (
    state.schema === HYDRATION_INDEX_STATE_SCHEMA &&
    state.compatibility_version === HYDRATION_INDEX_STATE_COMPATIBILITY_VERSION &&
    state.collection_name === params.collectionName &&
    state.vector_backend === params.vectorBackend &&
    state.embedder_model === params.embedderModel &&
    state.chunker_version === params.chunkerVersion &&
    state.strategy_id === params.strategyId &&
    state.repo_root === params.repoRoot &&
    (params.cacheKey ? state.cache_key === params.cacheKey : true) &&
    (params.scope ? state.scope === params.scope : true) &&
    (params.promptProfile ? state.prompt_profile === params.promptProfile : true) &&
    (params.dryRun !== undefined ? state.dry_run === params.dryRun : true) &&
    (params.historicalSince ? state.historical_since === params.historicalSince : true) &&
    (params.historicalBaseRef ? state.historical_base_ref === params.historicalBaseRef : true) &&
    (params.historicalState ? state.historical_state === params.historicalState : true)
  );
}
