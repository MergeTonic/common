/**
 * Stable fingerprint for the active embedding configuration (env parity with
 * {@link resolveEmbeddingProvider}). Used to invalidate on-disk vector snapshots.
 */

const HISTOGRAM_DIM = 48;

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

/**
 * Returns a deterministic string for the embedder implied by `env`.
 * Must stay aligned with {@link resolveEmbeddingProvider}.
 */
export function embeddingFingerprintFromEnv(env: NodeJS.ProcessEnv): string {
  const backend = normBackend(env.TONIC_EMBEDDING_BACKEND);
  if (backend === "hf_inference") {
    const model =
      (env.TONIC_HF_EMBED_MODEL ?? "sentence-transformers/all-MiniLM-L6-v2").trim() ||
      "sentence-transformers/all-MiniLM-L6-v2";
    const urlOverride = (env.TONIC_HF_EMBED_INFERENCE_URL ?? "").trim();
    const provider = (env.TONIC_HF_INFERENCE_PROVIDER ?? "").trim();
    const bs = embeddingBatchSize(env);
    return `hf_inference:${model}:bs=${bs}:url=${urlOverride}:prov=${provider}`;
  }
  const baseUrl = (env.TONIC_EMBEDDING_BASE_URL ?? env.TONIC_LLAMACPP_URL ?? "").trim();
  const useHttp =
    backend === "openai_compatible" || (backend === "auto" && Boolean(baseUrl));
  if (!useHttp) {
    return `histogram:dim=${HISTOGRAM_DIM}`;
  }
  if (!baseUrl) {
    return `histogram:dim=${HISTOGRAM_DIM}`;
  }
  const model = (env.TONIC_EMBEDDING_MODEL ?? "text-embedding-3-small").trim() || "text-embedding-3-small";
  const bs = embeddingBatchSize(env);
  return `openai_compatible:${baseUrl}:model=${model}:bs=${bs}`;
}
