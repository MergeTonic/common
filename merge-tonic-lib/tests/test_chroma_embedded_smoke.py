"""Optional chromadb client smoke (CI: python -m pip install -e '.[ai]')."""

from __future__ import annotations

import pytest

try:
    import chromadb  # noqa: F401
except Exception as exc:  # noqa: BLE001
    pytest.skip(f"chromadb not usable in this environment: {exc}", allow_module_level=True)


def test_chroma_ephemeral_collection_add_and_query() -> None:
    client = chromadb.Client()
    col = client.create_collection("tonic-hydration-ci")
    col.add(
        ids=["a1"],
        documents=["hello chroma"],
        metadatas=[{"path": "x.ts", "start_line": 1, "end_line": 2}],
    )
    res = col.query(query_texts=["hello"], n_results=1)
    assert res["ids"] and len(res["ids"][0]) == 1
