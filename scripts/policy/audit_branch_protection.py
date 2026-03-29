#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import sys
import urllib.request
from pathlib import Path
from typing import Any


def _api(url: str, token: str) -> Any:
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "mergetonic-policy-audit",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> int:
    token = os.getenv("GITHUB_TOKEN", "")
    if not token:
        print("GITHUB_TOKEN is required", file=sys.stderr)
        return 2
    required = os.getenv("REQUIRED_CHECK", "contributor-policy-gate")
    targets = json.loads(Path("release-targets.json").read_text(encoding="utf-8"))

    repos: list[str] = []
    for t in targets.get("targets", []):
        repo = t.get("repo")
        if not repo:
            continue
        if t.get("id") == "common" or "repo_sync" in t.get("release_types", []):
            repos.append(repo)

    failures: list[str] = []
    for repo in sorted(set(repos)):
        url = f"https://api.github.com/repos/{repo}/branches/main/protection"
        try:
            data = _api(url, token)
            contexts = ((data.get("required_status_checks") or {}).get("contexts") or [])
            if required not in contexts:
                failures.append(f"{repo}: missing required check '{required}'")
        except Exception as err:
            failures.append(f"{repo}: unable to read branch protection ({err})")

    if failures:
        print("\n".join(failures))
        return 1
    print(f"All repositories include required status check: {required}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
