"""Versioned index-state.json helpers for persisted hydration stores."""

from __future__ import annotations

from dataclasses import dataclass, asdict
from datetime import UTC, datetime
import json
from pathlib import Path

from .types import HYDRATION_PIPELINE_VERSION

HYDRATION_INDEX_STATE_SCHEMA = "tonic-hydration-index-state"
HYDRATION_INDEX_STATE_COMPATIBILITY_VERSION = "1"


@dataclass
class HydrationIndexState:
    collection_name: str
    vector_backend: str
    embedder_model: str
    chunker_version: str
    strategy_id: str
    repo_root: str
    schema: str = HYDRATION_INDEX_STATE_SCHEMA
    pipeline_version: str = HYDRATION_PIPELINE_VERSION
    compatibility_version: str = HYDRATION_INDEX_STATE_COMPATIBILITY_VERSION
    cache_key: str = ""
    pr_scope_hash: str = ""
    scope: str = ""
    prompt_profile: str = ""
    dry_run: bool = False
    historical_since: str = ""
    historical_base_ref: str = ""
    historical_state: str = ""
    normative_commit: str = ""
    updated_at: str = ""
    indexed_files: dict[str, dict[str, str | int | list[str]]] | None = None


def create_hydration_index_state(
    *,
    collection_name: str,
    vector_backend: str,
    embedder_model: str,
    chunker_version: str,
    strategy_id: str,
    repo_root: str,
    cache_key: str = "",
    pr_scope_hash: str = "",
    scope: str = "",
    prompt_profile: str = "",
    dry_run: bool = False,
    historical_since: str = "",
    historical_base_ref: str = "",
    historical_state: str = "",
    normative_commit: str = "",
) -> HydrationIndexState:
    return HydrationIndexState(
        collection_name=collection_name,
        vector_backend=vector_backend,
        embedder_model=embedder_model,
        chunker_version=chunker_version,
        strategy_id=strategy_id,
        repo_root=repo_root,
        cache_key=cache_key,
        pr_scope_hash=pr_scope_hash,
        scope=scope,
        prompt_profile=prompt_profile,
        dry_run=dry_run,
        historical_since=historical_since,
        historical_base_ref=historical_base_ref,
        historical_state=historical_state,
        normative_commit=normative_commit,
        updated_at=datetime.now(UTC).isoformat(),
        indexed_files={},
    )


def load_hydration_index_state(path: str | Path) -> HydrationIndexState | None:
    file_path = Path(path)
    if not file_path.is_file():
        return None
    data = json.loads(file_path.read_text(encoding="utf-8"))
    if "indexed_files" not in data or data["indexed_files"] is None:
        data["indexed_files"] = {}
    return HydrationIndexState(**data)


def save_hydration_index_state(path: str | Path, state: HydrationIndexState) -> None:
    file_path = Path(path)
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_text(json.dumps(asdict(state), indent=2) + "\n", encoding="utf-8")


def is_hydration_index_state_compatible(
    state: HydrationIndexState | None,
    *,
    collection_name: str,
    vector_backend: str,
    embedder_model: str,
    chunker_version: str,
    strategy_id: str,
    repo_root: str,
    cache_key: str = "",
    scope: str = "",
    prompt_profile: str = "",
    dry_run: bool | None = None,
    historical_since: str = "",
    historical_base_ref: str = "",
    historical_state: str = "",
) -> bool:
    if state is None:
        return False
    return (
        state.collection_name == collection_name
        and state.schema == HYDRATION_INDEX_STATE_SCHEMA
        and state.compatibility_version == HYDRATION_INDEX_STATE_COMPATIBILITY_VERSION
        and state.vector_backend == vector_backend
        and state.embedder_model == embedder_model
        and state.chunker_version == chunker_version
        and state.strategy_id == strategy_id
        and state.repo_root == repo_root
        and (not cache_key or state.cache_key == cache_key)
        and (not scope or state.scope == scope)
        and (not prompt_profile or state.prompt_profile == prompt_profile)
        and (dry_run is None or state.dry_run == dry_run)
        and (not historical_since or state.historical_since == historical_since)
        and (not historical_base_ref or state.historical_base_ref == historical_base_ref)
        and (not historical_state or state.historical_state == historical_state)
    )
