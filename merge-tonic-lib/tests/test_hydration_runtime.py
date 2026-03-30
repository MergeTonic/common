from pathlib import Path

from tonic.hydration import (
    DeterministicFakeEmbedder,
    MemoryVectorIndex,
    VectorRecord,
    create_hydration_index_state,
    create_hydration_runtime,
    default_hydration_collection_name,
    resolve_hydration_runtime_config,
    runtime_mode_to_backend,
)


TEST_ROOT = Path("tests/_tmp_runtime")


def _workspace_tmp(name: str) -> Path:
    path = TEST_ROOT / name
    path.mkdir(parents=True, exist_ok=True)
    return path


def test_default_hydration_collection_name_sanitizes_repo_name():
    repo_root = _workspace_tmp("collection_name") / "My Demo Repo"
    repo_root.mkdir(parents=True, exist_ok=True)
    assert default_hydration_collection_name(repo_root) == "my-demo-repo-hydration"


def test_resolve_hydration_runtime_config_defaults_to_http():
    cfg = resolve_hydration_runtime_config(_workspace_tmp("config_defaults"))
    assert cfg.mode == "http"
    assert cfg.url == "http://127.0.0.1:8000"
    assert str(cfg.persist_path).endswith(".tonic\\chroma_db") or str(cfg.persist_path).endswith(".tonic/chroma_db")
    assert runtime_mode_to_backend(cfg.mode) == "chroma-http"


def test_memory_vector_index_uses_deterministic_embedder():
    embedder = DeterministicFakeEmbedder(dimensions=8)
    docs = ["alpha auth flow", "database migrations", "auth token refresh"]
    embeddings = embedder.embed_documents(docs)
    index = MemoryVectorIndex("demo-hydration")
    index.upsert(
        [
            VectorRecord(
                id=f"doc-{i}",
                document=document,
                embedding=embeddings[i],
                metadata={"bucket": "db" if i == 1 else "auth"},
            )
            for i, document in enumerate(docs)
        ]
    )
    results = index.similarity_search(embedder.embed_query("auth flow"), 2, filter={"bucket": "auth"})
    assert len(results) == 2
    assert all(row.metadata["bucket"] == "auth" for row in results)


def test_create_hydration_runtime_memory_mode():
    runtime = create_hydration_runtime(str(_workspace_tmp("runtime_memory")), {"TONIC_CHROMA_MODE": "memory"})
    assert runtime.backend == "memory"
    assert runtime.index.backend == "memory"


def test_create_hydration_index_state_tracks_normative_commit():
    state = create_hydration_index_state(
        collection_name="demo-hydration",
        vector_backend="chroma-http",
        embedder_model="fake-v1",
        chunker_version="line-estimate-v1",
        strategy_id="incremental-content-hash",
        repo_root="/repo",
        normative_commit="abc123",
    )
    assert state.schema == "tonic-hydration-index-state"
    assert state.normative_commit == "abc123"
