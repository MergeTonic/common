"""Chroma-backed vector index adapter."""

from __future__ import annotations

from dataclasses import dataclass, field

from .chroma_client import get_hydration_chroma_collection
from .runtime_config import HydrationRuntimeConfig
from .vector_index import VectorFilter, VectorRecord, VectorSearchResult


def _distance_to_score(distance: float | None) -> float:
    if distance is None:
        return 0.0
    return 1.0 / (1.0 + distance)


@dataclass
class ChromaVectorIndex:
    config: HydrationRuntimeConfig
    backend: str = field(init=False)
    collection_name: str = field(init=False)
    _collection: object | None = field(default=None, init=False, repr=False)

    def __post_init__(self) -> None:
        self.collection_name = self.config.collection_name
        self.backend = {
            "http": "chroma-http",
            "persistent": "chroma-persistent",
            "ephemeral": "ephemeral",
        }.get(self.config.mode, f"chroma-{self.config.mode}")

    def _get_collection(self):
        if self._collection is None:
            self._collection = get_hydration_chroma_collection(self.config)
        return self._collection

    def upsert(self, records: list[VectorRecord]) -> None:
        if not records:
            return
        collection = self._get_collection()
        collection.upsert(
            ids=[record.id for record in records],
            documents=[record.document for record in records],
            embeddings=[record.embedding for record in records],
            metadatas=[record.metadata for record in records],
        )

    def similarity_search(
        self,
        query_embedding: list[float],
        limit: int,
        *,
        filter: VectorFilter | None = None,
    ) -> list[VectorSearchResult]:
        collection = self._get_collection()
        result = collection.query(
            query_embeddings=[query_embedding],
            n_results=limit,
            where=filter or None,
            include=["documents", "metadatas", "distances", "embeddings"],
        )
        ids = (result.get("ids") or [[]])[0]
        documents = (result.get("documents") or [[]])[0]
        metadatas = (result.get("metadatas") or [[]])[0]
        distances = (result.get("distances") or [[]])[0]
        embeddings = (result.get("embeddings") or [[]])[0]
        return [
            VectorSearchResult(
                id=id_,
                document=documents[idx] if idx < len(documents) else "",
                metadata=metadatas[idx] if idx < len(metadatas) else {},
                embedding=embeddings[idx] if idx < len(embeddings) else None,
                score=_distance_to_score(distances[idx] if idx < len(distances) else None),
            )
            for idx, id_ in enumerate(ids)
        ]

    def get_by_ids(self, ids: list[str]) -> list[VectorSearchResult]:
        if not ids:
            return []
        collection = self._get_collection()
        result = collection.get(ids=ids, include=["documents", "metadatas", "embeddings"])
        out_ids = result.get("ids") or []
        documents = result.get("documents") or []
        metadatas = result.get("metadatas") or []
        embeddings = result.get("embeddings") or []
        return [
            VectorSearchResult(
                id=id_,
                document=documents[idx] if idx < len(documents) else "",
                metadata=metadatas[idx] if idx < len(metadatas) else {},
                embedding=embeddings[idx] if idx < len(embeddings) else None,
                score=1.0,
            )
            for idx, id_ in enumerate(out_ids)
        ]

    def delete(self, *, ids: list[str] | None = None, filter: VectorFilter | None = None) -> None:
        collection = self._get_collection()
        kwargs: dict[str, object] = {}
        if ids:
            kwargs["ids"] = ids
        if filter:
            kwargs["where"] = filter
        collection.delete(**kwargs)
