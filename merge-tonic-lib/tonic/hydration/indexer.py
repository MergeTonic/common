"""Incremental repository indexer for hydration vector stores."""

from __future__ import annotations

from dataclasses import dataclass

from .chunker import HydrationChunk, LineTokenEstimateChunker
from .embedder import Embedder
from .index_state import (
    HydrationIndexState,
    create_hydration_index_state,
    is_hydration_index_state_compatible,
    load_hydration_index_state,
    save_hydration_index_state,
)
from .paths import resolve_hydration_artifact_paths
from .persistence import assert_hydration_persist_health, write_hydration_persist_manifest
from .repository import HydrationRepository, HydrationRepositoryFile
from .vector_index import VectorIndex, VectorRecord


@dataclass(frozen=True)
class HydrationIndexSyncResult:
    added_files: int
    updated_files: int
    removed_files: int
    unchanged_files: int
    indexed_chunks: int
    deleted_chunks: int
    state: HydrationIndexState


class HydrationIndexer:
    def __init__(
        self,
        repo_root: str,
        index: VectorIndex,
        embedder: Embedder,
        *,
        chunker: LineTokenEstimateChunker | None = None,
        repository: HydrationRepository | None = None,
        strategy_id: str = "incremental-content-hash",
    ) -> None:
        self.repo_root = repo_root
        self.index = index
        self.embedder = embedder
        self.chunker = chunker or LineTokenEstimateChunker()
        self.repository = repository or HydrationRepository(repo_root)
        self.strategy_id = strategy_id

    def sync(
        self,
        *,
        vector_backend: str,
        normative_commit: str = "",
        pr_scope_hash: str = "",
        cache_key: str = "",
        scope: str = "",
        prompt_profile: str = "",
        dry_run: bool = False,
        historical_since: str = "",
        historical_base_ref: str = "",
        historical_state: str = "",
        reuse_state: bool = True,
        persist_state: bool = True,
    ) -> HydrationIndexSyncResult:
        artifacts = resolve_hydration_artifact_paths(self.repo_root)
        assert_hydration_persist_health(artifacts.persist_root)
        previous_state = load_hydration_index_state(artifacts.index_state_path) if reuse_state else None
        compatible = is_hydration_index_state_compatible(
            previous_state,
            collection_name=self.index.collection_name,
            vector_backend=vector_backend,
            embedder_model=self.embedder.model_id,
            chunker_version=self.chunker.version,
            strategy_id=self.strategy_id,
            repo_root=self.repo_root,
            cache_key=cache_key,
            scope=scope,
            prompt_profile=prompt_profile,
            dry_run=dry_run,
            historical_since=historical_since,
            historical_base_ref=historical_base_ref,
            historical_state=historical_state,
        )
        if not compatible and previous_state is not None:
            stale_ids = _all_chunk_ids(previous_state)
            if stale_ids:
                self.index.delete(ids=stale_ids)

        previous_files = (
            previous_state.indexed_files
            if compatible and previous_state and previous_state.indexed_files
            else {}
        )
        next_files: dict[str, dict[str, str | int | list[str]]] = {}
        repo_files = self.repository.read_indexable_files()
        current_paths = {file.relative_path for file in repo_files}

        added_files = 0
        updated_files = 0
        unchanged_files = 0
        indexed_chunks = 0
        deleted_chunks = 0 if compatible else len(_all_chunk_ids(previous_state))

        for relative_path, entry in previous_files.items():
            if relative_path not in current_paths:
                chunk_ids = [str(value) for value in entry.get("chunk_ids", [])]
                if chunk_ids:
                    self.index.delete(ids=chunk_ids)
                    deleted_chunks += len(chunk_ids)

        for file in repo_files:
            previous_entry = previous_files.get(file.relative_path)
            previous_hash = str(previous_entry.get("content_hash")) if previous_entry else ""
            if previous_entry and previous_hash == file.content_hash:
                next_files[file.relative_path] = previous_entry
                unchanged_files += 1
                continue
            if previous_entry:
                chunk_ids = [str(value) for value in previous_entry.get("chunk_ids", [])]
                if chunk_ids:
                    self.index.delete(ids=chunk_ids)
                    deleted_chunks += len(chunk_ids)
            records = self._build_vector_records(file)
            if records:
                self.index.upsert(records)
            next_files[file.relative_path] = {
                "content_hash": file.content_hash,
                "chunk_ids": [record.id for record in records],
                "chunk_count": len(records),
                "size_bytes": file.size_bytes,
            }
            indexed_chunks += len(records)
            if previous_entry:
                updated_files += 1
            else:
                added_files += 1

        state = create_hydration_index_state(
            collection_name=self.index.collection_name,
            vector_backend=vector_backend,
            embedder_model=self.embedder.model_id,
            chunker_version=self.chunker.version,
            strategy_id=self.strategy_id,
            repo_root=self.repo_root,
            cache_key=cache_key,
            pr_scope_hash=pr_scope_hash,
            scope=scope,
            prompt_profile=prompt_profile,
            dry_run=dry_run,
            historical_since=historical_since,
            historical_base_ref=historical_base_ref,
            historical_state=historical_state,
            normative_commit=normative_commit,
        )
        state.indexed_files = next_files
        if persist_state:
            save_hydration_index_state(artifacts.index_state_path, state)
            write_hydration_persist_manifest(
                persist_root=artifacts.persist_root,
                writer_kind=vector_backend,
                cache_key=cache_key,
            )
        removed_files = len([path for path in previous_files if path not in current_paths])
        return HydrationIndexSyncResult(
            added_files=added_files,
            updated_files=updated_files,
            removed_files=removed_files,
            unchanged_files=unchanged_files,
            indexed_chunks=indexed_chunks,
            deleted_chunks=deleted_chunks,
            state=state,
        )

    def _build_vector_records(self, file: HydrationRepositoryFile) -> list[VectorRecord]:
        chunks = self.chunker.chunk_text(file.relative_path, file.content)
        if not chunks:
            return []
        embeddings = self.embedder.embed_documents([chunk.document for chunk in chunks])
        return [
            self._to_vector_record(
                chunk,
                file.content_hash,
                file.size_bytes,
                embeddings[index] if index < len(embeddings) else [],
            )
            for index, chunk in enumerate(chunks)
        ]

    def _to_vector_record(
        self,
        chunk: HydrationChunk,
        content_hash: str,
        size_bytes: int,
        embedding: list[float],
    ) -> VectorRecord:
        return VectorRecord(
            id=chunk.id,
            document=chunk.document,
            embedding=embedding,
            metadata={
                "path": chunk.path,
                "start_line": chunk.start_line,
                "end_line": chunk.end_line,
                "content_hash": content_hash,
                "chunk_id": chunk.id,
                "size_bytes": size_bytes,
                **({"symbol": chunk.symbol} if chunk.symbol else {}),
            },
        )


def _all_chunk_ids(state: HydrationIndexState | None) -> list[str]:
    if state is None or not state.indexed_files:
        return []
    out: list[str] = []
    for entry in state.indexed_files.values():
        out.extend(str(value) for value in entry.get("chunk_ids", []))
    return out
