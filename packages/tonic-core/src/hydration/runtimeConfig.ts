import * as path from "node:path";

import { resolveHydrationArtifactPaths } from "./paths";
import type { VectorBackendKind } from "./types";

export type HydrationRuntimeMode = "http" | "persistent" | "ephemeral" | "memory";

export type HydrationRuntimeConfig = {
  mode: HydrationRuntimeMode;
  collectionName: string;
  persistPath: string;
  url: string;
  heartbeatPath: string;
};

function normalizeMode(raw: string | undefined): HydrationRuntimeMode {
  const value = (raw ?? "http").trim().toLowerCase();
  if (value === "persistent" || value === "ephemeral" || value === "memory") {
    return value;
  }
  return "http";
}

export function defaultHydrationCollectionName(repoRoot: string): string {
  const base = path.basename(path.resolve(repoRoot)).toLowerCase();
  const safe = base.replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${safe || "repo"}-hydration`;
}

export function resolveHydrationRuntimeConfig(
  repoRoot: string,
  env: NodeJS.ProcessEnv = process.env,
  overrides: Partial<Pick<HydrationRuntimeConfig, "collectionName" | "persistPath" | "url" | "heartbeatPath" | "mode">> = {},
): HydrationRuntimeConfig {
  const artifactPaths = resolveHydrationArtifactPaths(repoRoot);
  return {
    mode: overrides.mode ?? normalizeMode(env.TONIC_CHROMA_MODE),
    collectionName:
      overrides.collectionName
      ?? ((env.TONIC_CHROMA_COLLECTION ?? "").trim() || defaultHydrationCollectionName(repoRoot)),
    persistPath: overrides.persistPath ?? path.resolve(
      (env.TONIC_CHROMA_PERSIST_PATH ?? "").trim() || artifactPaths.persistRoot,
    ),
    url: overrides.url ?? (env.TONIC_CHROMA_URL ?? "http://127.0.0.1:8000").trim(),
    heartbeatPath: overrides.heartbeatPath ?? (env.TONIC_CHROMA_HEARTBEAT_PATH ?? "/api/v2/heartbeat").trim(),
  };
}

export function runtimeModeToBackend(mode: HydrationRuntimeMode): VectorBackendKind {
  if (mode === "memory") {
    return "memory";
  }
  if (mode === "persistent") {
    return "chroma-persistent";
  }
  if (mode === "ephemeral") {
    return "ephemeral";
  }
  return "chroma-http";
}
