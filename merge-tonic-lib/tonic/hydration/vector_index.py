"""Vector index protocol for hydration retrieval backends."""

from __future__ import annotations

from typing import Any, Protocol


class VectorIndex(Protocol):
    def upsert(self, records: list[dict[str, Any]]) -> None: ...

    def query(self, query_embedding: list[float], top_k: int) -> dict[str, Any]: ...

    def delete_ids(self, ids: list[str]) -> None: ...
