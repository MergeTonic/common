import { resolveHydrationArtifactPaths } from "./paths";
import { resolveHydrationRuntimeConfig, runtimeModeToBackend } from "./runtimeConfig";
import {
  HYDRATION_INTENT_RESULT_SCHEMA,
  HYDRATION_OPTIONAL_AI_EXIT_CODE,
  HYDRATION_PIPELINE_VERSION,
  type HydrationRunResult,
} from "./types";

export const HYDRATION_OPTIONAL_DEPENDENCY_GROUP = "ai";
export const HYDRATION_CHROMADB_NPM_PACKAGE = "chromadb";
export const HYDRATION_CHROMADB_VERSION = "0.5.23";
export const HYDRATION_CHROMADB_SERVER_IMAGE = `chromadb/chroma:${HYDRATION_CHROMADB_VERSION}`;

export type HydrationOptionalAiProbe = {
  available: boolean;
  packageName: string;
  installHint: string;
};

function tryRequire(moduleName: string): boolean {
  try {
    const req = Function("return require")() as (name: string) => unknown;
    req(moduleName);
    return true;
  } catch {
    return false;
  }
}

export function probeHydrationOptionalAiDependency(): HydrationOptionalAiProbe {
  const packageName = HYDRATION_CHROMADB_NPM_PACKAGE;
  const available = tryRequire(packageName);
  return {
    available,
    packageName,
    installHint: available ?
      ""
    : `Install optional npm dependency '${packageName}@${HYDRATION_CHROMADB_VERSION}' before using non-memory hydration backends.`,
  };
}

export function buildMissingOptionalAiDependencySkipResult(
  repoRoot: string,
  rationale?: string,
): HydrationRunResult {
  const artifacts = resolveHydrationArtifactPaths(repoRoot);
  const runtime = resolveHydrationRuntimeConfig(repoRoot);
  return {
    schema: HYDRATION_INTENT_RESULT_SCHEMA,
    pipeline_version: HYDRATION_PIPELINE_VERSION,
    run_id: "hydrate-intents-skip",
    repo_root: repoRoot,
    persist_root: artifacts.persistRoot,
    run_root: artifacts.runRoot,
    vector_backend: runtimeModeToBackend(runtime.mode),
    hydration_skipped: true,
    skip_reason: "missing_optional_ai_dependencies",
    tags_added: [],
    rationale: rationale ?? "",
    metadata: {
      optional_dependency_group: HYDRATION_OPTIONAL_DEPENDENCY_GROUP,
      missing_package: HYDRATION_CHROMADB_NPM_PACKAGE,
      expected_package_version: HYDRATION_CHROMADB_VERSION,
      expected_server_image: HYDRATION_CHROMADB_SERVER_IMAGE,
      skip_exit_code: HYDRATION_OPTIONAL_AI_EXIT_CODE,
    },
  };
}
