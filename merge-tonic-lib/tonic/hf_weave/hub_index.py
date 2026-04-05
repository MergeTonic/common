"""Hub weave index (.tonic/hub/weave-index.v1.json) load / LWW merge / save."""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

WEAVE_INDEX_HUB_PATH = ".tonic/hub/weave-index.v1.json"


def hub_index_empty(*, repo_id: str) -> dict[str, Any]:
    return {
        "schema": "tonic-weave-hub-index",
        "version": "1",
        "repo_id": repo_id,
        "objects": {},
    }


def parse_hub_index(raw: str) -> dict[str, Any]:
    data: Any = json.loads(raw)
    if not isinstance(data, dict):
        raise ValueError("hub index: root must be object")
    if data.get("schema") != "tonic-weave-hub-index":
        raise ValueError("hub index: invalid schema")
    if data.get("version") != "1":
        raise ValueError("hub index: invalid version")
    objs = data.get("objects")
    if objs is not None and not isinstance(objs, dict):
        raise ValueError("hub index: objects must be object")
    return data


def load_hub_index_local(path: Path) -> dict[str, Any] | None:
    if not path.is_file():
        return None
    return parse_hub_index(path.read_text(encoding="utf-8"))


def merge_hub_index_lww(*indices: dict[str, Any]) -> dict[str, Any]:
    """Last-writer-wins on `objects` keys using optional `updated_at` ISO string; else last index wins."""
    if not indices:
        return hub_index_empty(repo_id="")
    repo_id = ""
    for idx in indices:
        rid = idx.get("repo_id")
        if isinstance(rid, str) and rid.strip():
            repo_id = rid.strip()
            break
    out = hub_index_empty(repo_id=repo_id)
    merged: dict[str, dict[str, Any]] = {}
    best_ts: dict[str, str] = {}
    for idx in indices:
        objs = idx.get("objects") or {}
        if not isinstance(objs, dict):
            continue
        for k, meta in objs.items():
            if not isinstance(k, str) or not isinstance(meta, dict):
                continue
            ts = str(meta.get("updated_at") or "")
            prev = best_ts.get(k, "")
            if ts >= prev:
                best_ts[k] = ts
                merged[k] = dict(meta)
    out["objects"] = merged
    rev = indices[-1].get("revision")
    if isinstance(rev, str) and rev.strip():
        out["revision"] = rev.strip()
    return out


def save_hub_index_local(path: Path, index: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(index, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def index_entry_for_blob(*, key: str, data: bytes, content_type: str = "application/octet-stream") -> dict[str, Any]:
    return {
        "sha256": key,
        "size_bytes": len(data),
        "content_type": content_type,
        "hub_path": f".tonic/hub/blobs/{key}",
        "updated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
    }


def hub_merge_index_files(paths: list[Path]) -> dict[str, Any]:
    loaded: list[dict[str, Any]] = []
    for p in paths:
        m = load_hub_index_local(p)
        if m is not None:
            loaded.append(m)
    if not loaded:
        return hub_index_empty(repo_id="")
    return merge_hub_index_lww(*loaded)


def stderr_index_summary(action: str, index: dict[str, Any]) -> None:
    n = len(index.get("objects") or {})
    print(f"tonic hf-weave index: {action} objects={n}", file=sys.stderr)


def refresh_weave_hub_index(
    repo_root: Path,
    repo_id: str,
    *,
    offline: bool | None = None,
) -> dict[str, Any]:
    """Merge remote + local index; add entries for manifest weave blobs present on disk; upload + save local."""
    from .client import default_hub_repo_id, hub_download_repo_path, hub_offline, hub_upload_bytes

    rid = (repo_id or default_hub_repo_id()).strip()
    off = hub_offline(offline)
    hub_dir = repo_root / ".tonic" / "hub"
    local_path = hub_dir / "weave-index.v1.json"
    remote_idx: dict[str, Any] | None = None
    if rid and not off:
        raw = hub_download_repo_path(repo_id=rid, path_in_repo=WEAVE_INDEX_HUB_PATH)
        if raw:
            try:
                remote_idx = parse_hub_index(raw.decode("utf-8"))
            except Exception:
                remote_idx = None
    local_idx = load_hub_index_local(local_path)
    manifest_path = repo_root / ".tonic" / "weave" / "manifest.json"
    disk_idx = hub_index_empty(repo_id=rid or "")
    if manifest_path.is_file():
        try:
            man: Any = json.loads(manifest_path.read_text(encoding="utf-8"))
            paths = man.get("paths") if isinstance(man, dict) else None
            if isinstance(paths, dict):
                blobs = repo_root / ".tonic" / "weave" / "blobs"
                for _pkey, ent in paths.items():
                    if not isinstance(ent, dict):
                        continue
                    sha = ent.get("weave_serialized_sha")
                    if not isinstance(sha, str) or len(sha) != 64:
                        continue
                    bp = blobs / sha
                    if bp.is_file():
                        data = bp.read_bytes()
                        disk_idx["objects"][sha] = index_entry_for_blob(key=sha, data=data)
        except Exception:
            pass
    parts = [x for x in (remote_idx, local_idx, disk_idx) if x is not None]
    merged = merge_hub_index_lww(*parts) if parts else hub_index_empty(repo_id=rid or "")
    merged["repo_id"] = rid or merged.get("repo_id", "")
    hub_dir.mkdir(parents=True, exist_ok=True)
    save_hub_index_local(local_path, merged)
    stderr_index_summary("merged+saved", merged)
    if rid and not off:
        payload = json.dumps(merged, indent=2, sort_keys=True).encode("utf-8")
        hub_upload_bytes(
            repo_id=rid,
            path_in_repo=WEAVE_INDEX_HUB_PATH,
            data=payload,
            commit_message="tonic weave index update",
        )
        stderr_index_summary("uploaded", merged)
    return merged
