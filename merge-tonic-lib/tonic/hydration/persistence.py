"""Persistence safety helpers for vendored Chroma stores."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import UTC, datetime
import hashlib
import json
from pathlib import Path
from uuid import uuid4

from .errors import HydrationPersistError
from .paths import DEFAULT_INDEX_STATE_FILE_NAME
from .types import HYDRATION_PIPELINE_VERSION

HYDRATION_PERSIST_MANIFEST_SCHEMA = "tonic-hydration-persist-manifest"
HYDRATION_PERSIST_MANIFEST_FILE_NAME = "persist-manifest.json"
HYDRATION_PERSIST_LOCK_FILE_NAME = ".writer.lock"
HYDRATION_CACHE_KEY_SCHEMA_VERSION = "1"


@dataclass(frozen=True)
class HydrationPersistManifest:
    persist_root: str
    index_state_file: str
    writer_kind: str
    entries: list[str]
    schema: str = HYDRATION_PERSIST_MANIFEST_SCHEMA
    pipeline_version: str = HYDRATION_PIPELINE_VERSION
    cache_key: str = ""
    updated_at: str = ""


@dataclass(frozen=True)
class HydrationPersistHealth:
    ok: bool
    cold_start: bool
    has_index_state: bool
    has_store_files: bool
    entries: list[str]
    manifest_path: str
    reason: str = ""
    missing_entries: list[str] | None = None


@dataclass(frozen=True)
class HydrationCacheKey:
    cache_key: str
    pr_list_hash: str
    payload: dict[str, str]


class HydrationPersistLock:
    def __init__(self, lock_path: Path, token: str) -> None:
        self.lock_path = lock_path
        self.token = token

    def release(self) -> None:
        if not self.lock_path.is_file():
            return
        try:
            current = json.loads(self.lock_path.read_text(encoding="utf-8"))
        except Exception:
            return
        if current.get("token") != self.token:
            return
        self.lock_path.unlink(missing_ok=True)


def build_hydration_cache_key(
    *,
    strategy_id: str,
    pr_identifiers: list[str] | None,
    embedder_model: str,
    chunker_version: str,
    scope: str = "",
    prompt_profile: str = "",
    dry_run: bool = False,
    historical_since: str = "",
    historical_base_ref: str = "",
    historical_state: str = "",
) -> HydrationCacheKey:
    normalized_prs = sorted([value.strip() for value in (pr_identifiers or []) if value.strip()])
    pr_list_hash = hashlib.sha256("\n".join(normalized_prs).encode("utf-8")).hexdigest()
    payload = {
        "schema_version": HYDRATION_CACHE_KEY_SCHEMA_VERSION,
        "strategy_id": strategy_id,
        "pr_list_hash": pr_list_hash,
        "embedder_model": embedder_model,
        "chunker_version": chunker_version,
        "scope": scope.strip(),
        "prompt_profile": prompt_profile.strip(),
        "dry_run": "true" if dry_run else "false",
        "historical_since": historical_since.strip(),
        "historical_base_ref": historical_base_ref.strip(),
        "historical_state": historical_state.strip(),
    }
    return HydrationCacheKey(
        cache_key=hashlib.sha256(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest(),
        pr_list_hash=pr_list_hash,
        payload=payload,
    )


def resolve_hydration_persist_manifest_path(persist_root: str | Path) -> Path:
    return Path(persist_root) / HYDRATION_PERSIST_MANIFEST_FILE_NAME


def load_hydration_persist_manifest(persist_root: str | Path) -> HydrationPersistManifest | None:
    manifest_path = resolve_hydration_persist_manifest_path(persist_root)
    if not manifest_path.is_file():
        return None
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    return HydrationPersistManifest(**data)


def write_hydration_persist_manifest(
    *,
    persist_root: str | Path,
    writer_kind: str,
    cache_key: str = "",
    index_state_file: str = DEFAULT_INDEX_STATE_FILE_NAME,
) -> HydrationPersistManifest:
    root = Path(persist_root)
    root.mkdir(parents=True, exist_ok=True)
    entries = sorted([item.name for item in root.iterdir() if item.name != HYDRATION_PERSIST_LOCK_FILE_NAME])
    manifest = HydrationPersistManifest(
        persist_root=str(root),
        index_state_file=index_state_file,
        writer_kind=writer_kind,
        cache_key=cache_key,
        entries=entries,
        updated_at=datetime.now(UTC).isoformat(),
    )
    resolve_hydration_persist_manifest_path(root).write_text(
        json.dumps(asdict(manifest), indent=2) + "\n",
        encoding="utf-8",
    )
    return manifest


def check_hydration_persist_health(persist_root: str | Path) -> HydrationPersistHealth:
    root = Path(persist_root)
    manifest_path = resolve_hydration_persist_manifest_path(root)
    if not root.exists():
        return HydrationPersistHealth(
            ok=True,
            cold_start=True,
            has_index_state=False,
            has_store_files=False,
            entries=[],
            manifest_path=str(manifest_path),
        )
    entries = sorted([item.name for item in root.iterdir()])
    if not entries:
        return HydrationPersistHealth(
            ok=True,
            cold_start=True,
            has_index_state=False,
            has_store_files=False,
            entries=entries,
            manifest_path=str(manifest_path),
        )
    has_index_state = DEFAULT_INDEX_STATE_FILE_NAME in entries
    has_store_files = any(
        name
        not in {
            DEFAULT_INDEX_STATE_FILE_NAME,
            HYDRATION_PERSIST_MANIFEST_FILE_NAME,
            HYDRATION_PERSIST_LOCK_FILE_NAME,
        }
        for name in entries
    )
    if has_store_files and not has_index_state:
        return HydrationPersistHealth(
            ok=False,
            cold_start=False,
            has_index_state=has_index_state,
            has_store_files=has_store_files,
            entries=entries,
            manifest_path=str(manifest_path),
            reason="Persist root has Chroma files but no index-state.json. Restore the full tree or rebuild the cache.",
        )
    manifest = load_hydration_persist_manifest(root)
    if manifest is None:
        ok = not has_store_files and not has_index_state
        return HydrationPersistHealth(
            ok=ok,
            cold_start=ok,
            has_index_state=has_index_state,
            has_store_files=has_store_files,
            entries=entries,
            manifest_path=str(manifest_path),
            reason=""
            if ok
            else "Persist root is missing persist-manifest.json. Rebuild the persisted Chroma tree instead of restoring partial files.",
        )
    missing_entries = [entry for entry in manifest.entries if not (root / entry).exists()]
    if missing_entries:
        return HydrationPersistHealth(
            ok=False,
            cold_start=False,
            has_index_state=has_index_state,
            has_store_files=has_store_files,
            entries=entries,
            manifest_path=str(manifest_path),
            reason=f"Persist root is missing required entries from {HYDRATION_PERSIST_MANIFEST_FILE_NAME}. Restore the full tree or rebuild the cache.",
            missing_entries=missing_entries,
        )
    return HydrationPersistHealth(
        ok=True,
        cold_start=False,
        has_index_state=has_index_state,
        has_store_files=has_store_files,
        entries=entries,
        manifest_path=str(manifest_path),
    )


def assert_hydration_persist_health(persist_root: str | Path) -> HydrationPersistHealth:
    health = check_hydration_persist_health(persist_root)
    if not health.ok:
        raise HydrationPersistError(health.reason or "Hydration persist root is not safe to reuse.")
    return health


def acquire_hydration_persist_lock(persist_root: str | Path, owner: str) -> HydrationPersistLock:
    root = Path(persist_root)
    root.mkdir(parents=True, exist_ok=True)
    lock_path = root / HYDRATION_PERSIST_LOCK_FILE_NAME
    token = str(uuid4())
    payload = {
        "owner": owner,
        "token": token,
        "pid": str(__import__("os").getpid()),
        "acquired_at": datetime.now(UTC).isoformat(),
    }
    try:
        with lock_path.open("x", encoding="utf-8") as handle:
            handle.write(json.dumps(payload, indent=2) + "\n")
    except FileExistsError as exc:
        detail = lock_path.read_text(encoding="utf-8").strip() if lock_path.is_file() else ""
        raise HydrationPersistError(
            f"Hydration persist root is already claimed by another writer at {lock_path}.{f' Existing lock: {detail}' if detail else ''}"
        ) from exc
    return HydrationPersistLock(lock_path, token)
