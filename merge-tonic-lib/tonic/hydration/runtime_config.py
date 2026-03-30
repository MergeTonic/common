"""Hydration runtime environment selection and defaults."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import os

from .paths import resolve_hydration_artifact_paths

HydrationRuntimeMode = str


@dataclass(frozen=True)
class HydrationRuntimeConfig:
    mode: HydrationRuntimeMode
    collection_name: str
    persist_path: Path
    url: str
    heartbeat_path: str


def _normalize_mode(raw: str | None) -> HydrationRuntimeMode:
    value = (raw or "http").strip().lower()
    if value in {"persistent", "ephemeral", "memory"}:
        return value
    return "http"


def _cross_platform_basename(value: str | Path) -> str:
    raw = str(value or "").strip()
    parts = [part for part in raw.replace("\\", "/").split("/") if part]
    if parts:
        return parts[-1]
    return Path(raw or ".").resolve().name


def default_hydration_collection_name(repo_root: str | Path) -> str:
    base = _cross_platform_basename(repo_root).lower()
    safe = "".join(ch if ch.isalnum() or ch in "._-" else "-" for ch in base).strip("-")
    return f"{safe or 'repo'}-hydration"


def resolve_hydration_runtime_config(
    repo_root: str | Path,
    env: dict[str, str] | None = None,
    overrides: dict[str, str] | None = None,
) -> HydrationRuntimeConfig:
    source = env or dict(os.environ)
    override_values = overrides or {}
    artifacts = resolve_hydration_artifact_paths(repo_root)
    raw_persist = source.get("TONIC_CHROMA_PERSIST_PATH", "").strip()
    persist_path = Path(raw_persist).resolve() if raw_persist else artifacts.persist_root
    if "persist_path" in override_values and override_values["persist_path"]:
        persist_path = Path(override_values["persist_path"]).resolve()
    return HydrationRuntimeConfig(
        mode=str(override_values.get("mode", _normalize_mode(source.get("TONIC_CHROMA_MODE")))),
        collection_name=(
            str(override_values.get("collection_name", ""))
            or source.get("TONIC_CHROMA_COLLECTION", "").strip()
            or default_hydration_collection_name(repo_root)
        ),
        persist_path=persist_path,
        url=str(override_values.get("url", source.get("TONIC_CHROMA_URL", "http://127.0.0.1:8000"))).strip(),
        heartbeat_path=str(
            override_values.get("heartbeat_path", source.get("TONIC_CHROMA_HEARTBEAT_PATH", "/api/v2/heartbeat"))
        ).strip(),
    )


def runtime_mode_to_backend(mode: HydrationRuntimeMode) -> str:
    if mode == "http":
        return "chroma-http"
    if mode == "persistent":
        return "chroma-persistent"
    if mode == "ephemeral":
        return "ephemeral"
    return "memory"
