"""GitHub REST helpers for merge-tonic github subcommands."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request


def api_root() -> str:
    return os.environ.get("GITHUB_API_URL", "https://api.github.com").rstrip("/")


def _headers(token: str) -> dict[str, str]:
    return {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
    }


def github_ref_create(*, repo: str, ref: str, sha: str, token: str) -> tuple[int, str]:
    """POST /repos/{owner}/{repo}/git/refs. Returns (0, body) or (1, error)."""
    if "/" not in repo:
        return 1, "Invalid repo, expected owner/name"
    owner, _, name = repo.partition("/")
    url = f"{api_root()}/repos/{owner}/{name}/git/refs"
    body = json.dumps({"ref": ref, "sha": sha}).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="POST", headers=_headers(token))
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return 0, resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return 1, f"{e.code}: {e.read().decode('utf-8', errors='replace')}"
    except OSError as e:
        return 1, str(e)
