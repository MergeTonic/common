"""Fetch base/head file text from GitHub for PR analysis (compare API + contents)."""

from __future__ import annotations

import base64
import os
from typing import Any

from urllib.parse import quote

from .github_api import fetch_url_text_authenticated, get_git_blob_text, get_json


def _api_base() -> str:
    return os.environ.get("GITHUB_API_URL", "https://api.github.com").rstrip("/")


BINARY_EXTENSIONS = frozenset(
    {
        ".png",
        ".jpg",
        ".jpeg",
        ".gif",
        ".webp",
        ".ico",
        ".pdf",
        ".zip",
        ".gz",
        ".tgz",
        ".bz2",
        ".7z",
        ".rar",
        ".exe",
        ".dll",
        ".so",
        ".dylib",
        ".woff",
        ".woff2",
        ".ttf",
        ".eot",
        ".mp3",
        ".mp4",
        ".webm",
        ".wasm",
        ".pyc",
        ".class",
        ".jar",
    }
)


def is_probably_text_path(path: str) -> bool:
    lower = path.lower()
    for ext in BINARY_EXTENSIONS:
        if lower.endswith(ext):
            return False
    return True


def _encode_path(path: str) -> str:
    return "/".join(quote(segment, safe="") for segment in path.split("/"))


def compare_commits(owner: str, repo: str, base_sha: str, head_sha: str, token: str) -> dict[str, Any]:
    url = f"{_api_base()}/repos/{owner}/{repo}/compare/{base_sha}...{head_sha}"
    return get_json(url, token)  # type: ignore[return-value]


def get_contents_payload(
    owner: str, repo: str, path: str, ref: str, token: str
) -> dict[str, Any] | None:
    url = f"{_api_base()}/repos/{owner}/{repo}/contents/{_encode_path(path)}?ref={ref}"
    try:
        return get_json(url, token)  # type: ignore[assignment]
    except RuntimeError as e:
        if "GitHub API 404" in str(e):
            return None
        raise


def decode_file_content(payload: dict[str, Any]) -> str | None:
    enc = payload.get("encoding")
    content = payload.get("content")
    if enc == "base64" and isinstance(content, str):
        raw = base64.b64decode(content)
        if b"\x00" in raw:
            return None
        try:
            return raw.decode("utf-8")
        except UnicodeDecodeError:
            return raw.decode("utf-8", errors="replace")
    return None


def fetch_file_text(
    owner: str,
    repo: str,
    path: str,
    ref: str,
    token: str,
    *,
    blob_sha: str | None = None,
) -> str | None:
    """
    Prefer Contents API; for large files use download_url; optional git blob when sha known
    (compare.files[].sha is head blob for that path).
    """
    payload = get_contents_payload(owner, repo, path, ref, token)
    if not payload or payload.get("type") != "file":
        if blob_sha:
            return get_git_blob_text(owner, repo, blob_sha, token)
        return None
    text = decode_file_content(payload)
    if text is None and isinstance(payload.get("download_url"), str):
        du = str(payload["download_url"])
        text = fetch_url_text_authenticated(du, token)
    if text is None and blob_sha:
        text = get_git_blob_text(owner, repo, blob_sha, token)
    return text


def list_tree_blob_shas(owner: str, repo: str, tree_sha: str, token: str) -> dict[str, str]:
    url = f"{_api_base()}/repos/{owner}/{repo}/git/trees/{tree_sha}?recursive=1"
    data = get_json(url, token)
    out: dict[str, str] = {}
    if not isinstance(data, dict):
        return out
    for item in data.get("tree") or []:
        if not isinstance(item, dict):
            continue
        if item.get("type") != "blob":
            continue
        p = item.get("path")
        s = item.get("sha")
        if isinstance(p, str) and isinstance(s, str):
            out[p] = s
    return out


def _lines(text: str | None) -> list[str]:
    if not text:
        return []
    return text.splitlines()


def hydrate_pr_files(
    owner: str,
    repo: str,
    base_sha: str,
    head_sha: str,
    token: str,
    *,
    mode: str,
    max_files: int,
) -> dict[str, tuple[list[str], list[str], str]]:
    """Return path -> (base lines, head lines, git status hint)."""
    out: dict[str, tuple[list[str], list[str], str]] = {}
    if mode == "symmetric-union":
        base_tree = list_tree_blob_shas(owner, repo, base_sha, token)
        head_tree = list_tree_blob_shas(owner, repo, head_sha, token)
        paths = sorted(set(base_tree) | set(head_tree))
        for path in paths:
            if len(out) >= max_files:
                break
            if not is_probably_text_path(path):
                continue
            bs = base_tree.get(path)
            hs = head_tree.get(path)
            if bs is not None and bs == hs:
                continue
            left_t = (
                fetch_file_text(owner, repo, path, base_sha, token, blob_sha=bs)
                if path in base_tree
                else None
            )
            right_t = (
                fetch_file_text(owner, repo, path, head_sha, token, blob_sha=hs)
                if path in head_tree
                else None
            )
            if left_t is None and bs and path in base_tree:
                left_t = get_git_blob_text(owner, repo, bs, token)
            if right_t is None and hs and path in head_tree:
                right_t = get_git_blob_text(owner, repo, hs, token)
            if path in base_tree and path not in head_tree:
                st = "removed"
            elif path not in base_tree and path in head_tree:
                st = "added"
            else:
                st = "modified"
            out[path] = (_lines(left_t), _lines(right_t), st)
        return out

    cmp = compare_commits(owner, repo, base_sha, head_sha, token)
    files = cmp.get("files") or []
    if not isinstance(files, list):
        return out
    for ent in files:
        if len(out) >= max_files:
            break
        if not isinstance(ent, dict):
            continue
        status = str(ent.get("status") or "")
        filename = ent.get("filename")
        if not isinstance(filename, str):
            continue
        if not is_probably_text_path(filename):
            continue
        prev = ent.get("previous_filename")
        prev_s = prev if isinstance(prev, str) else None
        head_blob_sha = ent.get("sha") if isinstance(ent.get("sha"), str) else None

        left_t: str | None
        right_t: str | None
        if status == "added":
            left_t = None
            right_t = fetch_file_text(
                owner, repo, filename, head_sha, token, blob_sha=head_blob_sha
            )
        elif status == "removed":
            left_t = fetch_file_text(owner, repo, filename, base_sha, token)
            right_t = None
        elif status == "renamed" and prev_s:
            left_t = fetch_file_text(owner, repo, prev_s, base_sha, token)
            right_t = fetch_file_text(
                owner, repo, filename, head_sha, token, blob_sha=head_blob_sha
            )
        else:
            left_t = fetch_file_text(owner, repo, filename, base_sha, token)
            right_t = fetch_file_text(
                owner, repo, filename, head_sha, token, blob_sha=head_blob_sha
            )
        out[filename] = (_lines(left_t), _lines(right_t), status or "modified")
    return out
