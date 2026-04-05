"""Resolve Hugging Face Hub repo id for weave / CTRD (parity with TS ``resolveHubRepoIdForWeave``)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from tonic.repo_profile import read_repo_profile

from .client import default_hub_repo_id


def read_hf_repo_json(repo_root: Path) -> str:
    p = repo_root / ".tonic" / "hf-repo.json"
    if not p.is_file():
        return ""
    try:
        raw: Any = json.loads(p.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return ""
    if not isinstance(raw, dict):
        return ""
    rid = raw.get("repo_id")
    return rid.strip() if isinstance(rid, str) and rid.strip() else ""


def resolve_hub_repo_id_for_weave(repo_root: Path, repo_id_arg: str = "") -> str:
    """CLI ``--repo-id`` → ``.tonic/hf-repo.json`` → profile ``hub_repo_id`` → env (``TONIC_HF_WEAVE_REPO`` / ``HF_WEAVE_HUB_REPO``)."""
    a = repo_id_arg.strip()
    if a:
        return a
    m = read_hf_repo_json(repo_root)
    if m:
        return m
    prof = read_repo_profile(repo_root)
    rid = (prof.get("hub_repo_id") if prof else "") or ""
    if isinstance(rid, str) and rid.strip():
        return rid.strip()
    return default_hub_repo_id()
