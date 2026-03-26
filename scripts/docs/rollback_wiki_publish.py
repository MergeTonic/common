#!/usr/bin/env python3
"""Rollback wiki repo to a known commit hash."""

from __future__ import annotations

import argparse
import subprocess
import sys
import tempfile
from pathlib import Path


def run(cmd: list[str], cwd: Path | None = None) -> int:
    result = subprocess.run(cmd, cwd=str(cwd) if cwd else None, text=True, check=False)
    return result.returncode


def main() -> int:
    parser = argparse.ArgumentParser(description="Rollback wiki publish to a specific commit.")
    parser.add_argument("--wiki-url", required=True)
    parser.add_argument("--to-commit", required=True)
    parser.add_argument("--confirm", action="store_true", help="Required safety flag.")
    args = parser.parse_args()

    if not args.confirm:
        raise SystemExit("refusing rollback without --confirm")

    with tempfile.TemporaryDirectory(prefix="wiki-rollback-") as td:
        repo = Path(td) / "wiki"
        if run(["git", "clone", args.wiki_url, str(repo)]) != 0:
            raise SystemExit("failed to clone wiki repository")
        if run(["git", "reset", "--hard", args.to_commit], cwd=repo) != 0:
            raise SystemExit("invalid rollback commit")
        if run(["git", "push", "--force-with-lease"], cwd=repo) != 0:
            raise SystemExit("rollback push failed")
    print(f"rolled back wiki to {args.to_commit}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
