"""Memory vector snapshot cache (parity with TS)."""

from __future__ import annotations

import json
from pathlib import Path

from tonic.hydration.embedding_fingerprint import embedding_fingerprint_from_env
from tonic.hydration.embedding_provider import HistogramEmbeddingProvider
from tonic.hydration.memory_vector_snapshot import (
    build_vector_records_with_cache,
    content_digest_utf8,
    load_memory_vector_index_from_path,
    resolve_vector_cache_options,
    save_memory_vector_index_to_path,
)


def test_content_digest_stable() -> None:
    assert len(content_digest_utf8("a\nb")) == 64


def test_resolve_vector_cache_options() -> None:
    assert resolve_vector_cache_options({}, path_override="") == ("", "off")
    assert resolve_vector_cache_options({}, path_override="/x") == ("/x", "readwrite")
    assert resolve_vector_cache_options({"TONIC_VECTOR_CACHE_PATH": "/p"}, path_override="") == ("/p", "readwrite")
    assert resolve_vector_cache_options(
        {"TONIC_VECTOR_CACHE_PATH": "/p", "TONIC_VECTOR_CACHE_MODE": "read"},
        path_override="",
    ) == ("/p", "read")


def test_embedding_fingerprint_histogram() -> None:
    assert embedding_fingerprint_from_env({}) == "histogram:dim=48"


def test_build_vector_cache_write_then_reuse(tmp_path: Path) -> None:
    (tmp_path / "a.ts").write_text("hello\n", encoding="utf-8")
    matches = [{"path": "a.ts", "rule_id": "r", "start": {"line": 1}, "end": {"line": 1}}]
    snap = tmp_path / "idx.json"
    env: dict[str, str] = {}
    emb = HistogramEmbeddingProvider()
    warns: list[dict[str, str]] = []

    build_vector_records_with_cache(
        repo_root=str(tmp_path),
        matches=matches,
        embedder=emb,
        env=env,
        cache_path=str(snap),
        cache_mode="write",
        warnings_out=warns,
    )
    assert snap.is_file()

    class Counting:
        def __init__(self, inner: HistogramEmbeddingProvider) -> None:
            self.inner = inner
            self.batches = 0

        def embed_batch(self, texts: list[str]) -> list[list[float]]:
            self.batches += 1
            return self.inner.embed_batch(texts)

    counting = Counting(HistogramEmbeddingProvider())
    build_vector_records_with_cache(
        repo_root=str(tmp_path),
        matches=matches,
        embedder=counting,
        env=env,
        cache_path=str(snap),
        cache_mode="readwrite",
        warnings_out=[],
    )
    assert counting.batches == 1


def test_round_trip_save_load(tmp_path: Path) -> None:
    from tonic.hydration.memory_index import text_to_embedding

    snap = tmp_path / "m.json"
    art = {
        "schema": "tonic-memory-vector-index",
        "version": "1",
        "embedding_fingerprint": "histogram:dim=48",
        "embedding_dim": 48,
        "digest_algorithm": "sha256",
        "records": [
            {
                "id": "a",
                "document": "x",
                "embedding": text_to_embedding("x"),
                "metadata": {"path": "p"},
                "content_digest": content_digest_utf8("x"),
            }
        ],
    }
    save_memory_vector_index_to_path(snap, art)
    got = load_memory_vector_index_from_path(snap)
    assert got is not None
    assert got["records"][0]["id"] == "a"


def test_run_memory_retrieval_vector_cache_hits_parity(tmp_path: Path) -> None:
    (tmp_path / "a.ts").write_text("// x\n", encoding="utf-8")
    matches = [{"path": "a.ts", "rule_id": "r", "start": {"line": 1}, "end": {"line": 1}}]
    snap = tmp_path / "idx.json"
    env: dict[str, str] = {}
    from tonic.hydration.retrieval import run_memory_retrieval_for_hydrate

    h1 = run_memory_retrieval_for_hydrate(
        repo_root=str(tmp_path),
        matches=matches,
        queries=["x", "y"],
        top_k_per_query=4,
        conflict_regions=[],
        env=env,
        vector_cache_path=str(snap),
        vector_cache_mode="write",
    )
    h2 = run_memory_retrieval_for_hydrate(
        repo_root=str(tmp_path),
        matches=matches,
        queries=["x", "y"],
        top_k_per_query=4,
        conflict_regions=[],
        env=env,
        vector_cache_path=str(snap),
        vector_cache_mode="read",
    )
    assert json.dumps(h1, sort_keys=True) == json.dumps(h2, sort_keys=True)
