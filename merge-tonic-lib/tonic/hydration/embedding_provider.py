"""Embedding backends for retrieval (parity with @mergetonic/coding-hydration)."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any, Protocol

from tonic.hydration.memory_index import text_to_embedding


class EmbeddingProvider(Protocol):
    def embed_batch(self, texts: list[str]) -> list[list[float]]: ...


class HistogramEmbeddingProvider:
    def embed_batch(self, texts: list[str]) -> list[list[float]]:
        return [text_to_embedding(t) for t in texts]


class HfInferenceEmbeddingProvider:
    """Hugging Face Inference Providers / InferenceClient feature extraction."""

    def __init__(self, *, model: str, batch_size: int = 8) -> None:
        self._model = model.strip()
        self._batch_size = max(1, batch_size)

    def embed_batch(self, texts: list[str]) -> list[list[float]]:
        from huggingface_hub import InferenceClient

        token = (os.environ.get("HF_TOKEN") or "").strip()
        if not token:
            raise RuntimeError("HF_TOKEN is required for TONIC_EMBEDDING_BACKEND=hf_inference")
        provider = (os.environ.get("TONIC_HF_INFERENCE_PROVIDER") or "").strip() or None
        client = InferenceClient(api_key=token, provider=provider)
        out: list[list[float]] = []
        for i in range(0, len(texts), self._batch_size):
            batch = texts[i : i + self._batch_size]
            for t in batch:
                vec = client.feature_extraction(t, model=self._model)
                if isinstance(vec, list) and vec and isinstance(vec[0], (int, float)):
                    out.append([float(x) for x in vec])
                elif isinstance(vec, list) and vec and isinstance(vec[0], list):
                    flat = vec[0]
                    out.append([float(x) for x in flat])
                else:
                    raise RuntimeError("hf_inference: unexpected feature_extraction shape")
        return out


class OpenAiCompatibleEmbeddingProvider:
    def __init__(
        self,
        *,
        base_url: str,
        model: str,
        api_key: str = "",
        batch_size: int = 32,
    ) -> None:
        self._base = base_url.rstrip("/")
        self._model = model
        self._api_key = api_key.strip()
        self._batch_size = max(1, batch_size)

    def embed_batch(self, texts: list[str]) -> list[list[float]]:
        out: list[list[float]] = []
        for i in range(0, len(texts), self._batch_size):
            batch = texts[i : i + self._batch_size]
            url = f"{self._base}/embeddings"
            body = json.dumps({"model": self._model, "input": batch}).encode("utf-8")
            headers = {"Content-Type": "application/json"}
            if self._api_key:
                headers["Authorization"] = f"Bearer {self._api_key}"
            req = urllib.request.Request(url, data=body, headers=headers, method="POST")
            try:
                with urllib.request.urlopen(req, timeout=120) as resp:
                    raw = json.loads(resp.read().decode("utf-8"))
            except urllib.error.HTTPError as e:
                raise RuntimeError(f"embeddings HTTP {e.code}: {e.read()[:400]!r}") from e
            rows = raw.get("data") or []
            if len(rows) != len(batch):
                raise RuntimeError(f"embeddings: expected {len(batch)} vectors, got {len(rows)}")
            dim = len(rows[0].get("embedding") or [])
            for row in rows:
                emb = row.get("embedding")
                if not isinstance(emb, list) or len(emb) != dim:
                    raise RuntimeError("embeddings: inconsistent vector lengths")
                out.append([float(x) for x in emb])
        return out


def _embedding_batch_size(env: dict[str, str]) -> int:
    try:
        n = int((env.get("TONIC_EMBEDDING_BATCH_SIZE") or "32").strip())
        return max(1, n)
    except ValueError:
        return 32


def _resolve_api_key(env: dict[str, str]) -> str:
    ev = (env.get("TONIC_EMBEDDING_API_KEY_ENV") or "").strip()
    if ev and env.get(ev):
        return str(env[ev])
    return (env.get("TONIC_EMBEDDING_API_KEY") or "").strip()


def resolve_embedding_provider(env: dict[str, str] | None = None) -> EmbeddingProvider:
    env = env or dict(os.environ)
    backend = (env.get("TONIC_EMBEDDING_BACKEND") or "auto").strip().lower()
    if backend in ("hf_inference", "hf-inference"):
        model = (env.get("TONIC_HF_EMBED_MODEL") or "sentence-transformers/all-MiniLM-L6-v2").strip()
        return HfInferenceEmbeddingProvider(model=model, batch_size=_embedding_batch_size(env))
    base = (env.get("TONIC_EMBEDDING_BASE_URL") or env.get("TONIC_LLAMACPP_URL") or "").strip()
    use_http = backend in ("openai_compatible", "openai-compatible") or (
        backend == "auto" and bool(base)
    )
    if not use_http or not base:
        return HistogramEmbeddingProvider()
    model = (env.get("TONIC_EMBEDDING_MODEL") or "text-embedding-3-small").strip() or "text-embedding-3-small"
    return OpenAiCompatibleEmbeddingProvider(
        base_url=base,
        model=model,
        api_key=_resolve_api_key(env),
        batch_size=_embedding_batch_size(env),
    )
