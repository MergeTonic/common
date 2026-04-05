"""Read/write `refs/notes/tonic` (commit-level JSON pointers).

Fetch refspec (document in docs/tonic-hf-weave.md):

    git fetch origin +refs/notes/tonic:refs/notes/tonic

`git fsck` does not fetch notes; clones without the refspec have no local notes.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any


NOTE_REF = "refs/notes/tonic"


def _run_git(repo: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=repo,
        capture_output=True,
        text=True,
        check=False,
    )


def note_show(repo: Path, commit: str) -> str | None:
    p = _run_git(repo, "notes", "--ref", NOTE_REF, "show", commit)
    if p.returncode != 0:
        return None
    return p.stdout.strip() or None


def note_add_manifest_pointer(
    repo: Path,
    commit: str,
    manifest_sha: str,
    *,
    force: bool = False,
) -> bool:
    payload = json.dumps({"schema": "tonic-weave-note-v1", "manifest_git_sha": manifest_sha}, sort_keys=True)
    if force:
        p = _run_git(repo, "notes", "--ref", NOTE_REF, "add", "-f", "-m", payload, commit)
    else:
        p = _run_git(repo, "notes", "--ref", NOTE_REF, "add", "-m", payload, commit)
    return p.returncode == 0


def parse_note_payload(raw: str) -> dict[str, Any] | None:
    try:
        d = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return d if isinstance(d, dict) else None
