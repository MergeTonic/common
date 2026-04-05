import {
  HistogramEmbeddingProvider,
  OpenAiCompatibleEmbeddingProvider,
  type EmbeddingProvider,
} from "./embeddingProvider";
import { HfInferenceEmbeddingProvider } from "./hfInferenceEmbeddingProvider";

function normBackend(raw: string | undefined): "auto" | "histogram" | "openai_compatible" | "hf_inference" {
  const v = (raw ?? "auto").trim().toLowerCase();
  if (v === "hf_inference" || v === "hf-inference") {
    return "hf_inference";
  }
  if (v === "histogram" || v === "openai_compatible" || v === "openai-compatible") {
    return v === "openai-compatible" ? "openai_compatible" : v;
  }
  return "auto";
}

function embeddingBatchSize(env: NodeJS.ProcessEnv): number {
  const n = parseInt(env.TONIC_EMBEDDING_BATCH_SIZE ?? "32", 10);
  return Number.isFinite(n) && n > 0 ? n : 32;
}

function resolveApiKey(env: NodeJS.ProcessEnv): string {
  const envVar = (env.TONIC_EMBEDDING_API_KEY_ENV ?? "").trim();
  if (envVar && env[envVar]) {
    return String(env[envVar]);
  }
  return (env.TONIC_EMBEDDING_API_KEY ?? "").trim();
}

/**
 * TONIC_EMBEDDING_BACKEND: auto | histogram | openai_compatible | hf_inference.
 * auto: HTTP if TONIC_EMBEDDING_BASE_URL (or TONIC_LLAMACPP_URL) set, else histogram.
 * hf_inference: see env table in docs/retrieval-hydration.md (`HF_TOKEN`, `TONIC_HF_EMBED_MODEL`, …).
 */
export function resolveEmbeddingProvider(env: NodeJS.ProcessEnv = process.env): EmbeddingProvider {
  const backend = normBackend(env.TONIC_EMBEDDING_BACKEND);
  if (backend === "hf_inference") {
    const model =
      (env.TONIC_HF_EMBED_MODEL ?? "sentence-transformers/all-MiniLM-L6-v2").trim() ||
      "sentence-transformers/all-MiniLM-L6-v2";
    const urlOverride = (env.TONIC_HF_EMBED_INFERENCE_URL ?? "").trim();
    return new HfInferenceEmbeddingProvider({
      model,
      batchSize: embeddingBatchSize(env),
      fetchImpl: globalThis.fetch,
      inferenceUrlTemplate: urlOverride || undefined,
      inferenceProvider: (env.TONIC_HF_INFERENCE_PROVIDER ?? "").trim(),
      env,
      resolveToken: () => String(env.HF_TOKEN ?? "").trim(),
    });
  }
  const baseUrl = (env.TONIC_EMBEDDING_BASE_URL ?? env.TONIC_LLAMACPP_URL ?? "").trim();
  const useHttp =
    backend === "openai_compatible" || (backend === "auto" && Boolean(baseUrl));
  if (!useHttp) {
    return new HistogramEmbeddingProvider();
  }
  if (!baseUrl) {
    return new HistogramEmbeddingProvider();
  }
  const model = (env.TONIC_EMBEDDING_MODEL ?? "text-embedding-3-small").trim() || "text-embedding-3-small";
  return new OpenAiCompatibleEmbeddingProvider({
    baseUrl,
    model,
    apiKey: resolveApiKey(env),
    batchSize: embeddingBatchSize(env),
  });
}
