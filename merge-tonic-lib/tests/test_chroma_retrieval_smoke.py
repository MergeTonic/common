"""Chroma retrieval path (requires running Chroma + TONIC_CHROMA_URL)."""

from __future__ import annotations

import os

import pytest

from tonic.hydration.retrieval import run_retrieval_for_hydrate


@pytest.mark.skipif(not (os.environ.get("TONIC_CHROMA_URL") or "").strip(), reason="TONIC_CHROMA_URL not set")
def test_chroma_retrieval_smoke_minimal(tmp_path) -> None:
    env = dict(os.environ)
    env["TONIC_RETRIEVAL_BACKEND"] = "chroma"
    (tmp_path / "smoke.ts").write_text("// smoke\n", encoding="utf-8")
    matches = [
        {
            "path": "smoke.ts",
            "rule_id": "r",
            "start": {"line": 1},
            "end": {"line": 1},
        }
    ]
    hits = run_retrieval_for_hydrate(
        repo_root=str(tmp_path),
        matches=matches,
        queries=["smoke"],
        top_k_per_query=4,
        conflict_regions=[],
        env=env,
    )
    assert isinstance(hits, list)
