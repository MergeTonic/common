#!/usr/bin/env python3
"""Validate GitHub wiki bootstrap preconditions."""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import tempfile
from pathlib import Path


def run(cmd: list[str], cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        cwd=str(cwd) if cwd else None,
        check=False,
        text=True,
        capture_output=True,
    )


def infer_repo_slug(explicit: str | None) -> str:
    if explicit:
        return explicit
    env_repo = os.getenv("GITHUB_REPOSITORY")
    if env_repo:
        return env_repo
    return "mergetonic/common"


def ensure_default_branch(expected: str) -> None:
    branch = os.getenv("GITHUB_REF_NAME")
    if branch and branch != expected:
        raise SystemExit(
            f"default branch preflight failed: expected '{expected}', got '{branch}'."
        )


def check_wiki_remote(repo_slug: str, verify_push: bool) -> None:
    wiki_url = f"https://github.com/{repo_slug}.wiki.git"
    with tempfile.TemporaryDirectory(prefix="wiki-preflight-") as td:
        temp_dir = Path(td)
        clone_target = temp_dir / "wiki"
        clone_result = run(["git", "clone", "--depth", "1", wiki_url, str(clone_target)])
        if clone_result.returncode != 0:
            raise SystemExit(
                "wiki remote unreachable. Initialize the wiki backend by creating a first wiki "
                f"page in GitHub, then retry.\nremote: {wiki_url}\nerror: {clone_result.stderr.strip()}"
            )

        if verify_push:
            probe_file = clone_target / ".preflight-write-probe"
            probe_file.write_text("probe\n", encoding="utf-8")
            run(["git", "add", ".preflight-write-probe"], cwd=clone_target)
            commit_result = run(
                ["git", "-c", "user.name=wiki-preflight", "-c", "user.email=wiki-preflight@example.com", "commit", "-m", "preflight probe"],
                cwd=clone_target,
            )
            if commit_result.returncode != 0:
                # Fresh clones with empty wiki can no-op; still treat as non-fatal for local check.
                print("warning: could not create probe commit; continuing without push validation.")
                return
            push_result = run(["git", "push", "--dry-run"], cwd=clone_target)
            if push_result.returncode != 0:
                raise SystemExit(
                    "wiki write preflight failed. Ensure automation token has contents:write.\n"
                    f"remote: {wiki_url}\nerror: {push_result.stderr.strip()}"
                )


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate wiki bootstrap prerequisites.")
    parser.add_argument("--repo", help="Repository slug owner/repo (default: GITHUB_REPOSITORY or mergetonic/common)")
    parser.add_argument("--default-branch", default="main", help="Expected default branch name.")
    parser.add_argument("--verify-push", action="store_true", help="Run dry-run push capability probe.")
    args = parser.parse_args()

    ensure_default_branch(args.default_branch)
    repo_slug = infer_repo_slug(args.repo)
    check_wiki_remote(repo_slug, args.verify_push)
    print(f"wiki preflight passed for {repo_slug}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
