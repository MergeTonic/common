"""Filesystem path helpers for persisted hydration artifacts."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

DEFAULT_TONIC_DIR_NAME = ".tonic"
DEFAULT_CHROMA_DIR_NAME = "chroma_db"
DEFAULT_HYDRATION_RUNS_DIR_NAME = "hydration-runs"
DEFAULT_INDEX_STATE_FILE_NAME = "index-state.json"


@dataclass(frozen=True)
class HydrationArtifactPaths:
    persist_root: Path
    run_root: Path
    index_state_path: Path


def resolve_hydration_artifact_paths(
    repo_root: str | Path,
    *,
    tonic_dir_name: str = DEFAULT_TONIC_DIR_NAME,
    chroma_dir_name: str = DEFAULT_CHROMA_DIR_NAME,
    run_dir_name: str = DEFAULT_HYDRATION_RUNS_DIR_NAME,
    index_state_file_name: str = DEFAULT_INDEX_STATE_FILE_NAME,
) -> HydrationArtifactPaths:
    base = Path(repo_root).resolve() / tonic_dir_name
    persist_root = base / chroma_dir_name
    run_root = base / run_dir_name
    index_state_path = persist_root / index_state_file_name
    return HydrationArtifactPaths(
        persist_root=persist_root,
        run_root=run_root,
        index_state_path=index_state_path,
    )
