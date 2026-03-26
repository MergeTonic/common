#!/usr/bin/env python3
"""Emit wiki publish diagnostics for workflow artifacts."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path


def git_output(args: list[str]) -> str:
    result = subprocess.run(["git", *args], text=True, capture_output=True, check=False)
    return result.stdout.strip() if result.returncode == 0 else ""


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate wiki publish diagnostics JSON.")
    parser.add_argument("--output", default="wiki-publish-diagnostics.json")
    args = parser.parse_args()

    changed_pages = sorted(p.name for p in Path("wiki-src").glob("*.md"))
    payload = {
        "repository": os.getenv("GITHUB_REPOSITORY", ""),
        "sha": os.getenv("GITHUB_SHA", git_output(["rev-parse", "HEAD"])),
        "changed_pages": changed_pages,
        "token_present": bool(os.getenv("GITHUB_TOKEN")),
        "permission_probe": "requires workflow token scope validation",
    }
    Path(args.output).write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(args.output)
    return 0


if __name__ == "__main__":
    sys.exit(main())
