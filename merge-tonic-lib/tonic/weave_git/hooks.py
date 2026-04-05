from __future__ import annotations

import os
from pathlib import Path


def _hook_path(repo: Path, name: str) -> Path:
    return repo / ".git" / "hooks" / name


def install_hooks(repo: Path, *, mergetonic_cmd: str = "merge-tonic") -> tuple[bool, list[str]]:
    """Write pre-commit + pre-push shims; optional post-merge/checkout prefetch stubs."""
    git_dir = repo / ".git"
    if not git_dir.is_dir():
        return False, ["not a git repository"]
    hooks = git_dir / "hooks"
    hooks.mkdir(parents=True, exist_ok=True)
    msgs: list[str] = []

    pre_commit = f"""#!/bin/sh
# mergetonic hf-weave: verify staged weave manifest
{mergetonic_cmd} weave verify --staged --repo "$(git rev-parse --show-toplevel)" || exit 1
"""
    pre_push = f"""#!/bin/sh
# mergetonic hf-weave: push notes ref alongside branch (best-effort)
repo="$(git rev-parse --show-toplevel)"
cd "$repo" || exit 0
if git show-ref --verify --quiet refs/notes/tonic 2>/dev/null; then
  git push "$1" refs/notes/tonic:refs/notes/tonic || true
fi
exit 0
"""
    post_merge = """#!/bin/sh
# mergetonic hf-weave: optional prefetch stub (no network by default)
# Run: hf weave prefetch  (when mergetonic-hf-weave installed)
true
"""

    for name, body in (
        ("pre-commit", pre_commit),
        ("pre-push", pre_push),
        ("post-merge", post_merge),
        ("post-checkout", post_merge),
    ):
        p = _hook_path(repo, name)
        p.write_text(body, encoding="utf-8")
        try:
            os.chmod(p, 0o755)
        except OSError:
            pass
        msgs.append(f"wrote {p}")
    return True, msgs
