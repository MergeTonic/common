"""Classify repo remotes: local path, GitHub URL, or Hugging Face model id."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Literal


@dataclass(frozen=True)
class ResolvedLocalPath:
    kind: Literal["path"] = "path"
    path: str = ""


@dataclass(frozen=True)
class ResolvedGitHubSpec:
    kind: Literal["github"] = "github"
    url: str = ""


@dataclass(frozen=True)
class ResolvedHubSpec:
    kind: Literal["hub"] = "hub"
    repo_id: str = ""


RemoteSpecResolution = ResolvedLocalPath | ResolvedGitHubSpec | ResolvedHubSpec

_HF_HOST = re.compile(r"^(?:https?://)?(?:www\.)?huggingface\.co/", re.I)
_GH_HTTPS = re.compile(r"^https?://github\.com/([\w.-]+)/([\w.-]+?)(?:\.git)?/?$", re.I)
_GH_SSH = re.compile(r"^git@github\.com:([\w.-]+)/([\w.-]+?)(?:\.git)?$", re.I)
_ORG_MODEL = re.compile(r"^[\w.-]+/[\w.-]+$")


def resolve_hub_repo_spec(raw: str) -> ResolvedHubSpec | None:
    s = raw.strip()
    if not s:
        return None
    if _HF_HOST.search(s):
        rest = _HF_HOST.sub("", s).strip().strip("/")
        parts = [p for p in rest.split("/") if p][:2]
        if len(parts) == 2:
            return ResolvedHubSpec(repo_id=f"{parts[0]}/{parts[1]}")
        return None
    if _ORG_MODEL.match(s) and "://" not in s and "@" not in s:
        return ResolvedHubSpec(repo_id=s)
    return None


def resolve_github_remote_spec(raw: str) -> ResolvedGitHubSpec | None:
    s = raw.strip()
    m = _GH_HTTPS.match(s)
    if m:
        return ResolvedGitHubSpec(url=f"https://github.com/{m.group(1)}/{m.group(2)}.git")
    m2 = _GH_SSH.match(s)
    if m2:
        return ResolvedGitHubSpec(url=f"git@github.com:{m2.group(1)}/{m2.group(2)}.git")
    return None


def resolve_local_repo_path(raw: str) -> ResolvedLocalPath | None:
    s = raw.strip()
    if not s:
        return None
    p = Path(s).resolve()
    try:
        if p.is_dir() and (p / ".git").exists():
            return ResolvedLocalPath(path=str(p))
    except OSError:
        return None
    return None


def resolve_remote_spec(raw: str) -> RemoteSpecResolution | None:
    loc = resolve_local_repo_path(raw)
    if loc:
        return loc
    gh = resolve_github_remote_spec(raw)
    if gh:
        return gh
    hub = resolve_hub_repo_spec(raw)
    if hub:
        return hub
    return None
