"""Minimal GitHub REST helpers (stdlib urllib)."""

from __future__ import annotations

import base64
import json
import os
import urllib.error
import urllib.request
from typing import Any


def _api_root() -> str:
    return os.environ.get("GITHUB_API_URL", "https://api.github.com").rstrip("/")


def fetch_url_text_authenticated(url: str, token: str, *, timeout: int = 120) -> str | None:
    """GET arbitrary URL with GitHub token (used for Contents API download_url)."""
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/vnd.github.raw",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            if b"\x00" in raw:
                return None
            try:
                return raw.decode("utf-8")
            except UnicodeDecodeError:
                return raw.decode("utf-8", errors="replace")
    except urllib.error.HTTPError:
        return None


def get_git_blob_text(owner: str, repo: str, blob_sha: str, token: str) -> str | None:
    """Decode UTF-8 text from GET /git/blobs/{sha} (handles large files without inline Contents)."""
    api = _api_root()
    url = f"{api}/repos/{owner}/{repo}/git/blobs/{blob_sha}"
    try:
        data = get_json(url, token)
    except RuntimeError:
        return None
    if not isinstance(data, dict):
        return None
    enc = data.get("encoding")
    content = data.get("content")
    if enc != "base64" or not isinstance(content, str):
        return None
    raw = base64.b64decode(content)
    if b"\x00" in raw:
        return None
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw.decode("utf-8", errors="replace")


def get_json(url: str, token: str) -> dict[str, Any] | list[Any]:
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"GitHub API {e.code}: {e.read().decode('utf-8', errors='replace')}") from e


def _request(
    method: str,
    url: str,
    token: str,
    body: dict[str, Any] | None = None,
) -> dict[str, Any] | list[Any]:
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
        },
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"GitHub API {e.code}: {e.read().decode('utf-8', errors='replace')}") from e


def list_issue_comments(owner: str, repo: str, issue_number: int, token: str) -> list[dict[str, Any]]:
    api = _api_root()
    out: list[dict[str, Any]] = []
    page = 1
    while True:
        url = f"{api}/repos/{owner}/{repo}/issues/{issue_number}/comments?page={page}&per_page=100"
        data = get_json(url, token)
        if not isinstance(data, list) or not data:
            break
        out.extend(data)
        if len(data) < 100:
            break
        page += 1
    return out


def update_issue_comment(owner: str, repo: str, comment_id: int, body: str, token: str) -> dict[str, Any]:
    api = _api_root()
    url = f"{api}/repos/{owner}/{repo}/issues/comments/{comment_id}"
    return _request("PATCH", url, token, {"body": body})  # type: ignore[return-value]


def post_issue_comment(owner: str, repo: str, issue_number: int, body: str, token: str) -> dict[str, Any]:
    api = _api_root()
    url = f"{api}/repos/{owner}/{repo}/issues/{issue_number}/comments"
    return _request("POST", url, token, {"body": body})  # type: ignore[return-value]


def post_pull_review_comment(
    owner: str,
    repo: str,
    pull_number: int,
    body: str,
    commit_id: str,
    path: str,
    line: int,
    side: str,
    token: str,
    *,
    start_line: int | None = None,
    start_side: str | None = None,
    in_reply_to: int | None = None,
) -> dict[str, Any]:
    api = _api_root()
    url = f"{api}/repos/{owner}/{repo}/pulls/{pull_number}/comments"
    payload: dict[str, Any] = {
        "body": body,
        "commit_id": commit_id,
        "path": path,
        "line": line,
        "side": side,
    }
    if start_line is not None and start_line < line:
        payload["start_line"] = start_line
        payload["start_side"] = start_side or side
    if in_reply_to is not None:
        payload["in_reply_to"] = in_reply_to
    return _request("POST", url, token, payload)  # type: ignore[return-value]


def list_pull_review_comments(owner: str, repo: str, pull_number: int, token: str) -> list[dict[str, Any]]:
    api = _api_root()
    out: list[dict[str, Any]] = []
    page = 1
    while True:
        url = f"{api}/repos/{owner}/{repo}/pulls/{pull_number}/comments?page={page}&per_page=100"
        data = get_json(url, token)
        if not isinstance(data, list) or not data:
            break
        out.extend(data)
        if len(data) < 100:
            break
        page += 1
    return out


def upsert_issue_comment(
    owner: str,
    repo: str,
    issue_number: int,
    token: str,
    marker_prefix: str,
    body: str,
) -> dict[str, Any]:
    for c in list_issue_comments(owner, repo, issue_number, token):
        existing = c.get("body") or ""
        if marker_prefix in existing:
            cid = c.get("id")
            if isinstance(cid, int):
                return update_issue_comment(owner, repo, cid, body, token)
    return post_issue_comment(owner, repo, issue_number, body, token)


def create_pull_request(
    owner: str,
    repo: str,
    token: str,
    *,
    title: str,
    head: str,
    base: str,
    body: str,
) -> tuple[int, str]:
    api = _api_root()
    url = f"{api}/repos/{owner}/{repo}/pulls"
    data = _request(
        "POST",
        url,
        token,
        {"title": title, "head": head, "base": base, "body": body},
    )
    if not isinstance(data, dict):
        raise RuntimeError("create_pull_request: invalid response payload")
    number = data.get("number")
    head_obj = data.get("head")
    if not isinstance(number, int) or not isinstance(head_obj, dict):
        raise RuntimeError("create_pull_request: missing number/head")
    head_sha = head_obj.get("sha")
    if not isinstance(head_sha, str) or not head_sha:
        raise RuntimeError("create_pull_request: missing head sha")
    return number, head_sha
