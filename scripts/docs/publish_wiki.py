#!/usr/bin/env python3
"""Publish wiki-src content to a GitHub wiki repo."""

from __future__ import annotations

import argparse
import json
import shutil
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


def copy_wiki_src(source: Path, dest: Path) -> list[str]:
    cfg_path = source / "_PublishConfig.json"
    allowlist: set[str] | None = None
    denylist: set[str] = set()
    if cfg_path.exists():
        cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
        allow = cfg.get("allowlist_pages") or []
        deny = cfg.get("denylist_pages") or []
        allowlist = set(allow) if allow else None
        denylist = set(deny)

    copied: list[str] = []
    for md in sorted(source.glob("*.md")):
        if allowlist is not None and md.name not in allowlist:
            continue
        if md.name in denylist:
            continue
        shutil.copy2(md, dest / md.name)
        copied.append(md.name)
    return copied


def changed_files(repo_dir: Path) -> list[str]:
    result = run(["git", "status", "--porcelain"], cwd=repo_dir)
    files: list[str] = []
    for line in result.stdout.splitlines():
        if len(line) >= 4:
            files.append(line[3:])
    return files


def main() -> int:
    parser = argparse.ArgumentParser(description="Publish wiki-src to .wiki.git")
    parser.add_argument("--source-dir", default="wiki-src")
    parser.add_argument("--wiki-url", required=True)
    parser.add_argument("--commit-message", default="docs(wiki): sync from wiki-src")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    source = Path(args.source_dir)
    if not source.exists():
        raise SystemExit(f"missing source directory: {source}")

    with tempfile.TemporaryDirectory(prefix="wiki-publish-") as td:
        wiki_dir = Path(td) / "wiki"
        clone = run(["git", "clone", args.wiki_url, str(wiki_dir)])
        if clone.returncode != 0:
            raise SystemExit(clone.stderr.strip())

        copied = copy_wiki_src(source, wiki_dir)
        changes = changed_files(wiki_dir)
        if not changes:
            print("no wiki changes detected")
            return 0

        print("changed pages:")
        for name in changes:
            print(f"- {name}")

        if args.dry_run:
            return 0

        run(["git", "add", "."], cwd=wiki_dir)
        commit = run(
            [
                "git",
                "-c",
                "user.name=github-actions[bot]",
                "-c",
                "user.email=41898282+github-actions[bot]@users.noreply.github.com",
                "commit",
                "-m",
                args.commit_message,
            ],
            cwd=wiki_dir,
        )
        if commit.returncode != 0:
            raise SystemExit(commit.stderr.strip())
        push = run(["git", "push"], cwd=wiki_dir)
        if push.returncode != 0:
            raise SystemExit(push.stderr.strip())

        print(f"published {len(copied)} markdown pages")
    return 0


if __name__ == "__main__":
    sys.exit(main())
