"""Weave manifest + blob write-back after compare-three (no git commit)."""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any

from tonic import initial_state

from .hashutil import canonical_text_lines, normalize_lf
from .manifest import parse_manifest_json, path_entry_for_file, save_manifest_path
from .merge_driver import load_state_from_weave_root, run_option_a_merge
from .replay import persist_checkpoint_weave_blob
from .types import PathManifestEntry, TonicGitManifest

DEFAULT_WEAVE_FORMAT_VERSION = "1"
DEFAULT_DIFF_ENGINE_ID = "tonic-v1"


def _git_rev_parse(repo: str, rev: str = "HEAD") -> str:
    cp = subprocess.run(
        ["git", "-C", repo, "rev-parse", rev],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if cp.returncode != 0:
        return "0" * 40
    return (cp.stdout or "").strip() or ("0" * 40)


def _default_manifest(commit_sha: str) -> TonicGitManifest:
    return {
        "schema": "tonic-git-manifest",
        "version": "1",
        "commit": commit_sha,
        "paths": {},
    }


def load_or_init_manifest(manifest_path: Path, repo: str) -> TonicGitManifest:
    if manifest_path.is_file():
        try:
            return parse_manifest_json(manifest_path.read_text(encoding="utf-8"))
        except Exception:
            pass
    return _default_manifest(_git_rev_parse(repo, "HEAD"))


def _root_engine_version(manifest: TonicGitManifest) -> tuple[str, str]:
    wf = manifest.get("weave_format_version")
    de = manifest.get("diff_engine_id")
    wfv = wf.strip() if isinstance(wf, str) and wf.strip() else DEFAULT_WEAVE_FORMAT_VERSION
    did = de.strip() if isinstance(de, str) and de.strip() else DEFAULT_DIFF_ENGINE_ID
    return wfv, did


def entry_engine_version(entry: dict[str, Any] | None, wfv: str, did: str) -> tuple[str, str]:
    if isinstance(entry, dict):
        ev = entry.get("weave_format_version")
        ed = entry.get("diff_engine_id")
        if isinstance(ev, str) and ev.strip():
            wfv = ev.strip()
        if isinstance(ed, str) and ed.strip():
            did = ed.strip()
    return wfv, did


def build_entry_text_mode(
    *,
    rel_path: str,
    annotated_lines: list[str],
    weave_format_version: str,
    diff_engine_id: str,
    parent_weave_shas: list[str] | None = None,
) -> tuple[PathManifestEntry, str]:
    """Mode A: file is git-merge three-way converted to Tonic markers; weave is snapshot state (degraded)."""
    body = "\n".join(annotated_lines) + ("\n" if annotated_lines else "")
    lines = canonical_text_lines(body)
    serialized = initial_state(lines)
    kw: dict[str, Any] = {
        "rel_path": rel_path,
        "text_canonical": normalize_lf(body),
        "serialized_weave": serialized,
        "weave_format_version": weave_format_version,
        "diff_engine_id": diff_engine_id,
        "degraded": True,
    }
    if parent_weave_shas is not None:
        kw["parent_weave_shas"] = parent_weave_shas
    _, entry = path_entry_for_file(**kw)
    return entry, serialized


def merge_three_weave_driver(
    *,
    repo: str,
    rel_path: str,
    text_base: str,
    text_left: str,
    text_right: str,
    ent_base: dict[str, Any] | None,
    ent_left: dict[str, Any] | None,
    ent_right: dict[str, Any] | None,
    weave_format_version: str,
    diff_engine_id: str,
    strict: bool = True,
) -> tuple[list[str], PathManifestEntry | None, str | None, list[str]]:
    """Mode B: merge_states on blobs under `.tonic/weave/blobs`. Returns annotated lines, entry, serialized, stderr."""
    weave_root = Path(repo) / ".tonic" / "weave"

    def load_b() -> str | None:
        if not ent_base:
            return None
        w = ent_base.get("weave_serialized_sha")
        return (
            load_state_from_weave_root(weave_root, w)
            if isinstance(w, str) and w
            else None
        )

    def load_l() -> str | None:
        if not ent_left:
            return None
        w = ent_left.get("weave_serialized_sha")
        return (
            load_state_from_weave_root(weave_root, w)
            if isinstance(w, str) and w
            else None
        )

    def load_r() -> str | None:
        if not ent_right:
            return None
        w = ent_right.get("weave_serialized_sha")
        return (
            load_state_from_weave_root(weave_root, w)
            if isinstance(w, str) and w
            else None
        )

    res = run_option_a_merge(
        text_base=text_base,
        text_ours=text_left,
        text_theirs=text_right,
        load_state_base=load_b,
        load_state_ours=load_l,
        load_state_theirs=load_r,
        weave_format_version=weave_format_version,
        diff_engine_id=diff_engine_id,
        strict=strict,
        manifest_entry_base=ent_base,
        manifest_entry_ours=ent_left,
        manifest_entry_theirs=ent_right,
    )
    stderr = list(res.stderr)
    if res.manifest_entry is None or res.serialized_weave is None:
        return [], None, None, stderr
    text = res.merged_text
    if text.endswith("\n"):
        lines = text[:-1].split("\n") if text[:-1] else []
    else:
        lines = text.split("\n") if text else []
    if lines and lines[-1] == "":
        lines = lines[:-1]
    entry = dict(res.manifest_entry)
    parents: list[str] = []
    if ent_left and isinstance(ent_left.get("weave_serialized_sha"), str):
        parents.append(ent_left["weave_serialized_sha"])
    if ent_right and isinstance(ent_right.get("weave_serialized_sha"), str):
        parents.append(ent_right["weave_serialized_sha"])
    _, fixed = path_entry_for_file(
        rel_path=rel_path,
        text_canonical=normalize_lf(text),
        serialized_weave=res.serialized_weave,
        weave_format_version=weave_format_version,
        diff_engine_id=diff_engine_id,
        parent_weave_shas=parents or None,
        degraded=bool(entry.get("degraded")),
    )
    return lines, fixed, res.serialized_weave, stderr


def persist_writeback(
    repo: str,
    manifest: TonicGitManifest,
    path_updates: dict[str, PathManifestEntry],
    serialized_by_path: dict[str, str],
    *,
    dry_run: bool,
) -> None:
    """Bump manifest commit, merge path_updates, write blobs and manifest (unless dry_run)."""
    head = _git_rev_parse(repo, "HEAD")
    manifest = dict(manifest)
    manifest["commit"] = head
    paths = dict(manifest.get("paths") or {})
    for rel, ent in path_updates.items():
        paths[rel] = ent
    manifest["paths"] = paths
    root = Path(repo)
    wr = root / ".tonic" / "weave"
    if dry_run:
        return
    for rel, ser in serialized_by_path.items():
        _ = rel
        persist_checkpoint_weave_blob(wr, ser)
    save_manifest_path(wr / "manifest.json", manifest)  # type: ignore[arg-type]
