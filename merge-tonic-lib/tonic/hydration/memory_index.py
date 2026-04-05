"""In-memory vector index (cosine on hashed char embeddings; parity with TS memoryIndex)."""

from __future__ import annotations

import math
from typing import Any


def text_to_embedding(text: str, dim: int = 48) -> list[float]:
    lower = " ".join(text.lower().split())
    v = [0.0] * dim
    for ch in lower:
        v[ord(ch) % dim] += 1.0
    norm = math.sqrt(sum(x * x for x in v)) or 1.0
    return [x / norm for x in v]


def _dot(a: list[float], b: list[float]) -> float:
    n = min(len(a), len(b))
    return sum(a[i] * b[i] for i in range(n))


class MemoryVectorIndex:
    def __init__(self) -> None:
        self._store: dict[str, dict[str, Any]] = {}

    def upsert(self, records: list[dict[str, Any]]) -> None:
        for r in records:
            rid = str(r["id"])
            self._store[rid] = r

    def query(self, query_embedding: list[float], top_k: int) -> dict[str, Any]:
        entries = list(self._store.values())
        scored: list[tuple[float, dict[str, Any]]] = []
        for r in entries:
            emb = r.get("embedding")
            if isinstance(emb, list) and len(emb) == len(query_embedding):
                s = _dot(emb, query_embedding)
                scored.append((s, r))
            else:
                scored.append((0.0, r))
        scored.sort(key=lambda x: x[0], reverse=True)
        take = scored[:top_k]
        ids = [str(x[1]["id"]) for x in take]
        documents = [str(x[1].get("document", "")) for x in take]
        metadatas = [dict(x[1].get("metadata") or {}) for x in take]
        distances = [1.0 - x[0] for x in take]
        return {"ids": ids, "documents": documents, "metadatas": metadatas, "distances": distances}

    def delete_ids(self, ids: list[str]) -> None:
        for i in ids:
            self._store.pop(i, None)
