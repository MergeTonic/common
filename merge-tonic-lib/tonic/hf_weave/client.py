from __future__ import annotations

import os
import sys
from io import BytesIO
from pathlib import Path
from typing import Protocol

from . import HF_AVAILABLE, WeaveHubMissingError, require_hf


def hub_offline(offline: bool | None = None) -> bool:
    """True when Hub network I/O should be skipped (HF_HUB_OFFLINE or TONIC_HF_WEAVE_OFFLINE)."""
    if offline is not None:
        return offline
    v = (os.environ.get("TONIC_HF_WEAVE_OFFLINE") or os.environ.get("HF_HUB_OFFLINE") or "").lower()
    return v in ("1", "true", "yes")


class BlobStore(Protocol):
    def put(self, key: str, data: bytes) -> None: ...
    def get(self, key: str) -> bytes | None: ...


class InMemoryBlobStore:
    def __init__(self) -> None:
        self._d: dict[str, bytes] = {}

    def put(self, key: str, data: bytes) -> None:
        self._d[key] = data

    def get(self, key: str) -> bytes | None:
        return self._d.get(key)


BLOB_PREFIX = ".tonic/hub/blobs"


def default_hub_repo_id() -> str:
    return (
        os.environ.get("TONIC_HF_WEAVE_REPO", "")
        or os.environ.get("HF_WEAVE_HUB_REPO", "")
        or ""
    ).strip()


class HuggingfaceHubBlobStore:
    """Content-addressed blobs under `{BLOB_PREFIX}/{key}` in a Hub model repo."""

    def __init__(self, repo_id: str) -> None:
        require_hf()
        from huggingface_hub import HfApi

        self._api = HfApi()
        self._repo_id = repo_id

    def put(self, key: str, data: bytes) -> None:
        path_in_repo = f"{BLOB_PREFIX}/{key}"
        self._api.upload_file(
            path_or_fileobj=BytesIO(data),
            path_in_repo=path_in_repo,
            repo_id=self._repo_id,
            repo_type="model",
            commit_message=f"tonic hf-weave {key[:16]}…",
        )

    def get(self, key: str) -> bytes | None:
        from huggingface_hub import hf_hub_download

        path_in_repo = f"{BLOB_PREFIX}/{key}"
        try:
            p = hf_hub_download(
                repo_id=self._repo_id,
                filename=path_in_repo,
                repo_type="model",
            )
            return Path(p).read_bytes()
        except Exception:
            return None


def hub_download_repo_path(*, repo_id: str, path_in_repo: str) -> bytes | None:
    """Download arbitrary repo file path (e.g. index or CTRD JSON)."""
    if hub_offline():
        return None
    require_hf()
    from huggingface_hub import hf_hub_download

    try:
        p = hf_hub_download(repo_id=repo_id, filename=path_in_repo, repo_type="model")
        return Path(p).read_bytes()
    except Exception:
        return None


def hub_upload_bytes(
    *,
    repo_id: str,
    path_in_repo: str,
    data: bytes,
    commit_message: str = "tonic hub upload",
) -> None:
    if hub_offline():
        return
    require_hf()
    from huggingface_hub import HfApi

    HfApi().upload_file(
        path_or_fileobj=BytesIO(data),
        path_in_repo=path_in_repo,
        repo_id=repo_id,
        repo_type="model",
        commit_message=commit_message,
    )


def redact_token(msg: str) -> str:
    t = os.environ.get("HF_TOKEN", "")
    if t and t in msg:
        return msg.replace(t, "***")
    return msg


def hub_upload_download_plan(
    *,
    key: str,
    data: bytes,
    offline: bool | None = None,
    repo_id: str | None = None,
) -> tuple[BlobStore, bytes]:
    """Upload then round-trip download for a content-addressed `key` (SHA hex)."""
    off = hub_offline(offline)
    if off:
        store: BlobStore = InMemoryBlobStore()
        store.put(key, data)
        got = store.get(key)
        assert got is not None
        return store, got
    if not HF_AVAILABLE:
        require_hf()
    rid = (repo_id or default_hub_repo_id()).strip()
    if not rid:
        raise WeaveHubMissingError(
            "Set TONIC_HF_WEAVE_REPO (or HF_WEAVE_HUB_REPO) for online Hub I/O, "
            "or HF_HUB_OFFLINE=1 for local tests."
        )
    store = HuggingfaceHubBlobStore(rid)
    store.put(key, data)
    got = store.get(key)
    if got is None:
        raise RuntimeError(f"Hub round-trip failed for key {key[:16]}…")
    return store, got


def hub_create_repo_if_needed(*, repo_id: str, private: bool = True) -> None:
    require_hf()
    from huggingface_hub import HfApi

    HfApi().create_repo(repo_id, private=private, repo_type="model", exist_ok=True)


def hub_push_local_blobs(
    *,
    weave_blobs_dir: Path,
    repo_id: str | None = None,
    offline: bool | None = None,
) -> int:
    """Upload files in `weave_blobs_dir` (named by content hash) to the Hub. Honors TONIC_HF_WEAVE_PUSH_MAX."""
    off = hub_offline(offline)
    if off:
        return 0
    rid = (repo_id or default_hub_repo_id()).strip()
    if not rid:
        raise WeaveHubMissingError("Set TONIC_HF_WEAVE_REPO for push, or use --offline.")
    if not weave_blobs_dir.is_dir():
        return 0
    store = HuggingfaceHubBlobStore(rid)
    files = sorted(p for p in weave_blobs_dir.iterdir() if p.is_file())
    cap_s = (os.environ.get("TONIC_HF_WEAVE_PUSH_MAX") or "0").strip() or "0"
    try:
        cap = int(cap_s)
    except ValueError:
        cap = 0
    if cap > 0:
        files = files[:cap]
    n = 0
    for p in files:
        key = p.name
        store.put(key, p.read_bytes())
        n += 1
    print(f"tonic hf-weave: uploaded {n} weave blob(s) (candidates={len(files)})", file=sys.stderr)
    return n


def hub_prefetch_keys(
    *,
    keys: list[str],
    repo_id: str | None = None,
    dest_dir: Path,
    offline: bool | None = None,
) -> int:
    """Download listed blob keys from Hub into `dest_dir` (flat, filename = key)."""
    off = hub_offline(offline)
    dest_dir.mkdir(parents=True, exist_ok=True)
    if off:
        return 0
    rid = (repo_id or default_hub_repo_id()).strip()
    if not rid:
        raise WeaveHubMissingError("Set TONIC_HF_WEAVE_REPO for prefetch, or use --offline.")
    store = HuggingfaceHubBlobStore(rid)
    n = 0
    for key in keys:
        data = store.get(key)
        if data is None:
            continue
        out = dest_dir / key
        out.write_bytes(data)
        n += 1
    return n
