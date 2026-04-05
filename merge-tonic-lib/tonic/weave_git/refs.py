"""Advisory `refs/tonic/*` tips (e.g. weave head, gc pending tombstones)."""

from __future__ import annotations

import subprocess
from pathlib import Path


def _run_git(repo: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=repo,
        capture_output=True,
        text=True,
        check=False,
    )


def read_ref(repo: Path, name: str) -> str | None:
    """Read `refs/tonic/<name>` (40-char sha or symref target)."""
    p = _run_git(repo, "rev-parse", "--verify", f"refs/tonic/{name}")
    if p.returncode != 0:
        return None
    return p.stdout.strip() or None


def update_ref(repo: Path, name: str, new_sha: str, *, msg: str = "tonic-weave: update ref") -> bool:
    p = _run_git(repo, "update-ref", "-m", msg, f"refs/tonic/{name}", new_sha)
    return p.returncode == 0


def delete_ref(repo: Path, name: str) -> bool:
    p = _run_git(repo, "update-ref", "-d", f"refs/tonic/{name}")
    return p.returncode == 0


def set_gc_pending(repo: Path, tombstone_sha: str) -> bool:
    return update_ref(repo, "gc/pending", tombstone_sha, msg="tonic-weave: gc pending")
