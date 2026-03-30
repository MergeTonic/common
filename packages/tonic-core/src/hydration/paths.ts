import * as path from "node:path";

import type { HydrationArtifactPaths } from "./types";

export const DEFAULT_TONIC_DIR_NAME = ".tonic";
export const DEFAULT_CHROMA_DIR_NAME = "chroma_db";
export const DEFAULT_HYDRATION_RUNS_DIR_NAME = "hydration-runs";
export const DEFAULT_INDEX_STATE_FILE_NAME = "index-state.json";

export type HydrationPathOptions = {
  tonicDirName?: string;
  chromaDirName?: string;
  runDirName?: string;
  indexStateFileName?: string;
};

export function resolveHydrationArtifactPaths(
  repoRoot: string,
  opts: HydrationPathOptions = {},
): HydrationArtifactPaths {
  const tonicRoot = path.resolve(repoRoot, opts.tonicDirName ?? DEFAULT_TONIC_DIR_NAME);
  const persistRoot = path.join(tonicRoot, opts.chromaDirName ?? DEFAULT_CHROMA_DIR_NAME);
  const runRoot = path.join(tonicRoot, opts.runDirName ?? DEFAULT_HYDRATION_RUNS_DIR_NAME);
  const indexStatePath = path.join(
    persistRoot,
    opts.indexStateFileName ?? DEFAULT_INDEX_STATE_FILE_NAME,
  );
  return {
    persistRoot,
    runRoot,
    indexStatePath,
  };
}
