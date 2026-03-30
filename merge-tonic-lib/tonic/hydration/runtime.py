"""Hydration runtime factory for vector backends."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from .chroma_client import HydrationChromaHeartbeat, probe_hydration_chroma_heartbeat
from .chroma_vector_index import ChromaVectorIndex
from .memory_vector_index import MemoryVectorIndex
from .runtime_config import (
    HydrationRuntimeConfig,
    resolve_hydration_runtime_config,
    runtime_mode_to_backend,
)


class SupportsVectorIndex(Protocol):
    @property
    def backend(self) -> str: ...

    @property
    def collection_name(self) -> str: ...


@dataclass(frozen=True)
class HydrationRuntime:
    backend: str
    config: HydrationRuntimeConfig
    index: SupportsVectorIndex


def create_hydration_runtime(
    repo_root: str,
    env: dict[str, str] | None = None,
    overrides: dict[str, str] | None = None,
) -> HydrationRuntime:
    config = resolve_hydration_runtime_config(repo_root, env, overrides)
    backend = runtime_mode_to_backend(config.mode)
    if config.mode == "memory":
        return HydrationRuntime(
            backend=backend,
            config=config,
            index=MemoryVectorIndex(config.collection_name),
        )
    return HydrationRuntime(
        backend=backend,
        config=config,
        index=ChromaVectorIndex(config),
    )


def probe_hydration_runtime_readiness(
    repo_root: str,
    env: dict[str, str] | None = None,
    overrides: dict[str, str] | None = None,
) -> HydrationChromaHeartbeat | None:
    config = resolve_hydration_runtime_config(repo_root, env, overrides)
    if config.mode != "http":
        return None
    return probe_hydration_chroma_heartbeat(config)
