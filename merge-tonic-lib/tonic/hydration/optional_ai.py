"""Optional-AI dependency probes and skip payload helpers."""

from __future__ import annotations

from dataclasses import asdict, dataclass

from .paths import resolve_hydration_artifact_paths
from .runtime_config import resolve_hydration_runtime_config, runtime_mode_to_backend
from .types import (
    HYDRATION_INTENT_RESULT_SCHEMA,
    HYDRATION_OPTIONAL_AI_EXIT_CODE,
    HYDRATION_PIPELINE_VERSION,
    HydrationRunResult,
)

HYDRATION_OPTIONAL_DEPENDENCY_GROUP = "ai"
HYDRATION_CHROMADB_PY_PACKAGE = "chromadb"
HYDRATION_CHROMADB_VERSION = "0.5.23"
HYDRATION_CHROMADB_SERVER_IMAGE = f"chromadb/chroma:{HYDRATION_CHROMADB_VERSION}"


@dataclass(frozen=True)
class HydrationOptionalAiProbe:
    available: bool
    package_name: str
    install_hint: str


def probe_hydration_optional_ai_dependency() -> HydrationOptionalAiProbe:
    try:
        import chromadb  # noqa: F401

        available = True
    except ImportError:
        available = False
    return HydrationOptionalAiProbe(
        available=available,
        package_name=HYDRATION_CHROMADB_PY_PACKAGE,
        install_hint=""
        if available
        else f"Install optional Python dependency '{HYDRATION_CHROMADB_PY_PACKAGE}=={HYDRATION_CHROMADB_VERSION}' before using non-memory hydration runtimes.",
    )


def build_missing_optional_ai_dependency_skip_result(
    repo_root: str,
    rationale: str = "",
) -> HydrationRunResult:
    artifacts = resolve_hydration_artifact_paths(repo_root)
    runtime = resolve_hydration_runtime_config(repo_root)
    return HydrationRunResult(
        run_id="hydrate-intents-skip",
        repo_root=repo_root,
        persist_root=str(artifacts.persist_root),
        run_root=str(artifacts.run_root),
        vector_backend=runtime_mode_to_backend(runtime.mode),
        hydration_skipped=True,
        tags_added=[],
        skip_reason="missing_optional_ai_dependencies",
        rationale=rationale,
        metadata={
            "optional_dependency_group": HYDRATION_OPTIONAL_DEPENDENCY_GROUP,
            "missing_package": HYDRATION_CHROMADB_PY_PACKAGE,
            "expected_package_version": HYDRATION_CHROMADB_VERSION,
            "expected_server_image": HYDRATION_CHROMADB_SERVER_IMAGE,
            "skip_exit_code": HYDRATION_OPTIONAL_AI_EXIT_CODE,
        },
        pipeline_version=HYDRATION_PIPELINE_VERSION,
        schema=HYDRATION_INTENT_RESULT_SCHEMA,
    )


def skip_result_to_dict(result: HydrationRunResult) -> dict[str, object]:
    return asdict(result)
