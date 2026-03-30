"""In-memory vector index for tests and fallback development flows."""

from __future__ import annotations

from dataclasses import dataclass, field
from math import sqrt

from .vector_index import VectorFilter, VectorRecord, VectorSearchResult


def _cosine_similarity(left: list[float], right: list[float]) -> float:
    dot = 0.0
    norm_left = 0.0
    norm_right = 0.0
    for i in range(max(len(left), len(right))):
        lv = left[i] if i < len(left) else 0.0
        rv = right[i] if i < len(right) else 0.0
        dot += lv * rv
        norm_left += lv * lv
        norm_right += rv * rv
    if norm_left == 0 or norm_right == 0:
        return 0.0
    return dot / (sqrt(norm_left) * sqrt(norm_right))


def _matches_filter(metadata: dict[str, object], filter: VectorFilter | None) -> bool:
    if not filter:
        return True
    return all(metadata.get(key) == value for key, value in filter.items())


@dataclass
class MemoryVectorIndex:
    collection_name: str
    backend: str = "memory"
    _records: dict[str, VectorRecord] = field(default_factory=dict)

    def upsert(self, records: list[VectorRecord]) -> None:
        for record in records:
            self._records[record.id] = record

    def similarity_search(
        self,
        query_embedding: list[float],
        limit: int,
        *,
        filter: VectorFilter | None = None,
    ) -> list[VectorSearchResult]:
        ranked = [
            VectorSearchResult(
                id=record.id,
                document=record.document,
                metadata=record.metadata,
                embedding=record.embedding,
                score=_cosine_similarity(query_embedding, record.embedding),
            )
            for record in self._records.values()
            if _matches_filter(record.metadata, filter)
        ]
        ranked.sort(key=lambda row: row.score, reverse=True)
        return ranked[: max(0, limit)]

    def get_by_ids(self, ids: list[str]) -> list[VectorSearchResult]:
        out: list[VectorSearchResult] = []
        for id_ in ids:
            record = self._records.get(id_)
            if record is None:
                continue
            out.append(
                VectorSearchResult(
                    id=record.id,
                    document=record.document,
                    metadata=record.metadata,
                    embedding=record.embedding,
                    score=1.0,
                )
            )
        return out

    def delete(self, *, ids: list[str] | None = None, filter: VectorFilter | None = None) -> None:
        if ids:
            for id_ in ids:
                self._records.pop(id_, None)
            return
        if filter:
            doomed = [id_ for id_, record in self._records.items() if _matches_filter(record.metadata, filter)]
            for id_ in doomed:
                self._records.pop(id_, None)
