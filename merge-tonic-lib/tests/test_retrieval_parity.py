"""Memory retrieval helper parity smoke (TS runMemoryRetrievalForHydrate equivalent)."""

from __future__ import annotations

from pathlib import Path

from tonic.hydration.retrieval import run_memory_retrieval_for_hydrate


def test_run_memory_retrieval_returns_hits(tmp_path: Path) -> None:
    (tmp_path / "a.ts").write_text("hello world\nsecond\n", encoding="utf-8")
    matches = [{"path": "a.ts", "rule_id": "r", "start": {"line": 1}, "end": {"line": 2}}]
    hits = run_memory_retrieval_for_hydrate(
        repo_root=str(tmp_path),
        matches=matches,
        queries=["hello", "world"],
        top_k_per_query=4,
        conflict_regions=[],
    )
    assert len(hits) >= 1
    assert all("chunk_id" in h for h in hits)
