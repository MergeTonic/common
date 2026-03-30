from pathlib import Path
import shutil
import subprocess

import pytest

from tonic.hydration import (
    DeterministicFakeEmbedder,
    HydrationIndexer,
    HydrationRepository,
    LineTokenEstimateChunker,
    MemoryVectorIndex,
    load_hydration_index_state,
    resolve_hydration_artifact_paths,
)


pytestmark = pytest.mark.skipif(shutil.which("git") is None, reason="git is required")


def _make_repo(name: str) -> Path:
    temp_root = Path("tests/_tmp_indexer")
    temp_root.mkdir(parents=True, exist_ok=True)
    repo_root = temp_root / name
    shutil.rmtree(repo_root, ignore_errors=True)
    repo_root.mkdir(parents=True, exist_ok=True)
    subprocess.run(["git", "init"], cwd=repo_root, check=True, capture_output=True)
    (repo_root / ".gitignore").write_text("ignored.txt\n*.pem\n", encoding="utf-8")
    return repo_root


def test_hydration_repository_respects_gitignore_and_secret_filters():
    repo_root = _make_repo("hydration-repo")
    (repo_root / "src").mkdir(parents=True, exist_ok=True)
    (repo_root / "src" / "app.ts").write_text("export const ok = true;\n", encoding="utf-8")
    (repo_root / "ignored.txt").write_text("ignore me\n", encoding="utf-8")
    (repo_root / ".env").write_text("TOKEN=secret\n", encoding="utf-8")
    (repo_root / "cert.pem").write_text("pem\n", encoding="utf-8")

    repository = HydrationRepository(repo_root)
    files = [entry.relative_path for entry in repository.read_indexable_files()]

    assert files == ["src/app.ts"]


def test_hydration_indexer_performs_incremental_sync_and_persists_state():
    repo_root = _make_repo("hydration-indexer")
    (repo_root / "src").mkdir(parents=True, exist_ok=True)
    (repo_root / "src" / "app.ts").write_text("one\ntwo\nthree\n", encoding="utf-8")
    (repo_root / "src" / "util.ts").write_text("helper\n", encoding="utf-8")
    (repo_root / "src" / "symbol.ts").write_text("export function resolveAuth() {\n  return true;\n}\n", encoding="utf-8")

    index = MemoryVectorIndex("demo-hydration")
    indexer = HydrationIndexer(
        str(repo_root),
        index,
        DeterministicFakeEmbedder(dimensions=8),
        chunker=LineTokenEstimateChunker(max_lines_per_chunk=2, max_estimated_tokens=20),
    )

    first = indexer.sync(vector_backend="memory", normative_commit="abc123")
    assert first.added_files == 3
    assert first.updated_files == 0
    assert first.removed_files == 0
    assert first.indexed_chunks >= 4

    state_path = resolve_hydration_artifact_paths(repo_root).index_state_path
    state_after_first = load_hydration_index_state(state_path)
    assert state_after_first is not None
    removed_chunk_ids = list(state_after_first.indexed_files["src/util.ts"]["chunk_ids"])
    old_app_chunk_ids = list(state_after_first.indexed_files["src/app.ts"]["chunk_ids"])
    symbol_chunk_ids = list(state_after_first.indexed_files["src/symbol.ts"]["chunk_ids"])
    symbol_records = index.get_by_ids(symbol_chunk_ids)
    assert any((record.metadata.get("symbol") or "") == "resolveAuth" for record in symbol_records)

    (repo_root / "src" / "app.ts").write_text("one\ntwo updated\nthree\n", encoding="utf-8")
    (repo_root / "src" / "util.ts").unlink()

    second = indexer.sync(vector_backend="memory", normative_commit="def456")
    assert second.added_files == 0
    assert second.updated_files == 1
    assert second.removed_files == 1
    assert second.unchanged_files == 1
    assert second.deleted_chunks >= len(removed_chunk_ids) + len(old_app_chunk_ids)

    state_after_second = load_hydration_index_state(state_path)
    assert state_after_second is not None
    assert state_after_second.normative_commit == "def456"
    assert "src/util.ts" not in state_after_second.indexed_files
    new_app_chunk_ids = list(state_after_second.indexed_files["src/app.ts"]["chunk_ids"])
    assert index.get_by_ids(removed_chunk_ids) == []
    stale_app_chunk_ids = [chunk_id for chunk_id in old_app_chunk_ids if chunk_id not in new_app_chunk_ids]
    assert index.get_by_ids(stale_app_chunk_ids) == []
