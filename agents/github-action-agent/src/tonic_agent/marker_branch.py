"""Push a branch based on PR head where conflicted paths contain Tonic annotated text."""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import quote

from .github_api import _api_root, _request, get_json


def _sanitize_run_id(run_id: str) -> str:
    return re.sub(r"[^a-zA-Z0-9._-]+", "-", run_id)[:120]


def push_tonic_marker_branch(
    owner: str,
    repo: str,
    head_sha: str,
    pr_number: int,
    run_id: str,
    token: str,
    path_to_annotated: dict[str, str],
) -> dict[str, Any] | None:
    if not path_to_annotated:
        return None

    api = _api_root()
    short = head_sha[:7]
    branch = f"tonic/pr-{pr_number}-{short}-{_sanitize_run_id(run_id)}"

    commit_data = get_json(f"{api}/repos/{owner}/{repo}/commits/{head_sha}", token)
    if not isinstance(commit_data, dict):
        raise RuntimeError("Tonic marker branch: invalid commits response")
    commit_obj = commit_data.get("commit")
    if not isinstance(commit_obj, dict):
        raise RuntimeError("Tonic marker branch: missing commit object")
    tree_obj = commit_obj.get("tree")
    if not isinstance(tree_obj, dict) or not isinstance(tree_obj.get("sha"), str):
        raise RuntimeError("Tonic marker branch: could not read base tree sha")
    base_tree_sha = tree_obj["sha"]

    tree_entries = [
        {
            "path": p,
            "mode": "100644",
            "type": "blob",
            "content": path_to_annotated[p],
        }
        for p in sorted(path_to_annotated)
    ]

    new_tree = _request(
        "POST",
        f"{api}/repos/{owner}/{repo}/git/trees",
        token,
        {"base_tree": base_tree_sha, "tree": tree_entries},
    )
    if not isinstance(new_tree, dict) or not isinstance(new_tree.get("sha"), str):
        raise RuntimeError("Tonic marker branch: git/trees missing sha")

    new_commit = _request(
        "POST",
        f"{api}/repos/{owner}/{repo}/git/commits",
        token,
        {
            "message": f"tonic: marker snapshot for PR #{pr_number}",
            "tree": new_tree["sha"],
            "parents": [head_sha],
        },
    )
    if not isinstance(new_commit, dict) or not isinstance(new_commit.get("sha"), str):
        raise RuntimeError("Tonic marker branch: git/commits missing sha")

    commit_sha = new_commit["sha"]
    ref_name = f"refs/heads/{branch}"
    try:
        _request(
            "POST",
            f"{api}/repos/{owner}/{repo}/git/refs",
            token,
            {"ref": ref_name, "sha": commit_sha},
        )
    except RuntimeError as e:
        err = str(e).lower()
        if "422" in str(e) or "already exists" in err:
            enc = quote(branch, safe="")
            _request(
                "PATCH",
                f"{api}/repos/{owner}/{repo}/git/refs/heads/{enc}",
                token,
                {"sha": commit_sha, "force": True},
            )
        else:
            raise

    return {
        "branch": branch,
        "commit_sha": commit_sha,
        "paths": sorted(path_to_annotated),
    }
