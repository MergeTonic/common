"""Minimal Chroma HTTP v1 client (stdlib only)."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any


def _req(method: str, url: str, body: dict[str, Any] | None = None, timeout: int = 60) -> Any:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json"} if body is not None else {}
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Chroma HTTP {e.code} {url}: {e.read()[:400]!r}") from e


def chroma_get_collection(base: str, collection_id: str) -> dict[str, Any]:
    base = base.rstrip("/")
    got = _req("GET", f"{base}/api/v1/collections/{collection_id}")
    return got if isinstance(got, dict) else {}


def chroma_get_or_create_collection_id(
    base: str, collection: str, *, embedding_dim: int | None = None
) -> str:
    base = base.rstrip("/")
    listed = _req("GET", f"{base}/api/v1/collections")
    rows = listed.get("data") if isinstance(listed, dict) else listed
    if isinstance(rows, list):
        for row in rows:
            if isinstance(row, dict) and row.get("name") == collection and row.get("id"):
                cid = str(row["id"])
                if embedding_dim is not None and embedding_dim > 0:
                    detail = chroma_get_collection(base, cid)
                    md = detail.get("metadata") if isinstance(detail, dict) else None
                    prev = md.get("tonic:embedding_dim") if isinstance(md, dict) else None
                    if prev is not None and int(prev) != embedding_dim:
                        raise RuntimeError(
                            f"Chroma collection {collection!r}: embedding dimension mismatch "
                            f"(stored {prev}, current embedder {embedding_dim}). "
                            f"Set TONIC_CHROMA_COLLECTION to a new name or delete the collection."
                        )
                return cid
    meta: dict[str, Any] = {"hnsw:space": "cosine"}
    if embedding_dim is not None and embedding_dim > 0:
        meta["tonic:embedding_dim"] = embedding_dim
    created = _req(
        "POST",
        f"{base}/api/v1/collections",
        {"name": collection, "metadata": meta},
    )
    cid = created.get("id") if isinstance(created, dict) else None
    if not cid:
        raise RuntimeError("Chroma: create collection missing id")
    return str(cid)


def chroma_add(
    base: str,
    collection_id: str,
    *,
    ids: list[str],
    embeddings: list[list[float]],
    documents: list[str],
    metadatas: list[dict[str, Any]],
) -> None:
    base = base.rstrip("/")
    _req(
        "POST",
        f"{base}/api/v1/collections/{collection_id}/add",
        {
            "ids": ids,
            "embeddings": embeddings,
            "documents": documents,
            "metadatas": metadatas,
        },
    )


def chroma_delete_ids(base: str, collection_id: str, ids: list[str]) -> None:
    if not ids:
        return
    base = base.rstrip("/")
    _req("POST", f"{base}/api/v1/collections/{collection_id}/delete", {"ids": ids})


def chroma_query(
    base: str, collection_id: str, query_embedding: list[float], n_results: int
) -> dict[str, Any]:
    base = base.rstrip("/")
    return _req(
        "POST",
        f"{base}/api/v1/collections/{collection_id}/query",
        {
            "query_embeddings": [query_embedding],
            "n_results": n_results,
            "include": ["documents", "metadatas", "distances"],
        },
    )
