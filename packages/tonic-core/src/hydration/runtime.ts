import { ChromaVectorIndex } from "./chromaVectorIndex";
import { probeHydrationChromaHeartbeat, type HydrationChromaHeartbeat } from "./chromaClient";
import { HydrationRuntimeError } from "./errors";
import { MemoryVectorIndex } from "./memoryVectorIndex";
import { resolveHydrationRuntimeConfig, runtimeModeToBackend, type HydrationRuntimeConfig } from "./runtimeConfig";
import type { VectorIndex } from "./vectorIndex";

export type HydrationRuntime = {
  backend: ReturnType<typeof runtimeModeToBackend>;
  index: VectorIndex;
  config: HydrationRuntimeConfig;
};

export async function probeHydrationRuntimeReadiness(
  repoRoot: string,
  env: NodeJS.ProcessEnv = process.env,
  overrides: Partial<HydrationRuntimeConfig> = {},
): Promise<HydrationChromaHeartbeat | null> {
  const config = resolveHydrationRuntimeConfig(repoRoot, env, overrides);
  if (config.mode !== "http") {
    return null;
  }
  return probeHydrationChromaHeartbeat(config);
}

export async function createHydrationRuntime(
  repoRoot: string,
  env: NodeJS.ProcessEnv = process.env,
  overrides: Partial<HydrationRuntimeConfig> = {},
): Promise<HydrationRuntime> {
  const config = resolveHydrationRuntimeConfig(repoRoot, env, overrides);
  const backend = runtimeModeToBackend(config.mode);
  if (config.mode === "memory") {
    return {
      backend,
      config,
      index: new MemoryVectorIndex(config.collectionName),
    };
  }
  if (config.mode !== "http") {
    throw new HydrationRuntimeError(
      `TypeScript hydration currently supports Chroma only through HTTP mode. Received TONIC_CHROMA_MODE=${config.mode}.`,
    );
  }
  return {
    backend,
    config,
    index: new ChromaVectorIndex(config),
  };
}
