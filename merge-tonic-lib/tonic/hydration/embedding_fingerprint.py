"""Stable embedding config fingerprint (parity with TS embeddingFingerprintFromEnv)."""

from __future__ import annotations

HISTOGRAM_DIM = 48


def _embedding_batch_size(env: dict[str, str]) -> int:
    try:
        n = int((env.get("TONIC_EMBEDDING_BATCH_SIZE") or "32").strip())
        return max(1, n)
    except ValueError:
        return 32


def embedding_fingerprint_from_env(env: dict[str, str]) -> str:
    backend = (env.get("TONIC_EMBEDDING_BACKEND") or "auto").strip().lower()
    if backend in ("hf_inference", "hf-inference"):
        model = (env.get("TONIC_HF_EMBED_MODEL") or "sentence-transformers/all-MiniLM-L6-v2").strip() or (
            "sentence-transformers/all-MiniLM-L6-v2"
        )
        url_override = (env.get("TONIC_HF_EMBED_INFERENCE_URL") or "").strip()
        provider = (env.get("TONIC_HF_INFERENCE_PROVIDER") or "").strip()
        bs = _embedding_batch_size(env)
        return f"hf_inference:{model}:bs={bs}:url={url_override}:prov={provider}"
    base = (env.get("TONIC_EMBEDDING_BASE_URL") or env.get("TONIC_LLAMACPP_URL") or "").strip()
    use_http = backend in ("openai_compatible", "openai-compatible") or (backend == "auto" and bool(base))
    if not use_http or not base:
        return f"histogram:dim={HISTOGRAM_DIM}"
    model = (env.get("TONIC_EMBEDDING_MODEL") or "text-embedding-3-small").strip() or "text-embedding-3-small"
    bs = _embedding_batch_size(env)
    return f"openai_compatible:{base}:model={model}:bs={bs}"
