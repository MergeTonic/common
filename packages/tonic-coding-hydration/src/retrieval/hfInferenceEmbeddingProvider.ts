import type { EmbeddingProvider } from "./embeddingProvider";

export type HfInferenceEmbeddingProviderOptions = {
  model: string;
  batchSize?: number;
  fetchImpl?: typeof fetch;
  /** When set, overrides `TONIC_HF_EMBED_INFERENCE_URL` / default URL; use `{model}` placeholder. */
  inferenceUrlTemplate?: string;
  inferenceProvider?: string;
  /** Used with {@link hfEmbedInferenceRequestUrl} when `inferenceUrlTemplate` is omitted. */
  env?: NodeJS.ProcessEnv;
  resolveToken?: () => string;
  timeoutMs?: number;
};

/**
 * Resolves POST URL for HF feature-extraction style inference (parity with Python
 * `HfInferenceEmbeddingProvider` + `InferenceClient.feature_extraction`).
 * Default host matches public Inference API docs; override with `TONIC_HF_EMBED_INFERENCE_URL`.
 */
export function hfEmbedInferenceRequestUrl(model: string, env: NodeJS.ProcessEnv): string {
  const raw = (env.TONIC_HF_EMBED_INFERENCE_URL ?? "").trim();
  if (raw) {
    if (raw.includes("{model}")) {
      return raw.split("{model}").join(encodeURIComponent(model));
    }
    return raw;
  }
  return `https://api-inference.huggingface.co/models/${encodeURIComponent(model)}`;
}

function normalizeFeatureExtractionPayload(raw: unknown): number[] {
  if (Array.isArray(raw) && raw.length > 0) {
    const first = raw[0];
    if (typeof first === "number") {
      return raw.map((x) => Number(x));
    }
    if (Array.isArray(first) && first.length > 0 && typeof first[0] === "number") {
      return (first as unknown[]).map((x) => Number(x));
    }
  }
  throw new Error("hf_inference: unexpected feature_extraction shape");
}

/**
 * Hugging Face Inference API embeddings via `fetch` (no npm HF client).
 */
export class HfInferenceEmbeddingProvider implements EmbeddingProvider {
  private readonly model: string;
  private readonly batchSize: number;
  private readonly fetchImpl: typeof fetch;
  private readonly inferenceUrlTemplate: string | undefined;
  private readonly inferenceProvider: string;
  private readonly env: NodeJS.ProcessEnv;
  private readonly resolveToken: () => string;
  private readonly timeoutMs: number;

  constructor(opts: HfInferenceEmbeddingProviderOptions) {
    this.model = opts.model.trim();
    this.batchSize = Math.max(1, opts.batchSize ?? 32);
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    this.inferenceUrlTemplate = opts.inferenceUrlTemplate?.trim() || undefined;
    this.inferenceProvider = (opts.inferenceProvider ?? "").trim();
    this.env = opts.env ?? (typeof process !== "undefined" ? process.env : {});
    this.resolveToken =
      opts.resolveToken ??
      (() => (typeof process !== "undefined" ? String(process.env.HF_TOKEN ?? "").trim() : ""));
    this.timeoutMs = opts.timeoutMs ?? 120_000;
  }

  private requestUrl(): string {
    const base = this.inferenceUrlTemplate
      ? this.inferenceUrlTemplate.includes("{model}")
        ? this.inferenceUrlTemplate.split("{model}").join(encodeURIComponent(this.model))
        : this.inferenceUrlTemplate
      : hfEmbedInferenceRequestUrl(this.model, this.env);
    if (!this.inferenceProvider) {
      return base;
    }
    try {
      const u = new URL(base);
      u.searchParams.set("provider", this.inferenceProvider);
      return u.href;
    } catch {
      const sep = base.includes("?") ? "&" : "?";
      return `${base}${sep}provider=${encodeURIComponent(this.inferenceProvider)}`;
    }
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const token = this.resolveToken();
    if (!token) {
      throw new Error("HF_TOKEN is required for TONIC_EMBEDDING_BACKEND=hf_inference");
    }
    const url = this.requestUrl();
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      for (const text of batch) {
        const res = await this.fetchImpl(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ inputs: text }),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (!res.ok) {
          const t = await res.text();
          throw new Error(`hf_inference: HTTP ${res.status} ${t.slice(0, 400)}`);
        }
        const raw: unknown = await res.json();
        out.push(normalizeFeatureExtractionPayload(raw));
      }
    }
    return out;
  }
}
