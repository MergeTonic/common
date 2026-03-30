"""Vector index contracts used by hydration runtimes."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

VectorMetadataValue = str | int | float | bool | None
VectorMetadata = dict[str, VectorMetadataValue]
VectorFilter = dict[str, object]


@dataclass
class VectorRecord:
    id: str
    document: str
    embedding: list[float]
    metadata: VectorMetadata = field(default_factory=dict)


@dataclass
class VectorSearchResult:
    id: str
    document: str
    score: float
    metadata: VectorMetadata = field(default_factory=dict)
    embedding: list[float] | None = None


class VectorIndex(Protocol):
    @property
    def backend(self) -> str: ...

    @property
    def collection_name(self) -> str: ...

    def upsert(self, records: list[VectorRecord]) -> None: ...

    def similarity_search(
        self,
        query_embedding: list[float],
        limit: int,
        *,
        filter: VectorFilter | None = None,
    ) -> list[VectorSearchResult]: ...

    def get_by_ids(self, ids: list[str]) -> list[VectorSearchResult]: ...

    def delete(self, *, ids: list[str] | None = None, filter: VectorFilter | None = None) -> None: ...
