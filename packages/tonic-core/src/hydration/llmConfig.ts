export type HydrationLlmMode = "deterministic" | "openai";

export type HydrationLlmConfig = {
  mode: HydrationLlmMode;
  model: string;
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
};

function normalizeMode(raw: string | undefined): HydrationLlmMode {
  const value = (raw ?? "deterministic").trim().toLowerCase();
  if (value === "openai") {
    return "openai";
  }
  return "deterministic";
}

export function resolveHydrationLlmConfig(
  env: NodeJS.ProcessEnv = process.env,
): HydrationLlmConfig {
  const timeoutRaw = Number.parseInt((env.TONIC_HYDRATION_LLM_TIMEOUT_MS ?? "").trim(), 10);
  return {
    mode: normalizeMode(env.TONIC_HYDRATION_LLM_MODE),
    model: (env.TONIC_HYDRATION_LLM_MODEL ?? "gpt-4o-mini").trim(),
    baseUrl: (env.TONIC_HYDRATION_LLM_BASE_URL ?? "https://api.openai.com/v1").trim().replace(/\/+$/, ""),
    apiKey: (env.TONIC_HYDRATION_LLM_API_KEY ?? env.OPENAI_API_KEY ?? "").trim(),
    timeoutMs: Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : 30_000,
  };
}

