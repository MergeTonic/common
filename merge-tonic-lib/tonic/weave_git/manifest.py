from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .types import PathManifestEntry, TonicGitManifest


def _require(cond: bool, msg: str) -> None:
    if not cond:
        raise ValueError(msg)


def parse_manifest_json(raw: str | bytes) -> TonicGitManifest:
    if isinstance(raw, bytes):
        data: Any = json.loads(raw.decode("utf-8"))
    else:
        data = json.loads(raw)
    _require(isinstance(data, dict), "manifest root must be object")
    _require(data.get("schema") == "tonic-git-manifest", "manifest.schema must be tonic-git-manifest")
    _require(data.get("version") == "1", "manifest.version must be 1")
    _require(isinstance(data.get("commit"), str) and data["commit"], "manifest.commit required")
    paths = data.get("paths")
    _require(isinstance(paths, dict), "manifest.paths must be object")
    for rel, row in paths.items():
        _require(isinstance(rel, str), "manifest path keys must be strings")
        _require(isinstance(row, dict), f"path {rel}: entry must be object")
        pe = row
        for k in ("text_blob_sha", "weave_serialized_sha", "weave_format_version", "diff_engine_id"):
            _require(isinstance(pe.get(k), str) and pe[k], f"path {rel}: missing {k}")
        pw = pe.get("parent_weave_shas")
        if pw is not None:
            _require(isinstance(pw, list), f"path {rel}: parent_weave_shas must be list")
            for x in pw:
                _require(isinstance(x, str), f"path {rel}: parent weave sha must be string")
    return data  # type: ignore[return-value]


def serialize_manifest_json(manifest: TonicGitManifest, indent: int | None = 2) -> str:
    return json.dumps(manifest, indent=indent, sort_keys=True) + ("\n" if indent is not None else "")


def load_manifest_path(path: Path) -> TonicGitManifest:
    return parse_manifest_json(path.read_text(encoding="utf-8"))


def save_manifest_path(path: Path, manifest: TonicGitManifest) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(serialize_manifest_json(manifest), encoding="utf-8")


def path_entry_for_file(
    *,
    rel_path: str,
    text_canonical: str,
    serialized_weave: str,
    weave_format_version: str,
    diff_engine_id: str,
    parent_weave_shas: list[str] | None = None,
    degraded: bool | None = None,
    squash: bool | None = None,
) -> tuple[str, PathManifestEntry]:
    from .hashutil import normalize_lf, sha256_hex_bytes, sha256_hex_utf8

    norm = normalize_lf(text_canonical)
    text_sha = sha256_hex_utf8(norm)
    weave_bytes = serialized_weave.encode("utf-8")
    weave_sha = sha256_hex_bytes(weave_bytes)
    entry: PathManifestEntry = {
        "text_blob_sha": text_sha,
        "weave_serialized_sha": weave_sha,
        "weave_format_version": weave_format_version,
        "diff_engine_id": diff_engine_id,
    }
    if parent_weave_shas is not None:
        entry["parent_weave_shas"] = parent_weave_shas
    if degraded is not None:
        entry["degraded"] = degraded
    if squash is not None:
        entry["squash"] = squash
    return rel_path, entry
